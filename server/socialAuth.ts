// 간편인증(소셜 로그인) — 카카오·네이버·구글·페이스북·라인·마이크로소프트 OAuth2 Authorization Code 플로우.
// 제공자별 .env 자격증명이 있을 때만 활성화(없으면 버튼 숨김·라우트 404 안내).
// 보안: state(CSRF) 세션 검증, redirect 화이트리스트(자체 경로만), 토큰은 서버에서만 교환.
//      라인·마이크로소프트는 OIDC nonce(세션 저장→콜백 검증)로 재생/대체 방지 + id_token 클레임 검증.
import type { Express, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db } from "./db";
import { users, socialAccounts } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import { loginWithSessionRegeneration, requireAuth } from "./auth";

const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || process.env.CORS_ORIGIN || "https://class.lawciety.com").replace(/\/$/, "");

type Profile = { providerUserId: string; email?: string | null; name?: string | null; emailVerified?: boolean };
type Provider = {
  key: string;
  label: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl?: string; // 토큰 응답 id_token에서 프로필을 얻는 제공자(라인·MS)는 불필요
  scope: string;
  idEnv: string;
  secretEnv: string;
  useNonce?: boolean; // OIDC nonce 필요(라인·MS) — authorize 시 발급·세션 저장, 콜백서 검증
  scopeInTokenReq?: boolean; // 토큰 요청 본문에도 scope 동봉(MS) — 기존 3사는 끄고 동작 동일 유지
  // 표준: userInfoUrl 응답(JSON)을 파싱. 토큰 응답의 id_token으로 프로필을 만드는 제공자는 parseToken 사용.
  parse?: (json: any) => Profile;
  parseToken?: (tokenJson: any, ctx: { clientId: string; clientSecret: string; nonce?: string }) => Profile;
};

// base64url JWT 세그먼트 → JSON 객체 (Node 'base64url' 인코딩 사용)
function decodeJwtSegment(seg: string): any {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
}

const CLOCK_SKEW_SEC = 60; // exp 검증 시 허용 시계 오차

// 라인 id_token 검증: HS256(채널 시크릿) 서명 + iss/aud/exp/nonce 클레임.
// 외부 JWT 라이브러리 없이 Node crypto(HMAC-SHA256)로 직접 검증.
function verifyLineIdToken(idToken: string, clientId: string, clientSecret: string, expectedNonce?: string): Profile {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("line_idtoken_malformed");
  const [h, pl, sig] = parts;
  const header = decodeJwtSegment(h);
  if (header.alg !== "HS256") throw new Error("line_idtoken_alg"); // alg 혼동/none 차단
  const expected = crypto.createHmac("sha256", clientSecret).update(`${h}.${pl}`).digest();
  const given = Buffer.from(sig, "base64url");
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) throw new Error("line_idtoken_sig");
  const payload = decodeJwtSegment(pl);
  if (payload.iss !== "https://access.line.me") throw new Error("line_idtoken_iss");
  if (payload.aud !== clientId) throw new Error("line_idtoken_aud");
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000) - CLOCK_SKEW_SEC) throw new Error("line_idtoken_exp");
  if (expectedNonce && payload.nonce !== expectedNonce) throw new Error("line_idtoken_nonce");
  // 이메일 존재≠검증. 기존 계정 자동연결(탈취) 방지 위해 미검증으로 취급(이메일 있어도 합성가입).
  return { providerUserId: String(payload.sub), email: payload.email ?? null, name: payload.name ?? null, emailVerified: false };
}

// 마이크로소프트 id_token: 토큰 엔드포인트에서 TLS 서버-서버 교환으로 직접 수신하므로
// JWKS 전체 서명검증 없이 payload 디코드(사용자 명시 허용). 단 alg/iss/aud/exp/nonce 클레임은 검증.
function decodeMicrosoftIdToken(idToken: string, clientId: string, expectedNonce?: string): Profile {
  const parts = idToken.split(".");
  if (parts.length < 2) throw new Error("ms_idtoken_malformed");
  const header = decodeJwtSegment(parts[0]);
  if (header.alg === "none") throw new Error("ms_idtoken_alg"); // 비서명 토큰 차단
  const payload = decodeJwtSegment(parts[1]);
  if (typeof payload.iss !== "string" || !payload.iss.startsWith("https://login.microsoftonline.com/")) throw new Error("ms_idtoken_iss");
  if (payload.aud !== clientId) throw new Error("ms_idtoken_aud");
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000) - CLOCK_SKEW_SEC) throw new Error("ms_idtoken_exp");
  if (expectedNonce && payload.nonce !== expectedNonce) throw new Error("ms_idtoken_nonce");
  // 식별자는 변경가능한 email/preferred_username 대신 oid(또는 sub) 사용.
  return { providerUserId: String(payload.oid || payload.sub), email: payload.email || payload.preferred_username || null, name: payload.name ?? null, emailVerified: false };
}

const PROVIDERS: Record<string, Provider> = {
  kakao: {
    key: "kakao", label: "카카오",
    authUrl: "https://kauth.kakao.com/oauth/authorize",
    tokenUrl: "https://kauth.kakao.com/oauth/token",
    userInfoUrl: "https://kapi.kakao.com/v2/user/me",
    scope: "account_email profile_nickname",
    idEnv: "KAKAO_CLIENT_ID", secretEnv: "KAKAO_CLIENT_SECRET",
    parse: (j) => ({ providerUserId: String(j.id), email: j.kakao_account?.email ?? null, name: j.kakao_account?.profile?.nickname ?? j.properties?.nickname ?? null, emailVerified: !!(j.kakao_account?.is_email_valid && j.kakao_account?.is_email_verified) }),
  },
  naver: {
    key: "naver", label: "네이버",
    authUrl: "https://nid.naver.com/oauth2.0/authorize",
    tokenUrl: "https://nid.naver.com/oauth2.0/token",
    userInfoUrl: "https://openapi.naver.com/v1/nid/me",
    scope: "",
    idEnv: "NAVER_CLIENT_ID", secretEnv: "NAVER_CLIENT_SECRET",
    parse: (j) => ({ providerUserId: String(j.response?.id), email: j.response?.email ?? null, name: j.response?.name ?? j.response?.nickname ?? null, emailVerified: false }),
  },
  google: {
    key: "google", label: "구글",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    scope: "openid email profile",
    idEnv: "GOOGLE_CLIENT_ID", secretEnv: "GOOGLE_CLIENT_SECRET",
    parse: (j) => ({ providerUserId: String(j.sub), email: j.email ?? null, name: j.name ?? null, emailVerified: j.email_verified === true || j.email_verified === "true" }),
  },
  facebook: {
    key: "facebook", label: "페이스북",
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    userInfoUrl: "https://graph.facebook.com/v21.0/me?fields=id,name,email",
    scope: "email public_profile",
    idEnv: "FACEBOOK_CLIENT_ID", secretEnv: "FACEBOOK_CLIENT_SECRET",
    // 이메일은 사용자가 허용하지 않으면 없을 수 있음 → 합성 이메일로 가입 처리.
    parse: (j) => ({ providerUserId: String(j.id), email: j.email ?? null, name: j.name ?? null, emailVerified: false }),
  },
  line: {
    key: "line", label: "라인",
    authUrl: "https://access.line.me/oauth2/v2.1/authorize",
    tokenUrl: "https://api.line.me/oauth2/v2.1/token",
    scope: "openid profile email",
    idEnv: "LINE_CLIENT_ID", secretEnv: "LINE_CLIENT_SECRET",
    useNonce: true,
    // 프로필은 토큰 응답의 id_token(HS256, 채널 시크릿 서명)을 검증해 추출.
    parseToken: (tokenJson, ctx) => {
      if (!tokenJson.id_token) throw new Error("line_no_idtoken");
      return verifyLineIdToken(tokenJson.id_token, ctx.clientId, ctx.clientSecret, ctx.nonce);
    },
  },
  microsoft: {
    key: "microsoft", label: "마이크로소프트",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "openid profile email",
    idEnv: "MICROSOFT_CLIENT_ID", secretEnv: "MICROSOFT_CLIENT_SECRET",
    useNonce: true,
    scopeInTokenReq: true, // MS 토큰 요청은 scope 포함 권장
    // 프로필은 토큰 응답의 id_token payload에서 추출(클레임 검증).
    parseToken: (tokenJson, ctx) => {
      if (!tokenJson.id_token) throw new Error("ms_no_idtoken");
      return decodeMicrosoftIdToken(tokenJson.id_token, ctx.clientId, ctx.nonce);
    },
  },
};

function creds(p: Provider) {
  return { id: process.env[p.idEnv], secret: process.env[p.secretEnv] };
}
export function isProviderConfigured(key: string): boolean {
  const p = PROVIDERS[key];
  if (!p) return false;
  const c = creds(p);
  return !!(c.id && c.secret);
}
export function enabledProviders(): { key: string; label: string }[] {
  return Object.values(PROVIDERS).filter((p) => isProviderConfigured(p.key)).map((p) => ({ key: p.key, label: p.label }));
}

// 자체 경로만 허용(오픈 리다이렉트 방지)
function safePath(v: unknown): string {
  if (typeof v !== "string") return "/my";
  if (!v.startsWith("/") || v.startsWith("//")) return "/my";
  return v.slice(0, 512);
}

function redirectUri(key: string): string {
  return `${PUBLIC_BASE}/api/auth/${key}/callback`;
}

// 제공자가 이메일을 주지 않을 때 충돌 없는 합성 이메일(길이 고정 해시)
function synthEmail(provider: string, providerUserId: string): string {
  const h = crypto.createHash("sha256").update(`${provider}:${providerUserId}`).digest("hex").slice(0, 24);
  return `social_${provider}_${h}@social.lawciety.local`;
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 15000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!res.ok) throw new Error(`${res.status}: ${(json.error_description || json.error || text || "").toString().slice(0, 200)}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export function registerSocialAuth(app: Express) {
  // 활성 제공자 목록(프런트 버튼 렌더용)
  app.get("/api/auth/providers", (_req, res) => res.json({ providers: enabledProviders() }));

  // 1) 인가 시작
  app.get("/api/auth/:provider", (req: Request, res: Response, next: NextFunction) => {
    const key = req.params.provider;
    const p = PROVIDERS[key];
    if (!p) return next(); // 'me'·예약 경로는 가로채지 않고 다음 핸들러로 (라우트 셰도잉 방지)
    if (!isProviderConfigured(key)) return res.redirect(`${PUBLIC_BASE}/login?error=provider_unavailable`);
    const c = creds(p);
    const state = crypto.randomBytes(16).toString("hex");
    const nonce = p.useNonce ? crypto.randomBytes(16).toString("hex") : undefined; // OIDC nonce(라인·MS)
    const linkUserId = req.query.link === "1" && req.isAuthenticated() ? (req.user as any).id : undefined;
    (req.session as any).oauth = { state, nonce, provider: key, redirect: safePath(req.query.redirect), linkUserId };
    const params = new URLSearchParams({
      response_type: "code",
      client_id: c.id!,
      redirect_uri: redirectUri(key),
      state,
    });
    if (p.scope) params.set("scope", p.scope);
    if (nonce) params.set("nonce", nonce);
    res.redirect(`${p.authUrl}?${params.toString()}`);
  });

  // 2) 콜백
  app.get("/api/auth/:provider/callback", async (req: Request, res: Response, next: NextFunction) => {
    const key = req.params.provider;
    const p = PROVIDERS[key];
    if (!p) return next();
    const fail = (reason: string) => res.redirect(`${PUBLIC_BASE}/login?error=${encodeURIComponent(reason)}`);
    try {
      if (!isProviderConfigured(key)) return fail("provider_unavailable");
      const sess = (req.session as any).oauth;
      const { code, state } = req.query as Record<string, string>;
      if (!code || !state || !sess || sess.provider !== key || sess.state !== state) return fail("invalid_state");
      const redirect = safePath(sess.redirect);
      const nonce: string | undefined = sess.nonce; // 콜백 검증용 nonce 보관 후 세션 정리
      delete (req.session as any).oauth;

      const c = creds(p);
      // 토큰 교환 (scope는 일부 제공자(MS)가 토큰 요청에도 요구 → 항상 동봉해도 무해)
      const tokenBody: Record<string, string> = {
        grant_type: "authorization_code",
        client_id: c.id!,
        client_secret: c.secret!,
        redirect_uri: redirectUri(key),
        code,
        state,
      };
      if (p.scope && p.scopeInTokenReq) tokenBody.scope = p.scope; // 기존 3사는 토큰 요청에 scope 미포함(동작 보존)
      const tokenJson = await fetchJson(p.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(tokenBody),
      });

      // 프로필 해소: (a) id_token 기반(라인·MS) → 토큰 응답에서 검증 후 추출
      //            (b) 표준 → access_token으로 userInfoUrl 조회 후 parse
      let profile: Profile;
      if (p.parseToken) {
        if (p.useNonce && !nonce) return fail("invalid_state"); // nonce 필수 제공자인데 세션에 없음 → 거부
        profile = p.parseToken(tokenJson, { clientId: c.id!, clientSecret: c.secret!, nonce });
      } else {
        const accessToken = tokenJson.access_token;
        if (!accessToken) return fail("token_failed");
        const profileJson = await fetchJson(p.userInfoUrl!, { headers: { Authorization: `Bearer ${accessToken}` } });
        profile = p.parse!(profileJson);
      }
      const providerUserId = profile.providerUserId;
      if (!providerUserId || ["undefined", "null", ""].includes(providerUserId)) return fail("no_profile");

      const email = profile.email ? profile.email.toLowerCase().trim() : null;
      const verifiedEmail = email && profile.emailVerified ? email : null; // 제공자가 검증한 이메일만 연결 허용
      const name = (profile.name || `${p.label} 사용자`).slice(0, 100);

      // 로그인 상태에서 '연결' 요청 → 현재 계정에 소셜 연결(로그인/가입 아님)
      if (sess.linkUserId) {
        const [exist] = await db.select().from(socialAccounts)
          .where(and(eq(socialAccounts.provider, key), eq(socialAccounts.providerUserId, providerUserId))).limit(1);
        if (exist && exist.userId !== sess.linkUserId) return res.redirect(`${PUBLIC_BASE}/account?error=already_linked`);
        if (!exist) await db.insert(socialAccounts).values({ userId: sess.linkUserId, provider: key, providerUserId, email });
        return res.redirect(`${PUBLIC_BASE}/account?linked=${key}`);
      }

      // 계정 해소(트랜잭션): (provider,uid) → 검증 이메일 연결 → 신규생성.
      // ⚠ 미검증 이메일은 기존 계정에 자동 연결하지 않음(계정 탈취 방지).
      let resolved: { userId: number; isNew: boolean } | null = null;
      try {
        resolved = await db.transaction(async (tx) => {
          const [link] = await tx.select().from(socialAccounts)
            .where(and(eq(socialAccounts.provider, key), eq(socialAccounts.providerUserId, providerUserId))).limit(1);
          if (link) return { userId: link.userId, isNew: false };

          let existing: any = null;
          if (email) [existing] = await tx.select().from(users).where(eq(users.email, email)).limit(1);

          let userId: number;
          let isNew = false;
          if (existing) {
            if (!verifiedEmail) { const e: any = new Error("email_exists"); e.code = "EMAIL_EXISTS"; throw e; }
            userId = existing.id;
          } else {
            const userEmail = verifiedEmail || synthEmail(key, providerUserId);
            const [created] = await tx.insert(users).values({ email: userEmail, password: null, name, role: "member" }).returning();
            userId = created.id;
            isNew = true;
          }
          await tx.insert(socialAccounts).values({ userId, provider: key, providerUserId, email });
          return { userId, isNew };
        });
      } catch (e: any) {
        if (e?.code === "EMAIL_EXISTS") return fail("email_exists");
        // 동시 콜백 등 유니크 충돌 시 링크 재조회
        const [link2] = await db.select().from(socialAccounts)
          .where(and(eq(socialAccounts.provider, key), eq(socialAccounts.providerUserId, providerUserId))).limit(1);
        if (link2) resolved = { userId: link2.userId, isNew: false };
      }
      if (!resolved) return fail("social_error");

      const [user] = await db.select().from(users).where(eq(users.id, resolved.userId)).limit(1);
      if (!user) return fail("user_not_found");
      await loginWithSessionRegeneration(req, user);
      return res.redirect(`${PUBLIC_BASE}${resolved.isNew ? "/welcome" : redirect}`); // 신규는 동의 절차로
    } catch (e) {
      console.error(`소셜 로그인(${key}) 오류:`, e);
      return fail("social_error");
    }
  });

  // 내 연결된 소셜 계정 + 사용 가능한 제공자
  app.get("/api/auth/social-accounts", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const linked = await db
        .select({ id: socialAccounts.id, provider: socialAccounts.provider, email: socialAccounts.email, createdAt: socialAccounts.createdAt })
        .from(socialAccounts).where(eq(socialAccounts.userId, userId));
      const providers = Object.values(PROVIDERS).map((p) => ({ key: p.key, label: p.label, enabled: isProviderConfigured(p.key) }));
      return res.json({ linked, providers });
    } catch (e) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 소셜 연결 해제 (유일 로그인 수단이면 차단)
  app.delete("/api/auth/social-accounts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청" });
      const all = await db.select().from(socialAccounts).where(eq(socialAccounts.userId, userId));
      if (!all.find((a) => a.id === id)) return res.status(404).json({ error: "연결 정보가 없습니다." });
      const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!u?.password && all.length <= 1) return res.status(400).json({ error: "유일한 로그인 수단입니다. 비밀번호 설정 후 해제하세요." });
      await db.delete(socialAccounts).where(and(eq(socialAccounts.id, id), eq(socialAccounts.userId, userId)));
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });
}

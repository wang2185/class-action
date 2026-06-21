// 간편인증(소셜 로그인) — 카카오·네이버·구글 OAuth2 Authorization Code 플로우.
// 제공자별 .env 자격증명이 있을 때만 활성화(없으면 버튼 숨김·라우트 404 안내).
// 보안: state(CSRF) 세션 검증, redirect 화이트리스트(자체 경로만), 토큰은 서버에서만 교환.
import type { Express, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db } from "./db";
import { users, socialAccounts } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import { loginWithSessionRegeneration } from "./auth";

const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || process.env.CORS_ORIGIN || "https://class.lawciety.com").replace(/\/$/, "");

type Profile = { providerUserId: string; email?: string | null; name?: string | null; emailVerified?: boolean };
type Provider = {
  key: string;
  label: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  idEnv: string;
  secretEnv: string;
  parse: (json: any) => Profile;
};

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
    (req.session as any).oauth = { state, provider: key, redirect: safePath(req.query.redirect) };
    const params = new URLSearchParams({
      response_type: "code",
      client_id: c.id!,
      redirect_uri: redirectUri(key),
      state,
    });
    if (p.scope) params.set("scope", p.scope);
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
      delete (req.session as any).oauth;

      const c = creds(p);
      // 토큰 교환
      const tokenJson = await fetchJson(p.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: c.id!,
          client_secret: c.secret!,
          redirect_uri: redirectUri(key),
          code,
          state,
        }),
      });
      const accessToken = tokenJson.access_token;
      if (!accessToken) return fail("token_failed");

      // 프로필 조회
      const profileJson = await fetchJson(p.userInfoUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const profile = p.parse(profileJson);
      const providerUserId = profile.providerUserId;
      if (!providerUserId || ["undefined", "null", ""].includes(providerUserId)) return fail("no_profile");

      const email = profile.email ? profile.email.toLowerCase().trim() : null;
      const verifiedEmail = email && profile.emailVerified ? email : null; // 제공자가 검증한 이메일만 연결 허용
      const name = (profile.name || `${p.label} 사용자`).slice(0, 100);

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
}

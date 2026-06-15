import { type Express, type Request, type Response } from "express";
import passport from "passport";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { db } from "./db";
import {
  users, cases, caseParties, evidence, caseUpdates,
  paymentOrders, provisionalSeizures, paymentSessions, paymentTransactions,
  billingKeys, defendants, defendantDocuments, consents, auditLogs, paymentLinks, notifications, caseRequests,
} from "../shared/schema";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, requireLawyer, hashPassword, loginWithSessionRegeneration } from "./auth";
import { encryptPII, decryptPII } from "./crypto";
import { upload, deleteFile } from "./storage";
import { assembleDossier, buildPackageZip } from "./casePackage";
import { sendSMS, sendEmail, notifyParty, mapWithConcurrency } from "./notify";
import { registerSocialAuth } from "./socialAuth";
import {
  createPaymentSession, validatePaymentCallback,
  requestPaymentApproval, completePayment, generatePaymentFormHTML, cancelPayment,
  isNicePayConfigured, isKeyinConfigured,
  registerBillingKey, approveBillingPayment, removeBillingKey,
} from "./nicepay";

// 공개 절대 URL (결제/진행 링크)
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || process.env.CORS_ORIGIN || "https://class.lawciety.com").replace(/\/$/, "");
const CONSENT_VERSION = "1.0"; // 동의 버전(서버 고정)
const REQUIRED_CONSENTS = ["service_terms", "pii_collection"]; // 필수 동의 항목

// 필수 동의(현행 버전) 보유 여부
async function hasRequiredConsent(userId: number): Promise<boolean> {
  const rows = await db.select().from(consents)
    .where(and(
      eq(consents.userId, userId),
      inArray(consents.consentType, REQUIRED_CONSENTS),
      eq(consents.agreed, true),
      eq(consents.version, CONSENT_VERSION),
    ));
  const have = new Set(rows.map((r) => r.consentType));
  return REQUIRED_CONSENTS.every((t) => have.has(t));
}

// 동의 게이트 — ⚠ 소셜 전용 계정(비밀번호 없음)에만 적용. 로컬·레거시 계정은 가입 시 동의 처리되어 통과(레거시 잠금 방지).
async function requireConsent(req: Request, res: Response, next: () => void) {
  const u = req.user as any;
  if (!u) return res.status(401).json({ error: "로그인이 필요합니다." });
  if (u.password) return next();
  try {
    if (await hasRequiredConsent(u.id)) return next();
    return res.status(403).json({ error: "약관 동의가 필요합니다.", code: "consent_required" });
  } catch {
    return res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
}

// 결제링크 공개 라우트 전용 rate limiter (글로벌 200/15분과 별도, 더 엄격)
const payLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
});

// 사건 요청(제보) 공개 제출 전용 rate limiter — 스팸 방지(IP당 15분 8건)
const caseRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
});

// 결제링크 안내 페이지 HTML
function payLinkPage(message: string): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>결제 안내</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0;color:#1f2937;">
<div style="text-align:center;max-width:420px;padding:24px;">
<div style="font-size:18px;font-weight:700;margin-bottom:12px;">법무법인 윈스 · 허왕 변호사</div>
<p style="font-size:15px;color:#4b5563;line-height:1.6;">${message}</p>
</div></body></html>`;
}

// 수신처 마스킹(발송현황 노출용)
function maskRecipient(r: string): string {
  if (!r) return "";
  if (r.includes("@")) {
    const [u, d] = r.split("@");
    return `${u.slice(0, 2)}***@${d}`;
  }
  const digits = r.replace(/[^0-9]/g, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : "***";
}

// 사건 경과를 당사자 전원에게 발송(소송개시 자동알림). notify.ts 팬아웃, 동시성 캡.
async function notifyCaseParties(caseId: number, update: { id: number; title: string; content: string; updateType: string }, nonce?: number) {
  const [caseData] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  const parties = await db.select().from(caseParties).where(eq(caseParties.caseId, caseId));
  if (!parties.length) return;
  const caseTitle = caseData?.title || "사건";
  const progressUrl = `${PUBLIC_BASE}/cases/${caseId}/progress`;
  const tplKey = `case_${update.updateType}${nonce ? `_r${nonce}` : ""}`.slice(0, 60);
  const smsText = `[법무법인 윈스] 허왕 변호사\n${caseTitle}\n${update.title}\n진행상황: ${progressUrl}`;
  const emailSubject = `[법무법인 윈스] ${update.title}`;
  const emailHtml = `<div style="font-family:sans-serif;line-height:1.7;color:#1f2937;">
<p style="font-weight:700;">법무법인 윈스 · 허왕 변호사</p>
<p>${caseTitle} 사건 안내입니다.</p>
<p style="font-weight:600;margin-top:12px;">${update.title}</p>
<p style="white-space:pre-wrap;color:#4b5563;">${update.content || ""}</p>
<p style="margin-top:16px;"><a href="${progressUrl}">진행상황 확인하기</a></p>
</div>`;
  await mapWithConcurrency(parties, 5, async (p) => {
    await notifyParty(
      { id: p.id, phone: p.phone, email: p.email, name: p.name },
      {
        templateKey: tplKey, smsText, emailSubject, emailHtml,
        alimtalkCode: process.env.ALIGO_KAKAO_TPL_FILING, alimtalkMessage: smsText,
      },
      { caseId, caseUpdateId: update.id },
    );
  });
}

// 새 사건 요청(제보) 접수 시 윈스(허왕)에게 알림. ADMIN_ALERT_PHONE(SMS)+ADMIN_ALERT_EMAIL(메일).
async function notifyNewCaseRequest(reqId: number, data: { name: string; phone: string; title: string; category?: string | null; opponent?: string | null }) {
  const adminUrl = `${PUBLIC_BASE}/admin/case-requests`;
  const ctx = { templateKey: "case_request_new", dedupeKey: `case_request:${reqId}` };
  const smsText = `[로사이어티] 새 사건 요청 접수\n${oneLine(data.title)}\n요청자: ${oneLine(data.name)}\n확인: ${adminUrl}`;
  const adminPhone = process.env.ADMIN_ALERT_PHONE;
  const adminEmail = process.env.ADMIN_ALERT_EMAIL;
  if (adminPhone) await sendSMS(adminPhone, smsText, ctx);
  if (adminEmail) {
    const html = `<div style="font-family:sans-serif;line-height:1.7;color:#1f2937;">
<p style="font-weight:700;">새 사건 요청이 접수되었습니다.</p>
<p>제목: ${escapeHtml(data.title)}</p>
<p>유형: ${escapeHtml(data.category || "-")}</p>
<p>상대방: ${escapeHtml(data.opponent || "-")}</p>
<p>요청자: ${escapeHtml(data.name)} (${escapeHtml(data.phone)})</p>
<p style="margin-top:12px;"><a href="${adminUrl}">관리자에서 확인하기</a></p>
</div>`;
    await sendEmail(adminEmail, `[로사이어티] 새 사건 요청 — ${oneLine(data.title)}`, html, ctx);
  }
}

// 사건 요청 신청자에게 처리 결과 안내(채택/개설 시). 멱등(상태별 1회). 거래성 통지.
async function notifyCaseRequester(reqRow: any, status: string) {
  const title = oneLine(reqRow.title || "사건 요청");
  const link = `${PUBLIC_BASE}/cases`;
  const ctx = { templateKey: `case_request_${status}`, dedupeKey: `case_request_status:${reqRow.id}:${status}` };
  const tail = status === "converted"
    ? "사건이 개설되었습니다. 진행 안내를 위해 곧 연락드리겠습니다."
    : "검토 결과 진행을 위해 담당자가 곧 연락드리겠습니다.";
  if (reqRow.phone) {
    await sendSMS(reqRow.phone, `[로사이어티] 요청하신 "${title}" 건을 검토했습니다.\n${tail}\n${link}`, ctx);
  }
  if (reqRow.email) {
    const html = `<div style="font-family:sans-serif;line-height:1.7;color:#1f2937;">
<p>안녕하세요, ${escapeHtml(reqRow.name)}님.</p>
<p>요청하신 <strong>${escapeHtml(reqRow.title)}</strong> 건을 검토했습니다.</p>
<p>${escapeHtml(tail)}</p>
<p style="margin-top:12px;"><a href="${link}">진행 중인 사건 보기</a></p>
<p style="color:#9ca3af;font-size:12px;margin-top:16px;">법무법인 윈스 · 허왕 변호사</p>
</div>`;
    await sendEmail(reqRow.email, "[로사이어티] 사건 요청 검토 안내", html, ctx);
  }
}

// 감사 로그 기록 헬퍼
async function logAudit(req: Request, action: string, tableName?: string, recordId?: number, details?: string) {
  try {
    await db.insert(auditLogs).values({
      userId: (req.user as any)?.id || null,
      action,
      tableName: tableName || null,
      recordId: recordId || null,
      details: details || null,
      ipAddress: req.ip || req.headers["x-forwarded-for"]?.toString() || null,
    });
  } catch {}
}

// API 응답에서 민감정보 제거
function stripPII(obj: any): any {
  if (!obj) return obj;
  const { residentNumber, signatureImage, password, ...safe } = obj;
  return safe;
}

// HTML 이스케이프(이메일 본문에 사용자 입력 삽입 시) — 저장형 HTML 인젝션 방지
const HTML_ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => HTML_ESC[c]);
}
// 개행 제거(메일 제목·SMS 한 줄 필드에 사용 — 헤더/표시 깨짐 방지)
function oneLine(s: unknown): string {
  return String(s ?? "").replace(/[\r\n]+/g, " ").trim();
}
// 코드포인트 단위 안전 절단(서러게이트 페어 분리로 인한 잘못된 UTF-8 방지)
function clip(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return Array.from(t).slice(0, max).join("");
}

export function registerRoutes(app: Express) {
  registerSocialAuth(app); // 간편인증(소셜 로그인) 라우트 — SPA 캐치올보다 먼저 등록
  // ═══════════════════════════════════════════
  // 인증 API
  // ═══════════════════════════════════════════
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, name, phone } = req.body;
      if (!email || !password || !name) {
        return res.status(400).json({ error: "이메일, 비밀번호, 이름은 필수입니다." });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: "비밀번호는 8자 이상이어야 합니다." });
      }

      const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: "이미 등록된 이메일입니다." });
      }

      const hashed = await hashPassword(password);
      const [user] = await db.insert(users).values({
        email: email.toLowerCase().trim(),
        password: hashed,
        name: name.trim(),
        phone: phone?.trim() || null,
        role: "member",
      }).returning();

      try {
        await loginWithSessionRegeneration(req, user); // 세션 재생성(Session Fixation 방지)
        const { password: _, ...safeUser } = user;
        return res.status(201).json(safeUser);
      } catch {
        return res.status(500).json({ error: "로그인 처리 실패" });
      }
    } catch (err: any) {
      console.error("회원가입 오류:", err);
      return res.status(500).json({ error: "서버 오류가 발생했습니다." });
    }
  });

  app.post("/api/auth/login", (req: Request, res: Response, next) => {
    passport.authenticate("local", async (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message || "로그인 실패" });
      try {
        await loginWithSessionRegeneration(req, user);
        const { password: _, ...safeUser } = user;
        return res.json(safeUser);
      } catch (loginErr) {
        return next(loginErr);
      }
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => res.json({ ok: true }));
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "인증되지 않음" });
    const { password: _, ...safeUser } = req.user as any;
    return res.json(safeUser);
  });

  // ═══════════════════════════════════════════
  // 개인정보 동의 / 정보주체 권리 API
  // ═══════════════════════════════════════════

  // 동의 기록
  app.post("/api/consent", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { consentTypes } = req.body;
      // 허용 타입만 수용, 버전은 서버 고정(클라이언트 위변조 방지)
      const ALLOWED = ["service_terms", "pii_collection", "marketing", "third_party_sharing", "privacy_policy"];
      const types = Array.isArray(consentTypes) ? [...new Set(consentTypes)].filter((t) => ALLOWED.includes(t)) : [];
      if (!types.length) {
        return res.status(400).json({ error: "유효한 동의 항목이 필요합니다." });
      }
      const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "";
      const ua = req.headers["user-agent"] || "";

      for (const ct of types) {
        await db.insert(consents).values({
          userId,
          consentType: ct,
          version: CONSENT_VERSION,
          agreed: true,
          ipAddress: ip,
          userAgent: ua,
        });
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 내 동의 내역 조회
  app.get("/api/my/consents", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const list = await db.select().from(consents).where(eq(consents.userId, userId)).orderBy(desc(consents.createdAt));
      return res.json(list);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 내 개인정보 내보내기 (정보주체 열람권, 개인정보보호법 제35조)
  app.get("/api/user/export", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      await logAudit(req, "export_data", "users", userId);

      const [userData] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const myParties = await db.select().from(caseParties).where(eq(caseParties.userId, userId));
      const myEvidence = await db.select({
        id: evidence.id, caseId: evidence.caseId, fileName: evidence.fileName,
        fileType: evidence.fileType, description: evidence.description, createdAt: evidence.createdAt,
      }).from(evidence).where(eq(evidence.casePartyId, sql`ANY(ARRAY[${sql.raw(myParties.map(p => p.id).join(",") || "0")}]::int[])`));
      const myOrders = await db.select().from(paymentOrders).where(eq(paymentOrders.userId, userId));
      const mySeizures = await db.select().from(provisionalSeizures).where(eq(provisionalSeizures.userId, userId));
      const myPayments = await db.select({
        id: paymentTransactions.id, amount: paymentTransactions.amount,
        status: paymentTransactions.status, paymentType: paymentTransactions.paymentType,
        createdAt: paymentTransactions.createdAt,
      }).from(paymentTransactions).where(eq(paymentTransactions.userId, userId));
      const myConsents = await db.select().from(consents).where(eq(consents.userId, userId));

      const { password: _, ...safeUser } = userData;
      return res.json({
        exportDate: new Date().toISOString(),
        user: safeUser,
        caseParticipations: myParties.map(stripPII),
        evidence: myEvidence,
        paymentOrders: myOrders,
        provisionalSeizures: mySeizures,
        payments: myPayments,
        consents: myConsents,
      });
    } catch (err) {
      console.error("데이터 내보내기 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 내 개인정보 삭제 요청 (정보주체 삭제권, 개인정보보호법 제36조)
  app.delete("/api/user/delete", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      await logAudit(req, "delete_data", "users", userId, "사용자 삭제 요청");

      // 증거 파일 삭제
      const myParties = await db.select().from(caseParties).where(eq(caseParties.userId, userId));
      for (const party of myParties) {
        const files = await db.select().from(evidence).where(eq(evidence.casePartyId, party.id));
        for (const file of files) { await deleteFile(file.filePath); }
        await db.delete(evidence).where(eq(evidence.casePartyId, party.id));
      }

      // 빌링키 비활성화
      await db.update(billingKeys).set({ isActive: false }).where(eq(billingKeys.userId, userId));

      // 당사자 정보 익명화 (결제 기록 보존을 위해 삭제 대신 익명화)
      for (const party of myParties) {
        await db.update(caseParties).set({
          name: "탈퇴회원", phone: null, email: null, address: null,
          residentNumber: null, damageDescription: null, signatureImage: null,
        }).where(eq(caseParties.id, party.id));
        // 참여자 수 감소
        await db.update(cases).set({ currentCount: sql`GREATEST(${cases.currentCount} - 1, 0)` }).where(eq(cases.id, party.caseId));
      }

      // 동의 기록 보존 (법적 근거), 사용자 정보 익명화
      await db.update(users).set({
        email: `deleted_${userId}@withdrawn.local`,
        name: "탈퇴회원",
        phone: null,
        password: "DELETED",
      }).where(eq(users.id, userId));

      // 세션 종료
      req.logout(() => {
        req.session.destroy(() => {
          return res.json({ ok: true, message: "개인정보가 삭제되었습니다." });
        });
      });
    } catch (err) {
      console.error("데이터 삭제 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ═══════════════════════════════════════════
  // 사건 API (공개)
  // ═══════════════════════════════════════════
  app.get("/api/cases", async (req, res) => {
    try {
      const allCases = await db
        .select()
        .from(cases)
        .orderBy(desc(cases.createdAt));
      return res.json(allCases);
    } catch (err) {
      console.error("사건 목록 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  app.get("/api/cases/:id", async (req, res) => {
    try {
      const [caseData] = await db
        .select()
        .from(cases)
        .where(eq(cases.id, parseInt(req.params.id)))
        .limit(1);
      if (!caseData) return res.status(404).json({ error: "사건을 찾을 수 없습니다." });

      const updates = await db
        .select()
        .from(caseUpdates)
        .where(and(eq(caseUpdates.caseId, caseData.id), eq(caseUpdates.isPublic, true)))
        .orderBy(desc(caseUpdates.createdAt));

      const [partyCount] = await db
        .select({ count: count() })
        .from(caseParties)
        .where(eq(caseParties.caseId, caseData.id));

      return res.json({ ...caseData, updates, partyCount: partyCount?.count || 0 });
    } catch (err) {
      console.error("사건 상세 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 사건 경과 조회 (당사자만)
  app.get("/api/cases/:id/updates", requireAuth, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const isAdmin = (req.user as any).role === "admin";

      // 당사자 또는 관리자만 비공개 업데이트 조회 가능
      let whereClause;
      if (isAdmin) {
        whereClause = eq(caseUpdates.caseId, caseId);
      } else {
        const [party] = await db
          .select()
          .from(caseParties)
          .where(and(eq(caseParties.caseId, caseId), eq(caseParties.userId, userId)))
          .limit(1);
        if (!party) return res.status(403).json({ error: "해당 사건의 당사자가 아닙니다." });
        whereClause = and(eq(caseUpdates.caseId, caseId), eq(caseUpdates.isPublic, true));
      }

      const updates = await db
        .select()
        .from(caseUpdates)
        .where(whereClause)
        .orderBy(desc(caseUpdates.createdAt));

      return res.json(updates);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ═══════════════════════════════════════════
  // 당사자 참여 API
  // ═══════════════════════════════════════════
  app.post("/api/cases/:id/join", requireAuth, requireConsent, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { name, phone, email, address, residentNumber, damageAmount, damageDescription } = req.body;

      // 이미 참여 여부 확인
      const existing = await db
        .select()
        .from(caseParties)
        .where(and(eq(caseParties.caseId, caseId), eq(caseParties.userId, userId)))
        .limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: "이미 참여한 사건입니다.", partyId: existing[0].id });
      }

      // 사건 모집 상태 확인
      const [caseData] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
      if (!caseData) return res.status(404).json({ error: "사건을 찾을 수 없습니다." });
      if (caseData.status !== "recruiting") {
        return res.status(400).json({ error: "현재 모집 중이 아닌 사건입니다." });
      }

      const [party] = await db.insert(caseParties).values({
        caseId,
        userId,
        name: name || (req.user as any).name,
        phone: phone || (req.user as any).phone,
        email: email || (req.user as any).email,
        address,
        residentNumber: residentNumber ? encryptPII(residentNumber) : null,
        damageAmount: damageAmount ? parseInt(damageAmount) : null,
        damageDescription,
      }).returning();

      // 참여자 수 업데이트
      await db
        .update(cases)
        .set({ currentCount: sql`${cases.currentCount} + 1` })
        .where(eq(cases.id, caseId));

      return res.status(201).json(party);
    } catch (err) {
      console.error("참여 신청 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 내 참여 사건 목록
  app.get("/api/my/cases", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const myParties = await db
        .select({
          party: caseParties,
          case: cases,
        })
        .from(caseParties)
        .innerJoin(cases, eq(caseParties.caseId, cases.id))
        .where(eq(caseParties.userId, userId))
        .orderBy(desc(caseParties.createdAt));

      return res.json(myParties);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 내 당사자 정보
  app.get("/api/cases/:id/my-party", requireAuth, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const [party] = await db
        .select()
        .from(caseParties)
        .where(and(eq(caseParties.caseId, caseId), eq(caseParties.userId, userId)))
        .limit(1);
      if (!party) return res.status(404).json({ error: "참여 정보가 없습니다." });
      return res.json(party);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ═══════════════════════════════════════════
  // 증거 업로드 API
  // ═══════════════════════════════════════════
  app.post("/api/cases/:id/evidence", requireAuth, upload.array("files", 10), async (req: any, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { description, category } = req.body;
      const EVIDENCE_CATEGORIES = ["contract", "payment_proof", "id_copy", "kakao", "photo", "recording", "statement", "other"];
      const safeCategory = EVIDENCE_CATEGORIES.includes(category) ? category : "other";

      const [party] = await db
        .select()
        .from(caseParties)
        .where(and(eq(caseParties.caseId, caseId), eq(caseParties.userId, userId)))
        .limit(1);
      if (!party) return res.status(403).json({ error: "해당 사건에 참여하지 않았습니다." });

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "파일을 선택해주세요." });
      }

      const inserted = [];
      for (const file of files) {
        const [ev] = await db.insert(evidence).values({
          casePartyId: party.id,
          caseId,
          fileName: file.originalname,
          filePath: file.path,
          fileType: file.mimetype,
          fileSize: file.size,
          description,
          category: safeCategory,
        }).returning();
        inserted.push(ev);
      }

      return res.status(201).json(inserted);
    } catch (err) {
      console.error("증거 업로드 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  app.get("/api/cases/:id/evidence", requireAuth, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const isAdmin = (req.user as any).role === "admin";

      let evidenceList;
      if (isAdmin) {
        evidenceList = await db
          .select()
          .from(evidence)
          .where(eq(evidence.caseId, caseId))
          .orderBy(desc(evidence.createdAt));
      } else {
        const [party] = await db
          .select()
          .from(caseParties)
          .where(and(eq(caseParties.caseId, caseId), eq(caseParties.userId, userId)))
          .limit(1);
        if (!party) return res.status(403).json({ error: "권한이 없습니다." });
        evidenceList = await db
          .select()
          .from(evidence)
          .where(eq(evidence.casePartyId, party.id))
          .orderBy(desc(evidence.createdAt));
      }
      return res.json(evidenceList);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ═══════════════════════════════════════════
  // 수임계약 API
  // ═══════════════════════════════════════════
  app.post("/api/cases/:id/contract", requireAuth, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { agreed, signatureImage } = req.body;

      if (!agreed || !signatureImage) {
        return res.status(400).json({ error: "동의 확인과 서명이 필요합니다." });
      }

      const [party] = await db
        .select()
        .from(caseParties)
        .where(and(eq(caseParties.caseId, caseId), eq(caseParties.userId, userId)))
        .limit(1);
      if (!party) return res.status(404).json({ error: "참여 정보가 없습니다." });

      await db
        .update(caseParties)
        .set({
          contractAgreed: true,
          contractAgreedAt: new Date(),
          signatureImage,
          status: "contracted",
        })
        .where(eq(caseParties.id, party.id));

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ═══════════════════════════════════════════
  // NicePay 결제 API
  // ═══════════════════════════════════════════
  app.get("/api/nicepay/config", (req, res) => {
    res.json({ configured: isNicePayConfigured() });
  });

  // 착수금 결제 초기화
  app.post("/api/nicepay/init-payment", requireAuth, async (req, res) => {
    try {
      const { caseId } = req.body;
      const userId = (req.user as any).id;

      const [party] = await db
        .select()
        .from(caseParties)
        .where(and(eq(caseParties.caseId, caseId), eq(caseParties.userId, userId)))
        .limit(1);
      if (!party) return res.status(404).json({ error: "참여 정보가 없습니다." });
      if (!party.contractAgreed) return res.status(400).json({ error: "수임계약을 먼저 체결해주세요." });
      if (party.paymentStatus === "completed") return res.status(400).json({ error: "이미 결제가 완료되었습니다." });

      const [caseData] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
      if (!caseData) return res.status(404).json({ error: "사건을 찾을 수 없습니다." });

      const session = await createPaymentSession({
        caseId,
        casePartyId: party.id,
        userId,
        amount: caseData.retainerFee,
        paymentType: "retainer",
      });

      return res.json({
        ...session,
        goodsName: `[착수금] ${caseData.title}`,
        buyerName: party.name,
        buyerTel: party.phone || "",
        buyerEmail: party.email || "",
        returnUrl: `${process.env.CORS_ORIGIN || "https://class.lawciety.com"}/api/nicepay/callback`,
      });
    } catch (err) {
      console.error("결제 초기화 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // NicePay 리다이렉트 (결제 페이지 생성)
  app.get("/api/nicepay/redirect/:orderId", async (req, res) => {
    try {
      const [session] = await db
        .select()
        .from(paymentSessions)
        .where(eq(paymentSessions.orderId, req.params.orderId))
        .limit(1);
      if (!session) return res.status(404).send("결제 세션을 찾을 수 없습니다.");

      const [party] = session.casePartyId
        ? await db.select().from(caseParties).where(eq(caseParties.id, session.casePartyId)).limit(1)
        : [null];
      const [caseData] = await db.select().from(cases).where(eq(cases.id, session.caseId)).limit(1);

      const html = generatePaymentFormHTML({
        orderId: session.orderId,
        amount: session.amount,
        goodsName: `[착수금] ${caseData?.title || "집단소송"}`,
        buyerName: party?.name || "고객",
        buyerTel: party?.phone || "",
        buyerEmail: party?.email || "",
        returnUrl: `${process.env.CORS_ORIGIN || "https://class.lawciety.com"}/api/nicepay/callback`,
        merchantId: process.env.NICEPAY_MERCHANT_ID || "winslaw00m",
        ediDate: session.ediDate,
        signData: session.signData,
      });

      res.setHeader("Content-Type", "text/html; charset=euc-kr");
      return res.send(html);
    } catch (err) {
      return res.status(500).send("오류가 발생했습니다.");
    }
  });

  // NicePay 콜백
  app.post("/api/nicepay/callback", async (req, res) => {
    try {
      const { ResultCode, TID, Moid, Amt, MID, EdiDate, SignData } = req.body;

      if (ResultCode !== "0000" && ResultCode !== "00") {
        return res.redirect(`/payment/fail?orderId=${Moid}&msg=${encodeURIComponent(req.body.ResultMsg || "결제 실패")}`);
      }

      const session = await validatePaymentCallback(Moid, Amt, MID, EdiDate, SignData);

      // 결제링크 결제: 승인(청구) 전에 링크를 원자적으로 active→used 선점.
      // 다중 오픈/동시 콜백이 와도 단 하나만 통과 → 이중청구·취소/만료 후 결제 차단.
      let claimedLinkId: number | null = null;
      if (session.metadata) {
        try {
          const meta = JSON.parse(session.metadata);
          if (meta?.paymentLinkId) {
            const claimed = await db.update(paymentLinks)
              .set({ status: "used", usedAt: new Date() })
              .where(and(eq(paymentLinks.id, meta.paymentLinkId), eq(paymentLinks.status, "active")))
              .returning();
            if (claimed.length === 0) {
              return res.redirect(`/payment/fail?orderId=${Moid}&msg=${encodeURIComponent("이미 처리되었거나 만료된 결제입니다.")}`);
            }
            claimedLinkId = meta.paymentLinkId;
          }
        } catch {
          /* metadata 파싱 실패 → 일반 결제로 진행 */
        }
      }

      const approvalResult = await requestPaymentApproval(TID, Moid, Amt);

      if (approvalResult.ResultCode === "3001" || approvalResult.ResultCode === "0000") {
        await completePayment(Moid, TID, approvalResult);
        // 실제 완료된 orderId 를 링크에 확정(본인취소가 올바른 거래를 찾도록)
        if (claimedLinkId) {
          await db.update(paymentLinks).set({ lastSessionOrderId: Moid }).where(eq(paymentLinks.id, claimedLinkId));
        }
        return res.redirect(`/payment/success?orderId=${Moid}`);
      } else {
        // 승인 실패 → 선점한 링크를 active 로 롤백(재시도 허용)
        if (claimedLinkId) {
          await db.update(paymentLinks).set({ status: "active", usedAt: null }).where(eq(paymentLinks.id, claimedLinkId));
        }
        return res.redirect(`/payment/fail?orderId=${Moid}&msg=${encodeURIComponent(approvalResult.ResultMsg || "승인 실패")}`);
      }
    } catch (err: any) {
      console.error("결제 콜백 오류:", err);
      return res.redirect(`/payment/fail?msg=${encodeURIComponent(err.message || "오류")}`);
    }
  });

  // ═══════════════════════════════════════════
  // 결제 링크 (토큰 단축링크 — 로그인 없이 클릭 결제)
  // ═══════════════════════════════════════════
  const PAYLINK_GOODS: Record<string, (t: string) => string> = {
    retainer: (t) => `[착수금] ${t}`, payment_order: (t) => `[지급명령] ${t}`, seizure: (t) => `[가압류] ${t}`,
  };

  // 관리자: 당사자별 결제링크 생성(+SMS 발송)
  app.post("/api/admin/cases/:id/payment-links", requireAdmin, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const { casePartyIds, paymentType = "retainer", amount, expiresInDays = 7, send = true } = req.body;
      const [caseData] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
      if (!caseData) return res.status(404).json({ error: "사건을 찾을 수 없습니다." });

      let targets = await db.select().from(caseParties).where(eq(caseParties.caseId, caseId));
      if (Array.isArray(casePartyIds) && casePartyIds.length) {
        const ids = casePartyIds.map((x: any) => parseInt(x)).filter((n: number) => !isNaN(n));
        targets = targets.filter((p) => ids.includes(p.id));
      }
      if (!targets.length) return res.status(400).json({ error: "대상 당사자가 없습니다." });

      const linkAmount = amount ? parseInt(amount) : (paymentType === "retainer" ? caseData.retainerFee : 0);
      if (!linkAmount || linkAmount <= 0) return res.status(400).json({ error: "결제 금액을 지정해주세요." });
      const goodsName = (PAYLINK_GOODS[paymentType] || ((t: string) => `[결제] ${t}`))(caseData.title);
      const expiresAt = new Date(Date.now() + Math.max(1, Math.min(60, parseInt(expiresInDays) || 7)) * 86400000);

      const out: any[] = [];
      for (const p of targets) {
        const token = crypto.randomBytes(24).toString("base64url");
        const [link] = await db.insert(paymentLinks).values({
          token, caseId, casePartyId: p.id, userId: p.userId, amount: linkAmount,
          paymentType, goodsName, status: "active", expiresAt, createdBy: (req.user as any).id,
        }).returning();
        const url = `${PUBLIC_BASE}/pay/${token}`;
        let sendStatus = "not_sent";
        if (send && p.phone) {
          const r = await sendSMS(p.phone,
            `[법무법인 윈스] 허왕 변호사\n${goodsName} ${linkAmount.toLocaleString()}원\n결제: ${url}`,
            { templateKey: "payment_link", caseId, casePartyId: p.id, paymentLinkId: link.id, dedupeKey: `paylink:${link.id}` });
          sendStatus = r.status;
        }
        out.push({ partyId: p.id, name: p.name, url, sendStatus });
      }
      await logAudit(req, "create_payment_link", "payment_links", caseId, `${out.length}건`);
      return res.json({ count: out.length, links: out });
    } catch (err) {
      console.error("결제링크 생성 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 관리자: 결제링크 목록(상태)
  app.get("/api/admin/cases/:id/payment-links", requireAdmin, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const rows = await db.select().from(paymentLinks).where(eq(paymentLinks.caseId, caseId)).orderBy(desc(paymentLinks.createdAt));
      return res.json(rows.map(({ token, ...r }) => ({ ...r, url: `${PUBLIC_BASE}/pay/${token}` })));
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 관리자: 재발송 (nonce 로 멱등 우회 → 의도적 재발송)
  app.post("/api/admin/payment-links/:id/resend", requireAdmin, async (req, res) => {
    try {
      const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.id, parseInt(req.params.id))).limit(1);
      if (!link) return res.status(404).json({ error: "링크를 찾을 수 없습니다." });
      if (link.status !== "active") return res.status(400).json({ error: "활성 상태의 링크만 재발송할 수 있습니다." });
      const [party] = link.casePartyId ? await db.select().from(caseParties).where(eq(caseParties.id, link.casePartyId)).limit(1) : [null];
      if (!party?.phone) return res.status(400).json({ error: "당사자 전화번호가 없습니다." });
      const url = `${PUBLIC_BASE}/pay/${link.token}`;
      const r = await sendSMS(party.phone,
        `[법무법인 윈스] 허왕 변호사\n${link.goodsName || "결제"} ${link.amount.toLocaleString()}원\n결제: ${url}`,
        { templateKey: "payment_link", caseId: link.caseId, casePartyId: link.casePartyId || undefined, paymentLinkId: link.id, dedupeKey: `paylink:${link.id}:resend:${Date.now()}` });
      return res.json({ status: r.status });
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 관리자: 링크 취소(무효화)
  app.post("/api/admin/payment-links/:id/cancel", requireAdmin, async (req, res) => {
    try {
      await db.update(paymentLinks).set({ status: "cancelled" }).where(eq(paymentLinks.id, parseInt(req.params.id)));
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 공개(무인증): 단축링크 → API 결제 경로로 302 (prod에서 SPA catch-all 보다 먼저 매칭)
  app.get("/pay/:token", payLinkLimiter, (req, res) => {
    res.redirect(302, `/api/pay/${encodeURIComponent(req.params.token)}`);
  });

  // 공개(무인증): 토큰 검증 → NicePay 결제창(EUC-KR). nicepay 코어 재사용.
  app.get("/api/pay/:token", payLinkLimiter, async (req, res) => {
    try {
      const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.token, req.params.token)).limit(1);
      if (!link) return res.status(404).send(payLinkPage("유효하지 않은 결제 링크입니다."));
      if (link.status === "used") return res.send(payLinkPage("이미 결제가 완료된 링크입니다."));
      if (link.status === "cancelled") return res.send(payLinkPage("취소된 결제 링크입니다."));
      if (link.status === "expired" || new Date() > link.expiresAt) {
        if (link.status !== "expired") await db.update(paymentLinks).set({ status: "expired" }).where(eq(paymentLinks.id, link.id));
        return res.send(payLinkPage("만료된 결제 링크입니다. 사무실로 문의해주세요."));
      }
      await db.update(paymentLinks).set({ openCount: sql`${paymentLinks.openCount} + 1` }).where(eq(paymentLinks.id, link.id));

      const [party] = link.casePartyId ? await db.select().from(caseParties).where(eq(caseParties.id, link.casePartyId)).limit(1) : [null];
      const [caseData] = await db.select().from(cases).where(eq(cases.id, link.caseId)).limit(1);
      const session = await createPaymentSession({
        caseId: link.caseId, casePartyId: link.casePartyId || undefined,
        userId: link.userId || party?.userId || 0, amount: link.amount, paymentType: link.paymentType,
        metadata: { paymentLinkId: link.id, source: "payment_link" },
      });
      await db.update(paymentLinks).set({ lastSessionOrderId: session.orderId }).where(eq(paymentLinks.id, link.id));

      const html = generatePaymentFormHTML({
        orderId: session.orderId, amount: session.amount,
        goodsName: link.goodsName || `[결제] ${caseData?.title || "집단소송"}`,
        buyerName: party?.name || "고객", buyerTel: party?.phone || "", buyerEmail: party?.email || "",
        returnUrl: `${PUBLIC_BASE}/api/nicepay/callback`,
        merchantId: session.merchantId, ediDate: session.ediDate, signData: session.signData,
      });
      res.setHeader("Content-Type", "text/html; charset=euc-kr");
      return res.send(html);
    } catch (err) {
      console.error("결제링크 처리 오류:", err);
      return res.status(500).send(payLinkPage("결제 처리 중 오류가 발생했습니다."));
    }
  });

  // 공개(무인증): 본인취소 (토큰이 본인 인증 수단 — 당사자 폰으로 전달됨)
  app.post("/api/pay/:token/cancel", payLinkLimiter, async (req, res) => {
    try {
      const { phoneLast4 } = req.body || {};
      const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.token, req.params.token)).limit(1);
      if (!link) return res.status(404).json({ error: "유효하지 않은 링크입니다." });
      const [party] = link.casePartyId
        ? await db.select().from(caseParties).where(eq(caseParties.id, link.casePartyId)).limit(1)
        : [null];
      // 본인확인: 결제 당사자 전화번호 뒷 4자리(토큰 유출 대비 최소 인증)
      const partyPhone = (party?.phone || "").replace(/[^0-9]/g, "");
      if (!phoneLast4 || !partyPhone || partyPhone.slice(-4) !== String(phoneLast4).trim()) {
        return res.status(403).json({ error: "본인 확인에 실패했습니다. 결제 시 전화번호 뒷 4자리를 입력해주세요." });
      }
      if (party?.paymentStatus === "refunded") return res.status(400).json({ error: "이미 환불된 결제입니다." });
      if (!link.lastSessionOrderId) return res.status(400).json({ error: "결제 내역이 없습니다." });
      const [tx] = await db.select().from(paymentTransactions)
        .where(and(eq(paymentTransactions.orderId, link.lastSessionOrderId), eq(paymentTransactions.status, "completed"))).limit(1);
      if (!tx || !tx.tid) return res.status(400).json({ error: "취소할 결제 내역이 없습니다." });
      const [caseData] = await db.select().from(cases).where(eq(cases.id, link.caseId)).limit(1);
      if (caseData && caseData.status !== "recruiting") {
        return res.status(400).json({ error: "소 제기 후에는 본인취소가 불가합니다. 사무실로 문의해주세요." });
      }
      const result = await cancelPayment(tx.tid, tx.orderId, tx.amount, "본인취소", false);
      if (result.ResultCode === "2001") {
        if (link.casePartyId) await db.update(caseParties).set({ paymentStatus: "refunded" }).where(eq(caseParties.id, link.casePartyId));
        return res.json({ ok: true, message: "결제가 취소되었습니다." });
      }
      return res.status(400).json({ error: result.ResultMsg || "취소에 실패했습니다." });
    } catch (err) {
      console.error("본인취소 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ═══════════════════════════════════════════
  // 빌링키 등록/자동결제 API (winslaw01m keyin)
  // ═══════════════════════════════════════════
  app.get("/api/nicepay/keyin-config", (req, res) => {
    res.json({ configured: isKeyinConfigured() });
  });

  // 성공보수 카드(빌링키) 등록
  app.post("/api/cases/:id/billing-key", requireAuth, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { cardNumber, expMonth, expYear, cardPw, idNo } = req.body;

      if (!cardNumber || !expMonth || !expYear || !cardPw || !idNo) {
        return res.status(400).json({ error: "모든 카드 정보를 입력해주세요." });
      }

      const [party] = await db.select().from(caseParties)
        .where(and(eq(caseParties.caseId, caseId), eq(caseParties.userId, userId))).limit(1);
      if (!party) return res.status(403).json({ error: "해당 사건에 참여하지 않았습니다." });

      const user = req.user as any;
      const moid = `BK${caseId}_${party.id}_${Date.now()}`;

      const result = await registerBillingKey({
        cardNumber, expYear, expMonth, idNo, cardPw,
        buyerName: party.name,
        buyerEmail: party.email || user.email,
        buyerTel: party.phone || "",
        moid,
      });

      if (result.ResultCode !== "F100") {
        return res.status(400).json({ error: result.ResultMsg || "빌링키 등록 실패" });
      }

      // 빌링키 저장
      await db.insert(billingKeys).values({
        userId,
        casePartyId: party.id,
        caseId,
        bid: result.BID,
        cardName: result.CardName || null,
        cardNum: result.CardNo ? result.CardNo.replace(/(\d{4})(\d{4})(\d{4})(\d{4})/, "$1-****-****-$4") : null,
      });

      return res.json({ ok: true, cardName: result.CardName });
    } catch (err: any) {
      console.error("빌링키 등록 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 성공보수 자동결제 실행 (관리자)
  app.post("/api/admin/billing-charge", requireAdmin, async (req, res) => {
    try {
      const { billingKeyId, amount, goodsName } = req.body;

      const [bk] = await db.select().from(billingKeys)
        .where(and(eq(billingKeys.id, billingKeyId), eq(billingKeys.isActive, true))).limit(1);
      if (!bk) return res.status(404).json({ error: "빌링키를 찾을 수 없습니다." });

      const moid = `SF${bk.caseId}_${bk.casePartyId}_${Date.now()}`;
      const result = await approveBillingPayment({
        bid: bk.bid,
        amount: parseInt(amount),
        goodsName: goodsName || "[성공보수] 집단소송",
        moid,
        cardInterest: "0",
      });

      if (result.ResultCode !== "3001" && result.ResultCode !== "0000") {
        return res.status(400).json({ error: result.ResultMsg || "결제 실패" });
      }

      // 결제 기록
      await db.insert(paymentTransactions).values({
        casePartyId: bk.casePartyId,
        caseId: bk.caseId!,
        userId: bk.userId,
        orderId: moid,
        tid: result.TID,
        amount: parseInt(amount),
        resultCode: result.ResultCode,
        resultMsg: result.ResultMsg,
        authDate: result.AuthDate,
        authCode: result.AuthCode,
        cardName: result.CardName,
        cardNum: result.CardNo || "",
        status: "completed",
        paymentType: "success_fee",
      });

      return res.json({ ok: true, tid: result.TID });
    } catch (err: any) {
      console.error("자동결제 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 빌링키 삭제
  app.delete("/api/billing-keys/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const [bk] = await db.select().from(billingKeys)
        .where(and(eq(billingKeys.id, parseInt(req.params.id)), eq(billingKeys.userId, userId))).limit(1);
      if (!bk) return res.status(404).json({ error: "빌링키를 찾을 수 없습니다." });

      await removeBillingKey(bk.bid);
      await db.update(billingKeys).set({ isActive: false }).where(eq(billingKeys.id, bk.id));
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ═══════════════════════════════════════════
  // 지급명령 API
  // ═══════════════════════════════════════════
  app.post("/api/cases/:id/payment-order", requireAuth, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { creditorName, debtorName, claimAmount, claimReason, courtName } = req.body;

      const [party] = await db
        .select()
        .from(caseParties)
        .where(and(eq(caseParties.caseId, caseId), eq(caseParties.userId, userId)))
        .limit(1);
      if (!party) return res.status(403).json({ error: "해당 사건에 참여하지 않았습니다." });

      const [order] = await db.insert(paymentOrders).values({
        caseId,
        casePartyId: party.id,
        userId,
        creditorName,
        debtorName,
        claimAmount: parseInt(claimAmount),
        claimReason,
        courtName,
      }).returning();

      return res.status(201).json(order);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  app.get("/api/my/payment-orders", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const orders = await db
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.userId, userId))
        .orderBy(desc(paymentOrders.createdAt));
      return res.json(orders);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ═══════════════════════════════════════════
  // 가압류 API
  // ═══════════════════════════════════════════
  app.post("/api/cases/:id/provisional-seizure", requireAuth, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { creditorName, debtorName, seizureAmount, seizureReason, propertyType, propertyDetail, propertyValue, courtName } = req.body;

      const [party] = await db
        .select()
        .from(caseParties)
        .where(and(eq(caseParties.caseId, caseId), eq(caseParties.userId, userId)))
        .limit(1);
      if (!party) return res.status(403).json({ error: "해당 사건에 참여하지 않았습니다." });

      const [seizure] = await db.insert(provisionalSeizures).values({
        caseId,
        casePartyId: party.id,
        userId,
        creditorName,
        debtorName,
        seizureAmount: parseInt(seizureAmount),
        seizureReason,
        propertyType,
        propertyDetail,
        propertyValue: propertyValue ? parseInt(propertyValue) : null,
        courtName,
      }).returning();

      return res.status(201).json(seizure);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  app.get("/api/my/provisional-seizures", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const seizures = await db
        .select()
        .from(provisionalSeizures)
        .where(eq(provisionalSeizures.userId, userId))
        .orderBy(desc(provisionalSeizures.createdAt));
      return res.json(seizures);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ═══════════════════════════════════════════
  // 관리자 API
  // ═══════════════════════════════════════════

  // 사건 CRUD
  app.post("/api/admin/cases", requireAdmin, async (req, res) => {
    try {
      const [newCase] = await db.insert(cases).values({
        title: req.body.title,
        summary: req.body.summary,
        description: req.body.description,
        caseType: req.body.caseType,
        defendant: req.body.defendant,
        retainerFee: parseInt(req.body.retainerFee),
        targetCount: req.body.targetCount ? parseInt(req.body.targetCount) : null,
        courtName: req.body.courtName,
        caseNumber: req.body.caseNumber,
        recruitStartDate: req.body.recruitStartDate ? new Date(req.body.recruitStartDate) : null,
        recruitEndDate: req.body.recruitEndDate ? new Date(req.body.recruitEndDate) : null,
        supportsPaymentOrder: req.body.supportsPaymentOrder || false,
        supportsProvisionalSeizure: req.body.supportsProvisionalSeizure || false,
      }).returning();
      return res.status(201).json(newCase);
    } catch (err) {
      console.error("사건 생성 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  app.put("/api/admin/cases/:id", requireAdmin, async (req, res) => {
    try {
      const [updated] = await db
        .update(cases)
        .set({
          ...req.body,
          retainerFee: req.body.retainerFee ? parseInt(req.body.retainerFee) : undefined,
          targetCount: req.body.targetCount ? parseInt(req.body.targetCount) : undefined,
          filingDate: req.body.filingDate ? new Date(req.body.filingDate) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(cases.id, parseInt(req.params.id)))
        .returning();
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 사건 경과 업데이트 추가
  app.post("/api/admin/cases/:id/updates", requireAdmin, upload.single("attachment"), async (req: any, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const [update] = await db.insert(caseUpdates).values({
        caseId,
        title: req.body.title,
        content: req.body.content,
        updateType: req.body.updateType || "notice",
        isPublic: req.body.isPublic !== "false",
        attachmentPath: req.file?.path || null,
        attachmentName: req.file?.originalname || null,
      }).returning();

      // 자동 알림: 체크박스(notifyParties) 시 당사자 전원에게 발송. 비동기(대량 대비) → 즉시 응답.
      let notified = false;
      if (req.body.notifyParties === "true") {
        notified = true;
        await logAudit(req, "notify_parties", "case_updates", update.id);
        notifyCaseParties(caseId, update).catch((e) => console.error("알림 팬아웃 오류:", e));
      }
      return res.status(201).json({ ...update, notified });
    } catch (err) {
      console.error("경과 등록 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 알림 재발송(수동) — nonce 로 멱등 우회
  app.post("/api/admin/case-updates/:id/resend", requireAdmin, async (req, res) => {
    try {
      const updateId = parseInt(req.params.id);
      const [update] = await db.select().from(caseUpdates).where(eq(caseUpdates.id, updateId)).limit(1);
      if (!update) return res.status(404).json({ error: "경과를 찾을 수 없습니다." });
      await logAudit(req, "notify_parties_resend", "case_updates", updateId);
      notifyCaseParties(update.caseId, update, Date.now()).catch((e) => console.error("재발송 오류:", e));
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 발송 현황(마스킹)
  app.get("/api/admin/case-updates/:id/notifications", requireAdmin, async (req, res) => {
    try {
      const rows = await db.select().from(notifications)
        .where(eq(notifications.caseUpdateId, parseInt(req.params.id)))
        .orderBy(desc(notifications.createdAt));
      return res.json(rows.map((r) => ({
        id: r.id, channel: r.channel, recipient: maskRecipient(r.recipient),
        status: r.status, error: r.error, createdAt: r.createdAt,
      })));
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 당사자 목록 (관리자) — 감사 로그 기록
  app.get("/api/admin/cases/:id/parties", requireAdmin, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      await logAudit(req, "view_parties", "case_parties", caseId);
      const parties = await db
        .select()
        .from(caseParties)
        .where(eq(caseParties.caseId, caseId))
        .orderBy(desc(caseParties.createdAt));
      return res.json(parties.map(stripPII));
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 당사자 상태 변경 (관리자)
  app.put("/api/admin/parties/:id/status", requireAdmin, async (req, res) => {
    try {
      const [updated] = await db
        .update(caseParties)
        .set({ status: req.body.status })
        .where(eq(caseParties.id, parseInt(req.params.id)))
        .returning();
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 지급명령 상태 변경
  app.put("/api/admin/payment-orders/:id/status", requireAdmin, async (req, res) => {
    try {
      const [updated] = await db
        .update(paymentOrders)
        .set({ status: req.body.status, updatedAt: new Date() })
        .where(eq(paymentOrders.id, parseInt(req.params.id)))
        .returning();
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 가압류 상태 변경
  app.put("/api/admin/provisional-seizures/:id/status", requireAdmin, async (req, res) => {
    try {
      const [updated] = await db
        .update(provisionalSeizures)
        .set({ status: req.body.status, updatedAt: new Date() })
        .where(eq(provisionalSeizures.id, parseInt(req.params.id)))
        .returning();
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ═══════════════════════════════════════════
  // 상대방(피고/채무자) 관리 API
  // ═══════════════════════════════════════════

  // 상대방 목록 조회 — 감사 로그 기록
  app.get("/api/admin/cases/:id/defendants", requireAdmin, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      await logAudit(req, "view_defendants", "defendants", caseId);
      const list = await db
        .select()
        .from(defendants)
        .where(eq(defendants.caseId, caseId))
        .orderBy(desc(defendants.createdAt));
      return res.json(list.map(stripPII));
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 상대방 개별 추가
  app.post("/api/admin/cases/:id/defendants", requireAdmin, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const { name, partyType, residentNumber, companyRegNumber, representativeName,
        address, phone, email, claimAmount, contractDate, unitNumber, notes } = req.body;

      if (!name) return res.status(400).json({ error: "이름은 필수입니다." });

      const [created] = await db.insert(defendants).values({
        caseId,
        name,
        partyType: partyType || "individual",
        residentNumber: residentNumber ? encryptPII(residentNumber) : null,
        companyRegNumber,
        representativeName,
        address,
        phone,
        email,
        claimAmount: claimAmount ? parseInt(claimAmount) : null,
        contractDate,
        unitNumber,
        notes,
      }).returning();

      return res.status(201).json(created);
    } catch (err) {
      console.error("상대방 추가 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 상대방 수정
  app.put("/api/admin/defendants/:id", requireAdmin, async (req, res) => {
    try {
      const { name, partyType, residentNumber, companyRegNumber, representativeName,
        address, phone, email, claimAmount, contractDate, unitNumber, notes } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (partyType !== undefined) updateData.partyType = partyType;
      if (residentNumber) updateData.residentNumber = encryptPII(residentNumber);
      if (companyRegNumber !== undefined) updateData.companyRegNumber = companyRegNumber;
      if (representativeName !== undefined) updateData.representativeName = representativeName;
      if (address !== undefined) updateData.address = address;
      if (phone !== undefined) updateData.phone = phone;
      if (email !== undefined) updateData.email = email;
      if (claimAmount !== undefined) updateData.claimAmount = claimAmount ? parseInt(claimAmount) : null;
      if (contractDate !== undefined) updateData.contractDate = contractDate;
      if (unitNumber !== undefined) updateData.unitNumber = unitNumber;
      if (notes !== undefined) updateData.notes = notes;

      const [updated] = await db
        .update(defendants)
        .set(updateData)
        .where(eq(defendants.id, parseInt(req.params.id)))
        .returning();
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 상대방 삭제
  app.delete("/api/admin/defendants/:id", requireAdmin, async (req, res) => {
    try {
      const defId = parseInt(req.params.id);
      // 첨부자료 파일 삭제
      const docs = await db.select().from(defendantDocuments).where(eq(defendantDocuments.defendantId, defId));
      for (const doc of docs) {
        await deleteFile(doc.filePath);
      }
      await db.delete(defendantDocuments).where(eq(defendantDocuments.defendantId, defId));
      await db.delete(defendants).where(eq(defendants.id, defId));
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 상대방 엑셀 일괄 등록 (JSON 배열로 받기)
  app.post("/api/admin/cases/:id/defendants/bulk", requireAdmin, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const { rows } = req.body; // [{name, address, phone, ...}, ...]
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "등록할 데이터가 없습니다." });
      }

      const inserted = [];
      for (const row of rows) {
        if (!row.name) continue;
        const [created] = await db.insert(defendants).values({
          caseId,
          name: row.name,
          partyType: row.partyType || "individual",
          residentNumber: row.residentNumber ? encryptPII(row.residentNumber) : null,
          companyRegNumber: row.companyRegNumber || null,
          representativeName: row.representativeName || null,
          address: row.address || null,
          phone: row.phone || null,
          email: row.email || null,
          claimAmount: row.claimAmount ? parseInt(row.claimAmount) : null,
          contractDate: row.contractDate || null,
          unitNumber: row.unitNumber || null,
          notes: row.notes || null,
        }).returning();
        inserted.push(created);
      }

      return res.status(201).json({ count: inserted.length, defendants: inserted });
    } catch (err) {
      console.error("일괄 등록 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 상대방 첨부자료 업로드
  app.post("/api/admin/defendants/:id/documents", requireAdmin, upload.array("files", 10), async (req: any, res) => {
    try {
      const defendantId = parseInt(req.params.id);
      const { documentType, description } = req.body;

      const [def] = await db.select().from(defendants).where(eq(defendants.id, defendantId)).limit(1);
      if (!def) return res.status(404).json({ error: "상대방을 찾을 수 없습니다." });

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) return res.status(400).json({ error: "파일을 선택해주세요." });

      const inserted = [];
      for (const file of files) {
        const [doc] = await db.insert(defendantDocuments).values({
          defendantId,
          caseId: def.caseId,
          fileName: file.originalname,
          filePath: file.path,
          fileType: file.mimetype,
          fileSize: file.size,
          documentType: documentType || "other",
          description,
        }).returning();
        inserted.push(doc);
      }

      return res.status(201).json(inserted);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 상대방 첨부자료 목록
  app.get("/api/admin/defendants/:id/documents", requireAdmin, async (req, res) => {
    try {
      const docs = await db
        .select()
        .from(defendantDocuments)
        .where(eq(defendantDocuments.defendantId, parseInt(req.params.id)))
        .orderBy(desc(defendantDocuments.createdAt));
      return res.json(docs);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 첨부자료 삭제
  app.delete("/api/admin/defendant-documents/:id", requireAdmin, async (req, res) => {
    try {
      const [doc] = await db.select().from(defendantDocuments).where(eq(defendantDocuments.id, parseInt(req.params.id))).limit(1);
      if (!doc) return res.status(404).json({ error: "문서를 찾을 수 없습니다." });
      await deleteFile(doc.filePath);
      await db.delete(defendantDocuments).where(eq(defendantDocuments.id, doc.id));
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 상대방 수 조회 (공개 - CaseDetail 사이드바용, count만 반환)
  app.get("/api/cases/:id/defendant-count", async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const [result] = await db.select({ count: count() }).from(defendants).where(eq(defendants.caseId, caseId));
      return res.json({ count: result?.count || 0 });
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 소송서류 생성 (지급명령서/소장 — 상대방별)
  app.post("/api/admin/cases/:id/generate-documents", requireAdmin, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const { documentType, defendantIds } = req.body;
      // documentType: "payment_order" | "complaint" | "seizure"

      const [caseData] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
      if (!caseData) return res.status(404).json({ error: "사건을 찾을 수 없습니다." });

      let targetDefendants;
      if (defendantIds && defendantIds.length > 0) {
        const safeIds = defendantIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
        targetDefendants = await db
          .select()
          .from(defendants)
          .where(and(eq(defendants.caseId, caseId), inArray(defendants.id, safeIds)));
      } else {
        targetDefendants = await db.select().from(defendants).where(eq(defendants.caseId, caseId));
      }

      if (targetDefendants.length === 0) {
        return res.status(400).json({ error: "대상 상대방이 없습니다." });
      }

      const DOCUMENT_LABELS: Record<string, string> = {
        payment_order: "지급명령 신청서",
        complaint: "소장",
        seizure: "가압류 신청서",
      };

      const documents = targetDefendants.map((def) => ({
        defendantId: def.id,
        defendantName: def.name,
        documentType: documentType || "payment_order",
        content: {
          title: `${DOCUMENT_LABELS[documentType] || "소송서류"}`,
          courtName: caseData.courtName || "○○지방법원",
          caseTitle: caseData.title,
          caseNumber: caseData.caseNumber || "",
          // 당사자 표시
          plaintiff: caseData.defendant || "원고 (위임인)",
          defendant: {
            name: def.name,
            address: def.address || "",
            phone: def.phone || "",
            unitNumber: def.unitNumber || "",
            representativeName: def.representativeName || "",
            companyRegNumber: def.companyRegNumber || "",
          },
          claimAmount: def.claimAmount || 0,
          contractDate: def.contractDate || "",
        },
      }));

      return res.json({ count: documents.length, documents });
    } catch (err) {
      console.error("서류 생성 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 대시보드 통계
  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
      const [caseCount] = await db.select({ count: count() }).from(cases);
      const [partyCount] = await db.select({ count: count() }).from(caseParties);
      const [paidCount] = await db
        .select({ count: count() })
        .from(caseParties)
        .where(eq(caseParties.paymentStatus, "completed"));
      const [txCount] = await db
        .select({ total: sql<number>`COALESCE(SUM(${paymentTransactions.amount}), 0)` })
        .from(paymentTransactions)
        .where(eq(paymentTransactions.status, "completed"));

      return res.json({
        totalCases: caseCount?.count || 0,
        totalParties: partyCount?.count || 0,
        paidParties: paidCount?.count || 0,
        totalRevenue: txCount?.total || 0,
      });
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ═══════════════════════════════════════════
  // 변호사 전용 — 사건 서면 패키지 (자료 자동정리 → 스킬로 서면 작성)
  // ═══════════════════════════════════════════
  // 화면용 dossier (주민번호 마스킹)
  app.get("/api/lawyer/cases/:id/package", requireLawyer, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const dossier = await assembleDossier(caseId, { includeResident: false });
      if (!dossier) return res.status(404).json({ error: "사건을 찾을 수 없습니다." });
      await logAudit(req, "view_case_package", "cases", caseId, `당사자 ${dossier.당사자목록.length}명/증거 ${dossier.증거총건수}건`);
      return res.json(dossier);
    } catch (err) {
      console.error("패키지 조회 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ZIP 내보내기 (dossier.json 에 평문 주민번호 포함 — 변호사 게이트 + 감사로그)
  app.get("/api/lawyer/cases/:id/package/export", requireLawyer, async (req, res) => {
    try {
      const caseId = parseInt(req.params.id);
      const dossier = await assembleDossier(caseId, { includeResident: true });
      if (!dossier) return res.status(404).json({ error: "사건을 찾을 수 없습니다." });
      const rrnCount =
        dossier.당사자목록.filter((p) => p.주민등록번호).length +
        dossier.상대방목록.filter((x) => x.주민등록번호 || x.사업자등록번호).length;
      await logAudit(req, "export_case_package", "cases", caseId, `당사자 ${dossier.당사자목록.length}명/증거 ${dossier.증거총건수}건/주민번호 ${rrnCount}건 복호화`);
      const base = (dossier.사건.사건번호 || dossier.사건.사건명 || `case${caseId}`).replace(/[<>:"/\\|?*\s]/g, "_").slice(0, 60);
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const zipName = `사건_${caseId}_${base}_dossier_${today}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);
      buildPackageZip(dossier, res);
    } catch (err) {
      console.error("패키지 내보내기 오류:", err);
      if (!res.headersSent) return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ═══════════════════════════════════════════
  // 외부 서비스 연동 URL
  // ═══════════════════════════════════════════
  // ═══════════════════════════════════════════
  // 사건 요청 (제보) — 공개 제출 + 관리자 처리
  // ═══════════════════════════════════════════
  app.post("/api/case-requests", caseRequestLimiter, async (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      // 허니팟: 봇이 채우는 숨김 필드. 채워졌으면 정상 응답하되 저장하지 않음.
      if (typeof b.website === "string" && b.website.trim()) return res.json({ ok: true });
      // 개인정보 수집·이용 동의(서버측 강제 — PIPA)
      if (b.agree !== true) {
        return res.status(400).json({ error: "개인정보 수집·이용에 동의해주세요." });
      }
      const name = clip(b.name, 100);
      const phoneDigits = clip(b.phone, 20).replace(/[^0-9]/g, "");
      const title = clip(b.title, 500);
      const content = clip(b.content, 5000);
      if (!name || !phoneDigits || !title || !content) {
        return res.status(400).json({ error: "이름·연락처·제목·내용은 필수입니다." });
      }
      if (phoneDigits.length < 9 || phoneDigits.length > 11) {
        return res.status(400).json({ error: "연락처를 정확히 입력해주세요." });
      }
      const emailRaw = clip(b.email, 255);
      if (emailRaw && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw)) {
        return res.status(400).json({ error: "이메일 형식을 확인해주세요." });
      }
      const email = emailRaw || null;
      const structures = ["many_plaintiffs", "many_defendants", "other"];
      const caseStructure = structures.includes(b.caseStructure) ? b.caseStructure : null;
      const [created] = await db.insert(caseRequests).values({
        name,
        phone: phoneDigits,
        email,
        category: clip(b.category, 100) || null,
        title,
        opponent: clip(b.opponent, 500) || null,
        content,
        caseStructure,
        headcount: clip(b.headcount, 100) || null,
        opponentCount: clip(b.opponentCount, 100) || null,
        damageScale: clip(b.damageScale, 100) || null,
        userId: (req.user as any)?.id || null,
        ipAddress: req.ip || req.headers["x-forwarded-for"]?.toString() || null,
      }).returning();
      // 윈스 알림은 비차단(실패해도 접수는 성공 처리)
      notifyNewCaseRequest(created.id, { name, phone: phoneDigits, title, category: created.category, opponent: created.opponent })
        .catch((e) => console.error("사건요청 알림 오류:", e));
      res.json({ ok: true, id: created.id });
    } catch (e) {
      console.error("사건요청 접수 오류:", e);
      res.status(500).json({ error: "접수 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/admin/case-requests", requireAdmin, async (req, res) => {
    try {
      const allowed = ["new", "reviewing", "accepted", "declined", "converted"];
      const status = typeof req.query.status === "string" && allowed.includes(req.query.status) ? req.query.status : undefined;
      const rows = await db.select().from(caseRequests)
        .where(status ? eq(caseRequests.status, status) : undefined)
        .orderBy(desc(caseRequests.createdAt));
      await logAudit(req, "view_case_requests", "case_requests");
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "조회 실패" });
    }
  });

  app.patch("/api/admin/case-requests/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청" });
      const allowed = ["new", "reviewing", "accepted", "declined", "converted"];
      const patch: any = {};
      if (typeof req.body?.status === "string" && allowed.includes(req.body.status)) patch.status = req.body.status;
      if (typeof req.body?.adminNote === "string") patch.adminNote = req.body.adminNote.slice(0, 2000);
      if (!Object.keys(patch).length) return res.status(400).json({ error: "변경할 내용이 없습니다." });
      const [before] = await db.select().from(caseRequests).where(eq(caseRequests.id, id)).limit(1);
      if (!before) return res.status(404).json({ error: "요청을 찾을 수 없습니다." });
      const isTransition = !!patch.status && patch.status !== before.status && ["accepted", "converted"].includes(patch.status);
      // 상태 전환은 원자적으로: 직전 상태가 일치할 때만 적용(동시 PATCH 중복 알림 방지)
      const cond = isTransition
        ? and(eq(caseRequests.id, id), eq(caseRequests.status, before.status))
        : eq(caseRequests.id, id);
      const [updated] = await db.update(caseRequests).set(patch).where(cond).returning();
      if (!updated) {
        // 동시 전환 등으로 조건 불일치 → 최신값 반환(중복 알림 없음)
        const [cur] = await db.select().from(caseRequests).where(eq(caseRequests.id, id)).limit(1);
        return res.json(cur || before);
      }
      await logAudit(req, "update_case_request", "case_requests", id, patch.status);
      // 채택/개설로 '실제 전환'한 PATCH만 신청자에게 1회 안내(비차단)
      if (isTransition) {
        notifyCaseRequester(updated, patch.status!).catch((e) => console.error("사건요청 신청자 알림 오류:", e));
      }
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: "수정 실패" });
    }
  });

  app.get("/api/integrations", (req, res) => {
    res.json({
      docurepeat: process.env.DOCUREPEAT_URL || "https://docurepeat.com",
      sigaLookup: process.env.SIGA_LOOKUP_URL || "https://gongsi.estate",
      caseScraper: process.env.CASESCRAPER_URL || "https://day.lawyer/casecrab",
      dayLawyer: process.env.DAYLAWYER_URL || "https://day.lawyer",
      willSave: process.env.WILLSAVE_URL || "https://willsave.co.kr",
    });
  });

  // ═══════════════════════════════════════════
  // Health Check
  // ═══════════════════════════════════════════
  app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
  app.get("/livez", (req, res) => res.json({ status: "ok" }));
  app.get("/readyz", async (req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "error" });
    }
  });
}

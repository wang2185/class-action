import { type Express, type Request, type Response } from "express";
import passport from "passport";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { db } from "./db";
import {
  users, cases, caseParties, evidence, caseUpdates,
  paymentOrders, provisionalSeizures, paymentSessions, paymentTransactions,
  billingKeys, defendants, defendantDocuments, consents, auditLogs, paymentLinks, notifications, caseRequests,
  revenueEntries, coupons,
} from "../shared/schema";
import { eq, desc, and, sql, count, inArray, gte, lte, isNull } from "drizzle-orm";
import ExcelJS from "exceljs";
import { requireAuth, requireAdmin, requireLawyer, requireOwner, hashPassword, comparePassword, loginWithSessionRegeneration } from "./auth";
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
const CONSENT_VERSION = "2.0"; // 동의 버전(서버 고정) — 2026-07-01 PIPC 표준 개정
const REQUIRED_CONSENTS = ["service_terms", "pii_collection"]; // 필수 동의 항목

// 필수 동의(현행 버전) 보유 여부
async function hasRequiredConsent(userId: number): Promise<boolean> {
  // ⚠ 버전 일치는 요구하지 않음 — 정책 개정(버전 상향) 시 기존 동의 사용자를 동의게이트에서
  // 잠그지 않도록(레거시 회귀 방지). 정책 변경은 개인정보 보호법 제30조 공지로 고지하며,
  // 신규 동의는 현행 CONSENT_VERSION으로 기록된다.
  const rows = await db.select().from(consents)
    .where(and(
      eq(consents.userId, userId),
      inArray(consents.consentType, REQUIRED_CONSENTS),
      eq(consents.agreed, true),
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
async function notifyNewCaseRequest(reqId: number, data: { name: string; phone: string; email?: string | null; title: string; category?: string | null; opponent?: string | null }) {
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
<p>요청자: ${escapeHtml(data.name)} (${escapeHtml(data.phone)}${data.email ? " · " + escapeHtml(data.email) : ""})</p>
<p style="margin-top:12px;"><a href="${adminUrl}">관리자에서 확인하기</a></p>
</div>`;
    await sendEmail(adminEmail, `[로사이어티] 새 사건 요청 — ${oneLine(data.title)}`, html, ctx);
  }
}

// 새 사건 요청 접수 즉시 신청자 본인에게 접수확인 발송(SMS 필수+이메일 선택). 거래성 통지·멱등.
async function notifyCaseRequestReceived(reqRow: { id: number; name: string; phone: string; email: string | null; title: string }) {
  const title = oneLine(reqRow.title || "사건 요청");
  const link = `${PUBLIC_BASE}/cases`;
  const ctx = { templateKey: "case_request_received", dedupeKey: `case_request_received:${reqRow.id}` };
  if (reqRow.phone) {
    await sendSMS(reqRow.phone, `[로사이어티] "${title}" 사건 요청이 정상 접수되었습니다.\n담당자가 검토 후 입력하신 연락처로 곧 연락드리겠습니다.\n법무법인 윈스`, ctx);
  }
  if (reqRow.email) {
    const html = `<div style="font-family:sans-serif;line-height:1.7;color:#1f2937;">
<p>안녕하세요, ${escapeHtml(reqRow.name)}님.</p>
<p>요청하신 <strong>${escapeHtml(reqRow.title)}</strong> 건이 정상 접수되었습니다.</p>
<p>담당자가 검토 후 입력하신 연락처로 곧 연락드리겠습니다.</p>
<p style="margin-top:12px;"><a href="${link}">진행 중인 사건 보기</a></p>
<p style="color:#9ca3af;font-size:12px;margin-top:16px;">법무법인 윈스 · 허왕 변호사</p>
</div>`;
    await sendEmail(reqRow.email, "[로사이어티] 사건 요청이 접수되었습니다", html, ctx);
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

// 운영자(허왕)에게 이벤트 알림 발송 — ADMIN_ALERT_PHONE(SMS)+ADMIN_ALERT_EMAIL(메일).
// notifyNewCaseRequest 와 동일 패턴. 멱등(dedupeKey). 당사자 로깅 불필요 → 직접 발송.
// ⚠ residentNumber 등 민감정보는 lines 에 절대 포함하지 말 것.
async function notifyAdminEvent(opts: {
  templateKey: string;
  dedupeKey: string;
  smsTitle: string;
  subject: string;
  lines: Array<[string, string | null | undefined]>;
}) {
  const adminUrl = `${PUBLIC_BASE}/admin`;
  const ctx = { templateKey: opts.templateKey, dedupeKey: opts.dedupeKey };
  const adminPhone = process.env.ADMIN_ALERT_PHONE;
  const adminEmail = process.env.ADMIN_ALERT_EMAIL;
  const smsBody = opts.lines.map(([k, v]) => `${k}: ${oneLine(v ?? "-")}`).join("\n");
  const rows = opts.lines
    .map(([k, v]) => `<p>${escapeHtml(k)}: ${escapeHtml(v ?? "-")}</p>`)
    .join("\n");
  const html = `<div style="font-family:sans-serif;line-height:1.7;color:#1f2937;">
<p style="font-weight:700;">${escapeHtml(opts.subject)}</p>
${rows}
<p style="margin-top:12px;"><a href="${adminUrl}">관리자에서 확인하기</a></p>
</div>`;
  // 두 채널 독립 발송 — 한쪽 예외가 다른쪽을 막지 않도록 allSettled.
  await Promise.allSettled([
    adminPhone ? sendSMS(adminPhone, `[로사이어티] ${opts.smsTitle}\n${smsBody}\n확인: ${adminUrl}`, ctx) : Promise.resolve(),
    adminEmail ? sendEmail(adminEmail, `[로사이어티] ${oneLine(opts.subject)}`, html, ctx) : Promise.resolve(),
  ]);
}

// 결제 완료 → 운영자 알림용 컨텍스트 해소(사건명·결제자명·금액). session=completePayment 반환값.
async function notifyAdminPayment(
  session: { caseId: number; casePartyId: number | null; userId: number; amount: number },
  orderId: string,
) {
  // 결제자명 해소: 당사자 레코드 우선, 없으면(일반결제) 가입 사용자.
  let payerName: string | null = null;
  if (session.casePartyId) {
    const [p] = await db.select().from(caseParties).where(eq(caseParties.id, session.casePartyId)).limit(1);
    if (p) payerName = p.name;
  }
  if (!payerName) {
    const [u] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (u) payerName = u.name;
  }
  const [caseData] = await db.select().from(cases).where(eq(cases.id, session.caseId)).limit(1);
  const amountStr = Number(session.amount || 0).toLocaleString("ko-KR");
  await notifyAdminEvent({
    templateKey: "admin_payment",
    dedupeKey: `admin_paid:${orderId}`,
    smsTitle: "결제 완료",
    subject: "결제 완료",
    lines: [
      ["사건", caseData?.title || "단체소송"],
      ["결제자", payerName || "-"],
      ["금액", `${amountStr}원`],
    ],
  });
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

// 라우트 :id 파라미터 → 정수(없거나 비정수면 NaN). (req.params.id 는 string|string[] 타입)
function pid(req: Request): number {
  return parseInt(String(req.params.id), 10);
}

// ── 회계 헬퍼 ──
// from/to 쿼리(YYYY-MM-DD) → Date 범위. to 는 그날 끝(23:59:59.999)까지 포함.
function accountingRange(req: Request): { from: Date | null; to: Date | null } {
  const parse = (s: any, end = false): Date | null => {
    if (!s) return null;
    const d = new Date(String(s));
    if (isNaN(d.getTime())) return null;
    // YYYY-MM-DD 는 UTC 자정으로 파싱됨 → 로컬 하루 경계로 정규화(from=00:00:00, to=23:59:59.999)
    if (end) d.setHours(23, 59, 59, 999);
    else d.setHours(0, 0, 0, 0);
    return d;
  };
  return { from: parse(req.query.from), to: parse(req.query.to, true) };
}
// 수동장부(entryDate) 필터 조건
function accountingDateConds(req: Request) {
  const { from, to } = accountingRange(req);
  const conds: any[] = [];
  if (from) conds.push(gte(revenueEntries.entryDate, from));
  if (to) conds.push(lte(revenueEntries.entryDate, to));
  return conds;
}

type MonthRow = {
  month: string; retainer: number; other: number; comp: number; refund: number;
  ledgerIncome: number; ledgerExpense: number; net: number;
};

// 월별 정산 집계: 완료 거래(착수금 retainer vs 성공보수·기타) + 직권면제(COMP) 분리 + 환불 + 수동장부 net
async function computeAccountingSummary(req: Request): Promise<{ months: MonthRow[]; totals: MonthRow; range: { from: string | null; to: string | null } }> {
  const { from, to } = accountingRange(req);

  // 완료 거래: 월·구분별 합계. resultCode='COMP'(직권면제)는 별도 분리(실수금 아님).
  const txConds = [eq(paymentTransactions.status, "completed")];
  if (from) txConds.push(gte(paymentTransactions.createdAt, from));
  if (to) txConds.push(lte(paymentTransactions.createdAt, to));
  const txAgg = await db
    .select({
      month: sql<string>`to_char(${paymentTransactions.createdAt}, 'YYYY-MM')`,
      isComp: sql<boolean>`(${paymentTransactions.resultCode} = 'COMP')`,
      isRetainer: sql<boolean>`(${paymentTransactions.paymentType} = 'retainer')`,
      total: sql<number>`COALESCE(SUM(${paymentTransactions.amount}), 0)`,
    })
    .from(paymentTransactions)
    .where(and(...txConds))
    .groupBy(sql`1`, sql`2`, sql`3`);

  // 환불 거래(월별 합계)
  const refConds = [eq(paymentTransactions.status, "refunded")];
  if (from) refConds.push(gte(paymentTransactions.createdAt, from));
  if (to) refConds.push(lte(paymentTransactions.createdAt, to));
  const refAgg = await db
    .select({
      month: sql<string>`to_char(${paymentTransactions.createdAt}, 'YYYY-MM')`,
      total: sql<number>`COALESCE(SUM(${paymentTransactions.amount}), 0)`,
    })
    .from(paymentTransactions)
    .where(and(...refConds))
    .groupBy(sql`1`);

  // 수동장부(월·방향별)
  const entryConds = accountingDateConds(req);
  const ledgerAgg = await db
    .select({
      month: sql<string>`to_char(${revenueEntries.entryDate}, 'YYYY-MM')`,
      direction: revenueEntries.direction,
      total: sql<number>`COALESCE(SUM(${revenueEntries.amount}), 0)`,
    })
    .from(revenueEntries)
    .where(entryConds.length ? and(...entryConds) : undefined)
    .groupBy(sql`1`, revenueEntries.direction);

  const map = new Map<string, MonthRow>();
  const get = (m: string): MonthRow => {
    let r = map.get(m);
    if (!r) { r = { month: m, retainer: 0, other: 0, comp: 0, refund: 0, ledgerIncome: 0, ledgerExpense: 0, net: 0 }; map.set(m, r); }
    return r;
  };
  for (const r of txAgg) {
    const row = get(r.month);
    const amt = Number(r.total) || 0;
    if (r.isComp) row.comp += amt;            // 직권면제(실제 수금 아님)
    else if (r.isRetainer) row.retainer += amt;
    else row.other += amt;                    // 성공보수·지급명령·가압류 등 기타
  }
  for (const r of refAgg) get(r.month).refund += Number(r.total) || 0;
  for (const r of ledgerAgg) {
    const row = get(r.month);
    if (r.direction === "income") row.ledgerIncome += Number(r.total) || 0;
    else row.ledgerExpense += Number(r.total) || 0;
  }

  const months = [...map.values()].map((r) => {
    // 순합계: 실수금(착수금+기타) − 환불 + 장부수입 − 장부지출. 직권면제(comp)는 실수금 아니므로 제외.
    r.net = r.retainer + r.other - r.refund + r.ledgerIncome - r.ledgerExpense;
    return r;
  }).sort((a, b) => (a.month < b.month ? 1 : -1));

  const totals: MonthRow = { month: "합계", retainer: 0, other: 0, comp: 0, refund: 0, ledgerIncome: 0, ledgerExpense: 0, net: 0 };
  for (const m of months) {
    totals.retainer += m.retainer; totals.other += m.other; totals.comp += m.comp;
    totals.refund += m.refund; totals.ledgerIncome += m.ledgerIncome; totals.ledgerExpense += m.ledgerExpense; totals.net += m.net;
  }
  return { months, totals, range: { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null } };
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
      const { email, password, name, phone, birthDate, postalCode, addressLine1, addressLine2 } = req.body;
      if (!email || !password || !name) {
        return res.status(400).json({ error: "이메일, 비밀번호, 이름은 필수입니다." });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: "비밀번호는 8자 이상이어야 합니다." });
      }
      // 생년월일(필수): 'YYYY-MM-DD' 형식 · 미래일 금지 · 만 14세 이상
      const birth = String(birthDate || "").trim();
      const birthM = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
      if (!birthM) {
        return res.status(400).json({ error: "생년월일을 YYYY-MM-DD 형식으로 입력해주세요." });
      }
      const by = Number(birthM[1]), bmo = Number(birthM[2]), bd = Number(birthM[3]);
      // 달력상 실재하는 날짜인지 round-trip 검증(02-30·02-31 등 자동보정/오버플로 차단)
      const birthMs = Date.UTC(by, bmo - 1, bd);
      const bdt = new Date(birthMs);
      if (bdt.getUTCFullYear() !== by || bdt.getUTCMonth() !== bmo - 1 || bdt.getUTCDate() !== bd) {
        return res.status(400).json({ error: "올바른 생년월일을 입력해주세요." });
      }
      const now = new Date();
      const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      if (birthMs > todayMs) {
        return res.status(400).json({ error: "생년월일이 미래일 수 없습니다." });
      }
      // 만 14세 이상(개인정보보호법상 법정대리인 동의 기준) — 만 14세가 되는 날(생일) 기준 비교
      const turns14Ms = Date.UTC(by + 14, bmo - 1, bd);
      if (turns14Ms > todayMs) {
        return res.status(400).json({ error: "만 14세 이상만 가입할 수 있습니다." });
      }
      // 배송지주소(우편번호·기본주소 필수, 상세주소 선택)
      const postal = String(postalCode || "").trim();
      const addr1 = String(addressLine1 || "").trim();
      const addr2 = String(addressLine2 || "").trim();
      if (!postal) {
        return res.status(400).json({ error: "우편번호를 입력해주세요." });
      }
      if (!addr1) {
        return res.status(400).json({ error: "기본주소를 입력해주세요." });
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
        birthDate: birth,
        postalCode: postal.slice(0, 10),
        addressLine1: addr1.slice(0, 255),
        addressLine2: addr2.slice(0, 255) || null,
        role: "member",
      }).returning();

      // 새 회원 가입 → 운영자(허왕) 알림(SMS+이메일). 멱등(admin_signup:userId). 응답 차단 안 함.
      void notifyAdminEvent({
        templateKey: "admin_signup",
        dedupeKey: `admin_signup:${user.id}`,
        smsTitle: "새 회원 가입",
        subject: "새 회원 가입",
        lines: [
          ["이름", user.name],
          ["이메일", user.email],
          ["전화", user.phone],
        ],
      }).catch(() => {});

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

  // 내 정보(이름·연락처) 변경
  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const patch: any = {};
      if (typeof req.body?.name === "string" && req.body.name.trim()) patch.name = req.body.name.trim().slice(0, 100);
      if (typeof req.body?.phone === "string") patch.phone = req.body.phone.trim().slice(0, 30) || null;
      if (!Object.keys(patch).length) return res.status(400).json({ error: "변경할 내용이 없습니다." });
      const [updated] = await db.update(users).set(patch).where(eq(users.id, userId)).returning();
      if (!updated) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
      const { password: _, ...safe } = updated;
      return res.json(safe);
    } catch (err) {
      console.error("내 정보 변경 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 비밀번호 변경(현재 비밀번호 확인 후)
  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { currentPassword, newPassword } = req.body || {};
      if (!currentPassword || !newPassword) return res.status(400).json({ error: "현재 비밀번호와 새 비밀번호를 입력해주세요." });
      if (String(newPassword).length < 8) return res.status(400).json({ error: "새 비밀번호는 8자 이상이어야 합니다." });
      const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!u) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
      if (!u.password) return res.status(400).json({ error: "소셜 로그인 계정은 비밀번호가 없습니다." });
      const ok = await comparePassword(String(currentPassword), u.password);
      if (!ok) return res.status(401).json({ error: "현재 비밀번호가 일치하지 않습니다." });
      await db.update(users).set({ password: await hashPassword(String(newPassword)) }).where(eq(users.id, userId));
      await logAudit(req, "change_password", "users", userId);
      return res.json({ ok: true });
    } catch (err) {
      console.error("비밀번호 변경 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
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
      const ALLOWED = ["service_terms", "pii_collection", "unique_id_collection", "marketing", "third_party_sharing", "privacy_policy"];
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

      // 주민등록번호(고유식별정보)는 별도 동의(개인정보 보호법 제24조의2)가 기록된 경우에만 저장.
      // 공백만 입력된 경우는 미입력으로 취급(서버 trim).
      const rrn = typeof residentNumber === "string" ? residentNumber.trim() : "";
      if (rrn) {
        const [ridConsent] = await db.select().from(consents)
          .where(and(
            eq(consents.userId, userId),
            eq(consents.consentType, "unique_id_collection"),
            eq(consents.agreed, true),
          ))
          .limit(1);
        if (!ridConsent) {
          return res.status(400).json({ error: "주민등록번호 수집에는 별도 동의가 필요합니다(개인정보 보호법 제24조의2)." });
        }
      }

      const [party] = await db.insert(caseParties).values({
        caseId,
        userId,
        name: name || (req.user as any).name,
        phone: phone || (req.user as any).phone,
        email: email || (req.user as any).email,
        address,
        residentNumber: rrn ? encryptPII(rrn) : null,
        damageAmount: damageAmount ? parseInt(damageAmount) : null,
        damageDescription,
      }).returning();

      // 참여자 수 업데이트
      await db
        .update(cases)
        .set({ currentCount: sql`${cases.currentCount} + 1` })
        .where(eq(cases.id, caseId));

      // 단체소송 참여 신청 → 운영자(허왕) 알림(SMS+이메일). 멱등(admin_join:casePartyId). 응답 차단 안 함.
      void notifyAdminEvent({
        templateKey: "admin_join",
        dedupeKey: `admin_join:${party.id}`,
        smsTitle: "단체소송 참여 신청",
        subject: "단체소송 참여 신청",
        lines: [
          ["사건", caseData.title || "단체소송"],
          ["이름", party.name],
          ["전화", party.phone],
        ],
      }).catch(() => {});

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

  // 내 알림(인앱) — 내게 발송된 SMS/이메일 이력
  app.get("/api/my/notifications", requireAuth, async (req, res) => {
    try {
      const u = req.user as any;
      const recips = [u.email, (u.phone || "").replace(/[^0-9]/g, "")].filter((v) => v && String(v).length > 0);
      if (!recips.length) return res.json([]);
      const rows = await db
        .select({ id: notifications.id, channel: notifications.channel, templateKey: notifications.templateKey, status: notifications.status, caseId: notifications.caseId, createdAt: notifications.createdAt })
        .from(notifications)
        .where(and(inArray(notifications.recipient, recips), eq(notifications.status, "sent")))
        .orderBy(desc(notifications.id))
        .limit(100);
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 내 결제 내역
  app.get("/api/my/payment-transactions", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const rows = await db
        .select({
          id: paymentTransactions.id, amount: paymentTransactions.amount, status: paymentTransactions.status,
          paymentType: paymentTransactions.paymentType, cardName: paymentTransactions.cardName,
          authDate: paymentTransactions.authDate, createdAt: paymentTransactions.createdAt,
          caseId: paymentTransactions.caseId, caseTitle: cases.title,
        })
        .from(paymentTransactions)
        .leftJoin(cases, eq(paymentTransactions.caseId, cases.id))
        .where(eq(paymentTransactions.userId, userId))
        .orderBy(desc(paymentTransactions.createdAt));
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 내 결제수단(빌링키) 목록
  app.get("/api/my/billing-keys", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const rows = await db
        .select({ id: billingKeys.id, cardName: billingKeys.cardName, cardNum: billingKeys.cardNum, caseId: billingKeys.caseId, createdAt: billingKeys.createdAt })
        .from(billingKeys)
        .where(and(eq(billingKeys.userId, userId), eq(billingKeys.isActive, true)))
        .orderBy(desc(billingKeys.createdAt));
      return res.json(rows);
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
        const paid = await completePayment(Moid, TID, approvalResult);
        // 실제 완료된 orderId 를 링크에 확정(본인취소가 올바른 거래를 찾도록)
        if (claimedLinkId) {
          await db.update(paymentLinks).set({ lastSessionOrderId: Moid }).where(eq(paymentLinks.id, claimedLinkId));
        }
        // 결제 완료 → 운영자(허왕) 알림(SMS+이메일). 멱등(admin_paid:orderId). 응답 차단 안 함.
        void notifyAdminPayment(paid, Moid).catch(() => {});
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
      const { casePartyIds, paymentType = "retainer", amount, expiresInDays = 7, send = true, couponCode } = req.body;
      const [caseData] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
      if (!caseData) return res.status(404).json({ error: "사건을 찾을 수 없습니다." });

      let targets = await db.select().from(caseParties).where(eq(caseParties.caseId, caseId));
      if (Array.isArray(casePartyIds) && casePartyIds.length) {
        const ids = casePartyIds.map((x: any) => parseInt(x)).filter((n: number) => !isNaN(n));
        targets = targets.filter((p) => ids.includes(p.id));
      }
      if (!targets.length) return res.status(400).json({ error: "대상 당사자가 없습니다." });

      const baseAmount = amount ? parseInt(amount) : (paymentType === "retainer" ? caseData.retainerFee : 0);
      if (!baseAmount || baseAmount <= 0) return res.status(400).json({ error: "결제 금액을 지정해주세요." });

      // 쿠폰(착수금 할인) 검증 — 코드가 주어진 경우에만
      let coupon: any = null;
      if (couponCode) {
        const code = String(couponCode).toUpperCase().trim();
        const [c] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
        if (!c) return res.status(400).json({ error: "쿠폰을 찾을 수 없습니다." });
        if (!c.active) return res.status(400).json({ error: "비활성 쿠폰입니다." });
        if (c.caseId && c.caseId !== caseId) return res.status(400).json({ error: "다른 사건 전용 쿠폰입니다." });
        if (c.expiresAt && new Date() > c.expiresAt) return res.status(400).json({ error: "만료된 쿠폰입니다." });
        if (c.maxUses > 0 && c.usedCount + targets.length > c.maxUses) return res.status(400).json({ error: "쿠폰 사용 한도를 초과합니다." });
        coupon = c;
      }
      const discountFor = (amt: number): number => {
        if (!coupon) return 0;
        const d = coupon.discountType === "percent"
          ? Math.floor((amt * Math.max(0, Math.min(100, coupon.discountValue))) / 100)
          : coupon.discountValue;
        return Math.max(0, Math.min(amt, d)); // 할인은 금액을 음수로 만들지 않음
      };

      const goodsName = (PAYLINK_GOODS[paymentType] || ((t: string) => `[결제] ${t}`))(caseData.title);
      const expiresAt = new Date(Date.now() + Math.max(1, Math.min(60, parseInt(expiresInDays) || 7)) * 86400000);

      const out: any[] = [];
      for (const p of targets) {
        const discountAmount = discountFor(baseAmount);
        const linkAmount = Math.max(0, baseAmount - discountAmount);
        const token = crypto.randomBytes(24).toString("base64url");
        const [link] = await db.insert(paymentLinks).values({
          token, caseId, casePartyId: p.id, userId: p.userId, amount: linkAmount,
          paymentType, goodsName, status: "active", expiresAt, createdBy: (req.user as any).id,
          couponId: coupon?.id ?? null, discountAmount,
        }).returning();
        if (coupon) {
          await db.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, coupon.id));
        }
        const url = `${PUBLIC_BASE}/pay/${token}`;
        let sendStatus = "not_sent";
        if (send && p.phone) {
          const r = await sendSMS(p.phone,
            `[법무법인 윈스] 허왕 변호사\n${goodsName} ${linkAmount.toLocaleString()}원\n결제: ${url}`,
            { templateKey: "payment_link", caseId, casePartyId: p.id, paymentLinkId: link.id, dedupeKey: `paylink:${link.id}` });
          sendStatus = r.status;
        }
        out.push({ partyId: p.id, name: p.name, url, sendStatus, amount: linkAmount, discountAmount });
      }
      await logAudit(req, "create_payment_link", "payment_links", caseId, `${out.length}건${coupon ? ` (쿠폰 ${coupon.code})` : ""}`);
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

  // 사건 삭제 (관리자) — FK가 cascade가 아니라 의존 테이블을 순서대로 트랜잭션 삭제
  app.delete("/api/admin/cases/:id", requireAdmin, async (req, res) => {
    try {
      if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "잘못된 요청" });
      const caseId = Number(req.params.id);
      const [target] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
      if (!target) return res.status(404).json({ error: "사건을 찾을 수 없습니다." });
      // 회계·법적 보존: 결제완료/환불 거래가 있으면 하드삭제 금지
      const [paidTx] = await db.select({ id: paymentTransactions.id }).from(paymentTransactions)
        .where(and(eq(paymentTransactions.caseId, caseId), inArray(paymentTransactions.status, ["completed", "refunded"]))).limit(1);
      if (paidTx) return res.status(409).json({ error: "결제 완료·환불 내역이 있는 사건은 삭제할 수 없습니다(회계·법적 보존 대상)." });

      // 디스크 파일 경로 수집(커밋 후 정리)
      const ev = await db.select({ p: evidence.filePath }).from(evidence).where(eq(evidence.caseId, caseId));
      const dd = await db.select({ p: defendantDocuments.filePath }).from(defendantDocuments).where(eq(defendantDocuments.caseId, caseId));
      const cu = await db.select({ p: caseUpdates.attachmentPath }).from(caseUpdates).where(eq(caseUpdates.caseId, caseId));

      await db.transaction(async (tx) => {
        await tx.delete(evidence).where(eq(evidence.caseId, caseId));
        await tx.delete(paymentSessions).where(eq(paymentSessions.caseId, caseId));
        await tx.delete(paymentTransactions).where(eq(paymentTransactions.caseId, caseId));
        await tx.delete(billingKeys).where(eq(billingKeys.caseId, caseId));
        await tx.delete(paymentLinks).where(eq(paymentLinks.caseId, caseId));
        await tx.delete(paymentOrders).where(eq(paymentOrders.caseId, caseId));
        await tx.delete(provisionalSeizures).where(eq(provisionalSeizures.caseId, caseId));
        await tx.delete(caseUpdates).where(eq(caseUpdates.caseId, caseId));
        await tx.delete(defendantDocuments).where(eq(defendantDocuments.caseId, caseId));
        await tx.delete(defendants).where(eq(defendants.caseId, caseId));
        await tx.delete(caseParties).where(eq(caseParties.caseId, caseId));
        await tx.delete(notifications).where(eq(notifications.caseId, caseId));
        await tx.delete(cases).where(eq(cases.id, caseId));
      });

      await logAudit(req, "delete_data", "cases", caseId, `사건 삭제: ${target.title}`);
      [...ev, ...dd, ...cu].forEach((r) => r.p && deleteFile(r.p)); // 디스크 정리(베스트 에포트)
      return res.json({ ok: true });
    } catch (err) {
      console.error("사건 삭제 오류:", err);
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

  // 경과 수정 (관리자)
  app.put("/api/admin/case-updates/:id", requireAdmin, async (req, res) => {
    try {
      if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "잘못된 요청" });
      const id = Number(req.params.id);
      const patch: any = {};
      if (typeof req.body?.title === "string") patch.title = req.body.title;
      if (typeof req.body?.content === "string") patch.content = req.body.content;
      if (typeof req.body?.updateType === "string") patch.updateType = req.body.updateType;
      if (req.body?.isPublic !== undefined) patch.isPublic = req.body.isPublic === true || req.body.isPublic === "true";
      if (!Object.keys(patch).length) return res.status(400).json({ error: "변경할 내용이 없습니다." });
      const [updated] = await db.update(caseUpdates).set(patch).where(eq(caseUpdates.id, id)).returning();
      if (!updated) return res.status(404).json({ error: "경과를 찾을 수 없습니다." });
      await logAudit(req, "update_case_update", "case_updates", id);
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 경과 삭제 (관리자) — 발송 로그 정리 + 첨부 삭제
  app.delete("/api/admin/case-updates/:id", requireAdmin, async (req, res) => {
    try {
      if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "잘못된 요청" });
      const id = Number(req.params.id);
      const [target] = await db.select().from(caseUpdates).where(eq(caseUpdates.id, id)).limit(1);
      if (!target) return res.status(404).json({ error: "경과를 찾을 수 없습니다." });
      await db.transaction(async (tx) => {
        await tx.delete(notifications).where(eq(notifications.caseUpdateId, id));
        await tx.delete(caseUpdates).where(eq(caseUpdates.id, id));
      });
      await logAudit(req, "delete_data", "case_updates", id, target.title);
      if (target.attachmentPath) deleteFile(target.attachmentPath);
      return res.json({ ok: true });
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

  // 당사자 상태 변경 (관리자) — status↔paymentStatus 정합 동기화(드리프트 방지)
  app.put("/api/admin/parties/:id/status", requireAdmin, async (req, res) => {
    try {
      const allowed = ["registered", "contracted", "paid", "verified"];
      const status = req.body?.status;
      if (!allowed.includes(status)) return res.status(400).json({ error: "유효한 상태가 아닙니다." });
      const partyId = pid(req);
      if (!Number.isInteger(partyId)) return res.status(400).json({ error: "잘못된 요청" });
      // status='paid'면 결제완료로 동기화, 'registered'/'contracted'로 되돌리면 미결제로(이미 환불이면 보존)
      const set: any = { status };
      const [cur] = await db.select({ paymentStatus: caseParties.paymentStatus }).from(caseParties)
        .where(eq(caseParties.id, partyId)).limit(1);
      if (!cur) return res.status(404).json({ error: "당사자를 찾을 수 없습니다." });
      if (status === "paid" || status === "verified") {
        if (cur.paymentStatus !== "refunded") set.paymentStatus = "completed";
      } else if (status === "registered" || status === "contracted") {
        if (cur.paymentStatus === "completed") set.paymentStatus = "pending";
      }
      const [updated] = await db
        .update(caseParties)
        .set(set)
        .where(eq(caseParties.id, partyId))
        .returning();
      await logAudit(req, "update_party_status", "case_parties", partyId, `status=${status}${set.paymentStatus ? `, paymentStatus=${set.paymentStatus}` : ""}`);
      return res.json(stripPII(updated));
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 당사자 직권 완료처리(착수금 면제/완료) — 실제 결제 없이 paid+completed 동기화 + 수동거래 마커
  app.post("/api/admin/parties/:id/comp", requireAdmin, async (req, res) => {
    try {
      const partyId = pid(req);
      if (!Number.isInteger(partyId)) return res.status(400).json({ error: "잘못된 요청" });
      const reason = String(req.body?.reason || "").trim();
      if (!reason) return res.status(400).json({ error: "면제 사유를 입력해주세요." });
      const amount = Number.isInteger(parseInt(req.body?.amount)) ? Math.max(0, parseInt(req.body.amount)) : 0;
      const [party] = await db.select().from(caseParties).where(eq(caseParties.id, partyId)).limit(1);
      if (!party) return res.status(404).json({ error: "당사자를 찾을 수 없습니다." });

      const result = await db.transaction(async (tx) => {
        const [updated] = await tx.update(caseParties)
          .set({ status: "paid", paymentStatus: "completed" })
          .where(eq(caseParties.id, partyId)).returning();
        // 수동(직권) 거래 마커 — resultCode='COMP', status='completed', amount=면제금액(보통 0)
        const orderId = `COMP-${partyId}-${Date.now()}`;
        await tx.insert(paymentTransactions).values({
          casePartyId: partyId, caseId: party.caseId, userId: party.userId,
          orderId, amount, resultCode: "COMP", resultMsg: `직권 완료처리: ${reason}`.slice(0, 255),
          status: "completed", paymentType: "retainer",
        });
        return updated;
      });

      await logAudit(req, "comp_party", "case_parties", partyId, `직권 완료처리(착수금 면제) 사유: ${reason} / 금액: ${amount}`);
      return res.json(stripPII(result));
    } catch (err) {
      console.error("직권 완료처리 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 당사자 삭제 (관리자) — 의존행 정리 + 참여 인원 재집계
  app.delete("/api/admin/parties/:id", requireAdmin, async (req, res) => {
    try {
      if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "잘못된 요청" });
      const partyId = Number(req.params.id);
      const [party] = await db.select().from(caseParties).where(eq(caseParties.id, partyId)).limit(1);
      if (!party) return res.status(404).json({ error: "당사자를 찾을 수 없습니다." });
      // 회계·법적 보존: 결제완료/환불 거래가 있으면 하드삭제 금지
      const [paidTx] = await db.select({ id: paymentTransactions.id }).from(paymentTransactions)
        .where(and(eq(paymentTransactions.casePartyId, partyId), inArray(paymentTransactions.status, ["completed", "refunded"]))).limit(1);
      if (paidTx) return res.status(409).json({ error: "결제 완료·환불 내역이 있는 당사자는 삭제할 수 없습니다(회계·법적 보존 대상)." });
      const files = await db.select({ p: evidence.filePath }).from(evidence).where(eq(evidence.casePartyId, partyId));

      await db.transaction(async (tx) => {
        await tx.delete(evidence).where(eq(evidence.casePartyId, partyId));
        await tx.delete(paymentSessions).where(eq(paymentSessions.casePartyId, partyId));
        await tx.delete(paymentTransactions).where(eq(paymentTransactions.casePartyId, partyId));
        await tx.delete(billingKeys).where(eq(billingKeys.casePartyId, partyId));
        await tx.delete(paymentLinks).where(eq(paymentLinks.casePartyId, partyId));
        await tx.delete(paymentOrders).where(eq(paymentOrders.casePartyId, partyId));
        await tx.delete(provisionalSeizures).where(eq(provisionalSeizures.casePartyId, partyId));
        await tx.delete(notifications).where(eq(notifications.casePartyId, partyId));
        await tx.delete(caseParties).where(eq(caseParties.id, partyId));
        const [{ c }] = await tx.select({ c: count() }).from(caseParties).where(eq(caseParties.caseId, party.caseId));
        await tx.update(cases).set({ currentCount: Number(c) }).where(eq(cases.id, party.caseId));
      });

      await logAudit(req, "delete_data", "case_parties", partyId, `당사자 삭제: ${party.name}`);
      files.forEach((r) => r.p && deleteFile(r.p));
      return res.json({ ok: true });
    } catch (err) {
      console.error("당사자 삭제 오류:", err);
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
      const [recruiting] = await db.select({ count: count() }).from(cases).where(eq(cases.status, "recruiting"));
      const [partyCount] = await db.select({ count: count() }).from(caseParties);
      const [paidCount] = await db.select({ count: count() }).from(caseParties).where(eq(caseParties.paymentStatus, "completed"));
      const [pendingPay] = await db.select({ count: count() }).from(caseParties).where(eq(caseParties.paymentStatus, "pending"));
      const [txCount] = await db.select({ total: sql<number>`COALESCE(SUM(${paymentTransactions.amount}), 0)` }).from(paymentTransactions).where(eq(paymentTransactions.status, "completed"));
      const [newReq] = await db.select({ count: count() }).from(caseRequests).where(eq(caseRequests.status, "new"));
      const [notifSent] = await db.select({ count: count() }).from(notifications).where(eq(notifications.status, "sent"));
      const [userCount] = await db.select({ count: count() }).from(users);
      return res.json({
        totalCases: caseCount?.count || 0,
        recruitingCases: recruiting?.count || 0,
        totalParties: partyCount?.count || 0,
        paidParties: paidCount?.count || 0,
        pendingPayParties: pendingPay?.count || 0,
        totalRevenue: txCount?.total || 0,
        newRequests: newReq?.count || 0,
        notificationsSent: notifSent?.count || 0,
        totalUsers: userCount?.count || 0,
      });
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 당사자 일괄 상태 변경
  app.post("/api/admin/parties/bulk-status", requireAdmin, async (req, res) => {
    try {
      const allowed = ["registered", "contracted", "paid", "verified"];
      const { ids, status } = req.body || {};
      if (!Array.isArray(ids) || !ids.length || !allowed.includes(status)) return res.status(400).json({ error: "ids·status가 필요합니다." });
      const intIds = ids.map((n: any) => parseInt(n, 10)).filter((n: number) => Number.isInteger(n)).slice(0, 2000);
      if (!intIds.length) return res.status(400).json({ error: "유효한 대상이 없습니다." });
      // status↔paymentStatus 정합 동기화(드리프트 방지). 환불 건은 보존하므로 paymentStatus 조건부 갱신.
      if (status === "paid" || status === "verified") {
        await db.update(caseParties)
          .set({ status, paymentStatus: "completed" })
          .where(and(inArray(caseParties.id, intIds), sql`${caseParties.paymentStatus} <> 'refunded'`));
        await db.update(caseParties).set({ status })
          .where(and(inArray(caseParties.id, intIds), eq(caseParties.paymentStatus, "refunded")));
      } else {
        await db.update(caseParties)
          .set({ status, paymentStatus: "pending" })
          .where(and(inArray(caseParties.id, intIds), eq(caseParties.paymentStatus, "completed")));
        await db.update(caseParties).set({ status })
          .where(and(inArray(caseParties.id, intIds), sql`${caseParties.paymentStatus} <> 'completed'`));
      }
      await logAudit(req, "bulk_update_party_status", "case_parties", undefined, `${intIds.length}건 → ${status}`);
      return res.json({ ok: true, updated: intIds.length });
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 결제 거래 통합 조회 (정산)
  app.get("/api/admin/payments", requireAdmin, async (req, res) => {
    try {
      const rows = await db
        .select({
          id: paymentTransactions.id, amount: paymentTransactions.amount, status: paymentTransactions.status,
          paymentType: paymentTransactions.paymentType, orderId: paymentTransactions.orderId,
          cardName: paymentTransactions.cardName, cardNum: paymentTransactions.cardNum,
          authDate: paymentTransactions.authDate, createdAt: paymentTransactions.createdAt,
          caseId: paymentTransactions.caseId, caseTitle: cases.title,
        })
        .from(paymentTransactions)
        .leftJoin(cases, eq(paymentTransactions.caseId, cases.id))
        .orderBy(desc(paymentTransactions.createdAt))
        .limit(1000);
      const [agg] = await db
        .select({
          completed: sql<number>`COALESCE(SUM(CASE WHEN ${paymentTransactions.status} = 'completed' THEN ${paymentTransactions.amount} ELSE 0 END), 0)`,
          total: count(),
        })
        .from(paymentTransactions);
      await logAudit(req, "view_payments", "payment_transactions");
      return res.json({ transactions: rows, totalCompleted: agg?.completed || 0, totalCount: agg?.total || 0 });
    } catch (err) {
      console.error("결제 조회 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 사용자 목록 (소프트 삭제 제외)
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const rows = await db
        .select({ id: users.id, email: users.email, name: users.name, phone: users.phone, birthDate: users.birthDate, postalCode: users.postalCode, addressLine1: users.addressLine1, addressLine2: users.addressLine2, role: users.role, createdAt: users.createdAt })
        .from(users)
        .where(isNull(users.deletedAt))
        .orderBy(desc(users.createdAt))
        .limit(2000);
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 사용자 생성 (관리자) — 직권 계정 개설. 임시 비밀번호 선택.
  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const allowedRoles = ["member", "lawyer", "admin", "owner"];
      const email = String(req.body?.email || "").toLowerCase().trim();
      const name = String(req.body?.name || "").trim();
      const phone = req.body?.phone ? String(req.body.phone).trim() : null;
      let role = String(req.body?.role || "member").trim();
      const tempPassword = req.body?.tempPassword ? String(req.body.tempPassword) : "";
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "유효한 이메일이 필요합니다." });
      if (!name) return res.status(400).json({ error: "이름은 필수입니다." });
      if (!allowedRoles.includes(role)) role = "member";
      // owner 권한 부여는 오너만
      if (role === "owner" && (req.user as any).role !== "owner") return res.status(403).json({ error: "오너 권한 부여는 오너만 가능합니다." });
      if (tempPassword && tempPassword.length < 8) return res.status(400).json({ error: "임시 비밀번호는 8자 이상이어야 합니다." });

      // 활성 계정 중복만 차단(소프트 삭제된 동일 이메일은 unique 제약상 충돌 → 명확한 안내)
      const [existing] = await db.select({ id: users.id, deletedAt: users.deletedAt }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) {
        return res.status(409).json({ error: existing.deletedAt ? "탈퇴 처리된 동일 이메일 계정이 있습니다." : "이미 등록된 이메일입니다." });
      }

      const hashed = tempPassword ? await hashPassword(tempPassword) : null;
      const [user] = await db.insert(users).values({ email, password: hashed, name, phone, role }).returning(
        { id: users.id, email: users.email, name: users.name, phone: users.phone, role: users.role, createdAt: users.createdAt }
      );
      await logAudit(req, "create_user", "users", user.id, `직권 계정 개설: ${email} (role=${role})`);
      return res.status(201).json(user);
    } catch (err) {
      console.error("사용자 생성 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 사용자 프로필 수정 (관리자) — 이름/연락처/이메일 (권한 변경은 별도 owner 전용 라우트)
  app.put("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = pid(req);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청" });
      const [target] = await db.select().from(users).where(and(eq(users.id, id), isNull(users.deletedAt))).limit(1);
      if (!target) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });

      const patch: any = {};
      if (typeof req.body?.name === "string" && req.body.name.trim()) patch.name = req.body.name.trim();
      if (req.body?.phone !== undefined) patch.phone = req.body.phone ? String(req.body.phone).trim() : null;
      if (typeof req.body?.email === "string" && req.body.email.trim()) {
        const email = req.body.email.toLowerCase().trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "유효한 이메일이 아닙니다." });
        if (email !== target.email) {
          const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
          if (dup) return res.status(409).json({ error: "이미 사용 중인 이메일입니다." });
          patch.email = email;
        }
      }
      if (!Object.keys(patch).length) return res.status(400).json({ error: "변경할 내용이 없습니다." });
      const [updated] = await db.update(users).set(patch).where(eq(users.id, id)).returning(
        { id: users.id, email: users.email, name: users.name, phone: users.phone, role: users.role, createdAt: users.createdAt }
      );
      await logAudit(req, "update_user", "users", id, `프로필 수정: ${Object.keys(patch).join(", ")}`);
      return res.json(updated);
    } catch (err) {
      console.error("사용자 수정 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 사용자 소프트 삭제 (오너 전용) — deletedAt 설정, 목록·인증에서 제외
  app.delete("/api/admin/users/:id", requireOwner, async (req, res) => {
    try {
      const id = pid(req);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청" });
      if (id === (req.user as any).id) return res.status(400).json({ error: "본인 계정은 삭제할 수 없습니다." });
      const [target] = await db.select().from(users).where(and(eq(users.id, id), isNull(users.deletedAt))).limit(1);
      if (!target) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
      await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
      await logAudit(req, "delete_user", "users", id, `회원 소프트 삭제: ${target.email}`);
      return res.json({ ok: true });
    } catch (err) {
      console.error("사용자 삭제 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 사용자 권한 변경 (owner 전용) — member ↔ lawyer ↔ admin ↔ owner
  app.patch("/api/admin/users/:id/role", requireOwner, async (req, res) => {
    try {
      const allowed = ["member", "lawyer", "admin", "owner"];
      const id = pid(req);
      const { role } = req.body || {};
      if (!Number.isInteger(id) || !allowed.includes(role)) return res.status(400).json({ error: "유효한 역할이 아닙니다." });
      if (id === (req.user as any).id && role !== "owner") return res.status(400).json({ error: "본인 오너 권한은 해제할 수 없습니다." });
      const [updated] = await db.update(users).set({ role }).where(eq(users.id, id)).returning({ id: users.id, email: users.email, name: users.name, role: users.role });
      if (!updated) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
      await logAudit(req, "update_user_role", "users", id, `role=${role}`);
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 감사 로그 조회 (PII 접근 이력)
  app.get("/api/admin/audit-logs", requireAdmin, async (req, res) => {
    try {
      const rows = await db
        .select({
          id: auditLogs.id, action: auditLogs.action, tableName: auditLogs.tableName, recordId: auditLogs.recordId,
          details: auditLogs.details, ipAddress: auditLogs.ipAddress, createdAt: auditLogs.createdAt,
          userId: auditLogs.userId, userEmail: users.email, userName: users.name,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .orderBy(desc(auditLogs.id))
        .limit(1000);
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ═══════════════════════════════════════════
  // 쿠폰 (착수금 할인코드)
  // ═══════════════════════════════════════════
  app.get("/api/admin/coupons", requireAdmin, async (req, res) => {
    try {
      const rows = await db
        .select({
          id: coupons.id, code: coupons.code, caseId: coupons.caseId, caseTitle: cases.title,
          discountType: coupons.discountType, discountValue: coupons.discountValue,
          maxUses: coupons.maxUses, usedCount: coupons.usedCount, active: coupons.active,
          expiresAt: coupons.expiresAt, createdAt: coupons.createdAt,
        })
        .from(coupons)
        .leftJoin(cases, eq(coupons.caseId, cases.id))
        .orderBy(desc(coupons.createdAt))
        .limit(2000);
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  app.post("/api/admin/coupons", requireAdmin, async (req, res) => {
    try {
      const code = String(req.body?.code || "").toUpperCase().trim();
      const discountType = String(req.body?.discountType || "").trim();
      const discountValue = parseInt(req.body?.discountValue, 10);
      if (!/^[A-Z0-9_-]{3,60}$/.test(code)) return res.status(400).json({ error: "코드는 영문 대문자·숫자·-_ 3~60자입니다." });
      if (!["fixed", "percent"].includes(discountType)) return res.status(400).json({ error: "할인 유형이 올바르지 않습니다." });
      if (!Number.isInteger(discountValue) || discountValue <= 0) return res.status(400).json({ error: "할인 값을 입력해주세요." });
      if (discountType === "percent" && discountValue > 100) return res.status(400).json({ error: "정률 할인은 100% 이하여야 합니다." });
      const caseId = req.body?.caseId ? parseInt(req.body.caseId, 10) : null;
      const maxUses = Number.isInteger(parseInt(req.body?.maxUses, 10)) ? Math.max(0, parseInt(req.body.maxUses, 10)) : 0;
      const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
      if (expiresAt && isNaN(expiresAt.getTime())) return res.status(400).json({ error: "만료일 형식이 올바르지 않습니다." });

      const [dup] = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, code)).limit(1);
      if (dup) return res.status(409).json({ error: "이미 존재하는 쿠폰 코드입니다." });

      const [created] = await db.insert(coupons).values({
        code, caseId, discountType, discountValue, maxUses,
        active: req.body?.active === false ? false : true,
        expiresAt, createdBy: (req.user as any).id,
      }).returning();
      await logAudit(req, "create_coupon", "coupons", created.id, `쿠폰 생성: ${code} (${discountType} ${discountValue})`);
      return res.status(201).json(created);
    } catch (err) {
      console.error("쿠폰 생성 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  app.put("/api/admin/coupons/:id", requireAdmin, async (req, res) => {
    try {
      const id = pid(req);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청" });
      const [cur] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
      if (!cur) return res.status(404).json({ error: "쿠폰을 찾을 수 없습니다." });
      const patch: any = {};
      if (req.body?.active !== undefined) patch.active = !!req.body.active;
      if (req.body?.maxUses !== undefined && Number.isInteger(parseInt(req.body.maxUses, 10))) patch.maxUses = Math.max(0, parseInt(req.body.maxUses, 10));
      if (req.body?.expiresAt !== undefined) {
        if (!req.body.expiresAt) patch.expiresAt = null;
        else { const d = new Date(req.body.expiresAt); if (isNaN(d.getTime())) return res.status(400).json({ error: "만료일 형식 오류" }); patch.expiresAt = d; }
      }
      if (!Object.keys(patch).length) return res.status(400).json({ error: "변경할 내용이 없습니다." });
      const [updated] = await db.update(coupons).set(patch).where(eq(coupons.id, id)).returning();
      await logAudit(req, "update_coupon", "coupons", id, `쿠폰 수정: ${Object.keys(patch).join(", ")}`);
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  app.delete("/api/admin/coupons/:id", requireAdmin, async (req, res) => {
    try {
      const id = pid(req);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청" });
      const [cur] = await db.select({ code: coupons.code }).from(coupons).where(eq(coupons.id, id)).limit(1);
      if (!cur) return res.status(404).json({ error: "쿠폰을 찾을 수 없습니다." });
      // 발급 링크가 couponId 를 소프트 참조하므로 행 삭제는 안전(링크는 보존). 비활성화 권장이나 삭제 허용.
      await db.delete(coupons).where(eq(coupons.id, id));
      await logAudit(req, "delete_coupon", "coupons", id, `쿠폰 삭제: ${cur.code}`);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ═══════════════════════════════════════════
  // 회계 (LEVEL 2) — 수동 장부 · 월별 정산 · XLSX 내보내기
  // ═══════════════════════════════════════════
  // 수동 장부 목록
  app.get("/api/admin/accounting/entries", requireAdmin, async (req, res) => {
    try {
      const conds = accountingDateConds(req);
      const rows = await db.select().from(revenueEntries)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(revenueEntries.entryDate), desc(revenueEntries.id))
        .limit(5000);
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 수동 장부 생성
  app.post("/api/admin/accounting/entries", requireAdmin, async (req, res) => {
    try {
      const direction = String(req.body?.direction || "").trim();
      if (!["income", "expense"].includes(direction)) return res.status(400).json({ error: "수입/지출 구분이 올바르지 않습니다." });
      const amount = parseInt(req.body?.amount, 10);
      if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: "금액을 입력해주세요." });
      const entryDate = req.body?.entryDate ? new Date(req.body.entryDate) : new Date();
      if (isNaN(entryDate.getTime())) return res.status(400).json({ error: "날짜 형식이 올바르지 않습니다." });
      const [created] = await db.insert(revenueEntries).values({
        entryDate, direction, amount,
        category: req.body?.category ? String(req.body.category).slice(0, 50) : null,
        memo: req.body?.memo ? String(req.body.memo) : null,
        source: "manual", createdBy: (req.user as any).id,
      }).returning();
      await logAudit(req, "create_revenue_entry", "revenue_entries", created.id, `${direction} ${amount} ${req.body?.category || ""}`);
      return res.status(201).json(created);
    } catch (err) {
      console.error("장부 생성 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 수동 장부 수정
  app.put("/api/admin/accounting/entries/:id", requireAdmin, async (req, res) => {
    try {
      const id = pid(req);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청" });
      const [cur] = await db.select().from(revenueEntries).where(eq(revenueEntries.id, id)).limit(1);
      if (!cur) return res.status(404).json({ error: "항목을 찾을 수 없습니다." });
      const patch: any = {};
      if (req.body?.direction && ["income", "expense"].includes(req.body.direction)) patch.direction = req.body.direction;
      if (req.body?.amount !== undefined) { const a = parseInt(req.body.amount, 10); if (!Number.isInteger(a) || a <= 0) return res.status(400).json({ error: "금액 오류" }); patch.amount = a; }
      if (req.body?.entryDate) { const d = new Date(req.body.entryDate); if (isNaN(d.getTime())) return res.status(400).json({ error: "날짜 오류" }); patch.entryDate = d; }
      if (req.body?.category !== undefined) patch.category = req.body.category ? String(req.body.category).slice(0, 50) : null;
      if (req.body?.memo !== undefined) patch.memo = req.body.memo ? String(req.body.memo) : null;
      if (!Object.keys(patch).length) return res.status(400).json({ error: "변경할 내용이 없습니다." });
      const [updated] = await db.update(revenueEntries).set(patch).where(eq(revenueEntries.id, id)).returning();
      await logAudit(req, "update_revenue_entry", "revenue_entries", id, Object.keys(patch).join(", "));
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 수동 장부 삭제
  app.delete("/api/admin/accounting/entries/:id", requireAdmin, async (req, res) => {
    try {
      const id = pid(req);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청" });
      const [cur] = await db.select({ id: revenueEntries.id }).from(revenueEntries).where(eq(revenueEntries.id, id)).limit(1);
      if (!cur) return res.status(404).json({ error: "항목을 찾을 수 없습니다." });
      await db.delete(revenueEntries).where(eq(revenueEntries.id, id));
      await logAudit(req, "delete_revenue_entry", "revenue_entries", id);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 회계 요약 (월별 정산: 착수금/성공보수·기타 분리 + 수동장부 net + 환불 + 직권면제 분리)
  app.get("/api/admin/accounting/summary", requireAdmin, async (req, res) => {
    try {
      const data = await computeAccountingSummary(req);
      await logAudit(req, "view_accounting", "payment_transactions");
      return res.json(data);
    } catch (err) {
      console.error("회계 요약 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // 회계 XLSX 내보내기 (거래내역 / 수동장부 / 월별정산)
  app.get("/api/admin/accounting/export.xlsx", requireAdmin, async (req, res) => {
    try {
      const { from, to } = accountingRange(req);
      const txConds = [eq(paymentTransactions.status, "completed")];
      if (from) txConds.push(gte(paymentTransactions.createdAt, from));
      if (to) txConds.push(lte(paymentTransactions.createdAt, to));
      const txRows = await db
        .select({
          createdAt: paymentTransactions.createdAt, caseTitle: cases.title, caseId: paymentTransactions.caseId,
          paymentType: paymentTransactions.paymentType, amount: paymentTransactions.amount,
          resultCode: paymentTransactions.resultCode, orderId: paymentTransactions.orderId,
          cardName: paymentTransactions.cardName,
        })
        .from(paymentTransactions)
        .leftJoin(cases, eq(paymentTransactions.caseId, cases.id))
        .where(and(...txConds))
        .orderBy(desc(paymentTransactions.createdAt))
        .limit(20000);

      const entryConds = accountingDateConds(req);
      const ledger = await db.select().from(revenueEntries)
        .where(entryConds.length ? and(...entryConds) : undefined)
        .orderBy(desc(revenueEntries.entryDate)).limit(20000);

      const summary = await computeAccountingSummary(req);

      const wb = new ExcelJS.Workbook();
      wb.creator = "로사이어티 관리 콘솔";
      const won = (n: number) => Math.round(n || 0);

      // 시트1: 거래내역 (⚠ 주민번호 등 PII 미포함 — 회계 필드만)
      const s1 = wb.addWorksheet("거래내역");
      s1.columns = [
        { header: "일시", key: "d", width: 20 },
        { header: "사건", key: "case", width: 30 },
        { header: "구분", key: "type", width: 12 },
        { header: "금액(원)", key: "amt", width: 14 },
        { header: "비고", key: "memo", width: 16 },
        { header: "주문번호", key: "order", width: 24 },
      ];
      const TYPE_KO: Record<string, string> = { retainer: "착수금", payment_order: "지급명령", seizure: "가압류", success_fee: "성공보수" };
      for (const r of txRows) {
        s1.addRow({
          d: r.createdAt ? new Date(r.createdAt).toLocaleString("ko-KR") : "",
          case: r.caseTitle || `사건 #${r.caseId}`,
          type: r.resultCode === "COMP" ? "직권면제" : (TYPE_KO[r.paymentType] || r.paymentType),
          amt: won(r.amount), memo: r.resultCode === "COMP" ? "COMP" : (r.cardName || ""), order: r.orderId,
        });
      }
      s1.getRow(1).font = { bold: true };

      // 시트2: 수동장부
      const s2 = wb.addWorksheet("수동장부");
      s2.columns = [
        { header: "일자", key: "d", width: 16 },
        { header: "구분", key: "dir", width: 10 },
        { header: "분류", key: "cat", width: 16 },
        { header: "금액(원)", key: "amt", width: 14 },
        { header: "메모", key: "memo", width: 30 },
      ];
      for (const e of ledger) {
        s2.addRow({
          d: e.entryDate ? new Date(e.entryDate).toLocaleDateString("ko-KR") : "",
          dir: e.direction === "income" ? "수입" : "지출",
          cat: e.category || "", amt: won(e.amount), memo: e.memo || "",
        });
      }
      s2.getRow(1).font = { bold: true };

      // 시트3: 월별정산
      const s3 = wb.addWorksheet("월별정산");
      s3.columns = [
        { header: "월", key: "m", width: 12 },
        { header: "착수금(원)", key: "retainer", width: 16 },
        { header: "성공보수·기타(원)", key: "other", width: 18 },
        { header: "직권면제(원)", key: "comp", width: 14 },
        { header: "환불(원)", key: "refund", width: 14 },
        { header: "장부수입(원)", key: "li", width: 16 },
        { header: "장부지출(원)", key: "le", width: 16 },
        { header: "순합계(원)", key: "net", width: 16 },
      ];
      for (const m of summary.months) {
        s3.addRow({ m: m.month, retainer: m.retainer, other: m.other, comp: m.comp, refund: m.refund, li: m.ledgerIncome, le: m.ledgerExpense, net: m.net });
      }
      s3.getRow(1).font = { bold: true };
      const tot = summary.totals;
      s3.addRow({});
      s3.addRow({ m: "합계", retainer: tot.retainer, other: tot.other, comp: tot.comp, refund: tot.refund, li: tot.ledgerIncome, le: tot.ledgerExpense, net: tot.net }).font = { bold: true };

      await logAudit(req, "export_data", "payment_transactions", undefined, "회계 XLSX 내보내기");
      const buf = await wb.xlsx.writeBuffer();
      const fname = `accounting_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
      return res.end(Buffer.from(buf));
    } catch (err) {
      console.error("회계 내보내기 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
  });

  // ── 오너 경영 콘솔 ──
  app.get("/api/owner/overview", requireOwner, async (req, res) => {
    try {
      const [rev] = await db.select({ total: sql<number>`COALESCE(SUM(${paymentTransactions.amount}), 0)`, cnt: count() }).from(paymentTransactions).where(eq(paymentTransactions.status, "completed"));
      const casesByStatus = await db.select({ status: cases.status, c: count() }).from(cases).groupBy(cases.status);
      const usersByRole = await db.select({ role: users.role, c: count() }).from(users).groupBy(users.role);
      const requestsByStatus = await db.select({ status: caseRequests.status, c: count() }).from(caseRequests).groupBy(caseRequests.status);
      const [pTotal] = await db.select({ c: count() }).from(caseParties);
      const [pPaid] = await db.select({ c: count() }).from(caseParties).where(eq(caseParties.paymentStatus, "completed"));
      const recentPayments = await db
        .select({ id: paymentTransactions.id, amount: paymentTransactions.amount, caseTitle: cases.title, createdAt: paymentTransactions.createdAt })
        .from(paymentTransactions).leftJoin(cases, eq(paymentTransactions.caseId, cases.id))
        .where(eq(paymentTransactions.status, "completed")).orderBy(desc(paymentTransactions.createdAt)).limit(5);
      return res.json({
        revenue: { total: rev?.total || 0, count: rev?.cnt || 0 },
        parties: { total: pTotal?.c || 0, paid: pPaid?.c || 0 },
        casesByStatus, usersByRole, requestsByStatus, recentPayments,
      });
    } catch (err) {
      console.error("오너 오버뷰 오류:", err);
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
      // 알림은 비차단(실패해도 접수는 성공 처리): 관리자(윈스) 알림 + 신청자 접수확인
      notifyNewCaseRequest(created.id, { name, phone: phoneDigits, email, title, category: created.category, opponent: created.opponent })
        .catch((e) => console.error("사건요청 관리자 알림 오류:", e));
      notifyCaseRequestReceived({ id: created.id, name, phone: phoneDigits, email, title })
        .catch((e) => console.error("사건요청 접수확인 알림 오류:", e));
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
      const id = pid(req);
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

  // 사건요청 삭제 (관리자) — 참조 테이블 없음, 단건 삭제
  app.delete("/api/admin/case-requests/:id", requireAdmin, async (req, res) => {
    try {
      if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "잘못된 요청" });
      const id = Number(req.params.id);
      const [deleted] = await db.delete(caseRequests).where(eq(caseRequests.id, id)).returning();
      if (!deleted) return res.status(404).json({ error: "요청을 찾을 수 없습니다." });
      await logAudit(req, "delete_data", "case_requests", id, deleted.title);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "삭제 실패" });
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
  // HQ 포털 연동 — 서비스 집계(읽기 전용)
  // hq.wanghuh.com 대시보드용. PII 미노출(건수·합계만). 베어러 토큰(HQ_SERVICE_TOKEN) 인증.
  // ═══════════════════════════════════════════

  // 현재 달(KST=UTC+9) 1일 00:00:00 의 UTC 시각. 서버 타임존과 무관하게 "이번 달(KST)" 경계를 산출.
  // createdAt/entryDate 비교 하한으로 사용(>= monthStart).
  function kstMonthStart(now: Date = new Date()): Date {
    const kstMs = now.getTime() + 9 * 60 * 60 * 1000;       // UTC → KST 벽시계
    const k = new Date(kstMs);
    const y = k.getUTCFullYear();
    const mo = k.getUTCMonth();
    // KST 기준 이달 1일 00:00 → 그 절대시각(UTC) = KST자정 − 9h
    return new Date(Date.UTC(y, mo, 1, 0, 0, 0) - 9 * 60 * 60 * 1000);
  }

  // 베어러 토큰 검증(타이밍 세이프). 토큰 미설정 시 503(라우트 비활성), 누락/불일치 시 401.
  function hqAuthOk(req: Request, res: Response): boolean {
    const expected = process.env.HQ_SERVICE_TOKEN || "";
    if (!expected) { res.status(503).json({ error: "service token not configured" }); return false; }
    const header = req.headers["authorization"];
    const raw = Array.isArray(header) ? header[0] : header;
    const m = /^Bearer\s+(.+)$/i.exec(String(raw || ""));
    const provided = m ? m[1].trim() : "";
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided, "utf8");
    // 길이가 다르면 timingSafeEqual 가 throw → 길이 비교를 먼저(상수시간 비교 대상은 동일 길이일 때만)
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) { res.status(401).json({ error: "unauthorized" }); return false; }
    return true;
  }

  // GET /api/service/summary — HQ 포털 단일 서비스 집계 카드. 카운트/합계만(주민번호 등 PII 절대 미노출).
  app.get("/api/service/summary", async (req: Request, res: Response) => {
    if (!hqAuthOk(req, res)) return;
    try {
      const monthStart = kstMonthStart();

      // 매출(실수금): 완료 거래 합계. ⚠ 직권면제(resultCode='COMP')는 실제 수금이 아니므로 제외
      //   (회계 모듈 computeAccountingSummary 의 retainer+other 정의와 일치. 착수금+성공보수만 집계).
      const notComp = sql`(${paymentTransactions.resultCode} IS DISTINCT FROM 'COMP')`;
      const [revAll] = await db
        .select({ total: sql<number>`COALESCE(SUM(${paymentTransactions.amount}), 0)` })
        .from(paymentTransactions)
        .where(and(eq(paymentTransactions.status, "completed"), notComp));
      const [revMonth] = await db
        .select({ total: sql<number>`COALESCE(SUM(${paymentTransactions.amount}), 0)` })
        .from(paymentTransactions)
        .where(and(eq(paymentTransactions.status, "completed"), notComp, gte(paymentTransactions.createdAt, monthStart)));

      // 환불: status='refunded' 거래 합계(회계 모듈 refund 정의와 동일). COMP 마커 제외.
      const [refAll] = await db
        .select({ total: sql<number>`COALESCE(SUM(${paymentTransactions.amount}), 0)` })
        .from(paymentTransactions)
        .where(and(eq(paymentTransactions.status, "refunded"), notComp));

      // 회원: 소프트 삭제(deletedAt) 제외 활성 계정 수 / 이번 달 가입 수.
      const [memAll] = await db.select({ c: count() }).from(users).where(isNull(users.deletedAt));
      const [memMonth] = await db
        .select({ c: count() })
        .from(users)
        .where(and(isNull(users.deletedAt), gte(users.createdAt, monthStart)));

      // 사건: 전체 수 / 진행 중(open) 수.
      //   openCaseCount 정의 = 종결 외 활성 상태. status ∈ {recruiting(모집중), filed(소제기), in_progress(진행중)}.
      //   종결로 보는 상태(settled=합의, closed=종결)는 제외. (cases.status 주석 기준)
      const OPEN_STATUSES = ["recruiting", "filed", "in_progress"];
      const [caseAll] = await db.select({ c: count() }).from(cases);
      const [caseOpen] = await db.select({ c: count() }).from(cases).where(inArray(cases.status, OPEN_STATUSES));

      return res.json({
        app: "class-action",
        revenueTotal: Number(revAll?.total || 0),
        revenueThisMonth: Number(revMonth?.total || 0),
        refundTotal: Number(refAll?.total || 0),
        memberCount: Number(memAll?.c || 0),
        newMembersThisMonth: Number(memMonth?.c || 0),
        caseCount: Number(caseAll?.c || 0),
        openCaseCount: Number(caseOpen?.c || 0),
        asOf: new Date().toISOString(),
      });
    } catch (err) {
      console.error("서비스 집계 오류:", err);
      return res.status(500).json({ error: "서버 오류" });
    }
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

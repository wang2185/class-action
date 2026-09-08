// hq.wanghuh.com 포털용 관리 API — 사건요청 심사(승인/반려)·사건 진행·경과 공지(당사자 알림)·
// 사건 패키지(dossier) ZIP 내보내기를 hq에서 직접 처리한다. 세션/CSRF와 완전 분리된 서비스
// 토큰(Bearer) 인증. 개별 세션 라우트(server/routes.ts)의 로직을 그대로 이식 — 담당자 귀속
// (decidedBy)만 req.user 대신 명시적 actorUserId(변호사/직원 계정)로 대체한다.
import { timingSafeEqual } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { eq, and, desc, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import { users, cases, caseRequests, caseUpdates, auditLogs } from "../shared/schema";
import { assembleDossier, buildPackageZip } from "./casePackage";
import { notifyCaseRequester, notifyCaseParties } from "./routes";

function bearerOk(header: string | undefined): boolean {
  const expected = process.env.HQ_SERVICE_TOKEN;
  if (!expected) return false;
  if (!header) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m?.[1]) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireServiceToken(req: Request, res: Response, next: NextFunction): void {
  if (bearerOk(req.headers.authorization)) return void next();
  res.status(401).json({ error: "service_token_required" });
}

const STAFF_ROLES = ["admin", "lawyer", "owner"];

/** actorUserId 가 실제 직원/변호사 계정인지 확인(의뢰인 계정 도용 귀속 방지). */
async function resolveActor(actorUserId: unknown): Promise<number | null> {
  const id = Number(actorUserId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const [u] = await db.select({ id: users.id, role: users.role }).from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt))).limit(1);
  if (!u || !STAFF_ROLES.includes(u.role)) return null;
  return u.id;
}

async function logAudit(actorUserId: number | null, action: string, table?: string, recordId?: number, details?: string) {
  try {
    await db.insert(auditLogs).values({
      userId: actorUserId, action, tableName: table || null,
      recordId: recordId || null, details: details ? `[hq] ${details}` : "[hq]",
      ipAddress: null,
    });
  } catch { /* best-effort */ }
}

const REQUEST_STATUSES = ["new", "reviewing", "accepted", "declined", "converted"];

export function registerServiceAdminRoutes(app: Express): void {
  const r = requireServiceToken;

  app.get("/api/service/admin/case-requests", r, async (req: Request, res: Response) => {
    const status = typeof req.query.status === "string" && REQUEST_STATUSES.includes(req.query.status) ? req.query.status : undefined;
    const rows = await db.select().from(caseRequests)
      .where(status ? eq(caseRequests.status, status) : undefined)
      .orderBy(desc(caseRequests.createdAt));
    res.json(rows);
  });

  app.get("/api/service/admin/case-requests/:id", r, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청" });
    const [row] = await db.select().from(caseRequests).where(eq(caseRequests.id, id)).limit(1);
    if (!row) return res.status(404).json({ error: "요청을 찾을 수 없습니다." });
    res.json(row);
  });

  app.get("/api/service/admin/lawyers", r, async (_req: Request, res: Response) => {
    const rows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users).where(and(inArray(users.role, STAFF_ROLES), isNull(users.deletedAt)));
    res.json(rows);
  });

  app.post("/api/service/admin/case-requests/:id/decision", r, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청" });
    const decision = req.body?.decision;
    if (decision !== "accepted" && decision !== "declined") return res.status(400).json({ error: "decision은 accepted 또는 declined 여야 합니다." });
    const actorUserId = await resolveActor(req.body?.actorUserId);
    if (!actorUserId) return res.status(400).json({ error: "담당 변호사/직원을 선택해 주세요." });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 2000) : null;

    const [before] = await db.select().from(caseRequests).where(eq(caseRequests.id, id)).limit(1);
    if (!before) return res.status(404).json({ error: "요청을 찾을 수 없습니다." });
    if (before.status === "converted") return res.status(409).json({ error: "이미 사건으로 개설된 요청입니다." });

    const [updated] = await db.update(caseRequests).set({
      status: decision, decidedBy: actorUserId, decidedAt: new Date(), decisionReason: reason,
    }).where(and(eq(caseRequests.id, id), eq(caseRequests.status, before.status))).returning();
    if (!updated) {
      const [cur] = await db.select().from(caseRequests).where(eq(caseRequests.id, id)).limit(1);
      return res.json(cur || before);
    }
    await logAudit(actorUserId, "decide_case_request", "case_requests", id, decision);
    if (decision === "accepted" && before.status !== "accepted") {
      notifyCaseRequester(updated, "accepted").catch((e) => console.error("사건요청 신청자 알림 오류(hq):", e));
    }
    res.json(updated);
  });

  app.get("/api/service/admin/cases", r, async (_req: Request, res: Response) => {
    const rows = await db.select().from(cases).orderBy(desc(cases.createdAt));
    res.json(rows);
  });

  app.get("/api/service/admin/cases/:id", r, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청" });
    const [row] = await db.select().from(cases).where(eq(cases.id, id)).limit(1);
    if (!row) return res.status(404).json({ error: "사건을 찾을 수 없습니다." });
    const dossier = await assembleDossier(id, { includeResident: false });
    res.json({ case: row, dossier });
  });

  app.put("/api/service/admin/cases/:id", r, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "잘못된 요청" });
    const body = req.body || {};
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ["title", "summary", "description", "caseType", "defendant", "status", "courtName", "caseNumber"] as const) {
      if (typeof body[k] === "string") patch[k] = body[k];
    }
    if (body.retainerFee !== undefined) patch.retainerFee = parseInt(body.retainerFee, 10);
    if (body.targetCount !== undefined) patch.targetCount = body.targetCount === null ? null : parseInt(body.targetCount, 10);
    if (body.filingDate !== undefined) patch.filingDate = body.filingDate ? new Date(body.filingDate) : null;
    const [updated] = await db.update(cases).set(patch).where(eq(cases.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "사건을 찾을 수 없습니다." });
    res.json(updated);
  });

  app.post("/api/service/admin/cases/:id/updates", r, async (req: Request, res: Response) => {
    const caseId = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(caseId)) return res.status(400).json({ error: "잘못된 요청" });
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!title || !content) return res.status(400).json({ error: "제목과 내용을 입력해 주세요." });
    const [c] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, caseId)).limit(1);
    if (!c) return res.status(404).json({ error: "사건을 찾을 수 없습니다." });

    const wantsNotify = req.body?.notifyParties === true;
    let actorUserId: number | null = null;
    if (wantsNotify) {
      actorUserId = await resolveActor(req.body?.actorUserId);
      if (!actorUserId) return res.status(400).json({ error: "당사자 알림 발송에는 담당 변호사/직원 지정이 필요합니다." });
    }

    const [update] = await db.insert(caseUpdates).values({
      caseId,
      title: title.slice(0, 500),
      content,
      updateType: typeof req.body?.updateType === "string" ? req.body.updateType : "notice",
      isPublic: req.body?.isPublic !== false,
    }).returning();

    let notified = false;
    if (wantsNotify) {
      notified = true;
      await logAudit(actorUserId, "notify_parties", "case_updates", update.id);
      notifyCaseParties(caseId, update).catch((e) => console.error("알림 팬아웃 오류(hq):", e));
    }
    res.status(201).json({ ...update, notified });
  });

  // 사건 패키지(dossier) ZIP 내보내기 — 평문 주민번호 포함(변호사 게이트+감사로그와 동일 수준)
  app.get("/api/service/admin/cases/:id/package/export", r, async (req: Request, res: Response) => {
    const caseId = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(caseId)) return res.status(400).json({ error: "잘못된 요청" });
    try {
      const dossier = await assembleDossier(caseId, { includeResident: true });
      if (!dossier) return res.status(404).json({ error: "사건을 찾을 수 없습니다." });
      const rrnCount =
        dossier.당사자목록.filter((p: any) => p.주민등록번호).length +
        dossier.상대방목록.filter((x: any) => x.주민등록번호 || x.사업자등록번호).length;
      // hq 서비스토큰 경로 — 세션 사용자가 없으므로 행위자를 hq-service 로 명시(누가 반출했는지 추적).
      await logAudit(null, "export_case_package", "cases", caseId, `actor=hq-service via ${req.ip || "?"} · 당사자 ${dossier.당사자목록.length}명/증거 ${dossier.증거총건수}건/주민번호 ${rrnCount}건 복호화`);
      const base = (dossier.사건.사건번호 || dossier.사건.사건명 || `case${caseId}`).replace(/[<>:"/\\|?*\s]/g, "_").slice(0, 60);
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const zipName = `사건_${caseId}_${base}_dossier_${today}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);
      buildPackageZip(dossier, res);
    } catch (err) {
      console.error("패키지 내보내기 오류(hq):", err);
      if (!res.headersSent) res.status(500).json({ error: "서버 오류" });
    }
  });
}

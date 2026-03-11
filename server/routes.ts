import { type Express, type Request, type Response } from "express";
import passport from "passport";
import { db } from "./db";
import {
  users, cases, caseParties, evidence, caseUpdates,
  paymentOrders, provisionalSeizures, paymentSessions, paymentTransactions,
  billingKeys, defendants, defendantDocuments, consents, auditLogs,
} from "../shared/schema";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, hashPassword, loginWithSessionRegeneration } from "./auth";
import { encryptPII, decryptPII } from "./crypto";
import { upload, deleteFile } from "./storage";
import {
  createPaymentSession, validatePaymentCallback,
  requestPaymentApproval, completePayment, generatePaymentFormHTML,
  isNicePayConfigured, isKeyinConfigured,
  registerBillingKey, approveBillingPayment, removeBillingKey,
} from "./nicepay";

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

export function registerRoutes(app: Express) {
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

      req.login(user, (err) => {
        if (err) return res.status(500).json({ error: "로그인 처리 실패" });
        const { password: _, ...safeUser } = user;
        return res.status(201).json(safeUser);
      });
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
      const { consentTypes, version } = req.body;
      // consentTypes: ["privacy_policy", "pii_collection", "third_party_sharing"]
      if (!Array.isArray(consentTypes) || consentTypes.length === 0) {
        return res.status(400).json({ error: "동의 항목이 필요합니다." });
      }
      const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "";
      const ua = req.headers["user-agent"] || "";

      for (const ct of consentTypes) {
        await db.insert(consents).values({
          userId,
          consentType: ct,
          version: version || "1.0",
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
  app.post("/api/cases/:id/join", requireAuth, async (req, res) => {
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
      const { description } = req.body;

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
        returnUrl: `${process.env.CORS_ORIGIN || "https://class.day.lawyer"}/api/nicepay/callback`,
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
        goodsName: `[착수금] ${caseData?.title || "단체소송"}`,
        buyerName: party?.name || "고객",
        buyerTel: party?.phone || "",
        buyerEmail: party?.email || "",
        returnUrl: `${process.env.CORS_ORIGIN || "https://class.day.lawyer"}/api/nicepay/callback`,
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

      await validatePaymentCallback(Moid, Amt, MID, EdiDate, SignData);
      const approvalResult = await requestPaymentApproval(TID, Moid, Amt);

      if (approvalResult.ResultCode === "3001" || approvalResult.ResultCode === "0000") {
        await completePayment(Moid, TID, approvalResult);
        return res.redirect(`/payment/success?orderId=${Moid}`);
      } else {
        return res.redirect(`/payment/fail?orderId=${Moid}&msg=${encodeURIComponent(approvalResult.ResultMsg || "승인 실패")}`);
      }
    } catch (err: any) {
      console.error("결제 콜백 오류:", err);
      return res.redirect(`/payment/fail?msg=${encodeURIComponent(err.message || "오류")}`);
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
        goodsName: goodsName || "[성공보수] 단체소송",
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
      const [update] = await db.insert(caseUpdates).values({
        caseId: parseInt(req.params.id),
        title: req.body.title,
        content: req.body.content,
        updateType: req.body.updateType || "notice",
        isPublic: req.body.isPublic !== "false",
        attachmentPath: req.file?.path || null,
        attachmentName: req.file?.originalname || null,
      }).returning();
      return res.status(201).json(update);
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
  // 외부 서비스 연동 URL
  // ═══════════════════════════════════════════
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

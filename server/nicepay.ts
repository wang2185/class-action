import crypto from "crypto";
import iconv from "iconv-lite";
import { db } from "./db";
import { paymentSessions, paymentTransactions, caseParties } from "../shared/schema";
import { eq } from "drizzle-orm";

const NICEPAY_API_URL = "https://webapi.nicepay.co.kr";
const NICEPAY_WEB_URL = "https://web.nicepay.co.kr";
const SESSION_TTL_MIN = 30;

// ─── 이중 MID 설정 ───
// winslaw00m = 일반결제 (호스팅 결제창, 착수금)
// winslaw01m = 자동결제 (keyin, 성공보수 빌링키)
function getHostedMid(): string {
  return process.env.NICEPAY_MERCHANT_ID || "winslaw00m";
}
function getHostedKey(): string {
  return process.env.NICEPAY_MERCHANT_KEY || "";
}
function getKeyinMid(): string {
  return process.env.NICEPAY_KEYIN_MID || "winslaw01m";
}
function getKeyinKey(): string {
  return process.env.NICEPAY_KEYIN_KEY || "";
}

function isTestMode(mid: string): boolean {
  return mid.startsWith("nictest");
}
function getApiBase(mid: string): string {
  return isTestMode(mid) ? "https://sandbox.nicepay.co.kr" : NICEPAY_API_URL;
}
function getWebBase(mid: string): string {
  return isTestMode(mid) ? "https://sandbox.nicepay.co.kr" : NICEPAY_WEB_URL;
}

function getEdiDate(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function generateSignData(ediDate: string, mid: string, amt: string, merchantKey: string): string {
  const raw = `${ediDate}${mid}${amt}${merchantKey}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function maskCardNumber(cardNum: string): string {
  if (!cardNum || cardNum.length < 10) return cardNum;
  const clean = cardNum.replace(/[^0-9*]/g, "");
  if (clean.length < 10) return clean;
  return clean.substring(0, 6) + "****" + clean.substring(clean.length - 4);
}

// AES-128-ECB 암호화 (keyin용, EUC-KR)
function encryptAES128(plainText: string, merchantKey: string): string {
  const key = Buffer.from(merchantKey.substring(0, 16), "utf8");
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(true);
  const encoded = iconv.encode(plainText, "euc-kr");
  let encrypted = cipher.update(encoded);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted.toString("hex");
}

export function isNicePayConfigured(): boolean {
  return !!process.env.NICEPAY_MERCHANT_ID && !!process.env.NICEPAY_MERCHANT_KEY;
}
export function isKeyinConfigured(): boolean {
  return !!process.env.NICEPAY_KEYIN_MID && !!process.env.NICEPAY_KEYIN_KEY;
}

// ═══════════════════════════════════════════════
// 일반결제 (호스팅 결제창, winslaw00m)
// ═══════════════════════════════════════════════

export async function createPaymentSession(params: {
  caseId: number;
  casePartyId?: number;
  userId: number;
  amount: number;
  paymentType: string;
  metadata?: Record<string, any>;
}) {
  const mid = getHostedMid();
  const merchantKey = getHostedKey();
  const ediDate = getEdiDate();
  const orderId = `CA${params.caseId}_${params.casePartyId || 0}_${Date.now()}`;
  const signData = generateSignData(ediDate, mid, params.amount.toString(), merchantKey);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MIN * 60 * 1000);

  await db.insert(paymentSessions).values({
    orderId,
    caseId: params.caseId,
    casePartyId: params.casePartyId || null,
    userId: params.userId,
    amount: params.amount,
    ediDate,
    signData,
    status: "pending",
    expiresAt,
    paymentType: params.paymentType,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
  });

  return { orderId, amount: params.amount, merchantId: mid, ediDate, signData };
}

export async function validatePaymentCallback(
  orderId: string, amount: string, mid: string, ediDate: string, signData: string
) {
  if (mid !== getHostedMid()) throw new Error("MID 불일치");

  const [session] = await db.select().from(paymentSessions)
    .where(eq(paymentSessions.orderId, orderId)).limit(1);

  if (!session) throw new Error("결제 세션을 찾을 수 없습니다.");
  if (session.status !== "pending") throw new Error("이미 처리된 결제입니다.");
  if (new Date() > session.expiresAt) throw new Error("결제 세션이 만료되었습니다.");
  if (session.amount !== parseInt(amount)) throw new Error("결제 금액 불일치");
  return session;
}

export async function requestPaymentApproval(tid: string, orderId: string, amount: string) {
  const mid = getHostedMid();
  const merchantKey = getHostedKey();
  const ediDate = getEdiDate();
  const signData = generateSignData(ediDate, mid, amount, merchantKey);

  const params = new URLSearchParams({
    TID: tid, MID: mid, Moid: orderId, Amt: amount,
    EdiDate: ediDate, SignData: signData, CharSet: "utf-8",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${getApiBase(mid)}/webapi/pay_process_api.jsp`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: controller.signal,
    });
    const text = await response.text();
    const result: Record<string, string> = {};
    new URLSearchParams(text).forEach((v, k) => { result[k] = v; });
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function completePayment(
  orderId: string, tid: string, approvalResult: Record<string, string>
) {
  const [session] = await db.select().from(paymentSessions)
    .where(eq(paymentSessions.orderId, orderId)).limit(1);
  if (!session) throw new Error("세션을 찾을 수 없습니다.");

  await db.insert(paymentTransactions).values({
    casePartyId: session.casePartyId,
    caseId: session.caseId,
    userId: session.userId,
    orderId, tid,
    amount: session.amount,
    resultCode: approvalResult.ResultCode || "0000",
    resultMsg: approvalResult.ResultMsg || "성공",
    authDate: approvalResult.AuthDate,
    authCode: approvalResult.AuthCode,
    cardCode: approvalResult.CardCode,
    cardName: approvalResult.CardName,
    cardNum: maskCardNumber(approvalResult.CardNo || ""),
    status: "completed",
    paymentType: session.paymentType,
  });

  await db.update(paymentSessions).set({ status: "completed" })
    .where(eq(paymentSessions.orderId, orderId));

  if (session.casePartyId) {
    await db.update(caseParties).set({ paymentStatus: "completed", status: "paid" })
      .where(eq(caseParties.id, session.casePartyId));
  }
  return session;
}

export function generatePaymentFormHTML(params: {
  orderId: string; amount: number; goodsName: string;
  buyerName: string; buyerTel: string; buyerEmail: string;
  returnUrl: string; merchantId: string; ediDate: string; signData: string;
}): string {
  const goodsNameEncoded = iconv.encode(params.goodsName, "euc-kr").toString("binary");
  return `<!DOCTYPE html>
<html>
<head><meta charset="euc-kr"><title>결제 진행중...</title></head>
<body onload="document.getElementById('payForm').submit()">
<p style="text-align:center;margin-top:100px;font-family:sans-serif;">결제 페이지로 이동 중입니다...</p>
<form id="payForm" method="POST" action="${getWebBase(params.merchantId)}/v3/v3Payment.jsp" accept-charset="euc-kr">
  <input type="hidden" name="PayMethod" value="CARD" />
  <input type="hidden" name="GoodsName" value="${goodsNameEncoded}" />
  <input type="hidden" name="Amt" value="${params.amount}" />
  <input type="hidden" name="MID" value="${params.merchantId}" />
  <input type="hidden" name="Moid" value="${params.orderId}" />
  <input type="hidden" name="BuyerName" value="${params.buyerName}" />
  <input type="hidden" name="BuyerTel" value="${params.buyerTel}" />
  <input type="hidden" name="BuyerEmail" value="${params.buyerEmail}" />
  <input type="hidden" name="ReturnURL" value="${params.returnUrl}" />
  <input type="hidden" name="EdiDate" value="${params.ediDate}" />
  <input type="hidden" name="SignData" value="${params.signData}" />
  <input type="hidden" name="CharSet" value="euc-kr" />
  <input type="hidden" name="ReqReserved" value="" />
</form>
</body>
</html>`;
}

// ═══════════════════════════════════════════════
// Keyin 자동결제 (winslaw01m) — 성공보수 빌링키
// ═══════════════════════════════════════════════

// 빌링키 등록
export async function registerBillingKey(params: {
  cardNumber: string;
  expYear: string;
  expMonth: string;
  idNo: string; // 생년월일 6자리 or 사업자번호
  cardPw: string; // 카드 비밀번호 앞 2자리
  buyerName: string;
  buyerEmail: string;
  buyerTel: string;
  moid: string;
}) {
  const mid = getKeyinMid();
  const merchantKey = getKeyinKey();
  const ediDate = getEdiDate();

  const encCardNumber = encryptAES128(params.cardNumber, merchantKey);
  const encExpYear = encryptAES128(params.expYear, merchantKey);
  const encExpMonth = encryptAES128(params.expMonth, merchantKey);
  const encIdNo = encryptAES128(params.idNo, merchantKey);
  const encCardPw = encryptAES128(params.cardPw, merchantKey);
  const signData = generateSignData(ediDate, mid, params.cardNumber, merchantKey);

  const body = new URLSearchParams({
    MID: mid,
    EdiDate: ediDate,
    Moid: params.moid,
    EncCardNumber: encCardNumber,
    EncExpYear: encExpYear,
    EncExpMonth: encExpMonth,
    EncIDNo: encIdNo,
    EncCardPw: encCardPw,
    SignData: signData,
    BuyerName: params.buyerName,
    BuyerEmail: params.buyerEmail,
    BuyerTel: params.buyerTel,
    CharSet: "utf-8",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${getApiBase(mid)}/webapi/billing/billing_regist.jsp`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    const text = await response.text();
    const result: Record<string, string> = {};
    new URLSearchParams(text).forEach((v, k) => { result[k] = v; });
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

// 빌링키로 자동결제 승인
export async function approveBillingPayment(params: {
  bid: string; // 빌링키 (BID)
  amount: number;
  goodsName: string;
  moid: string;
  cardInterest: string; // 무이자 여부 "0" or "1"
}) {
  const mid = getKeyinMid();
  const merchantKey = getKeyinKey();
  const ediDate = getEdiDate();
  const signData = generateSignData(ediDate, mid, params.amount.toString(), merchantKey);

  const goodsNameEncoded = iconv.encode(params.goodsName, "euc-kr").toString("binary");

  const body = new URLSearchParams({
    MID: mid,
    BID: params.bid,
    EdiDate: ediDate,
    Moid: params.moid,
    Amt: params.amount.toString(),
    GoodsName: goodsNameEncoded,
    SignData: signData,
    CardInterest: params.cardInterest || "0",
    CharSet: "utf-8",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${getApiBase(mid)}/webapi/billing/billing_approve.jsp`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    const text = await response.text();
    const result: Record<string, string> = {};
    new URLSearchParams(text).forEach((v, k) => { result[k] = v; });
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

// 빌링키 삭제
export async function removeBillingKey(bid: string) {
  const mid = getKeyinMid();
  const merchantKey = getKeyinKey();
  const ediDate = getEdiDate();
  const signData = generateSignData(ediDate, mid, bid, merchantKey);

  const body = new URLSearchParams({
    MID: mid, BID: bid, EdiDate: ediDate, SignData: signData, CharSet: "utf-8",
  });

  const response = await fetch(`${getApiBase(mid)}/webapi/billing/billkey_remove.jsp`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await response.text();
  const result: Record<string, string> = {};
  new URLSearchParams(text).forEach((v, k) => { result[k] = v; });
  return result;
}

// Keyin 일회성 결제 (카드 정보 직접 입력)
export async function processKeyinPayment(params: {
  cardNumber: string;
  expYear: string;
  expMonth: string;
  idNo: string;
  cardPw: string;
  amount: number;
  goodsName: string;
  buyerName: string;
  buyerEmail: string;
  buyerTel: string;
  moid: string;
}) {
  const mid = getKeyinMid();
  const merchantKey = getKeyinKey();
  const ediDate = getEdiDate();

  const encCardNumber = encryptAES128(params.cardNumber, merchantKey);
  const encExpYear = encryptAES128(params.expYear, merchantKey);
  const encExpMonth = encryptAES128(params.expMonth, merchantKey);
  const encIdNo = encryptAES128(params.idNo, merchantKey);
  const encCardPw = encryptAES128(params.cardPw, merchantKey);
  const signData = generateSignData(ediDate, mid, params.amount.toString(), merchantKey);

  const goodsNameEncoded = iconv.encode(params.goodsName, "euc-kr").toString("binary");

  const body = new URLSearchParams({
    MID: mid,
    EdiDate: ediDate,
    Moid: params.moid,
    Amt: params.amount.toString(),
    EncCardNumber: encCardNumber,
    EncExpYear: encExpYear,
    EncExpMonth: encExpMonth,
    EncIDNo: encIdNo,
    EncCardPw: encCardPw,
    GoodsName: goodsNameEncoded,
    BuyerName: params.buyerName,
    BuyerEmail: params.buyerEmail,
    BuyerTel: params.buyerTel,
    SignData: signData,
    CardInterest: "0",
    CharSet: "utf-8",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${getApiBase(mid)}/webapi/card_keyin.jsp`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    const text = await response.text();
    const result: Record<string, string> = {};
    new URLSearchParams(text).forEach((v, k) => { result[k] = v; });
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

// ═══════════════════════════════════════════════
// 결제 취소 (양쪽 MID 지원)
// ═══════════════════════════════════════════════
export async function cancelPayment(
  tid: string, orderId: string, amount: number, reason: string,
  useKeyin: boolean = false
) {
  const mid = useKeyin ? getKeyinMid() : getHostedMid();
  const merchantKey = useKeyin ? getKeyinKey() : getHostedKey();
  const ediDate = getEdiDate();
  const signData = generateSignData(ediDate, mid, amount.toString(), merchantKey);

  const params = new URLSearchParams({
    TID: tid, MID: mid, Moid: orderId,
    CancelAmt: amount.toString(), CancelMsg: reason,
    PartialCancelCode: "0",
    EdiDate: ediDate, SignData: signData, CharSet: "utf-8",
  });
  if (process.env.NICEPAY_CANCEL_PASSWORD) {
    params.set("CancelPwd", process.env.NICEPAY_CANCEL_PASSWORD);
  }

  const response = await fetch(`${getApiBase(mid)}/webapi/cancel_process.jsp`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const text = await response.text();
  const result: Record<string, string> = {};
  new URLSearchParams(text).forEach((v, k) => { result[k] = v; });

  if (result.ResultCode === "2001") {
    await db.update(paymentTransactions).set({ status: "cancelled" })
      .where(eq(paymentTransactions.tid, tid));
    await db.update(paymentSessions).set({ status: "cancelled" as any })
      .where(eq(paymentSessions.orderId, orderId));
  }
  return result;
}

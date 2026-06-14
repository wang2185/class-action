// 공용 메시징 코어 — ⑤ 결제링크 발송 + ⑥ 소송개시 자동알림이 함께 사용.
// 채널: 알리고 SMS + Amazon SES 이메일(nodemailer) + 카카오 알림톡(알리고, Stage B).
// 모든 발송은 notifications 테이블에 기록(감사·멱등). 거래성 통지라 마케팅 동의와 무관하게 발송.
import nodemailer from "nodemailer";
import { db } from "./db";
import { notifications } from "../shared/schema";
import { and, eq } from "drizzle-orm";

const ALIGO_SEND_URL = "https://apis.aligo.in/send/";
const ALIGO_ALIMTALK_URL = "https://kakaoapi.aligo.in/akv10/alimtalk/send/";

export function isSmsConfigured(): boolean {
  return !!(process.env.ALIGO_API_KEY && process.env.ALIGO_USER_ID && process.env.ALIGO_SENDER);
}
function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}
// M365(Microsoft Graph) 앱 단독 메일발송 — winslaw.co.kr 테넌트 메일함에서 발송.
// ⚠ Azure AD에서 앱에 Mail.Send(애플리케이션) 권한 + 관리자 동의가 있어야 동작(없으면 403).
export function isM365Configured(): boolean {
  return !!(process.env.M365_TENANT_ID && process.env.M365_CLIENT_ID && process.env.M365_CLIENT_SECRET && process.env.M365_MAIL_SENDER);
}
export function isEmailConfigured(): boolean {
  return isSmtpConfigured() || isM365Configured();
}
export function isAlimtalkConfigured(): boolean {
  return !!(process.env.ALIGO_KAKAO_SENDER_KEY && process.env.ALIGO_API_KEY && process.env.ALIGO_USER_ID);
}
// 개발 중(키 없음) 또는 NOTIFY_DRY_RUN=1 이면 실제 발송 대신 콘솔 출력
function isDryRun(): boolean {
  if (process.env.NOTIFY_DRY_RUN === "1") return true;
  return process.env.NODE_ENV !== "production" && !isSmsConfigured() && !isEmailConfigured();
}

type Channel = "sms" | "email" | "alimtalk";
export type NotifyCtx = {
  caseId?: number; casePartyId?: number; caseUpdateId?: number; paymentLinkId?: number;
  templateKey: string; dedupeKey?: string;
};
export type NotifyResult = { ok: boolean; status: "sent" | "failed" | "skipped"; providerMsgId?: string; error?: string };

function normalizePhone(p?: string | null): string {
  return (p || "").replace(/[^0-9]/g, "");
}

async function record(channel: Channel, recipient: string, ctx: NotifyCtx, status: NotifyResult["status"], providerMsgId?: string, error?: string) {
  try {
    await db.insert(notifications).values({
      channel, recipient, templateKey: ctx.templateKey, status,
      providerMsgId: providerMsgId || null, error: error || null,
      caseId: ctx.caseId ?? null, casePartyId: ctx.casePartyId ?? null,
      caseUpdateId: ctx.caseUpdateId ?? null, paymentLinkId: ctx.paymentLinkId ?? null,
      dedupeKey: ctx.dedupeKey ?? null,
    });
  } catch (e) {
    console.error("notification 로깅 실패:", e);
  }
}

// 같은 dedupeKey 로 이미 sent 면 멱등 skip
async function alreadySent(dedupeKey?: string): Promise<boolean> {
  if (!dedupeKey) return false;
  try {
    const [row] = await db.select().from(notifications)
      .where(and(eq(notifications.dedupeKey, dedupeKey), eq(notifications.status, "sent"))).limit(1);
    return !!row;
  } catch {
    return false;
  }
}

// 채널별 dedupeKey(중복 방지 키에 채널 suffix)
function channelKey(ctx: NotifyCtx, channel: Channel): NotifyCtx {
  return ctx.dedupeKey ? { ...ctx, dedupeKey: `${ctx.dedupeKey}:${channel}` } : ctx;
}

export async function sendSMS(to: string, text: string, ctxIn: NotifyCtx): Promise<NotifyResult> {
  const ctx = channelKey(ctxIn, "sms");
  const phone = normalizePhone(to);
  if (!phone) { await record("sms", to || "", ctx, "skipped", undefined, "전화번호 없음"); return { ok: false, status: "skipped" }; }
  if (await alreadySent(ctx.dedupeKey)) return { ok: true, status: "sent" };
  if (isDryRun()) {
    console.log(`[notify:dry] SMS → ${phone}: ${text.slice(0, 50)}`);
    await record("sms", phone, { ...ctx, dedupeKey: undefined }, "sent", "DRYRUN"); // dry는 멱등 차단 안 함
    return { ok: true, status: "sent", providerMsgId: "DRYRUN" };
  }
  if (!isSmsConfigured()) {
    await record("sms", phone, ctx, "skipped", undefined, "SMS 미설정");
    return { ok: false, status: "skipped" };
  }
  try {
    const params = new URLSearchParams({
      key: process.env.ALIGO_API_KEY!, user_id: process.env.ALIGO_USER_ID!, sender: process.env.ALIGO_SENDER!,
      receiver: phone, msg: text,
    });
    if (process.env.NODE_ENV !== "production") params.set("testmode_yn", "Y");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(ALIGO_SEND_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params, signal: controller.signal,
    });
    clearTimeout(timer);
    const json: any = await res.json();
    if (String(json.result_code) === "1") {
      await record("sms", phone, ctx, "sent", String(json.msg_id || ""));
      return { ok: true, status: "sent", providerMsgId: String(json.msg_id || "") };
    }
    if (String(json.result_code) === "-101") {
      console.error("⚠ Aligo -101: 서버 송신 IP를 알리고 화이트리스트에 등록해야 합니다(배포 서버 IP).");
    }
    const err = `Aligo ${json.result_code}: ${json.message}`;
    await record("sms", phone, ctx, "failed", undefined, err);
    return { ok: false, status: "failed", error: err };
  } catch (e: any) {
    await record("sms", phone, ctx, "failed", undefined, e?.message || String(e));
    return { ok: false, status: "failed", error: e?.message };
  }
}

let transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: false,
      requireTLS: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

// M365 토큰 캐시(client credentials). 만료 60초 전까지 재사용.
let m365Token: { value: string; exp: number } | null = null;
async function getM365Token(nowMs: number): Promise<string> {
  if (m365Token && m365Token.exp > nowMs + 60_000) return m365Token.value;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let j: any;
  try {
    const res = await fetch(`https://login.microsoftonline.com/${process.env.M365_TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.M365_CLIENT_ID!, client_secret: process.env.M365_CLIENT_SECRET!,
        scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
      }),
      signal: controller.signal,
    });
    j = await res.json().catch(() => ({}));
    if (!j.access_token) throw new Error(`M365 토큰 실패: ${j.error_description || j.error || res.status}`);
  } finally {
    clearTimeout(timer);
  }
  m365Token = { value: j.access_token, exp: nowMs + Number(j.expires_in || 3600) * 1000 };
  return m365Token.value;
}
// Graph 앱 단독 발송. 성공 시 202(본문 없음).
async function sendEmailM365(to: string, subject: string, html: string): Promise<string> {
  const token = await getM365Token(Date.now());
  const sender = encodeURIComponent(process.env.M365_MAIL_SENDER!);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${sender}/sendMail`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }),
      signal: controller.signal,
    });
    if (res.status !== 202) {
      const t = await res.text().catch(() => "");
      throw new Error(`Graph ${res.status}: ${t.slice(0, 200)}`);
    }
    return `M365:${process.env.M365_MAIL_SENDER}`;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendEmail(to: string, subject: string, html: string, ctxIn: NotifyCtx): Promise<NotifyResult> {
  const ctx = channelKey(ctxIn, "email");
  if (!to) { await record("email", "", ctx, "skipped", undefined, "이메일 없음"); return { ok: false, status: "skipped" }; }
  if (await alreadySent(ctx.dedupeKey)) return { ok: true, status: "sent" };
  if (isDryRun() || !isEmailConfigured()) {
    if (isDryRun()) {
      console.log(`[notify:dry] EMAIL → ${to}: ${subject}`);
      await record("email", to, { ...ctx, dedupeKey: undefined }, "sent", "DRYRUN"); // dry는 멱등 차단 안 함
      return { ok: true, status: "sent", providerMsgId: "DRYRUN" };
    }
    await record("email", to, ctx, "skipped", undefined, "SMTP 미설정");
    return { ok: false, status: "skipped" };
  }
  try {
    let providerMsgId: string;
    if (isM365Configured()) {
      providerMsgId = await sendEmailM365(to, subject, html); // M365 우선
    } else {
      const info = await getTransporter().sendMail({ from: process.env.SMTP_FROM || "notice@day.lawyer", to, subject, html });
      providerMsgId = info.messageId;
    }
    await record("email", to, ctx, "sent", providerMsgId);
    return { ok: true, status: "sent", providerMsgId };
  } catch (e: any) {
    await record("email", to, ctx, "failed", undefined, e?.message || String(e));
    return { ok: false, status: "failed", error: e?.message };
  }
}

// 카카오 알림톡 (Stage B: 발신프로필 senderkey + 사전심사 tpl_code 확보 후 활성).
// 미설정이면 skipped → notifyParty 가 SMS 로 폴백.
export async function sendAlimtalk(to: string, templateCode: string, message: string, ctxIn: NotifyCtx): Promise<NotifyResult> {
  const ctx = channelKey(ctxIn, "alimtalk");
  const phone = normalizePhone(to);
  if (!phone) { await record("alimtalk", to || "", ctx, "skipped", undefined, "전화번호 없음"); return { ok: false, status: "skipped" }; }
  if (!isAlimtalkConfigured() || !templateCode) return { ok: false, status: "skipped", error: "알림톡 미설정" };
  if (await alreadySent(ctx.dedupeKey)) return { ok: true, status: "sent" };
  if (isDryRun()) {
    console.log(`[notify:dry] ALIMTALK(${templateCode}) → ${phone}: ${message.slice(0, 50)}`);
    await record("alimtalk", phone, { ...ctx, dedupeKey: undefined }, "sent", "DRYRUN"); // dry는 멱등 차단 안 함
    return { ok: true, status: "sent", providerMsgId: "DRYRUN" };
  }
  try {
    const params = new URLSearchParams({
      apikey: process.env.ALIGO_API_KEY!, userid: process.env.ALIGO_USER_ID!,
      senderkey: process.env.ALIGO_KAKAO_SENDER_KEY!, tpl_code: templateCode,
      sender: process.env.ALIGO_SENDER || "", receiver_1: phone, subject_1: "알림", message_1: message,
      // 실패 시 SMS 대체발송
      failover: "Y", fsubject_1: "알림", fmessage_1: message,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(ALIGO_ALIMTALK_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params, signal: controller.signal,
    });
    clearTimeout(timer);
    const json: any = await res.json();
    if (String(json.code) === "0" || String(json.result_code) === "1") {
      await record("alimtalk", phone, ctx, "sent", String(json.info?.mid || json.msg_id || ""));
      return { ok: true, status: "sent" };
    }
    const err = `Alimtalk ${json.code ?? json.result_code}: ${json.message}`;
    await record("alimtalk", phone, ctx, "failed", undefined, err);
    return { ok: false, status: "failed", error: err };
  } catch (e: any) {
    await record("alimtalk", phone, ctx, "failed", undefined, e?.message || String(e));
    return { ok: false, status: "failed", error: e?.message };
  }
}

export type PartyMsg = {
  templateKey: string;
  smsText: string;
  emailSubject: string;
  emailHtml: string;
  alimtalkCode?: string;
  alimtalkMessage?: string;
};

// 한 당사자에게 가용 채널로 발송(전화=알림톡→실패시 SMS, Stage A는 SMS / 이메일). 멱등.
export async function notifyParty(
  party: { id: number; phone?: string | null; email?: string | null; name: string },
  msg: PartyMsg,
  ctx: { caseId: number; caseUpdateId?: number; paymentLinkId?: number },
): Promise<void> {
  const scope = ctx.caseUpdateId ? `u${ctx.caseUpdateId}` : ctx.paymentLinkId ? `pl${ctx.paymentLinkId}` : `c${ctx.caseId}`;
  const baseKey = `${msg.templateKey}:${scope}:p${party.id}`;
  const common: NotifyCtx = {
    caseId: ctx.caseId, casePartyId: party.id, caseUpdateId: ctx.caseUpdateId,
    paymentLinkId: ctx.paymentLinkId, templateKey: msg.templateKey, dedupeKey: baseKey,
  };

  if (party.phone) {
    let done = false;
    if (isAlimtalkConfigured() && msg.alimtalkCode && msg.alimtalkMessage) {
      const r = await sendAlimtalk(party.phone, msg.alimtalkCode, msg.alimtalkMessage, common);
      done = r.ok;
    }
    if (!done) await sendSMS(party.phone, msg.smsText, common);
  } else {
    await record("sms", "", channelKey(common, "sms"), "skipped", undefined, "전화번호 없음");
  }

  if (party.email) await sendEmail(party.email, msg.emailSubject, msg.emailHtml, common);
}

// 동시성 제한 매핑(대량 팬아웃용 — ⑥에서 사용)
export async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

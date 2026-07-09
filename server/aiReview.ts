// 사건요청 AI 초기검토 — 변호사의 수임 심사를 돕는 예비 검토(확정 자문 아님).
// Gemini↔Anthropic 상호 폴백: 우선 provider 실패(크레딧·5xx·rate limit·타임아웃) 시 다른 provider로.
// SDK 의존성 없이 Node 내장 fetch로 직접 호출. Gemini=responseSchema, Anthropic=tool_use 로 구조화 JSON 강제.
import type { CaseRequest } from "../shared/schema";

export class AiReviewError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export type AiReviewResult = {
  caseType: string; // 사건 유형(손해배상·부당이득·전세사기 등)
  viability: "high" | "medium" | "low"; // 청구 인용 가능성(개략)
  recommendation: "recommend" | "caution" | "unfit"; // 수임 권고
  summary: string; // 2~3문장 핵심 요약
  keyIssues: string[]; // 주요 법적 쟁점
  cautions: string[]; // 관할·시효·입증 등 유의점
  rationale: string; // 권고 근거
};

// Gemini responseSchema (OpenAPI subset; Type enum은 대문자)
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    caseType: { type: "STRING", description: "사건 유형(예: 손해배상, 부당이득반환, 전세보증금 반환, 분양대금 반환)" },
    viability: { type: "STRING", enum: ["high", "medium", "low"], description: "청구 인용 가능성 개략(단정 아님)" },
    recommendation: { type: "STRING", enum: ["recommend", "caution", "unfit"], description: "수임 권고: recommend(적합)/caution(신중)/unfit(부적합)" },
    summary: { type: "STRING", description: "사건 핵심 2~3문장 요약" },
    keyIssues: { type: "ARRAY", items: { type: "STRING" }, description: "주요 법적 쟁점 3~6개" },
    cautions: { type: "ARRAY", items: { type: "STRING" }, description: "관할·소멸시효·입증 난이도 등 유의점" },
    rationale: { type: "STRING", description: "권고 근거(간결히)" },
  },
  required: ["caseType", "viability", "recommendation", "summary", "keyIssues", "cautions", "rationale"],
  propertyOrdering: ["caseType", "viability", "recommendation", "summary", "keyIssues", "cautions", "rationale"],
};

// Anthropic tool (동일 스키마; input_schema는 소문자 JSON Schema)
const ANTHROPIC_TOOL = {
  name: "submit_review",
  description: "사건요청 초기검토 결과를 구조화하여 제출한다.",
  input_schema: {
    type: "object",
    properties: {
      caseType: { type: "string" },
      viability: { type: "string", enum: ["high", "medium", "low"] },
      recommendation: { type: "string", enum: ["recommend", "caution", "unfit"] },
      summary: { type: "string" },
      keyIssues: { type: "array", items: { type: "string" } },
      cautions: { type: "array", items: { type: "string" } },
      rationale: { type: "string" },
    },
    required: ["caseType", "viability", "recommendation", "summary", "keyIssues", "cautions", "rationale"],
  },
};

const SYSTEM = [
  "당신은 대한민국 민사 집단·공동소송 사건요청을 초기 검토하는 법률 어시스턴트다.",
  "이것은 확정적 법률자문이 아니라, 변호사의 수임 심사를 돕는 '예비 초기검토'다.",
  "다음 원칙을 지켜라:",
  "- 승소·인용을 보장하거나 단정하지 말 것(변호사광고규정 준수). 가능성·유의점 중심으로 서술.",
  "- 제공된 정보만으로 판단하고, 추가 확인이 필요한 사항은 cautions에 명시.",
  "- 관할·소멸시효·당사자적격·입증 난이도 등 실무 쟁점을 짚을 것.",
  "- 모든 출력은 한국어. 지정된 스키마로만 답한다.",
].join("\n");

function buildUserContent(r: CaseRequest): string {
  const struct: Record<string, string> = {
    many_plaintiffs: "다수 피해자(공동·집단 원고)",
    many_defendants: "다수 상대방(일괄 청구)",
    other: "기타·미정",
  };
  return [
    `제목: ${r.title || "-"}`,
    `피해 유형(신청자 분류): ${r.category || "-"}`,
    `상대방: ${r.opponent || "-"}`,
    `사건 구조: ${r.caseStructure ? struct[r.caseStructure] || r.caseStructure : "-"}`,
    `예상 피해자 규모: ${r.headcount || "-"}`,
    `예상 상대방 수: ${r.opponentCount || "-"}`,
    `예상 피해 금액: ${r.damageScale || "-"}`,
    "",
    "피해 내용:",
    (r.content || "").slice(0, 6000),
  ].join("\n");
}

// provider 무관 방어적 정규화
function normalize(input: any): AiReviewResult {
  if (!input || typeof input !== "object") throw new AiReviewError("AI 검토 응답이 비어 있습니다.", 502);
  return {
    caseType: String(input.caseType || "미분류"),
    viability: ["high", "medium", "low"].includes(input.viability) ? input.viability : "medium",
    recommendation: ["recommend", "caution", "unfit"].includes(input.recommendation) ? input.recommendation : "caution",
    summary: String(input.summary || ""),
    keyIssues: Array.isArray(input.keyIssues) ? input.keyIssues.map(String).slice(0, 10) : [],
    cautions: Array.isArray(input.cautions) ? input.cautions.map(String).slice(0, 10) : [],
    rationale: String(input.rationale || ""),
  };
}

// ── Gemini(Generative Language API) 백엔드 ──
async function runViaGemini(request: CaseRequest): Promise<AiReviewResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiReviewError("GEMINI_API_KEY 미설정", 503);
  const model = process.env.AI_REVIEW_MODEL || "gemini-flash-latest";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: buildUserContent(request) }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.3, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e: any) {
    throw new AiReviewError(`Gemini 요청 실패: ${e?.message || "network"}`, 502);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AiReviewError(`Gemini 오류(${res.status}): ${body.slice(0, 300)}`, 502);
  }
  const data: any = await res.json().catch(() => null);
  const cand = data?.candidates?.[0];
  if (cand?.finishReason && cand.finishReason !== "STOP" && cand.finishReason !== "MAX_TOKENS") {
    throw new AiReviewError(`Gemini 검토가 중단되었습니다(${cand.finishReason}).`, 502);
  }
  const text = cand?.content?.parts?.map((p: any) => p?.text || "").join("") || "";
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiReviewError("Gemini 검토 응답을 해석할 수 없습니다.", 502);
  }
  return normalize(parsed);
}

// ── Anthropic(Claude) 백엔드 — tool_use 강제 ──
async function runViaAnthropic(request: CaseRequest): Promise<AiReviewResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiReviewError("ANTHROPIC_API_KEY 미설정", 503);
  const model = process.env.AI_REVIEW_ANTHROPIC_MODEL || "claude-sonnet-5";

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: SYSTEM,
        tools: [ANTHROPIC_TOOL],
        tool_choice: { type: "tool", name: "submit_review" },
        messages: [{ role: "user", content: buildUserContent(request) }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e: any) {
    throw new AiReviewError(`Anthropic 요청 실패: ${e?.message || "network"}`, 502);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AiReviewError(`Anthropic 오류(${res.status}): ${body.slice(0, 300)}`, 502);
  }
  const data: any = await res.json().catch(() => null);
  const block = data?.content?.find((b: any) => b.type === "tool_use" && b.name === "submit_review");
  if (!block?.input) throw new AiReviewError("Anthropic 검토 응답을 해석할 수 없습니다.", 502);
  return normalize(block.input);
}

/**
 * 사건요청 AI 초기검토 — Gemini 우선 → Anthropic 폴백(둘 다 설정 시).
 * 설정된 키가 있는 provider만 순서대로 시도, 모두 실패해야 오류. 키가 하나도 없으면 503(미설정).
 */
export async function runAiReview(request: CaseRequest): Promise<AiReviewResult> {
  const order: ("gemini" | "anthropic")[] = [];
  if (process.env.GEMINI_API_KEY) order.push("gemini");
  if (process.env.ANTHROPIC_API_KEY) order.push("anthropic");
  if (order.length === 0) {
    throw new AiReviewError("AI 검토가 설정되지 않았습니다(GEMINI_API_KEY·ANTHROPIC_API_KEY 미설정).", 503);
  }

  const errors: string[] = [];
  for (const p of order) {
    try {
      const out = p === "gemini" ? await runViaGemini(request) : await runViaAnthropic(request);
      if (errors.length) console.warn(`[aiReview] ${errors.join(" | ")} → ${p} 폴백 성공`);
      return out;
    } catch (e: any) {
      errors.push(`${p}: ${e?.message || e}`);
    }
  }
  throw new AiReviewError(`AI 검토 실패(모든 provider) — ${errors.join(" | ")}`, 502);
}

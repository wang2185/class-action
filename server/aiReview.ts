// 사건요청 AI 초기검토 — 변호사의 수임 심사를 돕는 예비 검토(확정 자문 아님).
// Google Gemini(Generative Language API)를 Node 내장 fetch로 직접 호출(SDK 의존성 없음).
// responseSchema(구조화 JSON 강제)로 결과를 받는다.
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

const SYSTEM = [
  "당신은 대한민국 민사 집단·공동소송 사건요청을 초기 검토하는 법률 어시스턴트다.",
  "이것은 확정적 법률자문이 아니라, 변호사의 수임 심사를 돕는 '예비 초기검토'다.",
  "다음 원칙을 지켜라:",
  "- 승소·인용을 보장하거나 단정하지 말 것(변호사광고규정 준수). 가능성·유의점 중심으로 서술.",
  "- 제공된 정보만으로 판단하고, 추가 확인이 필요한 사항은 cautions에 명시.",
  "- 관할·소멸시효·당사자적격·입증 난이도 등 실무 쟁점을 짚을 것.",
  "- 모든 출력은 한국어. 지정된 JSON 스키마로만 답한다.",
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

export async function runAiReview(request: CaseRequest): Promise<AiReviewResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiReviewError("AI 검토가 설정되지 않았습니다(GEMINI_API_KEY 미설정).", 503);

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
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.3,
          maxOutputTokens: 2048,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e: any) {
    throw new AiReviewError(`AI 검토 요청 실패: ${e?.message || "network"}`, 502);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // API 키 등 민감정보 유출 방지 위해 길이 제한
    throw new AiReviewError(`AI 검토 오류(${res.status}): ${body.slice(0, 300)}`, 502);
  }

  const data: any = await res.json().catch(() => null);
  const cand = data?.candidates?.[0];
  if (cand?.finishReason && cand.finishReason !== "STOP" && cand.finishReason !== "MAX_TOKENS") {
    throw new AiReviewError(`AI 검토가 중단되었습니다(${cand.finishReason}).`, 502);
  }
  const text = cand?.content?.parts?.map((p: any) => p?.text || "").join("") || "";
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiReviewError("AI 검토 응답을 해석할 수 없습니다.", 502);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new AiReviewError("AI 검토 응답이 비어 있습니다.", 502);
  }

  // 방어적 정규화
  return {
    caseType: String(parsed.caseType || "미분류"),
    viability: ["high", "medium", "low"].includes(parsed.viability) ? parsed.viability : "medium",
    recommendation: ["recommend", "caution", "unfit"].includes(parsed.recommendation) ? parsed.recommendation : "caution",
    summary: String(parsed.summary || ""),
    keyIssues: Array.isArray(parsed.keyIssues) ? parsed.keyIssues.map(String).slice(0, 10) : [],
    cautions: Array.isArray(parsed.cautions) ? parsed.cautions.map(String).slice(0, 10) : [],
    rationale: String(parsed.rationale || ""),
  };
}

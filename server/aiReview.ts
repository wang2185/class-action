// 사건요청 AI 초기검토 — 변호사의 수임 심사를 돕는 예비 검토(확정 자문 아님).
// Anthropic Messages API를 Node 내장 fetch로 직접 호출(SDK 의존성 없음). tool-use로 구조화 출력 강제.
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

const REVIEW_TOOL = {
  name: "submit_review",
  description: "사건요청 초기검토 결과를 구조화하여 제출한다.",
  input_schema: {
    type: "object",
    properties: {
      caseType: { type: "string", description: "사건 유형(예: 손해배상, 부당이득반환, 전세보증금 반환, 분양대금 반환 등)" },
      viability: { type: "string", enum: ["high", "medium", "low"], description: "청구 인용 가능성 개략(단정 아님)" },
      recommendation: { type: "string", enum: ["recommend", "caution", "unfit"], description: "수임 권고: recommend(적합)·caution(신중)·unfit(부적합)" },
      summary: { type: "string", description: "사건 핵심 2~3문장 요약" },
      keyIssues: { type: "array", items: { type: "string" }, description: "주요 법적 쟁점 3~6개" },
      cautions: { type: "array", items: { type: "string" }, description: "관할·소멸시효·입증 난이도 등 유의점" },
      rationale: { type: "string", description: "권고 근거(간결히)" },
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
  "- 모든 출력은 한국어. 반드시 submit_review 도구로만 답한다.",
].join("\n");

function buildUserContent(r: CaseRequest): string {
  const struct: Record<string, string> = {
    many_plaintiffs: "다수 피해자(공동·집단 원고)",
    many_defendants: "다수 상대방(일괄 청구)",
    other: "기타·미정",
  };
  const lines = [
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
  ];
  return lines.join("\n");
}

export async function runAiReview(request: CaseRequest): Promise<AiReviewResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiReviewError("AI 검토가 설정되지 않았습니다(ANTHROPIC_API_KEY 미설정).", 503);

  const model = process.env.AI_REVIEW_MODEL || "claude-sonnet-5";
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: SYSTEM,
        tools: [REVIEW_TOOL],
        tool_choice: { type: "tool", name: "submit_review" },
        messages: [{ role: "user", content: buildUserContent(request) }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e: any) {
    throw new AiReviewError(`AI 검토 요청 실패: ${e?.message || "network"}`, 502);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AiReviewError(`AI 검토 오류(${res.status}): ${body.slice(0, 300)}`, 502);
  }

  const data: any = await res.json().catch(() => null);
  const block = data?.content?.find((b: any) => b.type === "tool_use" && b.name === "submit_review");
  const input = block?.input;
  if (!input || typeof input !== "object") {
    throw new AiReviewError("AI 검토 응답을 해석할 수 없습니다.", 502);
  }

  // 방어적 정규화
  const norm: AiReviewResult = {
    caseType: String(input.caseType || "미분류"),
    viability: ["high", "medium", "low"].includes(input.viability) ? input.viability : "medium",
    recommendation: ["recommend", "caution", "unfit"].includes(input.recommendation) ? input.recommendation : "caution",
    summary: String(input.summary || ""),
    keyIssues: Array.isArray(input.keyIssues) ? input.keyIssues.map(String).slice(0, 10) : [],
    cautions: Array.isArray(input.cautions) ? input.cautions.map(String).slice(0, 10) : [],
    rationale: String(input.rationale || ""),
  };
  return norm;
}

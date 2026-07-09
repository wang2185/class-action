import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "신규", cls: "bg-accent-100 text-accent-700" },
  reviewing: { label: "검토중", cls: "bg-amber-100 text-amber-700" },
  accepted: { label: "채택", cls: "bg-primary-100 text-primary-700" },
  declined: { label: "반려", cls: "bg-gray-100 text-gray-600" },
  converted: { label: "개설완료", cls: "bg-green-100 text-green-700" },
};
const STATUS_KEYS = ["new", "reviewing", "accepted", "declined", "converted"];
const STRUCTURE: Record<string, string> = {
  many_plaintiffs: "다수 피해자(공동·집단)",
  many_defendants: "다수 상대방(일괄 청구)",
  other: "기타·미정",
};

// AI 초기검토 표시 매핑
const REC: Record<string, { label: string; cls: string }> = {
  recommend: { label: "수임 적합", cls: "bg-green-100 text-green-700" },
  caution: { label: "신중 검토", cls: "bg-amber-100 text-amber-700" },
  unfit: { label: "부적합", cls: "bg-rose-100 text-rose-700" },
};
const VIABILITY: Record<string, string> = { high: "높음", medium: "보통", low: "낮음" };

function fmtDate(s: string) {
  try { return new Date(s).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return s; }
}

function AiReviewPanel({ r }: { r: any }) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const review = (() => { try { return r.aiReview ? JSON.parse(r.aiReview) : null; } catch { return null; } })();

  const mut = useMutation({
    mutationFn: () => apiRequest(`/api/admin/case-requests/${r.id}/ai-review`, { method: "POST" }),
    onMutate: () => setErr(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["caseRequests"] }),
    onError: (e: any) => setErr(e?.message || "AI 검토에 실패했습니다."),
  });

  const rec = review?.recommendation ? REC[review.recommendation] : null;

  return (
    <div className="rounded-lg border border-primary-100 bg-primary-50/30 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink">AI 초기검토</span>
          {rec && <span className={`badge ${rec.cls}`}>{rec.label}</span>}
          {review?.viability && <span className="text-xs text-gray-500">인용 가능성 {VIABILITY[review.viability] || review.viability}</span>}
        </div>
        <button onClick={() => mut.mutate()} disabled={mut.isPending}
          className="btn-secondary text-xs disabled:opacity-50">
          {mut.isPending ? "검토 중…" : review ? "다시 검토" : "AI 초기검토 실행"}
        </button>
      </div>

      {err && <p className="text-xs text-red-600 mb-2">{err}</p>}

      {!review && !mut.isPending && !err && (
        <p className="text-xs text-gray-400">아직 검토하지 않았습니다. ‘AI 초기검토 실행’을 눌러 사건 유형·쟁점·수임 권고를 확인하세요. <span className="text-gray-400">(예비 검토이며 확정 자문이 아닙니다)</span></p>
      )}

      {review && (
        <div className="space-y-2 text-sm">
          <p className="text-gray-700"><span className="text-gray-500">유형:</span> {review.caseType}</p>
          {review.summary && <p className="text-gray-700">{review.summary}</p>}
          {Array.isArray(review.keyIssues) && review.keyIssues.length > 0 && (
            <div>
              <p className="text-gray-500 text-xs mb-1">주요 쟁점</p>
              <ul className="list-disc list-inside space-y-0.5 text-gray-700">
                {review.keyIssues.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {Array.isArray(review.cautions) && review.cautions.length > 0 && (
            <div>
              <p className="text-gray-500 text-xs mb-1">유의점</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                {review.cautions.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {review.rationale && <p className="text-xs text-gray-500">권고 근거: {review.rationale}</p>}
          {r.aiReviewedAt && <p className="text-[11px] text-gray-400">검토 {fmtDate(r.aiReviewedAt)} · AI 예비검토(확정 자문 아님)</p>}
        </div>
      )}
    </div>
  );
}

function DecisionPanel({ r }: { r: any }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (decision: "accepted" | "declined") =>
      apiRequest(`/api/admin/case-requests/${r.id}/decision`, { method: "POST", body: JSON.stringify({ decision, reason }) }),
    onMutate: () => setErr(null),
    onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: ["caseRequests"] }); },
    onError: (e: any) => setErr(e?.message || "결정 저장에 실패했습니다."),
  });

  const decided = r.status === "accepted" || r.status === "declined";
  const converted = r.status === "converted";

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-bold text-ink">수임 심사</span>
        {decided && <span className={`badge ${STATUS[r.status].cls}`}>{r.status === "accepted" ? "수임 승인" : "반려"}</span>}
        {converted && <span className="badge bg-green-100 text-green-700">개설완료</span>}
      </div>

      {(decided || converted) && r.decidedAt && (
        <p className="text-xs text-gray-400 mb-2">
          결정 {fmtDate(r.decidedAt)}{r.decisionReason ? ` · ${r.decisionReason}` : ""}
        </p>
      )}

      {err && <p className="text-xs text-red-600 mb-2">{err}</p>}

      {converted ? (
        <p className="text-xs text-green-700">이미 사건으로 개설된 요청입니다.</p>
      ) : (
        <>
          {open && (
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유(선택) — 신청자 안내·내부 기록용"
              className="input min-h-[56px] text-sm mb-2" />
          )}
          <div className="flex items-center gap-2">
            {!open ? (
              <button onClick={() => setOpen(true)} className="btn-secondary text-xs">{decided ? "결정 변경" : "수임 심사하기"}</button>
            ) : (
              <>
                <button onClick={() => mut.mutate("accepted")} disabled={mut.isPending} className="btn-primary text-xs disabled:opacity-50">수임 승인</button>
                <button onClick={() => mut.mutate("declined")} disabled={mut.isPending} className="btn-danger text-xs disabled:opacity-50">반려</button>
                <button onClick={() => { setOpen(false); setErr(null); }} className="text-xs text-gray-500 hover:underline">취소</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RequestCard({ r }: { r: any }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(r.adminNote || "");

  const mut = useMutation({
    mutationFn: (patch: any) => apiRequest(`/api/admin/case-requests/${r.id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["caseRequests"] }),
  });
  const delMut = useMutation({
    mutationFn: () => apiRequest(`/api/admin/case-requests/${r.id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["caseRequests"] }),
    onError: (e: any) => alert(e?.message || "삭제 실패"),
  });

  const st = STATUS[r.status] || STATUS.new;
  const aiRec = (() => { try { return r.aiReview ? JSON.parse(r.aiReview)?.recommendation : null; } catch { return null; } })();

  return (
    <div className="card">
      <div role="button" tabIndex={0} aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); } }}
        className="flex items-start justify-between gap-3 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`badge ${st.cls}`}>{st.label}</span>
            {aiRec && REC[aiRec] && <span className={`badge ${REC[aiRec].cls}`}>AI: {REC[aiRec].label}</span>}
            {r.category && <span className="text-xs text-gray-500">{r.category}</span>}
            {r.caseStructure && <span className="text-xs text-primary-600">· {STRUCTURE[r.caseStructure] || r.caseStructure}</span>}
          </div>
          <h3 className="font-bold truncate">{r.title}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {r.name} · {r.phone}{r.email ? ` · ${r.email}` : ""} · {fmtDate(r.createdAt)}
          </p>
        </div>
        <svg aria-hidden="true" className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7.5l5 5 5-5" /></svg>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t space-y-3">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <p><span className="text-gray-500">사건 형태:</span> {r.caseStructure ? (STRUCTURE[r.caseStructure] || r.caseStructure) : "-"}</p>
            <p><span className="text-gray-500">상대방:</span> {r.opponent || "-"}</p>
            <p><span className="text-gray-500">예상 피해자 수:</span> {r.headcount || "-"}</p>
            <p><span className="text-gray-500">예상 상대방 수:</span> {r.opponentCount || "-"}</p>
            <p><span className="text-gray-500">예상 피해액:</span> {r.damageScale || "-"}</p>
          </div>
          <div>
            <p className="text-gray-500 text-sm mb-1">피해 내용</p>
            <p className="text-sm whitespace-pre-wrap bg-gray-50 rounded-lg p-3 leading-relaxed">{r.content}</p>
          </div>

          {/* AI 초기검토 + 수임 심사 */}
          <AiReviewPanel r={r} />
          <DecisionPanel r={r} />

          {r.status === "converted" ? (
            <div className="text-sm text-green-700 bg-green-50 rounded-lg p-2.5 text-center">이미 사건으로 개설된 요청입니다.</div>
          ) : (
            <button
              onClick={() => navigate("/admin/cases/new", { state: { fromRequest: { id: r.id, title: r.title, content: r.content, opponent: r.opponent, category: r.category, caseStructure: r.caseStructure } } })}
              className="btn-primary text-sm w-full">
              이 요청으로 사건 만들기 →
            </button>
          )}
          <div>
            <label className="label">내부 메모</label>
            <textarea className="input min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="검토 메모(고객에게 노출되지 않음)" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_KEYS.map((k) => (
              <button key={k} onClick={() => mut.mutate({ status: k })} disabled={mut.isPending}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${r.status === k ? "bg-primary-500 text-white border-primary-500" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                {STATUS[k].label}
              </button>
            ))}
            <button onClick={() => mut.mutate({ adminNote: note })} disabled={mut.isPending} className="btn-secondary text-xs px-3 py-1.5 ml-auto">
              {mut.isPending ? "저장 중…" : "메모 저장"}
            </button>
          </div>
          <div className="flex justify-end pt-1">
            <button onClick={() => { if (window.confirm(`'${r.title}' 사건요청을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) delMut.mutate(); }} disabled={delMut.isPending} className="text-xs text-red-600 hover:underline disabled:opacity-50">이 요청 삭제</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CaseRequests() {
  const [filter, setFilter] = useState("");
  const { data: requests, isLoading } = useQuery({
    queryKey: ["caseRequests", filter],
    queryFn: () => apiRequest(`/api/admin/case-requests${filter ? `?status=${filter}` : ""}`),
  });

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-1">사건 요청</h1>
      <p className="text-gray-500 text-sm mb-6">고객이 제출한 새 사건 제보입니다. AI 초기검토로 유형·쟁점을 파악하고 수임 여부를 심사하세요.</p>

      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => setFilter("")} className={`text-xs px-3 py-1.5 rounded-full border ${!filter ? "bg-primary-500 text-white border-primary-500" : "border-gray-300 text-gray-600"}`}>전체</button>
        {STATUS_KEYS.map((k) => (
          <button key={k} onClick={() => setFilter(k)} className={`text-xs px-3 py-1.5 rounded-full border ${filter === k ? "bg-primary-500 text-white border-primary-500" : "border-gray-300 text-gray-600"}`}>
            {STATUS[k].label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-gray-400 py-12 text-center">불러오는 중…</p>
      ) : !requests || requests.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">접수된 사건 요청이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {requests.map((r: any) => <RequestCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}

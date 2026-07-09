import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { usePageMeta } from "../hooks/use-page-meta";

const STATUS_LABELS: Record<string, string> = {
  recruiting: "모집중", filed: "소 제기", in_progress: "진행중", settled: "합의", closed: "종결",
};
const STEPS = ["정보등록", "계약", "결제", "확인"];

function stepOf(party: any): number {
  if (party.status === "verified") return 4;
  if (party.paymentStatus === "completed" || party.status === "paid") return 3;
  if (party.status === "contracted" || party.contractAgreed) return 2;
  return 1;
}
function nextAction(party: any, c: any): { label: string; to: string; cls: string } | null {
  if (party.status === "registered" && !party.contractAgreed) return { label: "계약 체결하기", to: `/cases/${c.id}/contract`, cls: "btn-primary" };
  if ((party.status === "contracted" || party.contractAgreed) && party.paymentStatus !== "completed") return { label: "착수금 결제하기", to: `/cases/${c.id}/payment`, cls: "btn-accent" };
  return null;
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 mt-3">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${i < step ? "text-primary-600" : "text-gray-300"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${i < step ? "bg-primary-500" : "bg-gray-200"}`} />{s}
          </span>
          {i < STEPS.length - 1 && <span className={`w-4 h-px ${i < step ? "bg-primary-300" : "bg-gray-200"}`} />}
        </div>
      ))}
    </div>
  );
}

export default function MyCases() {
  usePageMeta("내 사건 | 로사이어티 집단소송", "참여 사건 현황과 다음 할 일을 확인합니다.");
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["myCases"], queryFn: () => apiRequest("/api/my/cases") });
  const list = Array.isArray(data) ? data : [];

  const summary = useMemo(() => {
    let paid = 0, todos = 0;
    for (const it of list) { if (it.party.paymentStatus === "completed") paid++; if (nextAction(it.party, it.case)) todos++; }
    return { total: list.length, paid, todos };
  }, [list]);

  const todoList = list.map((it) => ({ ...it, action: nextAction(it.party, it.case) })).filter((it) => it.action);

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-6">내 사건</h1>

      {!isLoading && list.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="card text-center"><p className="text-xs text-gray-500">참여 사건</p><p className="text-2xl font-bold text-primary-600 tabular-nums mt-1">{summary.total}</p></div>
          <div className="card text-center"><p className="text-xs text-gray-500">결제 완료</p><p className="text-2xl font-bold text-green-600 tabular-nums mt-1">{summary.paid}</p></div>
          <div className="card text-center"><p className="text-xs text-gray-500">할 일</p><p className="text-2xl font-bold text-accent-600 tabular-nums mt-1">{summary.todos}</p></div>
        </div>
      )}

      {todoList.length > 0 && (
        <div className="card mb-6 border-accent-200 bg-accent-50/50">
          <h2 className="font-bold text-ink mb-3">다음 할 일</h2>
          <div className="space-y-2">
            {todoList.map(({ party, case: c, action }: any) => (
              <div key={party.id} className="flex items-center justify-between gap-3">
                <p className="text-sm text-ink truncate"><span className="font-medium">{c.title}</span></p>
                <Link to={action.to} className={`${action.cls} text-xs shrink-0`}>{action.label}</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-20 text-gray-400">불러오는 중…</div>
      ) : list.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-ink-muted mb-1">아직 참여한 사건이 없습니다.</p>
          <p className="text-xs text-gray-400 mb-5">같은 피해를 입은 사건에 참여하거나, 새 사건을 요청해보세요.</p>
          <div className="flex items-center justify-center gap-2">
            <Link to="/cases" className="btn-primary px-5 py-2.5">사건 참여</Link>
            <Link to="/request" className="btn-secondary px-5 py-2.5">사건 요청</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map(({ party, case: c }: any) => {
            const action = nextAction(party, c);
            return (
              <div key={party.id} className="card">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`badge-${c.status}`}>{STATUS_LABELS[c.status] || c.status}</span>
                      {party.paymentStatus === "completed" && <span className="badge bg-green-100 text-green-700">결제완료</span>}
                    </div>
                    <Link to={`/cases/${c.id}`} className="font-bold text-lg hover:text-primary-600 transition-colors">{c.title}</Link>
                    <p className="text-sm text-gray-500 mt-1">피고: {c.defendant || "-"} · 착수금 {(c.retainerFee || 0).toLocaleString()}원</p>
                    <Stepper step={stepOf(party)} />
                  </div>
                  <div className="flex flex-row md:flex-col flex-wrap gap-2 shrink-0">
                    {action && <Link to={action.to} className={`${action.cls} text-xs text-center`}>{action.label}</Link>}
                    <Link to={`/cases/${c.id}/progress`} className="btn-secondary text-xs text-center">경과 보기</Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 홍보 */}
      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <a href="https://day.lawyer" target="_blank" rel="noopener noreferrer" className="card bg-primary-50 hover:bg-primary-100 transition-colors">
          <p className="font-bold text-primary-600">데이로이어</p>
          <p className="text-sm text-primary-500 mt-1">월정액 법률 상담 서비스 →</p>
        </a>
        <a href="https://willsave.co.kr" target="_blank" rel="noopener noreferrer" className="card bg-purple-50 hover:bg-purple-100 transition-colors">
          <p className="font-bold text-purple-600">윌세이브</p>
          <p className="text-sm text-purple-500 mt-1">유언장 작성·보관 서비스 →</p>
        </a>
      </div>
    </div>
  );
}

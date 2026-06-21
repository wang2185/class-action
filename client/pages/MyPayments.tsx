import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/queryClient";
import { usePageMeta } from "../hooks/use-page-meta";
import MemberTabs from "../components/MemberTabs";

const TYPE: Record<string, string> = { retainer: "착수금", payment_order: "지급명령", seizure: "가압류" };
const STATUS: Record<string, string> = { completed: "완료", pending: "대기", failed: "실패", refunded: "환불" };
const STATUS_CLS: Record<string, string> = {
  completed: "bg-green-100 text-green-700", pending: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700", refunded: "bg-gray-200 text-gray-600",
};
const fmt = (d?: string) => (d ? new Date(d).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : "-");

export default function MyPayments() {
  usePageMeta("결제 내역 | 로사이어티 집단소송", "내 착수금·결제 내역을 확인합니다.");
  const { data: txs, isLoading } = useQuery<any[]>({ queryKey: ["myPayments"], queryFn: () => apiRequest("/api/my/payment-transactions") });

  const completed = (txs || []).filter((t) => t.status === "completed").reduce((s, t) => s + (t.amount || 0), 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <MemberTabs />
      <h1 className="text-2xl font-extrabold text-ink mb-6">결제 내역</h1>

      {!!(txs && txs.length) && (
        <div className="card mb-5">
          <p className="text-sm text-gray-500">총 결제완료 금액</p>
          <p className="text-2xl font-bold text-accent-600 tabular-nums mt-1">{completed.toLocaleString()}원</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-400 py-12 text-center">불러오는 중…</p>
      ) : !txs || txs.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-ink-muted mb-4">아직 결제 내역이 없습니다.</p>
          <Link to="/cases" className="btn-primary px-5 py-2.5">진행 중인 사건 보기</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {txs.map((t) => (
            <div key={t.id} className="card flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium text-ink truncate">{t.caseTitle || `사건 #${t.caseId}`}</p>
                <p className="text-xs text-gray-400 mt-0.5">{TYPE[t.paymentType] || t.paymentType} · {fmt(t.createdAt)}{t.cardName ? ` · ${t.cardName}` : ""}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold tabular-nums">{(t.amount || 0).toLocaleString()}원</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[t.status] || "bg-gray-100 text-gray-600"}`}>{STATUS[t.status] || t.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

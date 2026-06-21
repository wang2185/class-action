import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";

const TYPE: Record<string, string> = { retainer: "착수금", payment_order: "지급명령", seizure: "가압류" };
const STATUS: Record<string, string> = { completed: "완료", pending: "대기", failed: "실패", refunded: "환불" };
const STATUS_CLS: Record<string, string> = {
  completed: "bg-green-100 text-green-700", pending: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700", refunded: "bg-gray-200 text-gray-600",
};
const fmt = (d?: string) => (d ? new Date(d).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : "-");

export default function AdminPayments() {
  const { data, isLoading } = useQuery({ queryKey: ["adminPayments"], queryFn: () => apiRequest("/api/admin/payments") });
  const [q, setQ] = useState("");
  const [st, setSt] = useState("all");
  const txs: any[] = data?.transactions ?? [];

  const filtered = useMemo(() => {
    let l = [...txs];
    const kw = q.trim().toLowerCase();
    if (kw) l = l.filter((t) => [t.caseTitle, t.orderId, t.cardName].some((v) => String(v || "").toLowerCase().includes(kw)));
    if (st !== "all") l = l.filter((t) => t.status === st);
    return l;
  }, [txs, q, st]);

  const won = (n: number) => `${Math.round((n || 0) / 10000).toLocaleString()}만원`;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold">결제 관리</h1>
        <Link to="/admin" className="btn-secondary">대시보드</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="card"><p className="text-sm text-gray-500">결제완료 합계</p><p className="text-2xl font-bold mt-1 tabular-nums text-accent-600">{won(data?.totalCompleted ?? 0)}</p></div>
        <div className="card"><p className="text-sm text-gray-500">전체 거래</p><p className="text-2xl font-bold mt-1 tabular-nums text-primary-600">{data?.totalCount ?? 0}건</p></div>
        <div className="card"><p className="text-sm text-gray-500">완료 거래</p><p className="text-2xl font-bold mt-1 tabular-nums text-green-600">{txs.filter((t) => t.status === "completed").length}건</p></div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="font-bold text-lg">거래 내역</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="사건명·주문번호·카드 검색"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-56" />
            <select value={st} onChange={(e) => setSt(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              <option value="all">전체 상태</option>
              {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        {isLoading ? (
          <p className="text-gray-400 py-10 text-center">불러오는 중…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 py-10 text-center">{txs.length ? "검색 결과가 없습니다." : "결제 거래가 없습니다."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-semibold">일시</th>
                  <th className="pb-3 font-semibold">사건</th>
                  <th className="pb-3 font-semibold">구분</th>
                  <th className="pb-3 font-semibold text-right">금액</th>
                  <th className="pb-3 font-semibold">카드</th>
                  <th className="pb-3 font-semibold text-center">상태</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 text-gray-500 whitespace-nowrap">{fmt(t.createdAt)}</td>
                    <td className="py-3 max-w-xs truncate">{t.caseTitle || `사건 #${t.caseId}`}</td>
                    <td className="py-3 text-gray-600">{TYPE[t.paymentType] || t.paymentType}</td>
                    <td className="py-3 text-right tabular-nums font-medium">{(t.amount || 0).toLocaleString()}원</td>
                    <td className="py-3 text-gray-500">{t.cardName || "-"}{t.cardNum ? ` ${t.cardNum}` : ""}</td>
                    <td className="py-3 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[t.status] || "bg-gray-100 text-gray-600"}`}>{STATUS[t.status] || t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

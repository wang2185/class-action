import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../../lib/queryClient";
import AdminNav from "../../components/AdminNav";

const won = (n: number) => `${Math.round((n || 0) / 10000).toLocaleString()}만원`;
const wonExact = (n: number) => `${(n || 0).toLocaleString()}원`;
const today = () => new Date().toISOString().slice(0, 10);

type MonthRow = {
  month: string; retainer: number; other: number; comp: number; refund: number;
  ledgerIncome: number; ledgerExpense: number; net: number;
};

export default function AdminAccounting() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [from, to]);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["accountingSummary", qs],
    queryFn: () => apiRequest(`/api/admin/accounting/summary${qs ? `?${qs}` : ""}`),
  });
  const { data: entries } = useQuery<any[]>({
    queryKey: ["accountingEntries", qs],
    queryFn: () => apiRequest(`/api/admin/accounting/entries${qs ? `?${qs}` : ""}`),
  });

  const months: MonthRow[] = summary?.months ?? [];
  const totals: MonthRow | undefined = summary?.totals;

  // 수동장부 입력 폼
  const [form, setForm] = useState({ entryDate: today(), direction: "expense", category: "", amount: "", memo: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const addMutation = useMutation({
    mutationFn: (body: any) => apiRequest("/api/admin/accounting/entries", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setMsg({ ok: true, text: "장부 항목이 추가되었습니다." });
      setForm({ entryDate: today(), direction: form.direction, category: "", amount: "", memo: "" });
      queryClient.invalidateQueries({ queryKey: ["accountingEntries"] });
      queryClient.invalidateQueries({ queryKey: ["accountingSummary"] });
    },
    onError: (e: any) => setMsg({ ok: false, text: e?.message || "추가 실패" }),
  });

  const delMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/admin/accounting/entries/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accountingEntries"] });
      queryClient.invalidateQueries({ queryKey: ["accountingSummary"] });
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseInt(form.amount, 10);
    if (!Number.isInteger(amount) || amount <= 0) { setMsg({ ok: false, text: "금액을 입력해주세요." }); return; }
    addMutation.mutate({ ...form, amount });
  }

  function exportXlsx() {
    window.open(`/api/admin/accounting/export.xlsx${qs ? `?${qs}` : ""}`, "_blank");
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <AdminNav />
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold">회계 · 정산</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" aria-label="시작일" />
          <span className="text-gray-400">~</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" aria-label="종료일" />
          {(from || to) && <button onClick={() => { setFrom(""); setTo(""); }} className="text-xs text-gray-500 hover:underline">기간 초기화</button>}
          <button onClick={exportXlsx} className="btn-primary text-sm">XLSX 내보내기</button>
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card"><p className="text-sm text-gray-500">착수금 합계</p><p className="text-2xl font-bold mt-1 tabular-nums text-accent-600">{won(totals?.retainer ?? 0)}</p></div>
        <div className="card"><p className="text-sm text-gray-500">성공보수·기타</p><p className="text-2xl font-bold mt-1 tabular-nums text-primary-600">{won(totals?.other ?? 0)}</p></div>
        <div className="card"><p className="text-sm text-gray-500">환불</p><p className="text-2xl font-bold mt-1 tabular-nums text-gray-500">{won(totals?.refund ?? 0)}</p></div>
        <div className="card"><p className="text-sm text-gray-500">순합계</p><p className="text-2xl font-bold mt-1 tabular-nums text-green-600">{won(totals?.net ?? 0)}</p></div>
      </div>
      {totals && (totals.comp > 0) && (
        <p className="text-xs text-gray-400 -mt-3 mb-6">※ 직권면제(착수금 면제) {wonExact(totals.comp)}는 실수금이 아니므로 순합계에서 제외됩니다.</p>
      )}

      {/* 월별 정산표 */}
      <div className="card mb-6">
        <h2 className="font-bold text-lg mb-4">월별 정산</h2>
        {isLoading ? (
          <p className="text-gray-400 py-10 text-center">불러오는 중…</p>
        ) : months.length === 0 ? (
          <p className="text-gray-400 py-10 text-center">정산 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-semibold">월</th>
                  <th className="pb-3 font-semibold text-right">착수금</th>
                  <th className="pb-3 font-semibold text-right">성공보수·기타</th>
                  <th className="pb-3 font-semibold text-right">직권면제</th>
                  <th className="pb-3 font-semibold text-right">환불</th>
                  <th className="pb-3 font-semibold text-right">장부수입</th>
                  <th className="pb-3 font-semibold text-right">장부지출</th>
                  <th className="pb-3 font-semibold text-right">순합계</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-medium">{m.month}</td>
                    <td className="py-3 text-right tabular-nums">{wonExact(m.retainer)}</td>
                    <td className="py-3 text-right tabular-nums">{wonExact(m.other)}</td>
                    <td className="py-3 text-right tabular-nums text-gray-400">{wonExact(m.comp)}</td>
                    <td className="py-3 text-right tabular-nums text-gray-500">{wonExact(m.refund)}</td>
                    <td className="py-3 text-right tabular-nums text-green-600">{wonExact(m.ledgerIncome)}</td>
                    <td className="py-3 text-right tabular-nums text-red-500">{wonExact(m.ledgerExpense)}</td>
                    <td className="py-3 text-right tabular-nums font-semibold">{wonExact(m.net)}</td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td className="py-3">합계</td>
                    <td className="py-3 text-right tabular-nums">{wonExact(totals.retainer)}</td>
                    <td className="py-3 text-right tabular-nums">{wonExact(totals.other)}</td>
                    <td className="py-3 text-right tabular-nums text-gray-400">{wonExact(totals.comp)}</td>
                    <td className="py-3 text-right tabular-nums text-gray-500">{wonExact(totals.refund)}</td>
                    <td className="py-3 text-right tabular-nums text-green-600">{wonExact(totals.ledgerIncome)}</td>
                    <td className="py-3 text-right tabular-nums text-red-500">{wonExact(totals.ledgerExpense)}</td>
                    <td className="py-3 text-right tabular-nums">{wonExact(totals.net)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* 수동 장부 */}
      <div className="card">
        <h2 className="font-bold text-lg mb-4">수동 장부 (수입·지출 직접 입력)</h2>
        {msg && <p className={`text-sm mb-3 ${msg.ok ? "text-primary-700" : "text-red-600"}`}>{msg.text}</p>}
        <form onSubmit={submit} className="flex items-end gap-2 flex-wrap mb-5">
          <label className="text-xs text-gray-500 flex flex-col gap-1">일자
            <input type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">구분
            <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              <option value="income">수입</option>
              <option value="expense">지출</option>
            </select>
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">분류
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="공동경비·임차료 등" className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-40" />
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">금액(원)
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-32 tabular-nums" />
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1 flex-1 min-w-40">메모
            <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-full" />
          </label>
          <button type="submit" disabled={addMutation.isPending} className="btn-primary text-sm disabled:opacity-50">추가</button>
        </form>

        {(!entries || entries.length === 0) ? (
          <p className="text-gray-400 py-6 text-center">장부 항목이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-semibold">일자</th>
                  <th className="pb-3 font-semibold">구분</th>
                  <th className="pb-3 font-semibold">분류</th>
                  <th className="pb-3 font-semibold text-right">금액</th>
                  <th className="pb-3 font-semibold">메모</th>
                  <th className="pb-3 font-semibold text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 text-gray-500">{e.entryDate ? new Date(e.entryDate).toLocaleDateString("ko-KR") : "-"}</td>
                    <td className="py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${e.direction === "income" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{e.direction === "income" ? "수입" : "지출"}</span></td>
                    <td className="py-3 text-gray-600">{e.category || "-"}</td>
                    <td className="py-3 text-right tabular-nums font-medium">{wonExact(e.amount)}</td>
                    <td className="py-3 text-gray-500 max-w-xs truncate">{e.memo || "-"}</td>
                    <td className="py-3 text-center">
                      <button onClick={() => { if (window.confirm("이 장부 항목을 삭제하시겠습니까?")) delMutation.mutate(e.id); }} className="text-xs text-red-600 hover:underline disabled:opacity-50" disabled={delMutation.isPending}>삭제</button>
                    </td>
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

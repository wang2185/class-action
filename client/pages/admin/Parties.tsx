import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiRequest, queryClient } from "../../lib/queryClient";

const PARTY_STATUS: Record<string, string> = {
  registered: "정보등록", contracted: "계약완료", paid: "결제완료", verified: "확인완료",
};
const PAY_STATUS: Record<string, string> = { pending: "미결제", completed: "결제완료", refunded: "환불" };

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function AdminParties() {
  const { id } = useParams();
  const { data: caseData } = useQuery({ queryKey: ["case", id], queryFn: () => apiRequest(`/api/cases/${id}`) });
  const { data: parties, isLoading } = useQuery<any[]>({ queryKey: ["adminParties", id], queryFn: () => apiRequest(`/api/admin/cases/${id}/parties`) });

  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [payF, setPayF] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("contracted");
  const [msg, setMsg] = useState("");

  const statusMutation = useMutation({
    mutationFn: ({ partyId, status }: { partyId: number; status: string }) =>
      apiRequest(`/api/admin/parties/${partyId}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminParties", id] }),
  });

  const bulkMutation = useMutation({
    mutationFn: (vars: { ids: number[]; status: string }) =>
      apiRequest("/api/admin/parties/bulk-status", { method: "POST", body: JSON.stringify(vars) }),
    onSuccess: (d: any) => { setMsg(`${d.updated || 0}명 상태를 변경했습니다.`); setSelected(new Set()); queryClient.invalidateQueries({ queryKey: ["adminParties", id] }); },
    onError: (e: any) => setMsg(e.message || "일괄 변경 실패"),
  });

  const linkMutation = useMutation({
    mutationFn: (partyId: number) =>
      apiRequest(`/api/admin/cases/${id}/payment-links`, { method: "POST", body: JSON.stringify({ casePartyIds: [partyId], send: true }) }),
    onSuccess: (data: any) => { const l = data.links?.[0]; setMsg(l ? `${l.name} 결제링크 ${l.sendStatus === "sent" ? "발송 완료" : `발송: ${l.sendStatus}`} — ${l.url}` : "결제링크 생성됨"); },
    onError: (e: any) => setMsg(e.message || "결제링크 발송 실패"),
  });

  const deleteMutation = useMutation({
    mutationFn: (partyId: number) => apiRequest(`/api/admin/parties/${partyId}`, { method: "DELETE" }),
    onSuccess: () => { setMsg("당사자를 삭제했습니다."); queryClient.invalidateQueries({ queryKey: ["adminParties", id] }); },
    onError: (e: any) => setMsg(e.message || "삭제 실패"),
  });
  function confirmDelete(p: any) {
    if (window.confirm(`'${p.name}' 당사자를 삭제하시겠습니까?\n증거·결제기록 등 연결 데이터가 함께 삭제되며 되돌릴 수 없습니다.`)) deleteMutation.mutate(p.id);
  }

  const all = Array.isArray(parties) ? parties : [];
  const summary = useMemo(() => ({
    total: all.length,
    paid: all.filter((p) => p.paymentStatus === "completed").length,
    pendingPay: all.filter((p) => p.paymentStatus === "pending").length,
    contracted: all.filter((p) => p.contractAgreed).length,
  }), [all]);

  const filtered = useMemo(() => {
    let l = [...all];
    const kw = q.trim().toLowerCase();
    if (kw) l = l.filter((p) => [p.name, p.phone, p.email].some((v) => String(v || "").toLowerCase().includes(kw)));
    if (statusF !== "all") l = l.filter((p) => p.status === statusF);
    if (payF !== "all") l = l.filter((p) => p.paymentStatus === payF);
    return l;
  }, [all, q, statusF, payF]);

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((p) => p.id)));
  const toggle = (pid: number) => setSelected((s) => { const n = new Set(s); n.has(pid) ? n.delete(pid) : n.add(pid); return n; });

  function exportCsv() {
    const head = ["이름", "전화번호", "이메일", "피해금액", "상태", "결제", "계약"];
    const lines = [head.join(",")].concat(filtered.map((p) => [p.name, p.phone || "", p.email || "", p.damageAmount || "", PARTY_STATUS[p.status] || p.status, PAY_STATUS[p.paymentStatus] || p.paymentStatus, p.contractAgreed ? "체결" : "미체결"].map(csvCell).join(",")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `당사자_사건${id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h1 className="text-2xl font-bold">당사자 관리</h1>
        <Link to="/admin" className="btn-secondary text-sm">대시보드</Link>
      </div>
      {caseData && <p className="text-gray-500 mb-5">{caseData.title}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="card text-center"><p className="text-xs text-gray-500">전체</p><p className="text-xl font-bold tabular-nums mt-1">{summary.total}</p></div>
        <div className="card text-center"><p className="text-xs text-gray-500">계약 체결</p><p className="text-xl font-bold tabular-nums mt-1 text-blue-600">{summary.contracted}</p></div>
        <div className="card text-center"><p className="text-xs text-gray-500">결제 완료</p><p className="text-xl font-bold tabular-nums mt-1 text-green-600">{summary.paid}</p></div>
        <div className="card text-center"><p className="text-xs text-gray-500">미결제</p><p className="text-xl font-bold tabular-nums mt-1 text-amber-600">{summary.pendingPay}</p></div>
      </div>

      {msg && <div role="alert" className="bg-blue-50 text-blue-700 text-sm p-3 rounded-lg mb-4 break-all">{msg}</div>}

      <div className="card">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·전화·이메일 검색"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-48" />
            <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              <option value="all">전체 진행</option>
              {Object.entries(PARTY_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={payF} onChange={(e) => setPayF(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              <option value="all">전체 결제</option>
              {Object.entries(PAY_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button onClick={exportCsv} disabled={!filtered.length} className="btn-secondary text-sm disabled:opacity-50">CSV 내보내기</button>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-primary-50 text-sm flex-wrap">
            <span className="font-medium text-primary-700">{selected.size}명 선택</span>
            <span className="text-gray-400">→ 상태</span>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm">
              {Object.entries(PARTY_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button onClick={() => bulkMutation.mutate({ ids: [...selected], status: bulkStatus })} disabled={bulkMutation.isPending} className="btn-primary text-xs disabled:opacity-50">일괄 변경</button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:underline">선택 해제</button>
          </div>
        )}

        {isLoading ? (
          <p className="text-center py-8 text-gray-400">불러오는 중…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-12 text-gray-400">{all.length ? "검색 결과가 없습니다." : "참여한 당사자가 없습니다."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="전체 선택" /></th>
                  <th className="pb-3 font-semibold">이름</th>
                  <th className="pb-3 font-semibold">전화번호</th>
                  <th className="pb-3 font-semibold">이메일</th>
                  <th className="pb-3 font-semibold text-right">피해금액</th>
                  <th className="pb-3 font-semibold">진행</th>
                  <th className="pb-3 font-semibold">결제</th>
                  <th className="pb-3 font-semibold">계약</th>
                  <th className="pb-3 font-semibold text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className={`border-b last:border-0 hover:bg-gray-50 ${selected.has(p.id) ? "bg-primary-50/40" : ""}`}>
                    <td className="py-3"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`${p.name} 선택`} /></td>
                    <td className="py-3 font-medium">{p.name}</td>
                    <td className="py-3 text-gray-500">{p.phone || "-"}</td>
                    <td className="py-3 text-gray-500">{p.email || "-"}</td>
                    <td className="py-3 text-right tabular-nums">{p.damageAmount ? `${p.damageAmount.toLocaleString()}원` : "-"}</td>
                    <td className="py-3"><span className="badge bg-gray-100 text-gray-700">{PARTY_STATUS[p.status] || p.status}</span></td>
                    <td className="py-3"><span className={`badge ${p.paymentStatus === "completed" ? "bg-green-100 text-green-700" : p.paymentStatus === "refunded" ? "bg-gray-200 text-gray-600" : "bg-yellow-100 text-yellow-700"}`}>{PAY_STATUS[p.paymentStatus] || p.paymentStatus}</span></td>
                    <td className="py-3">{p.contractAgreed ? <span className="text-green-600 text-xs">체결완료</span> : <span className="text-gray-400 text-xs">미체결</span>}</td>
                    <td className="py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <select aria-label={`${p.name} 상태 변경`} className="text-xs border rounded px-2 py-1" value={p.status} onChange={(e) => statusMutation.mutate({ partyId: p.id, status: e.target.value })}>
                          {Object.entries(PARTY_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <button onClick={() => linkMutation.mutate(p.id)} disabled={linkMutation.isPending} className="text-xs text-accent-600 hover:underline disabled:opacity-50">결제링크 발송</button>
                        <button onClick={() => confirmDelete(p)} disabled={deleteMutation.isPending} className="text-xs text-red-600 hover:underline disabled:opacity-50">삭제</button>
                      </div>
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

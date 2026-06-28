import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../../lib/queryClient";
import AdminNav from "../../components/AdminNav";

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("ko-KR") : "무기한");

export default function AdminCoupons() {
  const { data: coupons, isLoading } = useQuery<any[]>({ queryKey: ["adminCoupons"], queryFn: () => apiRequest("/api/admin/coupons") });
  const { data: cases } = useQuery<any[]>({ queryKey: ["adminCasesForCoupon"], queryFn: () => apiRequest("/api/cases") });

  const [form, setForm] = useState({ code: "", caseId: "", discountType: "fixed", discountValue: "", maxUses: "", expiresAt: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("/api/admin/coupons", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setMsg({ ok: true, text: "쿠폰이 생성되었습니다." });
      setForm({ code: "", caseId: "", discountType: form.discountType, discountValue: "", maxUses: "", expiresAt: "" });
      queryClient.invalidateQueries({ queryKey: ["adminCoupons"] });
    },
    onError: (e: any) => setMsg({ ok: false, text: e?.message || "생성 실패" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => apiRequest(`/api/admin/coupons/${id}`, { method: "PUT", body: JSON.stringify({ active }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminCoupons"] }),
  });

  const delMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/admin/coupons/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminCoupons"] }),
    onError: (e: any) => setMsg({ ok: false, text: e?.message || "삭제 실패" }),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const code = form.code.toUpperCase().trim();
    const discountValue = parseInt(form.discountValue, 10);
    if (!/^[A-Z0-9_-]{3,60}$/.test(code)) { setMsg({ ok: false, text: "코드는 영문 대문자·숫자·-_ 3~60자입니다." }); return; }
    if (!Number.isInteger(discountValue) || discountValue <= 0) { setMsg({ ok: false, text: "할인 값을 입력해주세요." }); return; }
    createMutation.mutate({
      code, discountType: form.discountType, discountValue,
      caseId: form.caseId || null,
      maxUses: form.maxUses ? parseInt(form.maxUses, 10) : 0,
      expiresAt: form.expiresAt || null,
    });
  }

  const list = Array.isArray(coupons) ? coupons : [];
  const caseList = Array.isArray(cases) ? cases : [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <AdminNav />
      <h1 className="text-2xl md:text-3xl font-bold mb-6">쿠폰 · 착수금 할인</h1>

      <div className="card mb-6">
        <h2 className="font-bold text-lg mb-4">쿠폰 생성</h2>
        {msg && <p className={`text-sm mb-3 ${msg.ok ? "text-primary-700" : "text-red-600"}`}>{msg.text}</p>}
        <form onSubmit={submit} className="flex items-end gap-2 flex-wrap">
          <label className="text-xs text-gray-500 flex flex-col gap-1">코드
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WELCOME10" className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-36 uppercase" />
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">유형
            <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              <option value="fixed">정액(원)</option>
              <option value="percent">정률(%)</option>
            </select>
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">{form.discountType === "percent" ? "할인율(%)" : "할인액(원)"}
            <input type="number" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} placeholder={form.discountType === "percent" ? "10" : "50000"} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-28 tabular-nums" />
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">적용 사건
            <select value={form.caseId} onChange={(e) => setForm({ ...form, caseId: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-44">
              <option value="">전체 사건</option>
              {caseList.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">최대 사용(0=무제한)
            <input type="number" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder="0" className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-24 tabular-nums" />
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">만료일
            <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" disabled={createMutation.isPending} className="btn-primary text-sm disabled:opacity-50">생성</button>
        </form>
      </div>

      <div className="card">
        <h2 className="font-bold text-lg mb-4">쿠폰 목록</h2>
        {isLoading ? (
          <p className="text-gray-400 py-10 text-center">불러오는 중…</p>
        ) : list.length === 0 ? (
          <p className="text-gray-400 py-10 text-center">쿠폰이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-semibold">코드</th>
                  <th className="pb-3 font-semibold">할인</th>
                  <th className="pb-3 font-semibold">적용 사건</th>
                  <th className="pb-3 font-semibold text-center">사용/한도</th>
                  <th className="pb-3 font-semibold">만료</th>
                  <th className="pb-3 font-semibold text-center">상태</th>
                  <th className="pb-3 font-semibold text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-mono font-medium">{c.code}</td>
                    <td className="py-3">{c.discountType === "percent" ? `${c.discountValue}%` : `${(c.discountValue || 0).toLocaleString()}원`}</td>
                    <td className="py-3 text-gray-500 max-w-xs truncate">{c.caseTitle || "전체 사건"}</td>
                    <td className="py-3 text-center tabular-nums">{c.usedCount}/{c.maxUses === 0 ? "∞" : c.maxUses}</td>
                    <td className="py-3 text-gray-500">{fmtDate(c.expiresAt)}</td>
                    <td className="py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${c.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>{c.active ? "활성" : "비활성"}</span>
                    </td>
                    <td className="py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => toggleMutation.mutate({ id: c.id, active: !c.active })} disabled={toggleMutation.isPending} className="text-xs text-accent-600 hover:underline disabled:opacity-50">{c.active ? "비활성화" : "활성화"}</button>
                        <button onClick={() => { if (window.confirm(`쿠폰 '${c.code}'을 삭제하시겠습니까?`)) delMutation.mutate(c.id); }} disabled={delMutation.isPending} className="text-xs text-red-600 hover:underline disabled:opacity-50">삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">쿠폰은 착수금 결제링크 생성 시 코드를 입력하면 적용됩니다. 정률 할인은 링크 금액 기준으로 계산되며 0원 미만으로 내려가지 않습니다.</p>
      </div>
    </div>
  );
}

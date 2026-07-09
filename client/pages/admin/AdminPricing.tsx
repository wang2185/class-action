import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";

const STATUS_LABELS: Record<string, string> = {
  recruiting: "모집중", filed: "소 제기", in_progress: "진행중", settled: "합의", closed: "종결",
};
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("ko-KR") : "무기한");

// ─── 수임료 정책: 사건별 착수금 인라인 편집 ───
function FeeTab() {
  const qc = useQueryClient();
  const { data: cases, isLoading } = useQuery<any[]>({ queryKey: ["cases"], queryFn: () => apiRequest("/api/cases") });
  const [editId, setEditId] = useState<number | null>(null);
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = useMutation({
    mutationFn: ({ id, retainerFee }: { id: number; retainerFee: string }) =>
      apiRequest(`/api/admin/cases/${id}`, { method: "PUT", body: JSON.stringify({ retainerFee }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["adminStats"] });
      setEditId(null); setMsg({ ok: true, text: "착수금이 변경되었습니다." });
    },
    onError: (e: any) => setMsg({ ok: false, text: e?.message || "변경 실패" }),
  });

  function start(c: any) { setEditId(c.id); setVal(String(c.retainerFee ?? "")); setMsg(null); }
  function commit(id: number) {
    const n = parseInt(val, 10);
    if (!Number.isInteger(n) || n < 0) { setMsg({ ok: false, text: "착수금을 올바르게 입력해주세요." }); return; }
    save.mutate({ id, retainerFee: String(n) });
  }

  const list = Array.isArray(cases) ? cases : [];

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="font-bold text-lg">사건별 수임료 <span className="text-sm text-gray-400 font-normal">{list.length}건</span></h2>
        {msg && <p className={`text-sm ${msg.ok ? "text-primary-700" : "text-red-600"}`}>{msg.text}</p>}
      </div>
      {isLoading ? (
        <p className="text-gray-400 py-10 text-center">불러오는 중…</p>
      ) : list.length === 0 ? (
        <p className="text-gray-400 py-10 text-center">등록된 사건이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-semibold">사건명</th>
                <th className="pb-3 font-semibold">상태</th>
                <th className="pb-3 font-semibold text-right">착수금</th>
                <th className="pb-3 font-semibold text-center">지급명령</th>
                <th className="pb-3 font-semibold text-center">가압류</th>
                <th className="pb-3 font-semibold text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 font-medium max-w-xs truncate">{c.title}</td>
                  <td className="py-3"><span className={`badge-${c.status}`}>{STATUS_LABELS[c.status] || c.status}</span></td>
                  <td className="py-3 text-right tabular-nums">
                    {editId === c.id ? (
                      <input
                        type="number" autoFocus value={val} onChange={(e) => setVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") commit(c.id); if (e.key === "Escape") setEditId(null); }}
                        className="w-32 rounded-lg border border-primary-300 px-2 py-1 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    ) : (
                      `${(c.retainerFee || 0).toLocaleString()}원`
                    )}
                  </td>
                  <td className="py-3 text-center">{c.supportsPaymentOrder ? <span className="badge bg-blue-100 text-blue-700">지원</span> : <span className="text-gray-300">-</span>}</td>
                  <td className="py-3 text-center">{c.supportsProvisionalSeizure ? <span className="badge bg-amber-100 text-amber-700">지원</span> : <span className="text-gray-300">-</span>}</td>
                  <td className="py-3 text-center">
                    {editId === c.id ? (
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => commit(c.id)} disabled={save.isPending} className="text-xs text-primary-700 hover:underline disabled:opacity-50">저장</button>
                        <button onClick={() => setEditId(null)} className="text-xs text-gray-500 hover:underline">취소</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                        <button onClick={() => start(c)} className="text-xs text-accent-600 hover:underline">착수금 변경</button>
                        <Link to={`/admin/cases/${c.id}/edit`} className="text-xs text-primary-600 hover:underline">상세 편집</Link>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-3">착수금 외 성공보수·지원서면 등 상세 정책은 각 사건의 ‘상세 편집’에서 관리합니다.</p>
    </div>
  );
}

// ─── 쿠폰(착수금 할인) ───
function CouponTab() {
  const qc = useQueryClient();
  const { data: coupons, isLoading } = useQuery<any[]>({ queryKey: ["adminCoupons"], queryFn: () => apiRequest("/api/admin/coupons") });
  const { data: cases } = useQuery<any[]>({ queryKey: ["cases"], queryFn: () => apiRequest("/api/cases") });
  const [form, setForm] = useState({ code: "", caseId: "", discountType: "fixed", discountValue: "", maxUses: "", expiresAt: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("/api/admin/coupons", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setMsg({ ok: true, text: "쿠폰이 생성되었습니다." });
      setForm({ code: "", caseId: "", discountType: form.discountType, discountValue: "", maxUses: "", expiresAt: "" });
      qc.invalidateQueries({ queryKey: ["adminCoupons"] });
    },
    onError: (e: any) => setMsg({ ok: false, text: e?.message || "생성 실패" }),
  });
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => apiRequest(`/api/admin/coupons/${id}`, { method: "PUT", body: JSON.stringify({ active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminCoupons"] }),
  });
  const delMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/admin/coupons/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminCoupons"] }),
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
    <>
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
    </>
  );
}

export default function AdminPricing() {
  const [tab, setTab] = useState<"fee" | "coupon">("fee");
  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-1">요금 · 정책</h1>
      <p className="text-sm text-gray-500 mb-6">사건별 수임료(착수금)와 할인 쿠폰을 관리합니다.</p>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[{ k: "fee", l: "수임료 정책" }, { k: "coupon", l: "쿠폰" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.k ? "border-primary-500 text-primary-700" : "border-transparent text-gray-500 hover:text-ink"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === "fee" ? <FeeTab /> : <CouponTab />}
    </div>
  );
}

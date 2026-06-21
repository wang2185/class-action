import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../lib/queryClient";
import { usePageMeta } from "../hooks/use-page-meta";
import MemberTabs from "../components/MemberTabs";

const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("ko-KR") : "-");

export default function MyPaymentMethods() {
  usePageMeta("결제수단 관리 | 로사이어티 집단소송", "등록된 결제수단(카드)을 관리합니다.");
  const { data: keys, isLoading } = useQuery<any[]>({ queryKey: ["myBillingKeys"], queryFn: () => apiRequest("/api/my/billing-keys") });
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function remove(id: number) {
    if (!window.confirm("이 결제수단을 삭제할까요?")) return;
    setBusy(id); setMsg(null);
    try {
      await apiRequest(`/api/billing-keys/${id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["myBillingKeys"] });
      setMsg({ ok: true, text: "결제수단이 삭제되었습니다." });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "삭제에 실패했습니다." });
    } finally { setBusy(null); }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <MemberTabs />
      <h1 className="text-2xl font-extrabold text-ink mb-1">결제수단 관리</h1>
      <p className="text-sm text-ink-muted mb-6">성공보수 자동결제 등에 사용할 카드입니다. 카드 정보는 결제대행사(NicePay)에 안전하게 보관되며 플랫폼에는 저장되지 않습니다.</p>
      {msg && <p className={`text-sm mb-4 ${msg.ok ? "text-primary-700" : "text-red-600"}`}>{msg.text}</p>}

      {isLoading ? (
        <p className="text-gray-400 py-10 text-center">불러오는 중…</p>
      ) : !keys || keys.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-ink-muted">등록된 결제수단이 없습니다.</p>
          <p className="text-xs text-gray-400 mt-2">사건별 성공보수 자동결제에 동의하면 카드가 등록됩니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <div key={k.id} className="card flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 text-primary-600 shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">{k.cardName || "카드"}{k.cardNum ? ` ${k.cardNum}` : ""}</p>
                  <p className="text-xs text-gray-400">등록 {fmt(k.createdAt)}</p>
                </div>
              </div>
              <button onClick={() => remove(k.id)} disabled={busy === k.id} className="btn-secondary text-xs disabled:opacity-50 shrink-0">삭제</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

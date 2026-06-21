import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/queryClient";
import { usePageMeta } from "../hooks/use-page-meta";
import MemberTabs from "../components/MemberTabs";

const CH: Record<string, string> = { sms: "문자", email: "이메일", alimtalk: "알림톡" };
function label(k: string): string {
  if (!k) return "알림";
  if (k.includes("filing") || k.startsWith("case_update")) return "소송 경과 안내";
  if (k.startsWith("payment_link") || k.includes("pay")) return "결제 안내";
  if (k.startsWith("case_request_received")) return "사건요청 접수확인";
  if (k.startsWith("case_request")) return "사건요청 처리 안내";
  return "알림";
}
const fmt = (d?: string) => (d ? new Date(d).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : "-");

export default function MyNotifications() {
  usePageMeta("알림 | 로사이어티 집단소송", "받은 알림을 확인합니다.");
  const { data: list, isLoading } = useQuery<any[]>({ queryKey: ["myNotifications"], queryFn: () => apiRequest("/api/my/notifications") });

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <MemberTabs />
      <h1 className="text-2xl font-extrabold text-ink mb-6">알림</h1>

      {isLoading ? (
        <p className="text-gray-400 py-12 text-center">불러오는 중…</p>
      ) : !list || list.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-ink-muted">받은 알림이 없습니다.</p>
          <p className="text-xs text-gray-400 mt-2">사건 경과·결제 안내 등 발송된 문자·이메일이 여기에 모입니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((n) => (
            <div key={n.id} className="card flex items-start gap-3">
              <span className="mt-0.5 inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary-50 text-primary-600 shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-ink">{label(n.templateKey)}</p>
                  <span className="text-xs text-gray-400 shrink-0">{CH[n.channel] || n.channel}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{fmt(n.createdAt)}{n.caseId ? ` · 사건 #${n.caseId}` : ""}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

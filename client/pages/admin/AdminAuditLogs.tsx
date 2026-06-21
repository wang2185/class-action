import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";

const ACTION_LABELS: Record<string, string> = {
  view_parties: "당사자 조회", view_defendants: "상대방 조회", view_evidence: "증거 조회",
  view_case_package: "서면자료 조회", export_case_package: "서면자료 내보내기", view_payments: "결제 조회",
  update_user_role: "권한 변경", bulk_update_party_status: "당사자 일괄변경", view_case_requests: "사건요청 조회",
  update_case_request: "사건요청 변경", change_password: "비밀번호 변경", export_data: "데이터 내보내기", delete_data: "데이터 삭제",
};
const fmt = (d?: string) => (d ? new Date(d).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : "-");

export default function AdminAuditLogs() {
  const { data: logs, isLoading } = useQuery({ queryKey: ["adminAuditLogs"], queryFn: () => apiRequest("/api/admin/audit-logs") });
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");

  const actions = useMemo(() => Array.from(new Set((logs || []).map((l: any) => l.action))).sort(), [logs]);
  const filtered = useMemo(() => {
    let l: any[] = Array.isArray(logs) ? logs : [];
    const kw = q.trim().toLowerCase();
    if (kw) l = l.filter((x) => [x.userEmail, x.userName, x.details, x.tableName].some((v) => String(v || "").toLowerCase().includes(kw)));
    if (action !== "all") l = l.filter((x) => x.action === action);
    return l;
  }, [logs, q, action]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold">감사 로그</h1>
        <Link to="/admin" className="btn-secondary">대시보드</Link>
      </div>
      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="font-bold text-lg">개인정보 접근 이력 <span className="text-sm text-gray-400 font-normal">(최근 1,000건)</span></h2>
          <div className="flex items-center gap-2 flex-wrap">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="사용자·내용 검색"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-52" />
            <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm max-w-[12rem]">
              <option value="all">전체 행위</option>
              {actions.map((a) => <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>)}
            </select>
          </div>
        </div>
        {isLoading ? (
          <p className="text-gray-400 py-10 text-center">불러오는 중…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 py-10 text-center">{logs && logs.length ? "검색 결과가 없습니다." : "기록이 없습니다."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-semibold">일시</th>
                  <th className="pb-3 font-semibold">사용자</th>
                  <th className="pb-3 font-semibold">행위</th>
                  <th className="pb-3 font-semibold">대상</th>
                  <th className="pb-3 font-semibold">상세</th>
                  <th className="pb-3 font-semibold">IP</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => (
                  <tr key={x.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2.5 text-gray-500 whitespace-nowrap">{fmt(x.createdAt)}</td>
                    <td className="py-2.5">{x.userName || "-"}<span className="text-xs text-gray-400 block">{x.userEmail || (x.userId ? `#${x.userId}` : "비로그인")}</span></td>
                    <td className="py-2.5"><span className="inline-block px-2 py-0.5 rounded bg-primary-50 text-primary-700 text-xs font-medium">{ACTION_LABELS[x.action] || x.action}</span></td>
                    <td className="py-2.5 text-gray-500">{x.tableName || "-"}{x.recordId ? ` #${x.recordId}` : ""}</td>
                    <td className="py-2.5 text-gray-500 max-w-xs truncate">{x.details || "-"}</td>
                    <td className="py-2.5 text-gray-400 text-xs">{x.ipAddress || "-"}</td>
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

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";

const STATUS_LABELS: Record<string, string> = {
  recruiting: "모집중", filed: "소 제기", in_progress: "진행중", settled: "합의", closed: "종결",
};

export default function AdminDashboard() {
  const { data: stats } = useQuery({ queryKey: ["adminStats"], queryFn: () => apiRequest("/api/admin/stats") });
  const { data: cases } = useQuery({ queryKey: ["cases"], queryFn: () => apiRequest("/api/cases") });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">관리자 대시보드</h1>
        <Link to="/admin/cases/new" className="btn-primary">새 사건 등록</Link>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "전체 사건", value: stats?.totalCases || 0, color: "text-primary-500" },
          { label: "전체 당사자", value: stats?.totalParties || 0, color: "text-blue-500" },
          { label: "결제 완료", value: stats?.paidParties || 0, color: "text-green-500" },
          { label: "총 수임료", value: `${((stats?.totalRevenue || 0) / 10000).toFixed(0)}만원`, color: "text-accent-500" },
        ].map((s) => (
          <div key={s.label} className="card text-center">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* 사건 목록 */}
      <div className="card">
        <h2 className="font-bold text-lg mb-4">사건 관리</h2>
        {!cases || cases.length === 0 ? (
          <p className="text-gray-400 py-8 text-center">등록된 사건이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-semibold">사건명</th>
                  <th className="pb-3 font-semibold">상태</th>
                  <th className="pb-3 font-semibold">피고</th>
                  <th className="pb-3 font-semibold text-right">참여자</th>
                  <th className="pb-3 font-semibold text-right">착수금</th>
                  <th className="pb-3 font-semibold text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c: any) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-medium max-w-xs truncate">{c.title}</td>
                    <td className="py-3"><span className={`badge-${c.status}`}>{STATUS_LABELS[c.status]}</span></td>
                    <td className="py-3 text-gray-500">{c.defendant || "-"}</td>
                    <td className="py-3 text-right">{c.currentCount}{c.targetCount ? `/${c.targetCount}` : ""}</td>
                    <td className="py-3 text-right">{(c.retainerFee || 0).toLocaleString()}원</td>
                    <td className="py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Link to={`/admin/cases/${c.id}/edit`} className="text-primary-500 hover:underline">편집</Link>
                        <Link to={`/admin/cases/${c.id}/parties`} className="text-blue-500 hover:underline">당사자</Link>
                        <Link to={`/admin/cases/${c.id}/update`} className="text-green-500 hover:underline">경과</Link>
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

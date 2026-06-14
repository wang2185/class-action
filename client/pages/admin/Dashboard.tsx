import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";
import { useAuth } from "../../hooks/use-auth";

const STATUS_LABELS: Record<string, string> = {
  recruiting: "모집중", filed: "소 제기", in_progress: "진행중", settled: "합의", closed: "종결",
};

export default function AdminDashboard() {
  const { isLawyer } = useAuth();
  const { data: stats } = useQuery({ queryKey: ["adminStats"], queryFn: () => apiRequest("/api/admin/stats") });
  const { data: cases } = useQuery({ queryKey: ["cases"], queryFn: () => apiRequest("/api/cases") });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">관리자 대시보드</h1>
        <div className="flex items-center gap-2">
          <Link to="/admin/case-requests" className="btn-secondary">사건 요청함</Link>
          <Link to="/admin/cases/new" className="btn-primary">새 사건 등록</Link>
        </div>
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
            <p className={`text-2xl font-bold mt-1 tabular-nums ${s.color}`}>{s.value}</p>
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
                        <Link to={`/admin/cases/${c.id}/defendants`} className="text-orange-500 hover:underline">상대방</Link>
                        <Link to={`/admin/cases/${c.id}/update`} className="text-green-500 hover:underline">경과</Link>
                        {isLawyer && <Link to={`/admin/cases/${c.id}/package`} className="text-purple-500 hover:underline">서면자료</Link>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card mt-6">
        <h2 className="font-bold text-lg mb-1">내부 도구</h2>
        <p className="text-sm text-gray-500 mb-4">변호사 업무용 도구 — 고객 화면에는 노출되지 않습니다.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <a href="https://docurepeat.com" target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-primary-100 p-4 hover:bg-primary-50 transition-colors">
            <p className="font-semibold">문서 자동화</p>
            <p className="text-xs text-gray-500 mt-1">지급명령·가압류·소장 자동 생성 (DocuRepeat) →</p>
          </a>
          <a href="https://gongsi.estate" target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-primary-100 p-4 hover:bg-primary-50 transition-colors">
            <p className="font-semibold">시가·공시 조회</p>
            <p className="text-xs text-gray-500 mt-1">시가표준액·공시가격 (gongsi.estate) →</p>
          </a>
          <a href="https://day.lawyer/casecrab" target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-primary-100 p-4 hover:bg-primary-50 transition-colors">
            <p className="font-semibold">판례·사건 검색</p>
            <p className="text-xs text-gray-500 mt-1">대법원 판례·사건현황 (CaseScraper) →</p>
          </a>
        </div>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";

export default function LawyerDashboard() {
  const { data: stats } = useQuery<any>({ queryKey: ["adminStats"], queryFn: () => apiRequest("/api/admin/stats") });

  const cards = [
    { label: "진행 사건", value: stats?.totalCases ?? 0, sub: `모집중 ${stats?.recruitingCases ?? 0}건`, color: "text-primary-600" },
    { label: "당사자", value: stats?.totalParties ?? 0, sub: `결제완료 ${stats?.paidParties ?? 0}명`, color: "text-blue-600" },
    { label: "신규 신청", value: stats?.newRequests ?? 0, sub: "검토 대기", color: "text-accent-600" },
    { label: "결제 대기", value: stats?.pendingPayParties ?? 0, sub: "미결제 당사자", color: "text-amber-600" },
  ];
  const quick = [
    { to: "/desk/requests", title: "신청 사건", desc: "접수된 제보 검토", badge: stats?.newRequests },
    { to: "/desk/cases", title: "수임 사건 진행", desc: "당사자·경과 관리" },
    { to: "/desk/documents", title: "자동 문서 작성", desc: "서면자료 패키지 내보내기" },
    { to: "/desk/payments", title: "결제 관리", desc: "거래 조회" },
  ];

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-6">변호사 대시보드</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <p className="text-sm text-gray-500">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {quick.map((n) => (
          <Link key={n.to} to={n.to} className="card hover:border-primary-300 hover:bg-primary-50/40 transition-colors relative">
            {!!n.badge && n.badge > 0 && (
              <span className="absolute top-3 right-3 inline-flex items-center justify-center min-w-[1.4rem] h-6 px-1.5 rounded-full bg-accent-500 text-white text-xs font-bold tabular-nums">{n.badge}</span>
            )}
            <p className="font-bold text-ink">{n.title}</p>
            <p className="text-xs text-gray-500 mt-1">{n.desc}</p>
          </Link>
        ))}
      </div>

      {/* AI 초기검토 · 수임 심사 안내 */}
      <Link to="/desk/requests" className="card block border-primary-100 hover:border-primary-300 hover:bg-primary-50/40 transition-colors">
        <div className="flex items-center gap-2 mb-1">
          <span className="badge bg-primary-100 text-primary-700">신규</span>
          <h2 className="font-bold text-ink">사건 초기 검토(AI) · 수임 심사</h2>
        </div>
        <p className="text-sm text-gray-500">신청 사건에서 <span className="text-primary-600">AI 초기검토</span>로 유형·쟁점·수임 권고를 확인하고, 수임 여부(승인·반려)를 심사할 수 있습니다. →</p>
      </Link>
    </div>
  );
}

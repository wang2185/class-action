import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";

export default function AdminDashboard() {
  const { data: stats } = useQuery({ queryKey: ["adminStats"], queryFn: () => apiRequest("/api/admin/stats") });

  const won = (n: number) => `${Math.round((n || 0) / 10000).toLocaleString()}만원`;
  const statCards = [
    { label: "전체 사건", value: stats?.totalCases ?? 0, sub: `모집중 ${stats?.recruitingCases ?? 0}건`, color: "text-primary-600", to: "/admin/cases" },
    { label: "전체 당사자", value: stats?.totalParties ?? 0, sub: `결제완료 ${stats?.paidParties ?? 0}명`, color: "text-blue-600", to: "/admin/cases" },
    { label: "결제 대기", value: stats?.pendingPayParties ?? 0, sub: "미결제 당사자", color: "text-amber-600", to: "/admin/payments" },
    { label: "총 수임료", value: won(stats?.totalRevenue ?? 0), sub: "결제완료 합계", color: "text-accent-600", to: "/admin/accounting" },
  ];
  const quick = [
    { to: "/admin/requests", title: "사건 요청함", desc: "접수된 제보 검토·사건화", badge: stats?.newRequests },
    { to: "/admin/cases", title: "전체 사건 관리", desc: "사건·당사자·경과·상대방" },
    { to: "/admin/pricing", title: "요금·정책", desc: "사건별 수임료·쿠폰" },
    { to: "/admin/payments", title: "결제 관리", desc: "거래 조회·정산" },
    { to: "/admin/members", title: "회원 관리", desc: `회원 ${stats?.totalUsers ?? 0}명` },
    { to: "/admin/audit-logs", title: "감사 로그", desc: `발송 ${stats?.notificationsSent ?? 0}건` },
  ];

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-6">대시보드</h1>

      {/* 통계 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((s) => (
          <Link key={s.label} to={s.to} className="card hover:border-primary-300 transition-colors">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
          </Link>
        ))}
      </div>

      {/* 빠른 이동 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
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

      {/* 내부 도구 */}
      <div className="card">
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

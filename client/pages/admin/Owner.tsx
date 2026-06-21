import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";
import AdminNav from "../../components/AdminNav";

const STATUS_LABELS: Record<string, string> = { recruiting: "모집중", filed: "소 제기", in_progress: "진행중", settled: "합의", closed: "종결" };
const ROLE_LABELS: Record<string, string> = { member: "회원", lawyer: "변호사", admin: "관리자", owner: "오너" };
const REQ_LABELS: Record<string, string> = { new: "신규", reviewing: "검토중", accepted: "채택", declined: "반려", converted: "개설완료" };
const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("ko-KR") : "-");

export default function Owner() {
  const { data } = useQuery<any>({ queryKey: ["ownerOverview"], queryFn: () => apiRequest("/api/owner/overview") });
  const won = (n: number) => `${Math.round((n || 0) / 10000).toLocaleString()}만원`;
  const toMap = (arr: any[], key: string): Record<string, number> => Object.fromEntries((arr || []).map((x) => [x[key], Number(x.c || 0)]));
  const cs = toMap(data?.casesByStatus, "status");
  const us = toMap(data?.usersByRole, "role");
  const rs = toMap(data?.requestsByStatus, "status");
  const sumv = (o: Record<string, number>) => Object.values(o).reduce((s, n) => s + n, 0);

  const kpis = [
    { label: "총 매출", value: won(data?.revenue?.total ?? 0), sub: `결제 ${data?.revenue?.count ?? 0}건`, color: "text-accent-600" },
    { label: "전체 사건", value: sumv(cs), sub: `모집중 ${cs.recruiting ?? 0}`, color: "text-primary-600" },
    { label: "당사자", value: data?.parties?.total ?? 0, sub: `결제완료 ${data?.parties?.paid ?? 0}`, color: "text-blue-600" },
    { label: "회원", value: sumv(us), sub: `사건요청 ${sumv(rs)}건`, color: "text-purple-600" },
  ];
  const links = [
    { to: "/admin", title: "업무관리", desc: "사건·당사자·경과 관리" },
    { to: "/admin/payments", title: "결제 관리", desc: "거래·정산" },
    { to: "/admin/users", title: "사용자·권한", desc: "역할 부여(오너)" },
    { to: "/admin/audit-logs", title: "감사 로그", desc: "개인정보 접근 이력" },
    { to: "/admin/case-requests", title: "사건 요청함", desc: "제보 검토·사건화" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <AdminNav />
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">관리자 콘솔</h1>
          <p className="text-sm text-gray-500 mt-1">법무법인 윈스 · 경영 현황과 최상위 관리(오너)</p>
        </div>
        <Link to="/admin" className="btn-secondary">업무관리</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="card">
            <p className="text-sm text-gray-500">{k.label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-400 mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="card">
          <h2 className="font-bold mb-3">사건 상태</h2>
          <div className="space-y-1.5 text-sm">
            {Object.keys(STATUS_LABELS).map((s) => (
              <div key={s} className="flex justify-between"><span className="text-gray-500">{STATUS_LABELS[s]}</span><span className="tabular-nums font-medium">{cs[s] ?? 0}</span></div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="font-bold mb-3">권한 분포</h2>
          <div className="space-y-1.5 text-sm">
            {Object.keys(ROLE_LABELS).map((r) => (
              <div key={r} className="flex justify-between"><span className="text-gray-500">{ROLE_LABELS[r]}</span><span className="tabular-nums font-medium">{us[r] ?? 0}</span></div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="font-bold mb-3">사건 요청</h2>
          <div className="space-y-1.5 text-sm">
            {Object.keys(REQ_LABELS).map((r) => (
              <div key={r} className="flex justify-between"><span className="text-gray-500">{REQ_LABELS[r]}</span><span className="tabular-nums font-medium">{rs[r] ?? 0}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-bold mb-3">최근 결제</h2>
          {!data?.recentPayments?.length ? (
            <p className="text-gray-400 text-sm py-4 text-center">결제 내역이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {data.recentPayments.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-gray-600 truncate">{p.caseTitle || `사건 #${p.id}`}</span>
                  <span className="tabular-nums font-medium shrink-0">{(p.amount || 0).toLocaleString()}원 <span className="text-gray-400 font-normal">{fmt(p.createdAt)}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h2 className="font-bold mb-3">빠른 관리</h2>
          <div className="grid grid-cols-1 gap-2">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="flex items-center justify-between rounded-lg border border-gray-200 px-3.5 py-2.5 hover:bg-primary-50/40 hover:border-primary-200 transition-colors">
                <span className="font-medium text-ink">{l.title}</span>
                <span className="text-xs text-gray-400">{l.desc} →</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

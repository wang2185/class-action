import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";
import { useAuth } from "../../hooks/use-auth";
import AdminNav from "../../components/AdminNav";

const STATUS_LABELS: Record<string, string> = {
  recruiting: "모집중", filed: "소 제기", in_progress: "진행중", settled: "합의", closed: "종결",
};
const STATUS_FILTERS = ["all", "recruiting", "filed", "in_progress", "settled", "closed"];

export default function AdminDashboard() {
  const { isLawyer } = useAuth();
  const { data: stats } = useQuery({ queryKey: ["adminStats"], queryFn: () => apiRequest("/api/admin/stats") });
  const { data: cases } = useQuery({ queryKey: ["cases"], queryFn: () => apiRequest("/api/cases") });
  const [q, setQ] = useState("");
  const [st, setSt] = useState("all");
  const [sort, setSort] = useState("recent");

  const filtered = useMemo(() => {
    let list: any[] = Array.isArray(cases) ? [...cases] : [];
    const kw = q.trim().toLowerCase();
    if (kw) list = list.filter((c) => [c.title, c.defendant, c.caseNumber].some((v) => String(v || "").toLowerCase().includes(kw)));
    if (st !== "all") list = list.filter((c) => c.status === st);
    list.sort((a, b) => (sort === "participants" ? (b.currentCount || 0) - (a.currentCount || 0) : (b.id || 0) - (a.id || 0)));
    return list;
  }, [cases, q, st, sort]);

  const won = (n: number) => `${Math.round((n || 0) / 10000).toLocaleString()}만원`;
  const statCards = [
    { label: "전체 사건", value: stats?.totalCases ?? 0, sub: `모집중 ${stats?.recruitingCases ?? 0}건`, color: "text-primary-600" },
    { label: "전체 당사자", value: stats?.totalParties ?? 0, sub: `결제완료 ${stats?.paidParties ?? 0}명`, color: "text-blue-600" },
    { label: "결제 대기", value: stats?.pendingPayParties ?? 0, sub: "미결제 당사자", color: "text-amber-600" },
    { label: "총 수임료", value: won(stats?.totalRevenue ?? 0), sub: "결제완료 합계", color: "text-accent-600" },
  ];
  const navCards = [
    { to: "/admin/case-requests", title: "사건 요청함", desc: "접수된 제보 검토·사건화", badge: stats?.newRequests },
    { to: "/admin/payments", title: "결제 관리", desc: "거래 조회·정산" },
    { to: "/admin/users", title: "사용자·권한", desc: `회원 ${stats?.totalUsers ?? 0}명 / 역할 관리` },
    { to: "/admin/audit-logs", title: "감사 로그", desc: `개인정보 접근 이력 · 발송 ${stats?.notificationsSent ?? 0}` },
  ];

  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (cid: number) => apiRequest(`/api/admin/cases/${cid}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cases"] }); qc.invalidateQueries({ queryKey: ["adminStats"] }); },
    onError: (e: any) => alert(e?.message || "삭제 실패"),
  });
  function confirmDelete(c: any) {
    if (window.confirm(`'${c.title}' 사건을 삭제하시겠습니까?\n당사자·증거·결제·경과 등 연결된 모든 데이터가 함께 삭제되며 되돌릴 수 없습니다.`)) del.mutate(c.id);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <AdminNav />
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold">업무관리</h1>
        <Link to="/admin/cases/new" className="btn-primary">새 사건 등록</Link>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="card">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* 빠른 메뉴 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {navCards.map((n) => (
          <Link key={n.to} to={n.to} className="card hover:border-primary-300 hover:bg-primary-50/40 transition-colors relative">
            {!!n.badge && n.badge > 0 && (
              <span className="absolute top-3 right-3 inline-flex items-center justify-center min-w-[1.4rem] h-6 px-1.5 rounded-full bg-accent-500 text-white text-xs font-bold tabular-nums">{n.badge}</span>
            )}
            <p className="font-bold text-ink">{n.title}</p>
            <p className="text-xs text-gray-500 mt-1">{n.desc}</p>
          </Link>
        ))}
      </div>

      {/* 사건 관리 */}
      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="font-bold text-lg">사건 관리</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="사건명·피고·사건번호 검색"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-56" />
            <select value={st} onChange={(e) => setSt(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === "all" ? "전체 상태" : STATUS_LABELS[s]}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              <option value="recent">최신순</option>
              <option value="participants">참여자순</option>
            </select>
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="text-gray-400 py-10 text-center">{cases && cases.length ? "검색 결과가 없습니다." : "등록된 사건이 없습니다. ‘새 사건 등록’으로 시작하세요."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-semibold">사건명</th>
                  <th className="pb-3 font-semibold">상태</th>
                  <th className="pb-3 font-semibold">피고</th>
                  <th className="pb-3 font-semibold text-right">참여자</th>
                  <th className="pb-3 font-semibold text-right">착수금</th>
                  <th className="pb-3 font-semibold text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-medium max-w-xs truncate">{c.title}</td>
                    <td className="py-3"><span className={`badge-${c.status}`}>{STATUS_LABELS[c.status] || c.status}</span></td>
                    <td className="py-3 text-gray-500">{c.defendant || "-"}</td>
                    <td className="py-3 text-right tabular-nums">{c.currentCount}{c.targetCount ? `/${c.targetCount}` : ""}</td>
                    <td className="py-3 text-right tabular-nums">{(c.retainerFee || 0).toLocaleString()}원</td>
                    <td className="py-3">
                      <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                        <Link to={`/admin/cases/${c.id}/edit`} className="text-primary-600 hover:underline">편집</Link>
                        <Link to={`/admin/cases/${c.id}/parties`} className="text-blue-600 hover:underline">당사자</Link>
                        <Link to={`/admin/cases/${c.id}/defendants`} className="text-orange-600 hover:underline">상대방</Link>
                        <Link to={`/admin/cases/${c.id}/update`} className="text-green-600 hover:underline">경과</Link>
                        {isLawyer && <Link to={`/admin/cases/${c.id}/package`} className="text-purple-600 hover:underline">서면자료</Link>}
                        <button onClick={() => confirmDelete(c)} disabled={del.isPending} className="text-red-600 hover:underline disabled:opacity-50">삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 내부 도구 */}
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

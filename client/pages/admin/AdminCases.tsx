import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";
import { useAuth } from "../../hooks/use-auth";

const STATUS_LABELS: Record<string, string> = {
  recruiting: "모집중", filed: "소 제기", in_progress: "진행중", settled: "합의", closed: "종결",
};
const STATUS_FILTERS = ["all", "recruiting", "filed", "in_progress", "settled", "closed"];

export default function AdminCases() {
  const { isLawyer } = useAuth();
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
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold">전체 사건 관리</h1>
        <Link to="/admin/cases/new" className="btn-primary">새 사건 등록</Link>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="font-bold text-lg">사건 목록 <span className="text-sm text-gray-400 font-normal">{Array.isArray(cases) ? `${cases.length}건` : ""}</span></h2>
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
    </div>
  );
}

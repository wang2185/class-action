import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";

const STATUS_LABELS: Record<string, string> = {
  recruiting: "모집중", filed: "소 제기", in_progress: "진행중", settled: "합의", closed: "종결",
};
const STATUS_FILTERS = ["all", "recruiting", "filed", "in_progress", "settled", "closed"];

export default function LawyerCases() {
  const { data: cases, isLoading } = useQuery<any[]>({ queryKey: ["cases"], queryFn: () => apiRequest("/api/cases") });
  const [q, setQ] = useState("");
  const [st, setSt] = useState("all");

  const filtered = useMemo(() => {
    let list: any[] = Array.isArray(cases) ? [...cases] : [];
    const kw = q.trim().toLowerCase();
    if (kw) list = list.filter((c) => [c.title, c.defendant, c.caseNumber].some((v) => String(v || "").toLowerCase().includes(kw)));
    if (st !== "all") list = list.filter((c) => c.status === st);
    return list.sort((a, b) => (b.id || 0) - (a.id || 0));
  }, [cases, q, st]);

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-1">수임 사건 진행</h1>
      <p className="text-sm text-gray-500 mb-6">담당 사건의 당사자·경과·서면자료를 관리합니다.</p>

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="font-bold text-lg">사건 목록 <span className="text-sm text-gray-400 font-normal">{filtered.length}건</span></h2>
          <div className="flex items-center gap-2 flex-wrap">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="사건명·피고·사건번호 검색"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-56" />
            <select value={st} onChange={(e) => setSt(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === "all" ? "전체 상태" : STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
        {isLoading ? (
          <p className="text-gray-400 py-10 text-center">불러오는 중…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 py-10 text-center">{cases && cases.length ? "검색 결과가 없습니다." : "사건이 없습니다."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-semibold">사건명</th>
                  <th className="pb-3 font-semibold">상태</th>
                  <th className="pb-3 font-semibold">피고</th>
                  <th className="pb-3 font-semibold text-right">참여자</th>
                  <th className="pb-3 font-semibold text-center">작업</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-medium max-w-xs truncate">{c.title}</td>
                    <td className="py-3"><span className={`badge-${c.status}`}>{STATUS_LABELS[c.status] || c.status}</span></td>
                    <td className="py-3 text-gray-500">{c.defendant || "-"}</td>
                    <td className="py-3 text-right tabular-nums">{c.currentCount}{c.targetCount ? `/${c.targetCount}` : ""}</td>
                    <td className="py-3">
                      <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                        <Link to={`/admin/cases/${c.id}/parties`} className="text-blue-600 hover:underline">당사자</Link>
                        <Link to={`/admin/cases/${c.id}/update`} className="text-green-600 hover:underline">경과</Link>
                        <Link to={`/admin/cases/${c.id}/package`} className="text-purple-600 hover:underline">서면자료</Link>
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

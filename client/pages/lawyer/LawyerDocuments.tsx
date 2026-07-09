import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";

const STATUS_LABELS: Record<string, string> = {
  recruiting: "모집중", filed: "소 제기", in_progress: "진행중", settled: "합의", closed: "종결",
};

export default function LawyerDocuments() {
  const { data: cases, isLoading } = useQuery<any[]>({ queryKey: ["cases"], queryFn: () => apiRequest("/api/cases") });
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const list: any[] = Array.isArray(cases) ? [...cases] : [];
    const kw = q.trim().toLowerCase();
    return (kw ? list.filter((c) => [c.title, c.defendant].some((v) => String(v || "").toLowerCase().includes(kw))) : list)
      .sort((a, b) => (b.id || 0) - (a.id || 0));
  }, [cases, q]);

  function exportZip(id: number) {
    window.open(`/api/lawyer/cases/${id}/package/export`, "_blank");
  }

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-1">자동 문서 작성</h1>
      <p className="text-sm text-gray-500 mb-6">
        사건별 당사자·증거 자료를 별지 당사자목록·청구금액 합계·입증방법(호증 순)으로 집계해 ZIP으로 내보냅니다.
        내려받은 자료로 소장·준비서면을 작성합니다.
      </p>

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="font-bold text-lg">사건별 서면자료</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="사건명·피고 검색"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-56" />
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
                  <th className="pb-3 font-semibold text-right">당사자</th>
                  <th className="pb-3 font-semibold text-center">서면자료</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-medium max-w-xs truncate">{c.title}</td>
                    <td className="py-3"><span className={`badge-${c.status}`}>{STATUS_LABELS[c.status] || c.status}</span></td>
                    <td className="py-3 text-right tabular-nums">{c.currentCount}명</td>
                    <td className="py-3">
                      <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                        <Link to={`/admin/cases/${c.id}/package`} className="text-purple-600 hover:underline">패키지 열기</Link>
                        <button onClick={() => exportZip(c.id)} className="text-primary-600 hover:underline">ZIP 내보내기</button>
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

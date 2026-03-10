import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  recruiting: "모집중", filed: "소 제기", in_progress: "진행중",
  settled: "합의", closed: "종결",
};

export default function CaseList() {
  const { data: cases, isLoading } = useQuery({ queryKey: ["cases"], queryFn: () => apiRequest("/api/cases") });
  const [filter, setFilter] = useState("all");

  const filtered = cases?.filter((c: any) => filter === "all" || c.status === filter) || [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">단체소송 사건 목록</h1>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { value: "all", label: "전체" },
          { value: "recruiting", label: "모집중" },
          { value: "filed", label: "소 제기" },
          { value: "in_progress", label: "진행중" },
          { value: "settled", label: "합의" },
          { value: "closed", label: "종결" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              filter === f.value
                ? "bg-primary-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">해당 조건의 사건이 없습니다.</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((c: any) => (
            <Link key={c.id} to={`/cases/${c.id}`} className="card hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-3">
                <span className={`badge-${c.status}`}>{STATUS_LABELS[c.status] || c.status}</span>
                {c.caseType && <span className="text-xs text-gray-400">{c.caseType}</span>}
              </div>
              <h2 className="font-bold text-lg mb-2 group-hover:text-primary-500 transition-colors line-clamp-2">{c.title}</h2>
              <p className="text-sm text-gray-500 mb-4 line-clamp-2">{c.summary}</p>
              <div className="space-y-1 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>피고</span>
                  <span className="font-medium">{c.defendant || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span>참여자</span>
                  <span className="font-medium text-primary-500">
                    {c.currentCount}{c.targetCount ? ` / ${c.targetCount}` : ""}명
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>착수금</span>
                  <span className="font-bold">{(c.retainerFee || 0).toLocaleString()}원</span>
                </div>
              </div>
              {c.status === "recruiting" && (
                <div className="mt-4 pt-3 border-t">
                  <span className="btn-primary w-full text-center block text-sm">참여 신청하기</span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* 홍보 */}
      <div className="mt-12 promo-banner">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold">법률 상담이 필요하신가요?</h3>
            <p className="text-white/80 text-sm mt-1">데이로이어에서 월정액 법률 상담 서비스를 이용해보세요.</p>
          </div>
          <a href="https://day.lawyer" target="_blank" rel="noopener noreferrer" className="btn bg-white text-primary-500 hover:bg-gray-100 shrink-0">
            day.lawyer 바로가기
          </a>
        </div>
      </div>
    </div>
  );
}

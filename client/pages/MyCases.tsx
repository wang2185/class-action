import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";

const STATUS_LABELS: Record<string, string> = {
  recruiting: "모집중", filed: "소 제기", in_progress: "진행중", settled: "합의", closed: "종결",
};
const PARTY_STATUS: Record<string, string> = {
  registered: "정보등록", contracted: "계약완료", paid: "결제완료", verified: "확인완료",
};

export default function MyCases() {
  const { data, isLoading } = useQuery({ queryKey: ["myCases"], queryFn: () => apiRequest("/api/my/cases") });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">내 사건</h1>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400">불러오는 중...</div>
      ) : !data || data.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 mb-4">참여한 사건이 없습니다.</p>
          <Link to="/cases" className="btn-primary">사건 목록 보기</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {data.map(({ party, case: c }: any) => (
            <div key={party.id} className="card">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`badge-${c.status}`}>{STATUS_LABELS[c.status]}</span>
                    <span className="badge bg-gray-100 text-gray-600">{PARTY_STATUS[party.status]}</span>
                    {party.paymentStatus === "completed" && <span className="badge bg-green-100 text-green-700">결제완료</span>}
                  </div>
                  <Link to={`/cases/${c.id}`} className="font-bold text-lg hover:text-primary-500 transition-colors">{c.title}</Link>
                  <p className="text-sm text-gray-500 mt-1">피고: {c.defendant} | 착수금: {(c.retainerFee || 0).toLocaleString()}원</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {party.status === "registered" && (
                    <Link to={`/cases/${c.id}/contract`} className="btn-primary text-xs">계약 체결</Link>
                  )}
                  {party.status === "contracted" && party.paymentStatus !== "completed" && (
                    <Link to={`/cases/${c.id}/payment`} className="btn-accent text-xs">착수금 결제</Link>
                  )}
                  <Link to={`/cases/${c.id}/progress`} className="btn-secondary text-xs">경과 보기</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 홍보 */}
      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <a href="https://day.lawyer" target="_blank" rel="noopener noreferrer" className="card bg-primary-50 hover:bg-primary-100 transition-colors">
          <p className="font-bold text-primary-600">데이로이어</p>
          <p className="text-sm text-primary-500 mt-1">월정액 법률 상담 서비스 →</p>
        </a>
        <a href="https://willsave.co.kr" target="_blank" rel="noopener noreferrer" className="card bg-purple-50 hover:bg-purple-100 transition-colors">
          <p className="font-bold text-purple-600">윌세이브</p>
          <p className="text-sm text-purple-500 mt-1">유언장 작성·보관 서비스 →</p>
        </a>
      </div>
    </div>
  );
}

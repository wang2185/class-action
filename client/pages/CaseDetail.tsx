import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useAuth } from "../hooks/use-auth";

const STATUS_LABELS: Record<string, string> = {
  recruiting: "모집중", filed: "소 제기", in_progress: "진행중", settled: "합의", closed: "종결",
};
const UPDATE_LABELS: Record<string, string> = {
  notice: "공지", filing: "소제기", hearing: "기일", ruling: "판결", settlement: "합의", document: "서류",
};

export default function CaseDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const { data: caseData, isLoading } = useQuery({
    queryKey: ["case", id],
    queryFn: () => apiRequest(`/api/cases/${id}`),
  });

  const { data: myParty } = useQuery({
    queryKey: ["myParty", id],
    queryFn: () => apiRequest(`/api/cases/${id}/my-party`),
    enabled: !!user,
    retry: false,
  });

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]">불러오는 중...</div>;
  if (!caseData) return <div className="flex items-center justify-center min-h-[60vh]">사건을 찾을 수 없습니다.</div>;

  const c = caseData;
  const isRecruiting = c.status === "recruiting";
  const hasJoined = !!myParty;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className={`badge-${c.status}`}>{STATUS_LABELS[c.status]}</span>
          {c.caseType && <span className="text-sm text-gray-400">{c.caseType}</span>}
          {c.caseNumber && <span className="text-sm text-gray-400">사건번호: {c.caseNumber}</span>}
        </div>
        <h1 className="text-3xl font-bold mb-3">{c.title}</h1>
        {c.summary && <p className="text-lg text-gray-600">{c.summary}</p>}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* 사건 정보 */}
        <div className="md:col-span-2 space-y-6">
          {c.description && (
            <div className="card">
              <h2 className="font-bold text-lg mb-3">사건 상세</h2>
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">{c.description}</div>
            </div>
          )}

          {/* 경과 */}
          {c.updates && c.updates.length > 0 && (
            <div className="card">
              <h2 className="font-bold text-lg mb-4">사건 경과</h2>
              <div className="space-y-4">
                {c.updates.map((u: any) => (
                  <div key={u.id} className="border-l-4 border-primary-500 pl-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="badge bg-primary-100 text-primary-700">{UPDATE_LABELS[u.updateType] || u.updateType}</span>
                      <span className="text-xs text-gray-400">{new Date(u.createdAt).toLocaleDateString("ko-KR")}</span>
                    </div>
                    <h3 className="font-semibold">{u.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{u.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 사이드바 */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-bold mb-3">사건 정보</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">피고</dt><dd className="font-medium">{c.defendant || "-"}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">관할법원</dt><dd className="font-medium">{c.courtName || "-"}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">참여자</dt><dd className="font-bold text-primary-500">{c.partyCount || c.currentCount || 0}명</dd></div>
              {c.targetCount && <div className="flex justify-between"><dt className="text-gray-500">목표인원</dt><dd className="font-medium">{c.targetCount}명</dd></div>}
              <div className="flex justify-between"><dt className="text-gray-500">착수금</dt><dd className="font-bold text-lg">{(c.retainerFee || 0).toLocaleString()}원</dd></div>
              {c.filingDate && <div className="flex justify-between"><dt className="text-gray-500">소제기일</dt><dd>{new Date(c.filingDate).toLocaleDateString("ko-KR")}</dd></div>}
            </dl>
          </div>

          {/* 참여 상태별 버튼 */}
          <div className="card space-y-3">
            {!user ? (
              <>
                <p className="text-sm text-gray-500">로그인 후 참여할 수 있습니다.</p>
                <Link to="/login" className="btn-primary w-full text-center block">로그인</Link>
                <Link to="/register" className="btn-secondary w-full text-center block">회원가입</Link>
              </>
            ) : !hasJoined ? (
              isRecruiting ? (
                <Link to={`/cases/${id}/join`} className="btn-primary w-full text-center block">참여 신청하기</Link>
              ) : (
                <p className="text-sm text-gray-500 text-center">현재 모집 기간이 아닙니다.</p>
              )
            ) : (
              <>
                <div className="text-sm text-center text-green-600 font-semibold bg-green-50 rounded-lg py-2">참여 완료</div>
                {myParty.status === "registered" && (
                  <Link to={`/cases/${id}/contract`} className="btn-primary w-full text-center block">수임계약 체결</Link>
                )}
                {myParty.status === "contracted" && myParty.paymentStatus !== "completed" && (
                  <Link to={`/cases/${id}/payment`} className="btn-accent w-full text-center block">착수금 결제</Link>
                )}
                <Link to={`/cases/${id}/progress`} className="btn-secondary w-full text-center block">사건 경과 보기</Link>

                {/* 지급명령 / 가압류 */}
                {c.supportsPaymentOrder && (
                  <Link to={`/cases/${id}/payment-order`} className="btn-secondary w-full text-center block">지급명령 신청</Link>
                )}
                {c.supportsProvisionalSeizure && (
                  <Link to={`/cases/${id}/seizure`} className="btn-secondary w-full text-center block">가압류 신청</Link>
                )}

                {/* 성공보수 자동결제 */}
                <Link to={`/cases/${id}/billing`} className="btn-secondary w-full text-center block text-xs">성공보수 카드 등록</Link>
              </>
            )}
          </div>

          {/* day-lawyer 홍보 */}
          <a href="https://day.lawyer" target="_blank" rel="noopener noreferrer" className="block card bg-primary-50 hover:bg-primary-100 transition-colors">
            <p className="text-sm font-semibold text-primary-600">개별 법률 상담이 필요하신가요?</p>
            <p className="text-xs text-primary-500 mt-1">데이로이어에서 월정액 상담을 이용해보세요 →</p>
          </a>
        </div>
      </div>
    </div>
  );
}

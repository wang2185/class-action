import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../../lib/queryClient";

const PARTY_STATUS: Record<string, string> = {
  registered: "정보등록", contracted: "계약완료", paid: "결제완료", verified: "확인완료",
};
const PAY_STATUS: Record<string, string> = {
  pending: "미결제", completed: "결제완료", refunded: "환불",
};

export default function AdminParties() {
  const { id } = useParams();

  const { data: caseData } = useQuery({ queryKey: ["case", id], queryFn: () => apiRequest(`/api/cases/${id}`) });
  const { data: parties, isLoading } = useQuery({
    queryKey: ["adminParties", id],
    queryFn: () => apiRequest(`/api/admin/cases/${id}/parties`),
  });

  const statusMutation = useMutation({
    mutationFn: ({ partyId, status }: { partyId: number; status: string }) =>
      apiRequest(`/api/admin/parties/${partyId}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminParties", id] }),
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">당사자 관리</h1>
      {caseData && <p className="text-gray-500 mb-6">{caseData.title} — {parties?.length || 0}명</p>}

      {isLoading ? (
        <p className="text-center py-8 text-gray-400">불러오는 중...</p>
      ) : !parties || parties.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400">참여한 당사자가 없습니다.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-3 font-semibold">이름</th>
                <th className="pb-3 font-semibold">전화번호</th>
                <th className="pb-3 font-semibold">이메일</th>
                <th className="pb-3 font-semibold">피해금액</th>
                <th className="pb-3 font-semibold">상태</th>
                <th className="pb-3 font-semibold">결제</th>
                <th className="pb-3 font-semibold">계약</th>
                <th className="pb-3 font-semibold text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {parties.map((p: any) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 font-medium">{p.name}</td>
                  <td className="py-3 text-gray-500">{p.phone || "-"}</td>
                  <td className="py-3 text-gray-500">{p.email || "-"}</td>
                  <td className="py-3">{p.damageAmount ? `${p.damageAmount.toLocaleString()}원` : "-"}</td>
                  <td className="py-3">
                    <span className="badge bg-gray-100 text-gray-700">{PARTY_STATUS[p.status] || p.status}</span>
                  </td>
                  <td className="py-3">
                    <span className={`badge ${p.paymentStatus === "completed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {PAY_STATUS[p.paymentStatus] || p.paymentStatus}
                    </span>
                  </td>
                  <td className="py-3">
                    {p.contractAgreed
                      ? <span className="text-green-600 text-xs">체결완료</span>
                      : <span className="text-gray-400 text-xs">미체결</span>}
                  </td>
                  <td className="py-3 text-center">
                    <select
                      className="text-xs border rounded px-2 py-1"
                      value={p.status}
                      onChange={(e) => statusMutation.mutate({ partyId: p.id, status: e.target.value })}
                    >
                      <option value="registered">정보등록</option>
                      <option value="contracted">계약완료</option>
                      <option value="paid">결제완료</option>
                      <option value="verified">확인완료</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

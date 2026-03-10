import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useState } from "react";

export default function PaymentOrderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    creditorName: "", debtorName: "", claimAmount: "", claimReason: "", courtName: "",
  });
  const [error, setError] = useState("");

  const { data: caseData } = useQuery({ queryKey: ["case", id], queryFn: () => apiRequest(`/api/cases/${id}`) });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/cases/${id}/payment-order`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => navigate(`/cases/${id}/progress`),
    onError: (err: any) => setError(err.message),
  });

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">지급명령 신청</h1>
      {caseData && <p className="text-gray-500 mb-6">{caseData.title}</p>}
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}

      <div className="card space-y-4">
        <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">지급명령이란?</p>
          <p>채권자가 금전 등의 지급을 구하는 경우, 소송 없이 법원에 지급명령을 신청하여 빠르게 집행권원을 확보하는 절차입니다.</p>
          <a href="https://docurepeat.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline mt-2 inline-block">
            DocuRepeat에서 신청서 자동 생성 →
          </a>
        </div>

        <div>
          <label className="label">채권자 (신청인) *</label>
          <input type="text" className="input" value={form.creditorName} onChange={(e) => update("creditorName", e.target.value)} required />
        </div>
        <div>
          <label className="label">채무자 (상대방) *</label>
          <input type="text" className="input" value={form.debtorName} onChange={(e) => update("debtorName", e.target.value)} required />
        </div>
        <div>
          <label className="label">청구금액 (원) *</label>
          <input type="number" className="input" value={form.claimAmount} onChange={(e) => update("claimAmount", e.target.value)} required />
        </div>
        <div>
          <label className="label">관할법원</label>
          <input type="text" className="input" value={form.courtName} onChange={(e) => update("courtName", e.target.value)} placeholder="예: 서울중앙지방법원" />
        </div>
        <div>
          <label className="label">청구원인 *</label>
          <textarea className="input min-h-[150px]" value={form.claimReason} onChange={(e) => update("claimReason", e.target.value)} required
            placeholder="청구의 원인이 되는 사실관계를 기재해주세요" />
        </div>

        <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending} className="btn-primary w-full">
          {mutation.isPending ? "제출 중..." : "지급명령 신청"}
        </button>
      </div>
    </div>
  );
}

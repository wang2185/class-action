import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useState } from "react";

export default function SeizureForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    creditorName: "", debtorName: "", seizureAmount: "", seizureReason: "",
    propertyType: "real_estate", propertyDetail: "", propertyValue: "", courtName: "",
  });
  const [error, setError] = useState("");

  const { data: caseData } = useQuery({ queryKey: ["case", id], queryFn: () => apiRequest(`/api/cases/${id}`) });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/cases/${id}/provisional-seizure`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => navigate(`/cases/${id}/progress`),
    onError: (err: any) => setError(err.message),
  });

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">가압류 신청</h1>
      {caseData && <p className="text-gray-500 mb-6">{caseData.title}</p>}
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}

      <div className="card space-y-4">
        <div className="bg-yellow-50 rounded-lg p-4 text-sm text-yellow-800">
          <p className="font-semibold mb-1">가압류란?</p>
          <p>채무자의 재산을 미리 동결하여 판결 후 강제집행을 보전하는 절차입니다.</p>
          <div className="flex gap-3 mt-2">
            <a href="https://gongsi.estate" target="_blank" rel="noopener noreferrer" className="text-yellow-700 hover:underline">
              시가 조회 (Siga-Lookup) →
            </a>
            <a href="https://docurepeat.com" target="_blank" rel="noopener noreferrer" className="text-yellow-700 hover:underline">
              신청서 자동 생성 (DocuRepeat) →
            </a>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">채권자 *</label>
            <input type="text" className="input" value={form.creditorName} onChange={(e) => update("creditorName", e.target.value)} required />
          </div>
          <div>
            <label className="label">채무자 *</label>
            <input type="text" className="input" value={form.debtorName} onChange={(e) => update("debtorName", e.target.value)} required />
          </div>
        </div>

        <div>
          <label className="label">가압류 금액 (원) *</label>
          <input type="number" className="input" value={form.seizureAmount} onChange={(e) => update("seizureAmount", e.target.value)} required />
        </div>

        <div>
          <label className="label">대상 재산 유형 *</label>
          <select className="input" value={form.propertyType} onChange={(e) => update("propertyType", e.target.value)}>
            <option value="real_estate">부동산</option>
            <option value="bank_account">예금채권 (은행계좌)</option>
            <option value="vehicle">자동차</option>
            <option value="other">기타</option>
          </select>
        </div>

        <div>
          <label className="label">재산 상세 정보</label>
          <textarea className="input min-h-[100px]" value={form.propertyDetail} onChange={(e) => update("propertyDetail", e.target.value)}
            placeholder="부동산: 소재지, 지번 / 예금: 은행명, 지점 / 자동차: 차량번호 등" />
        </div>

        <div>
          <label className="label">재산 시가 (원)</label>
          <input type="number" className="input" value={form.propertyValue} onChange={(e) => update("propertyValue", e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">
            부동산 시가는 <a href="https://gongsi.estate" target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline">gongsi.estate</a>에서 조회 가능합니다.
          </p>
        </div>

        <div>
          <label className="label">관할법원</label>
          <input type="text" className="input" value={form.courtName} onChange={(e) => update("courtName", e.target.value)} />
        </div>

        <div>
          <label className="label">가압류 사유 *</label>
          <textarea className="input min-h-[150px]" value={form.seizureReason} onChange={(e) => update("seizureReason", e.target.value)} required
            placeholder="가압류가 필요한 사유를 기재해주세요" />
        </div>

        <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending} className="btn-primary w-full">
          {mutation.isPending ? "제출 중..." : "가압류 신청"}
        </button>
      </div>
    </div>
  );
}

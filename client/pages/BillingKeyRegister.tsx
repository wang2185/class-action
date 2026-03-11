import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useState } from "react";

export default function BillingKeyRegister() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    cardNumber: "", expMonth: "", expYear: "", cardPw: "", idNo: "",
  });
  const [thirdPartyConsent, setThirdPartyConsent] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: caseData } = useQuery({ queryKey: ["case", id], queryFn: () => apiRequest(`/api/cases/${id}`) });

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!thirdPartyConsent) { setError("개인정보 제3자 제공 동의가 필요합니다."); return; }
    setLoading(true);
    try {
      await apiRequest("/api/consent", { method: "POST", body: JSON.stringify({ consentTypes: ["third_party_sharing"], version: "1.0" }) });
      await apiRequest(`/api/cases/${id}/billing-key`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "등록 실패");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="card py-12">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-green-600 mb-3">카드 등록 완료</h1>
          <p className="text-gray-500 mb-6">성공보수 자동결제 카드가 등록되었습니다.</p>
          <button onClick={() => navigate(`/cases/${id}/progress`)} className="btn-primary">사건 경과 보기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">성공보수 카드 등록</h1>
      {caseData && <p className="text-gray-500 mb-6">{caseData.title}</p>}
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}

      <div className="card">
        <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 mb-6">
          <p className="font-semibold mb-1">성공보수 자동결제란?</p>
          <p>소송 승소 시 합의된 성공보수가 등록된 카드로 자동 결제됩니다. 카드 정보는 NicePay에 안전하게 저장되며, 당사 서버에는 보관되지 않습니다.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">카드번호 *</label>
            <input type="text" className="input" value={form.cardNumber} onChange={(e) => update("cardNumber", e.target.value.replace(/\D/g, ""))}
              required maxLength={16} placeholder="0000 0000 0000 0000" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">유효기간 (월) *</label>
              <input type="text" className="input" value={form.expMonth} onChange={(e) => update("expMonth", e.target.value.replace(/\D/g, ""))}
                required maxLength={2} placeholder="MM" />
            </div>
            <div>
              <label className="label">유효기간 (년) *</label>
              <input type="text" className="input" value={form.expYear} onChange={(e) => update("expYear", e.target.value.replace(/\D/g, ""))}
                required maxLength={2} placeholder="YY" />
            </div>
          </div>

          <div>
            <label className="label">카드 비밀번호 앞 2자리 *</label>
            <input type="password" className="input" value={form.cardPw} onChange={(e) => update("cardPw", e.target.value.replace(/\D/g, ""))}
              required maxLength={2} placeholder="**" />
          </div>

          <div>
            <label className="label">생년월일 (6자리) 또는 사업자번호 *</label>
            <input type="text" className="input" value={form.idNo} onChange={(e) => update("idNo", e.target.value.replace(/\D/g, ""))}
              required maxLength={10} placeholder="YYMMDD" />
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={thirdPartyConsent} onChange={(e) => setThirdPartyConsent(e.target.checked)} className="mt-0.5" />
              <span>결제 처리를 위해 나이스페이먼츠(주)에 개인정보(성명, 연락처, 카드정보)를 제공하는 것에 동의합니다. <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-500 underline">개인정보처리방침</Link> (필수)</span>
            </label>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "등록 중..." : "카드 등록"}
          </button>
        </form>
      </div>
    </div>
  );
}

import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../lib/queryClient";
import { useState } from "react";

export default function JoinCase() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "",
    residentNumber: "", damageAmount: "", damageDescription: "",
  });
  const [piiConsent, setPiiConsent] = useState(false);
  const [error, setError] = useState("");

  const { data: caseData } = useQuery({
    queryKey: ["case", id],
    queryFn: () => apiRequest(`/api/cases/${id}`),
  });

  const joinMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/cases/${id}/join`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myCases"] });
      navigate(`/cases/${id}/contract`);
    },
    onError: (err: any) => setError(err.message),
  });

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!piiConsent) { setError("개인정보 수집·이용 동의가 필요합니다."); return; }
    if (!form.name) { setError("이름은 필수입니다."); return; }
    // 동의 기록 저장 후 참여 신청
    try {
      await apiRequest("/api/consent", { method: "POST", body: JSON.stringify({ consentTypes: ["pii_collection"], version: "1.0" }) });
    } catch { setError("동의 기록 저장에 실패했습니다. 다시 시도해주세요."); return; }
    joinMutation.mutate(form);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">참여 신청</h1>
      {caseData && <p className="text-gray-500 mb-6">{caseData.title}</p>}

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="card space-y-4">
        <h2 className="font-bold text-lg border-b pb-2">당사자 정보</h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">이름 *</label>
            <input type="text" className="input" value={form.name} onChange={(e) => update("name", e.target.value)} required />
          </div>
          <div>
            <label className="label">전화번호</label>
            <input type="tel" className="input" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="010-0000-0000" />
          </div>
        </div>

        <div>
          <label className="label">이메일</label>
          <input type="email" className="input" value={form.email} onChange={(e) => update("email", e.target.value)} />
        </div>

        <div>
          <label className="label">주소</label>
          <input type="text" className="input" value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="주민등록상 주소" />
        </div>

        <div>
          <label className="label">주민등록번호</label>
          <input type="text" className="input" value={form.residentNumber} onChange={(e) => update("residentNumber", e.target.value)} placeholder="000000-0000000" />
          <p className="text-xs text-gray-400 mt-1">소장 작성에 필요합니다. 암호화 저장됩니다.</p>
        </div>

        <div>
          <label className="label">피해 금액 (원)</label>
          <input type="number" className="input" value={form.damageAmount} onChange={(e) => update("damageAmount", e.target.value)} placeholder="피해액을 입력하세요" />
        </div>

        <div>
          <label className="label">피해 내용</label>
          <textarea className="input min-h-[120px]" value={form.damageDescription} onChange={(e) => update("damageDescription", e.target.value)} placeholder="구체적인 피해 내용을 기재해주세요" />
        </div>

        <h2 className="font-bold text-lg border-b pb-2 pt-4">증거 파일 업로드</h2>
        <p className="text-sm text-gray-500">참여 신청 후 증거 파일을 업로드할 수 있습니다.</p>

        <div className="bg-gray-50 rounded-lg p-4">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={piiConsent} onChange={(e) => setPiiConsent(e.target.checked)} className="mt-0.5" />
            <span>소송 진행을 위한 개인정보(이름, 연락처, 주소, 주민등록번호, 피해내용) 수집·이용에 동의합니다. 주민등록번호는 AES-256-GCM으로 암호화 저장됩니다. <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-500 underline">개인정보처리방침</Link> (필수)</span>
          </label>
        </div>

        <button type="submit" disabled={joinMutation.isPending} className="btn-primary w-full">
          {joinMutation.isPending ? "제출 중..." : "참여 신청"}
        </button>
      </form>
    </div>
  );
}

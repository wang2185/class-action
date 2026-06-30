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
  const [residentConsent, setResidentConsent] = useState(false);
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
    const hasResident = form.residentNumber.trim().length > 0;
    if (hasResident && !residentConsent) {
      setError("주민등록번호(고유식별정보) 수집에는 별도 동의가 필요합니다. 동의하지 않으시려면 주민등록번호를 비워두세요.");
      return;
    }
    // 동의 기록 저장 후 참여 신청 — 주민등록번호는 일반 개인정보와 별도 동의유형으로 분리 기록(개인정보 보호법 제24조의2)
    const consentTypes = ["pii_collection"];
    if (hasResident && residentConsent) consentTypes.push("unique_id_collection");
    try {
      await apiRequest("/api/consent", { method: "POST", body: JSON.stringify({ consentTypes }) });
    } catch { setError("동의 기록 저장에 실패했습니다. 다시 시도해주세요."); return; }
    joinMutation.mutate(form);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">참여 신청</h1>
      {caseData && <p className="text-gray-500 mb-6">{caseData.title}</p>}

      {error && <div role="alert" className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="card space-y-4">
        <h2 className="font-bold text-lg border-b pb-2">당사자 정보</h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="join-name" className="label">이름 *</label>
            <input id="join-name" name="name" type="text" autoComplete="name" className="input" value={form.name} onChange={(e) => update("name", e.target.value)} required />
          </div>
          <div>
            <label htmlFor="join-phone" className="label">전화번호</label>
            <input id="join-phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel" className="input" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="010-0000-0000" />
          </div>
        </div>

        <div>
          <label htmlFor="join-email" className="label">이메일</label>
          <input id="join-email" name="email" type="email" autoComplete="email" spellCheck={false} className="input" value={form.email} onChange={(e) => update("email", e.target.value)} />
        </div>

        <div>
          <label htmlFor="join-address" className="label">주소</label>
          <input id="join-address" name="address" type="text" autoComplete="street-address" className="input" value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="주민등록상 주소" />
        </div>

        <div>
          <label htmlFor="join-resident-number" className="label">주민등록번호</label>
          <input id="join-resident-number" name="residentNumber" type="text" autoComplete="off" spellCheck={false} className="input" value={form.residentNumber} onChange={(e) => update("residentNumber", e.target.value)} placeholder="000000-0000000" />
          <p className="text-xs text-gray-400 mt-1">소장 작성에 필요합니다. 암호화 저장됩니다.</p>
        </div>

        <div>
          <label htmlFor="join-damage-amount" className="label">피해 금액 (원)</label>
          <input id="join-damage-amount" name="damageAmount" type="number" inputMode="numeric" className="input" value={form.damageAmount} onChange={(e) => update("damageAmount", e.target.value)} placeholder="피해액을 입력하세요" />
        </div>

        <div>
          <label htmlFor="join-damage-description" className="label">피해 내용</label>
          <textarea id="join-damage-description" name="damageDescription" className="input min-h-[120px]" value={form.damageDescription} onChange={(e) => update("damageDescription", e.target.value)} placeholder="구체적인 피해 내용을 기재해주세요" />
        </div>

        <h2 className="font-bold text-lg border-b pb-2 pt-4">증거 파일 업로드</h2>
        <p className="text-sm text-gray-500">참여 신청 후 증거 파일을 업로드할 수 있습니다.</p>

        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={piiConsent} onChange={(e) => setPiiConsent(e.target.checked)} className="mt-0.5" />
            <span><strong>[필수]</strong> 소송 진행을 위한 개인정보(이름, 연락처, 주소, 피해금액·내용) 수집·이용에 동의합니다. <Link to="/consent" target="_blank" rel="noopener noreferrer" className="text-primary-500 underline">수집·이용 동의서</Link> · <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-500 underline">개인정보처리방침</Link></span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={residentConsent} onChange={(e) => setResidentConsent(e.target.checked)} className="mt-0.5" />
            <span><strong>[필수 — 주민등록번호 입력 시]</strong> 고유식별정보(주민등록번호)의 수집·이용에 별도로 동의합니다(개인정보 보호법 제24조의2). 주민등록번호는 AES-256-GCM으로 암호화 저장되며, 소장 작성 등 소송 수행 목적 외에는 이용되지 않습니다. 동의하지 않으시면 주민등록번호를 비워두고 신청할 수 있습니다.</span>
          </label>
        </div>

        <button type="submit" disabled={joinMutation.isPending} className="btn-primary w-full">
          {joinMutation.isPending ? "제출 중…" : "참여 신청"}
        </button>
      </form>
    </div>
  );
}

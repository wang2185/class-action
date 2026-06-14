import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/use-auth";
import { apiRequest } from "../lib/queryClient";

// 신규 소셜 가입자 동의 절차 — 콜백이 로그인 처리 후 이 페이지로 보낸다.
export default function Welcome() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [consents, setConsents] = useState({ terms: false, pii: false, marketing: false });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]">로딩 중…</div>;
  if (!user) { navigate("/login", { replace: true }); return null; }

  const submit = async () => {
    setError("");
    if (!consents.terms || !consents.pii) { setError("필수 약관에 모두 동의해주세요."); return; }
    setSaving(true);
    try {
      const consentTypes = ["service_terms", "pii_collection", ...(consents.marketing ? ["marketing"] : [])];
      await apiRequest("/api/consent", { method: "POST", body: JSON.stringify({ consentTypes, version: "1.0" }) });
      navigate("/my", { replace: true });
    } catch (e: any) {
      setError(e?.message || "처리 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="card max-w-md w-full">
        <h1 className="text-2xl font-bold text-center mb-2">환영합니다, {user.name}님</h1>
        <p className="text-center text-sm text-ink-muted mb-6">서비스 이용을 위해 약관에 동의해주세요.</p>
        {error && <div role="alert" className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}

        <div className="space-y-2.5 bg-gray-50 rounded-lg p-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-ink cursor-pointer pb-2 border-b border-gray-200">
            <input type="checkbox"
              checked={consents.terms && consents.pii && consents.marketing}
              onChange={(e) => setConsents({ terms: e.target.checked, pii: e.target.checked, marketing: e.target.checked })}
              className="w-4 h-4 accent-[#0C6A77]" />
            <span>전체 동의</span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={consents.terms} onChange={(e) => setConsents((p) => ({ ...p, terms: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-[#0C6A77]" />
            <span><Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">이용약관</Link>에 동의합니다. <span className="text-red-600">(필수)</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={consents.pii} onChange={(e) => setConsents((p) => ({ ...p, pii: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-[#0C6A77]" />
            <span><Link to="/consent" target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">개인정보 수집·이용</Link>에 동의합니다. <span className="text-red-600">(필수)</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={consents.marketing} onChange={(e) => setConsents((p) => ({ ...p, marketing: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-[#0C6A77]" />
            <span>마케팅 정보 수신에 동의합니다. <span className="text-gray-400">(선택)</span></span>
          </label>
        </div>

        <button onClick={submit} disabled={saving} className="btn-primary w-full mt-5">
          {saving ? "처리 중…" : "시작하기"}
        </button>
      </div>
    </div>
  );
}

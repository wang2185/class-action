import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/use-auth";
import { apiRequest } from "../lib/queryClient";
import { safeRedirect } from "../lib/redirect";

export default function Register() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = safeRedirect(searchParams.get("redirect")); // 가입 후 복귀(오픈 리다이렉트 방지)
  const [form, setForm] = useState({ email: "", password: "", passwordConfirm: "", name: "", phone: "" });
  const [consents, setConsents] = useState({ terms: false, pii: false, marketing: false });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) { navigate(redirect, { replace: true }); return null; }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!consents.terms || !consents.pii) { setError("필수 약관에 모두 동의해주세요."); return; }
    if (form.password !== form.passwordConfirm) { setError("비밀번호가 일치하지 않습니다."); return; }
    if (form.password.length < 8) { setError("비밀번호는 8자 이상이어야 합니다."); return; }

    setLoading(true);
    try {
      await register({ email: form.email, password: form.password, name: form.name, phone: form.phone || undefined });
      // 동의 기록 저장 (필수: 이용약관·개인정보 수집·이용 / 선택: 마케팅)
      const consentTypes = ["service_terms", "pii_collection", ...(consents.marketing ? ["marketing"] : [])];
      await apiRequest("/api/consent", { method: "POST", body: JSON.stringify({ consentTypes, version: "1.0" }) });
      navigate(redirect);
    } catch (err: any) {
      setError(err.message || "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="card max-w-md w-full">
        <h1 className="text-2xl font-bold text-center mb-6">회원가입</h1>
        {error && <div role="alert" className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reg-name" className="label">이름 *</label>
            <input id="reg-name" name="name" type="text" autoComplete="name" className="input" value={form.name} onChange={(e) => update("name", e.target.value)} required />
          </div>
          <div>
            <label htmlFor="reg-email" className="label">이메일 *</label>
            <input id="reg-email" name="email" type="email" inputMode="email" autoComplete="email" spellCheck={false} className="input" value={form.email} onChange={(e) => update("email", e.target.value)} required />
          </div>
          <div>
            <label htmlFor="reg-password" className="label">비밀번호 * (8자 이상)</label>
            <input id="reg-password" name="new-password" type="password" autoComplete="new-password" className="input" value={form.password} onChange={(e) => update("password", e.target.value)} required minLength={8} />
          </div>
          <div>
            <label htmlFor="reg-password2" className="label">비밀번호 확인 *</label>
            <input id="reg-password2" name="new-password-confirm" type="password" autoComplete="new-password" className="input" value={form.passwordConfirm} onChange={(e) => update("passwordConfirm", e.target.value)} required />
          </div>
          <div>
            <label htmlFor="reg-phone" className="label">전화번호</label>
            <input id="reg-phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel" className="input" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="010-0000-0000" />
          </div>
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
            <p className="text-xs text-gray-400 pt-1">가입 시 <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="underline">개인정보처리방침</Link>이 적용됩니다.</p>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "가입 중…" : "회원가입"}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          이미 계정이 있으신가요? <Link to={`/login${redirect !== "/my" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`} className="text-primary-500 font-semibold hover:underline">로그인</Link>
        </p>
      </div>
    </div>
  );
}

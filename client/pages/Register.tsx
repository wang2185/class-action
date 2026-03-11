import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/use-auth";
import { apiRequest } from "../lib/queryClient";

export default function Register() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", passwordConfirm: "", name: "", phone: "" });
  const [consents, setConsents] = useState({ privacy: false, pii: false });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) { navigate("/my", { replace: true }); return null; }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!consents.privacy || !consents.pii) { setError("필수 약관에 모두 동의해주세요."); return; }
    if (form.password !== form.passwordConfirm) { setError("비밀번호가 일치하지 않습니다."); return; }
    if (form.password.length < 8) { setError("비밀번호는 8자 이상이어야 합니다."); return; }

    setLoading(true);
    try {
      await register({ email: form.email, password: form.password, name: form.name, phone: form.phone || undefined });
      // 동의 기록 저장 (consentTypes 배열로 전송)
      await apiRequest("/api/consent", { method: "POST", body: JSON.stringify({ consentTypes: ["privacy_policy", "pii_collection"], version: "1.0" }) });
      navigate("/my");
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
        {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">이름 *</label>
            <input type="text" className="input" value={form.name} onChange={(e) => update("name", e.target.value)} required />
          </div>
          <div>
            <label className="label">이메일 *</label>
            <input type="email" className="input" value={form.email} onChange={(e) => update("email", e.target.value)} required />
          </div>
          <div>
            <label className="label">비밀번호 * (8자 이상)</label>
            <input type="password" className="input" value={form.password} onChange={(e) => update("password", e.target.value)} required minLength={8} />
          </div>
          <div>
            <label className="label">비밀번호 확인 *</label>
            <input type="password" className="input" value={form.passwordConfirm} onChange={(e) => update("passwordConfirm", e.target.value)} required />
          </div>
          <div>
            <label className="label">전화번호</label>
            <input type="tel" className="input" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="010-0000-0000" />
          </div>
          <div className="space-y-2 bg-gray-50 rounded-lg p-4">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={consents.privacy} onChange={(e) => setConsents((p) => ({ ...p, privacy: e.target.checked }))} className="mt-0.5" />
              <span><Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-500 underline">개인정보처리방침</Link>에 동의합니다. (필수)</span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={consents.pii} onChange={(e) => setConsents((p) => ({ ...p, pii: e.target.checked }))} className="mt-0.5" />
              <span>회원 가입 및 서비스 이용을 위한 개인정보 수집·이용에 동의합니다. (필수)</span>
            </label>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "가입 중..." : "회원가입"}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          이미 계정이 있으신가요? <Link to="/login" className="text-primary-500 font-semibold hover:underline">로그인</Link>
        </p>
      </div>
    </div>
  );
}

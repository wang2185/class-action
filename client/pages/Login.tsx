import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/use-auth";
import { safeRedirect } from "../lib/redirect";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = safeRedirect(searchParams.get("redirect")); // 로그인 후 복귀(오픈 리다이렉트 방지)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) { navigate(redirect, { replace: true }); return null; }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate(redirect);
    } catch (err: any) {
      setError(err.message || "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="card max-w-md w-full">
        <h1 className="text-2xl font-bold text-center mb-6">로그인</h1>
        {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">이메일</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="example@email.com" />
          </div>
          <div>
            <label className="label">비밀번호</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="8자 이상" />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          아직 계정이 없으신가요? <Link to={`/register${redirect !== "/my" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`} className="text-primary-500 font-semibold hover:underline">회원가입</Link>
        </p>
      </div>
    </div>
  );
}

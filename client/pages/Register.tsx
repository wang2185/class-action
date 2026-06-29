import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/use-auth";
import { apiRequest } from "../lib/queryClient";
import { safeRedirect } from "../lib/redirect";
import SocialButtons from "../components/SocialButtons";

// Daum(카카오) 우편번호 스크립트 — 최초 사용 시 지연 로드(중복 로드 방지).
const DAUM_POSTCODE_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
// 모듈 단위 캐시 — 동시/반복 호출이 스크립트를 중복 삽입하지 않도록 한 번의 Promise 를 공유.
// 실패 시 캐시를 비워(아래 catch) 다음 시도에서 재로드 가능하게 한다.
let daumPostcodePromise: Promise<void> | null = null;
function loadDaumPostcode(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).daum?.Postcode) return Promise.resolve();
  if (daumPostcodePromise) return daumPostcodePromise;
  daumPostcodePromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${DAUM_POSTCODE_SRC}"]`);
    const target = existing ?? document.createElement("script");
    target.addEventListener("load", () => resolve(), { once: true });
    target.addEventListener("error", () => reject(new Error("우편번호 서비스를 불러오지 못했습니다.")), { once: true });
    if (!existing) {
      target.src = DAUM_POSTCODE_SRC;
      target.async = true;
      document.head.appendChild(target);
    } else if ((window as any).daum?.Postcode) {
      // 이미 로드 완료된 기존 스크립트(load 이벤트가 다시 안 옴) → 즉시 해소.
      resolve();
    }
  });
  // 실패하면 캐시를 비워 재시도 가능하게(영구 거부 상태 방지).
  daumPostcodePromise.catch(() => { daumPostcodePromise = null; });
  return daumPostcodePromise;
}

export default function Register() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = safeRedirect(searchParams.get("redirect")); // 가입 후 복귀(오픈 리다이렉트 방지)
  const [form, setForm] = useState({
    email: "", password: "", passwordConfirm: "", name: "", phone: "",
    birthDate: "", postalCode: "", addressLine1: "", addressLine2: "",
  });
  const [consents, setConsents] = useState({ terms: false, pii: false, marketing: false });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const addressDetailRef = useRef<HTMLInputElement>(null);

  if (user) { navigate(redirect, { replace: true }); return null; }

  const openPostcode = async () => {
    setError("");
    try {
      await loadDaumPostcode();
    } catch (err: any) {
      setError(err?.message || "우편번호 서비스를 불러오지 못했습니다.");
      return;
    }
    new (window as any).daum.Postcode({
      oncomplete: (data: any) => {
        // 도로명 주소 우선, 없으면 지번 주소
        const base = data.roadAddress || data.jibunAddress || data.address || "";
        setForm((prev) => ({ ...prev, postalCode: data.zonecode || "", addressLine1: base }));
        // 주소 선택 후 상세주소 입력으로 포커스 이동
        addressDetailRef.current?.focus();
      },
    }).open();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!consents.terms || !consents.pii) { setError("필수 약관에 모두 동의해주세요."); return; }
    if (form.password !== form.passwordConfirm) { setError("비밀번호가 일치하지 않습니다."); return; }
    if (form.password.length < 8) { setError("비밀번호는 8자 이상이어야 합니다."); return; }
    if (!form.birthDate) { setError("생년월일을 입력해주세요."); return; }
    if (!form.postalCode || !form.addressLine1) { setError("배송지 주소를 입력해주세요."); return; }

    setLoading(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        name: form.name,
        phone: form.phone || undefined,
        birthDate: form.birthDate,
        postalCode: form.postalCode,
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2 || undefined,
      });
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
          <div>
            <label htmlFor="reg-birth" className="label">생년월일 *</label>
            <input id="reg-birth" name="bday" type="date" autoComplete="bday" className="input" value={form.birthDate} onChange={(e) => update("birthDate", e.target.value)} max={new Date().toISOString().slice(0, 10)} required />
          </div>
          <div>
            <label htmlFor="reg-postal" className="label">배송지 주소 *</label>
            <div className="flex gap-2">
              <input id="reg-postal" name="postal-code" type="text" autoComplete="postal-code" className="input flex-1" value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} placeholder="우편번호" readOnly />
              <button type="button" onClick={openPostcode} className="btn-secondary whitespace-nowrap px-4">우편번호 찾기</button>
            </div>
            <input name="address-line1" type="text" autoComplete="address-line1" className="input mt-2" value={form.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} placeholder="기본주소 (우편번호 찾기로 입력)" readOnly />
            <input ref={addressDetailRef} name="address-line2" type="text" autoComplete="address-line2" className="input mt-2" value={form.addressLine2} onChange={(e) => update("addressLine2", e.target.value)} placeholder="상세주소 (동·호수 등)" />
            <p className="text-xs text-gray-400 mt-1">소송 서류·우편물 배송에 사용됩니다.</p>
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
        <SocialButtons redirect={redirect} />
        <p className="text-center text-sm text-gray-500 mt-4">
          이미 계정이 있으신가요? <Link to={`/login${redirect !== "/my" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`} className="text-primary-500 font-semibold hover:underline">로그인</Link>
        </p>
      </div>
    </div>
  );
}

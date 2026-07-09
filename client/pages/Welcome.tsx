import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/use-auth";
import { queryClient, apiRequest } from "../lib/queryClient";

// Daum(카카오) 우편번호 스크립트 — 최초 사용 시 지연 로드(중복 로드 방지).
const DAUM_POSTCODE_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
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
      resolve();
    }
  });
  daumPostcodePromise.catch(() => { daumPostcodePromise = null; });
  return daumPostcodePromise;
}

// 신규 소셜 가입자 프로필 완성 — 콜백이 로그인 처리 후 이 페이지로 보낸다.
// 소송·계약 서면 발송에 필요한 생년월일·주소를 필수로 받고 약관 동의도 함께 수집한다.
export default function Welcome() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    birthDate: user?.birthDate || "",
    postalCode: user?.postalCode || "",
    addressLine1: user?.addressLine1 || "",
    addressLine2: user?.addressLine2 || "",
  });
  const [consents, setConsents] = useState({ terms: false, pii: false, marketing: false });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const addressDetailRef = useRef<HTMLInputElement>(null);
  const todayStr = new Date().toISOString().slice(0, 10);

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]">로딩 중…</div>;
  if (!user) { navigate("/login", { replace: true }); return null; }

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
        addressDetailRef.current?.focus();
      },
    }).open();
  };

  const submit = async () => {
    setError("");
    if (!consents.terms || !consents.pii) { setError("필수 약관에 모두 동의해주세요."); return; }
    if (!form.birthDate) { setError("생년월일을 입력해주세요."); return; }
    if (!form.postalCode || !form.addressLine1) { setError("주소를 입력해주세요."); return; }
    setSaving(true);
    try {
      // 동의를 먼저 기록 — 실패하면 프로필 완성 처리로 넘어가지 않아, 게이트가 '무동의 통과'를 막는다.
      const consentTypes = ["service_terms", "pii_collection", ...(consents.marketing ? ["marketing"] : [])];
      await apiRequest("/api/consent", { method: "POST", body: JSON.stringify({ consentTypes, version: "1.0" }) });
      // 생년월일·주소 저장 (서버가 형식·실재일·미래금지·만14세 재검증)
      const updated = await apiRequest("/api/auth/complete-profile", {
        method: "POST",
        body: JSON.stringify({
          birthDate: form.birthDate,
          postalCode: form.postalCode,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2 || undefined,
        }),
      });
      // 게이트가 최신 프로필을 보도록 즉시 캐시 반영(재요청 레이스로 되튕김 방지)
      queryClient.setQueryData(["auth"], updated);
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
        <p className="text-center text-sm text-ink-muted mb-6">서비스 이용을 위해 추가 정보를 입력하고 약관에 동의해주세요.</p>
        {error && <div role="alert" className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}

        {/* 생년월일 (소송 당사자 확인·연령 확인) */}
        <div className="mb-4">
          <label className="label" htmlFor="w-birth">생년월일 <span className="text-red-600">*</span></label>
          <input id="w-birth" type="date" max={todayStr} value={form.birthDate}
            onChange={(e) => setForm((p) => ({ ...p, birthDate: e.target.value }))}
            className="input" />
        </div>

        {/* 주소 (소송·계약 서면 발송) */}
        <div className="mb-4">
          <label className="label">주소 <span className="text-red-600">*</span></label>
          <div className="flex gap-2">
            <input type="text" readOnly value={form.postalCode} placeholder="우편번호" className="input flex-1" />
            <button type="button" onClick={openPostcode} className="btn-secondary whitespace-nowrap">주소 검색</button>
          </div>
          <input type="text" readOnly value={form.addressLine1} placeholder="주소 검색을 눌러 기본주소를 입력하세요" className="input mt-2" />
          <input ref={addressDetailRef} type="text" value={form.addressLine2}
            onChange={(e) => setForm((p) => ({ ...p, addressLine2: e.target.value }))}
            placeholder="상세주소 (선택)" className="input mt-2" />
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
        </div>

        <button onClick={submit} disabled={saving} className="btn-primary w-full mt-5">
          {saving ? "처리 중…" : "시작하기"}
        </button>
      </div>
    </div>
  );
}

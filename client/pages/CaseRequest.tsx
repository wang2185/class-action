import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";

const CATEGORIES = [
  "분양·부동산", "투자·금융 사기", "소비자 피해", "임금·노동",
  "전세·보증금", "의료", "개인정보 유출", "기타",
];

export default function CaseRequest() {
  const [form, setForm] = useState({
    name: "", phone: "", email: "", category: "",
    title: "", opponent: "", headcount: "", damageScale: "", content: "",
  });
  const [agree, setAgree] = useState(false);
  const [website, setWebsite] = useState(""); // 허니팟(봇 탐지용 — 사용자에게 숨김)
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/case-requests", { method: "POST", body: JSON.stringify(data) }),
    onError: (err: any) => setError(err?.message || "접수 중 오류가 발생했습니다."),
  });

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = () => {
    setError("");
    if (!form.name || !form.phone || !form.title || !form.content) {
      setError("이름·연락처·제목·피해 내용은 필수입니다.");
      return;
    }
    if (!agree) {
      setError("개인정보 수집·이용에 동의해주세요.");
      return;
    }
    mutation.mutate({ ...form, agree, website });
  };

  if (mutation.isSuccess) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center animate-fade-up">
        <div className="w-16 h-16 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="text-2xl font-bold mb-3">사건 요청이 접수되었습니다</h1>
        <p className="text-ink-muted leading-relaxed mb-8">
          허왕 변호사가 내용을 검토한 뒤, 입력하신 연락처로 진행 가능성을 안내드립니다.<br />
          접수 내용은 소송 검토 목적으로만 사용됩니다.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link to="/cases" className="btn-primary px-6 py-3">진행 중인 사건 보기</Link>
          <Link to="/" className="btn-secondary px-6 py-3">홈으로</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <span className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 text-sm font-semibold px-3.5 py-1.5 rounded-full mb-4">
          사건 요청
        </span>
        <h1 className="text-3xl font-extrabold text-ink mb-3">이런 피해, 함께 대응하고 싶다면</h1>
        <p className="text-ink-muted leading-relaxed">
          같은 피해를 입은 분이 여럿이라면 새로운 사건을 열 수 있습니다.<br className="hidden md:block" />
          피해 내용을 알려주시면 허왕 변호사가 직접 검토합니다.
        </p>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}

      <div className="card space-y-4">
        {/* 허니팟 — 사람에게 숨김, 봇이 채우면 서버가 무시 */}
        <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1} autoComplete="off" aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">이름 *</label>
            <input className="input" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="홍길동" />
          </div>
          <div>
            <label className="label">연락처 *</label>
            <input className="input" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="010-0000-0000" inputMode="numeric" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">이메일</label>
            <input className="input" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="example@email.com" />
          </div>
          <div>
            <label className="label">피해 유형</label>
            <select className="input" value={form.category} onChange={(e) => update("category", e.target.value)}>
              <option value="">선택 안 함</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">한 줄 요약 *</label>
          <input className="input" value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="예: ○○분양 계약금 반환 거부 피해" />
        </div>

        <div>
          <label className="label">상대방 (가해자·회사)</label>
          <input className="input" value={form.opponent} onChange={(e) => update("opponent", e.target.value)} placeholder="예: 주식회사 ○○ / 개인" />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">예상 피해자 규모</label>
            <input className="input" value={form.headcount} onChange={(e) => update("headcount", e.target.value)} placeholder="예: 약 50명" />
          </div>
          <div>
            <label className="label">예상 피해 금액</label>
            <input className="input" value={form.damageScale} onChange={(e) => update("damageScale", e.target.value)} placeholder="예: 1인당 약 500만원" />
          </div>
        </div>

        <div>
          <label className="label">피해 내용 *</label>
          <textarea className="input min-h-[160px]" value={form.content} onChange={(e) => update("content", e.target.value)}
            placeholder="언제, 누구에게, 어떤 피해를 입으셨는지 사실관계를 시간 순으로 적어주세요. 계약·입금·연락 기록이 있으면 함께 알려주세요." />
        </div>

        <label className="flex items-start gap-2.5 text-sm text-ink-soft cursor-pointer">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#0FA6B8]" />
          <span>
            사건 검토를 위한 개인정보 수집·이용에 동의합니다. 수집 항목(이름·연락처·피해 내용)은 소송 검토 목적으로만 사용되며,
            자세한 내용은 <Link to="/privacy" className="text-primary-600 underline">개인정보처리방침</Link>을 따릅니다.
          </span>
        </label>

        <button onClick={submit} disabled={mutation.isPending} className="btn-accent w-full py-3.5 text-base">
          {mutation.isPending ? "접수 중..." : "사건 요청 보내기"}
        </button>
        <p className="text-xs text-ink-muted text-center leading-relaxed">
          ※ 접수는 법률 자문·수임 계약의 성립을 의미하지 않습니다. 사건의 성패는 보장되지 않습니다.
        </p>
      </div>
    </div>
  );
}

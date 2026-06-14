import { Link } from "react-router-dom";

const CAREER = [
  "법무법인 윈스 대표변호사",
  "대한변호사협회 IT·블록체인 특별위원회 위원",
  "과학기술정보통신부 스타트업 법률자문단",
  "데이로이어(Day Lawyer) 창업자",
  "윌세이브(WillSave) 창업자",
];

const EDU = [
  "고려대학교 법학과 졸업",
  "고려대학교 정보보호대학원",
  "건국대학교 부동산대학원 석사",
];

const CERT = [
  "제50회 사법시험 합격",
  "제40기 사법연수원 수료",
];

const FIELDS = [
  "기업자문", "부동산", "ICT·블록체인", "의료",
  "민사·형사·행정·가사 소송", "등기", "상표", "상속", "금융",
];

export default function Lawyer() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-porcelain">
        <div className="pointer-events-none absolute -top-32 -left-24 w-[440px] h-[440px] rounded-full opacity-60"
          style={{ background: "radial-gradient(circle, rgba(59,110,240,0.10), transparent 70%)" }} />
        <div className="relative max-w-5xl mx-auto px-4 py-16 md:py-20">
          <div className="flex flex-col md:flex-row items-center gap-10 animate-fade-up">
            {/* 프로필 자리 (사진 추후 교체) */}
            <div className="w-40 h-40 md:w-48 md:h-48 rounded-3xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shrink-0 shadow-lift">
              <span className="text-6xl font-extrabold">허</span>
            </div>
            <div className="text-center md:text-left">
              <span className="inline-flex items-center gap-2 bg-accent-50 text-accent-700 text-sm font-semibold px-3.5 py-1.5 rounded-full mb-4">
                대표변호사
              </span>
              <h1 className="text-3xl md:text-4xl font-extrabold text-ink mb-2">허왕 변호사</h1>
              <p className="text-lg text-primary-600 font-semibold mb-4">법무법인 윈스</p>
              <p className="text-ink-muted leading-relaxed max-w-xl">
                집단·공동소송을 직접 설계하고 수행합니다. 흩어진 피해를 하나로 모아
                가장 효율적인 방법으로 권리를 되찾는 것을 목표로 합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 약력 */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="font-bold text-lg mb-4 text-primary-600">주요 활동</h2>
            <ul className="space-y-2.5">
              {CAREER.map((c) => (
                <li key={c} className="flex items-start gap-2.5 text-sm text-ink-soft">
                  <svg className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-6">
            <div className="card">
              <h2 className="font-bold text-lg mb-4 text-primary-600">자격</h2>
              <ul className="space-y-2.5">
                {CERT.map((c) => (
                  <li key={c} className="flex items-start gap-2.5 text-sm text-ink-soft">
                    <svg className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h2 className="font-bold text-lg mb-4 text-primary-600">학력</h2>
              <ul className="space-y-2.5">
                {EDU.map((c) => (
                  <li key={c} className="flex items-start gap-2.5 text-sm text-ink-soft">
                    <svg className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* 전문 분야 */}
        <div className="card mt-6">
          <h2 className="font-bold text-lg mb-4 text-primary-600">전문 분야</h2>
          <div className="flex flex-wrap gap-2">
            {FIELDS.map((f) => (
              <span key={f} className="badge bg-primary-100 text-primary-700">{f}</span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary-50 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-3">사건을 함께 검토받고 싶으신가요?</h2>
          <p className="text-ink-muted mb-7 leading-relaxed">
            진행 중인 사건에 참여하거나, 새로운 사건을 요청하실 수 있습니다.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/cases" className="btn-primary text-base px-7 py-3.5">진행 중인 사건 보기</Link>
            <Link to="/request" className="btn-secondary text-base px-7 py-3.5">사건 요청하기</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

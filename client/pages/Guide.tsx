import { Link } from "react-router-dom";

const STEPS = [
  { step: "01", title: "사건 확인 · 참여 신청", desc: "진행 중인 사건에서 내 피해와 같은 사건을 찾아 참여를 신청합니다. 같은 피해가 모일수록 대응이 강해집니다." },
  { step: "02", title: "당사자 정보 · 증거 제출", desc: "피해 내용과 계약서·입금내역·문자 등 증거를 올리면 자동으로 정리됩니다. 모바일에서도 간편하게 제출할 수 있습니다." },
  { step: "03", title: "전자 위임 · 수임계약", desc: "전자서명으로 위임장과 수임계약을 체결합니다. 직접 방문하지 않아도 온라인으로 끝납니다." },
  { step: "04", title: "착수금 결제", desc: "사건별로 사전 고지된 착수금을 안전한 카드 결제(NicePay)로 납부합니다. 카드 정보는 보관되지 않습니다." },
  { step: "05", title: "변호사의 소송 수행", desc: "허왕 변호사가 모인 자료를 토대로 소장·준비서면을 작성해 소를 제기하고 재판을 수행합니다." },
  { step: "06", title: "실시간 진행 알림", desc: "소 제기·기일·결과 등 진행 상황이 문자와 이메일로 자동 안내됩니다. 언제든 내 사건에서 확인할 수 있습니다." },
];

export default function Guide() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-porcelain">
        <div className="pointer-events-none absolute -top-32 -right-24 w-[420px] h-[420px] rounded-full opacity-70"
          style={{ background: "radial-gradient(circle, rgba(15,166,184,0.16), transparent 70%)" }} />
        <div className="relative max-w-5xl mx-auto px-4 py-16 md:py-20 text-center animate-fade-up">
          <span className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 text-sm font-semibold px-3.5 py-1.5 rounded-full mb-5">
            이용 안내
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold text-ink mb-4 leading-tight">
            신청부터 결과까지, <span className="text-primary-500">한곳에서</span>
          </h1>
          <p className="text-lg text-ink-muted leading-relaxed max-w-2xl mx-auto">
            참여 신청 · 자료 제출 · 수임계약 · 결제 · 진행 알림을 온라인으로 끝냅니다.<br className="hidden md:block" />
            허왕 변호사와 법무법인 윈스가 끝까지 함께합니다.
          </p>
        </div>
      </section>

      {/* 6단계 */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-center mb-3">참여 절차 6단계</h2>
        <p className="text-center text-ink-muted mb-12">복잡한 절차는 플랫폼이 대신합니다. 당사자는 신청과 자료 제출만 하면 됩니다.</p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <div key={s.step} className="card">
              <div className="w-11 h-11 bg-primary-500 text-white rounded-full flex items-center justify-center text-sm font-bold mb-4">
                {s.step}
              </div>
              <h3 className="font-bold text-lg mb-2">{s.title}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 비용 안내 */}
      <section className="bg-primary-50 py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-12">비용은 이렇게 구성됩니다</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="font-bold text-lg mb-2 text-primary-600">착수금</h3>
              <p className="text-sm text-ink-muted leading-relaxed">
                사건마다 착수금이 <strong className="text-ink">사전에 고지</strong>됩니다. 참여 화면과 사건 상세에서 금액을 미리 확인한 뒤
                결정하실 수 있습니다. 여러 당사자가 함께하므로 1인당 부담이 낮아집니다.
              </p>
            </div>
            <div className="card">
              <h3 className="font-bold text-lg mb-2 text-primary-600">성공보수</h3>
              <p className="text-sm text-ink-muted leading-relaxed">
                성공보수는 <strong className="text-ink">수임계약과 약관</strong>에 따라 결과가 발생한 경우에 한해 산정됩니다.
                기준은 계약 체결 전 명확히 안내드립니다.
              </p>
            </div>
          </div>
          <p className="text-xs text-ink-muted text-center mt-6 leading-relaxed">
            ※ 사건의 성패와 회수 가능 금액은 사실관계·증거에 따라 달라지며, 어떠한 결과도 보장되지 않습니다.
            환불은 이용약관이 정한 바에 따릅니다.
          </p>
        </div>
      </section>

      {/* 새 사건 요청 CTA */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="card text-center bg-gradient-to-br from-primary-600 to-primary-800 text-white border-0">
          <h2 className="text-2xl font-bold mb-3">아직 등록된 사건이 없으신가요?</h2>
          <p className="text-white/85 mb-7 leading-relaxed">
            같은 피해를 입은 분들이 많다면 새로운 사건을 열 수 있습니다.<br className="hidden md:block" />
            피해 내용을 알려주시면 허왕 변호사가 직접 검토해 진행 가능성을 안내드립니다.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/request" className="btn-accent text-base px-7 py-3.5">사건 요청하기</Link>
            <Link to="/cases" className="btn-secondary text-base px-7 py-3.5 !bg-white/10 !text-white !border-white/30 hover:!bg-white/20">진행 중인 사건 보기</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

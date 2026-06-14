import { useState, useId } from "react";
import { Link } from "react-router-dom";

const FAQS = [
  {
    q: "집단소송에 참여하면 비용이 얼마나 드나요?",
    a: "사건마다 착수금이 사전에 고지되며, 참여 화면과 사건 상세에서 금액을 미리 확인하실 수 있습니다. 여러 당사자가 함께하므로 1인당 부담이 낮아집니다. 성공보수는 수임계약과 약관에 따라 결과가 발생한 경우에 한해 산정되며, 기준은 계약 전 안내드립니다.",
  },
  {
    q: "누가 참여할 수 있나요?",
    a: "같은 사실관계로 동일하거나 유사한 피해를 입은 분이면 참여하실 수 있습니다. 사건별 참여 조건과 대상은 사건 상세 페이지에 표기되어 있습니다.",
  },
  {
    q: "꼭 회원가입을 해야 하나요?",
    a: "참여 신청, 증거 자료 제출, 진행 상황 확인을 위해 회원가입이 필요합니다. 가입은 이메일로 간편하게 진행됩니다.",
  },
  {
    q: "제 개인정보와 자료는 안전한가요?",
    a: "주민등록번호 등 민감정보는 암호화(AES-256)되어 저장되고, 접근 기록이 감사 로그로 남습니다. 수집된 정보는 소송 수행 목적 외에는 사용되지 않습니다. 자세한 내용은 개인정보처리방침에서 확인하실 수 있습니다.",
  },
  {
    q: "이기면 돈을 돌려받을 수 있나요?",
    a: "사건의 성패와 실제 회수 가능 금액은 사실관계와 증거, 상대방의 자력 등에 따라 달라지며, 어떠한 결과도 보장되지 않습니다. 허왕 변호사가 제출된 자료를 검토해 진행 가능성과 예상되는 절차를 솔직하게 안내드립니다.",
  },
  {
    q: "중간에 참여를 그만둘 수 있나요?",
    a: "참여 철회와 환불은 이용약관과 수임계약이 정한 절차에 따릅니다. 소 제기 전후에 따라 처리 방법이 다를 수 있어, 철회를 원하시면 먼저 안내를 받으시길 권합니다.",
  },
  {
    q: "결제는 안전한가요?",
    a: "착수금 결제는 NicePay 안전 결제창을 통해 이루어지며, 카드 정보는 플랫폼에 저장되지 않습니다. 결제 후 영수 내역은 내 사건에서 확인하실 수 있습니다.",
  },
  {
    q: "변호사가 직접 사건을 맡나요?",
    a: "법무법인 윈스의 허왕 변호사가 직접 자료를 검토하고 소장·준비서면 작성과 재판 수행을 담당합니다.",
  },
  {
    q: "등록된 사건이 없는데 새로 만들 수 있나요?",
    a: "네. 사건 요청 페이지에서 피해 내용을 알려주시면 허왕 변호사가 검토한 뒤, 같은 피해자를 모아 새로운 사건을 개설할 수 있는지 안내드립니다.",
  },
];

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="card !p-0 overflow-hidden">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={panelId}
        className="w-full flex items-center justify-between gap-4 text-left p-5 hover:bg-primary-50/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500">
        <span className="font-semibold text-ink">{q}</span>
        <svg aria-hidden="true" className={`w-5 h-5 text-primary-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7.5l5 5 5-5" /></svg>
      </button>
      {open && <p id={panelId} className="px-5 pb-5 text-sm text-ink-muted leading-relaxed">{a}</p>}
    </div>
  );
}

export default function Faq() {
  return (
    <div>
      <section className="bg-porcelain">
        <div className="max-w-4xl mx-auto px-4 py-14 text-center animate-fade-up">
          <span className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 text-sm font-semibold px-3.5 py-1.5 rounded-full mb-4">
            자주 묻는 질문
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold text-ink mb-3">궁금한 점을 모았습니다</h1>
          <p className="text-ink-muted">참여 전 가장 많이 물어보시는 내용입니다.</p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-12 space-y-3">
        {FAQS.map((f) => <Item key={f.q} q={f.q} a={f.a} />)}

        <div className="card text-center mt-8">
          <h2 className="font-bold text-lg mb-2">찾는 답이 없으신가요?</h2>
          <p className="text-sm text-ink-muted mb-5">피해 내용을 알려주시면 허왕 변호사가 직접 검토해 안내드립니다.</p>
          <Link to="/request" className="btn-primary px-6 py-3">사건 요청하기</Link>
        </div>
      </section>
    </div>
  );
}

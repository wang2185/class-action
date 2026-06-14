import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">이용약관</h1>
      <p className="text-sm text-gray-400 mb-8">시행일: 2026년 6월 15일 | 버전 1.0</p>

      <div className="prose prose-sm max-w-none space-y-8 text-gray-700">
        <section>
          <h2 className="text-xl font-bold text-gray-900">제1조 (목적)</h2>
          <p>이 약관은 법무법인 윈스(이하 "회사")가 운영하는 로사이어티 집단소송(class.lawciety.com, 이하 "서비스")의 이용과 관련하여 회사와 회원 간의 권리·의무 및 책임사항, 이용조건 및 절차를 정함을 목적으로 합니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제2조 (정의)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>"서비스"란 회사가 동일·유사한 피해를 입은 다수 당사자의 모집, 참여 신청, 자료 제출, 전자적 위임 및 수임계약 체결, 결제, 소송 진행 안내를 온라인으로 제공하는 플랫폼을 말합니다.</li>
            <li>"회원"이란 이 약관에 동의하고 가입하여 서비스를 이용하는 자를 말합니다.</li>
            <li>"당사자"란 특정 사건에 참여를 신청한 회원을 말합니다.</li>
            <li>"착수금"이란 사건 수임 시 사전에 고지되어 납부하는 비용을, "성공보수"란 수임계약과 약관에 따라 결과가 발생한 경우 산정되는 비용을 말합니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제3조 (약관의 게시와 개정)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>회사는 이 약관을 회원이 쉽게 확인할 수 있도록 서비스 화면에 게시합니다.</li>
            <li>회사는 관련 법령을 위배하지 않는 범위에서 약관을 개정할 수 있으며, 개정 시 적용일자 및 사유를 명시하여 최소 7일 전(회원에게 불리한 변경은 30일 전)부터 공지합니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제4조 (서비스의 내용)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>회사는 진행 중인 사건 정보 제공, 참여 신청·증거 자료 제출, 전자서명을 통한 위임 및 수임계약 체결, 결제, 소송 진행 상황 알림 등의 기능을 제공합니다.</li>
            <li><strong>실제 법률사무 및 소송대리는 법무법인 윈스와 회원 간에 별도로 체결되는 수임계약에 따라 수행됩니다.</strong> 플랫폼 이용만으로는 위임관계가 성립하지 않으며, 수임 여부는 사건 검토 후 결정됩니다.</li>
            <li>회사는 서비스의 내용을 운영상·기술상 필요에 따라 변경할 수 있으며, 변경 시 사전에 공지합니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제5조 (회원가입)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>이용자는 이 약관 및 개인정보 수집·이용에 동의하고 회사가 정한 절차에 따라 가입을 신청합니다.</li>
            <li>회사는 타인 정보의 도용, 허위 정보 기재 등 사유가 있는 경우 가입을 거부하거나 사후에 이용계약을 해지할 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제6조 (회원의 의무)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>회원은 정확하고 진실한 정보를 제공하여야 하며, 변경 시 이를 갱신하여야 합니다.</li>
            <li>회원은 제출하는 증거·자료가 사실에 부합함을 확인하며, 허위 자료 제출로 인한 책임은 회원에게 있습니다.</li>
            <li>회원은 계정 정보를 제3자에게 양도·대여할 수 없습니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제7조 (회사의 의무)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>회사는 관련 법령과 이 약관을 준수하며, 안정적인 서비스 제공을 위해 노력합니다.</li>
            <li>회사는 회원의 개인정보를 개인정보처리방침에 따라 보호합니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제8조 (수임료와 결제)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>착수금은 사건마다 사전에 고지되며, 회원은 참여 화면에서 금액을 확인한 후 결제합니다. 결제는 나이스페이먼츠(주)의 결제 시스템을 통해 처리됩니다.</li>
            <li>성공보수는 수임계약 및 약관이 정한 기준에 따라 결과가 발생한 경우에 한하여 산정됩니다. 구체적 기준은 수임계약 체결 전 안내됩니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제9조 (청약철회 및 환불)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>회원은 관련 법령 및 수임계약이 정한 바에 따라 참여를 철회하고 환불을 요청할 수 있습니다.</li>
            <li>이미 착수된 사무의 범위, 소 제기 전후 등 진행 정도에 따라 환불 금액이 달라질 수 있으며, 구체적 처리는 수임계약과 이용약관에 따릅니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제10조 (이용 제한 및 해지)</h2>
          <p>회원이 이 약관 또는 관련 법령을 위반한 경우 회사는 사전 통지 후 서비스 이용을 제한하거나 이용계약을 해지할 수 있습니다. 다만, 진행 중인 사건과 관련된 법적 의무는 해지와 별개로 처리됩니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제11조 (면책)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>사건의 성패, 인용 여부 및 실제 회수 가능한 금액은 사실관계·증거·상대방의 자력 등에 따라 달라지며, 회사는 특정한 결과를 보장하지 않습니다.</strong></li>
            <li>회사는 천재지변, 회원의 귀책사유, 제3자의 불법행위 등 회사의 책임 없는 사유로 발생한 손해에 대하여 책임을 지지 않습니다.</li>
            <li>회원이 제공한 정보·자료의 부정확·허위로 인한 불이익은 회원이 부담합니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제12조 (지식재산권)</h2>
          <p>서비스 및 서비스에 포함된 콘텐츠에 관한 지식재산권은 회사 또는 정당한 권리자에게 귀속되며, 회원은 회사의 사전 동의 없이 이를 복제·배포·이용할 수 없습니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제13조 (준거법 및 관할)</h2>
          <p>이 약관은 대한민국 법령에 따라 해석되며, 서비스 이용과 관련하여 분쟁이 발생한 경우 민사소송법상의 관할법원에 제소합니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">부칙</h2>
          <p>이 약관은 2026년 6월 15일부터 시행합니다. 회사 정보 및 문의처는 <Link to="/privacy" className="text-primary-600 underline">개인정보처리방침</Link> 및 페이지 하단을 참고하시기 바랍니다.</p>
        </section>
      </div>

      <div className="mt-8 text-center">
        <Link to="/" className="text-primary-600 hover:underline text-sm">홈으로 돌아가기</Link>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";

export default function Consent() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">개인정보 수집·이용 동의서</h1>
      <p className="text-sm text-gray-400 mb-8">시행일: 2026년 6월 15일 | 버전 1.0</p>

      <div className="prose prose-sm max-w-none space-y-8 text-gray-700">
        <p>법무법인 윈스(이하 "회사")는 로사이어티 집단소송 서비스 제공을 위하여 「개인정보 보호법」 제15조·제22조·제24조에 따라 아래와 같이 개인정보를 수집·이용하며, 그 내용에 대한 동의를 받습니다.</p>

        <section>
          <h2 className="text-xl font-bold text-gray-900">1. 필수 항목</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">수집·이용 목적</th>
                <th className="border p-2 text-left">수집 항목</th>
                <th className="border p-2 text-left">보유·이용 기간</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border p-2">회원 가입 및 본인 식별·관리</td><td className="border p-2">이름, 이메일, 비밀번호</td><td className="border p-2">회원 탈퇴 시까지</td></tr>
              <tr><td className="border p-2">사건 참여 신청 및 연락</td><td className="border p-2">이름, 연락처(전화·이메일)</td><td className="border p-2">사건 종결 후 5년</td></tr>
              <tr><td className="border p-2">수임계약 체결 및 소송 수행</td><td className="border p-2">전자서명, 피해 내용, 제출 증거</td><td className="border p-2">사건 종결 후 5년</td></tr>
              <tr><td className="border p-2">결제 및 환불 처리</td><td className="border p-2">결제 관련 정보(나이스페이먼츠 처리)</td><td className="border p-2">거래일로부터 5년</td></tr>
              <tr><td className="border p-2">부정 이용 방지·보안</td><td className="border p-2">접속 IP, 접속일시, 브라우저 정보</td><td className="border p-2">1년</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">2. 선택 항목</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">수집·이용 목적</th>
                <th className="border p-2 text-left">수집 항목</th>
                <th className="border p-2 text-left">보유·이용 기간</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border p-2">소송 진행에 필요한 추가 정보</td><td className="border p-2">주소, 피해 금액</td><td className="border p-2">사건 종결 후 5년</td></tr>
              <tr><td className="border p-2">서비스·혜택 안내(마케팅)</td><td className="border p-2">이름, 연락처</td><td className="border p-2">동의 철회 시까지</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">3. 고유식별정보(주민등록번호) 처리</h2>
          <p>소송 수행상 필요한 경우에 한하여 주민등록번호 등 고유식별정보를 수집할 수 있으며, 이 경우 별도로 동의를 받습니다. 수집된 고유식별정보는 <strong>AES-256 암호화</strong>되어 저장되고, 소송 수행 목적 외에는 이용되지 않습니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">4. 동의를 거부할 권리 및 불이익</h2>
          <p>정보주체는 개인정보 수집·이용 동의를 거부할 권리가 있습니다. 다만 <strong>필수 항목</strong>에 동의하지 않으면 회원 가입 및 사건 참여 등 서비스 이용이 제한될 수 있습니다. <strong>선택 항목</strong>은 동의하지 않아도 서비스의 기본 이용에는 제한이 없습니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">5. 제3자 제공 및 처리 위탁</h2>
          <p>결제 처리(나이스페이먼츠(주)), 알림 발송(이메일·문자), 소송서류의 법원 제출 등 목적 달성에 필요한 범위에서 개인정보가 제공·위탁될 수 있습니다. 자세한 사항은 <Link to="/privacy" className="text-primary-600 underline">개인정보처리방침</Link>을 따릅니다.</p>
        </section>

        <p className="font-medium text-ink">본인은 위 개인정보 수집·이용에 관한 내용을 충분히 이해하였으며, 이에 동의합니다.</p>
      </div>

      <div className="mt-8 text-center">
        <Link to="/" className="text-primary-600 hover:underline text-sm">홈으로 돌아가기</Link>
      </div>
    </div>
  );
}

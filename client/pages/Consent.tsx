import { Link } from "react-router-dom";

export default function Consent() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">개인정보 수집·이용 동의서</h1>
      <p className="text-base text-gray-500 mb-8">시행일: 2026년 7월 1일 | 버전 2.0</p>

      <div className="prose max-w-none space-y-8 text-base leading-relaxed text-gray-700">
        <p>법무법인 윈스(이하 "회사")는 로사이어티 집단소송 서비스 제공을 위하여 「개인정보 보호법」 제15조·제22조·제24조·제24조의2에 따라 아래와 같이 개인정보를 수집·이용하며, 각 항목에 대한 동의를 받습니다. 각 항목은 개별적으로 동의 여부를 선택할 수 있습니다.</p>

        <section>
          <h2 className="text-xl font-bold text-gray-900">[필수 1] 일반 개인정보의 수집·이용</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">수집·이용 목적</th>
                <th className="border p-2 text-left">수집 항목</th>
                <th className="border p-2 text-left">보유·이용 기간</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border p-2">회원 가입 및 본인 식별·관리</td><td className="border p-2">이름, 이메일, 비밀번호, 휴대전화번호, 생년월일, 배송지주소(우편번호·기본주소·상세주소)</td><td className="border p-2">회원 탈퇴 시까지</td></tr>
              <tr><td className="border p-2">사건 참여 신청 및 연락</td><td className="border p-2">이름, 연락처(전화·이메일), 주소</td><td className="border p-2">사건 종결 후 5년</td></tr>
              <tr><td className="border p-2">수임계약 체결 및 소송 수행</td><td className="border p-2">전자서명, 피해 금액·내용, 제출 증거</td><td className="border p-2">사건 종결 후 5년</td></tr>
              <tr><td className="border p-2">결제 및 환불 처리</td><td className="border p-2">결제수단 정보(나이스페이먼츠 처리), 결제기록</td><td className="border p-2">거래일로부터 5년</td></tr>
              <tr><td className="border p-2">부정 이용 방지·보안</td><td className="border p-2">접속 IP, 접속일시, 브라우저·기기 정보</td><td className="border p-2">3개월</td></tr>
            </tbody>
          </table>
          <p className="text-sm">위 일반 개인정보 수집·이용에 동의를 거부할 권리가 있으나, 거부 시 회원 가입 및 사건 참여 등 서비스 이용이 제한됩니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">[필수 2] 고유식별정보(주민등록번호)의 수집·이용 <span className="text-red-600">— 별도 동의</span></h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">수집·이용 목적</th>
                <th className="border p-2 text-left">수집 항목</th>
                <th className="border p-2 text-left">보유·이용 기간</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border p-2">소장·지급명령·가압류 등 소송서류 작성 및 당사자 특정</td><td className="border p-2">주민등록번호</td><td className="border p-2">사건 종결 후 5년</td></tr>
            </tbody>
          </table>
          <p>「개인정보 보호법」 제24조의2에 따라 주민등록번호는 위 일반 개인정보와 <strong>구분하여 별도로</strong> 동의를 받아 수집하며, <strong>AES-256-GCM으로 암호화</strong>하여 저장하고 소송 수행 목적 외에는 이용하지 않습니다. 본 동의를 거부하셔도 회원 가입 및 다른 서비스 이용에는 제한이 없으나, <strong>주민등록번호가 필요한 일부 소송서류 작성이 제한될 수 있습니다.</strong></p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">[안내] 소송 상대방 등 제3자 정보의 처리</h2>
          <p>소송 수행을 위해 상대방(피고·채무자)의 성명·주소·연락처·주민등록번호 또는 법인등록번호 등을 처리할 수 있습니다. 이는 「개인정보 보호법」 제15조 제1항 제6호·제7호(정당한 이익 및 법적 청구권의 행사·입증·방어)에 근거하여 소송 목적에 필요한 최소한의 범위에서 처리되며, 이용자는 제출하는 자료가 정확하고 적법하게 취득된 것임을 확인합니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">[선택] 마케팅·서비스 안내 수신</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100"><th className="border p-2 text-left">수집·이용 목적</th><th className="border p-2 text-left">수집 항목</th><th className="border p-2 text-left">보유·이용 기간</th></tr>
            </thead>
            <tbody>
              <tr><td className="border p-2">서비스·혜택 안내 발송</td><td className="border p-2">이름, 연락처</td><td className="border p-2">동의 철회 시까지</td></tr>
            </tbody>
          </table>
          <p className="text-sm">선택 항목은 동의하지 않아도 서비스의 기본 이용에 제한이 없으며, 동의는 언제든지 철회할 수 있습니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">[안내] 처리 위탁·국외 이전</h2>
          <p>결제 처리(나이스페이먼츠), 알림 발송(이메일·문자), 인프라 호스팅(AWS), 소송서류의 법원 제출 등 목적 달성에 필요한 범위에서 개인정보가 위탁·제공될 수 있으며, 이메일 발송(Microsoft 365)·소셜 로그인 등으로 일부 개인정보가 국외로 이전될 수 있습니다. 자세한 사항은 <Link to="/privacy" className="text-primary-600 underline">개인정보처리방침</Link>(제5조·제6조)을 따릅니다.</p>
        </section>

        <p className="font-medium text-ink">본인은 위 각 항목의 개인정보 수집·이용에 관한 내용을 충분히 이해하였으며, 각 동의 여부를 선택하여 동의합니다.</p>
      </div>

      <div className="mt-8 text-center">
        <Link to="/" className="text-primary-600 hover:underline text-base">홈으로 돌아가기</Link>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">개인정보처리방침</h1>
      <p className="text-sm text-gray-400 mb-8">시행일: 2026년 3월 11일 | 버전 1.0</p>

      <div className="prose prose-sm max-w-none space-y-8 text-gray-700">
        <section>
          <h2 className="text-xl font-bold text-gray-900">제1조 (개인정보의 처리 목적)</h2>
          <p>법무법인 윈스(이하 "회사")는 단체소송 플랫폼(class.day.lawyer, 이하 "서비스")에서 다음의 목적을 위하여 개인정보를 처리합니다.</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li><strong>회원 가입 및 관리:</strong> 회원제 서비스 이용에 따른 본인 확인, 연락, 고지사항 전달</li>
            <li><strong>소송 당사자 등록:</strong> 소장 작성, 수임계약 체결, 소송 진행을 위한 당사자 정보 수집</li>
            <li><strong>결제 처리:</strong> 착수금 및 성공보수 결제, 환불 처리</li>
            <li><strong>법률 서비스 제공:</strong> 지급명령, 가압류 신청, 소송서류 생성</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제2조 (수집하는 개인정보 항목)</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100"><th className="border p-2 text-left">수집 시점</th><th className="border p-2 text-left">필수 항목</th><th className="border p-2 text-left">선택 항목</th></tr>
            </thead>
            <tbody>
              <tr><td className="border p-2">회원가입</td><td className="border p-2">이메일, 비밀번호, 이름</td><td className="border p-2">전화번호</td></tr>
              <tr><td className="border p-2">소송 참여</td><td className="border p-2">이름</td><td className="border p-2">전화번호, 이메일, 주소, 주민등록번호, 피해금액, 피해내용</td></tr>
              <tr><td className="border p-2">수임계약</td><td className="border p-2">전자서명 이미지</td><td className="border p-2">-</td></tr>
              <tr><td className="border p-2">결제</td><td className="border p-2">결제 정보 (NicePay 처리)</td><td className="border p-2">-</td></tr>
              <tr><td className="border p-2">자동 수집</td><td className="border p-2">IP주소, 접속일시, 브라우저 정보</td><td className="border p-2">-</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제3조 (개인정보의 처리 및 보유 기간)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>회원 정보:</strong> 회원 탈퇴 시까지 (탈퇴 즉시 익명화 처리)</li>
            <li><strong>소송 관련 정보:</strong> 사건 종결 후 5년 (변호사법 제28조)</li>
            <li><strong>결제 기록:</strong> 거래일로부터 5년 (전자상거래법 제6조)</li>
            <li><strong>동의 기록:</strong> 동의 철회일로부터 3년 (개인정보보호법 시행령)</li>
            <li><strong>접속 로그:</strong> 1년 (통신비밀보호법 제15조의2)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제4조 (개인정보의 제3자 제공)</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100"><th className="border p-2 text-left">제공받는 자</th><th className="border p-2 text-left">제공 목적</th><th className="border p-2 text-left">제공 항목</th><th className="border p-2 text-left">보유 기간</th></tr>
            </thead>
            <tbody>
              <tr><td className="border p-2">나이스페이먼츠(주) (NicePay)</td><td className="border p-2">결제 처리 (착수금, 성공보수)</td><td className="border p-2">성명, 연락처, 이메일, 결제 카드 정보</td><td className="border p-2">거래 완료 후 5년</td></tr>
              <tr><td className="border p-2">Amazon Web Services (AWS SES)</td><td className="border p-2">이메일 발송</td><td className="border p-2">이메일 주소</td><td className="border p-2">발송 완료 시 삭제</td></tr>
              <tr><td className="border p-2">관할 법원</td><td className="border p-2">소장/지급명령/가압류 제출</td><td className="border p-2">소송 당사자 정보</td><td className="border p-2">법원 규정에 따름</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제5조 (개인정보의 안전성 확보 조치)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>암호화:</strong> 주민등록번호는 AES-256-GCM 암호화 저장, 비밀번호는 bcrypt 해시 처리</li>
            <li><strong>전송 보안:</strong> 모든 통신은 TLS/HTTPS로 암호화</li>
            <li><strong>접근 통제:</strong> 관리자 역할 기반 접근 제어 (RBAC), 세션 4시간 자동 만료</li>
            <li><strong>감사 추적:</strong> 관리자의 개인정보 열람 기록 자동 저장</li>
            <li><strong>세션 보안:</strong> 로그인 시 세션 재생성(Session Fixation 방지), HttpOnly/Secure 쿠키</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제6조 (정보주체의 권리·의무 및 행사 방법)</h2>
          <p>정보주체는 다음의 권리를 행사할 수 있습니다.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>열람권 (제35조):</strong> 마이페이지에서 본인의 개인정보를 열람·다운로드할 수 있습니다.</li>
            <li><strong>정정권 (제36조):</strong> 부정확한 개인정보의 정정을 요청할 수 있습니다.</li>
            <li><strong>삭제권 (제36조):</strong> 개인정보의 삭제를 요청할 수 있습니다. 다만, 법률에 의한 보존 의무가 있는 정보는 해당 기간 경과 후 삭제됩니다.</li>
            <li><strong>처리정지권 (제37조):</strong> 개인정보 처리의 정지를 요청할 수 있습니다.</li>
          </ul>
          <p className="mt-2">권리 행사는 서비스 내 설정 메뉴 또는 아래 연락처를 통해 가능합니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제7조 (개인정보 보호책임자)</h2>
          <table className="w-full text-sm border-collapse">
            <tbody>
              <tr><td className="border p-2 bg-gray-50 font-medium w-1/3">개인정보 보호책임자</td><td className="border p-2">허왕 변호사</td></tr>
              <tr><td className="border p-2 bg-gray-50 font-medium">소속</td><td className="border p-2">법무법인 윈스</td></tr>
              <tr><td className="border p-2 bg-gray-50 font-medium">연락처</td><td className="border p-2">TEL: 02-585-2927 | Email: king@wanghuh.com</td></tr>
              <tr><td className="border p-2 bg-gray-50 font-medium">주소</td><td className="border p-2">서울특별시 서초구 서초대로 301, 동익성봉빌딩 12층</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제8조 (개인정보 침해 구제)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>개인정보침해 신고센터: privacy.kisa.or.kr (국번없이 118)</li>
            <li>개인정보 분쟁조정위원회: www.kopico.go.kr (1833-6972)</li>
            <li>대검찰청 사이버수사과: www.spo.go.kr (국번없이 1301)</li>
            <li>경찰청 사이버수사국: ecrm.police.go.kr (국번없이 182)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제9조 (개인정보처리방침의 변경)</h2>
          <p>이 개인정보처리방침은 2026년 3월 11일부터 적용되며, 변경 시 서비스 내 공지를 통하여 안내합니다.</p>
        </section>
      </div>

      <div className="mt-8 text-center">
        <Link to="/" className="text-primary-500 hover:underline text-sm">홈으로 돌아가기</Link>
      </div>
    </div>
  );
}

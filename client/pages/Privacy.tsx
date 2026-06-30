import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">개인정보처리방침</h1>
      <p className="text-base text-gray-500 mb-8">시행일: 2026년 7월 1일 | 버전 2.0</p>

      <div className="prose max-w-none space-y-8 text-base leading-relaxed text-gray-700">
        <p>
          법무법인 윈스(이하 "회사")는 「개인정보 보호법」 제30조에 따라 정보주체의 개인정보를 보호하고
          이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 다음과 같이 개인정보처리방침을
          수립·공개합니다. 본 방침은 로사이어티 집단소송(class.lawciety.com, 이하 "서비스")에 적용됩니다.
        </p>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제1조 (개인정보의 처리 목적)</h2>
          <p>회사는 다음의 목적을 위하여 개인정보를 처리하며, 목적 외의 용도로는 이용하지 않습니다. 처리 목적이 변경되는 경우 「개인정보 보호법」 제18조에 따라 별도의 동의를 받는 등 필요한 조치를 이행합니다.</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li><strong>회원 가입 및 관리:</strong> 본인 식별·인증, 회원자격 유지·관리, 연락 및 고지사항 전달, 부정이용 방지</li>
            <li><strong>소송 당사자 등록 및 수행:</strong> 소장·지급명령·가압류 등 소송서류 작성, 수임계약 체결, 당사자(상대방 포함) 특정, 소송 진행·관리</li>
            <li><strong>결제 및 정산:</strong> 착수금·성공보수 결제·환불 처리</li>
            <li><strong>고충처리·분쟁대응 및 법령상 의무 이행</strong></li>
            <li><strong>(선택) 마케팅·서비스 안내:</strong> 동의한 이용자에 한하여 이벤트·서비스 안내 발송</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제2조 (처리하는 개인정보의 항목 및 수집 방법)</h2>
          <p>① 회사는 다음의 개인정보 항목을 처리합니다.</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100"><th className="border p-2 text-left">수집 시점</th><th className="border p-2 text-left">필수 항목</th><th className="border p-2 text-left">선택 항목</th></tr>
            </thead>
            <tbody>
              <tr><td className="border p-2">회원가입</td><td className="border p-2">이메일, 비밀번호(일방향 암호화), 이름, 휴대전화번호, 생년월일, 배송지주소(우편번호·기본주소·상세주소)</td><td className="border p-2">-</td></tr>
              <tr><td className="border p-2">소셜 로그인(선택)</td><td className="border p-2">제공자 종류 및 제공자 발급 회원식별자, 이메일, 이름(또는 닉네임)</td><td className="border p-2">-</td></tr>
              <tr><td className="border p-2">소송 참여</td><td className="border p-2">이름, 연락처(전화·이메일), 주소, <strong>주민등록번호(고유식별정보·별도 동의)</strong>, 피해금액, 피해내용</td><td className="border p-2">-</td></tr>
              <tr><td className="border p-2">수임계약</td><td className="border p-2">전자서명 이미지</td><td className="border p-2">-</td></tr>
              <tr><td className="border p-2">비회원 사건 제보</td><td className="border p-2">이름, 연락처(전화·이메일), 제보 내용</td><td className="border p-2">-</td></tr>
              <tr><td className="border p-2">결제</td><td className="border p-2">결제수단 정보(나이스페이먼츠 처리), 결제기록(마스킹 카드번호·거래번호)</td><td className="border p-2">-</td></tr>
              <tr><td className="border p-2">자동 수집</td><td className="border p-2">접속 IP, 쿠키·세션 식별자, 접속일시, 브라우저·기기 정보, 서비스 이용기록</td><td className="border p-2">-</td></tr>
            </tbody>
          </table>
          <p>② <strong>고유식별정보(주민등록번호):</strong> 소장 작성 등 소송 수행에 필요한 경우에 한하여 「개인정보 보호법」 제24조의2에 따라 <strong>일반 개인정보와 별도로 동의</strong>를 받아 수집하며, 수집 시 <strong>AES-256-GCM으로 암호화</strong>하여 저장하고 소송 수행 목적 외에는 이용하지 않습니다.</p>
          <p>③ <strong>소송 상대방(피고·채무자) 정보:</strong> 소송 수행을 위해 상대방의 성명·주소·연락처·주민등록번호 또는 법인등록번호 등을 처리할 수 있습니다. 이는 정보주체 본인이 아닌 제3자의 정보로서, 「개인정보 보호법」 제15조 제1항 제6호(개인정보처리자의 정당한 이익) 및 제7호(법적 청구권의 행사·입증·방어)에 근거하여 소송 목적에 필요한 최소한의 범위에서 처리하며, 주민등록번호 등은 암호화하여 보관합니다. 해당 제3자는 같은 법 제20조에 따라 처리 출처·목적의 고지 및 처리정지를 요구할 수 있습니다.</p>
          <p>④ <strong>수집 방법:</strong> 회원가입·참여신청 폼 직접 입력, 소셜 로그인 제공자로부터 제공받음, 증거 파일 업로드, 서비스 이용 중 자동 생성·수집.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제3조 (개인정보의 처리 및 보유 기간)</h2>
          <p>회사는 법령상 보유기간 또는 정보주체로부터 동의받은 기간 내에서 개인정보를 처리·보유하며, 기간 경과 또는 처리목적 달성 시 지체 없이 파기합니다.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>회원 정보:</strong> 회원 탈퇴 시까지 (탈퇴 시 지체 없이 익명화 또는 파기, 수사·조사 진행 시 종료 시까지)</li>
            <li><strong>소송 관련 정보(주민등록번호·증거 포함):</strong> 사건 종결 후 5년 (변호사법 제28조, 분쟁 대응에 필요한 범위)</li>
            <li><strong>결제 기록:</strong> 5년 (전자상거래법) / 소비자 불만·분쟁처리 기록: 3년</li>
            <li><strong>동의 기록:</strong> 회원 탈퇴 또는 동의 철회 후 3년 (개인정보 보호법 시행령)</li>
            <li><strong>접속 로그:</strong> 3개월 (통신비밀보호법 제15조의2)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제4조 (개인정보의 제3자 제공)</h2>
          <p>회사는 정보주체의 동의, 법률의 특별한 규정 등 「개인정보 보호법」 제17조·제18조에 해당하는 경우에만 개인정보를 제3자에게 제공합니다.</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100"><th className="border p-2 text-left">제공받는 자</th><th className="border p-2 text-left">제공 목적</th><th className="border p-2 text-left">제공 항목</th><th className="border p-2 text-left">보유 기간</th></tr>
            </thead>
            <tbody>
              <tr><td className="border p-2">나이스페이먼츠(주)</td><td className="border p-2">착수금·성공보수 결제 및 환불 처리</td><td className="border p-2">성명, 연락처, 이메일, 결제수단 정보</td><td className="border p-2">관계 법령에 따른 기간</td></tr>
              <tr><td className="border p-2">관할 법원·수사기관</td><td className="border p-2">소장·지급명령·가압류 등 소송서류 제출, 적법한 요청에 대한 대응</td><td className="border p-2">소송 당사자(상대방 포함) 정보</td><td className="border p-2">관계 법령·법원 규정에 따름</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제5조 (개인정보 처리의 위탁)</h2>
          <p>회사는 원활한 업무처리를 위하여 아래와 같이 개인정보 처리업무를 위탁합니다. 위탁계약 시 「개인정보 보호법」 제26조에 따라 처리목적 외 이용금지, 기술적·관리적 보호조치, 재위탁 제한, 수탁자 관리·감독, 손해배상 등의 책임에 관한 사항을 문서에 명시하고 수탁자가 개인정보를 안전하게 처리하는지 감독합니다.</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100"><th className="border p-2 text-left">수탁자</th><th className="border p-2 text-left">위탁업무</th><th className="border p-2 text-left">비고</th></tr>
            </thead>
            <tbody>
              <tr><td className="border p-2">Amazon Web Services</td><td className="border p-2">서버 인프라 호스팅·데이터 보관, 이메일(SES) 발송</td><td className="border p-2">리전: 서울(ap-northeast-2)</td></tr>
              <tr><td className="border p-2">Microsoft Corporation</td><td className="border p-2">이메일 발송(Microsoft 365)</td><td className="border p-2">국외 이전(제6조 참조)</td></tr>
              <tr><td className="border p-2">(주)알리고</td><td className="border p-2">문자메시지(SMS/LMS) 발송</td><td className="border p-2">국내</td></tr>
            </tbody>
          </table>
          <p className="text-sm text-gray-500">※ 나이스페이먼츠(결제)·본인확인기관·소셜 로그인 제공자는 계약 구조에 따라 수탁자가 아닌 독립한 개인정보처리자에 해당할 수 있으며, 이 경우 해당 사업자의 개인정보 처리방침이 함께 적용됩니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제6조 (개인정보의 국외 이전)</h2>
          <p>회사는 다음과 같이 개인정보가 국외로 이전될 수 있습니다(「개인정보 보호법」 제28조의8). 위탁·보관 목적의 이전은 본 방침의 공개로 갈음할 수 있습니다.</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100"><th className="border p-2 text-left">이전받는 자</th><th className="border p-2 text-left">국가</th><th className="border p-2 text-left">이전 항목</th><th className="border p-2 text-left">이용 목적·방법</th></tr>
            </thead>
            <tbody>
              <tr><td className="border p-2">Microsoft Corporation</td><td className="border p-2">미국</td><td className="border p-2">수신자 이메일 주소·발송 본문</td><td className="border p-2">이메일 발송(Microsoft 365), HTTPS 전송</td></tr>
              <tr><td className="border p-2">소셜 로그인 국외 제공자<br/>(Google LLC, Meta Platforms, LINE, Microsoft)</td><td className="border p-2">미국·일본 등</td><td className="border p-2">제공자 발급 식별자, 이메일, 이름</td><td className="border p-2">간편 로그인 인증(이용자가 해당 소셜 로그인을 선택한 경우)</td></tr>
            </tbody>
          </table>
          <p>정보주체는 국외 이전을 거부할 수 있으며, 거부 시 해당 소셜 로그인·이메일 채널의 이용이 제한될 수 있습니다(국내 수단으로 대체 가능). 문의: 아래 개인정보 보호책임자.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제7조 (개인정보의 파기절차 및 방법)</h2>
          <p>① 파기 절차: 보유기간 경과 또는 처리목적 달성으로 불필요하게 된 개인정보는 내부 방침 및 관계 법령에 따른 보존기간 경과 후 지체 없이 파기합니다.</p>
          <p>② 파기 방법: 전자적 파일은 복구가 불가능한 방법으로 영구 삭제하며, 출력물은 분쇄기로 분쇄하거나 소각합니다. 본인 탈퇴 시 당사자 정보의 성명·연락처·주소·주민등록번호·피해내용·전자서명 등은 즉시 삭제·익명화합니다(법령상 보존의무가 있는 정보는 그 기간 후 파기).</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제8조 (정보주체와 법정대리인의 권리·의무 및 행사 방법)</h2>
          <p>정보주체는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>열람권(제35조):</strong> 마이페이지에서 본인의 개인정보를 열람·다운로드할 수 있습니다.</li>
            <li><strong>정정권(제36조):</strong> 부정확한 개인정보의 정정을 요청할 수 있습니다.</li>
            <li><strong>삭제권(제36조):</strong> 개인정보의 삭제를 요청할 수 있습니다(법령상 보존의무가 있는 정보는 해당 기간 경과 후 삭제).</li>
            <li><strong>처리정지권(제37조):</strong> 개인정보 처리의 정지를 요청할 수 있습니다.</li>
          </ul>
          <p className="mt-2">권리 행사는 서비스 내 설정 메뉴 또는 아래 개인정보 보호책임자에게 서면·전자우편 등으로 하실 수 있으며, 회사는 지체 없이 조치합니다. 법정대리인 또는 위임받은 자를 통해서도 행사할 수 있습니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제9조 (개인정보의 안전성 확보 조치)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>암호화:</strong> 주민등록번호 등 고유식별정보는 AES-256-GCM으로 암호화 저장, 비밀번호는 일방향 해시(bcrypt) 처리</li>
            <li><strong>전송 보안:</strong> 모든 통신은 TLS/HTTPS로 암호화</li>
            <li><strong>접근 통제:</strong> 역할 기반 접근 제어(RBAC), 세션 4시간 자동 만료, 최소권한 원칙</li>
            <li><strong>감사 추적:</strong> 관리자의 개인정보 열람·내보내기·삭제 기록 자동 저장</li>
            <li><strong>세션 보안:</strong> 로그인 시 세션 재생성(세션 고정 공격 방지), HttpOnly/Secure 쿠키</li>
            <li><strong>관리적 조치:</strong> 내부관리계획 수립·시행, 접근권한 관리</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제10조 (개인정보 자동 수집 장치의 설치·운영 및 거부)</h2>
          <p>회사는 로그인 유지 및 서비스 제공을 위해 세션 쿠키를 사용합니다. 이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 이 경우 로그인 등 일부 기능 이용이 제한될 수 있습니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제11조 (행태정보의 수집·이용 및 자동화된 결정)</h2>
          <p>① 회사는 온라인 맞춤형 광고를 위한 행태정보를 수집하지 않습니다.</p>
          <p>② 회사는 인공지능 등을 이용하여 정보주체의 권리·의무에 중대한 영향을 미치는 <strong>자동화된 결정(「개인정보 보호법」 제37조의2)을 하지 않습니다.</strong> 사건 참여 수락·제보 채택 등은 담당자(변호사)의 검토를 거쳐 결정됩니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제12조 (가명정보 처리)</h2>
          <p>회사는 가명정보를 처리하지 않습니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제13조 (개인정보 보호책임자 및 열람청구 접수·처리)</h2>
          <table className="w-full text-sm border-collapse">
            <tbody>
              <tr><td className="border p-2 bg-gray-50 font-medium w-1/3">개인정보 보호책임자</td><td className="border p-2">허왕 변호사 (법무법인 윈스)</td></tr>
              <tr><td className="border p-2 bg-gray-50 font-medium">연락처</td><td className="border p-2">TEL: 02-556-6800 | Email: info@winslaw.co.kr</td></tr>
              <tr><td className="border p-2 bg-gray-50 font-medium">열람·정정·삭제·처리정지 접수</td><td className="border p-2">법무법인 윈스 운영팀 | info@winslaw.co.kr</td></tr>
              <tr><td className="border p-2 bg-gray-50 font-medium">주소</td><td className="border p-2">서울특별시 강남구 삼성로 566, 2층 (삼성동, 빌딩엠) 06163</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제14조 (권익침해에 대한 구제 방법)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>개인정보 분쟁조정위원회: 1833-6972 (www.kopico.go.kr)</li>
            <li>개인정보침해 신고센터: (국번없이) 118 (privacy.kisa.or.kr)</li>
            <li>대검찰청 사이버수사과: (국번없이) 1301 (www.spo.go.kr)</li>
            <li>경찰청 사이버수사국: (국번없이) 182 (ecrm.police.go.kr)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900">제15조 (개인정보처리방침의 변경)</h2>
          <p>이 개인정보처리방침은 2026년 7월 1일부터 적용됩니다. 법령·서비스 변경에 따라 개정될 수 있으며, 변경 시 시행 7일 전(중대한 변경은 30일 전)부터 서비스 내 공지를 통해 안내합니다.</p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-500">
            <li>v2.0 (2026-07-01): 표준 목차 전면 개정 — 국외이전·위탁/제3자제공 구분·생년월일·배송지주소·고유식별정보 별도동의·자동화된 결정·행태정보 신설</li>
            <li>v1.0 (2026-03-11): 최초 제정</li>
          </ul>
        </section>

        <section className="text-sm text-gray-500 border-t pt-4">
          <p>법무법인 윈스 (대표변호사 허왕·박형일) · 사업자등록번호 557-86-00970 · 통신판매업 신고 제2025-서울강남-00127호 · 서울특별시 강남구 삼성로 566, 2층 · TEL 02-556-6800 / FAX 02-556-6809</p>
        </section>
      </div>

      <div className="mt-8 text-center">
        <Link to="/" className="text-primary-500 hover:underline text-base">홈으로 돌아가기</Link>
      </div>
    </div>
  );
}

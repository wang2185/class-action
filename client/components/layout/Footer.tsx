import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 mt-auto">
      {/* 홍보 배너 */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 text-white">
        <div className="max-w-7xl mx-auto px-4 py-8 grid md:grid-cols-2 gap-6">
          <a
            href="https://day.lawyer"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 bg-white/10 rounded-xl p-5 hover:bg-white/20 transition-all"
          >
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold">D</span>
            </div>
            <div>
              <div className="font-bold text-lg">데이로이어 (Day Lawyer)</div>
              <div className="text-sm text-white/80">법률 상담 구독 서비스 — 방문·전화·이메일 상담을 월정액으로</div>
            </div>
          </a>
          <a
            href="https://willsave.co.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 bg-white/10 rounded-xl p-5 hover:bg-white/20 transition-all"
          >
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold">W</span>
            </div>
            <div>
              <div className="font-bold text-lg">윌세이브 (WillSave)</div>
              <div className="text-sm text-white/80">유언장 작성·보관 서비스 — 소중한 뜻을 안전하게</div>
            </div>
          </a>
        </div>
      </div>

      {/* Footer 정보 */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-white font-bold mb-3">법무법인 윈스</h3>
            <p className="text-sm leading-relaxed">
              서울특별시 서초구 서초대로 301, 동익성봉빌딩 12층<br />
              TEL: 02-585-2927 | FAX: 02-585-2928<br />
              사업자등록번호: 264-81-03078
            </p>
          </div>
          <div>
            <h3 className="text-white font-bold mb-3">서비스</h3>
            <div className="space-y-2 text-sm">
              <Link to="/cases" className="block hover:text-white transition-colors">단체소송 참여</Link>
              <Link to="/tools" className="block hover:text-white transition-colors">법률 도구</Link>
              <a href="https://day.lawyer" target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors">법률 상담 구독</a>
              <a href="https://willsave.co.kr" target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors">유언장 서비스</a>
            </div>
          </div>
          <div>
            <h3 className="text-white font-bold mb-3">법률 도구</h3>
            <div className="space-y-2 text-sm">
              <a href="https://docurepeat.com" target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors">문서 자동화 (DocuRepeat)</a>
              <a href="https://gongsi.estate" target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors">시가조회 (Siga-Lookup)</a>
              <a href="https://day.lawyer/casecrab" target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors">판례검색 (CaseScraper)</a>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-gray-800 text-xs text-center space-y-1">
          <div><Link to="/privacy" className="hover:text-white transition-colors">개인정보처리방침</Link></div>
          <div>&copy; {new Date().getFullYear()} 법무법인 윈스. All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
}

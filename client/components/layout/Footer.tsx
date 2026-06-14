import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-ink text-gray-400 mt-auto">
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
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-white font-bold mb-1">로사이어티 <span className="text-gray-400 font-normal">집단소송</span></h3>
            <p className="text-sm text-gray-500 mb-3">법무법인 윈스 · 허왕 변호사</p>
            <p className="text-sm leading-relaxed">
              법무법인 윈스 | 대표변호사 허왕, 박형일<br />
              서울특별시 강남구 삼성로 566, 2층 (삼성동, 빌딩엠) 06163<br />
              TEL: 02-556-6800 | FAX: 02-556-6809<br />
              사업자등록번호: 557-86-00970<br />
              통신판매업 신고번호: 제2025-서울강남-00127호
            </p>
          </div>
          <div>
            <h3 className="text-white font-bold mb-3">서비스</h3>
            <div className="space-y-2 text-sm">
              <Link to="/cases" className="block hover:text-white transition-colors">집단소송 참여</Link>
              <Link to="/tools" className="block hover:text-white transition-colors">법률 도구</Link>
              <a href="https://day.lawyer" target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors">법률 상담 구독</a>
              <a href="https://willsave.co.kr" target="_blank" rel="noopener noreferrer" className="block hover:text-white transition-colors">유언장 서비스</a>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-gray-800 text-xs text-center space-y-1">
          <div><Link to="/privacy" className="hover:text-white transition-colors">개인정보처리방침</Link></div>
          <div>&copy; {new Date().getFullYear()} 법무법인 윈스 · 허왕 변호사. All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
}

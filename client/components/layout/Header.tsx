import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/use-auth";
import { useState } from "react";

export default function Header() {
  const { user, isAdmin, isOwner, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center" aria-label="로사이어티 집단소송 홈">
          <img
            src="/brand/logo-header.png"
            alt="로사이어티 집단소송 · 법무법인 윈스"
            width={1467}
            height={200}
            className="h-8 w-auto"
            decoding="async"
          />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-5 text-sm">
          <Link to="/guide" className="text-gray-700 hover:text-primary-500 transition-colors whitespace-nowrap">사용 안내</Link>
          <Link to="/lawyer" className="text-gray-700 hover:text-primary-500 transition-colors whitespace-nowrap">변호사</Link>
          <Link to="/request" className="text-gray-700 hover:text-primary-500 transition-colors whitespace-nowrap">사건 요청</Link>
          <Link to="/cases" className="text-gray-700 hover:text-primary-500 transition-colors whitespace-nowrap">사건 참여</Link>
          <Link to="/faq" className="text-gray-700 hover:text-primary-500 transition-colors whitespace-nowrap">자주 묻는 질문</Link>
          {user && <Link to="/my" className="text-gray-700 hover:text-primary-500 transition-colors whitespace-nowrap">내 사건</Link>}
          {isAdmin && <Link to="/admin" className="text-accent-500 hover:text-accent-600 font-semibold transition-colors">관리자</Link>}
          {isOwner && <Link to="/owner" className="text-purple-600 hover:text-purple-700 font-semibold transition-colors">오너</Link>}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              <Link to="/account" className="text-sm text-gray-600 hover:text-primary-600 transition-colors">{user.name}님</Link>
              <button onClick={logout} className="btn-secondary text-xs px-3 py-1.5">로그아웃</button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-secondary text-xs px-3 py-1.5">로그인</Link>
              <Link to="/register" className="btn-primary text-xs px-3 py-1.5">회원가입</Link>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={menuOpen} aria-controls="mobile-menu">
          <svg className="w-6 h-6" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div id="mobile-menu" className="md:hidden border-t bg-white px-4 py-3 space-y-2">
          <Link to="/guide" className="block py-2 text-sm" onClick={() => setMenuOpen(false)}>사용 안내</Link>
          <Link to="/lawyer" className="block py-2 text-sm" onClick={() => setMenuOpen(false)}>변호사</Link>
          <Link to="/request" className="block py-2 text-sm" onClick={() => setMenuOpen(false)}>사건 요청</Link>
          <Link to="/cases" className="block py-2 text-sm" onClick={() => setMenuOpen(false)}>사건 참여</Link>
          <Link to="/faq" className="block py-2 text-sm" onClick={() => setMenuOpen(false)}>자주 묻는 질문</Link>
          {user && <Link to="/my" className="block py-2 text-sm" onClick={() => setMenuOpen(false)}>내 사건</Link>}
          {user && <Link to="/account" className="block py-2 text-sm" onClick={() => setMenuOpen(false)}>내 정보</Link>}
          {isAdmin && <Link to="/admin" className="block py-2 text-sm text-accent-500" onClick={() => setMenuOpen(false)}>관리자</Link>}
          {isOwner && <Link to="/owner" className="block py-2 text-sm text-purple-600" onClick={() => setMenuOpen(false)}>오너</Link>}
          <div className="pt-2 border-t flex gap-2">
            {user ? (
              <button onClick={() => { logout(); setMenuOpen(false); }} className="btn-secondary text-xs w-full">로그아웃</button>
            ) : (
              <>
                <Link to="/login" className="btn-secondary text-xs flex-1 text-center" onClick={() => setMenuOpen(false)}>로그인</Link>
                <Link to="/register" className="btn-primary text-xs flex-1 text-center" onClick={() => setMenuOpen(false)}>회원가입</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

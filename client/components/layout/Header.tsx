import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/use-auth";
import { useState } from "react";

export default function Header() {
  const { user, isAdmin, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">W</span>
          </div>
          <span className="font-bold text-lg text-primary-500">단체소송</span>
          <span className="text-xs text-gray-400 hidden sm:inline">법무법인 윈스</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link to="/cases" className="text-gray-700 hover:text-primary-500 transition-colors">사건 목록</Link>
          <Link to="/tools" className="text-gray-700 hover:text-primary-500 transition-colors">법률 도구</Link>
          {user && <Link to="/my" className="text-gray-700 hover:text-primary-500 transition-colors">내 사건</Link>}
          {isAdmin && <Link to="/admin" className="text-accent-500 hover:text-accent-600 font-semibold transition-colors">관리자</Link>}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-gray-600">{user.name}님</span>
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
        <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t bg-white px-4 py-3 space-y-2">
          <Link to="/cases" className="block py-2 text-sm" onClick={() => setMenuOpen(false)}>사건 목록</Link>
          <Link to="/tools" className="block py-2 text-sm" onClick={() => setMenuOpen(false)}>법률 도구</Link>
          {user && <Link to="/my" className="block py-2 text-sm" onClick={() => setMenuOpen(false)}>내 사건</Link>}
          {isAdmin && <Link to="/admin" className="block py-2 text-sm text-accent-500" onClick={() => setMenuOpen(false)}>관리자</Link>}
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

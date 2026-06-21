import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/use-auth";

const BASE = [
  { to: "/admin", label: "업무관리" },
  { to: "/admin/case-requests", label: "사건요청" },
  { to: "/admin/payments", label: "결제" },
  { to: "/admin/users", label: "사용자" },
  { to: "/admin/audit-logs", label: "감사로그" },
];

export default function AdminNav() {
  const { pathname } = useLocation();
  const { isOwner } = useAuth();
  const items = isOwner ? [{ to: "/owner", label: "관리자" }, ...BASE] : BASE;
  return (
    <nav className="flex gap-1 overflow-x-auto mb-6 border-b border-gray-200" aria-label="관리 메뉴">
      {items.map((t) => {
        const active = pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={active ? "page" : undefined}
            className={`px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${active ? "border-primary-500 text-primary-700" : "border-transparent text-gray-500 hover:text-ink"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

import { Link, useLocation } from "react-router-dom";

const TABS = [
  { to: "/my", label: "내 사건" },
  { to: "/my/payments", label: "결제 내역" },
  { to: "/my/payment-methods", label: "결제수단" },
  { to: "/my/notifications", label: "알림" },
  { to: "/account", label: "내 정보" },
];

export default function MemberTabs() {
  const { pathname } = useLocation();
  return (
    <nav className="flex gap-1 overflow-x-auto mb-6 border-b border-gray-200" aria-label="내 메뉴">
      {TABS.map((t) => {
        const active = pathname === t.to || (t.to !== "/my" && pathname.startsWith(t.to));
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

import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";

export type ConsoleNavItem = {
  to: string;
  label: string;
  icon?: ReactNode;
  end?: boolean; // 인덱스 라우트(정확 일치)일 때 true
  badge?: number; // 우측 카운트 뱃지
  hidden?: boolean; // 권한 등으로 숨김
};

export type ConsoleNavGroup = {
  heading?: string;
  items: ConsoleNavItem[];
};

const linkBase =
  "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors";
const linkIdle = "text-ink-soft hover:bg-primary-50 hover:text-primary-700";
const linkActive = "bg-primary-50 text-primary-700";

function NavItems({ groups }: { groups: ConsoleNavGroup[] }) {
  return (
    <>
      {groups.map((g, gi) => {
        const items = g.items.filter((i) => !i.hidden);
        if (items.length === 0) return null;
        return (
          <div key={gi} className={gi > 0 ? "mt-5" : ""}>
            {g.heading && (
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted/70">
                {g.heading}
              </p>
            )}
            <div className="space-y-0.5">
              {items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.end}
                  className={({ isActive }) =>
                    `${linkBase} ${isActive ? linkActive : linkIdle}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {i.icon && (
                        <span
                          className={`shrink-0 ${isActive ? "text-primary-600" : "text-ink-muted group-hover:text-primary-600"}`}
                          aria-hidden="true"
                        >
                          {i.icon}
                        </span>
                      )}
                      <span className="truncate">{i.label}</span>
                      {!!i.badge && i.badge > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-accent-500 text-white text-[11px] font-bold tabular-nums">
                          {i.badge > 99 ? "99+" : i.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function ConsoleLayout({
  title,
  subtitle,
  badge,
  nav,
  action,
  maxWidth = "max-w-6xl",
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string; // 사이드바 상단 역할 라벨(예: 관리자 · 변호사)
  nav: ConsoleNavGroup[];
  action?: ReactNode; // 사이드바 하단 액션(예: 새 사건 등록)
  maxWidth?: string;
  children: ReactNode;
}) {
  return (
    <div className="max-w-[1400px] mx-auto w-full px-4 py-6 lg:py-8">
      <div className="lg:flex lg:gap-8">
        {/* ── 사이드바(데스크톱) ── */}
        <aside className="hidden lg:block w-60 shrink-0">
          <div className="sticky top-20">
            <div className="mb-4 px-3">
              {badge && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 text-[11px] font-semibold mb-1">
                  {badge}
                </span>
              )}
              <h1 className="text-lg font-bold text-ink leading-tight">{title}</h1>
              {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
            </div>
            <nav aria-label={`${title} 메뉴`}>
              <NavItems groups={nav} />
            </nav>
            {action && <div className="mt-5 px-3">{action}</div>}
          </div>
        </aside>

        {/* ── 상단 스크롤 탭(모바일) ── */}
        <div className="lg:hidden mb-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              {badge && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 text-[11px] font-semibold mr-2">
                  {badge}
                </span>
              )}
              <h1 className="text-xl font-bold text-ink inline">{title}</h1>
            </div>
            {action}
          </div>
          <nav
            aria-label={`${title} 메뉴`}
            className="flex gap-1 overflow-x-auto -mx-4 px-4 pb-1 border-b border-gray-200"
          >
            {nav.flatMap((g) => g.items.filter((i) => !i.hidden)).map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.end}
                className={({ isActive }) =>
                  `px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                    isActive
                      ? "border-primary-500 text-primary-700"
                      : "border-transparent text-gray-500 hover:text-ink"
                  }`
                }
              >
                {i.label}
                {!!i.badge && i.badge > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full bg-accent-500 text-white text-[10px] font-bold tabular-nums align-middle">
                    {i.badge > 99 ? "99+" : i.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* ── 콘텐츠 ── */}
        <div className="flex-1 min-w-0">
          <div className={`${maxWidth} w-full`}>{children}</div>
        </div>
      </div>
    </div>
  );
}

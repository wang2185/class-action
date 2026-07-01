import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import type { ReactNode } from "react";

// ── 제공자별 공식 브랜드 로고 (인라인 SVG, 외부 의존성 없음) ──
// 카카오 로그인 디자인 가이드 준수: 컨테이너 #FEE500, 심볼/라벨 #191600.
// 단색 로고는 fill="currentColor"로 버튼 글자색을 따르고, 구글·마이크로소프트는 공식 다색.
const KakaoMark = (
  // 카카오 공식 "말풍선" 심볼 (developers.kakao.com 로그인 디자인 가이드)
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M12 3.5C6.477 3.5 2 7.017 2 11.358c0 2.776 1.842 5.215 4.624 6.61-.171.625-.62 2.259-.708 2.61-.11.435.16.428.337.312.139-.092 2.21-1.5 3.106-2.107.534.075 1.084.114 1.641.114 5.523 0 10-3.518 10-7.86C22 7.018 17.523 3.5 12 3.5z" />
  </svg>
);
const NaverMark = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
    <path d="M16.273 12.845 7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z" />
  </svg>
);
const GoogleMark = (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18A10.9 10.9 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" />
  </svg>
);
const FacebookMark = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M15.12 5.32H17V2.14A26.11 26.11 0 0 0 14.26 2c-2.72 0-4.58 1.66-4.58 4.7v2.6H6.61v3.56h3.07V22h3.68v-9.14h3.06l.46-3.56h-3.52V7.05c0-1.03.28-1.73 1.76-1.73z" />
  </svg>
);
const LineMark = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M12 2C6.2 2 1.5 5.85 1.5 10.6c0 4.25 3.73 7.82 8.78 8.5.34.07.8.22.92.51.1.26.07.67.03.94l-.15.9c-.04.26-.21 1.03.9.56s6-3.54 8.19-6.06C21.66 14.3 22.5 12.55 22.5 10.6 22.5 5.85 17.8 2 12 2zM8.14 13.1H6.06a.55.55 0 0 1-.55-.55V8.4a.55.55 0 0 1 1.1 0v3.6h1.53a.55.55 0 0 1 0 1.1zm2.16-.55a.55.55 0 0 1-1.1 0V8.4a.55.55 0 0 1 1.1 0v4.15zm5.02 0a.55.55 0 0 1-.99.33l-2.12-2.89v2.56a.55.55 0 0 1-1.1 0V8.4a.55.55 0 0 1 .99-.33l2.13 2.9V8.4a.55.55 0 0 1 1.1 0v4.15zm3.4-2.62a.55.55 0 0 1 0 1.1h-1.53v.97h1.53a.55.55 0 0 1 0 1.1h-2.08a.55.55 0 0 1-.55-.55V8.4a.55.55 0 0 1 .55-.55h2.08a.55.55 0 0 1 0 1.1h-1.53v.98h1.53z" />
  </svg>
);
const MicrosoftMark = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
    <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
    <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
    <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
  </svg>
);

// 버튼 스타일 + 로고 (카카오 디자인 가이드 색상 등 각 사 브랜드 준수)
const BRAND: Record<string, { cls: string; label: string; icon: ReactNode }> = {
  kakao: { cls: "bg-[#FEE500] text-[#191600] hover:brightness-95", label: "카카오로 계속하기", icon: KakaoMark },
  naver: { cls: "bg-[#03C75A] text-white hover:brightness-95", label: "네이버로 계속하기", icon: NaverMark },
  google: { cls: "bg-white text-[#1f2937] border border-gray-300 hover:bg-gray-50", label: "Google로 계속하기", icon: GoogleMark },
  facebook: { cls: "bg-[#1877F2] text-white hover:brightness-95", label: "Facebook으로 계속하기", icon: FacebookMark },
  line: { cls: "bg-[#06C755] text-white hover:brightness-95", label: "라인으로 계속하기", icon: LineMark },
  microsoft: { cls: "bg-[#2F2F2F] text-white hover:brightness-110", label: "Microsoft로 계속하기", icon: MicrosoftMark },
};

export default function SocialButtons({ redirect }: { redirect?: string }) {
  const { data } = useQuery({ queryKey: ["authProviders"], queryFn: () => apiRequest("/api/auth/providers") });
  const providers: { key: string; label: string }[] = data?.providers || [];
  if (!providers.length) return null;

  const q = redirect && redirect !== "/my" ? `?redirect=${encodeURIComponent(redirect)}` : "";

  return (
    <div>
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-sm text-gray-400">또는 간편 로그인</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>
      <div className="space-y-2">
        {providers.map((p) => {
          const b = BRAND[p.key];
          return (
            <a
              key={p.key}
              href={`/api/auth/${p.key}${q}`}
              className={`relative flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-medium transition ${b?.cls || "bg-gray-100 text-ink"}`}
            >
              {b?.icon && <span className="absolute left-4 flex items-center">{b.icon}</span>}
              <span>{b?.label || `${p.label}로 계속하기`}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

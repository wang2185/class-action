import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";

// 제공자별 브랜드 스타일 (활성 제공자는 서버 /api/auth/providers 가 결정)
const STYLE: Record<string, { cls: string; label: string }> = {
  kakao: { cls: "bg-[#FEE500] text-[#191600] hover:brightness-95", label: "카카오로 계속하기" },
  naver: { cls: "bg-[#03C75A] text-white hover:brightness-95", label: "네이버로 계속하기" },
  google: { cls: "bg-white text-ink border border-gray-300 hover:bg-gray-50", label: "Google로 계속하기" },
  facebook: { cls: "bg-[#1877F2] text-white hover:brightness-95", label: "Facebook으로 계속하기" },
  line: { cls: "bg-[#06C755] text-white hover:brightness-95", label: "라인으로 계속하기" },
  microsoft: { cls: "bg-[#2F2F2F] text-white hover:brightness-110", label: "Microsoft로 계속하기" },
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
        <span className="text-xs text-gray-400">또는 간편 로그인</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>
      <div className="space-y-2">
        {providers.map((p) => (
          <a key={p.key} href={`/api/auth/${p.key}${q}`} className={`btn w-full ${STYLE[p.key]?.cls || "bg-gray-100 text-ink"}`}>
            {STYLE[p.key]?.label || `${p.label}로 계속하기`}
          </a>
        ))}
      </div>
    </div>
  );
}

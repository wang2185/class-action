import { useEffect, useState } from "react";

// 카카오 JS 키(브라우저 공개키, 노출 무방). 빌드시 인라인. 미설정이면 카카오 버튼 숨김(복사·기본공유로 동작).
const KAKAO_KEY: string | undefined = import.meta.env.VITE_KAKAO_JS_KEY;

declare global {
  interface Window {
    Kakao?: any;
  }
}

interface Props {
  caseId: string | number;
  title: string;
  summary?: string;
  /** 사건 커버 이미지 경로(상대/절대) */
  image?: string;
}

export default function ShareButtons({ caseId, title, summary, image }: Props) {
  const [copied, setCopied] = useState(false);
  const [kakaoReady, setKakaoReady] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${origin}/cases/${caseId}`;
  const desc = (summary || "단체소송 참여자를 모집합니다").slice(0, 100);
  const imageUrl = image
    ? image.startsWith("http")
      ? image
      : `${origin}${image.startsWith("/") ? "" : "/"}${image}`
    : `${origin}/og-default.png`;

  // 카카오 SDK lazy-load (키 있을 때만). 공유 페이지에서만 로드.
  useEffect(() => {
    if (!KAKAO_KEY) return;
    const init = () => {
      try {
        if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(KAKAO_KEY);
        if (window.Kakao?.isInitialized()) setKakaoReady(true);
      } catch {
        /* noop */
      }
    };
    if (window.Kakao) {
      init();
      return;
    }
    const existing = document.getElementById("kakao-sdk") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", init);
      return () => existing.removeEventListener("load", init);
    }
    const s = document.createElement("script");
    s.id = "kakao-sdk";
    // 버전/키는 카카오 개발자센터 설정 시 함께 검증할 것.
    s.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
    s.crossOrigin = "anonymous";
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, []);

  const copyLink = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        // HTTP·인앱 브라우저 등 clipboard API 불가 환경 폴백
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("아래 링크를 복사하세요", shareUrl);
    }
  };

  const webShare = async () => {
    try {
      await navigator.share({ title, text: desc, url: shareUrl });
    } catch {
      /* 사용자 취소 등 무시 */
    }
  };

  const kakaoShare = () => {
    if (!window.Kakao?.isInitialized()) return;
    window.Kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title,
        description: desc,
        imageUrl,
        link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
      },
      buttons: [{ title: "참여하기", link: { mobileWebUrl: shareUrl, webUrl: shareUrl } }],
    });
  };

  const canWebShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="card">
      <h3 className="font-bold mb-2">공유하기</h3>
      <p className="text-xs text-gray-500 mb-3">링크를 공유해 더 많은 피해자와 함께하세요.</p>
      <div className="space-y-2">
        <button onClick={copyLink} className="btn-secondary w-full">
          {copied ? "✓ 링크가 복사되었습니다" : "링크 복사"}
        </button>
        {canWebShare && (
          <button onClick={webShare} className="btn-secondary w-full">
            공유…
          </button>
        )}
        {kakaoReady && (
          <button
            onClick={kakaoShare}
            className="w-full rounded-lg py-2 font-semibold"
            style={{ background: "#FEE500", color: "#191600" }}
          >
            카카오톡 공유
          </button>
        )}
      </div>
    </div>
  );
}

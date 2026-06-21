import { useEffect } from "react";

// 클라이언트 라우팅(SPA) 시 <title>·메타 디스크립션 동기화.
// 초기 로드 메타는 서버(server/seo.ts)가 주입하고, 이 훅은 화면 전환 시 갱신한다.
export function usePageMeta(title?: string, description?: string) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      let el = document.head.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", "description");
        document.head.appendChild(el);
      }
      el.setAttribute("content", description);
    }
  }, [title, description]);
}

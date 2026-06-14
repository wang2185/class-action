// 로그인/가입 후 복귀 경로 검증 — 오픈 리다이렉트 방지.
// new URL로 파싱해 origin이 현재 사이트와 같을 때만 내부 경로를 반환한다.
// (백슬래시·protocol-relative·인코딩 우회를 URL 파서가 정규화해 걸러냄)
export function safeRedirect(raw: string | null | undefined): string {
  if (!raw) return "/my";
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return "/my";
    // 인증 페이지로의 복귀는 루프 방지를 위해 차단
    if (u.pathname === "/login" || u.pathname === "/register") return "/my";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/my";
  }
}

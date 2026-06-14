// 사건별 OG(Open Graph) 메타 주입 — 카카오톡/페이스북 등 링크 공유 시 미리보기 카드.
// SPA(index.html 단일 파일)라 크롤러용 메타를 서버가 요청 시점에 주입한다.
import { db } from "./db";
import { cases } from "../shared/schema";
import { eq } from "drizzle-orm";

// 공유 카드의 절대 URL 기준. 요청 Host 헤더를 신뢰하지 않고 고정값 사용(언퍼를 스푸핑 방지).
const BASE = (process.env.PUBLIC_BASE_URL || process.env.CORS_ORIGIN || "https://class.day.lawyer").replace(/\/$/, "");

const PG_INT_MAX = 2147483647;

function escapeAttr(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type CaseOg = { title: string; description: string; image: string; url: string };

// OG 봇(카톡/페북/슬랙)이 같은 링크를 반복 수집할 때 DB 과부하 방지용 짧은 메모리 캐시.
const ogCache = new Map<number, { og: CaseOg | null; exp: number }>();
const OG_TTL_MS = 60_000;

// 사건 1행을 읽어 OG 값 구성. 없거나 오류면 null(→ 기본 태그 사용).
export async function buildCaseOg(id: number): Promise<CaseOg | null> {
  if (!Number.isInteger(id) || id < 1 || id > PG_INT_MAX) return null;

  const cached = ogCache.get(id);
  if (cached && cached.exp > Date.now()) return cached.og;

  let og: CaseOg | null = null;
  try {
    const [c] = await db.select().from(cases).where(eq(cases.id, id)).limit(1);
    if (c) {
      const title = `${c.title} | 법무법인 윈스 단체소송`;
      const description = (c.summary || c.description || "단체소송 참여자를 모집합니다 - 법무법인 윈스")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 150);
      let image = `${BASE}/og-default.jpg`;
      if (c.coverImage) {
        image = c.coverImage.startsWith("http")
          ? c.coverImage
          : `${BASE}${c.coverImage.startsWith("/") ? "" : "/"}${c.coverImage}`;
      }
      og = { title, description, image, url: `${BASE}/cases/${id}` };
    }
  } catch (err) {
    console.error("OG 조회 오류:", err);
    og = null;
  }

  ogCache.set(id, { og, exp: Date.now() + OG_TTL_MS });
  return og;
}

// index.html 의 기존 <title>·description·og:*·twitter:* 를 모두 제거하고 사건값으로 교체.
// 본문·스크립트는 건드리지 않는다(SPA 정상 마운트 보장).
export function injectCaseOg(html: string, og: CaseOg): string {
  const t = escapeAttr(og.title);
  const d = escapeAttr(og.description);
  const img = escapeAttr(og.image);
  const url = escapeAttr(og.url);
  const block = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="법무법인 윈스 단체소송" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
  ].join("\n    ");
  // 기존 태그 제거(빈 문자열 치환이라 $ 패턴 안전). 사건별 태그가 유일하도록.
  const out = html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name="description"[^>]*>/gi, "")
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "")
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, "");
  if (!out.includes("</head>")) return out; // </head> 없으면 주입 생략(안전)
  // 콜백 치환으로 block 내 $& $1 등 특수 패턴 오해석 방지.
  return out.replace("</head>", () => `    ${block}\n  </head>`);
}

// SEO · AEO · GEO 코어
// SPA(index.html 단일 파일)라 크롤러·답변엔진·생성AI가 JS 없이도 읽도록,
// 서버가 요청 라우트별 <title>·메타·OG·구조화데이터(JSON-LD)를 index.html 에 주입한다.
// + robots.txt / sitemap.xml / llms.txt 동적 제공.
import type { Express, Request, Response } from "express";
import { db } from "./db";
import { cases } from "../shared/schema";
import { desc } from "drizzle-orm";
import type { CaseOg } from "./og";

export const BASE = (process.env.PUBLIC_BASE_URL || process.env.CORS_ORIGIN || "https://class.lawciety.com").replace(/\/$/, "");
const SITE = "로사이어티 집단소송";
const HOME_DESC =
  "같은 피해를 입은 여러 사람이 함께하는 집단·공동소송 플랫폼. 법무법인 윈스 허왕 변호사가 사건을 직접 검토·수행합니다. 진행 중인 집단소송 참여부터 새 사건 요청까지 한곳에서.";
export { HOME_DESC };

function escAttr(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
// JSON-LD 안전 직렬화: </script> 조기종료·U+2028/2029 차단
function jsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

// ── 사무소(법무법인 윈스) 상수 ──
const ADDRESS = {
  "@type": "PostalAddress",
  streetAddress: "삼성로 566, 2층 (삼성동, 빌딩엠)",
  addressLocality: "강남구", addressRegion: "서울특별시", postalCode: "06163", addressCountry: "KR",
};

// ── 구조화 데이터 빌더(AEO/GEO) ──
export function orgLd() {
  return {
    "@context": "https://schema.org", "@type": "LegalService", "@id": `${BASE}/#org`,
    name: SITE, legalName: "법무법인 윈스", url: BASE,
    logo: `${BASE}/brand/appicon-512.png`, image: `${BASE}/og-default.jpg`,
    telephone: "+82-2-556-6800", faxNumber: "+82-2-556-6809", priceRange: "₩₩",
    areaServed: { "@type": "Country", name: "대한민국" }, address: ADDRESS,
    founder: [{ "@type": "Person", name: "허왕" }, { "@type": "Person", name: "박형일" }],
    sameAs: ["https://day.lawyer", "https://willsave.co.kr", "https://winslaw.co.kr"],
    description: HOME_DESC,
  };
}
export function websiteLd() {
  return {
    "@context": "https://schema.org", "@type": "WebSite", "@id": `${BASE}/#website`,
    name: SITE, alternateName: "Lawciety", url: BASE, inLanguage: "ko-KR",
    publisher: { "@id": `${BASE}/#org` },
  };
}
export function personLd() {
  return {
    "@context": "https://schema.org", "@type": "Attorney", "@id": `${BASE}/lawyer#heowang`,
    name: "허왕", jobTitle: "변호사", url: `${BASE}/lawyer`, image: `${BASE}/lawyer-heowang.jpg`,
    worksFor: { "@type": "LegalService", name: "법무법인 윈스" },
    knowsAbout: ["집단소송", "공동소송", "손해배상", "소비자 피해", "부동산", "IT·블록체인"],
    alumniOf: [
      { "@type": "CollegeOrUniversity", name: "고려대학교" },
      { "@type": "CollegeOrUniversity", name: "건국대학교" },
    ],
  };
}
// FAQ — client/pages/Faq.tsx 와 동기화 유지(변경 시 양쪽 함께 수정)
const FAQ: { q: string; a: string }[] = [
  { q: "집단소송에 참여하면 비용이 얼마나 드나요?", a: "사건마다 착수금이 사전에 고지되며, 참여 화면과 사건 상세에서 금액을 미리 확인하실 수 있습니다. 여러 당사자가 함께하므로 1인당 부담이 낮아집니다. 성공보수는 수임계약과 약관에 따라 결과가 발생한 경우에 한해 산정되며, 기준은 계약 전 안내드립니다." },
  { q: "누가 참여할 수 있나요?", a: "같은 사실관계로 동일하거나 유사한 피해를 입은 분이면 참여하실 수 있습니다. 사건별 참여 조건과 대상은 사건 상세 페이지에 표기되어 있습니다." },
  { q: "꼭 회원가입을 해야 하나요?", a: "참여 신청, 증거 자료 제출, 진행 상황 확인을 위해 회원가입이 필요합니다. 가입은 이메일로 간편하게 진행됩니다." },
  { q: "제 개인정보와 자료는 안전한가요?", a: "주민등록번호 등 민감정보는 암호화(AES-256)되어 저장되고, 접근 기록이 감사 로그로 남습니다. 수집된 정보는 소송 수행 목적 외에는 사용되지 않습니다. 자세한 내용은 개인정보처리방침에서 확인하실 수 있습니다." },
  { q: "이기면 돈을 돌려받을 수 있나요?", a: "사건의 성패와 실제 회수 가능 금액은 사실관계와 증거, 상대방의 자력 등에 따라 달라지며, 어떠한 결과도 보장되지 않습니다. 허왕 변호사가 제출된 자료를 검토해 진행 가능성과 예상되는 절차를 솔직하게 안내드립니다." },
  { q: "중간에 참여를 그만둘 수 있나요?", a: "참여 철회와 환불은 이용약관과 수임계약이 정한 절차에 따릅니다. 소 제기 전후에 따라 처리 방법이 다를 수 있어, 철회를 원하시면 먼저 안내를 받으시길 권합니다." },
  { q: "결제는 안전한가요?", a: "착수금 결제는 NicePay 안전 결제창을 통해 이루어지며, 카드 정보는 플랫폼에 저장되지 않습니다. 결제 후 영수 내역은 내 사건에서 확인하실 수 있습니다." },
  { q: "변호사가 직접 사건을 맡나요?", a: "법무법인 윈스의 허왕 변호사가 직접 자료를 검토하고 소장·준비서면 작성과 재판 수행을 담당합니다." },
  { q: "등록된 사건이 없는데 새로 만들 수 있나요?", a: "네. 사건 요청 페이지에서 피해 내용을 알려주시면 허왕 변호사가 검토한 뒤, 같은 피해자를 모아 새로운 사건을 개설할 수 있는지 안내드립니다." },
];
export function faqLd() {
  return {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${BASE}${it.path}` })),
  };
}
const crumbHome = { name: "홈", path: "/" };

// ── 메타 모델 ──
export type Seo = { title: string; description: string; path: string; image?: string; robots?: string; ogType?: string; jsonLd?: unknown[] };

function renderHead(seo: Seo): string {
  const t = escAttr(seo.title), d = escAttr(seo.description);
  const url = escAttr(`${BASE}${seo.path === "/" ? "/" : seo.path}`);
  const img = escAttr(seo.image || `${BASE}/og-default.jpg`);
  const robots = escAttr(seo.robots || "index,follow,max-image-preview:large,max-snippet:-1");
  const lines = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="${escAttr(seo.ogType || "website")}" />`,
    `<meta property="og:site_name" content="로사이어티 집단소송" />`,
    `<meta property="og:locale" content="ko_KR" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
  ];
  for (const obj of seo.jsonLd || []) lines.push(`<script type="application/ld+json">${jsonLd(obj)}</script>`);
  return lines.join("\n    ");
}

// index.html 의 기존 SEO 태그(타이틀/메타/OG/트위터/canonical/JSON-LD)를 제거하고 라우트값으로 교체.
// 본문·스크립트(루트 div, 모듈 진입점)는 건드리지 않는다.
export function injectSeo(html: string, seo: Seo): string {
  const out = html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name="description"[^>]*>/gi, "")
    .replace(/<meta\s+name="robots"[^>]*>/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>/gi, "")
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "")
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, "")
    .replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi, "");
  if (!out.includes("</head>")) return out;
  return out.replace("</head>", () => `    ${renderHead(seo)}\n  </head>`);
}

// ── 정적 라우트 메타 ──
const ROUTES: Record<string, () => Seo> = {
  "/": () => ({ title: "로사이어티 집단소송 | 법무법인 윈스 허왕 변호사", description: HOME_DESC, path: "/", jsonLd: [orgLd(), websiteLd()] }),
  "/cases": () => ({ title: "진행 중인 집단소송 — 사건 참여 | 로사이어티", description: "현재 참여 가능한 집단·공동소송 목록입니다. 같은 피해를 입었다면 함께 참여해 비용과 부담을 나누세요. 법무법인 윈스 허왕 변호사가 직접 수행합니다.", path: "/cases", jsonLd: [breadcrumbLd([crumbHome, { name: "사건 참여", path: "/cases" }])] }),
  "/guide": () => ({ title: "이용 안내 — 집단소송 참여 방법 | 로사이어티", description: "사건 확인부터 참여 신청, 자료 제출, 착수금 결제, 진행 상황 확인까지. 로사이어티 집단소송 이용 절차를 단계별로 안내합니다.", path: "/guide", jsonLd: [breadcrumbLd([crumbHome, { name: "사용 안내", path: "/guide" }])] }),
  "/lawyer": () => ({ title: "허왕 변호사 — 법무법인 윈스 | 로사이어티 집단소송", description: "집단·공동소송을 직접 수행하는 법무법인 윈스 허왕 변호사. 약력과 전문 분야를 소개합니다.", path: "/lawyer", jsonLd: [personLd(), breadcrumbLd([crumbHome, { name: "변호사", path: "/lawyer" }])] }),
  "/request": () => ({ title: "사건 요청 — 새 집단소송 제안 | 로사이어티", description: "등록된 사건이 없어도 괜찮습니다. 피해 내용을 알려주시면 허왕 변호사가 검토해 같은 피해자를 모아 새 집단소송 개설이 가능한지 안내합니다.", path: "/request", jsonLd: [breadcrumbLd([crumbHome, { name: "사건 요청", path: "/request" }])] }),
  "/faq": () => ({ title: "자주 묻는 질문 | 로사이어티 집단소송", description: "비용, 참여 자격, 개인정보 보호, 환불, 결제 안전성 등 집단소송 참여 전 가장 많이 묻는 질문을 모았습니다.", path: "/faq", jsonLd: [faqLd(), breadcrumbLd([crumbHome, { name: "자주 묻는 질문", path: "/faq" }])] }),
  "/privacy": () => ({ title: "개인정보처리방침 | 로사이어티 집단소송", description: "로사이어티 집단소송의 개인정보 수집·이용·보관·파기 및 이용자 권리에 관한 처리방침입니다.", path: "/privacy", robots: "index,follow", jsonLd: [breadcrumbLd([crumbHome, { name: "개인정보처리방침", path: "/privacy" }])] }),
  "/terms": () => ({ title: "이용약관 | 로사이어티 집단소송", description: "로사이어티 집단소송 서비스 이용약관입니다.", path: "/terms", robots: "index,follow", jsonLd: [breadcrumbLd([crumbHome, { name: "이용약관", path: "/terms" }])] }),
  "/consent": () => ({ title: "개인정보 수집·이용 동의 | 로사이어티 집단소송", description: "개인정보 수집·이용 동의 안내입니다.", path: "/consent", robots: "index,follow", jsonLd: [breadcrumbLd([crumbHome, { name: "개인정보 수집·이용 동의", path: "/consent" }])] }),
};

const NOINDEX_PREFIXES = ["/login", "/register", "/my", "/welcome", "/admin", "/payment"];
const NOINDEX_CASE_SUB = /^\/cases\/\d+\/(join|contract|payment|progress|seizure|billing|payment-order)\/?$/;

// 정적·기타 라우트의 Seo (사건 상세 /cases/:id 는 index.ts 가 caseSeo 로 별도 처리)
export function getRouteSeo(path: string): Seo {
  const clean = (path.replace(/\/+$/, "") || "/").split("?")[0];
  if (ROUTES[clean]) return ROUTES[clean]();
  if (NOINDEX_PREFIXES.some((p) => clean === p || clean.startsWith(p + "/")) || NOINDEX_CASE_SUB.test(clean)) {
    return { title: "로사이어티 집단소송", description: HOME_DESC, path: clean, robots: "noindex,follow" };
  }
  // 알 수 없는 경로: 홈 메타 + noindex(중복 색인 방지)
  return { title: "로사이어티 집단소송 | 법무법인 윈스", description: HOME_DESC, path: clean, robots: "noindex,follow" };
}

// 사건 상세 Seo (buildCaseOg 결과 + 사건 구조화데이터)
export function caseSeo(og: CaseOg, id: number): Seo {
  const raw = og.title.replace(/\s*\|\s*로사이어티 집단소송\s*$/, "");
  return {
    title: og.title, description: og.description, path: `/cases/${id}`, image: og.image, ogType: "article",
    jsonLd: [orgLd(), breadcrumbLd([crumbHome, { name: "사건 참여", path: "/cases" }, { name: raw, path: `/cases/${id}` }])],
  };
}

// ── robots.txt / sitemap.xml / llms.txt ──
const LLMS_TXT = `# 로사이어티 집단소송 (Lawciety)

> 같은 피해를 입은 여러 사람이 함께하는 집단·공동소송 플랫폼. 법무법인 윈스 소속 허왕 변호사가 사건을 직접 검토하고 소장·준비서면 작성과 재판 수행을 담당합니다. 진행 중인 집단소송 참여와 새 사건 요청을 한곳에서 처리합니다.

운영: 법무법인 윈스 (대표변호사 허왕·박형일) · 서울특별시 강남구 삼성로 566 · 02-556-6800
사이트: ${BASE}

## 핵심 페이지
- [사건 참여](${BASE}/cases): 현재 참여 가능한 집단·공동소송 목록
- [사용 안내](${BASE}/guide): 참여 절차(사건 확인 → 신청 → 자료 제출 → 착수금 결제 → 진행 확인)
- [변호사](${BASE}/lawyer): 허왕 변호사 약력·전문 분야
- [사건 요청](${BASE}/request): 새 집단소송 제안(피해 내용 접수)
- [자주 묻는 질문](${BASE}/faq): 비용·참여 자격·개인정보·환불·결제

## 무엇을 하나
- 다수 원고(공동·집단소송): 같은 가해자·사건으로 피해를 입은 다수가 함께 소를 제기
- 다수 상대방(일괄청구): 한 당사자가 다수 채무자·상대방에게 지급명령·가압류·소송을 일괄 진행

## 알아두기
- 결과(승소·회수 금액)는 보장되지 않으며 사실관계·증거·상대방의 자력에 따라 달라집니다.
- 비용은 사건별 착수금이 사전 고지되며, 성공보수는 수임계약·약관에 따릅니다.
- 민감정보(주민등록번호 등)는 AES-256으로 암호화 저장되고 접근은 감사 로그로 관리됩니다.

## 관련 서비스 (법무법인 윈스)
- [데이로이어](https://day.lawyer): 법률 상담 구독
- [윌세이브](https://willsave.co.kr): 유언장 작성·보관
`;

export function registerSeoRoutes(app: Express) {
  app.get("/robots.txt", (_req: Request, res: Response) => {
    res.type("text/plain").send(
`User-agent: *
Allow: /
Disallow: /admin
Disallow: /my
Disallow: /welcome
Disallow: /login
Disallow: /register
Disallow: /api/

# 생성형 AI · 답변엔진 크롤러 허용 (GEO/AEO)
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: anthropic-ai
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Applebot-Extended
Allow: /

Sitemap: ${BASE}/sitemap.xml`);
  });

  app.get("/sitemap.xml", async (_req: Request, res: Response) => {
    const staticUrls = [
      { loc: "/", pri: "1.0", freq: "daily" },
      { loc: "/cases", pri: "0.9", freq: "daily" },
      { loc: "/request", pri: "0.8", freq: "monthly" },
      { loc: "/guide", pri: "0.7", freq: "monthly" },
      { loc: "/lawyer", pri: "0.7", freq: "monthly" },
      { loc: "/faq", pri: "0.7", freq: "monthly" },
      { loc: "/terms", pri: "0.3", freq: "yearly" },
      { loc: "/privacy", pri: "0.3", freq: "yearly" },
    ];
    const parts: string[] = staticUrls.map((u) => `  <url><loc>${BASE}${u.loc}</loc><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`);
    try {
      const rows = await db.select({ id: cases.id, createdAt: cases.createdAt }).from(cases).orderBy(desc(cases.createdAt)).limit(5000);
      for (const c of rows) {
        const lm = c.createdAt ? new Date(c.createdAt as any).toISOString() : null;
        parts.push(`  <url><loc>${BASE}/cases/${c.id}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ""}<changefreq>weekly</changefreq><priority>0.8</priority></url>`);
      }
    } catch (e) {
      console.error("sitemap 사건 조회 오류:", e);
    }
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${parts.join("\n")}\n</urlset>`);
  });

  app.get("/llms.txt", (_req: Request, res: Response) => {
    res.type("text/plain; charset=utf-8").send(LLMS_TXT);
  });
}

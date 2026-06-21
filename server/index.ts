import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes";
import { buildCaseOg } from "./og";
import { registerSeoRoutes, getRouteSeo, caseSeo, injectSeo } from "./seo";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || "5001");
const isProd = process.env.NODE_ENV === "production";

// Nginx 리버스 프록시(127.0.0.1) 환경: 첫 프록시 홉만 신뢰
app.set("trust proxy", 1);

// Security
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://web.nicepay.co.kr", "https://sandbox.nicepay.co.kr", "https://t1.kakaocdn.net", "https://developers.kakao.com"],
        frameSrc: ["'self'", "https://web.nicepay.co.kr", "https://sandbox.nicepay.co.kr"],
        connectSrc: ["'self'", "https://webapi.nicepay.co.kr", "https://sandbox.nicepay.co.kr", "https://*.kakao.com", "https://*.kakaocdn.net"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      },
    },
  })
);

// CORS
const allowedOrigins = isProd
  ? [process.env.CORS_ORIGIN || "https://class.lawciety.com"]
  : ["http://localhost:5173", "http://localhost:5001"];

app.use(cors({ origin: allowedOrigins, credentials: true }));

// Rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 200,
    message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
  })
);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Auth
setupAuth(app);

// API Routes
registerRoutes(app);

// SEO/AEO/GEO: robots.txt · sitemap.xml · llms.txt (SPA catch-all·static 보다 먼저 등록)
registerSeoRoutes(app);

// Static files (uploaded evidence)
app.use("/uploads", express.static(path.resolve("public/uploads")));

// SPA - serve built frontend
if (isProd) {
  const publicDir = path.resolve(__dirname, "public");
  const indexPath = path.join(publicDir, "index.html");
  let indexHtml = "";
  try {
    indexHtml = fs.readFileSync(indexPath, "utf-8");
  } catch (e) {
    console.error("index.html 로드 실패:", e);
  }
  app.use(express.static(publicDir, { index: false }));
  app.get("*", async (req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "API 경로를 찾을 수 없습니다." });
    }
    if (!indexHtml) return res.sendFile(indexPath);
    try {
      // 사건 상세: 사건값으로 메타+OG+구조화데이터 주입(링크 미리보기·검색·답변/생성AI)
      const m = req.path.match(/^\/cases\/(\d+)\/?$/);
      if (m) {
        const id = parseInt(m[1], 10);
        const og = await buildCaseOg(id);
        if (og) return res.send(injectSeo(indexHtml, caseSeo(og, id)));
        return res.send(injectSeo(indexHtml, { title: "사건을 찾을 수 없습니다 | 로사이어티 집단소송", description: "요청하신 사건을 찾을 수 없습니다.", path: req.path, robots: "noindex,follow" }));
      }
      return res.send(injectSeo(indexHtml, getRouteSeo(req.path)));
    } catch (e) {
      console.error("SEO 주입 오류:", e);
      return res.send(indexHtml);
    }
  });
}

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("서버 오류:", err);
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "파일 크기가 제한을 초과했습니다." });
  }
  res.status(500).json({ error: "서버 내부 오류가 발생했습니다." });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[class-action] 서버 시작: http://127.0.0.1:${PORT} (${isProd ? "production" : "development"})`);
});

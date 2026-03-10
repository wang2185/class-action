import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || "5001");
const isProd = process.env.NODE_ENV === "production";

// Security
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://web.nicepay.co.kr", "https://sandbox.nicepay.co.kr"],
        frameSrc: ["'self'", "https://web.nicepay.co.kr", "https://sandbox.nicepay.co.kr"],
        connectSrc: ["'self'", "https://webapi.nicepay.co.kr", "https://sandbox.nicepay.co.kr"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      },
    },
  })
);

// CORS
const allowedOrigins = isProd
  ? [process.env.CORS_ORIGIN || "https://class.day.lawyer"]
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

// Static files (uploaded evidence)
app.use("/uploads", express.static(path.resolve("public/uploads")));

// SPA - serve built frontend
if (isProd) {
  const publicDir = path.resolve(__dirname, "public");
  app.use(express.static(publicDir));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "API 경로를 찾을 수 없습니다." });
    }
    res.sendFile(path.join(publicDir, "index.html"));
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

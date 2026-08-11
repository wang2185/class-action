import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  root: ".",
  // ⛔ publicDir 을 "public" 으로 두면 안 된다. public/uploads 가 업로드물(증거·첨부)
  // 실저장소라, 빌드할 때마다 그 내용이 dist/public 으로 복사되어 정적 서빙 대상이 된다.
  // 배포용 정적 자산은 static/ 에만 둔다.
  publicDir: "static",
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:5001",
      "/pay": "http://localhost:5001", // 결제 단축링크(개발 시 백엔드로 프록시)
    },
  },
});

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

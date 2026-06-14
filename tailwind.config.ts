import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./client/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Porcelain · Teal — 시그니처 틸(회복·정의), 친근한 프리미엄
        primary: {
          50: "#F0F9F8",
          100: "#DCF1EE",
          200: "#BAE3DD",
          300: "#8DCEC6",
          400: "#4FB3A8",
          500: "#0E8F84",
          600: "#0A6B62",
          700: "#0A564F",
          800: "#0C443F",
          900: "#0C3631",
        },
        // 코랄 — CTA 포인트(따뜻한 활력)
        accent: {
          50: "#FEF1ED",
          100: "#FDE0D8",
          200: "#FBC3B4",
          400: "#F4866C",
          500: "#F0674B",
          600: "#D8543A",
          700: "#B5432D",
        },
        // 잉크 — 본문·제목(딥 틸블랙)
        ink: {
          DEFAULT: "#122A2A",
          soft: "#2C3F3D",
          muted: "#5C706D",
        },
        porcelain: "#F4FBFA",
      },
      fontFamily: {
        sans: ["Pretendard", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(18,42,42,0.04), 0 10px 30px -14px rgba(14,143,132,0.18)",
        card: "0 1px 3px rgba(18,42,42,0.05), 0 14px 30px -16px rgba(14,143,132,0.16)",
        lift: "0 16px 40px -12px rgba(14,143,132,0.30)",
        cta: "0 10px 24px -10px rgba(240,103,75,0.45)",
      },
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;

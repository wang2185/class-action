import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./client/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cyan-Teal × Cobalt — 밝고 산뜻한 청록(회복·정의) 메인 + 코발트 포인트
        primary: {
          50: "#ECFBFC",
          100: "#CFF3F6",
          200: "#A5E8ED",
          300: "#6FD6DF",
          400: "#34BCC9",
          500: "#0FA6B8",
          600: "#0B8595",
          700: "#0C6A77",
          800: "#0F535E",
          900: "#103E47",
        },
        // 코발트 블루 — CTA·포인트
        accent: {
          50: "#EEF2FE",
          100: "#DCE4FD",
          200: "#BCCBFB",
          400: "#6E8DF6",
          500: "#3B6EF0",
          600: "#2553D8",
          700: "#1E45B0",
        },
        // 잉크 — 본문·제목(가벼운 틸슬레이트)
        ink: {
          DEFAULT: "#12303A",
          soft: "#33474E",
          muted: "#5E737A",
        },
        porcelain: "#F6FCFD",
      },
      fontFamily: {
        sans: ["Pretendard", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(18,48,58,0.04), 0 10px 30px -14px rgba(15,166,184,0.20)",
        card: "0 1px 3px rgba(18,48,58,0.05), 0 14px 30px -16px rgba(15,166,184,0.16)",
        lift: "0 16px 40px -12px rgba(15,166,184,0.30)",
        cta: "0 10px 24px -10px rgba(59,110,240,0.42)",
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

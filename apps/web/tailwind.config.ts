import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        studio: {
          50: "#f6f7fb",
          100: "#eef0f7",
          200: "#e2e5ef",
          300: "#cdd2e3",
          400: "#b2b9d3",
          500: "#929bc0",
          600: "#737bae",
          700: "#5d649b",
          800: "#4e547f",
          900: "#434868",
          950: "#282b40",
        },
      },
      boxShadow: {
        soft: "0 18px 45px rgba(15,23,42,.08)",
        card: "0 1px 3px rgba(15,23,42,.04), 0 4px 12px rgba(15,23,42,.05)",
        elevated: "0 8px 30px rgba(15,23,42,.10)",
      },
      borderRadius: {
        "2.5xl": "1.25rem",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.25s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

// apps/customer/tailwind.config.ts
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./context/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        error: "#942f25",
        warning: "#82450f",
        "bg-primary": "#fbf5ee",
        "bg-surface": "#fffaf4",
        "bg-elevated": "#f3e4d1",
        "bg-card": "#fff7ef",
        "bg-input": "#f5ead9",
        accent: "#c8813a",
        "accent-hover": "#d48a3e",
        "accent-light": "#e0943f",
        "accent-glow": "rgba(200, 129, 58, 0.18)",
        "accent-subtle": "rgba(200, 129, 58, 0.08)",
        "text-primary": "#4f2f16",
        "text-secondary": "#7a5532",
        "text-muted": "#9a7a5b",
        "text-faint": "#bfa07a",
        border: "#dcc2a2",
        "border-hover": "#c89f6c",
        "border-active": "#c8813a",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(79,47,22,0.04), 0 4px 12px rgba(79,47,22,0.03)",
        "card-hover":
          "0 4px 16px rgba(79,47,22,0.08), 0 1px 4px rgba(79,47,22,0.04)",
        elevated:
          "0 8px 32px rgba(79,47,22,0.08), 0 2px 8px rgba(79,47,22,0.04)",
        cta: "0 4px 20px rgba(200,129,58,0.25), 0 1px 4px rgba(200,129,58,0.15)",
        "cta-hover":
          "0 6px 28px rgba(200,129,58,0.3), 0 2px 8px rgba(200,129,58,0.2)",
        float:
          "0 12px 40px rgba(79,47,22,0.12), 0 4px 12px rgba(79,47,22,0.06)",
      },
      borderRadius: {
        "4xl": "28px",
        "5xl": "32px",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
        slow: "350ms",
      },
    },
  },
  plugins: [],
};

export default config;

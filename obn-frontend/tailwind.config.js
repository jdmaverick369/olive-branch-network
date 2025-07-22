/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#f8f5f2", // light earth background
        foreground: "#1a1a1a", // dark text
        primary: {
          DEFAULT: "#3B7A57", // earthy green
          dark: "#2F5F45",
        },
        secondary: {
          DEFAULT: "#5D8AA8", // soft earthy blue
          dark: "#466A80",
        },
        accent: {
          DEFAULT: "#A0522D", // warm brown
          dark: "#7B3B20",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
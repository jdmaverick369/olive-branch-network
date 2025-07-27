/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
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
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Noto Sans",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "Courier New",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./ui/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        shell: "#ece7de",
        parchment: "#f8f4ec",
        sand: "#e5ddcf",
        line: "#c9bca7",
        ink: "#1a1711",
        "ink-soft": "#4f473b",
        cobalt: "#2d4fb8",
        mint: "#2f9377",
        ember: "#b74f1f",
      },
      fontFamily: {
        display: ['"Iowan Old Style"', '"Palatino Linotype"', '"Book Antiqua"', "serif"],
        body: ['"Avenir Next"', '"Segoe UI"', '"Trebuchet MS"', "sans-serif"],
        mono: ['"SFMono-Regular"', '"Menlo"', '"Monaco"', "monospace"],
      },
      boxShadow: {
        panel: "0 14px 28px -20px rgba(32, 22, 8, 0.55)",
      },
      backgroundImage: {
        grain:
          "radial-gradient(circle at 1px 1px, rgba(48, 39, 27, 0.08) 1px, transparent 0)",
        halo:
          "radial-gradient(circle at 24% 20%, rgba(45, 79, 184, 0.26), transparent 48%), radial-gradient(circle at 84% 74%, rgba(183, 79, 31, 0.18), transparent 40%)",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "0.7" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

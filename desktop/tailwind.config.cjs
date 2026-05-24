/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./ui/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        shell: "#f3f5f0",
        line: "#d9dfd5",
        ink: "#17201b",
        "ink-soft": "#5c675f",
        spotify: "#1db954",
        "spotify-dark": "#169744",
        steam: "#1e56a0",
        ember: "#c2472d",
        "ember-dark": "#a83824",
      },
      fontFamily: {
        display: ['"Avenir Next"', '"Segoe UI"', "Inter", "sans-serif"],
        body: ['"Avenir Next"', '"Segoe UI"', "Inter", "sans-serif"],
        mono: ['"SFMono-Regular"', '"Menlo"', '"Monaco"', "monospace"],
      },
      boxShadow: {
        panel: "0 18px 42px -30px rgba(23, 32, 27, 0.45)",
        soft: "0 12px 28px -18px rgba(23, 32, 27, 0.65)",
      },
      backgroundImage: {
        halo:
          "radial-gradient(circle at 22% 20%, rgba(29, 185, 84, 0.18), transparent 42%), radial-gradient(circle at 88% 78%, rgba(30, 86, 160, 0.14), transparent 40%)",
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

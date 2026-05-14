/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/landing/**/*.html"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        body: ["Manrope", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#111827",
        sand: "#fdf6ea",
        ember: "#d97706",
        tide: "#0f766e"
      },
      boxShadow: {
        glow: "0 22px 60px -30px rgba(15, 118, 110, 0.45)",
        soft: "0 18px 45px -30px rgba(15, 23, 42, 0.28)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" }
        }
      },
      animation: {
        "fade-up": "fade-up 700ms ease-out both",
        "float-slow": "float-slow 7s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

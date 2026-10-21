export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg:     "#070a0f",
        panel:  "#0d1219",
        panel2: "#111823",
        line:   "#1c2533",
        ink:    "#c9d6e6",
        dim:    "#5b6b83",
        accent: "#5fd4a0",
        rec:    "#ff4d5e",
        warn:   "#ffb020",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

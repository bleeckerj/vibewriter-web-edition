module.exports = {
  content: [
    "./vanilla/index.html",
    "./vanilla/*.html",
    "./vanilla/**/*.html"
  ],
    safelist: [
    "text-4xl",
    "text-5xl",
    "text-6xl",
    "sm:text-2xl",
    "text-3xl",
    // add any classes you want to always include
    ],
  theme: {
    extend: {},
  },
  plugins: [],
};

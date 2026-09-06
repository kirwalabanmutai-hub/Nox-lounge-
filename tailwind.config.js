/** Precompiled Tailwind build - see npm run build:css. Same theme the old runtime CDN config used. */
module.exports = {
  content: ['./public/index.html', './public/js/**/*.js'],
  theme: {
    extend: {
      colors: { brand: { DEFAULT: '#7c3aed', dark: '#5b21b6' } },
    },
  },
  plugins: [],
};

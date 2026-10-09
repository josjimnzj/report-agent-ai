/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        brandlight: '#009cdb',
        brandblue: '#074863',
        ink: { DEFAULT: '#0f2a3d', soft: '#4a6274', muted: '#7b8d9a' },
        canvas: '#f3f7fb',
        line: '#e3eaf1',
        good: '#0f8a4a',
        bad: '#c62f2f',
      },
      fontFamily: { sans: ['"Segoe UI"', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(15,42,61,.06), 0 1px 8px rgba(15,42,61,.04)' },
    },
  },
  // dx.light.css estiliza h1–h6 bajo .dx-viewport; con este prefijo las utilidades ganan en especificidad.
  important: '.dx-viewport',
  corePlugins: { preflight: false },
  plugins: [],
};

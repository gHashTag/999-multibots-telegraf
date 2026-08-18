/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '480px',
        '3xl': '1920px',
      },
      colors: {
        'editor-bg': '#0a0a0a',
        'panel-bg': '#1a1a1a',
        'panel-border': '#2a2a2a',
        'vibee-amber': '#f59e0b',
        'vibee-amber-light': '#fbbf24',
        'vibee-amber-dark': '#d97706',
      }
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        baps: {
          saffron: '#C56B27',
          gold: '#D97706',
          maroon: '#781D26',
          sand: '#FAF6F0',
          ivory: '#FFFDF9',
          navy: '#1E293B',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'serif'],
      },
    },
  },
  plugins: [],
};

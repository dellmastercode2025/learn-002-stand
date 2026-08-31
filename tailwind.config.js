/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // «Восточная акварельная учебная книга»
        cream: {
          50: '#fdfbf5',
          100: '#faf6ec',
          200: '#f3ecdb',
          300: '#e9dfc6',
        },
        sage: {
          50: '#f4f7f2',
          100: '#e5ecdf',
          200: '#cddcc3',
          300: '#aec49f',
          400: '#8aa878',
          500: '#6c8d5b',
          600: '#547147',
          700: '#43593a',
          800: '#374831',
          900: '#2e3c2a',
        },
        emeraldsoft: {
          300: '#8fbcab',
          400: '#65a08b',
          500: '#478570',
          600: '#376a5b',
          700: '#2e554a',
          800: '#27453d',
          900: '#1f3630',
        },
        sand: {
          100: '#f6efe0',
          200: '#ecdfc4',
          300: '#ddc9a0',
          400: '#c9ad78',
          500: '#b5925a',
        },
        rose: {
          100: '#f7eae7',
          200: '#eed4cf',
          300: '#ddb3ab',
          400: '#c8908a',
        },
        gold: {
          300: '#e2c98a',
          400: '#d1b166',
          500: '#b99548',
          600: '#9a7a38',
        },
        ink: {
          DEFAULT: '#33402f',
          soft: '#5a6653',
          faint: '#8b937f',
        },
        night: {
          bg: '#1c241f',
          card: '#242e28',
          raise: '#2c3831',
          line: '#3a473e',
          text: '#e8e0cd',
          soft: '#b5b09a',
          faint: '#847f6d',
        },
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', '-apple-system', 'sans-serif'],
        arabic: ['Amiri', '"Scheherazade New"', '"Noto Naskh Arabic"', 'serif'],
      },
      borderRadius: {
        card: '1.25rem',
        soft: '0.875rem',
      },
      boxShadow: {
        card: '0 2px 12px -2px rgba(72, 84, 62, 0.10), 0 1px 3px rgba(72, 84, 62, 0.06)',
        lift: '0 10px 30px -8px rgba(72, 84, 62, 0.18), 0 3px 8px rgba(72, 84, 62, 0.07)',
        'card-dark': '0 2px 12px -2px rgba(0, 0, 0, 0.35)',
      },
      maxWidth: {
        content: '46rem',
        wide: '68rem',
      },
    },
  },
  plugins: [],
};

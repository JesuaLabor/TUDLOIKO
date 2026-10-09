/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: {
          DEFAULT: 'rgba(15, 15, 25, 0.85)',
          subtle: 'rgba(22, 22, 38, 0.80)',
          card: 'rgba(30, 30, 50, 0.75)',
        },
        accent: {
          DEFAULT: '#7C6BFF',
          light: '#A89DFF',
          dark: '#5A4AE0',
          glow: 'rgba(124, 107, 255, 0.35)',
        },
        gem: {
          blue: '#4285F4',
          green: '#34A853',
          yellow: '#FBBC04',
          red: '#EA4335',
        },
        text: {
          primary: '#F0EEFF',
          secondary: '#A8A4C8',
          muted: '#6B6888',
        },
        border: {
          DEFAULT: 'rgba(124, 107, 255, 0.15)',
          hover: 'rgba(124, 107, 255, 0.35)',
        },
      },
      backdropBlur: {
        xs: '2px',
        DEFAULT: '12px',
        xl: '24px',
      },
      boxShadow: {
        glow: '0 0 20px rgba(124, 107, 255, 0.25)',
        'glow-lg': '0 0 40px rgba(124, 107, 255, 0.35)',
        glass: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      animation: {
        'fade-up': 'fadeUp 0.3s ease-out forwards',
        'fade-in': 'fadeIn 0.2s ease-out forwards',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'typing': 'typing 1.2s steps(3, end) infinite',
        'slide-in': 'slideIn 0.25s ease-out forwards',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(124, 107, 255, 0.2)' },
          '50%': { boxShadow: '0 0 28px rgba(124, 107, 255, 0.5)' },
        },
        typing: {
          '0%': { content: '"."' },
          '33%': { content: '".."' },
          '66%': { content: '"..."' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}

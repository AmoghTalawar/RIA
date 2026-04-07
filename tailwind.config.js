/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // PRIMARY - KLE Brand
        'kle-crimson': '#B91C1C',
        'kle-deep': '#7F1D1D',
        'kle-dark': '#1C1917',
        
        // SECONDARY
        'charcoal': '#292524',
        'graphite': '#44403C',
        'smoke': '#78716C',
        'ash': '#A8A29E',
        
        // NEUTRALS
        'mist': '#D6D3D1',
        'fog': '#F5F5F4',
        
        // ACCENTS
        'accent-gold': '#B45309',
        'accent-gold-light': '#FDE68A',
        'accent-teal': '#0F766E',
        'accent-teal-light': '#CCFBF1',
        'accent-indigo': '#3730A3',
        'accent-indigo-light': '#E0E7FF',
        
        // SEMANTIC
        'success': '#15803D',
        'warning': '#B45309',
        'danger': '#B91C1C',
        'info': '#0369A1',
      },
      fontFamily: {
        'display': ['EB Garamond', 'Georgia', 'serif'],
        'heading': ['DM Sans', 'Helvetica', 'sans-serif'],
        'body': ['Inter', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'display': ['2rem', { lineHeight: '1.2', fontWeight: '700' }],
        'h1': ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }],
        'h2': ['1.125rem', { lineHeight: '1.4', fontWeight: '500' }],
        'body': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        'data': ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }],
        'label': ['0.75rem', { lineHeight: '1.4', fontWeight: '400' }],
        'micro': ['0.6875rem', { lineHeight: '1.3', fontWeight: '600' }],
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
        '2xl': '32px',
        '3xl': '48px',
      },
      borderRadius: {
        'sm': '2px',
        'md': '4px',
        'lg': '6px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.08)',
        'hover': '0 2px 6px rgba(0,0,0,0.12)',
      },
      animation: {
        'count-up': 'countUp 800ms cubic-bezier(0.16,1,0.3,1)',
        'bar-grow': 'barGrow 600ms ease-out',
        'fade-in': 'fadeIn 250ms ease-out',
        'tooltip': 'tooltipAppear 150ms ease-out',
      },
      keyframes: {
        countUp: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        barGrow: {
          '0%': { transform: 'scaleY(0)' },
          '100%': { transform: 'scaleY(1)' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        tooltipAppear: {
          '0%': { opacity: '0', transform: 'translateY(2px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

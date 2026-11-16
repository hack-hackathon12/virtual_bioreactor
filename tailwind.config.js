/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bio: {
          dark: '#070D18',
          card: '#0D1726',
          panel: '#111E33',
          border: 'rgba(6, 182, 212, 0.2)',
          borderHover: 'rgba(34, 211, 238, 0.45)',
          cyan: '#06B6D4',
          cyanGlow: '#22D3EE',
          teal: '#14B8A6',
          green: '#10B981',
          accent: '#38BDF8',
          warning: '#F59E0B',
          danger: '#EF4444'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 12s linear infinite',
      }
    },
  },
  plugins: [],
}

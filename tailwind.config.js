/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './context/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        night: {
          950: '#02040a',
          900: '#05080f',
          850: '#0a0e17',
          800: '#0c101a',
          700: '#121826',
          600: '#1b2440',
        },
        falpat: {
          DEFAULT: '#3b82f6',
          dim: '#2563eb',
          soft: '#60a5fa',
        },
        volt: {
          DEFAULT: '#d4af37',
          dim: '#b8912a',
        },
        // Acentos extras del look Glamour's
        indigo: {
          DEFAULT: '#6366f1',
        },
        gold: '#d4af37',
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          'Inter',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        fab: '0 0 0 1px rgba(59, 130, 246, 0.35), 0 12px 34px -8px rgba(59, 130, 246, 0.5)',
        'fab-volt': '0 0 0 1px rgba(212, 175, 55, 0.35), 0 12px 34px -8px rgba(212, 175, 55, 0.45)',
        glow: '0 0 24px -6px rgba(59, 130, 246, 0.45)',
        card: '0 8px 32px rgba(0, 0, 0, 0.4)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        dropIn: {
          '0%': { opacity: '0', transform: 'translateY(-6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out both',
        'slide-up': 'slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pop-in': 'popIn 0.18s ease-out both',
        'drop-in': 'dropIn 0.14s ease-out both',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};

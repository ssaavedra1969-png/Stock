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
          950: '#030509',
          900: '#050b16',
          850: '#08111f',
          800: '#0b1830',
          700: '#11203f',
          600: '#17305c',
        },
        falpat: {
          DEFAULT: '#2dd4ff',
          dim: '#0ea5e9',
          soft: '#67e8f9',
        },
        volt: {
          DEFAULT: '#ffd60a',
          dim: '#eab308',
        },
      },
      fontFamily: {
        sans: [
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
        fab: '0 0 0 1px rgba(45, 212, 255, 0.35), 0 12px 34px -8px rgba(45, 212, 255, 0.5)',
        'fab-volt': '0 0 0 1px rgba(255, 214, 10, 0.35), 0 12px 34px -8px rgba(255, 214, 10, 0.45)',
        glow: '0 0 24px -6px rgba(45, 212, 255, 0.45)',
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

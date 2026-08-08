/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          base: 'var(--ad-surface-base)',
          elevated: 'var(--ad-surface-elevated)',
          soft: 'var(--ad-surface-soft)',
          inset: 'var(--ad-surface-inset)',
          hover: 'var(--ad-surface-hover)',
        },
        ink: {
          50: 'var(--ad-ink-50)',
          100: 'var(--ad-ink-100)',
          200: 'var(--ad-ink-200)',
          300: 'var(--ad-ink-300)',
          400: 'var(--ad-ink-400)',
          500: 'var(--ad-ink-500)',
          600: 'var(--ad-ink-600)',
          700: 'var(--ad-ink-700)',
          800: 'var(--ad-ink-800)',
          900: 'var(--ad-ink-900)',
          950: 'var(--ad-ink-950)',
        },
        text: {
          primary: 'var(--ad-text-primary)',
          secondary: 'var(--ad-text-secondary)',
          muted: 'var(--ad-text-muted)',
          faint: 'var(--ad-text-faint)',
        },
        border: {
          DEFAULT: 'var(--ad-border)',
          strong: 'var(--ad-border-strong)',
        },
        cream: {
          50: 'var(--ad-cream-50)',
          100: 'var(--ad-cream-100)',
          200: 'var(--ad-cream-200)',
          300: 'var(--ad-cream-300)',
          400: 'var(--ad-cream-400)',
          500: 'var(--ad-cream-500)',
        },
        butter: {
          50: 'var(--ad-butter-50)',
          100: 'var(--ad-butter-100)',
          200: 'var(--ad-butter-200)',
          300: 'var(--ad-butter-300)',
          400: 'var(--ad-butter-400)',
          500: 'var(--ad-butter-500)',
        },
        teal: {
          50: 'var(--ad-teal-50)',
          100: 'var(--ad-teal-100)',
          200: 'var(--ad-teal-200)',
          300: 'var(--ad-teal-300)',
          400: 'var(--ad-teal-400)',
          500: 'var(--ad-teal-500)',
          600: 'var(--ad-teal-600)',
          700: 'var(--ad-teal-700)',
          800: 'var(--ad-teal-800)',
          900: 'var(--ad-teal-900)',
          950: 'var(--ad-teal-950)',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        'soft': '0 2px 8px -2px rgba(20, 184, 166, 0.08), 0 4px 16px -4px rgba(20, 184, 166, 0.04)',
        'glow': '0 0 24px -4px rgba(20, 184, 166, 0.25)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

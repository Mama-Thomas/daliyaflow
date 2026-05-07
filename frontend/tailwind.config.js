/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: 'var(--color-forest)',
          light: 'var(--color-forest-light)',
          pale: 'var(--color-forest-pale)',
        },
        gold: {
          DEFAULT: 'var(--color-gold)',
          light: 'var(--color-gold-light)',
        },
        risk: {
          high: 'var(--color-risk-high)',
          medium: 'var(--color-risk-medium)',
          low: 'var(--color-risk-low)',
          resolved: 'var(--color-risk-resolved)',
        },
        ink: 'var(--color-ink)',
        slate: 'var(--color-slate)',
        mist: 'var(--color-mist)',
        'muted-text': 'var(--color-muted-text)',
        border: 'var(--color-border)',
        surface: 'var(--color-surface)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
        info: 'var(--color-info)',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        'risk-high': 'var(--shadow-risk-high)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        riskPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(192,57,43,0.5)' },
          '50%': { boxShadow: '0 0 0 6px rgba(192,57,43,0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
        'fade-in-up': 'fadeInUp 150ms ease-out',
        'risk-pulse': 'riskPulse 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

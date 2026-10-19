import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ui-text-primary)',
        muted: 'var(--ui-text-secondary)',
        accent: 'var(--ui-text-link)',
        surface: 'var(--ui-surface-card)',
        raised: 'var(--ui-surface-raised)',
        inverse: 'var(--ui-surface-inverse)',
        subtle: 'var(--ui-border-default)',
        control: 'var(--ui-border-strong)',
        action: 'var(--ui-action-primary)',
        'on-action': 'var(--ui-text-on-action)',
        success: 'var(--ui-status-success)',
        'success-soft': 'var(--ui-status-success-surface)',
        'success-border': 'var(--ui-status-success-border)',
        warning: 'var(--ui-status-warning)',
        'warning-soft': 'var(--ui-status-warning-surface)',
        'warning-border': 'var(--ui-status-warning-border)',
        danger: 'var(--ui-status-danger)',
        'danger-soft': 'var(--ui-status-danger-surface)',
        'danger-border': 'var(--ui-status-danger-border)',
        info: 'var(--ui-status-info)',
        'info-soft': 'var(--ui-status-info-surface)',
        'info-border': 'var(--ui-status-info-border)',
        brand: {
          50: '#fdf4e7',
          100: '#fbe4c3',
          200: '#f7c97a',
          300: '#f3ab3c',
          400: '#ef8e1a',
          500: '#d97706',
          600: '#b45309',
          700: '#92400e',
          800: '#78350f',
          900: '#5c2d0e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;

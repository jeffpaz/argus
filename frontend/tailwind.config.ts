import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        a: {
          bg:      '#F8F9FC',
          surface: '#FFFFFF',
          border:  '#E5E7EB',
          text:    '#111827',
          muted:   '#6B7280',
          teal:    '#6366F1',
          green:   '#22C55E',
          amber:   '#F59E0B',
          red:     '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card:       '0 1px 3px rgba(0,0,0,0.07)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.1)',
      },
    },
  },
  plugins: [],
}

export default config

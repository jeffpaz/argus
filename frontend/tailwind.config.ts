import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        a: {
          bg:      '#0a0f14',
          surface: '#0f1923',
          border:  '#1e2d3d',
          text:    '#e2e8f0',
          muted:   '#6b7f93',
          teal:    '#00d4aa',
          green:   '#3fb950',
          amber:   '#e3b341',
          red:     '#f85149',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config

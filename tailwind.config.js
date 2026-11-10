import defaultPreset from './tailwind-preset.js'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './src/renderer/**/*.{ts,tsx}',
    './src/preload/**/*.{ts,tsx}',
    './index.html',
  ],
  presets: [defaultPreset],
  theme: {
    extend: {
      colors: {
        rn: {
          bg: '#181818',
          panel: '#282828',
          subpanel: '#2d2d2d',
          input: '#1d1d1d',
          border: '#3d3d3d',
          accent: '#4772b3',
          rendering: '#e57a24',
          text: '#e6e6e6',
          muted: '#999999',
          success: '#4caf50',
          error: '#e53935',
          warning: '#ffb300',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
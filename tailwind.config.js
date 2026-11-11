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
          bg: '#141415',
          panel: '#19191b',
          subpanel: '#232325',
          input: '#121213',
          border: '#2c2c30',
          accent: '#e87d0d',
          rendering: '#e87d0d',
          text: '#ededed',
          muted: '#85858b',
          success: '#4cc38a',
          error: '#e5484d',
          warning: '#e87d0d',
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
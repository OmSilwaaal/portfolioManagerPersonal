/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-base':        '#0a0a0a',
        'bg-surface':     '#0f0f0f',
        'bg-raised':      '#141414',
        'border-subtle':  '#1f1f1f',
        'border-default': '#2a2a2a',
        'text-primary':   '#ffffff',
        'text-secondary': '#a1a1aa',
        'text-muted':     '#6b7280',
        'accent':         '#3b82f6',
        'accent-hover':   '#2563eb',
        'accent-dim':     'rgba(59,130,246,0.1)',
        'success':        '#22c55e',
        'danger':         '#ef4444',
        'warning':        '#f59e0b',
        'surface':        '#141414',
        'border':         '#1f1f1f',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}

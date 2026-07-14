/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        card: 'var(--card)',
        sub: 'var(--sub)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        primary: 'var(--primary)',
        'primary-ink': 'var(--primary-ink)',
        accent: 'var(--accent)',
        danger: 'var(--danger)',
        series: {
          1: 'var(--s1)',
          2: 'var(--s2)',
          3: 'var(--s3)',
          4: 'var(--s4)',
          5: 'var(--s5)',
          6: 'var(--s6)',
          7: 'var(--s7)',
          8: 'var(--s8)',
        },
      },
      borderRadius: { card: 'var(--r-card)', ctl: 'var(--r-ctl)', pill: 'var(--r-pill)' },
      fontFamily: { sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
    },
  },
  plugins: [],
};

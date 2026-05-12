import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#18211f',
        panel: '#f7f8f5',
        field: '#ffffff',
        line: '#d8ded6',
        accent: '#216e4e',
        amber: '#b06915',
        danger: '#b42318'
      },
      boxShadow: {
        focus: '0 0 0 3px rgba(33, 110, 78, 0.25)'
      }
    }
  },
  plugins: []
} satisfies Config;

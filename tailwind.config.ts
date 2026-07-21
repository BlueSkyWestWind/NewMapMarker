import type { Config } from 'tailwindcss';

const config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // ── 브랜드 리스킨 (LaunchDarkly "neon control room" 참조) ──
        // slate(푸른끼) → 중립 차콜 / indigo(보라끼) → 톤다운 보티지 블루.
        // 앱 전역이 bg-slate-*·text-indigo-* 유틸을 직접 쓰므로, 이 두 램프만
        // 덮어써도 대부분 화면이 자동 리스킨된다. (deep-merge 라 부분 지정 가능)
        slate: {
          50: '#f7f7fa',
          100: '#f0f0f4',
          200: '#e2e2e8',
          300: '#c9c9d2',
          400: '#9b9ba6',
          500: '#6a6a75',
          600: '#45454f',
          700: '#313139',
          800: '#212127',
          900: '#161619',
          950: '#0d0d10',
        },
        indigo: {
          50: '#eef1fe',
          100: '#dde2fb',
          200: '#c0c8f6',
          300: '#97a3ef',
          400: '#6c7ce8',
          500: '#4a5cdd',
          600: '#3a4cd1',
          700: '#3140b0',
          800: '#2b348c',
          900: '#232a6b',
          950: '#1a1f52',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        // 섀도 대신 브랜드 글로우로 엘리베이션 표현 (활성·선택·포커스·플로팅 UI)
        glow: '0 0 0 1px #3a4cd1, 0 0 18px -2px rgba(58,76,209,0.45)',
        'glow-sm': '0 0 14px -4px rgba(58,76,209,0.5)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
} satisfies Config;

export default config;

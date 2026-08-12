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
        //
        // Ver 2.1: slate 램프를 CSS 변수로 바꿨다. `:root`(라이트)·`.dark`에
        // 각각 다른 값을 넣어 두면, 앱 전체에 흩어진 bg-slate-900·text-slate-100 같은
        // 기존 클래스 808곳을 하나도 안 고치고 라이트/다크 전환에 자동으로 반응한다.
        // <alpha-value> 덕분에 bg-slate-900/60 같은 투명도 조합도 그대로 동작한다.
        slate: {
          50: 'hsl(var(--slate-50) / <alpha-value>)',
          100: 'hsl(var(--slate-100) / <alpha-value>)',
          200: 'hsl(var(--slate-200) / <alpha-value>)',
          300: 'hsl(var(--slate-300) / <alpha-value>)',
          400: 'hsl(var(--slate-400) / <alpha-value>)',
          500: 'hsl(var(--slate-500) / <alpha-value>)',
          600: 'hsl(var(--slate-600) / <alpha-value>)',
          700: 'hsl(var(--slate-700) / <alpha-value>)',
          800: 'hsl(var(--slate-800) / <alpha-value>)',
          900: 'hsl(var(--slate-900) / <alpha-value>)',
          950: 'hsl(var(--slate-950) / <alpha-value>)',
        },
        indigo: {
          50: '#eef1fe',
          // 100~300은 다크에서 "카드 위 옅은 텍스트"용이라 라이트에서는 안 보인다 — CSS 변수로 전환.
          100: 'hsl(var(--indigo-100) / <alpha-value>)',
          200: 'hsl(var(--indigo-200) / <alpha-value>)',
          300: 'hsl(var(--indigo-300) / <alpha-value>)',
          400: '#6c7ce8',
          500: '#4a5cdd',
          600: '#3a4cd1',
          700: '#3140b0',
          800: '#2b348c',
          900: '#232a6b',
          950: '#1a1f52',
        },
        /*
         * 상태색(경고·성공·정보 등) 100~300 — 다크 배경 위 옅은 텍스트용으로 골라 쓴 값이라
         * 라이트에서는 흰 배경에 거의 안 보인다(예: bg-sky-600/20 text-sky-200 뱃지).
         * 400 이상(배경 워시·테두리, 저투명도)은 두 테마 모두 무난해 손대지 않았다.
         */
        amber: { 100: 'hsl(var(--amber-100) / <alpha-value>)', 200: 'hsl(var(--amber-200) / <alpha-value>)', 300: 'hsl(var(--amber-300) / <alpha-value>)' },
        blue: { 100: 'hsl(var(--blue-100) / <alpha-value>)', 200: 'hsl(var(--blue-200) / <alpha-value>)', 300: 'hsl(var(--blue-300) / <alpha-value>)' },
        emerald: { 100: 'hsl(var(--emerald-100) / <alpha-value>)', 200: 'hsl(var(--emerald-200) / <alpha-value>)', 300: 'hsl(var(--emerald-300) / <alpha-value>)' },
        orange: { 100: 'hsl(var(--orange-100) / <alpha-value>)', 200: 'hsl(var(--orange-200) / <alpha-value>)', 300: 'hsl(var(--orange-300) / <alpha-value>)' },
        red: { 100: 'hsl(var(--red-100) / <alpha-value>)', 200: 'hsl(var(--red-200) / <alpha-value>)', 300: 'hsl(var(--red-300) / <alpha-value>)' },
        rose: { 100: 'hsl(var(--rose-100) / <alpha-value>)', 200: 'hsl(var(--rose-200) / <alpha-value>)', 300: 'hsl(var(--rose-300) / <alpha-value>)' },
        sky: { 100: 'hsl(var(--sky-100) / <alpha-value>)', 200: 'hsl(var(--sky-200) / <alpha-value>)', 300: 'hsl(var(--sky-300) / <alpha-value>)' },
        teal: { 100: 'hsl(var(--teal-100) / <alpha-value>)', 200: 'hsl(var(--teal-200) / <alpha-value>)', 300: 'hsl(var(--teal-300) / <alpha-value>)' },
        violet: { 100: 'hsl(var(--violet-100) / <alpha-value>)', 200: 'hsl(var(--violet-200) / <alpha-value>)', 300: 'hsl(var(--violet-300) / <alpha-value>)' },
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
        // 네임드 반경(Ver 2.1) — Calendly DESIGN.md 구조 채택. rounded-buttons 등으로 사용.
        buttons: 'var(--radius-buttons)',
        inputs: 'var(--radius-inputs)',
        cards: 'var(--radius-cards)',
        productcards: 'var(--radius-productcards)',
        badges: 'var(--radius-badges)',
      },
      boxShadow: {
        // 섀도 대신 브랜드 글로우로 엘리베이션 표현 (활성·선택·포커스·플로팅 UI, 다크 기본)
        glow: '0 0 0 1px #3a4cd1, 0 0 18px -2px rgba(58,76,209,0.45)',
        'glow-sm': '0 0 14px -4px rgba(58,76,209,0.5)',
        // 라이트 카드용 3단 섀도(Ver 2.1) — Calendly DESIGN.md 구조 채택.
        'elevation-sm': 'var(--shadow-elevation-sm)',
        'elevation-md': 'var(--shadow-elevation-md)',
        'elevation-lg': 'var(--shadow-elevation-lg)',
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

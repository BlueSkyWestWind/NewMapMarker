import path from "node:path";

// Turbopack은 상대 경로 플러그인을 못 찾으므로 절대 경로로 가리킨다
const UNLAYER_ASTRYX = path.resolve(process.cwd(), "postcss-unlayer-astryx.cjs");

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    // Astryx 스타일시트만 @layer를 벗긴다(Tailwind v3 프리플라이트에 지지 않게). 이유는 파일 머리말 참고
    [UNLAYER_ASTRYX]: {},
    autoprefixer: {},
  },
};

export default config;

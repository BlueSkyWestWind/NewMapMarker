// Supabase 접속 설정 정보
// ANON_KEY: Dashboard → Project Settings → API Keys
//   - publishable: sb_publishable_... (권장)
//   - 또는 legacy anon JWT: eyJhbGciOiJIUzI1NiIs...
// 회원가입 계정은 Table Editor가 아니라 Authentication → Users 에 저장됩니다.
const SUPABASE_CONFIG = {
    URL: "https://bgdqjtmkdprqencgnrbx.supabase.co",
    ANON_KEY: "sb_publishable_apsLHlcVZy1F32x7-NrB0g_LNe-X__S",
    // 이메일 인증 링크 클릭 후 돌아올 URL (Live Server·배포 도메인과 동일해야 함)
    AUTH_REDIRECT_URL: typeof window !== 'undefined' ? window.location.origin : ''
};

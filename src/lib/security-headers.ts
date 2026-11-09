/**
 * 모든 페이지 응답에 붙이는 보안 헤더(`next.config.ts`의 `headers()`가 쓴다).
 *
 * - 클릭재킹 방지: 다른 사이트가 이 화면을 iframe 에 넣지 못하게 한다(`X-Frame-Options`, `frame-ancestors`).
 * - `nosniff`: 브라우저가 파일 형식을 임의로 추측하지 못하게 한다.
 * - `Referrer-Policy`: 다른 사이트로는 주소 전체가 아니라 도메인만 보낸다(지도 API 키의 도메인 제한은 그대로 동작한다).
 * - HSTS: 브라우저가 항상 https 로만 접속하게 한다. 하위 도메인까지 묶는 `includeSubDomains`는 안전을 위해 쓰지 않는다.
 * - `Permissions-Policy`: 바코드/QR 스캔(카메라)과 내 위치(위치)는 이 사이트에서 허용하고, 쓰지 않는 기능은 막는다.
 *
 * 스크립트 출처를 제한하는 CSP 전체는 카카오 지도 SDK 때문에 깨지기 쉬워 넣지 않았다(`frame-ancestors`만 CSP 로 둔다).
 */
export interface SecurityHeader {
  key: string;
  value: string;
}

export const SECURITY_HEADERS: readonly SecurityHeader[] = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
  },
];

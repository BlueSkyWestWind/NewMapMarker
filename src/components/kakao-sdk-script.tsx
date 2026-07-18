import { KAKAO_SDK_LIBRARIES } from "@/features/map-marker/constants/map-config";

const KAKAO_SDK_SCRIPT_ID = "kakao-map-sdk";

/**
 * 서버 HTML에 카카오 SDK script를 직접 넣어 CORS/동적 삽입 이슈를 줄인다.
 * (next/script crossorigin 이슈 회피)
 */
export function KakaoSdkScript() {
  const appKey = (process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? "").trim();
  if (!appKey) return null;

  const src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&libraries=${KAKAO_SDK_LIBRARIES}&autoload=false`;

  return <script id={KAKAO_SDK_SCRIPT_ID} src={src} async charSet="utf-8" />;
}

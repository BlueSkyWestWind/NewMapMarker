/**
 * 카카오/다음 지도 타일 프록시용 fetch. (SSRF 방지)
 * 호스트 허용 목록은 첫 URL뿐 아니라 **리다이렉트 목적지마다** 다시 검사한다 —
 * 허용 도메인 아래의 리다이렉트로 내부 주소를 가져오는 우회를 막는다.
 */

export class TileFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TileFetchError";
  }
}

export function isAllowedTileHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "daumcdn.net" ||
    host.endsWith(".daumcdn.net") ||
    host === "kakaocdn.net" ||
    host.endsWith(".kakaocdn.net") ||
    host === "kakao.com" ||
    host.endsWith(".kakao.com") ||
    host === "daum.net" ||
    host.endsWith(".daum.net")
  );
}

const DEFAULT_MAX_HOPS = 3;

export async function fetchAllowedTile(
  url: URL,
  fetchImpl: typeof fetch = fetch,
  maxHops = DEFAULT_MAX_HOPS,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= maxHops; hop += 1) {
    if (!isAllowedTileHost(current.hostname)) {
      throw new TileFetchError("허용되지 않은 지도 타일 도메인입니다.");
    }
    const response = await fetchImpl(current.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      cache: "force-cache",
      headers: {
        // 일부 CDN이 빈 UA를 거절하는 경우 대비
        "User-Agent": "Mozilla/5.0 MapCaptureProxy",
        Referer: "https://map.kakao.com/",
      },
    });

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = response.headers.get("Location");
    if (!isRedirect || !location) return response;

    try {
      current = new URL(location, current);
    } catch {
      throw new TileFetchError("잘못된 리다이렉트 주소입니다.");
    }
    if (current.protocol !== "https:" && current.protocol !== "http:") {
      throw new TileFetchError("http/https 리다이렉트만 허용됩니다.");
    }
  }
  throw new TileFetchError("리다이렉트가 너무 많습니다.");
}

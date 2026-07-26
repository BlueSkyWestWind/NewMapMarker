import type {
  SiteMatch,
  WorksiteWeatherResponse,
} from "@/features/worksite-weather/types/weather";

/**
 * 브라우저 → 자기 서버(`/api/worksite-weather`) 조회.
 *
 * 지도 오버레이(DOM 빌더)와 사이드바 패널(React Query) 양쪽에서 쓰이므로 lib에 둔다.
 * hooks에 두면 lib → hooks 역방향 의존이 생긴다.
 */
export function buildWorksiteWeatherQuery(site: SiteMatch): string {
  const params = new URLSearchParams({
    lat: String(site.lat),
    lng: String(site.lng),
    workType: site.workType,
  });
  // 특보 지역 매칭에 쓰이므로 주소 앞부분만 보낸다
  if (site.address) params.set("region", site.address.slice(0, 20));
  return params.toString();
}

/** 캐시·중복제거 키. 같은 좌표·작업형태·지역이면 같은 응답이다. */
export function worksiteWeatherKey(site: SiteMatch): string {
  return buildWorksiteWeatherQuery(site);
}

async function requestWorksiteWeather(
  site: SiteMatch,
): Promise<WorksiteWeatherResponse> {
  const response = await fetch(`/api/worksite-weather?${buildWorksiteWeatherQuery(site)}`);

  // 서버가 500을 내면 본문이 평문 "Internal Server Error"라 JSON 파싱이 깨진다.
  // 그대로 두면 사용자에게 "Unexpected token 'I'" 같은 메시지가 노출된다.
  const text = await response.text();
  let body: Partial<WorksiteWeatherResponse> & { error?: string } = {};
  let isJson = false;
  try {
    body = JSON.parse(text) as typeof body;
    isJson = true;
  } catch {
    isJson = false;
  }

  if (!response.ok || !isJson) {
    if (isJson && body.error) throw new Error(body.error);
    throw new Error(
      `기상 정보를 가져오지 못했습니다. (서버 응답 ${response.status})` +
        (response.status >= 500 ? " 개발 서버를 재시작한 뒤 다시 시도하세요." : ""),
    );
  }
  return body as WorksiteWeatherResponse;
}

/** 단기예보는 3시간마다 갱신되므로 이 정도는 재사용해도 된다. */
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  at: number;
  value: WorksiteWeatherResponse;
}

const responseCache = new Map<string, CacheEntry>();
/** 동시에 같은 국소를 여러 번 열어도 요청은 한 번만 나가게 한다. */
const inFlight = new Map<string, Promise<WorksiteWeatherResponse>>();

/**
 * 캐시·중복제거를 적용한 조회.
 *
 * 지도에서 국소를 하나 열 때마다 서버는 기상청 API를 최대 4건 호출한다.
 * 캐시가 없으면 국소를 훑는 것만으로 일일 호출 한도를 태운다.
 */
export function fetchWorksiteWeather(site: SiteMatch): Promise<WorksiteWeatherResponse> {
  const key = worksiteWeatherKey(site);

  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return Promise.resolve(cached.value);
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = requestWorksiteWeather(site)
    .then((value) => {
      responseCache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}

/** 테스트·수동 새로고침용 */
export function clearWorksiteWeatherCache(): void {
  responseCache.clear();
  inFlight.clear();
}

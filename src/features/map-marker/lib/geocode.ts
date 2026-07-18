interface KakaoGeocodeResult {
  y: string;
  x: string;
}

interface KakaoPlacesResult {
  y: string;
  x: string;
}

interface KakaoPlaces {
  keywordSearch: (
    keyword: string,
    callback: (result: KakaoPlacesResult[], status: string) => void,
  ) => void;
}

interface KakaoCoord2AddressResult {
  road_address?: { address_name?: string };
  address?: { address_name?: string };
}

interface KakaoGeocoder {
  addressSearch: (
    address: string,
    callback: (result: KakaoGeocodeResult[], status: string) => void,
  ) => void;
  coord2Address: (
    lng: number,
    lat: number,
    callback: (result: KakaoCoord2AddressResult[], status: string) => void,
  ) => void;
}

interface KakaoMapsServices {
  Geocoder: new () => KakaoGeocoder;
  Places: new () => KakaoPlaces;
  Status: { OK: string };
}

function getKakaoServices(): KakaoMapsServices | null {
  const kakao = (
    window as Window & { kakao?: { maps?: { services?: KakaoMapsServices } } }
  ).kakao;
  return kakao?.maps?.services ?? null;
}

const GEOCODE_DELAY_MS = 50;

export interface GeocodeCoords {
  lat: number;
  lng: number;
}

export interface ReverseGeocodeResult {
  roadAddress: string;
  jibunAddress: string;
  /** 표시용 주소 (도로명 우선, 없으면 지번) */
  address: string;
}

/**
 * 한국 주소가 도로명(road)인지 지번(jibun)인지 대략 판별한다.
 * - 지번: '동/리/가 + 번지 숫자', '산 30-1', '…번지' (예: 명산리 114-4)
 * - 도로명: '○○로/○○길' 뒤에 건물번호 숫자 (예: 테헤란로 152)
 * 애매하면 지번으로 본다. (업로드가 대부분 지번인 워크플로 기준)
 */
export function classifyKoreanAddress(address: string): "road" | "jibun" {
  const a = (address || "").replace(/\s+/g, " ").trim();
  if (!a) return "jibun";

  // 지번 강한 신호 우선
  if (/번지/.test(a)) return "jibun";
  if (/(^|\s)산\s?\d/.test(a)) return "jibun";

  // 도로명 신호: '로/길' + 건물번호. 번호 뒤에 가/동/리 등이 붙으면 지번(예: 을지로 2가)
  if (/[가-힣A-Za-z0-9]+(로|길)\s?\d+(-\d+)?(?![가-힣\d])/.test(a)) {
    return "road";
  }

  return "jibun";
}

/**
 * roadAddress/jibunAddress가 비어 있고 address만 있을 때 종류를 판별해 나눈다.
 */
export function splitAddressFields(input: {
  roadAddress?: string;
  jibunAddress?: string;
  address?: string;
}): { roadAddress: string; jibunAddress: string } {
  let roadAddress = (input.roadAddress ?? "").trim();
  let jibunAddress = (input.jibunAddress ?? "").trim();
  const address = (input.address ?? "").trim();

  if (!roadAddress && !jibunAddress && address) {
    if (classifyKoreanAddress(address) === "road") {
      roadAddress = address;
    } else {
      jibunAddress = address;
    }
  }

  return { roadAddress, jibunAddress };
}

function addressSearchOnce(
  services: KakaoMapsServices,
  address: string,
): Promise<GeocodeCoords | null> {
  return new Promise((resolve) => {
    const geocoder = new services.Geocoder();
    geocoder.addressSearch(address, (result, status) => {
      if (status === services.Status.OK && result[0]) {
        resolve({
          lat: Number.parseFloat(result[0].y),
          lng: Number.parseFloat(result[0].x),
        });
        return;
      }
      resolve(null);
    });
  });
}

function keywordSearchOnce(
  services: KakaoMapsServices,
  keyword: string,
): Promise<GeocodeCoords | null> {
  if (!services.Places) return Promise.resolve(null);
  return new Promise((resolve) => {
    const places = new services.Places();
    places.keywordSearch(keyword, (result, status) => {
      if (status === services.Status.OK && result[0]) {
        resolve({
          lat: Number.parseFloat(result[0].y),
          lng: Number.parseFloat(result[0].x),
        });
        return;
      }
      resolve(null);
    });
  });
}

/**
 * '산'(임야) 표기를 토글한다. (예: "광영동 산 30-1" ↔ "광영동 30-1")
 * 산이 있으면 제거하고, 없으면 마지막 지번 숫자 앞에 "산 "을 붙인다.
 * 카카오 지오코더는 산/일반 지번 구분이 실제와 어긋나면 0건을 반환하므로,
 * 반대 표기를 후보로 함께 시도하기 위한 것.
 */
function toggleSanNotation(address: string): string {
  const normalized = address.replace(/\s+/g, " ").trim();
  if (/(^|\s)산\s?\d/.test(normalized)) {
    return normalized.replace(/(^|\s)산\s?(?=\d)/, "$1").trim();
  }
  // 끝의 지번 숫자(예: 52, 72-2) 앞에 "산 "을 붙인다.
  // (?=\D*$) 로 뒤에 숫자가 없는 '마지막 번지 숫자'만 골라 하이픈이 쪼개지지 않게 한다.
  return normalized
    .replace(/(\d+(?:-\d+)?)(?=\D*$)/, "산 $1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 지오코딩 실패를 줄이기 위한 주소 후보들을 우선순위 순으로 만든다.
 * 원본 → "번지" 접미사 제거 → 산/일반 지번 토글.
 */
export function buildGeocodeCandidates(address: string): string[] {
  const base = (address || "").replace(/\s+/g, " ").trim();
  if (!base) return [];

  const candidates = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (trimmed) candidates.add(trimmed);
  };

  // "번지" 접미사 유무 두 형태를 기본 후보로 삼고, 각각 산 토글본을 더한다
  for (const variant of [base, base.replace(/번지/g, " ")]) {
    add(variant);
    add(toggleSanNotation(variant));
  }

  return [...candidates];
}

/**
 * 주소 → 좌표. 카카오 주소검색을 후보별로 순차 시도하고,
 * 모두 실패하면 장소(키워드) 검색으로 마지막 폴백을 한다.
 */
export async function geocodeAddress(
  address: string,
): Promise<GeocodeCoords | null> {
  const services = getKakaoServices();
  if (!services) return null;

  for (const candidate of buildGeocodeCandidates(address)) {
    const coords = await addressSearchOnce(services, candidate);
    if (coords) return coords;
  }

  return keywordSearchOnce(services, address);
}

/**
 * 좌표를 주소로 변환한다. (도로명 우선)
 */
export function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> {
  return new Promise((resolve) => {
    const services = getKakaoServices();
    if (!services) {
      resolve(null);
      return;
    }

    const geocoder = new services.Geocoder();
    geocoder.coord2Address(lng, lat, (result, status) => {
      if (status !== services.Status.OK || !result[0]) {
        resolve(null);
        return;
      }

      const roadAddress = result[0].road_address?.address_name?.trim() ?? "";
      const jibunAddress = result[0].address?.address_name?.trim() ?? "";
      const address = roadAddress || jibunAddress;
      if (!address) {
        resolve(null);
        return;
      }

      resolve({ roadAddress, jibunAddress, address });
    });
  });
}

export async function geocodeAddressQueue<T extends { address?: string }>(
  items: T[],
  onProgress?: (current: number, total: number) => void,
): Promise<{
  results: Array<T & GeocodeCoords>;
  successCount: number;
  failCount: number;
  /** 좌표를 못 찾은 원본 항목들 (실패 주소 노출용) */
  failedItems: T[];
}> {
  const results: Array<T & GeocodeCoords> = [];
  const failedItems: T[] = [];
  // 같은 주소가 여러 행에 반복될 때 중복 조회를 막는다 (실패 재시도 비용도 절감)
  const cache = new Map<string, GeocodeCoords | null>();
  let successCount = 0;
  let failCount = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    onProgress?.(index + 1, items.length);

    const address = item.address?.trim() ?? "";
    if (!address) {
      failCount += 1;
      failedItems.push(item);
      continue;
    }

    let coords: GeocodeCoords | null;
    if (cache.has(address)) {
      coords = cache.get(address) ?? null;
    } else {
      coords = await geocodeAddress(address);
      cache.set(address, coords);
      await new Promise((resolve) => {
        setTimeout(resolve, GEOCODE_DELAY_MS);
      });
    }

    if (coords) {
      results.push({ ...item, ...coords });
      successCount += 1;
    } else {
      failCount += 1;
      failedItems.push(item);
    }
  }

  return { results, successCount, failCount, failedItems };
}

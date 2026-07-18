interface KakaoGeocodeResult {
  y: string;
  x: string;
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

export function geocodeAddress(address: string): Promise<GeocodeCoords | null> {
  return new Promise((resolve) => {
    const services = getKakaoServices();
    if (!services) {
      resolve(null);
      return;
    }

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
}> {
  const results: Array<T & GeocodeCoords> = [];
  let successCount = 0;
  let failCount = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    onProgress?.(index + 1, items.length);

    const address = item.address?.trim() ?? "";
    if (!address) {
      failCount += 1;
      continue;
    }

    const coords = await geocodeAddress(address);
    if (coords) {
      results.push({ ...item, ...coords });
      successCount += 1;
    } else {
      failCount += 1;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, GEOCODE_DELAY_MS);
    });
  }

  return { results, successCount, failCount };
}

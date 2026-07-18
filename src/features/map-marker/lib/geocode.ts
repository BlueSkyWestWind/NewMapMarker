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

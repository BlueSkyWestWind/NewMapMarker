interface KakaoGeocodeResult {
  y: string;
  x: string;
}

interface KakaoGeocoder {
  addressSearch: (
    address: string,
    callback: (
      result: KakaoGeocodeResult[],
      status: string,
    ) => void,
  ) => void;
}

interface KakaoMapsServices {
  Geocoder: new () => KakaoGeocoder;
  Status: { OK: string };
}

function getKakaoServices(): KakaoMapsServices | null {
  const kakao = (window as Window & { kakao?: { maps?: { services?: KakaoMapsServices } } }).kakao;
  return kakao?.maps?.services ?? null;
}

const GEOCODE_DELAY_MS = 50;

export interface GeocodeCoords {
  lat: number;
  lng: number;
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

    const address = item.address?.trim() ?? '';
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

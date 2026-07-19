'use client';

import { getPublicEnv } from '@/lib/public-env';

/**
 * 장소/주소 검색 → VWorld 연속지적도(필지) 경계 조회.
 *
 * VWorld는 Cloudflare 등 해외 서버 egress를 502/520으로 거부하므로,
 * 서버 프록시 대신 **브라우저에서 직접 JSONP로 호출**한다(방문자의 한국 IP 사용).
 * VWorld REST API는 CORS 미지원이라 script 주입(JSONP)만 가능하다.
 * 키는 도메인/Referer 제한으로 보호되며(NEXT_PUBLIC), VWorld 콘솔에
 * 서비스 도메인(localhost·배포 도메인)이 등록돼 있어야 한다.
 */

export interface ParcelPoint {
  lat: number;
  lng: number;
}

export interface Parcel {
  /** rings[0] = 외곽선, rings[1..] = 내부 구멍(holes) */
  rings: ParcelPoint[][];
}

export interface PlaceSearchResult {
  center: ParcelPoint;
  /** 매칭된 주소(표시용) */
  label: string;
  /** 필지 폴리곤들. 경계를 못 찾으면 빈 배열(좌표만 이동) */
  parcels: Parcel[];
}

const VWORLD_GEOCODE = 'https://api.vworld.kr/req/address';
const VWORLD_DATA = 'https://api.vworld.kr/req/data';
/** 연속지적도 - 지적도(필지) 레이어 */
const CADASTRAL_LAYER = 'LP_PA_CBND_BUBUN';

function buildQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

/** VWorld REST API를 브라우저에서 JSONP로 호출한다. (CORS 미지원 → script 주입) */
function jsonp<T>(baseUrl: string, timeoutMs = 10000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cb = `__vworld_cb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement('script');
    const w = window as unknown as Record<string, unknown>;
    let timer = 0;

    const cleanup = () => {
      delete w[cb];
      script.remove();
      if (timer) window.clearTimeout(timer);
    };

    w[cb] = (data: T) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('VWorld 요청에 실패했습니다.'));
    };
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('VWorld 응답 시간이 초과되었습니다.'));
    }, timeoutMs);

    script.src = `${baseUrl}&callback=${cb}`;
    document.head.appendChild(script);
  });
}

/** 표기 정규화 (예: 전남광주통합특별시 → 광주광역시) */
function normalizeAddressQuery(address: string): string[] {
  const trimmed = address.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);
  const aliases: Array<[RegExp, string]> = [
    [/전남광주통합특별시/g, '광주광역시'],
    [/광주통합특별시/g, '광주광역시'],
  ];
  for (const [pattern, replacement] of aliases) {
    const normalized = trimmed.replace(pattern, replacement);
    if (normalized !== trimmed) variants.add(normalized);
  }
  return [...variants];
}

interface VWorldGeocodeResponse {
  response?: {
    status?: string;
    refined?: { text?: string };
    result?: { point?: { x?: string; y?: string } };
  };
}

/** VWorld 지오코더: 주소 변형 × 도로명(ROAD)·지번(PARCEL) 순으로 시도. */
async function geocode(
  key: string,
  address: string,
): Promise<{ point: ParcelPoint; label: string } | null> {
  for (const candidate of normalizeAddressQuery(address)) {
    for (const type of ['ROAD', 'PARCEL'] as const) {
      const url = `${VWORLD_GEOCODE}?${buildQuery({
        service: 'address',
        request: 'getcoord',
        version: '2.0',
        crs: 'epsg:4326',
        type,
        address: candidate,
        format: 'json',
        key,
      })}`;
      const data = await jsonp<VWorldGeocodeResponse>(url).catch(() => null);
      const point =
        data?.response?.status === 'OK' ? data.response.result?.point : undefined;
      if (point) {
        const lng = Number(point.x);
        const lat = Number(point.y);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return {
            point: { lat, lng },
            label: data?.response?.refined?.text || candidate,
          };
        }
      }
    }
  }
  return null;
}

interface GeoJsonGeometry {
  type?: string;
  coordinates?: unknown;
}

interface VWorldDataResponse {
  response?: {
    status?: string;
    error?: { text?: string };
    result?: {
      featureCollection?: {
        features?: Array<{
          geometry?: GeoJsonGeometry;
          properties?: Record<string, unknown>;
        }>;
      };
    };
  };
}

function ringToPoints(ring: number[][]): ParcelPoint[] {
  return ring
    .map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

function toParcels(data: VWorldDataResponse): { parcels: Parcel[]; label: string } {
  const features = data.response?.result?.featureCollection?.features ?? [];
  const parcels: Parcel[] = [];
  let label = '';

  for (const feature of features) {
    if (!label) {
      const props = feature?.properties ?? {};
      label = String(props.addr || props.jibun || props.bonbun || '').trim();
    }
    const geometry = feature?.geometry;
    if (!geometry?.type || !geometry.coordinates) continue;

    if (geometry.type === 'Polygon') {
      parcels.push({
        rings: (geometry.coordinates as number[][][]).map(ringToPoints),
      });
    } else if (geometry.type === 'MultiPolygon') {
      for (const poly of geometry.coordinates as number[][][][]) {
        parcels.push({ rings: poly.map(ringToPoints) });
      }
    }
  }

  return { parcels, label };
}

/** VWorld 데이터API: 좌표(POINT) → 필지 폴리곤(GeoJSON). */
async function fetchParcels(
  key: string,
  domain: string,
  point: ParcelPoint,
): Promise<{ parcels: Parcel[]; label: string }> {
  const url = `${VWORLD_DATA}?${buildQuery({
    service: 'data',
    request: 'GetFeature',
    data: CADASTRAL_LAYER,
    key,
    domain,
    crs: 'EPSG:4326',
    geomFilter: `POINT(${point.lng} ${point.lat})`,
    format: 'json',
    geometry: 'true',
    size: '10',
  })}`;
  const data = await jsonp<VWorldDataResponse>(url);
  const status = data.response?.status;
  if (status !== 'OK') {
    // NOT_FOUND(해당 지점 필지 없음)는 빈 결과로 처리.
    if (status === 'NOT_FOUND') return { parcels: [], label: '' };
    throw new Error(
      `필지 경계 조회 실패: ${data.response?.error?.text ?? status ?? '알 수 없음'}`,
    );
  }
  return toParcels(data);
}

/**
 * 주소/장소 문자열로 필지 경계를 조회한다.
 * @throws 조회 실패 시 사용자용 메시지를 담은 Error
 */
export async function fetchParcelBoundary(
  query: string,
): Promise<PlaceSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('검색어를 입력하세요.');

  const key = getPublicEnv('NEXT_PUBLIC_VWORLD_API_KEY');
  if (!key) throw new Error('VWorld 인증키가 설정되지 않았습니다.');

  const geo = await geocode(key, trimmed);
  if (!geo) {
    throw new Error('주소를 찾을 수 없습니다. 도로명 또는 지번 주소를 확인하세요.');
  }

  const domain = window.location.hostname;
  const { parcels, label } = await fetchParcels(key, domain, geo.point);
  return { center: geo.point, label: label || geo.label, parcels };
}

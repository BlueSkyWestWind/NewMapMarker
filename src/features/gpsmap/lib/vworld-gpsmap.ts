'use client';

import { getPublicEnv } from '@/lib/public-env';

/**
 * GPSMAP용 VWorld 클라이언트 — 전부 브라우저 직접 JSONP.
 * (VWorld는 Cloudflare 등 해외 서버 egress를 거부하므로 서버 프록시 불가)
 *   - 지오코딩(주소→좌표), 역주소(좌표→구/신주소·우편번호)
 *   - 필지(PNU·경계), 건축물대장 요약(getBuildingUse → LT_C_BLDGINFO 폴백)
 * 키는 도메인/Referer 제한으로 보호 → VWorld 콘솔에 서비스 도메인 등록 필요.
 */

const REQ_ADDRESS = 'https://api.vworld.kr/req/address';
const REQ_DATA = 'https://api.vworld.kr/req/data';
const NED_BUILDING_USE = 'https://api.vworld.kr/ned/data/getBuildingUse';
const CADASTRAL_LAYER = 'LP_PA_CBND_BUBUN';
const BUILDING_LAYER = 'LT_C_BLDGINFO';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BuildingInfo {
  name: string;
  dongName: string;
  groundFloors: string;
  basementFloors: string;
  totalArea: string;
  platArea: string;
  buildingArea: string;
  mainUse: string;
  detailUse: string;
  source: string;
}

function apiKey(): string {
  return getPublicEnv('NEXT_PUBLIC_VWORLD_API_KEY');
}

function domainParam(): string {
  return typeof window !== 'undefined' ? window.location.hostname : 'localhost';
}

function buildQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

/** VWorld JSONP 호출. 실패 시 reject 대신 null 반환(단건 조회가 부분 실패로 이어지지 않게). */
function jsonp<T>(baseUrl: string, timeoutMs = 10000): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const cb = `__gpsmap_cb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement('script');
    const w = window as unknown as Record<string, unknown>;
    let timer = 0;
    let done = false;

    const cleanup = () => {
      delete w[cb];
      script.remove();
      if (timer) window.clearTimeout(timer);
    };
    const finish = (data: T | null) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(data);
    };

    w[cb] = (data: T) => finish(data);
    script.onerror = () => finish(null);
    timer = window.setTimeout(() => finish(null), timeoutMs);
    script.src = `${baseUrl}&callback=${cb}`;
    document.body.appendChild(script);
  });
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function pick(obj: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!obj) return '';
  for (const k of keys) {
    const value = str(obj[k]);
    if (value) return value;
  }
  return '';
}

// ── 건축물 용도 코드 → 한글 (GPSMAP 이식) ──────────────────────────────
const BUILDING_USE_CODE_NAMES: Record<string, string> = {
  '01000': '단독주택', '02000': '공동주택', '03000': '제1종 근린생활시설',
  '04000': '제2종 근린생활시설', '05000': '문화 및 집회시설', '06000': '종교시설',
  '07000': '판매시설', '08000': '운수시설', '09000': '의료시설',
  '10000': '교육연구시설', '11000': '노유자시설', '12000': '수련시설',
  '13000': '운동시설', '14000': '업무시설', '15000': '숙박시설',
  '16000': '위락시설', '17000': '공장', '18000': '창고시설',
  '19000': '위험물 저장 및 처리 시설', '20000': '자동차 관련 시설',
  '21000': '동물 및 식물 관련 시설', '22000': '자원순환 관련 시설',
  '23000': '교정 및 군사 시설', '24000': '방송통신시설', '25000': '발전시설',
  '26000': '묘지 관련 시설', '27000': '관광 휴게시설', '28000': '장례시설',
  '29000': '야영장 시설',
};

export function formatBuildingUseName(raw: unknown): string {
  const value = str(raw);
  if (!value || value === '-') return '';
  const code = value.replace(/\s+/g, '');
  if (/^\d{5}$/.test(code)) {
    const exact = BUILDING_USE_CODE_NAMES[code];
    if (exact) return `${exact} (${code})`;
    const parent = BUILDING_USE_CODE_NAMES[code.substring(0, 2) + '000'];
    if (parent) return `${parent} 세부용도 (${code})`;
    return `건축물용도 코드 ${code}`;
  }
  return value;
}

// ── 응답 타입(부분) ──────────────────────────────────────────────────
interface GeocodeResp {
  response?: {
    status?: string;
    refined?: { text?: string };
    result?: { point?: { x?: string; y?: string } };
  };
}
interface GetAddressResp {
  response?: {
    status?: string;
    result?: Array<{ type?: string; text?: string; zipcode?: string }>;
  };
}
interface ReqDataResp {
  response?: {
    status?: string;
    result?: {
      featureCollection?: {
        features?: Array<{
          geometry?: { type?: string; coordinates?: unknown };
          properties?: Record<string, unknown>;
        }>;
      };
    };
  };
}

function normalizeAddressCandidates(address: string): string[] {
  const trimmed = address.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);
  const aliases: Array<[RegExp, string]> = [
    [/전남광주통합특별시/g, '광주광역시'],
    [/광주통합특별시/g, '광주광역시'],
  ];
  for (const [pattern, replacement] of aliases) {
    const next = trimmed.replace(pattern, replacement);
    if (next !== trimmed) variants.add(next);
  }
  return [...variants];
}

// ── 지오코딩 (주소 → 좌표) ────────────────────────────────────────────
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number; label: string } | null> {
  const key = apiKey();
  if (!key) {
    throw new Error('VWorld 인증키가 설정되지 않았습니다. (NEXT_PUBLIC_VWORLD_API_KEY)');
  }

  for (const candidate of normalizeAddressCandidates(address)) {
    for (const type of ['ROAD', 'PARCEL'] as const) {
      const url = `${REQ_ADDRESS}?${buildQuery({
        service: 'address',
        request: 'getcoord',
        version: '2.0',
        crs: 'epsg:4326',
        type,
        address: candidate,
        format: 'json',
        key,
      })}`;
      const data = await jsonp<GeocodeResp>(url);
      const point =
        data?.response?.status === 'OK' ? data.response.result?.point : undefined;
      if (point) {
        const lat = Number(point.y);
        const lng = Number(point.x);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return {
            lat,
            lng,
            label: data?.response?.refined?.text || candidate,
          };
        }
      }
    }
  }
  return null;
}

// ── 역주소 (좌표 → 구/신주소·우편번호) ───────────────────────────────
export async function reverseAddress(
  lat: number,
  lng: number,
): Promise<{ oldAddress: string; roadAddress: string; zipcode: string }> {
  const url = `${REQ_ADDRESS}?${buildQuery({
    service: 'address', request: 'getAddress', version: '2.0',
    crs: 'epsg:4326', point: `${lng},${lat}`, type: 'BOTH',
    format: 'json', key: apiKey(), domain: domainParam(),
  })}`;
  const data = await jsonp<GetAddressResp>(url);
  const items = data?.response?.result ?? [];
  let oldAddress = '';
  let roadAddress = '';
  let zipcode = '';
  for (const item of items) {
    if (item.type === 'parcel') oldAddress = str(item.text);
    if (item.type === 'road') roadAddress = str(item.text);
    if (!zipcode && item.zipcode) zipcode = str(item.zipcode);
  }
  return { oldAddress, roadAddress, zipcode };
}

// ── 필지 (좌표 → PNU·지번·경계) ──────────────────────────────────────
function ringToLatLng(ring: number[][]): LatLng[] {
  return ring
    .map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export async function fetchParcel(
  lat: number,
  lng: number,
): Promise<{ pnu: string; jibun: string; parcels: LatLng[][] }> {
  const url = `${REQ_DATA}?${buildQuery({
    service: 'data', request: 'GetFeature', data: CADASTRAL_LAYER,
    key: apiKey(), domain: domainParam(), crs: 'EPSG:4326',
    geomFilter: `POINT(${lng} ${lat})`, format: 'json', geometry: 'true', size: '5',
  })}`;
  const data = await jsonp<ReqDataResp>(url);
  const features = data?.response?.result?.featureCollection?.features ?? [];
  const first = features[0]?.properties ?? null;
  const parcels: LatLng[][] = [];
  for (const feature of features) {
    const geometry = feature.geometry;
    if (geometry?.type === 'Polygon') {
      for (const ring of geometry.coordinates as number[][][]) parcels.push(ringToLatLng(ring));
    } else if (geometry?.type === 'MultiPolygon') {
      for (const poly of geometry.coordinates as number[][][][]) {
        for (const ring of poly) parcels.push(ringToLatLng(ring));
      }
    }
  }
  return {
    pnu: pick(first, ['pnu', 'PNU', 'ld_code', 'ldCode']),
    jibun: pick(first, ['addr', 'jibun', 'bonbun']),
    parcels,
  };
}

// ── 건축물대장 (PNU → 요약, 폴백 LT_C_BLDGINFO) ─────────────────────
function collectBuildingItems(data: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const isBuilding = (x: Record<string, unknown>) =>
    x.buldNm !== undefined || x.buldDongNm !== undefined ||
    x.groundFloorCo !== undefined || x.buldTotar !== undefined ||
    x.buldPlotAr !== undefined;
  const walk = (obj: unknown) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(walk);
      return;
    }
    const record = obj as Record<string, unknown>;
    if (isBuilding(record)) out.push(record);
    for (const k of Object.keys(record)) walk(record[k]);
  };
  walk(data);
  return out;
}

function mapNedBuilding(b: Record<string, unknown>): BuildingInfo {
  return {
    name: pick(b, ['buldNm', 'bldNm']) || '-',
    dongName: pick(b, ['buldDongNm', 'dongNm']) || '본동',
    groundFloors: pick(b, ['groundFloorCo', 'grndFlrCnt']) || '-',
    basementFloors: pick(b, ['undgrndFloorCo', 'ugrndFlrCnt']) || '-',
    totalArea: pick(b, ['buldTotar', 'totArea']) || '-',
    platArea: pick(b, ['buldPlotAr', 'platArea']) || '-',
    buildingArea: pick(b, ['buldBildngAr', 'archArea', 'bildngAr']) || '-',
    mainUse: formatBuildingUseName(pick(b, ['mainPrposCodeNm', 'mainPurpsCdNm', 'mainPrposNm'])) || '-',
    detailUse: formatBuildingUseName(pick(b, ['detailPrposCodeNm', 'etcPurps', 'detailPrposNm'])) || '-',
    source: 'getBuildingUse',
  };
}

// ── LT_C_BLDGINFO(2D 건축물정보) — 좌표 직접 조회(권한 불필요, 기본 소스) ──
/** LT_C_BLDGINFO 실제 필드명 기준 매핑 (GPSMAP 원본 normalizeLtCBldgInfoFeature). */
function mapLtcBuilding(p: Record<string, unknown>): BuildingInfo {
  return {
    name: pick(p, ['bld_nm', 'buldNm', 'bldNm', 'bd_nm', 'buld_nm']) || '-',
    dongName: pick(p, ['dong_nm', 'buldDongNm', 'dongNm', 'buld_dong_nm']) || '본동',
    groundFloors: pick(p, ['grnd_flr', 'groundFloorCo', 'grnd_flr_co']) || '-',
    basementFloors: pick(p, ['ugrnd_flr', 'undgrndFloorCo', 'und_flr_co']) || '-',
    totalArea: pick(p, ['totalarea', 'buldTotar', 'totarea', 'tot_area']) || '-',
    platArea: pick(p, ['platarea', 'buldPlotAr', 'plat_area']) || '-',
    buildingArea: pick(p, ['archarea', 'arch_area']) || '-',
    mainUse:
      formatBuildingUseName(pick(p, ['usability', 'mainPrposCodeNm', 'main_prpos_code_nm', 'mainUse'])) || '-',
    detailUse:
      formatBuildingUseName(pick(p, ['detailPrposCodeNm', 'detail_prpos_code_nm', 'detailUse'])) || '-',
    source: 'LT_C_BLDGINFO',
  };
}

/** 지오메트리에서 대표 좌표(첫 정점)를 뽑아 최근접 건물 정렬에 사용. */
function firstGeometryPoint(geometry: { coordinates?: unknown } | undefined): LatLng | null {
  let node: unknown = geometry?.coordinates;
  while (Array.isArray(node) && Array.isArray(node[0])) node = node[0];
  if (Array.isArray(node) && node.length >= 2 && typeof node[0] === 'number') {
    return { lat: Number(node[1]), lng: Number(node[0]) };
  }
  return null;
}

function approxDistanceMeters(a: LatLng, b: LatLng): number {
  const dLat = (a.lat - b.lat) * 111000;
  const dLng = (a.lng - b.lng) * 111000 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * LT_C_BLDGINFO 좌표 직접 조회.
 * 지오코딩 좌표가 건물 밖(도로·마당)에 찍힐 수 있어 POINT → BOX(5~50m) 순차 확장 후
 * 클릭 좌표에서 가장 가까운 건물을 반환한다.
 */
async function fetchBuildingFromLtc(lat: number, lng: number): Promise<BuildingInfo | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const boxes: string[] = [
    `POINT(${lng} ${lat})`,
    ...[0.00005, 0.00012, 0.00025, 0.00045].map(
      (d) => `BOX(${lng - d},${lat - d},${lng + d},${lat + d})`,
    ),
  ];

  for (const geomFilter of boxes) {
    const url = `${REQ_DATA}?${buildQuery({
      service: 'data', version: '2.0', request: 'GetFeature',
      key: apiKey(), domain: domainParam(), data: BUILDING_LAYER,
      geomFilter, geometry: 'true', attribute: 'true', crs: 'EPSG:4326',
      size: '100', page: '1', format: 'json', errorFormat: 'json',
    })}`;
    const data = await jsonp<ReqDataResp>(url);
    if (data?.response?.status && data.response.status !== 'OK') continue;
    const features = data?.response?.result?.featureCollection?.features ?? [];
    if (!features.length) continue;

    const click: LatLng = { lat, lng };
    let best = features[0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (const feature of features) {
      const point = firstGeometryPoint(feature.geometry);
      const dist = point ? approxDistanceMeters(click, point) : Number.POSITIVE_INFINITY;
      if (dist < bestDist) {
        bestDist = dist;
        best = feature;
      }
    }
    if (best.properties) return mapLtcBuilding(best.properties);
  }
  return null;
}

export async function fetchBuilding(
  pnu: string,
  lat: number,
  lng: number,
): Promise<BuildingInfo | null> {
  // 1) 기본: LT_C_BLDGINFO 좌표 직접 조회 (국가중점 API 권한 불필요)
  const ltc = await fetchBuildingFromLtc(lat, lng);
  if (ltc) return ltc;

  // 2) 폴백: getBuildingUse (정확 PNU 기반, VWorld 국가중점 API 권한 필요)
  if (pnu) {
    const url = `${NED_BUILDING_USE}?${buildQuery({
      key: apiKey(), domain: domainParam(), pnu: pnu.substring(0, 19),
      format: 'json', numOfRows: '1000', pageNo: '1',
    })}`;
    const data = await jsonp<unknown>(url);
    const items = collectBuildingItems(data);
    if (items.length > 0) return mapNedBuilding(items[0]);
  }

  return null;
}

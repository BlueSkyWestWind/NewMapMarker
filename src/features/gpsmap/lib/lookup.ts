'use client';

import {
  makeGoogleSearchCoordinate,
  parseCoords,
  splitDmsParts,
  type DmsParts,
} from './coords';
import {
  fetchBuilding,
  fetchParcel,
  geocodeAddress,
  normalizeRegionForDisplay,
  reverseAddress,
  type BuildingInfo,
  type LatLng,
} from './vworld-gpsmap';

export interface GpsLookupResult {
  input: string;
  /** 검색출처 (좌표 직접입력 / 주소검색) */
  source: string;
  center: LatLng;
  /** 구주소(지번) */
  oldAddress: string;
  /** 신주소(도로명) */
  roadAddress: string;
  zipcode: string;
  /** 도분초 표기 (예: 37-34-46.08) */
  latDms: string;
  lngDms: string;
  googleCoord: string;
  pnu: string;
  parcels: LatLng[][];
  building: BuildingInfo | null;
}

function formatDms(parts: DmsParts | null): string {
  if (!parts) return '-';
  return `${parts.d}-${parts.m}-${parts.s}.${parts.cs}`;
}

/**
 * 단건 조회: 입력(주소/좌표) → 좌표 확정 → 역주소·필지(PNU)·건축물대장 병합.
 * @throws 좌표/주소를 못 찾으면 사용자용 메시지 Error
 */
export async function runSingleLookup(input: string): Promise<GpsLookupResult> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('검색어를 입력하세요.');

  let center: LatLng;
  let source: string;

  const coord = parseCoords(trimmed);
  if (coord) {
    center = { lat: coord.lat, lng: coord.lon };
    source = '좌표 직접입력';
  } else {
    const geo = await geocodeAddress(trimmed);
    if (!geo) {
      throw new Error('주소를 찾을 수 없습니다. 도로명·지번 주소 또는 좌표를 확인하세요.');
    }
    center = { lat: geo.lat, lng: geo.lng };
    source = '주소검색';
  }

  const [addr, parcel] = await Promise.all([
    reverseAddress(center.lat, center.lng),
    fetchParcel(center.lat, center.lng),
  ]);
  const building = await fetchBuilding(parcel.pnu, center.lat, center.lng);

  // VWorld 통합 명칭('전남광주통합특별시')을 현행 행정구역명으로 정규화해 표시한다.
  const oldAddress = normalizeRegionForDisplay(addr.oldAddress || parcel.jibun || '');
  const roadAddress = normalizeRegionForDisplay(addr.roadAddress || '');

  return {
    input: trimmed,
    source,
    center,
    oldAddress: oldAddress || '-',
    // 도로명주소는 건물·도로에만 부여된다. 토지(전·답·임야 등)엔 없으므로 안내 문구로 구분한다.
    roadAddress: roadAddress || (oldAddress ? '도로명주소 없음 (토지)' : '-'),
    zipcode: addr.zipcode || '-',
    latDms: formatDms(splitDmsParts(center.lat)),
    lngDms: formatDms(splitDmsParts(center.lng)),
    googleCoord: makeGoogleSearchCoordinate(center.lat, center.lng),
    pnu: parcel.pnu || '-',
    parcels: parcel.parcels,
    building,
  };
}

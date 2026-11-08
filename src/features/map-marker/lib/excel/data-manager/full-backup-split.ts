import { ERP_NO_ADDRESS_VALUES } from './erp-columns';
import type { FullBackupTables } from './full-backup-schema';

function hasCoordinates(lat: unknown, lng: unknown): boolean {
  const latNumber = typeof lat === 'number' ? lat : Number(lat);
  const lngNumber = typeof lng === 'number' ? lng : Number(lng);
  return (
    lat !== null &&
    lat !== undefined &&
    lat !== '' &&
    lng !== null &&
    lng !== undefined &&
    lng !== '' &&
    Number.isFinite(latNumber) &&
    Number.isFinite(lngNumber) &&
    !(latNumber === 0 && lngNumber === 0)
  );
}

export interface LocationReviewSplit {
  /** DB에 그대로 복원할 테이블. 위치 확인 대상의 마커·시설정보·공정 행은 빠져 있다 */
  restore: FullBackupTables;
  /** 위치 확인 흐름으로 넘길 행의 통합시설코드 */
  deferredFacilityCodes: Set<string>;
  /** 위치 확인 흐름으로 넘길 마커 수. 코드가 겹치면 코드 수보다 많을 수 있다 */
  deferredCount: number;
  /** 좌표도 주소도 없어 위치를 확인할 수 없는 장비 마커 수(그대로 복원한다) */
  unlocatableCount: number;
}

/**
 * 백업을 복원할 때 **좌표가 없고 주소가 있는** 장비 행을 가려낸다.
 * 이 행들은 DB에 넣지 않고 위치등록 확인 흐름(마커관리 → 장비)으로 보내
 * 사용자가 위치를 확인한 뒤에 저장하게 한다.
 *
 * 통합시설코드가 없는 행은 위치등록이 저장 대상으로 보지 않아(코드 없음) 유실되므로
 * 가려내지 않고 그대로 복원한다.
 */
export function splitBackupForLocationReview(
  tables: FullBackupTables,
): LocationReviewSplit {
  const deferredIds = new Set<string>();
  const deferredFacilityCodes = new Set<string>();
  let unlocatableCount = 0;

  for (const marker of tables.markers) {
    if (hasCoordinates(marker.lat, marker.lng)) continue;

    const address = String(marker.road_address || marker.jibun_address || '').trim();
    const code = String(marker.facility_code ?? '').trim();
    const hasAddress = address !== '' && !ERP_NO_ADDRESS_VALUES.includes(address);

    if (hasAddress && code) {
      deferredIds.add(String(marker.id ?? ''));
      deferredFacilityCodes.add(code);
    } else {
      unlocatableCount += 1;
    }
  }

  if (deferredIds.size === 0) {
    return { restore: tables, deferredFacilityCodes, deferredCount: 0, unlocatableCount };
  }

  const notDeferred = (row: Record<string, unknown>, key: string) =>
    !deferredIds.has(String(row[key] ?? ''));

  return {
    restore: {
      ...tables,
      markers: tables.markers.filter((row) => notDeferred(row, 'id')),
      information: tables.information.filter((row) => notDeferred(row, 'marker_id')),
      erp_details: tables.erp_details.filter((row) => notDeferred(row, 'marker_id')),
    },
    deferredFacilityCodes,
    deferredCount: deferredIds.size,
    unlocatableCount,
  };
}

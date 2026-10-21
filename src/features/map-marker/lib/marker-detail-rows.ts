import {
  GROUP_ROLE_REPRESENTATIVE,
  GROUP_ROLE_SUB,
  getLotAddressKey,
  normalizeGroupRole,
  type GroupRole,
} from '@/features/map-marker/lib/address-group';
import type { EquipmentMarker } from '@/features/map-marker/types/marker';

/**
 * 장비 상세 모달의 순수 함수 모음(동 라벨·그룹 키·대표 선택·상세 표 행 구성).
 * `marker-detail-modal.tsx`에서 옮겨 왔다 — React·DOM에 의존하지 않아 `.ts` 테스트로 고정한다.
 */

export interface InfoRow {
  marker_id?: string | null;
  group_role?: string;
  facility_year?: string;
  project_code?: string;
  facility_code?: string;
  business_type?: string;
  final_station_name?: string;
  eq_type?: string;
  install_date?: string;
  open_date?: string;
}

/** detached_visible 관련 Supabase 오류를 사용자 문구로. 컬럼 미존재면 마이그레이션 안내. */
export function dbErrorMessage(err: unknown, fallback: string): string {
  const e = err as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };
  const detail = e?.message || e?.details || e?.hint || e?.code || '';
  const missingColumn =
    /detached_visible/i.test(detail) ||
    e?.code === 'PGRST204' ||
    e?.code === '42703';
  if (missingColumn) {
    return "DB에 'detached_visible' 컬럼이 아직 없습니다. 마이그레이션(20260722000000_add_detached_visible.sql)을 Supabase에 적용해 주세요.";
  }
  return `${fallback}${detail ? ` (${detail})` : ''}`;
}

export const BASEMENT_LABEL = '지하';
export const ETC_DONG_LABEL = '기타';

/**
 * 국소명에서 분리 라벨을 뽑는다(범용 — 아파트 동/공장 구역 등).
 * - `…121동옥상…` → `121동`
 * - `지하`/`B1` 등 → `지하`
 * - 그 외 → null → 호출부에서 "기타" 그룹으로 묶는다.
 */
export function parseSeparationLabel(name: string | undefined | null): string | null {
  if (!name) return null;
  const dong = /(\d+)\s*동/.exec(name);
  if (dong) return `${dong[1]}동`;
  if (/지하|(?:^|[^A-Za-z])[Bb]\d/.test(name)) return BASEMENT_LABEL;
  return null;
}

/** 분리 라벨 정렬용 숫자 키. 동 < 지하 < 기타. */
export function dongSortKey(label: string): number {
  if (label === ETC_DONG_LABEL) return Number.POSITIVE_INFINITY;
  if (label === BASEMENT_LABEL) return Number.MAX_SAFE_INTEGER;
  return Number.parseInt(label, 10);
}

export function getMarkerDongLabel(marker: EquipmentMarker): string {
  return (
    parseSeparationLabel(marker.finalStationName || marker.name) ??
    ETC_DONG_LABEL
  );
}

/** 마커의 유효 그룹 키(분리 group_key 우선, 없으면 번지 키). address-group.getEffectiveGroupKey와 동일 규칙. */
export function getMarkerEffectiveKey(marker: EquipmentMarker): string {
  const manual = marker.groupKey?.trim();
  if (manual) return manual;
  return getLotAddressKey(marker.roadAddress || marker.jibunAddress || '');
}

/**
 * 같은 동에서 지도에 올릴 대표 국소 1개.
 * 이미 개별 표시 중인 국소가 있으면 그중 이름순 첫 국소, 없으면 전체 중 이름·id 순 첫 국소.
 */
export function pickDongMapRepresentative(
  subs: EquipmentMarker[],
): EquipmentMarker | null {
  if (subs.length === 0) return null;
  const detached = subs.filter((sub) => sub.detachedVisible);
  const pool = detached.length > 0 ? detached : subs;
  return [...pool].sort((a, b) => {
    const nameCmp = (a.finalStationName || a.name).localeCompare(
      b.finalStationName || b.name,
      'ko',
    );
    if (nameCmp !== 0) return nameCmp;
    return a.id.localeCompare(b.id);
  })[0];
}

/** DB·부모 관계 기준 실제 구분 값. */
export function storedGroupRoleOf(marker: EquipmentMarker): GroupRole {
  const normalized = normalizeGroupRole(marker.groupRole);
  if (normalized) return normalized;
  if (marker.parentMarkerId) return GROUP_ROLE_SUB;
  return GROUP_ROLE_REPRESENTATIVE;
}

/**
 * 같은 유효 그룹(번지 또는 분리된 group_key)에 속한 장비 국소 목록.
 * 분리(group_key)된 그룹은 같은 번지라도 서로 다른 그룹으로 취급한다.
 */
export function getAddressGroupMates(
  target: EquipmentMarker,
  all: EquipmentMarker[],
): EquipmentMarker[] {
  const key = getMarkerEffectiveKey(target);
  if (!key) return [target];
  const mates = all.filter((marker) => getMarkerEffectiveKey(marker) === key);
  return mates.length > 0 ? mates : [target];
}

/** 같은 번지에서 다음 대표 후보(이름·id 순). */
export function pickNextAddressRepresentative(
  candidates: EquipmentMarker[],
): EquipmentMarker | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const nameCmp = (a.finalStationName || a.name).localeCompare(
      b.finalStationName || b.name,
      'ko',
    );
    if (nameCmp !== 0) return nameCmp;
    return a.id.localeCompare(b.id);
  })[0];
}

export function toInfoRowFromEquipment(marker: EquipmentMarker): InfoRow {
  return {
    marker_id: marker.id,
    group_role: storedGroupRoleOf(marker),
    facility_year: marker.facilityYear,
    project_code: marker.projectCode,
    facility_code: marker.facilityCode,
    business_type: marker.businessType,
    final_station_name: marker.finalStationName || marker.name,
    eq_type: marker.eqType,
    install_date: marker.installDate,
    open_date: marker.openDate,
  };
}

export function markerDisplayNames(marker: EquipmentMarker): Set<string> {
  return new Set(
    [marker.finalStationName, marker.name]
      .map((value) => (value ?? '').trim())
      .filter(Boolean),
  );
}

export function resolveGroupRole(marker: EquipmentMarker, row?: InfoRow): string {
  const fromRow = normalizeGroupRole(row?.group_role);
  if (fromRow) return fromRow;
  return storedGroupRoleOf(marker);
}

/**
 * 동일 번지 국소 1개에 대응할 information 행을 pool에서 꺼낸다.
 * facility_code 단독 매칭은 쓰지 않는다(코드 중복 시 다른 국소가 1행으로 흡수되는 문제).
 */
export function takeInfoRowForMarker(
  marker: EquipmentMarker,
  pool: InfoRow[],
): InfoRow | null {
  const names = markerDisplayNames(marker);

  const takeAt = (index: number): InfoRow => {
    const [row] = pool.splice(index, 1);
    return row;
  };

  const byIdAndName = pool.findIndex(
    (row) =>
      row.marker_id === marker.id &&
      names.has((row.final_station_name ?? '').trim()),
  );
  if (byIdAndName >= 0) return takeAt(byIdAndName);

  const idOnlyIndexes = pool
    .map((row, index) => (row.marker_id === marker.id ? index : -1))
    .filter((index) => index >= 0);
  if (idOnlyIndexes.length === 1) return takeAt(idOnlyIndexes[0]);

  const byName = pool.findIndex((row) =>
    names.has((row.final_station_name ?? '').trim()),
  );
  if (byName >= 0) return takeAt(byName);

  if (idOnlyIndexes.length > 0) return takeAt(idOnlyIndexes[0]);

  return null;
}

/**
 * 동일 번지 국소 목록(대표+SUB)을 기준으로 상세 표 행을 만든다.
 * 그룹이면 국소마다 1행. 단독(1국소)이면 information 다건을 그대로 노출.
 */
export function buildEquipmentDetailRows(
  relatedMarkers: EquipmentMarker[],
  detailedInfo: InfoRow[],
): InfoRow[] {
  if (relatedMarkers.length === 0) return [];

  if (relatedMarkers.length === 1) {
    const marker = relatedMarkers[0];
    if (detailedInfo.length > 0) {
      return detailedInfo.map((row) => ({
        ...row,
        group_role: resolveGroupRole(marker, row),
        marker_id: row.marker_id || marker.id,
      }));
    }
    return [toInfoRowFromEquipment(marker)];
  }

  const pool = [...detailedInfo];
  const rows: InfoRow[] = relatedMarkers.map((marker) => {
    const fromDb = takeInfoRowForMarker(marker, pool);
    const base = fromDb ?? toInfoRowFromEquipment(marker);
    return {
      ...base,
      group_role: resolveGroupRole(marker, fromDb ?? undefined),
      marker_id: base.marker_id || marker.id,
    };
  });

  // 그룹 모드: 국소 1건=1행만. 잔여 information을 붙이면 다른 동/국소가 섞인다.
  return rows;
}

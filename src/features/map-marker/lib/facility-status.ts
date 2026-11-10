import type {
  EquipmentMarker,
  FacilityRecord,
  FacilityStatus,
} from "@/features/map-marker/types/marker";

export const FACILITY_STATUS_ORDER: FacilityStatus[] = [
  "미시설",
  "시설",
  "개통완료",
  "올해 대상 없음",
];

/** 처음 화면에서 보이는 상태. 개통완료·대상 없음은 필터에서 고르면 나타난다. */
export const DEFAULT_FACILITY_STATUSES: FacilityStatus[] = ["미시설", "시설"];

/**
 * 올해 또는 미래의 연도면 시설을 진행하는 건이다. 빈 값·4자리가 아닌 값은 아니다.
 * 위치등록(`erp-classify.ts`)과 상태 판정이 같은 기준을 쓴다.
 */
export function isActiveFacilityYear(year: string, currentYear: number): boolean {
  const trimmed = year.trim();
  return /^\d{4}$/.test(trimmed) && Number(trimmed) >= currentYear;
}

function isBlank(value: string | null | undefined) {
  return !value || !value.trim();
}

/**
 * 장비 목록의 대표 상태. 시설일이 하나라도 없으면 미시설, 개통일이 하나라도 없으면 시설이다.
 * 시설일 없이 개통일만 있는 예외 데이터는 미시설이다(시설일을 먼저 본다).
 */
export function judgeFacilityStatus(records: FacilityRecord[]): FacilityStatus {
  if (records.length === 0) return "올해 대상 없음";
  if (records.some((record) => isBlank(record.installDate))) return "미시설";
  if (records.some((record) => isBlank(record.openDate))) return "시설";
  return "개통완료";
}

/**
 * 연도·상태를 마커마다 채운다. 대표는 자기 + **숨은 SUB**의 장비를 합쳐 판정하고,
 * 개별 표시(`detachedVisible`) SUB는 자기 장비만 쓴다.
 * 상태는 기준 연도 **이상**(올해·미래) 장비로 판정한다 — 올해는 개통완료여도 내년 장비가
 * 아직 미시설이면 시설을 진행하는 건이다. 지난 연도 장비는 판정에서 뺀다.
 */
export function computeFacilityStatuses(
  markers: EquipmentMarker[],
  year: number,
): EquipmentMarker[] {
  const hiddenSubsByParent = new Map<string, EquipmentMarker[]>();

  markers.forEach((marker) => {
    if (marker.parentMarkerId && !marker.detachedVisible) {
      const list = hiddenSubsByParent.get(marker.parentMarkerId) ?? [];
      list.push(marker);
      hiddenSubsByParent.set(marker.parentMarkerId, list);
    }
  });

  return markers.map((marker) => {
    const own = marker.facilityRecords ?? [];
    const merged = [
      ...own,
      ...(hiddenSubsByParent.get(marker.id) ?? []).flatMap(
        (sub) => sub.facilityRecords ?? [],
      ),
    ];

    const years = [
      ...new Set(merged.map((record) => record.year.trim()).filter(Boolean)),
    ];

    return {
      ...marker,
      groupYears: years,
      facilityStatus: judgeFacilityStatus(
        merged.filter((record) => isActiveFacilityYear(record.year, year)),
      ),
    };
  });
}

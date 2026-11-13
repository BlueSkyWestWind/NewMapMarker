import { DEFAULT_MARKER_COLOR } from "@/features/map-marker/constants/facility-teams";
import type { ErpParsedRow } from "@/features/map-marker/lib/excel/data-manager/erp-parse";
import { reviewGroupMemberIds } from "@/features/map-marker/lib/erp-review";
import { resolveStoredMarkerColor } from "@/features/map-marker/lib/excel-upload-helpers";
import type {
  BatteryMarker,
  EquipmentMarker,
  MarkerFilterState,
  StagedErpRow,
  StagedErpUpload,
} from "@/features/map-marker/types/marker";

/**
 * 엑셀·위치등록 업로드 훅(`use-excel-upload-actions.ts`)에서 쓰는 순수 로직.
 * 훅에는 상태·토스트·스토어 연결만 남기고, 변환·판정은 여기서 테스트한다.
 */

/** 옛 양식은 저장 전에 막는다. 그대로 저장하면 기존 시설일·개통일이 지워진다. */
export async function assertErpDateColumns(rows: ErpParsedRow[]): Promise<void> {
  const { findMissingErpDateColumns } = await import("@/features/map-marker/lib/erp-classify");
  const missing = findMissingErpDateColumns(rows);
  if (missing.length > 0) {
    throw new Error(
      `새 양식의 ${missing.join("·")} 열을 찾지 못해 중단했습니다. 파일의 날짜 열을 확인하세요.`,
    );
  }
}

/** 좌표가 이미 있는 행과 주소로 지오코딩해야 하는 행으로 나눈다. */
export function partitionByCoords<T extends { lat?: number; lng?: number }>(
  rows: T[],
): { withCoords: T[]; needGeocoding: T[] } {
  const hasCoords = (row: T) => row.lat !== undefined && row.lng !== undefined;
  return {
    withCoords: rows.filter(hasCoords),
    needGeocoding: rows.filter((row) => !hasCoords(row)),
  };
}

/** 주소를 찾지 못한 건이 있으면 요약 끝에 건수를 덧붙인다. */
export function appendFailCount(summary: string, failCount: number): string {
  return failCount > 0 ? `${summary} (주소 찾기 실패: ${failCount}건)` : summary;
}

/** 선택이 모두 빈 필터. 저장 직후 방금 저장한 마커가 필터에 가려지지 않도록 쓴다. */
export function emptyFilterSelection(): MarkerFilterState {
  return {
    selectedYears: new Set(),
    selectedBusinesses: new Set(),
    selectedStatuses: new Set(),
    selectedColors: new Set(),
    selectedTags: new Set(),
    selectedCapacities: new Set(),
    selectedQuantities: new Set(),
    selectedStations: new Set(),
  };
}

export function toEquipmentDbMarker(marker: EquipmentMarker) {
  return {
    id: marker.id,
    name: marker.name,
    lat: marker.lat,
    lng: marker.lng,
    memo: marker.memo ?? "",
    tags: marker.tags ?? [],
    color: marker.color ?? DEFAULT_MARKER_COLOR,
    facility_team: marker.facilityTeam ?? "",
    facility_code: marker.facilityCode || null,
    road_address: marker.roadAddress ?? "",
    jibun_address: marker.jibunAddress ?? "",
    created_at: new Date().toISOString(),
  };
}

/** 시설코드가 있는 장비 마커의 상세 정보 행. 날짜 변환은 엑셀 관리자의 `formatDateToYmd`를 넘긴다. */
export function toEquipmentDbInfo(
  marker: EquipmentMarker,
  formatDate: (value: string) => string,
) {
  return {
    marker_id: marker.id,
    facility_code: marker.facilityCode,
    place_name: marker.name,
    facility_year: marker.facilityYear ?? "",
    project_code: marker.projectCode ?? "",
    business_type: marker.businessType ?? "",
    final_station_name: marker.finalStationName ?? "",
    eq_class: marker.eqClass ?? "",
    eq_type: marker.eqType ?? "",
    install_date: formatDate(marker.installDate ?? ""),
    open_date: formatDate(marker.openDate ?? ""),
  };
}

export function toBatteryDbMarker(marker: BatteryMarker) {
  return {
    id: marker.id,
    name: marker.name,
    lat: marker.lat,
    lng: marker.lng,
    address: marker.address ?? "",
    memo: marker.memo ?? "",
    tags: marker.tags ?? [],
    color: resolveStoredMarkerColor(marker.color),
    facility_team: marker.facilityTeam ?? "",
    created_at: new Date().toISOString(),
  };
}

/** 축전지 규격 행. 항목이 없으면 마커 값으로 한 줄(기본 용량 600·수량 12)을 만든다. */
export function toBatterySpecRows(marker: BatteryMarker) {
  const specItems =
    Array.isArray(marker.items) && marker.items.length > 0
      ? marker.items
      : [
          {
            erpName: marker.memo ?? marker.name,
            capacity: marker.capacity ?? 600,
            quantity: marker.quantity ?? 12,
            stationName: marker.stationName ?? marker.name,
            createdAt: marker.createdAt,
          },
        ];

  return specItems.map((item) => ({
    marker_id: marker.id,
    erp_name: item.erpName || marker.memo || marker.name || "",
    capacity: Number(item.capacity) || Number(marker.capacity) || 600,
    quantity: Number(item.quantity) || Number(marker.quantity) || 12,
    station_name: item.stationName || marker.stationName || marker.name || "",
    created_at: item.createdAt
      ? new Date(item.createdAt).toISOString()
      : new Date().toISOString(),
  }));
}

/** 위치등록 파일을 불러온 직후 토스트에 보여 줄 요약. */
export function summarizeStagedUpload(upload: StagedErpUpload): string {
  let summary = `위치등록 파일을 불러왔습니다. 확인 대기 ${upload.reviewRows.length}건 · 기존 ${upload.existingRows.length}건`;
  const addonCount = (upload.addonRows ?? []).length;
  if (addonCount > 0) summary += ` · 추가 사업 ${addonCount}건`;
  if (upload.skippedRows.length > 0) {
    summary += ` · 저장 안 함 ${upload.skippedRows.length}건(코드·주소 없음)`;
  }
  return summary;
}

/**
 * [확인]으로 저장할 행과 좌표를 모은다. 묶음(대표·SUB)은 구성원 전체가 대상이다.
 * `targets`가 `memberCount`보다 적으면 묶음에 위치를 찍지 않은 행이 있다는 뜻이다.
 */
export function collectReviewTargets(
  reviewRows: StagedErpRow[],
  pendingMarkers: Array<{ id: string; lat: number; lng: number }>,
  id: string,
): {
  targets: Array<{ row: StagedErpRow; coords: { lat: number; lng: number } }>;
  memberCount: number;
} {
  const memberIds = reviewGroupMemberIds(reviewRows, id);
  const targets = memberIds.flatMap((memberId) => {
    const row = reviewRows.find((item) => item.id === memberId);
    const marker = pendingMarkers.find((item) => item.id === memberId);
    return row && marker ? [{ row, coords: { lat: marker.lat, lng: marker.lng } }] : [];
  });
  return { targets, memberCount: memberIds.length };
}

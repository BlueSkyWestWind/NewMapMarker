import {
  DEFAULT_MARKER_COLOR,
  PENDING_MARKER_COLOR,
  TEMP_MARKER_COLOR,
} from "@/features/map-marker/constants/facility-teams";
import { splitAddressFields } from "@/features/map-marker/lib/geocode";
import type { ErpParsedRow } from "@/features/map-marker/lib/excel/data-manager/erp-parse";
import type { EquipmentMarker, StagedErpUpload } from "@/features/map-marker/types/marker";

/**
 * 엑셀·위치등록 업로드 훅(`use-excel-upload-actions.tsx`)에서 쓰는 순수 함수 모음.
 * 훅에서 옮겨 왔다 — React에 의존하지 않아 `.ts` 테스트로 고정한다.
 * (JSX를 돌려주는 `buildUploadResultDescription`은 `.tsx`라 훅 파일에 남아 있다.)
 */

export interface ParsedExcelRow {
  id?: string;
  name?: string;
  lat?: number;
  lng?: number;
  address?: string;
  memo?: string;
  tags?: string[];
  color?: string;
  facilityCode?: string;
  projectCode?: string;
  facilityYear?: string;
  businessType?: string;
  finalStationName?: string;
  eqClass?: string;
  eqType?: string;
  installDate?: string;
  openDate?: string;
  roadAddress?: string;
  jibunAddress?: string;
}

export function resetFileInput(input: HTMLInputElement | null) {
  if (input) {
    input.value = "";
  }
}

/**
 * 지오코딩 실패 항목을 주소별로 묶어 사람이 읽을 목록으로 만든다.
 * (같은 주소가 여러 행이면 "주소 (N건)" 형태)
 */
export function formatFailedAddresses(
  items: Array<{ address?: string; name?: string }>,
): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key =
      (item.address ?? "").trim() || (item.name ?? "").trim() || "(주소 없음)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([address, count]) =>
    count > 1 ? `${address} (${count}건)` : address,
  );
}

export function resolveStoredMarkerColor(color: string | undefined) {
  if (!color || color === PENDING_MARKER_COLOR || color === TEMP_MARKER_COLOR) {
    return DEFAULT_MARKER_COLOR;
  }
  return color;
}

export function isValidCoordinate(value: number) {
  return Number.isFinite(value);
}

export function hasStoredCoordinates(lat: unknown, lng: unknown): boolean {
  const latNumber = typeof lat === "number" ? lat : Number(lat);
  const lngNumber = typeof lng === "number" ? lng : Number(lng);
  return (
    Number.isFinite(latNumber) &&
    Number.isFinite(lngNumber) &&
    !(latNumber === 0 && lngNumber === 0)
  );
}

export function toEquipmentMarker(
  marker: ParsedExcelRow,
  isPending = true,
): EquipmentMarker {
  const { roadAddress, jibunAddress } = splitAddressFields({
    roadAddress: marker.roadAddress,
    jibunAddress: marker.jibunAddress,
    address: marker.address,
  });
  return {
    id: String(
      marker.id ??
        `pending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    ),
    name: String(marker.name ?? ""),
    lat: Number(marker.lat),
    lng: Number(marker.lng),
    memo: String(marker.memo ?? ""),
    tags: Array.isArray(marker.tags) ? marker.tags : [],
    color: isPending
      ? PENDING_MARKER_COLOR
      : String(marker.color ?? DEFAULT_MARKER_COLOR),
    facilityTeam: "",
    roadAddress,
    jibunAddress,
    facilityCode: String(marker.facilityCode ?? ""),
    projectCode: String(marker.projectCode ?? ""),
    facilityYear: String(marker.facilityYear ?? ""),
    businessType: String(marker.businessType ?? ""),
    finalStationName: String(marker.finalStationName ?? ""),
    eqClass: String(marker.eqClass ?? ""),
    eqType: String(marker.eqType ?? ""),
    installDate: String(marker.installDate ?? ""),
    openDate: String(marker.openDate ?? ""),
    createdAt: new Date().toISOString().split("T")[0],
    isPending,
  };
}

/** 스테이징된 위치등록 markerRow → 지도 표시용 임시(pending) 장비 마커 */
export function stagedMarkerRowToPending(row: Record<string, unknown>): EquipmentMarker {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    lat: Number(row.lat),
    lng: Number(row.lng),
    memo: String(row.memo ?? ""),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    color: PENDING_MARKER_COLOR,
    facilityTeam: "",
    roadAddress: String(row.road_address ?? ""),
    jibunAddress: String(row.jibun_address ?? ""),
    facilityCode: String(row.facility_code ?? ""),
    projectCode: "",
    facilityYear: "",
    businessType: "",
    finalStationName: "",
    eqClass: "",
    eqType: "",
    installDate: "",
    openDate: "",
    createdAt: new Date().toISOString().split("T")[0],
    isPending: true,
  };
}

/** 위치등록 저장 결과 토스트 요약문 (즉시 저장·적용 공용) */
export function buildErpSummary(
  payload: StagedErpUpload,
  regroup: { groupCount: number; subCount: number },
): string {
  const { markerRows, meta } = payload;
  let summary = `위치등록 ${markerRows.length}건을 저장했습니다.`;
  if (meta.preservedCoordCount > 0) {
    summary += ` (기존 위경도 유지 ${meta.preservedCoordCount}건`;
    if (meta.newCoordCount > 0) summary += ` · 신규 좌표 ${meta.newCoordCount}건`;
    summary += ")";
  }
  if (regroup.subCount > 0) {
    summary += ` (동일 번지 취합: 그룹 ${regroup.groupCount} · 서브 ${regroup.subCount}건)`;
  }
  if (meta.geocodeFailCount > 0) {
    summary += ` (주소 찾기 실패: ${meta.geocodeFailCount}건 — 좌표 없이 저장됨)`;
  }
  return summary;
}

/**
 * ERP 시트 파서 지연 로딩.
 * erp-parse는 xlsx(SheetJS)를 정적으로 끌어와서, 정적 import하면 SheetJS 전체가
 * 홈 첫 로딩 번들에 실린다. 실제로 필요한 건 파일 업로드 순간뿐이다.
 */
export async function parseErpSheet(file: File): Promise<ErpParsedRow[]> {
  const { parseErpSheet: parse } = await import(
    "@/features/map-marker/lib/excel/data-manager/erp-parse"
  );
  return parse(file);
}

import { DEFAULT_MARKER_COLOR } from "@/features/map-marker/constants/facility-teams";
import { hasStoredCoordinates } from "@/features/map-marker/lib/excel-upload-helpers";
import {
  ERP_DATE_COLUMNS,
  ERP_NO_ADDRESS_VALUES,
} from "@/features/map-marker/lib/excel/data-manager/erp-columns";
import type { ErpParsedRow } from "@/features/map-marker/lib/excel/data-manager/erp-parse";
import { splitAddressFields } from "@/features/map-marker/lib/geocode";
import type {
  StagedErpRow,
  StagedErpRowKind,
  StagedErpSkippedRow,
} from "@/features/map-marker/types/marker";

/**
 * 위치등록 파일의 행 분류와 저장 행 생성. 업로드할 때만 필요해 지연 로딩한다.
 * 규칙은 `docs/Ver_3.0/Ver_3.0_위치등록_신규확인_구현.md`.
 */

export interface ExistingMarkerRef {
  id: string;
  facility_code: string | null;
  lat: unknown;
  lng: unknown;
  /** 마커의 공정 정보(`information`)에 적힌 시설연도들. 모르면 비워 둔다 */
  facility_years?: string[];
}

/** 마커 목록에 공정 정보(`information`)의 시설연도를 붙인다. 연도가 빈 행은 모르는 것으로 본다. */
export function withFacilityYears(
  markers: ExistingMarkerRef[],
  infoRows: Array<{ marker_id: string; facility_year: string | null }>,
): ExistingMarkerRef[] {
  const yearsByMarker = new Map<string, Set<string>>();
  for (const info of infoRows) {
    const year = String(info.facility_year ?? "").trim();
    if (!year) continue;
    const years = yearsByMarker.get(info.marker_id) ?? new Set<string>();
    years.add(year);
    yearsByMarker.set(info.marker_id, years);
  }
  return markers.map((marker) => ({
    ...marker,
    facility_years: [...(yearsByMarker.get(marker.id) ?? [])],
  }));
}

/** 올해 또는 미래의 사업연도면 시설을 진행하는 건이다. 빈 값·해석할 수 없는 값은 아니다. */
export function isActiveFacilityYear(year: string, currentYear: number): boolean {
  const trimmed = year.trim();
  return /^\d{4}$/.test(trimmed) && Number(trimmed) >= currentYear;
}

export interface ClassifiedErpRow {
  row: ErpParsedRow;
  id: string;
  kind: StagedErpRowKind;
  lat: number | null;
  lng: number | null;
}

type Coords = { lat: number; lng: number };

/**
 * 통합시설코드와 사업연도로 행을 신규·기존으로 나눈다. 코드나 주소가 없는 행은 저장 대상이 아니다.
 *
 * 같은 통합시설코드라도 사업연도가 올해 이상이면 다른 시설 공사이므로, 같은 연도의 마커에만
 * 연결하고 없으면 새 마커(`erp_코드_연도`)로 만든다. 지난 사업연도·빈 값은 예전처럼 코드로 연결하되,
 * 진행 중인 마커만 있는 코드면 그 정보를 덮어쓰지 않도록 저장하지 않는다.
 */
export function classifyErpRows(
  rows: ErpParsedRow[],
  existing: ExistingMarkerRef[],
  currentYear: number = new Date().getFullYear(),
): {
  classified: ClassifiedErpRow[];
  skippedRows: StagedErpSkippedRow[];
} {
  const byId = new Map(existing.map((marker) => [marker.id, marker]));
  const byCode = new Map<string, ExistingMarkerRef[]>();
  for (const marker of existing) {
    const code = String(marker.facility_code ?? "").trim();
    if (!code) continue;
    byCode.set(code, [...(byCode.get(code) ?? []), marker]);
  }

  const usedIds = new Set<string>();
  const classified: ClassifiedErpRow[] = [];
  const skippedRows: StagedErpSkippedRow[] = [];

  for (const row of rows) {
    const code = String(row.facilityCode ?? "").trim();
    if (!code) {
      skippedRows.push({
        name: row.name,
        address: row.address,
        reason: "코드 없음",
      });
      continue;
    }

    const address = row.address.trim();
    if (!address || ERP_NO_ADDRESS_VALUES.includes(address)) {
      skippedRows.push({
        name: row.name,
        address: row.address,
        reason: "주소 없음",
      });
      continue;
    }

    const year = row.facilityYear.trim();
    const isActive = isActiveFacilityYear(year, currentYear);
    const sameCode = byCode.get(code) ?? [];
    const yearsOf = (marker: ExistingMarkerRef) => marker.facility_years ?? [];
    const hasActiveYear = (marker: ExistingMarkerRef) =>
      yearsOf(marker).some((value) => isActiveFacilityYear(value, currentYear));
    const candidates = sameCode.filter((marker) =>
      isActive
        ? // 올해 이상: 같은 연도이거나 연도를 모르는 마커(중복을 만들지 않으려고)에만 연결한다.
          yearsOf(marker).length === 0 || yearsOf(marker).includes(year)
        : // 지난 연도·빈 값: 진행 중인 마커는 덮어쓰지 않는다.
          !hasActiveYear(marker) || yearsOf(marker).includes(year),
    );

    if (!isActive && year && sameCode.length > 0 && candidates.length === 0) {
      skippedRows.push({ name: row.name, address: row.address, reason: "지난 사업연도" });
      continue;
    }

    // 연도가 맞는 마커가 하나라도 있으면 이 행은 그 마커의 같은 공사(중복 행)로 본다.
    const hasSameYearMarker = candidates.length > 0;
    const plainId = `erp_${code}`;
    const byPreferredId = byId.get(plainId);
    if (byPreferredId && !String(byPreferredId.facility_code ?? "").trim()) {
      candidates.push(byPreferredId);
    }
    const match = candidates.find((marker) => !usedIds.has(marker.id));

    if (match) {
      usedIds.add(match.id);
      const hasCoords = hasStoredCoordinates(match.lat, match.lng);
      classified.push({
        row,
        id: match.id,
        kind: hasCoords ? "existing" : "missingCoords",
        lat: hasCoords ? Number(match.lat) : null,
        lng: hasCoords ? Number(match.lng) : null,
      });
      continue;
    }

    // 같은 코드의 마커가 모두 다른 연도인 올해 이상의 행은 연도를 붙여 구분한다.
    const preferredId =
      isActive && sameCode.length > 0 && !hasSameYearMarker ? `${plainId}_${year}` : plainId;
    let id = preferredId;
    for (let n = 1; usedIds.has(id) || byId.has(id); n += 1) {
      id = `${preferredId}_${n}`;
    }
    usedIds.add(id);
    classified.push({ row, id, kind: "new", lat: null, lng: null });
  }

  return { classified, skippedRows };
}

/**
 * 저장할 행을 만든다. 기존 마커의 메모·태그·색상·담당팀·주소·등록일을 지키기 위해
 * 신규가 아니면 마커 행에 국소명과 코드만 담는다.
 */
export function buildStagedErpRow(
  classified: ClassifiedErpRow,
  coords: Coords | null,
): StagedErpRow {
  const { row, id, kind } = classified;
  const facilityCode = row.facilityCode || null;
  const identity = { id, name: row.name, facility_code: facilityCode };
  const { roadAddress, jibunAddress } = splitAddressFields({
    address: row.address,
  });

  return {
    id,
    kind,
    name: row.name,
    address: row.address,
    lat: coords?.lat ?? classified.lat,
    lng: coords?.lng ?? classified.lng,
    marker:
      kind === "new"
        ? {
            ...identity,
            memo: "",
            tags: [],
            color: DEFAULT_MARKER_COLOR,
            facility_team: "",
            road_address: roadAddress,
            jibun_address: jibunAddress,
          }
        : identity,
    info: {
      marker_id: id,
      place_name: row.name,
      facility_code: facilityCode,
      project_code: row.projectCode,
      facility_year: row.facilityYear || "",
      business_type: row.businessType,
      final_station_name: row.finalStationName,
      eq_class: row.eqClass,
      eq_type: row.eqType,
      install_date: row.installDate,
      open_date: row.openDate,
    },
    erp: {
      marker_id: id,
      ...row.erp,
      facility_code: row.facilityCode || row.erp.facility_code || null,
      raw: row.raw,
    },
  };
}

/**
 * 시설일·개통일 열이 없는 옛 양식을 찾는다. 그대로 저장하면 공정 정보를 지우고
 * 다시 넣는 과정에서 기존 날짜가 사라진다(계획서 5장). 값이 빈 것은 문제가 아니다.
 */
export function findMissingErpDateColumns(rows: ErpParsedRow[]): string[] {
  const raw = rows[0]?.raw ?? {};
  const hasAny = (columns: readonly string[]) =>
    columns.some((column) => column in raw);
  return [
    ...(hasAny(ERP_DATE_COLUMNS.installDate) ? [] : ["시설일"]),
    ...(hasAny(ERP_DATE_COLUMNS.openDate) ? [] : ["개통일"]),
  ];
}

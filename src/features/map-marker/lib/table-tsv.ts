import type { InfoRow } from "@/features/map-marker/lib/marker-detail-rows";
import type { BatterySpecItem } from "@/features/map-marker/types/marker";

/**
 * 마커 상세 표의 복사(TSV)용 순수 로직. 엑셀에 붙여 넣을 수 있게 탭·줄바꿈으로 잇는다.
 * 셀 키는 `"행,열"` 문자열(예: `"0,2"`)이다.
 */

export const EQUIPMENT_TABLE_HEADERS = [
  "구분",
  "시설연도",
  "프로젝트코드",
  "통합시설코드",
  "사업구분",
  "국소명-최종",
  "장비타입",
  "시설일",
  "개통일",
] as const;

export const BATTERY_TABLE_HEADERS = [
  "ERP명",
  "주소",
  "용량(AH)",
  "수량(Cell)",
  "창고/국소/국사명",
  "등록일",
] as const;

/** ISO 시각에서 날짜(YYYY-MM-DD)만 남긴다. 값이 없으면 빈 문자열. */
export function dateOnly(value: string | null | undefined): string {
  return value ? value.split("T")[0] : "";
}

/** 장비 상세 한 행의 복사용 칸. 첫 칸(구분)은 화면의 select 값이므로 `groupRole`을 받는다. */
export function equipmentCopyCells(row: InfoRow, groupRole: string): string[] {
  return [
    groupRole,
    row.facility_year || "",
    row.project_code || "",
    row.facility_code || "",
    row.business_type || "",
    row.final_station_name || "",
    row.eq_type || "",
    dateOnly(row.install_date),
    dateOnly(row.open_date),
  ];
}

/** 축전지 규격 한 줄의 복사용 칸. */
export function batteryCopyCells(item: BatterySpecItem): string[] {
  return [
    item.erpName || "",
    item.address || "",
    String(item.capacity || 0),
    String(item.quantity || 0),
    item.stationName || "",
    dateOnly(item.createdAt),
  ];
}

/** 머리글과 행 전체를 TSV로 잇는다. */
export function buildTableTsv(headers: readonly string[], rows: string[][]): string {
  return [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n");
}

/**
 * 선택한 셀들을 감싸는 사각형을 TSV로 만든다. 선택하지 않은 칸은 빈 칸으로 둔다.
 * 선택이 없으면 빈 문자열.
 */
export function buildSelectionTsv(
  selectedCells: Set<string>,
  getCellValue: (row: number, col: number) => string,
): string {
  if (selectedCells.size === 0) return "";

  const coords = Array.from(selectedCells).map((key) => {
    const [r, c] = key.split(",").map(Number);
    return { r, c };
  });
  const minRow = Math.min(...coords.map((o) => o.r));
  const maxRow = Math.max(...coords.map((o) => o.r));
  const minCol = Math.min(...coords.map((o) => o.c));
  const maxCol = Math.max(...coords.map((o) => o.c));

  const grid: string[][] = [];
  for (let r = minRow; r <= maxRow; r++) {
    const rowArr: string[] = [];
    for (let c = minCol; c <= maxCol; c++) {
      rowArr.push(coords.some((o) => o.r === r && o.c === c) ? getCellValue(r, c) : "");
    }
    grid.push(rowArr);
  }
  return grid.map((row) => row.join("\t")).join("\n");
}

/** 드래그 시작과 끝 셀이 이루는 사각형 안의 셀 키 집합. */
export function cellRangeKeys(
  start: { r: number; c: number },
  end: { r: number; c: number },
): Set<string> {
  const keys = new Set<string>();
  for (let r = Math.min(start.r, end.r); r <= Math.max(start.r, end.r); r++) {
    for (let c = Math.min(start.c, end.c); c <= Math.max(start.c, end.c); c++) {
      keys.add(`${r},${c}`);
    }
  }
  return keys;
}

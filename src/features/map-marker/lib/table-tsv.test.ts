import { describe, expect, it } from "vitest";
import type { InfoRow } from "@/features/map-marker/lib/marker-detail-rows";
import type { BatterySpecItem } from "@/features/map-marker/types/marker";
import {
  BATTERY_TABLE_HEADERS,
  EQUIPMENT_TABLE_HEADERS,
  batteryCopyCells,
  buildSelectionTsv,
  buildTableTsv,
  cellRangeKeys,
  dateOnly,
  equipmentCopyCells,
} from "./table-tsv";

describe("buildSelectionTsv", () => {
  const getCellValue = (r: number, c: number) => `R${r}C${c}`;

  it("선택하지 않은 칸은 빈 칸으로 채워 사각형으로 만든다", () => {
    expect(buildSelectionTsv(new Set(["0,0", "1,1"]), getCellValue)).toBe("R0C0\t\n\tR1C1");
  });

  it("선택이 없으면 빈 문자열이다", () => {
    expect(buildSelectionTsv(new Set(), getCellValue)).toBe("");
  });

  it("드래그로 고른 사각형은 탭·줄바꿈으로 이어 붙인다", () => {
    const keys = cellRangeKeys({ r: 0, c: 1 }, { r: 1, c: 2 });
    expect(buildSelectionTsv(keys, getCellValue)).toBe("R0C1\tR0C2\nR1C1\tR1C2");
  });
});

describe("cellRangeKeys", () => {
  it("시작과 끝을 어느 방향으로 잡아도 같은 칸을 고른다", () => {
    const forward = cellRangeKeys({ r: 0, c: 0 }, { r: 1, c: 1 });
    const backward = cellRangeKeys({ r: 1, c: 1 }, { r: 0, c: 0 });
    expect([...forward].sort()).toEqual(["0,0", "0,1", "1,0", "1,1"]);
    expect([...backward].sort()).toEqual([...forward].sort());
  });

  it("같은 칸이면 그 칸 하나만 고른다", () => {
    expect([...cellRangeKeys({ r: 2, c: 3 }, { r: 2, c: 3 })]).toEqual(["2,3"]);
  });
});

describe("buildTableTsv", () => {
  it("머리글과 행을 탭·줄바꿈으로 잇는다", () => {
    expect(buildTableTsv(["구분", "국소명"], [["단독", "A"]])).toBe("구분\t국소명\n단독\tA");
  });

  it("행이 없으면 머리글만 남긴다", () => {
    expect(buildTableTsv(["a", "b"], [])).toBe("a\tb");
  });
});

describe("dateOnly", () => {
  it("ISO 시각에서 날짜만 남기고, 값이 없으면 빈 문자열이다", () => {
    expect(dateOnly("2026-11-14T09:30:00Z")).toBe("2026-11-14");
    expect(dateOnly("2026-11-14")).toBe("2026-11-14");
    expect(dateOnly(null)).toBe("");
    expect(dateOnly(undefined)).toBe("");
  });
});

describe("복사용 칸", () => {
  it("장비 행은 머리글과 같은 순서·개수로 칸을 만든다", () => {
    const row = {
      facility_year: "2026",
      project_code: "P1",
      facility_code: "FC1",
      business_type: "신설",
      final_station_name: "최종",
      eq_type: "T",
      install_date: "2026-01-01T00:00:00Z",
      open_date: null,
    } as unknown as InfoRow;
    const cells = equipmentCopyCells(row, "대표");
    expect(cells).toEqual(["대표", "2026", "P1", "FC1", "신설", "최종", "T", "2026-01-01", ""]);
    expect(cells).toHaveLength(EQUIPMENT_TABLE_HEADERS.length);
  });

  it("값이 없는 장비 행은 빈 칸으로 채운다", () => {
    const cells = equipmentCopyCells({} as InfoRow, "");
    expect(cells).toEqual(["", "", "", "", "", "", "", "", ""]);
  });

  it("축전지 행은 머리글과 같은 순서·개수로 칸을 만들고 숫자는 0을 기본으로 한다", () => {
    const item = {
      erpName: "ERP",
      address: "주소",
      capacity: 0,
      quantity: undefined,
      stationName: "국소",
      createdAt: "2026-02-03T00:00:00Z",
    } as unknown as BatterySpecItem;
    const cells = batteryCopyCells(item);
    expect(cells).toEqual(["ERP", "주소", "0", "0", "국소", "2026-02-03"]);
    expect(cells).toHaveLength(BATTERY_TABLE_HEADERS.length);
  });
});

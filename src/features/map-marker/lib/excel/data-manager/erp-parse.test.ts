import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { parseErpSheet, pickDateByColumns } from "./erp-parse";
import { ERP_DATE_COLUMNS } from "./erp-columns";

describe("parseErpSheet", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("통합시설코드가 '끝'인 행에서 읽기를 멈춘다", async () => {
    // Node에는 FileReader가 없어 시트를 그대로 넘기는 대역을 쓴다.
    vi.stubGlobal(
      "FileReader",
      class {
        onload: ((event: { target: { result: unknown } }) => void) | null = null;
        readAsArrayBuffer(file: { data: ArrayBuffer }) {
          this.onload?.({ target: { result: file.data } });
        }
      },
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["통합시설코드", "국소명-최종", "주소(전체)"],
        ["A", "국소A", "광주 북구 운암동 1"],
        ["끝", "끝", "끝"],
        ["B", "국소B", "광주 북구 운암동 2"],
      ]),
      "일정관리",
    );
    const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const rows = await parseErpSheet({ data } as unknown as File);

    expect(rows.map((row) => row.facilityCode)).toEqual(["A"]);
  });
});

describe("pickDateByColumns", () => {
  it("공정관리 양식의 m/d/yy 날짜를 yyyy-mm-dd로 바꾼다", () => {
    const raw = { "장비 공사": "2/5/26", "시험 완료": "3/27/26" };
    expect(pickDateByColumns(raw, ERP_DATE_COLUMNS.installDate)).toBe("2026-02-05");
    expect(pickDateByColumns(raw, ERP_DATE_COLUMNS.openDate)).toBe("2026-03-27");
  });

  it("날짜가 아닌 값(불필요 등)은 빈 값으로 둔다", () => {
    const raw = { "장비 공사": "불필요", "시험 완료": null };
    expect(pickDateByColumns(raw, ERP_DATE_COLUMNS.installDate)).toBe("");
    expect(pickDateByColumns(raw, ERP_DATE_COLUMNS.openDate)).toBe("");
  });

  it("전용 열(장비설치·개통일)이 있으면 그 값이 우선한다", () => {
    const raw = { 장비설치: "2026-04-01", "장비 공사": "2/5/26", 개통일: "2026-05-02", "시험 완료": "3/27/26" };
    expect(pickDateByColumns(raw, ERP_DATE_COLUMNS.installDate)).toBe("2026-04-01");
    expect(pickDateByColumns(raw, ERP_DATE_COLUMNS.openDate)).toBe("2026-05-02");
  });
});

import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseLookupExcel } from "./lookup-excel";

function makeFile(rows: unknown[][]): File {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([data], "inventory.xlsx");
}

describe("parseLookupExcel", () => {
  it("첫 시트를 헤더별 셀 값과 소문자 검색 텍스트로 바꾼다", async () => {
    const rows = await parseLookupExcel(
      makeFile([
        ["자재코드", "바코드", "품명"],
        ["M-001", "BC-9", "Fan Unit"],
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].cells).toEqual({ 자재코드: "M-001", 바코드: "BC-9", 품명: "Fan Unit" });
    expect(rows[0].text).toBe("m-001 bc-9 fan unit");
  });

  it("값이 모두 빈 행은 건너뛴다", async () => {
    const rows = await parseLookupExcel(
      makeFile([
        ["자재코드", "품명"],
        ["", ""],
        ["M-002", "Cable"],
      ]),
    );
    expect(rows.map((row) => row.cells["자재코드"])).toEqual(["M-002"]);
  });

  it("행이 하나도 없는 파일은 오류를 던진다", async () => {
    await expect(parseLookupExcel(makeFile([]))).rejects.toThrow("빈 엑셀 파일입니다.");
  });
});

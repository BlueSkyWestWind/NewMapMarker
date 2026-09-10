import * as XLSX from "xlsx";
import type { LookupRow } from "@/features/barcode/types/barcode";

/**
 * 재고 엑셀(자재수불부 등)을 읽어 행마다 전체 셀을 이어붙인 검색용 텍스트와
 * 헤더별 셀 값을 만든다. 파일은 브라우저 안에서만 처리하고 서버로 보내지 않는다.
 */
export async function parseLookupExcel(file: File): Promise<LookupRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  if (!raw.length) throw new Error("빈 엑셀 파일입니다.");

  const headers = raw[0].map((h) => String(h ?? "").trim());
  return raw
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => {
      const cells: Record<string, string> = {};
      headers.forEach((header, i) => {
        const cell = row[i];
        cells[header] = cell === undefined || cell === null ? "" : String(cell).trim();
      });
      return {
        text: row.join(" ").toLowerCase(),
        cells,
      };
    });
}

/**
 * 헤더에 `mustInclude`를 포함하고(`mustExclude`는 제외한) 첫 컬럼 값을 찾는다.
 * 예: "바코드"를 포함하되 "여부"(Y/N 플래그 컬럼)는 제외 — 스프레드시트 헤더
 * 표현이 조금 달라도 같은 방식으로 옳은 컬럼을 찾는다.
 */
export function pickLookupField(
  cells: Record<string, string>,
  mustInclude: string,
  mustExclude?: string,
): string {
  for (const key of Object.keys(cells)) {
    if (key.includes(mustInclude) && (!mustExclude || !key.includes(mustExclude)) && cells[key]) {
      return cells[key];
    }
  }
  return "";
}

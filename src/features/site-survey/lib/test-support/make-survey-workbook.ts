// 테스트 전용: 메모리에서 합성 실사서 워크북을 만든다. 테스트에서만 import한다.

import * as XLSX from "xlsx";

export interface SurveyWorkbookSpec {
  /** A1 주소 → 값 (예: `"A5": "1. 일반현황"`) */
  cells: Record<string, string>;
  /** 병합 범위 (예: `"S6:Y6"`) */
  merges?: string[];
}

export function makeSurveyWorkbook(spec: SurveyWorkbookSpec): XLSX.WorkBook {
  const ws: XLSX.WorkSheet = {};
  let maxRow = 0;
  let maxCol = 0;
  for (const [addr, value] of Object.entries(spec.cells)) {
    ws[addr] = { t: "s", v: value };
    const { r, c } = XLSX.utils.decode_cell(addr);
    maxRow = Math.max(maxRow, r);
    maxCol = Math.max(maxCol, c);
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
  if (spec.merges?.length) ws["!merges"] = spec.merges.map((m) => XLSX.utils.decode_range(m));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "현장조사서");
  return wb;
}

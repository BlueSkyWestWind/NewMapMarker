// 실사서 xlsx 읽기. 좌표가 아니라 섹션 + 라벨 글자로 값을 찾는다(파일마다 행 수가 다르다).
// 읽은 뒤에는 값 색인(행·열→글자)과 병합 정보만 남기고 파싱된 워크북은 버린다(메모리).

import type * as XLSX from "xlsx";
import { FIELD_BY_ID } from "../constants/survey-fields";
import type { NoteItem, SourceRef, SurveyDoc, SurveyIds } from "../types";

export class SurveyFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SurveyFormatError";
  }
}

interface Merge {
  sr: number;
  sc: number;
  er: number;
  ec: number;
}

interface Grid {
  /** 행 → (열 → 글자). 값이 있는 칸만 */
  rows: Map<number, Map<number, string>>;
  merges: Merge[];
}

const norm = (s: string): string => s.replace(/\s+/g, "");
const NOTE_LABEL = /^기타\d+$/;
const PHOTO_HEADER = "현장조사사진";
const SECTION_TITLE = /^(\d)\.\s/;

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function buildGrid(ws: XLSX.WorkSheet): Grid {
  const rows = new Map<number, Map<number, string>>();
  for (const key of Object.keys(ws)) {
    if (key.startsWith("!")) continue;
    const m = /^([A-Z]+)(\d+)$/.exec(key);
    if (!m) continue;
    const cell = ws[key] as XLSX.CellObject | undefined;
    if (!cell || cell.v === undefined || cell.v === null) continue;
    const text = String(cell.w ?? cell.v).trim();
    if (text === "") continue;
    const r = Number(m[2]) - 1;
    const c = colIndex(m[1]);
    let row = rows.get(r);
    if (!row) rows.set(r, (row = new Map()));
    row.set(c, text);
  }
  const merges: Merge[] = (ws["!merges"] ?? []).map((x) => ({ sr: x.s.r, sc: x.s.c, er: x.e.r, ec: x.e.c }));
  return { rows, merges };
}

class IndexedSurveyDoc implements SurveyDoc {
  private readonly sectionStart = new Map<number, number>();
  private readonly photoRow: number;
  private readonly sortedRows: number[];

  constructor(
    readonly fileName: string,
    private readonly grid: Grid,
  ) {
    this.sortedRows = [...grid.rows.keys()].sort((a, b) => a - b);
    let photo = Infinity;
    for (const r of this.sortedRows) {
      const cells = grid.rows.get(r)!;
      if (cells.has(0)) {
        const m = SECTION_TITLE.exec(cells.get(0)!);
        if (m && !this.sectionStart.has(Number(m[1]))) this.sectionStart.set(Number(m[1]), r);
      }
      for (const text of cells.values()) {
        if (norm(text) === PHOTO_HEADER && r < photo) photo = r;
      }
    }
    this.photoRow = photo;
  }

  /** 양식 판별: 현장조사서 제목과 `1. 일반현황`이 있는가 */
  isSurveyForm(): boolean {
    const hasTitle = this.sortedRows.some((r) =>
      [...this.grid.rows.get(r)!.values()].some((t) => norm(t).includes("현장조사서")),
    );
    const startRow = this.sectionStart.get(1);
    const hasGeneral = startRow !== undefined && norm(this.grid.rows.get(startRow)!.get(0) ?? "").includes("일반현황");
    return hasTitle && hasGeneral;
  }

  private sectionRange(section: number): [number, number] | null {
    const start = this.sectionStart.get(section);
    if (start === undefined) return null;
    const starts = [...this.sectionStart.values()].sort((a, b) => a - b);
    const next = starts.find((r) => r > start) ?? Infinity;
    return [start, Math.min(next, this.photoRow)];
  }

  private sectionOfRow(row: number): number {
    let best = 0;
    let bestRow = -1;
    for (const [section, start] of this.sectionStart) {
      if (start <= row && start > bestRow) {
        best = section;
        bestRow = start;
      }
    }
    return best;
  }

  private findLabel(ref: SourceRef): { row: number; col: number } | null {
    const range = this.sectionRange(ref.section);
    if (!range) return null;
    const want = norm(ref.label);
    let seen = 0;
    const nth = ref.nth ?? 0;
    for (const r of this.sortedRows) {
      if (r < range[0] || r >= range[1]) continue;
      const cells = this.grid.rows.get(r)!;
      for (const c of [...cells.keys()].sort((a, b) => a - b)) {
        if (norm(cells.get(c)!) !== want) continue;
        if (seen === nth) return { row: r, col: c };
        seen += 1;
      }
    }
    return null;
  }

  private mergeAt(row: number, col: number): Merge {
    return this.grid.merges.find((m) => m.sr === row && m.sc === col) ?? { sr: row, sc: col, er: row, ec: col };
  }

  /** 라벨의 병합 끝 다음 칸부터 같은 줄의 첫 값. 값이 또 다른 `기타N` 라벨이면 값 없음 */
  private rightOf(row: number, col: number, isNoteLabel: boolean): string {
    const merge = this.mergeAt(row, col);
    const cells = this.grid.rows.get(row);
    if (!cells) return "";
    const next = [...cells.keys()].filter((c) => c > merge.ec).sort((a, b) => a - b)[0];
    if (next === undefined) return "";
    const value = cells.get(next)!;
    if (isNoteLabel && NOTE_LABEL.test(norm(value))) return "";
    return value;
  }

  has(source: SourceRef): boolean {
    return this.findLabel(source) !== null;
  }

  get(source: SourceRef): string {
    const pos = this.findLabel(source);
    if (!pos) return "";
    if (source.direction === "below") {
      const merge = this.mergeAt(pos.row, pos.col);
      return this.grid.rows.get(merge.er + 1)?.get(pos.col) ?? "";
    }
    return this.rightOf(pos.row, pos.col, NOTE_LABEL.test(norm(source.label)));
  }

  notes(): NoteItem[] {
    const firstSection = Math.min(...this.sectionStart.values());
    const out: NoteItem[] = [];
    for (const r of this.sortedRows) {
      if (r >= this.photoRow || r < firstSection) continue;
      const cells = this.grid.rows.get(r)!;
      for (const c of [...cells.keys()].sort((a, b) => a - b)) {
        const label = norm(cells.get(c)!);
        if (!NOTE_LABEL.test(label)) continue;
        const value = this.rightOf(r, c, true);
        if (value === "") continue;
        out.push({ section: this.sectionOfRow(r), label, value });
      }
    }
    return out;
  }

  ids(): SurveyIds {
    return {
      year: this.get(FIELD_BY_ID.year.sources.main),
      project: this.get(FIELD_BY_ID.project.sources.main),
      facilityCode: this.get(FIELD_BY_ID.facilityCode.sources.main),
    };
  }
}

export function parseSurveyWorkbook(workbook: XLSX.WorkBook, fileName: string): SurveyDoc {
  const sheetName = workbook.SheetNames[0];
  const ws = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!ws) throw new SurveyFormatError("시트가 없습니다");
  const doc = new IndexedSurveyDoc(fileName, buildGrid(ws));
  if (!doc.isSurveyForm()) throw new SurveyFormatError("현장실사서 양식이 아닙니다");
  return doc;
}

export async function readSurveyFile(file: File): Promise<SurveyDoc> {
  const XLSXLib = await import("xlsx");
  const workbook = XLSXLib.read(await file.arrayBuffer(), { type: "array" });
  return parseSurveyWorkbook(workbook, file.name);
}

/** 여러 파일을 풀(기본 4개씩 병렬)로 읽는다. 결과는 입력 순서, 실패한 파일은 errors에만 담는다 */
export async function readSurveyFiles(
  files: File[],
  concurrency = 4,
  reader: (file: File) => Promise<SurveyDoc> = readSurveyFile,
): Promise<{ docs: SurveyDoc[]; errors: { name: string; message: string }[] }> {
  const results: (SurveyDoc | { name: string; message: string })[] = new Array(files.length);
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const i = next++;
      try {
        results[i] = await reader(files[i]);
      } catch (e) {
        results[i] = { name: files[i].name, message: e instanceof Error ? e.message : String(e) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  const docs: SurveyDoc[] = [];
  const errors: { name: string; message: string }[] = [];
  for (const r of results) {
    if ("fileName" in r) docs.push(r);
    else errors.push(r);
  }
  return { docs, errors };
}

export function filterSurveyFiles(files: File[]): {
  accepted: File[];
  skipped: { name: string; reason: "temp" | "not-xlsx" }[];
} {
  const accepted: File[] = [];
  const skipped: { name: string; reason: "temp" | "not-xlsx" }[] = [];
  for (const file of files) {
    if (file.name.startsWith("~$")) skipped.push({ name: file.name, reason: "temp" });
    else if (!file.name.toLowerCase().endsWith(".xlsx")) skipped.push({ name: file.name, reason: "not-xlsx" });
    else accepted.push(file);
  }
  return { accepted, skipped };
}

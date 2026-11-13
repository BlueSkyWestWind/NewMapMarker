// 정답 대조(수동): 실사서 xlsx를 읽어 만든 값을 세부 시트에 이미 입력된 값과 비교한다.
// 실행: SURVEY_GOLDEN_DIR="폴더1;폴더2" SURVEY_GOLDEN_XLSB="공정 파일.xlsb" npx vitest run build-rows.golden
// 환경변수가 없으면 건너뛴다. 실사서 원본은 저장소에 올리지 않는다.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../constants/default-settings";
import { DETAIL_COLUMNS } from "../constants/detail-columns";
import { FIELD_BY_ID, FIELD_RULES } from "../constants/survey-fields";
import type { BuiltRow, FieldId } from "../types";
import { buildRow, defaultEnabledFields } from "./build-rows";
import { filterSurveyFiles, parseSurveyWorkbook } from "./parse-survey";

const DIRS = process.env.SURVEY_GOLDEN_DIR;
const XLSB = process.env.SURVEY_GOLDEN_XLSB;

interface Sample {
  fileName: string;
  inbuilding: boolean;
  row: BuiltRow;
  sheetRow: unknown[] | undefined;
}

function loadSamples(): Sample[] {
  const books = XLSX.read(readFileSync(XLSB!), { type: "buffer", sheets: ["세부_26년"], dense: true });
  const sheetRows = (books.Sheets["세부_26년"] as unknown as { "!data": ({ v?: unknown }[] | undefined)[] })["!data"];
  const lookup = new Map<string, unknown[]>();
  for (let i = 6; i < sheetRows.length; i++) {
    const r = (sheetRows[i] ?? []).map((c) => c?.v ?? "");
    lookup.set(`${String(r[1]).trim()}|${String(r[2]).trim()}`, r);
  }

  const enabled = defaultEnabledFields(DEFAULT_SETTINGS);
  const samples: Sample[] = [];
  for (const dir of DIRS!.split(";").filter(existsSync)) {
    // 이름으로만 걸러 xlsx를 고르고, 큰 파일(실사서는 수백 KB)은 읽지 않는다
    const names = readdirSync(dir).map((name) => new File([], name));
    for (const file of filterSurveyFiles(names).accepted) {
      const path = join(dir, file.name);
      if (statSync(path).size > 5_000_000) continue;
      let doc;
      try {
        doc = parseSurveyWorkbook(XLSX.read(readFileSync(path), { type: "buffer" }), file.name);
      } catch {
        continue; // 실사서가 아닌 엑셀은 건너뛴다
      }
      const row = buildRow(doc, DEFAULT_SETTINGS, enabled);
      const key = `${row.cells[1]}|${row.cells[2]}`;
      samples.push({
        fileName: file.name,
        inbuilding: row.fields.find((f) => f.id === "method")?.raw === "인빌딩",
        row,
        sheetRow: lookup.get(key),
      });
    }
  }
  return samples;
}

/** 세부 시트에 값이 있는 행만 비교해 칸별 일치 수를 센다 */
function tally(samples: Sample[], id: FieldId, include: (s: Sample) => boolean = () => true) {
  const column = FIELD_BY_ID[id].column;
  let match = 0;
  let total = 0;
  const diffs: string[] = [];
  for (const s of samples) {
    if (!include(s) || !s.sheetRow) continue;
    const expected = String(s.sheetRow[column] ?? "").trim();
    if (expected === "") continue;
    total += 1;
    const actual = (s.row.cells[column] ?? "").trim();
    if (actual === expected) match += 1;
    else diffs.push(`${s.fileName}: 정답 "${expected}" / 결과 "${actual}"`);
  }
  return { match, total, diffs };
}

describe.skipIf(!DIRS || !XLSB)("정답 대조 (수동)", () => {
  // describe 본문은 건너뛸 때도 실행되므로 beforeAll에서 읽는다
  let samples: Sample[] = [];
  beforeAll(() => {
    samples = loadSamples();
  });
  const notInbuilding = (s: Sample) => !s.inbuilding;
  const columns: { id: FieldId; min: number; include?: (s: Sample) => boolean }[] = [
    { id: "method", min: 10 },
    { id: "mokuk", min: 11 },
    { id: "scanStation", min: 11 },
    { id: "towerType", min: 11 },
    { id: "equipPlace", min: 11 },
    // 인빌딩은 철탑 규격·공중선 형상을 원본값으로 쓰므로 뺀다. 공중선 형상은 수완포레 3건(1S·3S 입력)이 다른 것이 정상
    { id: "towerSpec", min: 10, include: notInbuilding },
    { id: "antennaShape", min: 7, include: notInbuilding },
  ];

  it("실사서를 읽었다", () => {
    expect(samples.length).toBeGreaterThan(0);
  });

  it("칸별 일치율(표를 출력한다)", () => {
    const table = columns.map(({ id, include }) => {
      const t = tally(samples, id, include);
      return { 칸: DETAIL_COLUMNS[FIELD_BY_ID[id].column].header, 일치: `${t.match}/${t.total}`, 차이: t.diffs.join(" ; ") };
    });
    console.table(table);
    for (const { id, min, include } of columns) {
      expect(tally(samples, id, include).match, id).toBeGreaterThanOrEqual(min);
    }
  });

  it("확실 16칸이 수완포레·아트박스에서 모두 일치한다", () => {
    const sure = FIELD_RULES.filter((r) => r.group === "sure").map((r) => r.id);
    const target = (s: Sample) => /수완포레|아트박스/.test(s.fileName);
    const mismatches = sure.flatMap((id) => tally(samples, id, target).diffs.map((d) => `${id}: ${d}`));
    expect(mismatches).toEqual([]);
  });
});

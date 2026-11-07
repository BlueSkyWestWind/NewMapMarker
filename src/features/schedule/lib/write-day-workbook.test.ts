import { describe, expect, it } from "vitest";
import { DAY_COLUMNS } from "./day-columns";
import { DAY_COLUMN_KEYS, type DayValues, type OptionLists } from "./day-types";
import { OPTION_LIST_SEEDS } from "./option-lists";
import { toExcelSerial } from "./schedule-excel";
import { archiveFileName, buildSheetWorkbook, dayFileName } from "./write-day-workbook";

function makeRow(overrides: Partial<DayValues> = {}): DayValues {
  const base = Object.fromEntries(DAY_COLUMN_KEYS.map((key) => [key, ""])) as DayValues;
  return { ...base, ...overrides };
}

const LISTS: OptionLists = {
  ...OPTION_LIST_SEEDS,
  equipment: ["이동식크레인,굴착기", "굴착기", "고소작업차"],
};

const ROWS: DayValues[] = [
  makeRow({ seq: "7", site: "국소A", workDate: "2026-11-09", address: "서울 중구", equipment: "이동식크레인,굴착기" }),
  makeRow({ seq: "9", site: "국소B", workDate: "2026-11-10" }),
];

async function roundTrip(rows: readonly DayValues[], lists: OptionLists = LISTS) {
  const wb = await buildSheetWorkbook({ sheetName: "2026-11-09", rows, lists });
  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default ?? excelModule;
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  return loaded;
}

describe("buildSheetWorkbook", () => {
  it("시트는 sheetName 하나와 숨김 시트 목록이다", async () => {
    const wb = await roundTrip(ROWS);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["2026-11-09", "목록"]);
    expect(wb.getWorksheet("2026-11-09")?.state).toBe("visible");
    expect(wb.getWorksheet("목록")?.state).toBe("hidden");
  });

  it("1행은 비고, 2행이 24열 머리글, 데이터는 3행부터이며 높이가 맞다", async () => {
    const ws = (await roundTrip(ROWS)).getWorksheet("2026-11-09")!;
    expect(ws.getRow(1).height).toBe(26.25);
    expect(ws.getRow(2).height).toBe(42);
    expect(ws.getRow(3).height).toBe(24.95);
    expect(ws.getRow(4).height).toBe(24.95);
    expect(ws.getRow(1).getCell(1).value ?? null).toBeNull();
    DAY_COLUMNS.forEach((column, index) => {
      expect(ws.getCell(2, index + 1).value).toBe(column.header);
    });
    expect(ws.getCell("I3").value).toBe("국소A");
    expect(ws.getCell("I4").value).toBe("국소B");
  });

  it("머리글은 굵은 11pt 뫼비우스 Regular, 가운데 정렬이다", async () => {
    const ws = (await roundTrip(ROWS)).getWorksheet("2026-11-09")!;
    const cell = ws.getCell("A2");
    expect(cell.font?.name).toBe("뫼비우스 Regular");
    expect(cell.font?.size).toBe(11);
    expect(cell.font?.bold).toBe(true);
    expect(cell.alignment?.horizontal).toBe("center");
  });

  it("머리글 바탕은 A~W ECEEF0, X는 E2EFDA이다", async () => {
    const ws = (await roundTrip(ROWS)).getWorksheet("2026-11-09")!;
    DAY_COLUMNS.forEach((column, index) => {
      const fill = ws.getCell(2, index + 1).fill as { fgColor?: { argb?: string } };
      expect(fill.fgColor?.argb, column.letter).toBe(column.letter === "X" ? "FFE2EFDA" : "FFECEEF0");
    });
  });

  it("틀 고정 9열·2행, 보기 배율 80, 열 폭이 DAY_COLUMNS와 같다", async () => {
    const ws = (await roundTrip(ROWS)).getWorksheet("2026-11-09")!;
    const view = ws.views[0] as { state?: string; xSplit?: number; ySplit?: number; zoomScale?: number };
    expect(view.state).toBe("frozen");
    expect(view.xSplit).toBe(9);
    expect(view.ySplit).toBe(2);
    expect(view.zoomScale).toBe(80);
    DAY_COLUMNS.forEach((column, index) => {
      expect(ws.getColumn(index + 1).width, column.letter).toBeCloseTo(column.widthChars, 2);
    });
  });

  it("작업일은 일련번호 숫자에 mm/dd 서식이고 순번은 1부터 다시 매긴다", async () => {
    // 만든 통합 문서에는 일련번호 숫자 그대로 들어 있다.
    const built = (await buildSheetWorkbook({ sheetName: "2026-11-09", rows: ROWS, lists: LISTS })).getWorksheet("2026-11-09")!;
    expect(built.getCell("K3").value).toBe(toExcelSerial("2026-11-09"));
    expect(built.getCell("K4").value).toBe(toExcelSerial("2026-11-10"));

    // 다시 읽으면 exceljs가 날짜 서식 숫자를 Date로 돌려준다. 일련번호로 되돌려 같은 값인지 본다.
    const ws = (await roundTrip(ROWS)).getWorksheet("2026-11-09")!;
    const EXCEL_SERIAL_OF_UNIX_EPOCH = 25569;
    const reread = ws.getCell("K3").value as Date;
    expect(reread.getTime() / 86_400_000 + EXCEL_SERIAL_OF_UNIX_EPOCH).toBe(toExcelSerial("2026-11-09"));
    expect(ws.getCell("K3").numFmt).toBe("mm/dd");
    expect(ws.getCell("A3").value).toBe(1);
    expect(ws.getCell("A4").value).toBe(2);
  });

  it("데이터 글꼴은 11pt 뫼비우스 Regular이고 순번 열만 14pt이다", async () => {
    const ws = (await roundTrip(ROWS)).getWorksheet("2026-11-09")!;
    expect(ws.getCell("I3").font?.name).toBe("뫼비우스 Regular");
    expect(ws.getCell("I3").font?.size).toBe(11);
    expect(ws.getCell("A3").font?.size).toBe(14);
  });

  it("테두리: 머리글 좌우·위 thin 아래 hair, 데이터 좌우 thin 위아래 hair", async () => {
    const ws = (await roundTrip(ROWS)).getWorksheet("2026-11-09")!;
    const head = ws.getCell("C2").border;
    expect(head?.left?.style).toBe("thin");
    expect(head?.right?.style).toBe("thin");
    expect(head?.top?.style).toBe("thin");
    expect(head?.bottom?.style).toBe("hair");
    const data = ws.getCell("C3").border;
    expect(data?.left?.style).toBe("thin");
    expect(data?.right?.style).toBe("thin");
    expect(data?.top?.style).toBe("hair");
    expect(data?.bottom?.style).toBe("hair");
  });

  it("국소명(I)·주소(L)는 왼쪽 정렬, 나머지는 가운데이고 맞춤 줄임이다", async () => {
    const ws = (await roundTrip(ROWS)).getWorksheet("2026-11-09")!;
    expect(ws.getCell("I3").alignment?.horizontal).toBe("left");
    expect(ws.getCell("L3").alignment?.horizontal).toBe("left");
    expect(ws.getCell("C3").alignment?.horizontal).toBe("center");
    expect(ws.getCell("K3").alignment?.horizontal).toBe("center");
    expect(ws.getCell("C3").alignment?.shrinkToFit).toBe(true);
  });

  it("숨김 시트 목록에 쉼표 값이 한 칸으로 들어 있고 유효성은 그 범위를 가리킨다", async () => {
    const wb = await roundTrip(ROWS);
    const lists = wb.getWorksheet("목록")!;
    const equipmentCells = [1, 2, 3].map((r) => lists.getCell(r, 22).value);
    expect(equipmentCells).toEqual(["이동식크레인,굴착기", "굴착기", "고소작업차"]);

    const ws = wb.getWorksheet("2026-11-09")!;
    const lastRow = Math.max(24, 2 + ROWS.length);
    const listColumns: Record<string, number> = {
      D: LISTS.bizClass.length,
      E: LISTS.bizKind.length,
      F: LISTS.constructionType.length,
      G: LISTS.workCategory.length,
      T: LISTS.workTime.length,
      U: LISTS.workType.length,
      V: LISTS.equipment.length,
      W: LISTS.workContent.length,
    };
    for (const [letter, count] of Object.entries(listColumns)) {
      for (const row of [3, 4, lastRow]) {
        const validation = ws.getCell(`${letter}${row}`).dataValidation;
        expect(validation?.type, `${letter}${row}`).toBe("list");
        expect(validation?.formulae, `${letter}${row}`).toEqual([`'목록'!$${letter}$1:$${letter}$${count}`]);
      }
      expect(ws.getCell(`${letter}${lastRow + 1}`).dataValidation?.type).toBeUndefined();
    }
    // 목록이 없는 열에는 유효성이 없다.
    expect(ws.getCell("I3").dataValidation?.type).toBeUndefined();
  });

  it("행이 24개를 넘으면 유효성이 마지막 행까지 이어진다", async () => {
    const many = Array.from({ length: 30 }, (_, i) => makeRow({ site: `국소${i}`, workDate: "2026-11-09" }));
    const ws = (await roundTrip(many)).getWorksheet("2026-11-09")!;
    expect(ws.getCell("V32").dataValidation?.type).toBe("list");
    expect(ws.getCell("V33").dataValidation?.type).toBeUndefined();
  });
});

describe("파일 이름", () => {
  it("일자별 파일은 yymmdd_시설일정_상세.xlsx", () => {
    expect(dayFileName("2026-11-09")).toBe("261109_시설일정_상세.xlsx");
  });

  it("누적 파일은 시설일정_누적_yymmdd.xlsx", () => {
    expect(archiveFileName("2026-11-07")).toBe("시설일정_누적_261107.xlsx");
  });
});

import { describe, expect, it } from "vitest";
import {
  archiveSearchText,
  buildPreviousInputPatches,
  latestPerStation,
  pickPreviousInput,
  rowsToArchive,
  shouldAutoArchive,
} from "./day-archive";
import type { DayRow } from "./day-rows";
import { DAY_COLUMN_KEYS, type ArchiveRow, type DayValues } from "./day-types";

function makeValues(overrides: Partial<DayValues> = {}): DayValues {
  const base = Object.fromEntries(DAY_COLUMN_KEYS.map((key) => [key, ""])) as DayValues;
  return { ...base, ...overrides };
}

function makeArchive(workDate: string, stationKey: string, overrides: Partial<DayValues> = {}): ArchiveRow {
  return {
    workDate,
    stationKey,
    site: stationKey,
    values: makeValues({ workDate, site: stationKey, ...overrides }),
    savedAt: "2026-11-01T00:00:00Z",
  };
}

describe("archiveSearchText", () => {
  it("국소명·프로젝트·통합시설코드를 공백으로 이은 소문자다", () => {
    const values = makeValues({ site: "동문동 RRU", project: "5G NR", facilityCode: "AB-123", address: "서울" });

    expect(archiveSearchText(values)).toBe("동문동 rru 5g nr ab-123");
  });
});

describe("rowsToArchive", () => {
  it("행마다 values를 복사하고 workDate·savedAt을 채운다", () => {
    const rows: DayRow[] = [
      { stationKey: "a", site: "A국소", values: makeValues({ site: "A국소", seq: "1" }), refSource: "erp" },
      { stationKey: "b", site: "B국소", values: makeValues({ site: "B국소", seq: "2" }), refSource: null },
    ];

    const result = rowsToArchive("2026-11-09", rows, "2026-11-08T09:00:00Z");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      workDate: "2026-11-09",
      stationKey: "a",
      site: "A국소",
      values: rows[0].values,
      savedAt: "2026-11-08T09:00:00Z",
    });
    expect(result[1].stationKey).toBe("b");
    expect(result[1].workDate).toBe("2026-11-09");
    expect(result[1].savedAt).toBe("2026-11-08T09:00:00Z");
  });

  it("values는 원본과 다른 객체다", () => {
    const rows: DayRow[] = [{ stationKey: "a", site: "A", values: makeValues({ site: "A" }), refSource: null }];

    const result = rowsToArchive("2026-11-09", rows, "t");
    rows[0].values.site = "바뀜";

    expect(result[0].values).not.toBe(rows[0].values);
    expect(result[0].values.site).toBe("A");
  });
});

describe("latestPerStation", () => {
  it("같은 국소의 여러 날 중 가장 최근 날짜를 고른다", () => {
    const rows = [
      makeArchive("2026-11-02", "a"),
      makeArchive("2026-11-09", "a"),
      makeArchive("2026-11-05", "a"),
      makeArchive("2026-11-03", "b"),
    ];

    const result = latestPerStation(rows);

    expect(result.size).toBe(2);
    expect(result.get("a")?.workDate).toBe("2026-11-09");
    expect(result.get("b")?.workDate).toBe("2026-11-03");
  });

  it("빈 목록은 빈 Map이다", () => {
    expect(latestPerStation([]).size).toBe(0);
  });
});

describe("pickPreviousInput", () => {
  it("비어 있지 않은 입력 열만 고른다", () => {
    const row = makeArchive("2026-11-02", "a", {
      workTime: "야간",
      workType: "",
      equipment: "이동식크레인,굴착기",
      workContent: "",
      workDetail: "상세",
      project: "5G",
    });

    expect(pickPreviousInput(row)).toEqual({
      workTime: "야간",
      equipment: "이동식크레인,굴착기",
      workDetail: "상세",
    });
  });

  it("모두 비어 있으면 빈 객체다", () => {
    expect(pickPreviousInput(makeArchive("2026-11-02", "a"))).toEqual({});
  });

  it("undefined면 빈 객체다", () => {
    expect(pickPreviousInput(undefined)).toEqual({});
  });
});

describe("shouldAutoArchive", () => {
  it("오늘과 앞으로의 날짜는 자동 저장한다", () => {
    expect(shouldAutoArchive("2026-11-08", "2026-11-08")).toBe(true);
    expect(shouldAutoArchive("2026-11-09", "2026-11-08")).toBe(true);
  });

  it("지난 날짜는 자동 저장하지 않는다", () => {
    expect(shouldAutoArchive("2026-11-07", "2026-11-08")).toBe(false);
    expect(shouldAutoArchive("2025-12-31", "2026-01-01")).toBe(false);
  });
});

describe("buildPreviousInputPatches", () => {
  const dayRow = (stationKey: string): DayRow => ({
    stationKey,
    site: `${stationKey}국소`,
    values: makeValues({ site: `${stationKey}국소` }),
    refSource: "erp",
  });

  it("이전 누적이 있는 행은 입력 열 패치를, 없는 행은 건너뜀으로 센다", () => {
    const rows = [dayRow("a"), dayRow("b"), dayRow("c")];
    const latest = new Map<string, ArchiveRow>([
      ["a", makeArchive("2026-11-02", "a", { workTime: "야간", workDetail: "상세" })],
      ["c", makeArchive("2026-11-03", "c", { equipment: "굴착기" })],
    ]);

    const result = buildPreviousInputPatches(rows, latest);

    expect(result.loaded).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.patches).toEqual([
      { station: rows[0], patch: { workTime: "야간", workDetail: "상세" } },
      { station: rows[2], patch: { equipment: "굴착기" } },
    ]);
  });

  it("누적 행이 있어도 입력 열이 모두 비어 있으면 건너뜀이다", () => {
    const rows = [dayRow("a")];
    const latest = new Map<string, ArchiveRow>([["a", makeArchive("2026-11-02", "a", { project: "5G" })]]);

    expect(buildPreviousInputPatches(rows, latest)).toEqual({ patches: [], loaded: 0, skipped: 1 });
  });

  it("행이 없으면 모두 0이다", () => {
    expect(buildPreviousInputPatches([], new Map())).toEqual({ patches: [], loaded: 0, skipped: 0 });
  });
});

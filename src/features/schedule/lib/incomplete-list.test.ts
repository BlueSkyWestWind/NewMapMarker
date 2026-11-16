import { describe, expect, it } from "vitest";
import {
  countInstalled,
  INCOMPLETE_LIMIT,
  incompleteCounts,
  installedDateOf,
  isRescheduled,
  selectIncomplete,
} from "@/features/schedule/lib/incomplete-list";
import type { ScheduleCell } from "@/features/schedule/types";

function cell(
  id: string,
  workDate: string,
  columnId: string,
  rowNo: number,
  mainText: string,
  rescheduledTo: string | null = null,
): ScheduleCell {
  return {
    id,
    workDate,
    columnId,
    rowNo,
    mainText,
    subText: "",
    textColor: null,
    result: {
      status: "undone",
      reason: "사유",
      rescheduledTo,
    },
  };
}

describe("isRescheduled", () => {
  it("rescheduledTo가 비어 있지 않으면 true, null·빈 문자열이면 false다", () => {
    expect(isRescheduled(cell("1", "2026-11-09", "col-a", 0, "국소1", null))).toBe(false);
    expect(isRescheduled(cell("2", "2026-11-09", "col-a", 0, "국소2", ""))).toBe(false);
    expect(isRescheduled(cell("3", "2026-11-09", "col-a", 0, "국소3", "2026-11-12"))).toBe(true);
  });
});

describe("selectIncomplete & incompleteCounts", () => {
  it("기본은 다시 잡은 건을 제외하고 includeRescheduled=true면 포함한다", () => {
    const cells = [
      cell("1", "2026-11-09", "col-a", 0, "국소A", null),
      cell("2", "2026-11-09", "col-a", 1, "국소B", "2026-11-12"),
    ];

    expect(
      selectIncomplete(cells, { includeRescheduled: false, excludedKeys: new Set() }).map(
        (c) => c.id,
      ),
    ).toEqual(["1"]);

    expect(
      selectIncomplete(cells, { includeRescheduled: true, excludedKeys: new Set() }).map(
        (c) => c.id,
      ),
    ).toEqual(["1", "2"]);
  });

  it("excludedKeys에 포함된 국소(정규화 기준)는 목록에서 뺀다", () => {
    const cells = [
      cell("1", "2026-11-09", "col-a", 0, "국소 A", null),
      cell("2", "2026-11-09", "col-a", 1, "국소B", null),
    ];

    expect(
      selectIncomplete(cells, { includeRescheduled: true, excludedKeys: new Set(["국소a"]) }).map(
        (c) => c.id,
      ),
    ).toEqual(["2"]);
  });

  it("날짜 내림차순 → 같은 날짜는 입력 순서 → rowNo 오름차순으로 정렬한다", () => {
    const cells = [
      cell("c1", "2026-11-10", "col-b", 0, "국소1"),
      cell("c2", "2026-11-12", "col-a", 1, "국소2"),
      cell("c3", "2026-11-12", "col-a", 0, "국소3"),
    ];

    expect(
      selectIncomplete(cells, { includeRescheduled: true, excludedKeys: new Set() }).map(
        (c) => c.id,
      ),
    ).toEqual(["c3", "c2", "c1"]);
  });

  it("columnOrder가 있으면 같은 날짜 안에서 팀 순서대로 묶고 팀 안에서는 행 번호 순이다", () => {
    const cells = [
      cell("b0", "2026-11-12", "col-b", 0, "국소1"),
      cell("a1", "2026-11-12", "col-a", 1, "국소2"),
      cell("a0", "2026-11-12", "col-a", 0, "국소3"),
      cell("old", "2026-11-10", "col-a", 0, "국소4"),
    ];
    const columnOrder = new Map([
      ["col-a", 0],
      ["col-b", 1],
    ]);

    expect(
      selectIncomplete(cells, {
        includeRescheduled: true,
        excludedKeys: new Set(),
        columnOrder,
      }).map((c) => c.id),
    ).toEqual(["a0", "a1", "b0", "old"]);
  });

  it("columnOrder에 없는 팀은 목록 뒤로 가고 그 안에서는 행 번호 순이다", () => {
    const cells = [
      cell("x1", "2026-11-12", "col-x", 1, "국소1"),
      cell("a0", "2026-11-12", "col-a", 5, "국소2"),
      cell("x0", "2026-11-12", "col-x", 0, "국소3"),
    ];

    expect(
      selectIncomplete(cells, {
        includeRescheduled: true,
        excludedKeys: new Set(),
        columnOrder: new Map([["col-a", 0]]),
      }).map((c) => c.id),
    ).toEqual(["a0", "x0", "x1"]);
  });

  it("incompleteCounts는 전체(total)와 아직 다시 안 잡은 건(open)을 센다", () => {
    const cells = [
      cell("1", "2026-11-09", "col-a", 0, "국소1", null),
      cell("2", "2026-11-09", "col-a", 1, "국소2", "2026-11-12"),
      cell("3", "2026-11-10", "col-a", 0, "국소3", null),
    ];
    expect(incompleteCounts(cells)).toEqual({ total: 3, open: 2 });
    expect(INCOMPLETE_LIMIT).toBe(500);
  });

  it("⑥ 시설 완료 칸은 기본으로 빠지고 includeInstalled=true면 보인다", () => {
    const cells = [
      cell("1", "2026-11-10", "col-a", 0, "국소A"),
      cell("2", "2026-11-10", "col-a", 1, "국소B"),
    ];
    const installedDates = new Map([["국소a", "2026-11-11"]]);

    expect(
      selectIncomplete(cells, {
        includeRescheduled: true,
        excludedKeys: new Set(),
        installedDates,
      }).map((c) => c.id),
    ).toEqual(["2"]);

    expect(
      selectIncomplete(cells, {
        includeRescheduled: true,
        excludedKeys: new Set(),
        installedDates,
        includeInstalled: true,
      }).map((c) => c.id),
    ).toEqual(["1", "2"]);
  });

  it("⑦ 시설일(2026-10-31)이 칸 날짜(2026-11-10)보다 앞이어도 시설 완료로 빠진다", () => {
    const cells = [
      cell("1", "2026-11-10", "col-a", 0, "국소A"),
      cell("2", "2026-11-10", "col-a", 1, "국소B"),
    ];
    const installedDates = new Map([["국소a", "2026-10-31"]]);

    expect(
      selectIncomplete(cells, {
        includeRescheduled: false,
        excludedKeys: new Set(),
        installedDates,
      }).map((c) => c.id),
    ).toEqual(["2"]);
  });

  it("⑧ 칸 글 정규화(공백·하이픈·대소문자)로 시설 완료 맵과 대조한다", () => {
    const cells = [
      cell("1", "2026-11-10", "col-a", 0, "국소 A-1"),
      cell("2", "2026-11-10", "col-a", 1, "국소B"),
    ];
    const installedDates = new Map([["국소a1", "2026-10-31"]]);

    expect(installedDateOf(cells[0], installedDates)).toBe("2026-10-31");
    expect(installedDateOf(cells[1], installedDates)).toBeNull();
    expect(
      selectIncomplete(cells, {
        includeRescheduled: true,
        excludedKeys: new Set(),
        installedDates,
      }).map((c) => c.id),
    ).toEqual(["2"]);
  });

  it("⑨ installedDates를 생략하면 시설 완료 필터링 없이 모두 남는다", () => {
    const cells = [
      cell("1", "2026-11-10", "col-a", 0, "국소A"),
      cell("2", "2026-11-10", "col-a", 1, "국소B"),
    ];

    expect(
      selectIncomplete(cells, {
        includeRescheduled: true,
        excludedKeys: new Set(),
      }).map((c) => c.id),
    ).toEqual(["1", "2"]);
  });

  it("⑩ countInstalled는 시설 완료로 숨겨지는 건수를 센다", () => {
    const cells = [
      cell("1", "2026-11-10", "col-a", 0, "국소 A"),
      cell("2", "2026-11-10", "col-a", 1, "국소B"),
      cell("3", "2026-11-10", "col-a", 2, "국소C"),
    ];
    const installedDates = new Map([
      ["국소a", "2026-10-31"],
      ["국소c", "2026-11-05"],
    ]);

    expect(countInstalled(cells, installedDates)).toBe(2);
    expect(
      cells.length -
        selectIncomplete(cells, {
          includeRescheduled: true,
          excludedKeys: new Set(),
          installedDates,
        }).length,
    ).toBe(2);
  });
});

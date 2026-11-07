import { describe, expect, it } from "vitest";
import type {
  ScheduleCell,
  ScheduleColumn,
  ScheduleDayNote,
  ScheduleMark,
} from "@/features/schedule/types";
import {
  buildMonthModel,
  computeMonthScale,
  estimateLines,
  monthEntryText,
  monthTeamLineText,
  monthWeekHeightPt,
  type MonthDay,
  type MonthTeam,
} from "./month-layout";

const COLUMNS: ScheduleColumn[] = [
  { id: "c1", sortOrder: 0, teamLabel: "1팀", leaderLabel: "팀장A" },
  { id: "c2", sortOrder: 1, teamLabel: "2팀", leaderLabel: "" },
];

function cell(
  workDate: string,
  columnId: string,
  rowNo: number,
  mainText: string,
  subText = "",
  textColor: ScheduleCell["textColor"] = null,
): ScheduleCell {
  return { id: `${workDate}-${columnId}-${rowNo}`, workDate, columnId, rowNo, mainText, subText, textColor };
}

describe("buildMonthModel", () => {
  const cells = [
    cell("2026-11-09", "c1", 1, "국소2"),
    cell("2026-11-09", "c1", 0, "국소1", "모국1", "0070C0"),
    cell("2026-11-09", "c2", 0, "국소3"),
    cell("2026-10-27", "c1", 0, "국소4"),
  ];
  const dayNotes: ScheduleDayNote[] = [{ workDate: "2026-11-09", note: "메모A" }];
  const marks: ScheduleMark[] = [
    { workDate: "2026-11-09", columnId: "c1", color: "D9F2D0" },
    { workDate: "2026-11-10", columnId: "c2", color: "4E95D9" },
  ];
  const model = buildMonthModel({ month: "2026-11", columns: COLUMNS, cells, dayNotes, marks });
  const allDays = model.weeks.flat();
  const day = (workDate: string) => allDays.find((entry) => entry.workDate === workDate)!;

  it("제목과 주 구성을 만든다(2026-11은 6주, 월요일 시작)", () => {
    expect(model.title).toBe("2026년 11월");
    expect(model.weeks).toHaveLength(6);
    expect(model.weeks.every((week) => week.length === 7)).toBe(true);
    expect(model.weeks[0][0].workDate).toBe("2026-10-26");
    expect(model.weeks[0][0].inMonth).toBe(false);
    expect(model.weeks[0][6].workDate).toBe("2026-11-01");
    expect(model.weeks[0][6].inMonth).toBe(true);
  });

  it("날짜마다 메모와 팀 줄(팀 순서, 항목은 행 순서)을 채운다", () => {
    const target = day("2026-11-09");
    expect(target.note).toBe("메모A");
    expect(target.teams.map((team) => team.label)).toEqual(["1팀", "2팀"]);
    expect(target.teams[0].markColor).toBe("D9F2D0");
    expect(target.teams[0].entries.map((entry) => entry.mainText)).toEqual(["국소1", "국소2"]);
    expect(target.teams[0].entries[0].textColor).toBe("0070C0");
    expect(target.teams[1].markColor).toBeNull();
  });

  it("달 밖 날짜의 일정도 그 날짜 칸에 보인다", () => {
    const outside = day("2026-10-27");
    expect(outside.inMonth).toBe(false);
    expect(outside.teams[0].entries[0].mainText).toBe("국소4");
  });

  it("색만 있고 항목이 없는 팀은 줄이 없다", () => {
    expect(day("2026-11-10").teams).toEqual([]);
  });

  it("2027-02는 4주다", () => {
    const feb = buildMonthModel({ month: "2027-02", columns: COLUMNS, cells: [], dayNotes: [], marks: [] });
    expect(feb.weeks).toHaveLength(4);
    expect(feb.title).toBe("2027년 2월");
  });
});

describe("monthEntryText / monthTeamLineText", () => {
  it("모국이 있으면 괄호로 붙인다", () => {
    expect(monthEntryText({ mainText: "국소1", subText: "모국1", textColor: null })).toBe("국소1 (모국1)");
    expect(monthEntryText({ mainText: "국소2", subText: "", textColor: null })).toBe("국소2");
    expect(monthEntryText({ mainText: "", subText: "스카이", textColor: null })).toBe("스카이");
  });

  it("팀 줄은 `팀 · 항목, 항목`이다", () => {
    const team: MonthTeam = {
      columnId: "c1",
      label: "1팀",
      markColor: null,
      entries: [
        { mainText: "국소1", subText: "모국1", textColor: null },
        { mainText: "국소2", subText: "", textColor: null },
      ],
    };
    expect(monthTeamLineText(team)).toBe("1팀 · 국소1 (모국1), 국소2");
  });
});

describe("estimateLines", () => {
  it("글자 수로 줄 수를 어림한다", () => {
    expect(estimateLines("")).toBe(1);
    expect(estimateLines("가".repeat(24))).toBe(1);
    expect(estimateLines("가".repeat(25))).toBe(2);
    expect(estimateLines("가".repeat(49))).toBe(3);
  });
});

function dayWithShortTeams(count: number): MonthDay {
  return {
    workDate: "2026-11-09",
    inMonth: true,
    note: "",
    teams: Array.from({ length: count }, (_, i) => ({
      columnId: `c${i}`,
      label: `${i}팀`,
      markColor: null,
      entries: [{ mainText: "국소", subText: "", textColor: null }],
    })),
  };
}

describe("monthWeekHeightPt", () => {
  const empty: MonthDay = { workDate: "2026-11-09", inMonth: true, note: "", teams: [] };

  it("일정이 없는 주는 최소 높이다", () => {
    expect(monthWeekHeightPt([empty])).toBe(60);
  });

  it("줄이 적으면 최소 높이가 이긴다", () => {
    expect(monthWeekHeightPt([dayWithShortTeams(2)])).toBe(60);
  });

  it("가장 바쁜 날의 줄 수가 높이를 정한다", () => {
    expect(monthWeekHeightPt([empty, dayWithShortTeams(8)])).toBe(114);
  });
});

describe("computeMonthScale", () => {
  const sixShortWeeks = Array(6).fill(60);
  const sixTallWeeks = Array(6).fill(300);

  it("A3는 100%까지 들어간다", () => {
    expect(computeMonthScale({ paper: "A3", weekHeightsPt: sixShortWeeks })).toBe(100);
  });

  it("A4는 폭이 제한한다", () => {
    expect(computeMonthScale({ paper: "A4", weekHeightsPt: sixShortWeeks })).toBe(78);
  });

  it("높이가 큰 주가 많으면 높이가 제한한다", () => {
    expect(computeMonthScale({ paper: "A4", weekHeightsPt: sixTallWeeks })).toBe(29);
    expect(computeMonthScale({ paper: "A3", weekHeightsPt: sixTallWeeks })).toBe(42);
  });

  it("아무리 커도 10% 밑으로 내려가지 않는다", () => {
    expect(computeMonthScale({ paper: "A3", weekHeightsPt: Array(6).fill(100000) })).toBe(10);
  });
});

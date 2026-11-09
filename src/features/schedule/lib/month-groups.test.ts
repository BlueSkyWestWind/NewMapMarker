import { describe, expect, it } from "vitest";
import { groupMonthTeams } from "@/features/schedule/lib/month-groups";
import type { MonthEntry, MonthTeam } from "@/features/schedule/lib/month-layout";

const entry = (id: string, mainText: string, subText = ""): MonthEntry => ({ id, mainText, subText, textColor: null });
const team = (columnId: string, label: string, entries: MonthEntry[]): MonthTeam => ({
  columnId,
  label,
  markColor: null,
  entries,
});

describe("groupMonthTeams", () => {
  it("목록이 순서만 다르고 같은 팀을 한 묶음으로 합치고, 보이는 목록은 첫 팀 순서를 따른다", () => {
    const groups = groupMonthTeams([
      team("c2", "2팀", [entry("a1", "A"), entry("a2", "B"), entry("a3", "", "입회 : 박")]),
      team("c3", "3팀", [entry("b1", "B"), entry("b2", "", "입회 : 박"), entry("b3", "A")]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].teams.map((t) => t.label)).toEqual(["2팀", "3팀"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["a1", "a2", "a3"]);
  });

  it("하나라도 다르면(입회자 등) 합치지 않고 팀 순서를 지킨다", () => {
    const groups = groupMonthTeams([
      team("c2", "2팀", [entry("a1", "A"), entry("a2", "", "입회 : 박")]),
      team("c3", "3팀", [entry("b1", "A"), entry("b2", "", "입회 : 김")]),
      team("c5", "5팀", [entry("c1", "A"), entry("c2", "", "입회 : 박")]),
    ]);
    expect(groups.map((g) => g.teams.map((t) => t.label))).toEqual([["2팀", "5팀"], ["3팀"]]);
  });

  it("같은 글이 한 팀에 두 번 있으면 개수까지 같아야 합친다", () => {
    const groups = groupMonthTeams([
      team("c2", "2팀", [entry("a1", "A"), entry("a2", "A")]),
      team("c3", "3팀", [entry("b1", "A")]),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("팀이 하나면 그대로 한 묶음이다", () => {
    const groups = groupMonthTeams([team("c2", "2팀", [entry("a1", "A")])]);
    expect(groups).toHaveLength(1);
    expect(groups[0].teams).toHaveLength(1);
  });
});

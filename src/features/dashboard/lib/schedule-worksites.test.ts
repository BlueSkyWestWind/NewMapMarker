import { describe, expect, it } from "vitest";
import type { SiteCandidate } from "@/features/worksite-weather/lib/site-search";
import type { SiteMatch } from "@/features/worksite-weather/types/weather";
import type { ScheduleCell } from "@/features/schedule/types";
import {
  matchScheduleStations,
  planScheduleSync,
  todayStationNames,
} from "./schedule-worksites";

const TODAY = "2026-11-09";
const YESTERDAY = "2026-11-08";

function candidate(id: string, name: string, extra: Partial<SiteCandidate> = {}): SiteCandidate {
  return {
    id,
    name,
    address: `${name} 주소`,
    stationName: "",
    lat: 35.1,
    lng: 126.8,
    siteAlias: null,
    workType: null,
    groupRole: null,
    parentMarkerId: null,
    ...extra,
  };
}

function cell(mainText: string, options: { workDate?: string; rowNo?: number } = {}): ScheduleCell {
  const workDate = options.workDate ?? TODAY;
  const rowNo = options.rowNo ?? 0;
  return {
    id: `${workDate}-${rowNo}-${mainText}`,
    workDate,
    columnId: "col-a",
    rowNo,
    mainText,
    subText: "",
    textColor: null,
  };
}

function site(id: string, extra: Partial<SiteMatch> = {}): SiteMatch {
  return {
    id,
    name: `국소 ${id}`,
    address: "",
    lat: 35,
    lng: 126,
    workType: "ground",
    matchedBy: "name",
    ...extra,
  };
}

describe("todayStationNames", () => {
  it("오늘 일정 칸의 국소·작업 글만 중복 없이 순서대로 모은다", () => {
    const cells = [
      cell("연등동L-RU1", { rowNo: 1 }),
      cell("가국소", { rowNo: 0 }),
      cell("가국소", { rowNo: 3 }),
      cell("다른날", { workDate: "2026-11-10" }),
      cell("", { rowNo: 4 }),
      cell("   ", { rowNo: 5 }),
    ];
    expect(todayStationNames(cells, TODAY)).toEqual(["가국소", "연등동L-RU1"]);
  });

  it("앞뒤 공백은 자른다", () => {
    expect(todayStationNames([cell("  가국소  ")], TODAY)).toEqual(["가국소"]);
  });
});

describe("matchScheduleStations", () => {
  it("장비 국소명·이름·별칭이 같으면 연결한다(공백·하이픈·대소문자 무시)", () => {
    const candidates = [
      candidate("m1", "표시이름1", { stationName: "연등동L-RRU1(B1)_이" }),
      candidate("m2", "광주 쌍촌역"),
      candidate("m3", "별칭국소", { siteAlias: "현장호칭, 다른호칭" }),
    ];
    const result = matchScheduleStations(
      ["연등동L RRU1(B1)_이", "광주쌍촌역", "현장호칭"],
      candidates,
    );
    expect(result.matches.map((match) => match.id)).toEqual(["m1", "m2", "m3"]);
    expect(result.matchedCount).toBe(3);
    expect(result.unmatched).toEqual([]);
  });

  it("연결되는 국소가 없거나 좌표가 없으면 제외하고 이름을 돌려준다", () => {
    const candidates = [
      candidate("m1", "있는국소"),
      candidate("m2", "좌표없음", { lat: Number.NaN, lng: Number.NaN }),
    ];
    const result = matchScheduleStations(["있는국소", "좌표없음", "수직생명줄"], candidates);
    expect(result.matches.map((match) => match.id)).toEqual(["m1"]);
    expect(result.matchedCount).toBe(1);
    expect(result.unmatched).toEqual(["좌표없음", "수직생명줄"]);
  });

  it("SiteMatch는 이름 일치(name)와 고소 여부를 담는다", () => {
    const [match] = matchScheduleStations(
      ["옥상국소"],
      [candidate("m1", "옥상국소", { workType: "elevated" })],
    ).matches;
    expect(match).toMatchObject({
      id: "m1",
      name: "옥상국소",
      address: "옥상국소 주소",
      lat: 35.1,
      lng: 126.8,
      workType: "elevated",
      matchedBy: "name",
    });
  });

  it("같은 이름이 여럿이면 SUB보다 대표·단독을 쓴다", () => {
    const candidates = [
      candidate("sub", "같은이름", { parentMarkerId: "rep", lat: 36, lng: 127 }),
      candidate("rep", "같은이름"),
    ];
    const result = matchScheduleStations(["같은이름"], candidates);
    expect(result.matches.map((match) => match.id)).toEqual(["rep"]);
  });

  it("SUB 국소는 대표 마커의 id·좌표·주소로 연결하되 이름은 SUB 이름을 쓴다", () => {
    const candidates = [
      candidate("rep", "대표국소", { address: "대표 주소", lat: 35.5, lng: 126.5 }),
      candidate("sub", "서브국소", { parentMarkerId: "rep", lat: 36, lng: 127 }),
    ];
    const [match] = matchScheduleStations(["서브국소"], candidates).matches;
    expect(match).toMatchObject({
      id: "rep",
      name: "서브국소",
      address: "대표 주소",
      lat: 35.5,
      lng: 126.5,
    });
  });

  it("같은 대표로 이어지는 국소가 여럿이어도 SiteMatch는 하나이고 일치 수는 그대로다", () => {
    const candidates = [
      candidate("rep", "대표국소"),
      candidate("sub1", "서브1", { parentMarkerId: "rep" }),
      candidate("sub2", "서브2", { parentMarkerId: "rep" }),
    ];
    const result = matchScheduleStations(["서브1", "서브2"], candidates);
    expect(result.matches).toHaveLength(1);
    expect(result.matchedCount).toBe(2);
  });
});

describe("planScheduleSync", () => {
  it("오늘 일정과 일치하는 국소를 오늘 날짜를 달아 추가한다", () => {
    const plan = planScheduleSync({ saved: [], matches: [site("a"), site("b")], today: TODAY, previous: null });
    expect(plan.changed).toBe(true);
    expect(plan.sites).toEqual([
      { ...site("a"), scheduleDate: TODAY },
      { ...site("b"), scheduleDate: TODAY },
    ]);
    expect(plan.sync).toEqual({ date: TODAY, ids: ["a", "b"] });
  });

  it("직접 담은 국소는 건드리지 않고 중복해서 넣지도 않는다", () => {
    const mine = site("a");
    const plan = planScheduleSync({ saved: [mine], matches: [site("a")], today: TODAY, previous: null });
    expect(plan.sites).toEqual([mine]);
    expect(plan.sites[0].scheduleDate).toBeUndefined();
  });

  it("지난 날짜로 자동 등록된 국소는 오늘 일정에 없으면 빼고, 있으면 오늘 날짜로 바꾼다", () => {
    const saved = [
      site("old", { scheduleDate: YESTERDAY }),
      site("keep", { scheduleDate: YESTERDAY }),
      site("mine"),
    ];
    const plan = planScheduleSync({ saved, matches: [site("keep")], today: TODAY, previous: null });
    expect(plan.sites.map((entry) => [entry.id, entry.scheduleDate])).toEqual([
      ["keep", TODAY],
      ["mine", undefined],
    ]);
  });

  it("같은 날 직접 뺀 국소는 다시 넣지 않고 새로 생긴 것만 추가한다", () => {
    const plan = planScheduleSync({
      saved: [{ ...site("a"), scheduleDate: TODAY }],
      matches: [site("a"), site("b"), site("c")],
      today: TODAY,
      previous: { date: TODAY, ids: ["a", "b"] },
    });
    expect(plan.sites.map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(plan.sync).toEqual({ date: TODAY, ids: ["a", "b", "c"] });
  });

  it("날짜가 바뀌면 이전 날의 기록은 무시하고 다시 넣는다", () => {
    const plan = planScheduleSync({
      saved: [],
      matches: [site("a")],
      today: TODAY,
      previous: { date: YESTERDAY, ids: ["a"] },
    });
    expect(plan.sites.map((entry) => entry.id)).toEqual(["a"]);
    expect(plan.sync).toEqual({ date: TODAY, ids: ["a"] });
  });

  it("바꿀 것이 없으면 changed가 false다", () => {
    const saved = [{ ...site("a"), scheduleDate: TODAY }];
    const plan = planScheduleSync({
      saved,
      matches: [site("a")],
      today: TODAY,
      previous: { date: TODAY, ids: ["a"] },
    });
    expect(plan.changed).toBe(false);
    expect(plan.sites).toBe(saved);
  });

  it("오늘 일정에 맞는 국소가 하나도 없어도 지난 자동 등록은 정리한다", () => {
    const saved = [site("old", { scheduleDate: YESTERDAY }), site("mine")];
    const plan = planScheduleSync({ saved, matches: [], today: TODAY, previous: null });
    expect(plan.changed).toBe(true);
    expect(plan.sites.map((entry) => entry.id)).toEqual(["mine"]);
    expect(plan.sync).toEqual({ date: TODAY, ids: [] });
  });
});

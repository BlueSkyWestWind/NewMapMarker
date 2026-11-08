import { describe, expect, it } from "vitest";

import { buildDayStations, NOTE_COLUMN_LABEL, stationKey } from "@/features/schedule/lib/day-stations";
import type { ScheduleCell, ScheduleColumn } from "@/features/schedule/types";

const DATE = "2026-11-09";

function column(id: string, sortOrder: number, team: string, leader: string): ScheduleColumn {
  return { id, sortOrder, teamLabel: team, leaderLabel: leader };
}

function cell(date: string, columnId: string, rowNo: number, main: string, sub = ""): ScheduleCell {
  return { id: `${date}-${columnId}-${rowNo}`, workDate: date, columnId, rowNo, mainText: main, subText: sub, textColor: null };
}

const COLUMNS: ScheduleColumn[] = [
  column("c1", 1, "1팀", "박경훈"),
  column("c3", 3, "3팀", "김삼"),
  column("c4", 4, "4팀", "이동화"),
  column("ct", 8, "시험팀", "시험장"),
  column("cs", 9, "실사&재하도급", "실사장"),
  column("cn", 10, NOTE_COLUMN_LABEL, "비고장"),
];

describe("stationKey", () => {
  it("공백을 모두 지우고 소문자로 바꾼다", () => {
    expect(stationKey(" (공동)강광고속 장암-RRU(F2) ")).toBe("(공동)강광고속장암-rru(f2)");
    expect(stationKey("AbC D")).toBe("abcd");
  });
});

describe("buildDayStations", () => {
  it("같은 국소가 여러 팀에 있으면 한 행으로 합치고 팀장을 모은다", () => {
    const stations = buildDayStations({
      workDate: DATE,
      columns: COLUMNS,
      cells: [
        cell(DATE, "c1", 0, "(공동)강광고속장암-RRU(F2)"),
        cell(DATE, "c4", 0, "(공동)강광고속장암-RRU(F2)"),
      ],
    });
    expect(stations).toHaveLength(1);
    expect(stations[0].site).toBe("(공동)강광고속장암-RRU(F2)");
    expect(stations[0].leaders).toEqual(["박경훈", "이동화"]);
  });

  it("공백·대소문자만 다른 이름은 합치고 site는 처음 나온 표기를 쓴다", () => {
    const stations = buildDayStations({
      workDate: DATE,
      columns: COLUMNS,
      cells: [
        cell(DATE, "c1", 0, "Seoul Site-RRU"),
        cell(DATE, "c4", 1, "seoulsite-rru"),
      ],
    });
    expect(stations).toHaveLength(1);
    expect(stations[0].site).toBe("Seoul Site-RRU");
    expect(stations[0].key).toBe(stationKey("Seoul Site-RRU"));
    expect(stations[0].leaders).toEqual(["박경훈", "이동화"]);
  });

  it("행 순서로 훑어 처음 나온 위치를 열 순서 → 행 순서로 정렬한다", () => {
    const stations = buildDayStations({
      workDate: DATE,
      columns: COLUMNS,
      cells: [
        cell(DATE, "c4", 0, "D국소"),
        cell(DATE, "c3", 2, "C국소"),
        cell(DATE, "c3", 0, "B국소"),
        cell(DATE, "c1", 3, "A국소"),
        cell(DATE, "c1", 1, "A2국소"),
      ],
    });
    expect(stations.map((s) => s.site)).toEqual(["A2국소", "A국소", "B국소", "C국소", "D국소"]);
  });

  it("행 순서에서 먼저 나온 열을 위치로 센다(3팀 0행, 1팀 4행)", () => {
    const stations = buildDayStations({
      workDate: DATE,
      columns: COLUMNS,
      cells: [
        cell(DATE, "c3", 0, "X국소"),
        cell(DATE, "c1", 4, "X국소"),
        cell(DATE, "c1", 5, "Y국소"),
      ],
    });
    // X국소는 3팀 0행이 처음 나온 위치(열 순서 3)라 1팀 5행의 Y국소 뒤에 온다.
    // 가장 앞 열(1팀 4행)로 세면 X국소가 Y국소 앞에 와서 이 순서가 깨진다.
    expect(stations.map((s) => s.site)).toEqual(["Y국소", "X국소"]);
    // 작업자는 발견 순서(행 → 열)라 3팀장이 먼저다.
    expect(stations[1].leaders).toEqual(["김삼", "박경훈"]);
  });

  it("입회자·신호수도 발견 순서(행 → 열)로 모은다", () => {
    const stations = buildDayStations({
      workDate: DATE,
      columns: COLUMNS,
      cells: [
        cell(DATE, "c3", 0, "X국소"),
        cell(DATE, "c1", 4, "X국소"),
        cell(DATE, "c1", 6, "", "입회 : 가1"),
        cell(DATE, "c1", 7, "", "신호수 : 나1"),
        cell(DATE, "c3", 6, "", "입회 : 가3"),
        cell(DATE, "c3", 7, "", "신호수 : 나3"),
        cell(DATE, "c4", 1, "X국소"),
        cell(DATE, "c4", 6, "", "입회 : 가4"),
        cell(DATE, "c4", 7, "", "신호수 : 나4"),
      ],
    });
    expect(stations).toHaveLength(1);
    expect(stations[0].leaders).toEqual(["김삼", "이동화", "박경훈"]);
    expect(stations[0].witnesses).toEqual(["가3", "가4", "가1"]);
    expect(stations[0].signalers).toEqual(["나3", "나4", "나1"]);
  });

  it("국소 칸이 공백뿐이면 빈 칸으로 보고 행을 만들지 않는다", () => {
    expect(
      buildDayStations({
        workDate: DATE,
        columns: COLUMNS,
        cells: [cell(DATE, "c1", 0, "   "), cell(DATE, "c3", 0, "\t")],
      }),
    ).toEqual([]);
  });

  it("비고 열은 제외하고 시험팀·실사&재하도급 열은 포함한다", () => {
    const stations = buildDayStations({
      workDate: DATE,
      columns: COLUMNS,
      cells: [
        cell(DATE, "cn", 0, "비고 국소"),
        cell(DATE, "ct", 0, "시험 국소"),
        cell(DATE, "cs", 0, "실사 국소"),
      ],
    });
    expect(stations.map((s) => s.site)).toEqual(["시험 국소", "실사 국소"]);
    expect(stations[0].leaders).toEqual(["시험장"]);
    expect(stations[1].leaders).toEqual(["실사장"]);
  });

  it("국소 칸이 빈 입회·신호수·메모 칸은 행이 되지 않고 그 국소를 맡은 팀의 입회자·신호수로 모인다", () => {
    const stations = buildDayStations({
      workDate: DATE,
      columns: COLUMNS,
      cells: [
        cell(DATE, "c1", 0, "A국소"),
        cell(DATE, "c1", 1, "", "스카이"),
        cell(DATE, "c1", 2, "", "입회 : 박민수"),
        cell(DATE, "c1", 3, "", "신호수 : 구삼남,구제신"),
        cell(DATE, "c4", 0, "A국소"),
        cell(DATE, "c4", 1, "", "입회 : 박민수, 최입회"),
        cell(DATE, "c4", 2, "", "신호수 : 구삼남"),
        cell(DATE, "c3", 0, "B국소"),
        cell(DATE, "c3", 1, "", "입회 : 다른사람"),
      ],
    });
    expect(stations.map((s) => s.site)).toEqual(["A국소", "B국소"]);
    expect(stations[0].witnesses).toEqual(["박민수", "최입회"]);
    expect(stations[0].signalers).toEqual(["구삼남", "구제신"]);
    expect(stations[1].witnesses).toEqual(["다른사람"]);
    expect(stations[1].signalers).toEqual([]);
  });

  it("다른 날짜의 칸은 무시하고 팀장 이름이 빈 열은 leaders에 넣지 않는다", () => {
    const stations = buildDayStations({
      workDate: DATE,
      columns: [column("c1", 1, "1팀", "박경훈"), column("c2", 2, "2팀", "  ")],
      cells: [
        cell("2026-11-10", "c1", 0, "다른날 국소"),
        cell("2026-11-10", "c1", 1, "", "입회 : 다른날"),
        cell(DATE, "c1", 0, "A국소"),
        cell(DATE, "c2", 0, "A국소"),
      ],
    });
    expect(stations).toHaveLength(1);
    expect(stations[0].leaders).toEqual(["박경훈"]);
    expect(stations[0].witnesses).toEqual([]);
  });

  it("국소가 하나도 없는 날은 빈 배열이다", () => {
    expect(
      buildDayStations({
        workDate: DATE,
        columns: COLUMNS,
        cells: [cell(DATE, "cn", 0, "비고 국소"), cell(DATE, "c1", 0, "", "입회 : 박민수")],
      }),
    ).toEqual([]);
    expect(buildDayStations({ workDate: DATE, columns: COLUMNS, cells: [] })).toEqual([]);
  });
});

describe("buildDayStations 입회·신호수 불필요", () => {
  const withFlag = (flag: boolean | undefined, ...args: Parameters<typeof cell>): ScheduleCell => ({
    ...cell(...args),
    ...(flag === undefined ? {} : { noCompanion: flag }),
  });

  it("불필요로 표시한 국소는 입회자·신호수가 비고 팀장은 남는다", () => {
    const stations = buildDayStations({
      workDate: DATE,
      columns: COLUMNS,
      cells: [
        withFlag(true, DATE, "c1", 0, "국동신월"),
        cell(DATE, "c1", 1, "", "입회 : 홍길동"),
        cell(DATE, "c1", 2, "", "신호수 : 김철수"),
      ],
    });
    expect(stations).toHaveLength(1);
    expect(stations[0].leaders).toEqual(["박경훈"]);
    expect(stations[0].witnesses).toEqual([]);
    expect(stations[0].signalers).toEqual([]);
  });

  it("표시가 없으면 입회자·신호수가 그대로 모인다", () => {
    const stations = buildDayStations({
      workDate: DATE,
      columns: COLUMNS,
      cells: [
        withFlag(false, DATE, "c1", 0, "신월금호4"),
        cell(DATE, "c1", 1, "", "입회 : 홍길동"),
        cell(DATE, "c1", 2, "", "신호수 : 김철수"),
      ],
    });
    expect(stations[0].witnesses).toEqual(["홍길동"]);
    expect(stations[0].signalers).toEqual(["김철수"]);
  });

  it("같은 국소를 두 팀이 맡고 한 팀만 불필요면 다른 팀의 이름은 남는다", () => {
    const stations = buildDayStations({
      workDate: DATE,
      columns: COLUMNS,
      cells: [
        withFlag(true, DATE, "c1", 0, "공용국소"),
        cell(DATE, "c1", 1, "", "입회 : 불필요팀원"),
        withFlag(false, DATE, "c3", 0, "공용국소"),
        cell(DATE, "c3", 1, "", "입회 : 필요팀원"),
      ],
    });
    expect(stations).toHaveLength(1);
    expect(stations[0].witnesses).toEqual(["필요팀원"]);
  });

  it("한 팀의 같은 국소 칸이 둘 이상이면 모두 불필요일 때만 비운다", () => {
    const stations = buildDayStations({
      workDate: DATE,
      columns: COLUMNS,
      cells: [
        withFlag(true, DATE, "c1", 0, "중복국소"),
        withFlag(false, DATE, "c1", 1, "중복국소"),
        cell(DATE, "c1", 2, "", "입회 : 홍길동"),
      ],
    });
    expect(stations[0].witnesses).toEqual(["홍길동"]);
  });

  it("입회·신호수 칸의 noCompanion은 국소가 아니므로 무시한다", () => {
    const stations = buildDayStations({
      workDate: DATE,
      columns: COLUMNS,
      cells: [
        cell(DATE, "c1", 0, "신월금호4"),
        withFlag(true, DATE, "c1", 1, "", "입회 : 홍길동"),
      ],
    });
    expect(stations[0].witnesses).toEqual(["홍길동"]);
  });
});


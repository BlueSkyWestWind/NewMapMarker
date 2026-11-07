import { describe, expect, it } from "vitest";

import { buildDayRows, defaultDayDate, type BuildDayRowsInput } from "@/features/schedule/lib/day-rows";
import { stationKey } from "@/features/schedule/lib/day-stations";
import type { DayDetail, RefValues } from "@/features/schedule/lib/day-types";
import type { ScheduleCell, ScheduleColumn } from "@/features/schedule/types";

const DATE = "2026-11-09";

function column(id: string, sortOrder: number, team: string, leader: string): ScheduleColumn {
  return { id, sortOrder, teamLabel: team, leaderLabel: leader };
}

function cell(columnId: string, rowNo: number, main: string, sub = ""): ScheduleCell {
  return { id: `${DATE}-${columnId}-${rowNo}`, workDate: DATE, columnId, rowNo, mainText: main, subText: sub, textColor: null };
}

function detail(site: string, patch: Partial<DayDetail> = {}): DayDetail {
  return {
    workDate: DATE,
    stationKey: stationKey(site),
    site,
    workCategory: null,
    levelLabel: null,
    workTime: null,
    workType: null,
    equipment: null,
    workContent: null,
    workDetail: null,
    worker: null,
    witness: null,
    signaler: null,
    overrides: {},
    ...patch,
  };
}

const COLUMNS: ScheduleColumn[] = [column("c1", 1, "1팀", "박경훈"), column("c4", 4, "4팀", "이동화")];

function build(overrides: Partial<BuildDayRowsInput> = {}) {
  return buildDayRows({
    workDate: DATE,
    columns: COLUMNS,
    cells: [cell("c1", 0, "가국소"), cell("c4", 0, "가국소"), cell("c1", 1, "나국소")],
    details: new Map(),
    refs: { erp: new Map(), archive: new Map(), marker: new Map() },
    ...overrides,
  });
}

const ERP: RefValues = { project: "ERP-P", facilityCode: "ERP-F", bizClass: "기지국", region: "서울" };
const ARCHIVE: RefValues = { facilityCode: "ARC-F", bizKind: "5G" };
const MARKER: RefValues = { project: "MK-P", address: "마커 주소" };

describe("buildDayRows", () => {
  it("순번·작업일·국소명·작업자·입회자·신호수를 채운다", () => {
    const rows = build({
      cells: [
        cell("c1", 0, "가국소"),
        cell("c4", 0, "가국소"),
        cell("c1", 1, "", "입회 : 홍길동, 김철수"),
        cell("c4", 1, "", "신호수 : 이신호"),
        cell("c1", 2, "나국소"),
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].stationKey).toBe(stationKey("가국소"));
    expect(rows[0].site).toBe("가국소");
    expect(rows[0].values.seq).toBe("1");
    expect(rows[1].values.seq).toBe("2");
    expect(rows[0].values.workDate).toBe(DATE);
    expect(rows[0].values.site).toBe("가국소");
    expect(rows[0].values.worker).toBe("박경훈,이동화");
    expect(rows[1].values.worker).toBe("박경훈");
    expect(rows[0].values.witness).toBe("홍길동,김철수");
    expect(rows[0].values.signaler).toBe("이신호");
  });

  it("입회자·신호수도 모은 이름을 쉼표로 잇는다", () => {
    const rows = build({
      cells: [
        cell("c1", 0, "가국소"),
        cell("c4", 0, "가국소"),
        cell("c1", 1, "", "입회 : 홍길동"),
        cell("c4", 1, "", "입회 : 김철수"),
        cell("c1", 2, "", "신호수 : 이신호"),
        cell("c4", 2, "", "신호수 : 박신호"),
      ],
    });
    expect(rows[0].values.witness).toBe("홍길동,김철수");
    expect(rows[0].values.signaler).toBe("이신호,박신호");
  });

  it("상세가 없으면 기본값을 쓰고 나머지 입력 열은 빈칸이다", () => {
    const [row] = build();
    expect(row.values.workCategory).toBe("HW");
    expect(row.values.levelLabel).toBe("Level1");
    expect(row.values.workTime).toBe("주간");
    expect(row.values.workType).toBe("");
    expect(row.values.equipment).toBe("");
    expect(row.values.workContent).toBe("");
    expect(row.values.workDetail).toBe("");
    expect(row.refSource).toBeNull();
  });

  it("상세의 값이 기본값·자동값을 이긴다", () => {
    const rows = build({
      details: new Map([
        [
          stationKey("가국소"),
          detail("가국소", {
            workCategory: "SW",
            levelLabel: "Level2",
            workTime: "야간",
            workType: "설치",
            equipment: "이동식크레인,굴착기",
            workContent: "점검",
            workDetail: "상세 내용",
            worker: "직접작업자",
            witness: "직접입회",
            signaler: "직접신호",
          }),
        ],
      ]),
    });
    const values = rows[0].values;
    expect(values.workCategory).toBe("SW");
    expect(values.levelLabel).toBe("Level2");
    expect(values.workTime).toBe("야간");
    expect(values.workType).toBe("설치");
    expect(values.equipment).toBe("이동식크레인,굴착기");
    expect(values.workContent).toBe("점검");
    expect(values.workDetail).toBe("상세 내용");
    expect(values.worker).toBe("직접작업자");
    expect(values.witness).toBe("직접입회");
    expect(values.signaler).toBe("직접신호");
    // 다른 국소는 영향받지 않는다.
    expect(rows[1].values.worker).toBe("박경훈");
  });

  it("상세에서 빈 문자열로 지운 작업구분·Level·작업시간은 기본값으로 돌아가지 않는다(null만 기본값)", () => {
    const rows = build({
      details: new Map([[stationKey("가국소"), detail("가국소", { workCategory: "", levelLabel: "", workTime: "" })]]),
    });
    expect(rows[0].values.workCategory).toBe("");
    expect(rows[0].values.levelLabel).toBe("");
    expect(rows[0].values.workTime).toBe("");
  });

  it("상세에서 빈 문자열로 지운 작업자는 빈칸으로 둔다(null만 자동값)", () => {
    const rows = build({ details: new Map([[stationKey("가국소"), detail("가국소", { worker: "" })]]) });
    expect(rows[0].values.worker).toBe("");
  });

  it("overrides의 비어 있지 않은 값이 참조 값을 이긴다", () => {
    const rows = build({
      refs: { erp: new Map([[stationKey("가국소"), ERP]]), archive: new Map(), marker: new Map() },
      details: new Map([
        [stationKey("가국소"), detail("가국소", { overrides: { project: "직접-P", region: "", address: "직접 주소" } })],
      ]),
    });
    const values = rows[0].values;
    expect(values.project).toBe("직접-P");
    expect(values.address).toBe("직접 주소");
    // 빈 덮어쓰기는 참조 값을 지우지 않는다.
    expect(values.region).toBe("서울");
    expect(values.facilityCode).toBe("ERP-F");
    expect(rows[0].refSource).toBe("erp");
  });

  it("참조는 공정관리 → 누적 → 마커 순으로 한 층을 쓰고 refSource가 그 층이다", () => {
    const rows = build({
      cells: [cell("c1", 0, "가국소"), cell("c1", 1, "나국소"), cell("c1", 2, "다국소"), cell("c1", 3, "라국소")],
      refs: {
        erp: new Map([[stationKey("가국소"), ERP]]),
        archive: new Map([
          [stationKey("가국소"), ARCHIVE],
          [stationKey("나국소"), ARCHIVE],
        ]),
        marker: new Map([
          [stationKey("가국소"), MARKER],
          [stationKey("나국소"), MARKER],
          [stationKey("다국소"), MARKER],
        ]),
      },
    });
    expect(rows.map((row) => row.refSource)).toEqual(["erp", "archive", "marker", null]);

    expect(rows[0].values.project).toBe("ERP-P");
    expect(rows[0].values.bizClass).toBe("기지국");
    // 층 사이에 열을 섞지 않는다.
    expect(rows[0].values.bizKind).toBe("");
    expect(rows[0].values.address).toBe("");

    expect(rows[1].values.facilityCode).toBe("ARC-F");
    expect(rows[1].values.bizKind).toBe("5G");
    expect(rows[1].values.project).toBe("");

    expect(rows[2].values.project).toBe("MK-P");
    expect(rows[2].values.address).toBe("마커 주소");

    // 아무 층에도 없으면 참조 열은 모두 빈칸이다.
    for (const key of ["project", "facilityCode", "bizClass", "bizKind", "constructionType", "region", "equipType", "address", "motherStation", "realtyType", "equipLocation"] as const) {
      expect(rows[3].values[key]).toBe("");
    }
  });

  it("목록·참조에 없는 값도 지우지 않고 그대로 보인다", () => {
    const rows = build({
      refs: { erp: new Map([[stationKey("가국소"), { bizClass: "새방식값", bizKind: "알수없음" }]]), archive: new Map(), marker: new Map() },
      details: new Map([[stationKey("가국소"), detail("가국소", { workType: "목록에 없는 유형", workTime: "새벽" })]]),
    });
    expect(rows[0].values.bizClass).toBe("새방식값");
    expect(rows[0].values.bizKind).toBe("알수없음");
    expect(rows[0].values.workType).toBe("목록에 없는 유형");
    expect(rows[0].values.workTime).toBe("새벽");
  });

  it("그날 국소가 없으면 빈 배열이다", () => {
    expect(build({ cells: [] })).toEqual([]);
  });
});

describe("defaultDayDate", () => {
  it("기본 날짜는 내일이다", () => {
    // todayIso가 로컬 날짜를 읽으므로 입력도 로컬 시각으로 만든다(어느 시간대에서도 같은 결과).
    expect(defaultDayDate(new Date(2026, 10, 7, 12))).toBe("2026-11-08");
  });
});

import { describe, expect, it } from "vitest";
import type { ScheduleCell } from "@/features/schedule/types";
import { MAX_ROWS } from "./cell-grid";
import {
  findCompanions,
  formatCompanionText,
  isCompanionCell,
  parseCompanionText,
  planCompanionOps,
} from "./companions";

const D = "2026-11-09";
const COL = "col-a";

function cell(
  rowNo: number,
  mainText: string,
  subText: string,
  options: { columnId?: string; workDate?: string; textColor?: ScheduleCell["textColor"] } = {},
): ScheduleCell {
  const workDate = options.workDate ?? D;
  const columnId = options.columnId ?? COL;
  return {
    id: `${workDate}-${columnId}-${rowNo}`,
    workDate,
    columnId,
    rowNo,
    mainText,
    subText,
    textColor: options.textColor ?? null,
  };
}

describe("parseCompanionText", () => {
  it("`입회 : 이름`과 `신호수 : 이름`을 읽는다", () => {
    expect(parseCompanionText("입회 : 정성훈")).toEqual({ kind: "입회", names: "정성훈" });
    expect(parseCompanionText("입회: 박민수")).toEqual({ kind: "입회", names: "박민수" });
    expect(parseCompanionText("신호수 : 구삼남,구제신")).toEqual({
      kind: "신호수",
      names: "구삼남,구제신",
    });
  });

  it("전각 콜론도 읽는다", () => {
    expect(parseCompanionText("입회 ： 정성훈")).toEqual({ kind: "입회", names: "정성훈" });
  });

  it("이름이 없는 `입회`·`신호수`도 항목으로 읽는다", () => {
    expect(parseCompanionText("입회")).toEqual({ kind: "입회", names: "" });
    expect(parseCompanionText("신호수 : ")).toEqual({ kind: "신호수", names: "" });
  });

  it("다른 글은 항목이 아니다", () => {
    expect(parseCompanionText("신호수 2명")).toBeNull();
    expect(parseCompanionText("입회자 김")).toBeNull();
    expect(parseCompanionText("스카이")).toBeNull();
    expect(parseCompanionText("")).toBeNull();
  });
});

describe("formatCompanionText", () => {
  it("이름이 있으면 `종류 : 이름`, 없으면 종류만 쓴다", () => {
    expect(formatCompanionText("입회", "정성훈")).toBe("입회 : 정성훈");
    expect(formatCompanionText("신호수", "  ")).toBe("신호수");
    expect(formatCompanionText("입회", " 박민수 ")).toBe("입회 : 박민수");
  });
});

describe("isCompanionCell", () => {
  it("국소가 비고 뒤 칸이 입회·신호수 글인 칸만 해당한다", () => {
    expect(isCompanionCell(cell(1, "", "입회 : 정성훈"))).toBe(true);
    expect(isCompanionCell(cell(1, "국소", "입회 : 정성훈"))).toBe(false);
    expect(isCompanionCell(cell(1, "", "스카이"))).toBe(false);
  });
});

describe("findCompanions", () => {
  const cells = [
    cell(0, "국소1", "모국1"),
    cell(3, "", "신호수 : 구삼남"),
    cell(2, "", "입회 : 정성훈"),
    cell(5, "", "입회 : 중복"),
    cell(1, "", "입회 : 다른 열", { columnId: "col-b" }),
    cell(1, "", "입회 : 다른 날", { workDate: "2026-11-10" }),
  ];

  it("같은 날짜·팀에서 종류별로 찾고, 겹치면 앞 행을 쓴다", () => {
    const found = findCompanions(cells, D, COL);
    expect(found["입회"]?.subText).toBe("입회 : 정성훈");
    expect(found["신호수"]?.subText).toBe("신호수 : 구삼남");
  });

  it("제외할 칸은 건너뛴다", () => {
    const found = findCompanions(cells, D, COL, cell(2, "", "x").id);
    expect(found["입회"]?.subText).toBe("입회 : 중복");
  });

  it("없으면 null이다", () => {
    expect(findCompanions([], D, COL)).toEqual({ 입회: null, 신호수: null });
  });
});

describe("planCompanionOps", () => {
  const on = (kind: "입회" | "신호수", names: string) => ({ kind, enabled: true, names });
  const off = (kind: "입회" | "신호수") => ({ kind, enabled: false, names: "" });

  it("체크하면 같은 팀·날짜의 빈 행에 새 칸을 만든다(기준 행 아래부터)", () => {
    const result = planCompanionOps({
      cells: [cell(0, "국소1", "")],
      workDate: D,
      columnId: COL,
      excludeId: null,
      anchorRow: 0,
      companions: [on("입회", "정성훈"), off("신호수")],
    });
    expect(result).toEqual({
      ops: [
        {
          op: "create",
          position: { workDate: D, columnId: COL, rowNo: 1 },
          text: { mainText: "", subText: "입회 : 정성훈", textColor: null },
        },
      ],
    });
  });

  it("둘 다 체크하면 빈 행을 차례로 쓴다", () => {
    const result = planCompanionOps({
      cells: [cell(0, "국소1", "")],
      workDate: D,
      columnId: COL,
      excludeId: null,
      anchorRow: 0,
      companions: [on("입회", "가"), on("신호수", "나")],
    });
    expect("ops" in result && result.ops.map((op) => op.op === "create" && op.position.rowNo)).toEqual([1, 2]);
  });

  it("방금 만들 칸의 행(reservedRows)은 비어 있지 않은 것으로 본다", () => {
    const result = planCompanionOps({
      cells: [],
      workDate: D,
      columnId: COL,
      excludeId: null,
      reservedRows: [0],
      companions: [on("입회", "가"), off("신호수")],
    });
    expect("ops" in result && result.ops[0]).toMatchObject({
      op: "create",
      position: { rowNo: 1 },
    });
  });

  it("이미 있는 항목은 글이 바뀔 때만 고치고 글자색은 유지한다", () => {
    const existing = cell(2, "", "입회 : 정성훈", { textColor: "FF0000" });
    const changed = planCompanionOps({
      cells: [existing],
      workDate: D,
      columnId: COL,
      excludeId: null,
      companions: [on("입회", "박민수"), off("신호수")],
    });
    expect(changed).toEqual({
      ops: [
        {
          op: "update",
          id: existing.id,
          text: { mainText: "", subText: "입회 : 박민수", textColor: "FF0000" },
        },
      ],
    });
    const same = planCompanionOps({
      cells: [existing],
      workDate: D,
      columnId: COL,
      excludeId: null,
      companions: [on("입회", "정성훈"), off("신호수")],
    });
    expect(same).toEqual({ ops: [] });
  });

  it("체크를 풀면 있던 항목 칸을 지운다", () => {
    const existing = cell(3, "", "신호수 : 구삼남");
    const result = planCompanionOps({
      cells: [existing],
      workDate: D,
      columnId: COL,
      excludeId: null,
      companions: [off("입회"), off("신호수")],
    });
    expect(result).toEqual({ ops: [{ op: "delete", id: existing.id }] });
  });

  it("편집 중인 칸 자신은 항목으로 보지 않는다", () => {
    const self = cell(2, "", "입회 : 정성훈");
    const result = planCompanionOps({
      cells: [self],
      workDate: D,
      columnId: COL,
      excludeId: self.id,
      companions: [on("입회", "새이름"), off("신호수")],
    });
    expect("ops" in result && result.ops[0]).toMatchObject({ op: "create" });
  });

  it("기준 행 아래가 모두 차 있으면 위쪽 빈 행으로 돌아간다", () => {
    const result = planCompanionOps({
      cells: [cell(29, "국소", "")],
      workDate: D,
      columnId: COL,
      excludeId: null,
      anchorRow: 28,
      companions: [on("입회", "가"), off("신호수")],
    });
    expect("ops" in result && result.ops[0]).toMatchObject({ position: { rowNo: 0 } });
  });

  it("행이 모두 차 있으면 오류를 돌려준다", () => {
    const full = Array.from({ length: MAX_ROWS }, (_, row) => cell(row, "국소", ""));
    expect(
      planCompanionOps({
        cells: full,
        workDate: D,
        columnId: COL,
        excludeId: null,
        companions: [on("입회", "가"), off("신호수")],
      }),
    ).toEqual({ error: "full" });
  });
});

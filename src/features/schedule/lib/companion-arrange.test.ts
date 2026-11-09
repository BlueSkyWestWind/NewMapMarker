import { describe, expect, it } from "vitest";
import { planCompanionArrangement } from "./companion-arrange";
import type { ScheduleCell } from "@/features/schedule/types";

function cell(
  rowNo: number,
  mainText: string,
  options: { sub?: string; target?: boolean } = {},
): ScheduleCell {
  return {
    id: `r${rowNo}`,
    workDate: "2026-11-09",
    columnId: "col",
    rowNo,
    mainText,
    subText: options.sub ?? "",
    textColor: null,
    ...(options.target === undefined ? {} : { companionTarget: options.target }),
  };
}

/** 이동 계획을 맞바꾸기 규칙(도착 자리가 차 있으면 서로 바꾼다)대로 흉내 내 최종 행 순서를 돌려준다. */
function apply(cells: ScheduleCell[], moves: { id: string; toRow: number }[]): string[] {
  const rowOf = new Map(cells.map((c) => [c.id, c.rowNo]));
  for (const move of moves) {
    const from = rowOf.get(move.id)!;
    const occupant = [...rowOf.entries()].find(([, row]) => row === move.toRow)?.[0];
    rowOf.set(move.id, move.toRow);
    if (occupant && occupant !== move.id) rowOf.set(occupant, from);
  }
  return [...rowOf.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

describe("planCompanionArrangement", () => {
  const cells = [
    cell(0, "신월금호4", { target: true }),
    cell(1, "", { sub: "입회 : 김성권" }),
    cell(2, "", { sub: "신호수 : 구삼남" }),
    cell(3, "신월코아루외부", { target: true }),
    cell(4, "국동신월"),
    cell(5, "봉산1"),
  ];

  it("대상 국소 → 입회 → 신호수 → 나머지 순으로 행을 정리한다", () => {
    const moves = planCompanionArrangement(cells);
    expect(apply(cells, moves)).toEqual(["r0", "r3", "r1", "r2", "r4", "r5"]);
  });

  it("이미 그 순서면 이동이 없다", () => {
    const ordered = [
      cell(0, "신월금호4", { target: true }),
      cell(1, "신월코아루외부", { target: true }),
      cell(2, "", { sub: "입회 : 김성권" }),
      cell(3, "", { sub: "신호수 : 구삼남" }),
      cell(4, "국동신월"),
    ];
    expect(planCompanionArrangement(ordered)).toEqual([]);
  });

  it("대상 표시가 하나도 없고 빈 행도 없으면 손대지 않는다(순서를 바꾸지 않는다)", () => {
    const none = [cell(0, "가"), cell(1, "", { sub: "입회 : 홍" }), cell(2, "나")];
    expect(planCompanionArrangement(none)).toEqual([]);
  });

  // 실제 데이터에서 따온 경우: 2026-11-12 1팀은 0행이 삭제돼 1·2행에만 남아 위가 비어 보였다.
  it("대상 표시가 없어도 삭제로 생긴 위쪽 빈 행을 닫는다", () => {
    const topGap = [cell(1, "(공동)강광고속장암-RRU(F2)"), cell(2, "(공동)강광고속장암-RRU(F1)")];
    const moves = planCompanionArrangement(topGap);
    expect(moves).toEqual([
      { id: "r1", toRow: 0 },
      { id: "r2", toRow: 1 },
    ]);
  });

  // 2026-11-10 2팀은 행이 0·1·3이라 입회 위에 빈 행이 하나 있었다(3팀은 0·1·2로 붙어 있었다).
  it("대상 표시가 없어도 입회 위의 빈 행을 닫아 팀마다 입회 위치를 같게 한다", () => {
    const withGap = [cell(0, "103동"), cell(1, "104동"), cell(3, "", { sub: "입회 : 박황열" })];
    const withoutGap = [cell(0, "103동"), cell(1, "104동"), cell(2, "", { sub: "입회 : 박황열" })];

    expect(planCompanionArrangement(withGap)).toEqual([{ id: "r3", toRow: 2 }]);
    expect(planCompanionArrangement(withoutGap)).toEqual([]);
  });

  it("빈 행을 닫아도 국소와 입회의 원래 순서는 바꾸지 않는다", () => {
    const gaps = [cell(2, "가"), cell(4, "", { sub: "입회 : 홍" }), cell(7, "나")];
    expect(apply(gaps, planCompanionArrangement(gaps))).toEqual(["r2", "r4", "r7"]);
    expect(planCompanionArrangement(gaps).map((m) => m.toRow)).toEqual([0, 1, 2]);
  });

  it("입회·신호수 칸이 없어도 대상 국소를 앞으로 모은다", () => {
    const noCompanions = [cell(0, "가"), cell(1, "나", { target: true }), cell(2, "다")];
    expect(apply(noCompanions, planCompanionArrangement(noCompanions))).toEqual(["r1", "r0", "r2"]);
  });

  it("행 사이에 빈 행이 있어도 0행부터 이어 붙인다", () => {
    const gaps = [cell(2, "가", { target: true }), cell(5, "", { sub: "입회 : 홍" }), cell(9, "나")];
    const moves = planCompanionArrangement(gaps);
    expect(moves.map((m) => m.toRow).sort()).toEqual([0, 1, 2]);
    expect(apply(gaps, moves)).toEqual(["r2", "r5", "r9"]);
  });

  it("신호수가 입회보다 앞에 있어도 입회 → 신호수 순으로 둔다", () => {
    const reversed = [
      cell(0, "가", { target: true }),
      cell(1, "", { sub: "신호수 : 김" }),
      cell(2, "", { sub: "입회 : 홍" }),
    ];
    expect(apply(reversed, planCompanionArrangement(reversed))).toEqual(["r0", "r2", "r1"]);
  });
});

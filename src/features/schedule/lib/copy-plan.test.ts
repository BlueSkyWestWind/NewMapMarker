import { describe, expect, it } from "vitest";
import { MAX_ROWS } from "@/features/schedule/lib/cell-grid";
import {
  buildDatePairs,
  buildWeekPairs,
  formatCopyPreview,
  planCopy,
} from "@/features/schedule/lib/copy-plan";
import { applyOpsToGroups, type WriteOp } from "@/features/schedule/lib/group-state";
import type { ScheduleCell } from "@/features/schedule/types";

const COL_A = "col-a";
const COL_B = "col-b";

function cell(
  workDate: string,
  columnId: string,
  rowNo: number,
  mainText: string,
  options: {
    subText?: string;
    textColor?: ScheduleCell["textColor"];
    companionTarget?: boolean;
    result?: ScheduleCell["result"];
  } = {},
): ScheduleCell {
  return {
    id: `${workDate}-${columnId}-${rowNo}`,
    workDate,
    columnId,
    rowNo,
    mainText,
    subText: options.subText ?? "",
    textColor: options.textColor ?? null,
    companionTarget: options.companionTarget ?? false,
    result: options.result ?? null,
  };
}

describe("planCopy", () => {
  it("① 날짜 복제: 원본 3건을 대상 2일에 복제하면 원본 행 번호를 유지한다", () => {
    const cells = [
      cell("2026-11-09", COL_A, 0, "국소1", { subText: "모국1", textColor: "0070C0" }),
      cell("2026-11-09", COL_A, 2, "국소2"),
      cell("2026-11-09", COL_A, 4, "국소3"),
    ];

    const plan = planCopy({
      pairs: [
        { from: "2026-11-09", to: "2026-11-10" },
        { from: "2026-11-09", to: "2026-11-11" },
      ],
      columnIds: [COL_A],
      mode: "skip",
      cells,
      maxRows: MAX_ROWS,
    });

    expect(plan.summary).toEqual([
      { to: "2026-11-10", copied: 3, skippedTeams: 0, skippedFull: 0 },
      { to: "2026-11-11", copied: 3, skippedTeams: 0, skippedFull: 0 },
    ]);
    expect(plan.creates.map((c) => [c.position.workDate, c.position.rowNo, c.text.mainText])).toEqual([
      ["2026-11-10", 0, "국소1"],
      ["2026-11-10", 2, "국소2"],
      ["2026-11-10", 4, "국소3"],
      ["2026-11-11", 0, "국소1"],
      ["2026-11-11", 2, "국소2"],
      ["2026-11-11", 4, "국소3"],
    ]);
  });

  it("② 팀 필터: columnIds에 없는 팀은 복제하지 않는다", () => {
    const cells = [
      cell("2026-11-09", COL_A, 0, "A국소"),
      cell("2026-11-09", COL_B, 0, "B국소"),
    ];

    const plan = planCopy({
      pairs: [{ from: "2026-11-09", to: "2026-11-10" }],
      columnIds: [COL_A],
      mode: "skip",
      cells,
      maxRows: MAX_ROWS,
    });

    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].text.mainText).toBe("A국소");
  });

  it("③ skip 모드: 대상 팀에 이미 칸이 있으면 그 팀 전체를 건너뛰고 skippedTeams를 올린다", () => {
    const cells = [
      cell("2026-11-09", COL_A, 0, "원본A"),
      cell("2026-11-09", COL_B, 0, "원본B"),
      cell("2026-11-10", COL_A, 0, "기존A"),
    ];

    const plan = planCopy({
      pairs: [{ from: "2026-11-09", to: "2026-11-10" }],
      columnIds: [COL_A, COL_B],
      mode: "skip",
      cells,
      maxRows: MAX_ROWS,
    });

    expect(plan.summary).toEqual([
      { to: "2026-11-10", copied: 1, skippedTeams: 1, skippedFull: 0 },
    ]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].position.columnId).toBe(COL_B);
  });

  it("④ append 모드: 대상에 2건(0·2행)이 있으면 원본을 그 뒤 행(3·4행)으로 이어 붙인다", () => {
    const cells = [
      cell("2026-11-09", COL_A, 0, "원본1"),
      cell("2026-11-09", COL_A, 1, "원본2"),
      cell("2026-11-10", COL_A, 0, "기존1"),
      cell("2026-11-10", COL_A, 2, "기존2"),
    ];

    const plan = planCopy({
      pairs: [{ from: "2026-11-09", to: "2026-11-10" }],
      columnIds: [COL_A],
      mode: "append",
      cells,
      maxRows: MAX_ROWS,
    });

    expect(plan.creates.map((c) => [c.position.rowNo, c.text.mainText])).toEqual([
      [3, "원본1"],
      [4, "원본2"],
    ]);
    expect(plan.summary).toEqual([
      { to: "2026-11-10", copied: 2, skippedTeams: 0, skippedFull: 0 },
    ]);
  });

  it("⑤ 빈 행 부족: append에서 남은 행보다 원본이 많으면 들어가는 만큼만 넣고 나머지는 skippedFull로 센다", () => {
    const cells = [
      cell("2026-11-09", COL_A, 0, "원본1"),
      cell("2026-11-09", COL_A, 1, "원본2"),
      cell("2026-11-09", COL_A, 2, "원본3"),
      ...Array.from({ length: 28 }, (_, i) => cell("2026-11-10", COL_A, i, `기존${i}`)),
    ];

    const plan = planCopy({
      pairs: [{ from: "2026-11-09", to: "2026-11-10" }],
      columnIds: [COL_A],
      mode: "append",
      cells,
      maxRows: MAX_ROWS,
    });

    expect(plan.creates.map((c) => [c.position.rowNo, c.text.mainText])).toEqual([
      [28, "원본1"],
      [29, "원본2"],
    ]);
    expect(plan.summary).toEqual([
      { to: "2026-11-10", copied: 2, skippedTeams: 0, skippedFull: 1 },
    ]);
  });

  it("⑥ 시행 결과가 있는 원본을 복제해도 creates에는 결과 필드가 없다", () => {
    const cells = [
      cell("2026-11-09", COL_A, 0, "완료국소", {
        result: { status: "done", reason: "", rescheduledTo: null },
      }),
    ];

    const plan = planCopy({
      pairs: [{ from: "2026-11-09", to: "2026-11-10" }],
      columnIds: [COL_A],
      mode: "skip",
      cells,
      maxRows: MAX_ROWS,
    });

    expect(plan.creates).toHaveLength(1);
    expect("result" in plan.creates[0].text).toBe(false);
    expect("resultStatus" in plan.creates[0].text).toBe(false);
  });

  it("⑦ 주 복제(7쌍): 일부 날짜만 일정이 있어도 각 요일 쌍에 맞춰 복제한다", () => {
    const cells = [
      cell("2026-11-09", COL_A, 0, "월국소"),
      cell("2026-11-11", COL_A, 1, "수국소"),
    ];
    const pairs = buildWeekPairs("2026-11-09", 1);

    const plan = planCopy({
      pairs,
      columnIds: [COL_A],
      mode: "skip",
      cells,
      maxRows: MAX_ROWS,
    });

    expect(plan.creates.map((c) => [c.position.workDate, c.position.rowNo, c.text.mainText])).toEqual([
      ["2026-11-16", 0, "월국소"],
      ["2026-11-18", 1, "수국소"],
    ]);
    expect(plan.summary).toHaveLength(7);
  });

  it("⑧ 중복 to 처리: 같은 to가 여러 번 오면 첫 쌍만 처리한다", () => {
    const cells = [
      cell("2026-11-09", COL_A, 0, "첫원본"),
      cell("2026-11-10", COL_A, 0, "둘째원본"),
    ];

    const plan = planCopy({
      pairs: [
        { from: "2026-11-09", to: "2026-11-16" },
        { from: "2026-11-10", to: "2026-11-16" },
      ],
      columnIds: [COL_A],
      mode: "skip",
      cells,
      maxRows: MAX_ROWS,
    });

    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].text.mainText).toBe("첫원본");
    expect(plan.summary).toHaveLength(1);
  });

  it("⑨ companionTarget이 true인 원본은 복제본에도 companionTarget: true를 보존한다", () => {
    const cells = [
      cell("2026-11-09", COL_A, 0, "대상국소", { companionTarget: true }),
      cell("2026-11-09", COL_A, 1, "일반국소", { companionTarget: false }),
    ];

    const plan = planCopy({
      pairs: [{ from: "2026-11-09", to: "2026-11-10" }],
      columnIds: [COL_A],
      mode: "skip",
      cells,
      maxRows: MAX_ROWS,
    });

    expect(plan.creates[0].text.companionTarget).toBe(true);
    expect("companionTarget" in plan.creates[1].text).toBe(false);
  });

  it("⑩ 빈 원본이면 creates는 비어 있고 summary에는 copied: 0을 담는다", () => {
    const plan = planCopy({
      pairs: [{ from: "2026-11-09", to: "2026-11-10" }],
      columnIds: [COL_A],
      mode: "skip",
      cells: [],
      maxRows: MAX_ROWS,
    });

    expect(plan.creates).toEqual([]);
    expect(plan.summary).toEqual([
      { to: "2026-11-10", copied: 0, skippedTeams: 0, skippedFull: 0 },
    ]);
  });

  it("⑪ applyOpsToGroups 대조: append 모드 복제 결과가 최종 그룹 상태(행 번호·글)와 같다", () => {
    const cells = [
      cell("2026-11-09", COL_A, 0, "원본1", { subText: "모국1" }),
      cell("2026-11-09", COL_A, 1, "원본2"),
      cell("2026-11-10", COL_A, 0, "기존1"),
      cell("2026-11-10", COL_A, 2, "기존2"),
    ];
    const plan = planCopy({
      pairs: [{ from: "2026-11-09", to: "2026-11-10" }],
      columnIds: [COL_A],
      mode: "append",
      cells,
      maxRows: MAX_ROWS,
    });

    const ops: WriteOp[] = plan.creates.map((c) => ({
      op: "create",
      position: c.position,
      text: c.text,
    }));
    const groups = applyOpsToGroups({ cells, ops, arrange: false });

    expect(groups).toHaveLength(1);
    expect(groups[0].cells.map((c) => [c.rowNo, c.mainText, c.subText])).toEqual([
      [0, "기존1", ""],
      [2, "기존2", ""],
      [3, "원본1", "모국1"],
      [4, "원본2", ""],
    ]);
  });
});

describe("buildDatePairs & buildWeekPairs & formatCopyPreview", () => {
  it("buildDatePairs는 from 제외·중복 제거·최대 31개로 쌍을 만든다", () => {
    const many = Array.from({ length: 35 }, (_, i) => `2026-12-${String((i % 31) + 1).padStart(2, "0")}`);
    const pairs = buildDatePairs("2026-11-09", ["2026-11-09", "2026-11-10", "2026-11-10", ...many]);
    expect(pairs[0]).toEqual({ from: "2026-11-09", to: "2026-11-10" });
    expect(pairs.some((p) => p.to === "2026-11-09")).toBe(false);
    expect(pairs.length).toBeLessThanOrEqual(31);
  });

  it("buildWeekPairs는 속한 주 월~일 7일을 다음 N주 같은 요일로 매핑한다(최대 8주)", () => {
    // 2026-11-11(수)은 2026-11-09(월)~2026-11-15(일) 주에 속한다
    const pairs = buildWeekPairs("2026-11-11", 2);
    expect(pairs).toHaveLength(14);
    expect(pairs[0]).toEqual({ from: "2026-11-09", to: "2026-11-16" });
    expect(pairs[6]).toEqual({ from: "2026-11-15", to: "2026-11-22" });
    expect(pairs[7]).toEqual({ from: "2026-11-09", to: "2026-11-23" });
    expect(pairs[13]).toEqual({ from: "2026-11-15", to: "2026-11-29" });

    expect(buildWeekPairs("2026-11-11", 10)).toHaveLength(56);
  });

  it("formatCopyPreview는 날짜별 건수와 건너뜀·넣지 못함 요약을 한 줄로 만든다", () => {
    expect(
      formatCopyPreview([
        { to: "2026-07-28", copied: 12, skippedTeams: 1, skippedFull: 0 },
        { to: "2026-07-29", copied: 8, skippedTeams: 1, skippedFull: 1 },
      ]),
    ).toBe("7/28 12건 · 7/29 8건 (건너뜀 2팀 · 넣지 못함 1건)");

    expect(
      formatCopyPreview([{ to: "2026-07-28", copied: 0, skippedTeams: 0, skippedFull: 0 }]),
    ).toBe("");
  });
});

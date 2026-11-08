import { describe, expect, it } from "vitest";
import type { ScheduleCell } from "@/features/schedule/types";
import { planReschedule, resultSummary, validateResult } from "./cell-result";

const SOURCE: ScheduleCell = {
  id: "s1",
  workDate: "2026-11-07",
  columnId: "c1",
  rowNo: 0,
  mainText: "신촌중도다이아빌LO",
  subText: "모국 A",
  textColor: "FF0000",
};

const cellAt = (workDate: string, columnId: string, rowNo: number): ScheduleCell => ({
  id: `${workDate}-${columnId}-${rowNo}`,
  workDate,
  columnId,
  rowNo,
  mainText: "x",
  subText: "",
  textColor: null,
});

describe("validateResult", () => {
  const base = { workDate: "2026-11-07", reason: "", rescheduledTo: "" };

  it("상태가 없으면 기록을 지운다", () => {
    expect(validateResult({ ...base, status: null, reason: "무시", rescheduledTo: "2026-11-09" })).toEqual({
      ok: true,
      value: null,
    });
  });

  it("완료는 사유·재일정 없이 저장한다", () => {
    expect(validateResult({ ...base, status: "done", reason: "남은 값", rescheduledTo: "2026-11-09" })).toEqual({
      ok: true,
      value: { status: "done", reason: "", rescheduledTo: null },
    });
  });

  it.each(["partial", "undone"] as const)("%s는 사유가 필수다", (status) => {
    expect(validateResult({ ...base, status, reason: "   " })).toEqual({ ok: false, error: "reason" });
    expect(validateResult({ ...base, status, reason: " 우천 " })).toEqual({
      ok: true,
      value: { status, reason: "우천", rescheduledTo: null },
    });
  });

  it("사유는 300자까지", () => {
    expect(validateResult({ ...base, status: "undone", reason: "가".repeat(301) })).toEqual({
      ok: false,
      error: "reasonLength",
    });
    expect(validateResult({ ...base, status: "undone", reason: "가".repeat(300) }).ok).toBe(true);
  });

  it("재일정 날짜는 원래 날짜 이후의 올바른 날짜여야 한다", () => {
    const check = (rescheduledTo: string) =>
      validateResult({ ...base, status: "undone", reason: "우천", rescheduledTo });
    expect(check("2026-11-07")).toEqual({ ok: false, error: "date" });
    expect(check("2026-11-06")).toEqual({ ok: false, error: "date" });
    expect(check("2026-02-30")).toEqual({ ok: false, error: "date" });
    expect(check("")).toEqual({
      ok: true,
      value: { status: "undone", reason: "우천", rescheduledTo: null },
    });
    expect(check("2026-11-10")).toEqual({
      ok: true,
      value: { status: "undone", reason: "우천", rescheduledTo: "2026-11-10" },
    });
  });
});

describe("planReschedule", () => {
  it("같은 팀의 첫 빈 행에 같은 정보를 복사한다(결과는 비운다)", () => {
    const plan = planReschedule(
      [cellAt("2026-11-10", "c1", 0), cellAt("2026-11-10", "c1", 1), cellAt("2026-11-10", "c2", 0)],
      SOURCE,
      "2026-11-10",
    );
    expect(plan).toEqual({
      position: { workDate: "2026-11-10", columnId: "c1", rowNo: 2 },
      text: { mainText: "신촌중도다이아빌LO", subText: "모국 A", textColor: "FF0000" },
    });
  });

  it("그 날짜에 칸이 없으면 0행", () => {
    const plan = planReschedule([], SOURCE, "2026-11-10");
    expect(plan).toMatchObject({ position: { rowNo: 0 } });
  });

  it("행이 가득 차면 full", () => {
    const full = Array.from({ length: 30 }, (_, row) => cellAt("2026-11-10", "c1", row));
    expect(planReschedule(full, SOURCE, "2026-11-10")).toEqual({ error: "full" });
  });
});

describe("resultSummary", () => {
  it("상태·사유·재일정을 한 줄로", () => {
    expect(resultSummary({ status: "done", reason: "", rescheduledTo: null })).toBe("완료");
    expect(resultSummary({ status: "undone", reason: "우천", rescheduledTo: null })).toBe("미시설: 우천");
    expect(resultSummary({ status: "partial", reason: "자재 부족", rescheduledTo: "2026-11-12" })).toBe(
      "일부완료: 자재 부족 → 11-12 재일정",
    );
  });
});

describe("planReschedule 입회·신호수 불필요", () => {
  const source: ScheduleCell = {
    id: "s1",
    workDate: "2026-11-09",
    columnId: "col1",
    rowNo: 0,
    mainText: "국동신월",
    subText: "",
    textColor: null,
    noCompanion: true,
  };

  it("불필요로 표시한 칸을 복사하면 표시도 함께 복사한다", () => {
    const plan = planReschedule([], source, "2026-11-12");
    expect(plan).toMatchObject({ text: { mainText: "국동신월", noCompanion: true } });
  });

  it("표시가 없는 칸은 noCompanion 키를 싣지 않는다(컬럼 없는 DB에서도 복사된다)", () => {
    const plan = planReschedule([], { ...source, noCompanion: false }, "2026-11-12");
    const text = "text" in plan ? plan.text : null;
    expect(text !== null && "noCompanion" in text).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  completionSummary,
  toggleDone,
} from "@/features/schedule/lib/quick-result";
import type { ScheduleCell } from "@/features/schedule/types";

function cell(
  id: string,
  workDate: string,
  mainText: string,
  subText = "",
  result: ScheduleCell["result"] = null,
): ScheduleCell {
  return {
    id,
    workDate,
    columnId: "col-a",
    rowNo: 0,
    mainText,
    subText,
    textColor: null,
    result,
  };
}

describe("toggleDone", () => {
  it("미기록(null)이면 완료(done)로 설정한다", () => {
    expect(toggleDone(null)).toEqual({
      kind: "set",
      next: { status: "done", reason: "", rescheduledTo: null },
    });
  });

  it("이미 완료(done)이면 기록을 지운다(null)", () => {
    expect(toggleDone({ status: "done", reason: "", rescheduledTo: null })).toEqual({
      kind: "set",
      next: null,
    });
  });

  it("일부완료(partial)나 미시설(undone)이면 덮어쓰지 않고 open-dialog를 돌려준다", () => {
    expect(
      toggleDone({ status: "partial", reason: "우천", rescheduledTo: null }),
    ).toEqual({ kind: "open-dialog" });
    expect(
      toggleDone({ status: "undone", reason: "출입불가", rescheduledTo: "2026-11-10" }),
    ).toEqual({ kind: "open-dialog" });
  });
});

describe("completionSummary", () => {
  const D = "2026-11-09";

  it("빈 목록이면 0/0/0이다", () => {
    expect(completionSummary([], D)).toEqual({ done: 0, recorded: 0, total: 0 });
  });

  it("입회·신호수 칸과 글이 빈 칸, 다른 날짜 칸은 제외하고 done/recorded/total을 계산한다", () => {
    const cells = [
      // 포함 대상 4건
      cell("1", D, "국소1", "", { status: "done", reason: "", rescheduledTo: null }),
      cell("2", D, "국소2", "", { status: "partial", reason: "일부", rescheduledTo: null }),
      cell("3", D, "국소3", "", { status: "undone", reason: "미시설", rescheduledTo: null }),
      cell("4", D, "국소4", "", null), // 결과 없음 -> total만 증가
      // 제외 대상
      cell("5", D, "", "입회 : 사람A", { status: "done", reason: "", rescheduledTo: null }),
      cell("6", D, "", "신호수 : 사람B"),
      cell("7", D, "   ", "스카이"), // mainText 비어 있음
      cell("8", "2026-11-10", "다른날국소", "", { status: "done", reason: "", rescheduledTo: null }),
    ];

    expect(completionSummary(cells, D)).toEqual({ done: 1, recorded: 3, total: 4 });
  });
});

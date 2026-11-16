import { beforeEach, describe, expect, it } from "vitest";
import { useScheduleJumpStore } from "@/features/schedule/store/use-schedule-jump-store";

describe("useScheduleJumpStore", () => {
  beforeEach(() => {
    useScheduleJumpStore.setState({ target: null });
  });

  it("초기 상태는 null이고 request 후 consume으로 한 번만 꺼낼 수 있다", () => {
    expect(useScheduleJumpStore.getState().target).toBeNull();
    expect(useScheduleJumpStore.getState().consume()).toBeNull();

    useScheduleJumpStore.getState().request({ date: "2026-11-10", cellId: "cell-1" });
    expect(useScheduleJumpStore.getState().target).toEqual({
      date: "2026-11-10",
      cellId: "cell-1",
    });

    const consumed = useScheduleJumpStore.getState().consume();
    expect(consumed).toEqual({ date: "2026-11-10", cellId: "cell-1" });
    expect(useScheduleJumpStore.getState().target).toBeNull();
    expect(useScheduleJumpStore.getState().consume()).toBeNull();
  });

  it("cellId가 null인 요청도 그대로 전달한다", () => {
    useScheduleJumpStore.getState().request({ date: "2026-11-12", cellId: null });
    expect(useScheduleJumpStore.getState().consume()).toEqual({
      date: "2026-11-12",
      cellId: null,
    });
  });
});

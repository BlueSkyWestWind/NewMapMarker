import { describe, expect, it } from "vitest";
import { classifyApplyError } from "@/features/schedule/lib/apply-error";

describe("classifyApplyError", () => {
  it("메시지에 stale_group이 있으면 stale로 분류한다", () => {
    const err = { code: "P0001", message: "stale_group" };
    expect(classifyApplyError(err)).toEqual({
      kind: "stale",
      message: "stale_group",
    });

    const err2 = new Error("RPC failed: stale_group detected");
    expect(classifyApplyError(err2)).toEqual({
      kind: "stale",
      message: "RPC failed: stale_group detected",
    });
  });

  it("PostgREST/Postgres 함수 없음 코드(PGRST202, 42883)는 missing-function으로 분류한다", () => {
    expect(
      classifyApplyError({ code: "PGRST202", message: "schema cache miss" }),
    ).toEqual({
      kind: "missing-function",
      message: "schema cache miss",
    });

    expect(
      classifyApplyError({ code: "42883", message: "function public.apply_schedule_groups does not exist" }),
    ).toEqual({
      kind: "missing-function",
      message: "function public.apply_schedule_groups does not exist",
    });
  });

  it("메시지에 Could not find the function이 있으면 missing-function으로 분류한다", () => {
    const msg = "Could not find the function public.apply_schedule_groups(p_groups, p_marks) in the schema cache";
    expect(classifyApplyError({ message: msg })).toEqual({
      kind: "missing-function",
      message: msg,
    });
  });

  it("그 밖의 오류는 other로 분류하고 원문 메시지를 보존한다", () => {
    expect(classifyApplyError(new Error("network timeout"))).toEqual({
      kind: "other",
      message: "network timeout",
    });
    expect(classifyApplyError({ message: "permission denied" })).toEqual({
      kind: "other",
      message: "permission denied",
    });
    expect(classifyApplyError("unexpected string error")).toEqual({
      kind: "other",
      message: "unexpected string error",
    });
  });
});

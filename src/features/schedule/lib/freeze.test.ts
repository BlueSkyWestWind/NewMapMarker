import { describe, expect, it } from "vitest";
import {
  freezeBadgesByDate,
  freezeTimeLabel,
  toDbTimestamp,
  toKstLocal,
  validateFreeze,
  type Freeze,
} from "./freeze";

const freeze = (start: string, end: string, reason = "수능"): Freeze => ({
  id: `${start}|${end}`,
  start,
  end,
  reason,
});

describe("toDbTimestamp / toKstLocal", () => {
  it("입력(한국 시각)에 +09:00을 붙여 저장한다", () => {
    expect(toDbTimestamp("2026-11-19T08:10")).toBe("2026-11-19T08:10:00+09:00");
  });

  it("DB의 UTC 시각을 한국 시각으로 되돌린다(브라우저 시간대와 무관)", () => {
    expect(toKstLocal("2026-11-18T15:00:00+00:00")).toBe("2026-11-19T00:00");
    expect(toKstLocal("2026-11-19T09:00:00Z")).toBe("2026-11-19T18:00");
    // 이미 +09:00으로 돌아온 경우도 같은 시각이다.
    expect(toKstLocal("2026-11-19T18:00:00+09:00")).toBe("2026-11-19T18:00");
  });
});

describe("validateFreeze", () => {
  const ok = { start: "2026-11-19T00:00", end: "2026-11-19T18:00", reason: " 수능 " };

  it("올바르면 사유 공백을 다듬어 통과한다", () => {
    expect(validateFreeze(ok)).toEqual({
      ok: true,
      value: { start: "2026-11-19T00:00", end: "2026-11-19T18:00", reason: "수능" },
    });
  });

  it("시작·종료 형식이 틀리면 date 오류다", () => {
    expect(validateFreeze({ ...ok, start: "" })).toEqual({ ok: false, error: "date" });
    expect(validateFreeze({ ...ok, end: "2026-11-19" })).toEqual({ ok: false, error: "date" });
    expect(validateFreeze({ ...ok, start: "2026-02-30T00:00" })).toEqual({ ok: false, error: "date" });
    expect(validateFreeze({ ...ok, end: "2026-11-19T25:00" })).toEqual({ ok: false, error: "date" });
  });

  it("종료가 시작보다 늦어야 한다", () => {
    expect(validateFreeze({ ...ok, end: "2026-11-19T00:00" })).toEqual({ ok: false, error: "order" });
    expect(validateFreeze({ ...ok, end: "2026-11-18T23:00" })).toEqual({ ok: false, error: "order" });
  });

  it("사유가 비었거나 100자를 넘으면 reason 오류다", () => {
    expect(validateFreeze({ ...ok, reason: "   " })).toEqual({ ok: false, error: "reason" });
    expect(validateFreeze({ ...ok, reason: "가".repeat(101) })).toEqual({ ok: false, error: "reason" });
  });
});

describe("freezeTimeLabel", () => {
  it("하루 전체면 종일, 아니면 시작~끝", () => {
    expect(freezeTimeLabel("00:00", "24:00")).toBe("종일");
    expect(freezeTimeLabel("00:00", "18:00")).toBe("00:00~18:00");
    expect(freezeTimeLabel("22:00", "24:00")).toBe("22:00~");
  });

  it("전날부터 이어지는 날은 끝 시각만 보인다", () => {
    expect(freezeTimeLabel("00:00", "07:00", true)).toBe("~ 07:00");
    expect(freezeTimeLabel("00:00", "24:00", true)).toBe("종일");
  });
});

describe("freezeBadgesByDate", () => {
  const dates = ["2026-11-18", "2026-11-19", "2026-11-20"];

  it("하루 안의 기간은 그 날짜에만 시각과 함께 붙는다", () => {
    const map = freezeBadgesByDate([freeze("2026-11-19T08:10", "2026-11-19T18:00")], dates);
    expect(map.get("2026-11-18")).toBeUndefined();
    expect(map.get("2026-11-20")).toBeUndefined();
    expect(map.get("2026-11-19")).toEqual([
      { id: "2026-11-19T08:10|2026-11-19T18:00", reason: "수능", time: "08:10~18:00", title: "수능 · 2026-11-19 08:10 ~ 2026-11-19 18:00" },
    ]);
  });

  it("여러 날에 걸치면 첫날은 시작부터, 중간은 종일, 마지막 날은 끝까지", () => {
    const map = freezeBadgesByDate([freeze("2026-11-18T22:00", "2026-11-20T06:00")], dates);
    expect(map.get("2026-11-18")?.[0].time).toBe("22:00~");
    expect(map.get("2026-11-19")?.[0].time).toBe("종일");
    expect(map.get("2026-11-20")?.[0].time).toBe("~ 06:00");
  });

  it("끝이 다음 날 0시 정각이면 그 다음 날에는 붙지 않는다", () => {
    const map = freezeBadgesByDate([freeze("2026-11-19T00:00", "2026-11-20T00:00")], dates);
    expect(map.get("2026-11-19")?.[0].time).toBe("종일");
    expect(map.get("2026-11-20")).toBeUndefined();
  });

  it("같은 날 여러 기간은 시작 순으로 모두 붙는다", () => {
    const map = freezeBadgesByDate(
      [freeze("2026-11-19T13:00", "2026-11-19T15:00", "점검"), freeze("2026-11-19T08:00", "2026-11-19T10:00", "수능")],
      dates,
    );
    expect(map.get("2026-11-19")?.map((badge) => badge.reason)).toEqual(["수능", "점검"]);
  });
});

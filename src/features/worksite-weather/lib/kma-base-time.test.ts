import { describe, expect, it } from "vitest";
import {
  baseToIsoKst,
  currentKstHhmm,
  getUltraFcstBase,
  getUltraNcstBase,
  getVilageBaseForToday,
  isoDateKst,
  ymdKst,
} from "./kma-base-time";

/** KST 벽시계 시각을 UTC Date로. Workers가 UTC로 도는 상황을 그대로 재현한다. */
function kst(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, m - 1, d, h - 9, min));
}

describe("getVilageBaseForToday", () => {
  it.each([
    ["00:05 — 02시 발표 전이라 전일 23시", kst(2026, 7, 26, 0, 5), "20260725", "2300"],
    ["02:14 — 발표 지연 반영 전", kst(2026, 7, 26, 2, 14), "20260725", "2300"],
    ["02:16 — 02시 발표 제공 시작", kst(2026, 7, 26, 2, 16), "20260726", "0200"],
    ["05:14 — 05시 발표 아직", kst(2026, 7, 26, 5, 14), "20260726", "0200"],
    ["05:16 — 05시 발표 제공 시작", kst(2026, 7, 26, 5, 16), "20260726", "0500"],
    ["23:50 — 하루 종일 05시 발표 유지", kst(2026, 7, 26, 23, 50), "20260726", "0500"],
  ])("%s", (_label, now, baseDate, baseTime) => {
    expect(getVilageBaseForToday(now)).toEqual({ baseDate, baseTime });
  });

  it("오후에 조회해도 05시 발표를 쓴다 — 오전 슬롯 결측 방지 (C7 회귀)", () => {
    // 최신 발표(1400)를 쓰면 07~13시 예보가 응답에 없어 통째로 빈다
    expect(getVilageBaseForToday(kst(2026, 7, 26, 14, 0))).toEqual({
      baseDate: "20260726",
      baseTime: "0500",
    });
    expect(getVilageBaseForToday(kst(2026, 7, 26, 16, 30))).toEqual({
      baseDate: "20260726",
      baseTime: "0500",
    });
  });

  it("연말 자정 직후에도 전일로 정확히 넘어간다", () => {
    expect(getVilageBaseForToday(kst(2026, 1, 1, 0, 5))).toEqual({
      baseDate: "20251231",
      baseTime: "2300",
    });
  });
});

describe("getUltraNcstBase", () => {
  it.each([
    ["14:39 — 관측 제공 전", kst(2026, 7, 26, 14, 39), "20260726", "1300"],
    ["14:40 — 관측 제공", kst(2026, 7, 26, 14, 40), "20260726", "1400"],
    ["00:10 — 전일 23시", kst(2026, 7, 26, 0, 10), "20260725", "2300"],
  ])("%s", (_label, now, baseDate, baseTime) => {
    expect(getUltraNcstBase(now)).toEqual({ baseDate, baseTime });
  });
});

describe("getUltraFcstBase", () => {
  it.each([
    ["14:44 — 직전 30분 발표", kst(2026, 7, 26, 14, 44), "20260726", "1330"],
    ["14:45 — 당시 30분 발표 제공", kst(2026, 7, 26, 14, 45), "20260726", "1430"],
    ["00:10 — 전일 23:30", kst(2026, 7, 26, 0, 10), "20260725", "2330"],
  ])("%s", (_label, now, baseDate, baseTime) => {
    expect(getUltraFcstBase(now)).toEqual({ baseDate, baseTime });
  });
});

describe("KST 날짜 포맷", () => {
  it("UTC 기준 전날이어도 KST 날짜를 낸다", () => {
    // 2026-07-25 20:00 UTC = 2026-07-26 05:00 KST
    const now = new Date(Date.UTC(2026, 6, 25, 20, 0));
    expect(ymdKst(now)).toBe("20260726");
    expect(isoDateKst(now)).toBe("2026-07-26");
    expect(currentKstHhmm(now)).toBe("0500");
  });

  it("발표시각을 KST offset 붙은 ISO로 만든다", () => {
    expect(baseToIsoKst({ baseDate: "20260726", baseTime: "0500" })).toBe(
      "2026-07-26T05:00:00+09:00",
    );
  });
});

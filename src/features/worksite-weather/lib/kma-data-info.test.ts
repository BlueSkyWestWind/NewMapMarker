import { describe, expect, it } from "vitest";
import type { StoredForecast } from "./kma-forecast-store";
import { buildDataInfo, isRecentlyCollected, toDataSource } from "./kma-data-info";

const NOW = new Date("2026-11-13T08:00:00Z"); // KST 17:00

function stored(
  kind: StoredForecast["kind"],
  baseDate: string,
  baseTime: string,
  fetchedAt: string,
  source: StoredForecast["source"] = "prefetch",
): StoredForecast {
  return { kind, items: [], base: { baseDate, baseTime }, fetchedAt, source };
}

describe("toDataSource", () => {
  it("DB 출처를 화면 출처로 바꾼다", () => {
    expect(toDataSource("prefetch")).toBe("auto");
    expect(toDataSource("manual")).toBe("manual");
    expect(toDataSource("user")).toBe("screen");
  });
});

describe("buildDataInfo", () => {
  it("세 종류가 모두 있으면 기준시각 ISO와 가장 최근 수집 시각·출처를 돌려준다", () => {
    const info = buildDataInfo({
      vilage: stored("vilage", "20261113", "0500", "2026-11-13T00:05:00Z"),
      ncst: stored("ncst", "20261113", "1600", "2026-11-13T07:04:00Z", "manual"),
      ufcst: stored("ufcst", "20261113", "1630", "2026-11-13T07:02:00Z"),
    });
    expect(info.missing).toEqual([]);
    expect(info.bases.vilage).toBe("2026-11-13T05:00:00+09:00");
    expect(info.bases.ncst).toBe("2026-11-13T16:00:00+09:00");
    expect(info.bases.ufcst).toBe("2026-11-13T16:30:00+09:00");
    expect(info.collectedAt).toBe("2026-11-13T07:04:00Z");
    expect(info.collectedBy).toBe("manual");
  });

  it("일부만 있으면 없는 종류를 missing에 담고 그 기준시각은 null이다", () => {
    const info = buildDataInfo({ ncst: stored("ncst", "20261113", "1600", "2026-11-13T07:04:00Z") });
    expect(info.missing).toEqual(["vilage", "ufcst"]);
    expect(info.bases.vilage).toBeNull();
    expect(info.bases.ufcst).toBeNull();
    expect(info.bases.ncst).not.toBeNull();
  });

  it("하나도 없으면 수집 시각·출처가 null이고 세 종류가 모두 missing이다", () => {
    const info = buildDataInfo({});
    expect(info.collectedAt).toBeNull();
    expect(info.collectedBy).toBeNull();
    expect(info.missing).toEqual(["vilage", "ncst", "ufcst"]);
    expect(info.bases).toEqual({ vilage: null, ncst: null, ufcst: null });
  });
});

describe("isRecentlyCollected", () => {
  const FIVE_MIN = 5 * 60 * 1000;

  it("어느 종류든 5분 안에 저장됐으면 true", () => {
    const s = { ncst: stored("ncst", "20261113", "1600", "2026-11-13T07:57:00Z") }; // 3분 전
    expect(isRecentlyCollected(s, NOW, FIVE_MIN)).toBe(true);
  });

  it("전부 오래됐으면 false", () => {
    const s = {
      vilage: stored("vilage", "20261113", "0500", "2026-11-13T00:05:00Z"),
      ncst: stored("ncst", "20261113", "1600", "2026-11-13T07:30:00Z"),
    };
    expect(isRecentlyCollected(s, NOW, FIVE_MIN)).toBe(false);
  });

  it("정확히 5분 전은 false(경계)", () => {
    const s = { ncst: stored("ncst", "20261113", "1600", "2026-11-13T07:55:00Z") };
    expect(isRecentlyCollected(s, NOW, FIVE_MIN)).toBe(false);
  });

  it("저장분이 없으면 false", () => {
    expect(isRecentlyCollected({}, NOW, FIVE_MIN)).toBe(false);
  });
});

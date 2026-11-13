import { describe, expect, it } from "vitest";
import type { WeatherDataInfo } from "@/features/worksite-weather/types/weather";
import { formatDataInfoLabel } from "./data-info-label";

const NOW = new Date("2026-11-13T08:00:00Z"); // KST 17:00

function info(over: Partial<WeatherDataInfo> = {}): WeatherDataInfo {
  return {
    bases: {
      vilage: "2026-11-13T05:00:00+09:00",
      ncst: "2026-11-13T16:00:00+09:00",
      ufcst: "2026-11-13T16:30:00+09:00",
    },
    collectedAt: "2026-11-13T07:04:00Z", // KST 16:04
    collectedBy: "auto",
    missing: [],
    ...over,
  };
}

describe("formatDataInfoLabel", () => {
  it("실황 기준시각과 수집 시각, 출처를 한 줄로 보여 준다", () => {
    expect(formatDataInfoLabel(info(), NOW)).toEqual({
      text: "기준 16:00 · 수집 16:04 자동",
      isStale: false,
      isMissing: false,
    });
  });

  it("출처 이름: auto는 자동, manual은 수동, screen은 화면 조회", () => {
    expect(formatDataInfoLabel(info({ collectedBy: "manual" }), NOW).text).toContain("수동");
    expect(formatDataInfoLabel(info({ collectedBy: "screen" }), NOW).text).toContain("화면 조회");
  });

  it("단기예보 저장분이 없으면 저장된 자료 없음", () => {
    const r = formatDataInfoLabel(
      info({ missing: ["vilage", "ncst", "ufcst"], bases: { vilage: null, ncst: null, ufcst: null }, collectedAt: null, collectedBy: null }),
      NOW,
    );
    expect(r).toEqual({ text: "저장된 자료 없음", isStale: false, isMissing: true });
  });

  it("실황 기준이 3시간 이상 오래되면 경고와 N시간 전 자료를 붙인다", () => {
    const old = info({ bases: { vilage: "2026-11-13T05:00:00+09:00", ncst: "2026-11-13T13:00:00+09:00", ufcst: null } });
    const r = formatDataInfoLabel(old, NOW); // 4시간 전
    expect(r.isStale).toBe(true);
    expect(r.text).toContain("4시간 전 자료");
  });

  it("2시간 59분 전은 오래된 것이 아니다", () => {
    const edge = info({ bases: { vilage: "2026-11-13T05:00:00+09:00", ncst: "2026-11-13T14:01:00+09:00", ufcst: null } });
    expect(formatDataInfoLabel(edge, NOW).isStale).toBe(false);
  });

  it("실황이 없고 단기예보만 있으면 단기예보 기준시각을 쓰고 오래됨은 판단하지 않는다", () => {
    const r = formatDataInfoLabel(info({ missing: ["ncst", "ufcst"], bases: { vilage: "2026-11-13T05:00:00+09:00", ncst: null, ufcst: null } }), NOW);
    expect(r.text).toContain("기준 05:00");
    expect(r.isStale).toBe(false);
    expect(r.isMissing).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { Verdict, WeatherSlot } from "@/features/worksite-weather/types/weather";
import {
  alertVerdict,
  alertsVerdict,
  buildHazardSummary,
  coldVerdict,
  evaluateSlot,
  findRecommendedWindows,
  heatVerdict,
  overallVerdict,
  rainVerdict,
  windVerdict,
  worstVerdict,
} from "./verdict";

function slot(time: string, verdict: Verdict, over: Partial<WeatherSlot> = {}): WeatherSlot {
  return {
    time,
    source: "vilage",
    temp: 28,
    apparent: 30,
    humidity: 70,
    windSpeed: 2,
    windDeg: 180,
    windDir: "남",
    windLabel: "약함",
    pop: 10,
    pty: "없음",
    pcp: 0,
    pcpLabel: "없음",
    sno: 0,
    snoLabel: "없음",
    sky: "맑음",
    verdict,
    reasons: [],
    ...over,
  };
}

describe("heatVerdict — 법정 임계값", () => {
  it.each([
    [30.9, "safe"],
    [31, "caution"],
    [32.9, "caution"],
    [33, "warning"],
    [35, "danger"],
    [37.9, "danger"],
    [38, "stop"],
  ])("체감 %d℃ → %s", (apparent, expected) => {
    expect(heatVerdict(apparent)).toBe(expected);
  });

  it("결측은 판정 불가", () => {
    expect(heatVerdict(null)).toBe("unknown");
  });
});

describe("coldVerdict", () => {
  it.each([
    [0, "safe"],
    [-0.1, "caution"],
    [-4.9, "caution"],
    [-5, "warning"],
    [-9.9, "warning"],
    [-10, "stop"],
  ])("체감 %d℃ → %s", (apparent, expected) => {
    expect(coldVerdict(apparent)).toBe(expected);
  });
});

describe("windVerdict — 제383조 10m/s", () => {
  it.each([
    [3.9, "safe"],
    [4, "caution"],
    [7, "warning"],
    [9.9, "warning"],
    [10, "stop"],
  ])("지상 %d m/s → %s", (ms, expected) => {
    expect(windVerdict(ms, "ground")).toBe(expected);
  });

  it("고소 작업은 한 단계 엄격", () => {
    expect(windVerdict(4, "elevated")).toBe("warning");
    expect(windVerdict(7, "elevated")).toBe("danger");
    expect(windVerdict(10, "elevated")).toBe("stop");
  });

  it("무풍 구간까지 경보를 올리지는 않는다", () => {
    expect(windVerdict(3.9, "elevated")).toBe("safe");
  });
});

describe("rainVerdict", () => {
  it("1mm 이상은 중지", () => {
    expect(rainVerdict({ pop: 0, pcp: 1, sno: 0, isSnow: false })).toBe("stop");
  });

  it("1mm 미만(0.99)은 중지가 아니다", () => {
    expect(rainVerdict({ pop: 10, pcp: 0.99, sno: 0, isSnow: false })).toBe("safe");
  });

  it("신적설 1cm 이상은 중지", () => {
    expect(rainVerdict({ pop: 0, pcp: 0, sno: 1, isSnow: true })).toBe("stop");
  });

  it("강수확률 구간", () => {
    expect(rainVerdict({ pop: 29, pcp: 0, sno: 0, isSnow: false })).toBe("safe");
    expect(rainVerdict({ pop: 30, pcp: 0, sno: 0, isSnow: false })).toBe("caution");
    expect(rainVerdict({ pop: 60, pcp: 0, sno: 0, isSnow: false })).toBe("warning");
  });

  it("눈은 노면 결빙 때문에 경고까지 올린다", () => {
    expect(rainVerdict({ pop: 10, pcp: 0, sno: 0, isSnow: true })).toBe("warning");
  });
});

describe("worstVerdict", () => {
  it("더 위험한 쪽을 고른다", () => {
    expect(worstVerdict("caution", "stop")).toBe("stop");
    expect(worstVerdict("danger", "warning")).toBe("danger");
  });

  it("unknown은 실제 등급을 덮지 않는다", () => {
    expect(worstVerdict("unknown", "caution")).toBe("caution");
    expect(worstVerdict("safe", "unknown")).toBe("safe");
  });
});

describe("evaluateSlot", () => {
  const base = {
    time: "1500",
    temp: 32,
    apparent: 36.1,
    windSpeed: 11.2,
    pop: 60,
    pcp: 1.5,
    pcpLabel: "1.0~29.9mm",
    sno: 0,
    snoLabel: "없음",
    isSnow: false,
    workType: "elevated" as const,
  };

  it("가장 위험한 항목이 최종 판정을 결정한다", () => {
    const result = evaluateSlot(base);
    expect(result.verdict).toBe("stop");
    expect(result.reasons).toContain("체감온도 36.1℃");
    expect(result.reasons).toContain("풍속 11.2m/s (고소작업 가중)");
    expect(result.reasons).toContain("강수량 1.0~29.9mm");
  });

  it("전 항목 양호하면 safe이고 사유가 없다", () => {
    const result = evaluateSlot({
      ...base,
      temp: 22,
      apparent: 22,
      windSpeed: 1.5,
      pop: 10,
      pcp: 0,
      pcpLabel: "없음",
    });
    expect(result.verdict).toBe("safe");
    expect(result.reasons).toHaveLength(0);
  });

  it("필수 항목 전부 결측이면 추정하지 않고 unknown", () => {
    const result = evaluateSlot({
      ...base,
      temp: null,
      apparent: null,
      windSpeed: null,
      pop: null,
      pcp: 0,
      pcpLabel: "없음",
    });
    expect(result.verdict).toBe("unknown");
    expect(result.reasons).toEqual(["예보 결측"]);
  });
});

describe("overallVerdict", () => {
  it("가장 위험한 시간대를 종합 판정으로 삼는다", () => {
    expect(
      overallVerdict([slot("0700", "safe"), slot("1300", "caution"), slot("1500", "stop")]),
    ).toBe("stop");
  });

  it("전부 결측이면 unknown", () => {
    expect(overallVerdict([slot("0700", "unknown"), slot("0800", "unknown")])).toBe("unknown");
  });
});

describe("findRecommendedWindows", () => {
  it("아직 지나지 않은 연속 가능 구간을 뽑는다", () => {
    const slots = [
      slot("0700", "safe"),
      slot("0800", "safe"),
      slot("0900", "caution"),
      slot("1000", "danger"),
      slot("1100", "safe"),
    ];
    expect(findRecommendedWindows(slots, "0700")).toEqual([
      { from: "07:00", to: "09:00", note: "" },
      { from: "11:00", to: "11:00", note: "1시간 구간" },
    ]);
  });

  it("경과한 시간대는 권장 구간에 넣지 않는다", () => {
    const slots = [slot("0700", "safe"), slot("0800", "safe"), slot("1500", "safe")];
    expect(findRecommendedWindows(slots, "1200")).toEqual([
      { from: "15:00", to: "15:00", note: "1시간 구간" },
    ]);
  });

  it("가능한 구간이 없으면 빈 배열", () => {
    expect(findRecommendedWindows([slot("1500", "stop")], "0700")).toEqual([]);
  });
});

describe("buildHazardSummary", () => {
  it("항목별 최댓값과 시각을 뽑는다", () => {
    const slots = [
      slot("1400", "danger", { temp: 31.8, apparent: 35.8, windSpeed: 6.4, pop: 40 }),
      slot("1500", "stop", {
        temp: 32,
        apparent: 36.1,
        windSpeed: 11.2,
        pop: 60,
        pcp: 1.5,
        pcpLabel: "1.0~29.9mm",
      }),
    ];
    const summary = buildHazardSummary(slots, "ground");

    expect(summary.heat.peak).toBe(36.1);
    expect(summary.heat.peakTime).toBe("15:00");
    expect(summary.wind.peak).toBe(11.2);
    expect(summary.wind.level).toBe("stop");
    expect(summary.rain.level).toBe("stop");
    expect(summary.cold.level).toBe("none");
    expect(summary.cold.note).toBe("해당 없음");
  });

  it("무더위 시간대에 위험이면 14~17시 중지 문구를 낸다", () => {
    const summary = buildHazardSummary(
      [slot("1500", "danger", { temp: 32, apparent: 35.5 })],
      "ground",
    );
    expect(summary.heat.note).toContain("14~17시 옥외작업 중지");
  });
});

describe("alertVerdict — 특보 종류별 반영 강도", () => {
  it("호우·강풍·대설·태풍·한파 특보는 그 자체가 중지 사유", () => {
    for (const type of ["호우", "강풍", "대설", "태풍", "한파"]) {
      expect(alertVerdict(type, "주의보")).toBe("stop");
      expect(alertVerdict(type, "경보")).toBe("stop");
    }
  });

  it("폭염은 체감온도 판정이 주도하므로 한 단계 낮춰 반영한다", () => {
    expect(alertVerdict("폭염", "주의보")).toBe("warning");
    expect(alertVerdict("폭염", "경보")).toBe("danger");
    expect(alertVerdict("폭염", "중대경보")).toBe("danger");
  });

  it("여름철 폭염경보만으로 전 국소가 중지로 표시되지 않는다 (오경보 방지)", () => {
    expect(alertVerdict("폭염", "경보")).not.toBe("stop");
  });

  it("열대야는 야간 현상이라 주의까지만", () => {
    expect(alertVerdict("열대야", "주의보")).toBe("caution");
  });

  it("건조·황사·풍랑은 등급을 올리지 않는다", () => {
    expect(alertVerdict("건조", "경보")).toBe("safe");
    expect(alertVerdict("풍랑", "경보")).toBe("safe");
  });

  it("여러 특보 중 가장 강한 것이 반영된다", () => {
    expect(
      alertsVerdict([
        { type: "폭염", level: "경보" },
        { type: "호우", level: "주의보" },
      ]),
    ).toBe("stop");
  });

  it("특보가 없으면 등급을 올리지 않는다", () => {
    expect(alertsVerdict([])).toBe("safe");
  });
});

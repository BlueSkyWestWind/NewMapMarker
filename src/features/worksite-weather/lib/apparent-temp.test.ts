import { describe, expect, it } from "vitest";
import { apparentTemp, heatIndexSummer, round1, windChillWinter } from "./apparent-temp";

describe("heatIndexSummer", () => {
  it("습도가 높을수록 체감온도가 올라간다", () => {
    const dry = heatIndexSummer(31, 50);
    const humid = heatIndexSummer(31, 80);
    expect(humid).toBeGreaterThan(dry);
  });

  it("같은 습도에서 기온이 오르면 체감온도도 오른다", () => {
    expect(heatIndexSummer(33, 70)).toBeGreaterThan(heatIndexSummer(31, 70));
  });

  it("기온 31℃·습도 80%는 법정 주의(31℃) 기준을 넘는다", () => {
    expect(heatIndexSummer(31, 80)).toBeGreaterThan(31);
  });
});

describe("windChillWinter", () => {
  it("바람이 강할수록 체감온도가 내려간다", () => {
    expect(windChillWinter(0, 10)).toBeLessThan(windChillWinter(0, 2));
  });

  it("적용 범위 밖(기온 > 10℃)이면 기온을 그대로 쓴다", () => {
    expect(windChillWinter(12, 10)).toBe(12);
  });

  it("풍속 하한(1.3m/s) 미만이면 기온을 그대로 쓴다", () => {
    expect(windChillWinter(0, 1.2)).toBe(0);
    expect(windChillWinter(0, 1.4)).not.toBe(0);
  });
});

describe("apparentTemp 분기 경계", () => {
  it("25℃ 이상은 여름 공식", () => {
    expect(apparentTemp(25, 60, 2).type).toBe("heat");
  });

  it("10℃ 이하는 겨울 공식", () => {
    expect(apparentTemp(10, 60, 3).type).toBe("cold");
  });

  it("10℃ 초과 25℃ 미만은 기온 그대로", () => {
    const result = apparentTemp(18, 60, 3);
    expect(result.type).toBe("normal");
    expect(result.value).toBe(18);
  });

  it("경계값 24.9 / 25.0 / 10.0 / 10.1", () => {
    expect(apparentTemp(24.9, 60, 2).type).toBe("normal");
    expect(apparentTemp(25.0, 60, 2).type).toBe("heat");
    expect(apparentTemp(10.0, 60, 2).type).toBe("cold");
    expect(apparentTemp(10.1, 60, 2).type).toBe("normal");
  });
});

describe("round1", () => {
  it("소수 1자리로 반올림", () => {
    expect(round1(36.14)).toBe(36.1);
    expect(round1(36.15)).toBe(36.2);
    expect(round1(-5.55)).toBe(-5.5);
  });
});

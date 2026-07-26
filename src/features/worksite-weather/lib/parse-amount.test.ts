import { describe, expect, it } from "vitest";
import { RAIN_THRESHOLDS } from "@/features/worksite-weather/constants/thresholds";
import { isSnowLike, parseAmount, ptyText, skyText, toNumberOrNull } from "./parse-amount";

describe("parseAmount", () => {
  it("강수/적설 없음은 0", () => {
    expect(parseAmount("강수없음")).toEqual({ max: 0, label: "없음" });
    expect(parseAmount("적설없음")).toEqual({ max: 0, label: "없음" });
    expect(parseAmount("")).toEqual({ max: 0, label: "없음" });
    expect(parseAmount(null)).toEqual({ max: 0, label: "없음" });
    expect(parseAmount(undefined)).toEqual({ max: 0, label: "없음" });
  });

  it("'미만'은 임계값 직전값 — 1mm 기준에 걸리면 안 된다", () => {
    const pcp = parseAmount("1.0mm 미만");
    expect(pcp.max).toBeCloseTo(0.99, 5);
    expect(pcp.max).toBeLessThan(RAIN_THRESHOLDS.pcpStop);
    expect(pcp.label).toBe("1.0mm 미만");

    const sno = parseAmount("1.0cm 미만");
    expect(sno.max).toBeLessThan(RAIN_THRESHOLDS.snoStop);
  });

  it("범위값은 상한을 채택한다 (위험 과소평가 방지)", () => {
    expect(parseAmount("1.0~29.9mm").max).toBe(29.9);
    expect(parseAmount("30.0~50.0mm").max).toBe(50);
    expect(parseAmount("1.0~4.9cm").max).toBe(4.9);
  });

  it("'이상'은 하한이 최소 보장치", () => {
    expect(parseAmount("50.0mm 이상").max).toBe(50);
    expect(parseAmount("5.0cm 이상").max).toBe(5);
  });

  it("원문을 표시용으로 보존한다", () => {
    expect(parseAmount("30.0~50.0mm").label).toBe("30.0~50.0mm");
  });

  it("초단기 RN1처럼 수치가 그대로 오면 그대로 쓴다", () => {
    expect(parseAmount(2.5)).toEqual({ max: 2.5, label: "2.5" });
    expect(parseAmount("2.5")).toEqual({ max: 2.5, label: "2.5" });
  });

  it("판정 경계 — 1mm 기준 통과/중지가 갈린다", () => {
    expect(parseAmount("1.0mm 미만").max >= RAIN_THRESHOLDS.pcpStop).toBe(false);
    expect(parseAmount("1.0~29.9mm").max >= RAIN_THRESHOLDS.pcpStop).toBe(true);
  });
});

describe("코드 → 텍스트", () => {
  it("강수형태", () => {
    expect(ptyText("0")).toBe("없음");
    expect(ptyText("1")).toBe("비");
    expect(ptyText("3")).toBe("눈");
    expect(ptyText("99")).toBe("없음");
  });

  it("눈 계열 판별 — 노면 결빙 경고 분기", () => {
    expect(isSnowLike("3")).toBe(true);
    expect(isSnowLike("2")).toBe(true);
    expect(isSnowLike("1")).toBe(false);
    expect(isSnowLike("0")).toBe(false);
  });

  it("하늘상태", () => {
    expect(skyText("1")).toBe("맑음");
    expect(skyText("4")).toBe("흐림");
    expect(skyText(null)).toBe("-");
  });
});

describe("toNumberOrNull", () => {
  it("파싱 불가는 null — 추정값을 만들지 않는다", () => {
    expect(toNumberOrNull("31.4")).toBe(31.4);
    expect(toNumberOrNull("")).toBeNull();
    expect(toNumberOrNull(null)).toBeNull();
    expect(toNumberOrNull("강수없음")).toBeNull();
  });
});

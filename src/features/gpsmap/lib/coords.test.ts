import { describe, expect, it } from "vitest";
import {
  detectInputType,
  dmsToDecimal,
  makeGoogleSearchCoordinate,
  parseCoords,
  splitDmsParts,
  validateKoreaCoordPair,
} from "./coords";

describe("validateKoreaCoordPair", () => {
  it("(lat, lon) 순서는 그대로 반환", () => {
    expect(validateKoreaCoordPair(37.5, 127.0)).toEqual({ lat: 37.5, lon: 127.0 });
  });

  it("(lon, lat) 순서는 자동으로 바로잡음", () => {
    expect(validateKoreaCoordPair(127.0, 37.5)).toEqual({ lat: 37.5, lon: 127.0 });
  });

  it("한국 범위를 벗어나면 null", () => {
    expect(validateKoreaCoordPair(10, 10)).toBeNull();
  });

  it("숫자가 아니면 null", () => {
    expect(validateKoreaCoordPair("abc", 127)).toBeNull();
  });
});

describe("dmsToDecimal", () => {
  it("도분초를 십진수로 변환", () => {
    expect(dmsToDecimal("37 34 46")).toBeCloseTo(37.579444, 5);
  });

  it("음수 도 부호 유지", () => {
    expect(dmsToDecimal("-37 30 0")).toBeCloseTo(-37.5, 6);
  });

  it("숫자가 없으면 null", () => {
    expect(dmsToDecimal("없음")).toBeNull();
  });
});

describe("parseCoords", () => {
  it("십진수 쌍을 파싱", () => {
    expect(parseCoords("37.5, 127.0")).toEqual({ lat: 37.5, lon: 127.0 });
  });

  it("라벨이 붙은 좌표 파싱", () => {
    expect(parseCoords("위도 37.5 경도 127.0")).toEqual({ lat: 37.5, lon: 127.0 });
  });

  it("좌표 키워드 없는 한글은 주소로 간주해 null", () => {
    expect(parseCoords("서울특별시 중구")).toBeNull();
  });

  it("빈 문자열은 null", () => {
    expect(parseCoords("")).toBeNull();
  });
});

describe("splitDmsParts", () => {
  it("초 반올림이 60이 되면 분으로 올림", () => {
    const parts = splitDmsParts(37.999999999);
    expect(parts).not.toBeNull();
    expect(Number(parts!.s)).toBeLessThan(60);
    expect(Number(parts!.m)).toBeLessThan(60);
  });

  it("유한하지 않은 값은 null", () => {
    expect(splitDmsParts(Number.NaN)).toBeNull();
  });
});

describe("makeGoogleSearchCoordinate", () => {
  it("N/E 방향 문자열 생성", () => {
    const result = makeGoogleSearchCoordinate(37.5, 127.0);
    expect(result).toContain("N");
    expect(result).toContain("E");
  });

  it("남반구/서반구는 S/W", () => {
    const result = makeGoogleSearchCoordinate(-1, -1);
    expect(result).toContain("S");
    expect(result).toContain("W");
  });
});

describe("detectInputType", () => {
  it("좌표는 coord", () => {
    expect(detectInputType("37.5, 127.0")).toBe("coord");
  });

  it("주소는 address", () => {
    expect(detectInputType("서울특별시 중구")).toBe("address");
  });
});

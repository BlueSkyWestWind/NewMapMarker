import { describe, expect, it } from "vitest";
import { MAX_SIZE, parseStaticMapParams } from "./params";

describe("parseStaticMapParams", () => {
  it("정상 파라미터를 그대로 파싱한다", () => {
    const params = new URLSearchParams("lat=37.5&lng=127&level=3&width=600&height=400");
    expect(parseStaticMapParams(params)).toEqual({
      lat: 37.5,
      lng: 127,
      level: 3,
      width: 600,
      height: 400,
      mapType: "SKYVIEW",
    });
  });

  it("lat이 숫자가 아니면 기존 400 오류 문구를 돌려준다", () => {
    const params = new URLSearchParams("lat=abc&lng=127");
    expect(parseStaticMapParams(params)).toEqual({
      error: "lat, lng 파라미터가 필요합니다.",
    });
  });

  it("level·width·height가 숫자가 아니면 기본값(3, 600, 400)으로 대체한다", () => {
    const params = new URLSearchParams("lat=37.5&lng=127&level=abc&width=abc&height=abc");
    expect(parseStaticMapParams(params)).toEqual({
      lat: 37.5,
      lng: 127,
      level: 3,
      width: 600,
      height: 400,
      mapType: "SKYVIEW",
    });
  });

  it("width가 MAX_SIZE를 넘으면 상한으로 자른다", () => {
    const params = new URLSearchParams("lat=37.5&lng=127&width=99999");
    expect(parseStaticMapParams(params)).toMatchObject({
      width: MAX_SIZE,
    });
  });

  it("width가 홀수이면 짝수로 내린다", () => {
    const params = new URLSearchParams("lat=37.5&lng=127&width=601");
    expect(parseStaticMapParams(params)).toMatchObject({
      width: 600,
    });
  });

  it("mapType이 roadmap이면 ROADMAP, 그 밖은 SKYVIEW다", () => {
    expect(parseStaticMapParams(new URLSearchParams("lat=37.5&lng=127&mapType=roadmap"))).toMatchObject({
      mapType: "ROADMAP",
    });
    expect(parseStaticMapParams(new URLSearchParams("lat=37.5&lng=127&mapType=other"))).toMatchObject({
      mapType: "SKYVIEW",
    });
  });
});

import { describe, expect, it } from "vitest";
import { isGridInKorea, toGrid } from "./grid";

describe("toGrid", () => {
  // CR-004 §9 대조표 + 기상청 공표값
  it.each([
    ["전남 순천시", 34.9506, 127.4872, 70, 70],
    ["광주광역시", 35.1595, 126.8526, 58, 74],
    ["전남 목포시", 34.8118, 126.3922, 50, 67],
    ["전남 여수시", 34.7604, 127.6622, 73, 66],
    ["서울시청", 37.5665, 126.978, 60, 127],
  ])("%s → (%d, %d)", (_name, lat, lng, nx, ny) => {
    expect(toGrid(lat, lng)).toEqual({ nx, ny });
  });

  it("같은 좌표는 항상 같은 격자를 낸다 (저장 대신 재계산해도 안전)", () => {
    expect(toGrid(34.9506, 127.4872)).toEqual(toGrid(34.9506, 127.4872));
  });
});

describe("isGridInKorea", () => {
  it("국내 좌표는 통과", () => {
    expect(isGridInKorea(toGrid(35.1595, 126.8526))).toBe(true);
  });

  it("국외 좌표는 거른다", () => {
    expect(isGridInKorea(toGrid(35.6895, 139.6917))).toBe(false); // 도쿄
  });
});

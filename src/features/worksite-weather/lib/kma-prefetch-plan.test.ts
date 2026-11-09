import { describe, expect, it } from "vitest";
import {
  currentBases,
  isPrefetchTokenValid,
  isPrefetchWindow,
  pickGridsToFetch,
  uniqueGrids,
  type StoredKey,
} from "./kma-prefetch-plan";

describe("isPrefetchWindow", () => {
  it("07시 전(06:59:59 KST)은 창 밖", () => {
    expect(isPrefetchWindow(new Date("2026-11-09T21:59:59Z"))).toBe(false);
  });

  it("07:00 KST부터 창 안", () => {
    expect(isPrefetchWindow(new Date("2026-11-09T22:00:00Z"))).toBe(true);
  });

  it("17:59:59 KST까지 창 안", () => {
    expect(isPrefetchWindow(new Date("2026-11-10T08:59:59Z"))).toBe(true);
  });

  it("18:00 KST는 창 밖", () => {
    expect(isPrefetchWindow(new Date("2026-11-10T09:00:00Z"))).toBe(false);
  });
});

describe("uniqueGrids", () => {
  it("같은 격자로 떨어지는 점은 하나로 합친다", () => {
    const grids = uniqueGrids([
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.5666, lng: 126.9781 },
    ]);
    expect(grids).toHaveLength(1);
  });

  it("좌표가 없거나 숫자가 아니거나 국외인 점은 건너뛴다", () => {
    const grids = uniqueGrids([
      { lat: null, lng: 127 },
      { lat: 37, lng: null },
      { lat: Number.NaN, lng: 127 },
      { lat: 35.68, lng: 139.69 }, // 도쿄
      { lat: 37.5665, lng: 126.978 },
    ]);
    expect(grids).toHaveLength(1);
  });

  it("nx, ny 오름차순으로 정렬한다", () => {
    const grids = uniqueGrids([
      { lat: 35.1796, lng: 129.0756 }, // 부산
      { lat: 37.5665, lng: 126.978 }, // 서울
      { lat: 33.4996, lng: 126.5312 }, // 제주
    ]);
    const sorted = [...grids].sort((a, b) => a.nx - b.nx || a.ny - b.ny);
    expect(grids).toEqual(sorted);
    expect(grids).toHaveLength(3);
  });
});

describe("pickGridsToFetch", () => {
  const grids = [
    { nx: 1, ny: 1 },
    { nx: 2, ny: 2 },
    { nx: 3, ny: 3 },
  ];

  it("저장분이 없으면 모든 격자의 세 kind가 빠진 것으로 본다", () => {
    const picked = pickGridsToFetch(grids, [], 10);
    expect(picked).toHaveLength(3);
    expect(picked[0].kinds).toEqual(["vilage", "ncst", "ufcst"]);
  });

  it("세 kind를 모두 가진 격자는 제외한다", () => {
    const stored: StoredKey[] = [
      { nx: 1, ny: 1, kind: "vilage" },
      { nx: 1, ny: 1, kind: "ncst" },
      { nx: 1, ny: 1, kind: "ufcst" },
    ];
    const picked = pickGridsToFetch(grids, stored, 10);
    expect(picked.map((p) => p.nx)).toEqual([2, 3]);
  });

  it("단기예보만 있는 격자는 실황과 초단기만 빠진 것으로 본다", () => {
    const picked = pickGridsToFetch(grids, [{ nx: 2, ny: 2, kind: "vilage" }], 10);
    const second = picked.find((p) => p.nx === 2);
    expect(second?.kinds).toEqual(["ncst", "ufcst"]);
  });

  it("limit 개수만 돌려주고 입력 순서를 지킨다", () => {
    const picked = pickGridsToFetch(grids, [], 2);
    expect(picked.map((p) => p.nx)).toEqual([1, 2]);
  });
});

describe("isPrefetchTokenValid", () => {
  it("같은 토큰은 통과", () => {
    expect(isPrefetchTokenValid("abc", "abc")).toBe(true);
  });

  it("다른 토큰은 거부", () => {
    expect(isPrefetchTokenValid("abd", "abc")).toBe(false);
  });

  it("서버 토큰이 없거나 비어 있으면 무엇이든 거부", () => {
    expect(isPrefetchTokenValid("abc", undefined)).toBe(false);
    expect(isPrefetchTokenValid("abc", "")).toBe(false);
    expect(isPrefetchTokenValid("", "")).toBe(false);
  });

  it("보낸 토큰이 없으면 거부", () => {
    expect(isPrefetchTokenValid(null, "abc")).toBe(false);
  });

  it("길이가 다르면 거부", () => {
    expect(isPrefetchTokenValid("abcd", "abc")).toBe(false);
    expect(isPrefetchTokenValid("ab", "abc")).toBe(false);
  });
});

describe("currentBases", () => {
  it("KST 10:20의 기준시각 세 종류를 돌려준다", () => {
    const bases = currentBases(new Date("2026-11-09T01:20:00Z"));
    expect(bases.vilage.baseTime).toBe("0500");
    expect(bases.ncst.baseTime).toBe("0900");
    expect(bases.ufcst.baseTime).toBe("0930");
  });
});

import { describe, expect, it } from "vitest";
import { costCycle, costOpenPath, nearestNeighborOrder, solveTsp, twoOptImprove } from "./solve-tsp";

// 0=출발지, 나머지는 일부러 뒤섞인 순서로 배치해 최적화가 되는지 본다.
// 실제 좌표: 0=(0,0) 1=(3,0) 2=(3,3) 3=(0,3) — 사각형 둘레.
const SQUARE_MATRIX = [
  [0, 3, Math.hypot(3, 3), 3],
  [3, 0, 3, Math.hypot(3, 3)],
  [Math.hypot(3, 3), 3, 0, 3],
  [3, Math.hypot(3, 3), 3, 0],
];

describe("costOpenPath / costCycle", () => {
  it("open path는 복귀 비용을 포함하지 않는다", () => {
    const order = [0, 1, 2, 3];
    expect(costOpenPath(order, SQUARE_MATRIX)).toBeCloseTo(3 + 3 + 3, 5);
  });

  it("cycle은 복귀 비용을 포함한다", () => {
    const order = [0, 1, 2, 3];
    expect(costCycle(order, SQUARE_MATRIX)).toBeCloseTo(3 + 3 + 3 + 3, 5);
  });
});

describe("nearestNeighborOrder", () => {
  it("출발지를 포함해 모든 지점을 정확히 1회 방문한다", () => {
    const order = nearestNeighborOrder(SQUARE_MATRIX);
    expect(order[0]).toBe(0);
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
  });

  it("지점이 1개면 자기 자신만 반환한다", () => {
    expect(nearestNeighborOrder([[0]])).toEqual([0]);
  });
});

describe("twoOptImprove", () => {
  it("초기 NN 결과보다 나빠지지 않는다(open path)", () => {
    // 일부러 나쁜 초기 순서: 0 -> 2(대각선) -> 1 -> 3
    const badOrder = [0, 2, 1, 3];
    const improved = twoOptImprove(badOrder, SQUARE_MATRIX, costOpenPath);
    expect(costOpenPath(improved, SQUARE_MATRIX)).toBeLessThanOrEqual(
      costOpenPath(badOrder, SQUARE_MATRIX) + 1e-9,
    );
  });

  it("출발지(index 0)는 항상 첫 자리에 고정된다", () => {
    const improved = twoOptImprove([0, 2, 1, 3], SQUARE_MATRIX, costCycle);
    expect(improved[0]).toBe(0);
  });
});

describe("solveTsp", () => {
  it("방문 지점이 1개 이하면 최적화를 생략한다", () => {
    expect(solveTsp([[0]], { roundTrip: false })).toEqual([0]);
    expect(solveTsp([[0, 5], [5, 0]], { roundTrip: false })).toEqual([0, 1]);
  });

  it("편도(open path)와 왕복(cycle)이 모두 전 지점을 포함한다", () => {
    const openOrder = solveTsp(SQUARE_MATRIX, { roundTrip: false });
    const cycleOrder = solveTsp(SQUARE_MATRIX, { roundTrip: true });
    expect([...openOrder].sort()).toEqual([0, 1, 2, 3]);
    expect([...cycleOrder].sort()).toEqual([0, 1, 2, 3]);
    expect(openOrder[0]).toBe(0);
    expect(cycleOrder[0]).toBe(0);
  });
});

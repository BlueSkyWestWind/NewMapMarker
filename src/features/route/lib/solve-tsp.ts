/**
 * 방문 순서 근사 최적화 — Nearest Neighbor + 2-opt (Haversine 거리행렬 기준).
 * §9.1: Ver 2.2는 A안(Haversine)만 구현한다. 실도로 거리행렬(B안)은 Ver 2.3 후보.
 *
 * matrix[0]은 항상 출발지다. 반환하는 order도 항상 order[0] === 0으로 시작한다
 * (출발지 고정). §10.1: 편도/왕복 비용 함수를 분리해 둔다.
 */

/** 시작점 고정 open path 비용 — 마지막 지점에서 출발지로 되돌아가는 비용을 포함하지 않는다. */
export function costOpenPath(order: number[], matrix: number[][]): number {
  let total = 0;
  for (let i = 0; i + 1 < order.length; i += 1) {
    total += matrix[order[i]][order[i + 1]];
  }
  return total;
}

/** 시작점 고정 cycle 비용 — 마지막 지점에서 출발지로 되돌아가는 비용까지 포함한다. */
export function costCycle(order: number[], matrix: number[][]): number {
  if (order.length < 2) return 0;
  return costOpenPath(order, matrix) + matrix[order[order.length - 1]][order[0]];
}

/** 출발지(0)부터 그리디로 가장 가까운 미방문 지점을 이어붙인다. */
export function nearestNeighborOrder(matrix: number[][]): number[] {
  const n = matrix.length;
  if (n <= 1) return n === 1 ? [0] : [];

  const visited = new Array(n).fill(false);
  visited[0] = true;
  const order = [0];

  for (let step = 1; step < n; step += 1) {
    const current = order[order.length - 1];
    let nearest = -1;
    let nearestDist = Infinity;
    for (let candidate = 0; candidate < n; candidate += 1) {
      if (visited[candidate]) continue;
      const d = matrix[current][candidate];
      if (d < nearestDist) {
        nearestDist = d;
        nearest = candidate;
      }
    }
    visited[nearest] = true;
    order.push(nearest);
  }

  return order;
}

type CostFn = (order: number[], matrix: number[][]) => number;

/**
 * 2-opt 개선. 출발지(index 0)는 고정하고 나머지 구간만 뒤집어 비용이 줄면 채택한다.
 * 개선이 없을 때까지 반복하므로 초기 NN 결과보다 나빠지지 않는다.
 */
export function twoOptImprove(
  initialOrder: number[],
  matrix: number[][],
  costFn: CostFn,
): number[] {
  let order = [...initialOrder];
  const n = order.length;
  if (n < 4) return order;

  let improved = true;
  while (improved) {
    improved = false;
    let bestCost = costFn(order, matrix);

    for (let i = 1; i < n - 1; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const candidate = [
          ...order.slice(0, i),
          ...order.slice(i, j + 1).reverse(),
          ...order.slice(j + 1),
        ];
        const candidateCost = costFn(candidate, matrix);
        if (candidateCost < bestCost - 1e-9) {
          order = candidate;
          bestCost = candidateCost;
          improved = true;
        }
      }
    }
  }

  return order;
}

export interface SolveTspOptions {
  roundTrip: boolean;
}

/**
 * 출발지 + 방문지점 거리행렬로 방문 순서를 계산한다.
 * 방문 지점이 1개 이하면(§10 3단계) 최적화를 생략하고 자연 순서를 반환한다.
 */
export function solveTsp(matrix: number[][], options: SolveTspOptions): number[] {
  const n = matrix.length;
  if (n <= 2) {
    return Array.from({ length: n }, (_, i) => i);
  }

  const costFn = options.roundTrip ? costCycle : costOpenPath;
  const initial = nearestNeighborOrder(matrix);
  return twoOptImprove(initial, matrix, costFn);
}

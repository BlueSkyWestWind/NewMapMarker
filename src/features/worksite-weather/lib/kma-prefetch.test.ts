import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./kma-usage", () => ({ recordKmaCall: () => {} }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdminClient: () => ({}) }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({}) }));

import { KmaError } from "./kma-client";
import { currentBases, uniqueGrids, type ForecastKind, type StoredKey } from "./kma-prefetch-plan";
import { runPrefetchSlice, type SliceDeps } from "./kma-prefetch";

/** KST 10:00 (창 안, 분=0 → 시작 위치 0) */
const inWindow = new Date("2026-11-09T01:00:00Z");
/** KST 06:59 (창 밖) */
const beforeWindow = new Date("2026-11-08T21:59:00Z");
/** KST 10:02 (분=2 → 시작 위치 8) */
const secondSlice = new Date("2026-11-09T01:02:00Z");

const items = [{ category: "T1H", obsrValue: "10" }];

/** 서로 다른 격자로 떨어지는 점 n개(경도를 0.2도씩 벌린다) */
function points(count: number) {
  return Array.from({ length: count }, (_, i) => ({ lat: 37.5, lng: 126 + i * 0.2 }));
}

function makeDeps(overrides: Partial<SliceDeps> = {}): SliceDeps & {
  fetchKind: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
} {
  const fetchKind = vi.fn().mockResolvedValue(items);
  const save = vi.fn().mockResolvedValue(undefined);
  return {
    listMarkerPoints: vi.fn().mockResolvedValue(points(1)),
    listStoredKeys: vi.fn().mockResolvedValue([]),
    fetchKind,
    save,
    ...overrides,
  } as SliceDeps & { fetchKind: typeof fetchKind; save: typeof save };
}

describe("runPrefetchSlice", () => {
  it("07~17시 밖이면 아무것도 하지 않는다", async () => {
    const deps = makeDeps();
    const result = await runPrefetchSlice(deps, beforeWindow);

    expect(result).toMatchObject({ status: "skipped", reason: "outside-window" });
    expect(deps.listMarkerPoints).not.toHaveBeenCalled();
    expect(deps.fetchKind).not.toHaveBeenCalled();
  });

  it("이미 다 저장돼 있으면 아무것도 받지 않는다", async () => {
    // 격자 하나의 세 kind가 모두 저장된 상태
    const stored: StoredKey[] = uniqueGrids(points(1)).flatMap((g) =>
      (["vilage", "ncst", "ufcst"] as ForecastKind[]).map((kind) => ({ ...g, kind })),
    );
    const deps = makeDeps({ listStoredKeys: vi.fn().mockResolvedValue(stored) });

    const result = await runPrefetchSlice(deps, inWindow);

    expect(result).toMatchObject({ status: "done", fetched: 0, grids: 0, remaining: 0 });
    expect(deps.fetchKind).not.toHaveBeenCalled();
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("격자 20개가 모두 비어 있으면 8개만 처리하고 12개가 남는다", async () => {
    const deps = makeDeps({ listMarkerPoints: vi.fn().mockResolvedValue(points(20)) });

    const result = await runPrefetchSlice(deps, inWindow);

    expect(result).toMatchObject({ status: "done", grids: 8, remaining: 12 });
    expect(deps.fetchKind).toHaveBeenCalledTimes(24); // 8격자 × 3종
  });

  it("분이 2 늘면 시작 위치가 8칸 이동한다(실패하는 격자가 앞을 막지 않도록)", async () => {
    const deps = makeDeps({ listMarkerPoints: vi.fn().mockResolvedValue(points(20)) });
    await runPrefetchSlice(deps, inWindow);
    const firstGrids = new Set(deps.fetchKind.mock.calls.map((c) => `${c[1].nx}:${c[1].ny}`));

    const deps2 = makeDeps({ listMarkerPoints: vi.fn().mockResolvedValue(points(20)) });
    await runPrefetchSlice(deps2, secondSlice);
    const secondGrids = new Set(deps2.fetchKind.mock.calls.map((c) => `${c[1].nx}:${c[1].ny}`));

    expect([...secondGrids].some((g) => firstGrids.has(g))).toBe(false);
  });

  it("단기예보가 이미 있는 격자는 실황·초단기만 받는다", async () => {
    const grid = uniqueGrids(points(1))[0];
    const deps = makeDeps({
      listStoredKeys: vi.fn().mockResolvedValue([{ ...grid, kind: "vilage" }]),
    });

    await runPrefetchSlice(deps, inWindow);

    const kinds = deps.fetchKind.mock.calls.map((c) => c[0]).sort();
    expect(kinds).toEqual(["ncst", "ufcst"]);
  });

  it("한도 초과(22)를 만나면 즉시 멈추고 다음 격자를 부르지 않는다", async () => {
    const deps = makeDeps({ listMarkerPoints: vi.fn().mockResolvedValue(points(5)) });
    deps.fetchKind.mockRejectedValue(new KmaError("limit", "22"));

    const result = await runPrefetchSlice(deps, inWindow);

    expect(result).toMatchObject({ status: "aborted", reason: "quota" });
    expect(deps.fetchKind.mock.calls.length).toBeLessThanOrEqual(3); // 첫 격자의 3종까지만
  });

  it("인증 오류(401·403)는 auth로 멈춘다", async () => {
    for (const code of ["401", "403"]) {
      const deps = makeDeps({ listMarkerPoints: vi.fn().mockResolvedValue(points(3)) });
      deps.fetchKind.mockRejectedValue(new KmaError("auth", code));

      const result = await runPrefetchSlice(deps, inWindow);

      expect(result).toMatchObject({ status: "aborted", reason: "auth" });
    }
  });

  it("그 밖의 오류는 해당 격자만 실패로 세고 계속한다", async () => {
    const deps = makeDeps({ listMarkerPoints: vi.fn().mockResolvedValue(points(3)) });
    let call = 0;
    deps.fetchKind.mockImplementation(async () => {
      call += 1;
      if (call <= 3) throw new KmaError("slow", "timeout"); // 첫 격자의 세 호출 실패
      return items;
    });

    const result = await runPrefetchSlice(deps, inWindow);

    expect(result).toMatchObject({ status: "done", grids: 3, failed: 1 });
    expect(deps.fetchKind).toHaveBeenCalledTimes(9);
  });

  it("저장 목록을 읽지 못하면 전부 다시 받지 않고 중단한다", async () => {
    const deps = makeDeps({ listStoredKeys: vi.fn().mockRejectedValue(new Error("db")) });

    const result = await runPrefetchSlice(deps, inWindow);

    expect(result).toMatchObject({ status: "aborted", reason: "store-error" });
    expect(deps.fetchKind).not.toHaveBeenCalled();
  });

  it("빈 결과는 저장하지 않는다", async () => {
    const deps = makeDeps();
    deps.fetchKind.mockResolvedValue([]);

    await runPrefetchSlice(deps, inWindow);

    expect(deps.save).not.toHaveBeenCalled();
  });

  it("저장하는 행의 기준시각은 지금 계산한 기준시각이다", async () => {
    const deps = makeDeps();
    const bases = currentBases(inWindow);

    await runPrefetchSlice(deps, inWindow);

    const rows = deps.save.mock.calls[0][0];
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.source).toBe("prefetch");
      expect(row.baseDate).toBe(bases[row.kind as ForecastKind].baseDate);
      expect(row.baseTime).toBe(bases[row.kind as ForecastKind].baseTime);
    }
  });

  it("저장이 실패하면 store-error로 끝난다", async () => {
    const deps = makeDeps();
    deps.save.mockRejectedValue(new Error("write failed"));

    const result = await runPrefetchSlice(deps, inWindow);

    expect(result).toMatchObject({ status: "aborted", reason: "store-error" });
  });
});

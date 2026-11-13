import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./kma-client", () => ({
  fetchVilageFcst: vi.fn(),
  fetchUltraSrtNcst: vi.fn(),
  fetchUltraSrtFcst: vi.fn(),
}));
vi.mock("./kma-forecast-store", () => ({
  readLatestForecast: vi.fn(),
  saveForecast: vi.fn(),
}));

import { currentBases } from "./kma-prefetch-plan";
import {
  MANUAL_REFRESH_MIN_INTERVAL_MS,
  MAX_GRIDS_PER_REFRESH_REQUEST,
  refreshGrids,
  type RefreshDeps,
} from "./kma-forecast-refresh";

const NOW = new Date("2026-11-13T08:00:00Z"); // KST 17:00
const bases = currentBases(NOW);
const items = [{ category: "T1H", obsrValue: "10" }];

function recentRow() {
  return {
    kind: "ncst" as const,
    items,
    base: bases.ncst,
    fetchedAt: new Date(NOW.getTime() - 60_000).toISOString(), // 1분 전
    source: "prefetch" as const,
  };
}

function makeDeps(overrides: Partial<RefreshDeps> = {}): RefreshDeps & {
  fetchKind: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  readLatest: ReturnType<typeof vi.fn>;
} {
  return {
    readLatest: vi.fn().mockResolvedValue({}),
    fetchKind: vi.fn().mockResolvedValue(items),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as never;
}

beforeEach(() => vi.clearAllMocks());

describe("상수", () => {
  it("5분 제한과 요청당 격자 5개", () => {
    expect(MANUAL_REFRESH_MIN_INTERVAL_MS).toBe(300_000);
    expect(MAX_GRIDS_PER_REFRESH_REQUEST).toBe(5);
  });
});

describe("refreshGrids", () => {
  it("5분 안에 저장된 격자는 recent로 건너뛰고 기상청을 부르지 않는다", async () => {
    const deps = makeDeps({ readLatest: vi.fn().mockResolvedValue({ ncst: recentRow() }) });
    const out = await refreshGrids([{ nx: 60, ny: 127 }], NOW, deps);
    expect(out).toEqual([{ nx: 60, ny: 127, status: "recent", saved: false }]);
    expect(deps.fetchKind).not.toHaveBeenCalled();
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("오래됐거나 없으면 세 종류를 받아 manual로 저장한다(기준시각은 지금 계산한 값)", async () => {
    const deps = makeDeps();
    const out = await refreshGrids([{ nx: 60, ny: 127 }], NOW, deps);

    expect(out).toEqual([{ nx: 60, ny: 127, status: "refreshed", saved: true }]);
    expect(deps.fetchKind).toHaveBeenCalledTimes(3);
    const saved = deps.save.mock.calls[0][0] as { kind: string; baseDate: string; baseTime: string; source: string }[];
    expect(saved.map((r) => r.kind).sort()).toEqual(["ncst", "ufcst", "vilage"]);
    expect(saved.every((r) => r.source === "manual")).toBe(true);
    expect(saved.find((r) => r.kind === "ncst")).toMatchObject({
      baseDate: bases.ncst.baseDate,
      baseTime: bases.ncst.baseTime,
    });
  });

  it("빈 응답인 종류는 저장하지 않는다", async () => {
    const deps = makeDeps({
      fetchKind: vi.fn().mockImplementation(async (kind: string) => (kind === "ufcst" ? [] : items)),
    });
    await refreshGrids([{ nx: 1, ny: 1 }], NOW, deps);
    const saved = deps.save.mock.calls[0][0] as { kind: string }[];
    expect(saved.map((r) => r.kind).sort()).toEqual(["ncst", "vilage"]);
  });

  it("받은 자료가 전부 비어 있으면 failed이고 저장하지 않는다", async () => {
    const deps = makeDeps({ fetchKind: vi.fn().mockResolvedValue([]) });
    const out = await refreshGrids([{ nx: 1, ny: 1 }], NOW, deps);
    expect(out[0]).toMatchObject({ status: "failed", saved: false });
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("단기예보가 실패하면 그 격자는 failed, 초단기 둘의 실패는 그 종류만 건너뛴다", async () => {
    const vilageFails = makeDeps({
      fetchKind: vi.fn().mockImplementation(async (kind: string) => {
        if (kind === "vilage") throw new Error("한도 초과");
        return items;
      }),
    });
    const failed = await refreshGrids([{ nx: 1, ny: 1 }], NOW, vilageFails);
    expect(failed[0]).toMatchObject({ status: "failed", saved: false, error: "한도 초과" });

    const ultraFails = makeDeps({
      fetchKind: vi.fn().mockImplementation(async (kind: string) => {
        if (kind !== "vilage") throw new Error("timeout");
        return items;
      }),
    });
    const ok = await refreshGrids([{ nx: 1, ny: 1 }], NOW, ultraFails);
    expect(ok[0]).toMatchObject({ status: "refreshed", saved: true });
    const saved = ultraFails.save.mock.calls[0][0] as { kind: string }[];
    expect(saved.map((r) => r.kind)).toEqual(["vilage"]);
  });

  it("manual 저장이 실패하면(마이그레이션 전) user로 한 번 더 저장해 본다", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("check violation")).mockResolvedValueOnce(undefined);
    const deps = makeDeps({ save });
    const out = await refreshGrids([{ nx: 1, ny: 1 }], NOW, deps);

    expect(out[0]).toMatchObject({ status: "refreshed", saved: true });
    expect(save).toHaveBeenCalledTimes(2);
    expect((save.mock.calls[1][0] as { source: string }[]).every((r) => r.source === "user")).toBe(true);
  });

  it("두 번 다 저장이 실패하면 refreshed이지만 saved:false다", async () => {
    const deps = makeDeps({ save: vi.fn().mockRejectedValue(new Error("db down")) });
    const out = await refreshGrids([{ nx: 1, ny: 1 }], NOW, deps);
    expect(out[0]).toMatchObject({ status: "refreshed", saved: false });
  });

  it("같은 격자가 두 번 들어와도 한 번만 처리한다", async () => {
    const deps = makeDeps();
    const out = await refreshGrids(
      [
        { nx: 60, ny: 127 },
        { nx: 60, ny: 127 },
      ],
      NOW,
      deps,
    );
    expect(out).toHaveLength(1);
    expect(deps.readLatest).toHaveBeenCalledTimes(1);
  });

  it("격자가 6개 이상이면 던진다", async () => {
    const grids = Array.from({ length: 6 }, (_, i) => ({ nx: i, ny: i }));
    await expect(refreshGrids(grids, NOW, makeDeps())).rejects.toThrow();
  });

  it("격자는 순서대로 처리한다(동시에 부르지 않는다)", async () => {
    let active = 0;
    let peak = 0;
    const deps = makeDeps({
      readLatest: vi.fn().mockImplementation(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
        return {};
      }),
    });
    await refreshGrids(
      [
        { nx: 1, ny: 1 },
        { nx: 2, ny: 2 },
        { nx: 3, ny: 3 },
      ],
      NOW,
      deps,
    );
    expect(peak).toBe(1);
  });
});

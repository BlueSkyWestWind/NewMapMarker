import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const readLatestForecast = vi.fn();
vi.mock("./kma-forecast-store", () => ({
  readLatestForecast: (...args: unknown[]) => readLatestForecast(...args),
}));

// 읽기 경로는 기상청을 부르지 않는다. 불리면 아래 목이 실패로 잡는다.
const fetchVilageFcst = vi.fn();
const fetchUltraSrtNcst = vi.fn();
const fetchUltraSrtFcst = vi.fn();
vi.mock("./kma-client", () => ({
  fetchVilageFcst: (...args: unknown[]) => fetchVilageFcst(...args),
  fetchUltraSrtNcst: (...args: unknown[]) => fetchUltraSrtNcst(...args),
  fetchUltraSrtFcst: (...args: unknown[]) => fetchUltraSrtFcst(...args),
}));

import { loadStoredForecast } from "./kma-forecast-source";

const grid = { nx: 60, ny: 127 };
const items = [{ category: "T1H", obsrValue: "10" }];

function row(kind: "vilage" | "ncst" | "ufcst", baseDate: string, baseTime: string) {
  return { kind, items, base: { baseDate, baseTime }, fetchedAt: "2026-11-13T07:04:00Z", source: "prefetch" as const };
}

beforeEach(() => {
  readLatestForecast.mockReset();
  fetchVilageFcst.mockReset();
  fetchUltraSrtNcst.mockReset();
  fetchUltraSrtFcst.mockReset();
});

describe("loadStoredForecast", () => {
  it("저장분이 모두 있으면 기상청을 한 번도 부르지 않고 items·기준시각·수집 정보를 돌려준다", async () => {
    readLatestForecast.mockResolvedValue({
      vilage: row("vilage", "20261113", "0500"),
      ncst: row("ncst", "20261113", "1600"),
      ufcst: row("ufcst", "20261113", "1630"),
    });

    const result = await loadStoredForecast(grid);

    expect(result.items).toEqual({ vilage: items, ncst: items, ufcst: items });
    expect(result.bases.ncst).toEqual({ baseDate: "20261113", baseTime: "1600" });
    expect(result.info.missing).toEqual([]);
    expect(result.info.collectedBy).toBe("auto");
    expect(fetchVilageFcst).not.toHaveBeenCalled();
    expect(fetchUltraSrtNcst).not.toHaveBeenCalled();
    expect(fetchUltraSrtFcst).not.toHaveBeenCalled();
    expect(readLatestForecast).toHaveBeenCalledWith(grid);
  });

  it("저장분이 전혀 없으면 세 배열이 모두 비어 있고 missing이 세 종류다(기상청 호출 0건)", async () => {
    readLatestForecast.mockResolvedValue({});

    const result = await loadStoredForecast(grid);

    expect(result.items).toEqual({ vilage: [], ncst: [], ufcst: [] });
    expect(result.info.missing).toEqual(["vilage", "ncst", "ufcst"]);
    expect(result.bases).toEqual({});
    expect(fetchVilageFcst).not.toHaveBeenCalled();
    expect(fetchUltraSrtNcst).not.toHaveBeenCalled();
    expect(fetchUltraSrtFcst).not.toHaveBeenCalled();
  });

  it("기준시각이 지금 계산한 것과 달라도(어제 것) 쓴다", async () => {
    readLatestForecast.mockResolvedValue({ vilage: row("vilage", "20261112", "2300") });

    const result = await loadStoredForecast(grid);

    expect(result.items.vilage).toEqual(items);
    expect(result.bases.vilage).toEqual({ baseDate: "20261112", baseTime: "2300" });
    expect(result.info.missing).toEqual(["ncst", "ufcst"]);
  });

  it("저장소 조회가 실패해도(빈 결과) 던지지 않는다", async () => {
    readLatestForecast.mockResolvedValue({});
    await expect(loadStoredForecast(grid)).resolves.toBeDefined();
  });
});

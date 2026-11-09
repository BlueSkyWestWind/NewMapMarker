import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const readStoredForecast = vi.fn();
const saveForecastInBackground = vi.fn();
vi.mock("./kma-forecast-store", () => ({
  readStoredForecast: (...args: unknown[]) => readStoredForecast(...args),
  saveForecastInBackground: (...args: unknown[]) => saveForecastInBackground(...args),
}));

const fetchVilageFcst = vi.fn();
const fetchUltraSrtNcst = vi.fn();
const fetchUltraSrtFcst = vi.fn();
vi.mock("./kma-client", () => ({
  fetchVilageFcst: (...args: unknown[]) => fetchVilageFcst(...args),
  fetchUltraSrtNcst: (...args: unknown[]) => fetchUltraSrtNcst(...args),
  fetchUltraSrtFcst: (...args: unknown[]) => fetchUltraSrtFcst(...args),
}));

import { loadForecastItems } from "./kma-forecast-source";
import { currentBases } from "./kma-prefetch-plan";

const now = new Date("2026-11-09T01:20:00Z"); // KST 10:20
const bases = currentBases(now);
const items = [{ category: "T1H", obsrValue: "10" }];
const liveItems = [{ category: "T1H", obsrValue: "99" }];

beforeEach(() => {
  readStoredForecast.mockReset();
  saveForecastInBackground.mockReset();
  fetchVilageFcst.mockReset();
  fetchUltraSrtNcst.mockReset();
  fetchUltraSrtFcst.mockReset();
  fetchVilageFcst.mockResolvedValue(liveItems);
  fetchUltraSrtNcst.mockResolvedValue(liveItems);
  fetchUltraSrtFcst.mockResolvedValue(liveItems);
});

describe("loadForecastItems", () => {
  it("저장분이 세 kind 모두 있으면 기상청을 부르지 않는다", async () => {
    readStoredForecast.mockResolvedValue({ vilage: items, ncst: items, ufcst: items });

    const result = await loadForecastItems({ nx: 60, ny: 127, now });

    expect(result).toEqual({ vilage: items, ncst: items, ufcst: items });
    expect(fetchVilageFcst).not.toHaveBeenCalled();
    expect(fetchUltraSrtNcst).not.toHaveBeenCalled();
    expect(fetchUltraSrtFcst).not.toHaveBeenCalled();
    expect(saveForecastInBackground).not.toHaveBeenCalled();
  });

  it("현재 기준시각으로 저장분을 찾는다", async () => {
    readStoredForecast.mockResolvedValue({ vilage: items, ncst: items, ufcst: items });

    await loadForecastItems({ nx: 60, ny: 127, now });

    expect(readStoredForecast).toHaveBeenCalledWith({ nx: 60, ny: 127 }, bases);
  });

  it("빠진 kind만 실시간(사용자 출처)으로 받고, 받은 것만 채운다", async () => {
    readStoredForecast.mockResolvedValue({ vilage: items, ufcst: items });

    const result = await loadForecastItems({ nx: 60, ny: 127, now });

    expect(result).toEqual({ vilage: items, ncst: liveItems, ufcst: items });
    expect(fetchVilageFcst).not.toHaveBeenCalled();
    expect(fetchUltraSrtNcst).toHaveBeenCalledWith(
      { nx: 60, ny: 127, base: bases.ncst },
      { source: "user" },
    );
    const rows = saveForecastInBackground.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      nx: 60,
      ny: 127,
      kind: "ncst",
      baseDate: bases.ncst.baseDate,
      baseTime: bases.ncst.baseTime,
      source: "user",
      items: liveItems,
    });
  });

  it("실시간 결과가 비어 있으면 저장하지 않는다", async () => {
    readStoredForecast.mockResolvedValue({ vilage: items, ufcst: items });
    fetchUltraSrtNcst.mockResolvedValue([]);

    const result = await loadForecastItems({ nx: 60, ny: 127, now });

    expect(result.ncst).toEqual([]);
    expect(saveForecastInBackground).not.toHaveBeenCalled();
  });

  it("단기예보 실시간이 실패하면 던진다", async () => {
    readStoredForecast.mockResolvedValue({});
    fetchVilageFcst.mockRejectedValue(new Error("kma down"));

    await expect(loadForecastItems({ nx: 60, ny: 127, now })).rejects.toThrow("kma down");
  });

  it("초단기 실시간이 실패하면 빈 배열로 계속한다", async () => {
    readStoredForecast.mockResolvedValue({ vilage: items });
    fetchUltraSrtNcst.mockRejectedValue(new Error("x"));
    fetchUltraSrtFcst.mockRejectedValue(new Error("y"));

    const result = await loadForecastItems({ nx: 60, ny: 127, now });

    expect(result).toEqual({ vilage: items, ncst: [], ufcst: [] });
    expect(saveForecastInBackground).not.toHaveBeenCalled();
  });
});

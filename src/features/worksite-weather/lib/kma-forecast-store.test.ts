import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: () => getAdmin(),
}));

import {
  listStoredKeys,
  readLatestForecast,
  saveForecast,
  type ForecastRow,
} from "./kma-forecast-store";
import { currentBases } from "./kma-prefetch-plan";

interface Result {
  data?: unknown;
  error?: { message: string } | null;
}

/** select/eq/or/range 체인을 흉내 낸다. await 하면 큐의 다음 결과를 돌려준다. */
function makeQuery(results: Result[]) {
  const queue = [...results];
  const calls: { method: string; args: unknown[] }[] = [];
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "or", "range", "order", "limit"]) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    };
  }
  query.then = (resolve: (value: Result) => unknown) => resolve(queue.shift() ?? { data: [], error: null });
  return { query, calls };
}

const bases = currentBases(new Date("2026-11-09T01:20:00Z"));
const items = [{ category: "T1H", obsrValue: "10" }];

beforeEach(() => {
  getAdmin.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("readLatestForecast", () => {
  const row = (kind: string, baseDate: string, baseTime: string, source = "prefetch") => ({
    kind,
    base_date: baseDate,
    base_time: baseTime,
    payload: items,
    fetched_at: "2026-11-13T07:04:00Z",
    source,
  });

  /** from() 호출 순서(단기예보→초단기실황→초단기예보)마다 다른 결과를 돌려준다 */
  function threeQueries(results: Result[]) {
    const made = results.map((r) => makeQuery([r]));
    let i = 0;
    getAdmin.mockReturnValue({ from: () => made[i++].query });
    return made.map((m) => m.calls);
  }

  it("종류마다 기준일·기준시각 내림차순 1행을 읽어 기준시각과 출처까지 돌려준다", async () => {
    const calls = threeQueries([
      { data: [row("vilage", "20261113", "0500")], error: null },
      { data: [row("ncst", "20261113", "1600", "manual")], error: null },
      { data: [row("ufcst", "20261113", "1630")], error: null },
    ]);

    const latest = await readLatestForecast({ nx: 60, ny: 127 });

    expect(latest.vilage).toEqual({
      kind: "vilage",
      items,
      base: { baseDate: "20261113", baseTime: "0500" },
      fetchedAt: "2026-11-13T07:04:00Z",
      source: "prefetch",
    });
    expect(latest.ncst?.source).toBe("manual");
    expect(latest.ufcst?.base).toEqual({ baseDate: "20261113", baseTime: "1630" });
    expect(calls[0]).toContainEqual({ method: "eq", args: ["kind", "vilage"] });
    expect(calls[1]).toContainEqual({ method: "eq", args: ["kind", "ncst"] });
    expect(calls[0]).toContainEqual({ method: "order", args: ["base_date", { ascending: false }] });
    expect(calls[0]).toContainEqual({ method: "order", args: ["base_time", { ascending: false }] });
    expect(calls[0]).toContainEqual({ method: "limit", args: [1] });
  });

  it("행이 없는 종류는 결과에서 빠진다", async () => {
    threeQueries([
      { data: [], error: null },
      { data: [row("ncst", "20261113", "1600")], error: null },
      { data: [], error: null },
    ]);
    const latest = await readLatestForecast({ nx: 1, ny: 1 });
    expect(Object.keys(latest)).toEqual(["ncst"]);
  });

  it("payload가 배열이 아닌 행은 없는 것으로 본다", async () => {
    threeQueries([
      { data: [{ ...row("vilage", "20261113", "0500"), payload: "oops" }], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]);
    expect(await readLatestForecast({ nx: 1, ny: 1 })).toEqual({});
  });

  it("DB 오류면 빈 객체(던지지 않음)", async () => {
    threeQueries([
      { data: null, error: { message: "relation does not exist" } },
      { data: null, error: { message: "relation does not exist" } },
      { data: null, error: { message: "relation does not exist" } },
    ]);
    expect(await readLatestForecast({ nx: 1, ny: 1 })).toEqual({});
  });

  it("클라이언트를 못 만들어도 빈 객체", async () => {
    getAdmin.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
    });
    expect(await readLatestForecast({ nx: 1, ny: 1 })).toEqual({});
  });
});

describe("saveForecast", () => {
  const row: ForecastRow = {
    nx: 60,
    ny: 127,
    kind: "ncst",
    baseDate: "20261109",
    baseTime: "0900",
    items,
    source: "prefetch",
  };

  it("snake_case 행과 충돌 키로 upsert 한다", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    getAdmin.mockReturnValue({ from: () => ({ upsert }) });

    await saveForecast([row]);

    expect(upsert).toHaveBeenCalledWith(
      [
        {
          nx: 60,
          ny: 127,
          kind: "ncst",
          base_date: "20261109",
          base_time: "0900",
          payload: items,
          source: "prefetch",
        },
      ],
      { onConflict: "nx,ny,kind,base_date,base_time" },
    );
  });

  it("빈 배열이면 DB를 부르지 않는다", async () => {
    await saveForecast([]);
    expect(getAdmin).not.toHaveBeenCalled();
  });

  it("오류 응답이면 던진다", async () => {
    getAdmin.mockReturnValue({ from: () => ({ upsert: vi.fn().mockResolvedValue({ error: { message: "boom" } }) }) });

    await expect(saveForecast([row])).rejects.toThrow();
  });
});

describe("listStoredKeys", () => {
  it("현재 기준시각 행의 격자·kind 목록을 돌려준다", async () => {
    const { query } = makeQuery([{ data: [{ nx: 1, ny: 2, kind: "ncst" }], error: null }]);
    getAdmin.mockReturnValue({ from: () => query });

    expect(await listStoredKeys(bases)).toEqual([{ nx: 1, ny: 2, kind: "ncst" }]);
  });

  it("1000행이 가득 차면 다음 페이지까지 읽는다", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ nx: i, ny: 0, kind: "ncst" }));
    const { query, calls } = makeQuery([
      { data: page, error: null },
      { data: [{ nx: 5000, ny: 0, kind: "ufcst" }], error: null },
    ]);
    getAdmin.mockReturnValue({ from: () => query });

    const keys = await listStoredKeys(bases);

    expect(keys).toHaveLength(1001);
    const ranges = calls.filter((c) => c.method === "range").map((c) => c.args);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("오류면 던진다(호출부가 중단해야 한다)", async () => {
    const { query } = makeQuery([{ data: null, error: { message: "boom" } }]);
    getAdmin.mockReturnValue({ from: () => query });

    await expect(listStoredKeys(bases)).rejects.toThrow();
  });
});

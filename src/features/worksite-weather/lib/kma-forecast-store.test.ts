import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: () => getAdmin(),
}));

const getCloudflareContext = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => getCloudflareContext(),
}));

import {
  listStoredKeys,
  readStoredForecast,
  saveForecast,
  saveForecastInBackground,
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
  for (const method of ["select", "eq", "or", "range", "order"]) {
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
  getCloudflareContext.mockReset();
  getCloudflareContext.mockImplementation(() => {
    throw new Error("no cloudflare context");
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("readStoredForecast", () => {
  it("한 번의 조회로 찾은 kind들을 돌려준다", async () => {
    const { query, calls } = makeQuery([
      {
        data: [
          { kind: "vilage", payload: items },
          { kind: "ncst", payload: items },
        ],
        error: null,
      },
    ]);
    getAdmin.mockReturnValue({ from: () => query });

    const stored = await readStoredForecast({ nx: 60, ny: 127 }, bases);

    expect(stored).toEqual({ vilage: items, ncst: items });
    expect(calls.filter((c) => c.method === "or")).toHaveLength(1);
  });

  it("조회 조건에 현재 기준시각 세 종류가 모두 들어간다", async () => {
    const { query, calls } = makeQuery([{ data: [], error: null }]);
    getAdmin.mockReturnValue({ from: () => query });

    await readStoredForecast({ nx: 60, ny: 127 }, bases);

    const filter = String(calls.find((c) => c.method === "or")?.args[0]);
    expect(filter).toContain(`base_date.eq.${bases.vilage.baseDate}`);
    expect(filter).toContain(`base_time.eq.${bases.vilage.baseTime}`);
    expect(filter).toContain(`base_time.eq.${bases.ncst.baseTime}`);
    expect(filter).toContain(`base_time.eq.${bases.ufcst.baseTime}`);
  });

  it("payload가 배열이 아니면 그 kind는 없는 것으로 본다", async () => {
    const { query } = makeQuery([{ data: [{ kind: "ncst", payload: "oops" }], error: null }]);
    getAdmin.mockReturnValue({ from: () => query });

    expect(await readStoredForecast({ nx: 1, ny: 1 }, bases)).toEqual({});
  });

  it("조회 오류면 빈 객체(던지지 않음)", async () => {
    const { query } = makeQuery([{ data: null, error: { message: "relation does not exist" } }]);
    getAdmin.mockReturnValue({ from: () => query });

    expect(await readStoredForecast({ nx: 1, ny: 1 }, bases)).toEqual({});
  });

  it("서비스 키가 없어 클라이언트를 못 만들어도 빈 객체", async () => {
    getAdmin.mockImplementation(() => {
      throw new Error("no key");
    });

    expect(await readStoredForecast({ nx: 1, ny: 1 }, bases)).toEqual({});
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

describe("saveForecastInBackground", () => {
  it("저장이 실패해도 던지지 않는다", async () => {
    getAdmin.mockReturnValue({ from: () => ({ upsert: vi.fn().mockRejectedValue(new Error("down")) }) });

    expect(() =>
      saveForecastInBackground([
        { nx: 1, ny: 1, kind: "ncst", baseDate: "20261109", baseTime: "0900", items, source: "user" },
      ]),
    ).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("Cloudflare 컨텍스트가 있으면 waitUntil에 맡긴다", async () => {
    const waitUntil = vi.fn();
    getCloudflareContext.mockReturnValue({ ctx: { waitUntil } });
    getAdmin.mockReturnValue({ from: () => ({ upsert: vi.fn().mockResolvedValue({ error: null }) }) });

    saveForecastInBackground([
      { nx: 1, ny: 1, kind: "ncst", baseDate: "20261109", baseTime: "0900", items, source: "user" },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(waitUntil).toHaveBeenCalledTimes(1);
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

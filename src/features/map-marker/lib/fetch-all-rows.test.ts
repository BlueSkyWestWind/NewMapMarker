import { describe, expect, it, vi } from "vitest";
import { fetchAllRows, type FetchPageResult } from "@/features/map-marker/api";

interface Row {
  id: number;
}

/**
 * PostgREST 흉내: 요청 범위와 무관하게 `serverCap`행까지만 돌려준다.
 * 실제 서버가 상한을 거는 방식과 같다.
 */
function makeServer(total: number, serverCap = 1000) {
  const all: Row[] = Array.from({ length: total }, (_, i) => ({ id: i }));
  const spy = vi.fn((from: number, to: number): Promise<FetchPageResult<Row>> => {
    const size = Math.min(to - from + 1, serverCap);
    return Promise.resolve({
      data: all.slice(from, from + size),
      error: null,
      count: total,
    });
  });
  return { spy, all };
}

describe("fetchAllRows", () => {
  it("상한 이하면 한 번에 받는다", async () => {
    const { spy } = makeServer(685);
    const rows = await fetchAllRows(spy);

    expect(rows).toHaveLength(685);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("1000행 상한을 넘으면 이어받는다 (조용한 잘림 방지)", async () => {
    const { spy } = makeServer(2500);
    const rows = await fetchAllRows(spy);

    expect(rows).toHaveLength(2500);
    expect(rows[0].id).toBe(0);
    expect(rows[2499].id).toBe(2499);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("정확히 상한 배수여도 누락·중복이 없다", async () => {
    const { spy } = makeServer(2000);
    const rows = await fetchAllRows(spy);

    expect(rows).toHaveLength(2000);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2000);
  });

  it("서버 상한이 요청 크기보다 작아도(500) 전량을 받는다", async () => {
    const { spy } = makeServer(1200, 500);
    const rows = await fetchAllRows(spy);

    expect(rows).toHaveLength(1200);
    expect(new Set(rows.map((r) => r.id)).size).toBe(1200);
  });

  it("빈 테이블", async () => {
    const { spy } = makeServer(0);
    expect(await fetchAllRows(spy)).toHaveLength(0);
  });

  it("count를 못 받으면 덜 찬 페이지로 종료를 판단한다", async () => {
    const all: Row[] = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
    const spy = vi.fn((from: number, to: number) =>
      Promise.resolve({
        data: all.slice(from, to + 1),
        error: null,
        count: null,
      }),
    );

    const rows = await fetchAllRows(spy);
    expect(rows).toHaveLength(1500);
  });

  it("오류는 그대로 던진다 — 부분 결과를 정상인 척 돌려주지 않는다", async () => {
    const spy = vi.fn(() =>
      Promise.resolve({ data: null, error: { message: "권한 없음" }, count: null }),
    );

    await expect(fetchAllRows(spy)).rejects.toMatchObject({ message: "권한 없음" });
  });

  it("두 번째 페이지에서 실패해도 던진다", async () => {
    const all: Row[] = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
    let call = 0;
    const spy = vi.fn((from: number, to: number) => {
      call += 1;
      if (call === 2) {
        return Promise.resolve({ data: null, error: { message: "타임아웃" }, count: 1500 });
      }
      return Promise.resolve({ data: all.slice(from, to + 1), error: null, count: 1500 });
    });

    await expect(fetchAllRows(spy)).rejects.toMatchObject({ message: "타임아웃" });
  });

  it("무한 루프에 빠지지 않는다 (서버가 계속 같은 걸 줘도)", async () => {
    const spy = vi.fn(() =>
      Promise.resolve({ data: [{ id: 1 }], error: null, count: 999_999 }),
    );

    const rows = await fetchAllRows(spy);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(50);
    expect(rows.length).toBeLessThanOrEqual(50);
  });
});

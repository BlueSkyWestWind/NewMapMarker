import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchFullBackupTables } from "./fetch-full-backup-tables";

const SERVER_PAGE_LIMIT = 1000;

interface FakeOptions {
  rowCounts?: Record<string, number>;
  /** 총 건수보다 적게 돌려주는 테이블(서버가 도중에 끊긴 경우) */
  cutOff?: Record<string, number>;
  failOn?: string;
}

/** PostgREST처럼 요청 범위와 무관하게 한 번에 1000행까지만 돌려주는 대역 */
function fakeSupabase({ rowCounts = {}, cutOff = {}, failOn }: FakeOptions = {}) {
  const orders: string[] = [];
  const client = {
    from: (table: string) => ({
      select: () => ({
        order: (column: string) => {
          orders.push(`${table}.${column}`);
          return {
            range: async (from: number, to: number) => {
              if (table === failOn) {
                return { data: null, error: { message: `${table} 조회 실패` }, count: null };
              }
              const total = rowCounts[table] ?? 0;
              const available = cutOff[table] ?? total;
              const end = Math.min(to + 1, from + SERVER_PAGE_LIMIT, available);
              const data = [];
              for (let i = from; i < end; i += 1) data.push({ id: i });
              return { data, error: null, count: total };
            },
          };
        },
      }),
    }),
  };
  return { client: client as unknown as SupabaseBrowserClient, orders };
}

describe("fetchFullBackupTables", () => {
  it("1000행을 넘는 테이블도 모두 가져온다", async () => {
    const { client } = fakeSupabase({
      rowCounts: { markers: 2500, information: 1001, erp_details: 1000, battery_specs: 3 },
    });
    const tables = await fetchFullBackupTables(client);
    expect(tables.markers).toHaveLength(2500);
    expect(tables.information).toHaveLength(1001);
    expect(tables.erp_details).toHaveLength(1000);
    expect(tables.battery_markers).toHaveLength(0);
    expect(tables.battery_specs).toHaveLength(3);
    expect(new Set(tables.markers.map((row) => row.id)).size).toBe(2500);
  });

  it("페이지 경계가 흔들리지 않도록 모든 테이블을 id로 정렬한다", async () => {
    const { client, orders } = fakeSupabase();
    await fetchFullBackupTables(client);
    expect(orders.sort()).toEqual([
      "battery_markers.id",
      "battery_specs.id",
      "erp_details.id",
      "information.id",
      "markers.id",
    ]);
  });

  it("총 건수보다 적게 받으면 잘린 파일을 만들지 않고 중단한다", async () => {
    const { client } = fakeSupabase({
      rowCounts: { markers: 2500 },
      cutOff: { markers: 2000 },
    });
    await expect(fetchFullBackupTables(client)).rejects.toThrow(/markers.*2000.*2500/);
  });

  it("조회 오류를 그대로 알린다", async () => {
    const { client } = fakeSupabase({ failOn: "information" });
    await expect(fetchFullBackupTables(client)).rejects.toMatchObject({
      message: "information 조회 실패",
    });
  });
});

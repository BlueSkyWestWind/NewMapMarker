import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import {
  applyMarkerRolesFromStoredGroupRole,
  assignMarkerParentsByLotAddress,
} from "./address-group";

const SERVER_PAGE_LIMIT = 1000;

type Row = {
  id: string;
  road_address: string;
  jibun_address: string;
  created_at: string;
  group_role?: string | null;
};

/** PostgREST처럼 한 번에 1000행까지만 돌려주는 대역. 범위를 안 주면 앞의 1000행만 받는다. */
function fakeSupabase(rows: Row[]) {
  const updates = new Map<string, Record<string, unknown>>();
  const query = (from = 0, to = SERVER_PAGE_LIMIT - 1) => {
    const end = Math.min(to + 1, from + SERVER_PAGE_LIMIT);
    return {
      order: () => query(from, to),
      range: (nextFrom: number, nextTo: number) => query(nextFrom, nextTo),
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: rows.slice(from, end), error: null, count: rows.length }),
    };
  };
  const client = {
    from: () => ({
      select: () => query(),
      update: (values: Record<string, unknown>) => ({
        eq: async (_column: string, id: string) => {
          updates.set(id, values);
          return { error: null };
        },
      }),
    }),
  };
  return { client: client as unknown as SupabaseBrowserClient, updates };
}

/** 앞의 1200개는 서로 다른 번지, 마지막 행은 첫 행과 같은 번지다. */
function manyMarkers(groupRole: string | null): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < 1200; i += 1) {
    rows.push({
      id: `m${String(i).padStart(4, "0")}`,
      road_address: "",
      jibun_address: `광주 북구 운암동 ${i}번지`,
      created_at: "2026-01-01T00:00:00Z",
      group_role: groupRole,
    });
  }
  rows.push({
    id: "m9999",
    road_address: "",
    jibun_address: "광주 북구 운암동 0번지",
    created_at: "2026-02-01T00:00:00Z",
    group_role: groupRole,
  });
  return rows;
}

describe("1000행을 넘어도 전체 마커로 대표/SUB를 정한다", () => {
  it("assignMarkerParentsByLotAddress: 1000행 뒤의 마커도 같은 번지로 묶는다", async () => {
    const { client, updates } = fakeSupabase(manyMarkers(null));
    const result = await assignMarkerParentsByLotAddress(client);

    expect(updates.size).toBe(1201);
    expect(updates.get("m0000")).toMatchObject({ group_role: "대표", parent_marker_id: null });
    expect(updates.get("m9999")).toMatchObject({ group_role: "SUB", parent_marker_id: "m0000" });
    expect(result).toEqual({ groupCount: 1, subCount: 1 });
  });

  it("applyMarkerRolesFromStoredGroupRole: 저장된 구분이 있어도 같다", async () => {
    const { client, updates } = fakeSupabase(manyMarkers("SUB"));
    const result = await applyMarkerRolesFromStoredGroupRole(client);

    expect(updates.size).toBe(1201);
    expect(updates.get("m9999")).toMatchObject({ group_role: "SUB", parent_marker_id: "m0000" });
    expect(result.usedStoredRoles).toBe(true);
  });

  it("저장된 구분이 없으면 전체 마커를 기준으로 자동 판정한다", async () => {
    const { client, updates } = fakeSupabase(manyMarkers(null));
    const result = await applyMarkerRolesFromStoredGroupRole(client);

    expect(result.usedStoredRoles).toBe(false);
    expect(updates.size).toBe(1201);
  });
});

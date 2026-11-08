import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { savePendingBattery, savePendingEquipment } from "./save-pending";

interface Call {
  table: string;
  op: "upsert" | "insert" | "delete";
  payload: unknown;
  options?: unknown;
}

/** 호출 순서를 기록하는 대역. failOn("table.op")에 걸린 연산은 오류를 돌려준다. */
function fakeSupabase(failOn?: string) {
  const calls: Call[] = [];
  const result = (table: string, op: string) => ({
    error: failOn === `${table}.${op}` ? { message: `${table}.${op} 실패` } : null,
  });
  const client = {
    from: (table: string) => ({
      upsert: async (payload: unknown, options?: unknown) => {
        calls.push({ table, op: "upsert", payload, options });
        return result(table, "upsert");
      },
      insert: async (payload: unknown) => {
        calls.push({ table, op: "insert", payload });
        return result(table, "insert");
      },
      delete: () => ({
        in: async (_column: string, payload: unknown) => {
          calls.push({ table, op: "delete", payload });
          return result(table, "delete");
        },
      }),
      select: () => ({ in: async () => ({ count: 0, error: null }) }),
    }),
  };
  return { calls, client: client as unknown as SupabaseBrowserClient };
}

const rows = (count: number, prefix = "m") =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, marker_id: `${prefix}${i}` }));

describe("savePendingEquipment", () => {
  it("마커를 200건씩 id 기준 upsert로 나눠 저장한다", async () => {
    const { calls, client } = fakeSupabase();
    await savePendingEquipment(client, { markers: rows(450), info: [] });
    const upserts = calls.filter((c) => c.table === "markers" && c.op === "upsert");
    expect(upserts.map((c) => (c.payload as unknown[]).length)).toEqual([200, 200, 50]);
    expect(upserts.every((c) => (c.options as { onConflict: string }).onConflict === "id")).toBe(true);
  });

  it("시설정보는 같은 마커의 기존 행을 지운 뒤 넣는다(재시도해도 중복이 생기지 않는다)", async () => {
    const { calls, client } = fakeSupabase();
    await savePendingEquipment(client, { markers: rows(2), info: rows(2) });
    const infoOps = calls.filter((c) => c.table === "information").map((c) => c.op);
    expect(infoOps).toEqual(["delete", "insert"]);
  });

  it("같은 입력으로 두 번 저장해도 오류 없이 끝나고 매번 기존 행을 지운다", async () => {
    const { calls, client } = fakeSupabase();
    const input = { markers: rows(2), info: rows(2) };
    await savePendingEquipment(client, input);
    await savePendingEquipment(client, input);
    expect(calls.filter((c) => c.table === "information" && c.op === "delete")).toHaveLength(2);
  });

  it("시설정보 저장이 실패하면 오류를 그대로 던진다", async () => {
    const { client } = fakeSupabase("information.insert");
    await expect(
      savePendingEquipment(client, { markers: rows(1), info: rows(1) }),
    ).rejects.toMatchObject({ message: "information.insert 실패" });
  });
});

describe("savePendingBattery", () => {
  it("규격은 같은 마커의 기존 규격을 지운 뒤 넣는다", async () => {
    const { calls, client } = fakeSupabase();
    await savePendingBattery(client, { markers: rows(1, "b"), specs: rows(1, "b") });
    const specOps = calls.filter((c) => c.table === "battery_specs").map((c) => c.op);
    expect(specOps).toEqual(["delete", "insert"]);
    expect(calls.find((c) => c.table === "battery_markers")?.options).toEqual({ onConflict: "id" });
  });

  it("규격이 없으면 규격 테이블을 건드리지 않는다", async () => {
    const { calls, client } = fakeSupabase();
    await savePendingBattery(client, { markers: rows(1, "b"), specs: [] });
    expect(calls.some((c) => c.table === "battery_specs")).toBe(false);
  });
});

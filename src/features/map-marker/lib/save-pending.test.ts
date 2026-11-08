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
    // 이미 있는 id는 덮어쓰지 않는다(재시도는 안전하게, 기존 마커의 메모·태그·좌표는 그대로).
    expect(
      upserts.every(
        (c) =>
          (c.options as { onConflict: string; ignoreDuplicates: boolean }).onConflict === "id" &&
          (c.options as { ignoreDuplicates: boolean }).ignoreDuplicates === true,
      ),
    ).toBe(true);
  });

  it("한 마커의 하위 행이 청크 경계에 걸려도 앞 청크가 넣은 행을 지우지 않는다", async () => {
    const { calls, client } = fakeSupabase();
    // 마커 X의 행 3개가 청크 크기 2의 경계에 걸린다.
    const info = [
      { marker_id: "X", n: 1 },
      { marker_id: "X", n: 2 },
      { marker_id: "X", n: 3 },
    ];
    await savePendingEquipment(client, { markers: rows(1), info }, 2);
    const infoOps = calls.filter((c) => c.table === "information");
    const firstInsert = infoOps.findIndex((c) => c.op === "insert");
    // 모든 delete가 첫 insert보다 앞에 있어야 한다.
    expect(infoOps.slice(firstInsert).some((c) => c.op === "delete")).toBe(false);
    const inserted = infoOps
      .filter((c) => c.op === "insert")
      .flatMap((c) => c.payload as unknown[]);
    expect(inserted).toHaveLength(3);
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
    expect(calls.find((c) => c.table === "battery_markers")?.options).toEqual({
      onConflict: "id",
      ignoreDuplicates: true,
    });
  });

  it("규격이 없으면 규격 테이블을 건드리지 않는다", async () => {
    const { calls, client } = fakeSupabase();
    await savePendingBattery(client, { markers: rows(1, "b"), specs: [] });
    expect(calls.some((c) => c.table === "battery_specs")).toBe(false);
  });
});

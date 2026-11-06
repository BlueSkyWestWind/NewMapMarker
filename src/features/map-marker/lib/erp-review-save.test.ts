import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import type { StagedErpRow } from "@/features/map-marker/types/marker";
import { refreshExistingRows, saveReviewRow } from "./erp-review-save";

interface Call {
  table: string;
  op: string;
  payload?: unknown;
  options?: unknown;
}

/** 호출을 기록하는 Supabase 대역. `failOn`에 걸린 연산은 오류를 돌려준다. */
function fakeSupabase(failOn?: string) {
  const calls: Call[] = [];
  const result = (table: string, op: string) => ({
    error: failOn === `${table}.${op}` ? { message: `${table}.${op} 실패` } : null,
  });
  const client = {
    from: (table: string) => ({
      upsert: async (payload: unknown, options: unknown) => {
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
    }),
  };
  return { calls, client: client as unknown as SupabaseBrowserClient };
}

const row = (
  kind: StagedErpRow["kind"],
  marker: Record<string, unknown>,
): StagedErpRow => ({
  id: String(marker.id),
  kind,
  name: "국소",
  address: "주소",
  lat: 35,
  lng: 126,
  marker,
  info: { marker_id: marker.id },
  erp: { marker_id: marker.id },
});

describe("saveReviewRow", () => {
  it("신규는 확인한 좌표로 저장하고 이미 있는 마커는 덮어쓰지 않는다", async () => {
    const { calls, client } = fakeSupabase();
    await saveReviewRow(client, row("new", { id: "a", memo: "" }), { lat: 1, lng: 2 });

    const upsert = calls.find((c) => c.table === "markers");
    expect(upsert?.payload).toMatchObject({ id: "a", memo: "", lat: 1, lng: 2 });
    expect((upsert?.payload as { created_at?: string }).created_at).toBeTruthy();
    expect(upsert?.options).toEqual({ onConflict: "id", ignoreDuplicates: true });
  });

  it("좌표 없는 기존 건은 전달한 열과 좌표만 갱신한다", async () => {
    const { calls, client } = fakeSupabase();
    await saveReviewRow(
      client,
      row("missingCoords", { id: "a", name: "새이름" }),
      { lat: 1, lng: 2 },
    );

    const upsert = calls.find((c) => c.table === "markers");
    expect(upsert?.payload).toEqual({ id: "a", name: "새이름", lat: 1, lng: 2 });
    expect(upsert?.options).toEqual({ onConflict: "id" });
  });

  it("마커를 먼저 저장한 뒤 공정 정보를 지우고 다시 넣는다", async () => {
    const { calls, client } = fakeSupabase();
    await saveReviewRow(client, row("new", { id: "a" }), { lat: 1, lng: 2 });
    expect(calls.map((c) => `${c.table}.${c.op}`)).toEqual([
      "markers.upsert",
      "erp_details.delete",
      "information.delete",
      "information.insert",
      "erp_details.insert",
    ]);
  });

  it("공정 정보 삭제에 실패하면 중복 행을 만들지 않고 중단한다", async () => {
    const { calls, client } = fakeSupabase("information.delete");
    await expect(
      saveReviewRow(client, row("new", { id: "a" }), { lat: 1, lng: 2 }),
    ).rejects.toMatchObject({ message: "information.delete 실패" });
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });
});

describe("refreshExistingRows", () => {
  it("보낸 마커 열만 갱신하고 좌표를 건드리지 않는다", async () => {
    const { calls, client } = fakeSupabase();
    await refreshExistingRows(client, [
      row("existing", { id: "a", name: "새이름", facility_code: "A" }),
    ]);

    const upsert = calls.find((c) => c.table === "markers");
    expect(upsert?.payload).toEqual([{ id: "a", name: "새이름", facility_code: "A" }]);
    expect(upsert?.options).toEqual({ onConflict: "id" });
  });

  it("삭제에 실패하면 중단한다", async () => {
    const { calls, client } = fakeSupabase("erp_details.delete");
    await expect(
      refreshExistingRows(client, [row("existing", { id: "a" })]),
    ).rejects.toMatchObject({ message: "erp_details.delete 실패" });
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("행이 없으면 아무것도 호출하지 않는다", async () => {
    const { calls, client } = fakeSupabase();
    await refreshExistingRows(client, []);
    expect(calls).toEqual([]);
  });
});

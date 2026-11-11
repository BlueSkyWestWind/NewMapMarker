import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import type { StagedErpRow } from "@/features/map-marker/types/marker";
import { addAddonRows, refreshExistingRows, saveReviewRow } from "./erp-review-save";

interface Call {
  table: string;
  op: string;
  payload?: unknown;
  options?: unknown;
}

/** 호출을 기록하는 Supabase 대역. `failOn`에 걸린 연산은 오류를 돌려준다. */
function fakeSupabase(failOn?: string, remainingAfterDelete = 0) {
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
        // 프로젝트 단위 삭제: marker_id 일치 + 프로젝트 조건
        eq: (_column: string, markerId: unknown) => ({
          or: async (filter: string) => {
            calls.push({ table, op: "deleteProject", payload: { markerId, filter } });
            return result(table, "delete");
          },
        }),
      }),
      // 삭제 뒤 남은 행 수 확인. remainingAfterDelete > 0이면 RLS가 삭제를 거른 상황이다.
      select: () => ({
        in: async () => ({ count: remainingAfterDelete, error: null }),
        eq: () => ({
          or: async () => ({ count: remainingAfterDelete, error: null }),
        }),
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

  it("확인 목록에서 묶은 그룹 값(group_key·group_role)을 마커 행에 실어 저장한다", async () => {
    const { calls, client } = fakeSupabase();
    await saveReviewRow(
      client,
      row("new", { id: "a", group_key: "k#묶음#a", group_role: "대표" }),
      { lat: 1, lng: 2 },
    );
    expect(calls.find((c) => c.table === "markers")?.payload).toMatchObject({
      group_key: "k#묶음#a",
      group_role: "대표",
    });
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

describe("saveReviewRow 삭제 권한", () => {
  it("삭제가 권한 때문에 막혀 행이 남으면 insert하지 않고 중단한다", async () => {
    const { calls, client } = fakeSupabase(undefined, 1);
    await expect(
      saveReviewRow(client, row("new", { id: "a" }), { lat: 1, lng: 2 }),
    ).rejects.toMatchObject({ name: "DeletePermissionError" });
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

describe("addAddonRows", () => {
  it("마커와 기존 상세 행을 건드리지 않고 상세 행만 추가한다", async () => {
    const { calls, client } = fakeSupabase();
    await addAddonRows(client, [row("addon", { id: "a" })]);
    expect(calls.map((c) => `${c.table}.${c.op}`)).toEqual([
      "information.insert",
      "erp_details.insert",
    ]);
  });

  it("행이 없으면 아무것도 호출하지 않는다", async () => {
    const { calls, client } = fakeSupabase();
    await addAddonRows(client, []);
    expect(calls).toEqual([]);
  });
});

describe("refreshExistingRows — 프로젝트코드가 있는 행", () => {
  const withProject = (project: string) => ({
    ...row("existing", { id: "a" }),
    info: { marker_id: "a", project_code: project },
    erp: { marker_id: "a", project },
  });

  it("같은 프로젝트(와 프로젝트가 빈 옛 행)만 지우고 다른 프로젝트 행은 남긴다", async () => {
    const { calls, client } = fakeSupabase();
    await refreshExistingRows(client, [withProject("P-EXT")]);

    const deletes = calls.filter((c) => c.op === "deleteProject");
    expect(deletes.map((c) => c.table).sort()).toEqual(["erp_details", "information"]);
    for (const call of deletes) {
      expect(call.payload).toMatchObject({ markerId: "a" });
      expect((call.payload as { filter: string }).filter).toContain('"P-EXT"');
    }
    expect(calls.some((c) => c.op === "delete")).toBe(false);
    expect(calls.filter((c) => c.op === "insert").length).toBe(2);
  });

  it("삭제가 권한 때문에 막혀 행이 남으면 insert하지 않고 중단한다", async () => {
    const { calls, client } = fakeSupabase(undefined, 1);
    await expect(refreshExistingRows(client, [withProject("P-EXT")])).rejects.toMatchObject({
      name: "DeletePermissionError",
    });
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });
});

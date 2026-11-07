import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type { MarkerOp } from "../types";
import {
  MarkerOpsError,
  applyMarkerOps,
  applyOpsToMarkers,
} from "./group-ops";

function marker(
  overrides: Partial<EquipmentMarker> & { id: string },
): EquipmentMarker {
  return { name: "", lat: 0, lng: 0, ...overrides } as EquipmentMarker;
}

describe("applyOpsToMarkers", () => {
  it("update를 camelCase 필드로 매핑해 반영한다", () => {
    const markers = [marker({ id: "a" }), marker({ id: "b" })];
    const result = applyOpsToMarkers(markers, [
      {
        type: "update",
        ids: ["a"],
        patch: {
          parent_marker_id: "b",
          group_role: "SUB",
          group_key: "g1",
          detached_visible: false,
        },
      },
    ]);
    expect(result[0]).toMatchObject({
      id: "a",
      parentMarkerId: "b",
      groupRole: "SUB",
      groupKey: "g1",
      detachedVisible: false,
    });
    expect(result[1]).toBe(markers[1]);
  });

  it("delete는 목록에서 제거한다", () => {
    const markers = [marker({ id: "a" }), marker({ id: "b" })];
    const result = applyOpsToMarkers(markers, [{ type: "delete", ids: ["a"] }]);
    expect(result.map((m) => m.id)).toEqual(["b"]);
  });

  it("원본 배열과 마커를 바꾸지 않는다", () => {
    const markers = [marker({ id: "a" })];
    applyOpsToMarkers(markers, [
      { type: "update", ids: ["a"], patch: { group_role: "대표" } },
      { type: "delete", ids: ["a"] },
    ]);
    expect(markers).toHaveLength(1);
    expect(markers[0].groupRole).toBeUndefined();
  });
});

interface Call {
  op: string;
  payload?: unknown;
  ids: string[];
}

function fakeSupabase(failAt?: number) {
  const calls: Call[] = [];
  const next = () => ({
    error: failAt === calls.length - 1 ? { message: "실패" } : null,
  });
  const client = {
    from: (_table: string) => ({
      update: (payload: unknown) => ({
        in: async (_c: string, ids: string[]) => {
          calls.push({ op: "update", payload, ids });
          return next();
        },
      }),
      delete: () => ({
        in: async (_c: string, ids: string[]) => {
          calls.push({ op: "delete", ids });
          return next();
        },
      }),
    }),
  };
  return { calls, client: client as unknown as SupabaseBrowserClient };
}

describe("applyMarkerOps", () => {
  const ops: MarkerOp[] = [
    { type: "update", ids: ["a", "b"], patch: { group_role: "SUB" } },
    { type: "delete", ids: ["c"] },
  ];

  it("연산을 순서대로 실행한다", async () => {
    const { calls, client } = fakeSupabase();
    await applyMarkerOps(client, ops);
    expect(calls).toEqual([
      { op: "update", payload: { group_role: "SUB" }, ids: ["a", "b"] },
      { op: "delete", ids: ["c"] },
    ]);
  });

  it("두 번째 연산이 실패하면 completed 1인 MarkerOpsError를 던진다", async () => {
    const { client } = fakeSupabase(1);
    const err = await applyMarkerOps(client, ops).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MarkerOpsError);
    expect((err as MarkerOpsError).completed).toBe(1);
  });
});

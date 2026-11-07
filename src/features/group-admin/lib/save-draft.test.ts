import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import type { EditDraft, InfoRecord } from "../types";
import { fetchInfoRows } from "./info-rows";
import { saveDraft } from "./save-draft";

interface Call {
  table: string;
  op: string;
  payload?: unknown;
  key?: string;
  ids?: unknown;
}

/** `failOn`에 맞는 호출이 실패하는 가짜 클라이언트. */
function fake(failOn: (call: Call) => boolean = () => false) {
  const calls: Call[] = [];
  const run = (call: Call) => {
    calls.push(call);
    return Promise.resolve({ error: failOn(call) ? { message: "실패" } : null });
  };
  const client = {
    from: (table: string) => ({
      update: (payload: unknown) => ({
        eq: (key: string, id: unknown) =>
          run({ table, op: "update", payload, key, ids: id }),
        in: (key: string, ids: unknown) =>
          run({ table, op: "update", payload, key, ids }),
      }),
      delete: () => ({
        in: (key: string, ids: unknown) =>
          run({ table, op: "delete", key, ids }),
      }),
      select: () => ({
        in: (key: string, ids: string[]) => {
          calls.push({ table, op: "select", key, ids });
          return Promise.resolve({
            data: ids.map((id, i) => ({ id: i, marker_id: id })),
            error: null,
          });
        },
      }),
    }),
  };
  return { calls, client: client as unknown as SupabaseBrowserClient };
}

function info(id: number, markerId: string): InfoRecord {
  return {
    id,
    markerId,
    projectCode: "",
    facilityYear: "",
    businessType: "",
    finalStationName: "",
    eqClass: "",
    eqType: "",
    installDate: "",
    openDate: "",
  };
}

const draftOf = (d: Partial<EditDraft>): EditDraft => ({
  markerEdits: {},
  infoEdits: {},
  ops: [],
  ...d,
});

describe("saveDraft", () => {
  it("마커 수정 → 정보 수정 → ops(삭제는 뒤) 순서로 보낸다", async () => {
    const { calls, client } = fake();
    const result = await saveDraft(
      client,
      draftOf({
        markerEdits: {
          a: { memo: "m", facilityTeam: "팀", roadAddress: "도로", jibunAddress: "지번" },
        },
        infoEdits: { 1: { eqType: "RRU", installDate: "" } },
        ops: [
          { type: "delete", ids: ["z"] },
          { type: "update", ids: ["b"], patch: { group_role: "SUB" } },
        ],
      }),
      [info(1, "a")],
    );
    expect(calls.map((c) => `${c.table}.${c.op}`)).toEqual([
      "markers.update",
      "information.update",
      "markers.update",
      "markers.delete",
    ]);
    expect(calls[0].payload).toEqual({
      memo: "m",
      facility_team: "팀",
      road_address: "도로",
      jibun_address: "지번",
    });
    expect(calls[1].payload).toEqual({ eq_type: "RRU", install_date: null });
    expect(result).toEqual({
      savedMarkerIds: ["a"],
      savedInfoIds: [1],
      completedOps: 2,
      error: null,
    });
  });

  it("국소명 수정은 정보 행 place_name도 쓴다", async () => {
    const { calls, client } = fake();
    await saveDraft(client, draftOf({ markerEdits: { a: { name: "새이름" } } }), [
      info(1, "a"),
      info(2, "a"),
      info(3, "other"),
    ]);
    expect(calls[0]).toMatchObject({
      table: "markers",
      payload: { name: "새이름" },
      ids: "a",
    });
    const infoCalls = calls.filter((c) => c.table === "information");
    expect(infoCalls.map((c) => [c.ids, c.payload])).toEqual([
      [1, { place_name: "새이름" }],
      [2, { place_name: "새이름" }],
    ]);
  });

  it("코드 수정은 facility_code를 두 테이블에 쓴다", async () => {
    const { calls, client } = fake();
    await saveDraft(
      client,
      draftOf({ markerEdits: { a: { facilityCode: "C1" } } }),
      [info(1, "a")],
    );
    expect(calls[0].payload).toEqual({ facility_code: "C1" });
    expect(calls[1]).toMatchObject({
      table: "information",
      payload: { facility_code: "C1" },
      ids: 1,
    });
  });

  it("삭제한 마커의 필드·정보 수정은 호출하지 않는다", async () => {
    const { calls, client } = fake();
    const result = await saveDraft(
      client,
      draftOf({
        markerEdits: { a: { name: "x" } },
        infoEdits: { 1: { eqType: "RRU" } },
        ops: [{ type: "delete", ids: ["a"] }],
      }),
      [info(1, "a")],
    );
    expect(calls.map((c) => `${c.table}.${c.op}`)).toEqual(["markers.delete"]);
    expect(result.savedMarkerIds).toEqual([]);
    expect(result.savedInfoIds).toEqual([]);
  });

  it("두 번째 정보 수정이 실패하면 거기서 멈추고 앞의 것만 저장됨으로 돌려준다", async () => {
    const { calls, client } = fake((c) => c.table === "information" && c.ids === 2);
    const result = await saveDraft(
      client,
      draftOf({
        markerEdits: { a: { memo: "m" } },
        infoEdits: { 1: { eqType: "A" }, 2: { eqType: "B" } },
        ops: [{ type: "delete", ids: ["z"] }],
      }),
      [info(1, "a"), info(2, "a")],
    );
    expect(result.savedMarkerIds).toEqual(["a"]);
    expect(result.savedInfoIds).toEqual([1]);
    expect(result.completedOps).toBe(0);
    expect(result.error).toEqual({ message: "실패", step: "info" });
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("저장된 항목을 뺀 변경분으로 다시 저장하면 이미 저장된 항목은 다시 쓰지 않는다", async () => {
    const first = fake((c) => c.table === "information" && c.ids === 2);
    const draft = draftOf({
      markerEdits: { a: { memo: "m" } },
      infoEdits: { 1: { eqType: "A" }, 2: { eqType: "B" } },
    });
    const rows = [info(1, "a"), info(2, "a")];
    const r1 = await saveDraft(first.client, draft, rows);
    const retry = draftOf({
      markerEdits: Object.fromEntries(
        Object.entries(draft.markerEdits).filter(([id]) => !r1.savedMarkerIds.includes(id)),
      ),
      infoEdits: Object.fromEntries(
        Object.entries(draft.infoEdits).filter(
          ([id]) => !r1.savedInfoIds.includes(Number(id)),
        ),
      ),
    });
    const second = fake();
    await saveDraft(second.client, retry, rows);
    expect(second.calls).toHaveLength(1);
    expect(second.calls[0]).toMatchObject({ table: "information", ids: 2 });
  });

  it("마커 수정이 실패하면 step marker", async () => {
    const { client } = fake((c) => c.table === "markers");
    const result = await saveDraft(
      client,
      draftOf({ markerEdits: { a: { memo: "m" } } }),
      [],
    );
    expect(result.error?.step).toBe("marker");
    expect(result.savedMarkerIds).toEqual([]);
  });

  it("ops 실패는 completedOps와 step ops로 돌려준다", async () => {
    const { client } = fake((c) => c.op === "delete");
    const result = await saveDraft(
      client,
      draftOf({
        ops: [
          { type: "delete", ids: ["z"] },
          { type: "update", ids: ["b"], patch: { group_role: "SUB" } },
        ],
      }),
      [],
    );
    expect(result.completedOps).toBe(1);
    expect(result.error?.step).toBe("ops");
  });
});

describe("fetchInfoRows", () => {
  it("250개 ID를 100개씩 3번에 나눠 조회한다", async () => {
    const { calls, client } = fake();
    const ids = Array.from({ length: 250 }, (_, i) => `m${i}`);
    const rows = await fetchInfoRows(client, ids);
    expect(calls.map((c) => (c.ids as string[]).length)).toEqual([100, 100, 50]);
    expect(calls.every((c) => c.key === "marker_id")).toBe(true);
    expect(rows).toHaveLength(250);
  });
});

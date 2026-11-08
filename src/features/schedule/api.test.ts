import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { applyScheduleImport, createScheduleCell, fetchScheduleCells } from "./api";
import type { ImportPlan } from "./lib/schedule-excel";

const PLAN: ImportPlan = {
  deleteFrom: "2026-11-09",
  deleteTo: "2026-11-15",
  inserts: [
    { workDate: "2026-11-09", columnId: "c1", rowNo: 0, mainText: "가", subText: "", textColor: null },
    { workDate: "2026-11-10", columnId: "c1", rowNo: 0, mainText: "나", subText: "", textColor: "0070C0" },
  ],
  days: [{ workDate: "2026-11-09", note: "메모" }],
  marks: [{ workDate: "2026-11-09", columnId: "c1", color: "D9F2D0" }],
  columnUpdates: [{ id: "c1", leaderLabel: "팀장A" }],
  skippedCount: 0,
};

function stubClient(options: {
  rpcError?: { message: string };
  rpcData?: unknown;
  leaderError?: { message: string };
}) {
  const calls: string[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${name}:${args.p_from}:${args.p_to}`);
      return { data: options.rpcData ?? 2, error: options.rpcError ?? null };
    },
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          calls.push(`update:${table}:${JSON.stringify(values)}`);
          return { error: options.leaderError ?? null };
        },
      }),
    }),
  } as unknown as SupabaseBrowserClient;
  return { client, calls };
}

describe("applyScheduleImport", () => {
  it("범위를 교체한 뒤 팀장 이름을 반영하고 칸 수를 돌려준다", async () => {
    const { client, calls } = stubClient({ rpcData: 2 });
    expect(await applyScheduleImport(client, PLAN)).toEqual({ count: 2, warning: null });
    expect(calls[0]).toBe("rpc:replace_schedule_cells:2026-11-09:2026-11-15");
    expect(calls[1]).toContain("update:schedule_columns");
    expect(calls[1]).toContain("팀장A");
  });

  it("교체가 끝난 뒤 팀장 반영이 실패해도 가져오기는 성공으로 보고하고 경고를 담는다", async () => {
    const { client } = stubClient({ rpcData: 2, leaderError: { message: "권한 없음" } });
    const result = await applyScheduleImport(client, PLAN);
    expect(result.count).toBe(2);
    expect(result.warning).toContain("팀장");
    expect(result.warning).toContain("권한 없음");
  });

  it("교체 자체가 실패하면 오류를 던지고 팀장은 건드리지 않는다", async () => {
    const { client, calls } = stubClient({ rpcError: { message: "제약 위반" } });
    await expect(applyScheduleImport(client, PLAN)).rejects.toMatchObject({ message: "제약 위반" });
    expect(calls.some((call) => call.startsWith("update:"))).toBe(false);
  });
});

describe("no_companion 컬럼", () => {
  const cellRow = (extra: Record<string, unknown>) => ({
    id: "c1",
    work_date: "2026-11-09",
    column_id: "col1",
    row_no: 0,
    main_text: "국소",
    sub_text: "",
    text_color: null,
    ...extra,
  });

  /** select(columns)로 요청한 열을 기록하고, 준비한 응답을 차례로 돌려주는 조회 대역. */
  function cellsClient(responses: { data?: unknown[]; error?: unknown }[]) {
    const requested: string[] = [];
    const client = {
      from: () => ({
        select: (columns: string) => {
          requested.push(columns);
          const chain = {
            gte: () => chain,
            lte: () => chain,
            order: () => chain,
            range: async () => {
              const next = responses.shift() ?? { data: [] };
              return { data: next.data ?? null, count: next.data?.length ?? null, error: next.error ?? null };
            },
          };
          return chain;
        },
      }),
    } as unknown as SupabaseBrowserClient;
    return { client, requested };
  }

  it("no_companion 값을 noCompanion으로 바꾸고 없으면 false다", async () => {
    const { client } = cellsClient([
      { data: [cellRow({ no_companion: true }), cellRow({ id: "c2", row_no: 1 })] },
    ]);
    const cells = await fetchScheduleCells(client, "2026-11-09", "2026-11-09");
    expect(cells.map((cell) => cell.noCompanion)).toEqual([true, false]);
  });

  it("컬럼이 아직 없으면 그 열 없이 다시 읽고 noCompanion은 false다", async () => {
    const { client, requested } = cellsClient([
      { error: { code: "42703", message: "column schedule_cells.no_companion does not exist" } },
      { data: [cellRow({})] },
    ]);
    const cells = await fetchScheduleCells(client, "2026-11-09", "2026-11-09");
    expect(requested).toHaveLength(2);
    expect(requested[0]).toContain("no_companion");
    expect(requested[1]).not.toContain("no_companion");
    expect(cells[0].noCompanion).toBe(false);
  });

  /** insert(payload)를 기록하는 생성 대역. */
  function insertClient() {
    const payloads: Record<string, unknown>[] = [];
    const client = {
      from: () => ({
        insert: (payload: Record<string, unknown>) => {
          payloads.push(payload);
          return { select: () => ({ single: async () => ({ data: { id: "new" }, error: null }) }) };
        },
      }),
    } as unknown as SupabaseBrowserClient;
    return { client, payloads };
  }

  const position = { workDate: "2026-11-09", columnId: "col1", rowNo: 0 };
  const text = { mainText: "국소", subText: "", textColor: null };

  it("noCompanion이 없으면 no_companion 키를 보내지 않는다(컬럼 없는 DB에서도 저장된다)", async () => {
    const { client, payloads } = insertClient();
    await createScheduleCell(client, position, text);
    expect("no_companion" in payloads[0]).toBe(false);
  });

  it("noCompanion이 true면 no_companion: true를 보낸다", async () => {
    const { client, payloads } = insertClient();
    await createScheduleCell(client, position, { ...text, noCompanion: true });
    expect(payloads[0].no_companion).toBe(true);
  });
});

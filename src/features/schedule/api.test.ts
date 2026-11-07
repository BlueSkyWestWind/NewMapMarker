import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { applyScheduleImport } from "./api";
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

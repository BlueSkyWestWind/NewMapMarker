import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import {
  SEARCH_RESULT_LIMIT,
  applyScheduleGroups,
  applyScheduleImport,
  createScheduleCell,
  fetchScheduleCells,
  isCompanionTargetSupported,
  searchScheduleCellsFiltered,
  toRpcGroups,
} from "./api";
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

describe("companion_target 컬럼", () => {
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

  it("companion_target 값을 companionTarget으로 바꾸고 없으면 false다", async () => {
    const { client } = cellsClient([
      { data: [cellRow({ companion_target: true }), cellRow({ id: "c2", row_no: 1 })] },
    ]);
    const cells = await fetchScheduleCells(client, "2026-11-09", "2026-11-09");
    expect(cells.map((cell) => cell.companionTarget)).toEqual([true, false]);
  });

  it("컬럼이 아직 없으면 그 열 없이 다시 읽고 companionTarget은 false다", async () => {
    const { client, requested } = cellsClient([
      { error: { code: "42703", message: "column schedule_cells.companion_target does not exist" } },
      { data: [cellRow({})] },
    ]);
    const cells = await fetchScheduleCells(client, "2026-11-09", "2026-11-09");
    expect(requested).toHaveLength(2);
    expect(requested[0]).toContain("companion_target");
    expect(requested[1]).not.toContain("companion_target");
    expect(cells[0].companionTarget).toBe(false);
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

  it("companionTarget이 없으면 companion_target 키를 보내지 않는다(컬럼 없는 DB에서도 저장된다)", async () => {
    const { client, payloads } = insertClient();
    await createScheduleCell(client, position, text);
    expect("companion_target" in payloads[0]).toBe(false);
  });

  it("companionTarget이 true면 companion_target: true를 보낸다", async () => {
    const { client, payloads } = insertClient();
    await createScheduleCell(client, position, { ...text, companionTarget: true });
    expect(payloads[0].companion_target).toBe(true);
  });
});

describe("isCompanionTargetSupported", () => {
  const probeClient = (error: unknown) =>
    ({
      from: () => ({
        select: () => ({ limit: async () => ({ data: [], error }) }),
      }),
    }) as unknown as SupabaseBrowserClient;

  it("컬럼이 있으면 true다", async () => {
    await expect(isCompanionTargetSupported(probeClient(null))).resolves.toBe(true);
  });

  it("컬럼이 없다는 오류면 false다(저장 전에 마이그레이션 안내를 하려고)", async () => {
    const error = { message: "column schedule_cells.companion_target does not exist" };
    await expect(isCompanionTargetSupported(probeClient(error))).resolves.toBe(false);
  });

  it("다른 오류는 그대로 던진다", async () => {
    const error = { message: "network" };
    await expect(isCompanionTargetSupported(probeClient(error))).rejects.toBe(error);
  });
});

describe("toRpcGroups & applyScheduleGroups", () => {
  it("toRpcGroups는 GroupState[]를 스네이크 케이스 RPC JSON으로 변환한다", () => {
    const rpc = toRpcGroups([
      {
        workDate: "2026-11-09",
        columnId: "col-1",
        baseIds: ["c1"],
        cells: [
          {
            id: "c1",
            rowNo: 0,
            mainText: "국소1",
            subText: "모국1",
            textColor: "0070C0",
            companionTarget: true,
            result: { status: "partial", reason: "우천", rescheduledTo: "2026-11-10" },
          },
          {
            id: null,
            rowNo: 1,
            mainText: "국소2",
            subText: "",
            textColor: null,
          },
        ],
      },
    ]);

    expect(rpc).toEqual([
      {
        work_date: "2026-11-09",
        column_id: "col-1",
        base_ids: ["c1"],
        cells: [
          {
            id: "c1",
            row_no: 0,
            main_text: "국소1",
            sub_text: "모국1",
            text_color: "0070C0",
            companion_target: true,
            result_status: "partial",
            result_reason: "우천",
            rescheduled_to: "2026-11-10",
          },
          {
            id: null,
            row_no: 1,
            main_text: "국소2",
            sub_text: "",
            text_color: null,
            companion_target: false,
            result_status: null,
            result_reason: "",
            rescheduled_to: null,
          },
        ],
      },
    ]);
  });

  it("applyScheduleGroups는 created 목록을 카멜 케이스로 돌려주고 오류는 그대로 던진다", async () => {
    const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
    const okClient = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return {
          data: { created: [{ group_index: 0, cell_index: 1, id: "new-uuid" }] },
          error: null,
        };
      },
    } as unknown as SupabaseBrowserClient;

    const created = await applyScheduleGroups(
      okClient,
      [
        {
          workDate: "2026-11-09",
          columnId: "col-1",
          baseIds: [],
          cells: [{ id: null, rowNo: 0, mainText: "국소", subText: "", textColor: null }],
        },
      ],
      [{ workDate: "2026-11-09", columnId: "col-1", color: "D9F2D0" }],
    );

    expect(rpcCalls[0].name).toBe("apply_schedule_groups");
    expect(rpcCalls[0].args.p_marks).toEqual([
      { work_date: "2026-11-09", column_id: "col-1", color: "D9F2D0" },
    ]);
    expect(created).toEqual([{ groupIndex: 0, cellIndex: 1, id: "new-uuid" }]);

    const errClient = {
      rpc: async () => ({ data: null, error: { code: "P0001", message: "stale_group" } }),
    } as unknown as SupabaseBrowserClient;
    await expect(applyScheduleGroups(errClient, [], [])).rejects.toMatchObject({
      message: "stale_group",
    });
  });
});

describe("searchScheduleCellsFiltered", () => {
  function searchClient(rows: Record<string, unknown>[], missingResultOnce = false) {
    const ops: string[] = [];
    let failOnce = missingResultOnce;
    const client = {
      from: (table: string) => ({
        select: (columns: string) => {
          ops.push(`select:${table}:${columns}`);
          const chain = {
            ilike: (col: string, val: string) => {
              ops.push(`ilike:${col}:${val}`);
              return chain;
            },
            or: (expr: string) => {
              ops.push(`or:${expr}`);
              return chain;
            },
            in: (col: string, vals: string[]) => {
              ops.push(`in:${col}:${vals.join(",")}`);
              return chain;
            },
            gte: (col: string, val: string) => {
              ops.push(`gte:${col}:${val}`);
              return chain;
            },
            lte: (col: string, val: string) => {
              ops.push(`lte:${col}:${val}`);
              return chain;
            },
            order: (col: string) => {
              ops.push(`order:${col}`);
              return chain;
            },
            limit: async (n: number) => {
              ops.push(`limit:${n}`);
              if (failOnce) {
                failOnce = false;
                return {
                  data: null,
                  error: { code: "42703", message: "column result_status does not exist" },
                };
              }
              return { data: rows, error: null };
            },
          };
          return chain;
        },
      }),
    } as unknown as SupabaseBrowserClient;
    return { client, ops };
  }

  const makeRow = (i: number) => ({
    id: `id-${i}`,
    work_date: "2026-11-09",
    column_id: "col-1",
    row_no: 0,
    main_text: `국소${i}`,
    sub_text: "",
    text_color: null,
  });

  it("옵션이 비어 있으면 main_text ilike와 limit(201)로 조회하고 truncated=false다", async () => {
    const { client, ops } = searchClient([makeRow(1)]);
    const res = await searchScheduleCellsFiltered(client, "국소");
    expect(res.truncated).toBe(false);
    expect(res.cells).toHaveLength(1);
    expect(ops).toContain("ilike:main_text:%국소%");
    expect(ops).toContain(`limit:${SEARCH_RESULT_LIMIT + 1}`);
    expect(ops.some((op) => op.startsWith("or:"))).toBe(false);
  });

  it("columnIds·from·to·includeSub 옵션을 모두 반영한다", async () => {
    const { client, ops } = searchClient([makeRow(1)]);
    await searchScheduleCellsFiltered(client, "국소", {
      columnIds: ["col-1", "col-2"],
      from: "2026-11-01",
      to: "2026-11-30",
      includeSub: true,
    });
    expect(ops).toContain('or:main_text.ilike."%국소%",sub_text.ilike."%국소%"');
    expect(ops).toContain("in:column_id:col-1,col-2");
    expect(ops).toContain("gte:work_date:2026-11-01");
    expect(ops).toContain("lte:work_date:2026-11-30");
  });

  it("결과가 201건이면 truncated=true이고 앞의 200건만 돌려준다", async () => {
    const rows = Array.from({ length: SEARCH_RESULT_LIMIT + 1 }, (_, i) => makeRow(i));
    const { client } = searchClient(rows);
    const res = await searchScheduleCellsFiltered(client, "국소");
    expect(res.truncated).toBe(true);
    expect(res.cells).toHaveLength(SEARCH_RESULT_LIMIT);
  });

  it("결과 컬럼이 없는 DB면 CELL_COLUMNS만으로 재시도한다", async () => {
    const { client, ops } = searchClient([makeRow(1)], true);
    const res = await searchScheduleCellsFiltered(client, "국소");
    expect(res.cells).toHaveLength(1);
    expect(ops.filter((op) => op.startsWith("select:"))).toHaveLength(2);
  });
});

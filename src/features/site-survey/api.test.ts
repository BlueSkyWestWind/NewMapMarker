import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { loadSurveySettings, saveSurveySettings } from "./api";

type Err = { code?: string; message?: string } | null;

interface Stub {
  /** select("settings, updated_at").eq().maybeSingle() 결과(순서대로) */
  reads?: { data: { settings: unknown; updated_at: string } | null; error: Err }[];
  insert?: { data: { updated_at: string } | null; error: Err };
  update?: { data: { updated_at: string }[] | null; error: Err };
}

/** 계획의 호출 모양을 그대로 흉내 낸다 */
function stubClient(stub: Stub) {
  const calls: string[] = [];
  const reads = [...(stub.reads ?? [])];
  const client = {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            calls.push(`select:${table}:${columns}:${column}=${value}`);
            return reads.shift() ?? { data: null, error: null };
          },
        }),
      }),
      insert: (values: Record<string, unknown>) => ({
        select: (columns: string) => ({
          single: async () => {
            calls.push(`insert:${table}:${JSON.stringify(values)}:${columns}`);
            return stub.insert ?? { data: null, error: null };
          },
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: (c1: string, v1: string) => ({
          eq: (c2: string, v2: string) => ({
            select: async (columns: string) => {
              calls.push(`update:${table}:${JSON.stringify(values)}:${c1}=${v1}:${c2}=${v2}:${columns}`);
              return stub.update ?? { data: [], error: null };
            },
          }),
        }),
      }),
    }),
  };
  return { client: client as unknown as SupabaseBrowserClient, calls };
}

const OVERRIDES = { station: { nonScanLabel: "X" } };

describe("loadSurveySettings", () => {
  it("행이 없으면 빈 덮어쓰기와 updatedAt null이다", async () => {
    const { client } = stubClient({ reads: [{ data: null, error: null }] });
    expect(await loadSurveySettings(client)).toEqual({ status: "ok", overrides: {}, updatedAt: null });
  });

  it("행이 있으면 덮어쓰기와 updatedAt을 돌려준다", async () => {
    const { client, calls } = stubClient({
      reads: [{ data: { settings: OVERRIDES, updated_at: "2026-11-13T00:00:00Z" }, error: null }],
    });
    expect(await loadSurveySettings(client)).toEqual({
      status: "ok",
      overrides: OVERRIDES,
      updatedAt: "2026-11-13T00:00:00Z",
    });
    expect(calls[0]).toBe("select:survey_settings:settings, updated_at:id=default");
  });

  it("테이블이 없으면 missing-table이다", async () => {
    for (const code of ["42P01", "PGRST205"]) {
      const { client } = stubClient({ reads: [{ data: null, error: { code, message: "x" } }] });
      expect(await loadSurveySettings(client)).toEqual({ status: "missing-table" });
    }
  });

  it("스키마에 맞지 않으면 invalid와 오류 목록이다", async () => {
    const { client } = stubClient({
      reads: [{ data: { settings: { station: { scanWords: "x" } }, updated_at: "t" }, error: null }],
    });
    const r = await loadSurveySettings(client);
    expect(r.status).toBe("invalid");
    if (r.status === "invalid") expect(r.errors.join("\n")).toContain("station.scanWords");
  });

  it("그 밖의 오류는 던진다", async () => {
    const { client } = stubClient({ reads: [{ data: null, error: { code: "XX000", message: "boom" } }] });
    await expect(loadSurveySettings(client)).rejects.toMatchObject({ message: "boom" });
  });
});

describe("saveSurveySettings", () => {
  it("expected가 null이면 insert하고 saved와 새 updatedAt을 돌려준다", async () => {
    const { client, calls } = stubClient({ insert: { data: { updated_at: "T1" }, error: null } });
    expect(await saveSurveySettings(client, OVERRIDES, null, "user-1")).toEqual({ status: "saved", updatedAt: "T1" });
    expect(calls[0]).toBe(
      `insert:survey_settings:${JSON.stringify({ id: "default", settings: OVERRIDES, updated_by: "user-1" })}:updated_at`,
    );
  });

  it("insert가 중복(23505)이면 conflict다", async () => {
    const { client } = stubClient({ insert: { data: null, error: { code: "23505" } } });
    expect(await saveSurveySettings(client, OVERRIDES, null, "u")).toEqual({ status: "conflict" });
  });

  it("insert가 RLS 거부(42501)이면 denied다(일반 계정)", async () => {
    const { client } = stubClient({ insert: { data: null, error: { code: "42501" } } });
    expect(await saveSurveySettings(client, OVERRIDES, null, "u")).toEqual({ status: "denied" });
  });

  it("expected가 있으면 updated_at이 같은 행만 갱신하고 한 행이 돌아오면 saved다", async () => {
    const { client, calls } = stubClient({ update: { data: [{ updated_at: "T2" }], error: null } });
    expect(await saveSurveySettings(client, OVERRIDES, "T1", "user-1")).toEqual({ status: "saved", updatedAt: "T2" });
    expect(calls[0]).toBe(
      `update:survey_settings:${JSON.stringify({ settings: OVERRIDES, updated_by: "user-1" })}:id=default:updated_at=T1:updated_at`,
    );
  });

  it("0행이고 현재 updated_at이 다르면 conflict다", async () => {
    const { client } = stubClient({
      update: { data: [], error: null },
      reads: [{ data: { settings: {}, updated_at: "T9" }, error: null }],
    });
    expect(await saveSurveySettings(client, OVERRIDES, "T1", "u")).toEqual({ status: "conflict" });
  });

  it("0행이고 updated_at이 같으면 권한 거부(denied)다", async () => {
    const { client } = stubClient({
      update: { data: [], error: null },
      reads: [{ data: { settings: {}, updated_at: "T1" }, error: null }],
    });
    expect(await saveSurveySettings(client, OVERRIDES, "T1", "u")).toEqual({ status: "denied" });
  });

  it("update가 42501을 던져도 denied다", async () => {
    const { client } = stubClient({ update: { data: null, error: { code: "42501" } } });
    expect(await saveSurveySettings(client, OVERRIDES, "T1", "u")).toEqual({ status: "denied" });
  });

  it("테이블이 없으면 missing-table이다", async () => {
    const a = stubClient({ insert: { data: null, error: { code: "42P01" } } });
    expect(await saveSurveySettings(a.client, OVERRIDES, null, "u")).toEqual({ status: "missing-table" });
    const b = stubClient({ update: { data: null, error: { code: "PGRST205" } } });
    expect(await saveSurveySettings(b.client, OVERRIDES, "T1", "u")).toEqual({ status: "missing-table" });
  });

  it("그 밖의 오류는 던진다", async () => {
    const { client } = stubClient({ insert: { data: null, error: { code: "XX000", message: "boom" } } });
    await expect(saveSurveySettings(client, OVERRIDES, null, "u")).rejects.toMatchObject({ message: "boom" });
  });
});

import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { assertTableEmpty, DeletePermissionError, deleteRowsGuarded } from "./guarded-delete";

/** RLS를 흉내 내는 가짜 클라이언트. allowDelete가 false면 삭제가 오류 없이 0행만 지운다. */
function fakeClient(rows: string[], allowDelete: boolean, deleteError: unknown = null) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      return {
        delete() {
          return {
            async in(column: string, values: string[]) {
              calls.push(`delete ${table}.${column} in ${values.join(",")}`);
              if (allowDelete && !deleteError) {
                for (const value of values) {
                  const index = rows.indexOf(value);
                  if (index >= 0) rows.splice(index, 1);
                }
              }
              return { error: deleteError };
            },
          };
        },
        select() {
          return {
            async in(column: string, values: string[]) {
              calls.push(`count ${table}.${column} in ${values.join(",")}`);
              return {
                count: rows.filter((row) => values.includes(row)).length,
                error: null,
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseBrowserClient;
  return { client, calls, rows };
}

describe("deleteRowsGuarded", () => {
  it("삭제한 뒤 남은 행이 없으면 정상 종료한다", async () => {
    const { client, rows } = fakeClient(["a", "b"], true);
    await deleteRowsGuarded(client, "information", "marker_id", ["a"]);
    expect(rows).toEqual(["b"]);
  });

  it("삭제가 오류 없이 0행만 지웠으면(RLS 거부) DeletePermissionError를 던진다", async () => {
    const { client } = fakeClient(["a"], false);
    await expect(
      deleteRowsGuarded(client, "information", "marker_id", ["a"]),
    ).rejects.toBeInstanceOf(DeletePermissionError);
  });

  it("Supabase 오류는 그대로 던지고 남은 행 확인은 하지 않는다", async () => {
    const boom = { message: "network" };
    const { client, calls } = fakeClient(["a"], true, boom);
    await expect(
      deleteRowsGuarded(client, "information", "marker_id", ["a"]),
    ).rejects.toBe(boom);
    expect(calls.some((call) => call.startsWith("count"))).toBe(false);
  });

  it("지울 값이 없으면 아무 요청도 보내지 않는다", async () => {
    const { client, calls } = fakeClient([], true);
    await deleteRowsGuarded(client, "information", "marker_id", []);
    expect(calls).toEqual([]);
  });
});

describe("deleteRowsGuarded 요청 크기", () => {
  it("값이 많으면 100개씩 나눠 지워 URL이 길어지지 않게 한다", async () => {
    const values = Array.from({ length: 250 }, (_, i) => `id${i}`);
    const { client, calls } = fakeClient([...values], true);
    await deleteRowsGuarded(client, "information", "marker_id", values);
    const deletes = calls.filter((call) => call.startsWith("delete"));
    expect(deletes).toHaveLength(3);
  });
});

describe("assertTableEmpty", () => {
  function countClient(count: number) {
    return {
      from: () => ({
        select: async () => ({ count, error: null }),
      }),
    } as unknown as SupabaseBrowserClient;
  }

  it("행이 남아 있지 않으면 통과한다", async () => {
    await expect(assertTableEmpty(countClient(0), "markers")).resolves.toBeUndefined();
  });

  it("전체 삭제 뒤에도 행이 남아 있으면(RLS 거부) DeletePermissionError를 던진다", async () => {
    await expect(assertTableEmpty(countClient(5), "markers")).rejects.toBeInstanceOf(
      DeletePermissionError,
    );
  });
});

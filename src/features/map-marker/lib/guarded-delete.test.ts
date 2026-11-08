import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { DeletePermissionError, deleteRowsGuarded } from "./guarded-delete";

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

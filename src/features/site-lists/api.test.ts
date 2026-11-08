import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchSiteListCount } from "./api";

/** select("id", { count, head })의 결과만 흉내 낸다. */
function fakeClient(result: { count: number | null; error: unknown }) {
  const calls: { table: string; columns: string; options: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      select: async (columns: string, options: unknown) => {
        calls.push({ table, columns, options });
        return result;
      },
    }),
  } as unknown as SupabaseBrowserClient;
  return { client, calls };
}

describe("fetchSiteListCount", () => {
  it("site_lists의 개수만 head 요청으로 가져온다", async () => {
    const { client, calls } = fakeClient({ count: 2, error: null });
    await expect(fetchSiteListCount(client)).resolves.toBe(2);
    expect(calls).toEqual([
      { table: "site_lists", columns: "id", options: { count: "exact", head: true } },
    ]);
  });

  it("count가 null이면 0이다", async () => {
    const { client } = fakeClient({ count: null, error: null });
    await expect(fetchSiteListCount(client)).resolves.toBe(0);
  });

  it("오류는 그대로 던진다", async () => {
    const boom = { message: "table missing" };
    const { client } = fakeClient({ count: null, error: boom });
    await expect(fetchSiteListCount(client)).rejects.toBe(boom);
  });
});

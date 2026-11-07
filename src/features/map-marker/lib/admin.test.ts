import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchIsAppAdmin } from "./admin";

function fakeClient(result: { data: unknown; error: unknown }): SupabaseBrowserClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => result,
  };
  return { from: () => builder } as unknown as SupabaseBrowserClient;
}

describe("fetchIsAppAdmin", () => {
  it("행이 있으면 true", async () => {
    const client = fakeClient({ data: { user_id: "u1" }, error: null });
    await expect(fetchIsAppAdmin(client, "u1")).resolves.toBe(true);
  });

  it("행이 없으면 false", async () => {
    const client = fakeClient({ data: null, error: null });
    await expect(fetchIsAppAdmin(client, "u1")).resolves.toBe(false);
  });

  it("오류면 던진다", async () => {
    const error = new Error("boom");
    const client = fakeClient({ data: null, error });
    await expect(fetchIsAppAdmin(client, "u1")).rejects.toBe(error);
  });
});

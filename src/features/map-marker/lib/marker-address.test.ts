import { describe, expect, it, vi } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { saveMarkerAddress } from "./marker-address";

function fakeSupabase(error: unknown = null) {
  const eq = vi.fn().mockResolvedValue({ error });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { client: { from } as unknown as SupabaseBrowserClient, from, update, eq };
}

describe("saveMarkerAddress", () => {
  it("markers 행의 marker_address를 갱신한다", async () => {
    const { client, from, update, eq } = fakeSupabase();
    await expect(saveMarkerAddress(client, "erp_A", " 광주 북구 운암동 1 ")).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith("markers");
    expect(update).toHaveBeenCalledWith({ marker_address: "광주 북구 운암동 1" });
    expect(eq).toHaveBeenCalledWith("id", "erp_A");
  });

  it("빈 주소를 주면 마커주소를 비운다(옮긴 뒤 옛 주소가 남지 않게)", async () => {
    const { client, update } = fakeSupabase();
    await expect(saveMarkerAddress(client, "erp_A", "  ")).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({ marker_address: "" });
  });

  it("컬럼이 없는 DB처럼 오류가 나면 false를 돌려준다(던지지 않는다)", async () => {
    const { client } = fakeSupabase({ code: "PGRST204", message: "Could not find the 'marker_address' column" });
    await expect(saveMarkerAddress(client, "erp_A", "광주")).resolves.toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const getAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: () => getAdmin(),
}));

const getCloudflareContext = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => getCloudflareContext(),
}));

import { recordKmaCall } from "./kma-usage";

/** 마이크로태스크를 모두 비운다 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  rpc.mockReset();
  getAdmin.mockReset();
  getCloudflareContext.mockReset();
  getAdmin.mockReturnValue({ rpc });
  rpc.mockResolvedValue({ error: null });
  getCloudflareContext.mockImplementation(() => {
    throw new Error("no cloudflare context");
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("recordKmaCall", () => {
  it("record_kma_call RPC를 정시 버킷과 함께 한 번 부른다", async () => {
    recordKmaCall({ provider: "apihub", operation: "getVilageFcst", source: "user" });
    await flush();

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("record_kma_call");
    expect(args).toMatchObject({
      p_provider: "apihub",
      p_operation: "getVilageFcst",
      p_source: "user",
      p_error: null,
    });
    expect(args.p_hour).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\+09:00$/);
  });

  it("실패 코드를 p_error로 넘긴다", async () => {
    recordKmaCall({ provider: "datago", operation: "getUltraSrtNcst", source: "prefetch", error: "401" });
    await flush();

    expect(rpc.mock.calls[0][1]).toMatchObject({ p_source: "prefetch", p_error: "401" });
  });

  it("RPC가 거부돼도 예외를 밖으로 내보내지 않는다", async () => {
    rpc.mockRejectedValue(new Error("db down"));
    expect(() =>
      recordKmaCall({ provider: "apihub", operation: "getVilageFcst", source: "user" }),
    ).not.toThrow();
    await flush();
  });

  it("RPC가 오류 객체를 돌려줘도(함수 미적용) 예외가 없다", async () => {
    rpc.mockResolvedValue({ error: { message: "function not found" } });
    expect(() =>
      recordKmaCall({ provider: "apihub", operation: "getVilageFcst", source: "user" }),
    ).not.toThrow();
    await flush();
  });

  it("서비스 키가 없어 클라이언트를 못 만들어도 예외가 없다", () => {
    getAdmin.mockImplementation(() => {
      throw new Error("SUPABASE_SECRET_KEY 없음");
    });
    expect(() =>
      recordKmaCall({ provider: "apihub", operation: "getVilageFcst", source: "user" }),
    ).not.toThrow();
  });

  it("Cloudflare 컨텍스트가 있으면 waitUntil에 맡긴다", async () => {
    const waitUntil = vi.fn();
    getCloudflareContext.mockReturnValue({ ctx: { waitUntil } });
    recordKmaCall({ provider: "apihub", operation: "getVilageFcst", source: "user" });
    await flush();

    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
});

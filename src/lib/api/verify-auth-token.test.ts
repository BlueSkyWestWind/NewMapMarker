import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

import { verifyAuthToken } from "./verify-auth-token";

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://newmarker.example.com/api/its-key", { headers });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  getUser.mockReset();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

describe("verifyAuthToken", () => {
  it("Authorization 헤더가 없으면 401", async () => {
    const result = await verifyAuthToken(makeRequest());
    expect(result).toEqual({ ok: false, status: 401, error: "로그인이 필요합니다." });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("Bearer가 아닌 스킴(Basic)은 401", async () => {
    const result = await verifyAuthToken(makeRequest({ authorization: "Basic abc" }));
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("Bearer 뒤 토큰이 비면 401", async () => {
    const result = await verifyAuthToken(makeRequest({ authorization: "Bearer   " }));
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("소문자 bearer도 토큰으로 인정", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    await verifyAuthToken(makeRequest({ authorization: "bearer tok" }));
    expect(getUser).toHaveBeenCalledWith("tok");
  });

  it("유효한 토큰이면 ok와 userId", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const result = await verifyAuthToken(makeRequest({ authorization: "Bearer tok" }));
    expect(result).toEqual({ ok: true, userId: "u1" });
  });

  it("getUser가 인증 오류(status 401)를 돌려주면 401", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", status: 401, message: "invalid JWT" },
    });
    const result = await verifyAuthToken(makeRequest({ authorization: "Bearer bad" }));
    expect(result).toEqual({ ok: false, status: 401, error: "로그인이 필요합니다." });
  });

  it("getUser가 AuthRetryableFetchError면 503", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthRetryableFetchError", status: 0, message: "fetch failed" },
    });
    const result = await verifyAuthToken(makeRequest({ authorization: "Bearer tok" }));
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("getUser가 status 500이면 503", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", status: 500, message: "boom" },
    });
    const result = await verifyAuthToken(makeRequest({ authorization: "Bearer tok" }));
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("getUser가 예외를 던져도 503", async () => {
    getUser.mockRejectedValue(new Error("network down"));
    const result = await verifyAuthToken(makeRequest({ authorization: "Bearer tok" }));
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("서버 Supabase env가 없으면 500 (열리지 않음)", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const result = await verifyAuthToken(makeRequest({ authorization: "Bearer tok" }));
    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(getUser).not.toHaveBeenCalled();
  });
});

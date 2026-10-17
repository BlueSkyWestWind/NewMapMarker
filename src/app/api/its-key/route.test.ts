import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyAuthToken = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/verify-auth-token", () => ({ verifyAuthToken }));

import { GET } from "./route";

function makeRequest(): NextRequest {
  return new NextRequest("https://newmarker.example.com/api/its-key");
}

beforeEach(() => {
  process.env.ITS_API_KEY = "secret-its-key";
  verifyAuthToken.mockReset();
});

afterEach(() => {
  delete process.env.ITS_API_KEY;
});

describe("GET /api/its-key", () => {
  it("토큰이 없으면 401이고 키를 내려주지 않는다", async () => {
    verifyAuthToken.mockResolvedValue({
      ok: false,
      status: 401,
      error: "로그인이 필요합니다.",
    });
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("secret-its-key");
  });

  it("유효 토큰이면 200과 키", async () => {
    verifyAuthToken.mockResolvedValue({ ok: true, userId: "u1" });
    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ key: "secret-its-key" });
  });

  it("NEXT_PUBLIC_ITS_API_KEY는 더 이상 읽지 않는다", async () => {
    delete process.env.ITS_API_KEY;
    process.env.NEXT_PUBLIC_ITS_API_KEY = "legacy-key";
    verifyAuthToken.mockResolvedValue({ ok: true, userId: "u1" });
    const response = await GET(makeRequest());
    delete process.env.NEXT_PUBLIC_ITS_API_KEY;
    expect(response.status).toBe(500);
  });
});

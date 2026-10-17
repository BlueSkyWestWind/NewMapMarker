import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseBrowserClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient }));

import { authedFetch } from "./authed-fetch";

const fetchMock = vi.fn();

function stubSession(accessToken: string | null) {
  getSupabaseBrowserClient.mockReturnValue({
    auth: {
      getSession: async () => ({
        data: { session: accessToken ? { access_token: accessToken } : null },
      }),
    },
  });
}

function sentHeaders(): Headers {
  return new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authedFetch", () => {
  it("세션이 있으면 Bearer 헤더를 붙인다", async () => {
    stubSession("tok");
    await authedFetch("/api/its-key");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/its-key");
    expect(sentHeaders().get("authorization")).toBe("Bearer tok");
  });

  it("기존 헤더(Content-Type)와 다른 옵션을 보존한다", async () => {
    stubSession("tok");
    await authedFetch("/api/kakao-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(sentHeaders().get("content-type")).toBe("application/json");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.cache).toBe("no-store");
  });

  it("세션이 없으면 Authorization을 붙이지 않는다", async () => {
    stubSession(null);
    await authedFetch("/api/its-key");
    expect(sentHeaders().has("authorization")).toBe(false);
  });

  it("supabase 클라이언트가 null이어도 fetch는 수행한다", async () => {
    getSupabaseBrowserClient.mockReturnValue(null);
    await authedFetch("/api/its-key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentHeaders().has("authorization")).toBe(false);
  });
});

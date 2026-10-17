import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyAuthToken = vi.hoisted(() => vi.fn());
vi.mock("./verify-auth-token", () => ({ verifyAuthToken }));

import { guardProxyRequest, isSameOriginRequest } from "./proxy-guard";

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest("https://newmarker.example.com/api/map-tile-proxy", {
    headers,
  });
}

describe("isSameOriginRequest", () => {
  it("Origin/Referer가 없으면 통과 (Referer 제거 브라우저 대비)", () => {
    expect(isSameOriginRequest(makeRequest({}))).toBe(true);
  });

  it("같은 호스트의 Origin은 통과", () => {
    const req = makeRequest({ origin: "https://newmarker.example.com" });
    expect(isSameOriginRequest(req)).toBe(true);
  });

  it("같은 호스트의 Referer는 통과", () => {
    const req = makeRequest({ referer: "https://newmarker.example.com/gpsmap" });
    expect(isSameOriginRequest(req)).toBe(true);
  });

  it("다른 사이트의 Origin은 차단", () => {
    const req = makeRequest({ origin: "https://evil.example.org" });
    expect(isSameOriginRequest(req)).toBe(false);
  });

  it("다른 사이트의 Referer(핫링크)는 차단", () => {
    const req = makeRequest({ referer: "https://evil.example.org/page" });
    expect(isSameOriginRequest(req)).toBe(false);
  });
});

describe("guardProxyRequest", () => {
  beforeEach(() => {
    verifyAuthToken.mockReset();
  });

  it("토큰 검증이 401이면 그 status/error로 응답", async () => {
    verifyAuthToken.mockResolvedValue({
      ok: false,
      status: 401,
      error: "로그인이 필요합니다.",
    });
    const blocked = await guardProxyRequest(makeRequest({}));
    expect(blocked?.status).toBe(401);
    expect(await blocked?.json()).toEqual({ error: "로그인이 필요합니다." });
  });

  it("토큰 검증이 503이면 503으로 응답 (로그인 문제로 오인하지 않는다)", async () => {
    verifyAuthToken.mockResolvedValue({ ok: false, status: 503, error: "일시 장애" });
    const blocked = await guardProxyRequest(makeRequest({}));
    expect(blocked?.status).toBe(503);
  });

  it("검증 통과면 null", async () => {
    verifyAuthToken.mockResolvedValue({ ok: true, userId: "u1" });
    expect(await guardProxyRequest(makeRequest({}))).toBeNull();
  });

  it("출처가 다르면 토큰 검증 전에 403", async () => {
    const blocked = await guardProxyRequest(
      makeRequest({ origin: "https://evil.example.org" }),
    );
    expect(blocked?.status).toBe(403);
    expect(verifyAuthToken).not.toHaveBeenCalled();
  });
});

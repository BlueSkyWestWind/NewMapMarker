import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./proxy-guard";

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

import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS } from "@/lib/security-headers";

const valueOf = (key: string) => SECURITY_HEADERS.find((header) => header.key === key)?.value;

describe("SECURITY_HEADERS", () => {
  it("클릭재킹·형식 추측 방지 헤더가 있다", () => {
    expect(valueOf("X-Frame-Options")).toBe("DENY");
    expect(valueOf("Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(valueOf("X-Content-Type-Options")).toBe("nosniff");
  });

  it("바코드/QR 카메라와 내 위치는 이 사이트에서 허용한다", () => {
    const policy = valueOf("Permissions-Policy") ?? "";
    expect(policy).toContain("camera=(self)");
    expect(policy).toContain("geolocation=(self)");
    expect(policy).toContain("microphone=()");
  });

  it("CSP 로 스크립트 출처를 막지 않는다(카카오 지도 SDK가 깨진다)", () => {
    const csp = valueOf("Content-Security-Policy") ?? "";
    expect(csp).not.toMatch(/script-src|default-src/);
  });

  it("HSTS 는 하위 도메인까지 묶지 않는다", () => {
    const hsts = valueOf("Strict-Transport-Security") ?? "";
    expect(hsts).toContain("max-age=");
    expect(hsts).not.toContain("includeSubDomains");
  });

  it("헤더 이름이 중복되지 않는다", () => {
    const keys = SECURITY_HEADERS.map((header) => header.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

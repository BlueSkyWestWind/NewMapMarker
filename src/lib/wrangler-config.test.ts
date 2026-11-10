import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** wrangler.jsonc를 읽는다. 줄 전체가 주석인 줄만 지운다(문자열 안의 `//`는 건드리지 않는다). */
function readWranglerConfig(): Record<string, unknown> {
  const text = readFileSync("wrangler.jsonc", "utf-8")
    .split(/\r?\n/)
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
  return JSON.parse(text) as Record<string, unknown>;
}

describe("wrangler.jsonc", () => {
  it("keep_names를 꺼서 next-themes 인라인 스크립트에 __name 호출이 끼지 않게 한다", () => {
    // 켜져 있으면(기본값 true) 번들러가 함수 안에 `__name(...)`을 넣고, next-themes가 함수 소스를
    // 그대로 HTML에 내보내 브라우저에서 `ReferenceError: __name is not defined`가 난다.
    expect(readWranglerConfig().keep_names).toBe(false);
  });
});

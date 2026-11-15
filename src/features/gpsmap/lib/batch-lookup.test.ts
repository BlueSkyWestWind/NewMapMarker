import { describe, expect, it } from "vitest";
import { parseBatchInputs } from "./batch-lookup";

describe("parseBatchInputs", () => {
  it("여러 줄 입력을 줄 단위 배열로 나눈다(중복 유지)", () => {
    // 출처: batch-lookup.ts parseBatchInputs 주석 ("textarea 여러 줄을 입력 목록으로 만든다")
    expect(parseBatchInputs("37.5, 127.0\n테헤란로 152\n37.5, 127.0")).toEqual([
      "37.5, 127.0",
      "테헤란로 152",
      "37.5, 127.0",
    ]);
  });

  it("앞뒤 공백과 빈 줄을 제거한다", () => {
    // 출처: batch-lookup.ts parseBatchInputs ("trim() + filter(Boolean)")
    expect(parseBatchInputs("  첫째 줄  \n\n   \n둘째 줄\t")).toEqual([
      "첫째 줄",
      "둘째 줄",
    ]);
  });

  it("Windows 줄바꿈(\\r\\n)도 동일하게 분리한다", () => {
    // 출처: batch-lookup.ts parseBatchInputs ("split(/\\r?\\n/)")
    expect(parseBatchInputs("a\r\nb\r\n\r\nc")).toEqual(["a", "b", "c"]);
  });
});

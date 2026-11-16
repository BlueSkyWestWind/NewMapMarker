import { describe, expect, it } from "vitest";
import { likePattern } from "@/features/schedule/lib/search-cells";
import {
  buildSearchOrFilter,
  escapeOrValue,
  isTruncated,
} from "@/features/schedule/lib/search-filter";

describe("escapeOrValue & buildSearchOrFilter", () => {
  it("큰따옴표와 역슬래시를 이스케이프하고 쉼표·괄호·공백·LIKE 특수문자는 유지한다", () => {
    const input = '%국소\\이름"1,(테스트) %_%';
    expect(escapeOrValue(input)).toBe('%국소\\\\이름\\"1,(테스트) %_%');
  });

  it("buildSearchOrFilter는 main_text와 sub_text ilike 조건을 큰따옴표로 감싼다", () => {
    const pattern = likePattern('국소\\A"1,(비고) %_');
    // likePattern이 \ -> \\, % -> \%, _ -> \_ 로 바꾼 뒤 escapeOrValue가 \ -> \\, " -> \" 로 감싼다.
    expect(pattern).toBe('%국소\\\\A"1,(비고) \\%\\_%');
    expect(buildSearchOrFilter(pattern)).toBe(
      'main_text.ilike."%국소\\\\\\\\A\\"1,(비고) \\\\%\\\\_%",sub_text.ilike."%국소\\\\\\\\A\\"1,(비고) \\\\%\\\\_%"',
    );
  });
});

describe("isTruncated", () => {
  it("limit 이하이면 false, limit을 초과하면 true다", () => {
    expect(isTruncated(0, 200)).toBe(false);
    expect(isTruncated(200, 200)).toBe(false);
    expect(isTruncated(201, 200)).toBe(true);
  });
});

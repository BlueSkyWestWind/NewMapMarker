export interface SearchOptions {
  columnIds?: string[];
  from?: string | null;
  to?: string | null;
  includeSub?: boolean;
}

/**
 * PostgREST `or()` 필터의 큰따옴표(`"..."`) 안에서 안전하게 쓰도록 `\`와 `"`만 이스케이프한다.
 * `,`, `(`, `)`, 공백은 큰따옴표 안에서 안전하고, `%`·`_` LIKE 와일드카드는 `likePattern`이 이미 이스케이프한다.
 */
export function escapeOrValue(text: string): string {
  return text.replace(/([\\"])/g, "\\$1");
}

/**
 * `likePattern`으로 만든 패턴을 `main_text.ilike."…",sub_text.ilike."…"` 필터 문자열로 만든다.
 */
export function buildSearchOrFilter(pattern: string): string {
  const safe = escapeOrValue(pattern);
  return `main_text.ilike."${safe}",sub_text.ilike."${safe}"`;
}

/** `limit + 1`건을 요청했을 때 상한(`limit`)을 넘겼는지 판별한다. */
export function isTruncated(count: number, limit: number): boolean {
  return count > limit;
}

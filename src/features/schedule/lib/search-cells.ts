/** 이 글자 수보다 짧은 검색어는 결과가 너무 많아 조회하지 않는다. */
export const MIN_SEARCH_LENGTH = 2;

/** 검색어를 다듬는다. 공백만 있거나 너무 짧으면 null(조회하지 않음). */
export function normalizeSearchQuery(raw: string): string | null {
  const query = raw.trim();
  return query.length >= MIN_SEARCH_LENGTH ? query : null;
}

/**
 * `ilike` 포함 검색 패턴. 국소 이름에 흔한 `_`(예: `B7_30`)와 `%`, 역슬래시는 LIKE의 특수문자라
 * 이스케이프하지 않으면 다른 글자와도 맞아 버린다.
 */
export function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

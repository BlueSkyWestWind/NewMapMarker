/**
 * 여러 날짜 선택에서 한 날짜를 눌렀을 때의 새 목록(순수 함수).
 * - 이미 고른 날짜는 빼고, 아니면 더한 뒤 날짜 순서로 정렬한다.
 * - `locked`(일정 수정 창의 날짜처럼 항상 포함되는 날짜)는 목록에 넣거나 빼지 않는다.
 * - `max`개에 닿으면 더 늘리지 않는다(빼는 것은 항상 된다).
 */
export function toggleDate(
  selected: string[],
  iso: string,
  options: { locked?: string; max: number },
): string[] {
  if (iso === options.locked) return selected;
  if (selected.includes(iso)) return selected.filter((value) => value !== iso);
  if (selected.length >= options.max) return selected;
  return [...selected, iso].sort();
}

/** 배열을 `size`개씩 나눈다. 마지막 조각은 남은 만큼만 담는다. */
export function chunkArray<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    out.push(rows.slice(i, i + size));
  }
  return out;
}

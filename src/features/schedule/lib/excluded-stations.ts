import { normalize } from "@/features/worksite-weather/lib/site-search";

export type ExclusionReason = "canceled" | "unneeded" | "other";

export const EXCLUSION_REASONS: readonly { key: ExclusionReason; label: string }[] = [
  { key: "canceled", label: "사업 취소" },
  { key: "unneeded", label: "시설 불필요" },
  { key: "other", label: "기타" },
] as const;

export const EXCLUSION_NOTE_MAX = 100;

export interface ExcludedStation {
  id: string;
  stationKey: string;
  label: string;
  markerId: string | null;
  reason: ExclusionReason;
  note: string;
  createdAt: string;
}

export interface ExclusionRow {
  station_key: string;
  label: string;
  marker_id: string | null;
  reason: ExclusionReason;
  note: string;
}

export function isExclusionReason(value: unknown): value is ExclusionReason {
  return value === "canceled" || value === "unneeded" || value === "other";
}

export function exclusionReasonLabel(reason: ExclusionReason): string {
  return EXCLUSION_REASONS.find((item) => item.key === reason)?.label ?? reason;
}

/** 미배정 국소 대조(`nameKeys`)와 같은 정규화 규칙(공백·하이픈 제거·소문자). */
export function exclusionKey(name: string): string {
  return normalize(name);
}

/** 제외 사유·메모를 검사하고 정리한 메모를 돌려준다. */
export function validateExclusion(input: {
  reason: ExclusionReason;
  note: string;
}): { ok: true; note: string } | { ok: false; error: "note-required" | "note-too-long" } {
  const note = input.note.trim();
  if (note.length > EXCLUSION_NOTE_MAX) {
    return { ok: false, error: "note-too-long" };
  }
  if (input.reason === "other" && note === "") {
    return { ok: false, error: "note-required" };
  }
  return { ok: true, note };
}

/**
 * 선택한 국소들을 DB insert용 행으로 만든다.
 * `station_key` 중복은 앞의 것을 유지하고 빈 이름은 제외한다.
 */
export function buildExclusionRows(
  items: readonly { label: string; markerId?: string | null }[],
  reason: ExclusionReason,
  note: string,
): ExclusionRow[] {
  const trimmedNote = note.trim();
  const seen = new Set<string>();
  const rows: ExclusionRow[] = [];

  for (const item of items) {
    const label = item.label.trim();
    if (label === "") continue;
    const key = exclusionKey(label);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    rows.push({
      station_key: key,
      label,
      marker_id: item.markerId ?? null,
      reason,
      note: trimmedNote,
    });
  }

  return rows;
}

export function excludedKeySet(rows: readonly { stationKey: string }[]): Set<string> {
  return new Set(rows.map((row) => row.stationKey).filter(Boolean));
}

export function isExcludedText(text: string, keys: ReadonlySet<string>): boolean {
  const key = exclusionKey(text);
  return key !== "" && keys.has(key);
}

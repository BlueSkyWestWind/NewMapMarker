import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type {
  DraftIssue,
  EditDraft,
  InfoFields,
  InfoRecord,
  MarkerFields,
  MarkerOp,
} from "../types";
import { applyOpsToMarkers } from "./group-ops";

const LAT_RANGE = { min: 33, max: 39 } as const;
const LNG_RANGE = { min: 124, max: 132 } as const;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function emptyDraft(): EditDraft {
  return { markerEdits: {}, infoEdits: {}, ops: [] };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/** 패치 중 원래 값과 다른 칸만 `current`에 합치고, 같아진 칸은 뺀다. */
function mergeEdits<T extends object>(
  current: Partial<T> | undefined,
  original: T,
  patch: Partial<T>,
): Partial<T> {
  const next: Partial<T> = { ...current };
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const value = patch[key] as T[keyof T];
    if (sameValue(value, original[key])) delete next[key];
    else next[key] = value;
  }
  return next;
}

export function setMarkerEdit(
  draft: EditDraft,
  original: EquipmentMarker,
  patch: Partial<MarkerFields>,
): EditDraft {
  const merged = mergeEdits<MarkerFields>(
    draft.markerEdits[original.id],
    original as unknown as MarkerFields,
    patch,
  );
  const markerEdits = { ...draft.markerEdits };
  if (Object.keys(merged).length === 0) delete markerEdits[original.id];
  else markerEdits[original.id] = merged;
  return { ...draft, markerEdits };
}

export function setInfoEdit(
  draft: EditDraft,
  original: InfoRecord,
  patch: Partial<InfoFields>,
): EditDraft {
  const merged = mergeEdits<InfoFields>(
    draft.infoEdits[original.id],
    original,
    patch,
  );
  const infoEdits = { ...draft.infoEdits };
  if (Object.keys(merged).length === 0) delete infoEdits[original.id];
  else infoEdits[original.id] = merged;
  return { ...draft, infoEdits };
}

export function queueOps(draft: EditDraft, ops: MarkerOp[]): EditDraft {
  return { ...draft, ops: [...draft.ops, ...ops] };
}

/** 변경분 `ops`로 삭제되는 마커 ID. */
function deletedIds(ops: MarkerOp[]): Set<string> {
  const ids = new Set<string>();
  for (const op of ops) {
    if (op.type === "delete") op.ids.forEach((id) => ids.add(id));
  }
  return ids;
}

/**
 * 필드 수정과 `ops`를 반영한 새 목록. `ops`는 쌓인 순서대로 적용하고,
 * 삭제된 마커는 빠지며 그 마커의 필드 수정은 무시한다.
 */
export function applyDraftToMarkers(
  markers: EquipmentMarker[],
  draft: EditDraft,
): EquipmentMarker[] {
  return applyOpsToMarkers(markers, draft.ops).map((m) => {
    const edit = draft.markerEdits[m.id];
    return edit ? ({ ...m, ...edit } as EquipmentMarker) : m;
  });
}

/** 저장할 변경 수: 수정한 칸(삭제 마커 제외) + 정보 칸 + 연산 수. */
export function countChanges(draft: EditDraft): number {
  const deleted = deletedIds(draft.ops);
  const markerCells = Object.entries(draft.markerEdits)
    .filter(([id]) => !deleted.has(id))
    .reduce((sum, [, edit]) => sum + Object.keys(edit).length, 0);
  const infoCells = Object.values(draft.infoEdits).reduce(
    (sum, edit) => sum + Object.keys(edit).length,
    0,
  );
  return markerCells + infoCells + draft.ops.length;
}

/** `YYYY-MM-DD` 형식이면서 실제 달력에 있는 날짜인지. 빈 값은 통과. */
function isValidDate(value: string): boolean {
  if (value === "") return true;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function outOfRange(
  value: number,
  range: { min: number; max: number },
): boolean {
  return !Number.isFinite(value) || value < range.min || value > range.max;
}

/** 쌓인 변경분의 입력 오류. 변경분에 있는 칸만 검사한다. */
export function validateDraft(draft: EditDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const add = (key: string, message: string) => issues.push({ key, message });

  for (const [id, edit] of Object.entries(draft.markerEdits)) {
    if (edit.name !== undefined && edit.name.trim() === "") {
      add(`marker:${id}:name`, "국소명을 입력해 주세요.");
    }
    if (typeof edit.lat === "number" && outOfRange(edit.lat, LAT_RANGE)) {
      add(`marker:${id}:lat`, "위도는 33 ~ 39 범위여야 합니다.");
    }
    if (typeof edit.lng === "number" && outOfRange(edit.lng, LNG_RANGE)) {
      add(`marker:${id}:lng`, "경도는 124 ~ 132 범위여야 합니다.");
    }
    // 위도·경도는 함께 있거나 함께 비어야 한다. 둘 다 이 변경분에 있을 때만 판단한다.
    if ("lat" in edit && "lng" in edit && (edit.lat == null) !== (edit.lng == null)) {
      add(`marker:${id}:lat`, "위도와 경도를 함께 입력하거나 함께 비워 주세요.");
    }
    if (
      edit.tags !== undefined &&
      !(Array.isArray(edit.tags) && edit.tags.every((t) => typeof t === "string"))
    ) {
      add(`marker:${id}:tags`, "태그는 문자열 목록이어야 합니다.");
    }
  }

  for (const [id, edit] of Object.entries(draft.infoEdits)) {
    for (const field of ["installDate", "openDate"] as const) {
      const value = edit[field];
      if (value !== undefined && !isValidDate(value)) {
        add(`info:${id}:${field}`, "날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다.");
      }
    }
  }

  return issues;
}

import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  EditDraft,
  InfoFields,
  InfoRecord,
  MarkerFields,
  MarkerOp,
} from "../types";
import { MarkerOpsError, applyMarkerOps } from "./group-ops";

export interface SaveResult {
  /** 저장이 끝난 마커 ID(필드 수정과 거기서 파생된 정보 행 쓰기까지 끝난 것). */
  savedMarkerIds: string[];
  savedInfoIds: number[];
  completedOps: number;
  error: { message: string; step: "marker" | "info" | "ops" } | null;
}

const PARALLEL = 5;

const MARKER_COLUMNS: Record<keyof MarkerFields, string> = {
  name: "name",
  lat: "lat",
  lng: "lng",
  memo: "memo",
  tags: "tags",
  color: "color",
  facilityTeam: "facility_team",
  facilityCode: "facility_code",
  roadAddress: "road_address",
  jibunAddress: "jibun_address",
};

const INFO_COLUMNS: Record<keyof InfoFields, string> = {
  projectCode: "project_code",
  facilityYear: "facility_year",
  businessType: "business_type",
  finalStationName: "final_station_name",
  eqClass: "eq_class",
  eqType: "eq_type",
  installDate: "install_date",
  openDate: "open_date",
};

const DATE_FIELDS = new Set<string>(["installDate", "openDate"]);

type Patch = Record<string, unknown>;

function messageOf(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function toMarkerPatch(edit: Partial<MarkerFields>): Patch {
  const patch: Patch = {};
  for (const [field, value] of Object.entries(edit)) {
    patch[MARKER_COLUMNS[field as keyof MarkerFields]] = value;
  }
  return patch;
}

function toInfoPatch(edit: Partial<InfoFields>): Patch {
  const patch: Patch = {};
  for (const [field, value] of Object.entries(edit)) {
    patch[INFO_COLUMNS[field as keyof InfoFields]] =
      DATE_FIELDS.has(field) && value === "" ? null : value;
  }
  return patch;
}

/** 삭제는 뒤로 보내는 안정 정렬. */
function sortOps(ops: MarkerOp[]): MarkerOp[] {
  return [
    ...ops.filter((op) => op.type !== "delete"),
    ...ops.filter((op) => op.type === "delete"),
  ];
}

interface Job<K> {
  key: K;
  run: () => PromiseLike<{ error: unknown }>;
}

/** 몇 건씩 병렬로 보내고, 한 묶음에서 오류가 나면 거기서 멈춘다. */
async function runJobs<K>(
  jobs: Job<K>[],
): Promise<{ done: K[]; error: unknown }> {
  const done: K[] = [];
  for (let i = 0; i < jobs.length; i += PARALLEL) {
    const batch = jobs.slice(i, i + PARALLEL);
    const results = await Promise.all(batch.map((job) => job.run()));
    let firstError: unknown = null;
    results.forEach((res, idx) => {
      if (res.error) firstError ??= res.error;
      else done.push(batch[idx].key);
    });
    if (firstError) return { done, error: firstError };
  }
  return { done, error: null };
}

/** 변경분을 마커 → 정보 → ops 순서로 저장한다. 실패하면 거기서 멈춘다. */
export async function saveDraft(
  supabase: SupabaseBrowserClient,
  draft: EditDraft,
  infoRows: InfoRecord[],
): Promise<SaveResult> {
  const result: SaveResult = {
    savedMarkerIds: [],
    savedInfoIds: [],
    completedOps: 0,
    error: null,
  };

  const deleted = new Set<string>();
  for (const op of draft.ops) {
    if (op.type === "delete") op.ids.forEach((id) => deleted.add(id));
  }

  // 1) 마커 필드 수정
  const markerEntries = Object.entries(draft.markerEdits).filter(
    ([id, edit]) => !deleted.has(id) && Object.keys(edit).length > 0,
  );
  const markerStep = await runJobs(
    markerEntries.map(([id, edit]) => ({
      key: id,
      run: () =>
        supabase.from("markers").update(toMarkerPatch(edit)).eq("id", id),
    })),
  );
  if (markerStep.error) {
    result.savedMarkerIds = markerStep.done;
    result.error = { message: messageOf(markerStep.error), step: "marker" };
    return result;
  }

  // 2) 정보 행 수정. 국소명·통합시설코드는 마커 수정에서 파생돼 함께 쓴다.
  const infoPatches = new Map<number, Patch>();
  const rowsByMarker = new Map<string, number[]>();
  const deletedRowIds = new Set<number>();
  const derivedRows = new Map<string, number[]>();
  for (const row of infoRows) {
    if (deleted.has(row.markerId)) deletedRowIds.add(row.id);
    const list = rowsByMarker.get(row.markerId) ?? [];
    list.push(row.id);
    rowsByMarker.set(row.markerId, list);
  }
  const addInfoPatch = (rowId: number, patch: Patch) => {
    infoPatches.set(rowId, { ...infoPatches.get(rowId), ...patch });
  };
  for (const [id, edit] of markerEntries) {
    const derived: Patch = {};
    if (edit.name !== undefined) derived.place_name = edit.name;
    if (edit.facilityCode !== undefined) derived.facility_code = edit.facilityCode;
    if (Object.keys(derived).length === 0) continue;
    const rowIds = rowsByMarker.get(id) ?? [];
    derivedRows.set(id, rowIds);
    for (const rowId of rowIds) addInfoPatch(rowId, derived);
  }
  for (const [rowIdText, edit] of Object.entries(draft.infoEdits)) {
    const rowId = Number(rowIdText);
    if (deletedRowIds.has(rowId) || Object.keys(edit).length === 0) continue;
    addInfoPatch(rowId, toInfoPatch(edit));
  }

  const infoStep = await runJobs(
    [...infoPatches.entries()].map(([rowId, patch]) => ({
      key: rowId,
      run: () => supabase.from("information").update(patch).eq("id", rowId),
    })),
  );
  result.savedInfoIds = infoStep.done;

  // 마커는 파생 정보 쓰기까지 끝나야 저장됨으로 센다. 재시도 때 정보가 빠지지 않게.
  const doneRows = new Set(infoStep.done);
  const markerFullySaved = ([id]: [string, unknown]) =>
    (derivedRows.get(id) ?? []).every((rowId) => doneRows.has(rowId));
  result.savedMarkerIds = markerEntries
    .filter(markerFullySaved)
    .map(([id]) => id);
  if (infoStep.error) {
    result.error = { message: messageOf(infoStep.error), step: "info" };
    return result;
  }

  // 3) 마커 ops
  const ops = sortOps(draft.ops);
  try {
    await applyMarkerOps(supabase, ops);
    result.completedOps = ops.length;
  } catch (error) {
    if (error instanceof MarkerOpsError) {
      result.completedOps = error.completed;
      result.error = { message: messageOf(error.cause), step: "ops" };
    } else {
      result.error = { message: messageOf(error), step: "ops" };
    }
  }
  return result;
}

"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MAP_MARKER_QUERY_KEY } from "@/features/map-marker/constants/map-config";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  applyDraftToMarkers,
  countChanges,
  emptyDraft,
  queueOps,
  setInfoEdit,
  setMarkerEdit,
  validateDraft,
} from "../lib/edit-draft";
import { fetchInfoRows } from "../lib/info-rows";
import { validateMergedCoords } from "../lib/merged-coords";
import { saveDraft, type SaveResult } from "../lib/save-draft";
import { stripSaved } from "../lib/strip-saved";
import type {
  DraftIssue,
  EditDraft,
  InfoFields,
  InfoRecord,
  MarkerFields,
  MarkerOp,
} from "../types";

const NO_INFO: InfoRecord[] = [];

function dedupeIssues(issues: DraftIssue[]): DraftIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (seen.has(issue.key)) return false;
    seen.add(issue.key);
    return true;
  });
}

/** 한 묶음의 마커들을 표에서 고칠 때 쓰는 변경분과 저장. */
export function useEditDraft(markers: EquipmentMarker[]) {
  const supabase = getSupabaseBrowserClient();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EditDraft>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [lastResult, setLastResult] = useState<SaveResult | null>(null);

  const markerIds = useMemo(() => markers.map((m) => m.id), [markers]);
  const infoKey = ["group-admin-info", markerIds.join(",")];
  const infoQuery = useQuery({
    queryKey: infoKey,
    queryFn: () => fetchInfoRows(supabase!, markerIds),
    enabled: !!supabase && markerIds.length > 0,
  });
  const originalInfoRows = infoQuery.data ?? NO_INFO;

  const workingMarkers = useMemo(() => applyDraftToMarkers(markers, draft), [markers, draft]);
  const infoRows = useMemo(
    () =>
      originalInfoRows.map((row) => {
        const edit = draft.infoEdits[row.id];
        return edit ? { ...row, ...edit } : row;
      }),
    [originalInfoRows, draft.infoEdits],
  );
  const issues = useMemo(
    () => dedupeIssues([...validateDraft(draft), ...validateMergedCoords(workingMarkers, draft)]),
    [draft, workingMarkers],
  );
  const changeCount = countChanges(draft);

  const setMarker = useCallback(
    (id: string, patch: Partial<MarkerFields>) => {
      const original = markers.find((m) => m.id === id);
      if (original) setDraft((d) => setMarkerEdit(d, original, patch));
    },
    [markers],
  );
  const setInfo = useCallback(
    (id: number, patch: Partial<InfoFields>) => {
      const original = originalInfoRows.find((r) => r.id === id);
      if (original) setDraft((d) => setInfoEdit(d, original, patch));
    },
    [originalInfoRows],
  );
  const queue = useCallback((ops: MarkerOp[]) => setDraft((d) => queueOps(d, ops)), []);
  const discard = useCallback(() => {
    setDraft(emptyDraft());
    setLastResult(null);
  }, []);

  const save = useCallback(async (): Promise<SaveResult | null> => {
    if (!supabase || issues.length > 0 || isSaving || changeCount === 0) return null;
    setIsSaving(true);
    try {
      const result = await saveDraft(supabase, draft, originalInfoRows);
      setDraft((d) => stripSaved(d, result, originalInfoRows));
      setLastResult(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MAP_MARKER_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["group-admin-info"] }),
      ]);
      return result;
    } finally {
      setIsSaving(false);
    }
  }, [supabase, issues, isSaving, changeCount, draft, originalInfoRows, queryClient]);

  return {
    draft,
    workingMarkers,
    infoRows,
    originalInfoRows,
    isInfoLoading: infoQuery.isLoading,
    setMarker,
    setInfo,
    queue,
    discard,
    save,
    isSaving,
    issues,
    changeCount,
    lastResult,
  };
}

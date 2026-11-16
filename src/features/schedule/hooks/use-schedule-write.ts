"use client";

import { createElement, useCallback, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ToastAction, type ToastActionElement } from "@/components/ui/toast";
import { applyScheduleGroups, updateScheduleCellResult } from "@/features/schedule/api";
import { SCHEDULE_QUERY_KEY } from "@/features/schedule/hooks/use-schedule-range";
import { classifyApplyError } from "@/features/schedule/lib/apply-error";
import {
  buildRestoreGroups,
  fillCreatedIds,
  type GroupState,
} from "@/features/schedule/lib/group-state";
import {
  createUndoStack,
  isResultEntry,
  type MarkChange,
  type StackEntry,
} from "@/features/schedule/lib/undo-stack";
import type { CellResult } from "@/features/schedule/types";
import { useToast } from "@/hooks/use-toast";
import { useAuthSession } from "@/lib/auth/use-auth-session";

export type WriteResult = "ok" | "stale" | "failed" | "legacy";
export type UndoResult = "ok" | "empty" | "stale" | "failed";

// 세션 메모리 안 공유 스택. 칸 편집 창과 일정표 화면(Ctrl+Z·드래그)이 같은 스택을 쓴다.
const sharedUndoStack = createUndoStack(20);
const listeners = new Set<() => void>();
let legacyNotified = false;

function notifyStackChange() {
  for (const listener of listeners) listener();
}

function subscribeStack(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getCanUndoSnapshot(): boolean {
  return sharedUndoStack.size > 0;
}

function getCanUndoServerSnapshot(): boolean {
  return false;
}

/**
 * 시설일정 그룹 단위 원자 저장과 세션 되돌리기(스택)를 제공한다.
 */
export function useScheduleWrite() {
  const { supabase } = useAuthSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canUndo = useSyncExternalStore(
    subscribeStack,
    getCanUndoSnapshot,
    getCanUndoServerSnapshot,
  );

  const recordUndo = useCallback((entry: StackEntry) => {
    sharedUndoStack.push(entry);
    notifyStackChange();
  }, []);

  const undo = useCallback(async (): Promise<UndoResult> => {
    if (!supabase) return "failed";
    const entry = sharedUndoStack.pop();
    notifyStackChange();
    if (!entry) return "empty";

    if (isResultEntry(entry)) {
      try {
        await updateScheduleCellResult(supabase, entry.cellId, entry.before);
        await queryClient.invalidateQueries({ queryKey: SCHEDULE_QUERY_KEY });
        return "ok";
      } catch {
        sharedUndoStack.push(entry);
        notifyStackChange();
        return "failed";
      }
    }

    try {
      const restoreGroups = buildRestoreGroups(entry.before, entry.after);
      await applyScheduleGroups(supabase, restoreGroups, entry.marksBefore);
      await queryClient.invalidateQueries({ queryKey: SCHEDULE_QUERY_KEY });
      return "ok";
    } catch (error) {
      const classified = classifyApplyError(error);
      if (classified.kind !== "stale") {
        sharedUndoStack.push(entry);
        notifyStackChange();
      }
      return classified.kind === "stale" ? "stale" : "failed";
    }
  }, [queryClient, supabase]);

  const undoWithToast = useCallback(async (): Promise<UndoResult> => {
    const result = await undo();
    if (result === "ok") {
      toast({ title: "되돌렸습니다" });
    } else if (result === "empty") {
      toast({ title: "되돌릴 작업이 없습니다" });
    } else if (result === "stale") {
      toast({
        title: "다른 곳에서 일정이 바뀌어 되돌릴 수 없습니다",
        variant: "destructive",
      });
    } else {
      toast({
        title: "되돌리지 못했습니다",
        variant: "destructive",
      });
    }
    return result;
  }, [toast, undo]);

  const createUndoAction = useCallback(
    (): ToastActionElement =>
      createElement(
        ToastAction,
        {
          altText: "되돌리기",
          onClick: () => {
            void undoWithToast();
          },
        },
        "되돌리기",
      ) as unknown as ToastActionElement,
    [undoWithToast],
  );

  const write = useCallback(
    async (
      label: string,
      before: GroupState[],
      after: GroupState[],
      marks: MarkChange[],
      marksBefore: MarkChange[],
    ): Promise<WriteResult> => {
      if (!supabase) {
        toast({
          title: "저장하지 못했습니다",
          description: "로그인 정보를 확인해 주세요.",
          variant: "destructive",
        });
        return "failed";
      }

      try {
        const created = await applyScheduleGroups(supabase, after, marks);
        const filledAfter = fillCreatedIds(after, created);
        recordUndo({ label, before, marksBefore, after: filledAfter });
        await queryClient.invalidateQueries({ queryKey: SCHEDULE_QUERY_KEY });
        toast({
          title: `${label}했습니다`,
          action: createUndoAction(),
        });
        return "ok";
      } catch (error) {
        const classified = classifyApplyError(error);
        // TODO(삭제): apply_schedule_groups 적용 확인 후 제거
        if (classified.kind === "missing-function") {
          if (!legacyNotified) {
            legacyNotified = true;
            toast({
              title: "이전 방식으로 저장합니다",
              description:
                "DB 함수가 아직 적용되지 않아 이전 방식으로 저장합니다. 입력 보존·되돌리기는 적용 후에 동작합니다.",
            });
          }
          return "legacy";
        }
        if (classified.kind === "stale") {
          return "stale";
        }
        toast({
          title: "저장하지 못했습니다",
          description: classified.message,
          variant: "destructive",
        });
        return "failed";
      }
    },
    [createUndoAction, queryClient, recordUndo, supabase, toast],
  );

  const writeResult = useCallback(
    async (
      label: string,
      cellId: string,
      before: CellResult | null,
      after: CellResult | null,
    ): Promise<"ok" | "failed"> => {
      if (!supabase) {
        toast({
          title: "저장하지 못했습니다",
          description: "로그인 정보를 확인해 주세요.",
          variant: "destructive",
        });
        return "failed";
      }

      try {
        await updateScheduleCellResult(supabase, cellId, after);
        recordUndo({ kind: "result", label, cellId, before, after });
        await queryClient.invalidateQueries({ queryKey: SCHEDULE_QUERY_KEY });
        toast({
          title: label,
          action: createUndoAction(),
        });
        return "ok";
      } catch (error) {
        toast({
          title: "저장하지 못했습니다",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
        return "failed";
      }
    },
    [createUndoAction, queryClient, recordUndo, supabase, toast],
  );

  return {
    write,
    writeResult,
    undo,
    undoWithToast,
    createUndoAction,
    recordUndo,
    canUndo,
  };
}

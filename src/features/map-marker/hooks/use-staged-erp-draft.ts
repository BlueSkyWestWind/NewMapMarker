"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MAP_MARKER_QUERY_KEY } from "@/features/map-marker/constants/map-config";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import {
  erpDraftKey,
  parseErpDraft,
  serializeErpDraft,
} from "@/features/map-marker/lib/erp-review";
import { stagedMarkerRowToPending } from "@/features/map-marker/lib/excel-upload-helpers";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { useToast } from "@/hooks/use-toast";

/**
 * 위치등록 확인 작업을 브라우저에 임시 저장하고 다음 접속 때 복원한다.
 *
 * 패널은 메뉴를 옮기면 언마운트되지만 지도의 마커는 계속 옮길 수 있으므로,
 * 항상 마운트된 `MapMarkerPage`에서 **한 번만** 호출한다.
 */
export function useStagedErpDraft() {
  const { user, supabase } = useAuthSession();
  const userId = user?.id;
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const key = erpDraftKey(userId);
    const store = useMapMarkerStore;

    if (!store.getState().stagedErpUpload) {
      let text: string | null = null;
      try {
        text = localStorage.getItem(key);
      } catch {
        // 저장소를 쓸 수 없는 환경이면 복원 없이 진행한다.
      }
      const draft = text ? parseErpDraft(text) : null;
      if (draft) {
        const state = store.getState();
        state.clearPendingMarkers("equipment");
        state.addPendingMarkers(
          "equipment",
          draft.reviewRows
            .filter((row) => row.lat !== null && row.lng !== null)
            .map(stagedMarkerRowToPending),
        );
        state.setStagedErpUpload(draft);
        if (draft.reviewRows.length > 0) {
          toastRef.current({
            description: `임시 저장된 위치등록 ${draft.reviewRows.length}건을 불러왔습니다. 마커관리에서 이어서 확인하세요.`,
          });
        }

        // 지난번에 재정리 전에 창을 닫았다면 여기서 마친다.
        if (draft.needsRegroup && supabase) {
          void import("@/features/map-marker/lib/address-group")
            .then(({ applyMarkerRolesFromStoredGroupRole }) =>
              applyMarkerRolesFromStoredGroupRole(supabase),
            )
            .then(async () => {
              await queryClient.invalidateQueries({
                queryKey: MAP_MARKER_QUERY_KEY,
              });
              const latest = store.getState().stagedErpUpload;
              if (!latest) return;
              store.getState().setStagedErpUpload(
                latest.reviewRows.length === 0 && latest.existingRows.length === 0
                  ? null
                  : { ...latest, needsRegroup: false },
              );
            })
            .catch((error: unknown) => {
              console.error("위치등록 재정리 실패:", error);
            });
        }
      }
    }

    let warned = false;
    return store.subscribe((state, prev) => {
      if (
        state.stagedErpUpload === prev.stagedErpUpload &&
        state.pendingEquipmentMarkers === prev.pendingEquipmentMarkers
      ) {
        return;
      }
      try {
        const text = serializeErpDraft(
          state.stagedErpUpload,
          state.pendingEquipmentMarkers,
        );
        if (text) {
          localStorage.setItem(key, text);
        } else {
          localStorage.removeItem(key);
        }
        warned = false;
      } catch {
        if (warned) return;
        warned = true;
        toastRef.current({
          variant: "destructive",
          description:
            "임시 저장에 실패했습니다. 브라우저 저장 공간을 확인하세요. 저장하지 않은 작업은 새로고침하면 사라집니다.",
        });
      }
    });
  }, [userId, supabase, queryClient]);
}

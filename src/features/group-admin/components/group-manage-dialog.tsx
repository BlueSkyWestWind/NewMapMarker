"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { storedGroupRoleOf } from "@/features/map-marker/lib/marker-detail-rows";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import {
  GROUP_MANAGE_DIALOG_MAX_WIDTH_PX,
  GROUP_MANAGE_LIST_WIDTH_PX,
} from "@/features/shell/constants";
import { useToast } from "@/hooks/use-toast";
import { useEditDraft } from "../hooks/use-edit-draft";
import { useMarkerGroups } from "../hooks/use-marker-groups";
import { filterGroups } from "../lib/group-filters";
import type { SaveResult } from "../lib/save-draft";
import type { GroupFilters, MarkerGroup } from "../types";
import { GroupTable } from "./group-table";

const PAGE_SIZE = 200;
const NO_MARKERS: MarkerGroup["markers"] = [];
const EMPTY_FILTERS: GroupFilters = {
  query: "",
  years: [],
  statuses: [],
  businesses: [],
  onlyNoCoord: false,
  onlySuspect: false,
};

const STEP_LABEL: Record<NonNullable<SaveResult["error"]>["step"], string> = {
  marker: "마커 수정",
  info: "정보 행 수정",
  ops: "묶음 정리",
};

function ListChip({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`h-6 shrink-0 whitespace-nowrap rounded-full border px-2 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        pressed
          ? "border-indigo-400 bg-indigo-500/20 text-indigo-100"
          : "border-slate-700 text-slate-300 hover:bg-slate-800/60"
      }`}
    >
      {label}
    </button>
  );
}

function SaveFailureNotice({ result }: { result: SaveResult }) {
  if (!result.error) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
    >
      저장 중 &apos;{STEP_LABEL[result.error.step]}&apos; 단계에서 멈췄습니다 (
      {result.error.message}). 저장된 것: 마커 {result.savedMarkerIds.length}건 · 정보{" "}
      {result.savedInfoIds.length}건 · 정리 {result.completedOps}건. 남은 변경은 그대로
      두었으니 다시 저장할 수 있습니다.
    </p>
  );
}

/** 그룹관리 관리 창. 왼쪽에서 묶음을 고르고 오른쪽 표에서 고쳐 저장한다. */
export function GroupManageDialog() {
  const groupManageKey = useMapMarkerStore((state) => state.groupManageKey);
  const setGroupManageKey = useMapMarkerStore((state) => state.setGroupManageKey);
  const setLastGroupManageKey = useMapMarkerStore((state) => state.setLastGroupManageKey);
  const { toast } = useToast();

  const groups = useMarkerGroups();
  const [filters, setFilters] = useState<GroupFilters>(EMPTY_FILTERS);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const filtered = useMemo(() => filterGroups(groups, filters), [groups, filters]);
  const shown = filtered.slice(0, visibleCount);

  const group = groups.find((g) => g.key === groupManageKey) ?? null;
  const edit = useEditDraft(group?.markers ?? NO_MARKERS);
  const { changeCount, issues, isSaving } = edit;

  const confirmDiscard = (): boolean =>
    changeCount === 0 ||
    window.confirm(`저장하지 않은 변경 ${changeCount}건이 있습니다. 버리고 계속할까요?`);

  const close = () => {
    if (isSaving || !confirmDiscard()) return;
    edit.discard();
    if (groupManageKey) setLastGroupManageKey(groupManageKey);
    setGroupManageKey(null);
  };

  const selectGroup = (key: string) => {
    if (key === groupManageKey || isSaving || !confirmDiscard()) return;
    edit.discard();
    setLastGroupManageKey(key);
    setGroupManageKey(key);
  };

  const updateFilters = (patch: Partial<GroupFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setVisibleCount(PAGE_SIZE);
  };

  const handleSave = async () => {
    const result = await edit.save();
    if (!result) return;
    toast(
      result.error
        ? { title: "저장이 일부만 끝났습니다", description: result.error.message, variant: "destructive" }
        : { title: "저장했습니다" },
    );
  };

  const head = group ? (group.representative ?? group.markers[0]) : null;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent
        className="flex h-[90vh] w-[96vw] flex-col gap-3 overflow-hidden p-4"
        style={{ maxWidth: GROUP_MANAGE_DIALOG_MAX_WIDTH_PX }}
      >
        <div className="flex items-center gap-3 pr-8">
          <DialogTitle className="shrink-0 whitespace-nowrap text-base">그룹 관리</DialogTitle>
          <DialogDescription className="sr-only">
            번지 묶음의 마커와 정보를 표에서 고치고 저장합니다.
          </DialogDescription>
          <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
            {head ? `${head.name || "이름 없음"} 외 ${group!.markers.length}건` : ""}
          </span>
          <span
            className={`shrink-0 whitespace-nowrap text-xs ${
              changeCount > 0 ? "text-amber-300" : "text-slate-400"
            }`}
          >
            변경 {changeCount}건
            {issues.length > 0 ? ` · 입력 오류 ${issues.length}건` : ""}
          </span>
          <Button
            type="button"
            className="h-8 shrink-0 bg-indigo-600 text-xs hover:bg-indigo-500"
            disabled={changeCount === 0 || issues.length > 0 || isSaving}
            onClick={() => void handleSave()}
          >
            {isSaving ? "저장 중..." : "저장"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 shrink-0 border-slate-700 text-xs text-slate-200"
            disabled={changeCount === 0 || isSaving}
            onClick={edit.discard}
          >
            변경 취소
          </Button>
        </div>

        {edit.lastResult?.error ? <SaveFailureNotice result={edit.lastResult} /> : null}

        <div className="flex min-h-0 flex-1 gap-3">
          <aside
            className="flex shrink-0 flex-col gap-2 rounded-lg border border-slate-800 p-2"
            style={{ width: GROUP_MANAGE_LIST_WIDTH_PX }}
          >
            <Input
              value={filters.query}
              onChange={(event) => updateFilters({ query: event.target.value })}
              placeholder="국소명·주소로 찾기..."
              aria-label="묶음 찾기"
              className="h-8 border-slate-700 bg-slate-900 text-xs"
            />
            <div className="flex gap-1.5">
              <ListChip
                label="좌표 없음"
                pressed={filters.onlyNoCoord}
                onClick={() => updateFilters({ onlyNoCoord: !filters.onlyNoCoord })}
              />
              <ListChip
                label="중복 의심"
                pressed={filters.onlySuspect}
                onClick={() => updateFilters({ onlySuspect: !filters.onlySuspect })}
              />
            </div>
            <p className="text-[11px] text-slate-400">
              묶음 {filtered.length}/{groups.length}
            </p>
            <ul className="min-h-0 flex-1 divide-y divide-slate-800/80 overflow-y-auto overflow-x-hidden">
              {shown.map((item) => {
                const itemHead = item.representative ?? item.markers[0];
                const hasStoredRepresentative = storedGroupRoleOf(itemHead) === "대표";
                const active = item.key === groupManageKey;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      aria-current={active}
                      onClick={() => selectGroup(item.key)}
                      className={`flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs ${
                        active ? "bg-indigo-500/20 text-indigo-50" : "hover:bg-slate-800/50"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate" title={itemHead.name}>
                        {itemHead.name || "이름 없음"}
                      </span>
                      {hasStoredRepresentative ? (
                        <span className="shrink-0 rounded bg-indigo-500/20 px-1 text-[10px] text-indigo-200">
                          대표
                        </span>
                      ) : null}
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {item.markers.length}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {filtered.length > shown.length ? (
              <Button
                type="button"
                variant="outline"
                className="h-7 border-slate-700 text-xs text-slate-200"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                더 보기 ({filtered.length - shown.length}건 남음)
              </Button>
            ) : null}
          </aside>

          <section className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-lg border border-slate-800">
            {group ? (
              <GroupTable
                markers={group.markers}
                workingMarkers={edit.workingMarkers}
                infoRows={edit.infoRows}
                draft={edit.draft}
                issues={issues}
                disabled={isSaving}
                onMarker={edit.setMarker}
                onInfo={edit.setInfo}
              />
            ) : (
              <p className="p-6 text-center text-xs text-slate-400">
                묶음을 찾을 수 없습니다. 왼쪽 목록에서 다시 골라 주세요.
              </p>
            )}
            {group && edit.isInfoLoading ? (
              <p className="p-2 text-center text-[11px] text-slate-400">정보 행을 불러오는 중...</p>
            ) : null}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

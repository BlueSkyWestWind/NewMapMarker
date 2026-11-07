"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GROUP_ROLE_REPRESENTATIVE } from "@/features/map-marker/lib/address-group";
import { storedGroupRoleOf } from "@/features/map-marker/lib/marker-detail-rows";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import {
  GROUP_MANAGE_DIALOG_MAX_WIDTH_PX,
  GROUP_MANAGE_LIST_WIDTH_PX,
} from "@/features/shell/constants";
import { useToast } from "@/hooks/use-toast";
import { useEditDraft } from "../hooks/use-edit-draft";
import { useMarkerGroups } from "../hooks/use-marker-groups";
import { applyDraftToMarkers } from "../lib/edit-draft";
import { planMergeGroups, planMergeSplitToLot, planRoleChange } from "../lib/group-actions";
import { filterGroups } from "../lib/group-filters";
import {
  planDeleteSelected,
  planSeparateSelected,
  planStandaloneSelected,
} from "../lib/selection-actions";
import type { SaveResult } from "../lib/save-draft";
import type { GroupFilters, MarkerGroup, MarkerOp } from "../types";
import { ConfirmDialog } from "./confirm-dialog";
import { GroupActionsBar } from "./group-actions-bar";
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

const MAX_NAMES = 10;

type PendingConfirm =
  | { kind: "delete"; ops: MarkerOp[]; targets: EquipmentMarker[]; newReps: EquipmentMarker[] }
  | { kind: "merge"; ops: MarkerOp[]; groupCount: number; markerCount: number }
  | { kind: "unsplit"; ops: MarkerOp[]; markerCount: number };

function markerLabel(marker: EquipmentMarker): string {
  return marker.finalStationName || marker.name || "이름 없음";
}

function pendingMessage(p: PendingConfirm): string {
  if (p.kind === "delete") {
    return `${p.targets.length}건을 삭제 대상으로 표시했습니다. 저장하면 지워집니다.`;
  }
  if (p.kind === "merge") {
    return `묶음 ${p.groupCount}개(마커 ${p.markerCount}건)를 합쳤습니다. 저장하면 반영됩니다.`;
  }
  return `분리를 해제해 번지 묶음으로 되돌렸습니다(마커 ${p.markerCount}건). 저장하면 반영됩니다.`;
}

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
  const selectedGroupKeys = useMapMarkerStore((state) => state.selectedGroupKeys);
  const setGroupKeys = useMapMarkerStore((state) => state.setGroupKeys);
  const { toast } = useToast();

  const groups = useMarkerGroups();
  const [filters, setFilters] = useState<GroupFilters>(EMPTY_FILTERS);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const filtered = useMemo(() => filterGroups(groups, filters), [groups, filters]);
  const shown = filtered.slice(0, visibleCount);

  const group = groups.find((g) => g.key === groupManageKey) ?? null;
  const edit = useEditDraft(group?.markers ?? NO_MARKERS);
  const { changeCount, issues, isSaving } = edit;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergePicks, setMergePicks] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // 확인 창을 닫는 클릭이 바깥 클릭으로 전달돼 이 창까지 닫히는 것을 잠깐 막는다.
  const ignoreCloseRef = useRef(false);
  const closePending = () => {
    ignoreCloseRef.current = true;
    window.setTimeout(() => {
      ignoreCloseRef.current = false;
    }, 400);
    setPending(null);
  };

  // 묶음을 바꾸면 선택·안내를 비운다.
  useEffect(() => {
    setSelected(new Set());
    setMergePicks(new Set());
    setNotice("");
    setPending(null);
  }, [groupManageKey]);

  // 다른 묶음의 마커까지 포함한 전체 목록에 변경분을 반영한다(계획은 이 위에 이어 쌓는다).
  const allWorking = useMemo(
    () => applyDraftToMarkers(groups.flatMap((g) => g.markers), edit.draft),
    [groups, edit.draft],
  );
  // 지워지거나 사라진 행은 선택에서 자동으로 빠진다.
  const selectedMarkers = edit.workingMarkers.filter((m) => selected.has(m.id));
  const queueWithNotice = (ops: MarkerOp[], message: string) => {
    if (ops.length === 0) {
      setNotice("바꿀 내용이 없습니다.");
      return;
    }
    edit.queue(ops);
    setNotice(message);
    setSelected(new Set());
    setMergePicks(new Set());
  };
  const idsOf = (list: EquipmentMarker[]) => new Set(list.map((m) => m.id));
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAll = (checked: boolean) =>
    setSelected(checked ? idsOf(edit.workingMarkers) : new Set());
  const toggleMergePick = (key: string) =>
    setMergePicks((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const doRepresentative = () => {
    const target = allWorking.find((m) => m.id === selectedMarkers[0]?.id);
    if (!target) return;
    if (storedGroupRoleOf(target) === GROUP_ROLE_REPRESENTATIVE) {
      setNotice("이미 대표입니다.");
      return;
    }
    const plan = planRoleChange(target, GROUP_ROLE_REPRESENTATIVE, allWorking);
    queueWithNotice(plan.ops, plan.notice);
  };
  const doStandalone = () => {
    const plan = planStandaloneSelected(selectedMarkers, allWorking);
    queueWithNotice(plan.ops, plan.notice);
  };
  const doSeparate = () => {
    const plan = planSeparateSelected(selectedMarkers, allWorking);
    queueWithNotice(
      plan.ops,
      `'${plan.label}' ${selectedMarkers.length}건을 새 묶음으로 분리했습니다. 저장하면 반영됩니다.`,
    );
  };
  const askDelete = () => {
    const plan = planDeleteSelected(selectedMarkers, allWorking);
    if (plan.ops.length === 0) return;
    setPending({
      kind: "delete",
      ops: plan.ops,
      targets: selectedMarkers,
      newReps: plan.newRepresentatives,
    });
  };
  const askMerge = () => {
    if (!group) return;
    const ids = (g: MarkerGroup) => new Set(g.markers.map((m) => m.id));
    const picked = groups.filter((g) => mergePicks.has(g.key));
    const sets = [group, ...picked].map(ids);
    const lists = sets.map((set) => allWorking.filter((m) => set.has(m.id)));
    const plan = planMergeGroups(lists, allWorking);
    if (plan.ops.length === 0) return;
    setPending({
      kind: "merge",
      ops: plan.ops,
      groupCount: lists.length,
      markerCount: lists.reduce((sum, list) => sum + list.length, 0),
    });
  };
  const askUnsplit = () => {
    const members = allWorking.filter((m) => edit.workingMarkers.some((w) => w.id === m.id));
    const plan = planMergeSplitToLot(members, allWorking);
    if (plan.ops.length === 0) return;
    setPending({ kind: "unsplit", ops: plan.ops, markerCount: members.length });
  };
  const confirmPending = () => {
    if (!pending) return;
    const message = pendingMessage(pending);
    closePending();
    queueWithNotice(pending.ops, message);
  };
  const canUnsplit = edit.workingMarkers.some((m) => (m.groupKey ?? "").trim() !== "");

  const confirmDiscard = (): boolean =>
    changeCount === 0 ||
    window.confirm(`저장하지 않은 변경 ${changeCount}건이 있습니다. 버리고 계속할까요?`);

  const close = () => {
    if (isSaving || pending || ignoreCloseRef.current || !confirmDiscard()) return;
    edit.discard();
    if (groupManageKey) setLastGroupManageKey(groupManageKey);
    setGroupManageKey(null);
  };

  // 지도 드래그는 변경분을 거치지 않고 DB에 바로 저장되고, 다시 여는 창은 새 데이터로 시작한다.
  // 그래서 저장하지 않은 변경은 이동 전에 버릴지 먼저 묻는다.
  const goToMap = () => {
    if (!groupManageKey || isSaving || pending) return;
    if (
      changeCount > 0 &&
      !window.confirm(
        `저장하지 않은 변경 ${changeCount}건이 있습니다. 지도에서 옮긴 위치는 바로 저장되고 이 창은 새로 열리므로, 지금 변경은 버려집니다. 버리고 지도로 이동할까요?`,
      )
    ) {
      return;
    }
    edit.discard();
    if (!selectedGroupKeys.includes(groupManageKey)) {
      setGroupKeys([...selectedGroupKeys, groupManageKey]);
    }
    setLastGroupManageKey(groupManageKey);
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

  const handleDiscard = () => {
    edit.discard();
    setSelected(new Set());
    setMergePicks(new Set());
    setNotice("");
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
            variant="outline"
            className="h-8 shrink-0 whitespace-nowrap border-slate-700 text-xs text-slate-200"
            disabled={!group || isSaving}
            title="창을 닫고 지도에서 마커를 끌어 위치를 바꿉니다"
            onClick={goToMap}
          >
            <MapPin className="mr-1 h-3.5 w-3.5" aria-hidden />
            지도에서 위치 잡기
          </Button>
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
            onClick={handleDiscard}
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
                  <li key={item.key} className="flex items-center">
                    {active ? (
                      <span className="w-5 shrink-0" />
                    ) : (
                      <input
                        type="checkbox"
                        aria-label={`${itemHead.name || "이름 없음"} 묶음 합치기 선택`}
                        title="현재 묶음과 합칠 묶음으로 고릅니다"
                        className="mx-1 shrink-0"
                        checked={mergePicks.has(item.key)}
                        disabled={isSaving}
                        onChange={() => toggleMergePick(item.key)}
                      />
                    )}
                    <button
                      type="button"
                      aria-current={active}
                      onClick={() => selectGroup(item.key)}
                      className={`flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-xs ${
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

          <div className="flex min-w-0 flex-1 flex-col">
            {group ? (
              <GroupActionsBar
                selectedCount={selectedMarkers.length}
                canUnsplit={canUnsplit}
                mergePickCount={mergePicks.size}
                disabled={isSaving}
                onRepresentative={doRepresentative}
                onStandalone={doStandalone}
                onSeparate={doSeparate}
                onDelete={askDelete}
                onMerge={askMerge}
                onUnsplit={askUnsplit}
              />
            ) : null}
            {group?.hasNoCoord ? (
              <p className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100">
                좌표가 없는 마커는 지도에 나오지 않아 끌어 옮길 수 없습니다. 표의 위도·경도 칸에
                직접 입력해 주세요.
              </p>
            ) : null}
            {notice ? (
              <p
                role="status"
                className="mb-2 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-100"
              >
                {notice}
              </p>
            ) : null}
          <section className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-lg border border-slate-800">
            {group ? (
              <GroupTable
                markers={group.markers}
                workingMarkers={edit.workingMarkers}
                infoRows={edit.infoRows}
                draft={edit.draft}
                issues={issues}
                disabled={isSaving}
                selectedIds={selected}
                onToggleSelect={toggleSelect}
                onToggleAll={toggleAll}
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
        </div>
      </DialogContent>
      {pending ? (
        <ConfirmDialog
          title={pending.kind === "delete" ? "마커 삭제" : pending.kind === "merge" ? "묶음 합치기" : "분리 해제"}
          confirmLabel={pending.kind === "delete" ? "삭제" : "확인"}
          destructive={pending.kind === "delete"}
          onConfirm={confirmPending}
          onCancel={closePending}
        >
          {pending.kind === "delete" ? (
            <>
              <p>마커 {pending.targets.length}건을 삭제합니다.</p>
              <ul className="list-disc pl-5 text-xs text-slate-300">
                {pending.targets.slice(0, MAX_NAMES).map((m) => (
                  <li key={m.id}>{markerLabel(m)}</li>
                ))}
              </ul>
              {pending.targets.length > MAX_NAMES ? (
                <p className="text-xs text-slate-300">외 {pending.targets.length - MAX_NAMES}건</p>
              ) : null}
              {pending.newReps.length > 0 ? (
                <p className="text-xs text-amber-200">
                  대표를 지우므로 새 대표: {pending.newReps.map(markerLabel).join(", ")}
                </p>
              ) : null}
              <p className="font-medium text-rose-300">
                되돌릴 수 없습니다. 삭제 전에 백업을 받아 두세요
              </p>
              <p className="text-xs text-slate-400">
                저장 전까지는 DB에 쓰지 않으며 [변경 취소]로 되돌릴 수 있습니다.
              </p>
            </>
          ) : pending.kind === "merge" ? (
            <p>
              묶음 {pending.groupCount}개(마커 {pending.markerCount}건)를 하나로 합칩니다. 대표는
              기존 대표(없으면 먼저 등록된 마커)로 정해지고 나머지는 SUB가 됩니다.
            </p>
          ) : (
            <p>
              분리된 묶음({pending.markerCount}건)을 번지 묶음으로 되돌립니다. 같은 번지의 다른
              마커와 합쳐 대표를 다시 정합니다.
            </p>
          )}
        </ConfirmDialog>
      ) : null}
    </Dialog>
  );
}

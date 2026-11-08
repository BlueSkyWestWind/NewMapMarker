"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LEGACY_COLOR_NAMES } from "@/features/map-marker/constants/facility-teams";
import { GROUP_BULK_DIALOG_MAX_WIDTH_PX } from "@/features/shell/constants";
import { useToast } from "@/hooks/use-toast";
import { useEditDraft } from "../hooks/use-edit-draft";
import { planBulkEdit, type BulkValues } from "../lib/bulk-edit";
import { emptyDraft } from "../lib/edit-draft";
import { planSyncSubCoords } from "../lib/sync-coords";
import type { MarkerGroup } from "../types";
import { ConfirmDialog } from "./confirm-dialog";

/** 저장 색상으로 고를 수 있는 색(개통완료 흰색은 상태색이라 제외). */
const COLOR_OPTIONS = Object.entries(LEGACY_COLOR_NAMES).filter(([hex]) => hex !== "#ffffff");

function splitTags(text: string): string[] {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
}

interface GroupBulkDialogProps {
  groups: MarkerGroup[];
  onClose: () => void;
}

/** 선택한 여러 묶음의 마커에 사업구분·담당팀·색상·태그를 한꺼번에 바꿔 변경분에 쌓고 저장한다. */
export function GroupBulkDialog({ groups, onClose }: GroupBulkDialogProps) {
  const { toast } = useToast();
  const markers = useMemo(() => groups.flatMap((g) => g.markers), [groups]);
  const edit = useEditDraft(markers);
  const { changeCount, issues, isSaving, isInfoLoading, isInfoError } = edit;
  // 정보 행이 오기 전(또는 실패)에는 사업구분이 건너뛰기로 잘못 계산되므로 반영·저장을 막는다.
  const infoReady = !isInfoLoading && !isInfoError;

  const [businessType, setBusinessType] = useState("");
  const [facilityTeam, setFacilityTeam] = useState("");
  const [color, setColor] = useState("");
  const [addTags, setAddTags] = useState("");
  const [removeTags, setRemoveTags] = useState("");
  const [syncCoords, setSyncCoords] = useState(false);
  const [askClose, setAskClose] = useState(false);
  const ignoreCloseRef = useRef(false);

  const values: BulkValues = useMemo(() => {
    const next: BulkValues = {};
    if (businessType.trim() !== "") next.businessType = businessType.trim();
    if (facilityTeam.trim() !== "") next.facilityTeam = facilityTeam.trim();
    if (color !== "") next.color = color;
    const add = splitTags(addTags);
    const remove = splitTags(removeTags);
    if (add.length > 0) next.addTags = add;
    if (remove.length > 0) next.removeTags = remove;
    return next;
  }, [businessType, facilityTeam, color, addTags, removeTags]);
  const hasValues = Object.keys(values).length > 0 || syncCoords;

  // 입력만으로 미리 계산해 건너뛸 마커 수를 보여 준다. 변경분에는 아직 넣지 않는다.
  const preview = useMemo(
    () => planBulkEdit(emptyDraft(), markers, edit.originalInfoRows, values),
    [markers, edit.originalInfoRows, values],
  );

  // SUB 좌표 맞추기 미리보기. 변경분에는 아직 넣지 않는다.
  const syncPreview = useMemo(
    () => planSyncSubCoords(edit.draft, groups),
    [edit.draft, groups],
  );

  const apply = () => {
    if (!infoReady) return;
    edit.update((d) => {
      const edited = planBulkEdit(d, markers, edit.originalInfoRows, values).draft;
      return syncCoords ? planSyncSubCoords(edited, groups).draft : edited;
    });
  };

  const closeNow = () => {
    edit.discard();
    onClose();
  };
  const requestClose = () => {
    if (isSaving || ignoreCloseRef.current) return;
    if (changeCount > 0) setAskClose(true);
    else closeNow();
  };
  const closeAsk = () => {
    ignoreCloseRef.current = true;
    window.setTimeout(() => {
      ignoreCloseRef.current = false;
    }, 400);
    setAskClose(false);
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

  const summary: string[] = [];
  if (values.businessType) summary.push(`사업구분 → ${values.businessType}`);
  if (values.facilityTeam) summary.push(`담당팀 → ${values.facilityTeam}`);
  if (values.color) summary.push(`색상 → ${LEGACY_COLOR_NAMES[values.color] ?? values.color}`);
  if (values.addTags) summary.push(`태그 추가 → ${values.addTags.join(", ")}`);
  if (values.removeTags) summary.push(`태그 제거 → ${values.removeTags.join(", ")}`);
  if (syncCoords) summary.push("SUB 위경도 → 대표 위경도");

  const result = edit.lastResult;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : requestClose())}>
      <DialogContent
        className="flex w-[96vw] flex-col gap-3 p-5"
        style={{ maxWidth: GROUP_BULK_DIALOG_MAX_WIDTH_PX }}
      >
        <div className="flex items-center gap-3 pr-8">
          <DialogTitle className="shrink-0 whitespace-nowrap text-base">일괄 수정</DialogTitle>
          <DialogDescription className="sr-only">
            선택한 묶음의 마커에 값을 한꺼번에 바꿉니다.
          </DialogDescription>
          <span className="min-w-0 flex-1 truncate whitespace-nowrap text-xs text-slate-400">
            대상 묶음 {groups.length}개 · 마커 {markers.length}건
          </span>
          <span
            className={`shrink-0 whitespace-nowrap text-xs ${
              changeCount > 0 ? "text-amber-300" : "text-slate-400"
            }`}
          >
            변경 {changeCount}건{issues.length > 0 ? ` · 입력 오류 ${issues.length}건` : ""}
          </span>
          <Button
            type="button"
            className="h-8 shrink-0 bg-indigo-600 text-xs hover:bg-indigo-500"
            disabled={changeCount === 0 || issues.length > 0 || isSaving || !infoReady}
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

        {result?.error ? (
          <p
            role="alert"
            className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
          >
            저장 중 멈췄습니다 ({result.error.message}). 저장된 것: 마커{" "}
            {result.savedMarkerIds.length}건 · 정보 {result.savedInfoIds.length}건 · 정리{" "}
            {result.completedOps}건. 남은 변경은 그대로 두었으니 다시 저장할 수 있습니다.
          </p>
        ) : null}

        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs">
          <label htmlFor="bulk-business" className="whitespace-nowrap text-slate-300">
            사업구분
          </label>
          <Input
            id="bulk-business"
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            placeholder="비워 두면 바꾸지 않음 (모든 정보 행에 적용)"
            disabled={isSaving}
            className="h-8 border-slate-700 bg-slate-900 text-xs"
          />
          <label htmlFor="bulk-team" className="whitespace-nowrap text-slate-300">
            담당팀
          </label>
          <Input
            id="bulk-team"
            value={facilityTeam}
            onChange={(e) => setFacilityTeam(e.target.value)}
            placeholder="비워 두면 바꾸지 않음"
            disabled={isSaving}
            className="h-8 border-slate-700 bg-slate-900 text-xs"
          />
          <label htmlFor="bulk-color" className="whitespace-nowrap text-slate-300">
            색상
          </label>
          <select
            id="bulk-color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={isSaving}
            className="h-8 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
          >
            <option value="">변경 안 함</option>
            {COLOR_OPTIONS.map(([hex, label]) => (
              <option key={hex} value={hex}>
                {label} ({hex})
              </option>
            ))}
          </select>
          <label htmlFor="bulk-add-tags" className="whitespace-nowrap text-slate-300">
            태그 추가
          </label>
          <Input
            id="bulk-add-tags"
            value={addTags}
            onChange={(e) => setAddTags(e.target.value)}
            placeholder="쉼표로 구분 (기존 태그는 유지)"
            disabled={isSaving}
            className="h-8 border-slate-700 bg-slate-900 text-xs"
          />
          <label htmlFor="bulk-remove-tags" className="whitespace-nowrap text-slate-300">
            태그 제거
          </label>
          <Input
            id="bulk-remove-tags"
            value={removeTags}
            onChange={(e) => setRemoveTags(e.target.value)}
            placeholder="쉼표로 구분"
            disabled={isSaving}
            className="h-8 border-slate-700 bg-slate-900 text-xs"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={syncCoords}
            onChange={(e) => setSyncCoords(e.target.checked)}
            disabled={isSaving}
          />
          <span className="whitespace-nowrap">SUB 위경도를 대표 위경도로 맞추기</span>
          <span className="whitespace-nowrap text-slate-400">
            (바뀔 SUB {syncPreview.changed}건
            {syncPreview.skippedNoRep > 0 ? ` · 대표 좌표 없어 건너뜀 ${syncPreview.skippedNoRep}묶음` : ""})
          </span>
        </label>

        <div className="space-y-1 rounded-lg border border-slate-800 p-3 text-xs text-slate-300">
          <p>
            바뀔 값:{" "}
            {summary.length > 0 ? summary.join(" · ") : "입력한 값이 없습니다."}
          </p>
          <p>대상: 마커 {markers.length}건</p>
          {values.businessType && infoReady ? (
            <p className={preview.skipped > 0 ? "text-amber-200" : undefined}>
              정보 행이 없어 사업구분을 건너뛰는 마커: {preview.skipped}건
            </p>
          ) : null}
          {isInfoLoading ? <p className="text-slate-400">정보 행을 불러오는 중...</p> : null}
          {isInfoError ? (
            <p role="alert" className="text-rose-300">
              정보 행을 불러오지 못했습니다. 창을 다시 열어 주세요. 그 전에는 반영·저장할 수 없습니다.
            </p>
          ) : null}
          <p className="text-slate-400">
            [변경분에 반영]은 저장하지 않고 변경분에만 쌓습니다. 저장은 [저장]을 눌러야 합니다.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            className="h-8 bg-indigo-600 text-xs hover:bg-indigo-500"
            disabled={!hasValues || !infoReady || isSaving}
            onClick={apply}
          >
            변경분에 반영
          </Button>
        </div>
      </DialogContent>
      {askClose ? (
        <ConfirmDialog
          title="저장하지 않은 변경"
          confirmLabel="버리고 닫기"
          destructive
          onConfirm={() => {
            closeAsk();
            closeNow();
          }}
          onCancel={closeAsk}
        >
          <p>저장하지 않은 변경 {changeCount}건이 있습니다. 버리고 닫을까요?</p>
        </ConfirmDialog>
      ) : null}
    </Dialog>
  );
}

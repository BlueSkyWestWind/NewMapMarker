"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import {
  createScheduleCell,
  deleteScheduleCell,
  moveScheduleCell,
  setScheduleMark,
  updateScheduleCellText,
} from "@/features/schedule/api";
import {
  COMPANION_KINDS,
  findCompanions,
  parseCompanionText,
  planCompanionOps,
  type CompanionKind,
} from "@/features/schedule/lib/companions";
import { useStationOptions } from "@/features/schedule/hooks/use-station-options";
import { draftsFromCells, planGroupOps, type EntryDraft } from "@/features/schedule/lib/group-edit";
import { pickStation, startPickSession, type PickSession } from "@/features/schedule/lib/station-pick";
import { searchStations } from "@/features/schedule/lib/station-search";
import { isValidIso, weekdayLabel } from "@/features/schedule/lib/week";
import {
  MARK_COLORS,
  markLabel,
  TEXT_COLOR_DISPLAY,
  textColorLabel,
  type CellPosition,
  type MarkColor,
  type ScheduleCell,
  type ScheduleColumn,
  type TextColor,
} from "@/features/schedule/types";
import { useToast } from "@/hooks/use-toast";
import { StationSearchAdd } from "./station-search-add";
import { StationSuggestionList } from "./station-suggestion-list";

const MARK_CHOICES: (MarkColor | null)[] = [null, ...MARK_COLORS];
const FIELD_CLASS = "h-8 border-slate-700 bg-slate-900 text-xs";
const SELECT_CLASS =
  "h-8 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 disabled:opacity-60";
const CLICKED_NEW_KEY = "clicked";

export interface CellEditorState {
  cell: ScheduleCell | null;
  position: CellPosition;
}

interface ScheduleCellDialogProps {
  state: CellEditorState | null;
  columns: ScheduleColumn[];
  /** 보고 있는 기간의 칸. 같은 팀·날짜의 일정 목록과 입회·신호수 칸을 찾는 데 쓴다. */
  cells: ScheduleCell[];
  /** 클릭한 날짜×팀의 현재 칸 색 */
  mark: MarkColor | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function columnLabel(column: ScheduleColumn): string {
  return column.leaderLabel ? `${column.teamLabel} · ${column.leaderLabel}` : column.teamLabel;
}

/** 글자색을 없음 → 파랑 → 빨강 → 없음 순으로 돌린다. */
function nextTextColor(color: TextColor | null): TextColor | null {
  if (color === null) return "0070C0";
  if (color === "0070C0") return "FF0000";
  return null;
}

/** 클릭한 빈 행의 새 항목을 행 순서에 맞게 끼워 넣은 처음 목록. */
function initialDrafts(cells: ScheduleCell[], state: CellEditorState): EntryDraft[] {
  const { cell, position } = state;
  const drafts = draftsFromCells(cells, position.workDate, position.columnId);
  if (cell !== null) return drafts;
  const blank: EntryDraft = {
    key: CLICKED_NEW_KEY,
    id: null,
    rowNo: position.rowNo,
    mainText: "",
    subText: "",
    textColor: null,
  };
  const index = drafts.findIndex((draft) => (draft.rowNo ?? 0) > position.rowNo);
  return index === -1 ? [...drafts, blank] : [...drafts.slice(0, index), blank, ...drafts.slice(index)];
}

type CompanionFields = Record<CompanionKind, { enabled: boolean; names: string }>;

function initialCompanions(cells: ScheduleCell[], position: CellPosition): CompanionFields {
  const found = findCompanions(cells, position.workDate, position.columnId);
  const fieldOf = (kind: CompanionKind) => {
    const existing = found[kind];
    return {
      enabled: existing !== null,
      names: existing ? (parseCompanionText(existing.subText)?.names ?? "") : "",
    };
  };
  return { 입회: fieldOf("입회"), 신호수: fieldOf("신호수") };
}

/**
 * 일정 칸 창. **클릭한 칸 하나가 아니라 그 팀·날짜의 모든 국소를 한 목록**으로 보여 주고
 * 한 번에 고친다(글·모국·장비·메모·글자색 수정, ×로 빼기, 검색·직접 입력으로 추가).
 * 관리자가 아니면 읽기 전용으로 열린다.
 */
export function ScheduleCellDialog({
  state,
  columns,
  cells,
  mark,
  canEdit,
  onClose,
  onSaved,
}: ScheduleCellDialogProps) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {state ? (
        <CellForm
          key={`${state.cell?.id ?? "new"}|${state.position.workDate}|${state.position.columnId}|${state.position.rowNo}`}
          state={state}
          columns={columns}
          cells={cells}
          mark={mark}
          canEdit={canEdit}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

interface CellFormProps extends Omit<ScheduleCellDialogProps, "state"> {
  state: CellEditorState;
}

function CellForm({ state, columns, cells, mark, canEdit, onClose, onSaved }: CellFormProps) {
  const { supabase } = useAuthSession();
  const { toast } = useToast();
  const { cell, position } = state;
  const clickedKey = cell?.id ?? CLICKED_NEW_KEY;

  const [drafts, setDrafts] = useState<EntryDraft[]>(() => initialDrafts(cells, state));
  const [query, setQuery] = useState("");
  const [companions, setCompanions] = useState<CompanionFields>(() =>
    initialCompanions(cells, position),
  );
  const [workDate, setWorkDate] = useState(position.workDate);
  const [columnId, setColumnId] = useState(position.columnId);
  const [markColor, setMarkColor] = useState<MarkColor | null>(mark);
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const newKeyCounter = useRef(0);
  // 줄 입력에 글을 쓰는 동안 그 줄 아래에 등록된 국소 검색 결과를 보여 준다(한 번에 한 줄).
  const stationOptions = useStationOptions();
  const [suggestKey, setSuggestKey] = useState<string | null>(null);
  const [suggestQuery, setSuggestQuery] = useState("");
  const [suggestIndex, setSuggestIndex] = useState(-1);
  const [pickSession, setPickSession] = useState<PickSession | null>(null);

  const sortedColumns = [...columns].sort((a, b) => a.sortOrder - b.sortOrder);
  const teamName =
    columns.find((column) => column.id === position.columnId)?.teamLabel ?? "팀";
  const disabled = !canEdit || isSaving;
  const listedNames = drafts.map((draft) => draft.mainText.trim()).filter(Boolean);

  const updateDraft = (key: string, patch: Partial<EntryDraft>) =>
    setDrafts((prev) => prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  // 검색 결과는 줄의 현재 글이 아니라 **검색어**로 만든다. 고르면 줄 글이 바뀌지만 같은 결과 목록이
  // 그대로 열려 있어 이어서 여러 개 고를 수 있다.
  const rowResults = (() => {
    if (suggestKey === null) return [];
    const found = searchStations(stationOptions, suggestQuery);
    // 아무것도 고르지 않았고 이미 정확히 입력한 이름 하나만 남으면 목록을 접는다.
    return pickSession === null && found.length === 1 && found[0].label === suggestQuery.trim()
      ? []
      : found;
  })();
  const listedSet = new Set(listedNames);
  const closeSuggestions = (key: string) => {
    setSuggestKey((prev) => (prev === key ? null : prev));
    setPickSession(null);
  };
  /** 검색 결과에서 국소를 고르거나(없으면 이 줄과 아래 줄에 추가) 푼다(이미 고른 것이면 선택 해제). */
  const pickRowStation = (label: string) => {
    if (suggestKey === null) return;
    const result = pickStation({
      drafts,
      session: pickSession ?? startPickSession(suggestKey, suggestQuery),
      label,
      newKey: () => {
        newKeyCounter.current += 1;
        return `new-${newKeyCounter.current}`;
      },
    });
    setDrafts(result.drafts);
    setPickSession(result.session);
  };
  const handleRowKeyDown = (event: KeyboardEvent<HTMLInputElement>, key: string) => {
    if (suggestKey !== key || rowResults.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSuggestIndex((index) => Math.min(index + 1, rowResults.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSuggestIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && suggestIndex >= 0 && rowResults[suggestIndex]) {
      // 고르는 Enter는 폼 저장으로 넘어가지 않게 막고, 목록은 열어 둔다.
      event.preventDefault();
      pickRowStation(rowResults[suggestIndex].label);
    }
  };
  const removeDraft = (key: string) =>
    setDrafts((prev) => prev.filter((draft) => draft.key !== key));
  const addDraft = (mainText: string) => {
    newKeyCounter.current += 1;
    setDrafts((prev) => [
      ...prev,
      {
        key: `new-${newKeyCounter.current}`,
        id: null,
        rowNo: null,
        mainText: mainText.trim(),
        subText: "",
        textColor: null,
      },
    ]);
  };
  const setCompanion = (kind: CompanionKind, patch: Partial<CompanionFields[CompanionKind]>) =>
    setCompanions((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));

  const handleSave = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!supabase || !canEdit) return;

    // 계획을 먼저 세운다. 문제가 있으면 아무것도 저장하지 않는다.
    const groupPlan = planGroupOps({
      cells,
      workDate: position.workDate,
      columnId: position.columnId,
      drafts,
    });
    if ("error" in groupPlan) {
      setNotice(
        groupPlan.error === "blank"
          ? "글을 모두 지운 항목이 있습니다. 글을 입력하거나 ×로 목록에서 빼 주세요."
          : "이 팀의 행이 가득 차서 모두 기록할 수 없습니다.",
      );
      return;
    }
    const lastRow = Math.max(position.rowNo, ...drafts.map((draft) => draft.rowNo ?? -1));
    const companionPlan = planCompanionOps({
      cells,
      workDate: position.workDate,
      columnId: position.columnId,
      excludeId: null,
      companions: COMPANION_KINDS.map((kind) => ({ kind, ...companions[kind] })),
      anchorRow: lastRow,
      reservedRows: groupPlan.usedRows,
    });
    if ("error" in companionPlan) {
      setNotice("이 팀의 행이 가득 차서 입회·신호수 칸을 추가할 수 없습니다.");
      return;
    }

    const clickedDraft = drafts.find((draft) => draft.key === clickedKey);
    const clickedPresent =
      clickedDraft !== undefined &&
      (clickedDraft.id !== null ||
        clickedDraft.mainText.trim() !== "" ||
        clickedDraft.subText.trim() !== "");
    const moving = workDate !== position.workDate || columnId !== position.columnId;
    const nothingToDo =
      groupPlan.ops.length === 0 &&
      companionPlan.ops.length === 0 &&
      !(moving && clickedPresent) &&
      markColor === mark;
    if (nothingToDo) {
      if (cell === null) {
        setNotice("입력한 내용이 없습니다.");
        return;
      }
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      let clickedId = cell?.id ?? null;
      for (const op of groupPlan.ops) {
        if (op.op === "delete") {
          await deleteScheduleCell(supabase, op.id);
        } else if (op.op === "update") {
          await updateScheduleCellText(supabase, op.id, op.text);
        } else {
          const createdId = await createScheduleCell(supabase, op.position, op.text);
          if (op.key === clickedKey) clickedId = createdId;
        }
      }
      if (moving && clickedPresent && clickedId) {
        // 클릭한 일정만 빈 행으로 옮긴다(도착 날짜·팀의 점유 상태는 이 창이 모른다).
        await moveScheduleCell(supabase, clickedId, { workDate, columnId, rowNo: null });
      }
      if (markColor !== mark) {
        await setScheduleMark(supabase, position.workDate, position.columnId, markColor);
      }
      for (const op of companionPlan.ops) {
        if (op.op === "create") await createScheduleCell(supabase, op.position, op.text);
        else if (op.op === "update") await updateScheduleCellText(supabase, op.id, op.text);
        else await deleteScheduleCell(supabase, op.id);
      }
      toast({ title: "저장했습니다" });
      onSaved();
      onClose();
    } catch (error) {
      toast({
        title: "저장하지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      onSaved(); // 일부만 저장됐을 수 있으니 화면을 새로 고친다.
    } finally {
      setIsSaving(false);
    }
  };

  const title = `${cell ? "일정 수정" : "일정 추가"} · ${position.workDate} (${weekdayLabel(position.workDate)}) · ${teamName}`;

  return (
    <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-3 overflow-y-auto p-5">
      <DialogTitle className="text-base">{title}</DialogTitle>
      <DialogDescription className="sr-only">
        {canEdit
          ? "이 팀·날짜의 일정 목록을 한 번에 고칩니다."
          : "이 팀·날짜의 일정 목록입니다(읽기 전용)."}
      </DialogDescription>
      <form className="flex flex-col gap-3 text-xs" onSubmit={handleSave}>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">
              이 팀·날짜의 일정 <span className="text-slate-500">({drafts.length}건)</span>
            </span>
            {canEdit ? (
              <button
                type="button"
                disabled={disabled}
                className="flex h-6 items-center gap-1 rounded-md border border-slate-700 px-2 text-[11px] hover:bg-slate-800 disabled:opacity-50"
                onClick={() => addDraft("")}
              >
                <Plus className="h-3 w-3" aria-hidden />
                빈 항목 추가
              </button>
            ) : null}
          </div>

          {drafts.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-700 p-3 text-[11px] text-slate-400">
              일정이 없습니다. 아래에서 국소를 검색해 추가하거나 빈 항목을 추가해 입력하세요.
            </p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
              {drafts.map((draft) => (
                <li key={draft.key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                  <span
                    className="w-6 shrink-0 text-center text-[11px] text-slate-500"
                    title={draft.rowNo !== null ? `${draft.rowNo + 1}행` : "새 항목"}
                  >
                    {draft.rowNo !== null ? draft.rowNo + 1 : "+"}
                  </span>
                  <Input
                    value={draft.mainText}
                    maxLength={500}
                    disabled={disabled}
                    aria-label="국소·작업"
                    placeholder="국소·작업 (이름·통합시설코드·프로젝트코드로 검색)"
                    autoFocus={draft.key === clickedKey}
                    onChange={(event) => {
                      updateDraft(draft.key, { mainText: event.target.value });
                      setSuggestKey(draft.key);
                      setSuggestQuery(event.target.value);
                      setSuggestIndex(-1);
                      setPickSession(null);
                    }}
                    onBlur={() => closeSuggestions(draft.key)}
                    onKeyDown={(event) => handleRowKeyDown(event, draft.key)}
                    autoComplete="off"
                    className={cn(FIELD_CLASS, "min-w-0 flex-1")}
                    style={
                      draft.textColor ? { color: TEXT_COLOR_DISPLAY[draft.textColor] } : undefined
                    }
                  />
                  <Input
                    value={draft.subText}
                    maxLength={500}
                    disabled={disabled}
                    aria-label="모국·장비·메모"
                    placeholder="모국·장비·메모"
                    onChange={(event) => updateDraft(draft.key, { subText: event.target.value })}
                    className={cn(FIELD_CLASS, "w-40 shrink-0")}
                    style={
                      draft.textColor ? { color: TEXT_COLOR_DISPLAY[draft.textColor] } : undefined
                    }
                  />
                  <button
                    type="button"
                    disabled={disabled}
                    title={`글자색: ${draft.textColor ? textColorLabel(draft.textColor) : "없음"} (눌러서 바꿉니다)`}
                    aria-label="글자색 바꾸기"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700 text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
                    style={
                      draft.textColor ? { color: TEXT_COLOR_DISPLAY[draft.textColor] } : undefined
                    }
                    onClick={() =>
                      updateDraft(draft.key, { textColor: nextTextColor(draft.textColor) })
                    }
                  >
                    가
                  </button>
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={disabled}
                      title="목록에서 빼기(저장하면 삭제됩니다)"
                      aria-label="목록에서 빼기"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:border-rose-700 hover:text-rose-300 disabled:opacity-50"
                      onClick={() => removeDraft(draft.key)}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : null}
                  </div>
                  {suggestKey === draft.key && rowResults.length > 0 ? (
                    <StationSuggestionList
                      results={rowResults}
                      activeIndex={suggestIndex}
                      addedLabels={listedSet}
                      onPick={pickRowStation}
                      className="ml-7"
                    />
                  ) : null}
                  {suggestKey === draft.key && rowResults.length > 0 ? (
                    <p className="ml-7 text-[11px] text-slate-400">
                      여러 개를 이어서 고를 수 있습니다. 고른 국소는 이 줄과 아래 줄에 차례로 들어갑니다(다시
                      누르면 선택이 풀립니다).
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canEdit ? (
          <div className="flex flex-col gap-1">
            <span className="text-slate-300">국소 검색해서 추가</span>
            <StationSearchAdd
              query={query}
              onQueryChange={setQuery}
              existing={listedNames}
              onAdd={addDraft}
              disabled={disabled}
            />
            <p className="text-[11px] text-slate-400">
              여러 개를 이어서 고를 수 있고, 저장하면 이 팀·날짜의 아래 빈 행에 차례로 기록됩니다.
            </p>
          </div>
        ) : null}

        <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
          <legend className="mb-1 text-slate-300">입회 · 신호수</legend>
          {COMPANION_KINDS.map((kind) => (
            <div key={kind} className="flex items-center gap-2">
              <label className="flex w-20 shrink-0 cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={companions[kind].enabled}
                  onChange={(event) => setCompanion(kind, { enabled: event.target.checked })}
                />
                <span>{kind}</span>
              </label>
              <Input
                value={companions[kind].names}
                maxLength={200}
                disabled={disabled || !companions[kind].enabled}
                aria-label={`${kind} 이름`}
                placeholder="이름(여러 명은 쉼표로)"
                onChange={(event) => setCompanion(kind, { names: event.target.value })}
                className={cn(FIELD_CLASS, "flex-1")}
              />
            </div>
          ))}
          <p className="text-[11px] text-slate-400">
            체크하면 이 팀·날짜의 빈 행에 `입회 : 이름` 칸이 따로 생깁니다. 이미 있으면 체크된
            상태로 보이고, 체크를 풀면 그 칸이 삭제됩니다.
          </p>
        </fieldset>

        <div className="flex flex-col gap-1">
          <span className="text-slate-300">
            이날({position.workDate}) · {teamName} 칸 색
          </span>
          <div className="flex flex-wrap gap-1.5">
            {MARK_CHOICES.map((color) => (
              <button
                key={color ?? "none"}
                type="button"
                disabled={disabled}
                aria-pressed={markColor === color}
                title={color ? markLabel(color) : "색 없음"}
                onClick={() => setMarkColor(color)}
                className={cn(
                  "flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-[11px] disabled:opacity-60",
                  markColor === color
                    ? "border-indigo-400 bg-indigo-500/20"
                    : "border-slate-700 hover:bg-slate-800",
                )}
              >
                {color ? (
                  <span
                    className="inline-block h-3 w-4 rounded-sm border border-slate-600"
                    style={{ backgroundColor: `#${color}` }}
                    aria-hidden
                  />
                ) : null}
                {color ? markLabel(color) : "없음"}
              </button>
            ))}
          </div>
        </div>

        {canEdit && cell ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-slate-300">클릭한 일정을 옮길 날짜</span>
              <Input
                type="date"
                value={workDate}
                disabled={disabled}
                onChange={(event) =>
                  isValidIso(event.target.value) && setWorkDate(event.target.value)
                }
                className={FIELD_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-300">클릭한 일정을 옮길 팀</span>
              <select
                value={columnId}
                disabled={disabled}
                onChange={(event) => setColumnId(event.target.value)}
                className={SELECT_CLASS}
              >
                {sortedColumns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {columnLabel(column)}
                  </option>
                ))}
              </select>
            </label>
            <p className="col-span-2 text-[11px] text-slate-400">
              날짜나 팀을 바꾸면 처음 클릭한 일정 하나만 그 날짜·팀의 첫 빈 행으로 옮겨집니다.
            </p>
          </div>
        ) : null}

        {notice ? <p className="text-[11px] text-amber-400">{notice}</p> : null}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-8 border-slate-700 text-xs text-slate-200"
            onClick={onClose}
          >
            {canEdit ? "취소" : "닫기"}
          </Button>
          {canEdit ? (
            <Button
              type="submit"
              disabled={isSaving}
              className="h-8 bg-indigo-600 text-xs hover:bg-indigo-500"
            >
              {isSaving ? "저장 중…" : "저장"}
            </Button>
          ) : null}
        </div>
      </form>
    </DialogContent>
  );
}

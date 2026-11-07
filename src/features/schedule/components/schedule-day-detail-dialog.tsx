"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { OptionField } from "@/features/schedule/components/option-field";
import { useOptionLists } from "@/features/schedule/hooks/use-option-lists";
import { DAY_COLUMNS } from "@/features/schedule/lib/day-columns";
import { pickPreviousInput } from "@/features/schedule/lib/day-archive";
import {
  buildDetailPatches,
  emptyForm,
  formFromValues,
  type DetailFormKey,
} from "@/features/schedule/lib/day-detail-form";
import type { DayRow } from "@/features/schedule/lib/day-rows";
import type { ArchiveRow, DayDetailPatch, OptionListKey, RefKey } from "@/features/schedule/lib/day-types";
import { OPTION_LIST_LABELS } from "@/features/schedule/lib/option-lists";

const INPUT_CLASS = "h-8 border-slate-700 bg-slate-900 text-xs";

/** `이전 입력 불러오기`가 채우는 칸(`pickPreviousInput`과 같은 다섯 열) */
const PREVIOUS_INPUT_KEYS = ["workTime", "workType", "equipment", "workContent", "workDetail"] as const;

/** 한 행: 목록에서 고르는 칸(드롭다운 + 새 값) */
const SINGLE_OPTION_FIELDS: readonly { key: DetailFormKey; list: OptionListKey; label: string }[] = [
  { key: "workCategory", list: "workCategory", label: "작업구분(G)" },
  { key: "workTime", list: "workTime", label: OPTION_LIST_LABELS.workTime },
  { key: "workType", list: "workType", label: OPTION_LIST_LABELS.workType },
  { key: "equipment", list: "equipment", label: OPTION_LIST_LABELS.equipment },
  { key: "workContent", list: "workContent", label: OPTION_LIST_LABELS.workContent },
];

/** 한 행: 직접 쓰는 칸 */
const SINGLE_TEXT_FIELDS: readonly { key: DetailFormKey; label: string }[] = [
  { key: "levelLabel", label: "작업구분(S)" },
  { key: "workDetail", label: "작업내용 상세" },
  { key: "worker", label: "작업자" },
  { key: "witness", label: "입회자" },
  { key: "signaler", label: "신호수" },
];

/** 한 행: 참조 11열 덮어쓰기(표 열 머리글 이름 그대로) */
const REF_FIELDS = DAY_COLUMNS.filter((column) => column.kind === "ref").map((column) => ({
  key: column.key as RefKey,
  label: column.header,
}));

interface ScheduleDayDetailDialogProps {
  /** 한 행이면 그 행 상세, 둘 이상이면 일괄 적용 */
  rows: readonly DayRow[];
  canEdit: boolean;
  /** 국소별 이전 누적 행(보는 날보다 앞선 것 중 가장 늦은 날) */
  latestArchive: ReadonlyMap<string, ArchiveRow>;
  onClose: () => void;
  /** 바뀐 칸만 담은 패치로 저장한다. 실패하면 던진다(창은 열려 있다). */
  onSave: (patches: { station: DayRow; patch: DayDetailPatch }[]) => Promise<void>;
}

function TextField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-slate-400">{label}</span>
      <Input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT_CLASS}
      />
    </label>
  );
}

/**
 * 일자별 작업 상세 창. 한 행이면 입력 열과 참조 11열 덮어쓰기를 고치고,
 * 체크한 여러 행이면 작업 열 여섯 가지 중 **채운 칸만** 모두에 적용한다(빈 칸은 그대로).
 * 저장은 표시 값에서 바뀐 칸만 보낸다. 관리자가 아니면 값만 보여 준다.
 */
export function ScheduleDayDetailDialog({
  rows,
  canEdit,
  latestArchive,
  onClose,
  onSave,
}: ScheduleDayDetailDialogProps) {
  const { lists, add } = useOptionLists();
  const isBulk = rows.length > 1;
  const first = rows[0];
  const [form, setForm] = useState(() => (isBulk || !first ? emptyForm() : formFromValues(first.values)));
  const [isSaving, setIsSaving] = useState(false);
  const patches = useMemo(() => buildDetailPatches(rows, form), [rows, form]);

  const setField = (key: DetailFormKey, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const disabled = !canEdit || isSaving;

  const previousInput = !isBulk && first ? pickPreviousInput(latestArchive.get(first.stationKey)) : {};
  const hasPrevious = Object.keys(previousInput).length > 0;
  const loadPrevious = () =>
    setForm((prev) => {
      const next = { ...prev };
      for (const key of PREVIOUS_INPUT_KEYS) {
        const value = previousInput[key];
        if (typeof value === "string") next[key] = value;
      }
      return next;
    });

  const handleSave = async () => {
    if (!canEdit || isSaving || patches.length === 0) return;
    setIsSaving(true);
    try {
      await onSave(patches);
    } finally {
      setIsSaving(false);
    }
  };

  const optionField = (
    key: DetailFormKey,
    list: OptionListKey,
    label: string,
  ) => (
    <OptionField
      key={key}
      label={label}
      value={form[key]}
      options={lists[list]}
      disabled={disabled}
      emptyLabel={isBulk ? "변경 안 함" : "(비움)"}
      onChange={(next) => setField(key, next)}
      onAddOption={(value) => add(list, value)}
    />
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !isSaving && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-3 overflow-y-auto p-5">
        <DialogTitle className="text-base">
          {isBulk ? `선택한 ${rows.length}건 일괄 적용` : `${first?.site ?? ""} 작업 상세`}
        </DialogTitle>
        <DialogDescription className="text-xs text-slate-400">
          {isBulk
            ? "채운 칸만 선택한 모든 국소에 적용합니다. 비워 둔 칸은 각 국소의 현재 값을 그대로 둡니다."
            : canEdit
              ? "바꾼 칸만 저장합니다. 지운 칸은 빈 값으로 저장됩니다."
              : "관리자만 수정할 수 있습니다."}
        </DialogDescription>

        {isBulk ? (
          <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            {optionField("workCategory", "workCategory", "작업구분(G)")}
            {optionField("workTime", "workTime", OPTION_LIST_LABELS.workTime)}
            {optionField("workType", "workType", OPTION_LIST_LABELS.workType)}
            {optionField("equipment", "equipment", OPTION_LIST_LABELS.equipment)}
            {optionField("workContent", "workContent", OPTION_LIST_LABELS.workContent)}
            <TextField
              label="작업내용 상세"
              value={form.workDetail}
              disabled={disabled}
              onChange={(next) => setField("workDetail", next)}
            />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={disabled || !hasPrevious}
                onClick={loadPrevious}
                className="h-8 border-slate-700 px-3 text-xs"
              >
                이전 입력 불러오기
              </Button>
              <span className="text-[11px] text-slate-400">
                {hasPrevious
                  ? "이전 누적의 작업시간·작업유형·중장비투입·작업내용·상세를 채웁니다. 저장해야 반영됩니다."
                  : "이 국소의 이전 누적이 없습니다."}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              {SINGLE_OPTION_FIELDS.map(({ key, list, label }) => optionField(key, list, label))}
              {SINGLE_TEXT_FIELDS.map(({ key, label }) => (
                <TextField
                  key={key}
                  label={label}
                  value={form[key]}
                  disabled={disabled}
                  onChange={(next) => setField(key, next)}
                />
              ))}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-800 pt-3 text-xs">
              <span className="text-slate-300">참조 열 덮어쓰기</span>
              <p className="text-[11px] text-slate-400">
                직접 쓰면 그 값이 우선합니다. 비우고 저장하면 덮어쓰기가 지워져 자동값(공정관리·누적·마커)으로 돌아갑니다.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {REF_FIELDS.map(({ key, label }) => (
                  <TextField
                    key={key}
                    label={label}
                    value={form[key]}
                    disabled={disabled}
                    onChange={(next) => setField(key, next)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={onClose}
            className="h-8 border-slate-700 text-xs text-slate-200"
          >
            닫기
          </Button>
          {canEdit ? (
            <Button
              type="button"
              disabled={isSaving || patches.length === 0}
              onClick={() => void handleSave()}
              className="h-8 bg-indigo-600 text-xs hover:bg-indigo-500"
            >
              {isSaving ? "저장 중…" : isBulk ? `${rows.length}건에 적용` : "저장"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

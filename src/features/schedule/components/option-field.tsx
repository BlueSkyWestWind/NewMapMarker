"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** 목록 값의 최대 길이(`schedule_option_lists.value`의 CHECK와 같다). */
const OPTION_VALUE_MAX_LENGTH = 100;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface OptionFieldProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
  /** 새 값을 목록(DB)에 더한다. 실패하면 던진다. */
  onAddOption: (value: string) => Promise<void>;
  disabled?: boolean;
  /** 값이 비었을 때 보이는 첫 항목 이름 */
  emptyLabel?: string;
}

/**
 * 목록에서 고르는 칸. 아래 `+ 새 값` 칸에 쓰고 `목록에 추가`를 누르면 목록에 더하고 바로 고른다.
 * 목록에 없는 현재 값(지워진 목록 값·옛 값)도 선택칸에 그대로 보인다.
 */
export function OptionField({
  label,
  value,
  options,
  onChange,
  onAddOption,
  disabled = false,
  emptyLabel = "(비움)",
}: OptionFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");

  const shown = value !== "" && !options.includes(value) ? [...options, value] : options;
  const trimmed = draft.trim();

  const handleAdd = async () => {
    if (trimmed === "" || adding || disabled) return;
    setNotice("");
    // 이미 목록에 있으면 더하지 않고 고르기만 한다.
    if (!options.includes(trimmed)) {
      setAdding(true);
      try {
        await onAddOption(trimmed);
      } catch (error) {
        setNotice(errorMessage(error));
        return;
      } finally {
        setAdding(false);
      }
    }
    onChange(trimmed);
    setDraft("");
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-slate-400">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full min-w-0 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">{emptyLabel}</option>
        {shown.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {disabled ? null : (
        <div className="flex items-center gap-1">
          <Input
            value={draft}
            aria-label={`${label} 새 값`}
            placeholder="+ 새 값"
            disabled={adding}
            maxLength={OPTION_VALUE_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void handleAdd();
            }}
            className="h-7 min-w-0 flex-1 border-slate-700 bg-slate-900 text-xs"
          />
          <Button
            type="button"
            variant="outline"
            disabled={trimmed === "" || adding}
            onClick={() => void handleAdd()}
            className="h-7 shrink-0 gap-1 border-slate-700 px-2 text-[11px]"
          >
            <Plus className="h-3 w-3" aria-hidden />
            목록에 추가
          </Button>
        </div>
      )}
      {notice ? <p className="text-[11px] text-rose-400">{notice}</p> : null}
    </div>
  );
}

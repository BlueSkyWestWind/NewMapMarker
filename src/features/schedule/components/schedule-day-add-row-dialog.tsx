"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { RefValues } from "@/features/schedule/lib/day-types";

const INPUT_CLASS = "h-8 border-slate-700 bg-slate-900 text-xs";
const MAX_LENGTH = 200;

interface ScheduleDayAddRowDialogProps {
  /** 이미 표에 있는 국소명이면 이유를 돌려주고, 아니면 `null` */
  checkSite: (site: string) => string | null;
  onClose: () => void;
  /** 성공하면 호출한 쪽이 창을 닫는다. 실패하면 던진다(창은 열려 있다). */
  onSubmit: (site: string, overrides: RefValues) => Promise<void>;
}

/**
 * 일일일정 표에 행을 직접 추가하는 창. 일정에 없거나 통합시설코드가 안 나오는 국소를 넣는다.
 * 국소명이 공정관리의 국소와 글자까지 같으면 나머지 참조 열은 자동으로 채워진다.
 * 여기서 쓴 코드·프로젝트는 그 값이 우선하며, 나머지 열은 행을 눌러 상세 창에서 채운다.
 */
export function ScheduleDayAddRowDialog({ checkSite, onClose, onSubmit }: ScheduleDayAddRowDialogProps) {
  const [site, setSite] = useState("");
  const [facilityCode, setFacilityCode] = useState("");
  const [project, setProject] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (isSaving) return;
    const name = site.trim();
    if (name === "") {
      setMessage("국소명을 입력하세요.");
      return;
    }
    const taken = checkSite(name);
    if (taken) {
      setMessage(taken);
      return;
    }
    const overrides: RefValues = {};
    if (facilityCode.trim() !== "") overrides.facilityCode = facilityCode.trim();
    if (project.trim() !== "") overrides.project = project.trim();
    setIsSaving(true);
    setMessage("");
    try {
      await onSubmit(name, overrides);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const field = (label: string, value: string, set: (next: string) => void, placeholder: string, autoFocus = false) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs">
      <span className="text-slate-400">{label}</span>
      <Input
        value={value}
        maxLength={MAX_LENGTH}
        disabled={isSaving}
        autoFocus={autoFocus}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => set(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void handleSubmit();
          }
        }}
        className={INPUT_CLASS}
      />
    </label>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !isSaving && onClose()}>
      <DialogContent className="flex max-w-md flex-col gap-3 p-5">
        <DialogTitle className="text-base">행 추가</DialogTitle>
        <DialogDescription className="text-xs text-slate-400">
          일정에 없거나 통합시설코드가 나오지 않는 국소를 이 날짜 표에 직접 추가합니다. 나머지 열은 추가한 뒤 행을
          눌러 채우세요.
        </DialogDescription>
        {field("국소명 (필수)", site, setSite, "국소명", true)}
        {field("통합시설코드", facilityCode, setFacilityCode, "비우면 공정관리 값(없으면 빈칸)")}
        {field("프로젝트", project, setProject, "비우면 공정관리 값(없으면 빈칸)")}
        {message ? <p className="text-xs text-rose-400">{message}</p> : null}
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
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSubmit()}
            className="h-8 bg-indigo-600 text-xs hover:bg-indigo-500"
          >
            {isSaving ? "추가 중…" : "추가"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

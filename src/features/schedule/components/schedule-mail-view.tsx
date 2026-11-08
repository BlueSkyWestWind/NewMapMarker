"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardCopy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { useDaySheet } from "@/features/schedule/hooks/use-day-sheet";
import { defaultDayDate } from "@/features/schedule/lib/day-rows";
import { buildMailText } from "@/features/schedule/lib/mail-text";
import { addDays, isValidIso } from "@/features/schedule/lib/week";
import { useToast } from "@/hooks/use-toast";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * 일정관리 > 메일양식. 일일일정(일자별) 표의 값으로 업무 메일에 붙여 넣는 텍스트를 만든다.
 * 팀 묶음별로 `[작업시간] [입회] [신호수] [중장비] 국소명 (작업내용 상세)` 줄이 이어진다.
 * 만든 글은 그 자리에서 고친 뒤 복사할 수 있다(날짜를 바꾸거나 일정이 바뀌면 다시 만든다).
 */
export function ScheduleMailView() {
  const { toast } = useToast();
  const [workDate, setWorkDate] = useState(() => defaultDayDate());
  const sheet = useDaySheet(workDate);
  const { rows } = sheet;
  const isReady = !sheet.isLoading && !sheet.error;

  const generated = useMemo(
    () =>
      buildMailText(
        workDate,
        rows.map((row) => ({ site: row.site, teams: row.teams ?? [], values: row.values })),
      ),
    [workDate, rows],
  );
  // 고친 글은 만든 글이 같은 동안만 유지한다.
  const [edit, setEdit] = useState<{ base: string; text: string } | null>(null);
  const text = edit && edit.base === generated ? edit.text : generated;

  const changeDate = (next: string) => {
    if (isValidIso(next) && next !== workDate) setWorkDate(next);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "메일 양식을 복사했습니다", description: `${rows.length}건` });
    } catch (error) {
      toast({ title: "복사하지 못했습니다", description: errorMessage(error), variant: "destructive" });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 border-slate-700"
          aria-label="이전 날"
          onClick={() => changeDate(addDays(workDate, -1))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <DatePicker ariaLabel="날짜 선택" value={workDate} onChange={changeDate} className="w-36" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 border-slate-700"
          aria-label="다음 날"
          onClick={() => changeDate(addDays(workDate, 1))}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 border-slate-700 px-3 text-xs"
          onClick={() => changeDate(defaultDayDate())}
        >
          내일
        </Button>
        <span className="whitespace-nowrap text-xs text-slate-300">{rows.length}건</span>
        <div className="ml-auto">
          <Button
            type="button"
            variant="outline"
            className="h-8 gap-1.5 border-slate-700 px-3 text-xs"
            disabled={!isReady || rows.length === 0}
            onClick={() => void handleCopy()}
          >
            <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
            복사
          </Button>
        </div>
      </div>

      {sheet.error ? (
        <p className="text-sm text-rose-400">일일일정을 불러오지 못했습니다. {errorMessage(sheet.error)}</p>
      ) : null}
      <p className="text-[11px] text-slate-400">
        일일일정(일자별) 값으로 만듭니다. 입회자·신호수·중장비·작업내용 상세는 일일일정에서 고치면 여기에 반영되고, 아래 글은 복사 전에 직접 고칠 수도 있습니다.
      </p>

      {sheet.isLoading ? (
        <p className="p-4 text-sm text-slate-400">불러오는 중...</p>
      ) : rows.length === 0 && !sheet.error ? (
        <p className="p-4 text-sm text-slate-400">이 날짜의 일정에 국소가 없습니다.</p>
      ) : (
        <textarea
          value={text}
          aria-label="메일 양식"
          spellCheck={false}
          onChange={(event) => setEdit({ base: generated, text: event.target.value })}
          className="min-h-0 flex-1 resize-none rounded-md border border-slate-700 bg-slate-900 p-3 font-mono text-sm leading-relaxed text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        />
      )}
    </div>
  );
}

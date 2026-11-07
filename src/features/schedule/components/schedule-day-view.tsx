"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardCopy, Download, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { useOptionLists } from "@/features/schedule/hooks/use-option-lists";
import { useDaySheet } from "@/features/schedule/hooks/use-day-sheet";
import { buildCopyText } from "@/features/schedule/lib/day-copy";
import { DAY_COLUMNS } from "@/features/schedule/lib/day-columns";
import { defaultDayDate } from "@/features/schedule/lib/day-rows";
import { downloadDayWorkbook } from "@/features/schedule/lib/write-day-workbook";
import { addDays, isValidIso } from "@/features/schedule/lib/week";
import { useToast } from "@/hooks/use-toast";

const TABLE_MISSING_MESSAGE =
  "DB에 일자별 상세 테이블이 없습니다. 마이그레이션(20261111000000_schedule_day_details.sql)을 Supabase에 적용해 주세요.";
const EMPTY_MESSAGE =
  "이 날짜의 일정에 국소가 없습니다. 먼저 주간 보기에서 일정을 입력하거나 일정표를 가져오세요.";

/** 체크 칸의 열 폭 비중(엑셀 열 폭의 문자 수 단위) */
const CHECK_WIDTH_WEIGHT = 4;
const TOTAL_WEIGHT = DAY_COLUMNS.reduce((sum, column) => sum + column.widthChars, CHECK_WIDTH_WEIGHT);
const widthPercent = (weight: number) => `${(weight / TOTAL_WEIGHT) * 100}%`;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface ScheduleDayViewProps {
  /** 관리자만 true: 누적 저장을 한다 */
  canEdit: boolean;
}

/**
 * 시설일정 > 일자별. 날짜 하나의 국소별 24열 상세표(조회·복사·엑셀).
 * 표 셀은 줄바꿈 없이 말줄임으로 보이고(전체 글은 툴팁), 가로 스크롤은 쓰지 않는다.
 */
export function ScheduleDayView({ canEdit }: ScheduleDayViewProps) {
  const { toast } = useToast();
  const [workDate, setWorkDate] = useState(() => defaultDayDate());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const sheet = useDaySheet(workDate);
  const { lists } = useOptionLists();
  const { rows } = sheet;

  const isEmpty = rows.length === 0;
  // 상세·참조 값이 아직 오는 중이거나 불러오기에 실패하면 행이 비어 있으므로 복사·내려받기·누적 저장을 막는다.
  const canAct = !isEmpty && !sheet.isLoading && !sheet.error;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const selectedCount = useMemo(
    () => rows.filter((row) => selected.has(row.stationKey)).length,
    [rows, selected],
  );
  const missingRefCount = useMemo(() => rows.filter((row) => row.refSource === null).length, [rows]);

  const changeDate = (next: string) => {
    if (!isValidIso(next) || next === workDate) return;
    setWorkDate(next);
    setSelected(new Set());
  };

  const toggleRow = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleAll = () =>
    setSelected(selectedCount === rows.length ? new Set() : new Set(rows.map((row) => row.stationKey)));

  /** 저장·복사·내려받기를 하나씩만 돌린다. 끝나기 전의 두 번째 클릭은 무시한다. */
  const runExclusive = async (action: () => Promise<void>) => {
    // 불러오는 중이거나 실패한 표는 상세·참조 값이 비어 있어 누적을 빈 값으로 덮을 수 있다.
    if (!canAct || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** 복사·내려받기 뒤에 누적에 저장한다(관리자만). 저장이 실패해도 이미 한 복사·내려받기는 그대로다. */
  const archiveAfterExport = async () => {
    if (!canEdit) return;
    try {
      await sheet.saveArchive();
    } catch (error) {
      toast({
        title: "누적 저장에 실패했습니다",
        description: errorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleCopy = () =>
    runExclusive(async () => {
      const text = buildCopyText(rows.map((row) => row.values));
      const count = rows.length;
      // 브라우저의 사용자 동작 인정(Safari 클립보드)이 끊기지 않도록 복사를 먼저 한다.
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: "표를 복사했습니다", description: `${count}건을 엑셀에 붙여 넣을 수 있습니다.` });
      } catch (error) {
        toast({ title: "복사하지 못했습니다", description: errorMessage(error), variant: "destructive" });
      }
      await archiveAfterExport();
    });

  const handleDownload = () =>
    runExclusive(async () => {
      const values = rows.map((row) => row.values);
      try {
        await downloadDayWorkbook(workDate, values, lists);
      } catch (error) {
        toast({ title: "내려받지 못했습니다", description: errorMessage(error), variant: "destructive" });
      }
      await archiveAfterExport();
    });

  const handleArchive = () =>
    runExclusive(async () => {
      try {
        await sheet.saveArchive();
        toast({ title: "누적에 저장했습니다", description: `${workDate} ${rows.length}건` });
      } catch (error) {
        toast({
          title: "누적 저장에 실패했습니다",
          description: errorMessage(error),
          variant: "destructive",
        });
      }
    });

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
        <span className="whitespace-nowrap text-xs text-slate-300">
          {rows.length}건 · 선택 {selectedCount}건
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-8 gap-1.5 border-slate-700 px-3 text-xs"
            disabled={!canAct || busy}
            onClick={() => void handleCopy()}
          >
            <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
            표 복사
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 gap-1.5 border-slate-700 px-3 text-xs"
            disabled={!canAct || busy}
            onClick={() => void handleDownload()}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            엑셀 내려받기
          </Button>
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 gap-1.5 border-slate-700 px-3 text-xs"
              disabled={!canAct || busy}
              onClick={() => void handleArchive()}
            >
              <Save className="h-3.5 w-3.5" aria-hidden />
              누적 저장
            </Button>
          ) : null}
        </div>
      </div>

      {sheet.isTableMissing ? <p className="text-sm text-amber-400">{TABLE_MISSING_MESSAGE}</p> : null}
      {sheet.error ? (
        <p className="text-sm text-rose-400">
          일자별 상세를 불러오지 못했습니다. {errorMessage(sheet.error)}
        </p>
      ) : null}
      {missingRefCount > 0 ? (
        <p className="text-xs text-amber-400">공정관리 정보가 없는 국소 {missingRefCount}건</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {isEmpty ? (
          <p className="p-4 text-sm text-slate-400">
            {sheet.isLoading ? "불러오는 중..." : sheet.error ? "" : EMPTY_MESSAGE}
          </p>
        ) : (
          <table className="w-full table-fixed border-collapse text-xs text-slate-100">
            <colgroup>
              <col style={{ width: widthPercent(CHECK_WIDTH_WEIGHT) }} />
              {DAY_COLUMNS.map((column) => (
                <col key={column.key} style={{ width: widthPercent(column.widthChars) }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-900">
              <tr>
                <th className="border border-slate-700 px-1 py-1 text-center">
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={selectedCount === rows.length}
                    ref={(element) => {
                      if (element) element.indeterminate = selectedCount > 0 && selectedCount < rows.length;
                    }}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-indigo-500"
                  />
                </th>
                {DAY_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    title={column.header}
                    className="truncate whitespace-nowrap border border-slate-700 px-1 py-1 text-center font-semibold"
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.stationKey}
                  className={cn(selected.has(row.stationKey) && "bg-indigo-950/40")}
                >
                  <td className="border border-slate-700 px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${row.site} 선택`}
                      checked={selected.has(row.stationKey)}
                      onChange={() => toggleRow(row.stationKey)}
                      className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-indigo-500"
                    />
                  </td>
                  {DAY_COLUMNS.map((column) => {
                    const value = row.values[column.key];
                    return (
                      <td
                        key={column.key}
                        title={value}
                        className={cn(
                          "truncate whitespace-nowrap border border-slate-700 px-1.5 py-1",
                          column.kind === "ref" && row.refSource === null && "text-slate-500",
                        )}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

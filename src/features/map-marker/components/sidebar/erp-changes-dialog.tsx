"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StagedErpRow } from "@/features/map-marker/types/marker";
import { ERP_REVIEW_DIALOG_MAX_WIDTH_PX } from "@/features/shell/constants";

interface ErpChangesDialogProps {
  /** update: 기존 건 갱신, add: 추가 사업 반영 */
  mode: "update" | "add";
  rows: StagedErpRow[];
  isUploading: boolean;
  /** [적용]을 누르면 실제로 DB에 저장하는 동작. 창은 호출하는 쪽이 닫는다 */
  onApply: () => void;
  /** 아무것도 바꾸지 않고 닫는다 */
  onClose: () => void;
}

const HEAD = "whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-medium text-slate-400";
const CELL = "whitespace-nowrap px-2 py-1.5 align-middle text-xs";

/** 반영하기 전에 어떤 행의 무엇이 바뀌는지 보여 주고, 적용할지 사용자가 정한다. */
export function ErpChangesDialog({
  mode,
  rows,
  isUploading,
  onApply,
  onClose,
}: ErpChangesDialogProps) {
  const isUpdate = mode === "update";
  const changedCount = rows.filter((row) => (row.preview?.changes.length ?? 0) > 0).length;
  const [onlyChanged, setOnlyChanged] = useState(true);
  const shown = isUpdate && onlyChanged
    ? rows.filter((row) => (row.preview?.changes.length ?? 0) > 0)
    : rows;
  const warningCount = rows.filter((row) => row.preview?.warning).length;
  // 갱신인데 바뀌는 칸이 하나도 없으면 적용해도 달라지는 게 없다.
  const nothingToApply = isUpdate && changedCount === 0;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        className="flex h-[85vh] w-[96vw] flex-col gap-3 overflow-hidden p-4"
        style={{ maxWidth: ERP_REVIEW_DIALOG_MAX_WIDTH_PX }}
      >
        <div className="space-y-1 pr-8">
          <DialogTitle className="whitespace-nowrap text-base">
            {isUpdate ? `기존 ${rows.length}건 갱신` : `추가 사업 ${rows.length}건 반영`} · 변경 내용 확인
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {isUpdate
              ? `국소명과 상세 정보를 파일 값으로 바꿉니다. 위치·메모·태그·색상·담당팀·주소는 유지됩니다. 변경 있음 ${changedCount}건 · 변경 없음 ${rows.length - changedCount}건`
              : "같은 통합시설코드·사업연도인데 프로젝트코드가 다른 사업입니다. 마커와 기존 상세 행은 바뀌지 않고, 아래 값이 연관 상세 장비 목록에 새 행으로 추가됩니다."}
          </DialogDescription>
          {warningCount > 0 ? (
            <p className="flex items-center gap-1 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              시설 상태가 바뀔 수 있는 건이 {warningCount}건 있습니다. 표의 주의 칸을 확인하세요.
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {isUpdate ? (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
              <input
                type="checkbox"
                className="accent-sky-500"
                checked={onlyChanged}
                onChange={(event) => setOnlyChanged(event.target.checked)}
              />
              변경 있는 건만 보기
            </label>
          ) : null}
          <span className="text-xs text-slate-500">표시 {shown.length}건</span>
        </div>

        {nothingToApply ? (
          <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-4 py-6 text-center">
            <p className="text-sm font-medium text-emerald-200">바뀌는 내용이 없습니다</p>
            <p className="mt-1 text-xs text-slate-400">
              파일의 {rows.length}건이 DB의 현재 값(국소명·프로젝트코드·사업연도·사업구분·장비타입·시설일·개통일)과
              모두 같습니다. 적용할 필요가 없습니다.
            </p>
          </div>
        ) : null}

        <div
          className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded border border-slate-800 ${
            nothingToApply ? "hidden" : ""
          }`}
        >
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col style={{ width: "30%" }} />
              <col />
              {!isUpdate ? <col style={{ width: "28%" }} /> : null}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-950">
              <tr>
                <th className={HEAD}>국소명</th>
                <th className={HEAD}>{isUpdate ? "바뀌는 내용 (이전 → 이후)" : "새로 추가되는 상세 행"}</th>
                {!isUpdate ? <th className={HEAD}>주의</th> : null}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => {
                const preview = row.preview;
                const changes = preview?.changes ?? [];
                const summary = changes
                  .map((change) =>
                    isUpdate
                      ? `${change.label}: ${change.before || "빈 값"} → ${change.after || "빈 값"}`
                      : `${change.label}: ${change.after}`,
                  )
                  .join("  ·  ");
                return (
                  <tr
                    key={`${row.id}:${index}`}
                    className="border-b border-slate-800/80 hover:bg-slate-800/30"
                  >
                    <td
                      className={`${CELL} truncate font-medium text-amber-200`}
                      title={preview?.currentName || row.name}
                    >
                      {preview?.currentName || row.name || "이름 없음"}
                    </td>
                    <td
                      className={`${CELL} truncate ${changes.length === 0 ? "text-slate-500" : "text-slate-200"}`}
                      title={summary}
                    >
                      {changes.length === 0 ? "변경 없음" : summary}
                    </td>
                    {!isUpdate ? (
                      <td
                        className={`${CELL} truncate text-amber-300`}
                        title={preview?.warning ?? ""}
                      >
                        {preview?.warning || ""}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-8 border-slate-600 text-xs text-slate-200"
            onClick={onClose}
            title="아무것도 바꾸지 않고 닫습니다"
          >
            닫기 (적용 안 함)
          </Button>
          <Button
            type="button"
            className="h-8 bg-indigo-600 text-xs hover:bg-indigo-500"
            disabled={isUploading || rows.length === 0 || nothingToApply}
            onClick={onApply}
          >
            {nothingToApply
              ? "적용할 내용 없음"
              : isUpdate
                ? `${rows.length}건 갱신 적용`
                : `${rows.length}건 추가 적용`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

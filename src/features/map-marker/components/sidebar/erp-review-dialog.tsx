"use client";

import { Fragment } from "react";
import { AlertTriangle, Check, Eye, Link2, MapPin, Trash2, Unlink2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ErpReviewGroups } from "@/features/map-marker/hooks/use-erp-review-groups";
import type { StagedErpRow } from "@/features/map-marker/types/marker";
import { ERP_REVIEW_DIALOG_MAX_WIDTH_PX } from "@/features/shell/constants";

export interface AddressMismatch {
  id: string;
  lat: number;
  lng: number;
  actualAddress: string | null;
}

interface ErpReviewDialogProps {
  rows: StagedErpRow[];
  groups: ErpReviewGroups;
  isUploading: boolean;
  hasPosition: (id: string) => boolean;
  warningOf: (row: StagedErpRow) => AddressMismatch | null;
  onConfirm: (id: string, force?: boolean) => void;
  onExclude: (id: string) => void;
  /** 지도에서 위치를 보려고 창을 닫는다 */
  onLocate: (id: string) => void;
  /** 지도에서 찍으려고 창을 닫는다 */
  onPlace: (id: string) => void;
  onClose: () => void;
}

const HEAD = "whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-medium text-slate-400";
const CELL = "whitespace-nowrap px-2 py-1 align-middle text-xs";

/** 위치등록 확인 목록을 넓은 표로 보여 준다. 국소명·주소가 잘리지 않는다. */
export function ErpReviewDialog({
  rows,
  groups,
  isUploading,
  hasPosition,
  warningOf,
  onConfirm,
  onExclude,
  onLocate,
  onPlace,
  onClose,
}: ErpReviewDialogProps) {
  const allChecked = rows.length > 0 && rows.every((row) => groups.checked.has(row.id));

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        className="flex h-[90vh] w-[96vw] flex-col gap-3 overflow-hidden p-4"
        style={{ maxWidth: ERP_REVIEW_DIALOG_MAX_WIDTH_PX }}
      >
        <div className="flex items-center gap-3 pr-8">
          <DialogTitle className="shrink-0 whitespace-nowrap text-base">
            위치등록 확인
          </DialogTitle>
          <DialogDescription className="min-w-0 flex-1 truncate text-xs text-slate-400">
            확인 대기 {rows.length}건 · 같은 지번의 여러 단지는 행을 체크하고 대표를 고른 뒤
            묶으세요. 나머지 체크한 행은 SUB가 됩니다.
          </DialogDescription>
          <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">
            선택 {groups.checkedIds.length}건
          </span>
          <Button
            type="button"
            size="sm"
            className="h-7 shrink-0 whitespace-nowrap bg-sky-600 px-2 text-xs hover:bg-sky-500"
            disabled={isUploading || groups.checkedIds.length < 2 || !groups.activeRepId}
            onClick={groups.group}
            title={
              groups.activeRepId
                ? "체크한 행을 대표 1개 + SUB로 묶습니다"
                : "대표로 둘 행을 먼저 고르세요"
            }
          >
            <Link2 className="mr-1 h-3 w-3" />
            그룹으로 묶기
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 whitespace-nowrap border-slate-600 px-2 text-xs text-slate-200"
            disabled={isUploading || !groups.hasCheckedGroup}
            onClick={groups.ungroup}
            title="체크한 행이 속한 그룹을 통째로 풉니다"
          >
            <Unlink2 className="mr-1 h-3 w-3" />
            그룹 해제
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-sm border border-slate-800">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col style={{ width: 32 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: "42%" }} />
              <col />
              <col style={{ width: 260 }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-950">
              <tr>
                <th className={HEAD}>
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    className="accent-sky-500"
                    checked={allChecked}
                    disabled={isUploading || rows.length === 0}
                    onChange={(event) => groups.toggleAll(event.target.checked)}
                  />
                </th>
                <th className={HEAD}>묶음</th>
                <th className={HEAD}>대표</th>
                <th className={HEAD}>국소명</th>
                <th className={HEAD}>주소</th>
                <th className={HEAD}>작업</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const warning = warningOf(row);
                const checkedRow = groups.checked.has(row.id);
                const name = `${row.name || "이름 없음"}${
                  row.kind === "missingCoords" ? " (기존·좌표 없음)" : ""
                }`;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={`border-b border-l-2 border-slate-800/80 hover:bg-slate-800/30 ${groups.barClassOf(row)}`}
                    >
                      <td className={CELL}>
                        <input
                          type="checkbox"
                          className="accent-sky-500"
                          checked={checkedRow}
                          disabled={isUploading}
                          onChange={() => groups.toggleChecked(row.id)}
                          aria-label={`${name} 묶기 선택`}
                        />
                      </td>
                      <td className={`${CELL} text-sky-300`}>
                        {row.group
                          ? `묶음 ${groups.groupNumbers.get(row.group.key)} · ${row.group.role}`
                          : ""}
                      </td>
                      <td className={CELL}>
                        {checkedRow ? (
                          <input
                            type="radio"
                            name="erp-group-rep-dialog"
                            className="accent-sky-500"
                            checked={groups.activeRepId === row.id}
                            disabled={isUploading}
                            onChange={() => groups.setRepId(row.id)}
                            aria-label={`${name} 대표로 지정`}
                          />
                        ) : null}
                      </td>
                      <td className={`${CELL} truncate font-semibold text-amber-200`} title={name}>
                        {name}
                      </td>
                      <td className={`${CELL} truncate text-slate-300`} title={row.address}>
                        {row.address || "주소 없음"}
                      </td>
                      <td className={CELL}>
                        <div className="flex items-center gap-1">
                          {hasPosition(row.id) ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1.5 text-[11px] text-slate-300"
                                onClick={() => onLocate(row.id)}
                                title="창을 닫고 지도에서 위치를 봅니다"
                              >
                                <Eye className="mr-0.5 h-3.5 w-3.5" />
                                위치
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1.5 text-[11px] text-slate-300"
                                disabled={isUploading}
                                onClick={() => onPlace(row.id)}
                                title={
                                  row.group
                                    ? "창을 닫고 지도를 클릭해 이 묶음 전체의 위치를 지정합니다"
                                    : "창을 닫고 지도를 클릭해 위치를 지정합니다"
                                }
                              >
                                <MapPin className="mr-0.5 h-3 w-3" />
                                지정
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-6 bg-amber-600 px-2 text-[11px] hover:bg-amber-500"
                                disabled={isUploading}
                                onClick={() => onConfirm(row.id)}
                                title="위치 주소를 엑셀 주소와 비교한 뒤 저장합니다"
                              >
                                <Check className="mr-0.5 h-3 w-3" />
                                확인
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 border-amber-500/40 px-2 text-[11px] text-amber-300"
                              disabled={isUploading}
                              onClick={() => onPlace(row.id)}
                              title="창을 닫고 지도에서 위치를 찍습니다"
                            >
                              <MapPin className="mr-0.5 h-3 w-3" />
                              지도에서 찍기
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                            disabled={isUploading}
                            onClick={() => onExclude(row.id)}
                            title="이 항목 제외"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {warning ? (
                      <tr className="border-b border-slate-800/80 bg-amber-500/10">
                        <td colSpan={6} className="px-3 py-1.5 text-xs text-slate-200">
                          <div className="flex items-center gap-3">
                            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-amber-300">
                              <AlertTriangle className="h-3 w-3" />
                              주소가 다릅니다. 저장하지 않았습니다.
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              엑셀: {row.address || "주소 없음"} · 마커 위치:{" "}
                              {warning.actualAddress ?? "주소를 찾을 수 없음"}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 shrink-0 whitespace-nowrap border-amber-500/40 text-[11px] text-amber-200"
                              disabled={isUploading}
                              onClick={() => onConfirm(row.id, true)}
                            >
                              이 위치로 저장
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Camera, Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_MAP_LEVEL } from "@/features/map-marker/constants/map-config";
import {
  MAX_RECOMMENDED_CAPTURE_TILES,
  type CaptureGridPlan,
} from "@/features/map-marker/lib/map-capture-stitch";

export type CapturePhase = "preview" | "capturing" | "done" | "error";

export interface CapturePanelViewProps {
  onClose: () => void;
  onReselectRegion: () => void;
  phase: CapturePhase;
  captureLevel: number;
  currentMapLevel: number;
  isLevelMismatch: boolean;
  levelOptions: number[];
  onLevelChange: (value: string) => void;
  overlapPercent: number;
  onOverlapChange: (value: string) => void;
  includeInfoWindows: boolean;
  onToggleInfoWindows: (checked: boolean) => void;
  markersInBoundsCount: number;
  isBusy: boolean;
  isPreparing: boolean;
  gridPlan: CaptureGridPlan | null;
  tileCount: number;
  activeTileCount: number;
  excludedCount: number;
  isOverRecommended: boolean;
  progressCurrent: number;
  progressTotal: number;
  progressRatio: number;
  capturedTilesCount: number;
  hasStitched: boolean;
  previewUrl: string | null;
  errorMessage: string;
  onStartCapture: () => void;
  onCancelCapture: () => void;
  onDownloadZip: () => void;
  onDownloadPng: () => void;
}

/**
 * 영역 격자 캡처 패널의 프레젠테이션(렌더) 부분.
 * 로직·상태는 map-region-capture-panel.tsx가 소유하고, 이 컴포넌트는 표시만 담당한다.
 */
export function CapturePanelView({
  onClose,
  onReselectRegion,
  phase,
  captureLevel,
  currentMapLevel,
  isLevelMismatch,
  levelOptions,
  onLevelChange,
  overlapPercent,
  onOverlapChange,
  includeInfoWindows,
  onToggleInfoWindows,
  markersInBoundsCount,
  isBusy,
  isPreparing,
  gridPlan,
  tileCount,
  activeTileCount,
  excludedCount,
  isOverRecommended,
  progressCurrent,
  progressTotal,
  progressRatio,
  capturedTilesCount,
  hasStitched,
  previewUrl,
  errorMessage,
  onStartCapture,
  onCancelCapture,
  onDownloadZip,
  onDownloadPng,
}: CapturePanelViewProps) {
  return (
    <div
      /*
       * 지도 컨테이너 기준 절대배치다 — 좌측 셸 폭을 더하면 안 된다(지도 안쪽으로 밀린다).
       * 대신 좁은 화면에서 지도를 다 덮지 않도록 폭에 상한을 둔다.
       */
      className="absolute left-4 top-4 z-20 max-h-[calc(100%-2rem)] w-[min(var(--panel-w),calc(100%-2rem))] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/95 p-4 text-slate-100 shadow-xl"
      data-capture-hide="true"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Camera className="h-4 w-4 text-sky-400" />
            영역 격자 캡처
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            캡처 레벨·격자를 확인한 뒤{" "}
            <span className="text-sky-300">캡처 시작</span>을 누르면 자동으로
            촬영·합성합니다.
          </p>
        </div>
        <button
          type="button"
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          onClick={onClose}
          title="닫기"
          disabled={phase === "capturing"}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3 space-y-1">
        <Label className="text-[11px] text-slate-400">캡처 레벨</Label>
        <Select
          value={String(captureLevel)}
          onValueChange={onLevelChange}
          disabled={isBusy}
        >
          <SelectTrigger className="h-8 border-slate-600 bg-slate-800 text-slate-100">
            <SelectValue placeholder="레벨" />
          </SelectTrigger>
          <SelectContent className="border-slate-600 bg-slate-800 text-slate-100">
            {levelOptions.map((level) => (
              <SelectItem
                key={level}
                value={String(level)}
                className="text-slate-100 focus:bg-slate-700 focus:text-slate-100"
              >
                Lv {level}
                {level === 0
                  ? " (최대 확대)"
                  : level === MAX_MAP_LEVEL
                    ? " (최대 축소)"
                    : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isLevelMismatch ? (
          <p className="text-[11px] text-amber-300">
            현재 지도 Lv {currentMapLevel} · 캡처 Lv {captureLevel}
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">숫자가 작을수록 확대됩니다.</p>
        )}
      </div>

      <div className="mb-3 space-y-1">
        <Label className="text-[11px] text-slate-400">겹침 %</Label>
        <Input
          type="number"
          min={0}
          max={40}
          value={overlapPercent}
          disabled={isBusy}
          onChange={(event) => onOverlapChange(event.target.value)}
          className="h-8 border-slate-600 bg-slate-800 text-slate-100"
        />
      </div>

      <label className="mb-3 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-300">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={includeInfoWindows}
          disabled={isBusy}
          onChange={(event) => onToggleInfoWindows(event.target.checked)}
        />
        <span>
          범위 내 마커 정보창 포함
          <span className="mt-0.5 block text-slate-500">
            현재 범위 {markersInBoundsCount}개
            {includeInfoWindows
              ? " · 화면 안에 맞게 정보창을 배치해 촬영합니다"
              : ""}
          </span>
        </span>
      </label>

      <div className="mb-3 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-xs text-slate-300">
        {isPreparing ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            격자 계산 중...
          </span>
        ) : gridPlan ? (
          <>
            캡처 격자 {gridPlan.rows} × {gridPlan.cols} (
            {excludedCount > 0 ? `${activeTileCount}/${tileCount}` : tileCount}장)
            <span className="mt-0.5 block text-slate-500">
              출력 약 {gridPlan.outputWidth}×{gridPlan.outputHeight}px
            </span>
            <span className="mt-0.5 block text-slate-500">
              {excludedCount > 0
                ? `격자 ${excludedCount}칸 제외됨 · 지도의 칸을 클릭해 조정하세요`
                : "격자 좌상단 번호를 클릭하면 해당 칸을 캡처에서 제외합니다"}
            </span>
          </>
        ) : (
          "격자 정보를 준비하지 못했습니다."
        )}
        {isOverRecommended ? (
          <span className="mt-1 block text-amber-300">
            권장({MAX_RECOMMENDED_CAPTURE_TILES}장)을 넘습니다. 레벨을 키우거나
            범위를 줄이세요.
          </span>
        ) : null}
      </div>

      <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
        <span>
          {phase === "capturing"
            ? `촬영 중 ${progressCurrent}/${progressTotal}`
            : phase === "done"
              ? `완료 ${capturedTilesCount}장`
              : "미리보기"}
        </span>
        <button
          type="button"
          className="text-sky-300 hover:text-sky-200 disabled:opacity-40"
          disabled={isBusy}
          onClick={onReselectRegion}
        >
          범위 다시 지정
        </button>
      </div>

      {phase === "capturing" ? (
        <div className="mb-3 space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-sky-500 transition-all"
              style={{ width: `${progressRatio}%` }}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={onCancelCapture}
          >
            캡처 취소
          </Button>
        </div>
      ) : (
        <div className="mb-3 flex flex-col gap-2">
          <Button
            type="button"
            className="bg-sky-600 hover:bg-sky-500"
            disabled={!gridPlan || isBusy || activeTileCount === 0}
            onClick={onStartCapture}
          >
            {isPreparing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                준비 중...
              </>
            ) : (
              <>
                <Camera className="mr-2 h-4 w-4" />
                캡처 시작
              </>
            )}
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-slate-600 bg-transparent"
              disabled={capturedTilesCount === 0}
              onClick={onDownloadZip}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              타일 ZIP
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-500"
              disabled={!hasStitched}
              onClick={onDownloadPng}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              합성 PNG
            </Button>
          </div>
        </div>
      )}

      {previewUrl ? (
        <div className="mb-2 overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="이어붙인 미리보기"
            className="max-h-48 w-full object-contain"
          />
        </div>
      ) : null}

      {errorMessage ? (
        <p className="text-xs text-rose-300">{errorMessage}</p>
      ) : null}
    </div>
  );
}

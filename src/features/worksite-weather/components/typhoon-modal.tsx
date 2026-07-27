"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ExternalLink,
  GripHorizontal,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Wind,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TyphoonInfo } from "@/features/worksite-weather/types/weather";

interface TyphoonModalProps {
  isOpen: boolean;
  onClose: () => void;
  typhoon: TyphoonInfo | null;
}

type TyphoonTab = "windy" | "typ_map" | "typ_info" | "safety_guide";

/**
 * 기상청 태풍정보 페이지.
 *
 * 날씨누리는 2021년 이후 `www.weather.go.kr/w/` 로 시작하는 페이지만 운영한다.
 * 이전에 쓰던 `/w/weather/typhoon/typ-status.do`는 `/w/`로 시작하는데도
 * 실제로는 서비스되지 않아 "서비스 이용에 불편을 드려 죄송합니다" 안내 페이지가 떴다.
 * 링크를 바꿀 때는 응답 본문에 그 문구가 없는지까지 확인할 것 — 오류 페이지도 200을 반환한다.
 */
const KMA_TYPHOON_URL = "https://www.weather.go.kr/w/typhoon/ko/weather/typhoon_02.jsp";

const MIN_SIZE = { width: 500, height: 380 };

function getLargeDefaultSize() {
  if (typeof window === "undefined") return { width: 1400, height: 900 };
  const targetW = Math.min(1800, Math.floor(window.innerWidth * 0.96));
  const targetH = Math.min(1080, Math.floor(window.innerHeight * 0.98));
  return {
    width: Math.max(900, targetW),
    height: Math.max(650, targetH),
  };
}

export function TyphoonModal({ isOpen, onClose, typhoon }: TyphoonModalProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TyphoonTab>("windy");
  const [refreshKey, setRefreshKey] = useState(Date.now());
  const [isMaximized, setIsMaximized] = useState(false);

  const [position, setPosition] = useState({ x: 40, y: 10 });
  const [size, setSize] = useState({ width: 1400, height: 900 });

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const resizeStartRef = useRef<{
    w: number;
    h: number;
    x: number;
    y: number;
  }>({ w: 0, h: 0, x: 0, y: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen && typeof window !== "undefined") {
      const initSize = getLargeDefaultSize();
      const initX = Math.max(0, Math.floor((window.innerWidth - initSize.width) / 2));
      const initY = 0;
      setPosition({ x: initX, y: initY });
      setSize(initSize);
      setIsMaximized(false);
    }
  }, [isOpen]);

  const handleRefresh = () => {
    setRefreshKey(Date.now());
  };

  const resetPositionAndSize = () => {
    if (typeof window !== "undefined") {
      const initSize = getLargeDefaultSize();
      const initX = Math.max(0, Math.floor((window.innerWidth - initSize.width) / 2));
      const initY = 0;
      setPosition({ x: initX, y: initY });
      setSize(initSize);
      setIsMaximized(false);
    }
  };

  const getSourceUrl = () => {
    return `${KMA_TYPHOON_URL}?t=${refreshKey}`;
  };

  const getWindyUrl = () => {
    return `https://embed.windy.com/embed2.html?lat=34.0&lon=127.5&zoom=5&level=surface&overlay=wind&product=ecmwf&menu=&message=true&marker=&calendar=now&pressure=true&type=map&location=coordinates&detail=&metricWind=m%2Fs&metricTemp=%C2%B0C&radarRange=-1&t=${refreshKey}`;
  };

  // 드래그 핸들러
  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    if (isMaximized) return;
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("a")) {
      return;
    }
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleHeaderPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || isMaximized) return;
      const newX = Math.max(-size.width + 100, Math.min(window.innerWidth - 100, e.clientX - dragStartRef.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragStartRef.current.y));
      setPosition({ x: newX, y: newY });
    },
    [isDragging, isMaximized, size.width],
  );

  const handleHeaderPointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  // 리사이즈 핸들러
  const handleResizePointerDown = (e: React.PointerEvent) => {
    if (isMaximized) return;
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      w: size.width,
      h: size.height,
      x: e.clientX,
      y: e.clientY,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isResizing || isMaximized) return;
      const deltaX = e.clientX - resizeStartRef.current.x;
      const deltaY = e.clientY - resizeStartRef.current.y;
      const newW = Math.max(MIN_SIZE.width, resizeStartRef.current.w + deltaX);
      const newH = Math.max(MIN_SIZE.height, resizeStartRef.current.h + deltaY);
      setSize({ width: newW, height: newH });
    },
    [isResizing, isMaximized],
  );

  const handleResizePointerUp = (e: React.PointerEvent) => {
    if (isResizing) {
      setIsResizing(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] pointer-events-none select-none"
      aria-label="태풍 기상 정보 레이어"
    >
      <div
        style={
          isMaximized
            ? { top: 0, left: 0, right: 0, bottom: 0 }
            : {
                top: `${position.y}px`,
                left: `${position.x}px`,
                width: `${size.width}px`,
                height: `${size.height}px`,
              }
        }
        className="pointer-events-auto absolute flex flex-col rounded-xl border border-rose-700/80 bg-slate-950/95 shadow-2xl backdrop-blur-md transition-shadow duration-150"
      >
        {/* 헤더 바 */}
        <div
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
          className="flex cursor-move items-center justify-between border-b border-rose-900/60 bg-rose-950/80 px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="h-4 w-4 text-rose-400" />
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-rose-500/40 bg-rose-900/40 text-rose-300">
              <span className="text-base" aria-hidden>🌀</span>
            </div>
            <div>
              <h3 className="text-xs font-bold text-rose-100 flex items-center gap-2">
                기상청 실시간 태풍 기상 정보
                {typhoon ? (
                  <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    태풍{typhoon.alertLevel} 발효
                  </span>
                ) : (
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                    실시간 태풍 감시
                  </span>
                )}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-rose-300 hover:bg-rose-900/60 hover:text-white"
              onClick={handleRefresh}
              title="새로고침"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-rose-300 hover:bg-rose-900/60 hover:text-white"
              onClick={resetPositionAndSize}
              title="위치/크기 리셋"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-rose-300 hover:bg-rose-900/60 hover:text-white"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? "원래 크기로" : "최대화"}
            >
              {isMaximized ? (
                <Minimize2 className="h-3 w-3" />
              ) : (
                <Maximize2 className="h-3 w-3" />
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-rose-300 hover:bg-rose-900/60 hover:text-white"
              onClick={onClose}
              title="닫기"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex items-center justify-between border-b border-rose-900/40 bg-slate-900/60 px-2 py-1">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-6 px-2.5 text-[11px] font-medium ${
                activeTab === "windy"
                  ? "border border-sky-500/50 bg-sky-950/70 font-semibold text-sky-200"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
              onClick={() => setActiveTab("windy")}
            >
              🌐 Windy 실시간 태풍/바람 추적
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-6 px-2.5 text-[11px] font-medium ${
                activeTab === "typ_map"
                  ? "border border-rose-500/50 bg-rose-950/70 font-semibold text-rose-200"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
              onClick={() => setActiveTab("typ_map")}
            >
              🌀 기상청 태풍 진로도
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-6 px-2.5 text-[11px] font-medium ${
                activeTab === "typ_info"
                  ? "border border-rose-500/50 bg-rose-950/70 font-semibold text-rose-200"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
              onClick={() => setActiveTab("typ_info")}
            >
              📊 태풍 상세 통보문
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-6 px-2.5 text-[11px] font-medium ${
                activeTab === "safety_guide"
                  ? "border border-amber-500/50 bg-amber-950/70 font-semibold text-amber-200"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
              onClick={() => setActiveTab("safety_guide")}
            >
              🛡️ 태풍 작업 안전수칙
            </Button>
          </div>

          <a
            href={
              activeTab === "windy" ? "https://www.windy.com" : KMA_TYPHOON_URL
            }
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-1.5 text-[10px] text-rose-300 hover:underline"
          >
            {activeTab === "windy" ? "Windy 원본 ↗" : "기상청 원본 ↗"}
          </a>
        </div>

        {/* 탭 내용 영역 */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black/70 p-2">
          {(isDragging || isResizing) && (
            <div className="absolute inset-0 z-10 bg-transparent" />
          )}

          {activeTab === "windy" ? (
            <iframe
              key={`windy-${refreshKey}`}
              src={getWindyUrl()}
              className="h-full w-full rounded border-0"
              title="Windy 실시간 태풍 및 바람 회오리 추적 지도"
              allow="geolocation"
            />
          ) : activeTab === "typ_map" ? (
            <iframe
              key={`typ-map-${refreshKey}`}
              src={getSourceUrl()}
              className="h-full w-full border-0 rounded"
              title="기상청 실시간 태풍 진로도"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          ) : activeTab === "typ_info" ? (
            <div className="h-full overflow-y-auto rounded border border-rose-900/40 bg-slate-900/90 p-4 space-y-3 text-xs text-rose-100">
              <h4 className="flex items-center gap-2 text-sm font-bold text-rose-300 border-b border-rose-800/60 pb-2">
                <Wind className="h-4 w-4" />
                기상청 태풍 분석 및 상세 통보 현황
              </h4>

              {typhoon?.detail ? (
                <div className="space-y-2 rounded-md bg-rose-950/40 p-3 border border-rose-800/50">
                  <p className="text-sm font-semibold text-rose-200">
                    제{typhoon.detail.number}호 태풍 {typhoon.detail.name}
                  </p>
                  <ul className="space-y-1 text-xs text-slate-200">
                    <li>📍 **현재 위치**: {typhoon.detail.position}</li>
                    <li>💨 **중심 기압**: {typhoon.detail.pressureHpa ?? "-"} hPa</li>
                    <li>🌪️ **최대 풍속**: {typhoon.detail.maxWindMs ?? "-"} m/s</li>
                    <li>🧭 **예상 진로**: {typhoon.detail.forecast}</li>
                    <li>📢 **특보 지역**: {typhoon.region || "전국 태풍 영향권"}</li>
                    <li>🕒 **발령 시각**: {typhoon.issuedAt || "현재 유효"}</li>
                  </ul>
                </div>
              ) : (
                <div className="rounded-md bg-slate-950/60 p-4 text-center text-slate-300">
                  <p className="text-sm font-medium">현재 발효된 직접적인 태풍 경보/주의보는 없습니다.</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    기상청 태풍 진로도 탭에서 발생 중인 한반도 주변 태풍의 이동 궤적을 확인하세요.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full overflow-y-auto rounded border border-amber-800/40 bg-slate-900/90 p-4 space-y-3 text-xs text-amber-100">
              <h4 className="flex items-center gap-2 text-sm font-bold text-amber-300 border-b border-amber-800/60 pb-2">
                <ShieldAlert className="h-4 w-4 text-amber-400" />
                태풍 내습 시 현장 작업 안전 수칙 (TBM 가이드)
              </h4>

              <div className="space-y-2 text-xs text-slate-200 leading-relaxed">
                <div className="rounded border border-red-800/60 bg-red-950/50 p-2.5">
                  <p className="font-bold text-red-200 text-xs">⛔ 1. 옥상 · 고소 · 철탑 작업 전면 중지</p>
                  <p className="mt-0.5 text-[11px] text-red-300/90">
                    태풍 주의보/경보 및 강풍 특보 시 옥상, 철탑, 고소작업대에서의 제반 작업을 즉시 중지하고 안전 지역으로 대피합니다.
                  </p>
                </div>

                <div className="rounded border border-amber-800/60 bg-amber-950/50 p-2.5">
                  <p className="font-bold text-amber-200 text-xs">⚠️ 2. 옥외 전선 및 침수 위험 지역 점검</p>
                  <p className="mt-0.5 text-[11px] text-amber-300/90">
                    강우 및 누수로 인한 감전 사고 방지를 위해 전원 차단 상태를 점검하고, 지하/지상 전력설비 침수 대비 방수조치를 시행합니다.
                  </p>
                </div>

                <div className="rounded border border-sky-800/60 bg-sky-950/50 p-2.5">
                  <p className="font-bold text-sky-200 text-xs">📋 3. 작업 전 TBM 엑셀 출력 및 안전교육 실시</p>
                  <p className="mt-0.5 text-[11px] text-sky-300/90">
                    당일 기상 상황을 TBM 엑셀 서식으로 출력하여 현장 작업자들에게 공유하고 비상 연락망을 재확인합니다.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="relative flex items-center justify-between border-t border-rose-900/60 bg-rose-950/80 px-2.5 py-1 text-[10px] text-rose-200">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-rose-400 animate-pulse" />
            기상청(KMA) 실시간 태풍 통보문 및 실황 데이터 연동
          </span>

          {!isMaximized && (
            <div
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              className="absolute bottom-0 right-0 flex h-4 w-4 cursor-se-resize items-center justify-center text-rose-400 hover:text-white"
              title="드래그하여 창 크기 조절"
            >
              <svg className="h-3 w-3 fill-current" viewBox="0 0 16 16">
                <path d="M14 14H10V12H14V14ZM14 10H12V8H14V10ZM10 14H8V12H10V14Z" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

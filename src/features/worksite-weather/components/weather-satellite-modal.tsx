"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Cloud,
  ExternalLink,
  GripHorizontal,
  Maximize2,
  Minimize2,
  Move,
  Radar,
  RefreshCw,
  RotateCcw,
  Satellite,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface WeatherSatelliteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SatelliteTab = "satellite" | "radar" | "kma_web";

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

export function WeatherSatelliteModal({
  isOpen,
  onClose,
}: WeatherSatelliteModalProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<SatelliteTab>("satellite");
  const [refreshKey, setRefreshKey] = useState(Date.now());
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 위치 및 크기 상태
  const [position, setPosition] = useState({ x: 10, y: 0 });
  const [size, setSize] = useState({ width: 1400, height: 900 });

  // 드래그 / 리사이즈 플래그
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const resizeStartRef = useRef<{
    w: number;
    h: number;
    x: number;
    y: number;
  }>({ w: 0, h: 0, x: 0, y: 0 });

  // 창 열릴 때 맨 위꼭대기(y=0) 배치
  useEffect(() => {
    if (isOpen && typeof window !== "undefined") {
      const initSize = getLargeDefaultSize();
      const initX = Math.max(0, Math.floor((window.innerWidth - initSize.width) / 2));
      const initY = 0; // 브라우저 최상단(y=0)까지 끌어올림
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
    if (activeTab === "satellite") {
      return `https://www.weather.go.kr/w/image/sat/gk2a.do?t=${refreshKey}`;
    }
    if (activeTab === "radar") {
      return `https://www.weather.go.kr/w/image/radar.do?t=${refreshKey}`;
    }
    return `https://www.weather.go.kr/w/index.do?t=${refreshKey}`;
  };

  // --- 드래그 핸들러 (창 이동) ---
  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    if (isMaximized) return;
    // 버튼 클릭 시에는 드래그 방지
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
      // 상단 경계 0px로 브라우저 맨 꼭대기까지 올라갈 수 있도록 보장
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

  // --- 리사이즈 핸들러 (창 크기 조절) ---
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
      aria-label="위성/레이더 날씨 지도 레이어"
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
        className="pointer-events-auto absolute flex flex-col rounded-xl border border-slate-700/80 bg-slate-950/95 shadow-2xl backdrop-blur-md transition-shadow duration-150"
      >
        {/* 헤더 바 (드래그 영역) */}
        <div
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
          className="flex cursor-move items-center justify-between border-b border-slate-800 bg-slate-900/90 px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="h-4 w-4 text-slate-500" />
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-sky-500/30 bg-sky-500/10 text-sky-400">
              <Satellite className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                실시간 위성 / 레이더 날씨 지도
                <span className="text-[10px] font-normal text-slate-400">
                  (드래그로 이동 가능)
                </span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-slate-400 hover:bg-slate-800 hover:text-sky-300"
              onClick={handleRefresh}
              title="새로고침"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              onClick={resetPositionAndSize}
              title="위치/크기 리셋"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
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
              className="h-6 w-6 p-0 text-slate-400 hover:bg-rose-950/60 hover:text-rose-300"
              onClick={onClose}
              title="닫기"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* 탭 버튼 네비게이션 */}
        <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/40 px-2 py-1">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-6 px-2.5 text-[11px] font-medium ${
                activeTab === "satellite"
                  ? "border border-sky-500/40 bg-sky-950/70 font-semibold text-sky-200"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
              onClick={() => setActiveTab("satellite")}
            >
              <Satellite className="mr-1 h-3 w-3 text-sky-400" />
              천리안 2A 위성 구름
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-6 px-2.5 text-[11px] font-medium ${
                activeTab === "radar"
                  ? "border border-emerald-500/40 bg-emerald-950/70 font-semibold text-emerald-200"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
              onClick={() => setActiveTab("radar")}
            >
              <Radar className="mr-1 h-3 w-3 text-emerald-400" />
              비구름 레이더
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-6 px-2.5 text-[11px] font-medium ${
                activeTab === "kma_web"
                  ? "border border-indigo-500/40 bg-indigo-950/70 font-semibold text-indigo-200"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
              onClick={() => setActiveTab("kma_web")}
            >
              <Cloud className="mr-1 h-3 w-3 text-indigo-400" />
              기상청 대시보드
            </Button>
          </div>

          <a
            href={getSourceUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-1.5 text-[10px] text-slate-400 hover:text-sky-300 hover:underline"
          >
            기상청 원본 ↗
          </a>
        </div>

        {/* 뷰어 영역 (드래그/리사이즈 중에는 투명 덮개가 나타남) */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black/70">
          {(isDragging || isResizing) && (
            <div className="absolute inset-0 z-10 bg-transparent" />
          )}
          <iframe
            key={`${activeTab}-${refreshKey}`}
            src={getSourceUrl()}
            className="h-full w-full border-0"
            title="기상청 위성/레이더 날씨 지도"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>

        {/* 하단 바 & 리사이즈 핸들 */}
        <div className="relative flex items-center justify-between border-t border-slate-800 bg-slate-900/80 px-2.5 py-1 text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            기상청(KMA) 천리안 2A호 위성 & 레이더 정보
          </span>

          {/* 우하단 리사이즈 핸들 (크기 조절) */}
          {!isMaximized && (
            <div
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              className="absolute bottom-0 right-0 flex h-4 w-4 cursor-se-resize items-center justify-center text-slate-500 hover:text-sky-400"
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

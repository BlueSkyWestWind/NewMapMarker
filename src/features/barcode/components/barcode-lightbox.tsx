"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { GripHorizontal, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { BarcodeQrCanvas } from "@/features/barcode/components/barcode-qr-canvas";
import { COLLAPSED_LEFT_OFFSET_PX, LEFT_OFFSET_PX } from "@/features/shell/constants";
import type { LightboxTarget } from "@/features/barcode/types/barcode";

interface BarcodeLightboxProps {
  target: LightboxTarget | null;
  onClose: () => void;
}

/**
 * 촬영 사진과 생성된 QR을 나란히 확대해 대조한다.
 * `CctvVideoModal`과 같은 이유로 body에 portal한다 — 사이드바의 backdrop-blur가
 * `position: fixed`의 기준점을 사이드바로 바꿔버려, 그대로 두면 영상(여기서는 사진)이
 * 사이드바 폭 안에 갇힌다.
 */
export function BarcodeLightbox({ target, onClose }: BarcodeLightboxProps) {
  const hasMounted = useHasMounted();
  const isSidebarOpen = useMapMarkerStore((state) => state.isSidebarOpen);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef({ pointerX: 0, pointerY: 0, x: 0, y: 0 });
  const imageDragStartRef = useRef({ pointerX: 0, pointerY: 0, x: 0, y: 0 });

  useEffect(() => {
    setRotation(0);
    setZoom(1);
    setImagePosition({ x: 0, y: 0 });
    setPosition({ x: 0, y: 0 });
  }, [target]);

  if (!target || !hasMounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      style={{
        paddingLeft: (isSidebarOpen ? LEFT_OFFSET_PX : COLLAPSED_LEFT_OFFSET_PX) + 16,
      }}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-full w-full max-w-2xl flex-wrap items-center justify-center gap-5 overflow-auto rounded-lg border border-slate-700 bg-slate-950 px-5 pb-5 pt-11 shadow-xl"
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute left-2 right-10 top-2 flex h-7 touch-none cursor-move select-none items-center justify-center gap-1.5 rounded-md text-[11px] text-slate-500 hover:bg-slate-900 hover:text-slate-300"
          title="드래그하여 창 이동"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            dragStartRef.current = {
              pointerX: e.clientX,
              pointerY: e.clientY,
              x: position.x,
              y: position.y,
            };
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const start = dragStartRef.current;
            setPosition({
              x: start.x + e.clientX - start.pointerX,
              y: start.y + e.clientY - start.pointerY,
            });
          }}
        >
          <GripHorizontal className="h-3.5 w-3.5" />
          창 이동
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 h-7 w-7 text-slate-400 hover:text-slate-100"
          onClick={onClose}
          title="닫기"
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="flex w-full max-w-sm flex-col items-center gap-2">
          <div
            className={cn(
              "relative h-[60vh] max-h-[420px] w-full touch-none overflow-hidden rounded-md border border-slate-700 bg-slate-900",
              zoom > 1 && "cursor-grab active:cursor-grabbing",
            )}
            title={zoom > 1 ? "드래그하여 확대된 사진 이동" : "사진을 확대한 후 드래그할 수 있습니다"}
            onPointerDown={(e) => {
              if (e.button !== 0 || zoom <= 1) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              imageDragStartRef.current = {
                pointerX: e.clientX,
                pointerY: e.clientY,
                x: imagePosition.x,
                y: imagePosition.y,
              };
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const start = imageDragStartRef.current;
              setImagePosition({
                x: start.x + e.clientX - start.pointerX,
                y: start.y + e.clientY - start.pointerY,
              });
            }}
          >
            <Image
              src={target.photoUrl}
              alt="촬영 사진 확대"
              fill
              unoptimized
              draggable={false}
              className="object-contain transition-transform duration-200"
              style={{
                transform: `translate(${imagePosition.x}px, ${imagePosition.y}px) rotate(${rotation}deg) scale(${zoom * (rotation % 180 === 0 ? 1 : 0.9)})`,
              }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-[11px]"
              onClick={() => setRotation((value) => value - 90)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              왼쪽 회전
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-[11px]"
              onClick={() => setRotation((value) => value + 90)}
            >
              <RotateCw className="h-3.5 w-3.5" />
              오른쪽 회전
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                const nextZoom = Math.max(0.5, zoom - 0.25);
                setZoom(nextZoom);
                if (nextZoom <= 1) setImagePosition({ x: 0, y: 0 });
              }}
              disabled={zoom <= 0.5}
              title="사진 축소"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 min-w-[56px] px-2 font-mono text-[11px]"
              onClick={() => {
                setZoom(1);
                setImagePosition({ x: 0, y: 0 });
              }}
              title="배율 100%로 초기화"
            >
              {Math.round(zoom * 100)}%
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
              disabled={zoom >= 3}
              title="사진 확대"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="rounded-md bg-white p-3">
            <BarcodeQrCanvas value={target.value} size={150} />
          </div>
          <p className="max-w-[180px] break-all text-center text-[12px] text-slate-300">
            {target.value}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

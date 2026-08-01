"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { roadTypeLabel } from "@/features/cctv/constants/its-config";
import {
  COLLAPSED_LEFT_OFFSET_PX,
  LEFT_OFFSET_PX,
} from "@/features/shell/constants";
import type { CctvItem } from "@/features/cctv/types/cctv";

interface CctvVideoModalProps {
  cctv: CctvItem | null;
  onClose: () => void;
}

/**
 * CCTV 실시간 영상 모달.
 *
 * ITS `cctvType=4`가 HTTPS HLS를 주고 `Access-Control-Allow-Origin: *`이라 직접 재생한다.
 * Safari는 HLS를 네이티브로 재생하지만 Chrome·Edge·Firefox는 hls.js가 필요하다.
 * hls.js는 400KB대라 **모달을 열 때만** 내려받는다.
 */
export function CctvVideoModal({ cctv, onClose }: CctvVideoModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasMounted = useHasMounted();
  const isSidebarOpen = useMapMarkerStore((state) => state.isSidebarOpen);

  useEffect(() => {
    const video = videoRef.current;
    if (!cctv?.streamUrl || !video) return;

    const src = cctv.streamUrl;
    setError(null);
    setIsLoading(true);

    // 언마운트·CCTV 변경 후 늦게 도착한 초기화가 새 재생을 덮지 않도록 막는다
    let disposed = false;
    let destroy: (() => void) | null = null;

    const start = async () => {
      // Safari 계열은 네이티브로 처리한다. hls.js를 얹으면 오히려 충돌한다.
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        setIsLoading(false);
        return;
      }

      try {
        const { default: Hls } = await import("hls.js");
        if (disposed) return;

        if (!Hls.isSupported()) {
          setError("이 브라우저에서는 재생할 수 없습니다.");
          setIsLoading(false);
          return;
        }

        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        destroy = () => hls.destroy();

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (disposed) return;
          setIsLoading(false);
          void video.play().catch(() => {
            // 자동재생 차단은 오류가 아니다. 사용자가 재생 버튼을 누르면 된다.
          });
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (disposed || !data.fatal) return;
          setIsLoading(false);
          setError(
            "영상을 불러오지 못했습니다. 스트림 주소가 만료되었을 수 있습니다(발급 후 2시간).",
          );
        });

        hls.loadSource(src);
        hls.attachMedia(video);
      } catch {
        if (disposed) return;
        setIsLoading(false);
        setError("영상 재생 모듈을 불러오지 못했습니다.");
      }
    };

    void start();

    return () => {
      disposed = true;
      destroy?.();
      video.removeAttribute("src");
      video.load();
    };
  }, [cctv]);

  if (!cctv || !hasMounted) return null;

  /*
   * body로 포털한다.
   * 사이드바에 `backdrop-blur`가 걸려 있어 그 안에서는 `position: fixed`가
   * 뷰포트가 아니라 사이드바를 기준으로 잡힌다(backdrop-filter가 컨테이닝 블록을 만든다).
   * 그대로 두면 영상이 사이드바 폭에 갇힌다.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      // 지도 영역 중앙에 오도록 사이드바 폭만큼 비킨다
      // 뷰포트 고정이라 좌측 셸 폭만큼 비켜야 지도 영역 중앙에 온다.
      style={{
        paddingLeft:
          (isSidebarOpen ? LEFT_OFFSET_PX : COLLAPSED_LEFT_OFFSET_PX) + 16,
      }}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-2 border-b border-slate-800 px-3 py-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-slate-100">{cctv.name}</h3>
            <p className="truncate text-[10px] text-slate-500">
              {roadTypeLabel(cctv.roadType)} · {cctv.lat.toFixed(5)}, {cctv.lng.toFixed(5)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-slate-400 hover:text-slate-100"
            onClick={onClose}
            title="닫기"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="relative bg-black">
          <video
            ref={videoRef}
            className="max-h-[70vh] w-full"
            controls
            muted
            playsInline
            autoPlay
          />

          {isLoading ? (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
              영상을 불러오는 중...
            </p>
          ) : null}

          {error ? (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs leading-relaxed text-rose-300">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="border-t border-slate-800 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
          ITS 국가교통정보센터 제공. 스트림 주소는 발급 후 약 2시간 뒤 만료되므로,
          재생이 끊기면 CCTV를 다시 조회하세요.
        </footer>
      </div>
    </div>,
    document.body,
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

interface RoadviewPaneProps {
  lat: number;
  lng: number;
  onClose: () => void;
}

/**
 * 카카오맵 페인 위에 인라인으로 표시되는 로드뷰(새창/모달 아님).
 * 클릭한 도로 좌표에서 가장 가까운 파노라마를 찾아 표시한다.
 */
export function RoadviewPane({ lat, lng, onClose }: RoadviewPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rvRef = useRef<KakaoRoadview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !window.kakao?.maps) {
      setIsLoading(false);
      setIsError(true);
      return;
    }
    const kakao = window.kakao;
    setIsLoading(true);
    setIsError(false);
    container.innerHTML = '';

    // 컨테이너 크기가 잡힌 뒤 초기화
    const timer = window.setTimeout(() => {
      try {
        const rv = new kakao.maps.Roadview(container);
        rvRef.current = rv;
        const client = new kakao.maps.RoadviewClient();
        const position = new kakao.maps.LatLng(lat, lng);

        client.getNearestPanoId(position, 100, (panoId) => {
          setIsLoading(false);
          if (panoId === null) {
            setIsError(true);
            return;
          }
          rv.setPanoId(panoId, position);
          window.setTimeout(() => {
            try {
              rvRef.current?.relayout();
            } catch {
              /* noop */
            }
          }, 100);
        });
      } catch {
        setIsLoading(false);
        setIsError(true);
      }
    }, 60);

    return () => {
      window.clearTimeout(timer);
      rvRef.current = null;
    };
  }, [lat, lng]);

  return (
    <div className="absolute inset-0 z-20 bg-slate-950">
      <div ref={containerRef} className="h-full w-full" />

      {isLoading ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/80 text-slate-300">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
          <p className="text-xs">로드뷰 로딩 중...</p>
        </div>
      ) : null}

      {isError ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950 p-6 text-center text-slate-400">
          <AlertTriangle className="mb-1 h-10 w-10 text-rose-500" />
          <p className="text-sm font-semibold text-rose-400">
            로드뷰를 표시할 수 없습니다
          </p>
          <p className="max-w-[280px] text-xs">
            선택한 지점 주변에 제공되는 로드뷰가 없습니다. 파란 도로 위를 클릭해
            주세요.
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        title="로드뷰 닫기"
        className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-100 shadow hover:bg-slate-800"
      >
        <X className="h-3.5 w-3.5" />
        로드뷰 닫기
      </button>
    </div>
  );
}

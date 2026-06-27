'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import { Calendar, AlertTriangle, Loader2 } from 'lucide-react';

interface RoadviewDateItem {
  panoId: string;
  date: string;
}

export function RoadviewModal() {
  const isRoadviewOpen = useMapMarkerStore((state) => state.isRoadviewOpen);
  const roadviewPosition = useMapMarkerStore((state) => state.roadviewPosition);
  const closeAllModals = useMapMarkerStore((state) => state.closeAllModals);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dates, setDates] = useState<RoadviewDateItem[]>([]);
  const [currentPanoId, setCurrentPanoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  
  const rvInstanceRef = useRef<any>(null);
  const lastFetchedPanoId = useRef<string | null>(null);

  const formatDate = (dateStr: string) => {
    if (dateStr && dateStr.length === 8) {
      return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
    }
    return dateStr || '';
  };

  const updateRoadviewDates = useCallback(async (panoId: string) => {
    if (!panoId || lastFetchedPanoId.current === panoId) return;
    lastFetchedPanoId.current = panoId;

    const fetchDates = async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error();
      return response.json();
    };

    const bindDates = (data: any) => {
      const list = data.street_view?.streetList || [];
      if (list.length > 0) {
        const dateItems = list.map((item: any) => ({
          panoId: String(item.panoId),
          date: String(item.imgDate),
        }));
        setDates(dateItems);
      } else {
        setDates([]);
      }
    };

    try {
      // 1차: 로컬 API 프록시 요청
      const data = await fetchDates(`/api/roadview-dates?panoId=${panoId}`);
      bindDates(data);
    } catch {
      // 2차: 카카오 직접 요청 Fallback
      try {
        const data = await fetchDates(`https://rv.map.kakao.com/roadview-search/v2/node/${panoId}?SERVICE=csspano`);
        bindDates(data);
      } catch (err) {
        console.error('과거 촬영 일자 로드 실패:', err);
      }
    }
  }, []);

  useEffect(() => {
    if (!isRoadviewOpen || !roadviewPosition || !containerRef.current || !window.kakao?.maps) {
      return;
    }

    setIsLoading(true);
    setIsError(false);
    setDates([]);
    setCurrentPanoId(null);
    lastFetchedPanoId.current = null;

    const { lat, lng } = roadviewPosition;
    const container = containerRef.current;
    container.innerHTML = '';

    try {
      const kakaoMaps = (window as any).kakao.maps;
      const rv = new kakaoMaps.Roadview(container);
      rvInstanceRef.current = rv;

      const rvClient = new kakaoMaps.RoadviewClient();
      const position = new kakaoMaps.LatLng(lat, lng);

      rvClient.getNearestPanoId(position, 100, (panoId: any) => {
        setIsLoading(false);
        if (panoId === null) {
          setIsError(true);
        } else {
          rv.setPanoId(panoId, position);
          setCurrentPanoId(panoId);
        }
      });

      // 파노라마 변경 시 촬영 날짜 목록 갱신
      window.kakao.maps.event.addListener(rv, 'pano_changed', () => {
        const nextPanoId = rv.getPanoId();
        setCurrentPanoId(nextPanoId);
        updateRoadviewDates(nextPanoId);
      });
    } catch (e) {
      console.error('로드뷰 초기화 실패:', e);
      setIsLoading(false);
      setIsError(true);
    }

    return () => {
      rvInstanceRef.current = null;
    };
  }, [isRoadviewOpen, roadviewPosition, updateRoadviewDates]);

  const handleDateChange = (panoId: string) => {
    if (rvInstanceRef.current && panoId) {
      rvInstanceRef.current.setPanoId(panoId);
    }
  };

  return (
    <Dialog open={isRoadviewOpen} onOpenChange={(open) => !open && closeAllModals()}>
      <DialogContent className="max-w-[90vw] md:max-w-[1000px] w-full bg-slate-900 border-slate-800 text-slate-100 p-0 overflow-hidden shadow-2xl rounded-2xl">
        <DialogHeader className="p-4 border-b border-slate-800 flex flex-row items-center justify-between">
          <DialogTitle className="text-base font-bold bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            {roadviewPosition?.name ? `${roadviewPosition.name} - 현장 로드뷰` : '현장 로드뷰'}
          </DialogTitle>
        </DialogHeader>

        <div className="relative w-full h-[60vh] md:h-[70vh] bg-slate-950 flex items-center justify-center">
          {isLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/80">
              <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
              <p className="text-sm text-slate-300">로드뷰 로딩 중...</p>
            </div>
          )}

          {isError && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center text-slate-400">
              <AlertTriangle className="h-12 w-12 text-rose-500 mb-2" />
              <p className="text-base font-semibold text-rose-400">로드뷰를 표시할 수 없음</p>
              <p className="text-xs max-w-[280px]">
                해당 좌표 주변에 제공되는 로드뷰 파노라마 데이터가 없습니다. 다른 마커를 선택해 주세요.
              </p>
            </div>
          )}

          {/* 촬영 일자 선택기 */}
          {!isError && dates.length > 0 && (
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-lg shadow-lg">
              <Calendar className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-200">촬영 일자:</span>
              <select
                value={currentPanoId || ''}
                onChange={(e) => handleDateChange(e.target.value)}
                className="bg-slate-800 text-slate-100 text-xs border border-slate-700 rounded px-2 py-1 outline-none cursor-pointer focus:border-emerald-500"
              >
                {dates.map((item) => (
                  <option key={item.panoId} value={item.panoId}>
                    {formatDate(item.date)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div ref={containerRef} className="w-full h-full" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

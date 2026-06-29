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

  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) {
      setContainer(node);
    } else {
      setContainer(null);
    }
  }, []);
  const [dates, setDates] = useState<RoadviewDateItem[]>([]);
  const [currentPanoId, setCurrentPanoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const addLog = useCallback((msg: string) => {
    console.log(`[RoadviewDebug] ${msg}`);
    setDebugLogs((prev) => [...prev.slice(-30), `${new Date().toLocaleTimeString()} - ${msg}`]);
  }, []);

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
    if (!isRoadviewOpen || !roadviewPosition) {
      return;
    }

    // 모달이 열릴 때마다 로그 초기화
    setDebugLogs([]);
    addLog("로드뷰 모달 감지: 로드 시작");

    if (!container) {
      addLog("대기: container DOM 노드가 아직 마운트되지 않았습니다.");
      return;
    }
    if (!window.kakao?.maps) {
      addLog("에러: window.kakao.maps 가 존재하지 않습니다 (SDK 로드 안 됨).");
      return;
    }

    setIsLoading(true);
    setIsError(false);
    setDates([]);
    setCurrentPanoId(null);
    lastFetchedPanoId.current = null;

    const latRaw = roadviewPosition.lat;
    const lngRaw = roadviewPosition.lng;
    const latNum = Number(latRaw);
    const lngNum = Number(lngRaw);

    addLog(`원본 좌표 수신: lat=${latRaw} (${typeof latRaw}), lng=${lngRaw} (${typeof lngRaw})`);
    addLog(`변환 완료 좌표: lat=${latNum}, lng=${lngNum}`);

    if (isNaN(latNum) || isNaN(lngNum) || latNum === 0 || lngNum === 0) {
      addLog("에러: 유효하지 않은 위경도 좌표입니다. 로드를 취소합니다.");
      setIsLoading(false);
      setIsError(true);
      return;
    }

    container.innerHTML = '';

    // Dialog 애니메이션 트랜지션(약 150-200ms)이 완료될 때까지 대기하여
    // 컨테이너 크기(width, height)가 정상적으로 결정된 후 카카오 로드뷰를 초기화합니다.
    const timer = setTimeout(() => {
      try {
        addLog("setTimeout 내부: 카카오 로드뷰 초기화 시작");
        const kakaoMaps = (window as any).kakao.maps;
        
        addLog("kakaoMaps.Roadview 인스턴스 생성 시도");
        const rv = new kakaoMaps.Roadview(container);
        rvInstanceRef.current = rv;
        addLog("kakaoMaps.Roadview 인스턴스 생성 성공");

        addLog("kakaoMaps.RoadviewClient 인스턴스 생성 시도");
        const rvClient = new kakaoMaps.RoadviewClient();
        addLog("kakaoMaps.RoadviewClient 인스턴스 생성 성공");
        
        const position = new kakaoMaps.LatLng(latNum, lngNum);
        addLog(`LatLng 생성 완료: LatLng(${latNum}, ${lngNum})`);

        addLog("rvClient.getNearestPanoId 호출 시도 (검색 반경 100m)");
        rvClient.getNearestPanoId(position, 100, (panoId: any) => {
          try {
            addLog(`getNearestPanoId 비동기 콜백 호출됨. panoId = ${panoId}`);
            setIsLoading(false);
            if (panoId === null) {
              addLog("경고: 주변 100m 이내에 유효한 로드뷰 파노라마 ID가 없습니다 (null).");
              setIsError(true);
            } else {
              addLog(`rv.setPanoId(${panoId}) 실행 시도`);
              rv.setPanoId(panoId, position);
              setCurrentPanoId(panoId);
              addLog(`rv.setPanoId 실행 성공. 현재 panoId 설정됨: ${panoId}`);
              
              // 로드뷰 로드 완료 후 컨테이너 크기에 맞춰 정상적으로 표시될 수 있도록 relayout()을 강제 실행합니다.
              setTimeout(() => {
                try {
                  if (rvInstanceRef.current) {
                    addLog("rv.relayout() 실행 시도");
                    rvInstanceRef.current.relayout();
                    addLog("rv.relayout() 실행 완료");
                  }
                } catch (relayoutErr: any) {
                  addLog(`relayout() 도중 에러: ${relayoutErr.message}`);
                }
              }, 100);
            }
          } catch (callbackErr: any) {
            addLog(`비동기 콜백 실행 중 예외 발생: ${callbackErr.message}`);
            console.error(callbackErr);
            setIsLoading(false);
            setIsError(true);
          }
        });

        // 파노라마 변경 시 촬영 날짜 목록 갱신
        window.kakao.maps.event.addListener(rv, 'pano_changed', () => {
          try {
            const nextPanoId = rv.getPanoId();
            addLog(`이벤트 감지 (pano_changed): nextPanoId = ${nextPanoId}`);
            setCurrentPanoId(nextPanoId);
            updateRoadviewDates(nextPanoId);
          } catch (eventErr: any) {
            addLog(`pano_changed 리스너 에러: ${eventErr.message}`);
          }
        });
      } catch (e: any) {
        addLog(`로드뷰 초기화 중 예외 발생: ${e.message}`);
        console.error('로드뷰 초기화 실패:', e);
        setIsLoading(false);
        setIsError(true);
      }
    }, 250); // 트랜지션 타임을 보다 넉넉하게 250ms로 설정

    return () => {
      addLog("useEffect cleanup: 타이머 클리어");
      clearTimeout(timer);
      rvInstanceRef.current = null;
    };
  }, [isRoadviewOpen, roadviewPosition, updateRoadviewDates, addLog, container]);

  const handleDateChange = (panoId: string) => {
    if (rvInstanceRef.current && panoId) {
      rvInstanceRef.current.setPanoId(panoId);
    }
  };

  return (
    <Dialog open={isRoadviewOpen} onOpenChange={(open) => !open && closeAllModals()}>
      <DialogContent className="max-w-[95vw] md:max-w-[1400px] w-full bg-slate-900 border-slate-800 text-slate-100 p-0 overflow-hidden shadow-2xl rounded-2xl">
        <DialogHeader className="p-4 border-b border-slate-800 flex flex-row items-center justify-between">
          <DialogTitle className="text-base font-bold bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            {roadviewPosition?.name ? `${roadviewPosition.name} - 현장 로드뷰` : '현장 로드뷰'}
          </DialogTitle>
        </DialogHeader>

        <div className="relative w-full h-[60vh] md:h-[75vh] bg-slate-950 flex items-center justify-center">
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

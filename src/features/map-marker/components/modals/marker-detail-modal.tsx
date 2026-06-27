'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import { useActiveMarkers } from '@/features/map-marker/hooks/use-active-markers';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, FileSpreadsheet, Lock } from 'lucide-react';

interface InfoRow {
  facility_year?: string;
  project_code?: string;
  facility_code?: string;
  business_type?: string;
  final_station_name?: string;
  eq_type?: string;
  install_date?: string;
  open_date?: string;
}

export function MarkerDetailModal() {
  const isDetailOpen = useMapMarkerStore((state) => state.isDetailOpen);
  const selectedMarkerId = useMapMarkerStore((state) => state.selectedMarkerId);
  const closeAllModals = useMapMarkerStore((state) => state.closeAllModals);
  const mode = useMapMarkerStore((state) => state.mode);
  
  const { markers } = useActiveMarkers();
  const marker = markers.find((m) => m.id === selectedMarkerId);
  const { toast } = useToast();

  const [detailedInfo, setDetailedInfo] = useState<InfoRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 셀 드래그 선택 상태
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const dragStart = useRef<{ r: number; c: number } | null>(null);
  const isDragging = useRef(false);

  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    if (!isDetailOpen || !marker || mode !== 'equipment' || !supabase) {
      setDetailedInfo([]);
      return;
    }

    const fetchDetail = async () => {
      setIsLoading(true);
      try {
        const facilityCode = (marker as any).facilityCode || '';
        const name = marker.name || '';
        
        const { data, error } = await supabase
          .from('information')
          .select('*')
          .or(`facility_code.eq."${facilityCode}",place_name.eq."${name}"`);
          
        if (error) throw error;
        setDetailedInfo(data || []);
      } catch (err: any) {
        console.error('연관 상세 정보 조회 실패:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetail();
    setSelectedCells(new Set());
  }, [isDetailOpen, selectedMarkerId, mode, marker, supabase]);

  // 클립보드 복사 헬퍼
  const writeTsvToClipboard = async (tsvText: string, message: string) => {
    try {
      await navigator.clipboard.writeText(tsvText);
      toast({ description: message });
    } catch (err) {
      toast({ variant: 'destructive', description: '클립보드 복사에 실패했습니다.' });
    }
  };

  // 표 전체 복사
  const handleCopyTable = () => {
    let headers: string[] = [];
    let rowsData: string[][] = [];

    if (mode === 'equipment') {
      headers = ['시설연도', '프로젝트코드', '통합시설코드', '사업구분', '국소명-최종', '장비타입', '시설일', '개통일'];
      
      const source = detailedInfo.length > 0 ? detailedInfo : [{
        facility_year: (marker as any).facilityYear,
        project_code: (marker as any).projectCode,
        facility_code: (marker as any).facilityCode,
        business_type: (marker as any).businessType,
        final_station_name: (marker as any).finalStationName,
        eq_type: (marker as any).eqType,
        install_date: (marker as any).installDate,
        open_date: (marker as any).openDate,
      }];

      rowsData = source.map(row => [
        row.facility_year || '',
        row.project_code || '',
        row.facility_code || '',
        row.business_type || '',
        row.final_station_name || '',
        row.eq_type || '',
        row.install_date ? row.install_date.split('T')[0] : '',
        row.open_date ? row.open_date.split('T')[0] : '',
      ]);
    } else {
      headers = ['ERP명', '주소', '용량(AH)', '수량(Cell)', '창고/국소/국사명', '등록일'];
      const items = (marker as any)?.items || [];
      rowsData = items.map((item: any) => [
        item.erpName || '',
        item.address || '',
        String(item.capacity || 0),
        String(item.quantity || 0),
        item.stationName || '',
        item.createdAt ? item.createdAt.split('T')[0] : '',
      ]);
    }

    const tsvContent = [
      headers.join('\t'),
      ...rowsData.map(row => row.join('\t'))
    ].join('\n');

    writeTsvToClipboard(tsvContent, '표 전체 내용이 클립보드에 복사되었습니다.');
  };

  // 선택 셀 복사
  const handleCopySelected = () => {
    if (selectedCells.size === 0) return;

    // 셀 좌표 정렬 및 추출
    const coords = Array.from(selectedCells).map((key) => {
      const [r, c] = key.split(',').map(Number);
      return { r, c };
    });

    const minRow = Math.min(...coords.map((o) => o.r));
    const maxRow = Math.max(...coords.map((o) => o.r));
    const minCol = Math.min(...coords.map((o) => o.c));
    const maxCol = Math.max(...coords.map((o) => o.c));

    const grid: string[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const rowArr: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const hasCell = coords.some((o) => o.r === r && o.c === c);
        if (hasCell) {
          rowArr.push(getCellValue(r, c));
        } else {
          rowArr.push('');
        }
      }
      grid.push(rowArr);
    }

    const tsvContent = grid.map((row) => row.join('\t')).join('\n');
    writeTsvToClipboard(tsvContent, '선택한 셀 내용이 클립보드에 복사되었습니다.');
  };

  const getCellValue = (r: number, c: number): string => {
    if (mode === 'equipment') {
      const source = detailedInfo.length > 0 ? detailedInfo : [{
        facility_year: (marker as any).facilityYear,
        project_code: (marker as any).projectCode,
        facility_code: (marker as any).facilityCode,
        business_type: (marker as any).businessType,
        final_station_name: (marker as any).finalStationName,
        eq_type: (marker as any).eqType,
        install_date: (marker as any).installDate,
        open_date: (marker as any).openDate,
      }];
      const row = source[r];
      if (!row) return '';
      switch (c) {
        case 0: return row.facility_year || '';
        case 1: return row.project_code || '';
        case 2: return row.facility_code || '';
        case 3: return row.business_type || '';
        case 4: return row.final_station_name || '';
        case 5: return row.eq_type || '';
        case 6: return row.install_date ? row.install_date.split('T')[0] : '';
        case 7: return row.open_date ? row.open_date.split('T')[0] : '';
        default: return '';
      }
    } else {
      const items = (marker as any)?.items || [];
      const item = items[r];
      if (!item) return '';
      switch (c) {
        case 0: return item.erpName || '';
        case 1: return item.address || '';
        case 2: return String(item.capacity || 0);
        case 3: return String(item.quantity || 0);
        case 4: return item.stationName || '';
        case 5: return item.createdAt ? item.createdAt.split('T')[0] : '';
        default: return '';
      }
    }
  };

  // 마우스 드래그 선택 이벤트 핸들러
  const handleMouseDown = (r: number, c: number) => {
    isDragging.current = true;
    dragStart.current = { r, c };
    setSelectedCells(new Set([`${r},${c}`]));
  };

  const handleMouseOver = (r: number, c: number) => {
    if (!isDragging.current || !dragStart.current) return;
    const start = dragStart.current;

    const minRow = Math.min(start.r, r);
    const maxRow = Math.max(start.r, r);
    const minCol = Math.min(start.c, c);
    const maxCol = Math.max(start.c, c);

    const nextSet = new Set<string>();
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        nextSet.add(`${row},${col}`);
      }
    }
    setSelectedCells(nextSet);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    dragStart.current = null;
  };

  useEffect(() => {
    const globalMouseUp = () => {
      isDragging.current = false;
      dragStart.current = null;
    };
    window.addEventListener('mouseup', globalMouseUp);
    return () => window.removeEventListener('mouseup', globalMouseUp);
  }, []);

  if (!marker) return null;

  const color = marker.color || '#10b981';

  return (
    <Dialog open={isDetailOpen} onOpenChange={(open) => !open && closeAllModals()}>
      <DialogContent className="max-w-[95vw] md:max-w-[1000px] w-full bg-slate-900 border-slate-800 text-slate-100 p-6 overflow-hidden shadow-2xl rounded-2xl">
        <DialogHeader className="border-b border-slate-800 pb-4 flex flex-row items-center gap-3">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
          <DialogTitle className="text-lg font-bold text-slate-100">
            마커 상세 정보
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4 max-h-[40vh] overflow-y-auto pr-2">
          {/* 기본 정보 */}
          <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">기본 정보</h4>
            <div>
              <label className="text-[10px] text-slate-500 font-medium">장소 이름</label>
              <div className="text-sm font-semibold text-slate-200 mt-0.5">{marker.name}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 font-medium">위도</label>
                <div className="text-xs font-mono mt-0.5">{marker.lat}</div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-medium">경도</label>
                <div className="text-xs font-mono mt-0.5">{marker.lng}</div>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-medium">메모</label>
              <div className="text-xs text-slate-300 mt-0.5 whitespace-pre-wrap leading-relaxed">{marker.memo || '입력된 메모가 없습니다.'}</div>
            </div>
          </div>

          {/* 주소 및 부가정보 */}
          <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">위치 정보</h4>
            <div>
              <label className="text-[10px] text-slate-500 font-medium">주소 (지번)</label>
              <div className="text-xs text-slate-200 mt-0.5">
                {mode === 'equipment' ? (marker as any).jibunAddress || '주소 정보 없음' : (marker as any).address || '주소 정보 없음'}
              </div>
            </div>
            {mode === 'equipment' && (marker as any).roadAddress && (
              <div>
                <label className="text-[10px] text-slate-500 font-medium">도로명 주소</label>
                <div className="text-xs text-slate-300 mt-0.5">{(marker as any).roadAddress}</div>
              </div>
            )}
            <div>
              <label className="text-[10px] text-slate-500 font-medium">태그</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {marker.tags && marker.tags.length > 0 ? (
                  marker.tags.map((tag, idx) => (
                    <span key={idx} className="bg-slate-800 text-slate-300 text-[10px] font-medium px-2 py-0.5 rounded-full border border-slate-700/55">
                      #{tag}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">지정된 태그가 없습니다.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 상세 스펙/장비 정보 테이블 */}
        <div className="border-t border-slate-800 pt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              {mode === 'equipment' ? '연관 상세 장비 목록' : '연관 축전지 상세 사양'}
              <span className="text-[10px] text-slate-500 font-normal flex items-center gap-1">
                <Lock className="h-2.5 w-2.5" />
                셀 드래그 선택 후 복사 지원
              </span>
            </h4>
            <div className="flex gap-2">
              {selectedCells.size > 0 && (
                <button
                  onClick={handleCopySelected}
                  className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 text-[10px] font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all"
                >
                  <Check className="h-3 w-3" />
                  선택 셀 복사
                </button>
              )}
              <button
                onClick={handleCopyTable}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all"
              >
                <Copy className="h-3 w-3" />
                표 전체 복사
              </button>
            </div>
          </div>

          <div className="w-full overflow-x-auto border border-slate-800 rounded-lg max-h-[30vh]">
            <table className="w-full border-collapse text-left text-xs text-slate-300 select-none">
              <thead className="bg-slate-950/60 sticky top-0 text-slate-400 font-semibold border-b border-slate-800">
                {mode === 'equipment' ? (
                  <tr>
                    <th className="p-2 border-r border-slate-800">시설연도</th>
                    <th className="p-2 border-r border-slate-800">프로젝트코드</th>
                    <th className="p-2 border-r border-slate-800">통합시설코드</th>
                    <th className="p-2 border-r border-slate-800">사업구분</th>
                    <th className="p-2 border-r border-slate-800">국소명-최종</th>
                    <th className="p-2 border-r border-slate-800">장비타입</th>
                    <th className="p-2 border-r border-slate-800">시설일</th>
                    <th className="p-2">개통일</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="p-2 border-r border-slate-800">ERP명</th>
                    <th className="p-2 border-r border-slate-800">주소</th>
                    <th className="p-2 border-r border-slate-800">용량(AH)</th>
                    <th className="p-2 border-r border-slate-800">수량(Cell)</th>
                    <th className="p-2 border-r border-slate-800">창고/국소/국사명</th>
                    <th className="p-2">등록일</th>
                  </tr>
                )}
              </thead>
              <tbody onMouseUp={handleMouseUp}>
                {isLoading ? (
                  <tr>
                    <td colSpan={mode === 'equipment' ? 8 : 6} className="text-center p-6 text-slate-500 font-medium">
                      상세 정보를 로드하는 중...
                    </td>
                  </tr>
                ) : mode === 'equipment' ? (
                  // 장비 목록
                  (detailedInfo.length > 0 ? detailedInfo : [{
                    facility_year: (marker as any).facilityYear,
                    project_code: (marker as any).projectCode,
                    facility_code: (marker as any).facilityCode,
                    business_type: (marker as any).businessType,
                    final_station_name: (marker as any).finalStationName,
                    eq_type: (marker as any).eqType,
                    install_date: (marker as any).installDate,
                    open_date: (marker as any).openDate,
                  }]).map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-slate-800 hover:bg-slate-850/40">
                      {[
                        row.facility_year,
                        row.project_code,
                        row.facility_code,
                        row.business_type,
                        row.final_station_name,
                        row.eq_type,
                        row.install_date ? row.install_date.split('T')[0] : '',
                        row.open_date ? row.open_date.split('T')[0] : ''
                      ].map((val, cIdx) => {
                        const isSel = selectedCells.has(`${rIdx},${cIdx}`);
                        return (
                          <td
                            key={cIdx}
                            onMouseDown={() => handleMouseDown(rIdx, cIdx)}
                            onMouseOver={() => handleMouseOver(rIdx, cIdx)}
                            className={`p-2 border-r border-slate-800 transition-colors cursor-crosshair ${isSel ? 'bg-blue-900/30 text-blue-200' : ''}`}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  // 축전지 목록
                  ((marker as any)?.items || []).map((item: any, rIdx) => (
                    <tr key={rIdx} className="border-b border-slate-800 hover:bg-slate-850/40">
                      {[
                        item.erpName,
                        item.address,
                        item.capacity,
                        item.quantity,
                        item.stationName,
                        item.createdAt ? item.createdAt.split('T')[0] : ''
                      ].map((val, cIdx) => {
                        const isSel = selectedCells.has(`${rIdx},${cIdx}`);
                        return (
                          <td
                            key={cIdx}
                            onMouseDown={() => handleMouseDown(rIdx, cIdx)}
                            onMouseOver={() => handleMouseOver(rIdx, cIdx)}
                            className={`p-2 border-r border-slate-800 transition-colors cursor-crosshair ${isSel ? 'bg-blue-900/30 text-blue-200' : ''}`}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import type {
  BatteryMarker,
  BatterySpecItem,
  EquipmentMarker,
} from '@/features/map-marker/types/marker';

interface InfoRow {
  marker_id?: string | null;
  group_role?: string;
  facility_year?: string;
  project_code?: string;
  facility_code?: string;
  business_type?: string;
  final_station_name?: string;
  eq_type?: string;
  install_date?: string;
  open_date?: string;
}

/** sticky 헤더: 불투명 배경으로 스크롤 행이 비치지 않게 함 */
const DETAIL_TABLE_STICKY_TH =
  'sticky top-0 z-10 whitespace-nowrap bg-slate-950 p-2 pr-3';
const DETAIL_TABLE_STICKY_TH_LAST =
  'sticky top-0 z-10 whitespace-nowrap bg-slate-950 p-2 pr-5';
const DETAIL_TABLE_TD =
  'whitespace-nowrap p-2 pr-3 border-r border-slate-800 transition-colors cursor-crosshair';
const DETAIL_TABLE_TD_LAST =
  'whitespace-nowrap p-2 pr-5 transition-colors cursor-crosshair';

function toInfoRowFromEquipment(marker: EquipmentMarker): InfoRow {
  return {
    marker_id: marker.id,
    group_role:
      marker.groupRole ||
      (marker.parentMarkerId ? 'SUB' : '대표'),
    facility_year: marker.facilityYear,
    project_code: marker.projectCode,
    facility_code: marker.facilityCode,
    business_type: marker.businessType,
    final_station_name: marker.finalStationName || marker.name,
    eq_type: marker.eqType,
    install_date: marker.installDate,
    open_date: marker.openDate,
  };
}

export function MarkerDetailModal() {
  const isDetailOpen = useMapMarkerStore((state) => state.isDetailOpen);
  const selectedMarkerId = useMapMarkerStore((state) => state.selectedMarkerId);
  const closeAllModals = useMapMarkerStore((state) => state.closeAllModals);
  const mode = useMapMarkerStore((state) => state.mode);
  
  const { markers } = useActiveMarkers();
  const marker = markers.find((m) => m.id === selectedMarkerId);
  const { toast } = useToast();

  // 현재 모드에 맞춰 좁힌 타입 뷰 (as any 제거용)
  const equipmentMarker =
    mode === 'equipment' ? (marker as EquipmentMarker | undefined) : undefined;
  const batteryMarker =
    mode === 'battery' ? (marker as BatteryMarker | undefined) : undefined;

  const [detailedInfo, setDetailedInfo] = useState<InfoRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 셀 드래그 선택 상태
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const dragStart = useRef<{ r: number; c: number } | null>(null);
  const isDragging = useRef(false);

  const supabase = getSupabaseBrowserClient();

  /** 대표 + 동일 번지 서브 국소를 한 목록으로 묶는다. */
  const relatedEquipmentMarkers = useMemo(() => {
    if (mode !== 'equipment' || !equipmentMarker) {
      return [] as EquipmentMarker[];
    }

    const subs = !equipmentMarker.parentMarkerId
      ? (markers as EquipmentMarker[]).filter(
          (item) => item.parentMarkerId === equipmentMarker.id,
        )
      : [];

    return [equipmentMarker, ...subs];
  }, [mode, equipmentMarker, markers]);

  const equipmentRows = useMemo(() => {
    const roleByMarkerId = new Map(
      relatedEquipmentMarkers.map((item) => [
        item.id,
        item.groupRole || (item.parentMarkerId ? 'SUB' : '대표'),
      ]),
    );
    const roleByFacilityCode = new Map(
      relatedEquipmentMarkers
        .filter((item) => item.facilityCode)
        .map((item) => [
          item.facilityCode,
          item.groupRole || (item.parentMarkerId ? 'SUB' : '대표'),
        ]),
    );

    const withRole = (rows: InfoRow[]) =>
      rows.map((row) => ({
        ...row,
        group_role:
          row.group_role ||
          (row.marker_id ? roleByMarkerId.get(row.marker_id) : undefined) ||
          (row.facility_code
            ? roleByFacilityCode.get(row.facility_code)
            : undefined) ||
          '대표',
      }));

    if (detailedInfo.length > 0) {
      return withRole(detailedInfo);
    }
    if (relatedEquipmentMarkers.length > 0) {
      return relatedEquipmentMarkers.map(toInfoRowFromEquipment);
    }
    if (equipmentMarker) {
      return [toInfoRowFromEquipment(equipmentMarker)];
    }
    return [] as InfoRow[];
  }, [detailedInfo, relatedEquipmentMarkers, equipmentMarker]);

  useEffect(() => {
    if (!isDetailOpen || !marker || mode !== 'equipment' || !supabase) {
      setDetailedInfo([]);
      return;
    }

    const fetchDetail = async () => {
      setIsLoading(true);
      try {
        const markerIds = relatedEquipmentMarkers.map((item) => item.id);
        const facilityCodes = relatedEquipmentMarkers
          .map((item) => item.facilityCode)
          .filter(Boolean);

        let infoRows: InfoRow[] = [];

        if (markerIds.length > 0) {
          const { data, error } = await supabase
            .from('information')
            .select('*')
            .in('marker_id', markerIds);
          if (error) throw error;
          infoRows = (data as InfoRow[]) || [];
        }

        if (facilityCodes.length > 0) {
          const { data, error } = await supabase
            .from('information')
            .select('*')
            .in('facility_code', facilityCodes);
          if (error) throw error;
          const byKey = new Set(
            infoRows.map(
              (row) =>
                `${row.marker_id ?? ''}|${row.facility_code ?? ''}|${row.final_station_name ?? ''}`,
            ),
          );
          for (const row of (data as InfoRow[]) || []) {
            const key = `${row.marker_id ?? ''}|${row.facility_code ?? ''}|${row.final_station_name ?? ''}`;
            if (!byKey.has(key)) {
              byKey.add(key);
              infoRows.push(row);
            }
          }
        }

        // DB information 이 비어 있는 국소는 마커 필드로 보완
        const coveredIds = new Set(
          infoRows.map((row) => row.marker_id).filter(Boolean),
        );
        const coveredCodes = new Set(
          infoRows.map((row) => row.facility_code).filter(Boolean),
        );
        for (const related of relatedEquipmentMarkers) {
          const hasRow =
            coveredIds.has(related.id) ||
            (related.facilityCode && coveredCodes.has(related.facilityCode));
          if (!hasRow) {
            infoRows.push(toInfoRowFromEquipment(related));
          }
        }

        setDetailedInfo(infoRows);
      } catch (err) {
        console.error('연관 상세 정보 조회 실패:', err);
        setDetailedInfo(relatedEquipmentMarkers.map(toInfoRowFromEquipment));
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetail();
    setSelectedCells(new Set());
  }, [
    isDetailOpen,
    selectedMarkerId,
    mode,
    marker,
    supabase,
    relatedEquipmentMarkers,
  ]);

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
      headers = [
        '구분',
        '시설연도',
        '프로젝트코드',
        '통합시설코드',
        '사업구분',
        '국소명-최종',
        '장비타입',
        '시설일',
        '개통일',
      ];

      rowsData = equipmentRows.map((row) => [
        row.group_role || '',
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
      const items = batteryMarker?.items || [];
      rowsData = items.map((item: BatterySpecItem) => [
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
      const row = equipmentRows[r];
      if (!row) return '';
      switch (c) {
        case 0: return row.group_role || '';
        case 1: return row.facility_year || '';
        case 2: return row.project_code || '';
        case 3: return row.facility_code || '';
        case 4: return row.business_type || '';
        case 5: return row.final_station_name || '';
        case 6: return row.eq_type || '';
        case 7: return row.install_date ? row.install_date.split('T')[0] : '';
        case 8: return row.open_date ? row.open_date.split('T')[0] : '';
        default: return '';
      }
    } else {
      const items = batteryMarker?.items || [];
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
  const subCount = Math.max(relatedEquipmentMarkers.length - 1, 0);

  return (
    <Dialog open={isDetailOpen} onOpenChange={(open) => !open && closeAllModals()}>
      <DialogContent className="flex max-h-[90vh] w-max max-w-[98vw] flex-col gap-0 overflow-hidden bg-slate-900 border-slate-800 p-0 text-slate-100 shadow-2xl rounded-2xl">
        <div className="shrink-0 border-b border-slate-800 px-6 pb-4 pt-6 pr-12">
          <DialogHeader className="flex flex-row items-center gap-3 space-y-0 text-left">
            <div className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />
            <DialogTitle className="text-lg font-bold text-slate-100">
              마커 상세 정보
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [scrollbar-gutter:stable]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* 기본 정보 */}
            <div className="space-y-3 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">기본 정보</h4>
              <div>
                <label className="text-[10px] font-medium text-slate-500">장소 이름</label>
                <div className="mt-0.5 text-sm font-semibold text-slate-200">{marker.name}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-slate-500">위도</label>
                  <div className="mt-0.5 font-mono text-xs">{marker.lat}</div>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500">경도</label>
                  <div className="mt-0.5 font-mono text-xs">{marker.lng}</div>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-500">메모</label>
                <div className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                  {marker.memo || '입력된 메모가 없습니다.'}
                </div>
              </div>
            </div>

            {/* 주소 및 부가정보 */}
            <div className="space-y-3 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">위치 정보</h4>
              <div>
                <label className="text-[10px] font-medium text-slate-500">주소 (지번)</label>
                <div className="mt-0.5 text-xs text-slate-200">
                  {mode === 'equipment'
                    ? equipmentMarker?.jibunAddress || '주소 정보 없음'
                    : batteryMarker?.address || '주소 정보 없음'}
                </div>
              </div>
              {mode === 'equipment' && equipmentMarker?.roadAddress ? (
                <div>
                  <label className="text-[10px] font-medium text-slate-500">도로명 주소</label>
                  <div className="mt-0.5 text-xs text-slate-300">{equipmentMarker.roadAddress}</div>
                </div>
              ) : null}
              <div>
                <label className="text-[10px] font-medium text-slate-500">태그</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {marker.tags && marker.tags.length > 0 ? (
                    marker.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="rounded-full border border-slate-700/55 bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300"
                      >
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
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-300">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="truncate">
                {mode === 'equipment'
                  ? `연관 상세 장비 목록${subCount > 0 ? ` (동일 번지 ${equipmentRows.length}건)` : ''}`
                  : '연관 축전지 상세 사양'}
              </span>
              <span className="hidden items-center gap-1 text-[10px] font-normal text-slate-500 sm:flex">
                <Lock className="h-2.5 w-2.5" />
                셀 드래그 선택 후 복사 지원
              </span>
            </h4>
            <div className="flex shrink-0 gap-2">
              {selectedCells.size > 0 && (
                <button
                  onClick={handleCopySelected}
                  className="flex items-center gap-1 rounded-lg border border-emerald-500/50 bg-emerald-600/20 px-2.5 py-1.5 text-[10px] font-medium text-emerald-300 transition-all hover:bg-emerald-600/30"
                >
                  <Check className="h-3 w-3" />
                  선택 셀 복사
                </button>
              )}
              <button
                onClick={handleCopyTable}
                className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[10px] font-medium text-slate-200 transition-all hover:bg-slate-700"
              >
                <Copy className="h-3 w-3" />
                표 전체 복사
              </button>
            </div>
          </div>

          <div className="max-h-[min(30vh,280px)] overflow-y-auto overflow-x-hidden rounded-lg border border-slate-800 [scrollbar-gutter:stable]">
            <table className="border-collapse text-left text-xs text-slate-300 select-none">
              <thead className="text-slate-400 font-semibold border-b border-slate-800">
                {mode === 'equipment' ? (
                  <tr>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>구분</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>시설연도</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>프로젝트코드</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>통합시설코드</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>사업구분</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>국소명-최종</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>장비타입</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>시설일</th>
                    <th className={DETAIL_TABLE_STICKY_TH_LAST}>개통일</th>
                  </tr>
                ) : (
                  <tr>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>ERP명</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>주소</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>용량(AH)</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>수량(Cell)</th>
                    <th className={`${DETAIL_TABLE_STICKY_TH} border-r border-slate-800`}>창고/국소/국사명</th>
                    <th className={DETAIL_TABLE_STICKY_TH_LAST}>등록일</th>
                  </tr>
                )}
              </thead>
              <tbody onMouseUp={handleMouseUp}>
                {isLoading ? (
                  <tr>
                    <td colSpan={mode === 'equipment' ? 9 : 6} className="text-center p-6 text-slate-500 font-medium">
                      상세 정보를 로드하는 중...
                    </td>
                  </tr>
                ) : mode === 'equipment' ? (
                  equipmentRows.map((row, rIdx) => {
                    const cells = [
                      row.group_role,
                      row.facility_year,
                      row.project_code,
                      row.facility_code,
                      row.business_type,
                      row.final_station_name,
                      row.eq_type,
                      row.install_date ? row.install_date.split('T')[0] : '',
                      row.open_date ? row.open_date.split('T')[0] : '',
                    ];
                    const lastIdx = cells.length - 1;
                    return (
                      <tr key={rIdx} className="border-b border-slate-800 hover:bg-slate-850/40">
                        {cells.map((val, cIdx) => {
                          const isSel = selectedCells.has(`${rIdx},${cIdx}`);
                          const isLast = cIdx === lastIdx;
                          return (
                            <td
                              key={cIdx}
                              onMouseDown={() => handleMouseDown(rIdx, cIdx)}
                              onMouseOver={() => handleMouseOver(rIdx, cIdx)}
                              className={`${isLast ? DETAIL_TABLE_TD_LAST : DETAIL_TABLE_TD} ${isSel ? 'bg-blue-900/30 text-blue-200' : ''}`}
                            >
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                ) : (
                  // 축전지 목록
                  (batteryMarker?.items || []).map((item: BatterySpecItem, rIdx: number) => {
                    const cells = [
                      item.erpName,
                      item.address,
                      item.capacity,
                      item.quantity,
                      item.stationName,
                      item.createdAt ? item.createdAt.split('T')[0] : '',
                    ];
                    const lastIdx = cells.length - 1;
                    return (
                      <tr key={rIdx} className="border-b border-slate-800 hover:bg-slate-850/40">
                        {cells.map((val, cIdx) => {
                          const isSel = selectedCells.has(`${rIdx},${cIdx}`);
                          const isLast = cIdx === lastIdx;
                          return (
                            <td
                              key={cIdx}
                              onMouseDown={() => handleMouseDown(rIdx, cIdx)}
                              onMouseOver={() => handleMouseOver(rIdx, cIdx)}
                              className={`${isLast ? DETAIL_TABLE_TD_LAST : DETAIL_TABLE_TD} ${isSel ? 'bg-blue-900/30 text-blue-200' : ''}`}
                            >
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

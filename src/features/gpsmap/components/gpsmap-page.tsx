'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Crosshair, Eye, FileDown, Lock, Rows2, Search, Square } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useKakaoMapSdk } from '@/features/map-marker/hooks/use-kakao-map-sdk';
import { useAuthSession } from '@/features/map-marker/hooks/use-auth-session';
import { useHasMounted } from '@/hooks/use-has-mounted';
import {
  VworldMapPane,
  type VworldMapHandle,
} from '@/features/gpsmap/components/vworld-map-pane';
import { RoadviewPane } from '@/features/gpsmap/components/roadview-pane';
import { runSingleLookup, type GpsLookupResult } from '@/features/gpsmap/lib/lookup';
import {
  dmsToDecimal,
  splitDmsParts,
  validateKoreaCoordPair,
} from '@/features/gpsmap/lib/coords';
import {
  parseBatchInputs,
  runBatchLookup,
  type BatchRow,
} from '@/features/gpsmap/lib/batch-lookup';
import {
  downloadBatchExcel,
  downloadSingleExcel,
} from '@/features/gpsmap/lib/export-excel';

type WorkMode = 'single' | 'batch';

type DmsFields = {
  latD: string; latM: string; latS: string; latCS: string;
  lonD: string; lonM: string; lonS: string; lonCS: string;
};

const EMPTY_DMS: DmsFields = {
  latD: '', latM: '', latS: '', latCS: '',
  lonD: '', lonM: '', lonS: '', lonCS: '',
};

// 카카오 레벨 ↔ Leaflet 줌 (원본 GPSMAP과 동일: 20 - 값, 축척 맞춤)
const leafletZoomFromKakaoLevel = (level: number) =>
  Math.max(7, Math.min(20, 20 - Math.round(level || 3)));
const kakaoLevelFromLeafletZoom = (zoom: number) =>
  Math.max(1, Math.min(14, 20 - Math.round(zoom || 17)));

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-slate-800">
      <th className="w-24 bg-slate-900/60 px-2 py-1.5 text-left font-medium text-slate-400">
        {label}
      </th>
      <td className="break-all px-2 py-1.5 text-slate-100">{value || '-'}</td>
    </tr>
  );
}

export function GpsMapPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthSession();
  const hasMounted = useHasMounted();
  const { isReady, error: sdkError } = useKakaoMapSdk();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<KakaoMap | null>(null);
  const polygonsRef = useRef<KakaoPolygon[]>([]);
  const markerRef = useRef<KakaoMarker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lookupInputRef = useRef<(text: string) => Promise<void>>(async () => {});
  const vworldRef = useRef<VworldMapHandle>(null);
  const kakaoSyncLockRef = useRef(false);
  // 로드뷰 선택 모드(카카오 방식): 파란 도로 오버레이 표시 후 도로 클릭 → 로드뷰
  const roadviewOverlayRef = useRef<KakaoRoadviewOverlay | null>(null);
  const roadviewModeRef = useRef(false);
  const openRoadviewSelectRef = useRef<(lat: number, lng: number) => void>(() => {});

  const [workMode, setWorkMode] = useState<WorkMode>('single');
  const [query, setQuery] = useState('');
  const [batchText, setBatchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GpsLookupResult | null>(null);
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [dms, setDms] = useState<DmsFields>(EMPTY_DMS);
  const [roadviewMode, setRoadviewMode] = useState(false);
  const [roadviewSpot, setRoadviewSpot] = useState<{ lat: number; lng: number } | null>(null);
  // 하단 브이월드 지적도 화면(pane) 표시 여부
  const [showVworldPane, setShowVworldPane] = useState(true);

  useEffect(() => {
    if (!isReady || !mapRef.current || mapInstanceRef.current || !window.kakao?.maps) {
      return;
    }
    const kakao = window.kakao;
    const map = new kakao.maps.Map(mapRef.current, {
      center: new kakao.maps.LatLng(36.5, 127.8),
      level: 13,
      mapTypeId: kakao.maps.MapTypeId.HYBRID,
    });
    mapInstanceRef.current = map;

    // 지도 클릭: 로드뷰 선택 모드면 클릭 지점 로드뷰, 아니면 해당 지점 조회
    kakao.maps.event.addListener(map, 'click', (...args: unknown[]) => {
      const mouseEvent = args[0] as { latLng?: KakaoLatLng } | undefined;
      const latlng = mouseEvent?.latLng;
      if (!latlng) return;
      const lat = latlng.getLat();
      const lng = latlng.getLng();
      if (roadviewModeRef.current) {
        openRoadviewSelectRef.current(lat, lng);
        return;
      }
      void lookupInputRef.current(`${lat}, ${lng}`);
    });

    // 카카오맵 이동/줌 → 하단 브이월드 지적도 동기화
    const pushToVworld = () => {
      if (kakaoSyncLockRef.current) return;
      const c = map.getCenter();
      vworldRef.current?.setView(
        c.getLat(),
        c.getLng(),
        leafletZoomFromKakaoLevel(map.getLevel()),
      );
    };
    kakao.maps.event.addListener(map, 'dragend', pushToVworld);
    kakao.maps.event.addListener(map, 'zoom_changed', pushToVworld);
  }, [isReady]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.kakao?.maps) return;
    const kakao = window.kakao;

    polygonsRef.current.forEach((polygon) => polygon.setMap(null));
    polygonsRef.current = [];
    markerRef.current?.setMap(null);
    markerRef.current = null;

    if (!result) return;

    const center = new kakao.maps.LatLng(result.center.lat, result.center.lng);
    const bounds = new kakao.maps.LatLngBounds();
    let hasBounds = false;

    result.parcels.forEach((ring) => {
      if (ring.length < 3) return;
      const path = ring.map((pt) => new kakao.maps.LatLng(pt.lat, pt.lng));
      const polygon = new kakao.maps.Polygon({
        path,
        strokeWeight: 3,
        strokeColor: '#ff2d78',
        strokeOpacity: 0.9,
        fillColor: '#ff2d78',
        fillOpacity: 0.12,
      });
      polygon.setMap(map);
      polygonsRef.current.push(polygon);
      path.forEach((latlng) => {
        bounds.extend(latlng);
        hasBounds = true;
      });
    });

    const marker = new kakao.maps.Marker({ position: center, zIndex: 5 });
    marker.setMap(map);
    markerRef.current = marker;

    const latParts = splitDmsParts(result.center.lat);
    const lonParts = splitDmsParts(result.center.lng);
    if (latParts && lonParts) {
      setDms({
        latD: String(latParts.d), latM: latParts.m, latS: latParts.s, latCS: latParts.cs,
        lonD: String(lonParts.d), lonM: lonParts.m, lonS: lonParts.s, lonCS: lonParts.cs,
      });
    }

    if (hasBounds) {
      bounds.extend(center);
      map.setBounds(bounds);
    } else {
      if (map.getLevel() > 3) map.setLevel(3);
      map.panTo(center);
    }

    // 하단 브이월드 지적도도 같은 위치·필지로 동기화
    vworldRef.current?.setView(
      result.center.lat,
      result.center.lng,
      leafletZoomFromKakaoLevel(map.getLevel()),
    );
    vworldRef.current?.setParcels(result.parcels);
  }, [result]);

  // 하단 브이월드 지도를 직접 움직이면 상단 카카오맵도 동기화
  const handleVworldMove = useCallback(
    (lat: number, lng: number, leafletZoom: number) => {
      const map = mapInstanceRef.current;
      if (!map || !window.kakao?.maps) return;
      kakaoSyncLockRef.current = true;
      map.setCenter(new window.kakao.maps.LatLng(lat, lng));
      map.setLevel(kakaoLevelFromLeafletZoom(leafletZoom));
      setTimeout(() => {
        kakaoSyncLockRef.current = false;
      }, 0);
    },
    [],
  );

  // 지적도 화면을 끄고 켜면 두 지도의 컨테이너 크기가 바뀌므로 재계산한다.
  // (카카오맵은 relayout, Leaflet은 invalidateSize 없이는 타일이 깨진다)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      mapInstanceRef.current?.relayout();
      if (showVworldPane) vworldRef.current?.invalidateSize();
    });
    return () => cancelAnimationFrame(raf);
  }, [showVworldPane]);

  const lookupInput = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await runSingleLookup(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회에 실패했습니다.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };
  // 최신 lookupInput을 지도 클릭 리스너(1회 등록)에서 참조하기 위한 ref
  lookupInputRef.current = lookupInput;

  const runSingle = () => lookupInput(query);

  const moveByDms = () => {
    const lat = dmsToDecimal(`${dms.latD} ${dms.latM} ${dms.latS} ${dms.latCS}`);
    const lon = dmsToDecimal(`${dms.lonD} ${dms.lonM} ${dms.lonS} ${dms.lonCS}`);
    const pair = validateKoreaCoordPair(lat, lon);
    if (!pair) {
      setError('GPS 좌표(도/분/초)를 확인하세요. (대한민국 범위 내)');
      return;
    }
    void lookupInput(`${pair.lat}, ${pair.lon}`);
  };

  // 로드뷰 선택 모드 토글 (카카오 방식): 파란 도로 오버레이 on/off
  roadviewModeRef.current = roadviewMode;
  const toggleRoadviewMode = () => {
    const map = mapInstanceRef.current;
    if (!isReady || !window.kakao?.maps || !map) return;
    const next = !roadviewMode;
    setRoadviewMode(next);
    if (!roadviewOverlayRef.current) {
      roadviewOverlayRef.current = new window.kakao.maps.RoadviewOverlay();
    }
    roadviewOverlayRef.current.setMap(next ? map : null);
  };

  // 로드뷰 선택 모드에서 도로 클릭 시: 인라인 로드뷰 열고 선택 모드 종료
  openRoadviewSelectRef.current = (lat: number, lng: number) => {
    setRoadviewSpot({ lat, lng });
    setRoadviewMode(false);
    roadviewOverlayRef.current?.setMap(null);
  };

  const runBatch = async () => {
    const inputs = parseBatchInputs(batchText);
    if (!inputs.length || loading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setResult(null);
    setBatchRows([]);

    try {
      const rows = await runBatchLookup(inputs, setBatchRows, {
        signal: controller.signal,
      });
      const firstDone = rows.find((row) => row.status === 'done' && row.result);
      if (firstDone?.result) {
        setResult(firstDone.result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '일괄 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const stopBatch = () => {
    abortRef.current?.abort();
  };

  const building = result?.building;
  const doneCount = batchRows.filter((row) => row.status === 'done').length;
  const errorCount = batchRows.filter((row) => row.status === 'error').length;

  const dmsCell = (
    key: keyof DmsFields,
    placeholder: string,
    widthClass = 'w-7',
  ) => (
    <input
      value={dms[key]}
      onChange={(e) => setDms((prev) => ({ ...prev, [key]: e.target.value }))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          moveByDms();
        }
      }}
      placeholder={placeholder}
      inputMode="decimal"
      className={`h-7 ${widthClass} shrink-0 rounded border border-slate-700 bg-slate-900/60 text-center text-[11px] text-slate-100 outline-none focus:border-slate-500`}
    />
  );

  // 로그인 상태에서만 접근 가능 (URL 직접 접근 포함)
  if (!hasMounted || isAuthLoading) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-slate-950 text-sm text-slate-400">
        불러오는 중...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800">
            <Lock className="h-6 w-6 text-slate-400" />
          </div>
          <h1 className="text-base font-bold">로그인이 필요합니다</h1>
          <p className="text-[13px] leading-relaxed text-slate-400">
            주소/좌표 통합 변환기는 로그인한 사용자만 이용할 수 있습니다.
            지도로 돌아가 로그인해 주세요.
          </p>
          <Link
            href="/"
            className="mt-1 flex h-9 items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-4 text-[13px] font-medium text-white hover:bg-indigo-500"
          >
            <ArrowLeft className="h-4 w-4" />
            지도로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-slate-950 text-slate-100">
      <aside className="flex w-[420px] flex-shrink-0 flex-col gap-3 overflow-y-auto border-r border-slate-800 p-4">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 text-slate-400 hover:bg-slate-800"
            title="지도로 돌아가기"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-bold">주소/좌표 통합 변환기</h1>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-1">
          <button
            type="button"
            className={`h-8 rounded-md text-xs ${workMode === 'single' ? 'bg-slate-700 text-slate-100' : 'text-slate-400'}`}
            onClick={() => setWorkMode('single')}
          >
            단건 조회
          </button>
          <button
            type="button"
            className={`h-8 rounded-md text-xs ${workMode === 'batch' ? 'bg-slate-700 text-slate-100' : 'text-slate-400'}`}
            onClick={() => setWorkMode('batch')}
          >
            일괄 변환
          </button>
        </div>

        {workMode === 'single' ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void runSingle();
                  }
                }}
                placeholder="주소, 상호명, GPS 또는 좌표"
                className="h-9 border-slate-700 bg-slate-900/60 pl-8 text-xs"
              />
            </div>
            <div className="flex gap-1.5">
              <Button
                type="button"
                className="h-9 flex-1 text-xs"
                disabled={loading || !query.trim()}
                onClick={() => void runSingle()}
              >
                {loading ? '조회 중...' : '조회'}
              </Button>
              {result ? (
                <Button
                  type="button"
                  className="h-9 text-xs"
                  variant="outline"
                  onClick={() => downloadSingleExcel(result)}
                >
                  <FileDown className="mr-1 h-3.5 w-3.5" />
                  엑셀
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              rows={8}
              placeholder={'한 줄에 하나씩 입력\n예)\n광주광역시 광산구 풍영로 63\n35.1777, 126.8109'}
              className="w-full resize-y rounded-md border border-slate-700 bg-slate-900/60 p-2 text-xs text-slate-100 outline-none focus:border-slate-500"
            />
            <div className="flex gap-1.5">
              <Button
                type="button"
                className="h-9 flex-1 text-xs"
                disabled={loading || !parseBatchInputs(batchText).length}
                onClick={() => void runBatch()}
              >
                {loading ? '일괄 조회 중...' : '일괄 조회'}
              </Button>
              {loading ? (
                <Button
                  type="button"
                  className="h-9 text-xs"
                  variant="outline"
                  onClick={stopBatch}
                >
                  <Square className="mr-1 h-3 w-3" />
                  중지
                </Button>
              ) : null}
              {batchRows.length > 0 && !loading ? (
                <Button
                  type="button"
                  className="h-9 text-xs"
                  variant="outline"
                  onClick={() => downloadBatchExcel(batchRows)}
                >
                  <FileDown className="mr-1 h-3.5 w-3.5" />
                  엑셀
                </Button>
              ) : null}
            </div>
            {batchRows.length > 0 ? (
              <p className="text-[10px] text-slate-500">
                진행 {doneCount + errorCount}/{batchRows.length}
                {errorCount > 0 ? ` · 실패 ${errorCount}` : ''}
              </p>
            ) : (
              <p className="text-[10px] text-slate-500">
                여러 건을 순차 조회한 뒤 엑셀로 내려받을 수 있습니다.
              </p>
            )}
          </div>
        )}

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
          <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold tracking-wide text-slate-400">
            <Crosshair className="h-3 w-3" /> GPS 좌표(도분초) 강제 이동
          </div>
          <div className="flex flex-nowrap items-center gap-0.5">
            <span className="shrink-0 text-[10px] text-slate-500">위도</span>
            {dmsCell('latD', '37', 'w-8')}
            {dmsCell('latM', '34')}
            {dmsCell('latS', '46')}
            {dmsCell('latCS', '08')}
            <span className="ml-1 shrink-0 text-[10px] text-slate-500">경도</span>
            {dmsCell('lonD', '126', 'w-9')}
            {dmsCell('lonM', '58')}
            {dmsCell('lonS', '43')}
            {dmsCell('lonCS', '47')}
            <Button
              type="button"
              className="ml-1 h-7 shrink-0 px-2 text-[11px]"
              variant="secondary"
              disabled={loading}
              onClick={moveByDms}
            >
              이동
            </Button>
          </div>
        </div>

        {error ? <p className="text-[11px] text-rose-400">{error}</p> : null}

        {workMode === 'batch' && batchRows.length > 0 ? (
          <div className="max-h-48 overflow-auto rounded-lg border border-slate-800">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-slate-950 text-slate-400">
                <tr>
                  <th className="p-1.5 text-left">#</th>
                  <th className="p-1.5 text-left">입력</th>
                  <th className="p-1.5 text-left">상태</th>
                </tr>
              </thead>
              <tbody>
                {batchRows.map((row) => (
                  <tr
                    key={row.index}
                    className="cursor-pointer border-t border-slate-800 hover:bg-slate-900/80"
                    onClick={() => {
                      if (row.result) setResult(row.result);
                    }}
                  >
                    <td className="p-1.5 text-slate-500">{row.index + 1}</td>
                    <td className="max-w-[180px] truncate p-1.5 text-slate-200">
                      {row.input}
                    </td>
                    <td className="p-1.5">
                      {row.status === 'done' ? (
                        <span className="text-emerald-400">완료</span>
                      ) : row.status === 'error' ? (
                        <span className="text-rose-400" title={row.error}>
                          실패
                        </span>
                      ) : row.status === 'running' ? (
                        <span className="text-amber-300">조회중</span>
                      ) : (
                        <span className="text-slate-500">대기</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {result ? (
          <>
            <div>
              <div className="mb-1 text-[11px] font-semibold tracking-wide text-slate-400">
                변환 결과
              </div>
              <table className="w-full text-[11px]">
                <tbody>
                  <Row label="검색출처" value={result.source} />
                  <Row label="구 주소" value={result.oldAddress} />
                  <Row label="신 주소" value={result.roadAddress} />
                  <Row label="우편번호" value={result.zipcode} />
                  <Row
                    label="좌표"
                    value={`${result.center.lat.toFixed(6)}, ${result.center.lng.toFixed(6)}`}
                  />
                  <Row label="위도(도분초)" value={result.latDms} />
                  <Row label="경도(도분초)" value={result.lngDms} />
                  <Row label="구글좌표" value={result.googleCoord} />
                  <Row label="PNU" value={result.pnu} />
                </tbody>
              </table>
            </div>

            <div>
              <div className="mb-1 text-[11px] font-semibold tracking-wide text-slate-400">
                건축물대장
              </div>
              {building ? (
                <table className="w-full text-[11px]">
                  <tbody>
                    <Row label="건물명칭" value={building.name} />
                    <Row label="동명칭" value={building.dongName} />
                    <Row label="지상층수" value={building.groundFloors} />
                    <Row label="지하층수" value={building.basementFloors} />
                    <Row label="연면적" value={building.totalArea} />
                    <Row label="대지면적" value={building.platArea} />
                    <Row label="건축면적" value={building.buildingArea} />
                    <Row label="주용도" value={building.mainUse} />
                    <Row label="세부용도" value={building.detailUse} />
                  </tbody>
                </table>
              ) : (
                <p className="text-[11px] text-slate-500">
                  건축물대장 조회 결과가 없습니다. (VWorld 국가중점 API 권한·PNU 확인)
                </p>
              )}
            </div>
          </>
        ) : null}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-1 p-1">
        {/* 상단: 카카오 위성 지도 */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md">
          <div ref={mapRef} className="h-full w-full" />
          {isReady && !roadviewSpot ? (
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-slate-950/80 px-2.5 py-1 text-[11px] shadow">
              {roadviewMode ? (
                <span className="text-amber-300">
                  🚶 파란 도로 위를 클릭하면 로드뷰가 열립니다
                </span>
              ) : (
                <span className="text-slate-300">
                  🟨 카카오 위성 · 클릭하면 해당 지점을 조회합니다
                </span>
              )}
            </div>
          ) : null}
          {isReady && !roadviewSpot ? (
            <button
              type="button"
              onClick={toggleRoadviewMode}
              title={
                roadviewMode
                  ? '로드뷰 선택 모드 끄기'
                  : '로드뷰: 켠 뒤 도로를 클릭하세요'
              }
              className={
                roadviewMode
                  ? 'absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-rose-400/60 bg-rose-500/90 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow hover:bg-rose-500'
                  : 'absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-900 shadow hover:bg-amber-400'
              }
            >
              <Eye className="h-3.5 w-3.5" />
              {roadviewMode ? '로드뷰 선택 중' : '로드뷰'}
            </button>
          ) : null}
          {loading && !roadviewSpot ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md bg-slate-950/80 px-2.5 py-1 text-[11px] text-amber-300 shadow">
              조회 중...
            </div>
          ) : null}
          {isReady && !roadviewSpot ? (
            <button
              type="button"
              onClick={() => setShowVworldPane((prev) => !prev)}
              title={
                showVworldPane
                  ? '브이월드 지적도 화면 끄기 (카카오맵 전체 보기)'
                  : '브이월드 지적도 화면 켜기 (2분할)'
              }
              className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 shadow hover:bg-slate-800"
            >
              <Rows2 className="h-3.5 w-3.5" />
              {showVworldPane ? '지적도 화면 끄기' : '지적도 화면 켜기'}
            </button>
          ) : null}
          {!isReady ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-sm text-slate-300">
              {sdkError ? `지도 로딩 실패: ${sdkError}` : '지도 로딩 중...'}
            </div>
          ) : null}
          {roadviewSpot ? (
            <RoadviewPane
              lat={roadviewSpot.lat}
              lng={roadviewSpot.lng}
              onClose={() => setRoadviewSpot(null)}
            />
          ) : null}
        </div>

        {/* 하단: 브이월드 지적도 (교차 검증) — 끄면 카카오맵이 전체를 차지 */}
        {/* 위치·필지 상태 유지를 위해 언마운트하지 않고 숨김 처리한다. */}
        <div
          className={`relative min-h-0 overflow-hidden rounded-md ${
            showVworldPane ? 'flex-1' : 'hidden'
          }`}
        >
          <VworldMapPane ref={vworldRef} onUserMove={handleVworldMove} />
        </div>
      </main>
    </div>
  );
}

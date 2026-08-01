"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Crosshair,
  Download,
  ExternalLink,
  Eye,
  FileDown,
  Loader2,
  MapPin,
  Search,
  SquareStack,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { createLocationMarker } from "@/features/map-marker/lib/location-marker";
import { dmsToDecimal, validateKoreaCoordPair } from "@/features/gpsmap/lib/coords";
import { runSingleLookup } from "@/features/gpsmap/lib/lookup";
import {
  parseBatchInputs,
  runBatchLookup,
  type BatchRow,
} from "@/features/gpsmap/lib/batch-lookup";
import {
  downloadBatchExcel,
  downloadSingleExcel,
} from "@/features/gpsmap/lib/export-excel";
import { GpsResultTable } from "@/features/gpsmap/components/gps-result-table";
import { LocationExcelSection } from "@/features/map-marker/components/sidebar/location-excel-section";
import type { GpsLookupResult } from "@/features/gpsmap/lib/lookup";
import type { LocationMarker } from "@/features/map-marker/types/marker";

type ConverterTab = "single" | "batch" | "excel";

const TABS: Array<{ key: ConverterTab; label: string }> = [
  { key: "single", label: "단건 조회" },
  { key: "batch", label: "일괄 변환" },
  { key: "excel", label: "엑셀" },
];

const STATUS_LABEL: Record<BatchRow["status"], string> = {
  done: "완료",
  running: "조회중",
  pending: "대기",
  error: "실패",
};

/**
 * 지도 메뉴의 위치 세그먼트 = 주소/좌표 통합 변환기 (계획서 §3.6).
 *
 * 조회 로직은 `features/gpsmap/lib/`를 그대로 쓴다 — `/gpsmap` 전체화면과
 * **같은 함수 한 벌**이라 결과가 갈리지 않는다. 여기서는 결과를
 * **지금 보고 있는 지도에** 임시 마커로 찍는다(화면을 떠났다 돌아올 필요가 없다).
 */
export function GpsConverterPanel() {
  const { toast } = useToast();
  const addPendingMarkers = useMapMarkerStore((state) => state.addPendingMarkers);
  const setPlaceSearch = useMapMarkerStore((state) => state.setPlaceSearch);
  const openRoadview = useMapMarkerStore((state) => state.openRoadview);
  const isVworldParcelVisible = useMapMarkerStore(
    (state) => state.isVworldParcelVisible,
  );
  const setVworldParcelVisible = useMapMarkerStore(
    (state) => state.setVworldParcelVisible,
  );
  const mapPickMode = useMapMarkerStore((state) => state.mapPickMode);
  const setMapPickMode = useMapMarkerStore((state) => state.setMapPickMode);
  const pickedPoint = useMapMarkerStore((state) => state.pickedPoint);
  const setPickedPoint = useMapMarkerStore((state) => state.setPickedPoint);
  const isVworldPaneOpen = useMapMarkerStore((state) => state.isVworldPaneOpen);
  const setVworldPaneOpen = useMapMarkerStore((state) => state.setVworldPaneOpen);

  const [tab, setTab] = useState<ConverterTab>("single");
  const [query, setQuery] = useState("");
  const [batchText, setBatchText] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [single, setSingle] = useState<GpsLookupResult | null>(null);
  const [rows, setRows] = useState<BatchRow[]>([]);
  // 도·분·초·1/100초 4칸. `/gpsmap`과 같은 구성이라 값을 그대로 옮겨 적을 수 있다.
  const [dms, setDms] = useState({
    latD: "",
    latM: "",
    latS: "",
    latCS: "",
    lonD: "",
    lonM: "",
    lonS: "",
    lonCS: "",
  });

  const abortRef = useRef<AbortController | null>(null);
  const batchCount = useMemo(() => parseBatchInputs(batchText).length, [batchText]);
  const doneCount = rows.filter((row) => row.status === "done").length;

  /** 조회 결과를 지도로 옮긴다. 임시 마커 + 필지 경계 + 지도 이동. */
  const dropMarkers = (results: GpsLookupResult[]) => {
    const markers: LocationMarker[] = results.map((result, index) =>
      createLocationMarker({
        lat: result.center.lat,
        lng: result.center.lng,
        name: result.input || result.roadAddress || `위치 ${index + 1}`,
        address: result.roadAddress || result.oldAddress,
      }),
    );
    if (markers.length === 0) return;

    addPendingMarkers("location", markers);

    /*
     * 첫 결과로 지도를 옮기고 VWorld 필지 경계를 함께 넘긴다.
     * `runSingleLookup`은 링 배열(`LatLng[][]`)을 주는데 지도는 `Parcel[]`을 받으므로
     * 여기서 모양을 맞춘다. 표시 여부는 스토어 토글이 결정한다.
     */
    const first = results[0];
    setPlaceSearch({
      label: markers[0].name,
      center: { lat: markers[0].lat, lng: markers[0].lng },
      parcels:
        first.parcels.length > 0
          ? [{ rings: first.parcels.map((ring) => ring.map((p) => ({ lat: p.lat, lng: p.lng }))) }]
          : [],
    });
  };

  /** 결과 지점의 로드뷰를 연다. 모달은 페이지가 소유한다. */
  const openResultRoadview = (result: GpsLookupResult) => {
    openRoadview(
      result.center.lat,
      result.center.lng,
      result.roadAddress || result.oldAddress || result.input,
    );
  };

  const runSingle = async (input?: string) => {
    const target = (input ?? query).trim();
    if (!target || isBusy) return;

    setIsBusy(true);
    setError(null);
    try {
      const result = await runSingleLookup(target);
      setSingle(result);
      dropMarkers([result]);
    } catch (err) {
      setSingle(null);
      setError(err instanceof Error ? err.message : "조회에 실패했습니다.");
    } finally {
      setIsBusy(false);
    }
  };

  const runBatch = async () => {
    const inputs = parseBatchInputs(batchText);
    if (inputs.length === 0 || isBusy) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsBusy(true);
    setError(null);
    try {
      const finished = await runBatchLookup(inputs, setRows, {
        signal: controller.signal,
      });
      const ok = finished
        .filter((row) => row.status === "done" && row.result)
        .map((row) => row.result as GpsLookupResult);
      dropMarkers(ok);
      toast({
        description: `변환 ${ok.length}건을 지도에 표시했습니다.${
          finished.length - ok.length > 0
            ? ` 실패 ${finished.length - ok.length}건`
            : ""
        }`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "일괄 변환에 실패했습니다.");
    } finally {
      setIsBusy(false);
    }
  };

  /*
   * 지도에서 찍은 지점을 조회한다. 좌표를 그대로 단건 조회에 넘기면
   * 역주소·필지·건축물대장까지 같은 경로로 채워진다.
   */
  const runSingleRef = useRef(runSingle);
  runSingleRef.current = runSingle;
  useEffect(() => {
    if (!pickedPoint) return;
    setPickedPoint(null);
    setTab("single");
    void runSingleRef.current(`${pickedPoint.lat}, ${pickedPoint.lng}`);
  }, [pickedPoint, setPickedPoint]);

  // 위치 세그먼트를 떠나면 클릭 모드를 끈다. 켜진 채로 남으면 평소 지도 클릭이 먹지 않는다.
  useEffect(() => {
    return () => {
      setMapPickMode("off");
    };
  }, [setMapPickMode]);

  /** 도분초를 십진수로 바꿔 그 지점으로 강제 이동한다. */
  const moveToDms = () => {
    const lat = dmsToDecimal(`${dms.latD} ${dms.latM} ${dms.latS} ${dms.latCS}`);
    const lng = dmsToDecimal(`${dms.lonD} ${dms.lonM} ${dms.lonS} ${dms.lonCS}`);
    if (lat === null || lng === null) {
      setError("도·분·초를 모두 입력하세요.");
      return;
    }
    if (!validateKoreaCoordPair(lat, lng)) {
      setError("국내 좌표 범위를 벗어났습니다.");
      return;
    }
    setError(null);
    void runSingle(`${lat}, ${lng}`);
  };

  return (
    <div className="space-y-2">
      {/* 지도를 어떻게 쓸지. `/gpsmap`의 지도 클릭 조회·로드뷰 선택을 여기서 켠다. */}
      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          aria-pressed={mapPickMode === "lookup"}
          onClick={() =>
            setMapPickMode(mapPickMode === "lookup" ? "off" : "lookup")
          }
          className={cn(
            "flex h-8 items-center justify-center gap-1 rounded-md border text-[10px] font-medium",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
            mapPickMode === "lookup"
              ? "border-indigo-500/60 bg-indigo-600/25 text-indigo-200"
              : "border-slate-700 text-slate-400 hover:text-slate-200",
          )}
        >
          <Crosshair className="h-3.5 w-3.5 shrink-0" aria-hidden />
          클릭 조회
        </button>
        <button
          type="button"
          aria-pressed={mapPickMode === "roadview"}
          onClick={() =>
            setMapPickMode(mapPickMode === "roadview" ? "off" : "roadview")
          }
          className={cn(
            "flex h-8 items-center justify-center gap-1 rounded-md border text-[10px] font-medium",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
            mapPickMode === "roadview"
              ? "border-amber-500/60 bg-amber-600/25 text-amber-200"
              : "border-slate-700 text-slate-400 hover:text-slate-200",
          )}
        >
          <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
          로드뷰
        </button>
        <button
          type="button"
          aria-pressed={isVworldPaneOpen}
          onClick={() => setVworldPaneOpen(!isVworldPaneOpen)}
          className={cn(
            "flex h-8 items-center justify-center gap-1 rounded-md border text-[10px] font-medium",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
            isVworldPaneOpen
              ? "border-emerald-500/60 bg-emerald-600/25 text-emerald-200"
              : "border-slate-700 text-slate-400 hover:text-slate-200",
          )}
        >
          <SquareStack className="h-3.5 w-3.5 shrink-0" aria-hidden />
          지적도 화면
        </button>
      </div>

      {mapPickMode !== "off" ? (
        <p className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1.5 text-[10px] leading-relaxed text-slate-300">
          {mapPickMode === "lookup"
            ? "지도를 클릭하면 그 지점을 조회합니다."
            : "로드뷰가 있는 도로가 파랗게 표시됩니다. 도로를 클릭하세요."}
        </p>
      ) : null}

      <div className="flex rounded-lg border border-slate-700/60 bg-black/20 p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "flex-1 rounded-md px-1 py-1.5 text-[11px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
              tab === item.key
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-slate-200",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "single" ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" aria-hidden />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void runSingle();
                }
              }}
              placeholder="주소·상호명 또는 위도, 경도"
              className="h-8 border-slate-700 bg-slate-900/60 pl-8 text-xs"
            />
          </div>
          <Button
            type="button"
            className="h-8 w-full text-xs"
            disabled={isBusy || !query.trim()}
            onClick={() => void runSingle()}
          >
            {isBusy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <MapPin className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isBusy ? "조회 중..." : "조회 후 지도에 표시"}
          </Button>

          <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2">
            <p className="mb-1.5 text-[10px] text-slate-400">GPS 좌표(도분초) 강제 이동</p>
            <div className="flex items-center gap-1">
              <span className="w-6 shrink-0 text-[10px] text-slate-500">위도</span>
              {(["latD", "latM", "latS", "latCS"] as const).map((key, idx) => (
                <Input
                  key={key}
                  value={dms[key]}
                  onChange={(e) => setDms((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={["37", "34", "46", "08"][idx]}
                  inputMode="numeric"
                  className="h-7 min-w-0 flex-1 border-slate-700 bg-slate-900/60 px-1 text-center text-[11px] tabular-nums"
                />
              ))}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <span className="w-6 shrink-0 text-[10px] text-slate-500">경도</span>
              {(["lonD", "lonM", "lonS", "lonCS"] as const).map((key, idx) => (
                <Input
                  key={key}
                  value={dms[key]}
                  onChange={(e) => setDms((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={["126", "58", "43", "47"][idx]}
                  inputMode="numeric"
                  className="h-7 min-w-0 flex-1 border-slate-700 bg-slate-900/60 px-1 text-center text-[11px] tabular-nums"
                />
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-1.5 h-7 w-full border-slate-700 text-[11px]"
              onClick={moveToDms}
              disabled={isBusy}
            >
              이동
            </Button>
          </div>

          {single ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 border-slate-700 text-[11px]"
                  onClick={() => downloadSingleExcel(single)}
                >
                  <FileDown className="mr-1 h-3.5 w-3.5" aria-hidden />
                  엑셀
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 border-slate-700 text-[11px]"
                  onClick={() => openResultRoadview(single)}
                >
                  <Eye className="mr-1 h-3.5 w-3.5" aria-hidden />
                  로드뷰
                </Button>
              </div>

              <p className="text-[11px] font-semibold text-slate-300">변환 결과</p>
              <GpsResultTable result={single} />
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "batch" ? (
        <div className="space-y-2">
          <Textarea
            value={batchText}
            onChange={(event) => setBatchText(event.target.value)}
            disabled={isBusy}
            placeholder={"한 줄에 하나씩\n광주 북구 월출동 695-6\n35.123, 126.987"}
            className="min-h-[88px] resize-y border-slate-700 bg-slate-900/60 text-xs"
          />
          <Button
            type="button"
            className="h-8 w-full text-xs"
            disabled={isBusy || batchCount === 0}
            onClick={() => void runBatch()}
          >
            {isBusy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <MapPin className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isBusy ? `변환 중... (${doneCount}/${rows.length})` : `일괄 변환 (${batchCount})`}
          </Button>

          {rows.length > 0 ? (
            <>
              {/* 셀은 줄바꿈하지 않고 표 상자만 가로 스크롤한다 (table-no-wrap) */}
              <div className="overflow-x-auto rounded-md border border-slate-800">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-slate-900/80 text-slate-400">
                      <th className="whitespace-nowrap px-2 py-1 text-left">입력</th>
                      <th className="whitespace-nowrap px-2 py-1 text-left">상태</th>
                      <th className="whitespace-nowrap px-2 py-1 text-left">좌표</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.index} className="border-t border-slate-800">
                        <td className="whitespace-nowrap px-2 py-1 text-slate-200" title={row.input}>
                          {row.input}
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap px-2 py-1",
                            row.status === "error" ? "text-rose-400" : "text-slate-400",
                          )}
                          title={row.error || undefined}
                        >
                          {STATUS_LABEL[row.status]}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 tabular-nums text-slate-300">
                          {row.result
                            ? `${row.result.center.lat.toFixed(5)}, ${row.result.center.lng.toFixed(5)}`
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-8 w-full border-slate-700 text-[11px]"
                onClick={() => downloadBatchExcel(rows)}
                disabled={doneCount === 0}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                엑셀로 내려받기 ({doneCount})
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "excel" ? <LocationExcelSection /> : null}

      {error ? <p className="text-[11px] text-rose-400">{error}</p> : null}

      {/* 조회한 필지 경계를 지도에 겹쳐 보여줄지. 끄면 경계선만 감추고 위치 마커는 남는다. */}
      <button
        type="button"
        role="switch"
        aria-checked={isVworldParcelVisible}
        onClick={() => setVworldParcelVisible(!isVworldParcelVisible)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-2 py-1.5 text-left hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <SquareStack className="h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden />
          <span className="truncate text-[11px] text-slate-200">
            브이월드 지적도(필지 경계)
          </span>
        </span>
        <span
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
            isVworldParcelVisible ? "bg-indigo-600" : "bg-slate-700",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
              isVworldParcelVisible ? "translate-x-4" : "translate-x-0.5",
            )}
          />
        </span>
      </button>

      <Link
        href="/gpsmap"
        className="flex h-7 items-center justify-center gap-1 rounded-md border border-slate-700 text-[10px] text-slate-400 hover:text-slate-200"
      >
        <ExternalLink className="h-3 w-3" aria-hidden />
        전체 화면으로 열기
      </Link>
    </div>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Loader2, MapPin, Search } from "lucide-react";
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
import { downloadBatchExcel } from "@/features/gpsmap/lib/export-excel";
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

  const [tab, setTab] = useState<ConverterTab>("single");
  const [query, setQuery] = useState("");
  const [batchText, setBatchText] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [single, setSingle] = useState<GpsLookupResult | null>(null);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [dms, setDms] = useState({ latD: "", latM: "", latS: "", lngD: "", lngM: "", lngS: "" });

  const abortRef = useRef<AbortController | null>(null);
  const batchCount = useMemo(() => parseBatchInputs(batchText).length, [batchText]);
  const doneCount = rows.filter((row) => row.status === "done").length;

  /** 조회 결과를 지도로 옮긴다. 임시 마커 + 지도 이동. */
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
    // 첫 결과로 지도를 옮겨 준다. 찍어 놓고 어디 있는지 못 찾으면 소용이 없다.
    setPlaceSearch({
      label: markers[0].name,
      center: { lat: markers[0].lat, lng: markers[0].lng },
      parcels: [],
    });
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

  /** 도분초를 십진수로 바꿔 그 지점으로 강제 이동한다. */
  const moveToDms = () => {
    const lat = dmsToDecimal(`${dms.latD}-${dms.latM}-${dms.latS}`);
    const lng = dmsToDecimal(`${dms.lngD}-${dms.lngM}-${dms.lngS}`);
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
            <p className="mb-1.5 text-[10px] text-slate-400">GPS 좌표(도분초)로 이동</p>
            <div className="grid grid-cols-3 gap-1">
              {(["latD", "latM", "latS"] as const).map((key, idx) => (
                <Input
                  key={key}
                  value={dms[key]}
                  onChange={(e) => setDms((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={["위도 도", "분", "초"][idx]}
                  className="h-7 border-slate-700 bg-slate-900/60 text-[11px]"
                />
              ))}
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1">
              {(["lngD", "lngM", "lngS"] as const).map((key, idx) => (
                <Input
                  key={key}
                  value={dms[key]}
                  onChange={(e) => setDms((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={["경도 도", "분", "초"][idx]}
                  className="h-7 border-slate-700 bg-slate-900/60 text-[11px]"
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
              해당 좌표로 이동
            </Button>
          </div>

          {single ? (
            <dl className="space-y-1 rounded-md border border-slate-800 bg-slate-900/40 p-2 text-[11px]">
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-slate-500">도로명</dt>
                <dd className="min-w-0 break-all text-slate-200">{single.roadAddress || "-"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-slate-500">지번</dt>
                <dd className="min-w-0 break-all text-slate-200">{single.oldAddress || "-"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-slate-500">좌표</dt>
                <dd className="min-w-0 break-all tabular-nums text-slate-200">
                  {single.center.lat.toFixed(6)}, {single.center.lng.toFixed(6)}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-slate-500">도분초</dt>
                <dd className="min-w-0 break-all tabular-nums text-slate-200">
                  {single.latDms} / {single.lngDms}
                </dd>
              </div>
            </dl>
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

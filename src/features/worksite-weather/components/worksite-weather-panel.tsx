"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkCheck, ChevronLeft, ChevronRight, Download, Save, Satellite, Search, Wind, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { geocodeAddress } from "@/features/map-marker/lib/geocode";
import { useMapMarkersQuery } from "@/features/map-marker/hooks/use-map-markers-query";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { HazardSummaryList } from "@/features/worksite-weather/components/hazard-summary-list";
import { TyphoonBanner } from "@/features/worksite-weather/components/typhoon-banner";
import { TyphoonModal } from "@/features/worksite-weather/components/typhoon-modal";
import { WeatherSatelliteModal } from "@/features/worksite-weather/components/weather-satellite-modal";
import { WeatherTimelineTable } from "@/features/worksite-weather/components/weather-timeline-table";
import { useWorksiteWeather } from "@/features/worksite-weather/hooks/use-worksite-weather";
import { exportTbmWorkbook } from "@/features/worksite-weather/lib/export-tbm";
import {
  batteryMarkerToCandidate,
  equipmentMarkerToCandidate,
  parseMultiKeywords,
  searchSitesMulti,
} from "@/features/worksite-weather/lib/site-search";
import {
  VERDICT_ICON,
  VERDICT_LABEL,
  type SiteMatch,
  type Verdict,
} from "@/features/worksite-weather/types/weather";

const OVERALL_TONE: Record<Verdict, string> = {
  unknown: "border-slate-700 bg-slate-900/60 text-slate-300",
  safe: "border-emerald-600/50 bg-emerald-950/40 text-emerald-200",
  caution: "border-amber-600/50 bg-amber-950/40 text-amber-200",
  warning: "border-orange-600/50 bg-orange-950/40 text-orange-200",
  danger: "border-rose-600/50 bg-rose-950/40 text-rose-200",
  stop: "border-rose-500 bg-rose-950/70 text-rose-100",
};

const MATCHED_BY_LABEL: Record<SiteMatch["matchedBy"], string> = {
  name: "국소명",
  alias: "별칭",
  address: "주소",
  geocode: "주소 검색",
  manual: "직접 지정",
};

function formatAlertIssuedAt(raw?: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.length < 8) return "";

  const month = parseInt(cleaned.slice(4, 6), 10);
  const day = parseInt(cleaned.slice(6, 8), 10);
  const hour = cleaned.length >= 10 ? parseInt(cleaned.slice(8, 10), 10) : 0;

  if (!month || !day) return "";

  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();

  // 오늘 발효된 경우: "오늘 11시"
  if (month === todayMonth && day === todayDay) {
    return `오늘 ${hour}시`;
  }

  // 이전에 발효되어 지속 중인 경우: "7/22부터 발효"
  return `${month}/${day}부터 발효`;
}

export function WorksiteWeatherPanel() {
  const [query, setQuery] = useState("");
  /** 사용자가 목록에서 명시적으로 고른 국소 id. null이면 목록 첫 항목이 선택된다. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 등록 국소에 없어 주소 검색으로 만든 임시 국소(목록 밖) */
  const [geocodeSite, setGeocodeSite] = useState<SiteMatch | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const { toast } = useToast();
  const { data: markersData } = useMapMarkersQuery();
  const mode = useMapMarkerStore((state) => state.mode);

  // 장비·축전지 또는 날씨 모드에서 국소 목록을 검색한다
  const candidates = useMemo(() => {
    if (!markersData) return [];
    if (mode === "equipment") {
      return markersData.equipmentMarkers.map(equipmentMarkerToCandidate);
    }
    if (mode === "battery") {
      return markersData.batteryMarkers.map(batteryMarkerToCandidate);
    }
    // 날씨 탭(weather 모드)에서는 장비+축전지 국소를 모두 통합 검색한다
    const eq = markersData.equipmentMarkers.map(equipmentMarkerToCandidate);
    const bat = markersData.batteryMarkers.map(batteryMarkerToCandidate);
    const seen = new Set<string>();
    const combined = [];
    for (const item of [...eq, ...bat]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        combined.push(item);
      }
    }
    return combined;
  }, [markersData, mode]);

  // 다중 검색 키워드(쉼표, 줄바꿈 등)를 모두 지원하는 검색
  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return searchSitesMulti(candidates, query);
  }, [candidates, query]);

  const setWeatherSearchMarkerIds = useMapMarkerStore(
    (state) => state.setWeatherSearchMarkerIds,
  );

  // 날씨 탭 검색 결과에 따른 지도 상 핀 마커 필터링 연동
  useEffect(() => {
    if (mode === "weather" && query.trim() && searchResults.length > 0) {
      const matchedIds = searchResults
        .map((s) => s.id)
        .filter((id) => !id.startsWith("geocode:"));
      setWeatherSearchMarkerIds(matchedIds);
    } else {
      setWeatherSearchMarkerIds(null);
    }
  }, [mode, query, searchResults, setWeatherSearchMarkerIds]);

  const activeKeywords = useMemo(() => parseMultiKeywords(query), [query]);

  const savedWeatherSites = useMapMarkerStore((state) => state.savedWeatherSites);
  const saveWeatherSites = useMapMarkerStore((state) => state.saveWeatherSites);
  const clearSavedWeatherSites = useMapMarkerStore(
    (state) => state.clearSavedWeatherSites,
  );
  const removeSavedWeatherSite = useMapMarkerStore(
    (state) => state.removeSavedWeatherSite,
  );

  const isSearchActive = Boolean(query.trim());
  const activeList = isSearchActive ? searchResults : savedWeatherSites;

  /**
   * 선택 국소는 상태를 따로 두지 않고 목록에서 파생시킨다.
   * 예전에는 useEffect 세 개가 각자 setSite를 호출해서, 사용자가 3번째를 고른 뒤
   * 검색어가 조금만 바뀌어도 1번째로 되돌아갔다.
   */
  const site: SiteMatch | null =
    geocodeSite ??
    activeList.find((item) => item.id === selectedId) ??
    activeList[0] ??
    null;

  const selectedIndex = site ? Math.max(0, activeList.findIndex((i) => i.id === site.id)) : 0;

  // 지도 이동은 선택이 바뀔 때 한 곳에서만 수행한다
  const focusedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!site || focusedIdRef.current === site.id) return;
    focusedIdRef.current = site.id;

    if (site.id.startsWith("geocode:")) {
      useMapMarkerStore.getState().setPlaceSearch({
        label: site.name,
        center: { lat: site.lat, lng: site.lng },
        parcels: [],
      });
    } else {
      useMapMarkerStore.getState().setSelectedMarkerId(site.id);
    }
  }, [site]);

  const selectSite = (match: SiteMatch) => {
    setSearchError(null);
    if (match.id.startsWith("geocode:")) {
      setGeocodeSite(match);
      return;
    }
    setGeocodeSite(null);
    setSelectedId(match.id);
  };

  /** 검색어가 바뀌면 이전 선택은 의미가 없다. 이벤트 시점에 비운다(effect로 되돌리지 않는다). */
  const changeQuery = (value: string) => {
    setQuery(value);
    setSelectedId(null);
    setGeocodeSite(null);
    setSearchError(null);
  };

  const resetSite = () => {
    setSelectedId(null);
    setGeocodeSite(null);
    setSearchError(null);
  };

  // 모드를 바꾸면 다른 국소 목록이므로 전부 초기화
  useEffect(() => {
    setQuery("");
    setSelectedId(null);
    setGeocodeSite(null);
    setSearchError(null);
  }, [mode]);

  const step = (delta: number) => {
    if (activeList.length === 0) return;
    const nextIdx = (selectedIndex + delta + activeList.length) % activeList.length;
    setGeocodeSite(null);
    setSelectedId(activeList[nextIdx].id);
  };

  const handlePrev = () => step(-1);
  const handleNext = () => step(1);

  const { data, isFetching, error } = useWorksiteWeather(site);

  /** 등록 국소에 없으면 브라우저 카카오 지오코딩으로 폴백한다. */
  const runGeocodeFallback = async () => {
    const trimmed = query.trim();
    if (!trimmed || isGeocoding) return;

    setIsGeocoding(true);
    setSearchError(null);
    try {
      const coords = await geocodeAddress(trimmed);
      if (!coords) {
        setSearchError("등록 국소·주소 어느 쪽에서도 찾지 못했습니다. 주소를 더 정확히 입력하세요.");
        return;
      }
      const geocodeSite: SiteMatch = {
        id: `geocode:${trimmed}`,
        name: trimmed,
        address: trimmed,
        lat: coords.lat,
        lng: coords.lng,
        workType: "ground",
        matchedBy: "geocode",
      };
      selectSite(geocodeSite);
    } catch {
      setSearchError("주소 검색에 실패했습니다.");
    } finally {
      setIsGeocoding(false);
    }
  };

  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = useState(false);
  const [isTyphoonModalOpen, setIsTyphoonModalOpen] = useState(false);

  return (
    <div className="space-y-2.5 pb-1">
      {/* 실시간 위성/레이더 날씨 지도 및 태풍 정보 모달 오픈 버튼 모음 */}
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-8 border border-sky-600/50 bg-gradient-to-r from-sky-950/80 via-slate-900 to-indigo-950/80 text-[11px] font-semibold text-sky-200 shadow-md transition-all hover:border-sky-400 hover:text-white"
          onClick={() => setIsSatelliteModalOpen(true)}
        >
          <Satellite className="mr-1 h-3.5 w-3.5 text-sky-400 animate-pulse" />
          위성/레이더 지도
        </Button>

        <Button
          type="button"
          size="sm"
          className="h-8 border border-rose-600/50 bg-gradient-to-r from-rose-950/80 via-slate-900 to-amber-950/80 text-[11px] font-semibold text-rose-200 shadow-md transition-all hover:border-rose-400 hover:text-white"
          onClick={() => setIsTyphoonModalOpen(true)}
        >
          <span className="mr-1 text-sm animate-spin">🌀</span>
          실시간 태풍 정보
        </Button>
      </div>

      {/* 저장된 작업 국소가 있을 때의 상단 헤더 & 전체삭제 (검색 중이 아닐 때) */}
      {!isSearchActive && savedWeatherSites.length > 0 ? (
        <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 text-xs font-semibold text-slate-200">
          <span className="flex items-center gap-1.5 text-sky-300">
            <BookmarkCheck className="h-4 w-4 text-sky-400" />
            오늘의 작업 국소 ({savedWeatherSites.length}건)
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] text-rose-300 hover:bg-rose-950/50 hover:text-rose-200"
            onClick={() => {
              clearSavedWeatherSites();
              resetSite();
            }}
          >
            전체 삭제
          </Button>
        </div>
      ) : null}

      <div className="relative">
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
        <Input
          value={query}
          onChange={(e) => changeQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (searchResults.length > 0) {
              selectSite(searchResults[selectedIndex] ?? searchResults[0]);
            } else {
              runGeocodeFallback();
            }
          }}
          placeholder="국소명 또는 주소 검색 (쉼표,로 다중 검색)..."
          className="h-8 border-slate-700 bg-slate-900/60 pl-8 text-xs text-slate-100 placeholder:text-slate-500"
        />
      </div>

      {/* 검색 결과가 있을 때: [오늘의 작업 국소로 저장] 버튼 */}
      {isSearchActive && searchResults.length > 0 ? (
        <Button
          type="button"
          size="sm"
          className="h-7 w-full border border-sky-700/60 bg-sky-950/70 text-[11px] font-medium text-sky-200 hover:bg-sky-900/80"
          onClick={() => {
            saveWeatherSites(searchResults);
            changeQuery("");
          }}
        >
          <Save className="mr-1.5 h-3.5 w-3.5 text-sky-400" />
          오늘의 작업 국소로 저장 ({searchResults.length}건)
        </Button>
      ) : null}

      {/* 중복/다중 검색 결과 또는 저장된 목록 네비게이션 컨트롤 (이전/다음 버튼) */}
      {activeList.length > 0 ? (
        <div className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-800/90 px-2 py-1 text-xs">
          <span className="truncate font-medium text-slate-200">
            {isSearchActive ? "검색" : "작업국소"}{" "}
            <span className="font-bold text-sky-400">{selectedIndex + 1}</span> / {activeList.length}건
            {isSearchActive && activeKeywords.length > 1 ? (
              <span className="ml-1 text-[10px] text-slate-400">
                ({activeKeywords.length}개 키워드)
              </span>
            ) : null}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40"
              onClick={handlePrev}
              disabled={activeList.length <= 1}
            >
              <ChevronLeft className="mr-0.5 h-3 w-3" />
              이전
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40"
              onClick={handleNext}
              disabled={activeList.length <= 1}
            >
              다음
              <ChevronRight className="ml-0.5 h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* 활성 목록 리스트 (검색 결과 목록 또는 저장된 작업 국소 목록) */}
      {activeList.length > 1 || (!isSearchActive && savedWeatherSites.length > 0) ? (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-slate-800 bg-slate-900/90 p-1">
          {activeList.map((match, idx) => {
            const isSelected = site?.id === match.id;
            return (
              <li key={match.id} className="group relative flex items-center">
                <button
                  type="button"
                  className={cn(
                    "w-full rounded px-2 py-1 text-left transition-colors",
                    isSelected
                      ? "border border-sky-500/50 bg-sky-950/60 font-medium text-sky-200"
                      : "text-slate-300 hover:bg-slate-800",
                  )}
                  onClick={() => selectSite(match)}
                >
                  <span className="block truncate text-[11px]">
                    {idx + 1}. {match.name}
                    <span className="ml-1 text-[9px] text-slate-400">
                      {MATCHED_BY_LABEL[match.matchedBy] || "저장국소"}
                    </span>
                  </span>
                  <span className="block truncate text-[10px] text-slate-500">
                    {match.address || "주소 없음"}
                  </span>
                </button>
                {!isSearchActive ? (
                  <button
                    type="button"
                    className="absolute right-1 top-1.5 hidden rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400 group-hover:block"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSavedWeatherSite(match.id);
                      if (site?.id === match.id) resetSite();
                    }}
                    title="저장 목록에서 삭제"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {!site && query.trim() && searchResults.length === 0 ? (
        <Button
          type="button"
          size="sm"
          className="h-8 w-full border border-slate-700 bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 hover:text-white"
          disabled={isGeocoding}
          onClick={runGeocodeFallback}
        >
          {isGeocoding ? "주소 검색 중..." : "등록 국소에 없음 — 주소로 검색"}
        </Button>
      ) : null}

      {searchError ? <p className="text-[10px] text-rose-400">{searchError}</p> : null}

      {site ? (
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold text-slate-200">{site.name}</p>
              <p className="truncate text-[10px] text-slate-500">
                {site.address || "주소 없음"} ·{" "}
                {site.workType === "elevated" ? "옥상·철탑" : "지상"}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 px-1.5 text-[10px] text-slate-400 hover:text-slate-200"
              onClick={resetSite}
            >
              초기화
            </Button>
          </div>

          {isFetching ? (
            <p className="text-[11px] text-slate-400">기상 정보를 불러오는 중...</p>
          ) : null}

          {error ? (
            <p className="text-[11px] text-rose-400">
              {error instanceof Error ? error.message : "기상 정보를 가져오지 못했습니다."}
            </p>
          ) : null}

          {data ? (
            <>
              <TyphoonBanner
                typhoon={data.typhoon}
                onOpenDetail={() => setIsTyphoonModalOpen(true)}
              />

              <div
                className={cn(
                  "rounded-lg border px-3 py-2 space-y-1.5 break-keep",
                  OVERALL_TONE[data.overall],
                )}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1">
                    {VERDICT_ICON[data.overall]} {VERDICT_LABEL[data.overall]}
                  </span>
                  <span className="text-[10px] font-normal opacity-90">
                    {data.recommendedWindows.length > 0
                      ? `권장 ${data.recommendedWindows.map((w) => `${w.from}~${w.to}시`).join(", ")}`
                      : "권장 시간대 없음"}
                  </span>
                </div>
                {data.alerts.length > 0 ? (
                  <div className="border-t border-slate-700/40 pt-1.5 text-[10px] leading-relaxed opacity-95 text-left break-keep">
                    발효 특보:{" "}
                    {Array.from(
                      new Map(
                        data.alerts.map((a) => {
                          const key = `${a.type}${a.level}`;
                          const timeStr = formatAlertIssuedAt(a.issuedAt);
                          const label = timeStr ? `${a.type}${a.level}(${timeStr})` : `${a.type}${a.level}`;
                          return [key, label];
                        }),
                      ).values(),
                    ).join(", ")}
                  </div>
                ) : null}
              </div>

              <div className="rounded-md border border-slate-800 p-1">
                <WeatherTimelineTable slots={data.timeline} />
              </div>

              <HazardSummaryList summary={data.hazardSummary} />

              {data.warnings.map((warning) => (
                <p key={warning} className="text-[10px] leading-relaxed text-amber-400">
                  ⚠️ {warning}
                </p>
              ))}

              <Button
                type="button"
                size="sm"
                className="h-8.5 w-full border border-slate-700 bg-slate-800 text-xs font-medium text-slate-100 shadow-sm transition-colors hover:bg-slate-700 hover:text-white active:bg-slate-900"
                onClick={() => {
                  // xlsx를 그 자리에서 내려받으므로 실패할 수 있다 (오프라인·청크 로드 실패)
                  exportTbmWorkbook(site, data).catch(() => {
                    toast({
                      variant: "destructive",
                      description: "TBM 자료 저장에 실패했습니다. 잠시 후 다시 시도하세요.",
                    });
                  });
                }}
              >
                <Download className="mr-1.5 h-3.5 w-3.5 text-slate-300" />
                TBM 자료로 저장
              </Button>

              <p className="text-[10px] leading-relaxed text-slate-500">⚠️ {data.disclaimer}</p>
            </>
          ) : null}
        </div>
      ) : (
        <p className="text-[10px] leading-relaxed text-slate-500">
          국소명이나 주소를 입력하면 당일 07~17시 시간대별 작업 가능 여부를 판정합니다.
        </p>
      )}

      {/* 실시간 위성/레이더 날씨 지도 모달 */}
      <WeatherSatelliteModal
        isOpen={isSatelliteModalOpen}
        onClose={() => setIsSatelliteModalOpen(false)}
      />

      {/* 실시간 태풍 기상 정보 모달 */}
      <TyphoonModal
        isOpen={isTyphoonModalOpen}
        onClose={() => setIsTyphoonModalOpen(false)}
        typhoon={data?.typhoon ?? null}
      />
    </div>
  );
}

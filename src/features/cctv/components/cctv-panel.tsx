"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { CctvSurveySummary } from "@/features/cctv/components/cctv-survey-summary";
import { CctvVideoModal } from "@/features/cctv/components/cctv-video-modal";
import {
  GWANGJU_JEONNAM_BBOX,
  ROAD_TYPES,
  TARGET_SGG_COUNT,
} from "@/features/cctv/constants/its-config";
import { useCctvQuery } from "@/features/cctv/hooks/use-cctv-query";
import type { CctvQuery } from "@/features/cctv/lib/cctv-api";

/**
 * 도로 CCTV 조회 패널 (장비 탭).
 *
 * 계획서 1단계 — 수집(§5.1)과 선결 확인(§10)까지만 구현한다.
 * 링크 매핑·시군구 귀속은 표준노드링크·행정경계 데이터가 있어야 하므로 미구현이다.
 */
export function CctvPanel() {
  const [selectedRoadTypes, setSelectedRoadTypes] = useState<string[]>(
    ROAD_TYPES.map((t) => t.code),
  );
  const [query, setQuery] = useState<CctvQuery | null>(null);

  const { data, isFetching, error } = useCctvQuery(query);
  const setCctvMarkers = useMapMarkerStore((state) => state.setCctvMarkers);
  const selectedCctv = useMapMarkerStore((state) => state.selectedCctv);
  const setSelectedCctv = useMapMarkerStore((state) => state.setSelectedCctv);

  const toggleRoadType = (code: string) => {
    setSelectedRoadTypes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const runQuery = () => {
    if (selectedRoadTypes.length === 0) return;
    setQuery({ bbox: GWANGJU_JEONNAM_BBOX, roadTypes: selectedRoadTypes });
  };

  // 조회 결과를 지도 레이어로 넘긴다. 목록은 사이드바에 두지 않는다.
  useEffect(() => {
    setCctvMarkers(data?.items ?? []);
  }, [data, setCctvMarkers]);

  // 패널을 벗어나면 지도에서도 걷어낸다
  useEffect(() => {
    return () => {
      setCctvMarkers([]);
      setSelectedCctv(null);
    };
  }, [setCctvMarkers, setSelectedCctv]);

  return (
    <div className="space-y-2.5 pb-1">
      <div className="rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-2 text-[10px] leading-relaxed text-slate-400">
        ITS 국가교통정보센터 공공 CCTV를 조회합니다. 조회 범위는 광주·전남 경계상자
        ({TARGET_SGG_COUNT}개 시군구 포함)이며, 사각형이라 인접 지역이 일부 섞입니다.
      </div>

      <div className="flex gap-1.5">
        {ROAD_TYPES.map((type) => {
          const active = selectedRoadTypes.includes(type.code);
          return (
            <button
              key={type.code}
              type="button"
              className={cn(
                "flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors",
                active
                  ? "border-teal-500/60 bg-teal-950/60 text-teal-200"
                  : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200",
              )}
              onClick={() => toggleRoadType(type.code)}
            >
              {type.label}
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        size="sm"
        className="h-8 w-full border border-teal-700/60 bg-teal-950/70 text-[11px] font-medium text-teal-200 hover:bg-teal-900/80"
        disabled={isFetching || selectedRoadTypes.length === 0}
        onClick={runQuery}
      >
        {isFetching ? (
          <>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            조회 중...
          </>
        ) : (
          <>
            <Video className="mr-1.5 h-3.5 w-3.5 text-teal-400" />
            CCTV 조회
          </>
        )}
      </Button>

      {error ? (
        <p className="text-[10px] leading-relaxed text-rose-400">
          {error instanceof Error ? error.message : "CCTV 정보를 가져오지 못했습니다."}
        </p>
      ) : null}

      {data ? (
        <>
          {data.items.length > 0 ? (
            <p className="rounded-md border border-teal-800/50 bg-teal-950/40 px-2.5 py-2 text-[10px] leading-relaxed text-teal-200">
              지도에 <span className="font-semibold">{data.items.length.toLocaleString()}대</span>{" "}
              표시 중 · 마커 클릭 시 영상, 우하단 버튼으로 켜고 끄기
            </p>
          ) : (
            <p className="text-[10px] text-slate-500">조회된 CCTV가 없습니다.</p>
          )}

          {data.warnings.map((warning) => (
            <p key={warning} className="text-[10px] leading-relaxed text-amber-400">
              ⚠️ {warning}
            </p>
          ))}

          {/*
            사전조사 결과는 계획서 §10 판정 근거다. 한 번 확인하면 매번 볼 필요는 없지만,
            표준노드링크 갱신·ITS 스펙 변경 때 다시 봐야 하므로 접어서 남겨 둔다.
          */}
          <details className="rounded-md border border-slate-800 bg-slate-900/60">
            <summary className="cursor-pointer px-2.5 py-1.5 text-[10px] text-slate-400 hover:text-slate-200">
              사전조사 결과 (계획서 §10) 보기
            </summary>
            <div className="space-y-2 px-2 pb-2">
              <CctvSurveySummary survey={data.survey} />
              <p className="text-[10px] leading-relaxed text-slate-500">⚠️ {data.notice}</p>
            </div>
          </details>
        </>
      ) : (
        <p className="text-[10px] leading-relaxed text-slate-500">
          링크 매핑·시군구 귀속은 표준노드링크와 행정경계 데이터가 필요해 아직 제공하지 않습니다.
        </p>
      )}

      <CctvVideoModal cctv={selectedCctv} onClose={() => setSelectedCctv(null)} />
    </div>
  );
}

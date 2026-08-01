"use client";

import { CircleDot, Layers, PieChart, Shapes } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { PanelSection } from "@/features/shell/components/panels/panel-section";

interface ToggleRowProps {
  label: string;
  hint?: string;
  isOn: boolean;
  onToggle: () => void;
}

function ToggleRow({ label, hint, isOn, onToggle }: ToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1.5 text-left hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <span className="min-w-0">
        <span className="block truncate text-[11px] text-slate-200">{label}</span>
        {hint ? (
          <span className="block truncate text-[10px] text-slate-500">{hint}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          isOn ? "bg-indigo-600" : "bg-slate-700",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            isOn ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

/**
 * 지도 표시 설정.
 *
 * 지도 우하단 플로팅 컨트롤은 그대로 둔다 — 줌·내 위치·영역 캡처처럼
 * 지도를 보면서 즉시 눌러야 하는 것들이 함께 있어서다. 여기는 한 번 정해 두는 값만 모은다.
 */
export function SettingsPanel() {
  const mode = useMapMarkerStore((state) => state.mode);
  const isClusteringEnabled = useMapMarkerStore((state) => state.isClusteringEnabled);
  const setClusteringEnabled = useMapMarkerStore((state) => state.setClusteringEnabled);
  const clusterIconStyle = useMapMarkerStore((state) => state.clusterIconStyle);
  const setClusterIconStyle = useMapMarkerStore((state) => state.setClusterIconStyle);
  const isCadastralMode = useMapMarkerStore((state) => state.isCadastralMode);
  const setCadastralMode = useMapMarkerStore((state) => state.setCadastralMode);

  return (
    <div className="space-y-3">
      <PanelSection icon={Layers} title="지도 표시" iconClassName="h-3.5 w-3.5 text-indigo-400">
        <ToggleRow
          label="지적편집도"
          hint="필지 경계를 겹쳐 본다"
          isOn={isCadastralMode}
          onToggle={() => setCadastralMode(!isCadastralMode)}
        />
      </PanelSection>

      <PanelSection icon={Shapes} title="클러스터" iconClassName="h-3.5 w-3.5 text-indigo-400">
        <ToggleRow
          label="클러스터링"
          hint="장비 모드에서만 적용된다"
          isOn={isClusteringEnabled}
          onToggle={() => setClusteringEnabled(!isClusteringEnabled)}
        />

        {isClusteringEnabled ? (
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setClusterIconStyle("donut")}
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-1 rounded-md border text-[11px]",
                clusterIconStyle === "donut"
                  ? "border-indigo-500/50 bg-indigo-600/20 text-indigo-200"
                  : "border-slate-700 text-slate-400 hover:text-slate-200",
              )}
            >
              <CircleDot className="h-3.5 w-3.5" aria-hidden />
              도넛
            </button>
            <button
              type="button"
              onClick={() => setClusterIconStyle("pie")}
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-1 rounded-md border text-[11px]",
                clusterIconStyle === "pie"
                  ? "border-indigo-500/50 bg-indigo-600/20 text-indigo-200"
                  : "border-slate-700 text-slate-400 hover:text-slate-200",
              )}
            >
              <PieChart className="h-3.5 w-3.5" aria-hidden />
              파이
            </button>
          </div>
        ) : null}

        {mode !== "equipment" ? (
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            지금 보고 있는 모드에는 클러스터가 적용되지 않는다. 지도에서 장비 세그먼트를 고르면 반영된다.
          </p>
        ) : null}
      </PanelSection>
    </div>
  );
}

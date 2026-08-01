"use client";

import { FileSpreadsheet, Filter, List } from "lucide-react";
import { BatteryExcelSection } from "@/features/map-marker/components/sidebar/battery-excel-section";
import { EquipmentExcelSection } from "@/features/map-marker/components/sidebar/equipment-excel-section";
import { EquipmentInfoSection } from "@/features/map-marker/components/sidebar/equipment-info-section";
import { FilterPanel } from "@/features/map-marker/components/sidebar/filter-panel";
import { MarkersListPanel } from "@/features/map-marker/components/sidebar/markers-list-panel";
import { PanelSection } from "@/features/shell/components/panels/panel-section";
import type { PanelDataProps } from "@/features/shell/components/panels/types";

/**
 * 마커관리 — **데이터를 어떻게 바꿀지**를 담당한다.
 *
 * 필터가 지도에도 있는 건 중복이 아니다. 같은 스토어 필터의 두 진입점이고,
 * 목록을 보며 거르는 흐름과 지도를 보며 거르는 흐름이 다르다.
 */
export function MarkersPanel({ markers, filterOptions, filters, mode }: PanelDataProps) {
  return (
    <div className="space-y-3">
      {mode === "equipment" ? (
        <PanelSection
          icon={FileSpreadsheet}
          title="위치 등록 및 관리"
          iconClassName="h-3.5 w-3.5 text-indigo-400"
        >
          <div className="space-y-2">
            <EquipmentExcelSection />
            <EquipmentInfoSection />
          </div>
        </PanelSection>
      ) : null}

      {mode === "battery" ? (
        <PanelSection
          icon={FileSpreadsheet}
          title="엑셀로 위치 찍기 (축전지)"
          iconClassName="h-3.5 w-3.5 text-emerald-400"
        >
          <BatteryExcelSection />
        </PanelSection>
      ) : null}

      <PanelSection icon={Filter} title="연도·사업·색상·태그 표시" iconClassName="h-3.5 w-3.5 text-indigo-400">
        <FilterPanel mode={mode} filterOptions={filterOptions} />
      </PanelSection>

      <PanelSection icon={List} title="마커 목록">
        <MarkersListPanel mode={mode} markers={markers} filters={filters} />
      </PanelSection>
    </div>
  );
}

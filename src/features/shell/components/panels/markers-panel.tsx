"use client";

import dynamic from "next/dynamic";
import { FileSpreadsheet, Filter, List } from "lucide-react";
import { useIsAdmin } from "@/features/map-marker/hooks/use-is-admin";
import { BatteryExcelSection } from "@/features/map-marker/components/sidebar/battery-excel-section";
import { EquipmentExcelSection } from "@/features/map-marker/components/sidebar/equipment-excel-section";
import { FilterPanel } from "@/features/map-marker/components/sidebar/filter-panel";
import { MarkersListPanel } from "@/features/map-marker/components/sidebar/markers-list-panel";
import { PanelSection } from "@/features/shell/components/panels/panel-section";
import type { PanelDataProps } from "@/features/shell/components/panels/types";
import type { MapSegment } from "@/features/shell/types/segment";

// 첫 화면에 필요 없는 패널. 홈 번들 기준(295 kB)을 지키기 위해 진입할 때 받는다.
const GroupPanel = dynamic(
  () =>
    import("@/features/group-admin/components/group-panel").then((m) => m.GroupPanel),
  {
    ssr: false,
    loading: () => <p className="text-[11px] text-slate-500">불러오는 중...</p>,
  },
);

/**
 * 그룹관리는 관리자 전용이다. 메뉴는 셸이 이미 숨기지만, persist로 복원된 메뉴 값 등으로
 * 여기까지 와도 관리자 확인 전에는 패널을 그리지 않는다(DB 권한은 RLS가 따로 막는다).
 */
function AdminGroupPanel() {
  const { isAdmin, isLoading } = useIsAdmin();
  if (isLoading) {
    return <p className="text-[11px] text-slate-500">불러오는 중...</p>;
  }
  if (!isAdmin) return null;
  return <GroupPanel />;
}

export interface MarkersPanelProps extends PanelDataProps {
  segment?: MapSegment;
}

/**
 * 마커관리 — **데이터를 어떻게 바꿀지**를 담당한다.
 *
 * 필터가 지도에도 있는 건 중복이 아니다. 같은 스토어 필터의 두 진입점이고,
 * 목록을 보며 거르는 흐름과 지도를 보며 거르는 흐름이 다르다.
 */
export function MarkersPanel({
  markers,
  filterOptions,
  filters,
  mode,
  segment,
}: MarkersPanelProps) {
  if (segment === "groups") {
    return <AdminGroupPanel />;
  }

  return (
    <div className="space-y-3">
      {mode === "equipment" ? (
        <PanelSection
          icon={FileSpreadsheet}
          title="위치 등록 및 관리"
          iconClassName="h-3.5 w-3.5 text-indigo-400"
        >
          <EquipmentExcelSection />
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

      <PanelSection icon={Filter} title="연도·상태·사업·색상·태그 표시" iconClassName="h-3.5 w-3.5 text-indigo-400">
        <FilterPanel mode={mode} filterOptions={filterOptions} />
      </PanelSection>

      <PanelSection icon={List} title="마커 목록">
        <MarkersListPanel mode={mode} markers={markers} filters={filters} />
      </PanelSection>
    </div>
  );
}

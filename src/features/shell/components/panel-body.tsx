"use client";

import dynamic from "next/dynamic";
import { match } from "ts-pattern";
import { useIsAdmin } from "@/features/map-marker/hooks/use-is-admin";
import { MapPanel } from "@/features/shell/components/panels/map-panel";
import { MarkersPanel } from "@/features/shell/components/panels/markers-panel";
import type { PanelDataProps } from "@/features/shell/components/panels/types";
import type { NavKey } from "@/features/shell/types/nav";
import type { MapSegment } from "@/features/shell/types/segment";

// 대시보드는 진입 전까지 필요 없다. 기상 조회 화면 일체를 초기 번들에서 뺀다.
const DashboardPanel = dynamic(
  () =>
    import("@/features/dashboard/components/dashboard-panel").then(
      (m) => m.DashboardPanel,
    ),
  {
    ssr: false,
    loading: () => <p className="text-[11px] text-slate-500">불러오는 중...</p>,
  },
);

// zbar-wasm(바코드 인식)·xlsx(엑셀 후보검색)가 무거워 진입 전까지 번들에서 뺀다.
const BarcodePanel = dynamic(
  () => import("@/features/barcode/components/barcode-panel").then((m) => m.BarcodePanel),
  {
    ssr: false,
    loading: () => <p className="text-[11px] text-slate-500">불러오는 중...</p>,
  },
);

// 첫 화면에 필요 없는 패널. 홈 번들 기준(295 kB)을 지키기 위해 진입할 때 받는다.
const GroupPanel = dynamic(
  () =>
    import("@/features/group-admin/components/group-panel").then((m) => m.GroupPanel),
  {
    ssr: false,
    loading: () => <p className="text-[11px] text-slate-500">불러오는 중...</p>,
  },
);
const BackupPanel = dynamic(
  () =>
    import("@/features/shell/components/panels/backup-panel").then(
      (m) => m.BackupPanel,
    ),
  {
    ssr: false,
    loading: () => <p className="text-[11px] text-slate-500">불러오는 중...</p>,
  },
);
const SettingsPanel = dynamic(
  () =>
    import("@/features/shell/components/panels/settings-panel").then(
      (m) => m.SettingsPanel,
    ),
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

export interface PanelBodyProps extends PanelDataProps {
  /** 하이드레이션 안전값. 셸이 마운트 전후를 판정해 내려 준다. */
  activeNav: NavKey;
  segment: MapSegment;
  equipmentCount: number;
  batteryCount: number;
}

/** 메뉴별 패널 내용. 데스크톱 패널과 모바일 시트가 함께 쓴다. */
export function PanelBody({
  mode,
  activeNav,
  segment,
  markers,
  filterOptions,
  filters,
  equipmentCount,
  batteryCount,
}: PanelBodyProps) {
  return match(activeNav)
    .with("dashboard", () => <DashboardPanel />)
    .with("map", () => (
      <MapPanel
        mode={mode}
        segment={segment}
        markers={markers}
        filterOptions={filterOptions}
        filters={filters}
      />
    ))
    .with("markers", () => (
      <MarkersPanel
        mode={mode}
        markers={markers}
        filterOptions={filterOptions}
        filters={filters}
      />
    ))
    // 일정관리와 계정설정은 패널 없이 메인 화면을 직접 그린다. 패널 내용은 없다.
    .with("schedule", () => null)
    .with("accounts", () => null)
    .with("groups", () => <AdminGroupPanel />)
    .with("barcode", () => <BarcodePanel />)
    .with("backup", () => (
      <BackupPanel
        mode={mode}
        equipmentCount={equipmentCount}
        batteryCount={batteryCount}
      />
    ))
    .with("settings", () => <SettingsPanel />)
    .exhaustive();
}

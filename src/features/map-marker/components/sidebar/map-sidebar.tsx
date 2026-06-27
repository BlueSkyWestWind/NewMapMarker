'use client';

import {
  Database,
  FileSpreadsheet,
  Filter,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { AuthHeader } from '@/features/map-marker/components/sidebar/auth-header';
import { BackupRestoreSection } from '@/features/map-marker/components/sidebar/backup-restore-section';
import { BatteryExcelSection } from '@/features/map-marker/components/sidebar/battery-excel-section';
import { EquipmentExcelSection } from '@/features/map-marker/components/sidebar/equipment-excel-section';
import { EquipmentInfoSection } from '@/features/map-marker/components/sidebar/equipment-info-section';
import { FilterPanel } from '@/features/map-marker/components/sidebar/filter-panel';
import { MarkersListPanel } from '@/features/map-marker/components/sidebar/markers-list-panel';
import { ModeTabs } from '@/features/map-marker/components/sidebar/mode-tabs';
import { PlaceSearchSection } from '@/features/map-marker/components/sidebar/place-search-section';
import { useAuthSession } from '@/features/map-marker/hooks/use-auth-session';
import { useMapMarkerStore } from '@/features/map-marker/store/use-map-marker-store';
import { useHasMounted } from '@/hooks/use-has-mounted';
import type { MapMode, MarkerRecord } from '@/features/map-marker/types/marker';

interface MapSidebarProps {
  markers: MarkerRecord[];
  filterOptions: {
    years: string[];
    businesses: string[];
    colors: string[];
    tags: string[];
  };
  equipmentCount: number;
  batteryCount: number;
  isLoading: boolean;
}

export function MapSidebar({
  markers,
  filterOptions,
  equipmentCount,
  batteryCount,
  isLoading,
}: MapSidebarProps) {
  const { isAuthenticated } = useAuthSession();
  const hasMounted = useHasMounted();
  const mode = useMapMarkerStore((state) => state.mode);
  const isSidebarOpen = useMapMarkerStore((state) => state.isSidebarOpen);
  const setMode = useMapMarkerStore((state) => state.setMode);
  const toggleSidebar = useMapMarkerStore((state) => state.toggleSidebar);

  const showAuthenticatedSections = hasMounted && isAuthenticated;

  const defaultAccordion = showAuthenticatedSections
    ? ['excel', 'filters', 'search', 'markers']
    : ['filters', 'markers'];

  if (!isSidebarOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="absolute left-3 top-3 z-20 border-slate-700 bg-slate-900/90 text-slate-200"
        onClick={toggleSidebar}
      >
        <PanelLeftOpen className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-r border-slate-800 bg-slate-950/95 text-slate-100 backdrop-blur">
      <header className="border-b border-slate-800 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-emerald-400" />
            <div>
              <h1 className="text-lg font-bold leading-tight">
                MapMarker <span className="text-indigo-400">Pro</span>
              </h1>
              <p className="text-[10px] text-slate-500">
                {mode === 'equipment'
                  ? `장비 ${equipmentCount}건`
                  : `축전지 ${batteryCount}건`}
                {hasMounted && isLoading ? ' · 로딩 중' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <AuthHeader />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400"
              onClick={toggleSidebar}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <ModeTabs mode={mode} onChange={setMode} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Accordion
          type="multiple"
          defaultValue={defaultAccordion}
          className="space-y-2"
        >
          {showAuthenticatedSections && mode === 'equipment' ? (
            <>
              <AccordionItem value="excel" className="border-slate-800">
                <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                    엑셀로 위치 찍기 (장비)
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <EquipmentExcelSection />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="info" className="border-slate-800">
                <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-violet-400" />
                    상세장비정보 업로드
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <EquipmentInfoSection />
                </AccordionContent>
              </AccordionItem>
            </>
          ) : null}

          {showAuthenticatedSections && mode === 'battery' ? (
            <AccordionItem value="battery-excel" className="border-slate-800">
              <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                  엑셀로 위치 찍기 (축전지)
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <BatteryExcelSection />
              </AccordionContent>
            </AccordionItem>
          ) : null}

          <AccordionItem value="filters" className="border-slate-800">
            <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
              <span className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-indigo-400" />
                연도·사업·색상·태그 표시
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <FilterPanel mode={mode as MapMode} filterOptions={filterOptions} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="search" className="border-slate-800">
            <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
              <span className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                장소 검색
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <PlaceSearchSection />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="markers" className="border-slate-800">
            <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
              저장된 위치 ({markers.length})
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <MarkersListPanel mode={mode as MapMode} markers={markers} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {showAuthenticatedSections ? (
        <footer className="border-t border-slate-800">
          <Accordion type="single" collapsible>
            <AccordionItem value="backup" className="border-0">
              <AccordionTrigger className="px-4 py-3 text-xs font-semibold hover:no-underline">
                <span className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-emerald-400" />
                  데이터 백업 및 복원
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <BackupRestoreSection mode={mode as MapMode} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </footer>
      ) : null}
    </aside>
  );
}

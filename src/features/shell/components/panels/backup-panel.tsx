"use client";

import { Database } from "lucide-react";
import { BackupRestoreSection } from "@/features/map-marker/components/sidebar/backup-restore-section";
import { PanelSection } from "@/features/shell/components/panels/panel-section";
import type { MapMode } from "@/features/map-marker/types/marker";

interface BackupPanelProps {
  mode: MapMode;
  equipmentCount: number;
  batteryCount: number;
}

/**
 * 데이터백업/복원 — **이동만 한다** (계획서 §3.8).
 *
 * 도메인별 백업·복원과 장비 일괄 삭제는 만들지 않는다.
 * 백업이 장비+축전지 통합 파일 하나라 나눌 대상이 없고,
 * 장비 일괄 삭제는 액션 자체가 없는 신규 파괴 기능이다.
 */
export function BackupPanel({ mode, equipmentCount, batteryCount }: BackupPanelProps) {
  return (
    <div className="space-y-3">
      {/* 어느 도메인을 보고 있든 전체 규모가 보여야 한다. */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-[11px] text-slate-300">
        <span>
          장비 <span className="font-semibold text-slate-100">{equipmentCount}</span>건
        </span>
        <span className="text-slate-600">·</span>
        <span>
          축전지 <span className="font-semibold text-slate-100">{batteryCount}</span>건
        </span>
      </div>

      <PanelSection
        icon={Database}
        title="데이터 백업 및 복원"
        iconClassName="h-3.5 w-3.5 text-emerald-400"
      >
        <BackupRestoreSection mode={mode} batteryCount={batteryCount} />
      </PanelSection>
    </div>
  );
}

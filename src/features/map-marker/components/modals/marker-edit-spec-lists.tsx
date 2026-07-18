"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* 마커 편집 모달의 상세 사양 리스트(장비/축전지) 편집 UI.
 * marker-edit-modal.tsx에서 분리 — 상태는 모달이 소유하고 콜백으로 갱신한다. */

export interface EquipmentRowItem {
  id: string;
  facilityCode: string;
  projectCode: string;
  facilityYear: string;
  businessType: string;
  finalStationName: string;
  eqClass: string;
  eqType: string;
  installDate: string;
  openDate: string;
}

export interface BatteryRowItem {
  id: string;
  erpName: string;
  capacity: number;
  quantity: number;
  stationName: string;
}

interface EquipmentSpecListProps {
  items: EquipmentRowItem[];
  isAuthenticated: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, key: keyof EquipmentRowItem, value: string) => void;
}

interface BatterySpecListProps {
  items: BatteryRowItem[];
  isAuthenticated: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, key: keyof BatteryRowItem, value: string | number) => void;
}

export function EquipmentSpecList({
  items,
  isAuthenticated,
  onAdd,
  onRemove,
  onChange,
}: EquipmentSpecListProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-500">장비 사양 리스트</span>
        <Button
          type="button"
          onClick={onAdd}
          className="bg-emerald-600 hover:bg-emerald-500 text-white h-7 text-xs px-2"
          disabled={!isAuthenticated}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          장비 추가
        </Button>
      </div>

      <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="relative bg-slate-950/40 p-3 rounded-lg border border-slate-800 flex flex-col gap-2.5"
          >
            {items.length > 1 && isAuthenticated && (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="absolute top-2 right-2 text-slate-500 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}

            <div className="text-[10px] font-bold text-slate-500">장비 #{idx + 1}</div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">통합시설코드</Label>
                <Input
                  value={item.facilityCode}
                  onChange={(e) => onChange(item.id, "facilityCode", e.target.value)}
                  placeholder="FAC12345"
                  className="bg-slate-950 border-slate-800 h-8 text-xs"
                  disabled={!isAuthenticated}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">프로젝트코드</Label>
                <Input
                  value={item.projectCode}
                  onChange={(e) => onChange(item.id, "projectCode", e.target.value)}
                  placeholder="PRJ-2026"
                  className="bg-slate-950 border-slate-800 h-8 text-xs"
                  disabled={!isAuthenticated}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">시설연도</Label>
                <Input
                  value={item.facilityYear}
                  onChange={(e) => onChange(item.id, "facilityYear", e.target.value)}
                  placeholder="2026"
                  className="bg-slate-950 border-slate-800 h-8 text-xs"
                  disabled={!isAuthenticated}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">사업구분</Label>
                <Input
                  value={item.businessType}
                  onChange={(e) => onChange(item.id, "businessType", e.target.value)}
                  placeholder="상용망"
                  className="bg-slate-950 border-slate-800 h-8 text-xs"
                  disabled={!isAuthenticated}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-slate-400">국소명-최종</Label>
              <Input
                value={item.finalStationName}
                onChange={(e) => onChange(item.id, "finalStationName", e.target.value)}
                placeholder="국소명_1-AAU"
                className="bg-slate-950 border-slate-800 h-8 text-xs"
                disabled={!isAuthenticated}
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">장비분류</Label>
                <Input
                  value={item.eqClass}
                  onChange={(e) => onChange(item.id, "eqClass", e.target.value)}
                  placeholder="전송장비"
                  className="bg-slate-950 border-slate-800 h-8 text-xs"
                  disabled={!isAuthenticated}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">장비타입</Label>
                <Input
                  value={item.eqType}
                  onChange={(e) => onChange(item.id, "eqType", e.target.value)}
                  placeholder="MUX"
                  className="bg-slate-950 border-slate-800 h-8 text-xs"
                  disabled={!isAuthenticated}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">시설일</Label>
                <Input
                  type="date"
                  value={item.installDate}
                  onChange={(e) => onChange(item.id, "installDate", e.target.value)}
                  className="bg-slate-950 border-slate-800 h-8 text-xs"
                  disabled={!isAuthenticated}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">개통일</Label>
                <Input
                  type="date"
                  value={item.openDate}
                  onChange={(e) => onChange(item.id, "openDate", e.target.value)}
                  className="bg-slate-950 border-slate-800 h-8 text-xs"
                  disabled={!isAuthenticated}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BatterySpecList({
  items,
  isAuthenticated,
  onAdd,
  onRemove,
  onChange,
}: BatterySpecListProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-500">배터리 사양 리스트</span>
        <Button
          type="button"
          onClick={onAdd}
          className="bg-emerald-600 hover:bg-emerald-500 text-white h-7 text-xs px-2"
          disabled={!isAuthenticated}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          사양 추가
        </Button>
      </div>

      <div className="space-y-2.5 max-h-[40vh] overflow-y-auto pr-1">
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="relative bg-slate-950/40 p-3 rounded-lg border border-slate-800 flex flex-col gap-2"
          >
            {items.length > 1 && isAuthenticated && (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="absolute top-2 right-2 text-slate-500 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}

            <div className="text-[10px] font-bold text-slate-500">사양 #{idx + 1}</div>

            <div className="space-y-1">
              <Label className="text-[9px] text-slate-400">ERP 통합시설코드/명칭</Label>
              <Input
                value={item.erpName}
                onChange={(e) => onChange(item.id, "erpName", e.target.value)}
                placeholder="ERP 명칭"
                className="bg-slate-950 border-slate-800 h-7 text-xs"
                disabled={!isAuthenticated}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[9px] text-slate-400">용량 (AH)</Label>
                <Input
                  type="number"
                  value={item.capacity}
                  onChange={(e) => onChange(item.id, "capacity", Number(e.target.value))}
                  className="bg-slate-950 border-slate-800 h-7 text-xs font-mono"
                  disabled={!isAuthenticated}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[9px] text-slate-400">수량 (Cell)</Label>
                <Input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => onChange(item.id, "quantity", Number(e.target.value))}
                  className="bg-slate-950 border-slate-800 h-7 text-xs font-mono"
                  disabled={!isAuthenticated}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[9px] text-slate-400">창고/국소/국사명</Label>
              <Input
                value={item.stationName}
                onChange={(e) => onChange(item.id, "stationName", e.target.value)}
                placeholder="국소명 입력"
                className="bg-slate-950 border-slate-800 h-7 text-xs"
                disabled={!isAuthenticated}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import { FolderOpen, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PanelSection } from "@/features/shell/components/panels/panel-section";
import { parseLookupExcel, pickLookupField } from "@/features/barcode/lib/lookup-excel";
import type { LookupRow } from "@/features/barcode/types/barcode";

interface BarcodeLookupPanelProps {
  onUse: (barcode: string) => void;
}

const MAX_RESULTS = 30;

/**
 * 손상·오염된 라벨을 재고 엑셀(자재수불부 등)로 손으로 대조한다.
 * 라벨에서 읽히는 글자 조각을 입력하면 모든 조각을 포함하는 행을 후보로 보여주고,
 * 바코드 값을 한 번에 입력창으로 보낸다. 엑셀은 브라우저를 벗어나지 않는다.
 */
export function BarcodeLookupPanel({ onUse }: BarcodeLookupPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [rows, setRows] = useState<LookupRow[] | null>(null);
  const [status, setStatus] = useState("불러온 엑셀 없음");
  const [search, setSearch] = useState("");
  const [usedBarcode, setUsedBarcode] = useState<string | null>(null);

  const matches = useMemo(() => {
    if (!rows) return [];
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return rows.filter((row) => terms.every((term) => row.text.includes(term)));
  }, [rows, search]);

  const handleFile = async (file: File) => {
    setStatus("불러오는 중…");
    try {
      const parsed = await parseLookupExcel(file);
      setRows(parsed);
      setStatus(`${parsed.length}건 불러옴 — 라벨 조각을 입력하세요`);
    } catch {
      setRows(null);
      setStatus("엑셀을 읽지 못했어요. .xlsx 파일이 맞는지 확인해주세요.");
    }
  };

  const use = (barcode: string) => {
    onUse(barcode);
    setUsedBarcode(barcode);
    setTimeout(() => setUsedBarcode((prev) => (prev === barcode ? null : prev)), 1200);
  };

  return (
    <PanelSection
      icon={ListFilter}
      title="엑셀에서 후보 찾기"
      iconClassName="h-3.5 w-3.5 text-sky-400"
    >
      <div className="space-y-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-full text-[11px]"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          {isOpen ? "패널 접기" : "패널 펼치기"}
        </Button>

        {isOpen ? (
          <div className="space-y-2 border-t border-dashed border-slate-800 pt-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 text-[11px]"
                onClick={() => fileInputRef.current?.click()}
              >
                <FolderOpen className="mr-1 h-3.5 w-3.5" />
                재고 엑셀 불러오기
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleFile(file);
                }}
              />
            </div>
            <p className="font-mono text-[10px] text-slate-500">{status}</p>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={!rows}
              placeholder="손상된 라벨에서 보이는 글자 조각 입력 (예: NSN/EN FCIA)"
              className="h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-2 font-mono text-[11px] text-slate-200 placeholder:text-slate-600 disabled:opacity-50"
            />

            {rows && search.trim() ? (
              <div className="max-h-52 space-y-1.5 overflow-y-auto">
                {matches.length === 0 ? (
                  <p className="px-1 py-1 text-[11px] text-slate-500">일치하는 항목이 없어요.</p>
                ) : (
                  <>
                    {matches.slice(0, MAX_RESULTS).map((row, i) => {
                      const barcode = pickLookupField(row.cells, "바코드", "여부");
                      const materialCode = pickLookupField(row.cells, "자재코드");
                      const name =
                        pickLookupField(row.cells, "FULL자재명") ||
                        pickLookupField(row.cells, "자재명");

                      return (
                        <div
                          key={`${barcode || name}-${i}`}
                          className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 p-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] text-slate-300">
                              {name || "(품명 없음)"}
                            </p>
                            <p className="truncate font-mono text-[10px] text-slate-500">
                              {materialCode ? `자재코드 ${materialCode} · ` : ""}
                              바코드{" "}
                              <strong className="font-semibold text-emerald-400">
                                {barcode || "없음"}
                              </strong>
                            </p>
                          </div>
                          {barcode ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-6 shrink-0 text-[10px]"
                              onClick={() => use(barcode)}
                            >
                              {usedBarcode === barcode ? "추가됨" : "이 값 사용"}
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                    {matches.length > MAX_RESULTS ? (
                      <p className="px-1 py-1 text-[10px] text-slate-500">
                        조각을 더 입력하면 후보가 좁혀져요 ({matches.length}건 중 {MAX_RESULTS}건
                        표시).
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </PanelSection>
  );
}

"use client";

import { useRef } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExcelUploadActions } from "@/features/map-marker/hooks/use-excel-upload-actions";

/**
 * 위치 모드용 엑셀 업로드.
 * 장비 엑셀과 동일한 파서(위경도/주소)를 쓰며, DB 없이 지도에 바로 표시한다.
 */
export function LocationExcelSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { statusText, isUploading, uploadLocationExcel } =
    useExcelUploadActions();

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400">
        장비 엑셀과 동일한 형식입니다. 위도/경도 또는 주소가 포함된 Excel/CSV를
        올리면 임시 위치로 표시됩니다. (로그인·DB 저장 없음)
      </p>
      <Button
        type="button"
        className="h-8 w-full bg-emerald-600 text-xs hover:bg-emerald-500"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="mr-1.5 h-3.5 w-3.5" />
        )}
        Excel/CSV 파일 업로드
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void uploadLocationExcel(file, event.target);
          }
        }}
      />

      {statusText ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-[11px] text-emerald-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{statusText}</span>
        </div>
      ) : null}
    </div>
  );
}

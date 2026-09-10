"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { usePhotoDecode } from "@/features/barcode/hooks/use-photo-decode";

interface BarcodeInputSectionProps {
  draftValue: string;
  onDraftChange: (value: string) => void;
  itemCount: number;
  size: number;
  onSizeChange: (size: number) => void;
  onGenerate: () => void;
  onClear: () => void;
  onDecoded: (codes: string[], thumbnails: Record<string, string>) => void;
}

const SIZE_OPTIONS = [
  { value: 84, label: "작게" },
  { value: 120, label: "보통" },
  { value: 160, label: "크게" },
];

export function BarcodeInputSection({
  draftValue,
  onDraftChange,
  itemCount,
  size,
  onSizeChange,
  onGenerate,
  onClear,
  onDecoded,
}: BarcodeInputSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const { isProcessing, statusText, processPhotos } = usePhotoDecode(onDecoded);

  return (
    <div className="space-y-2.5">
      <Textarea
        value={draftValue}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onGenerate();
        }}
        spellCheck={false}
        placeholder={"8801012345670\n8801012345687\n..."}
        className="min-h-[120px] font-mono text-[12px] leading-relaxed"
      />

      <div
        className={cn(
          "flex flex-col items-center gap-1.5 rounded-md border border-dashed border-slate-700 bg-slate-900/60 px-3 py-3 text-center transition-colors",
          isDragOver && "border-emerald-500 bg-emerald-950/30",
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          const files = Array.from(e.dataTransfer.files ?? []).filter((f) =>
            f.type.startsWith("image/"),
          );
          if (files.length === 0) return;
          void processPhotos(files);
        }}
      >
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-300 hover:text-slate-100 disabled:opacity-50"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          title="바코드 부분이 크고 정면으로 나오도록 가까이서 찍으면 인식률이 높아집니다"
        >
          {isProcessing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
          사진에서 바코드 인식
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            e.target.value = "";
            if (files && files.length > 0) void processPhotos(Array.from(files));
          }}
        />
        <span className="text-[10px] text-slate-500">
          또는 사진 여러 장을 여기로 끌어다 놓으세요
        </span>
        {statusText ? (
          <span className="font-mono text-[10px] text-slate-400">{statusText}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" className="h-8 text-[11px]" onClick={onGenerate}>
          QR 코드 생성
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-[11px]"
          onClick={onClear}
        >
          모두 지우기
        </Button>
        <select
          value={size}
          onChange={(e) => onSizeChange(Number(e.target.value))}
          className="h-8 rounded-md border border-slate-700 bg-slate-900 px-1.5 text-[11px] text-slate-200"
        >
          {SIZE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <span className="inline-block rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1 font-mono text-[11px] text-slate-400">
        <strong className="font-semibold text-emerald-400">{itemCount}</strong>개 항목
      </span>

      {itemCount > 150 ? (
        <p className="text-[10px] text-slate-500">항목이 많아 생성에 몇 초 걸릴 수 있어요.</p>
      ) : null}
    </div>
  );
}

"use client";

import { BarcodeResultCard } from "@/features/barcode/components/barcode-result-card";
import type { LightboxTarget } from "@/features/barcode/types/barcode";

interface BarcodeResultListProps {
  items: string[];
  size: number;
  thumbnails: Record<string, string>;
  onOpenLightbox: (target: LightboxTarget) => void;
}

export function BarcodeResultList({
  items,
  size,
  thumbnails,
  onOpenLightbox,
}: BarcodeResultListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-4 text-center text-[11px] text-slate-500">
        바코드 번호를 입력하고 &quot;QR 코드 생성&quot;을 눌러주세요.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      {items.map((value) => {
        const photoUrl = thumbnails[value];
        return (
          <BarcodeResultCard
            key={value}
            value={value}
            size={size}
            photoUrl={photoUrl}
            onOpenPhoto={() => {
              if (photoUrl) onOpenLightbox({ photoUrl, value });
            }}
          />
        );
      })}
    </div>
  );
}

"use client";

import { QrCode } from "lucide-react";
import { BarcodeResultList } from "@/features/barcode/components/barcode-result-list";
import { BarcodeLightbox } from "@/features/barcode/components/barcode-lightbox";
import { useBarcodeStore } from "@/features/barcode/store/use-barcode-store";

/**
 * 바코드/QR 메인 영역 — 지도 대신 QR 결과를 크게 보여준다(사용자 확정).
 * `AppShell`이 지도를 숨긴 자리에 이 컴포넌트를 띄운다.
 */
export function BarcodeResultsMain() {
  const items = useBarcodeStore((s) => s.items);
  const size = useBarcodeStore((s) => s.size);
  const thumbnails = useBarcodeStore((s) => s.thumbnails);
  const lightboxTarget = useBarcodeStore((s) => s.lightboxTarget);
  const setLightboxTarget = useBarcodeStore((s) => s.setLightboxTarget);

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-950 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex items-center gap-2 text-slate-300">
          <QrCode className="h-4 w-4 text-emerald-400" aria-hidden />
          <h2 className="text-sm font-semibold">QR 코드 결과</h2>
        </header>

        <BarcodeResultList
          items={items}
          size={size}
          thumbnails={thumbnails}
          onOpenLightbox={setLightboxTarget}
        />

        <p className="text-[11px] leading-relaxed text-slate-500">
          중복된 줄은 한 번만 변환되며, 빈 줄은 무시됩니다. 15자리 바코드는{" "}
          <span className="font-semibold text-amber-400">주황색</span>으로 표시됩니다. 다운로드가
          필요하면 QR 이미지를 길게 눌러 저장하거나 화면을 캡처해 사용하세요.
        </p>
      </div>

      <BarcodeLightbox target={lightboxTarget} onClose={() => setLightboxTarget(null)} />
    </div>
  );
}

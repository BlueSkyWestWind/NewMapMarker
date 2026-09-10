"use client";

import { QrCode } from "lucide-react";
import { PanelSection } from "@/features/shell/components/panels/panel-section";
import { BarcodeInputSection } from "@/features/barcode/components/barcode-input-section";
import { BarcodeLookupPanel } from "@/features/barcode/components/barcode-lookup-panel";
import { useBarcodeStore } from "@/features/barcode/store/use-barcode-store";

/**
 * 바코드/QR 사이드바 패널 — 입력 전용.
 *
 * 결과 QR 그리드는 지도가 있던 넓은 메인 영역에 `BarcodeResultsMain`으로 따로 뜬다
 * (사용자 확정: 좁은 사이드바보다 넓은 화면에서 QR을 보고 싶어함). 두 컴포넌트가
 * 형제 트리라 상태를 `useBarcodeStore`로 공유한다.
 */
export function BarcodePanel() {
  const draftValue = useBarcodeStore((s) => s.draftValue);
  const setDraftValue = useBarcodeStore((s) => s.setDraftValue);
  const itemCount = useBarcodeStore((s) => s.items.length);
  const size = useBarcodeStore((s) => s.size);
  const setSize = useBarcodeStore((s) => s.setSize);
  const generate = useBarcodeStore((s) => s.generate);
  const clearAll = useBarcodeStore((s) => s.clearAll);
  const appendAndGenerate = useBarcodeStore((s) => s.appendAndGenerate);
  const mergeThumbnails = useBarcodeStore((s) => s.mergeThumbnails);

  const handleDecoded = (codes: string[], newThumbnails: Record<string, string>) => {
    mergeThumbnails(newThumbnails);
    appendAndGenerate(codes);
  };

  return (
    <div className="space-y-3">
      <PanelSection
        icon={QrCode}
        title="바코드 번호 입력"
        iconClassName="h-3.5 w-3.5 text-emerald-400"
      >
        <BarcodeInputSection
          draftValue={draftValue}
          onDraftChange={setDraftValue}
          itemCount={itemCount}
          size={size}
          onSizeChange={setSize}
          onGenerate={generate}
          onClear={clearAll}
          onDecoded={handleDecoded}
        />
      </PanelSection>

      <BarcodeLookupPanel onUse={(barcode) => appendAndGenerate([barcode])} />

      <p className="border-t border-slate-800 pt-2 text-[10px] leading-relaxed text-slate-500">
        생성된 QR 코드는 오른쪽 화면에 표시됩니다.
      </p>
    </div>
  );
}

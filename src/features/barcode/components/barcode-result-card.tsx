"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BarcodeQrCanvas } from "@/features/barcode/components/barcode-qr-canvas";

interface BarcodeResultCardProps {
  value: string;
  size: number;
  photoUrl?: string;
  onOpenPhoto: () => void;
}

function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  return Promise.resolve();
}

export function BarcodeResultCard({ value, size, photoUrl, onOpenPhoto }: BarcodeResultCardProps) {
  const [copied, setCopied] = useState(false);
  const isFifteen = value.length === 15;
  const hasPhoto = Boolean(photoUrl);

  const copy = async () => {
    await copyToClipboard(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div
      className={cn(
        "flex gap-2 rounded-lg border bg-slate-900/60 p-3",
        // 사진이 붙은 카드는 그리드 폭 전체를 써서 사진+QR을 나란히 보여준다.
        // 사진 없는 카드는 QR 생성 카드를 옆으로 나란히 배치하기 위해 한 칸씩 차지한다.
        hasPhoto ? "col-span-full flex-row items-stretch" : "flex-col items-center",
        isFifteen ? "border-amber-600/60" : "border-slate-800",
      )}
    >
      {hasPhoto ? (
        <button
          type="button"
          onClick={onOpenPhoto}
          className="relative h-20 w-20 shrink-0 self-center overflow-hidden rounded-md border border-slate-700 bg-slate-800"
          title="클릭하면 크게 보며 QR과 대조할 수 있어요"
        >
          <Image src={photoUrl!} alt="인식된 사진" fill unoptimized className="object-cover" />
        </button>
      ) : null}

      <div className={cn("flex min-w-0 flex-col items-center gap-2", hasPhoto && "flex-1")}>
        <div className="rounded-md bg-white p-2">
          <BarcodeQrCanvas value={value} size={size} className="h-auto max-w-full" />
        </div>

        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
            isFifteen
              ? "border-amber-600/60 bg-amber-950/40 text-amber-300"
              : "border-slate-700 bg-slate-800 text-slate-400",
          )}
        >
          {value.length}자리
        </span>

        <p className="break-all text-center text-[11px] text-slate-300">{value}</p>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "h-7 w-full text-[11px]",
            copied
              ? "border-emerald-600/60 bg-emerald-950/50 text-emerald-300"
              : "border-slate-700 text-slate-400",
          )}
          onClick={copy}
        >
          {copied ? "복사됨" : "복사"}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface BarcodeQrCanvasProps {
  value: string;
  size: number;
  className?: string;
}

/** `qrcode` 라이브러리로 캔버스에 QR을 직접 그린다(원본의 canvas 기반 qrcodejs와 동등). */
export function BarcodeQrCanvas({ value, size, className }: BarcodeQrCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
    }).catch(() => {});
  }, [value, size]);

  return <canvas ref={canvasRef} className={className} />;
}

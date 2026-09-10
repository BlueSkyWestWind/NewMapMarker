"use client";

import { useCallback, useState } from "react";
import { decodeImage, makeThumbnail, readFileAsDataUrl } from "@/features/barcode/lib/decode-image";
import { stripMaterialCode } from "@/features/barcode/lib/strip-material-code";

interface UsePhotoDecodeResult {
  isProcessing: boolean;
  statusText: string;
  processPhotos: (files: File[]) => Promise<void>;
}

/** 사진 여러 장을 순서대로 디코딩한다. 디코딩된 값·썸네일은 `onDecoded`로 한 번에 넘긴다. */
export function usePhotoDecode(
  onDecoded: (codes: string[], thumbnails: Record<string, string>) => void,
): UsePhotoDecodeResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("");

  const processPhotos = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setIsProcessing(true);

      const decoded: string[] = [];
      const thumbnails: Record<string, string> = {};
      let failedCount = 0;

      for (let i = 0; i < files.length; i++) {
        setStatusText(
          `각도·방향 보정하며 인식 중… (${i + 1}/${files.length}) — 장당 최대 20초 정도 걸릴 수 있어요`,
        );

        let dataUrl: string;
        try {
          dataUrl = await readFileAsDataUrl(files[i]);
        } catch {
          failedCount += 1;
          continue;
        }

        const rawCode = await decodeImage(dataUrl);
        if (!rawCode) {
          failedCount += 1;
          continue;
        }

        const code = stripMaterialCode(rawCode);
        decoded.push(code);
        const thumbUrl = await makeThumbnail(dataUrl, 900);
        if (thumbUrl) thumbnails[code] = thumbUrl;
      }

      if (decoded.length > 0) onDecoded(decoded, thumbnails);

      let msg = `${decoded.length}개 인식 완료`;
      if (failedCount > 0) {
        msg += `, ${failedCount}개 인식 실패 (라벨이 찢어지지 않았는지, 바코드에 초점이 맞았는지 확인 후 더 가까이서 다시 찍어보세요)`;
      }
      setStatusText(msg);
      setIsProcessing(false);
    },
    [onDecoded],
  );

  return { isProcessing, statusText, processPhotos };
}

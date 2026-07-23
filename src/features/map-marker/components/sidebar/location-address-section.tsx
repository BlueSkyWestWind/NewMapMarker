"use client";

import { useMemo, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { geocodeAddressQueue } from "@/features/map-marker/lib/geocode";
import { createLocationMarker } from "@/features/map-marker/lib/location-marker";
import type { LocationMarker } from "@/features/map-marker/types/marker";

interface AddressItem {
  name: string;
  address: string;
}

/**
 * 입력 텍스트를 주소 항목으로 파싱한다.
 * - 한 줄에 주소 하나
 * - 탭이 있으면 `이름[TAB]주소`로 나눈다(엑셀 두 열 붙여넣기 지원)
 * - 빈 줄·중복 주소는 제거
 */
function parseAddressLines(text: string): AddressItem[] {
  const seen = new Set<string>();
  const items: AddressItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    let name = "";
    let address = line;
    const tab = line.indexOf("\t");
    if (tab >= 0) {
      name = line.slice(0, tab).trim();
      address = line.slice(tab + 1).trim();
    }
    if (!address) continue;

    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ name, address });
  }
  return items;
}

/**
 * 위치 모드: 여러 주소를 붙여 넣으면 각 주소를 지오코딩해 임시 마커로 표시한다.
 * (로그인·DB 저장 없음. 새로고침 시 사라짐)
 */
export function LocationAddressSection() {
  const { toast } = useToast();
  const addPendingMarkers = useMapMarkerStore((state) => state.addPendingMarkers);
  const pendingLocation = useMapMarkerStore(
    (state) => state.pendingLocationMarkers,
  );

  const [text, setText] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const parsedCount = useMemo(() => parseAddressLines(text).length, [text]);

  const run = async () => {
    const items = parseAddressLines(text);
    if (items.length === 0) {
      toast({ variant: "destructive", description: "주소를 한 줄에 하나씩 입력하세요." });
      return;
    }

    // 이미 표시된 주소는 건너뛴다(중복 마커 방지).
    const existingAddresses = new Set(
      pendingLocation.map((marker) =>
        ((marker as LocationMarker).address ?? "").trim().toLowerCase(),
      ),
    );
    const targets = items.filter(
      (item) => !existingAddresses.has(item.address.toLowerCase()),
    );
    const skipped = items.length - targets.length;

    if (targets.length === 0) {
      toast({ description: "입력한 주소는 이미 모두 표시되어 있습니다." });
      return;
    }

    setIsBusy(true);
    setStatus(`주소 좌표 변환 시작... (총 ${targets.length}건)`);
    try {
      const geocoded = await geocodeAddressQueue(targets, (current, total) => {
        setStatus(`주소 좌표 변환 중... (${current}/${total})`);
      });

      const startIndex = pendingLocation.length + 1;
      const newMarkers: LocationMarker[] = geocoded.results.map((item, index) =>
        createLocationMarker({
          lat: item.lat,
          lng: item.lng,
          name: item.name || item.address || `위치 ${startIndex + index}`,
          address: item.address,
        }),
      );

      if (newMarkers.length > 0) {
        addPendingMarkers("location", newMarkers);
      }

      const failedAddresses = geocoded.failedItems.map((item) => item.address);
      const parts = [`임시 위치 ${newMarkers.length}건을 지도에 표시했습니다.`];
      if (skipped > 0) parts.push(`중복 제외 ${skipped}건`);
      if (geocoded.failCount > 0) parts.push(`주소 찾기 실패 ${geocoded.failCount}건`);

      toast({
        description:
          parts.join(" · ") +
          (failedAddresses.length > 0
            ? `\n실패: ${failedAddresses.join(", ")}`
            : ""),
      });

      // 성공하면 입력창을 비우고, 실패한 주소만 남겨 바로 고쳐 재시도할 수 있게 한다.
      setText(failedAddresses.join("\n"));
      setStatus(
        newMarkers.length > 0
          ? `${newMarkers.length}건 표시 완료${
              geocoded.failCount > 0 ? ` · 실패 ${geocoded.failCount}건` : ""
            }`
          : "표시된 위치가 없습니다. 주소를 확인하세요.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      toast({ variant: "destructive", description: message });
      setStatus(null);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400">
        주소를 한 줄에 하나씩 붙여 넣고 [마커 표시]를 누르면 지도에 임시 위치로
        표시됩니다. <span className="text-slate-500">(이름[Tab]주소 형식도 지원)</span>
      </p>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={isBusy}
        placeholder={"광주 북구 월출동 695-6\n서울특별시 중구 세종대로 110\n..."}
        className="min-h-[96px] resize-y border-slate-700 bg-slate-900/60 text-xs"
      />
      <Button
        type="button"
        className="h-8 w-full bg-emerald-600 text-xs hover:bg-emerald-500"
        disabled={isBusy || parsedCount === 0}
        onClick={() => void run()}
      >
        {isBusy ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <MapPin className="mr-1.5 h-3.5 w-3.5" />
        )}
        {isBusy ? "표시 중..." : `마커 표시${parsedCount > 0 ? ` (${parsedCount})` : ""}`}
      </Button>

      {status ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-[11px] text-emerald-300">
          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          <span className="whitespace-pre-wrap">{status}</span>
        </div>
      ) : null}
    </div>
  );
}

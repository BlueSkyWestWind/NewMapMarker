"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Eye,
  MapPin,
  PauseCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useExcelUploadActions } from "@/features/map-marker/hooks/use-excel-upload-actions";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import type { StagedErpUpload } from "@/features/map-marker/types/marker";

type UploadActions = ReturnType<typeof useExcelUploadActions>;

interface ErpReviewPanelProps {
  upload: StagedErpUpload;
  isUploading: boolean;
  actions: Pick<
    UploadActions,
    | "confirmStagedMarker"
    | "refreshStagedExisting"
    | "deferStagedReview"
    | "cancelStagedErp"
    | "excludeStagedMarker"
    | "placeStagedMarker"
  >;
}

interface AddressMismatch {
  id: string;
  lat: number;
  lng: number;
  actualAddress: string | null;
}

/** 위치등록 확인 목록. [확인]을 누른 건만 DB에 저장된다. */
export function ErpReviewPanel({ upload, isUploading, actions }: ErpReviewPanelProps) {
  const pending = useMapMarkerStore((state) => state.pendingEquipmentMarkers);
  const selectedMarkerId = useMapMarkerStore((state) => state.selectedMarkerId);
  const pickedPoint = useMapMarkerStore((state) => state.pickedPoint);
  const setPickedPoint = useMapMarkerStore((state) => state.setPickedPoint);
  const setMapPickMode = useMapMarkerStore((state) => state.setMapPickMode);
  const setSelectedMarkerId = useMapMarkerStore(
    (state) => state.setSelectedMarkerId,
  );
  const [mismatch, setMismatch] = useState<AddressMismatch | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);

  const positions = new Map(pending.map((marker) => [marker.id, marker]));

  // 지도에서 찍은 지점을 대기 중인 건의 위치로 쓴다.
  const { placeStagedMarker } = actions;
  useEffect(() => {
    if (!pickedPoint || !placingId) return;
    placeStagedMarker(placingId, { lat: pickedPoint.lat, lng: pickedPoint.lng });
    setSelectedMarkerId(placingId);
    setPickedPoint(null);
    setPlacingId(null);
    setMapPickMode("off");
  }, [
    pickedPoint,
    placingId,
    placeStagedMarker,
    setPickedPoint,
    setMapPickMode,
    setSelectedMarkerId,
  ]);

  // 패널이 닫히면 지도 클릭을 평소 동작으로 돌려놓는다.
  useEffect(() => () => setMapPickMode("off"), [setMapPickMode]);

  const startPlacing = (id: string) => {
    const isSame = placingId === id;
    setPlacingId(isSame ? null : id);
    setMapPickMode(isSame ? "off" : "place");
  };

  const confirm = async (id: string, force = false) => {
    const result = await actions.confirmStagedMarker(id, force);
    if (result.status === "mismatch") {
      setMismatch({
        id,
        lat: result.lat,
        lng: result.lng,
        actualAddress: result.actualAddress,
      });
    } else if (result.status === "saved") {
      setMismatch(null);
    }
  };

  const { reviewRows, existingRows, skippedRows } = upload;

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-2.5">
      <p className="text-[11px] leading-relaxed text-slate-400">
        확인 대기 <strong className="text-amber-400">{reviewRows.length}</strong>건
        · 기존 {existingRows.length}건
        {skippedRows.length > 0 ? ` · 저장 안 함 ${skippedRows.length}건` : ""}
        <br />
        마커를 정확한 위치로 옮긴 뒤 [확인]을 누르면 바로 저장됩니다. 남은 건은
        이 브라우저에 자동으로 임시 저장됩니다.
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 flex-1 border-rose-500/30 text-[11px] text-rose-400"
          disabled={isUploading}
          onClick={() => void actions.cancelStagedErp()}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          취소
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 flex-1 border-slate-700 text-[11px] text-slate-200"
          disabled={isUploading}
          onClick={() => void actions.deferStagedReview()}
        >
          <PauseCircle className="mr-1 h-3 w-3" />
          나중에 이어서
        </Button>
      </div>

      {existingRows.length > 0 ? (
        <Button
          type="button"
          size="sm"
          className="h-7 w-full bg-violet-600 text-[11px] hover:bg-violet-500"
          disabled={isUploading}
          onClick={() => void actions.refreshStagedExisting()}
          title="국소명과 공정 정보만 파일 값으로 바꿉니다. 위치·메모·태그·색상·담당팀·주소는 유지됩니다."
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          기존 {existingRows.length}건 갱신
        </Button>
      ) : null}

      {skippedRows.length > 0 ? (
        <div className="max-h-24 overflow-y-auto rounded border border-slate-700 p-1.5 text-[10px] text-slate-400">
          <p className="font-medium text-slate-300">코드·주소 없음 (저장 안 함)</p>
          {skippedRows.map((row, index) => (
            <p key={`${row.name}-${index}`} className="truncate">
              {row.name || "이름 없음"} · {row.reason}
            </p>
          ))}
        </div>
      ) : null}

      {reviewRows.length > 0 ? (
        <div className="max-h-72 divide-y divide-amber-500/10 overflow-y-auto rounded border border-amber-500/20 bg-amber-950/20">
          {reviewRows.map((row) => {
            const position = positions.get(row.id);
            const warning =
              mismatch?.id === row.id &&
              position?.lat === mismatch.lat &&
              position?.lng === mismatch.lng
                ? mismatch
                : null;

            return (
              <div
                key={row.id}
                className={`space-y-1 p-1.5 text-[10px] ${
                  selectedMarkerId === row.id ? "bg-amber-500/10" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div
                    className="min-w-0 flex-1 cursor-pointer hover:text-amber-300"
                    onClick={() => position && setSelectedMarkerId(row.id)}
                    title={position ? "지도로 위치 확인" : "주소를 찾지 못했습니다"}
                  >
                    <p className="truncate font-semibold text-amber-200">
                      {row.name || "이름 없음"}
                      {row.kind === "missingCoords" ? " (기존·좌표 없음)" : ""}
                    </p>
                    <p className="truncate text-[9px] text-slate-400">
                      {row.address || "주소 없음"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {position ? (
                      <>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-slate-400 hover:text-slate-200"
                          onClick={() => setSelectedMarkerId(row.id)}
                          title="위치 보기"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 bg-amber-600 px-2 text-[10px] hover:bg-amber-500"
                          disabled={isUploading}
                          onClick={() => void confirm(row.id)}
                          title="위치 주소를 엑셀 주소와 비교한 뒤 저장합니다"
                        >
                          <Check className="mr-0.5 h-3 w-3" />
                          확인
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 border-amber-500/40 px-2 text-[10px] text-amber-300"
                        disabled={isUploading}
                        aria-pressed={placingId === row.id}
                        onClick={() => startPlacing(row.id)}
                      >
                        <MapPin className="mr-0.5 h-3 w-3" />
                        {placingId === row.id ? "찍는 중" : "지도에서 찍기"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                      disabled={isUploading}
                      onClick={() => void actions.excludeStagedMarker(row.id)}
                      title="이 항목 제외"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {warning ? (
                  <div className="space-y-1 rounded border border-amber-500/40 bg-amber-500/10 p-1.5 text-slate-200">
                    <p className="flex items-center gap-1 font-medium text-amber-300">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      주소가 다릅니다. 저장하지 않았습니다.
                    </p>
                    <p className="break-all">엑셀: {row.address || "주소 없음"}</p>
                    <p className="break-all">
                      마커 위치: {warning.actualAddress ?? "주소를 찾을 수 없음"}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 w-full border-amber-500/40 text-[10px] text-amber-200"
                      disabled={isUploading}
                      onClick={() => void confirm(row.id, true)}
                    >
                      이 위치로 저장
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

import { withPreviousCoords } from "@/features/map-marker/lib/erp-review";
import { previewAddonRow, previewExistingRow } from "@/features/map-marker/lib/erp-preview";
import { buildStagedErpRow, classifyErpRows, type ExistingMarkerRef } from "@/features/map-marker/lib/erp-classify";
import type { ErpParsedRow } from "@/features/map-marker/lib/excel/data-manager/erp-parse";
import { formatFailedAddresses } from "@/features/map-marker/lib/excel-upload-helpers";
import { geocodeAddressQueue } from "@/features/map-marker/lib/geocode";
import type { StagedErpUpload } from "@/features/map-marker/types/marker";

/**
 * 위치등록(공정관리) 행을 확인 대상과 기존 건으로 나눈다(DB 저장 없음).
 * 좌표가 필요한 행만 지오코딩하고, `previous`에 위치가 있는 행은 그 위치를 유지한다.
 *
 * 위치등록 업로드와 백업 복원이 같은 확인 흐름을 쓰도록 훅 밖으로 뺐다.
 */
export async function stageErpRows({
  rows,
  existing,
  previous,
  needsRegroup,
  onStatus,
}: {
  rows: ErpParsedRow[];
  existing: ExistingMarkerRef[];
  previous: Map<string, { lat: number; lng: number }>;
  needsRegroup: boolean;
  onStatus?: (text: string) => void;
}): Promise<StagedErpUpload> {
  const { classified, skippedRows } = classifyErpRows(rows, existing);

  const geocodeTargets = classified
    .filter(
      (item) => item.kind !== "existing" && item.kind !== "addon" && !previous.has(item.id),
    )
    .map((item) => ({
      id: item.id,
      name: item.row.name,
      address: item.row.address,
    }));

  const coordsById = new Map<string, { lat: number; lng: number }>();
  let failedAddresses: string[] = [];
  if (geocodeTargets.length > 0) {
    onStatus?.(`주소 좌표 변환 시작... (확인 대상 ${geocodeTargets.length}건)`);
    const geocoded = await geocodeAddressQueue(geocodeTargets, (current, total) => {
      onStatus?.(`주소 좌표 변환 중... (${current}/${total})`);
    });
    for (const item of geocoded.results) {
      coordsById.set(item.id, { lat: item.lat, lng: item.lng });
    }
    failedAddresses = formatFailedAddresses(geocoded.failedItems);
  }

  const existingById = new Map(existing.map((marker) => [marker.id, marker]));
  const stagedRows = classified.map((item) => {
    const staged = buildStagedErpRow(item, coordsById.get(item.id) ?? null);
    // 기존 건 갱신·추가 사업은 반영 전에 무엇이 바뀌는지 보여 줄 미리보기를 붙인다.
    if (staged.kind === "existing") {
      return { ...staged, preview: previewExistingRow(staged, existingById.get(staged.id)) };
    }
    if (staged.kind === "addon") return { ...staged, preview: previewAddonRow(staged) };
    return staged;
  });
  return {
    reviewRows: withPreviousCoords(
      stagedRows.filter((row) => row.kind !== "existing" && row.kind !== "addon"),
      previous,
    ),
    existingRows: stagedRows.filter((row) => row.kind === "existing"),
    addonRows: stagedRows.filter((row) => row.kind === "addon"),
    skippedRows,
    needsRegroup,
    geocodeFailedAddresses: failedAddresses,
  };
}

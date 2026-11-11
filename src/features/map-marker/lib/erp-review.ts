import type {
  StagedErpRow,
  StagedErpUpload,
} from "@/features/map-marker/types/marker";

/**
 * 위치등록 확인 작업의 임시 저장과 판정. 스토어와 페이지가 항상 불러오므로 가볍게 유지한다.
 */

type Coords = { lat: number; lng: number };

const ERP_DRAFT_VERSION = 1;

export function erpDraftKey(userId: string) {
  return `map-marker-erp-draft:${userId}`;
}

/** 파일을 다시 올려도 사용자가 옮긴 위치를 유지한다 */
export function withPreviousCoords(
  rows: StagedErpRow[],
  previous: Map<string, Coords>,
): StagedErpRow[] {
  return rows.map((row) => {
    const coords = previous.get(row.id);
    return coords ? { ...row, lat: coords.lat, lng: coords.lng } : row;
  });
}

export function isStagedReviewMarker(
  upload: StagedErpUpload | null,
  id: string | null,
): boolean {
  return !!upload && upload.reviewRows.some((row) => row.id === id);
}

/**
 * 임시 저장 내용을 만든다. 저장할 작업이 없으면 null.
 * 기존 건은 수가 많아 저장 공간을 넘길 수 있고, 파일을 다시 올리면 되므로 뺀다.
 */
export function serializeErpDraft(
  upload: StagedErpUpload | null,
  pending: Array<{ id: string; lat: number; lng: number }>,
): string | null {
  if (!upload || (upload.reviewRows.length === 0 && !upload.needsRegroup)) {
    return null;
  }
  const coords = new Map(
    pending.map((marker) => [marker.id, { lat: marker.lat, lng: marker.lng }]),
  );
  return JSON.stringify({
    version: ERP_DRAFT_VERSION,
    reviewRows: withPreviousCoords(upload.reviewRows, coords),
    skippedRows: upload.skippedRows,
    needsRegroup: upload.needsRegroup,
    geocodeFailedAddresses: upload.geocodeFailedAddresses,
  });
}

export function parseErpDraft(text: string): StagedErpUpload | null {
  try {
    const draft = JSON.parse(text) as Partial<StagedErpUpload> & {
      version?: number;
    };
    if (draft.version !== ERP_DRAFT_VERSION || !Array.isArray(draft.reviewRows)) {
      return null;
    }
    return {
      reviewRows: draft.reviewRows,
      existingRows: [],
      skippedRows: draft.skippedRows ?? [],
      needsRegroup: draft.needsRegroup === true,
      geocodeFailedAddresses: draft.geocodeFailedAddresses ?? [],
    };
  } catch {
    return null;
  }
}

/** 같은 그룹(대표·SUB)의 행 ID. 묶이지 않았으면 자신뿐이다. */
export function reviewGroupMemberIds(rows: StagedErpRow[], id: string): string[] {
  const key = rows.find((row) => row.id === id)?.group?.key;
  if (!key) return [id];
  return rows.filter((row) => row.group?.key === key).map((row) => row.id);
}

/**
 * 대기 마커 하나를 옮기면 같은 그룹의 마커도 같은 이동량만큼 옮긴다(상대 위치 유지).
 * 묶이지 않은 마커는 자기만 옮기고, 옮길 마커가 대기 목록에 없으면 그대로 돌려준다.
 */
export function moveGroupedPendingMarkers<T extends { id: string; lat: number; lng: number }>(
  markers: T[],
  rows: StagedErpRow[],
  id: string,
  next: Coords,
): T[] {
  const moved = markers.find((marker) => marker.id === id);
  if (!moved) return markers;
  const dLat = next.lat - moved.lat;
  const dLng = next.lng - moved.lng;
  const members = new Set(reviewGroupMemberIds(rows, id));
  return markers.map((marker) => {
    if (marker.id === id) return { ...marker, lat: next.lat, lng: next.lng };
    return members.has(marker.id)
      ? { ...marker, lat: marker.lat + dLat, lng: marker.lng + dLng }
      : marker;
  });
}

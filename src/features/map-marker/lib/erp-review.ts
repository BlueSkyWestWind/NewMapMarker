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

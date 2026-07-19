/**
 * 장소/주소 검색 → VWorld 연속지적도(필지) 경계 조회 결과 타입 및 클라이언트 fetch 헬퍼.
 * 실제 조회는 서버 프록시(`/api/parcel-boundary`)가 VWorld API를 호출한다.
 */

export interface ParcelPoint {
  lat: number;
  lng: number;
}

export interface Parcel {
  /** rings[0] = 외곽선, rings[1..] = 내부 구멍(holes) */
  rings: ParcelPoint[][];
}

export interface PlaceSearchResult {
  center: ParcelPoint;
  /** 매칭된 주소(표시용) */
  label: string;
  /** 필지 폴리곤들. 경계를 못 찾으면 빈 배열(좌표만 이동) */
  parcels: Parcel[];
}

/**
 * 주소/장소 문자열로 필지 경계를 조회한다.
 * @throws 조회 실패 시 사용자용 메시지를 담은 Error
 */
export async function fetchParcelBoundary(
  query: string,
): Promise<PlaceSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('검색어를 입력하세요.');
  }

  const res = await fetch(
    `/api/parcel-boundary?address=${encodeURIComponent(trimmed)}`,
  );
  const json = (await res.json().catch(() => null)) as
    | (PlaceSearchResult & { error?: string })
    | { error?: string }
    | null;

  if (!res.ok || !json || !('center' in json)) {
    const message =
      (json && 'error' in json && json.error) ||
      '경계 조회에 실패했습니다.';
    throw new Error(message);
  }

  return json as PlaceSearchResult;
}

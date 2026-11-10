import type { SupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 마커 좌표의 주소(`markers.marker_address`)를 저장한다.
 * 위치 저장과 따로 한다 — 컬럼이 아직 없는 DB(마이그레이션 `20261117000000_marker_address.sql` 적용 전)
 * 에서도 위치 저장은 성공해야 하기 때문이다. 저장하지 못하면 false를 돌려준다.
 * 빈 값을 주면 마커주소를 비운다 — 마커를 옮겼는데 새 주소를 못 구했을 때 옛 주소가 남지 않게 하려는 것이다.
 * 위치를 처음 저장할 때처럼 비우면 안 되는 경우에는 주소를 구했을 때만 부른다.
 */
export async function saveMarkerAddress(
  supabase: SupabaseBrowserClient,
  markerId: string,
  address: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("markers")
    .update({ marker_address: address.trim() })
    .eq("id", markerId);
  return !error;
}

export interface MarkerAddressDisplay {
  text: string;
  /** 어디서 온 주소인지. 저장된 값 / 등록 주소와 같은 곳이라 등록 주소 / 좌표의 실제 주소 / 없음 */
  source: "stored" | "registered" | "actual" | "none";
}

/**
 * 상세 화면에 보여 줄 마커주소를 고른다(DB에 쓰지 않는다).
 * 저장된 값이 우선이다. 없으면 좌표의 주소(`actual`)를 보고, 등록 주소와 같은 곳이면(`isSame`)
 * 등록 주소(지번 우선, 없으면 도로명)를 그대로 보여 주고, 다른 곳이면 좌표의 실제 주소를 보여 준다.
 */
export function pickMarkerAddressDisplay(input: {
  stored: string;
  registered: { jibunAddress: string; roadAddress: string };
  actual: { address: string } | null;
  isSame: boolean;
}): MarkerAddressDisplay {
  const stored = input.stored.trim();
  if (stored) return { text: stored, source: "stored" };
  if (!input.actual) return { text: "", source: "none" };

  if (input.isSame) {
    const registered = input.registered.jibunAddress.trim() || input.registered.roadAddress.trim();
    if (registered) return { text: registered, source: "registered" };
  }
  return { text: input.actual.address, source: "actual" };
}

export interface RoadAddressDisplay {
  text: string;
  /** 저장된 값 / 마커 좌표의 도로명 주소 / 없음 */
  source: "stored" | "actual" | "none";
}

/**
 * 상세 화면에 보여 줄 도로명 주소를 고른다(DB에 쓰지 않는다).
 * 저장된 값이 우선이다. 없으면 마커가 등록 주소와 같은 곳(`isSame`)일 때만 좌표의 도로명 주소를 쓴다 —
 * 다른 곳으로 옮긴 마커의 도로명 주소는 이 국소의 것이 아니기 때문이다.
 */
export function pickRoadAddressDisplay(input: {
  stored: string;
  actual: { roadAddress: string } | null;
  isSame: boolean;
}): RoadAddressDisplay {
  const stored = input.stored.trim();
  if (stored) return { text: stored, source: "stored" };
  const actual = input.actual?.roadAddress.trim() ?? "";
  if (input.isSame && actual) return { text: actual, source: "actual" };
  return { text: "", source: "none" };
}

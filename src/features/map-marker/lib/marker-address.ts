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

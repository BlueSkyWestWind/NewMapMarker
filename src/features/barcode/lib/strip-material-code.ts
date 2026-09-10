/**
 * SK텔레콤 장비 라벨의 QR은 "일련번호:자재코드" 형식(예: "60F7FG2006014:1000063708")으로
 * 인코딩돼 있다. 자재코드는 이 도구 용도에 필요 없는 정보라 콜론 뒤는 잘라낸다.
 */
export function stripMaterialCode(code: string): string {
  const idx = code.indexOf(":");
  return idx === -1 ? code : code.slice(0, idx).trim();
}

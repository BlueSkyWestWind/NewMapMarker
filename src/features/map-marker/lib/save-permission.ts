/**
 * 기존 마커의 수정 저장은 시설정보·축전지 규격을 지우고 다시 넣는다. 삭제는 관리자만 되므로
 * 일반 계정이 저장하면 마커만 바뀌고 하위 행은 그대로인 반쯤 저장된 상태가 된다.
 * 그래서 저장을 시작하기 전에 막는다. 새 마커 등록은 지울 것이 없어 막지 않는다.
 */
export function needsAdminToSave(input: {
  selectedMarkerId: string | null;
  isAdmin: boolean;
}): boolean {
  return input.selectedMarkerId !== null && !input.isAdmin;
}

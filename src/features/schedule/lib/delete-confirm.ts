/**
 * 저장으로 지워질 칸 수를 세어 확인이 필요한지 정한다.
 * 2건 이상 삭제이거나 전체 삭제면 확인 문구를, 그렇지 않으면 `null`을 돌려준다.
 */
export function deleteConfirmMessage(input: {
  deleteCount: number;
  isClearAll: boolean;
}): string | null {
  if (input.deleteCount <= 0) return null;
  if (input.isClearAll || input.deleteCount >= 2) {
    return `${input.deleteCount}건을 삭제합니다. 계속할까요?`;
  }
  return null;
}

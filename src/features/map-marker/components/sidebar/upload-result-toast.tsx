import type { ReactNode } from "react";

const FAILED_ADDRESS_DISPLAY_LIMIT = 10;

/**
 * 업로드 결과 토스트 본문. 실패 주소가 있으면 요약 아래에 목록으로 노출한다.
 */
export function buildUploadResultDescription(
  summary: string,
  failedAddresses: string[],
): ReactNode {
  if (failedAddresses.length === 0) return summary;

  const shown = failedAddresses.slice(0, FAILED_ADDRESS_DISPLAY_LIMIT);
  const rest = failedAddresses.length - shown.length;

  return (
    <div className="space-y-1">
      <p>{summary}</p>
      <div className="text-[11px] leading-snug opacity-90">
        <p className="font-medium">주소 찾기 실패 {failedAddresses.length}종:</p>
        <ul className="list-disc space-y-0.5 pl-4">
          {shown.map((address) => (
            <li key={address}>{address}</li>
          ))}
        </ul>
        {rest > 0 ? <p className="pl-4">…외 {rest}종</p> : null}
      </div>
    </div>
  );
}

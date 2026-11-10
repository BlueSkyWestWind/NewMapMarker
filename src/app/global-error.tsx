"use client";

import { ErrorReport } from "@/components/error-report";

/** 루트 레이아웃 자체가 실패했을 때의 마지막 경계. 자체 html/body가 필요하다. */
export default function GlobalError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>
        <ErrorReport {...props} />
      </body>
    </html>
  );
}

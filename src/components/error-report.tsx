"use client";

interface ErrorReportProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * 렌더 중 예외가 났을 때 오류 내용을 화면에 그대로 보여 준다.
 * 모바일에는 콘솔이 없어 Next 기본 문구("브라우저 콘솔 참조")로는 원인을 알 수 없다.
 * 테마·CSS에 기대지 않도록 인라인 스타일만 쓴다(global-error에서도 쓰인다).
 */
export function ErrorReport({ error, reset }: ErrorReportProps) {
  const detail = [
    `${error.name}: ${error.message}`,
    error.digest ? `digest: ${error.digest}` : "",
    error.stack ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div
      style={{
        minHeight: "100dvh",
        padding: 16,
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ margin: "0 0 8px", fontSize: 18 }}>화면을 불러오지 못했습니다</h1>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#94a3b8" }}>
        아래 내용을 캡처해 알려 주세요.
      </p>
      <pre
        style={{
          margin: "0 0 12px",
          padding: 12,
          maxHeight: "60dvh",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          fontSize: 11,
          background: "#020617",
          border: "1px solid #334155",
          borderRadius: 8,
        }}
      >
        {detail}
      </pre>
      <button
        type="button"
        onClick={reset}
        style={{
          minHeight: 44,
          padding: "0 16px",
          background: "#4f46e5",
          color: "#fff",
          border: 0,
          borderRadius: 8,
          fontSize: 14,
        }}
      >
        다시 시도
      </button>
    </div>
  );
}

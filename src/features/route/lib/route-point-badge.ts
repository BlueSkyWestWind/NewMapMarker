/**
 * 경로탐색 출발지/방문지점을 지도 위에 번호 배지로 표시한다.
 * 방문 지점 목록의 순번과 지도 위 배지 번호가 그대로 일치해야
 * "N구간이 어디인지" 바로 알아볼 수 있다.
 */
export function createRoutePointBadge(label: string, variant: "origin" | "stop"): HTMLDivElement {
  const el = document.createElement("div");
  const background = variant === "origin" ? "#10b981" : "#0ea5e9";

  el.textContent = label;
  el.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "width:22px",
    "height:22px",
    "border-radius:9999px",
    `background:${background}`,
    "color:#ffffff",
    "font-size:11px",
    "font-weight:700",
    "border:2px solid #ffffff",
    "box-shadow:0 1px 4px rgba(0,0,0,.45)",
    "font-family:ui-sans-serif,system-ui,sans-serif",
    "pointer-events:none",
  ].join(";");

  return el;
}

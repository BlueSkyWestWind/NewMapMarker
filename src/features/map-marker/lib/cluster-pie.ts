import { DEFAULT_MARKER_COLOR } from "@/features/map-marker/constants/facility-teams";

/** 파이/도넛에 표시할 최대 색상 수. 초과분은 '기타'로 합산 */
export const CLUSTER_PIE_MAX_SLICES = 4;

/** 상위 색 외 나머지를 묶는 '기타' 색 */
export const CLUSTER_OTHER_COLOR = "#94a3b8";

export type ClusterIconStyle = "pie" | "donut";

export interface ClusterColorSlice {
  color: string;
  count: number;
}

/**
 * 마커 색 목록을 집계하고, 상위 N색 + 기타로 압축한다.
 * 건수 합계는 입력 길이와 동일하게 유지한다.
 */
export function aggregateClusterColorSlices(
  colors: string[],
  maxSlices: number = CLUSTER_PIE_MAX_SLICES,
): ClusterColorSlice[] {
  const counts = new Map<string, number>();

  for (const raw of colors) {
    const color =
      (raw || DEFAULT_MARKER_COLOR).toLowerCase().trim() ||
      DEFAULT_MARKER_COLOR;
    counts.set(color, (counts.get(color) || 0) + 1);
  }

  const sorted = Array.from(counts.entries())
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count || a.color.localeCompare(b.color));

  if (sorted.length <= maxSlices) {
    return sorted;
  }

  const top = sorted.slice(0, maxSlices - 1);
  const otherCount = sorted
    .slice(maxSlices - 1)
    .reduce((sum, item) => sum + item.count, 0);
  return [...top, { color: CLUSTER_OTHER_COLOR, count: otherCount }];
}

function buildConicGradient(
  slices: ClusterColorSlice[],
  total: number,
): string {
  if (total <= 0 || slices.length === 0) {
    return DEFAULT_MARKER_COLOR;
  }

  if (slices.length === 1) {
    return slices[0].color;
  }

  let cursor = 0;
  const parts = slices.map((slice) => {
    const start = cursor;
    cursor += (slice.count / total) * 100;
    return `${slice.color} ${start.toFixed(4)}% ${cursor.toFixed(4)}%`;
  });

  return `conic-gradient(${parts.join(", ")})`;
}

/**
 * 클러스터 마커용 파이/도넛 HTML을 생성한다.
 * 가운데에 마커 개수를 표시한다.
 */
export function createClusterPieElement(
  colors: string[],
  style: ClusterIconStyle,
): HTMLDivElement {
  const total = colors.length;
  const slices = aggregateClusterColorSlices(colors);
  const gradient = buildConicGradient(slices, total);

  const root = document.createElement("div");
  root.style.cssText = [
    "width:48px",
    "height:48px",
    "border-radius:50%",
    "box-sizing:border-box",
    "border:2px solid #ffffff",
    "box-shadow:0 2px 8px rgba(0,0,0,0.35)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "cursor:pointer",
    `background:${gradient}`,
  ].join(";");

  const label = document.createElement("div");
  label.textContent = String(total);
  label.style.cssText = [
    "font-size:12px",
    "font-weight:700",
    "line-height:1",
    "color:#ffffff",
    "text-shadow:0 1px 2px rgba(0,0,0,0.55)",
    "pointer-events:none",
    "user-select:none",
  ].join(";");

  if (style === "donut") {
    const hole = document.createElement("div");
    hole.style.cssText = [
      "width:26px",
      "height:26px",
      "border-radius:50%",
      "background:#0f172a",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "box-shadow:inset 0 0 0 1px rgba(255,255,255,0.15)",
    ].join(";");
    hole.appendChild(label);
    root.appendChild(hole);
  } else {
    root.appendChild(label);
  }

  return root;
}

/**
 * Kakao MarkerClusterer clustered 이벤트 결과에 파이/도넛 아이콘을 적용한다.
 */
export function applyClusterPieStyles(
  clusters: KakaoCluster[],
  style: ClusterIconStyle,
): void {
  for (const cluster of clusters) {
    const markers = cluster.getMarkers?.() ?? [];
    if (markers.length === 0) continue;

    const colors = markers.map((marker) => {
      const color = (marker as KakaoMarker & { markerColor?: string })
        .markerColor;
      return color || DEFAULT_MARKER_COLOR;
    });

    const clusterMarker = cluster.getClusterMarker?.();
    if (!clusterMarker) continue;

    clusterMarker.setContent(createClusterPieElement(colors, style));
  }
}

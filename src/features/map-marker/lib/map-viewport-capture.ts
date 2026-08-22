/**
 * html2canvas(약 190KB)는 지도 캡처를 실행하는 순간에만 필요하다.
 * 정적 import하면 캡처 패널을 통해 홈 첫 로딩 번들에 실린다.
 */
async function loadHtml2Canvas() {
  return (await import("html2canvas")).default;
}

/** 캡처 해상도 배율 — 글씨 판독용 */
export const MAP_CAPTURE_SCALE = 2;

const TILE_PROXY_CONCURRENCY = 8;
const TILE_DATA_URL_CACHE_LIMIT = 512;
const MIN_MAP_COVERAGE_RATIO = 0.12;
const MAX_CAPTURE_ATTEMPTS = 2;
const tileDataUrlCache = new Map<string, string>();
const tileDataUrlRequests = new Map<string, Promise<string>>();

class TileProxyError extends Error {
  constructor(public readonly status: number) {
    super(`타일 프록시 실패 (${status})`);
  }
}

function isKakaoTileUrl(src: string): boolean {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return false;
  try {
    const host = new URL(src, window.location.href).hostname.toLowerCase();
    return (
      host.endsWith(".daumcdn.net") ||
      host.endsWith(".kakaocdn.net") ||
      host.endsWith(".kakao.com") ||
      host.endsWith(".daum.net") ||
      host === "daumcdn.net" ||
      host === "kakaocdn.net" ||
      host === "kakao.com" ||
      host === "daum.net"
    );
  } catch {
    return false;
  }
}

function extractCssBackgroundUrl(value: string): string | null {
  const match = value.match(/url\(["']?(.+?)["']?\)/i);
  if (!match?.[1]) return null;
  return match[1].replace(/&quot;/g, "");
}

function shouldIgnoreCaptureElement(element: Element): boolean {
  return (
    element instanceof HTMLElement && element.dataset.captureHide === "true"
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("타일 이미지를 data URL로 변환하지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

async function fetchTileAsDataUrl(tileUrl: string): Promise<string> {
  const cached = tileDataUrlCache.get(tileUrl);
  if (cached) return cached;
  const pending = tileDataUrlRequests.get(tileUrl);
  if (pending) return pending;

  const request = (async () => {
    const response = await fetch(
      `/api/map-tile-proxy?url=${encodeURIComponent(tileUrl)}`,
      { cache: "force-cache" },
    );

    if (!response.ok) {
      throw new TileProxyError(response.status);
    }

    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) {
      throw new Error("타일 프록시 응답이 이미지가 아닙니다.");
    }

    const dataUrl = await blobToDataUrl(blob);
    tileDataUrlCache.set(tileUrl, dataUrl);
    if (tileDataUrlCache.size > TILE_DATA_URL_CACHE_LIMIT) {
      const oldestKey = tileDataUrlCache.keys().next().value;
      if (oldestKey) tileDataUrlCache.delete(oldestKey);
    }
    return dataUrl;
  })();

  tileDataUrlRequests.set(tileUrl, request);
  try {
    return await request;
  } finally {
    tileDataUrlRequests.delete(tileUrl);
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current], current);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    () => runWorker(),
  );
  await Promise.all(runners);
  return results;
}

function estimateExpectedTileCount(width: number, height: number): number {
  return Math.max(8, Math.ceil(width / 256) * Math.ceil(height / 256));
}

function isVisibleInMapContainer(
  element: HTMLElement,
  mapContainer: HTMLElement,
): boolean {
  const containerRect = mapContainer.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  if (
    elementRect.width <= 0 ||
    elementRect.height <= 0 ||
    elementRect.right <= containerRect.left ||
    elementRect.left >= containerRect.right ||
    elementRect.bottom <= containerRect.top ||
    elementRect.top >= containerRect.bottom
  ) {
    return false;
  }

  let current: HTMLElement | null = element;
  while (current && current !== mapContainer) {
    const style = window.getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) <= 0.01
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function listLoadedTileImages(mapContainer: HTMLElement): HTMLImageElement[] {
  return Array.from(mapContainer.querySelectorAll("img")).filter((img) => {
    const src = img.currentSrc || img.src;
    if (!isKakaoTileUrl(src)) return false;
    return (
      img.complete &&
      img.naturalWidth > 0 &&
      isVisibleInMapContainer(img, mapContainer)
    );
  });
}

/** DOM에는 있으나 아직 로드가 끝나지 않은 카카오 타일 img 개수 */
function countIncompleteTileImages(mapContainer: HTMLElement): number {
  let count = 0;
  mapContainer.querySelectorAll("img").forEach((img) => {
    const src = img.currentSrc || img.src;
    if (!isKakaoTileUrl(src)) return;
    if (!isVisibleInMapContainer(img, mapContainer)) return;
    if (!img.complete || img.naturalWidth === 0) count += 1;
  });
  return count;
}

function listBackgroundTileElements(
  mapContainer: HTMLElement,
): Array<{ element: HTMLElement; url: string }> {
  const results: Array<{ element: HTMLElement; url: string }> = [];
  const nodes = mapContainer.querySelectorAll<HTMLElement>("div, span");

  nodes.forEach((element) => {
    const bg = element.style.backgroundImage || "";
    if (!bg || bg === "none") return;
    const url = extractCssBackgroundUrl(bg);
    if (!url || !isKakaoTileUrl(url)) return;
    if (!isVisibleInMapContainer(element, mapContainer)) return;
    results.push({ element, url });
  });

  return results;
}

/**
 * 정보창(CustomOverlay) DOM이 붙을 때까지 짧게 대기한다.
 */
export async function waitForCaptureOverlays(
  mapContainer: HTMLElement,
  expectedCount: number,
  timeoutMs: number = 1500,
): Promise<number> {
  if (expectedCount <= 0) return 0;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const count = mapContainer.querySelectorAll(".custom-overlay").length;
    if (count >= expectedCount) return count;
    await wait(50);
  }

  return mapContainer.querySelectorAll(".custom-overlay").length;
}

export function waitForKakaoMapIdle(
  map: KakaoMap,
  timeoutMs: number = 6000,
): Promise<void> {
  return new Promise((resolve) => {
    if (!window.kakao?.maps) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.kakao?.maps.event.removeListener(map, "idle", onIdle);
      resolve();
    };

    const onIdle = () => finish();
    window.kakao.maps.event.addListener(map, "idle", onIdle);
    window.setTimeout(finish, timeoutMs);
  });
}

/**
 * 타일 img가 충분히 로드될 때까지 폴링한다.
 */
export async function waitForMapTilesReady(
  mapContainer: HTMLElement,
  options?: { minCount?: number; timeoutMs?: number },
): Promise<number> {
  const minCount =
    options?.minCount ??
    estimateExpectedTileCount(
      mapContainer.clientWidth,
      mapContainer.clientHeight,
    );
  const timeoutMs = options?.timeoutMs ?? 12000;
  const startedAt = Date.now();

  let stableCount = 0;
  let lastCount = -1;

  while (Date.now() - startedAt < timeoutMs) {
    const loadedCount = listLoadedTileImages(mapContainer).length;
    const bgCount = listBackgroundTileElements(mapContainer).length;
    const incomplete = countIncompleteTileImages(mapContainer);
    const total = loadedCount + bgCount;

    if (total === lastCount && total > 0) {
      stableCount += 1;
    } else {
      stableCount = 0;
      lastCount = total;
    }

    // 로드가 끝나지 않은 타일이 하나도 없고(incomplete === 0),
    // 기대 타일의 대부분이 로드되었으며, 여러 번 연속 개수가 같으면 준비 완료로 본다.
    // (일부 구간이 흰색으로 비어 나오는 문제 방지)
    if (
      incomplete === 0 &&
      total >= Math.ceil(minCount * 0.9) &&
      stableCount >= 3
    ) {
      return total;
    }

    await wait(200);
  }

  return (
    listLoadedTileImages(mapContainer).length +
    listBackgroundTileElements(mapContainer).length
  );
}

type PrefetchResult = {
  imageDataUrls: Map<number, string>;
  backgroundDataUrls: Map<number, string>;
};

async function prefetchMapTileDataUrls(
  mapContainer: HTMLElement,
): Promise<PrefetchResult> {
  clearCaptureIndexes(mapContainer);

  const tileImages = listLoadedTileImages(mapContainer);
  tileImages.forEach((img, index) => {
    img.dataset.captureTileIndex = String(index);
  });

  const backgroundTiles = listBackgroundTileElements(mapContainer);
  backgroundTiles.forEach(({ element }, index) => {
    element.dataset.captureBgIndex = String(index);
  });

  const imageDataUrlsList = await mapPool(
    tileImages,
    TILE_PROXY_CONCURRENCY,
    async (img) => {
      const src = img.currentSrc || img.src;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          return await fetchTileAsDataUrl(src);
        } catch (error) {
          if (error instanceof TileProxyError && error.status === 429) break;
          await wait(200 * attempt);
        }
      }
      return "";
    },
  );

  const backgroundDataUrlsList = await mapPool(
    backgroundTiles,
    TILE_PROXY_CONCURRENCY,
    async ({ url }) => {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          return await fetchTileAsDataUrl(url);
        } catch (error) {
          if (error instanceof TileProxyError && error.status === 429) break;
          await wait(200 * attempt);
        }
      }
      return "";
    },
  );

  const imageDataUrls = new Map<number, string>();
  imageDataUrlsList.forEach((dataUrl, index) => {
    if (dataUrl) imageDataUrls.set(index, dataUrl);
  });

  const backgroundDataUrls = new Map<number, string>();
  backgroundDataUrlsList.forEach((dataUrl, index) => {
    if (dataUrl) backgroundDataUrls.set(index, dataUrl);
  });

  return {
    imageDataUrls,
    backgroundDataUrls,
  };
}

function clearCaptureIndexes(mapContainer: HTMLElement) {
  mapContainer.querySelectorAll("[data-capture-tile-index]").forEach((node) => {
    if (node instanceof HTMLElement) delete node.dataset.captureTileIndex;
  });
  mapContainer.querySelectorAll("[data-capture-bg-index]").forEach((node) => {
    if (node instanceof HTMLElement) delete node.dataset.captureBgIndex;
  });
}

/**
 * 캡처 결과에 지도(비흰 배경)가 얼마나 채워졌는지 대략 측정한다.
 */
function estimateMapCoverageRatio(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0;

  const { width, height } = canvas;
  const step = Math.max(8, Math.floor(Math.min(width, height) / 40));
  const { data } = ctx.getImageData(0, 0, width, height);
  let total = 0;
  let covered = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      total += 1;
      if (a < 20) continue;

      const isNearWhite = r > 235 && g > 235 && b > 225;
      const isFillBackground = r < 30 && g < 40 && b < 55;
      if (!isNearWhite && !isFillBackground) {
        covered += 1;
      }
    }
  }

  return total === 0 ? 0 : covered / total;
}

async function captureOnce(
  mapContainer: HTMLElement,
  width: number,
  height: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  const { imageDataUrls, backgroundDataUrls } =
    await prefetchMapTileDataUrls(mapContainer);

  const html2canvas = await loadHtml2Canvas();

  return html2canvas(mapContainer, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#0f172a",
    logging: false,
    scale,
    width,
    height,
    imageTimeout: 20000,
    ignoreElements: shouldIgnoreCaptureElement,
    onclone: (clonedDocument) => {
      clonedDocument
        .querySelectorAll("img[data-capture-tile-index]")
        .forEach((node) => {
          if (!(node instanceof HTMLImageElement)) return;
          const index = Number(node.dataset.captureTileIndex);
          const dataUrl = imageDataUrls.get(index);
          if (dataUrl) {
            node.src = dataUrl;
            node.removeAttribute("srcset");
          }
        });

      clonedDocument
        .querySelectorAll<HTMLElement>("[data-capture-bg-index]")
        .forEach((node) => {
          const index = Number(node.dataset.captureBgIndex);
          const dataUrl = backgroundDataUrls.get(index);
          if (dataUrl) {
            node.style.backgroundImage = `url("${dataUrl}")`;
          }
        });
    },
  });
}

/**
 * 타일 프록시 + DOM 오버레이를 합성해 캡처한다.
 * 흰 배경(타일 미로드)이면 자동 재시도한다.
 */
export async function captureMapViewport(
  mapContainer: HTMLElement,
): Promise<HTMLCanvasElement> {
  const width = mapContainer.clientWidth;
  const height = mapContainer.clientHeight;
  if (width <= 0 || height <= 0) {
    throw new Error("지도 컨테이너 크기를 확인할 수 없습니다.");
  }

  const scale = MAP_CAPTURE_SCALE;
  // capture-readable(정보창 확대)은 정보창 캡처 모드 동안 지도 컨테이너에
  // React effect로 이미 적용돼 있다. 미리보기 배치와 캡처 결과 크기를
  // 일치시키기 위해 여기서는 따로 토글하지 않는다.

  try {
    let bestCanvas: HTMLCanvasElement | null = null;
    let bestCoverage = -1;

    for (let attempt = 1; attempt <= MAX_CAPTURE_ATTEMPTS; attempt += 1) {
      await waitForMapTilesReady(mapContainer, {
        timeoutMs: 5000,
      });
      await wait(150);

      let canvas: HTMLCanvasElement;
      try {
        canvas = await captureOnce(mapContainer, width, height, scale);
      } catch (error) {
        if (attempt === MAX_CAPTURE_ATTEMPTS) {
          throw error;
        }
        await wait(300 * attempt);
        continue;
      }
      const coverage = estimateMapCoverageRatio(canvas);

      if (coverage > bestCoverage) {
        bestCoverage = coverage;
        bestCanvas = canvas;
      }

      if (coverage >= MIN_MAP_COVERAGE_RATIO) {
        return canvas;
      }

      // 타일이 덜 채워졌으면 잠시 더 기다린 뒤 재시도
      await wait(300 * attempt);
    }

    if (!bestCanvas) {
      throw new Error("지도 화면 캡처에 실패했습니다.");
    }

    if (bestCoverage < MIN_MAP_COVERAGE_RATIO) {
      throw new Error(
        "지도 타일이 비어 있어 캡처를 중단했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
    return bestCanvas;
  } finally {
    clearCaptureIndexes(mapContainer);
    // capture-readable 제거는 정보창 캡처 모드 종료 시(React effect)에서 처리한다.
    // 여기서 제거하면 다중 타일 캡처 도중 크기가 원복돼 위치가 어긋난다.
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("이미지 Blob 생성에 실패했습니다."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const clone = document.createElement("canvas");
  clone.width = source.width;
  clone.height = source.height;
  const ctx = clone.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context를 생성할 수 없습니다.");
  }
  ctx.drawImage(source, 0, 0);
  return clone;
}

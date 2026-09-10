import type { ZBarScanner, ZBarSymbol } from "@undecaf/zbar-wasm";
import { stripMaterialCode } from "@/features/barcode/lib/strip-material-code";

/**
 * 실제 현장 사진은 라벨이 기울어져 찍히는 경우가 대부분이라, 바코드 막대가 수평이
 * 아니면 디코더가 패턴을 잃는다(사람 눈에는 멀쩡히 읽혀도). 그래서 사진을 한 번만
 * 디코딩하지 않고 여러 각도로 회전시켜가며 반복 시도한다 — 기울어진 사진에서
 * 바코드를 복구하는 핵심 로직이다.
 */

let scannerPromise: Promise<ZBarScanner> | null = null;

function getScanner(): Promise<ZBarScanner> {
  if (!scannerPromise) {
    scannerPromise = import("@undecaf/zbar-wasm").then((mod) => mod.getDefaultScanner());
  }
  return scannerPromise;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function elementSize(el: HTMLImageElement | HTMLCanvasElement): {
  width: number;
  height: number;
} {
  if (el instanceof HTMLImageElement) {
    return { width: el.naturalWidth || el.width, height: el.naturalHeight || el.height };
  }
  return { width: el.width, height: el.height };
}

/**
 * 먼지·산화·바랜 인쇄 등으로 막대/배경 대비가 낮은 사진을 한 번만 선형 대비
 * 스트레칭한다(회전 시도마다 반복하지 않는다). 이미 밝은 사진은 범위가 이미
 * 0~255에 가까워 사실상 변화가 없다.
 */
function enhanceContrast(img: HTMLImageElement): HTMLCanvasElement {
  const { width: iw, height: ih } = elementSize(img);
  const maxDim = 2200;
  const scale = Math.min(1, maxDim / Math.max(iw, ih));
  const cw = Math.max(1, Math.round(iw * scale));
  const ch = Math.max(1, Math.round(ih * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.drawImage(img, 0, 0, cw, ch);
  const imageData = ctx.getImageData(0, 0, cw, ch);
  const data = imageData.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  const range = max - min;
  if (range > 10 && range < 255) {
    const factor = 255 / range;
    for (let j = 0; j < data.length; j += 4) {
      data[j] = Math.min(255, Math.max(0, (data[j] - min) * factor));
      data[j + 1] = Math.min(255, Math.max(0, (data[j + 1] - min) * factor));
      data[j + 2] = Math.min(255, Math.max(0, (data[j + 2] - min) * factor));
    }
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas;
}

/** 이미지를 `maxDim` 기준으로 키우고 `angleDeg`만큼 회전해 흰 배경 캔버스에 그린다. */
function rotatedImageData(
  source: HTMLImageElement | HTMLCanvasElement,
  angleDeg: number,
  maxDim: number,
): ImageData {
  const { width: iw, height: ih } = elementSize(source);
  const scale = maxDim / Math.max(iw, ih);
  const sw = Math.max(1, Math.round(iw * scale));
  const sh = Math.max(1, Math.round(ih * scale));

  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const cw = Math.ceil(sw * cos + sh * sin);
  const ch = Math.ceil(sw * sin + sh * cos);

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D 컨텍스트를 생성하지 못했습니다.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, ch);
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(rad);
  ctx.drawImage(source, -sw / 2, -sh / 2, sw, sh);
  return ctx.getImageData(0, 0, cw, ch);
}

interface SweepPass {
  maxDim: number;
  step: number;
  range: number;
  base: number;
}

interface TallyEntry {
  count: number;
  type: string;
  text: string;
}

/**
 * 한 번의 스윕(기준각 하나) 동안 디코딩된 값을 집계한다. 같은 라벨에 여러 코드가
 * 함께 찍힌 사진(운송 스티커+실제 일련번호 QR 등)에서, 13·15자리로 떨어지는 값을
 * 우선하고(이 도구가 다루는 바코드 길이), 그다음 QR이 아닌 실제 바코드를 우선하며,
 * 마지막으로 가장 많이 반복된 값을 고른다.
 */
async function sweepDecode(source: HTMLCanvasElement, pass: SweepPass): Promise<string | null> {
  const scanner = await getScanner();
  const { scanImageData } = await import("@undecaf/zbar-wasm");
  const tally = new Map<string, TallyEntry>();

  for (let angle = pass.base - pass.range; angle <= pass.base + pass.range; angle += pass.step) {
    let imageData: ImageData;
    try {
      imageData = rotatedImageData(source, angle, pass.maxDim);
    } catch {
      continue;
    }

    let symbols: ZBarSymbol[];
    try {
      symbols = await scanImageData(imageData, scanner);
    } catch {
      continue;
    }

    for (const symbol of symbols) {
      let text: string;
      try {
        text = symbol.decode();
      } catch {
        continue;
      }
      if (!text) continue;
      const key = `${symbol.typeName}|${text}`;
      const entry = tally.get(key);
      if (entry) {
        entry.count += 1;
      } else {
        tally.set(key, { count: 1, type: symbol.typeName, text });
      }
    }
  }

  if (tally.size === 0) return null;

  const entries = [...tally.values()].sort((a, b) => {
    const aLen = stripMaterialCode(a.text).length;
    const bLen = stripMaterialCode(b.text).length;
    const aValid = aLen === 13 || aLen === 15 ? 1 : 0;
    const bValid = bLen === 13 || bLen === 15 ? 1 : 0;
    if (aValid !== bValid) return bValid - aValid;
    const aNonQr = a.type !== "ZBAR_QRCODE" ? 1 : 0;
    const bNonQr = b.type !== "ZBAR_QRCODE" ? 1 : 0;
    if (aNonQr !== bNonQr) return bNonQr - aNonQr;
    return b.count - a.count;
  });

  return entries[0].text;
}

/**
 * 스윕을 중심으로 삼을 기준각들. 살짝 기울어진 채 거의 바로 선 사진(기준 0)이
 * 흔하지만, 휴대폰은 라벨을 거꾸로(기준 180) 찍는 일도 그만큼 흔하다 — 0 주변의
 * 넓은 스윕만으로는 닿지 않는 반바퀴 차이라 별도 패스가 필요하다. 캐비닛에
 * 옆으로 붙은 라벨(기준 90/270)은 손으로 찍은 사진에서는 드물어 마지막에 본다.
 */
const BASE_ANGLES = [0, 180, 90, 270];

/** 사진 데이터URL에서 바코드를 디코딩한다. 실패하면 null을 반환한다. */
export async function decodeImage(dataUrl: string): Promise<string | null> {
  try {
    await import("@undecaf/zbar-wasm");
  } catch {
    return null;
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(dataUrl);
  } catch {
    return null;
  }

  const source = enhanceContrast(img);

  // 흔한 경우(바로 서 있거나 거꾸로, 너무 흐리지 않은 사진)를 먼저 빠르게
  // 훑고, 아무것도 못 찾았을 때만 더 느리고 고해상도인 패스로 넘어간다.
  const passes: SweepPass[] = [
    ...BASE_ANGLES.map((base) => ({ maxDim: 1400, step: 5, range: 30, base })),
    // range 50(40이 아니라)으로 잡아 90도 간격인 네 기준각이 서로 겹치며
    // 360도 전체를 빈틈없이 덮는다 — 사진이 어느 각도로 찍혔든 어느 패스든 걸린다.
    ...BASE_ANGLES.map((base) => ({ maxDim: 2000, step: 3, range: 50, base })),
  ];

  for (const pass of passes) {
    const result = await sweepDecode(source, pass);
    if (result) return result;
  }
  return null;
}

/**
 * 인식에 성공한 사진의 축소 사본을 만든다. QR 결과 카드 옆에 함께 보여주고
 * 라이트박스로 확대할 수 있게 한다. 인식에 성공한 각도가 사진의 실제 정방향이라는
 * 보장은 없어(QR 인식은 사람이 라벨을 읽는 것보다 회전에 훨씬 관대하다) 표시용
 * 사본은 촬영된 그대로 둔다 — 자동 회전을 걸면 바로잡는 만큼 자주 틀어질 수 있다.
 */
export async function makeThumbnail(dataUrl: string, maxDim: number): Promise<string | null> {
  try {
    const img = await loadImage(dataUrl);
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.min(1, maxDim / Math.max(iw, ih));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(iw * scale));
    canvas.height = Math.max(1, Math.round(ih * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

export { readFileAsDataUrl };

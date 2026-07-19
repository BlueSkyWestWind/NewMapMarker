/**
 * 좌표 파싱·변환 순수 유틸. (GPSMAP_V3.1.html 로직 이식)
 * - 다양한 좌표 표기(십진수/도분초/GPS/N·S·E·W)를 한국 범위로 검증해 파싱
 * - 십진수 ↔ 도분초(도/분/초/시), 구글 검색용 좌표 문자열
 */

export interface CoordPair {
  lat: number;
  lon: number;
}

export interface DmsParts {
  /** 부호 포함 도 */
  d: number;
  /** 2자리 문자열 */
  m: string;
  s: string;
  /** 1/100초 2자리 문자열 */
  cs: string;
}

/** 두 값이 한국 위경도 범위면 (lat, lon) 순서를 바로잡아 반환. */
export function validateKoreaCoordPair(
  val1: unknown,
  val2: unknown,
): CoordPair | null {
  const a = parseFloat(String(val1));
  const b = parseFloat(String(val2));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a >= 30 && a <= 45 && b >= 120 && b <= 135) return { lat: a, lon: b };
  if (a >= 120 && a <= 135 && b >= 30 && b <= 45) return { lat: b, lon: a };
  return null;
}

/** 도분초 문자열 → 십진수. (도, 도분, 도분초, 도분초시 지원) */
export function dmsToDecimal(dmsStr: string): number | null {
  const normalizedDms = String(dmsStr || '').replace(/(?<=\d)\s*-\s*(?=\d)/g, ' ');
  const matched = normalizedDms.match(/[+-]?\d+(?:\.\d+)?/g);
  if (!matched) return null;
  const nums = matched.map(Number);
  if (nums.length >= 4) {
    const sign = nums[0] < 0 ? -1 : 1;
    return sign * (Math.abs(nums[0]) + nums[1] / 60 + (nums[2] + nums[3] / 100) / 3600);
  }
  if (nums.length >= 3) {
    const sign = nums[0] < 0 ? -1 : 1;
    return sign * (Math.abs(nums[0]) + nums[1] / 60 + nums[2] / 3600);
  }
  return nums.length === 1 ? nums[0] : null;
}

/**
 * 한 줄 입력에서 좌표를 파싱한다. 좌표가 아니면(주소/상호) null.
 * 한글이 있고 좌표 키워드가 없으면 주소로 간주해 null.
 */
export function parseCoords(line: string): CoordPair | null {
  const raw = String(line || '').trim().replace(/["']/g, '');
  if (!raw) return null;

  const hasCoordWord = /(gps|좌표|위도|경도|lat|lng|lon|long|latitude|longitude)/i.test(raw);
  const hasKorean = /[가-힣]/.test(raw);
  if (hasKorean && !hasCoordWord) return null;

  const floatOf = (v: string): number | null => {
    const x = parseFloat(String(v || '').trim());
    return Number.isFinite(x) ? x : null;
  };

  const latMatch = raw.match(/(?:latitude|lat|위도)\s*[:=：]?\s*([+-]?\d{1,3}(?:\.\d+)?)/i);
  const lonMatch = raw.match(/(?:longitude|long|lng|lon|경도)\s*[:=：]?\s*([+-]?\d{1,3}(?:\.\d+)?)/i);
  if (latMatch && lonMatch) {
    const pair = validateKoreaCoordPair(floatOf(latMatch[1]), floatOf(lonMatch[1]));
    if (pair) return pair;
  }

  if (lonMatch && lonMatch.index !== undefined) {
    const before = raw.slice(0, lonMatch.index);
    const beforeNums = before.match(/[+-]?\d{1,3}(?:\.\d+)?/g) || [];
    if (beforeNums.length) {
      const pair = validateKoreaCoordPair(
        floatOf(beforeNums[beforeNums.length - 1]),
        floatOf(lonMatch[1]),
      );
      if (pair) return pair;
    }
  }

  const ns = raw.match(/(?:^|\s)[NS]\s*([+-]?\d{1,3}(?:\.\d+)?)/i);
  const ew = raw.match(/(?:^|\s)[EW]\s*([+-]?\d{1,3}(?:\.\d+)?)/i);
  if (ns && ew) {
    let lat = floatOf(ns[1]);
    let lon = floatOf(ew[1]);
    if (lat !== null && /S/i.test(ns[0])) lat = -Math.abs(lat);
    if (lon !== null && /W/i.test(ew[0])) lon = -Math.abs(lon);
    const pair = validateKoreaCoordPair(lat, lon);
    if (pair) return pair;
  }

  if (raw.includes('/')) {
    const sides = raw.split('/').map((s) => s.trim()).filter(Boolean);
    if (sides.length >= 2) {
      const pair = validateKoreaCoordPair(dmsToDecimal(sides[0]), dmsToDecimal(sides[1]));
      if (pair) return pair;
    }
  }

  if (raw.includes(',')) {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const pair = validateKoreaCoordPair(dmsToDecimal(parts[0]), dmsToDecimal(parts[1]));
      if (pair) return pair;
    }
  }

  const normalized = raw.replace(/(?<=\d)\s*-\s*(?=\d)/g, ' ');
  const decimalNums = (normalized.match(/[+-]?\d{1,3}\.\d+/g) || []).map(Number);
  for (let i = 0; i + 1 < decimalNums.length; i++) {
    const pair = validateKoreaCoordPair(decimalNums[i], decimalNums[i + 1]);
    if (pair) return pair;
  }

  const nums = (normalized.match(/[+-]?\d+(?:\.\d+)?/g) || []).map(Number);
  for (let i = 0; i + 7 < nums.length; i++) {
    const pair = validateKoreaCoordPair(
      dmsToDecimal(nums.slice(i, i + 4).join(' ')),
      dmsToDecimal(nums.slice(i + 4, i + 8).join(' ')),
    );
    if (pair) return pair;
  }
  for (let i = 0; i + 5 < nums.length; i++) {
    const pair = validateKoreaCoordPair(
      dmsToDecimal(nums.slice(i, i + 3).join(' ')),
      dmsToDecimal(nums.slice(i + 3, i + 6).join(' ')),
    );
    if (pair) return pair;
  }
  for (let i = 0; i + 1 < nums.length; i++) {
    const pair = validateKoreaCoordPair(nums[i], nums[i + 1]);
    if (pair) return pair;
  }
  return null;
}

function pad2(v: number): string {
  return v < 10 ? '0' + v : String(v);
}

/** 십진수 도 → 도/분/초/(1/100초) 파트. 유효하지 않으면 null. */
export function splitDmsParts(deg: number): DmsParts | null {
  const numeric = Number(deg);
  if (!Number.isFinite(numeric)) return null;

  const sign = numeric < 0 ? -1 : 1;
  const abs = Math.abs(numeric);
  let d = Math.floor(abs);
  const minFloat = (abs - d) * 60;
  let m = Math.floor(minFloat);
  const secFloat = (minFloat - m) * 60;
  const totalCs = Math.round(secFloat * 100);
  let s = Math.floor(totalCs / 100);
  const cs = totalCs % 100;

  if (s >= 60) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m = 0;
    d += 1;
  }

  return { d: d * sign, m: pad2(m), s: pad2(s), cs: pad2(cs) };
}

/** 구글 검색용 좌표 문자열 (예: 37°34'46.08"N 126°58'43.47"E). */
export function makeGoogleSearchCoordinate(lat: number, lon: number): string {
  const latParts = splitDmsParts(lat);
  const lonParts = splitDmsParts(lon);
  if (!latParts || !lonParts) return '-';

  const latDir = lat < 0 ? 'S' : 'N';
  const lonDir = lon < 0 ? 'W' : 'E';

  return (
    `${Math.abs(latParts.d)}°${latParts.m}'${latParts.s}.${latParts.cs}"${latDir} ` +
    `${Math.abs(lonParts.d)}°${lonParts.m}'${lonParts.s}.${lonParts.cs}"${lonDir}`
  );
}

/** 입력 문자열이 좌표인지 주소/상호인지 판별. */
export function detectInputType(text: string): 'coord' | 'address' {
  return parseCoords(text) ? 'coord' : 'address';
}

import { classifyKoreanAddress } from "@/features/map-marker/lib/geocode";

/** 동·리·가 이름 + (산) + 번지. 뒤에 글자가 붙은 숫자(`201호`)는 번지가 아니다. */
const LOT_PATTERN =
  /([가-힣0-9]+(?:동|리|가|읍|면))\s*(산\s*)?(\d+(?:-\d+)?)(?:\s*번지)?(?![\d가-힣-])/;
/** 도로명(`판교로 12번길` 포함) + 건물번호 */
const ROAD_PATTERN =
  /([가-힣A-Za-z0-9]+(?:로|길)(?:\s*\d+번?길)?)\s*(\d+(?:-\d+)?)(?![\d가-힣])/;
/** 시도 단위는 표기가 제각각(`광주광역시`/`광주`)이라 비교에서 뺀다 */
const METRO_PATTERN = /(광역|특별|자치)시$/;

interface AddressKey {
  key: string;
  /** 위치 앞쪽 글자. 시·군·구를 찾는 범위다 */
  prefix: string;
}

function lotKey(address: string): AddressKey | null {
  const match = LOT_PATTERN.exec(address);
  if (!match) return null;
  return {
    key: `${match[1]}|${match[2] ? "산" : ""}|${match[3]}`,
    prefix: address.slice(0, match.index),
  };
}

function roadKey(address: string): AddressKey | null {
  const match = ROAD_PATTERN.exec(address);
  if (!match) return null;
  return {
    key: `${match[1].replace(/\s+/g, "")}|${match[2]}`,
    prefix: address.slice(0, match.index),
  };
}

function districtTokens(prefix: string): string[] {
  return prefix
    .split(/\s+/)
    .filter((token) => /(시|군|구)$/.test(token) && !METRO_PATTERN.test(token));
}

/**
 * 엑셀 주소와 좌표의 주소가 같은 곳을 가리키는지 비교한다.
 * 비교할 수 없는 경우도 `false`다 — 사용자가 직접 보고 판단해야 하기 때문이다.
 */
export function isSameAddress(
  excelAddress: string,
  actual: { roadAddress: string; jibunAddress: string } | null,
): boolean {
  if (!actual) return false;

  const isRoad = classifyKoreanAddress(excelAddress) === "road";
  const expected = isRoad ? roadKey(excelAddress) : lotKey(excelAddress);
  const actualAddress = isRoad ? actual.roadAddress : actual.jibunAddress;
  const found = isRoad ? roadKey(actualAddress) : lotKey(actualAddress);
  if (!expected || !found || expected.key !== found.key) return false;

  const actualTokens = new Set(found.prefix.split(/\s+/));
  return districtTokens(expected.prefix).every((token) => actualTokens.has(token));
}

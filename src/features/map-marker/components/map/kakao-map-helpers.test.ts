import { describe, expect, it } from "vitest";
import {
  isEquipmentSubMarker,
  isMultiSelectGesture,
  isPlottableCoordinate,
} from "./kakao-map-helpers";

describe("isEquipmentSubMarker", () => {
  it("parentMarkerId가 있으면 서브", () => {
    expect(isEquipmentSubMarker({ parentMarkerId: "m1" })).toBe(true);
  });

  it("없거나 null이면 대표", () => {
    expect(isEquipmentSubMarker({})).toBe(false);
    expect(isEquipmentSubMarker({ parentMarkerId: null })).toBe(false);
  });
});

describe("isPlottableCoordinate", () => {
  it("정상 좌표는 true", () => {
    expect(isPlottableCoordinate(37.5, 127.0)).toBe(true);
  });

  it("(0,0)은 제외", () => {
    expect(isPlottableCoordinate(0, 0)).toBe(false);
  });

  it("NaN/Infinity는 제외", () => {
    expect(isPlottableCoordinate(Number.NaN, 127)).toBe(false);
    expect(isPlottableCoordinate(37, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("isMultiSelectGesture", () => {
  const noModifiers = { ctrl: false, shift: false };

  it("마우스 ctrl/shift/meta면 true", () => {
    expect(
      isMultiSelectGesture({ ctrlKey: true } as MouseEvent, noModifiers),
    ).toBe(true);
    expect(
      isMultiSelectGesture({ shiftKey: true } as MouseEvent, noModifiers),
    ).toBe(true);
    expect(
      isMultiSelectGesture({ metaKey: true } as MouseEvent, noModifiers),
    ).toBe(true);
  });

  it("키보드 수정자 상태만으로도 true", () => {
    expect(isMultiSelectGesture(undefined, { ctrl: true, shift: false })).toBe(
      true,
    );
  });

  it("아무 수정자도 없으면 false", () => {
    expect(isMultiSelectGesture({} as MouseEvent, noModifiers)).toBe(false);
    expect(isMultiSelectGesture(undefined, noModifiers)).toBe(false);
  });
});

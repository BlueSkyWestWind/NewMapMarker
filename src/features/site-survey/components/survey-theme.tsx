"use client";

// Astryx 스타일은 이 화면에서만 불러온다. 화면 전체가 `dynamic()`으로 지연 로딩되므로
// 홈 번들에는 들어가지 않고, 앱의 globals.css·Tailwind 설정은 건드리지 않는다.
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";

import type { ReactNode } from "react";
import { useTheme } from "next-themes";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

/** 앱의 라이트/다크 설정(next-themes)을 따라가는 Astryx 테마 래퍼 */
export function SurveyTheme({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const mode = resolvedTheme === "light" ? "light" : "dark";
  return (
    <Theme theme={neutralTheme} mode={mode}>
      {children}
    </Theme>
  );
}

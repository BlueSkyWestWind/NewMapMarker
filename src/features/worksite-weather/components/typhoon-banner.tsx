"use client";

import { Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TyphoonInfo } from "@/features/worksite-weather/types/weather";

interface TyphoonBannerProps {
  typhoon: TyphoonInfo | null;
  /** 상세 모달 열기. 모달 인스턴스는 패널이 하나만 소유한다. */
  onOpenDetail: () => void;
}

/**
 * 태풍 패널 — 태풍특보가 발효 중일 때 노출된다.
 * 모달을 직접 들고 있지 않다. 패널의 태풍 모달과 두 개가 동시에 열리던 문제 때문이다.
 */
export function TyphoonBanner({ typhoon, onOpenDetail }: TyphoonBannerProps) {
  if (!typhoon) return null;

  return (
    <section className="rounded-lg border border-rose-500/60 bg-rose-950/60 px-3 py-2.5 text-rose-100 shadow-md">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-rose-200">
          <span className="text-sm" aria-hidden>
            🌀
          </span>
          태풍{typhoon.alertLevel} 발효
        </h3>
        <Button
          type="button"
          size="sm"
          className="h-6 border border-rose-400/50 bg-rose-900/80 px-2 text-[10px] font-semibold text-white hover:bg-rose-800"
          onClick={onOpenDetail}
        >
          <Wind className="mr-1 h-3 w-3 text-rose-300" />
          태풍 지도/통보문 보기
        </Button>
      </div>

      {typhoon.detail ? (
        <dl className="mt-1.5 space-y-0.5 text-[10px] leading-relaxed text-rose-200/90">
          <div>
            제{typhoon.detail.number}호 태풍 {typhoon.detail.name}
          </div>
          <div>현재 위치 {typhoon.detail.position}</div>
          <div>
            중심기압 {typhoon.detail.pressureHpa ?? "-"}hPa · 최대풍속{" "}
            {typhoon.detail.maxWindMs ?? "-"}m/s
          </div>
          <div>예상 진로 {typhoon.detail.forecast}</div>
        </dl>
      ) : (
        <p className="mt-1 text-[10px] leading-relaxed text-rose-200/90">
          {typhoon.region ? `${typhoon.region} · ` : ""}
          기상청 태풍 분석 진로도 및 통보문을 확인하세요.
        </p>
      )}
      <p className="mt-1.5 text-[11px] font-semibold text-rose-300">⛔ 작업 연기 권고</p>
    </section>
  );
}

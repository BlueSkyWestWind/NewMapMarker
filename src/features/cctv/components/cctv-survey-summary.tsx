"use client";

import { cn } from "@/lib/utils";
import type { CctvSurvey } from "@/features/cctv/types/cctv";

interface CctvSurveySummaryProps {
  survey: CctvSurvey;
}

const VERDICT_TONE: Record<CctvSurvey["roadSectionVerdict"], string> = {
  직접사용: "border-emerald-700/60 bg-emerald-950/50 text-emerald-200",
  부분활용: "border-amber-700/60 bg-amber-950/50 text-amber-200",
  공간매칭필요: "border-orange-700/60 bg-orange-950/50 text-orange-200",
  판정불가: "border-slate-700 bg-slate-900/70 text-slate-300",
};

const VERDICT_NOTE: Record<CctvSurvey["roadSectionVerdict"], string> = {
  직접사용: "공간매칭 공정을 생략할 수 있습니다 (4주차 단축)",
  부분활용: "빈 건만 공간매칭으로 보완합니다",
  공간매칭필요: "공간매칭을 전면 적용해야 합니다",
  판정불가: "수집 결과가 없어 판정할 수 없습니다",
};

/**
 * 계획서 §10 선결 확인 1·2번 결과.
 * 원래 별도 Python 스크립트로 확인하던 것을 화면에서 바로 볼 수 있게 했다.
 */
export function CctvSurveySummary({ survey }: CctvSurveySummaryProps) {
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-slate-800 bg-slate-900/70 px-2.5 py-2">
        <p className="text-[11px] font-semibold text-slate-200">
          수집 <span className="tabular-nums text-sky-300">{survey.total.toLocaleString()}</span>대
        </p>
        {survey.byRoadType.length > 0 ? (
          <p className="mt-0.5 text-[10px] text-slate-400">
            {survey.byRoadType
              .map((t) => `${t.label} ${t.count.toLocaleString()}대`)
              .join(" · ")}
          </p>
        ) : null}
      </div>

      {/* 선결 확인 1 — roadsectionid 채움률 */}
      <div
        className={cn(
          "rounded-md border px-2.5 py-2 text-[10px] leading-relaxed",
          VERDICT_TONE[survey.roadSectionVerdict],
        )}
      >
        <p className="text-[11px] font-semibold">
          ① roadsectionid — {survey.roadSectionVerdict}
        </p>
        {survey.total === 0 ? (
          <p className="mt-0.5">
            수집 0건입니다. 인증키·조회 범위·도로 종별을 먼저 확인하세요.
          </p>
        ) : survey.hasRoadSectionField ? (
          <p className="mt-0.5 tabular-nums">
            채움 {survey.roadSectionFilled.toLocaleString()} / {survey.total.toLocaleString()}건
            ({survey.roadSectionFilledPercent}%)
          </p>
        ) : (
          <p className="mt-0.5">응답에 roadsectionid 필드 자체가 없습니다.</p>
        )}
        <p className="mt-0.5 opacity-90">→ {VERDICT_NOTE[survey.roadSectionVerdict]}</p>

        {/* 필드를 못 찾았을 때 실제 필드명을 보여준다.
            이름이 다른 것인지 진짜 없는 것인지는 이걸 봐야 판단할 수 있다. */}
        {!survey.hasRoadSectionField && survey.sampleFields.length > 0 ? (
          <details className="mt-1">
            <summary className="cursor-pointer opacity-90">
              실제 응답 필드 {survey.sampleFields.length}개 보기
            </summary>
            <p className="mt-1 break-all font-mono text-[9px] opacity-80">
              {survey.sampleFields.join(", ")}
            </p>
          </details>
        ) : null}
      </div>

      {/* 선결 확인 2 — 명칭 방향 표기 */}
      <div
        className={cn(
          "rounded-md border px-2.5 py-2 text-[10px] leading-relaxed",
          survey.needsManualDirectionUi
            ? "border-orange-700/60 bg-orange-950/50 text-orange-200"
            : "border-slate-800 bg-slate-900/70 text-slate-300",
        )}
      >
        <p className="text-[11px] font-semibold">② 명칭 방향 표기</p>
        <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 tabular-nums">
          <dt>상행/하행</dt>
          <dd className="text-right">{survey.directionUpDown.toLocaleString()}건</dd>
          <dt>○○방향</dt>
          <dd className="text-right">{survey.directionToward.toLocaleString()}건</dd>
          <dt>화살표</dt>
          <dd className="text-right">{survey.directionArrow.toLocaleString()}건</dd>
          <dt className="font-semibold">방향정보 없음</dt>
          <dd className="text-right font-semibold">
            {survey.directionNone.toLocaleString()}건 ({survey.directionNonePercent}%)
          </dd>
        </dl>
        {survey.needsManualDirectionUi ? (
          <p className="mt-1 font-semibold">
            ⚠️ 30%를 넘습니다 — 수동 보정 화면을 계획에 포함해야 합니다
          </p>
        ) : (
          <p className="mt-1 opacity-90">→ 파싱 자동화로 충분합니다</p>
        )}

        {survey.topTowards.length > 0 ? (
          <p className="mt-1 break-keep opacity-90">
            상위 방향:{" "}
            {survey.topTowards
              .slice(0, 8)
              .map((t) => `${t.word}(${t.count})`)
              .join(", ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

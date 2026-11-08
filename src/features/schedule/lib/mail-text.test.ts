import { describe, expect, it } from "vitest";
import { buildMailText, type MailRow } from "@/features/schedule/lib/mail-text";

const row = (site: string, teams: string[], extra: Partial<MailRow["values"]> = {}): MailRow => ({
  site,
  teams,
  values: { workTime: "주간", witness: "", signaler: "", equipment: "", workDetail: "", ...extra },
});

describe("buildMailText", () => {
  it("팀 묶음별로 나누고 입회·신호수·중장비·작업내용 상세를 대괄호·괄호로 붙인다", () => {
    const text = buildMailText("2026-11-09", [
      row("(공동)강광고속장암-RRU(F2)", ["1팀(박경훈)", "4팀(이동화)"], {
        witness: "박민수",
        signaler: "정창오",
        equipment: "이동식크레인,고소작업대(차)",
        workDetail: "강관주 건립작업",
      }),
      row("신월금호4_3-AAU", ["5팀(김영남)"], { witness: "김성권", signaler: "구삼남,구제신", workDetail: "64T대개체작업" }),
      row("국동신월_1-AAU", ["5팀(김영남)"], { workDetail: "64T대개체작업" }),
    ]);
    expect(text).toBe(
      [
        "[2026-11-09 시설일정]",
        "1팀(박경훈),4팀(이동화)",
        "   -> [주간] [입회 : 박민수] [신호수 : 정창오] [중장비 : 이동식크레인,고소작업대(차)] (공동)강광고속장암-RRU(F2) (강관주 건립작업)",
        "",
        "5팀(김영남)",
        "   -> [주간] [입회 : 김성권] [신호수 : 구삼남,구제신] 신월금호4_3-AAU (64T대개체작업)",
        "   -> [주간] 국동신월_1-AAU (64T대개체작업)",
      ].join("\n"),
    );
  });

  it("비어 있는 항목은 빼고, 팀이 없는 행은 '팀 미지정' 묶음에 둔다", () => {
    const text = buildMailText("2026-11-09", [row("가국소", [], { workTime: "" })]);
    expect(text).toBe(["[2026-11-09 시설일정]", "팀 미지정", "   -> 가국소"].join("\n"));
  });

  it("행이 없으면 제목 줄만 돌려준다", () => {
    expect(buildMailText("2026-11-09", [])).toBe("[2026-11-09 시설일정]");
  });
});

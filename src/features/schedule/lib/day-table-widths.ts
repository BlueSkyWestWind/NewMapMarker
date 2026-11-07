import { DAY_COLUMNS } from "@/features/schedule/lib/day-columns";

/** 체크 칸의 열 폭 비중(엑셀 열 폭의 문자 수 단위) */
export const CHECK_WIDTH_WEIGHT = 4;

const TOTAL_WEIGHT = DAY_COLUMNS.reduce((sum, column) => sum + column.widthChars, CHECK_WIDTH_WEIGHT);

/** 체크 칸 + 24열 표(`table-fixed`)에서 열 하나가 차지하는 폭(%). 일자별·누적 표가 같이 쓴다. */
export const widthPercent = (weight: number) => `${(weight / TOTAL_WEIGHT) * 100}%`;

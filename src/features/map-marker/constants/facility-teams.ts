export const FACILITY_TEAMS = {
  '1': { label: '1팀', leader: '박경훈', color: '#2563eb' },
  '2': { label: '2팀', leader: '김정배', color: '#d946ef' },
  '3': { label: '3팀', leader: '정종연', color: '#84cc16' },
  '4': { label: '4팀', leader: '이동화', color: '#9333ea' },
  '5': { label: '5팀', leader: '김영남', color: '#ea580c' },
  '7': { label: '7팀', leader: '김성범', color: '#0891b2' },
} as const;

export type FacilityTeamId = keyof typeof FACILITY_TEAMS;

export const DEFAULT_MARKER_COLOR = '#10b981';
export const BATTERY_UNASSIGNED_COLOR = '#64748b';
export const TEMP_MARKER_COLOR = '#ef4444';
export const PENDING_MARKER_COLOR = '#f59e0b';

export const LEGACY_COLOR_NAMES: Record<string, string> = {
  '#10b981': '에메랄드',
  '#64748b': '미지정',
  '#6366f1': '인디고',
  '#f43f5e': '로즈',
  '#f59e0b': '골드',
  '#8b5cf6': '퍼플',
  '#06b6d4': '시안',
  '#ec4899': '핑크',
  '#84cc16': '라임',
  '#14b8a6': '틸',
  '#f97316': '오렌지',
};

/** 한글 이름·오타 → hex (백업 복원용) */
const COLOR_NAME_ALIASES: Record<string, string> = {
  에멜랄드: '#10b981',
  에메랄드: '#10b981',
  미지정: '#64748b',
  인디고: '#6366f1',
  로즈: '#f43f5e',
  골드: '#f59e0b',
  퍼플: '#8b5cf6',
  시안: '#06b6d4',
  핑크: '#ec4899',
  라임: '#84cc16',
  틸: '#14b8a6',
  오렌지: '#f97316',
};

export function getColorDisplayName(colorHex: string): string {
  const normalized = (colorHex || '').toLowerCase().trim();
  if (!normalized) {
    return LEGACY_COLOR_NAMES[DEFAULT_MARKER_COLOR];
  }
  for (const team of Object.values(FACILITY_TEAMS)) {
    if (team.color.toLowerCase() === normalized) {
      return team.label;
    }
  }
  return LEGACY_COLOR_NAMES[normalized] ?? colorHex;
}

/** 백업 엑셀 색상 셀 → DB hex (`에메랄드`, `#10b981` 모두 허용) */
export function resolveColorToHex(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return DEFAULT_MARKER_COLOR;
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) {
    return raw.toLowerCase();
  }
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) {
    return `#${raw.toLowerCase()}`;
  }

  const byAlias = COLOR_NAME_ALIASES[raw];
  if (byAlias) {
    return byAlias;
  }

  const lower = raw.toLowerCase();
  for (const [hex, label] of Object.entries(LEGACY_COLOR_NAMES)) {
    if (label === raw || label.toLowerCase() === lower) {
      return hex;
    }
  }
  for (const team of Object.values(FACILITY_TEAMS)) {
    if (team.label === raw || team.leader === raw) {
      return team.color;
    }
  }

  return DEFAULT_MARKER_COLOR;
}

export const COLOR_FILTER_ORDER = [
  '#2563eb',
  '#d946ef',
  '#84cc16',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#64748b',
  '#10b981',
  '#6366f1',
  '#f43f5e',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

export const UNSPECIFIED_FILTER_LABEL = '미지정';

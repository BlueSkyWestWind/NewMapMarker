import {
  BATTERY_UNASSIGNED_COLOR,
  DEFAULT_MARKER_COLOR,
  FACILITY_TEAMS,
  LEGACY_COLOR_NAMES,
  TEMP_MARKER_COLOR,
} from '@/features/map-marker/constants/facility-teams';
import type { MapMode, MarkerRecord } from '@/features/map-marker/types/marker';

const MARKER_GRADIENTS: Record<string, { start: string; end: string }> = {
  '#10b981': { start: '#10b981', end: '#059669' },
  '#6366f1': { start: '#6366f1', end: '#4f46e5' },
  '#f43f5e': { start: '#f43f5e', end: '#e11d48' },
  '#f59e0b': { start: '#f59e0b', end: '#d97706' },
  '#8b5cf6': { start: '#8b5cf6', end: '#7c3aed' },
  '#2563eb': { start: '#2563eb', end: '#1d4ed8' },
  '#d946ef': { start: '#d946ef', end: '#c026d3' },
  '#84cc16': { start: '#84cc16', end: '#65a30d' },
  '#9333ea': { start: '#9333ea', end: '#7e22ce' },
  '#ea580c': { start: '#ea580c', end: '#c2410c' },
  '#0891b2': { start: '#0891b2', end: '#0e7490' },
  '#64748b': { start: '#64748b', end: '#475569' },
};

const MARKER_PIN_OUTER_PATH =
  'M12,2 C6.48,2 2,6.48 2,12 C2,19.2 12,34 12,34 C12,34 22,19.2 22,12 C22,6.48 17.52,2 12,2 Z';

const BATTERY_TAG_MARKER_SHAPES: Record<string, 'star' | 'square' | 'circle'> = {
  통합국: 'star',
  창고: 'square',
  기지국: 'circle',
};

const BATTERY_TAG_SHAPE_PRIORITY = ['통합국', '창고', '기지국'] as const;

const MARKER_SVG_GOLD =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="30" height="45">
  <defs>
    <linearGradient id="pin-gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
  </defs>
  <path d="M12,2 C6.48,2 2,6.48 2,12 C2,19.2 12,34 12,34 C12,34 22,19.2 22,12 C22,6.48 17.52,2 12,2 Z" fill="url(#pin-gold)" stroke="#ffffff" stroke-width="1.5"/>
  <circle cx="12" cy="12" r="4.5" fill="#ffffff"/>
</svg>`);

function getMarkerGradientTheme(colorHex: string) {
  return MARKER_GRADIENTS[colorHex] ?? { start: colorHex, end: colorHex };
}

function getMarkerInnerShape(innerShape: 'star' | 'square' | 'circle') {
  if (innerShape === 'square') {
    return '<rect x="7.2" y="6.2" width="9.6" height="9.6" rx="0.6" fill="#ffffff"/>';
  }
  if (innerShape === 'star') {
    return '<path d="M12,5.4 L13.75,9.95 H18.6 L14.7,12.75 L16.45,17.3 L12,14.35 L7.55,17.3 L9.3,12.75 L5.4,9.95 H10.25 Z" fill="#ffffff"/>';
  }
  return '<circle cx="12" cy="11" r="5.2" fill="#ffffff"/>';
}

function getBatteryMarkerShape(marker: MarkerRecord) {
  const name = marker.name || '';
  const tags = marker.tags || [];

  // 1. 이름이나 태그에서 '통합국' 검사
  const hasUnified = name.includes('통합국') || tags.some((t) => t.includes('통합국'));
  if (hasUnified) return 'star' as const;

  // 2. 이름이나 태그에서 '창고' 검사
  const hasWarehouse = name.includes('창고') || tags.some((t) => t.includes('창고'));
  if (hasWarehouse) return 'square' as const;

  // 3. 이름이나 태그에서 '기지국' 검사
  const hasBase = name.includes('기지국') || tags.some((t) => t.includes('기지국'));
  if (hasBase) return 'circle' as const;

  // 4. 그 외 기본 태그 우선순위 매칭
  for (const keyword of BATTERY_TAG_SHAPE_PRIORITY) {
    const matched = tags.some(
      (tag) => tag === keyword || tag.includes(keyword),
    );
    if (matched) return BATTERY_TAG_MARKER_SHAPES[keyword];
  }

  return 'circle' as const;
}

export function getFacilityTeamColor(teamId: string) {
  if (!teamId) return BATTERY_UNASSIGNED_COLOR;
  return FACILITY_TEAMS[teamId as keyof typeof FACILITY_TEAMS]?.color ?? BATTERY_UNASSIGNED_COLOR;
}

export function getFacilityTeamDisplayName(teamId: string) {
  const team = FACILITY_TEAMS[teamId as keyof typeof FACILITY_TEAMS];
  return team ? `${team.label}(${team.leader})` : '미지정';
}

export function getEffectiveMarkerColor(marker: MarkerRecord, mode: MapMode) {
  if (marker.isTemp) return TEMP_MARKER_COLOR;
  if (mode === 'battery') {
    if (marker.facilityTeam && FACILITY_TEAMS[marker.facilityTeam as keyof typeof FACILITY_TEAMS]) {
      return getFacilityTeamColor(marker.facilityTeam);
    }
    return BATTERY_UNASSIGNED_COLOR;
  }
  return marker.color || DEFAULT_MARKER_COLOR;
}

export function getMarkerColorLabel(colorHex: string) {
  const normalized = (colorHex || '').toLowerCase().trim();
  for (const [teamId, team] of Object.entries(FACILITY_TEAMS)) {
    if (team.color.toLowerCase() === normalized) {
      return getFacilityTeamDisplayName(teamId);
    }
  }
  return LEGACY_COLOR_NAMES[normalized] ?? colorHex;
}

export function getMarkerSvg(
  colorHex: string,
  innerShape: 'star' | 'square' | 'circle' = 'circle',
) {
  const theme = getMarkerGradientTheme(colorHex);
  const gradId = `grad-${colorHex.replace('#', '')}`;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="30" height="45">
  <defs>
    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.start}" />
      <stop offset="100%" stop-color="${theme.end}" />
    </linearGradient>
  </defs>
  <path d="${MARKER_PIN_OUTER_PATH}" fill="url(#${gradId})" stroke="#ffffff" stroke-width="1.5"/>
  ${getMarkerInnerShape(innerShape)}
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

export function getMarkerImageUri(marker: MarkerRecord, mode: MapMode) {
  if (marker.isPending) return MARKER_SVG_GOLD;

  const color = getEffectiveMarkerColor(marker, mode);
  const innerShape =
    mode === 'battery'
      ? getBatteryMarkerShape(marker)
      : ('circle' as const);

  return getMarkerSvg(color, innerShape);
}

"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { storedGroupRoleOf } from "@/features/map-marker/lib/marker-detail-rows";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import type {
  DraftIssue,
  EditDraft,
  InfoFields,
  InfoRecord,
  MarkerFields,
} from "../types";

const INPUT_BASE =
  "h-7 w-full whitespace-nowrap border-slate-700 bg-slate-900 px-1.5 text-xs";
const CHANGED = "border-amber-400 bg-amber-500/10";
const INVALID = "border-rose-500 bg-rose-500/10";

/** 칸 상태에 맞는 입력 클래스. 오류가 변경 강조보다 우선한다. */
function cellClass(changed: boolean, issue: DraftIssue | undefined): string {
  return `${INPUT_BASE} ${issue ? INVALID : changed ? CHANGED : ""}`;
}

function parseCoord(text: string): number | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : Number(trimmed);
}

/** 입력 중인 글자("37.")를 보존하려고 글자 상태를 따로 둔다. 바깥 값이 바뀌면 맞춘다. */
function CoordInput({
  value,
  changed,
  issue,
  disabled,
  label,
  onCommit,
}: {
  value: number | null;
  changed: boolean;
  issue: DraftIssue | undefined;
  disabled: boolean;
  label: string;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setText((prev) => {
      const parsed = parseCoord(prev);
      const same =
        parsed === value || (Number.isNaN(parsed) && Number.isNaN(value));
      return same ? prev : value == null ? "" : String(value);
    });
  }, [value]);
  return (
    <Input
      value={text}
      disabled={disabled}
      inputMode="decimal"
      aria-label={label}
      title={issue?.message}
      className={cellClass(changed, issue)}
      onChange={(event) => {
        setText(event.target.value);
        onCommit(parseCoord(event.target.value));
      }}
    />
  );
}

interface GroupTableProps {
  markers: EquipmentMarker[];
  workingMarkers: EquipmentMarker[];
  infoRows: InfoRecord[];
  draft: EditDraft;
  issues: DraftIssue[];
  disabled: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onMarker: (id: string, patch: Partial<MarkerFields>) => void;
  onInfo: (id: number, patch: Partial<InfoFields>) => void;
}

const HEAD_CELL =
  "sticky top-0 z-10 whitespace-nowrap bg-slate-900 px-1.5 py-1.5 text-left text-[11px] font-medium text-slate-300";
const CELL = "whitespace-nowrap px-1 py-1 align-middle text-xs text-slate-200";
const HEADS = [
  "구분",
  "국소명",
  "통합시설코드",
  "사업연도",
  "사업구분",
  "시설일",
  "개통일",
  "주소",
  "좌표 (위도 / 경도)",
];

/**
 * 묶음의 마커·정보 행을 한 표로 보여 주고 칸을 고친다.
 * 마커 하나에 정보 행이 여러 개면 행이 늘어난다(마커 칸은 첫 행에만).
 */
export function GroupTable({
  markers,
  workingMarkers,
  infoRows,
  draft,
  issues,
  disabled,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onMarker,
  onInfo,
}: GroupTableProps) {
  const issueOf = (key: string) => issues.find((issue) => issue.key === key);
  const working = new Map(workingMarkers.map((m) => [m.id, m]));
  const allChecked = workingMarkers.length > 0 && workingMarkers.every((m) => selectedIds.has(m.id));

  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col style={{ width: 32 }} />
        <col style={{ width: 64 }} />
        <col style={{ width: 170 }} />
        <col style={{ width: 120 }} />
        <col style={{ width: 70 }} />
        <col style={{ width: 100 }} />
        <col style={{ width: 108 }} />
        <col style={{ width: 108 }} />
        <col />
        <col style={{ width: 180 }} />
      </colgroup>
      <thead>
        <tr>
          <th className={HEAD_CELL}>
            <input
              type="checkbox"
              aria-label="전체 선택"
              checked={allChecked}
              disabled={disabled || workingMarkers.length === 0}
              onChange={(event) => onToggleAll(event.target.checked)}
            />
          </th>
          {HEADS.map((title) => (
            <th key={title} className={HEAD_CELL}>
              {title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {markers.map((original) => {
          const marker = working.get(original.id);
          // 삭제 예정 마커는 저장 전까지 흐리게·취소선으로 남겨 둔다(변경 취소로 되돌린다).
          if (!marker) {
            return (
              <tr
                key={`${original.id}:deleted`}
                className="border-b border-slate-800/80 text-slate-500 line-through"
              >
                <td className={CELL} />
                <td className={CELL}>
                  <span className="rounded-sm bg-rose-500/20 px-1 text-[11px] text-rose-200 no-underline">
                    삭제 예정
                  </span>
                </td>
                <td className={CELL}>{original.name}</td>
                <td className={CELL}>{original.facilityCode}</td>
                <td className={CELL} colSpan={6} />
              </tr>
            );
          }
          const rows = infoRows.filter((row) => row.markerId === marker.id);
          const slots: (InfoRecord | null)[] = rows.length > 0 ? rows : [null];
          const edit = draft.markerEdits[marker.id] ?? {};
          const address = marker.roadAddress || marker.jibunAddress;
          const role = storedGroupRoleOf(marker);

          const textCell = (field: "name" | "facilityCode", label: string) => {
            const issue = issueOf(`marker:${marker.id}:${field}`);
            return (
              <Input
                value={marker[field]}
                disabled={disabled}
                aria-label={`${original.name} ${label}`}
                title={issue?.message}
                className={cellClass(field in edit, issue)}
                onChange={(event) =>
                  onMarker(marker.id, { [field]: event.target.value })
                }
              />
            );
          };

          return slots.map((row, index) => {
            const infoEdit = row ? (draft.infoEdits[row.id] ?? {}) : {};
            const infoCell = (
              field: keyof InfoFields,
              label: string,
              placeholder?: string,
            ) => {
              if (!row) return <span className="px-1.5 text-slate-500">-</span>;
              const issue = issueOf(`info:${row.id}:${field}`);
              return (
                <Input
                  value={row[field]}
                  disabled={disabled}
                  aria-label={`${original.name} ${label}`}
                  placeholder={placeholder}
                  title={issue?.message}
                  className={cellClass(field in infoEdit, issue)}
                  onChange={(event) =>
                    onInfo(row.id, { [field]: event.target.value })
                  }
                />
              );
            };
            const first = index === 0;
            return (
              <tr
                key={`${marker.id}:${row?.id ?? "none"}`}
                className="border-b border-slate-800/80 hover:bg-slate-800/30"
              >
                <td className={CELL}>
                  {first ? (
                    <input
                      type="checkbox"
                      aria-label={`${original.name} 선택`}
                      checked={selectedIds.has(marker.id)}
                      disabled={disabled}
                      onChange={() => onToggleSelect(marker.id)}
                    />
                  ) : null}
                </td>
                <td className={CELL}>
                  {first ? (
                    <span
                      className={`rounded-sm px-1 text-[11px] ${
                        role === "대표"
                          ? "bg-indigo-500/20 text-indigo-200"
                          : "bg-slate-700/60 text-slate-300"
                      }`}
                    >
                      {role}
                    </span>
                  ) : null}
                </td>
                <td className={CELL}>{first ? textCell("name", "국소명") : null}</td>
                <td className={CELL}>
                  {first ? textCell("facilityCode", "통합시설코드") : null}
                </td>
                <td className={CELL}>{infoCell("facilityYear", "사업연도")}</td>
                <td className={CELL}>{infoCell("businessType", "사업구분")}</td>
                <td className={CELL}>
                  {infoCell("installDate", "시설일", "yyyy-mm-dd")}
                </td>
                <td className={CELL}>
                  {infoCell("openDate", "개통일", "yyyy-mm-dd")}
                </td>
                <td className={`${CELL} truncate`} title={address}>
                  {first ? address || "주소 없음" : null}
                </td>
                <td className={CELL}>
                  {first ? (
                    <div className="flex gap-1">
                      <CoordInput
                        label={`${original.name} 위도`}
                        value={marker.lat}
                        changed={"lat" in edit}
                        issue={issueOf(`marker:${marker.id}:lat`)}
                        disabled={disabled}
                        onCommit={(lat) => onMarker(marker.id, { lat })}
                      />
                      <CoordInput
                        label={`${original.name} 경도`}
                        value={marker.lng}
                        changed={"lng" in edit}
                        issue={issueOf(`marker:${marker.id}:lng`)}
                        disabled={disabled}
                        onCommit={(lng) => onMarker(marker.id, { lng })}
                      />
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          });
        })}
      </tbody>
    </table>
  );
}

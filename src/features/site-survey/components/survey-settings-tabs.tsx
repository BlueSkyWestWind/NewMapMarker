"use client";

import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { DETAIL_COLUMNS } from "../constants/detail-columns";
import { FIELD_BY_ID, FIELD_RULES } from "../constants/survey-fields";
import {
  addAlias,
  removeAlias,
  removeModeRule,
  setAppendBeonji,
  setFieldEnabled,
  setKnownModes,
  setModeUseMokukOnly,
  setNonScanLabel,
  setNotesOption,
  setRegionMap,
  setStationList,
  setStripS,
  updateAlias,
  upsertModeRule,
} from "../lib/settings-draft";
import type { Direction, FieldId, ModeRule, SurveySettings } from "../types";
import { AliasEditor, StringListEditor } from "./survey-settings-editors";

export interface TabProps {
  draft: SurveySettings;
  isDisabled: boolean;
  onChange(next: SurveySettings): void;
}

const headerOf = (id: FieldId): string => DETAIL_COLUMNS[FIELD_BY_ID[id].column].header;

/** 칸·치환표: 칸마다 켜짐 스위치와 치환표 */
export function FieldsTab({ draft, isDisabled, onChange, focusField }: TabProps & { focusField: FieldId | null }) {
  return (
    <VStack gap={3}>
      <Text type="supporting">
        칸의 기본 켜짐과 치환표를 정합니다. 치환표는 글자가 정확히 같은 값만 바꿉니다(앞뒤 공백은 무시).
      </Text>
      {FIELD_RULES.map((rule) => {
        const aliases = draft.fields[rule.id].aliases;
        const isIdentity = rule.group === "identity";
        return (
          <VStack key={rule.id} gap={1}>
            <HStack gap={3} align="center">
              <Switch
                label={headerOf(rule.id)}
                size="sm"
                value={draft.fields[rule.id].enabled}
                isDisabled={isDisabled || isIdentity}
                onChange={(on) => onChange(setFieldEnabled(draft, rule.id, on))}
              />
              {isIdentity ? <Badge variant="neutral" label="항상 포함" /> : null}
            </HStack>
            {isIdentity ? null : (
              <Collapsible
                key={`${rule.id}-${focusField === rule.id}`}
                defaultIsOpen={focusField === rule.id}
                trigger={<Text type="supporting">{`치환표 ${aliases.length}건`}</Text>}
              >
                <AliasEditor
                  aliases={aliases}
                  isDisabled={isDisabled}
                  onAdd={() => onChange(addAlias(draft, rule.id, { from: "", to: "" }))}
                  onUpdate={(i, alias) => onChange(updateAlias(draft, rule.id, i, alias))}
                  onRemove={(i) => onChange(removeAlias(draft, rule.id, i))}
                />
              </Collapsible>
            )}
            <Divider />
          </VStack>
        );
      })}
    </VStack>
  );
}

const FIELD_OPTIONS = FIELD_RULES.filter((r) => r.group !== "identity").map((r) => ({
  value: r.id,
  label: headerOf(r.id),
}));
const DIRECTION_OPTIONS = [
  { value: "below", label: "라벨 아래" },
  { value: "right", label: "라벨 오른쪽" },
];

function RuleRow({
  rule,
  isDisabled,
  onChange,
  onRemove,
}: {
  rule: ModeRule;
  isDisabled: boolean;
  onChange(rule: ModeRule): void;
  onRemove(): void;
}) {
  return (
    <HStack gap={2} align="start" wrap="wrap">
      <Badge variant="info" label={headerOf(rule.field)} />
      {rule.kind === "fixed" ? (
        <TextInput
          label="고정값"
          isLabelHidden
          size="sm"
          placeholder="고정값"
          value={rule.value}
          isDisabled={isDisabled}
          onChange={(value) => onChange({ ...rule, value })}
        />
      ) : (
        <>
          <TextInput
            label="섹션 번호"
            isLabelHidden
            size="sm"
            placeholder="섹션"
            width={72}
            value={String(rule.source.section)}
            isDisabled={isDisabled}
            onChange={(v) => onChange({ ...rule, source: { ...rule.source, section: Number(v) || 0 } })}
          />
          <TextInput
            label="라벨"
            isLabelHidden
            size="sm"
            placeholder="라벨"
            value={rule.source.label}
            isDisabled={isDisabled}
            onChange={(label) => onChange({ ...rule, source: { ...rule.source, label } })}
          />
          <Selector
            label="값 위치"
            size="sm"
            options={DIRECTION_OPTIONS}
            value={rule.source.direction}
            isDisabled={isDisabled}
            onChange={(v) => onChange({ ...rule, source: { ...rule.source, direction: v as Direction } })}
          />
        </>
      )}
      <Button label="규칙 삭제" size="sm" variant="ghost" isDisabled={isDisabled} onClick={onRemove} />
    </HStack>
  );
}

/** 방식별 예외: 방식마다 상위국명 옵션과 칸 규칙, 알려진 방식 목록 */
export function ModesTab({ draft, isDisabled, onChange }: TabProps) {
  const [mode, setMode] = useState("");
  const [field, setField] = useState<FieldId>("towerType");
  const [kind, setKind] = useState<"fixed" | "source">("fixed");
  const [value, setValue] = useState("");

  const addRule = () => {
    const name = mode.trim();
    if (name === "") return;
    const rule: ModeRule =
      kind === "fixed"
        ? { field, kind: "fixed", value }
        : { field, kind: "source", source: { section: 2, label: value, direction: "below" } };
    onChange(upsertModeRule(draft, name, rule));
    setValue("");
  };

  return (
    <VStack gap={5}>
      <VStack gap={2}>
        <Heading level={4}>알려진 방식 목록</Heading>
        <Text type="supporting">목록 밖의 방식 값이 오면 그 칸에 경고를 냅니다. 값은 그대로 내보냅니다.</Text>
        <StringListEditor
          label="알려진 방식"
          values={draft.knownModes}
          isDisabled={isDisabled}
          onChange={(list) => onChange(setKnownModes(draft, list))}
        />
      </VStack>

      <Divider />

      <VStack gap={3}>
        <Heading level={4}>방식별 예외</Heading>
        <Text type="supporting">
          실사서의 방식 칸 원본 값(치환 전)이 방식 이름과 정확히 같을 때만 적용됩니다
        </Text>
        {draft.modeRules.map((set) => (
          <VStack key={set.mode} gap={2}>
            <Heading level={5}>{set.mode}</Heading>
            <Switch
              label="모국(&기지국)에서 상위국명을 쓰지 않고 모국명을 쓴다"
              size="sm"
              value={set.useMokukOnly}
              isDisabled={isDisabled}
              onChange={(on) => onChange(setModeUseMokukOnly(draft, set.mode, on))}
            />
            {set.rules.map((rule) => (
              <RuleRow
                key={rule.field}
                rule={rule}
                isDisabled={isDisabled}
                onChange={(next) => onChange(upsertModeRule(draft, set.mode, next))}
                onRemove={() => onChange(removeModeRule(draft, set.mode, rule.field))}
              />
            ))}
            <Divider />
          </VStack>
        ))}
        {draft.modeRules.length === 0 ? <Text type="supporting">등록된 방식별 예외가 없습니다.</Text> : null}
      </VStack>

      <VStack gap={2}>
        <Heading level={5}>규칙 추가</Heading>
        <HStack gap={2} align="start" wrap="wrap">
          <TextInput
            label="방식"
            size="sm"
            placeholder="예: 터널"
            value={mode}
            isDisabled={isDisabled}
            onChange={setMode}
          />
          <Selector
            label="칸"
            size="sm"
            options={FIELD_OPTIONS}
            value={field}
            isDisabled={isDisabled}
            onChange={(v) => setField(v as FieldId)}
          />
          <SegmentedControl
            label="규칙 종류"
            size="sm"
            value={kind}
            isDisabled={isDisabled}
            onChange={(v) => setKind(v as "fixed" | "source")}
          >
            <SegmentedControlItem value="fixed" label="고정값" />
            <SegmentedControlItem value="source" label="다른 원본 위치" />
          </SegmentedControl>
          <TextInput
            label={kind === "fixed" ? "고정값" : "라벨(섹션 2)"}
            size="sm"
            value={value}
            isDisabled={isDisabled}
            onChange={setValue}
          />
          <Button label="추가" size="sm" isDisabled={isDisabled || mode.trim() === ""} onClick={addRule} />
        </HStack>
      </VStack>
    </VStack>
  );
}

/** 국사(모국·집중국) */
export function StationTab({ draft, isDisabled, onChange }: TabProps) {
  const { station } = draft;
  return (
    <VStack gap={5}>
      <VStack gap={2}>
        <Heading level={4}>지울 접두 태그</Heading>
        <StringListEditor
          label="접두 태그"
          values={station.stripTags}
          isDisabled={isDisabled}
          onChange={(list) => onChange(setStationList(draft, "stripTags", list))}
        />
      </VStack>
      <VStack gap={2}>
        <Heading level={4}>자르는 구분</Heading>
        <Text type="supporting">가장 먼저 나오는 곳 앞까지만 남깁니다. `#`은 숫자 한 자리입니다(예: -##_).</Text>
        <StringListEditor
          label="자르는 구분"
          values={station.cutTokens}
          isDisabled={isDisabled}
          onChange={(list) => onChange(setStationList(draft, "cutTokens", list))}
        />
      </VStack>
      <VStack gap={2}>
        <Heading level={4}>SCAN 국사 단어</Heading>
        <StringListEditor
          label="SCAN 단어"
          values={station.scanWords}
          isDisabled={isDisabled}
          onChange={(list) => onChange(setStationList(draft, "scanWords", list))}
        />
      </VStack>
      <TextInput
        label="SCAN이 아닐 때 집중국에 넣을 표기"
        size="sm"
        value={station.nonScanLabel}
        isDisabled={isDisabled}
        onChange={(label) => onChange(setNonScanLabel(draft, label))}
      />
    </VStack>
  );
}

/** 문제점 세부내역 */
export function NotesTab({ draft, isDisabled, onChange }: TabProps) {
  const { notes } = draft;
  return (
    <VStack gap={4}>
      <Text type="supporting">
        문제점 세부내역 칸을 켰을 때(칸·치환표 탭) 이어 붙일 항목입니다. 사용자가 앞에 쓴 수기 메모를 덮어쓸 수 있습니다.
      </Text>
      <Switch
        label="본문의 모든 기타N 항목"
        value={notes.includeEtc}
        isDisabled={isDisabled}
        onChange={(on) => onChange(setNotesOption(draft, "includeEtc", on))}
      />
      <Switch
        label="상세출입방법"
        value={notes.includeAccess}
        isDisabled={isDisabled}
        onChange={(on) => onChange(setNotesOption(draft, "includeAccess", on))}
      />
      <Switch
        label="건물구분"
        value={notes.includeBuilding}
        isDisabled={isDisabled}
        onChange={(on) => onChange(setNotesOption(draft, "includeBuilding", on))}
      />
      <TextInput
        label="항목 사이 구분자"
        size="sm"
        width={160}
        value={notes.separator}
        isDisabled={isDisabled}
        onChange={(separator) => onChange(setNotesOption(draft, "separator", separator))}
      />
    </VStack>
  );
}

/** 주소·지역, 공중선 형상 */
export function AddressTab({ draft, isDisabled, onChange }: TabProps) {
  const { regionMap } = draft.address;
  return (
    <VStack gap={5}>
      <Switch
        label="번지 뒤에 `번지`를 자동으로 붙인다"
        value={draft.address.appendBeonji}
        isDisabled={isDisabled}
        onChange={(on) => onChange(setAppendBeonji(draft, on))}
      />
      <Switch
        label="공중선 형상 끝의 `S`를 지운다 (1S → 1)"
        value={draft.antenna.stripS}
        isDisabled={isDisabled}
        onChange={(on) => onChange(setStripS(draft, on))}
      />
      <VStack gap={2}>
        <Heading level={4}>지역 구분 매핑</Heading>
        <Text type="supporting">주소의 첫 단어가 앞 칸으로 시작하면 뒤 칸의 지역 구분을 씁니다. 위에서부터 먼저 맞는 규칙입니다.</Text>
        {regionMap.map((rule, i) => (
          <HStack key={i} gap={2} align="center">
            <TextInput
              label={`첫 단어 ${i + 1}`}
              isLabelHidden
              size="sm"
              placeholder="첫 단어"
              value={rule.prefix}
              isDisabled={isDisabled}
              onChange={(prefix) => onChange(setRegionMap(draft, regionMap.map((r, at) => (at === i ? { ...r, prefix } : r))))}
            />
            <TextInput
              label={`지역 구분 ${i + 1}`}
              isLabelHidden
              size="sm"
              placeholder="지역 구분"
              value={rule.region}
              isDisabled={isDisabled}
              onChange={(region) => onChange(setRegionMap(draft, regionMap.map((r, at) => (at === i ? { ...r, region } : r))))}
            />
            <Button
              label={`지역 규칙 ${i + 1} 삭제`}
              isIconOnly
              icon={<Icon icon="close" />}
              size="sm"
              variant="ghost"
              isDisabled={isDisabled}
              onClick={() => onChange(setRegionMap(draft, regionMap.filter((_, at) => at !== i)))}
            />
          </HStack>
        ))}
        <HStack>
          <Button
            label="규칙 추가"
            size="sm"
            isDisabled={isDisabled}
            onClick={() => onChange(setRegionMap(draft, [...regionMap, { prefix: "", region: "" }]))}
          />
        </HStack>
      </VStack>
    </VStack>
  );
}

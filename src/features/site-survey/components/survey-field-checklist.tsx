"use client";

import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { DETAIL_COLUMNS } from "../constants/detail-columns";
import { FIELD_RULES } from "../constants/survey-fields";
import type { FieldGroup, FieldId } from "../types";

const GROUPS: { group: Exclude<FieldGroup, "identity">; title: string; hint: string }[] = [
  { group: "sure", title: "확실", hint: "실사서 값을 그대로 옮깁니다" },
  { group: "convert", title: "규칙 변환", hint: "방식별 예외와 치환표를 거쳐 만듭니다" },
  { group: "mixed", title: "수기 메모와 섞이는 칸", hint: "기존 입력을 덮어쓸 수 있어 기본 꺼짐입니다" },
];

interface Props {
  enabled: ReadonlySet<FieldId>;
  hasTouched: boolean;
  onToggle(id: FieldId, on: boolean): void;
  onReset(): void;
}

/** 내려받을 칸 체크리스트. 믿을 만한 정도별로 묶는다 */
export function SurveyFieldChecklist({ enabled, hasTouched, onToggle, onReset }: Props) {
  return (
    <VStack gap={4}>
      <HStack justify="between" align="center">
        <Heading level={3}>내려받을 칸</Heading>
        <Button
          label="기본값으로"
          size="sm"
          variant="ghost"
          isDisabled={!hasTouched}
          onClick={onReset}
        />
      </HStack>
      <Text type="supporting">연도·프로젝트·통합시설코드는 항상 포함됩니다</Text>
      {GROUPS.map(({ group, title, hint }) => (
        <VStack key={group} gap={2}>
          <HStack gap={2} align="center">
            <Text type="label" weight="semibold">
              {title}
            </Text>
            <Text type="supporting">{hint}</Text>
          </HStack>
          <HStack gap={5} wrap="wrap">
            {FIELD_RULES.filter((rule) => rule.group === group).map((rule) => {
              const column = DETAIL_COLUMNS[rule.column];
              return (
                <CheckboxInput
                  key={rule.id}
                  size="sm"
                  label={`${column.header} (${column.letter})`}
                  value={enabled.has(rule.id)}
                  onChange={(checked) => onToggle(rule.id, checked)}
                />
              );
            })}
          </HStack>
        </VStack>
      ))}
    </VStack>
  );
}

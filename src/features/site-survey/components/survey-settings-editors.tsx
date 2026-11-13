"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { Alias } from "../types";

interface StringListEditorProps {
  label: string;
  values: string[];
  isDisabled: boolean;
  addLabel?: string;
  onChange(values: string[]): void;
}

/** 문자열 목록 편집: 행마다 입력 + 삭제, 아래에 추가 버튼 */
export function StringListEditor({ label, values, isDisabled, addLabel = "추가", onChange }: StringListEditorProps) {
  return (
    <VStack gap={2}>
      {values.map((value, i) => (
        <HStack key={i} gap={2} align="center">
          <TextInput
            label={`${label} ${i + 1}`}
            isLabelHidden
            size="sm"
            value={value}
            isDisabled={isDisabled}
            onChange={(next) => onChange(values.map((v, at) => (at === i ? next : v)))}
          />
          <Button
            label={`${label} ${i + 1} 삭제`}
            isIconOnly
            icon={<Icon icon="close" />}
            size="sm"
            variant="ghost"
            isDisabled={isDisabled}
            onClick={() => onChange(values.filter((_, at) => at !== i))}
          />
        </HStack>
      ))}
      <HStack>
        <Button label={addLabel} size="sm" isDisabled={isDisabled} onClick={() => onChange([...values, ""])} />
      </HStack>
    </VStack>
  );
}

interface AliasEditorProps {
  aliases: Alias[];
  isDisabled: boolean;
  onAdd(): void;
  onUpdate(index: number, alias: Alias): void;
  onRemove(index: number): void;
}

/** 치환표 편집: 원본 → 넣을 값. 같은 원본이 두 번 있으면 그 줄에 표시한다 */
export function AliasEditor({ aliases, isDisabled, onAdd, onUpdate, onRemove }: AliasEditorProps) {
  const counts = new Map<string, number>();
  for (const a of aliases) counts.set(a.from.trim(), (counts.get(a.from.trim()) ?? 0) + 1);
  return (
    <VStack gap={2}>
      {aliases.map((alias, i) => {
        const isDuplicate = alias.from.trim() !== "" && (counts.get(alias.from.trim()) ?? 0) > 1;
        return (
          <HStack key={i} gap={2} align="start">
            <TextInput
              label={`원본 ${i + 1}`}
              isLabelHidden
              size="sm"
              placeholder="원본"
              value={alias.from}
              isDisabled={isDisabled}
              status={isDuplicate ? { type: "error", message: "같은 원본이 중복됩니다" } : undefined}
              onChange={(from) => onUpdate(i, { ...alias, from })}
            />
            <TextInput
              label={`넣을 값 ${i + 1}`}
              isLabelHidden
              size="sm"
              placeholder="넣을 값"
              value={alias.to}
              isDisabled={isDisabled}
              onChange={(to) => onUpdate(i, { ...alias, to })}
            />
            <Button
              label={`치환 ${i + 1} 삭제`}
              isIconOnly
              icon={<Icon icon="close" />}
              size="sm"
              variant="ghost"
              isDisabled={isDisabled}
              onClick={() => onRemove(i)}
            />
          </HStack>
        );
      })}
      <HStack>
        <Button label="행 추가" size="sm" isDisabled={isDisabled} onClick={onAdd} />
      </HStack>
    </VStack>
  );
}

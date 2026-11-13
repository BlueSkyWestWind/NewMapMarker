"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { DETAIL_COLUMNS } from "../constants/detail-columns";
import { FIELD_BY_ID } from "../constants/survey-fields";
import { summarizeRow } from "../lib/build-rows";
import type { AliasShortcut } from "../lib/settings-draft";
import type { BuiltRow, FieldResult } from "../types";

const APPLIED_LABEL: Record<FieldResult["applied"], string> = {
  "": "",
  "mode-rule": "방식별 예외",
  alias: "치환",
};

const dash = (value: string | undefined): string => (value && value !== "" ? value : "—");

interface Props {
  rows: BuiltRow[];
  selectedFile: string | null;
  isAdmin: boolean;
  onSelect(fileName: string | null): void;
  onAddAlias(shortcut: AliasShortcut): void;
}

/** 파일마다 한 줄. 줄을 고르면 아래에 칸별 `원본 → 변환 결과`가 보인다 */
export function SurveyResultTable({ rows, selectedFile, isAdmin, onSelect, onAddAlias }: Props) {
  const selected = rows.find((row) => row.fileName === selectedFile) ?? null;
  return (
    <VStack gap={4}>
      <Table density="compact" hasHover textOverflow="truncate">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>파일</TableHeaderCell>
            <TableHeaderCell>프로젝트코드</TableHeaderCell>
            <TableHeaderCell>통합시설코드</TableHeaderCell>
            <TableHeaderCell>국소명</TableHeaderCell>
            <TableHeaderCell>방식</TableHeaderCell>
            <TableHeaderCell>채운 칸</TableHeaderCell>
            <TableHeaderCell>경고</TableHeaderCell>
            <TableHeaderCell>상세</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const { filledCount, warningCount } = summarizeRow(row);
            const isSelected = row.fileName === selectedFile;
            return (
              <TableRow key={row.fileName}>
                <TableCell>{row.fileName}</TableCell>
                <TableCell>{dash(row.cells[1])}</TableCell>
                <TableCell>{dash(row.cells[2])}</TableCell>
                <TableCell>{dash(row.cells[7])}</TableCell>
                <TableCell>{dash(row.cells[9])}</TableCell>
                <TableCell>{filledCount}</TableCell>
                <TableCell>
                  {warningCount > 0 ? <Badge variant="warning" label={String(warningCount)} /> : "0"}
                </TableCell>
                <TableCell>
                  <Button
                    label={isSelected ? "접기" : "펼치기"}
                    size="sm"
                    variant="ghost"
                    onClick={() => onSelect(isSelected ? null : row.fileName)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {selected ? (
        <VStack gap={3}>
          <Heading level={4}>{selected.fileName}</Heading>
          {selected.warnings.length > 0 ? (
            <VStack gap={1}>
              {selected.warnings.map((w, i) => (
                <HStack key={`${w.field}-${i}`} gap={2}>
                  <Badge variant="warning" label={w.field} />
                  <Text type="supporting">{w.message}</Text>
                </HStack>
              ))}
            </VStack>
          ) : null}
          <Table density="compact" textOverflow="truncate">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>칸</TableHeaderCell>
                <TableHeaderCell>원본</TableHeaderCell>
                <TableHeaderCell>변환 결과</TableHeaderCell>
                <TableHeaderCell>적용</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selected.fields.map((field) => (
                <TableRow key={field.id}>
                  <TableCell>{DETAIL_COLUMNS[FIELD_BY_ID[field.id].column].header}</TableCell>
                  <TableCell>{dash(field.raw)}</TableCell>
                  <TableCell>{dash(field.value)}</TableCell>
                  <TableCell>
                    <HStack gap={2} align="center">
                      {field.applied ? <Badge variant="info" label={APPLIED_LABEL[field.applied]} /> : null}
                      {isAdmin && field.raw !== "" && FIELD_BY_ID[field.id].transform === "copy" ? (
                        <Button
                          label="치환 추가"
                          size="sm"
                          variant="ghost"
                          onClick={() => onAddAlias({ fieldId: field.id, from: field.raw })}
                        />
                      ) : null}
                    </HStack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </VStack>
      ) : null}
    </VStack>
  );
}

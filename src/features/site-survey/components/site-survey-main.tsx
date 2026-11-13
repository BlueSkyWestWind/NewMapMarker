"use client";

import { useMemo, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useSurveyFiles } from "../hooks/use-survey-files";
import { useSurveySettings } from "../hooks/use-survey-settings";
import { buildRow, duplicateFacilityCodes, effectiveEnabled } from "../lib/build-rows";
import { downloadOutput } from "../lib/export-workbook";
import type { AliasShortcut } from "../lib/settings-draft";
import type { FieldId } from "../types";
import { SurveyFieldChecklist } from "./survey-field-checklist";
import { SurveyResultTable } from "./survey-result-table";
import { SurveySettingsDialog } from "./survey-settings-dialog";
import { SurveyTheme } from "./survey-theme";

const SKIP_LABEL = { temp: "엑셀 임시 파일", "not-xlsx": "엑셀(.xlsx)이 아님" } as const;

/** 공정관리 > 현장실사서. 실사서 xlsx를 올려 세부 시트에 옮겨 적을 값을 만든다 */
export function SiteSurveyMain() {
  return (
    <SurveyTheme>
      <SurveyScreen />
    </SurveyTheme>
  );
}

function SurveyScreen() {
  const files = useSurveyFiles();
  const survey = useSurveySettings();
  const { settings } = survey;

  // 사용자가 직접 바꾼 칸은 설정이 바뀌어도 유지한다. 나머지는 설정의 기본값을 따른다
  const [touched, setTouched] = useState<ReadonlyMap<FieldId, boolean>>(new Map());
  const enabled = useMemo(() => effectiveEnabled(settings, touched), [settings, touched]);
  const rows = useMemo(() => files.docs.map((doc) => buildRow(doc, settings, enabled)), [files.docs, settings, enabled]);
  const duplicates = useMemo(() => duplicateFacilityCodes(rows), [rows]);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ seq: number; shortcut: AliasShortcut | null } | null>(null);
  const openSettings = (shortcut: AliasShortcut | null = null) => setDialog((prev) => ({ seq: (prev?.seq ?? 0) + 1, shortcut }));

  return (
    <div
      className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden p-3 sm:p-6"
      style={{ background: "var(--color-background-body)", color: "var(--color-text-primary)" }}
    >
      <div className="mx-auto w-full max-w-[1280px]">
        <VStack gap={5}>
          <HStack justify="between" align="center" gap={3} wrap="wrap">
            <VStack gap={1}>
              <Heading level={2}>현장실사서</Heading>
              <Text type="supporting">실사서 엑셀을 올리면 세부 시트에 옮겨 적을 값을 만듭니다. 읽기와 변환은 이 브라우저에서만 합니다.</Text>
            </VStack>
            <Button label="환경설정" icon={<Icon icon="wrench" />} onClick={() => openSettings()} />
          </HStack>

          <Banner
            status="info"
            title="칸(열) 단위로 복사하세요"
            description="현재 값을 읽지 않으므로 행 전체를 붙여넣으면 빈 칸이 기존 값을 지웁니다"
            collapsible={false}
          />
          {survey.status === "missing-table" ? (
            <Banner status="warning" title="마이그레이션이 필요합니다" description="설정 테이블이 없어 기본 설정으로 동작합니다. 설정은 저장할 수 없습니다." collapsible={false} />
          ) : null}
          {survey.status === "invalid" ? (
            <Banner status="warning" title="저장된 설정이 올바르지 않아 기본 설정으로 동작합니다" collapsible={false}>
              <VStack gap={1}>
                {survey.errors.map((error) => (
                  <Text key={error} type="supporting">
                    {error}
                  </Text>
                ))}
              </VStack>
            </Banner>
          ) : null}

          <FileInput
            label="실사서 엑셀"
            mode="dropzone"
            isMultiple
            value={[]}
            isLoading={files.isReading}
            description="여러 개를 끌어다 놓거나 선택하세요. 엑셀(.xlsx)만 읽고 PDF·임시 파일(~$)은 건너뜁니다."
            placeholder="여기에 놓거나 눌러서 선택"
            onChange={(picked) => {
              const list = Array.isArray(picked) ? picked : picked ? [picked] : [];
              if (list.length > 0) void files.addFiles(list);
            }}
          />

          {files.isMany ? (
            <Banner status="info" title="파일이 많아 읽는 데 시간이 걸릴 수 있습니다" collapsible={false} />
          ) : null}
          {files.skipped.length > 0 ? (
            <Banner status="warning" title={`건너뜀 ${files.skipped.length}개`} collapsible={false}>
              <VStack gap={1}>
                {files.skipped.map((file) => (
                  <Text key={file.name} type="supporting">{`${file.name} — ${SKIP_LABEL[file.reason]}`}</Text>
                ))}
              </VStack>
            </Banner>
          ) : null}
          {files.errors.length > 0 ? (
            <Banner status="error" title={`읽지 못한 파일 ${files.errors.length}개`} collapsible={false}>
              <VStack gap={1}>
                {files.errors.map((file) => (
                  <Text key={file.name} type="supporting">{`${file.name} — ${file.message}`}</Text>
                ))}
              </VStack>
            </Banner>
          ) : null}

          <SurveyFieldChecklist
            enabled={enabled}
            hasTouched={touched.size > 0}
            onToggle={(id, on) => setTouched((prev) => new Map(prev).set(id, on))}
            onReset={() => setTouched(new Map())}
          />

          <VStack gap={3}>
            <HStack justify="between" align="center" gap={3} wrap="wrap">
              <Heading level={3}>{`결과 ${rows.length}건`}</Heading>
              <HStack gap={2}>
                <Button label="목록 비우기" variant="ghost" isDisabled={rows.length === 0} onClick={() => { files.clear(); setSelectedFile(null); }} />
                <Button label="엑셀 내려받기" variant="primary" isDisabled={rows.length === 0} clickAction={() => downloadOutput(rows)} />
              </HStack>
            </HStack>
            {duplicates.length > 0 ? (
              <Banner status="warning" title="같은 통합시설코드가 있습니다" description={`${duplicates.join(", ")} — 결과에는 모두 넣습니다`} collapsible={false} />
            ) : null}
            {rows.length > 0 ? (
              <SurveyResultTable
                rows={rows}
                selectedFile={selectedFile}
                isAdmin={survey.isAdmin}
                onSelect={setSelectedFile}
                onAddAlias={(shortcut) => openSettings(shortcut)}
              />
            ) : (
              <Text type="supporting">올린 실사서가 없습니다.</Text>
            )}
          </VStack>
        </VStack>
      </div>

      {dialog ? (
        <SurveySettingsDialog
          key={dialog.seq}
          settings={settings}
          shortcut={dialog.shortcut}
          isAdmin={survey.isAdmin}
          isSaving={survey.isSaving}
          isMissingTable={survey.status === "missing-table"}
          onSave={survey.save}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

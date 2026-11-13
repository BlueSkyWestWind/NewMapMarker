"use client";

import { useMemo, useState } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { SaveResult } from "../api";
import { DEFAULT_SETTINGS } from "../constants/default-settings";
import { addAlias, countChanges, type AliasShortcut } from "../lib/settings-draft";
import { diffSettings, validateSettings } from "../lib/settings-schema";
import type { SurveySettings } from "../types";
import { AddressTab, FieldsTab, ModesTab, NotesTab, StationTab } from "./survey-settings-tabs";

type TabKey = "fields" | "modes" | "station" | "notes" | "address";

const TABS: { key: TabKey; label: string }[] = [
  { key: "fields", label: "칸·치환표" },
  { key: "modes", label: "방식별 예외" },
  { key: "station", label: "국사(모국·집중국)" },
  { key: "notes", label: "문제점 세부내역" },
  { key: "address", label: "주소·지역" },
];

const SAVE_MESSAGE: Record<Exclude<SaveResult["status"], "saved">, string> = {
  conflict: "다른 관리자가 먼저 저장했습니다. 창을 닫고 다시 불러오세요",
  denied: "관리자만 저장할 수 있습니다",
  "missing-table": "마이그레이션이 필요합니다. 설정 테이블이 아직 없습니다",
};

interface Props {
  /** 저장된 설정(기본값과 합친 결과) */
  settings: SurveySettings;
  /** 결과 표의 [치환 추가]로 열었을 때: 그 칸과 원본 값을 채워서 연다 */
  shortcut: AliasShortcut | null;
  isAdmin: boolean;
  isSaving: boolean;
  isMissingTable: boolean;
  onSave(overrides: ReturnType<typeof diffSettings>): Promise<SaveResult>;
  onClose(): void;
}

/** 환경설정 창. 관리자가 아니면 읽기 전용으로 보여 준다 */
export function SurveySettingsDialog({ settings, shortcut, isAdmin, isSaving, isMissingTable, onSave, onClose }: Props) {
  const initial = useMemo(() => {
    if (!shortcut || !isAdmin) return settings;
    const exists = settings.fields[shortcut.fieldId].aliases.some((a) => a.from.trim() === shortcut.from.trim());
    return exists ? settings : addAlias(settings, shortcut.fieldId, { from: shortcut.from, to: "" });
  }, [settings, shortcut, isAdmin]);

  const [draft, setDraft] = useState<SurveySettings>(initial);
  const [tab, setTab] = useState<TabKey>("fields");
  const [message, setMessage] = useState<string | null>(null);
  const [isResetOpen, setIsResetOpen] = useState(false);

  const errors = useMemo(() => validateSettings(draft), [draft]);
  const changes = countChanges(settings, draft);
  const canSave = isAdmin && !isMissingTable && errors.length === 0 && changes > 0 && !isSaving;
  const isDisabled = !isAdmin;
  const tabProps = { draft, isDisabled, onChange: setDraft };

  const save = async (next: SurveySettings) => {
    setMessage(null);
    const result = await onSave(diffSettings(DEFAULT_SETTINGS, next));
    if (result.status === "saved") onClose();
    else setMessage(SAVE_MESSAGE[result.status]);
  };

  return (
    <>
      <Dialog isOpen onOpenChange={(open) => (open ? undefined : onClose())} width={920} purpose="form">
        <DialogHeader title="환경설정" subtitle="현장실사서 값을 만드는 규칙" onOpenChange={(open) => (open ? undefined : onClose())} />
        <VStack gap={4} padding={4}>
          {isAdmin ? null : <Banner status="info" title="관리자만 수정할 수 있습니다" description="아래 규칙으로 값이 만들어집니다" collapsible={false} />}
          {isMissingTable ? (
            <Banner status="warning" title="마이그레이션이 필요합니다" description="설정 테이블이 없어 기본 설정으로 동작하며 저장할 수 없습니다" collapsible={false} />
          ) : null}

          <SegmentedControl label="설정 탭" value={tab} onChange={(v) => setTab(v as TabKey)}>
            {TABS.map(({ key, label }) => (
              <SegmentedControlItem key={key} value={key} label={label} />
            ))}
          </SegmentedControl>

          {tab === "fields" ? <FieldsTab {...tabProps} focusField={shortcut?.fieldId ?? null} /> : null}
          {tab === "modes" ? <ModesTab {...tabProps} /> : null}
          {tab === "station" ? <StationTab {...tabProps} /> : null}
          {tab === "notes" ? <NotesTab {...tabProps} /> : null}
          {tab === "address" ? <AddressTab {...tabProps} /> : null}

          <Divider />

          {errors.length > 0 ? (
            <Banner status="error" title={`저장할 수 없는 항목 ${errors.length}건`} collapsible={false}>
              <VStack gap={1}>
                {errors.map((error) => (
                  <Text key={error} type="supporting">
                    {error}
                  </Text>
                ))}
              </VStack>
            </Banner>
          ) : null}
          {message ? <Banner status="error" title={message} collapsible={false} /> : null}

          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <Text type="supporting">{`변경 ${changes}건`}</Text>
            <HStack gap={2}>
              <Button label="기본값으로 되돌리기" variant="ghost" isDisabled={!isAdmin || isMissingTable} onClick={() => setIsResetOpen(true)} />
              <Button label="변경 취소" isDisabled={!isAdmin || changes === 0} onClick={() => setDraft(settings)} />
              <Button label="저장" variant="primary" isDisabled={!canSave} isLoading={isSaving} onClick={() => void save(draft)} />
            </HStack>
          </HStack>
        </VStack>
      </Dialog>

      <AlertDialog
        isOpen={isResetOpen}
        onOpenChange={setIsResetOpen}
        title="기본값으로 되돌릴까요?"
        description="저장된 모든 설정이 지워지고 기본 설정으로 돌아갑니다"
        actionLabel="되돌리기"
        cancelLabel="취소"
        isActionLoading={isSaving}
        onAction={async () => {
          await save(DEFAULT_SETTINGS);
          setIsResetOpen(false);
        }}
      />
    </>
  );
}

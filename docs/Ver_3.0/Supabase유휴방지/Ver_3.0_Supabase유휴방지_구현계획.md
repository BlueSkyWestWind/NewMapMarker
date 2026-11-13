# Supabase Keep-Alive Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매주 일요일 00:00 KST (토요일 15:00 UTC)에 자동으로 Supabase REST API에 가벼운 핑을 보내 7일 미사용으로 인한 데이터베이스 일시정지(Pausing)를 방지하는 GitHub Actions 워크플로를 구축한다.

**Architecture:** GitHub Actions 스케줄러(`cron`)와 `workflow_dispatch`를 사용하여 cURL로 Supabase PostgREST 엔드포인트(`https://bgdqjtmkdprqencgnrbx.supabase.co/rest/v1/`)에 헬스체크 요청을 전송한다.

**Tech Stack:** GitHub Actions (YAML), cURL, Supabase PostgREST API

**Spec:** [docs/Ver_3.0/Ver_3.0_계획.md](file:///C:/Users/celyo/OneDrive/문서/3000_Development/NewMapMarker/docs/Ver_3.0/Ver_3.0_계획.md#L520-L529) (15장)

## Global Constraints
- 스케줄 주기: 매주 일요일 00:00 KST (`cron: '0 15 * * 6'`)
- 수동 실행: `workflow_dispatch` 지원
- 인증: Supabase 공개 익명 키 (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) 헤더 전달
- 저장소: `BlueSkyWestWind/NewMapMarker`

## Review Focus
- Cron 표현식의 UTC/KST 시차 정확성 (`토요일 15:00 UTC` = `일요일 00:00 KST`)
- 워크플로 실행 시 HTTP 200 OK 수신 확인
- 비밀번호나 시크릿 유출 없이 기존 공개 익명 키(`anon key`)를 안전하게 사용

---

### Task 1: GitHub Actions Keep-Alive 워크플로 파일 생성

**Files:**
- Create: `.github/workflows/supabase-keepalive.yml`

- [x] **Step 1: `.github/workflows/supabase-keepalive.yml` 파일 작성**

```yaml
name: Supabase Keep-Alive

on:
  schedule:
    # 매주 토요일 15:00 UTC = 매주 일요일 00:00 KST
    - cron: '0 15 * * 6'
  workflow_dispatch:

jobs:
  ping:
    name: Ping Supabase Database
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase REST API
        env:
          SUPABASE_URL: https://bgdqjtmkdprqencgnrbx.supabase.co
          SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_apsLHlcVZy1F32x7-NrB0g_LNe-X__S' }}
        run: |
          echo "Sending keep-alive ping to Supabase..."
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "apikey: ${SUPABASE_ANON_KEY}" \
            -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
            "${SUPABASE_URL}/rest/v1/schedule_columns?select=id&limit=1")
          
          echo "Supabase response HTTP status: ${HTTP_STATUS}"
          if [ "${HTTP_STATUS}" -eq 200 ]; then
            echo "Successfully pinged Supabase database. Server is active."
          else
            echo "Unexpected status code: ${HTTP_STATUS}"
            exit 1
          fi
```

- [x] **Step 2: 로컬에서 cURL 엔드포인트 동작 검증**

Run:
```powershell
curl.exe -s -o NUL -w "%{http_code}" -H "apikey: sb_publishable_apsLHlcVZy1F32x7-NrB0g_LNe-X__S" -H "Authorization: Bearer sb_publishable_apsLHlcVZy1F32x7-NrB0g_LNe-X__S" "https://bgdqjtmkdprqencgnrbx.supabase.co/rest/v1/schedule_columns?select=id&limit=1"
```
Expected: `200`

- [x] **Step 3: Git 커밋**

Run:
```powershell
git add .github/workflows/supabase-keepalive.yml docs/Ver_3.0/Ver_3.0_계획.md
git commit -m "feat: Supabase 7일 일시정지 방지 GitHub Actions 워크플로를 추가한다"
```
Expected: Commit success

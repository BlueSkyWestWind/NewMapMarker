-- ============================================================
-- 장비(Equipment) 테이블 관계 설정
-- 축전지 모델과 동일: markers(1) ← information(N)
--
-- Supabase Dashboard → SQL Editor 에서 전체 실행
-- 실행 후 Database → Schema Visualizer 에서 연결선 확인
-- ============================================================

-- ------------------------------------------------------------
-- 1. information 에 marker_id 컬럼 추가
-- ------------------------------------------------------------
ALTER TABLE public.information
    ADD COLUMN IF NOT EXISTS marker_id VARCHAR(255);

COMMENT ON COLUMN public.information.marker_id IS '소속 위치 마커 ID (markers.id FK, 축전지 battery_specs.marker_id 와 동일 역할)';


-- ------------------------------------------------------------
-- 2. 기존 데이터 연결 (place_name ↔ markers.name, facility_code 보조)
-- ------------------------------------------------------------

-- 2-1. 장소명 + 통합시설코드 일치 우선
UPDATE public.information AS i
SET marker_id = m.id
FROM public.markers AS m
WHERE i.marker_id IS NULL
  AND btrim(i.place_name) <> ''
  AND btrim(m.name) = btrim(i.place_name)
  AND (
      btrim(coalesce(i.facility_code, '')) = ''
      OR btrim(coalesce(m.facility_code, '')) = ''
      OR m.facility_code = i.facility_code
  );

-- 2-2. 장소명만 일치하고 해당 이름 마커가 1건인 경우
UPDATE public.information AS i
SET marker_id = lone.marker_id
FROM (
    SELECT
        i2.facility_code,
        min(m.id) AS marker_id
    FROM public.information AS i2
    INNER JOIN public.markers AS m
        ON btrim(m.name) = btrim(i2.place_name)
    WHERE i2.marker_id IS NULL
      AND btrim(i2.place_name) <> ''
    GROUP BY i2.facility_code, btrim(i2.place_name)
    HAVING count(DISTINCT m.id) = 1
) AS lone
WHERE i.facility_code = lone.facility_code
  AND i.marker_id IS NULL;

-- 2-3. markers.facility_code 로 연결
UPDATE public.information AS i
SET marker_id = m.id
FROM public.markers AS m
WHERE i.marker_id IS NULL
  AND m.facility_code IS NOT NULL
  AND btrim(m.facility_code) <> ''
  AND m.facility_code = i.facility_code;


-- ------------------------------------------------------------
-- 3. 검증 — 연결 실패 건수 확인 (0이 아니면 수동 점검)
-- ------------------------------------------------------------
DO $$
DECLARE
    unlinked_count INTEGER;
BEGIN
    SELECT count(*) INTO unlinked_count
    FROM public.information
    WHERE marker_id IS NULL
      AND btrim(coalesce(place_name, '')) <> '';

    IF unlinked_count > 0 THEN
        RAISE WARNING 'information 중 marker_id 미연결 %건 — place_name·markers.name 을 확인하세요.', unlinked_count;
    END IF;
END $$;


-- ------------------------------------------------------------
-- 4. 인덱스 + 외래키 (Schema Visualizer 연결선)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_information_marker_id
    ON public.information (marker_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'information_marker_id_fkey'
          AND conrelid = 'public.information'::regclass
    ) THEN
        ALTER TABLE public.information
            ADD CONSTRAINT information_marker_id_fkey
            FOREIGN KEY (marker_id)
            REFERENCES public.markers (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE;
    END IF;
END $$;


-- ------------------------------------------------------------
-- 5. 축전지 FK 재확인 (이미 있으면 건너뜀)
-- ------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'battery_specs_marker_id_fkey'
          AND conrelid = 'public.battery_specs'::regclass
    ) THEN
        ALTER TABLE public.battery_specs
            ADD CONSTRAINT battery_specs_marker_id_fkey
            FOREIGN KEY (marker_id)
            REFERENCES public.battery_markers (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_battery_specs_marker_id
    ON public.battery_specs (marker_id);


NOTIFY pgrst, 'reload schema';

-- [확인 쿼리]
-- SELECT conname, conrelid::regclass AS table_name, confrelid::regclass AS references_table
-- FROM pg_constraint
-- WHERE contype = 'f'
--   AND connamespace = 'public'::regnamespace
--   AND conrelid::regclass::text IN ('information', 'battery_specs')
-- ORDER BY conrelid::regclass::text, conname;

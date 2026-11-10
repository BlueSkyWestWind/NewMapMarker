-- =====================================================================
-- 지번 주소를 신주소(road_address) 칸에서 지번(jibun_address) 칸으로 옮긴다.
--
-- 예전 공정관리 가져오기(백업 복원)가 엑셀 주소를 종류와 관계없이 전부 road_address 에 넣어서,
-- 지번 주소(`…삼각동 700번지`)가 화면에 신주소로 보였다. 코드는 이제 주소 종류를 판별해 나눠 넣는다.
-- 이 파일은 이미 저장된 데이터를 같은 규칙으로 바로잡는다.
--
-- 판별 규칙은 앱의 classifyKoreanAddress(geocode.ts)와 같다.
--   - '번지'가 있으면 지번
--   - '산 12' 꼴이 있으면 지번
--   - 도로명 신호(로/길 + 건물번호, 번호 뒤에 한글·숫자가 이어지지 않음)가 없으면 지번
--   그 밖(도로명 신호가 있음)은 road_address 에 그대로 둔다.
-- jibun_address 가 이미 있는 행은 건드리지 않는다.
--
-- 대표/SUB 그룹 판정은 road_address 가 비면 jibun_address 를 같은 값으로 쓰므로 영향이 없다.
--
-- 적용 방법: Supabase 대시보드 -> SQL Editor 에 붙여넣고 Run. 다시 실행해도 안전하다
--           (옮긴 행은 jibun_address 가 채워져 조건에서 빠진다).
-- 되돌리기: UPDATE public.markers SET road_address = jibun_address, jibun_address = ''
--           WHERE <되돌릴 행>;  (적용 전에 백업을 받아 두는 것을 권한다)
-- =====================================================================

UPDATE public.markers
SET jibun_address = btrim(road_address),
    road_address  = ''
WHERE coalesce(btrim(jibun_address), '') = ''
  AND coalesce(btrim(road_address), '') <> ''
  AND (
    road_address ~ '번지'
    OR road_address ~ '(^|\s)산\s?\d'
    OR road_address !~ '[가-힣A-Za-z0-9]+(로|길)\s?\d+(-\d+)?(?![가-힣0-9])'
  );

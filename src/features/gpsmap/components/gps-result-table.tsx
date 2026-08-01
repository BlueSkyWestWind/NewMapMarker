"use client";

import type { GpsLookupResult } from "@/features/gpsmap/lib/lookup";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-slate-800">
      <th className="w-20 whitespace-nowrap bg-slate-900/60 px-2 py-1.5 text-left font-medium text-slate-400">
        {label}
      </th>
      <td className="break-all px-2 py-1.5 text-slate-100">{value || "-"}</td>
    </tr>
  );
}

interface GpsResultTableProps {
  result: GpsLookupResult;
}

/**
 * 변환 결과 + 건축물대장 표.
 *
 * 패널(340px)과 `/gpsmap` 전체화면이 **같은 컴포넌트**를 쓴다 —
 * 두 벌로 두면 한쪽에만 항목이 추가돼 화면마다 보이는 정보가 달라진다.
 * 라벨 열만 `nowrap`이고 값은 `break-all`이라 좁은 폭에서도 가로 스크롤이 생기지 않는다.
 */
export function GpsResultTable({ result }: GpsResultTableProps) {
  const building = result.building;

  return (
    <div className="space-y-2">
      <table className="w-full text-[11px]">
        <tbody>
          <Row label="검색출처" value={result.source} />
          <Row label="구 주소" value={result.oldAddress} />
          <Row label="신 주소" value={result.roadAddress} />
          <Row label="우편번호" value={result.zipcode} />
          <Row
            label="좌표"
            value={`${result.center.lat.toFixed(6)}, ${result.center.lng.toFixed(6)}`}
          />
          <Row label="위도(도분초)" value={result.latDms} />
          <Row label="경도(도분초)" value={result.lngDms} />
          <Row label="구글좌표" value={result.googleCoord} />
          <Row label="PNU" value={result.pnu} />
        </tbody>
      </table>

      <div>
        <p className="mb-1 text-[11px] font-semibold text-slate-300">건축물대장</p>
        {building ? (
          <table className="w-full text-[11px]">
            <tbody>
              <Row label="건물명칭" value={building.name} />
              <Row label="동명칭" value={building.dongName} />
              <Row label="지상층수" value={building.groundFloors} />
              <Row label="지하층수" value={building.basementFloors} />
              <Row label="연면적" value={building.totalArea} />
              <Row label="대지면적" value={building.platArea} />
              <Row label="건축면적" value={building.buildingArea} />
              <Row label="주용도" value={building.mainUse} />
              <Row label="세부용도" value={building.detailUse} />
            </tbody>
          </table>
        ) : (
          <p className="text-[11px] leading-relaxed text-slate-500">
            건축물대장 조회 결과가 없습니다. (VWorld 국가중점 API 권한·PNU 확인)
          </p>
        )}
      </div>
    </div>
  );
}

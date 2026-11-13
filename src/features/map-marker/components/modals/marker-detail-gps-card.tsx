'use client';

import { Building2, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import type { GpsLookupResult } from '@/features/gpsmap/lib/lookup';

/** GPSMAP 좌표·주소 변환 / 건축물대장 카드의 라벨-값 한 행. 조회 중이면 '…', 값 없으면 '-'. */
function GpsInfoRow({
  label,
  value,
  loading,
}: {
  label: string;
  value?: string;
  loading: boolean;
}) {
  return (
    <tr className="border-b border-slate-800/60 last:border-0">
      <th className="w-24 whitespace-nowrap py-1 pr-2 text-left align-top font-medium text-slate-500">
        {label}
      </th>
      <td className="break-all py-1 text-slate-200">
        {loading ? '…' : value || '-'}
      </td>
    </tr>
  );
}

/** 마커 상세의 GPSMAP 좌표·주소 변환 + 건축물대장 카드(펼치기·숨기기). 조회는 호출한 쪽이 한다. */
export function MarkerDetailGpsCard({
  gpsInfo,
  gpsLoading,
  gpsError,
  open,
  onToggle,
}: {
  gpsInfo: GpsLookupResult | null;
  gpsLoading: boolean;
  gpsError: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950/40">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-900/40"
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
          <MapPin className="h-3.5 w-3.5 text-emerald-400" />
          좌표·주소 변환 · 건축물대장
        </span>
        <span className="flex items-center gap-1 text-[11px] text-slate-500">
          {gpsLoading && open ? '조회 중…' : open ? '숨기기' : '펼치기'}
          {open ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </span>
      </button>
      {open ? (
        <div className="grid grid-cols-1 gap-4 border-t border-slate-800/80 px-4 pb-4 pt-3 md:grid-cols-2">
          {/* 좌표·주소 변환 */}
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <MapPin className="h-3 w-3 text-emerald-400" />
              좌표·주소 변환
            </h4>
            {gpsError ? (
              <p className="text-[11px] text-slate-500">{gpsError}</p>
            ) : (
              <table className="w-full text-[11px]">
                <tbody>
                  <GpsInfoRow label="구 주소" value={gpsInfo?.oldAddress} loading={gpsLoading} />
                  <GpsInfoRow label="신 주소" value={gpsInfo?.roadAddress} loading={gpsLoading} />
                  <GpsInfoRow label="우편번호" value={gpsInfo?.zipcode} loading={gpsLoading} />
                  <GpsInfoRow
                    label="좌표"
                    value={
                      gpsInfo
                        ? `${gpsInfo.center.lat.toFixed(6)}, ${gpsInfo.center.lng.toFixed(6)}`
                        : undefined
                    }
                    loading={gpsLoading}
                  />
                  <GpsInfoRow label="위도(도분초)" value={gpsInfo?.latDms} loading={gpsLoading} />
                  <GpsInfoRow label="경도(도분초)" value={gpsInfo?.lngDms} loading={gpsLoading} />
                  <GpsInfoRow label="구글좌표" value={gpsInfo?.googleCoord} loading={gpsLoading} />
                  <GpsInfoRow label="PNU" value={gpsInfo?.pnu} loading={gpsLoading} />
                </tbody>
              </table>
            )}
          </div>

          {/* 건축물대장 */}
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <Building2 className="h-3 w-3 text-emerald-400" />
              건축물대장
            </h4>
            {gpsError ? (
              <p className="text-[11px] text-slate-500">{gpsError}</p>
            ) : gpsLoading ? (
              <p className="text-[11px] text-slate-500">조회 중…</p>
            ) : gpsInfo?.building ? (
              <table className="w-full text-[11px]">
                <tbody>
                  <GpsInfoRow label="건물명칭" value={gpsInfo.building.name} loading={false} />
                  <GpsInfoRow label="동명칭" value={gpsInfo.building.dongName} loading={false} />
                  <GpsInfoRow label="지상층수" value={gpsInfo.building.groundFloors} loading={false} />
                  <GpsInfoRow label="지하층수" value={gpsInfo.building.basementFloors} loading={false} />
                  <GpsInfoRow label="연면적" value={gpsInfo.building.totalArea} loading={false} />
                  <GpsInfoRow label="대지면적" value={gpsInfo.building.platArea} loading={false} />
                  <GpsInfoRow label="건축면적" value={gpsInfo.building.buildingArea} loading={false} />
                  <GpsInfoRow label="주용도" value={gpsInfo.building.mainUse} loading={false} />
                  <GpsInfoRow label="세부용도" value={gpsInfo.building.detailUse} loading={false} />
                </tbody>
              </table>
            ) : (
              <p className="text-[11px] text-slate-500">건축물대장 조회 결과가 없습니다.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

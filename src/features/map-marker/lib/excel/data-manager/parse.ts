import * as XLSX from 'xlsx';
import {
  FACILITY_TEAM_MAP,
  parseFacilityTeamInput,
  getFacilityTeamExportLabel,
} from './shared';

export const parseMethods: Record<string, any> & ThisType<any> = {

    /**
     * 업로드된 Excel(.xlsx, .xls) 또는 CSV 파일을 읽고 파싱하여 검증 및 정제합니다.
     * @param {File} file 업로드된 파일 객체
     * @returns {Promise<Array>} 파싱된 위치 데이터 배열
     */
    parseExcelOrCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const data = new Uint8Array(event.target.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // 빈 셀도 빈 문자열 ""로 명시적으로 수집하여 인덱스 밀림 방지
                    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                    
                    if (rows.length === 0) {
                        throw new Error("엑셀 파일에 데이터가 없습니다.");
                    }
                    
                    // 스마트 열 감지 매핑 규칙
                    const headers = Object.keys(rows[0]);
                    const mapping = {
                        name: headers.find(h => /이름|상호|장소|명칭|지명|지점|국소|현장|사이트|name|title|label|place/i.test(h)),
                        lat: headers.find(h => /위도|lat|latitude|y/i.test(h)),
                        lng: headers.find(h => /경도|lng|longitude|lon|x/i.test(h)),
                        address: headers.find(h => /주소|소재지|도로명|지번|address|addr/i.test(h)),
                        memo: headers.find(h => /설명|메모|비고|특이사항|memo|desc|description/i.test(h)),
                        tags: headers.find(h => /태그|구분|그룹|tag|category/i.test(h)),
                        facilityYear: headers.find(h => /시설연도|시설년도|연도|year/i.test(h)),
                        projectCode: headers.find(h => /프로젝트코드|프로젝트|project/i.test(h)),
                        facilityCode: headers.find(h => /통합시설코드|시설코드|code/i.test(h)),
                        businessType: headers.find(h => /사업구분|사업|business/i.test(h)),
                        finalStationName: headers.find(h => /국소명.*최종|국소명-최종|국소명_최종/i.test(h)),
                        eqClass: headers.find(h => /장비분류|분류|class/i.test(h)),
                        eqType: headers.find(h => /장비타입|타입|type/i.test(h)),
                        installDate: headers.find(h => /시설일|설치일|install/i.test(h)),
                        openDate: headers.find(h => /개통일|개통|가동일|가동|open/i.test(h)),
                        facilityTeam: headers.find(h => /시설팀|담당팀|team/i.test(h)),
                        color: headers.find(h => /마커색상|색상|color/i.test(h))
                    };
                    
                    // 장소 이름과, (위도/경도) 또는 (주소) 중 하나는 반드시 존재해야 함
                    if (!mapping.name) {
                        throw new Error("장소 이름에 해당하는 열(이름, 상호, name 등)을 찾을 수 없습니다.");
                    }
                    
                    if (!mapping.lat && !mapping.lng && !mapping.address) {
                        throw new Error("위치 정보에 해당하는 열(위도/경도 또는 주소)을 찾을 수 없습니다.");
                    }
                    
                    const parsedData = rows.map((row, idx) => {
                        const rawName = String(row[mapping.name] || '').trim();
                        
                        // 이름이 없는 빈 행은 스킵
                        if (!rawName) return null;
                        
                        const latVal = mapping.lat ? parseFloat(row[mapping.lat]) : NaN;
                        const lngVal = mapping.lng ? parseFloat(row[mapping.lng]) : NaN;
                        const addressVal = mapping.address ? String(row[mapping.address]).trim() : "";
                        const memoVal = mapping.memo ? String(row[mapping.memo]).trim() : "";
                        const tagsVal = mapping.tags ? String(row[mapping.tags]).trim() : "";
                        
                        // 추가 상세 정보 수집
                        const facilityCodeVal = mapping.facilityCode ? String(row[mapping.facilityCode]).trim() : "";
                        const projectCodeVal = mapping.projectCode ? String(row[mapping.projectCode]).trim() : "";
                        const facilityYearVal = mapping.facilityYear ? String(row[mapping.facilityYear]).trim() : "";
                        const businessTypeVal = mapping.businessType ? String(row[mapping.businessType]).trim() : "";
                        const finalStationNameVal = mapping.finalStationName ? String(row[mapping.finalStationName]).trim() : "";
                        const eqClassVal = mapping.eqClass ? String(row[mapping.eqClass]).trim() : "";
                        const eqTypeVal = mapping.eqType ? String(row[mapping.eqType]).trim() : "";
                        const installDateVal = mapping.installDate
                            ? this.formatDateToYmd(row[mapping.installDate])
                            : "";
                        const openDateVal = mapping.openDate
                            ? this.formatDateToYmd(row[mapping.openDate])
                            : "";
                        const colorVal = mapping.color ? String(row[mapping.color]).trim() : "";
                        const facilityTeamVal = mapping.facilityTeam ? String(row[mapping.facilityTeam]).trim() : "";
                        const teamParsed = parseFacilityTeamInput(facilityTeamVal);
                        
                        // 태그 분리
                        const tags = tagsVal 
                            ? tagsVal.split(/[,|/]/).map(t => t.trim()).filter(t => t.length > 0)
                            : [];
                        
                        // 시설팀 우선, 없으면 색상 Hex 검증
                        const validColor = teamParsed.facilityTeam
                            ? teamParsed.color
                            : (/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(colorVal) ? colorVal : '#10b981');
                        
                        const item: Record<string, any> = {
                            id: 'marker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                            name: rawName,
                            memo: memoVal,
                            tags: tags,
                            facilityTeam: teamParsed.facilityTeam,
                            color: validColor,
                            facilityCode: facilityCodeVal,
                            projectCode: projectCodeVal,
                            facilityYear: facilityYearVal,
                            businessType: businessTypeVal,
                            finalStationName: finalStationNameVal,
                            eqClass: eqClassVal,
                            eqType: eqTypeVal,
                            installDate: installDateVal,
                            openDate: openDateVal,
                            roadAddress: addressVal, // 엑셀에 기입된 주소가 있다면 기본 할당
                            jibunAddress: "",
                            createdAt: new Date().toISOString().split('T')[0]
                        };
                        
                        // 좌표가 제대로 유효하게 있는 경우 (Float 정밀도 보존)
                        if (!isNaN(latVal) && !isNaN(lngVal)) {
                            item.lat = latVal;
                            item.lng = lngVal;
                        } else if (addressVal) {
                            // 좌표는 없지만 주소가 있는 경우 주소 수집 (Geocoding용)
                            item.address = addressVal;
                        } else {
                            // 좌표도 주소도 없으면 경고 대상
                            console.warn(`[행 ${idx + 2}] 위치 정보를 찾을 수 없는 행입니다. (이름: ${rawName})`);
                            return null;
                        }
                        
                        return item;
                    }).filter(item => item !== null);
                    
                    resolve(parsedData);
                } catch (error) {
                    reject(new Error("Excel 파일 파싱 오류: " + (error as Error).message));
                }
            };
            
            reader.onerror = () => {
                reject(new Error("파일을 읽는 도중 오류가 발생했습니다."));
            };
            
            reader.readAsArrayBuffer(file);
        });
    },


    /**
     * information 테이블 전용 엑셀 파싱.
     * 위경도 없이 상세 장비 정보(통합시설코드, 프로젝트코드 등)만 추출합니다.
     * @param {File} file 업로드된 Excel/CSV 파일
     * @returns {Promise<Array>} 파싱된 information 행 배열
     */
    parseInfoExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const data = new Uint8Array(event.target.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const worksheet = this.resolveInfoExcelSheet(workbook);
                    
                    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
                    
                    if (rows.length === 0) {
                        throw new Error("엑셀 파일에 데이터가 없습니다.");
                    }
                    
                    const headers = Object.keys(rows[0]);
                    const mapping = this.resolveInfoHeaderMapping(headers);
                    
                    if (!mapping.facilityCode) {
                        throw new Error("통합시설코드 열을 찾을 수 없습니다. '데이터' 시트와 첫 행 헤더(통합시설코드·마커아이디 등)를 확인하세요.");
                    }
                    
                    const parsedData = rows.map((row) => {
                        const facilityCode = String(row[mapping.facilityCode] || '').trim();
                        if (this.isInfoGuideRow(facilityCode)) return null;
                        
                        return {
                            facility_code: facilityCode,
                            project_code: mapping.projectCode ? String(row[mapping.projectCode]).trim() : "",
                            facility_year: mapping.facilityYear ? String(row[mapping.facilityYear]).trim() : "",
                            business_type: mapping.businessType ? String(row[mapping.businessType]).trim() : "",
                            place_name: mapping.placeName ? String(row[mapping.placeName]).trim() : "",
                            final_station_name: mapping.finalStationName ? String(row[mapping.finalStationName]).trim() : "",
                            eq_class: mapping.eqClass ? String(row[mapping.eqClass]).trim() : "",
                            eq_type: mapping.eqType ? String(row[mapping.eqType]).trim() : "",
                            install_date: mapping.installDate
                                ? this.formatDateToYmd(row[mapping.installDate])
                                : "",
                            open_date: mapping.openDate
                                ? this.formatDateToYmd(row[mapping.openDate])
                                : "",
                            marker_id: mapping.markerId ? String(row[mapping.markerId]).trim() : ""
                        };
                    }).filter(item => item !== null);
                    
                    if (parsedData.length === 0) {
                        throw new Error("유효한 상세 장비 정보가 없습니다. 통합시설코드 열이 비어있는지 확인하세요.");
                    }
                    
                    // 통합시설코드 중복 검사
                    const codes = parsedData.map(d => d.facility_code);
                    const duplicates = codes.filter((c, i) => codes.indexOf(c) !== i);
                    if (duplicates.length > 0) {
                        const uniqueDuplicates = [...new Set(duplicates)];
                        throw new Error(`통합시설코드 중복 발견: ${uniqueDuplicates.join(', ')}. 중복을 제거한 후 다시 업로드하세요.`);
                    }
                    
                    resolve(parsedData);
                } catch (error) {
                    reject(new Error("상세 장비 정보 파싱 오류: " + (error as Error).message));
                }
            };
            
            reader.onerror = () => {
                reject(new Error("파일을 읽는 도중 오류가 발생했습니다."));
            };
            
            reader.readAsArrayBuffer(file);
        });
    },


    /**
     * 마커 백업 Excel 파일을 읽고 검증합니다.
     * @param {File} file 업로드된 Excel/CSV 파일
     * @returns {Promise<Array>} 검증된 마커 배열
     */
    importMarkersFromExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                try {
                    const data = new Uint8Array(event.target.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: "array" });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                    if (rows.length === 0) {
                        throw new Error("엑셀 파일에 데이터가 없습니다.");
                    }

                    const headers = Object.keys(rows[0]);
                    const mapping = {
                        id: headers.find(h => /아이디|^id$/i.test(h)),
                        name: headers.find(h => /장소.*이름|장소명|이름|name/i.test(h)),
                        lat: headers.find(h => /위도|lat/i.test(h)),
                        lng: headers.find(h => /경도|lng|lon/i.test(h)),
                        memo: headers.find(h => /메모|비고|memo/i.test(h)),
                        tags: headers.find(h => /태그|tag/i.test(h)),
                        facilityTeam: headers.find(h => /시설팀|담당팀|team/i.test(h)),
                        color: headers.find(h => /마커색상|색상|color/i.test(h)),
                        facilityCode: headers.find(h => /통합시설코드|시설코드|facility/i.test(h)),
                        roadAddress: headers.find(h => /도로명주소|도로명/i.test(h)),
                        jibunAddress: headers.find(h => /지번주소|지번/i.test(h)),
                        createdAt: headers.find(h => /등록일|생성일|created/i.test(h))
                    };

                    if (!mapping.name) {
                        throw new Error("장소 이름에 해당하는 열을 찾을 수 없습니다.");
                    }
                    if (!mapping.lat || !mapping.lng) {
                        throw new Error("위도·경도에 해당하는 열을 찾을 수 없습니다.");
                    }

                    const validatedMarkers = rows.map((row, index) => {
                        const rawName = String(row[mapping.name] || "").trim();
                        if (!rawName) return null;

                        const latNum = parseFloat(row[mapping.lat]);
                        const lngNum = parseFloat(row[mapping.lng]);
                        if (isNaN(latNum) || isNaN(lngNum)) {
                            throw new Error(`[행 ${index + 2}] 위도 또는 경도 값이 올바르지 않습니다. (장소: ${rawName})`);
                        }

                        const rawId = mapping.id ? String(row[mapping.id] || "").trim() : "";
                        const tagsVal = mapping.tags ? String(row[mapping.tags] || "").trim() : "";
                        const colorVal = mapping.color ? String(row[mapping.color]).trim() : "";
                        const facilityTeamVal = mapping.facilityTeam ? String(row[mapping.facilityTeam] || "").trim() : "";
                        const teamParsed = parseFacilityTeamInput(facilityTeamVal);
                        const validColor = teamParsed.facilityTeam
                            ? teamParsed.color
                            : (/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(colorVal) ? colorVal : "#10b981");

                        return {
                            id: rawId || "marker_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
                            name: rawName,
                            lat: latNum,
                            lng: lngNum,
                            memo: mapping.memo ? String(row[mapping.memo] || "").trim() : "",
                            tags: tagsVal
                                ? tagsVal.split(/[,|/]/).map(t => t.trim()).filter(t => t.length > 0)
                                : [],
                            facilityTeam: teamParsed.facilityTeam,
                            color: validColor,
                            facilityCode: mapping.facilityCode ? String(row[mapping.facilityCode] || "").trim() : "",
                            roadAddress: mapping.roadAddress ? String(row[mapping.roadAddress] || "").trim() : "",
                            jibunAddress: mapping.jibunAddress ? String(row[mapping.jibunAddress] || "").trim() : "",
                            createdAt: mapping.createdAt ? String(row[mapping.createdAt] || "").trim() : new Date().toISOString()
                        };
                    }).filter(item => item !== null);

                    if (validatedMarkers.length === 0) {
                        throw new Error("복원할 유효한 마커 데이터가 없습니다.");
                    }

                    resolve(validatedMarkers);
                } catch (error) {
                    reject(new Error("마커 Excel 복원 실패: " + (error as Error).message));
                }
            };

            reader.onerror = () => {
                reject(new Error("파일을 읽는 도중 오류가 발생했습니다."));
            };

            reader.readAsArrayBuffer(file);
        });
    },


    /**
     * 업로드된 축전지 Excel(.xlsx, .xls) 또는 CSV 파일을 읽고 파싱하여 검증 및 정제합니다.
     */
    parseBatteryExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const data = new Uint8Array(event.target.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    // 빈 셀도 빈 문자열 ""로 수집하여 인덱스 밀림 방지
                    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                    
                    if (rows.length === 0) {
                        throw new Error("엑셀 파일에 데이터가 없습니다.");
                    }
                    
                    // 스마트 열 감지 매핑 규칙
                    const headers = Object.keys(rows[0]);
                    
                    // 정확히 일치하는 헤더 우선순위 적용
                    const exactAddress = headers.find(h => h.includes('수거') && h.includes('위치')) || headers.find(h => h.trim() === '주소');
                    const exactLocalAddress = headers.find(h => h.trim() === '국소주소');
                    const exactStation = headers.find(h => h.trim() === '창고/국소/국사명');
                    const exactERP = headers.find(h => h.trim() === '통합시설명칭(ERP)');
                    const exactLocalStation = headers.find(h => h.trim() === '국소명');

                    const mapping = {
                        name: exactStation || exactERP || headers.find(h => /창고\/국소\/국사명|통합시설명칭|ERP|이름|상호|장소|명칭|지명|지점|국소|현장|사이트|name|title/i.test(h)),
                        address: exactAddress || headers.find(h => h.trim() !== '국소주소' && /주소|소재지|도로명|지번|address|addr/i.test(h)),
                        localAddress: exactLocalAddress || headers.find(h => /국소주소|국사주소/i.test(h)),
                        capacity: headers.find(h => /용량|capacity|ah/i.test(h)),
                        quantity: headers.find(h => /수량|quantity|cell/i.test(h)),
                        stationName: exactStation || headers.find(h => /창고|국소|국사|현장명|station/i.test(h)),
                        localStation: exactLocalStation || headers.find(h => /국소명|국사명/i.test(h)),
                        lat: headers.find(h => /위도|lat|latitude|y/i.test(h)),
                        lng: headers.find(h => /경도|lng|longitude|lon|x/i.test(h)),
                        memo: exactERP || headers.find(h => /설명|메모|비고|특이사항|memo|desc|description/i.test(h)),
                        tags: headers.find(h => /태그|구분|그룹|tag|category/i.test(h)),
                        facilityTeam: headers.find(h => /시설팀|담당팀|team/i.test(h)),
                        color: headers.find(h => /마커색상|색상|color/i.test(h))
                    };
                    
                    // 통합시설명칭(ERP)과 주소는 필수
                    if (!mapping.name) {
                        throw new Error("통합시설명칭(ERP) 또는 창고/국소/국사명에 해당하는 열을 찾을 수 없습니다.");
                    }
                    if (!mapping.address && !mapping.lat) {
                        throw new Error("위치 정보에 해당하는 열(주소 또는 위도)을 찾을 수 없습니다.");
                    }
                    
                    const parsedData = rows.map((row, idx) => {
                        const stationNameVal = mapping.stationName ? String(row[mapping.stationName]).trim() : "기지국(현장)";
                        const localStationVal = mapping.localStation ? String(row[mapping.localStation]).trim() : "";
                        
                        let rawName = stationNameVal;
                        if (rawName === '기지국' || rawName === '기지국(현장)') {
                            if (localStationVal) {
                                rawName = localStationVal;
                            }
                        }
                        if (!rawName) {
                            rawName = mapping.name ? String(row[mapping.name]).trim() : "";
                        }
                        if (!rawName) return null;
                        
                        const addressVal = mapping.address ? String(row[mapping.address]).trim() : "";
                        const localAddressVal = mapping.localAddress ? String(row[mapping.localAddress]).trim() : "";
                        const capacityVal = mapping.capacity ? parseInt(row[mapping.capacity], 10) : 600;
                        const quantityVal = mapping.quantity ? parseInt(row[mapping.quantity], 10) : 12;
                        
                        const latVal = mapping.lat ? parseFloat(row[mapping.lat]) : NaN;
                        const lngVal = mapping.lng ? parseFloat(row[mapping.lng]) : NaN;
                        
                        const memoVal = mapping.memo ? String(row[mapping.memo]).trim() : "";
                        const tagsVal = mapping.tags ? String(row[mapping.tags]).trim() : "";
                        const colorVal = mapping.color ? String(row[mapping.color]).trim() : "";
                        const facilityTeamVal = mapping.facilityTeam ? String(row[mapping.facilityTeam]).trim() : "";
                        const teamParsed = parseFacilityTeamInput(facilityTeamVal);
                        
                        const tags = tagsVal 
                            ? tagsVal.split(/[,|/]/).map(t => t.trim()).filter(t => t.length > 0)
                            : [];
                        
                        const validColor = teamParsed.facilityTeam
                            ? teamParsed.color
                            : (/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(colorVal) ? colorVal : '#64748b');
                        
                        const item: Record<string, any> = {
                            id: 'marker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                            name: rawName,
                            address: addressVal,
                            localAddress: localAddressVal,
                            capacity: isNaN(capacityVal) ? 600 : capacityVal,
                            quantity: isNaN(quantityVal) ? 12 : quantityVal,
                            stationName: stationNameVal || "기지국(현장)",
                            memo: memoVal,
                            tags: tags,
                            facilityTeam: teamParsed.facilityTeam,
                            color: validColor,
                            createdAt: new Date().toISOString().split('T')[0]
                        };
                        
                        if (!isNaN(latVal) && !isNaN(lngVal)) {
                            item.lat = latVal;
                            item.lng = lngVal;
                        } else if (addressVal) {
                            item.address = addressVal;
                        } else {
                            console.warn(`[행 ${idx + 2}] 주소 및 위경도 정보가 부족합니다. (이름: ${rawName})`);
                            return null;
                        }
                        
                        return item;
                    }).filter(item => item !== null);
                    
                    // 명칭(name)이 동일한 마커 병합 및 items 빌드
                    const mergedMap = new Map();
                    parsedData.forEach(item => {
                        const key = item.name;
                        if (mergedMap.has(key)) {
                            const existing = mergedMap.get(key);
                            existing.items.push({
                                erpName: item.memo, 
                                address: item.localAddress || item.address, 
                                capacity: item.capacity,
                                quantity: item.quantity,
                                stationName: item.stationName,
                                createdAt: item.createdAt
                            });
                            if ((existing.lat === undefined || isNaN(existing.lat)) && item.lat !== undefined && !isNaN(item.lat)) {
                                existing.lat = item.lat;
                                existing.lng = item.lng;
                            }
                            if (!existing.address && item.address) {
                                existing.address = item.address;
                            }
                        } else {
                            item.items = [{
                                erpName: item.memo,
                                address: item.localAddress || item.address, 
                                capacity: item.capacity,
                                quantity: item.quantity,
                                stationName: item.stationName,
                                createdAt: item.createdAt
                            }];
                            mergedMap.set(key, item);
                        }
                    });
                    
                    resolve(Array.from(mergedMap.values()));
                } catch (error) {
                    reject(new Error("Excel 파일 파싱 오류: " + (error as Error).message));
                }
            };
            
            reader.onerror = () => {
                reject(new Error("파일을 읽는 도중 오류가 발생했습니다."));
            };
            
            reader.readAsArrayBuffer(file);
        });
    },
};

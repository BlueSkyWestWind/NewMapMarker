/**
 * DataManager - 데이터 내보내기/가져오기 및 정밀도 보존 모듈
 * 
 * [정확성 규칙 준수]
 * 1. 위도/경도 좌표의 소수점 값을 버림/반올림 없이 원본 그대로 보존합니다.
 * 2. Excel 한글 깨짐 방지를 위해 UTF-8 BOM(\ufeff) 인코딩을 적용합니다.
 * 3. 빈 값(메모 없음 등)을 명시적으로 공백 문자열("")로 처리하여 칸이 밀리는 현상을 방지합니다.
 */
const DataManager = {
    /**
     * 마커 데이터를 CSV 형식의 문자열로 변환하고 다운로드합니다.
     * @param {Array} markers 저장된 마커 배열
     */
    exportToCSV(markers) {
        if (!markers || markers.length === 0) {
            throw new Error("내보낼 마커 데이터가 없습니다.");
        }

        // CSV 헤더 정의
        const headers = ["아이디", "장소 이름", "위도", "경도", "메모", "태그", "등록일"];
        
        // 데이터 행 변환
        const rows = markers.map(marker => {
            const id = marker.id || "";
            // 쌍따옴표 내의 데이터에 쌍따옴표가 있을 경우 이중 처리
            const name = (marker.name || "").replace(/"/g, '""');
            
            // [정확성 최우선] 위도와 경도는 소수점 자릿수 자르지 않고 문자열로 안전하게 보존
            const lat = typeof marker.lat === 'number' ? marker.lat.toString() : (marker.lat || "0");
            const lng = typeof marker.lng === 'number' ? marker.lng.toString() : (marker.lng || "0");
            
            const memo = (marker.memo || "").replace(/"/g, '""').replace(/\r?\n/g, " "); // 줄바꿈은 공백으로 치환
            const tags = (marker.tags || []).join(", ").replace(/"/g, '""');
            const date = marker.createdAt || "";

            return `"${id}","${name}",${lat},${lng},"${memo}","${tags}","${date}"`;
        });

        // BOM 추가 (UTF-8 한글 깨짐 방지)
        const csvContent = "\ufeff" + [headers.join(","), ...rows].join("\n");
        
        // 다운로드 실행
        this._triggerDownload(csvContent, "map_markers.csv", "text/csv;charset=utf-8;");
        
        // 검산 목적의 리턴값
        return {
            rowCount: rows.length,
            totalMarkers: markers.length
        };
    },

    /**
     * 마커 데이터를 JSON 형식의 파일로 백업합니다.
     * @param {Array} markers 저장된 마커 배열
     */
    exportToJSON(markers) {
        if (!markers) {
            throw new Error("백업할 마커 데이터가 없습니다.");
        }

        // 들여쓰기를 포함하여 가독성 있게 변환하되, 실수(float) 오차 없도록 함
        const jsonContent = JSON.stringify(markers, null, 2);
        this._triggerDownload(jsonContent, "map_markers_backup.json", "application/json;charset=utf-8;");
        
        return markers.length;
    },

    /**
     * 업로드된 JSON 파일을 읽고 파싱하여 검증합니다.
     * @param {File} file 업로드된 파일 객체
     * @returns {Promise<Array>} 검증된 마커 배열
     */
    importFromJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    
                    if (!Array.isArray(data)) {
                        throw new Error("올바르지 않은 데이터 형식입니다. (배열 형태여야 합니다)");
                    }

                    // 데이터 정합성 검증 및 기본값 보정
                    const validatedMarkers = data.map((item, index) => {
                        if (!item.name) {
                            throw new Error(`[행 ${index + 1}] 장소 이름은 필수 항목입니다.`);
                        }
                        
                        // 위경도 좌표 검증 (수치형이거나 수치 파싱이 가능한 형태여야 함)
                        const latNum = parseFloat(item.lat);
                        const lngNum = parseFloat(item.lng);
                        
                        if (isNaN(latNum) || isNaN(lngNum)) {
                            throw new Error(`[장소: ${item.name}] 위도 또는 경도 값이 올바르지 않은 숫자입니다.`);
                        }

                        // 복원 데이터 빌드 (상세 장비 정보 필드 보존 포함)
                        return {
                            id: item.id || 'marker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                            name: item.name.trim(),
                            lat: latNum, // Float 정밀도 보존
                            lng: lngNum,
                            memo: (item.memo || "").trim(),
                            tags: Array.isArray(item.tags) ? item.tags.map(t => t.trim()) : [],
                            facilityCode: item.facilityCode || "",
                            projectCode: item.projectCode || "",
                            facilityYear: item.facilityYear || "",
                            businessType: item.businessType || "",
                            finalStationName: item.finalStationName || "",
                            eqClass: item.eqClass || "",
                            eqType: item.eqType || "",
                            installDate: item.installDate || "",
                            openDate: item.openDate || "",
                            createdAt: item.createdAt || new Date().toISOString()
                        };
                    });

                    resolve(validatedMarkers);
                } catch (error) {
                    reject(new Error("JSON 파일 파싱 및 복원 실패: " + error.message));
                }
            };

            reader.onerror = () => {
                reject(new Error("파일을 읽는 도중 오류가 발생했습니다."));
            };

            reader.readAsText(file);
        });
    },

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
                    const data = new Uint8Array(event.target.result);
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
                        openDate: headers.find(h => /개통일|개통|가동일|가동|open/i.test(h))
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
                        const installDateVal = mapping.installDate ? String(row[mapping.installDate]).trim() : "";
                        const openDateVal = mapping.openDate ? String(row[mapping.openDate]).trim() : "";
                        
                        // 태그 분리
                        const tags = tagsVal 
                            ? tagsVal.split(/[,|/]/).map(t => t.trim()).filter(t => t.length > 0)
                            : [];
                        
                        const item = {
                            id: 'marker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                            name: rawName,
                            memo: memoVal,
                            tags: tags,
                            facilityCode: facilityCodeVal,
                            projectCode: projectCodeVal,
                            facilityYear: facilityYearVal,
                            businessType: businessTypeVal,
                            finalStationName: finalStationNameVal,
                            eqClass: eqClassVal,
                            eqType: eqTypeVal,
                            installDate: installDateVal,
                            openDate: openDateVal,
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
                    reject(new Error("Excel 파일 파싱 오류: " + error.message));
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
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
                    
                    if (rows.length === 0) {
                        throw new Error("엑셀 파일에 데이터가 없습니다.");
                    }
                    
                    const headers = Object.keys(rows[0]);
                    const mapping = {
                        facilityCode: headers.find(h => /통합시설코드|시설코드|facility.*code/i.test(h)),
                        projectCode: headers.find(h => /프로젝트코드|프로젝트|project/i.test(h)),
                        facilityYear: headers.find(h => /시설연도|시설년도|연도|year/i.test(h)),
                        businessType: headers.find(h => /사업구분|사업|business/i.test(h)),
                        placeName: headers.find(h => /장소.*이름|장소명|이름|name|place/i.test(h)),
                        finalStationName: headers.find(h => /국소명.*최종|국소명-최종|국소명_최종/i.test(h)),
                        eqClass: headers.find(h => /장비분류|분류/i.test(h)),
                        eqType: headers.find(h => /장비타입|타입/i.test(h)),
                        installDate: headers.find(h => /시설일|설치일|install/i.test(h)),
                        openDate: headers.find(h => /개통일|개통|가동일|가동|open/i.test(h))
                    };
                    
                    if (!mapping.facilityCode) {
                        throw new Error("통합시설코드에 해당하는 열(통합시설코드, 시설코드 등)을 찾을 수 없습니다.");
                    }
                    
                    const parsedData = rows.map((row, idx) => {
                        const facilityCode = String(row[mapping.facilityCode] || '').trim();
                        if (!facilityCode) return null;
                        
                        return {
                            facility_code: facilityCode,
                            project_code: mapping.projectCode ? String(row[mapping.projectCode]).trim() : "",
                            facility_year: mapping.facilityYear ? String(row[mapping.facilityYear]).trim() : "",
                            business_type: mapping.businessType ? String(row[mapping.businessType]).trim() : "",
                            place_name: mapping.placeName ? String(row[mapping.placeName]).trim() : "",
                            final_station_name: mapping.finalStationName ? String(row[mapping.finalStationName]).trim() : "",
                            eq_class: mapping.eqClass ? String(row[mapping.eqClass]).trim() : "",
                            eq_type: mapping.eqType ? String(row[mapping.eqType]).trim() : "",
                            install_date: mapping.installDate ? String(row[mapping.installDate]).trim() : "",
                            open_date: mapping.openDate ? String(row[mapping.openDate]).trim() : ""
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
                    reject(new Error("상세 장비 정보 파싱 오류: " + error.message));
                }
            };
            
            reader.onerror = () => {
                reject(new Error("파일을 읽는 도중 오류가 발생했습니다."));
            };
            
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * 브라우저에서 다운로드를 실행시키는 헬퍼 메서드
     * @private
     */
    _triggerDownload(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};

// 전역 객체로 등록
window.DataManager = DataManager;

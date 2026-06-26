/**
 * MapMarkerApp Prototype Extension - app-db.js
 */
Object.assign(MapMarkerApp.prototype, {
    createSupabaseClient() {
        if (typeof SUPABASE_CONFIG === 'undefined' || !SUPABASE_CONFIG.URL || SUPABASE_CONFIG.URL === 'YOUR_SUPABASE_PROJECT_URL') {
            return null;
        }
        if (!SUPABASE_CONFIG.ANON_KEY) {
            console.error('Supabase ANON_KEY가 config.js에 설정되지 않았습니다.');
            return null;
        }

        const sdk = typeof supabase !== 'undefined'
            ? supabase
            : (typeof window !== 'undefined' ? window.supabase : null);

        if (!sdk || typeof sdk.createClient !== 'function') {
            console.error('Supabase JS SDK가 로드되지 않았습니다. index.html의 CDN 스크립트를 확인하세요.');
            return null;
        }

        try {
            return sdk.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            });
        } catch (e) {
            console.error('Supabase 초기화 실패:', e);
            return null;
        }
    },

    applyAuthSession(session) {
        this.currentUser = session?.user ?? null;
        this.authSession = session ?? null;
        if (typeof this.updateAuthUI === 'function') {
            this.updateAuthUI(this.currentUser);
        }
    },

    /**
     * DB 쓰기 전 로그인 JWT 세션을 검증·갱신합니다.
     * UI에 로그인 표시만 있고 토큰이 없으면 anon 요청이 되어 permission denied 가 발생합니다.
     * @returns {Promise<Object>} 유효한 세션
     */
    async ensureAuthenticatedForDbWrite() {
        if (!this.supabase) {
            throw new Error('Supabase가 연결되지 않았습니다. config.js를 확인하세요.');
        }

        let { data: { session }, error } = await this.supabase.auth.getSession();
        if (error) {
            throw new Error(this.translateAuthError(error));
        }

        if (!session?.access_token) {
            this.applyAuthSession(null);
            throw new Error('로그인 세션이 없습니다. 로그아웃 후 다시 로그인해주세요.');
        }

        const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
        const shouldRefresh = expiresAtMs > 0 && (expiresAtMs - Date.now()) < 60_000;

        if (shouldRefresh) {
            const { data: refreshed, error: refreshError } = await this.supabase.auth.refreshSession();
            if (refreshError || !refreshed?.session?.access_token) {
                this.applyAuthSession(null);
                throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.');
            }
            session = refreshed.session;
        }

        this.applyAuthSession(session);
        return session;
    },

    setupSupabaseAuth() {
        if (!this.supabase) return;

        this.supabase.auth.onAuthStateChange((event, session) => {
            this.applyAuthSession(session);

            if (event === 'SIGNED_IN' && session?.user) {
                const hash = window.location.hash || '';
                if (hash.includes('access_token') || hash.includes('type=signup') || hash.includes('type=recovery')) {
                    this.showToast('이메일 인증이 완료되었습니다. 로그인되었습니다.');
                    window.history.replaceState(null, '', window.location.pathname + window.location.search);
                }
            }
        });

        this.supabase.auth.getSession()
            .then(({ data: { session } }) => this.applyAuthSession(session))
            .catch((e) => console.error('인증 세션 조회 오류:', e));
    },

    getAuthRedirectUrl() {
        if (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.AUTH_REDIRECT_URL) {
            return SUPABASE_CONFIG.AUTH_REDIRECT_URL;
        }
        return window.location.origin;
    },

    translateAuthError(error) {
        if (!error) return '인증 처리에 실패했습니다.';
        const message = (error.message || '').toLowerCase();

        if (message.includes('invalid login credentials')) {
            return '이메일 또는 비밀번호가 올바르지 않습니다.';
        }
        if (message.includes('user already registered')) {
            return '이미 등록된 이메일입니다. 로그인 탭을 이용해주세요.';
        }
        if (message.includes('password should be at least')) {
            return '비밀번호는 6자 이상이어야 합니다.';
        }
        if (message.includes('unable to validate email address') || message.includes('invalid email')) {
            return '유효한 이메일 주소를 입력해주세요.';
        }
        if (message.includes('email not confirmed')) {
            return '이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.';
        }
        if (message.includes('signup is disabled')) {
            return '회원가입이 비활성화되어 있습니다. 관리자에게 문의해주세요.';
        }
        if (message.includes('over_email_send_rate_limit') || message.includes('rate limit')) {
            return '이메일 발송 한도를 초과했습니다. 잠시 후 다시 시도하거나 Supabase 대시보드에서 이메일 인증 설정을 확인해주세요.';
        }
        if (message.includes('invalid jwt') || message.includes('invalid api key')) {
            return 'Supabase API 키가 올바르지 않습니다. config.js의 ANON_KEY를 대시보드 API 키와 일치시켜 주세요.';
        }

        return error.message || '인증 처리에 실패했습니다.';
    },

    async handleLogin(email, password) {
        if (!this.supabase) {
            return { error: new Error('Supabase가 연결되지 않았습니다. config.js를 확인해주세요.') };
        }
        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
            if (error) {
                return { error: new Error(this.translateAuthError(error)) };
            }
            if (data?.session) {
                this.applyAuthSession(data.session);
            }
            return { data, error: null };
        } catch (e) {
            return { error: new Error(this.translateAuthError(e)) };
        }
    },

    async handleSignUp(email, password) {
        if (!this.supabase) {
            return { error: new Error('Supabase가 연결되지 않았습니다. config.js를 확인해주세요.') };
        }
        try {
            const { data, error } = await this.supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: this.getAuthRedirectUrl()
                }
            });
            if (error) {
                return { error: new Error(this.translateAuthError(error)) };
            }

            // 이미 가입된 이메일이면 Supabase가 error 없이 identities=[] 로 응답하는 경우가 있음
            if (!data?.user) {
                return {
                    error: new Error('회원가입에 실패했습니다. 이미 등록된 이메일이거나 입력 정보를 확인해주세요.')
                };
            }
            if (!data.user.identities || data.user.identities.length === 0) {
                return {
                    error: new Error('이미 등록된 이메일입니다. 로그인 탭을 이용해주세요.')
                };
            }

            if (data.session) {
                this.applyAuthSession(data.session);
            }

            const needsEmailConfirmation = !data.session;
            return { data, error: null, needsEmailConfirmation };
        } catch (e) {
            return { error: new Error(this.translateAuthError(e)) };
        }
    },

    async handleLogout() {
        if (!this.supabase) return;
        try {
            const { error } = await this.supabase.auth.signOut();
            if (error) throw error;
            this.applyAuthSession(null);
            this.showToast('로그아웃되었습니다.');
        } catch (e) {
            console.error("로그아웃 오류:", e);
            this.showToast('로그아웃에 실패했습니다.', 5000);
        }
    },

    loadFromLocalStorage() {
        const saved = localStorage.getItem('saved_markers');
        if (saved) {
            try {
                this.eqMarkersData = JSON.parse(saved);
            } catch (e) {
                console.error("저장된 마커 파싱 오류:", e);
                this.eqMarkersData = [];
            }
        }
        const savedBattery = localStorage.getItem('saved_battery_markers');
        if (savedBattery) {
            try {
                this.batteryMarkersData = JSON.parse(savedBattery);
            } catch (e) {
                console.error("저장된 축전지 마커 파싱 오류:", e);
                this.batteryMarkersData = [];
            }
        }
        
        this.markersData = this.currentMode === 'equipment' ? this.eqMarkersData : this.batteryMarkersData;
    },

    async loadFromSupabase() {
        if (!this.supabase) return false;

        try {
            const { data: markersList, error: markersError } = await this.supabase
                .from('markers')
                .select('*')
                .order('created_at', { ascending: false });

            if (markersError) throw markersError;

            const { data: infoList, error: infoError } = await this.supabase
                .from('information')
                .select('*');

            if (infoError) throw infoError;

            const infoMap = new Map();
            const infoByMarkerId = new Map();
            if (infoList) {
                infoList.forEach(info => {
                    if (info.marker_id) {
                        if (!infoByMarkerId.has(info.marker_id)) {
                            infoByMarkerId.set(info.marker_id, []);
                        }
                        infoByMarkerId.get(info.marker_id).push(info);
                    }

                    const name = info.place_name ? info.place_name.trim() : "";
                    if (name) {
                        if (!infoMap.has(name)) {
                            infoMap.set(name, []);
                        }
                        infoMap.get(name).push(info);
                    }
                });
            }

            this.eqMarkersData = (markersList || []).map(row => {
                const markerName = row.name ? row.name.trim() : "";
                const infos = infoByMarkerId.get(row.id) || infoMap.get(markerName) || [];
                const repInfo = infos[0] || null;

                return {
                    id: row.id,
                    name: row.name,
                    lat: row.lat,
                    lng: row.lng,
                    memo: row.memo || "",
                    tags: row.tags || [],
                    color: row.color || DEFAULT_MARKER_COLOR,
                    facilityTeam: row.facility_team || '',
                    roadAddress: row.road_address || "",
                    jibunAddress: row.jibun_address || "",
                    facilityCode: row.facility_code || (repInfo ? repInfo.facility_code || "" : ""),
                    projectCode: repInfo ? repInfo.project_code || "" : "",
                    facilityYear: repInfo ? repInfo.facility_year || "" : "",
                    businessType: repInfo ? repInfo.business_type || "" : "",
                    finalStationName: repInfo ? repInfo.final_station_name || "" : "",
                    eqClass: repInfo ? repInfo.eq_class || "" : "",
                    eqType: repInfo ? repInfo.eq_type || "" : "",
                    installDate: repInfo ? repInfo.install_date || "" : "",
                    openDate: repInfo ? repInfo.open_date || "" : "",
                    createdAt: row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
                };
            });

            const { data: bMarkersList, error: bMarkersError } = await this.supabase
                .from('battery_markers')
                .select('*')
                .order('created_at', { ascending: false });

            if (bMarkersError) throw bMarkersError;

            const { data: bSpecsList, error: bSpecsError } = await this.supabase
                .from('battery_specs')
                .select('*');

            if (bSpecsError) throw bSpecsError;

            const specsMap = new Map();
            if (bSpecsList) {
                bSpecsList.forEach(spec => {
                    const markerId = spec.marker_id;
                    if (markerId) {
                        if (!specsMap.has(markerId)) {
                            specsMap.set(markerId, []);
                        }
                        specsMap.get(markerId).push(spec);
                    }
                });
            }

            this.batteryMarkersData = (bMarkersList || []).map(row => {
                const specs = specsMap.get(row.id) || [];
                const repSpec = specs[0] || null;
                return {
                    id: row.id,
                    name: row.name,
                    lat: row.lat,
                    lng: row.lng,
                    address: row.address || "",
                    memo: row.memo || "",
                    tags: row.tags || [],
                    color: row.color || DEFAULT_MARKER_COLOR,
                    facilityTeam: row.facility_team || '',
                    createdAt: row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
                    items: specs.map(s => ({
                        id: s.id,
                        erpName: s.erp_name || "",
                        address: row.address || "",
                        capacity: s.capacity || 600,
                        quantity: s.quantity || 12,
                        stationName: s.station_name || "",
                        createdAt: s.created_at ? s.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
                    })),
                    capacity: repSpec ? repSpec.capacity : 600,
                    quantity: repSpec ? repSpec.quantity : 12,
                    stationName: repSpec ? repSpec.station_name : (row.name || "")
                };
            });

            this.markersData = this.currentMode === 'equipment' ? this.eqMarkersData : this.batteryMarkersData;

            this.initFilters(false);
            this.updateBatteryBulkDeleteButtonVisibility();
            this.updateFacilityTeamVisibility();
            this.updateFilterSectionVisibility();
            if (this.map) {
                this.renderMarkersOnMap();
            }
            this.renderMarkersList();
            return true;
        } catch (e) {
            console.error("Supabase 데이터 로드 실패, 로컬 캐시를 유지합니다:", e);
            return false;
        }
    },

    async fetchAndBindDetailedInfo(markerName, facilityCode) {
        if (!this.supabase) return;
        
        try {
            let query = this.supabase
                .from('information')
                .select('*');

            if (this.currentEditingId) {
                query = query.eq('marker_id', this.currentEditingId);
            } else {
                query = query.ilike('place_name', `%${markerName}%`);
            }

            const { data, error } = await query;
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                // 1. 테이블 뷰 바인딩 (엑셀 형태의 다중 행 렌더링)
                const tbody = document.getElementById('detailed-info-table-body');
                if (tbody) {
                    tbody.innerHTML = '';
                    const isEditable = !this.markerNameInput.readOnly;
                    data.forEach(row => {
                        const tr = document.createElement('tr');
                        tr.setAttribute('data-facility-code', row.facility_code || '');
                        
                        if (isEditable) {
                            tr.innerHTML = `
                                <td><input type="text" class="table-input" data-key="facility_year" value="${row.facility_year || ''}"></td>
                                <td><input type="text" class="table-input" data-key="project_code" value="${row.project_code || ''}"></td>
                                <td><input type="text" class="table-input input-readonly" data-key="facility_code" value="${row.facility_code || ''}" readonly></td>
                                <td><input type="text" class="table-input" data-key="business_type" value="${row.business_type || ''}"></td>
                                <td><input type="text" class="table-input" data-key="final_station_name" value="${row.final_station_name || ''}"></td>
                                <td><input type="text" class="table-input" data-key="eq_type" value="${row.eq_type || ''}"></td>
                                <td><input type="text" class="table-input" data-key="install_date" value="${this.formatToShortDate(row.install_date)}"></td>
                                <td><input type="text" class="table-input" data-key="open_date" value="${this.formatToShortDate(row.open_date)}"></td>
                            `;
                        } else {
                            tr.innerHTML = `
                                <td>${row.facility_year || ''}</td>
                                <td>${row.project_code || ''}</td>
                                <td>${row.facility_code || ''}</td>
                                <td>${row.business_type || ''}</td>
                                <td>${row.final_station_name || ''}</td>
                                <td>${row.eq_type || ''}</td>
                                <td>${this.formatToShortDate(row.install_date)}</td>
                                <td>${this.formatToShortDate(row.open_date)}</td>
                            `;
                        }
                        tbody.appendChild(tr);
                    });
                }
                
                // 2. 폼 입력 필드 바인딩 (수정은 facilityCode가 일치하는 행 또는 첫 번째 행 타겟)
                const activeRow = data.find(row => row.facility_code === facilityCode) || data[0];
                if (activeRow) {
                    if (this.markerFacilityCodeInput) this.markerFacilityCodeInput.value = activeRow.facility_code || '';
                    if (this.markerProjectCodeInput) this.markerProjectCodeInput.value = activeRow.project_code || '';
                    if (this.markerFacilityYearInput) this.markerFacilityYearInput.value = activeRow.facility_year || '';
                    if (this.markerBusinessTypeInput) this.markerBusinessTypeInput.value = activeRow.business_type || '';
                    if (this.markerFinalStationNameInput) this.markerFinalStationNameInput.value = activeRow.final_station_name || '';
                    if (this.markerEqClassInput) this.markerEqClassInput.value = activeRow.eq_class || '';
                    if (this.markerEqTypeInput) this.markerEqTypeInput.value = activeRow.eq_type || '';
                    if (this.markerInstallDateInput) this.markerInstallDateInput.value = this.formatToShortDate(activeRow.install_date);
                    if (this.markerOpenDateInput) this.markerOpenDateInput.value = this.formatToShortDate(activeRow.open_date);
                }
            }
        } catch (e) {
            console.error("연관 상세 정보 조회 실패:", e);
        }
    },

    async saveMarkerTagsOnly() {
        if (!this.currentUser) {
            this.showToast('관리자 권한이 없습니다. 로그인 후 사용해주세요.');
            return;
        }

        if (!this.currentEditingId) return;

        const tagsRaw = this.markerTagsInput.value.trim();
        const tags = tagsRaw
            ? tagsRaw.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
            : [];

        const index = this.markersData.findIndex(m => m.id === this.currentEditingId);
        if (index === -1) return;

        const marker = this.markersData[index];
        const updatedItem = { ...marker, tags };

        if (this.supabase && !marker.isPending && !marker.isTemp) {
            const table = this.currentMode === 'equipment' ? 'markers' : 'battery_markers';
            const { error } = await this.supabase
                .from(table)
                .update({ tags })
                .eq('id', this.currentEditingId);

            if (error) {
                this.showToast('태그 저장 실패: ' + error.message, 5000);
                return;
            }
        }

        this.markersData[index] = updatedItem;
        this.syncLocalStorage();
        this.initFilters(false);
        this.renderMarkersOnMap();
        this.renderMarkersList();
        this.showToast('태그가 저장되었습니다.');
        this.closeModal();
    },

    async handleSaveMarker() {
        if (this.isSavingMarker) return;
        this.isSavingMarker = true;
        // 로그인 인증 체크 (임시 등록이 아닐 시 권한 검증)
        const isEditing = !!this.currentEditingId;
        let requiresAuth = false;
        
        if (isEditing) {
            const index = this.markersData.findIndex(m => m.id === this.currentEditingId);
            if (index !== -1) {
                const markerItem = this.markersData[index];
                if (!markerItem.isTemp && !markerItem.isPending) {
                    requiresAuth = true;
                }
            }
        } else {
            const isTemp = this.markerIsTemp && this.markerIsTemp.checked;
            if (!isTemp) {
                requiresAuth = true;
            }
        }

        if (requiresAuth && !this.currentUser) {
            this.showToast('관리자 권한이 없습니다. 로그인 후 DB 저장이 가능합니다.');
            if (this.saveMarkerBtn) {
                this.saveMarkerBtn.disabled = false;
                this.saveMarkerBtn.textContent = '저장';
            }
            this.isSavingMarker = false;
            return;
        }


        if (this.saveMarkerBtn) {
            this.saveMarkerBtn.disabled = true;
            this.saveMarkerBtn.textContent = '저장 중...';
        }

        try {
            if (this.isDetailViewMode) {
                await this.saveMarkerTagsOnly();
                return;
            }

            const name = this.markerNameInput.value.trim();
            const lat = parseFloat(this.markerLatInput.value);
            const lng = parseFloat(this.markerLngInput.value);
            const memo = this.markerMemoInput.value.trim();
            const tagsRaw = this.markerTagsInput.value.trim();
            
            if (!name) {
                this.showToast('장소 이름을 입력해주세요.');
                this.markerNameInput.focus();
                return;
            }

            // 태그 파싱
            const tags = tagsRaw 
                ? tagsRaw.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
                : [];

            let equipmentMarkerId = this.currentEditingId;
            if (this.currentMode === 'equipment' && !equipmentMarkerId) {
                equipmentMarkerId = 'marker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }

            // 상세 정보 테이블에서 여러 개의 행 데이터 수집 시도 (장비 모드용)
            const tbody = document.getElementById('detailed-info-table-body');
            const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
            let infoListToUpsert = [];
            
            // 폼 입력창에서 단일 필드 취득 (장비 모드용)
            const facilityCode = this.markerFacilityCodeInput ? this.markerFacilityCodeInput.value.trim() : "";
            const projectCode = this.markerProjectCodeInput ? this.markerProjectCodeInput.value.trim() : "";
            const facilityYear = this.markerFacilityYearInput ? this.markerFacilityYearInput.value.trim() : "";
            const businessType = this.markerBusinessTypeInput ? this.markerBusinessTypeInput.value.trim() : "";
            const finalStationName = this.markerFinalStationNameInput ? this.markerFinalStationNameInput.value.trim() : "";
            const eqClass = this.markerEqClassInput ? this.markerEqClassInput.value.trim() : "";
            const eqType = this.markerEqTypeInput ? this.markerEqTypeInput.value.trim() : "";
            const installDate = this.markerInstallDateInput ? this.markerInstallDateInput.value.trim() : "";
            const openDate = this.markerOpenDateInput ? this.markerOpenDateInput.value.trim() : "";

            const isTableMode = this.detailedInfoTableWrapper && !this.detailedInfoTableWrapper.classList.contains('hidden') && rows.length > 0;

            if (this.currentMode === 'equipment') {
                if (isTableMode) {
                    // 테이블 모드이고 행이 존재하는 경우: 각 행의 input 값 수집
                    rows.forEach(tr => {
                        const inputs = tr.querySelectorAll('.table-input');
                        const rowData = {};
                        inputs.forEach(input => {
                            const key = input.getAttribute('data-key');
                            if (key) {
                                rowData[key] = input.value.trim();
                            }
                        });
                        
                        const fCode = rowData.facility_code || tr.getAttribute('data-facility-code') || "";
                        if (fCode) {
                            infoListToUpsert.push({
                                marker_id: equipmentMarkerId,
                                facility_code: fCode,
                                place_name: name, // 마커 이름으로 장소명 동기화
                                facility_year: rowData.facility_year || "",
                                project_code: rowData.project_code || "",
                                business_type: rowData.business_type || "",
                                eq_class: eqClass || "", // 테이블에 분류 열은 없으므로 기존 값 유지
                                eq_type: rowData.eq_type || "",
                                final_station_name: rowData.final_station_name || "",
                                install_date: DataManager.formatDateToYmd(rowData.install_date || ""),
                                open_date: DataManager.formatDateToYmd(rowData.open_date || "")
                            });
                        }
                    });
                } else {
                    // 폼 모드이거나 테이블 행이 없는 경우: 폼에 작성된 단일 건 수집
                    if (facilityCode) {
                        infoListToUpsert.push({
                            marker_id: equipmentMarkerId,
                            facility_code: facilityCode,
                            place_name: name,
                            facility_year: facilityYear,
                            project_code: projectCode,
                            business_type: businessType,
                            eq_class: eqClass,
                            eq_type: eqType,
                            final_station_name: finalStationName,
                            install_date: DataManager.formatDateToYmd(installDate),
                            open_date: DataManager.formatDateToYmd(openDate)
                        });
                    }
                }

                // 통합시설코드 중복 검증 (단일 폼 모드인 경우에만 체크, 테이블 모드일 때는 PK 수정이 불가하므로 제외)
                const primaryFacilityCode = infoListToUpsert.length > 0 ? infoListToUpsert[0].facility_code : (facilityCode || null);
                if (primaryFacilityCode && !isTableMode) {
                    const isDuplicate = this.markersData.some(m => m.facilityCode === primaryFacilityCode && m.id !== this.currentEditingId);
                    if (isDuplicate) {
                        this.showToast('이미 등록된 통합시설코드입니다. 중복은 허용되지 않습니다.', 5000);
                        if (this.markerFacilityCodeInput) this.markerFacilityCodeInput.focus();
                        return;
                    }
                }
            }

            // 축전지 모드용 상세 정보 테이블/폼 수집
            const batteryTbody = document.getElementById('battery-info-table-body');
            const batteryRows = batteryTbody ? Array.from(batteryTbody.querySelectorAll('tr')) : [];
            let batterySpecsToUpsert = [];

            if (this.currentMode === 'battery') {
                const isBatteryTableMode = this.batteryInfoTableWrapper && !this.batteryInfoTableWrapper.classList.contains('hidden') && batteryRows.length > 0;
                
                if (isBatteryTableMode) {
                    batteryRows.forEach(tr => {
                        const inputs = tr.querySelectorAll('.table-input');
                        const rowData = {};
                        inputs.forEach(input => {
                            const key = input.getAttribute('data-key');
                            if (key) {
                                rowData[key] = input.value.trim();
                            }
                        });
                        
                        const specId = tr.getAttribute('data-id') || null;
                        batterySpecsToUpsert.push({
                            id: specId ? parseInt(specId, 10) : undefined,
                            marker_id: this.currentEditingId || undefined,
                            erp_name: rowData.erp_name || "",
                            capacity: parseInt(rowData.capacity, 10) || 600,
                            quantity: parseInt(rowData.quantity, 10) || 12,
                            station_name: rowData.station_name || name,
                            address: rowData.address || ""
                        });
                    });
                } else {
                    const capVal = parseInt(this.markerCapacityInput.value, 10) || 600;
                    const qtyVal = parseInt(this.markerQuantityInput.value, 10) || 12;
                    const stationVal = this.markerStationInput.value.trim() || name;
                    
                    batterySpecsToUpsert.push({
                        capacity: capVal,
                        quantity: qtyVal,
                        station_name: stationVal,
                        erp_name: memo || "",
                        address: ""
                    });
                }
            }
                
            if (this.currentEditingId) {
                // 수정 모드
                const index = this.markersData.findIndex(m => m.id === this.currentEditingId);
                if (index !== -1) {
                    const isTempMarker = this.markersData[index].isTemp;
                    
                    if (this.currentMode === 'equipment') {
                        const repInfo = infoListToUpsert[0] || {};
                        const teamSave = this.buildSaveTeamFields(isTempMarker);
                        const updatedItem = {
                            ...this.markersData[index],
                            name,
                            memo,
                            tags,
                            facilityTeam: teamSave.facilityTeam,
                            color: teamSave.color,
                            facilityCode: repInfo.facility_code || facilityCode || "",
                            projectCode: repInfo.project_code || projectCode || "",
                            facilityYear: repInfo.facility_year || facilityYear || "",
                            businessType: repInfo.business_type || businessType || "",
                            finalStationName: repInfo.final_station_name || finalStationName || "",
                            eqClass: repInfo.eq_class || eqClass || "",
                            eqType: repInfo.eq_type || eqType || "",
                            installDate: repInfo.install_date || installDate || "",
                            openDate: repInfo.open_date || openDate || ""
                        };

                        // 주소 정보가 유실된 구데이터인 경우 실시간 1회 조회
                        if (!updatedItem.roadAddress && !updatedItem.jibunAddress) {
                            const addrObj = await this.resolveAddressPromise(updatedItem.lat, updatedItem.lng);
                            updatedItem.roadAddress = addrObj.roadAddress;
                            updatedItem.jibunAddress = addrObj.jibunAddress;
                        }

                        // 대기 마커(isPending = true) 및 임시 마커(isTemp = true)가 아닐 때만 Supabase 데이터 업데이트를 진행함
                        if (this.supabase && !updatedItem.isPending && !updatedItem.isTemp) {
                            try {
                                // 1. markers 테이블 업데이트
                                const { error } = await this.supabase
                                    .from('markers')
                                    .update({
                                        name: updatedItem.name,
                                        memo: updatedItem.memo,
                                        tags: updatedItem.tags,
                                        color: updatedItem.color || DEFAULT_MARKER_COLOR,
                                        facility_team: updatedItem.facilityTeam || '',
                                        facility_code: updatedItem.facilityCode || null,
                                        road_address: updatedItem.roadAddress || "",
                                        jibun_address: updatedItem.jibunAddress || ""
                                    })
                                    .eq('id', this.currentEditingId);
                                
                                if (error) throw error;

                                // 2. information 테이블 upsert (통합시설코드가 있는 모든 행)
                                if (infoListToUpsert.length > 0) {
                                    const { error: infoErr } = await this.supabase
                                        .from('information')
                                        .upsert(infoListToUpsert, { onConflict: 'facility_code' });
                                    if (infoErr) throw infoErr;
                                }
                            } catch (e) {
                                this.showToast('Supabase 데이터 수정 실패: ' + e.message, 5000);
                                return;
                            }
                        }

                        // 수정 시 기존 정보 중 위도, 경도 좌표는 변경 없이 보존
                        this.markersData[index] = updatedItem;
                        this.showToast(isTempMarker ? '임시 마커 정보가 수정되었습니다.' : '마커 정보가 수정되었습니다.');
                    } else {
                        // 축전지 모드 마커 수정
                        const teamSave = this.buildSaveTeamFields(isTempMarker);
                        const updatedItem = {
                            ...this.markersData[index],
                            name,
                            memo,
                            tags,
                            facilityTeam: teamSave.facilityTeam,
                            color: teamSave.color,
                            items: batterySpecsToUpsert.map(s => ({
                                id: s.id,
                                erpName: s.erp_name,
                                address: s.address,
                                capacity: s.capacity,
                                quantity: s.quantity,
                                stationName: s.station_name,
                                createdAt: s.createdAt || new Date().toISOString().split('T')[0]
                            })),
                            capacity: batterySpecsToUpsert[0] ? batterySpecsToUpsert[0].capacity : 600,
                            quantity: batterySpecsToUpsert[0] ? batterySpecsToUpsert[0].quantity : 12,
                            stationName: batterySpecsToUpsert[0] ? batterySpecsToUpsert[0].station_name : name
                        };

                        if (!updatedItem.address) {
                            const addrObj = await this.resolveAddressPromise(updatedItem.lat, updatedItem.lng);
                            updatedItem.address = addrObj.jibunAddress || addrObj.roadAddress || "";
                        }

                        if (this.supabase && !updatedItem.isPending && !updatedItem.isTemp) {
                            try {
                                // 1. battery_markers 업데이트
                                const { error: markerErr } = await this.supabase
                                    .from('battery_markers')
                                    .update({
                                        name: updatedItem.name,
                                        memo: updatedItem.memo,
                                        tags: updatedItem.tags,
                                        color: updatedItem.color || DEFAULT_MARKER_COLOR,
                                        facility_team: updatedItem.facilityTeam || '',
                                        address: updatedItem.address || ""
                                    })
                                    .eq('id', this.currentEditingId);
                                
                                if (markerErr) throw markerErr;

                                // 2. battery_specs 1:N 갱신 (지우고 다시 추가)
                                const { error: deleteErr } = await this.supabase
                                    .from('battery_specs')
                                    .delete()
                                    .eq('marker_id', this.currentEditingId);
                                if (deleteErr) throw deleteErr;

                                const specsToInsert = batterySpecsToUpsert.map(s => ({
                                    marker_id: this.currentEditingId,
                                    erp_name: s.erp_name,
                                    capacity: s.capacity,
                                    quantity: s.quantity,
                                    station_name: s.station_name
                                }));
                                const { error: specErr } = await this.supabase
                                    .from('battery_specs')
                                    .insert(specsToInsert);
                                if (specErr) throw specErr;
                            } catch (e) {
                                this.showToast('Supabase 데이터 수정 실패: ' + e.message, 5000);
                                return;
                            }
                        }

                        this.markersData[index] = updatedItem;
                        this.showToast(isTempMarker ? '임시 축전지 정보가 수정되었습니다.' : '축전지 정보가 수정되었습니다.');
                    }
                }
            } else {
                // 신규 추가 모드
                const isTemp = this.markerIsTemp && this.markerIsTemp.checked;
                
                if (this.currentMode === 'equipment') {
                    const repInfo = infoListToUpsert[0] || {};
                    // 신규 추가 시 역지오코딩 조회 실행
                    const addrObj = await this.resolveAddressPromise(lat, lng);
                    const teamSave = this.buildSaveTeamFields(isTemp);
                    
                    const newMarker = {
                        id: equipmentMarkerId,
                        name,
                        lat, // 정밀한 Float 값 보존
                        lng, // 정밀한 Float 값 보존
                        memo,
                        tags,
                        facilityTeam: teamSave.facilityTeam,
                        color: teamSave.color,
                        roadAddress: addrObj.roadAddress || "",
                        jibunAddress: addrObj.jibunAddress || "",
                        facilityCode: repInfo.facility_code || facilityCode || "",
                        projectCode: repInfo.project_code || projectCode || "",
                        facilityYear: repInfo.facility_year || facilityYear || "",
                        businessType: repInfo.business_type || businessType || "",
                        finalStationName: repInfo.final_station_name || finalStationName || "",
                        eqClass: repInfo.eq_class || eqClass || "",
                        eqType: repInfo.eq_type || eqType || "",
                        installDate: repInfo.install_date || installDate || "",
                        openDate: repInfo.open_date || openDate || "",
                        createdAt: new Date().toISOString().split('T')[0]
                    };

                    if (isTemp) {
                        newMarker.isTemp = true;
                    }

                    if (this.supabase && !isTemp) {
                        try {
                            // 1. markers 테이블 insert
                            const { error } = await this.supabase
                                .from('markers')
                                .insert({
                                    id: newMarker.id,
                                    name: newMarker.name,
                                    lat: newMarker.lat,
                                    lng: newMarker.lng,
                                    memo: newMarker.memo,
                                    tags: newMarker.tags,
                                    color: newMarker.color || DEFAULT_MARKER_COLOR,
                                    facility_team: newMarker.facilityTeam || '',
                                    facility_code: newMarker.facilityCode || null,
                                    road_address: newMarker.roadAddress || "",
                                    jibun_address: newMarker.jibunAddress || "",
                                    created_at: new Date().toISOString()
                                });
                            
                            if (error) throw error;

                            // 2. information 테이블 upsert (통합시설코드가 있는 모든 행)
                            if (infoListToUpsert.length > 0) {
                                const { error: infoErr } = await this.supabase
                                    .from('information')
                                    .upsert(infoListToUpsert, { onConflict: 'facility_code' });
                                if (infoErr) throw infoErr;
                            }
                        } catch (e) {
                            this.showToast('Supabase 데이터 추가 실패: ' + e.message, 5000);
                            return;
                        }
                    }

                    this.markersData.push(newMarker);
                    this.showToast(isTemp ? '임시 마커가 성공적으로 등록되었습니다.' : '새 마커가 성공적으로 등록되었습니다.');
                } else {
                    // 축전지 모드 신규 추가
                    const addrObj = await this.resolveAddressPromise(lat, lng);
                    const finalAddr = addrObj.jibunAddress || addrObj.roadAddress || "";
                    const teamSave = this.buildSaveTeamFields(isTemp);

                    const newMarker = {
                        id: 'marker_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        name,
                        lat,
                        lng,
                        memo,
                        tags,
                        facilityTeam: teamSave.facilityTeam,
                        color: teamSave.color,
                        address: finalAddr,
                        items: batterySpecsToUpsert.map(s => ({
                            erpName: s.erp_name,
                            address: s.address || finalAddr,
                            capacity: s.capacity,
                            quantity: s.quantity,
                            stationName: s.station_name,
                            createdAt: new Date().toISOString().split('T')[0]
                        })),
                        capacity: batterySpecsToUpsert[0] ? batterySpecsToUpsert[0].capacity : 600,
                        quantity: batterySpecsToUpsert[0] ? batterySpecsToUpsert[0].quantity : 12,
                        stationName: batterySpecsToUpsert[0] ? batterySpecsToUpsert[0].station_name : name,
                        createdAt: new Date().toISOString().split('T')[0]
                    };

                    if (isTemp) {
                        newMarker.isTemp = true;
                    }

                    if (this.supabase && !isTemp) {
                        try {
                            // 1. battery_markers 추가
                            const { error: markerErr } = await this.supabase
                                .from('battery_markers')
                                .insert({
                                    id: newMarker.id,
                                    name: newMarker.name,
                                    lat: newMarker.lat,
                                    lng: newMarker.lng,
                                    address: newMarker.address || "",
                                    memo: newMarker.memo || "",
                                    tags: newMarker.tags || [],
                                    color: newMarker.color || DEFAULT_MARKER_COLOR,
                                    facility_team: newMarker.facilityTeam || '',
                                    created_at: new Date().toISOString()
                                });
                            if (markerErr) throw markerErr;

                            // 2. battery_specs 추가
                            const specsToInsert = batterySpecsToUpsert.map(s => ({
                                marker_id: newMarker.id,
                                erp_name: s.erp_name,
                                capacity: s.capacity,
                                quantity: s.quantity,
                                station_name: s.station_name,
                                created_at: new Date().toISOString()
                            }));
                            const { error: specErr } = await this.supabase
                                .from('battery_specs')
                                .insert(specsToInsert);
                            if (specErr) throw specErr;
                        } catch (e) {
                            this.showToast('Supabase 데이터 추가 실패: ' + e.message, 5000);
                            return;
                        }
                    }

                    this.markersData.push(newMarker);
                    this.showToast(isTemp ? '임시 축전지 마커가 성공적으로 등록되었습니다.' : '새 축전지 마커가 성공적으로 등록되었습니다.');
                }
            }
            
            // 로컬 저장소 동기화
            this.syncLocalStorage();
            
            // 필터 초기화 및 리렌더링
            this.initFilters(false);
            
            // 지도 및 사이드바 목록 리렌더링
            this.renderMarkersOnMap();
            this.renderMarkersList();
            
            this.closeModal();
        } finally {
            this.isSavingMarker = false;
            if (this.saveMarkerBtn) {
                this.saveMarkerBtn.disabled = false;
                this.saveMarkerBtn.textContent = '저장';
            }
        }
    },

    async handleDeleteMarker(id) {
        if (!this.currentUser) {
            this.showToast('관리자 권한이 없습니다. 로그인 후 사용해주세요.');
            return;
        }

        if (this.isDeletingMarker) return;
        if (!confirm('이 마커를 삭제하시겠습니까?')) return;
        
        this.isDeletingMarker = true;
        try {
            const marker = this.markersData.find(m => m.id === id);
            const isTemp = marker ? marker.isTemp : false;

            if (this.supabase && !isTemp) {
                try {
                    const table = this.currentMode === 'equipment' ? 'markers' : 'battery_markers';
                    const { error } = await this.supabase
                        .from(table)
                        .delete()
                        .eq('id', id);
                    
                    if (error) throw error;
                } catch (e) {
                    this.showToast('Supabase 데이터 삭제 실패: ' + e.message, 5000);
                    return;
                }
            }

            // 메모리 데이터에서 삭제
            this.markersData = this.markersData.filter(m => m.id !== id);
            this.syncLocalStorage();
            
            // 지도 객체 해제
            this.removeMarkerFromMap(id);
            
            // 필터 초기화
            this.initFilters(false);
            
            this.renderMarkersList();
            this.closeModal();
            this.showToast(isTemp ? '임시 마커가 삭제되었습니다.' : '마커가 삭제되었습니다.');
        } finally {
            this.isDeletingMarker = false;
        }
    },

    syncLocalStorage() {
        const permanentMarkers = this.markersData.filter(m => !m.isPending && !m.isTemp);
        if (this.currentMode === 'equipment') {
            this.eqMarkersData = [...this.markersData];
            localStorage.setItem('saved_markers', JSON.stringify(permanentMarkers));
        } else {
            this.batteryMarkersData = [...this.markersData];
            localStorage.setItem('saved_battery_markers', JSON.stringify(permanentMarkers));
        }
    },

    async handleMarkerDragEnd(id, newPosition) {
        if (this.currentMovingMarkerId === id) {
            this.moveMarkerTemporarily(id, newPosition);
            return;
        }

        const markerData = this.markersData.find(m => m.id === id);
        if (!markerData) return;

        const newLat = newPosition.getLat();
        const newLng = newPosition.getLng();

        // 1. 메모리 데이터 좌표 갱신 (정밀도 유지)
        markerData.lat = newLat;
        markerData.lng = newLng;

        // 2. 커스텀 오버레이(말풍선) 위치 동기화 이동
        if (this.customOverlays.has(id)) {
            this.customOverlays.get(id).setPosition(newPosition);
        }

        // 3. 대기 상태가 아닌(저장된) 일반 마커인 경우 Supabase 실시간 업데이트 실행
        if (!markerData.isPending) {
            if (this.supabase) {
                try {
                    const table = this.currentMode === 'equipment' ? 'markers' : 'battery_markers';
                    const { error } = await this.supabase
                        .from(table)
                        .update({
                            lat: newLat,
                            lng: newLng
                        })
                        .eq('id', id);

                    if (error) throw error;
                } catch (e) {
                    this.showToast('Supabase 위치 업데이트 실패: ' + e.message, 5000);
                    return;
                }
            }
            // 로컬 스토리지 캐시 갱신
            this.syncLocalStorage();
            this.showToast(`'${markerData.name}' 위치가 수정되었습니다.`);
        } else {
            // 대기 마커인 경우
            const addrObj = await this.resolveAddressPromise(newLat, newLng);
            markerData.roadAddress = addrObj.roadAddress;
            markerData.jibunAddress = addrObj.jibunAddress;

            if (this.excelConfirmTableBody) {
                const tr = this.excelConfirmTableBody.querySelector(`tr[data-id="${id}"]`);
                if (tr) {
                    const latInput = tr.querySelector('input[data-key="lat"]');
                    const lngInput = tr.querySelector('input[data-key="lng"]');
                    const addressTd = tr.querySelector('td:nth-last-child(2)'); // 뒤에서 두번째 td (주소)
                    
                    if (latInput) latInput.value = newLat;
                    if (lngInput) lngInput.value = newLng;
                    if (addressTd) {
                        const showAddr = this.formatJibunAddress(addrObj.jibunAddress) || addrObj.roadAddress || '주소 없음';
                        addressTd.textContent = showAddr;
                        addressTd.setAttribute('title', showAddr);
                    }
                }
            }
            this.showToast(`대기 마커 '${markerData.name}'의 위치를 수정했습니다. (전송 시 반영)`);
        }
        
        if (this.clusterer && this.currentMode === 'equipment') {
            this.clusterer.redraw();
        }
    },

    async saveMarkerPosition(id) {
        if (!this.currentUser) {
            this.showToast('관리자 권한이 없습니다. 로그인 후 사용해주세요.');
            return;
        }

        if (this.isSavingPosition) return;
        this.isSavingPosition = true;

        try {
            // 리스너 해제
            if (this.mapClickMoveListener) {
                kakao.maps.event.removeListener(this.map, 'click', this.mapClickMoveListener);
                this.mapClickMoveListener = null;
            }

            // 지도 드래그 이동 원복
            if (this.map) {
                this.map.setDraggable(true);
            }

            const markerData = this.markersData.find(m => m.id === id);
            if (markerData) {
                const lat = markerData.lat;
                const lng = markerData.lng;
                
                // 바뀐 좌표에 맞게 도로명/지번 주소 실시간 1회 변환
                const addrObj = await this.resolveAddressPromise(lat, lng);
                if (this.currentMode === 'equipment') {
                    markerData.roadAddress = addrObj.roadAddress;
                    markerData.jibunAddress = addrObj.jibunAddress;
                } else {
                    markerData.address = addrObj.jibunAddress || addrObj.roadAddress || "";
                }

                if (!markerData.isPending && !markerData.isTemp && this.supabase) {
                    try {
                        const table = this.currentMode === 'equipment' ? 'markers' : 'battery_markers';
                        const updateObj = this.currentMode === 'equipment' ? {
                            lat, 
                            lng,
                            road_address: addrObj.roadAddress || "",
                            jibun_address: addrObj.jibunAddress || ""
                        } : {
                            lat,
                            lng,
                            address: addrObj.jibunAddress || addrObj.roadAddress || ""
                        };
                        
                        const { error } = await this.supabase
                            .from(table)
                            .update(updateObj)
                            .eq('id', id);

                        if (error) throw error;
                    } catch (e) {
                        this.showToast('Supabase 위치 저장 실패: ' + e.message, 5000);
                        // 에러 시 롤백
                        this.cancelMarkerPositionChange(id);
                        return;
                    }
                }

                this.syncLocalStorage();
                this.showToast(markerData.isTemp ? `'${markerData.name}' 임시 위치가 변경되었습니다.` : `'${markerData.name}' 위치가 성공적으로 저장되었습니다.`);
            }

            this.currentMovingMarkerId = null;
            this.originalMarkerPosition = null;

            // UI 모드 해제를 위한 리렌더링
            this.renderMarkersOnMap();

            // 오버레이 복원 노출
            if (this.customOverlays.has(id)) {
                this.customOverlays.get(id).setMap(this.map);
            }
        } finally {
            this.isSavingPosition = false;
        }
    },

    async saveMarkerFacilityTeam(markerId, teamId, selectEl = null) {
        if (!this.currentUser) {
            this.showToast('관리자 권한이 없습니다. 로그인 후 사용해주세요.');
            return;
        }

        if (this.currentMode !== 'battery') return;
        if (this.isSavingFacilityTeam) return;

        const markerData = this.markersData.find(m => m.id === markerId);
        if (!markerData) return;

        const previousTeam = markerData.facilityTeam || '';
        const facilityTeam = teamId || '';
        if (previousTeam === facilityTeam) return;

        this.isSavingFacilityTeam = true;
        if (selectEl) {
            selectEl.disabled = true;
        }

        const isTemp = markerData.isTemp;
        const color = isTemp ? '#ef4444' : getFacilityTeamColor(facilityTeam);

        markerData.facilityTeam = facilityTeam;
        markerData.color = color;

        try {
            if (this.supabase && !markerData.isPending && !isTemp) {
                const table = this.currentMode === 'equipment' ? 'markers' : 'battery_markers';
                const { error } = await this.supabase
                    .from(table)
                    .update({
                        facility_team: facilityTeam,
                        color
                    })
                    .eq('id', markerId);

                if (error) throw error;
            }

            this.syncLocalStorage();
            this.initFilters(false);

            const mapMarker = this.mapMarkers.get(markerId);
            if (mapMarker && !markerData.isPending && !isTemp) {
                const markerSvgUri = getMarkerImageUri(markerData, 'battery');
                const markerImage = new kakao.maps.MarkerImage(
                    markerSvgUri,
                    new kakao.maps.Size(30, 45),
                    { offset: new kakao.maps.Point(15, 45) }
                );
                mapMarker.setImage(markerImage);
            }

            this.renderMarkersList();

            const message = facilityTeam
                ? `${getFacilityTeamDisplayName(facilityTeam)}으로 저장되었습니다.`
                : '시설팀이 미지정으로 저장되었습니다.';
            this.showToast(message);
        } catch (e) {
            markerData.facilityTeam = previousTeam;
            markerData.color = isTemp ? '#ef4444' : getFacilityTeamColor(previousTeam);
            if (selectEl) {
                selectEl.value = previousTeam;
            }
            this.showToast('시설팀 저장 실패: ' + e.message, 5000);
        } finally {
            this.isSavingFacilityTeam = false;
            if (selectEl) {
                selectEl.disabled = false;
            }
        }
    },

    async handleUploadSinglePending(id, isTemp = false) {
        if (!isTemp && !this.currentUser) {
            this.showToast('관리자 권한이 없습니다. 로그인 후 사용해주세요.');
            return;
        }

        if (this.isUploadingSingle) return;
        this.isUploadingSingle = true;

        const tr = this.markersList ? this.markersList.querySelector(`.marker-item[data-id="${id}"]`) : null;
        const sendBtn = tr ? tr.querySelector('.btn-send-single') : null;
        const tempBtn = tr ? tr.querySelector('.btn-send-temp-single') : null;
        
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = '등록 중...';
        }
        if (tempBtn) {
            tempBtn.disabled = true;
            tempBtn.textContent = '등록 중...';
        }

        try {
            const marker = this.markersData.find(m => m.id === id);
            if (!marker) return;

            // 전송 전 주소 누락 여부 최종 1회 검증/획득
            if (this.currentMode === 'equipment') {
                if (!marker.roadAddress && !marker.jibunAddress) {
                    const addrObj = await this.resolveAddressPromise(marker.lat, marker.lng);
                    marker.roadAddress = addrObj.roadAddress;
                    marker.jibunAddress = addrObj.jibunAddress;
                }
            } else {
                if (!marker.address) {
                    const addrObj = await this.resolveAddressPromise(marker.lat, marker.lng);
                    marker.address = addrObj.jibunAddress || addrObj.roadAddress || "";
                }
            }

            if (isTemp) {
                // 임시 등록의 경우 Supabase를 우회하고 color와 isTemp 플래그 세팅
                marker.isPending = false;
                marker.isTemp = true;
                marker.color = '#ef4444';
            } else {
                if (this.supabase) {
                    this.showToast('Supabase 전송 중...');
                    
                    if (this.currentMode === 'equipment') {
                        // 1. markers 테이블 insert
                        const { error: markerErr } = await this.supabase
                            .from('markers')
                            .insert({
                                id: marker.id,
                                name: marker.name,
                                lat: marker.lat,
                                lng: marker.lng,
                                memo: marker.memo || "",
                                tags: marker.tags || [],
                                color: getEffectiveMarkerColor(marker, this.currentMode),
                                facility_team: marker.facilityTeam || '',
                                facility_code: marker.facilityCode || null,
                                road_address: marker.roadAddress || "",
                                jibun_address: marker.jibunAddress || "",
                                created_at: new Date().toISOString()
                            });
                        
                        if (markerErr) throw markerErr;

                        // 2. information 테이블 upsert (통합시설코드가 있는 경우)
                        if (marker.facilityCode) {
                            const { error: infoErr } = await this.supabase
                                .from('information')
                                .upsert({
                                    marker_id: marker.id,
                                    facility_code: marker.facilityCode,
                                    place_name: marker.name,
                                    facility_year: marker.facilityYear || "",
                                    project_code: marker.projectCode || "",
                                    business_type: marker.businessType || "",
                                    final_station_name: marker.finalStationName || "",
                                    eq_class: marker.eqClass || "",
                                    eq_type: marker.eqType || "",
                                    install_date: DataManager.formatDateToYmd(marker.installDate || ""),
                                    open_date: DataManager.formatDateToYmd(marker.openDate || "")
                                });
                            if (infoErr) throw infoErr;
                        }
                    } else {
                        // 축전지 모드 핀 및 스펙 DB 등록
                        const { error: markerErr } = await this.supabase
                            .from('battery_markers')
                            .insert({
                                id: marker.id,
                                name: marker.name,
                                lat: marker.lat,
                                lng: marker.lng,
                                address: marker.address || "",
                                memo: marker.memo || "",
                                tags: marker.tags || [],
                                color: getEffectiveMarkerColor(marker, this.currentMode),
                                facility_team: marker.facilityTeam || '',
                                created_at: new Date().toISOString()
                            });
                        if (markerErr) throw markerErr;

                        const specs = marker.items && marker.items.length > 0 ? marker.items : [{
                            erpName: marker.memo || "",
                            capacity: marker.capacity || 600,
                            quantity: marker.quantity || 12,
                            stationName: marker.stationName || marker.name || "",
                            address: marker.address || ""
                        }];

                        const specsToInsert = specs.map(s => ({
                            marker_id: marker.id,
                            erp_name: s.erpName || marker.memo || "",
                            capacity: s.capacity || 600,
                            quantity: s.quantity || 12,
                            station_name: s.stationName || marker.name || "",
                            created_at: new Date().toISOString()
                        }));

                        const { error: specErr } = await this.supabase
                            .from('battery_specs')
                            .insert(specsToInsert);
                        if (specErr) throw specErr;
                    }
                }
                marker.isPending = false;
            }

            // 로컬스토리지 저장 (syncLocalStorage에서 isTemp 필터링)
            this.syncLocalStorage();
            
            // UI 갱신
            this.updatePendingUI();
            this.initFilters(false);
            this.renderMarkersOnMap();
            this.renderMarkersList();
            this.showToast(isTemp ? '임시 마커가 성공적으로 등록되었습니다.' : '선택한 위치가 Supabase에 저장되었습니다.');
        } catch (e) {
            this.showToast((isTemp ? '임시 등록' : 'Supabase 전송') + ' 실패: ' + e.message, 5000);
        } finally {
            this.isUploadingSingle = false;
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.textContent = '등록';
            }
            if (tempBtn) {
                tempBtn.disabled = false;
                tempBtn.textContent = '임시';
            }
        }
    },

    async handleUploadPending(isTemp = false) {
        if (!isTemp && !this.currentUser) {
            this.showToast('관리자 권한이 없습니다. 로그인 후 사용해주세요.');
            return;
        }

        if (this.isUploadingPending) return;
        this.isUploadingPending = true;

        if (this.uploadPendingBtn) {
            this.uploadPendingBtn.disabled = true;
            this.uploadPendingBtn.textContent = '전송 중...';
        }
        if (this.sendExcelConfirmBtn) {
            this.sendExcelConfirmBtn.disabled = true;
            this.sendExcelConfirmBtn.textContent = '전송 중...';
        }
        if (this.sendExcelTempBtn) {
            this.sendExcelTempBtn.disabled = true;
            this.sendExcelTempBtn.textContent = '등록 중...';
        }

        try {
            // 모달창이 열려 있는 상태라면 모달 테이블 내 input 값들을 markersData에 강제 동기화
            if (this.excelConfirmModal && !this.excelConfirmModal.classList.contains('hidden') && this.excelConfirmTableBody) {
                const rows = this.excelConfirmTableBody.querySelectorAll('tr');
                for (const tr of rows) {
                    const id = tr.getAttribute('data-id');
                    const nameInput = tr.querySelector('input[data-key="name"]');
                    const latInput = tr.querySelector('input[data-key="lat"]');
                    const lngInput = tr.querySelector('input[data-key="lng"]');
                    
                    const marker = this.markersData.find(m => m.id === id);
                    if (marker) {
                        if (nameInput) marker.name = nameInput.value.trim();
                        if (latInput && lngInput) {
                            const newLat = parseFloat(latInput.value);
                            const newLng = parseFloat(lngInput.value);
                            if (!isNaN(newLat) && !isNaN(newLng)) {
                                if (marker.lat !== newLat || marker.lng !== newLng) {
                                    marker.lat = newLat;
                                    marker.lng = newLng;
                                    // 좌표 변경 시 주소 재조회
                                    const addrObj = await this.resolveAddressPromise(newLat, newLng);
                                    marker.roadAddress = addrObj.roadAddress;
                                    marker.jibunAddress = addrObj.jibunAddress;
                                }
                            }
                        }
                    }
                }
            }

            const pendingMarkers = this.markersData.filter(m => m.isPending);
            if (pendingMarkers.length === 0) return;

            // 주소가 누락된 대기 마커가 있다면 백그라운드 지오코딩으로 채워줌
            for (let m of pendingMarkers) {
                if (!m.roadAddress && !m.jibunAddress) {
                    const addrObj = await this.resolveAddressPromise(m.lat, m.lng);
                    m.roadAddress = addrObj.roadAddress;
                    m.jibunAddress = addrObj.jibunAddress;
                    await new Promise(r => setTimeout(r, 50)); // API 과부하 딜레이
                }
            }

            if (isTemp) {
                // 임시 등록인 경우 Supabase를 우회하고 color와 isTemp 플래그 세팅
                pendingMarkers.forEach(m => {
                    m.isPending = false;
                    m.isTemp = true;
                    m.color = '#ef4444';
                });
            } else {
                if (this.supabase) {
                    this.showToast('Supabase로 전체 전송 중...');
                    
                    // 1. markers 벌크 데이터 생성
                    const bulkMarkers = pendingMarkers.map(m => ({
                        id: m.id,
                        name: m.name,
                        lat: m.lat,
                        lng: m.lng,
                        memo: m.memo || "",
                        tags: m.tags || [],
                        color: getEffectiveMarkerColor(m, 'equipment'),
                        facility_team: '',
                        facility_code: m.facilityCode || null,
                        road_address: m.roadAddress || "",
                        jibun_address: m.jibunAddress || "",
                        created_at: new Date().toISOString()
                    }));

                    const { error: markerErr } = await this.supabase
                        .from('markers')
                        .insert(bulkMarkers);
                    
                    if (markerErr) throw markerErr;

                    // 2. information 벌크 upsert 처리
                    const bulkInfo = pendingMarkers
                        .filter(m => m.facilityCode)
                        .map(m => ({
                            marker_id: m.id,
                            facility_code: m.facilityCode,
                            place_name: m.name,
                            facility_year: m.facilityYear || "",
                            project_code: m.projectCode || "",
                            business_type: m.businessType || "",
                            final_station_name: m.finalStationName || "",
                            eq_class: m.eqClass || "",
                            eq_type: m.eqType || "",
                            install_date: DataManager.formatDateToYmd(m.installDate || ""),
                            open_date: DataManager.formatDateToYmd(m.openDate || "")
                        }));

                    if (bulkInfo.length > 0) {
                        const { error: infoErr } = await this.supabase
                            .from('information')
                            .upsert(bulkInfo);
                        if (infoErr) throw infoErr;
                    }
                }
                pendingMarkers.forEach(m => m.isPending = false);
            }

            // 로컬스토리지 저장 (syncLocalStorage에서 isTemp 필터링)
            this.syncLocalStorage();

            // UI 갱신
            this.updatePendingUI();
            this.initFilters(false);
            this.renderMarkersOnMap();
            this.renderMarkersList();
            this.closeExcelConfirmModal();
            this.showToast(isTemp
                ? `대기 마커 ${pendingMarkers.length}개가 임시 마커(빨간색)로 등록되었습니다.`
                : `성공적으로 ${pendingMarkers.length}개의 위치를 Supabase에 저장했습니다.`);
        } catch (e) {
            this.showToast('일괄 등록 실패: ' + e.message, 5000);
        } finally {
            this.isUploadingPending = false;
            if (this.uploadPendingBtn) {
                this.uploadPendingBtn.disabled = false;
                this.uploadPendingBtn.textContent = '일괄등록';
            }
            if (this.sendExcelConfirmBtn) {
                this.sendExcelConfirmBtn.disabled = false;
                this.sendExcelConfirmBtn.textContent = '전체 전송';
            }
            if (this.sendExcelTempBtn) {
                this.sendExcelTempBtn.disabled = false;
                this.sendExcelTempBtn.textContent = '임시 등록';
            }
        }
    },

    async handleSendInfoToSupabase() {
        if (!this.currentUser) {
            this.showToast('관리자 권한이 없습니다. 로그인 후 사용해주세요.');
            return;
        }

        if (this.isSendingInfo) return;
        this.isSendingInfo = true;

        if (!this.pendingInfoData || this.pendingInfoData.length === 0) {
            this.showToast('전송할 데이터가 없습니다.');
            this.isSendingInfo = false;
            return;
        }

        if (!this.supabase) {
            this.showToast('Supabase가 연결되지 않았습니다. config.js를 확인하세요.', 5000);
            this.isSendingInfo = false;
            return;
        }

        // 전송 버튼 비활성화 (중복 클릭 방지)
        if (this.sendInfoConfirmBtn) {
            this.sendInfoConfirmBtn.disabled = true;
            this.sendInfoConfirmBtn.textContent = '전송 중...';
        }

        try {
            await this.ensureAuthenticatedForDbWrite();

            let markersList = this.eqMarkersData || [];
            const { data: markersData, error: markersError } = await this.supabase
                .from('markers')
                .select('id, name, facility_code');
            if (markersError) throw markersError;
            if (markersData && markersData.length > 0) {
                markersList = markersData;
            }

            const result = await DataManager.upsertInformationToSupabase(
                this.supabase,
                this.pendingInfoData,
                markersList
            );

            const count = this.pendingInfoData.length;
            this.closeInfoConfirmModal();

            let successMessage = `상세 장비 정보 ${count}건이 Supabase에 성공적으로 전송되었습니다.`;
            if (result.unlinkedCount > 0) {
                successMessage += ` (marker_id 미연결 ${result.unlinkedCount}건)`;
            }
            if (result.warning) {
                successMessage += ` ${result.warning}`;
            }
            this.showToast(successMessage, (result.unlinkedCount > 0 || result.warning) ? 7000 : 5000);
        } catch (e) {
            this.showToast('Supabase 전송 실패: ' + e.message, 7000);
        } finally {
            this.isSendingInfo = false;
            if (this.sendInfoConfirmBtn) {
                this.sendInfoConfirmBtn.disabled = false;
                this.sendInfoConfirmBtn.textContent = '전송';
            }
        }
    },

    async handleDeleteAllBatteryMarkers() {
        if (!this.currentUser) {
            this.showToast('관리자 권한이 없습니다. 로그인 후 사용해주세요.');
            return;
        }

        if (this.currentMode !== 'battery') return;
        if (this.isDeletingAllBatteryMarkers) return;

        const registeredMarkers = this.markersData.filter(m => !m.isPending && !m.isTemp);
        const pendingCount = this.markersData.filter(m => m.isPending || m.isTemp).length;

        let dbCountBefore = 0;
        if (this.supabase) {
            try {
                const { count, error } = await this.supabase
                    .from('battery_markers')
                    .select('id', { count: 'exact', head: true });
                if (error) throw error;
                dbCountBefore = count || 0;
            } catch (e) {
                this.showToast('삭제 전 DB 건수 조회 실패: ' + e.message, 5000);
                return;
            }
        }

        if (registeredMarkers.length === 0 && dbCountBefore === 0) {
            this.showToast('삭제할 등록된 축전지 데이터가 없습니다.');
            return;
        }

        const confirmMessage = [
            `화면 등록 ${registeredMarkers.length}건${this.supabase ? ` · DB ${dbCountBefore}건` : ''}을 모두 삭제합니다.`,
            'Supabase DB(battery_markers·battery_specs)와 로컬 캐시에서 영구 삭제되며 복구할 수 없습니다.',
            pendingCount > 0 ? `(대기/임시 마커 ${pendingCount}건은 유지됩니다.)` : '',
            '',
            '계속하시겠습니까?'
        ].filter(Boolean).join('\n');

        if (!confirm(confirmMessage)) return;

        this.isDeletingAllBatteryMarkers = true;
        this.deleteAllBatteryMarkersBtn.disabled = true;
        this.deleteAllBatteryMarkersBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 삭제 중...';

        const deletedCount = Math.max(registeredMarkers.length, dbCountBefore);

        try {
            if (this.supabase) {
                if (dbCountBefore > 0) {
                    const { error: markerErr } = await this.supabase
                        .from('battery_markers')
                        .delete()
                        .neq('id', '');

                    if (markerErr) throw markerErr;
                }

                const { count: dbCountAfter, error: verifyErr } = await this.supabase
                    .from('battery_markers')
                    .select('id', { count: 'exact', head: true });

                if (verifyErr) throw verifyErr;
                if (dbCountAfter > 0) {
                    throw new Error(`삭제 검증 실패: DB에 ${dbCountAfter}건이 남아 있습니다.`);
                }
            }

            registeredMarkers.forEach(m => this.removeMarkerFromMap(m.id));

            this.markersData = this.markersData.filter(m => m.isPending || m.isTemp);
            this.batteryMarkersData = [...this.markersData];
            this.syncLocalStorage();

            const remainingRegistered = this.markersData.filter(m => !m.isPending && !m.isTemp).length;
            if (remainingRegistered !== 0) {
                throw new Error(`로컬 삭제 검증 실패: 등록 데이터 ${remainingRegistered}건이 남아 있습니다.`);
            }

            this.closeModal();
            this.initFilters(false);
            this.renderMarkersOnMap();
            this.renderMarkersList();
            this.showToast(`등록된 축전지 ${deletedCount}건이 일괄 삭제되었습니다.`);
        } catch (e) {
            console.error('축전지 일괄 삭제 실패:', e);
            this.showToast('축전지 일괄 삭제 실패: ' + e.message, 5000);
        } finally {
            this.isDeletingAllBatteryMarkers = false;
            if (this.deleteAllBatteryMarkersBtn) {
                this.deleteAllBatteryMarkersBtn.disabled = false;
                this.deleteAllBatteryMarkersBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> 등록 데이터 일괄 삭제';
            }
        }
    },

    async handleSaveBatteryExcel(isTemp = false) {
        if (!isTemp && !this.currentUser) {
            this.showToast('관리자 권한이 없습니다. 로그인 후 사용해주세요.');
            return;
        }

        if (this.isSavingBatteryExcel) return;
        this.isSavingBatteryExcel = true;

        if (this.sendBatteryExcelConfirmBtn) {
            this.sendBatteryExcelConfirmBtn.disabled = true;
            this.sendBatteryExcelConfirmBtn.textContent = '전송 중...';
        }
        if (this.sendBatteryExcelTempBtn) {
            this.sendBatteryExcelTempBtn.disabled = true;
            this.sendBatteryExcelTempBtn.textContent = '등록 중...';
        }

        try {
            if (this.batteryExcelConfirmModal && !this.batteryExcelConfirmModal.classList.contains('hidden') && this.batteryExcelConfirmTableBody) {
                const rows = this.batteryExcelConfirmTableBody.querySelectorAll('tr');
                for (const tr of rows) {
                    const id = tr.getAttribute('data-id');
                    const nameInput = tr.querySelector('input[data-key="name"]');
                    const addressInput = tr.querySelector('input[data-key="address"]');
                    const latInput = tr.querySelector('input[data-key="lat"]');
                    const lngInput = tr.querySelector('input[data-key="lng"]');
                    
                    const marker = this.markersData.find(m => m.id === id);
                    if (marker) {
                        if (nameInput) marker.name = nameInput.value.trim();
                        if (addressInput) marker.address = addressInput.value.trim();
                        if (latInput && lngInput) {
                            const newLat = parseFloat(latInput.value);
                            const newLng = parseFloat(lngInput.value);
                            if (!isNaN(newLat) && !isNaN(newLng)) {
                                if (marker.lat !== newLat || marker.lng !== newLng) {
                                    marker.lat = newLat;
                                    marker.lng = newLng;
                                    const addrObj = await this.resolveAddressPromise(newLat, newLng);
                                    marker.address = addrObj.jibunAddress || addrObj.roadAddress || '';
                                }
                            }
                        }
                    }
                }
            }

            const pendingMarkers = this.markersData.filter(m => m.isPending);
            if (pendingMarkers.length === 0) {
                this.isSavingBatteryExcel = false;
                this.closeBatteryExcelConfirmModal();
                return;
            }

            for (let m of pendingMarkers) {
                if (!m.address) {
                    const addrObj = await this.resolveAddressPromise(m.lat, m.lng);
                    m.address = addrObj.jibunAddress || addrObj.roadAddress || "";
                    await new Promise(r => setTimeout(r, 50));
                }
            }

            if (isTemp) {
                pendingMarkers.forEach(m => {
                    m.isPending = false;
                    m.isTemp = true;
                    m.color = '#f43f5e';
                });
            } else {
                if (this.supabase) {
                    this.showToast('Supabase로 축전지 마커 전송 중...');
                    
                    const bulkMarkers = pendingMarkers.map(m => ({
                        id: m.id,
                        name: m.name,
                        lat: m.lat,
                        lng: m.lng,
                        address: m.address || "",
                        memo: m.memo || "",
                        tags: m.tags || [],
                        color: getEffectiveMarkerColor(m, 'battery'),
                        facility_team: m.facilityTeam || '',
                        created_at: new Date().toISOString()
                    }));

                    const { error: markerErr } = await this.supabase
                        .from('battery_markers')
                        .insert(bulkMarkers);
                    
                    if (markerErr) throw markerErr;

                    const bulkSpecs = [];
                    pendingMarkers.forEach(m => {
                        const specs = m.items && m.items.length > 0 ? m.items : [{
                            erpName: m.memo || "",
                            address: m.address || "",
                            capacity: m.capacity || 600,
                            quantity: m.quantity || 12,
                            stationName: m.stationName || m.name
                        }];
                        specs.forEach(s => {
                            bulkSpecs.push({
                                marker_id: m.id,
                                erp_name: s.erpName || m.memo || "",
                                capacity: typeof s.capacity === 'number' ? s.capacity : parseInt(s.capacity, 10) || 600,
                                quantity: typeof s.quantity === 'number' ? s.quantity : parseInt(s.quantity, 10) || 12,
                                station_name: s.stationName || m.name || "",
                                created_at: new Date().toISOString()
                            });
                        });
                    });

                    if (bulkSpecs.length > 0) {
                        const { error: specsErr } = await this.supabase
                            .from('battery_specs')
                            .insert(bulkSpecs);
                        if (specsErr) throw specsErr;
                    }
                }
                pendingMarkers.forEach(m => m.isPending = false);
            }

            this.syncLocalStorage();

            this.updatePendingUI();
            this.initFilters(false);
            this.renderMarkersOnMap();
            this.renderMarkersList();
            this.closeBatteryExcelConfirmModal();
            
            this.showToast(isTemp
                ? `대기 마커 ${pendingMarkers.length}개가 임시 마커로 화면에 등록되었습니다.`
                : `성공적으로 ${pendingMarkers.length}개의 축전지 위치를 Supabase에 저장했습니다.`);
        } catch (e) {
            this.showToast('일괄 등록 실패: ' + e.message, 5000);
        } finally {
            this.isSavingBatteryExcel = false;
            if (this.sendBatteryExcelConfirmBtn) {
                this.sendBatteryExcelConfirmBtn.disabled = false;
                this.sendBatteryExcelConfirmBtn.textContent = 'DB 저장';
            }
            if (this.sendBatteryExcelTempBtn) {
                this.sendBatteryExcelTempBtn.disabled = false;
                this.sendBatteryExcelTempBtn.textContent = '화면 임시 추가';
            }
        }
    },

    async fetchAndBindBatterySpecs(markerId) {
        if (!this.supabase) return;

        const marker = this.markersData.find(m => m.id === markerId);
        const markerAddress = marker?.address || '';

        try {
            const { data, error } = await this.supabase
                .from('battery_specs')
                .select('*')
                .eq('marker_id', markerId);

            if (error) throw error;

            if (data && data.length > 0) {
                const tbody = document.getElementById('battery-info-table-body');
                if (tbody) {
                    tbody.innerHTML = '';
                    const isEditable = !this.markerNameInput.readOnly;
                    
                    data.forEach(row => {
                        const tr = document.createElement('tr');
                        tr.setAttribute('data-id', row.id || '');
                        
                        if (isEditable) {
                            tr.innerHTML = `
                                <td><input type="text" class="table-input" data-key="erp_name" value="${row.erp_name || ''}"></td>
                                <td><input type="text" class="table-input input-readonly" data-key="address" value="${markerAddress}" readonly></td>
                                <td><input type="text" class="table-input" data-key="capacity" value="${row.capacity || ''}"></td>
                                <td><input type="text" class="table-input" data-key="quantity" value="${row.quantity || ''}"></td>
                                <td><input type="text" class="table-input" data-key="station_name" value="${row.station_name || ''}"></td>
                                <td><span style="font-size: 11px; color: var(--text-muted);">${row.created_at ? row.created_at.split('T')[0] : ''}</span></td>
                            `;
                        } else {
                            tr.innerHTML = `
                                <td>${row.erp_name || ''}</td>
                                <td>${markerAddress}</td>
                                <td>${row.capacity || ''} AH</td>
                                <td>${row.quantity || ''} Cell</td>
                                <td>${row.station_name || ''}</td>
                                <td>${row.created_at ? row.created_at.split('T')[0] : ''}</td>
                            `;
                        }
                        tbody.appendChild(tr);
                    });
                }
                
                const activeRow = data[0];
                if (activeRow) {
                    if (this.markerCapacityInput) this.markerCapacityInput.value = activeRow.capacity || '600';
                    if (this.markerQuantityInput) this.markerQuantityInput.value = activeRow.quantity || '12';
                    if (this.markerStationInput) this.markerStationInput.value = activeRow.station_name || '';
                }
            }
        } catch (e) {
            console.error("축전지 스펙 정보 조회 실패:", e);
        }
    }
});

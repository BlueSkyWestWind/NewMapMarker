/**
 * MapMarkerApp Prototype Extension - app-map.js
 */
Object.assign(MapMarkerApp.prototype, {
    initializeMap() {
        const mapContainer = document.getElementById('map');
        const defaultCenter = new kakao.maps.LatLng(35.159542, 126.8526012); // 광주광역시청 기준
        
        const mapOption = {
            center: defaultCenter,
            level: 6, // 지도 확대 레벨
            mapTypeId: kakao.maps.MapTypeId.HYBRID // [스카이뷰 변경] 위성 지도 + 도로명 레이아웃
        };
        
        try {
            this.map = new kakao.maps.Map(mapContainer, mapOption);
            
            // 저장된 지적도 활성화 상태 적용
            if (this.isCadastralMode) {
                this.map.addOverlayMapTypeId(kakao.maps.MapTypeId.USE_DISTRICT);
                if (this.cadastralBtn) {
                    this.cadastralBtn.classList.add('active');
                }
            }

            // 저장된 클러스터러 활성화 상태 적용 및 가시성 연동
            if (this.clusterToggleBtn) {
                if (this.isClusteringEnabled) {
                    this.clusterToggleBtn.classList.add('active');
                } else {
                    this.clusterToggleBtn.classList.remove('active');
                }
                
                if (this.currentMode !== 'equipment') {
                    this.clusterToggleBtn.classList.add('hidden');
                } else {
                    this.clusterToggleBtn.classList.remove('hidden');
                }
            }
            
            this.placesService = new kakao.maps.services.Places();
            
            // 지도 컨트롤 및 입력창 활성화
            this.searchInput.disabled = false;
            this.searchBtn.disabled = false;
            
            // [클릭 등록 비활성화] 지도 클릭 이벤트 리스너 제거
            // 기존: kakao.maps.event.addListener(this.map, 'click', ...)
            
            // 마커 클러스터러 초기화 (위성 지도에서도 시인성이 뛰어나도록 커스텀 스타일 적용)
            this.clusterer = new kakao.maps.MarkerClusterer({
                map: this.map,
                averageCenter: true,
                minLevel: 6,
                disableClickZoom: false,
                styles: [
                    {
                        // 10개 미만: 에메랄드 그린
                        width: '42px', height: '42px',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        borderRadius: '21px',
                        color: '#ffffff',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        lineHeight: '38px',
                        border: '2px solid #ffffff',
                        boxShadow: '0 4px 10px rgba(16, 185, 129, 0.45)'
                    },
                    {
                        // 10개 이상 100개 미만: 인디고 블루
                        width: '52px', height: '52px',
                        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                        borderRadius: '26px',
                        color: '#ffffff',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        lineHeight: '48px',
                        border: '2px solid #ffffff',
                        boxShadow: '0 4px 14px rgba(99, 102, 241, 0.45)'
                    },
                    {
                        // 100개 이상: 로즈 레드
                        width: '62px', height: '62px',
                        background: 'linear-gradient(135deg, #f43f5e, #e11d48)',
                        borderRadius: '31px',
                        color: '#ffffff',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: '15px',
                        lineHeight: '58px',
                        border: '2px solid #ffffff',
                        boxShadow: '0 4px 18px rgba(244, 63, 94, 0.45)'
                    }
                ]
            });
            
            // 기존 저장된 마커 지도 위에 표시
            this.renderMarkersOnMap();
        } catch (e) {
            console.error("지도 생성 중 에러 발생:", e);
            this.showToast('지도 초기화 오류가 발생했습니다. 개발자 도구를 확인해 주세요.', 5000);
        }
    },

    handleMapClick(latLng) {
        // 이미 생성된 임시 마커가 있다면 제거
        this.clearTempMarker();
        
        // 임시 마커 생성 (저장 전 상태 시각화 - 골드 커스텀 SVG 적용)
        const tempMarkerImage = new kakao.maps.MarkerImage(MARKER_SVG_GOLD, new kakao.maps.Size(30, 45), { offset: new kakao.maps.Point(15, 45) });
        this.tempMarker = new kakao.maps.Marker({
            position: latLng,
            image: tempMarkerImage,
            map: this.map
        });
        
        // 등록 모달 열기
        this.openAddMarkerModal(latLng.getLat(), latLng.getLng());
    },

    clearTempMarker() {
        if (this.tempMarker) {
            this.tempMarker.setMap(null);
            this.tempMarker = null;
        }
        if (this.tempOverlay) {
            this.tempOverlay.setMap(null);
            this.tempOverlay = null;
        }
    },

    removeMarkerFromMap(id) {
        if (this.mapMarkers.has(id)) {
            const marker = this.mapMarkers.get(id);
            // 메모리 누수 방지를 위한 마커 이벤트 리스너의 명시적 해제
            if (marker._clickHandler) {
                kakao.maps.event.removeListener(marker, 'click', marker._clickHandler);
            }
            if (marker._dragstartHandler) {
                kakao.maps.event.removeListener(marker, 'dragstart', marker._dragstartHandler);
            }
            if (marker._dragendHandler) {
                kakao.maps.event.removeListener(marker, 'dragend', marker._dragendHandler);
            }
            if (this.clusterer && this.currentMode === 'equipment') {
                this.clusterer.removeMarker(marker);
            }
            marker.setMap(null);
            this.mapMarkers.delete(id);
        }
        if (this.customOverlays.has(id)) {
            this.customOverlays.get(id).setMap(null);
            this.customOverlays.delete(id);
        }
    },

    renderMarkersOnMap() {
        if (!this.map) return;
        
        // 기존 마커 전체 클리어 (메모리 누수 방지를 위해 이벤트 리스너 제거 처리 연동)
        this.mapMarkers.forEach((marker, id) => {
            if (marker._clickHandler) {
                kakao.maps.event.removeListener(marker, 'click', marker._clickHandler);
            }
            if (marker._dragstartHandler) {
                kakao.maps.event.removeListener(marker, 'dragstart', marker._dragstartHandler);
            }
            if (marker._dragendHandler) {
                kakao.maps.event.removeListener(marker, 'dragend', marker._dragendHandler);
            }
            marker.setMap(null);
        });
        this.mapMarkers.clear();
        this.customOverlays.forEach((overlay, id) => overlay.setMap(null));
        this.customOverlays.clear();
        
        if (this.clusterer) {
            this.clusterer.clear();
        }
        
        const markersToCluster = [];
        
        // 현재 데이터셋 순회하며 마커 생성
        this.markersData.forEach(data => {
            // 필터링 적용 (대기 마커 및 임시 마커가 아닌 경우에만 연도 & 사업구분 & 색상 & 태그 필터 검사)
            if (!data.isPending && !data.isTemp) {
                const color = getEffectiveMarkerColor(data, this.currentMode).toLowerCase().trim();
                if (!this.selectedColors.has(color)) {
                    return;
                }

                if (this.currentMode === 'equipment') {
                    let hasMatchingTag = false;
                    if (data.tags && data.tags.length > 0) {
                        hasMatchingTag = data.tags.some(tag => this.selectedTags.has(tag.toString().trim()));
                    } else {
                        hasMatchingTag = this.selectedTags.has("미지정");
                    }
                    if (!hasMatchingTag) {
                        return;
                    }

                    const year = data.facilityYear ? data.facilityYear.toString().trim() : "미지정";
                    const business = data.businessType ? data.businessType.toString().trim() : "미지정";
                    if (!this.selectedYears.has(year) || !this.selectedBusinesses.has(business)) {
                        return;
                    }
                } else {
                    let hasMatchingTag = false;
                    if (data.tags && data.tags.length > 0) {
                        hasMatchingTag = data.tags.some(tag => this.selectedTags.has(tag.toString().trim()));
                    } else {
                        hasMatchingTag = this.selectedTags.has("미지정");
                    }
                    if (!hasMatchingTag) {
                        return;
                    }
                }
            }

            const position = new kakao.maps.LatLng(data.lat, data.lng);
            
            // 1. 마커 객체 생성 (대기 상태 마커인 경우 골드, 일반 마커인 경우 저장된 개별 색상의 커스텀 SVG 적용)
            const markerSvgUri = getMarkerImageUri(data, this.currentMode);
            const markerImage = new kakao.maps.MarkerImage(markerSvgUri, new kakao.maps.Size(30, 45), { offset: new kakao.maps.Point(15, 45) });

            const isMovingThis = this.currentMovingMarkerId === data.id;
            const isPendingThis = data.isPending;
            const marker = new kakao.maps.Marker({
                position: position,
                title: data.name,
                image: markerImage,
                draggable: isMovingThis || isPendingThis, // 현재 위치 수정 중인 마커 및 대기 마커 드래그 가능
                zIndex: (isMovingThis || isPendingThis) ? 100 : 3 // 위치 수정 중 또는 대기 중일 때는 높은 zIndex 부여
            });
            
            this.mapMarkers.set(data.id, marker);
            
            if (isMovingThis || isPendingThis || this.currentMode === 'battery' || !this.isClusteringEnabled) {
                marker.setMap(this.map); // 위치 수정/대기 마커, 축전지 모드, 혹은 클러스터링 비활성화 상태에서는 직접 표시
            } else {
                markersToCluster.push(marker);
            }
            
            // 2. 커스텀 오버레이 생성
            const overlayContent = this.createOverlayContent(data);
            const overlay = new kakao.maps.CustomOverlay({
                content: overlayContent,
                position: position,
                xAnchor: 0.5,
                yAnchor: 1.0,
                zIndex: 4
            });
            
            this.customOverlays.set(data.id, overlay);
            
            // 마커 클릭 시 커스텀 오버레이 토글 (이벤트 핸들러 메모리 참조 보관)
            const clickHandler = () => {
                this.closeAllOverlays();
                overlay.setMap(this.map);
                this.map.panTo(marker.getPosition());
            };
            marker._clickHandler = clickHandler;
            kakao.maps.event.addListener(marker, 'click', clickHandler);

            // 마커 드래그 완료 시 좌표 갱신 및 DB/메모리 동기화 처리
            if (isMovingThis || isPendingThis) {
                const dragstartHandler = () => {
                    this.map.setDraggable(false); // 드래그 시작 시 지도 이동 차단
                };
                const dragendHandler = () => {
                    this.map.setDraggable(true); // 드래그 종료 시 지도 이동 복원
                    this.handleMarkerDragEnd(data.id, marker.getPosition());
                };
                marker._dragstartHandler = dragstartHandler;
                marker._dragendHandler = dragendHandler;
                kakao.maps.event.addListener(marker, 'dragstart', dragstartHandler);
                kakao.maps.event.addListener(marker, 'dragend', dragendHandler);
            }
        });

        if (this.clusterer && this.currentMode === 'equipment' && this.isClusteringEnabled) {
            this.clusterer.addMarkers(markersToCluster);
        }
    },

    closeAllOverlays() {
        this.customOverlays.forEach(overlay => overlay.setMap(null));
    },

    updateOverlayAddress(id, lat, lng) {
        const overlay = this.customOverlays.get(id);
        if (!overlay) return;
        const container = overlay.getContent();
        if (!container) return;
        
        const addressDiv = container.querySelector('.overlay-address');
        if (addressDiv) {
            addressDiv.innerHTML = '<span class="road-addr">주소 조회 중...</span>';
            this.resolveAddress(lat, lng, (addrObj) => {
                let html = '';
                if (addrObj.jibunAddress) {
                    html += `<span class="road-addr">${this.formatJibunAddress(addrObj.jibunAddress)}</span>`;
                }
                if (addrObj.roadAddress) {
                    html += `<span class="jibun-addr" style="font-size: 13px; color: var(--text-muted); display: block; margin-top: 2px;">(도로명) ${addrObj.roadAddress}</span>`;
                }
                if (!addrObj.roadAddress && !addrObj.jibunAddress) {
                    html = '<span class="road-addr">주소를 확인할 수 없음</span>';
                }
                addressDiv.innerHTML = html;
            });
        }
    },

    moveMarkerTemporarily(id, newPosition) {
        const markerData = this.markersData.find(m => m.id === id);
        if (!markerData) return;

        const newLat = newPosition.getLat();
        const newLng = newPosition.getLng();

        // 1. 메모리 좌표 임시 업데이트
        markerData.lat = newLat;
        markerData.lng = newLng;

        // 2. 지도 마커 위치 이동
        const marker = this.mapMarkers.get(id);
        if (marker) {
            marker.setPosition(newPosition);
        }

        // 3. 오버레이 위치 이동
        const overlay = this.customOverlays.get(id);
        if (overlay) {
            overlay.setPosition(newPosition);
        }

        // 4. 오버레이 주소 갱신
        this.updateOverlayAddress(id, newLat, newLng);

        // 5. 클러스터러 갱신
        if (this.clusterer && this.currentMode === 'equipment') {
            this.clusterer.redraw();
        }
    },

    enterMarkerPositionChangeMode(id) {
        if (!this.currentUser) {
            this.showToast('위치 변경은 로그인 후 이용할 수 있습니다.');
            return;
        }

        // 이미 위치 수정 중인 마커가 있다면 취소 처리
        if (this.currentMovingMarkerId && this.currentMovingMarkerId !== id) {
            this.cancelMarkerPositionChange(this.currentMovingMarkerId);
        }

        const markerData = this.markersData.find(m => m.id === id);
        if (!markerData) return;

        const marker = this.mapMarkers.get(id);
        if (!marker) return;

        this.currentMovingMarkerId = id;
        this.originalMarkerPosition = new kakao.maps.LatLng(markerData.lat, markerData.lng);

        // 순간이동을 위한 지도 클릭 리스너 등록
        this.mapClickMoveListener = (mouseEvent) => {
            this.moveMarkerTemporarily(id, mouseEvent.latLng);
        };
        kakao.maps.event.addListener(this.map, 'click', this.mapClickMoveListener);

        // 마커 draggable 활성화를 위해 지도를 리렌더링하여 UI 업데이트
        this.renderMarkersOnMap();

        // 오버레이 다시 노출
        if (this.customOverlays.has(id)) {
            this.customOverlays.get(id).setMap(this.map);
        }

        this.showToast('위치 변경 모드가 활성화되었습니다. 지도를 클릭하거나 핀을 드래그하세요.');
    },

    cancelMarkerPositionChange(id) {
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
        if (markerData && this.originalMarkerPosition) {
            // 좌표 원복
            markerData.lat = this.originalMarkerPosition.getLat();
            markerData.lng = this.originalMarkerPosition.getLng();
        }

        this.currentMovingMarkerId = null;
        this.originalMarkerPosition = null;

        // UI 원복을 위한 리렌더링
        this.renderMarkersOnMap();

        // 오버레이 복원 노출
        if (this.customOverlays.has(id)) {
            this.customOverlays.get(id).setMap(this.map);
        }

        this.showToast('위치 변경이 취소되었습니다.');
    },

    resolveAddressPromise(lat, lng) {
        return new Promise((resolve) => {
            this.resolveAddress(lat, lng, (addrObj) => {
                resolve(addrObj);
            });
        });
    },

    formatJibunAddress(addr) {
        if (!addr) return '';
        const trimmed = addr.trim();
        if (trimmed.endsWith('번지')) return trimmed;
        if (/\d$/.test(trimmed)) {
            return trimmed + '번지';
        }
        return trimmed;
    },

    resolveAddress(lat, lng, callback) {
        if (!window.kakao || !kakao.maps || !kakao.maps.services) return;
        const geocoder = new kakao.maps.services.Geocoder();
        const coord = new kakao.maps.LatLng(lat, lng);
        geocoder.coord2Address(coord.getLng(), coord.getLat(), (result, status) => {
            if (status === kakao.maps.services.Status.OK && result.length > 0) {
                const roadAddress = result[0].road_address ? result[0].road_address.address_name : '';
                const jibunAddress = result[0].address ? result[0].address.address_name : '';
                callback({ roadAddress, jibunAddress });
            } else {
                callback({ roadAddress: '', jibunAddress: '' });
            }
        });
    },

    createOverlayContent(data) {
        const container = document.createElement('div');
        container.className = 'custom-overlay';
        
        // 이벤트 버블링 방지 (지도로 클릭이 전달되어 순간이동이 트리거되는 것 차단)
        const stopPropagation = (e) => e.stopPropagation();
        container.addEventListener('click', stopPropagation);
        container.addEventListener('mousedown', stopPropagation);
        container.addEventListener('mouseup', stopPropagation);
        container.addEventListener('touchstart', stopPropagation);
        container.addEventListener('touchend', stopPropagation);
        
        const header = document.createElement('div');
        header.className = 'overlay-header';
        
        const title = document.createElement('div');
        title.className = 'overlay-title';
        title.textContent = data.name;
        
        const closeBtn = document.createElement('i');
        closeBtn.className = 'fa-solid fa-xmark overlay-close';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.customOverlays.get(data.id).setMap(null);
            // 만약 위치 변경 모드인 상태에서 말풍선을 닫았다면, 취소 처리
            if (this.currentMovingMarkerId === data.id) {
                this.cancelMarkerPositionChange(data.id);
            }
        });
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        container.appendChild(header);

        // 주소 표시 영역 (역지오코딩으로 비동기 로드)
        const addressDiv = document.createElement('div');
        addressDiv.className = 'overlay-address';
        addressDiv.style.flexDirection = 'column';
        addressDiv.style.alignItems = 'flex-start';
        addressDiv.style.gap = '2px';
        addressDiv.innerHTML = '<span class="road-addr">주소 조회 중...</span>';
        container.appendChild(addressDiv);

        // 이미 데이터에 주소 정보가 있는 경우 API 호출 생략하고 즉시 렌더링
        if (this.currentMode === 'battery') {
            if (data.address) {
                addressDiv.innerHTML = `<span class="road-addr">${data.address}</span>`;
            } else {
                this.resolveAddress(data.lat, data.lng, async (addrObj) => {
                    const resolvedAddr = addrObj.jibunAddress || addrObj.roadAddress || "주소를 확인할 수 없음";
                    addressDiv.innerHTML = `<span class="road-addr">${resolvedAddr}</span>`;
                    data.address = resolvedAddr === "주소를 확인할 수 없음" ? "" : resolvedAddr;
                    
                    if (!data.isPending && this.supabase && data.address && this.currentUser) {
                        try {
                            await this.supabase
                                .from('battery_markers')
                                .update({ address: data.address })
                                .eq('id', data.id);
                        } catch (err) {
                            console.error("백그라운드 축전지 주소 자동 마이그레이션 실패:", err);
                        }
                    }
                });
            }
        } else {
            if (data.roadAddress || data.jibunAddress) {
                let html = '';
                if (data.jibunAddress) {
                    html += `<span class="road-addr">${this.formatJibunAddress(data.jibunAddress)}</span>`;
                }
                if (data.roadAddress) {
                    html += `<span class="jibun-addr" style="font-size: 13px; color: var(--text-muted); display: block; margin-top: 2px;">(도로명) ${data.roadAddress}</span>`;
                }
                addressDiv.innerHTML = html;
            } else {
                // 주소가 없는 기존 마커(구데이터) 폴백 처리: 최초 1회만 API 조회
                this.resolveAddress(data.lat, data.lng, async (addrObj) => {
                    let html = '';
                    if (addrObj.jibunAddress) {
                        html += `<span class="road-addr">${this.formatJibunAddress(addrObj.jibunAddress)}</span>`;
                    }
                    if (addrObj.roadAddress) {
                        html += `<span class="jibun-addr" style="font-size: 13px; color: var(--text-muted); display: block; margin-top: 2px;">(도로명) ${addrObj.roadAddress}</span>`;
                    }
                    if (!addrObj.roadAddress && !addrObj.jibunAddress) {
                        html = '<span class="road-addr">주소를 확인할 수 없음</span>';
                    }
                    addressDiv.innerHTML = html;
                    
                    // 로컬 메모리 동적 캐싱
                    data.roadAddress = addrObj.roadAddress;
                    data.jibunAddress = addrObj.jibunAddress;
                    
                    // 백그라운드 DB 마이그레이션 자동 갱신
                    if (!data.isPending && this.supabase && this.currentUser) {
                        try {
                            await this.supabase
                                .from('markers')
                                .update({
                                    road_address: addrObj.roadAddress || "",
                                    jibun_address: addrObj.jibunAddress || ""
                                })
                                .eq('id', data.id);
                        } catch (err) {
                            console.error("백그라운드 주소 자동 마이그레이션 실패:", err);
                        }
                    }
                });
            }
        }

        // 축전지 모드: 용량별 수량 합산 요약 표시
        if (this.currentMode === 'battery') {
            const specSummary = getBatteryOverlaySpecSummary(data);
            const specSection = document.createElement('div');
            specSection.className = 'overlay-battery-specs';

            if (specSummary.length === 0) {
                const emptyRow = document.createElement('div');
                emptyRow.className = 'overlay-battery-spec-row';
                emptyRow.innerHTML = '<span class="overlay-battery-spec-value">용량·수량 정보 없음</span>';
                specSection.appendChild(emptyRow);
            } else {
                specSummary.forEach(spec => {
                    const row = document.createElement('div');
                    row.className = 'overlay-battery-spec-row';
                    row.innerHTML = `<span class="overlay-battery-spec-value">${spec.capacity}Ah ${spec.totalQuantity} Cell</span>`;
                    specSection.appendChild(row);
                });
            }

            container.appendChild(specSection);
        }

        // 축전지 모드: 위치 변경 중이 아닐 때 시설팀 선택 (로그인 시에만 변경 가능)
        if (this.currentMode === 'battery' && this.currentMovingMarkerId !== data.id && this.currentUser) {
            const teamSection = document.createElement('div');
            teamSection.className = 'overlay-team-section';

            const teamLabel = document.createElement('label');
            teamLabel.className = 'overlay-team-label';
            teamLabel.textContent = '시설팀';

            const teamSelect = document.createElement('select');
            teamSelect.className = 'overlay-team-select';
            teamSelect.setAttribute('data-marker-id', data.id);

            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '미지정';
            teamSelect.appendChild(defaultOption);

            Object.entries(FACILITY_TEAMS).forEach(([teamId, team]) => {
                const option = document.createElement('option');
                option.value = teamId;
                option.textContent = `${team.label}(${team.leader})`;
                option.style.color = team.color;
                teamSelect.appendChild(option);
            });

            teamSelect.value = data.facilityTeam || '';

            teamSelect.addEventListener('mousedown', stopPropagation);
            teamSelect.addEventListener('click', stopPropagation);
            teamSelect.addEventListener('change', (e) => {
                e.stopPropagation();
                this.saveMarkerFacilityTeam(data.id, e.target.value, teamSelect);
            });

            teamSection.appendChild(teamLabel);
            teamSection.appendChild(teamSelect);
            container.appendChild(teamSection);
        }

        // 위치 변경 모드용 안내 가이드
        if (this.currentMovingMarkerId === data.id) {
            const guideDiv = document.createElement('div');
            guideDiv.className = 'overlay-guide';
            guideDiv.style.fontSize = '10px';
            guideDiv.style.color = '#f59e0b';
            guideDiv.style.marginTop = '6px';
            guideDiv.style.fontWeight = 'bold';
            guideDiv.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> 지도를 클릭하거나 핀을 드래그해 이동하세요.';
            container.appendChild(guideDiv);
        }
        
        const actions = document.createElement('div');
        actions.className = 'overlay-actions';
        
        if (this.currentMovingMarkerId === data.id && this.currentUser) {
            const saveBtn = document.createElement('button');
            saveBtn.className = 'overlay-btn overlay-btn-save';
            saveBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            saveBtn.style.color = 'white';
            saveBtn.style.border = 'none';
            saveBtn.textContent = '저장';
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.saveMarkerPosition(data.id);
            });
            
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'overlay-btn overlay-btn-cancel';
            cancelBtn.style.background = 'rgba(255, 255, 255, 0.08)';
            cancelBtn.style.color = 'var(--text-primary)';
            cancelBtn.textContent = '취소';
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.cancelMarkerPositionChange(data.id);
            });
            
            actions.appendChild(saveBtn);
            actions.appendChild(cancelBtn);
        } else {
            const isLoggedIn = !!this.currentUser;

            // 조회: 로드뷰·상세 (비로그인 포함) / 편집·위치변경은 로그인 시에만
            const roadviewBtn = document.createElement('button');
            roadviewBtn.className = 'overlay-btn overlay-btn-roadview';
            roadviewBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            roadviewBtn.style.color = 'white';
            roadviewBtn.style.border = 'none';
            roadviewBtn.textContent = '로드뷰';
            roadviewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openRoadviewModal(data.lat, data.lng, data.name);
            });
            
            const detailBtn = document.createElement('button');
            detailBtn.className = 'overlay-btn overlay-btn-detail';
            detailBtn.style.background = 'rgba(255, 255, 255, 0.08)';
            detailBtn.style.color = 'var(--text-primary)';
            detailBtn.textContent = '상세';
            detailBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openDetailMarkerModal(data.id);
            });
            
            const editBtn = document.createElement('button');
            editBtn.className = 'overlay-btn overlay-btn-edit';
            editBtn.textContent = '편집';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEditMarkerModal(data.id);
            });

            const moveBtn = document.createElement('button');
            moveBtn.className = 'overlay-btn overlay-btn-move';
            moveBtn.style.background = 'rgba(255, 255, 255, 0.08)';
            moveBtn.style.color = 'var(--text-primary)';
            moveBtn.textContent = '위치 변경';
            moveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.enterMarkerPositionChangeMode(data.id);
            });
            
            actions.appendChild(roadviewBtn);
            actions.appendChild(detailBtn);

            if (isLoggedIn) {
                actions.appendChild(editBtn);
                actions.appendChild(moveBtn);
            }
        }
        
        container.appendChild(actions);
        
        return container;
    },

    toggleCadastralMode() {
        if (!this.map) return;
        
        this.isCadastralMode = !this.isCadastralMode;
        localStorage.setItem('cadastral_mode', this.isCadastralMode);
        
        if (this.isCadastralMode) {
            this.map.addOverlayMapTypeId(kakao.maps.MapTypeId.USE_DISTRICT);
            if (this.cadastralBtn) {
                this.cadastralBtn.classList.add('active');
            }
            this.showToast('지적편집도를 표시합니다.');
        } else {
            this.map.removeOverlayMapTypeId(kakao.maps.MapTypeId.USE_DISTRICT);
            if (this.cadastralBtn) {
                this.cadastralBtn.classList.remove('active');
            }
            this.showToast('지적편집도를 해제합니다.');
        }
    },

    toggleClusteringMode() {
        if (!this.map) return;
        
        this.isClusteringEnabled = !this.isClusteringEnabled;
        localStorage.setItem('clustering_mode', this.isClusteringEnabled);
        
        if (this.clusterToggleBtn) {
            if (this.isClusteringEnabled) {
                this.clusterToggleBtn.classList.add('active');
            } else {
                this.clusterToggleBtn.classList.remove('active');
            }
        }
        
        this.renderMarkersOnMap();
        this.showToast(`클러스터러가 ${this.isClusteringEnabled ? '활성화' : '비활성화'}되었습니다.`);
    },

    goToMyLocation() {
        if (!navigator.geolocation) {
            this.showToast('이 브라우저는 위치 서비스를 지원하지 않습니다.');
            return;
        }
        
        this.showToast('내 위치 정보를 탐색 중입니다...', 2000);
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const latLng = new kakao.maps.LatLng(lat, lng);
                
                if (this.map) {
                    this.map.panTo(latLng);
                    this.map.setLevel(3);
                    
                    // 내 위치 표시 핀 꽂기 가능하도록 임시 마커 활성화
                    this.handleMapClick(latLng);
                    this.markerNameInput.value = '내 위치';
                    
                    this.showToast('현재 위치로 이동했습니다. 정보를 입력해 저장할 수 있습니다.');
                }
            },
            (error) => {
                let msg = '위치 정보를 가져올 수 없습니다.';
                if (error.code === error.PERMISSION_DENIED) {
                    msg = '위치 정보 접근 권한이 거부되었습니다.';
                }
                this.showToast(msg);
                console.error("Geolocation error:", error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000
            }
        );
    },

    zoomMap(zoomIn) {
        if (!this.map) return;
        const currentLevel = this.map.getLevel();
        const nextLevel = zoomIn ? currentLevel - 1 : currentLevel + 1;
        
        // 최소/최대 확대 제한 설정 (보통 1~14 레벨 범위)
        if (nextLevel >= 1 && nextLevel <= 14) {
            this.map.setLevel(nextLevel, { animate: true });
        }
    },

    geocodeAddress(address) {
        return new Promise((resolve) => {
            const geocoder = new kakao.maps.services.Geocoder();
            geocoder.addressSearch(address, (result, status) => {
                if (status === kakao.maps.services.Status.OK) {
                    resolve({
                        lat: parseFloat(result[0].y),
                        lng: parseFloat(result[0].x)
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }
});

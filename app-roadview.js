/**
 * MapMarkerApp Prototype Extension - app-roadview.js
 */
Object.assign(MapMarkerApp.prototype, {
    openRoadviewModal(lat, lng, name) {
        if (!window.kakao || !kakao.maps || !kakao.maps.Roadview) {
            this.showToast('카카오 지도 SDK 또는 로드뷰 모듈이 로드되지 않았습니다.');
            return;
        }

        const roadviewContainer = document.getElementById('roadview-container');
        const roadviewError = document.getElementById('roadview-error');
        const roadviewModal = document.getElementById('roadview-modal');
        const roadviewTitle = document.getElementById('roadview-title');

        if (roadviewTitle) {
            roadviewTitle.textContent = `${name} - 현장 로드뷰`;
        }

        // 모달창 위치 스타일 초기화 (드래그 이력이 있으면 중앙 정렬로 복귀)
        if (roadviewModal) {
            const card = roadviewModal.querySelector('.modal-card');
            if (card) {
                card.style.position = '';
                card.style.margin = '';
                card.style.transform = '';
                card.style.left = '';
                card.style.top = '';
            }
        }

        // 모달 표시
        if (roadviewModal) roadviewModal.classList.remove('hidden');
        if (roadviewError) roadviewError.classList.add('hidden');
        if (roadviewContainer) {
            roadviewContainer.classList.remove('hidden');
            roadviewContainer.innerHTML = '';
        }

        try {
            const rv = new kakao.maps.Roadview(roadviewContainer);
            this.currentRoadview = rv;

            // 촬영 일자 오버레이 컨테이너 숨김 초기화
            const dateContainer = document.getElementById('roadview-date-container');
            if (dateContainer) {
                dateContainer.classList.add('hidden');
            }

            const rvClient = new kakao.maps.RoadviewClient();
            const position = new kakao.maps.LatLng(lat, lng);

            rvClient.getNearestPanoId(position, 100, (panoId) => {
                if (panoId === null) {
                    if (roadviewContainer) roadviewContainer.classList.add('hidden');
                    if (roadviewError) roadviewError.classList.remove('hidden');
                } else {
                    rv.setPanoId(panoId, position);
                }
            });

            // 파노라마 ID 변경 이벤트 바인딩 (시점 이동 또는 날짜 선택 시 촬영 일자 목록 갱신)
            kakao.maps.event.addListener(rv, 'pano_changed', () => {
                const currentPanoId = rv.getPanoId();
                this.updateRoadviewDates(currentPanoId);
            });

            // 크기 조절 시 로드뷰 레이아웃 재정렬 감지
            if (this.roadviewResizeObserver) {
                this.roadviewResizeObserver.disconnect();
            }
            this.roadviewResizeObserver = new ResizeObserver(() => {
                if (rv) {
                    rv.relayout();
                }
            });
            const modalCard = roadviewModal ? roadviewModal.querySelector('.modal-card') : null;
            if (modalCard) {
                this.roadviewResizeObserver.observe(modalCard);
            }
        } catch (e) {
            console.error("로드뷰 초기화 실패:", e);
            if (roadviewContainer) roadviewContainer.classList.add('hidden');
            if (roadviewError) roadviewError.classList.remove('hidden');
        }
    },

    closeRoadviewModal() {
        if (this.roadviewResizeObserver) {
            this.roadviewResizeObserver.disconnect();
            this.roadviewResizeObserver = null;
        }
        this.currentRoadview = null;
        this.lastLoadedPanoId = null;

        const roadviewModal = document.getElementById('roadview-modal');
        if (roadviewModal) {
            roadviewModal.classList.add('hidden');
        }
        
        // 날짜 선택기 초기화
        const dateContainer = document.getElementById('roadview-date-container');
        if (dateContainer) {
            dateContainer.classList.add('hidden');
        }
        const dateSelect = document.getElementById('roadview-date-select');
        if (dateSelect) {
            dateSelect.innerHTML = '';
        }

        const roadviewContainer = document.getElementById('roadview-container');
        if (roadviewContainer) {
            roadviewContainer.innerHTML = '';
        }
    },

    updateRoadviewDates(panoId) {
        if (!panoId) return;

        // 중복 호출 방지 캐시 검증
        if (this.lastLoadedPanoId === panoId) return;
        this.lastLoadedPanoId = panoId;

        // 로컬 프록시 주소 및 카카오 직접 호출 주소 정의 (CORS 대응)
        const localUrl = `/api/roadview-dates?panoId=${panoId}`;
        const remoteUrl = `https://rv.map.kakao.com/roadview-search/v2/node/${panoId}?SERVICE=csspano`;

        const requestData = (fetchUrl) => {
            return fetch(fetchUrl)
                .then(async response => {
                    if (!response.ok) {
                        let errMsg = '네트워크 응답이 올바르지 않습니다.';
                        try {
                            const errData = await response.json();
                            if (errData && errData.error) {
                                errMsg = errData.error;
                            }
                        } catch (e) {}
                        throw new Error(errMsg);
                    }
                    return response.json();
                });
        };

        // 1차로 로컬 프록시 요청 시도, 실패 시 2차로 원격 직접 요청 시도
        requestData(localUrl)
            .catch(err => {
                console.warn('로컬 프록시 API 호출 실패, 카카오 직접 호출 시도:', err);
                return requestData(remoteUrl);
            })
            .then(data => {
                const dateContainer = document.getElementById('roadview-date-container');
                const dateSelect = document.getElementById('roadview-date-select');
                if (!dateContainer || !dateSelect) return;

                const streetList = data.street_view ? data.street_view.streetList : null;
                if (!streetList || streetList.length === 0) {
                    dateContainer.classList.add('hidden');
                    return;
                }

                // 촬영 이력 목록 최신순으로 정렬
                const sortedList = [...streetList].sort((a, b) => b.date.localeCompare(a.date));

                // 셀렉트 박스 옵션 생성
                dateSelect.innerHTML = '';
                sortedList.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item.id;

                    // 날짜 포맷팅 (예: "202306" -> "2023년 06월", "20230628" -> "2023년 06월 28일")
                    let formattedDate = item.date;
                    if (item.date && item.date.length === 6) {
                        formattedDate = `${item.date.substring(0, 4)}년 ${item.date.substring(4, 6)}월`;
                    } else if (item.date && item.date.length === 8) {
                        formattedDate = `${item.date.substring(0, 4)}년 ${item.date.substring(4, 6)}월 ${item.date.substring(6, 8)}일`;
                    }

                    opt.textContent = formattedDate;
                    if (String(item.id) === String(panoId)) {
                        opt.selected = true;
                    }
                    dateSelect.appendChild(opt);
                });

                // 현재 촬영 일자 셀렉트 박스 동기화 설정 (현재 panoId가 선택되어 있지 않다면 강제 설정)
                dateSelect.value = panoId;

                // 날짜 옵션 리스트가 있으면 화면에 노출
                dateContainer.classList.remove('hidden');
            })
            .catch(error => {
                console.warn('로드뷰 과거 촬영 날짜 목록 로드 실패 (CORS 또는 네트워크 제한):', error);
                // 오류 발생 시 select 박스 내부에 예외 원인을 갱신하여 인지성 극대화
                const dateContainer = document.getElementById('roadview-date-container');
                const dateSelect = document.getElementById('roadview-date-select');
                if (dateContainer && dateSelect) {
                    dateContainer.classList.remove('hidden');
                    let errorText = '조회 실패 (오류)';
                    const errMsg = error.message ? error.message : '';
                    if (errMsg.includes('504') || errMsg.includes('timeout') || errMsg.includes('시간이 초과')) {
                        errorText = '조회 시간 초과 (504)';
                    }
                    dateSelect.innerHTML = `<option disabled selected style="color: #ef4444; font-weight: 500;">${errorText}</option>`;
                }
                this.showToast(`과거 촬영 일자 로드 실패: ${error.message}`, 4000);
            });
    },

    initRoadviewDrag() {
        const modal = document.getElementById('roadview-modal');
        if (!modal) return;
        const card = modal.querySelector('.modal-card');
        const header = modal.querySelector('.modal-header');
        if (!card || !header) return;

        let isDragging = false;
        let startX = 0, startY = 0;
        let cardLeft = 0, cardTop = 0;

        header.addEventListener('mousedown', (e) => {
            // 닫기 버튼 등 컨트롤 요소를 클릭했을 때는 드래그 방지
            if (e.target.closest('button') || e.target.closest('i')) return;

            isDragging = true;
            
            // 현재 모달 카드의 좌표를 확보하여 절대 위치로 고정
            const rect = card.getBoundingClientRect();
            const parentRect = modal.getBoundingClientRect();
            
            card.style.position = 'absolute';
            card.style.margin = '0';
            card.style.transform = 'none'; // 기존 CSS pop 애니메이션의 transform 효과 초기화
            
            cardLeft = rect.left - parentRect.left;
            cardTop = rect.top - parentRect.top;
            card.style.left = cardLeft + 'px';
            card.style.top = cardTop + 'px';

            startX = e.clientX;
            startY = e.clientY;

            const onMouseMove = (moveEvent) => {
                if (!isDragging) return;
                const deltaX = moveEvent.clientX - startX;
                const deltaY = moveEvent.clientY - startY;

                card.style.left = (cardLeft + deltaX) + 'px';
                card.style.top = (cardTop + deltaY) + 'px';
            };

            const onMouseUp = () => {
                if (isDragging) {
                    const finalRect = card.getBoundingClientRect();
                    const finalParentRect = modal.getBoundingClientRect();
                    cardLeft = finalRect.left - finalParentRect.left;
                    cardTop = finalRect.top - finalParentRect.top;
                    isDragging = false;
                }
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault(); // 텍스트 드래그 선택 방지
        });
    }
});

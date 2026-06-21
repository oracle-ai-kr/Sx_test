// ════════════════════════════════════════════════════════════
//  SIGNAL X — Render Engine v7.10
// ════════════════════════════════════════════════════════════
const BT_SUPPORTED_TF = {
  kr:   ['30m','60m','day','week','month'],   // 30분은 KIS 한정
  us:   ['day','week','month'],
  coin: ['60m','240m','day','week','month'],
};
const BT_MIN_TRADES = 10; // 최소 거래 횟수

// ══════════════════════════════════════════════════════════════
//  KSIC 업종 매핑 (한국표준산업분류 10차 - 소분류 3자리)
//  출처: https://github.com/FinanceData/KSIC (공개 데이터)
//  용도: DART /dart/company API의 induty_code → 섹터 + 업종명 표시
//        분석탭 헤더 카드의 종목코드 아래에 1줄 표시
//  데이터: 232개 항목, ~14.5KB
//  형식: { "코드": { n: 업종명, s: 섹터약칭 } }
// ══════════════════════════════════════════════════════════════
const KSIC_MAP = {"011":{"n":"작물 재배업","s":"농업"},"012":{"n":"축산업","s":"농업"},"013":{"n":"작물재배 및 축산 복합농업","s":"농업"},"014":{"n":"작물재배 및 축산 관련 서비스업","s":"농업"},"015":{"n":"수렵 및 관련 서비스업","s":"농업"},"020":{"n":"임업","s":"임업"},"031":{"n":"어로 어업","s":"어업"},"032":{"n":"양식어업 및 어업관련 서비스업","s":"어업"},"051":{"n":"석탄 광업","s":"에너지광업"},"052":{"n":"원유 및 천연가스 채굴업","s":"에너지광업"},"061":{"n":"철 광업","s":"금속광업"},"062":{"n":"비철금속 광업","s":"금속광업"},"071":{"n":"토사석 광업","s":"비금속광업"},"072":{"n":"기타 비금속광물 광업","s":"비금속광업"},"080":{"n":"광업 지원 서비스업","s":"광업서비스"},"101":{"n":"도축, 육류 가공 및 저장 처리업","s":"식품"},"102":{"n":"수산물 가공 및 저장 처리업","s":"식품"},"103":{"n":"과실, 채소 가공 및 저장 처리업","s":"식품"},"104":{"n":"동물성 및 식물성 유지 제조업","s":"식품"},"105":{"n":"낙농제품 및 식용 빙과류 제조업","s":"식품"},"106":{"n":"곡물 가공품, 전분 및 전분제품 제조업","s":"식품"},"107":{"n":"기타 식품 제조업","s":"식품"},"108":{"n":"동물용 사료 및 조제식품 제조업","s":"식품"},"111":{"n":"알코올 음료 제조업","s":"음료"},"112":{"n":"비알코올 음료 및 얼음 제조업","s":"음료"},"120":{"n":"담배 제조업","s":"담배"},"131":{"n":"방적 및 가공사 제조업","s":"섬유"},"132":{"n":"직물 직조 및 직물제품 제조업","s":"섬유"},"133":{"n":"편조 원단 제조업","s":"섬유"},"134":{"n":"섬유제품 염색, 정리 및 마무리 가공업","s":"섬유"},"139":{"n":"기타 섬유제품 제조업","s":"섬유"},"141":{"n":"봉제의복 제조업","s":"의류"},"142":{"n":"모피제품 제조업","s":"의류"},"143":{"n":"편조의복 제조업","s":"의류"},"144":{"n":"의복 액세서리 제조업","s":"의류"},"151":{"n":"가죽, 가방 및 유사 제품 제조업","s":"가죽/가방/신발"},"152":{"n":"신발 및 신발 부분품 제조업","s":"가죽/가방/신발"},"161":{"n":"제재 및 목재 가공업","s":"목재"},"162":{"n":"나무제품 제조업","s":"목재"},"163":{"n":"코르크 및 조물 제품 제조업","s":"목재"},"171":{"n":"펄프, 종이 및 판지 제조업","s":"제지"},"172":{"n":"골판지, 종이 상자 및 종이 용기 제조업","s":"제지"},"179":{"n":"기타 종이 및 판지 제품 제조업","s":"제지"},"181":{"n":"인쇄 및 인쇄관련 산업","s":"인쇄"},"182":{"n":"기록매체 복제업","s":"인쇄"},"191":{"n":"코크스 및 연탄 제조업","s":"석유정제"},"192":{"n":"석유 정제품 제조업","s":"석유정제"},"201":{"n":"기초 화학물질 제조업","s":"화학"},"202":{"n":"합성고무 및 플라스틱 물질 제조업","s":"화학"},"203":{"n":"비료, 농약 및 살균ㆍ살충제 제조업","s":"화학"},"204":{"n":"기타 화학제품 제조업","s":"화학"},"205":{"n":"화학섬유 제조업","s":"화학"},"211":{"n":"기초 의약 물질 및 생물학적 제제 제조업","s":"제약/바이오"},"212":{"n":"의약품 제조업","s":"제약/바이오"},"213":{"n":"의료용품 및 기타 의약 관련제품 제조업","s":"제약/바이오"},"221":{"n":"고무제품 제조업","s":"고무/플라스틱"},"222":{"n":"플라스틱 제품 제조업","s":"고무/플라스틱"},"231":{"n":"유리 및 유리제품 제조업","s":"비금속광물"},"232":{"n":"내화, 비내화 요업제품 제조업","s":"비금속광물"},"233":{"n":"시멘트, 석회, 플라스터 및 그 제품 제조업","s":"비금속광물"},"239":{"n":"기타 비금속 광물제품 제조업","s":"비금속광물"},"241":{"n":"1차 철강 제조업","s":"철강/금속"},"242":{"n":"1차 비철금속 제조업","s":"철강/금속"},"243":{"n":"금속 주조업","s":"철강/금속"},"251":{"n":"구조용 금속제품, 탱크 및 증기발생기 제조업","s":"금속가공"},"252":{"n":"무기 및 총포탄 제조업","s":"금속가공"},"259":{"n":"기타 금속 가공제품 제조업","s":"금속가공"},"261":{"n":"반도체 제조업","s":"전자/반도체/IT장비"},"262":{"n":"전자 부품 제조업","s":"전자/반도체/IT장비"},"263":{"n":"컴퓨터 및 주변 장치 제조업","s":"전자/반도체/IT장비"},"264":{"n":"통신 및 방송장비 제조업","s":"전자/반도체/IT장비"},"265":{"n":"영상 및 음향 기기 제조업","s":"전자/반도체/IT장비"},"266":{"n":"마그네틱 및 광학 매체 제조업","s":"전자/반도체/IT장비"},"271":{"n":"의료용 기기 제조업","s":"의료/광학기기"},"272":{"n":"측정, 시험, 항해, 제어 및 기타 정밀 기기 제조업; 광학 기기 제외","s":"의료/광학기기"},"273":{"n":"사진장비 및 광학 기기 제조업","s":"의료/광학기기"},"274":{"n":"시계 및 시계 부품 제조업","s":"의료/광학기기"},"281":{"n":"전동기, 발전기 및 전기 변환ㆍ공급ㆍ제어 장치 제조업","s":"전기장비"},"282":{"n":"일차전지 및 축전지 제조업","s":"전기장비"},"283":{"n":"절연선 및 케이블 제조업","s":"전기장비"},"284":{"n":"전구 및 조명장치 제조업","s":"전기장비"},"285":{"n":"가정용 기기 제조업","s":"전기장비"},"289":{"n":"기타 전기장비 제조업","s":"전기장비"},"291":{"n":"일반 목적용 기계 제조업","s":"기계장비"},"292":{"n":"특수 목적용 기계 제조업","s":"기계장비"},"301":{"n":"자동차용 엔진 및 자동차 제조업","s":"자동차"},"302":{"n":"자동차 차체 및 트레일러 제조업","s":"자동차"},"303":{"n":"자동차 신품 부품 제조업","s":"자동차"},"304":{"n":"자동차 재제조 부품 제조업","s":"자동차"},"311":{"n":"선박 및 보트 건조업","s":"운송장비"},"312":{"n":"철도장비 제조업","s":"운송장비"},"313":{"n":"항공기, 우주선 및 부품 제조업","s":"운송장비"},"319":{"n":"그 외 기타 운송장비 제조업","s":"운송장비"},"320":{"n":"가구 제조업","s":"가구"},"331":{"n":"귀금속 및 장신용품 제조업","s":"기타제조"},"332":{"n":"악기 제조업","s":"기타제조"},"333":{"n":"운동 및 경기용구 제조업","s":"기타제조"},"334":{"n":"인형, 장난감 및 오락용품 제조업","s":"기타제조"},"339":{"n":"그 외 기타 제품 제조업","s":"기타제조"},"340":{"n":"산업용 기계 및 장비 수리업","s":"기계수리"},"351":{"n":"전기업","s":"전기/가스/에너지"},"352":{"n":"연료용 가스 제조 및 배관공급업","s":"전기/가스/에너지"},"353":{"n":"증기, 냉ㆍ온수 및 공기 조절 공급업","s":"전기/가스/에너지"},"360":{"n":"수도업","s":"수도"},"370":{"n":"하수, 폐수 및 분뇨 처리업","s":"하수처리"},"381":{"n":"폐기물 수집, 운반업","s":"폐기물/재활용"},"382":{"n":"폐기물 처리업","s":"폐기물/재활용"},"383":{"n":"해체, 선별 및 원료 재생업","s":"폐기물/재활용"},"390":{"n":"환경 정화 및 복원업","s":"환경복원"},"411":{"n":"건물 건설업","s":"종합건설"},"412":{"n":"토목 건설업","s":"종합건설"},"421":{"n":"기반조성 및 시설물 축조관련 전문공사업","s":"전문건설"},"422":{"n":"건물설비 설치 공사업","s":"전문건설"},"423":{"n":"전기 및 통신 공사업","s":"전문건설"},"424":{"n":"실내건축 및 건축마무리 공사업","s":"전문건설"},"425":{"n":"시설물 유지관리 공사업","s":"전문건설"},"426":{"n":"건설장비 운영업","s":"전문건설"},"451":{"n":"자동차 판매업","s":"자동차판매"},"452":{"n":"자동차 부품 및 내장품 판매업","s":"자동차판매"},"453":{"n":"모터사이클 및 부품 판매업","s":"자동차판매"},"461":{"n":"상품 중개업","s":"도매"},"462":{"n":"산업용 농ㆍ축산물 및 동ㆍ식물 도매업","s":"도매"},"463":{"n":"음ㆍ식료품 및 담배 도매업","s":"도매"},"464":{"n":"생활용품 도매업","s":"도매"},"465":{"n":"기계장비 및 관련 물품 도매업","s":"도매"},"466":{"n":"건축 자재, 철물 및 난방장치 도매업","s":"도매"},"467":{"n":"기타 전문 도매업","s":"도매"},"468":{"n":"상품 종합 도매업","s":"도매"},"471":{"n":"종합 소매업","s":"소매"},"472":{"n":"음ㆍ식료품 및 담배 소매업","s":"소매"},"473":{"n":"가전제품 및 정보 통신장비 소매업","s":"소매"},"474":{"n":"섬유, 의복, 신발 및 가죽제품 소매업","s":"소매"},"475":{"n":"기타 생활용품 소매업","s":"소매"},"476":{"n":"문화, 오락 및 여가 용품 소매업","s":"소매"},"477":{"n":"연료 소매업","s":"소매"},"478":{"n":"기타 상품 전문 소매업","s":"소매"},"479":{"n":"무점포 소매업","s":"소매"},"491":{"n":"철도 운송업","s":"육상운송"},"492":{"n":"육상 여객 운송업","s":"육상운송"},"493":{"n":"도로 화물 운송업","s":"육상운송"},"494":{"n":"소화물 전문 운송업","s":"육상운송"},"495":{"n":"파이프라인 운송업","s":"육상운송"},"501":{"n":"해상 운송업","s":"해운"},"502":{"n":"내륙 수상 및 항만 내 운송업","s":"해운"},"511":{"n":"항공 여객 운송업","s":"항공"},"512":{"n":"항공 화물 운송업","s":"항공"},"521":{"n":"보관 및 창고업","s":"물류/창고"},"529":{"n":"기타 운송관련 서비스업","s":"물류/창고"},"551":{"n":"일반 및 생활 숙박시설 운영업","s":"숙박"},"559":{"n":"기타 숙박업","s":"숙박"},"561":{"n":"음식점업","s":"음식점"},"562":{"n":"주점 및 비알코올 음료점업","s":"음식점"},"581":{"n":"서적, 잡지 및 기타 인쇄물 출판업","s":"출판"},"582":{"n":"소프트웨어 개발 및 공급업","s":"출판"},"591":{"n":"영화, 비디오물, 방송 프로그램 제작 및 배급업","s":"영상/엔터"},"592":{"n":"오디오물 출판 및 원판 녹음업","s":"영상/엔터"},"601":{"n":"라디오 방송업","s":"방송"},"602":{"n":"텔레비전 방송업","s":"방송"},"611":{"n":"공영 우편업","s":"통신"},"612":{"n":"전기 통신업","s":"통신"},"620":{"n":"컴퓨터 프로그래밍, 시스템 통합 및 관리업","s":"SW/IT서비스"},"631":{"n":"자료 처리, 호스팅, 포털 및 기타 인터넷 정보 매개 서비스업","s":"정보서비스"},"639":{"n":"기타 정보 서비스업","s":"정보서비스"},"641":{"n":"은행 및 저축기관","s":"은행/금융"},"642":{"n":"신탁업 및 집합 투자업","s":"은행/금융"},"649":{"n":"기타 금융업","s":"은행/금융"},"651":{"n":"보험업","s":"보험"},"652":{"n":"재보험업","s":"보험"},"653":{"n":"연금 및 공제업","s":"보험"},"661":{"n":"금융 지원 서비스업","s":"금융서비스"},"662":{"n":"보험 및 연금관련 서비스업","s":"금융서비스"},"681":{"n":"부동산 임대 및 공급업","s":"부동산"},"682":{"n":"부동산관련 서비스업","s":"부동산"},"701":{"n":"자연과학 및 공학 연구개발업","s":"연구개발"},"702":{"n":"인문 및 사회과학 연구개발업","s":"연구개발"},"711":{"n":"법무관련 서비스업","s":"전문서비스"},"712":{"n":"회계 및 세무관련 서비스업","s":"전문서비스"},"713":{"n":"광고업","s":"전문서비스"},"714":{"n":"시장 조사 및 여론 조사업","s":"전문서비스"},"715":{"n":"회사 본부 및 경영 컨설팅 서비스업","s":"전문서비스"},"716":{"n":"기타 전문 서비스업","s":"전문서비스"},"721":{"n":"건축 기술, 엔지니어링 및 관련 기술 서비스업","s":"엔지니어링"},"729":{"n":"기타 과학기술 서비스업","s":"엔지니어링"},"731":{"n":"수의업","s":"기타전문"},"732":{"n":"전문 디자인업","s":"기타전문"},"733":{"n":"사진 촬영 및 처리업","s":"기타전문"},"739":{"n":"그 외 기타 전문, 과학 및 기술 서비스업","s":"기타전문"},"741":{"n":"사업시설 유지ㆍ관리 서비스업","s":"시설관리"},"742":{"n":"건물ㆍ산업설비 청소 및 방제 서비스업","s":"시설관리"},"743":{"n":"조경관리 및 유지 서비스업","s":"시설관리"},"751":{"n":"고용 알선 및 인력 공급업","s":"사업지원"},"752":{"n":"여행사 및 기타 여행 보조 서비스업","s":"사업지원"},"753":{"n":"경비, 경호 및 탐정업","s":"사업지원"},"759":{"n":"기타 사업 지원 서비스업","s":"사업지원"},"761":{"n":"운송장비 임대업","s":"임대"},"762":{"n":"개인 및 가정용품 임대업","s":"임대"},"763":{"n":"산업용 기계 및 장비 임대업","s":"임대"},"764":{"n":"무형 재산권 임대업","s":"임대"},"841":{"n":"입법 및 일반 정부 행정","s":"공공행정"},"842":{"n":"사회 및 산업정책 행정","s":"공공행정"},"843":{"n":"외무 및 국방 행정","s":"공공행정"},"844":{"n":"사법 및 공공 질서 행정","s":"공공행정"},"845":{"n":"사회보장 행정","s":"공공행정"},"851":{"n":"초등 교육기관","s":"교육"},"852":{"n":"중등 교육기관","s":"교육"},"853":{"n":"고등 교육기관","s":"교육"},"854":{"n":"특수학교, 외국인학교 및 대안학교","s":"교육"},"855":{"n":"일반 교습학원","s":"교육"},"856":{"n":"기타 교육기관","s":"교육"},"857":{"n":"교육 지원 서비스업","s":"교육"},"861":{"n":"병원","s":"보건/의료"},"862":{"n":"의원","s":"보건/의료"},"863":{"n":"공중 보건 의료업","s":"보건/의료"},"869":{"n":"기타 보건업","s":"보건/의료"},"871":{"n":"거주 복지시설 운영업","s":"사회복지"},"872":{"n":"비거주 복지시설 운영업","s":"사회복지"},"901":{"n":"창작 및 예술관련 서비스업","s":"창작/예술"},"902":{"n":"도서관, 사적지 및 유사 여가관련 서비스업","s":"창작/예술"},"911":{"n":"스포츠 서비스업","s":"스포츠/오락"},"912":{"n":"유원지 및 기타 오락관련 서비스업","s":"스포츠/오락"},"941":{"n":"산업 및 전문가 단체","s":"협회단체"},"942":{"n":"노동조합","s":"협회단체"},"949":{"n":"기타 협회 및 단체","s":"협회단체"},"951":{"n":"컴퓨터 및 통신장비 수리업","s":"수리업"},"952":{"n":"자동차 및 모터사이클 수리업","s":"수리업"},"953":{"n":"개인 및 가정용품 수리업","s":"수리업"},"961":{"n":"미용, 욕탕 및 유사 서비스업","s":"개인서비스"},"969":{"n":"그 외 기타 개인 서비스업","s":"개인서비스"},"970":{"n":"가구 내 고용활동","s":"가구내고용"},"981":{"n":"자가 소비를 위한 가사 생산 활동","s":"자가소비"},"982":{"n":"자가 소비를 위한 가사 서비스 활동","s":"자가소비"},"990":{"n":"국제 및 외국기관","s":"국제기관"}};

// induty_code → 섹터/업종 표시문자열 헬퍼 (없으면 빈 문자열 반환)
function _ksicSectorText(industryCode){
  if(!industryCode) return '';
  const code = String(industryCode).trim();
  const info = KSIC_MAP[code];
  if(!info) return '';
  return `${info.s} · ${info.n}`;
}

// ══════════════════════════════════════════════════════════════
//  S103-fix7 Phase3-B-7: C 로직 분리 완료 → sx_project_c.js (SXC 네임스페이스)
//    - supervisorJudge       → SXC.supervisorJudge
//    - unifiedVerdict        → SXC.unifiedVerdict
//    - _mapVerdictToBtAction → SXC.mapVerdictToBtAction
//    - _verdictMap 상수       → SXC.VERDICT_GROUP_MAP / SXC.getVerdictGroup
//    - _verdictBadgeTop 로직  → SXC.getVerdictBadge
//    screener.html에서 sx_project_c.js가 render.js보다 먼저 로드됨
// ══════════════════════════════════════════════════════════════

function _isBtSupportedTF(market, tf){
  const m = market || 'kr';
  const supported = BT_SUPPORTED_TF[m] || [];
  // 국내 30m은 KIS 연결 시에만 지원
  if(m==='kr' && tf==='30m' && !window._kisEnabled) return false;
  return supported.includes(tf);
}

// S79: 현재 BT trades + 누적 히스토리 합산 거래 횟수
function _getBtTotalTrades(stock){
  const mkt = stock._mkt || stock.market || currentMarket;
  // 1) 현재 세션 BT 거래수
  const btR = stock._btResult;
  const sessionTrades = btR ? (btR.totalTrades ?? 0) : 0;
  // 2) 누적 히스토리 거래수
  let histTrades = 0;
  if(typeof _btHistLoad === 'function'){
    const hist = _btHistLoad(mkt);
    const arr = hist[stock.code] || [];
    histTrades = arr.length;
  }
  return Math.max(sessionTrades, histTrades);
}

// S83: 5단 배지 필터 상태 — 복수 선택 가능
let _stageBadgeFilter = new Set(); // empty = 전체, Set of 'ready'|'entry'|'trend'|'caution'|'wait'

function _setStageBadgeFilter(stage) {
  if (stage === null) { _stageBadgeFilter.clear(); }
  else if (_stageBadgeFilter.has(stage)) { _stageBadgeFilter.delete(stage); }
  else { _stageBadgeFilter.add(stage); }
  renderResults();
}

// [결과탭 검색] 종목명/코드 부분일치 필터 — 5단 배지 + 시장 필터와 AND로 동작
//   - 한글 IME 끊김 방지를 위해 input 이벤트에서는 "결과 행 영역만" 부분 렌더 (헤더/배지/검색창 유지)
//   - 검색어는 전역 변수로 보존 → 분석탭 다녀와도 유지. 새 스캔 시작 시 _clearResultNameFilter로 명시 초기화
let _resultNameFilter = '';

function _setResultNameFilter(text){
  _resultNameFilter = (text || '').trim().toLowerCase();
  // 결과 행 영역만 부분 렌더 (input 포커스/IME 보존)
  if(typeof _renderResultRowsOnly === 'function'){
    _renderResultRowsOnly();
  } else {
    renderResults();
  }
}

function _clearResultNameFilter(){
  _resultNameFilter = '';
  const inp = document.getElementById('resultNameFilterInput');
  if(inp) inp.value = '';
  renderResults();
}

// S83: 5단 배지 판정 — 종목의 현재 단계 판별 (과열주의/관망 추가)
function _getStockStage(s) {
  const sr = s._scanResult;
  if (!sr) return null;
  const r = sr.readyScore ?? 0, e = sr.entryScore ?? 0, t = sr.trendScore ?? s._score ?? 0;
  if (t >= 60 && e >= 50) return 'trend';
  if (e >= 60 && r >= 50) return 'entry';
  if (r >= 60) return 'ready';
  if (t >= 70 && r < 30) return 'caution';
  return 'wait';
}

// S83: 5단 배지 카운트 계산, S84: 배지별 평균 점수 통계, S85: 전이확률평균+상위종목
function _countStageBadges(stocks) {
  var cnt = { ready: 0, entry: 0, trend: 0, caution: 0, wait: 0 };
  var sum = { ready:{r:0,e:0,t:0}, entry:{r:0,e:0,t:0}, trend:{r:0,e:0,t:0}, caution:{r:0,e:0,t:0}, wait:{r:0,e:0,t:0} };
  // S85: 전이확률 합산 + 상위 종목 수집
  var transSum = { ready:0, entry:0, trend:0, caution:0, wait:0 };
  var topStocks = { ready:[], entry:[], trend:[], caution:[], wait:[] };
  for (var i = 0; i < stocks.length; i++) {
    var st = _getStockStage(stocks[i]);
    if (st && cnt.hasOwnProperty(st)) {
      cnt[st]++;
      var sr = stocks[i]._scanResult;
      if (sr) {
        sum[st].r += sr.readyScore ?? 0;
        sum[st].e += sr.entryScore ?? 0;
        sum[st].t += sr.trendScore ?? stocks[i]._score ?? 0;
      }
      // S85: 전이확률
      var tp = _getTransitionProb(stocks[i], st);
      transSum[st] += tp;
      // S85: 상위 종목 (점수 기준)
      var sortScore = st === 'ready' ? (sr ? sr.readyScore : 0) : st === 'entry' ? (sr ? sr.entryScore : 0) : (sr ? (sr.trendScore ?? 0) : 0);
      topStocks[st].push({name: stocks[i]._name || stocks[i].t || '?', score: sortScore, transProb: tp});
    }
  }
  // 평균 계산
  var avg = {};
  var transAvg = {};
  var tops = {};
  var keys = ['ready','entry','trend','caution','wait'];
  for (var ki = 0; ki < keys.length; ki++) {
    var k = keys[ki];
    avg[k] = cnt[k] > 0 ? {
      r: Math.round(sum[k].r / cnt[k]),
      e: Math.round(sum[k].e / cnt[k]),
      t: Math.round(sum[k].t / cnt[k])
    } : null;
    transAvg[k] = cnt[k] > 0 ? Math.round(transSum[k] / cnt[k]) : 0;
    // 상위 3개 (점수 높은 순)
    topStocks[k].sort(function(a,b){ return b.score - a.score; });
    tops[k] = topStocks[k].slice(0, 3);
  }
  return { count: cnt, avg: avg, transAvg: transAvg, tops: tops };
}

// S82: 배지 정렬용 전이확률 추출
function _getTransitionProb(s, badgeStage) {
  var stats = s._btTransitionStats;
  if (!stats) return 0;
  if (badgeStage === 'ready') return stats.r2e ? stats.r2e.rate : 0;
  if (badgeStage === 'entry') return stats.e2t ? stats.e2t.rate : 0;
  if (badgeStage === 'trend') return stats.e2t ? stats.e2t.rate : 0; // 추세는 진입→추세 전이율 기준
  return 0;
}

// S85: 전이 추이 bar 클릭 → 상세 표시
function _showTlDetail(el, detailId) {
  var box = document.getElementById(detailId);
  if (!box) return;
  var bar = el.getAttribute('data-bar');
  var r = el.getAttribute('data-r');
  var e = el.getAttribute('data-e');
  var t = el.getAttribute('data-t');
  var from = el.getAttribute('data-from');
  var to = el.getAttribute('data-to');
  var cnt = el.getAttribute('data-cnt');
  // S86: 라벨 매핑
  // [v1.7] 용어 통일: 진입검토→바닥신호 / 강세→반등신호 / 추세→추세강도
  // [v1.8] 라벨 재정의 — 사용자 의도("초바닥 X, 눌림 후 반등 진입") 반영
  //   · ready('바닥 신호')→'반등 신호': 눌림이 익은 정도 (반등할 신호 포착)
  //   · entry('반등 신호')→'반등 강도': 실제 반등 시작 후 모멘텀 강도
  //   · trend('추세 강도')→'추세 방향': 시장 레짐의 ADX 의미 '추세강도'와 충돌 회피
  var _zLabel = function(z){ return z==='ready'?'반등 신호':z==='entry'?'반등 강도':z==='trend'?'추세 방향':z; };
  var txt = '<b>봉 #' + bar + '</b> — ';
  txt += '<span style="color:var(--accent)">바닥 ' + r + '%</span> · ';
  txt += '<span style="color:var(--buy);opacity:.7">반등 ' + e + '%</span> · ';
  txt += '<span style="color:var(--buy)">추세 ' + t + '%</span>';
  if (from && to) {
    var dirTxt = _zLabel(from) + ' → ' + _zLabel(to);
    var dirClr = to === 'trend' ? 'var(--buy)' : to === 'entry' ? 'var(--accent)' : 'var(--text3)';
    txt += '<br><span style="color:' + dirClr + ';font-weight:700">전이: ' + dirTxt + (cnt > 1 ? ' ×' + cnt : '') + '</span>';
  }
  // 토글: 같은 bar 클릭 시 닫기
  if (box.style.display !== 'none' && box.getAttribute('data-active-bar') === bar) {
    box.style.display = 'none';
    box.removeAttribute('data-active-bar');
    return;
  }
  box.innerHTML = txt;
  box.style.display = 'block';
  box.setAttribute('data-active-bar', bar);
}

// [v3.13 ENV-BADGE] 시장 환경 배지 HTML 생성 (결과 탭 헤더용)
//   배경: 결과 탭 진입 시 시장 흐름 정보가 없어 검색 결과 해석 어려움
//        예: "체결강도 100%↑ 208종목"이 약세장 결과인지 강세장 결과인지 판단 어려움
//   동작: MarketEnv.getSummary 호출하여 state/indices/ageStr 표시
//   적용 경로: 결과 0건 / 시장필터 0건 / 결과 N건 — 모든 경로에서 동일하게 표시
//   주의: stateLabel은 이미 이모지 포함 (예: "🔴 약세") → 추가 이모지 붙이지 않음
function _buildEnvBadgeHTML(){
  try{
    if(typeof MarketEnv === 'undefined' || typeof MarketEnv.getSummary !== 'function') return '';
    const _es = MarketEnv.getSummary(currentMarket);
    if(!_es || _es.state === 'unknown') return '';
    const stateColor = _es.state.includes('bull') ? '#dc2626' : _es.state.includes('bear') ? '#2563eb' : 'var(--text2)';
    return `<div class="result-env-badge" style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--text2);padding:4px 12px;background:var(--surface2);border-bottom:1px solid var(--border);margin:0 -12px 8px">
      <span style="color:${stateColor};font-weight:700">${_es.stateLabel}</span>
      ${_es.indices.length ? '<span>'+_es.indices.join(' · ')+'</span>' : ''}
      ${_es.ageStr ? '<span style="color:var(--text3);margin-left:auto">'+_es.ageStr+'</span>' : ''}
    </div>`;
  }catch(_){ return ''; }
}

// [헤더 고정] 결과탭 상단 진단/관심목록/초기화 버튼 영역 — 빈 결과/필터 0건 분기에서도 항상 노출
//   사유: 초기화 후 또는 결과 0건일 때도 진단/관심목록 접근 필요
function _buildResultHeaderHTML(cntText){
  return `<div class="result-summary">
    ${cntText}
    <button class="btn-diag" onclick="_sxVib(12);openScanDiagModal()" style="padding:3px 10px;border-radius:6px;background:var(--surface2);color:var(--text);border:1px solid var(--border);font-size:9px;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0;letter-spacing:.2px">📊 진단</button>
    <button class="btn-sector" onclick="_sxVib(12);openSectorRadarModal()">📡 업종레이더</button>
    <button class="btn-watchlist" onclick="_sxVib(12);toggleWatchlistView()">관심목록</button>
    <button class="btn-reset" onclick="_sxVib(15);clearSearchResults()">초기화</button>
  </div>${_buildEnvBadgeHTML()}`;
}

function renderResults(){
  const area = document.getElementById('resultArea');
  if(!searchResults.length){
    // [헤더 고정] 빈 결과여도 헤더 버튼 영역은 항상 표시
    area.innerHTML = _buildResultHeaderHTML('<span style="color:var(--text3);font-size:11px">검색 결과 없음</span>')
      + `<div class="result-empty">조건에 맞는 종목이 없습니다</div>`;
    updateResultBadge();
    // [FIX-1A] early-return 시에도 저장 (빈 결과 상태도 보존 의도라면 주석 처리)
    try{ saveSearchResults(); }catch(e){}
    return;
  }

  // S48: 시장별 필터링
  const mf = _resultMarketFilter;
  const filtered = searchResults.filter(s => (s._mkt || 'kr') === mf);

  if(!filtered.length){
    // [헤더 고정] 시장 필터 0건도 헤더 유지
    area.innerHTML = _buildResultHeaderHTML('<span style="color:var(--text3);font-size:11px">해당 시장 결과 없음</span>')
      + `<div class="result-empty">해당 시장에 검색 결과가 없습니다</div>`;
    updateResultBadge();
    // [FIX-1A] 필터 탭 전환 등으로 filtered=0이어도 원본 searchResults는 저장해야 함
    try{ saveSearchResults(); }catch(e){}
    return;
  }

  const arrow = (k)=> sortKey===k ? (sortDir==='desc'?'▼':'▲') : '';
  const sorted = (k)=> sortKey===k ? ' sorted' : '';
  const hasScore = filtered.some(s=>s._score!=null);
  const scanTimeStr = _lastScanTime ? fmtTime(_lastScanTime) : '';

  // S99-3: Phase B — 5단 배지 → 통합판정 아이콘 필터
  // S103-fix7 Phase3-A-2: "대기" 값 폐지 (→ "회피"로 통합, 이미 avoid 매핑됨)
  // S103-fix7 Phase3-B-7: _verdictMap 상수 → SXC.getVerdictGroup() 헬퍼로 교체 (sx_project_c.js로 이전)
  const _verdictCounts = {buy:0, interest:0, hold:0, watch:0, avoid:0, sell:0, none:0};
  filtered.forEach(s => {
    const v = s._svVerdict;
    if(!v){ _verdictCounts.none++; return; }
    const k = SXC.getVerdictGroup(v.action);
    _verdictCounts[k]++;
  });
  const _hasVerdicts = filtered.some(s => s._svVerdict);
  const _hasFilter = _stageBadgeFilter.size > 0;
  let stageFiltered = _hasFilter ? filtered.filter(s => {
    const v = s._svVerdict;
    if(!v) return _stageBadgeFilter.has('none');
    const k = SXC.getVerdictGroup(v.action);
    return _stageBadgeFilter.has(k);
  }) : filtered;

  // [결과탭 검색] 종목명/코드 부분일치 — 5단 배지 필터 결과에 AND로 적용
  //   소문자 비교 (영문 코드/종목명 대소문자 무관). 한글은 lowerCase 영향 없음.
  const _nameQ = _resultNameFilter || '';
  let displayed = _nameQ
    ? stageFiltered.filter(s => {
        const nm = (s.name || '').toLowerCase();
        const cd = (s.code || '').toLowerCase();
        return nm.includes(_nameQ) || cd.includes(_nameQ);
      })
    : stageFiltered;

  area.innerHTML = `
    <div class="result-summary">
      검색 결과 <span class="cnt">${filtered.length}</span>종목${scanTimeStr?`<span style="font-size:8px;color:var(--text3);margin-left:4px">${scanTimeStr}</span>`:''}
      ${_scanLoadingActive?'<span class="scan-loading-text">검색중<span class="dots"></span></span>':''}
      <button class="btn-diag" onclick="_sxVib(12);openScanDiagModal()" style="padding:3px 10px;border-radius:6px;background:var(--surface2);color:var(--text);border:1px solid var(--border);font-size:9px;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0;letter-spacing:.2px">📊 진단</button>
      <button class="btn-sector" onclick="_sxVib(12);openSectorRadarModal()">📡 업종레이더</button>
      <button class="btn-watchlist" onclick="_sxVib(12);toggleWatchlistView()">관심목록</button>
      <button class="btn-reset" onclick="_sxVib(15);clearSearchResults()">초기화</button>
    </div>
    ${_buildEnvBadgeHTML()}
    ${(_hasVerdicts || _verdictCounts.none) ? `<div style="display:flex;gap:5px;padding:4px 12px 6px;flex-wrap:wrap">
      ${_verdictCounts.buy?`<span onclick="_setStageBadgeFilter('buy')" style="cursor:pointer;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid ${_stageBadgeFilter.has('buy')?'var(--buy)':'var(--border)'};background:${_stageBadgeFilter.has('buy')?'var(--buy)':'var(--surface)'};color:${_stageBadgeFilter.has('buy')?'#fff':'var(--text2)'}">🟢${_verdictCounts.buy}</span>`:''}
      ${_verdictCounts.interest?`<span onclick="_setStageBadgeFilter('interest')" style="cursor:pointer;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid ${_stageBadgeFilter.has('interest')?'var(--accent)':'var(--border)'};background:${_stageBadgeFilter.has('interest')?'var(--accent)':'var(--surface)'};color:${_stageBadgeFilter.has('interest')?'#fff':'var(--text2)'}">🔵${_verdictCounts.interest}</span>`:''}
      ${_verdictCounts.hold?`<span onclick="_setStageBadgeFilter('hold')" style="cursor:pointer;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid ${_stageBadgeFilter.has('hold')?'var(--buy)':'var(--border)'};background:${_stageBadgeFilter.has('hold')?'var(--buy)':'var(--surface)'};color:${_stageBadgeFilter.has('hold')?'#fff':'var(--text2)'}">🟢${_verdictCounts.hold}</span>`:''}
      ${_verdictCounts.watch?`<span onclick="_setStageBadgeFilter('watch')" style="cursor:pointer;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid ${_stageBadgeFilter.has('watch')?'#f59e0b':'var(--border)'};background:${_stageBadgeFilter.has('watch')?'#f59e0b':'var(--surface)'};color:${_stageBadgeFilter.has('watch')?'#fff':'var(--text2)'}">🟡${_verdictCounts.watch}</span>`:''}
      ${_verdictCounts.avoid?`<span onclick="_setStageBadgeFilter('avoid')" style="cursor:pointer;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid ${_stageBadgeFilter.has('avoid')?'var(--sell)':'var(--border)'};background:${_stageBadgeFilter.has('avoid')?'var(--sell)':'var(--surface)'};color:${_stageBadgeFilter.has('avoid')?'#fff':'var(--text2)'}">🟠${_verdictCounts.avoid}</span>`:''}
      ${_verdictCounts.sell?`<span onclick="_setStageBadgeFilter('sell')" style="cursor:pointer;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid ${_stageBadgeFilter.has('sell')?'var(--sell)':'var(--border)'};background:${_stageBadgeFilter.has('sell')?'var(--sell)':'var(--surface)'};color:${_stageBadgeFilter.has('sell')?'#fff':'var(--text2)'}">🔴${_verdictCounts.sell}</span>`:''}
      ${_verdictCounts.none?`<span onclick="_setStageBadgeFilter('none')" style="cursor:pointer;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;border:1px solid ${_stageBadgeFilter.has('none')?'var(--text3)':'var(--border)'};background:${_stageBadgeFilter.has('none')?'var(--text3)':'var(--surface)'};color:${_stageBadgeFilter.has('none')?'#fff':'var(--text2)'}">⚪${_verdictCounts.none}</span>`:''}
      ${_hasFilter ? '<span onclick="_setStageBadgeFilter(null)" style="cursor:pointer;padding:3px 8px;border-radius:12px;font-size:9px;border:1px solid var(--border);color:var(--text3)">전체</span>' : ''}
    </div>` : ''}
    <!-- [결과탭 검색] 종목명/코드 부분일치 검색창 — 5단 배지 아래, 결과 헤더 위 -->
    <div style="padding:4px 12px 6px;display:flex;align-items:center;gap:6px">
      <div style="position:relative;flex:1">
        <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--text3);pointer-events:none">🔍</span>
        <input type="text" id="resultNameFilterInput" value="${_nameQ.replace(/"/g,'&quot;')}" placeholder="종목명 또는 코드로 검색"
          oninput="_setResultNameFilter(this.value)"
          style="width:100%;padding:6px 26px 6px 26px;font-size:11px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);box-sizing:border-box;outline:none">
        ${_nameQ?`<span onclick="_clearResultNameFilter()" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--text3);cursor:pointer;padding:2px 6px;line-height:1">✕</span>`:''}
      </div>
      ${_nameQ?`<span style="font-size:9px;color:var(--text3);white-space:nowrap" id="resultNameFilterCount">${displayed.length}/${stageFiltered.length}</span>`:''}
    </div>
    <div class="result-header">
      <span class="rh-name">종목명</span>
      <span class="rh-col${sorted('price')}" onclick="toggleSort('price')">현재가<span class="rh-arrow">${arrow('price')}</span></span>
      <span class="rh-col${sorted('changeRate')}" onclick="toggleSort('changeRate')">전일대비<span class="rh-arrow">${arrow('changeRate')}</span></span>
      <span class="rh-col${sorted('tradeAmount')}" onclick="toggleSort('tradeAmount')">거래대금<span class="rh-arrow">${arrow('tradeAmount')}</span></span>
    </div>
    <!-- [결과탭 검색] 결과 행 영역 — 부분 렌더 대상. _renderResultRowsOnly()가 이 안만 갈아끼움 → input 포커스/한글 IME 보존 -->
    <div id="resultListBody">
      ${_nameQ && !displayed.length ? `<div class="result-empty" style="padding:20px 12px;font-size:12px;color:var(--text3)">"${_nameQ.replace(/</g,'&lt;')}"에 해당하는 종목이 없습니다</div>` : displayed.map((s,i)=>_renderStockRow(s)).join('')}
    </div>
  `;
  saveSearchResults();
  updateResultBadge();
}

// [결과탭 검색] 결과 행 영역만 부분 렌더 (input 이벤트 핸들러용)
//   - innerHTML 통째 갈아끼우면 input이 새로 만들어져 한글 IME가 끊기고 포커스가 빠짐
//   - 결과 행 컨테이너만 갱신하고 input/검색창/배지는 그대로 유지
//   - 검색어 카운트(N/M)도 함께 갱신
//   - X 버튼 표시/숨김도 함께 갱신
function _renderResultRowsOnly(){
  const body = document.getElementById('resultListBody');
  if(!body){ renderResults(); return; }  // 컨테이너 없으면 풀 렌더 폴백

  // 시장 + 5단 배지 필터까지 적용
  const mf = _resultMarketFilter;
  const filtered = searchResults.filter(s => (s._mkt || 'kr') === mf);
  const _hasFilter = _stageBadgeFilter.size > 0;
  const stageFiltered = _hasFilter ? filtered.filter(s => {
    const v = s._svVerdict;
    if(!v) return _stageBadgeFilter.has('none');
    const k = SXC.getVerdictGroup(v.action);
    return _stageBadgeFilter.has(k);
  }) : filtered;

  // 검색어 적용
  const _nameQ = _resultNameFilter || '';
  const displayed = _nameQ
    ? stageFiltered.filter(s => {
        const nm = (s.name || '').toLowerCase();
        const cd = (s.code || '').toLowerCase();
        return nm.includes(_nameQ) || cd.includes(_nameQ);
      })
    : stageFiltered;

  // 결과 행 갱신
  body.innerHTML = _nameQ && !displayed.length
    ? `<div class="result-empty" style="padding:20px 12px;font-size:12px;color:var(--text3)">"${_nameQ.replace(/</g,'&lt;')}"에 해당하는 종목이 없습니다</div>`
    : displayed.map(s => _renderStockRow(s)).join('');

  // 카운트 갱신 (검색어 있을 때만)
  const cntEl = document.getElementById('resultNameFilterCount');
  if(cntEl) cntEl.textContent = `${displayed.length}/${stageFiltered.length}`;

  // X 버튼은 검색어 유무에 따라 표시되어야 하나, 입력 도중에는 어차피 _nameQ가 있으니
  // 별도 처리 불필요 — clearResultNameFilter 호출 시 풀 렌더로 정리됨
}

// [결과탭 검색] 단일 종목 행 HTML 생성 — renderResults / _renderResultRowsOnly 양쪽에서 공유
//   displayed.map(...) 인라인 코드를 함수로 추출하여 두 렌더 경로에서 재사용
function _renderStockRow(s){
  const realIdx = searchResults.indexOf(s);
  const chgClass = s.changeRate>0?'up':s.changeRate<0?'down':'flat';
  const chgSign = s.changeRate>0?'+':'';
  // [S275] 미국 종목 USD 단위 표시 (네이버 호환: 가격 $X.XX, 거래대금 "115억 USD")
  //   배경: 사용자 요청 — 해외 종목 단위에 USD 붙여야 함 (네이버는 "115억 USD" 같은 표기)
  //   적용: s._mkt === 'us' 또는 currentMarket === 'us' (미러 미설정 시 대비)
  const _isUS = (s._mkt === 'us') || (typeof currentMarket !== 'undefined' && currentMarket === 'us' && !s._mkt);
  const priceStr = s.price > 0
    ? (_isUS ? `$${s.price.toFixed(2)}` : s.price.toLocaleString())
    : '—';
  const chgStr = s.price > 0 ? `${chgSign}${(s.changeRate||0).toFixed(2)}%` : '—';
  // 거래대금: 미국은 _tradeAmountDisplay (네이버 raw "115억 USD") 우선, 없으면 fmtVol + USD 접미사
  const volStr = _isUS
    ? (s._tradeAmountDisplay || (s.tradeAmount > 0 ? `${fmtVol(s.tradeAmount)} USD` : '—'))
    : fmtVol(s.tradeAmount);

  // 스마트 필터 태그 (제한 없이 전체 표시)
  const tags = s._smartTags || [];
  const tagsHtml = tags.length ? `<div class="sf-tags">${tags.map(t=>`<span class="sf-tag ${t.cls || (t.dir>0?'pos':t.dir<0?'neg':'neutral')}">${t.label}</span>`).join('')}</div>` : '';

  // 안전필터 차단 이유
  const reasonsHtml = s._reasons&&s._reasons.length ? `<div class="sr-reasons">${s._reasons.join(' ')}</div>` : '';

  // [v3.10 결과탭 마커] 통합판정 아이콘 옆에 보조 마커 — 모멘텀 승급/강등 + 안전필터 강등
  //   ↑ 모멘텀 승급 (초록) / ↓ 모멘텀 강등 (주황) / 🔒 안전필터 강등 (회색)
  //   사다리: ['매수','관심','관망','회피'] / ['보유 유지','청산 준비','청산 검토','즉시 청산','매도 완료']
  //   인덱스 감소 = 승급, 증가 = 강등 (sx_project_c.js _applyMomentumShift와 동일 사다리)
  const _shiftMarkerHtml = (()=>{
    const _v = s._svVerdict;
    if(!_v) return '';
    const _markers = [];
    // 1) 모멘텀 보정 마커 (verdictBeforeShift ≠ action일 때만)
    const _before = _v.verdictBeforeShift;
    const _after = _v.action;
    if(_before && _after && _before !== _after){
      const _ladderNH = ['매수','관심','관망','회피'];
      const _ladderH  = ['보유 유지','청산 준비','청산 검토','즉시 청산','매도 완료'];
      const _ladder = _ladderNH.indexOf(_before) >= 0 ? _ladderNH
                    : _ladderH.indexOf(_before) >= 0 ? _ladderH : null;
      if(_ladder){
        const _iB = _ladder.indexOf(_before);
        const _iA = _ladder.indexOf(_after);
        if(_iB >= 0 && _iA >= 0 && _iB !== _iA){
          if(_iA < _iB){
            // 승급
            _markers.push(`<span class="sr-shift-mark up" title="모멘텀 ↑ 승급: ${_before} → ${_after}">↑</span>`);
          } else {
            // 강등
            _markers.push(`<span class="sr-shift-mark down" title="모멘텀 ↓ 강등: ${_before} → ${_after}">↓</span>`);
          }
        }
      }
    }
    // 2) 안전필터 강등 마커 (_action=HOLD + reasons에 🔒/🚦) — 통합판정과 분석엔진 충돌 시
    const _isSafetyDemoted = s._action === 'HOLD'
      && Array.isArray(s._reasons)
      && s._reasons.some(r => typeof r === 'string' && (r.indexOf('🔒') >= 0 || r.indexOf('🚦') >= 0));
    if(_isSafetyDemoted){
      _markers.push(`<span class="sr-shift-mark safety" title="분석엔진 안전필터 강등 (BUY → HOLD)">🔒</span>`);
    }
    return _markers.join('');
  })();

  return `
    <div class="stock-row" onclick="openAnalysis(${realIdx})">
      <div class="sr-body">
        <div class="sr-row1">
          <div class="sr-name">${s.name}${(typeof _isInWatchlist==='function'&&_isInWatchlist(s.code))?'<span class="sr-wl-star">★</span>':''}</div>
          <div class="sr-col"><div class="sr-price">${priceStr}</div></div>
          <div class="sr-col"><div class="sr-change ${s.price>0?chgClass:'flat'}">${chgStr}</div></div>
          <div class="sr-col"><div class="sr-vol">${volStr}</div></div>
        </div>
        <div class="sr-row2">
          <span class="sr-code">${s.code} · ${s.market||''}</span>
          ${(()=>{
            const _sr = s._scanResult;
            if(!_sr) return s._score!=null?'<span class="sr-score-chip" style="color:'+(s._score>=60?'var(--buy)':'var(--text3)')+'">'+s._score+'</span>':'';
            const r=_sr.readyScore??0, e=_sr.entryScore??0, t=_sr.trendScore??s._score??0;
            // S99-3: Phase B — 5단 배지 제거 → 통합판정 아이콘 1개
            const _svV = s._svVerdict;
            if(_svV) return '<span class="sr-score-chip" style="font-size:11px" title="'+_svV.action+'">'+_svV.icon+'</span>';
            // 감독관 미실행 시 점수만 표시
            if(s._score!=null) return '<span class="sr-score-chip" style="color:'+(s._score>=60?'var(--buy)':'var(--text3)')+'">'+s._score+'</span>';
            return '';
          })()}
          ${_shiftMarkerHtml}
          ${(()=>{
            const _cMkt = s._mkt || currentMarket;
            const _cTfOk = _isBtSupportedTF(_cMkt, currentTF);
            if(!_cTfOk) return '';
            const _cTrades = _getBtTotalTrades(s);
            if(s._btScore==null) return '';
            const _cReliColor = _cTrades<BT_MIN_TRADES?'var(--sell)':_cTrades<30?'var(--accent)':'var(--buy)';
            return `<span class="sr-score-chip" style="color:${_cReliColor}">BT${s._btScore}</span>`;
          })()}
          ${(()=>{ if(typeof _btHistLoad!=='function')return ''; const _m=s._mkt||currentMarket; const _h=_btHistLoad(_m); const _a=_h[s.code]||[]; if(!_a.length)return ''; const _cTfOk2=_isBtSupportedTF(_m,currentTF); const _cTr2=_getBtTotalTrades(s); if(!_cTfOk2||_cTr2<BT_MIN_TRADES)return ''; const _r=_btHistReliabilityLabel(_a.length); const _c=_r.cls==='full'?'var(--buy)':_r.cls==='mid'?'var(--accent)':_r.cls==='low'?'var(--sell)':'var(--text3)'; return `<span class="sr-rel-chip" style="color:${_c};font-size:8px">${_r.text}</span>`; })()}
          ${(()=>{ if(!s._btAction)return ''; const _m3=s._mkt||currentMarket; if(!_isBtSupportedTF(_m3,currentTF))return ''; const _cTr3=_getBtTotalTrades(s); if(_cTr3<BT_MIN_TRADES)return ''; return `<span class="sr-action-chip ${s._btAction==='진입 적기'?'good':s._btAction==='회피'?'bad':'mid'}">${s._btAction}</span>`; })()}
          ${tagsHtml}
        </div>
        ${reasonsHtml}
      </div>
      <span class="sr-arrow">›</span>
    </div>
  `;
}

function clearSearchResults(){
  _showWatchlistMode = false;
  searchResults = [];
  _resultNameFilter = ''; // [결과탭 검색] 결과 초기화 시 검색어도 함께 비움
  // S109 bugfix: 현재 시장 키만 제거 (다른 시장 결과는 보존)
  try{ localStorage.removeItem(typeof searchResultsKey === 'function' ? searchResultsKey(currentMarket) : KEYS.SEARCH_RESULTS); }catch(e){}
  const area = document.getElementById('resultArea');
  // [헤더 고정] 초기화 후에도 진단/관심목록/초기화 버튼 노출 — 사용자가 후속 액션 가능
  area.innerHTML = _buildResultHeaderHTML('<span style="color:var(--text3);font-size:11px">검색 결과 없음</span>')
    + `<div class="result-empty"><div class="big-ico" style="font-size:28px;opacity:.3;margin-bottom:8px">—</div>내 필터 탭에서 조건을 설정하고<br>검색을 실행하세요</div>`;
  updateResultBadge();
}

function saveSearchResults(){
  try{
    // [FIX-svVerdict] 결과탭 5단 배지/색깔원 아이콘/차트마커 보존을 위해 _svVerdict, _scanResult, _btState, _scoreMomentum 필드 추가 저장
    //   참고: sx_scan_worker.js의 _slimResults()는 이 필드들을 이미 정상 보존 중이므로, 메인 스레드 저장 경로만 정합 맞춤
    //   〔이력〕 이전: 이 필드들이 누락되어 브라우저 닫고 재진입하면 _svVerdict 사라져
    //     배지 영역 통째로 숨김 + 종목 라인 아이콘이 숫자(_score)로 폴백되는 현상 (수정됨)
    const slim = searchResults.map(s=>({
      code:s.code,name:s.name,market:s.market,sector:s.sector||'',
      price:s.price,changeRate:s.changeRate,volume:s.volume,tradeAmount:s.tradeAmount,
      marketCap:s.marketCap,foreignRatio:s.foreignRatio,volumeRatio:s.volumeRatio,
      _score:s._score,_action:s._action,_reasons:s._reasons,
      _smartTags:s._smartTags,_filterScore:s._filterScore,
      _btScore:s._btScore,_btAction:s._btAction,
      _mkt:s._mkt||'kr',
      _regime:s._regime?{label:s._regime.label,icon:s._regime.icon}:null,
      // ★ 결과탭 5단 배지 & 종목라인 색깔원 아이콘 & 차트 마커용 (sx_render.js 197/259줄 _hasVerdicts/_svV 분기에 사용)
      // [v3.10 결과탭 마커] verdictBeforeShift, momBadge 추가 — 종목 카드 모멘텀 승급/강등 마커용
      _svVerdict: s._svVerdict ? {
        action: s._svVerdict.action, icon: s._svVerdict.icon, color: s._svVerdict.color,
        chartMarker: s._svVerdict.chartMarker, chartMarkerHold: s._svVerdict.chartMarkerHold, label: s._svVerdict.label,
        verdictBeforeShift: s._svVerdict.verdictBeforeShift,
        momBadge: s._svVerdict.momBadge ? {
          direction: s._svVerdict.momBadge.direction,
          label: s._svVerdict.momBadge.label,
          icon: s._svVerdict.momBadge.icon
        } : null
      } : null,
      // ★ 종목라인 점수 표시 분기 보존 (sx_render.js 255줄 _scanResult 체크)
      _scanResult: s._scanResult ? {
        score: s._scanResult.score, action: s._scanResult.action,
        readyScore: s._scanResult.readyScore, entryScore: s._scanResult.entryScore,
        trendScore: s._scanResult.trendScore,
        // [FIX] 시장 레짐 카드 보존 — 새로고침 후 검색결과 복구 시에도 regime 유지.
        //   분석탭 진입 경로(라인 623): qs = stock._scanResult || scrQuickScore(...)
        //   → _scanResult가 있는데 regime만 비면 첫 줄/이유/토글 사라짐.
        regime: s._scanResult.regime || null,
        _regimeAdapt: s._scanResult._regimeAdapt || null,
        _adaptedTh: s._scanResult._adaptedTh || null,
        reasons: s._scanResult.reasons || null
      } : null,
      // ★ 분석탭 진입 시 BT 재계산 skip 가능 (정합성 ↑)
      _btState: s._btState ? {
        state: s._btState.state, entry: s._btState.entry,
        entryDate: s._btState.entryDate, entryIdx: s._btState.entryIdx,
        _isBuySignal: s._btState._isBuySignal, pnl: s._btState.pnl,
        tp: s._btState.tp, sl: s._btState.sl
      } : null,
      _scoreMomentum: s._scoreMomentum || null
    }));
    // S109 bugfix: 현재 시장 키로 저장 (시장 전환 시 각자 보존)
    const key = (typeof searchResultsKey === 'function') ? searchResultsKey(currentMarket) : KEYS.SEARCH_RESULTS;
    const payload = JSON.stringify({results:slim, sortKey, sortDir, ts:Date.now()});
    // [FIX-LEAK] quota 에러 시 자동 청소 + 재시도 (검색 결과는 사용자 핵심 데이터)
    if(typeof _sxSafeSetItem === 'function'){
      _sxSafeSetItem(key, payload);
    } else {
      localStorage.setItem(key, payload);
    }
  }catch(e){ console.warn('saveSearchResults err',e); }
}
// [BUG-2 FIX] sx_screener.html:11743에서 재할당(override)하기 때문에
//   function 선언(non-writable)은 strict 모드에서 실패 위험.
//   var + 함수 표현식으로 선언하여 재할당을 공식 허용.
var openAnalysis = function(idx){
  const stock = searchResults[idx];
  if(!stock) return;
  currentAnalStock = stock;
  // S115 hotfix3: 종목 전환 시 펼침 카드 플래그 초기화 (이전 종목 상태 잔존 방지)
  // [S343] 분석신호 검토를 디폴트 펼침으로 변경 (이전: 둘 다 false → 엔진판단 검증이 S119/S218 자동 실행에서 펼쳐짐)
  //   배경: 사용자가 분석탭 진입 시 "분석신호 검토" 카드를 먼저 보고 싶다고 요청.
  //   동작: 종목 진입할 때마다 분석신호 검토 펼침 + 엔진판단 검증 닫힘으로 초기화.
  //         사용자가 엔진판단 검증 버튼 클릭 시 토글 로직(line 3267 onclick)이 두 플래그를 전환.
  stock._engineVerifyOpen = false;
  stock._3stageOpen = true;
  // [S218 fix1] 종목 전환 시 사이드 이펙트 동기화 플래그 리셋
  //   - runAnalysis는 _runEngineVerify/_loadMoreCandles 등에서 재호출되므로 가드 플래그 필요
  //   - 종목 전환 시(openAnalysis 진입)는 새 종목으로 다시 동기화 필요 → false로 리셋
  //   - runAnalysis 재호출 시는 같은 종목이므로 true 유지 → 무한 루프 방지
  stock._sideEffectsSynced = false;
  // ═══════════════════════════════════════════════════════════════════
  // S118 hotfix: 종목 전환 시 단일검증 탭 결과 완전 초기화
  //   [버그] 이전 종목(예: 알테오젠)에서 엔진판단 검증 실행 → btRenderBasicResult로
  //          #btBasicResult DOM에 결과 렌더됨 → 새 종목(예: LG화학) 선택해도
  //          #btBasicResult는 이전 종목 결과 그대로 유지 → 단일검증 탭 클릭 시
  //          헤더만 LG화학인데 내부엔 알테오젠 결과 보이는 현상
  //   [근본 원인] S115 hotfix3에서 "단일검증 탭 동기화" 기능 추가 시 저장 경로만
  //          만들고 종목 전환 시 리셋 경로를 누락. openAnalysis에서 analBody는
  //          초기화하지만 #btBasicResult는 방치.
  //   [해결] stock._btResult 리셋 + #btBasicResult DOM 비우기 (display:none 복귀)
  //   [영향] 단일검증 탭 진입 시 "백테스트 실행 버튼만 있는 초기 상태"로 돌아감
  //          → 사용자가 다시 [▶ 백테스트 실행] 클릭하거나 엔진판단 검증 클릭으로 갱신
  //   [프로젝트 C 원칙] ⑤(정합 우선): 탭 간 종목 데이터 일관성 보장
  // ═══════════════════════════════════════════════════════════════════
  // (1) stock 객체의 BT 결과 필드 리셋 — 새 종목은 이전 BT 결과 보유하면 안 됨
  stock._btResult = null;
  stock._btScore = null;
  stock._btState = null;
  // S120-2: 강건성 배지 필드도 리셋 (이전 종목 잔존 방지)
  stock._btResult_200 = null;
  stock._robustness = null;
  stock._coreDiag = null; // [S464] 코어(조기청산 제외) 베이스라인
  // (2) 단일검증 탭 결과 영역 DOM 초기화
  const _btBasicResultEl = document.getElementById('btBasicResult');
  if(_btBasicResultEl){
    _btBasicResultEl.innerHTML = '';
    _btBasicResultEl.style.display = 'none';
  }
  // S56: 이전 종목 공시 가중치 리셋
  if(typeof SXE!=='undefined' && SXE.setDisclosureWeight) SXE.setDisclosureWeight(0);

  document.getElementById('analTitle').textContent = stock.name;
  // S75: 탑바 섹터 표시
  const _sectorEl = document.getElementById('analSector');
  if(_sectorEl) _sectorEl.textContent = stock.sector ? stock.sector : '';
  // [S225] 종목명 escape — XSS 방어
  document.getElementById('analBody').innerHTML = `<div class="anal-loading"><div class="spinner"></div><br>${_esc(stock.name)} 분석 중...</div>`;
  document.getElementById('analOverlay').classList.add('show');

  // S99-3: Phase C-1 — TF칩 바 표시 + 멀티TF 병렬 fetch 시작
  _renderAnalTfChips();
  const tfBar = document.getElementById('analTfBar');
  if(tfBar) tfBar.style.display = '';

  // S99-4: Phase C-2 — 모드칩 바 표시
  _renderAnalModeChips();
  const modeBar = document.getElementById('analModeBar');
  if(modeBar) modeBar.style.display = '';

  // S200: 수동 매매 시뮬 — 종목분석 탭 진입 시 매수/매도 버튼 & 포지션 박스 갱신
  try{ if(typeof mtRefreshAnalBar === 'function') mtRefreshAnalBar(); }catch(_){}

  (window._sxTrackedTimeout || setTimeout)(()=>runAnalysis(stock), 500);
  // 멀티TF 백그라운드 fetch (기본 TF 외)
  _fetchMultiTfBackground(stock);
}; // [BUG-2 FIX] 함수 표현식이므로 세미콜론 필요

function closeAnalysis(){
  // S128: 인덱스 관심탭에서 진입한 경우 인덱스로 바로 복귀
  //   - _sxFromIdxActive 플래그가 true면 스크리너 중간 단계 생략
  //   - history.back() = 브라우저의 이전 페이지 = 인덱스
  if(window._sxFromIdxActive){
    window._sxFromIdxActive = false;
    try{ history.back(); }catch(_){
      // fallback: history.back 실패 시 URL 직접 이동
      window.location.href = 'index.html';
    }
    return;
  }
  document.getElementById('analOverlay').classList.remove('show');
  currentAnalStock = null;
  // [WEAK-2 FIX] 분석 오버레이 닫힐 때 대기 중 타이머 모두 취소 (고스트 렌더 방지)
  try{ if(typeof window._sxClearAllTimers === 'function') window._sxClearAllTimers(); }catch(_){}
  // S99-3: TF칩 바 숨기고 캐시 클리어
  const tfBar = document.getElementById('analTfBar');
  if(tfBar) tfBar.style.display = 'none';
  Object.keys(_analTFCache).forEach(k => delete _analTFCache[k]);
  // S99-4: 모드칩 바 숨김
  const modeBar = document.getElementById('analModeBar');
  if(modeBar) modeBar.style.display = 'none';
  // S200: 포지션 박스도 숨김
  const posBox = document.getElementById('analPositionBox');
  if(posBox) posBox.classList.remove('show');
}

// [S437/S442] RS용 지수 시계열 fetch + 캐시 — 지수당 1회 받아 모든 종목이 공유(10분 TTL, sym별 캐시).
//   워커 /proxy 경유 야후 chart API(홈탭과 동일 패턴). 국내=코스피 ^KS11 / 코스닥 ^KQ11(S442 분리), 미국=^GSPC. 코인 보류.
//   실패 시 null 반환 → RS 생략(안전, 기존 분석 흐름 무영향).
const _rsIndexCache = {};
// [S442] 코스닥 종목 판별 — stock.market(KOSPI/KOSDAQ 또는 코스피/코스닥) 우선, 없으면 OracleData code 조회 폴백.
function _isKosdaqStock(stock){
  if(!stock) return false;
  const m = String(stock.market || stock._mkt || '');
  if(m === 'KOSDAQ' || m === '코스닥') return true;
  if(m === 'KOSPI' || m === '코스피') return false;
  try {
    if(typeof OracleData !== 'undefined' && OracleData.get){
      const _kq = OracleData.get('kosdaq') || [];
      if(_kq.some(s => s.code === stock.code)) return true;
    }
  } catch(_){}
  return false; // 불명 시 코스피 기준
}
async function _fetchIndexCloses(market, stock){
  let sym = null;
  if(market === 'us') sym = '^GSPC';
  else if(market === 'coin') sym = 'KRW-BTC'; // [S443] 코인은 BTC 대비 강도
  else sym = _isKosdaqStock(stock) ? '^KQ11' : '^KS11'; // [S442] 코스닥 분리
  if(!sym) return null;
  const now = Date.now();
  const cached = _rsIndexCache[sym];
  if(cached && (now - cached.ts) < 10 * 60 * 1000) return cached.closes;
  try {
    const base = (typeof WORKER_BASE !== 'undefined') ? WORKER_BASE : 'https://stock-signal-proxy.cheaheechang.workers.dev';
    let closes;
    if(market === 'coin'){
      // [S443] 코인 지수 = 업비트 KRW-BTC 일봉 (최신 먼저 → reverse로 끝이 최신). trade_price=종가.
      const url = `${base}/upbit/candles?market=KRW-BTC&type=days&count=130`;
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (j.data || []);
      closes = arr.map(c => parseFloat(c.trade_price || c.close || 0)).filter(c => c > 0).reverse();
    } else {
      const yf = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=6mo`;
      const url = `${base}/proxy?url=${encodeURIComponent(yf)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const j = await r.json();
      closes = (j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(c => c != null);
    }
    if(closes && closes.length){ _rsIndexCache[sym] = { closes, ts: now }; return closes; }
  } catch(e){ console.log('[RS] 지수 시계열 fetch 실패:', e && e.message); }
  return null;
}

async function runAnalysis(stock){
 try{ // S63: 전체 try-catch — 에러 시 무한로딩 방지
  // [S343] 분석탭 진입 시 "분석신호 검토" 기본 펼침 — 사용자 첫 진입에만 적용 (의도 보존)
  //   배경: 이전엔 S119/S218 자동 실행이 _engineVerifyOpen=true로 엔진판단 검증 카드를 펼쳐서
  //         사용자가 분석탭 들어오면 항상 엔진판단 검증이 디폴트로 보였음.
  //   변경: BT는 백그라운드 실행 유지 + 카드는 분석신호 검토를 디폴트 노출.
  //   조건: 두 카드 상태가 모두 미설정인 첫 진입에서만 디폴트 적용 — 사용자가 한 번 닫거나
  //         엔진판단 검증을 직접 클릭한 적이 있으면 그 상태 보존.
  if(stock._3stageOpen === undefined && stock._engineVerifyOpen === undefined){
    stock._3stageOpen = true;
  }
  // [캐시 정리] 분석탭은 한 번에 한 종목만 분석 → 다른 종목의 sx_ext_* 캐시 정리
  //   (현재 종목의 봉수 단계 캐시는 모두 유지 → 재분석 시 캐시 hit)
  //   정리 함수 정의: sx_screener.html `_sxCleanupExtCacheForOtherStocks`
  if(typeof _sxCleanupExtCacheForOtherStocks === 'function'){
    try{
      // 시장 키 정규화 (KOSPI/KOSDAQ/ETF → kr)
      const _curMkt = (typeof _normalizeMarket === 'function')
        ? _normalizeMarket(stock.market || stock._mkt || (typeof currentMarket !== 'undefined' ? currentMarket : 'kr'))
        : (stock.market || 'kr');
      _sxCleanupExtCacheForOtherStocks(stock.code, _curMkt);
    }catch(_){/* 정리 실패해도 분석은 계속 */}
  }
  // [캐시 정리] 옵티마이저 활성 외 종목의 SX_CDL_* 캐시 정리
  //   정리 함수 정의: sx_optimizer.js `_cleanCandleCacheForOtherStocks`
  //   분석탭 진입은 빈번하니 이때 함께 청소 (사용자 추가 액션 없이 자연스럽게)
  if(typeof _cleanCandleCacheForOtherStocks === 'function'){
    try{ _cleanCandleCacheForOtherStocks(); }catch(_){}
  }
  // [Phase 2-fix] 재무 데이터 보강 — 다양한 진입 경로에서 _financial 누락 케이스 대응
  //   대상 케이스:
  //     1) 스캔 백그라운드 fetch가 아직 미완료 (라인 4104~ 참고: .then 비대기)
  //     2) sxSelectStock 직접 진입 (라인 7771: stock 객체에 _financial 자체 없음)
  //     3) 엑셀/관심종목 → 종목 분석 진입 (sxSelectStock 경유 → 동일)
  //   처리: kr 종목이고 _financial 없거나 빈껍데기(_source==='none')일 때만 await fetch
  //   캐시(_finCache, FIN_TTL=24h)가 잡혀있으면 즉시 반환 → 두 번째 진입부터 빠름
  //   [Phase 2-fix2] sx_screener.html 측에서 빈 결과는 캐시 안 함 → 일시적 실패 시 재시도 가능
  //   실패해도 분석 자체는 진행되도록 try-catch
  if (currentMarket === 'kr' && stock.code && (!stock._financial || stock._financial._source === 'none')) {
    if (typeof fetchFinancialData === 'function') {
      try {
        const fin = await fetchFinancialData(stock.code, stock.market || 'kr');
        if (fin) stock._financial = fin;
      } catch (_) { /* 재무 fetch 실패해도 분석은 계속 진행 */ }
    }
  }
  // [S338] KOSIS 시장평균 PER 사전 fetch — 한국 종목 분석 시 시총 규모별 PER 폴백용
  //   localStorage 캐시(7일) 있으면 즉시, 없으면 워커 호출 → window._kosisMarketPer에 저장
  //   valuationJudge 호출 시점에 동기적으로 활용 (await 후 IIFE 진입)
  //   실패해도 분석은 계속 진행 (valuationJudge가 자체 폴백 보유)
  if (currentMarket === 'kr' && typeof fetchKosisMarketPer === 'function') {
    try { await fetchKosisMarketPer(); } catch(_) {}
  }
  // [S268] US 종목 보강 — 사용자가 본 첫 화면(분석탭) 시총/현재가/거래량 모두 0 문제 해결
  //   배경: sxSelectStock 직접 진입 시 stock = {price:0, changeRate:0, volume:0, marketCap:0, ...}
  //   기존: KR만 fetchFinancialData 보강 → US는 모든 시세 0인 채로 분석탭 진입
  //   해결: US도 fetchFinancialData 호출 → 네이버 us-fundamental 응답으로 stock 시세/메타 모두 보강
  //   캐시 정책: _finCache는 24h TTL이지만 stock 시세 필드는 매 진입마다 0으로 리셋되므로
  //              _financial 캐시 hit이어도 stock 보강 로직은 매번 수행 (조건 분리)
  if (currentMarket === 'us' && stock.code) {
    // 1) _financial 캐시 미스 시만 fetch (24h 캐시 hit이면 즉시)
    if (!stock._financial || stock._financial._source === 'none') {
      if (typeof fetchFinancialData === 'function') {
        try {
          const fin = await fetchFinancialData(stock.code, 'us');
          if (fin) stock._financial = fin;
        } catch (_) { /* 실패해도 분석 계속 */ }
      }
    }
    // 2) stock 자체 필드 보강 — _financial._naverData가 있으면 매 진입 시 적용
    //    (재진입 시 캐시 hit한 _financial이라도 stock은 sxSelectStock에서 0으로 새로 만들어짐)
    const _nd = stock._financial && stock._financial._naverData;
    if (_nd) {
      if (_nd.regularMarketPrice != null && (stock.price == null || stock.price === 0)) stock.price = _nd.regularMarketPrice;
      if (_nd.regularMarketChangePercent != null && (!stock.changeRate || stock.changeRate === 0)) stock.changeRate = _nd.regularMarketChangePercent;
      if (_nd.volume != null && (!stock.volume || stock.volume === 0)) stock.volume = _nd.volume;
      if (_nd.marketCap != null && (!stock.marketCap || stock.marketCap === 0)) stock.marketCap = _nd.marketCap;
      // 거래대금 — 네이버 raw는 "62.4억 USD" 한국식 표기. 백만원 단위 환산은 sx_render에서 별도 처리하므로
      //   stock._tradeAmountDisplay에 원본 보관 (분석탭에서 그대로 표시 가능, [S270]에서 활용)
      if (_nd.tradingValueDisplay && !stock._tradeAmountDisplay) stock._tradeAmountDisplay = _nd.tradingValueDisplay;
      // 메타 정보 — 한글명/로고/시총 원화환산/거래소 등 ([S270] 분석탭 렌더링 차별화용)
      if (_nd.stockNameKor && !stock._nameKor) stock._nameKor = _nd.stockNameKor;
      if (_nd.industry && !stock.sector) stock.sector = _nd.industry;
      if (_nd.logoUrl && !stock._logoUrl) stock._logoUrl = _nd.logoUrl;
      if (_nd.marketCapKrwDisplay && !stock._marketCapKrwDisplay) stock._marketCapKrwDisplay = _nd.marketCapKrwDisplay;
      if (_nd.marketCapDisplay && !stock._marketCapDisplay) stock._marketCapDisplay = _nd.marketCapDisplay;
      if (_nd.exchange && !stock._exchange) stock._exchange = _nd.exchange;
      if (_nd.exDividendDate && !stock._exDividendDate) stock._exDividendDate = _nd.exDividendDate;
      if (_nd.marketStatus && !stock._marketStatus) stock._marketStatus = _nd.marketStatus;
      if (_nd.listedShares && !stock._listedShares) stock._listedShares = _nd.listedShares;
    }
  }
  const _analCount = (currentMarket==='kr' && window._kisEnabled) ? 500 : 200; // S67: KIS 500봉
  let indicators = stock._indicators || null;
  // [S371] worker → 메인 전달 시 maAlign 같은 깊은 객체 누락 가능 → 누락 시 재계산 트리거
  //   증상: 전광판 기술지표 섹션에 "이평선 (?)" 표시되며 7단/3단 점수 안 나옴
  //   원인: sx_scan_worker가 s._indicators로 저장하지만 postMessage 직렬화 시 일부 필드 손실
  //   해결: indicators.maAlign 부재 시 indicators=null로 만들어 아래 calcIndicators 재호출 분기 진입
  if(indicators && !indicators.maAlign) indicators = null;
  let _analCandles = null; // S67: BT 연동용 캔들 보존
  if(!indicators){
    try{
      // S108 Phase 3-B-9a-ext: 이미 확장된 캔들(stock._lastAnalCandles)이 있으면 재사용
      //   _loadMoreCandles에서 runAnalysis 재호출 시 200봉 재fetch되어 확장 데이터가 날아가는
      //   문제 방지. _analCount보다 많은 봉을 이미 보유한 경우만 재사용.
      //   (_analCount = 200 기본, KIS 모드 시 500 — 그보다 많은 400/600봉은 수동/자동 확장 결과)
      // [S228] 재사용 캔들도 무결성 재검증 — _lastAnalCandles에 비정상 봉이 박혀있을 수 있음
      //   증상: SK하이닉스/삼성전기/현대차 등 마지막 봉 {open:0, low:0, high/close:정상}으로 캐시됨
      //         → 차트 wick 0까지 뻗어 빨간 세로선 + 거래대금 close×volume = 526억/1억 등
      //   원인: Naver/KIS API가 장외/일요일에 부분 데이터 반환 → [S220] 패치 후에도 메모리 캐시된 옛 데이터 잔존
      //   해결: 재사용 시점 + fetch 결과 저장 시점에 _sxIsValidCandle 필터링 → 비정상 봉만 제거 (전체 폐기 X)
      // [S342] 캔들 캐시 TTL 60초 — 현재가 고정 문제 해결
      //   배경: 분석탭 재진입 시 캔들 캐시 hit으로 fetch skip → 현재가/마지막 캔들이 옛 시점 그대로
      //   증상: 사용자가 시간 지나 분석탭 재진입해도 같은 가격 표시 (실시간과 안 맞음)
      //   해결: _lastAnalCandlesTs로 저장 시점 기록 → 60초 경과 시 강제 재fetch (가격 자동 갱신)
      //   영향: 1분 TTL이라 모바일 데이터 부담 적음, 가격은 충분히 신선
      const CANDLE_CACHE_TTL = 60 * 1000;
      const _candleAge = stock._lastAnalCandlesTs ? Date.now() - stock._lastAnalCandlesTs : Infinity;
      const _candleCacheValid = stock._lastAnalCandles && stock._lastAnalCandles.length > _analCount && _candleAge < CANDLE_CACHE_TTL;
      let candles;
      if(_candleCacheValid){
        // [S228] 재사용 직전 무결성 재검증 — 비정상 봉만 제거 (전체 폐기 X, 캐시 효율 유지)
        const _origLen = stock._lastAnalCandles.length;
        const _validated = (typeof _sxIsValidCandle === 'function')
          ? stock._lastAnalCandles.filter(_sxIsValidCandle)
          : stock._lastAnalCandles;
        if(_validated.length !== _origLen){
          console.warn(`[S228] _lastAnalCandles 재사용 검증: ${_origLen}봉 → ${_validated.length}봉 (비정상 ${_origLen - _validated.length}개 제거)`);
          stock._lastAnalCandles = _validated;
        }
        candles = _validated;
        console.log(`[runAnalysis] 확장 캔들 재사용: ${candles.length}봉 (age=${Math.round(_candleAge/1000)}s, fetch skip)`);
      } else {
        if(stock._lastAnalCandlesTs){
          console.log(`[S342] 캔들 캐시 만료(${Math.round(_candleAge/1000)}s) → 재fetch (가격 갱신)`);
        }
        candles = await fetchCandles(stock.code, _analCount, _analTF);
        // [S342] 항상 timestamp 갱신 — 캐시 hit/miss 무관하게 fetch 직후엔 신선
        if(candles && candles.length > 0){
          stock._lastAnalCandles = candles;
          stock._lastAnalCandlesTs = Date.now();
        }
      }
      _analCandles = candles;
      // S200: 캔들 확보 직후 포지션 박스 현재가 갱신 (매수 중이라면)
      try{ if(typeof mtRefreshAnalBar === 'function') mtRefreshAnalBar(); }catch(_){}
      if(candles && candles.length >= 20){
        indicators = calcIndicators(candles, _analTF);
        // [S437] RS(상대강도) — 일봉 기준만. 시장지수 시계열 fetch 후 종목 vs 지수 수익률 차 계산. 실패 시 생략(안전).
        if(_analTF === 'day'){
          try {
            const _mkt = (typeof currentMarket !== 'undefined') ? currentMarket : 'kr';
            const _idxCloses = await _fetchIndexCloses(_mkt, stock);
            if(_idxCloses && _idxCloses.length && indicators){
              const _stkCloses = candles.map(c => c.close);
              indicators.rs = (typeof SXE !== 'undefined' && SXE.calcRS) ? SXE.calcRS(_stkCloses, _idxCloses) : null;
            }
          } catch(_eRS){ /* RS 실패 시 생략 */ }
        }
        // [v3.13 KIS-PRICE-FIX / S342 확장] 분석탭 진입 시 최신 캔들 close로 현재가 보강
        //   배경: KRX market-cap 캐시 + KIS 미연결 환경에서 분석탭 재진입 시 옛 가격 표시
        //   원본 KIS-PRICE-FIX는 KIS 활성 시만 작동 → KIS 미연결 사용자는 적용 안 됨
        //   [S342] KIS 조건 제거 — 일봉 모드면 KIS 무관하게 마지막 캔들 close로 stock.price 보강
        //   주의: 코인/미국은 별도 path (네이버/Yahoo)라 제외, 한국 일봉만 적용
        if(currentMarket === 'kr' && _analTF === 'day' && candles.length > 0){
          const _lastBar = candles[candles.length - 1];
          if(_lastBar && _lastBar.close > 0){
            const _kisLatestPrice = _lastBar.close;
            // 차이가 0.1% 이상이면 KIS 가격으로 덮어쓰기 (오차 보정)
            if(stock.price <= 0 || Math.abs(stock.price - _kisLatestPrice) / _kisLatestPrice > 0.001){
              const _prevPrice = stock.price;
              stock.price = _kisLatestPrice;
              // 변동률 재계산 (전봉 close 기준)
              if(candles.length >= 2){
                const _prevBar = candles[candles.length - 2];
                if(_prevBar && _prevBar.close > 0){
                  stock.changeRate = ((_kisLatestPrice - _prevBar.close) / _prevBar.close) * 100;
                }
              }
              console.log(`[S342 PRICE-FIX] ${stock.code} 가격 보강: ${_prevPrice.toLocaleString()} → ${_kisLatestPrice.toLocaleString()}원 (${window._kisEnabled?'KIS':'Naver/KRX'} 최신 캔들)`);
            }
            // [S220] 거래대금/거래량 비정상값 보강 — KRX market-cap이 장외/일요일에 부분값 반환하는 경우
            //   증상: SK하이닉스(168.6만원) 거래대금 526억 = close × 31,214주 → volume이 비정상
            //         삼성전기(91.4만원) 거래대금 1억 = close × ~110주 → volume이 비정상
            //   탐지: stock 거래량 vs KIS 마지막 봉 거래량 비교 — 차이 10배 이상이면 KIS 봉 사용
            //   _lastBar는 _sxIsValidCandle 통과 → high/low/close 무결성 보장된 봉
            if(_lastBar.volume > 0){
              const _kisVol = _lastBar.volume;
              const _stockVol = stock.volume || 0;
              // 거래량이 비정상으로 작거나(0) KIS 봉 대비 10배 이상 차이나면 보강
              if(_stockVol === 0 || (_kisVol > 0 && _stockVol > 0 && _kisVol / _stockVol > 10)){
                const _prevVol = _stockVol;
                const _prevTA = stock.tradeAmount || 0;
                stock.volume = _kisVol;
                stock.tradeAmount = (_kisLatestPrice * _kisVol) / 1000000; // 백만원 단위
                console.log(`[S220 VOL-FIX] ${stock.code} 거래량/거래대금 보강: vol ${_prevVol.toLocaleString()} → ${_kisVol.toLocaleString()}주, 거래대금 ${_prevTA.toLocaleString()} → ${stock.tradeAmount.toLocaleString()}백만원`);
              }
            }
          }
        }
        // S49: 직접검색 시 price 보강
        if(stock.price===0 && indicators._advanced){
          const adv = indicators._advanced;
          if(adv.price) stock.price = adv.price;
          if(adv.rows && adv.rows.length>=2){
            const last = adv.rows[adv.rows.length-1];
            const prev = adv.rows[adv.rows.length-2];
            if(!stock.price && last.close) stock.price = last.close;
            if(stock.changeRate===0 && prev.close>0) stock.changeRate = ((last.close-prev.close)/prev.close)*100;
            if(stock.volume===0 && last.volume) stock.volume = last.volume;
            if(stock.tradeAmount===0 && last.close && last.volume) stock.tradeAmount = (last.close * last.volume) / 1000000;
          }
        }
        // [Phase 4-E] 외국인 지분 보강 — sxSelectStock 직접 진입 시 foreignRatio:0으로 박힘
        //   네이버 sise 응답에는 외국인소진율(foreignExhaustion)이 칸들 row마다 포함됨 (fetchCandles 라인 5491)
        //   currentMarket==='kr' 이고 stock.foreignRatio가 0/null/undefined일 때만 마지막 캔들에서 보강
        //   가장 최신 봉의 외국인소진율 = 현재 외국인 지분율과 동등 (네이버 정의)
        if(currentMarket==='kr' && (!stock.foreignRatio || stock.foreignRatio===0) && candles.length>0){
          const _lastCandle = candles[candles.length-1];
          if(_lastCandle && _lastCandle.foreignExhaustion > 0){
            stock.foreignRatio = _lastCandle.foreignExhaustion;
          }
        }
      }
    }catch(e){ console.warn('analysis candle err', e); }
  }
  // 고급 분석 (quickScore 이미 있으면 재사용)
  // [S349] 스캔 시점 TF와 현재 분석 TF가 일치할 때만 _scanResult 재사용 — 다르면 TF별로 재계산.
  //   배경: 스캔(예 일봉)으로 잡은 _scanResult를 분석탭에서 4시간으로 봐도 그대로 써서
  //         반등/반등강도/추세방향 점수가 스캔 TF에 고정되던 버그. 차트·지표·BT는 TF별 계산되는데
  //         이 점수만 안 바뀌어 불일치. _scanTF 일치 검사로 정확한 TF별 점수 보장.
  let qs = (stock._scanResult && stock._scanResult._scanTF === _analTF) ? stock._scanResult : null;
  if(!qs && indicators && indicators._advanced){
    qs = scrQuickScore(indicators._advanced.rows, _analTF, currentMarket);
  }
  // [S452] 재무건전성 안전필터 — 분석탭 전용 스위치. scrQuickScore/_scanResult는 부채비율 미반영(ind._debtRatio 미세팅)이라
  //   DART 데이터(stock._financial.debtRatio)로 여기서 적용. qs._safetyViol(C감독관 등급 캡, render 3965) + action/reasons 동시 반영.
  //   워커(스캐너)는 render 미사용 → 자연히 종목검색에서 제외. 토글 SXE._safetyFlags.debtRatio 따름. 캐시(_scanResult) 변형 방지로 사본 생성.
  try {
    const _sfDebt = (typeof SXE!=='undefined' && SXE._safetyFlags && ('debtRatio' in SXE._safetyFlags)) ? SXE._safetyFlags.debtRatio : true;
    const _dr = stock._financial && stock._financial.debtRatio;
    if (_sfDebt && qs && _dr != null && _dr >= 200) {
      qs = Object.assign({}, qs, {
        _safetyViol: (Array.isArray(qs._safetyViol) ? qs._safetyViol : []).concat('🔒부채비율'),
        action: qs.action === 'BUY' ? 'HOLD' : qs.action,
        reasons: (qs.reasons || []).concat('🔒부채비율')
      });
    }
  } catch(_){}
  const scores = calcEnhancedScores(stock, indicators);

  // [S393→S360] 코인 거시지표 — 워커 /coin/macro 한 번 호출로 시장심리·도미넌스·김프 동시 갱신
  if(currentMarket === 'coin'){
    _fetchCoinMacro().then(m=>{
      if(!m) return;
      if(m.fearGreed && m.fearGreed.v!=null) _sxBoardSetAsync('fund','시장심리',m.fearGreed.v,{byValue:true});
      const d = _domScoreFromPct(stock, m.dominance);
      if(d) _sxBoardSetAsync('fund','도미넌스',d.v,{byValue:true,_dom:d._dom,_isBtc:d._isBtc});
      const k = _kmScoreFromPct(m.kimchi);
      if(k) _sxBoardSetAsync('fund','김프',k.v,{byValue:true,_km:k._km});
    }).catch(()=>{});
    // [S357] 코인 공시(상폐) — '시장·리스크' 전광판 + 부문별 점수 카드 동시 갱신 (별도 /news/crypto)
    _computeCoinDisclosureScore(stock).then(cd=>{
      if(cd==null) return;
      _sxBoardSetAsync('fund','공시',cd.v,{byValue:true});
      const sectorArea = document.getElementById('discSectorArea');
      if(sectorArea && cd.itp){
        const ds = cd.itp.sectorScore;
        const dCls = ds>=55?'bullish':ds<=45?'bearish':'neutral';
        sectorArea.innerHTML = `
          <div class="anal-row"><span class="al">공시</span><span class="ar ${dCls}">${ds}</span></div>
          <div class="itp-card show" style="margin-top:2px;margin-bottom:6px">
            <span class="itp-label ${cd.itp.tone==='danger'?'danger':cd.itp.tone}">${cd.itp.sectorGrade}</span>
            <div>${cd.itp.sectorText}</div>
          </div>`;
      }
    }).catch(()=>{});
  }
  // [S395] 미국 섹터(SPDR ETF 순위) 비동기 — 펀더 '섹터' 도넛
  if(currentMarket === 'us' && stock.sector){
    _computeUsSectorScore(stock.sector).then(sec=>{
      if(sec!=null) _sxBoardSetAsync('fund','섹터',sec.v,{byValue:true,_rank:sec.rank,_total:sec.total,_etf:sec.etf});
    }).catch(()=>{});
  }

  // S56: 단일종목 분석 시 DART 공시 키워드 fetch (비동기, non-blocking 렌더)
  if(currentMarket === 'kr' && stock.code){
    // [S389] 투자자 수급(외인/기관) 비동기 — 전광판 '투자자수급' 점수 + 적정가 밑 당일 규모
    if(typeof fetchInvestorData==='function'){
      fetchInvestorData(stock.code).then(inv=>{
        if(!inv) return;
        const _is = _computeInvestorScore(inv);
        if(_is!=null) _sxBoardSetAsync('flow','투자자수급',_is,{byValue:true});
        _renderInvestorRow(inv);
      }).catch(()=>{});
    }
    // [S393] 섹터 강세(업종 레이더 순위) 비동기 — 펀더 '섹터' 도넛
    //   종목 industryCode ↔ sise_group no 숫자 코드 매칭 (한글 형식 무관)
    if(stock.code){
      _computeSectorScore(stock.code).then(sec=>{
        if(sec!=null) _sxBoardSetAsync('fund','섹터',sec.v,{byValue:true,_rank:sec.rank,_total:sec.total,_sname:sec.name});
      }).catch(()=>{});
    }
    fetchDisclosureKeywords(stock.code).then(kws => {
      if(!kws || !kws.length) kws = [];
      stock._disclosureKw = kws;
      // 해석 생성
      if(typeof SXI!=='undefined' && SXI.advDisclosure){
        stock._disclosureItp = SXI.advDisclosure(kws);
      }
      // 엔진 가중치 반영
      if(typeof SXE!=='undefined' && SXE.calcDisclosureWeight){
        const dw = SXE.calcDisclosureWeight(kws);
        SXE.setDisclosureWeight(dw);
      }
      // 배지 + 부문별 + 종합평을 동적으로 업데이트
      _renderDisclosureUI(stock, scores, indicators, qs);
    }).catch(()=>{});
  }

  // [S323] 단일종목 분석 시 SEC 공시 fetch (미국 종목) — DART 패턴 미러
  //   한국 'kr' 분기와 동등: filings 받아 advDisclosureSec → _disclosureItp → _renderDisclosureUI
  //   결과 형식이 한국 advDisclosure와 동일하므로 렌더링 코드는 그대로 재사용
  if(currentMarket === 'us' && stock.code && typeof fetchSecDisclosure === 'function'){
    fetchSecDisclosure(stock.code).then(filings => {
      if(!filings) filings = [];
      stock._disclosureKw = filings;        // 한국 _disclosureKw와 같은 슬롯 (filter 함수 호환)
      if(typeof SXI!=='undefined' && SXI.advDisclosureSec){
        stock._disclosureItp = SXI.advDisclosureSec(filings);
      }
      // 미국은 별도 disclosure 가중치 미적용 (한국 DART 키워드 기반과 다름)
      // 향후 SEC item별 엔진 가중치 추가 가능
      _renderDisclosureUI(stock, scores, indicators, qs);
    }).catch(()=>{});
  }

  // S43: 부문별 점수 해석, MA 배열 상세, 기본 정보 의미 해석
  const sectorItp = (typeof SXI!=='undefined') ? SXI.sectorScores(scores, stock, indicators) : null;
  const maAlignItp = (typeof SXI!=='undefined' && indicators) ? SXI.maAlignment(indicators) : null;
  const basicItp = (typeof SXI!=='undefined') ? SXI.basicInfo(stock) : null;

  // S67: 분석탭↔BT 연동 — 동일 캔들로 BT 실행 → 매매전략 점수 표시
  let _analBtScore = null, _analBtResult = null;
  let _analBtState = null; // S95: BT 현재 상태
  try{
    const btCandles = _analCandles || (indicators && indicators._advanced && indicators._advanced.rows) || null;
    if(btCandles && btCandles.length >= 60 && typeof SXE!=='undefined' && SXE.runBtEngine){
      const rawRows = btCandles.map(c=>({date:c.date,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}));
      const _btParams = typeof btGetParams === 'function' ? btGetParams() : {};
      // [S221] applyRegimeAdjust:true 명시 — 단일검증/스캐너와 동일 정책으로 정합 회복.
      //   〔이력〕 이전: opts 미전달 → analysis_engine L3949 엄격비교(=== true)로 false 떨어짐 →
      //          레짐 ON 시 분석탭만 보정 미적용 → 단일검증 결과와 불일치.
      const btR = SXE.runBtEngine(rawRows, _analTF, _btParams, { applyRegimeAdjust: true });
      if(btR && !btR.error){
        try{ btR._regimeBuckets = (typeof _btRegimeBreakdown==='function')?_btRegimeBreakdown(rawRows, btR.trades):null; }catch(_rg){} // [S546] 레짐 버킷 (재진입 유지)
        _analBtResult = btR;
        _analBtScore = calcBtScore(btR, stock);
        stock._btResult = btR;
        stock._btScore = _analBtScore;
        // S95: 현재 상태 판정
        const _curPrice = btCandles[btCandles.length-1]?.close || stock.price || 0;
        _analBtState = typeof btGetCurrentState === 'function' ? btGetCurrentState(btR, _curPrice) : null;
        stock._btState = _analBtState;
        // S103-fix7 Phase3-B-2: 점수 기반 es×bs 4분류 _btAction 계산 제거
        //   (진단 결과 14종목 14/14 정합 실패 → 점수 기반 폐기)
        //   _btAction은 _svVerdict 생성 후(971줄 근처)에 C 매핑으로 설정

        // S107 Phase 3-B-9a: 데이터 부족 자동 확장 (Reactive Loading)
        //   S108 Phase 3-B-9a-ext: 확장 단계 플래그로 전환 (bool → 0/1/2 stage)
        //     stage 0: 스캐너 기본 200봉
        //     stage 1: 자동 확장 완료 400봉 (이 블록에서 설정)
        //     stage 2: 수동 확장 완료 600봉 (? 버튼 클릭, _loadMoreCandles에서 설정)
        //   감지 조건: 현재 세션 BT 거래수가 BT_MIN_TRADES(10회) 미만
        //   확장 대상: 분석탭 진입한 해당 종목만 (스캐너는 기존 200봉 유지)
        //   확장 크기: +200봉 (총 400봉, Upbit 하드 제한 고려)
        //   시장 지원: coin (Upbit to) / kr (Naver 날짜 조정) / us (S114: Yahoo range=2y로 이미 400봉+ 확보)
        const _btTradesNow = btR.totalTrades ?? 0;
        const _extMkt = stock._mkt || stock.market || currentMarket;
        // S114: 미국 시장 포함. 미국은 sx_screener.html fetchCandles에서 range=2y(일봉)/10y(주봉)/max(월봉)로 이미 충분한 봉수 확보
        const _extSupported = (_extMkt === 'coin' || _extMkt === 'kr' || _extMkt === 'us');
        // S108: stage 플래그 하위 호환 — 기존 bool true면 stage 1로 간주
        const _curStage = stock._analCandlesExtendedStage || (stock._analCandlesExtended ? 1 : 0);
        console.log(`[S114 DBG] 확장 감지 — trades=${_btTradesNow}, stage=${_curStage}, market=${_extMkt}, supported=${_extSupported}, fetchFn=${typeof fetchCandlesExtended}, rowsLen=${rawRows.length}`);
        // S114: 조건 변경 — 기존 "거래수 < 10" 조건 제거, 무조건 400봉 기본화
        //   원칙: 분석탭 진입 시 항상 400봉 기준 BT 실행 → 거래수 충분히 확보
        // [S168 600봉 통일] 미국 시장 분기 제거 — 한국/코인과 동일한 fetchCandlesExtended 경로 사용
        //   미국도 이제 200봉씩 분할 호출 (period1/period2) → 600봉 확장 가능
        if(_curStage < 1 && _extSupported && rawRows.length > 0){

          // 시장 통일: 한국/코인/미국 모두 200봉 → 2초 대기 → +200봉 확장
          if(typeof fetchCandlesExtended === 'function'){
            console.log(`[S114/S168] ★ 자동 확장 시작 (stage 0 → 1): 시장=${_extMkt}, 현재 ${rawRows.length}봉`);
            stock._analCandlesExtendedStage = 1;  // 먼저 설정해서 중복 호출 방지
            stock._analCandlesExtended = true;    // 하위 호환

            try{
              const _oldestDate = rawRows[0].date;
              console.log(`[S114] oldestDate=${_oldestDate}, 2초 대기 시작...`);
              // S114: 실제 2초 대기 추가 (기존엔 주석만 있고 실제 대기 없음 — 봇 감지 회피)
              await new Promise(r => setTimeout(r, 2000));
              console.log(`[S114] 2초 대기 완료, 확장 API 호출...`);
              const _extraCandles = await fetchCandlesExtended(stock.code, _analTF, _oldestDate, 200);
              console.log(`[S114] 확장 API 응답: ${_extraCandles ? _extraCandles.length + '봉' : 'null'}`);
              if(_extraCandles && _extraCandles.length > 0){
                console.log(`[S114] 추가 데이터 첫 봉: ${_extraCandles[0].date}, 마지막 봉: ${_extraCandles[_extraCandles.length-1].date}`);
                // 병합: [과거 200봉, 기존 200봉] = 오래된 순 정렬 유지
                const _mergedRows = [..._extraCandles, ...rawRows];
                console.log(`[S114] 병합 완료: ${_extraCandles.length}봉 + ${rawRows.length}봉 = 총 ${_mergedRows.length}봉`);

                // ═══════════════════════════════════════════════════════
                // S112 방향 3: 확장 후 "분석 + BT 재계산" (정합성 보장)
                //
                // 문제: 기존엔 BT만 400봉 재실행, 분석 점수는 200봉 그대로 → 불일치
                //       (LG에너지솔루션: 분석 12회 vs BT 23회 같은 현상)
                //
                // 해결: 확장된 캔들을 stock._lastAnalCandles에 저장 후 runAnalysis 재귀 호출
                //       재귀 진입 시 _lastAnalCandles 재사용(fetch skip)하여
                //       calcIndicators → calcEnhancedScores → BT → 모두 새 봉수 기준으로 재계산
                //       → 분석 점수와 BT 거래 수가 "같은 시간의 같은 캔들" 사용
                //
                // 무한 루프 방지: stock._analCandlesExtendedStage = 1 이미 설정됨
                //                 → 재귀 진입 시 _curStage >= 1 조건으로 확장 재시도 안 함
                // ═══════════════════════════════════════════════════════
                stock._lastAnalCandles = _mergedRows.map(c => ({...c})); // 깊은 복사
                console.log(`[S114/S112] ★ 확장 완료 — runAnalysis 재귀 호출로 분석+BT 재계산 (${_mergedRows.length}봉)`);
                return runAnalysis(stock); // ← 재귀 호출: 전체 재계산 후 렌더
              } else {
                console.log(`[S114] ⚠ 확장 실패 (null 또는 빈 배열) — 기존 데이터 유지`);
              }
            }catch(extErr){
              console.error('[S114] 자동 확장 예외:', extErr);
              // 에러 시 기존 결과 유지 (그대로 진행)
            }
          }
        } else {
          console.log(`[S114 DBG] 자동 확장 건너뜀 — stage=${_curStage}, supported=${_extSupported}, rowsLen=${rawRows.length}`);
        }
      }
    }
  }catch(btErr){ console.warn('[runAnalysis] BT err', btErr); }

  // S79: 점수 모멘텀 계산 (과거 5봉 추이)
  // [2026-04 FIX] 스캔워커가 이미 계산해서 넘긴 _scoreMomentum이 있으면 재사용.
  //   이전: 무조건 덮어쓰기 → 스캔 시점과 분석탭 시점 모멘텀이 달라 C 판정 불일치.
  //   TF가 달라졌다면 새로 계산해야 하지만, 그 경우 _scoreMomentum은 이미 상단에서 캐시 로드 로직이 관리함.
  try{
    // [S357] 구버전 _scoreMomentum 캐시 감지 → 재계산
    //   _normV(정규화 버전)가 낮거나 없는 캐시는 구 정규화(상단 92 포화)로 계산된 것 → 재계산.
    //   키 부재(upside 추가 이전) + 정규화 변경(92→s직접) 양쪽을 _normV 하나로 커버.
    //   엔진 scoreMomentum._normV와 아래 기대버전을 함께 올려야 함 (현재 5).
    var _momStale = stock._scoreMomentum && stock._scoreMomentum.history && stock._scoreMomentum.history.length && (stock._scoreMomentum._normV || 0) < 8;
    if(!stock._scoreMomentum || _momStale){
      const momCandles = _analCandles || (indicators && indicators._advanced && indicators._advanced.rows) || stock._lastAnalCandles || null;
      if(momCandles && momCandles.length >= 80 && typeof SXE!=='undefined' && SXE.scoreMomentum){
        const rawRows = momCandles.map(c=>({date:c.date,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}));
        stock._scoreMomentum = SXE.scoreMomentum(rawRows, _analTF, 5);
      }
    }
  }catch(momErr){ console.warn('[runAnalysis] momentum err', momErr); }

  const analTime = new Date();

  // S99-3: 현재 TF 결과를 캐시에 저장
  if(typeof _saveCurrentTfCache === 'function'){
    const _svV = stock._svVerdict || null;
    // S-BUGFIX: typeof supervisorJudge → typeof SXC?.supervisorJudge (SXC 네임스페이스 이전 후 구버전 가드 잔존 버그 수정)
    const _svJ = (typeof SXC !== 'undefined' && typeof SXC.supervisorJudge === 'function' && qs && stock._scoreMomentum) ?
      SXC.supervisorJudge(qs.readyScore||0, stock._scoreMomentum, _svV?._rr||0) : null;
    _saveCurrentTfCache(stock, indicators, qs, stock._scoreMomentum,
      stock._btResult, stock._btScore, stock._btState, _svJ, _svV);
  }

  renderAnalysisResult(stock, scores, indicators, qs, analTime, sectorItp, maAlignItp, basicItp);

  // [S413] 헤더↔TF배지↔MTF 동기화 — renderAnalysisResult가 window._sxBoard.groups(헤더 5분류 소스)를
  //   막 생성했으므로, 현재 TF의 dist5를 _computeDist5 재계산본(입력 어긋남) 대신 헤더와 동일한
  //   _classifyBoardDist(_sxBoard.groups)로 덮어쓴다 → 현재 TF의 TF점·MTF가 헤더 5분류와 정확히 일치.
  //   (_saveCurrentTfCache는 renderAnalysisResult 이전이라 그 시점엔 _sxBoard가 stale이므로 여기서 동기화)
  try{
    if(_analTFCache[_analTF] && window._sxBoard && window._sxBoard.groups && typeof _classifyBoardDist==='function'){
      const _hdrDist = _classifyBoardDist(window._sxBoard.groups);
      if(_hdrDist){
        _analTFCache[_analTF].dist5 = _hdrDist;
        if(typeof _renderAnalTfChips==='function') _renderAnalTfChips();           // TF 점(칩) 갱신
        const _sbSync = document.getElementById('sxScoreBoard');                    // MTF 재집계(전광판 재렌더)
        if(_sbSync && window._sxBoard){ const _wo=_sbSync.classList.contains('sxb-open'); _sbSync.innerHTML=_sxbHTML(); if(_wo)_sbSync.classList.add('sxb-open'); }
      }
    }
  }catch(_eSync){}

  // ═══════════════════════════════════════════════════════════════════
  // S119: 엔진판단 검증 자동 실행 (백그라운드)
  //
  // [목적] 모든 종목 600봉 기준 통일 — 공평성 원칙
  //        사용자가 엔진판단 검증 버튼을 수동 클릭한 것과 동일한 효과를
  //        분석탭 진입 시 자동으로 제공.
  //
  // [플로우]
  //   1. 분석탭 진입 → 200봉 fetch → 자동 400봉 확장 (기존)
  //   2. renderAnalysisResult 완료 (화면 먼저 표시)
  //   3. ★ S119: 500ms 후 _runEngineVerify 자동 호출 (백그라운드)
  //   4. _runEngineVerify 내부: 400→600봉 확장 + BT 재실행 + runAnalysis 재귀
  //   5. 재귀 진입 시 stock._btResult가 있고 봉수 >= 600이면 자동 실행 SKIP
  //      (무한 루프 방지)
  //
  // [자동 실행 조건]
  //   - stock._btResult 없음 (처음 진입 또는 종목 전환 후)
  //     또는
  //   - stock._lastAnalCandles 봉수가 목표봉수 미만 (일봉 600, 주/월봉 400)
  //   - 동시에 _engineVerifyRunning 플래그 false (중복 호출 방지)
  //
  // [이슈 B 자연 해소]
  //   S118 미해결 이슈: "분석탭 400봉 vs 단일검증 600봉 거래수 불일치"
  //   → 이제 분석탭 진입 시 자동으로 600봉까지 확장되므로 두 탭 항상 동일.
  //
  // [UX 순서]
  //   방법 B (백그라운드): 400봉 분석 완료 → 화면 먼저 표시 → 백그라운드 BT
  //   → 완료 시 runAnalysis 재귀로 화면 자동 갱신 (결과 카드 펼침 포함)
  //
  // [주/월봉 처리]
  //   _runEngineVerify 내부에서 _targetCount 를 400으로 자동 설정함
  //   → 주/월봉도 400봉이 최대이므로 현재 봉수가 400 미만일 때만 실행
  //
  // ═══════════════════════════════════════════════════════════════════
  try {
    const _tfLocal = (typeof _analTF !== 'undefined' && _analTF) ? _analTF : 'day';
    const _mktLocal = stock._mkt || stock.market || (typeof currentMarket !== 'undefined' ? currentMarket : 'kr');
    // [S168 600봉 통일] 모든 시장 동일 기준
    //   한국/코인/미국 = 600봉 (일봉) / 400봉 (주월봉)
    //   미국도 이제 fetchCandlesExtended가 period1/period2 분할 호출을 지원하므로
    //   다른 시장과 동일하게 자동 600봉 확장 가능 (이전 S119 fix1의 미국 skip 분기 제거)
    // [S218] sx_bt.js의 _btTargetBars 헬퍼 활용 — KIS ON 시 700봉 (분석탭/BT 정합)
    const _targetBars = (typeof _btTargetBars === 'function')
      ? _btTargetBars(_mktLocal, _tfLocal)
      : ((_tfLocal === 'week' || _tfLocal === 'month') ? 400 : 600); // fallback
    const _curBars = (stock._lastAnalCandles && stock._lastAnalCandles.length) ? stock._lastAnalCandles.length : 0;
    // 자동 실행 조건: BT 결과 없음 OR 현재 봉수 < 목표 봉수
    const _needsAuto = (!stock._btResult) || (_targetBars > 0 && _curBars < _targetBars);

    if(_needsAuto && !stock._engineVerifyRunning && typeof _runEngineVerify === 'function'){
      console.log(`[S119] ★ 엔진판단 검증 자동 실행 예정 — 시장=${_mktLocal}, 현재 ${_curBars}봉 / 목표 ${_targetBars}봉, BT결과=${!!stock._btResult}`);
      // 500ms 지연: 렌더 직후 DOM 안정화 + 사용자가 화면 먼저 볼 수 있도록
      (window._sxTrackedTimeout || setTimeout)(() => {
        // 지연 후 다시 체크 (사용자가 이미 버튼 클릭했거나 다른 종목으로 이동한 경우 skip)
        if(typeof currentAnalStock !== 'undefined' && currentAnalStock === stock && !stock._engineVerifyRunning && !stock._btResult){
          // [S343] 엔진판단 검증 카드 강제 펼침 제거 — BT는 백그라운드 실행만,
          //   분석신호 검토 디폴트 노출 유지. 사용자가 직접 엔진판단 검증 버튼 클릭 시 펼침.
          _runEngineVerify(stock);
        } else if(_targetBars > 0 && _curBars < _targetBars && currentAnalStock === stock && !stock._engineVerifyRunning){
          // BT는 있지만 봉수 부족 → 갱신 실행 (한국/코인만 해당)
          // [S343] 카드 펼침 제거 — 동일하게 백그라운드만
          _runEngineVerify(stock);
        }
      }, 500);
    } else if(stock._btResult && !stock._btResult.error && !stock._engineVerifyRunning && _curBars >= _targetBars && !stock._sideEffectsSynced){
      // [S218] KIS ON 시 BT는 이미 정상 실행됨(line 778) → _runEngineVerify 자동 호출 skip되는 경로 보강
      //   기존: KIS OFF 200봉 진입 → 600봉 부족 → _runEngineVerify가 BT + 사이드 이펙트(UI 갱신, 단일검증 동기화) 모두 실행
      //   문제: KIS ON 700봉 진입 → BT는 line 778에서 이미 실행됨(700봉) → _runEngineVerify SKIP
      //         결과: 분석탭 엔진판단 검증 카드 안 펼쳐짐 + 단일검증 탭 백테스트 결과 비어있음
      //   해결: BT 재실행은 불필요(이미 정상)이므로 사이드 이펙트만 수행 — UI/스토리지/캐시 동기화
      //   [S218 fix1] _sideEffectsSynced 가드 플래그 추가 — runAnalysis 재호출 시 무한 루프 방지
      //     (이 분기 조건이 한번 충족되면 같은 조건이 계속 true라 재진입 → 차트 깜빡임 발생)
      console.log(`[S218] ★ 사이드 이펙트만 동기화 — BT 재실행 skip (이미 ${_curBars}봉 BT 완료)`);
      stock._sideEffectsSynced = true; // 가드: runAnalysis 재호출 시 이 분기 재진입 차단
      (window._sxTrackedTimeout || setTimeout)(() => {
        // 지연 후 재확인 — 사용자가 다른 종목으로 이동하지 않았는지
        if(typeof currentAnalStock === 'undefined' || currentAnalStock !== stock) return;
        if(stock._engineVerifyRunning) return; // 다른 경로에서 이미 실행 중이면 skip
        try {
          const r = stock._btResult;
          // [S343] 엔진판단 검증 카드 강제 펼침 제거 — 분석신호 검토 디폴트 유지
          //   기존: stock._engineVerifyOpen = true → 사용자가 엔진판단 검증 카드를 보게 됨
          //   변경: BT 결과 토스트로 알림만, 사용자가 직접 클릭해서 확인하도록
          // 2) 단일검증 탭 #btBasicResult DOM 렌더
          if(typeof btRenderBasicResult === 'function'){
            try {
              btRenderBasicResult(stock, r);
              const _btResultEl = document.getElementById('btBasicResult');
              if(_btResultEl) _btResultEl.style.display = 'block';
              console.log('[S218] ✅ 단일검증 탭 결과 동기화 완료');
            } catch(e){ console.warn('[S218] 단일검증 탭 렌더 예외:', e); }
          }
          // 3) localStorage BT 결과 저장
          if(typeof _btSaveBtResult === 'function'){
            try { _btSaveBtResult(stock, r); } catch(e){ console.warn('[S218] _btSaveBtResult 예외:', e); }
          }
          // 4) 관심종목 캐시 갱신
          try {
            if(_tfLocal === 'day' && typeof _isInWatchlist === 'function' && typeof _watchBtSet === 'function' && _isInWatchlist(stock.code)){
              _watchBtSet(stock, r, 'day');
            }
          } catch(e){ console.warn('[S218] watch cache 갱신 예외:', e); }
          // 5) 분석탭 재렌더 (엔진판단 검증 카드 펼친 상태로 표시)
          if(typeof _analTabIdx !== 'undefined' && _analTabIdx === 0 && currentAnalStock === stock){
            if(typeof runAnalysis === 'function'){
              runAnalysis(stock).then(() => {
                console.log('[S218] 분석탭 재렌더 완료 (엔진판단 검증 카드 열림)');
              }).catch(e => console.warn('[S218] 재렌더 예외:', e));
            }
          } else {
            stock._needsAnalRerender = true;
          }
        } catch(syncErr){
          console.warn('[S218] 사이드 이펙트 동기화 예외:', syncErr);
        }
      }, 500);
    } else {
      console.log(`[S119] 엔진판단 검증 자동 실행 SKIP — 시장=${_mktLocal}, 봉수=${_curBars}/${_targetBars}, BT결과=${!!stock._btResult}, 실행중=${!!stock._engineVerifyRunning}`);
    }
  } catch(autoErr) { console.warn('[S119] 자동 실행 로직 예외:', autoErr); }
 }catch(e){ // S63: 분석 실패 시 에러 표시
  console.error('[runAnalysis] err', e);
  const body = document.getElementById('analBody');
  // [S225] 에러 메시지 escape — defense in depth (stack은 이미 < escape 됨)
  if(body) body.innerHTML = `<div class="result-empty" style="padding:40px 16px;text-align:center"><div style="font-size:24px;opacity:.3;margin-bottom:8px">⚠</div><div style="font-size:13px;color:var(--text2)">분석 중 오류가 발생했습니다</div><div style="font-size:10px;color:var(--text3);margin-top:6px">${_esc(e.message||e)}</div><div style="font-size:8px;color:var(--text3);margin-top:6px;text-align:left;max-height:120px;overflow:auto;word-break:break-all;padding:6px;background:var(--surface2);border-radius:4px">${(e.stack||'').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div><button onclick="if(currentAnalStock)runAnalysis(currentAnalStock)" style="margin-top:12px;padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;cursor:pointer">다시 시도</button></div>`;
 }
}

// S31: 미니 캔들차트 그리기
// S34: 미니 캔들차트 → SXChart 모듈로 위임
// [S578] 보라 마커 소스 선택 — SX_CHART_PURPLE: 'A'(진입타이밍, qs.action 기반 _svChartMarker) | 'C'(안전제동, 감독관 _svVerdict). 기본 C.
//   교차선택: 보라는 A 또는 C 하나만. 녹/적(B/S)은 sx_chart.js가 SX_CHART_GREENRED로 별도 게이팅.
//   주의: 결과탭 재진입 카드는 _svChartMarker 미저장 → A 선택 시 방어적으로 _svVerdict(C) 사용(드물게).
function _resolvePurpleSv(stock){
  if(!stock) return null;
  var mode = 'C';
  try { if(typeof localStorage!=='undefined' && localStorage.getItem('SX_CHART_PURPLE')==='A') mode='A'; } catch(_){}
  if(mode === 'A') return stock._svChartMarker || stock._svVerdict || null;
  return stock._svVerdict || stock._svChartMarker || null;
}
if(typeof window!=='undefined') window._resolvePurpleSv = _resolvePurpleSv;
// S95: trades 전달 시 drawMiniWithTrades 사용
// S99: svVerdict 전달 → 통합판정 기준 마커
// [S234] 차트 렌더 직전에도 SXE.sanitizeRows 적용 — 비정상 OHLC(o=0/l=0)가 차트 wick 0까지 뻗는 현상 차단
//   배경: calcAllScreener는 sanitize 적용하지만 _drawMiniCandleChart로 전달되는 indicators._advanced.rows는
//         sanitize 이전의 원본 candles → wick 0 봉이 그대로 차트로 감
//   해결: 차트 함수 진입 시 sanitize 한 번 더 적용 (정상 봉은 그대로 통과 — noop)
function _drawMiniCandleChart(rows, trades, svVerdict){
  if(typeof SXChart==='undefined') return;
  // [S234] 차트 렌더 직전 sanitize (이중 호출 안전 — 정상이면 noop)
  if(typeof SXE !== 'undefined' && typeof SXE.sanitizeRows === 'function'){
    rows = SXE.sanitizeRows(rows);
  }
  // [S226 DIAG] 차트 뭉개짐 진단 — 마지막 봉 OHLC + 전체 min/max 콘솔 출력
  //   목적: SK하이닉스 등 일부 종목에서 차트 y축이 0까지 늘어나는 현상 원인 추적
  //   확인 후 제거 예정 (임시 진단)
  try {
    if(rows && rows.length){
      const _last = rows[rows.length-1];
      const _highs = rows.map(r=>r.high).filter(v=>typeof v==='number');
      const _lows = rows.map(r=>r.low).filter(v=>typeof v==='number');
      const _hMin = Math.min.apply(null, _highs);
      const _hMax = Math.max.apply(null, _highs);
      const _lMin = Math.min.apply(null, _lows);
      const _lMax = Math.max.apply(null, _lows);
      const _abnormalRows = rows.filter(r => !r || !(r.high>0) || !(r.low>0) || r.high<r.low || r.high<r.close || r.low>r.close);
      console.log(`[S226 DIAG] 차트데이터 — rows=${rows.length}, last={d:${_last.date},o:${_last.open},h:${_last.high},l:${_last.low},c:${_last.close},v:${_last.volume}}, 전체 high범위=[${_hMin},${_hMax}], low범위=[${_lMin},${_lMax}], 비정상봉=${_abnormalRows.length}개`);
      if(_abnormalRows.length){
        console.warn(`[S226 DIAG] ⚠️ 비정상 봉 ${_abnormalRows.length}개 발견:`, _abnormalRows.slice(0,3).map(r=>({d:r&&r.date,o:r&&r.open,h:r&&r.high,l:r&&r.low,c:r&&r.close})));
      }
    }
  } catch(_e) { /* 진단 실패는 무시 */ }
  if(trades && trades.length && SXChart.drawMiniWithTrades){
    SXChart.drawMiniWithTrades('miniCandleChart', rows, trades, svVerdict);
  } else {
    SXChart.drawMini('miniCandleChart', rows, svVerdict); // [S358] 0거래에서도 보라 C마커 표시
  }
}

function calcEnhancedScores(stock, ind){
  let momentum=50, value=50, volume=50, trend=50;

  if(ind){
    // [S351] 모멘텀: RSI(연속) + MACD + 등락률 — RSI 세부값을 선형 반영(과거: >60/<40 구간화)
    const rsi = ind.rsi;
    momentum += (rsi - 50) * 0.35;           // RSI 50=0, 19≈-10.9, 30≈-7, 70≈+7
    if(ind.macd.macd>ind.macd.signal) momentum+=8; else momentum-=5;
    const cr = stock.changeRate||0;
    if(cr>3) momentum+=10; else if(cr>0) momentum+=5; else if(cr>-3) momentum-=5; else momentum-=10;
    momentum = Math.max(10, Math.min(95, momentum));

    // [S351] 거래량: MFI(연속) + VR(연속) + OBV — 세부값 반영(과거: >60/<40, >150/<70 구간화)
    volume += (ind.mfi - 50) * 0.3;          // MFI 50=0, 8≈-12.6, 19≈-9.3, 67≈+5.1
    volume += Math.max(-10, Math.min(10, (ind.vr - 100) * 0.08)); // VR 100=0, 11≈-7.1, 52≈-3.8, 164≈+5.1
    if(ind.obv.trend==='up') volume+=5; else if(ind.obv.trend==='down') volume-=5;
    volume = Math.max(10, Math.min(95, volume));

    // [S351] 추세: ADX(강도) × MA배열(방향) 결합 + PSAR — 과거엔 ADX>25 단일+10이라 49와 26이 동일했음
    const _adxStr = Math.max(0, Math.min(20, (ind.adx.adx - 20) * 0.7)); // ADX20=0 ~ ADX48이상=20
    const _maUp = ind.ma5&&ind.ma20&&ind.ma60&&ind.ma5>ind.ma20&&ind.ma20>ind.ma60;
    const _maDown = ind.ma5&&ind.ma20&&ind.ma5<ind.ma20;
    if(_maUp) trend += 8 + _adxStr*0.6;       // 정배열: 추세 강할수록 가산
    else if(_maDown) trend -= 8 + _adxStr*0.6; // 역배열: 추세 강할수록 감산(강한 하락 정직 반영)
    // 횡보(정배열·역배열 아님)는 ADX 미반영 → 중립 유지
    if(ind.psar.trend==='up') trend+=5; else trend-=5;
    trend = Math.max(10, Math.min(95, trend));

    // 밸류: 외국인 지분(수급 신뢰) base + PER 괴리 보정 [S397]
    //   기존: 외국인 4단계만(PER 무시) → 적정가 점수(50−괴리%)와 충돌(예: 밸류65 vs 적정가0).
    //   개편: 외국인 base에 PER 괴리를 ±25 보정으로 얹어 고/저평가를 정직 반영.
    //         적정가 점수와 동일한 _hp/_mp(historical·KOSIS PER) 기준을 넘겨 정합 유지.
    //         PER 부적합(지주/리츠/금융=unsuitable) 또는 EPS≤0/데이터 없으면 외국인 base 유지(안전).
    //         adj = clamp(-25, +25, round(-diffPct × 0.3)) — 고평가(diffPct+)면 감점, 저평가(−)면 가점.
    const fr = stock.foreignRatio||0;
    const _frBase = fr>30?65 : fr>15?55 : fr>5?48 : 40;
    value = _frBase;
    try {
      if(typeof SXI!=='undefined' && typeof SXI.valuationJudge==='function'
         && stock._financial && stock._financial.eps > 0){
        let _hp=null, _mp=null;
        if(typeof SXI.calcHistoricalPer==='function' && stock._financial._historicalEps){
          const _cdl = stock._lastAnalCandles || [];
          if(_cdl.length) _hp = SXI.calcHistoricalPer(stock._financial._historicalEps, _cdl);
        }
        if(typeof getKosisPerForStock==='function' && typeof _kosisMarketPer!=='undefined' && _kosisMarketPer){
          _mp = getKosisPerForStock(stock, _kosisMarketPer);
        }
        const _vj = SXI.valuationJudge(stock._financial, stock.price, stock, _hp, _mp);
        if(_vj && !_vj.unsuitable && _vj.diffPct != null){
          const _adj = Math.max(-25, Math.min(25, Math.round(-_vj.diffPct * 0.3)));
          value = Math.max(10, Math.min(95, _frBase + _adj));
        }
      }
    } catch(_){ /* PER 보정 실패 시 외국인 base 유지 (안전) */ }
  } else {
    // 캔들 없으면 기존 로직
    return calcBasicScores(stock);
  }

  const total = Math.round(momentum*0.3 + value*0.2 + volume*0.25 + trend*0.25);
  const grade = total>=70?'A':total>=55?'B':total>=40?'C':total>=25?'D':'F';
  // [S351] 연속 스코어링으로 소수가 발생하므로 표시용 정수화 (total은 위에서 원값 기준 계산됨)
  return {total, grade, momentum:Math.round(momentum), value:Math.round(value), volume:Math.round(volume), trend:Math.round(trend)};
}

function calcBasicScores(stock){
  let momentum = 50, value = 50, volume = 50, trend = 50;

  const cr = stock.changeRate || 0;
  if(cr > 5) momentum = 75;
  else if(cr > 2) momentum = 65;
  else if(cr > 0) momentum = 55;
  else if(cr > -2) momentum = 45;
  else if(cr > -5) momentum = 35;
  else momentum = 25;

  const vr = stock.volumeRatio || 100;
  if(vr > 500) volume = 80;
  else if(vr > 200) volume = 65;
  else if(vr > 100) volume = 50;
  else volume = 35;

  const fr = stock.foreignRatio || 0;
  if(fr > 40) value = 70;
  else if(fr > 20) value = 60;
  else if(fr > 5) value = 50;
  else value = 40;

  const mc = stock.marketCap || 0;
  if(mc > 10000) trend = 60;
  else trend = 45;

  const total = Math.round((momentum*0.3 + value*0.25 + volume*0.25 + trend*0.2));
  const grade = total>=70?'A':total>=55?'B':total>=40?'C':total>=25?'D':'F';

  return {total, grade, momentum, value, volume, trend};
}

let _currentAnalRows = null;
let _currentAnalName = '';
let _currentAnalTrades = null;

// S62: BT 전략점수 산출 (0~100) — 수익률+승률+거래수+MDD+PF 종합
// [B] BT 점수 산출 함수 — sx_render.js와 sx_scan_worker.js에 이중 정의 (PATCH-4 패턴 위험)
//   ⚠️ 한쪽 수정 시 반드시 양쪽 동기화 필요!
//   양쪽 동등성 검증: window.SXBtScoreCheck() 호출 (콘솔)
//   - 5개 (수익률, 승률, 거래수, MDD, PF) 가중 합산 → 0~100점
//   - 이중 정의 사유: Worker는 importScripts 제약으로 sx_render.js 직접 사용 불가
// [S294] BT 종합 점수 개편
//   ─ 거래수 신뢰도(tradeScore) 제거: 거래수를 줄여 점수 올리는 왜곡 차단
//   ─ 기댓값(evScore) 도입: (승률×평균이익) - (패율×평균손실) → 질적 우수성 반영
//   ─ PF √보정(pfReliability) 제거: 기댓값이 질적 신뢰도 커버
//   배점: 총수익률(25) + 승률(20) + PF(20) + MDD(15) + 기댓값(20) = 100
//   ⚠️ 미러: sx_scan_worker.js calcBtScore도 동일하게 동기화 필수
function calcBtScore(btData, stock){
  if(!btData) return null;
  const pnl     = btData.totalPnl     ?? 0;
  const wr      = btData.winRate      ?? 0;
  const trades  = btData.totalTrades  ?? 0;
  const mdd     = btData.mdd          ?? 0;
  const pf      = btData.profitFactor ?? 0;
  const avgWin  = btData.avgWin       ?? 0;
  const avgLoss = btData.avgLoss      ?? 0;
  if(trades === 0) return null;

  // ① 총수익률 (0~25점) — 4단계: 100%+🟢 / 50~99%🔵 / 0~49%🟠 / 음수🔴
  let pnlScore;
  if(pnl >= 100)     pnlScore = 25;
  else if(pnl >= 50) pnlScore = 18 + (pnl - 50) / 50 * 7;
  else if(pnl >= 0)  pnlScore = pnl / 50 * 18;
  else               pnlScore = 0;

  // ② 승률 (0~20점) — 4단계: 60%+🟢 / 40~59%🔵 / 20~39%🟠 / 0~19%🔴
  let wrScore;
  if(wr >= 60)       wrScore = 20;
  else if(wr >= 40)  wrScore = 10 + (wr - 40) / 20 * 10;
  else if(wr >= 20)  wrScore = 4  + (wr - 20) / 20 * 6;
  else               wrScore = Math.max(0, wr / 20 * 4);

  // ③ PF 손익비 (0~20점) — 4단계: ≥2.0🟢 / 1.5~1.99🔵 / 1.0~1.49🟠 / <1.0🔴
  let pfScore;
  if(pf >= 2.0)      pfScore = 20;
  else if(pf >= 1.5) pfScore = 14 + (pf - 1.5) / 0.5 * 6;
  else if(pf >= 1.0) pfScore = 6  + (pf - 1.0) / 0.5 * 8;
  else if(pf >= 0.5) pfScore = (pf - 0.5) / 0.5 * 6;
  else               pfScore = 0;

  // ④ MDD 리스크 (0~15점) — 3단계: 0~9.9%🔵안전 / 10~19.9%🟣주의 / 20%+🔴위험
  let mddScore;
  const absMdd = Math.abs(mdd);
  if(absMdd <= 10)      mddScore = 15;
  else if(absMdd <= 20) mddScore = 7 + (20 - absMdd) / 10 * 8;
  else if(absMdd <= 40) mddScore = (40 - absMdd) / 20 * 7;
  else                  mddScore = 0;

  // ⑤ 기댓값 (0~20점) — 3단계: ≥+1%🟢 / 0~+1%🟠 / <0🔴
  //   기댓값 = (승률 × 평균이익%) - (패율 × 평균손실%)
  //   avgWin/avgLoss 없으면 거래당 평균수익(pnl/trades)으로 fallback
  const ev = (avgWin > 0 || avgLoss > 0)
    ? (wr / 100) * avgWin - (1 - wr / 100) * avgLoss
    : pnl / trades;
  let evScore;
  if(ev >= 2.0)      evScore = 20;
  else if(ev >= 1.0) evScore = 14 + (ev - 1.0) / 1.0 * 6;  // 14~20점 (녹색 구간)
  else if(ev >= 0)   evScore = ev  / 1.0 * 14;              //  0~14점 (주황 구간)
  else               evScore = 0;                            //  0점    (빨강)

  // [S396] ⑥ 코어 = 5항목 합산 (0~100). 거래수는 가산점 → '신뢰도 캡'으로 전환.
  const core = pnlScore + wrScore + pfScore + mddScore + evScore;

  // [S396] ⑦ 거래수 신뢰도 캡 — 표본이 적을수록 상한을 낮춤(가산점 아님 → 만점 차단).
  //   배경: 기존 ⑥ 가산점(0~10)은 만점 합 110→min(100) 클램프 때문에 상위 5항목이 만점이면
  //         거래수 페널티가 통째로 증발(예: 16거래·전항목만점→100점). 캡으로 바꿔 '표본부족=만점불가'.
  //   20+→100 / 10~19→90 / 5~9→78 / <5→60
  // [S563] 모드별 표본 캘리브레이션 — 모드 = 정배열 기간(profit:5×20 / balanced:20×60 / safe:60×120).
  //   장기 MA쌍일수록 정배열 구간이 드물어 거래가 적은 게 정상 → 캡 임계를 모드별 기대빈도 계수로 축소.
  //   계수(_mtf): 단타 1.0 / 스윙 0.5 / 중기 0.22 (일봉 기준). btData._mode는 sxRunBtEngine이 박음.
  //   미설정(_mode 없음)이면 계수 1.0 → 기존 동작 유지. ⚠️ sx_scan_worker.js 미러 동일 동기화 필수.
  const _mtf = { profit:1.0, balanced:0.5, safe:0.22 };
  const _mf = (btData && btData._mode && _mtf[btData._mode]) ? _mtf[btData._mode] : 1.0;
  let tradeCap;
  if(trades >= 20*_mf)      tradeCap = 100;
  else if(trades >= 10*_mf) tradeCap = 90;
  else if(trades >= 5*_mf)  tradeCap = 78;
  else                      tradeCap = 60;

  // [S396] ⑧ 과최적 의심 캡 — 표본부족 + 비현실적 성과 = 곡선맞춤 신호 → 상한 85.
  //   (승률≥85% OR PF≥4) AND 거래<30 일 때 적용. PF≥2 무조건 20점이라 PF22도 안 깎이던 문제 보완.
  let overfitCap = 100;
  if((wr >= 85 || pf >= 4) && trades < 30) overfitCap = 85;

  // [S476] 강건성 불안·과최적 의심 감점 — 캡(상한)이 아닌 차감(변별력 확보용). 강건성 −8 / 과최적 −12, 합산 최대 −20.
  //   강건성 정보는 btData에 없어 stock 인자로 주입: 일반 BT(_robustness) 또는 코어(_coreDiag) 중 하나라도 불안하면 적용("코어도" 커버).
  //   과최적은 코어 진단(_coreDiag.overfit) 기준. stock 미전달(옵티마이저 등)이면 감점 0 → 기존 동작 유지.
  //   전광판 종합점수(_displayTotal)에서도 같은 조건으로 한 번 더 차감(의도된 중복 — 총 체감 최대 −40).
  let _diagPenalty = 0;
  if(stock){
    const _robFragile = !!((stock._robustness && stock._robustness.label === 'fragile') ||
                           (stock._coreDiag && stock._coreDiag.rob === 'fragile'));
    const _overfit    = !!(stock._coreDiag && stock._coreDiag.overfit);
    if(_robFragile) _diagPenalty += 8;
    if(_overfit)    _diagPenalty += 12;
  }
  return Math.round(Math.max(0, Math.min(core, tradeCap, overfitCap, 100) - _diagPenalty));
}

// S62: BT 데이터 조회 공통 함수
function _getBtData(stock){
  const ticker = stock.code;
  if(!ticker) return null;
  // S67: runAnalysis에서 인메모리 BT 결과 우선
  if(stock._btResult && !stock._btResult.error) return stock._btResult;
  let btData = null;
  try{
    const raw = localStorage.getItem(SX_BT_RESULT_KEY);
    if(raw){ const d = JSON.parse(raw); if(d && d.ticker === ticker) btData = d; }
  }catch(e){}
  if(!btData){
    try{
      const raw = localStorage.getItem(SX_BT_CROSS_KEY);
      if(raw){
        const d = JSON.parse(raw);
        if(d && d.items){
          const found = d.items.find(it => it.code === ticker || it.name === stock.name);
          if(found){ btData = found; if(!btData.saved_at && d.saved_at) btData.saved_at = d.saved_at; }
        }
      }
    }catch(e){}
  }
  return btData;
}

// ══════════════════════════════════════════════════════════════
// S103-fix7 Phase3-B-4f: 상단 배너 내부 "엔진시뮬 포지션 라인" 생성 (프로젝트 C v2.0)
//   🎯 v2.0 철학: 시스템(엔진시뮬) = 가상 트레이더, 사용자 = 미러링
//   이 함수는 "엔진시뮬 트레이더의 현재 상태"를 내러티브로 표출
//
//   v5.4 _buildBtSimLine(롤백됨)과의 차이점:
//     · v5.4: BT 데이터 리포트 어조 ("BT 매수 4/6 @ 317,317")
//     · v2.0: 엔진시뮬 내러티브 어조 ("▲ 4/6 진입 @ 317,317" = 엔진시뮬의 발자취)
//     · v5.4: empty 상태에서 점수/부족분 표시 (기계적)
//     · v2.0: empty 상태에서 관찰자 모드 안내 ("엔진시뮬 포지션 없음, 타이밍 대기")
//     · v5.4: 회피 상태 미표시 (공백)
//     · v2.0: 회피 상태에서 "엔진시뮬 진입 안 함" 명시 (투명성)
//     · v5.4: C 판정과 독립 (혼란 유발)
//     · v2.0: C 판정(svVerdict)에 맞춰 어조/포커스 적응 (정합)
//
//   상태별 분기 (5종):
//     · holding + _isBuySignal=true  → 🟢 신호포착 방금 (엔진시뮬 진입 중)
//     · holding + _isBuySignal=false → 🟢 엔진시뮬 보유중 (날짜/가격/pnl/보유일)
//     · sell_signal                  → 🔴 엔진시뮬 완결 (익절/손절 + pnl + 매도일)
//     · waiting + C='관심'/'관망'     → 🔵 엔진시뮬 관찰/보류 (매수 타이밍 대기)
//     · waiting + C='회피' or no_data→ ⚪ 엔진시뮬 포지션 없음 (진입 부적합 or BT 미실행)
//
//   용어 체계 (Phase 3-B-4f.1):
//     · "엔진시뮬" = 분석 엔진 + BT 엔진이 돌리는 가상 트레이딩 시뮬레이션
//     · "보유중" = 이미 포지션이 있는 상태 (기존 금융 용어 "포지션" 대체, 초보자 친화)
//     · "신호포착" = 매수/매도 트리거가 발생한 순간 (기존 "신호" 대체, 명확성)
//
//   차트 마커(▲/▼)와 시각적 일관성: svVerdict.chartMarker와 동일 기호 사용
//   → 차트의 ▲와 배너의 ▲가 같은 "엔진시뮬의 매수 행적"을 나타냄
// ══════════════════════════════════════════════════════════════
// [S293] A엔진 진입가/목표가/손절가 계산 — 현재가 기준, BT와 동일 슬리피지·파라미터 적용
function _calcAEntryTpSl(stock){
  const ind = stock._indicators || {};
  const price = stock.price || stock.currentPrice || 0;
  if(!price || price <= 0) return null;

  const slip = 0.001; // BT와 동일 슬리피지 0.1%
  const ep = price * (1 + slip);

  // ATR 퍼센트 (ind.atr.pct: 퍼센트 단위)
  const atrPct = (ind.atr && ind.atr.pct > 0) ? ind.atr.pct / 100 : 0.025;

  // 파라미터 BT와 공유 (_loadAnalParams)
  const _ap = (typeof _loadAnalParams === 'function') ? _loadAnalParams() : {};
  const tpMult = (_ap.tpMult > 0 ? _ap.tpMult : 10.6);
  const slMult = (_ap.slMult > 0 ? _ap.slMult : 0.8);

  return {
    ep:   Math.round(ep),
    tp:   Math.round(ep * (1 + atrPct * tpMult)),
    sl:   Math.round(ep * (1 - atrPct * slMult)),
    atrPct, tpMult, slMult
  };
}

// [S476] 피벗 저항/지지 동적 선택 — price 위치 기준 가장 가까운 위=저항, 아래=지지.
//   〔기존〕 R1/S1 고정 표시 → price가 R1을 이미 돌파(예: 신고가)해도 돌파한 R1을 '저항'이라 표기(삼성전자 322k인데 저항 309k).
//   〔개선〕 돌파 시 R1은 지지로 역할 전환되고 다음 저항(R2)을 표기. 어느 레벨인지 라벨(rk/sk)로 투명 노출.
function _pivotResSup(pivot, price){
  if(!pivot || price == null) return { res:null, sup:null };
  const levels = [
    {k:'S3',v:pivot.S3},{k:'S2',v:pivot.S2},{k:'S1',v:pivot.S1},
    {k:'P', v:pivot.P },{k:'R1',v:pivot.R1},{k:'R2',v:pivot.R2},{k:'R3',v:pivot.R3}
  ].filter(x => x.v != null);
  const above = levels.filter(x => x.v > price).sort((a,b)=>a.v-b.v);  // 위쪽 중 최저 = 가장 가까운 저항
  const below = levels.filter(x => x.v < price).sort((a,b)=>b.v-a.v);  // 아래쪽 중 최고 = 가장 가까운 지지
  return { res: above[0] || null, sup: below[0] || null };
}

// [S358] R1/S1 저항·지지 한줄카드 — 진입분석 카드에서 분리, 미니차트 아래 독립 배치
//   · pivot은 진입가/BT와 무관하게 indicators.pivot로 항상 계산되므로 독립 카드가 자연스러움
//   · 진입분석 카드(_buildAEntryLine)는 엔진시뮬 카드(_buildSimPositionLine)와 중복이라 호출 제거됨
// ════════════════════════════════════════════════════════════════════
// [S481] 실험: 캔들 전이 예측 (음봉→양봉 반등 유망도)
//   연속 음봉 상태에서 다음 봉이 양봉으로 전이될 유망도를 5개 조건으로 0~100 점수화.
//   정식 판정(C/unifiedVerdictV2)과 완전 무관한 격리 실험 카드. 휴리스틱(유망도) 단계 —
//   추후 백테스트 전이빈도로 캘리브레이션 예정. 일봉 기준.
//   C1 추세맥락 / C2 매도압력고갈 / C3 지지선겹침 / C4 낙폭·이격 / C5 마지막음봉 꼬리
// ════════════════════════════════════════════════════════════════════
// [S538] 시장별 로직 프로파일 — 시장 특성에 맞게 단일봉 신호 분기. (코인=되돌림 / US=계속 / KR=차후 전용로직)
//   candleMode: 'reversion' = 장대봉/BB이탈을 과확장→다음봉 되돌림으로(_applyExtra, 단일봉·전모드)
//               'continuation' = 장대봉을 추세 계속으로(C5, 연속모드 한정 — S535 이전 상태), BB이탈 항 미적용
//   근거(3시장 바스켓): 코인은 되돌림 적용 시 음봉 전임계 +·45+절벽 해소(개선) / US는 이전(계속)이 ≥40 +6.7%p로 더 우수(추세장 성격)
//   KR: 현재 continuation(=이전 상태)으로 두되, 전 임계 예측력 미약 → 차후 KR 전용 로직 자리(TODO).
const _CT_MKT = {
  coin: { candleMode: 'reversion',    bbBreakout: true,  reversalScale: 1.0 },
  us:   { candleMode: 'continuation', bbBreakout: false, reversalScale: 0.5 },  // [S540] 추세장 — 반전캔들 강도 약화
  kr:   { candleMode: 'continuation', bbBreakout: false, reversalScale: 1.0 }   // TODO[차후]: KR 전용 로직
};
function _ctProfile(market){ return _CT_MKT[_ctNormMkt(market)] || _CT_MKT.kr; }
// [S543] 현재봉 레짐 분류 — candle_bt._regimeAt의 미러(ADX+20/60MA 방향). ⚠둘 중 하나 수정 시 반드시 동기화. 불장/상승장/횡보장/하락장.
function _ctRegime(rows, last, ind){
  if(!rows || last < 60) return 'side';
  var ma = function(len){ var s=0,k; for(k=last-len+1;k<=last;k++) s += +rows[k].close; return s/len; };
  var ma20 = ma(20), ma60 = ma(60);
  var adx = (ind && ind.adx && ind.adx.adx != null) ? +ind.adx.adx : null;
  if(adx == null || adx < 20) return 'side';
  if(ma20 >= ma60) return adx >= 35 ? 'bull' : 'up';
  return 'down';
}
function _candleTransitionScore(rows, indicators, market, tf){
  if(!Array.isArray(rows) || rows.length < 25) return { active:false, reason:'데이터 부족' };
  // [S506] 종가 확정봉 기준 + 시장별 마감 판단 — 마지막 봉이 '미완성(장중)'이면 제외, '확정(장 마감 후/과거)'이면 포함.
  //   장중: 어제 확정봉으로 오늘 예측 / 장 마감 후: 오늘 확정봉으로 내일 예측. 캔들 패턴은 봉 완성(종가) 후 확정되므로.
  const _mkt = String(market||'').toLowerCase();
  const _prof = _ctProfile(market);   // [S538] 시장별 로직 프로파일
  const _mc = (_mkt.includes('us')||_mkt.includes('해외')||_mkt.includes('nasdaq')||_mkt.includes('nyse'))
                ? { tz:'America/New_York', cm:16*60 }
            : (_mkt.includes('coin')||_mkt.includes('코인')||_mkt.includes('crypto'))
                ? { tz:'UTC', coin:true }
                : { tz:'Asia/Seoul', cm:15*60+30 };
  let _trimmed = false;
  { const _ld = String((rows[rows.length-1]||{}).date||'').match(/(\d{4})-?(\d{2})-?(\d{2})/);
    if(_ld){
      const _lastStr = `${_ld[1]}-${_ld[2]}-${_ld[3]}`;
      let _p = null;
      try { _p = {}; new Intl.DateTimeFormat('en-CA',{timeZone:_mc.tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()).forEach(x=>_p[x.type]=x.value); } catch(e){ _p=null; }
      if(_p){
        const _tzToday = `${_p.year}-${_p.month}-${_p.day}`;
        let _confirmed;
        if(_lastStr !== _tzToday) _confirmed = true;                  // 과거/미래봉 → 이미 확정
        else if(_mc.coin) _confirmed = false;                         // 코인: UTC 오늘봉은 진행 중
        else _confirmed = ((+_p.hour)*60 + (+_p.minute)) >= _mc.cm;   // 마감 지났으면 확정
        if(!_confirmed){ rows = rows.slice(0,-1); _trimmed = true; }
      }
    } }
  if(rows.length < 25) return { active:false, reason:'데이터 부족' };
  // 미완성봉 제외 시 엔진 패턴(indicators.candle)은 그 봉 포함분이라 불일치 → 확정봉 기준으로 재계산.
  let _ind = indicators;
  if(_trimmed && typeof Candle !== 'undefined' && Candle && typeof Candle.analyze === 'function'){
    _ind = Object.assign({}, indicators, { candle: Candle.analyze(rows) });
  }
  const n = rows.length, last = n - 1;
  // [S506] 다음봉(예측 대상) 날짜 = 확정봉 다음 영업일 (주식은 주말 스킵 / 코인은 매일). 공휴일은 근사로 무시.
  let _nextBar = null;
  { const _m2 = String((rows[last]||{}).date||'').match(/(\d{4})-?(\d{2})-?(\d{2})/);
    if(_m2){ const _d2 = new Date(+_m2[1], +_m2[2]-1, +_m2[3]); _d2.setDate(_d2.getDate()+1);
      if(!_mc.coin){ while(_d2.getDay()===0 || _d2.getDay()===6) _d2.setDate(_d2.getDate()+1); }
      _nextBar = `${_d2.getMonth()+1}/${_d2.getDate()}`; } }
  const C = i => +rows[i].close, O = i => +rows[i].open, H = i => +rows[i].high, L = i => +rows[i].low, V = i => +(rows[i].volume||0);
  const price = C(last);
  const closes = rows.map(r => +r.close);

  // [S525] 다이버전스(S522 게이트) + 매물대(S523) — 다음봉 색 예측 보조 축. 캔들·추세·수급과 독립이라 중복 아님.
  //   라이브(calcIndicators)는 rsi가 숫자라 .div/_volResist 없음 → calcAllScreener로 1회 보강(확정봉 rows 기준·룩어헤드 없음).
  //   BT는 calcAllScreener ind를 indicators로 받으므로 재계산 생략(이중계산 회피). 둘 다 동일 소스.
  let _rDiv = (_ind && _ind.rsi && typeof _ind.rsi === 'object') ? _ind.rsi.div : undefined;
  let _oDiv = (_ind && _ind.obv && typeof _ind.obv === 'object') ? _ind.obv.div : undefined;
  let _vRes = _ind ? _ind._volResist : undefined;
  let _vSup = _ind ? _ind._volSupport : undefined; // [S531] 발밑 지지 거울항
  let _sbFired = false; // [S539] 단일봉 되돌림 신호(장대봉/BB이탈) 발동 여부 — 발동 시 라벨 임계를 ±30→±20으로 낮춰 약확신 방향 콜 허용
  const _regime = _ctRegime(rows, last, _ind || indicators); // [S543] 현재봉 레짐 (배지 게이팅용)
  if(_rDiv === undefined && _oDiv === undefined && _vRes === undefined && _vSup === undefined && typeof SXE !== 'undefined' && SXE.calcAllScreener){
    try { const _f = SXE.calcAllScreener(rows, tf || 'day'); _rDiv = _f.rsi && _f.rsi.div; _oDiv = _f.obv && _f.obv.div; _vRes = _f._volResist; _vSup = _f._volSupport; } catch(_eF){}
  }
  const _applyExtra = () => {
    if(_rDiv === 'bullish'){ score += 10; reasons.push('RSI 상승다이버전스 (전환 동력↑)'); }
    else if(_rDiv === 'bearish'){ score -= 10; reasons.push('⚠️ RSI 하락다이버전스 (상승 소진)'); }
    if(_oDiv === 'bullish'){ score += 8; reasons.push('OBV 상승다이버전스 (수급 유입)'); }
    else if(_oDiv === 'bearish'){ score -= 8; reasons.push('⚠️ OBV 하락다이버전스 (수급 이탈)'); }
    if(_vRes){ score -= 8; reasons.push('⚠️ 매물대 저항 (머리 위 매물 — 상승 제약)'); }
    if(_vSup){ score += 8; reasons.push('매물대 지지 (발밑 매물 — 하락 지지)'); } // [S531] 저항(-8)의 거울
    // [S536→S538] 볼린저밴드 몸통(종가) 이탈 → 다음봉 되돌림. reversion 시장(코인)에만 적용. C3(밴드'근처')와 별개(밴드'밖'=과확장).
    if(_prof.bbBreakout){
      const _bbX = (indicators && indicators._advanced && indicators._advanced.bb) ? indicators._advanced.bb : (indicators && indicators.bb) ? indicators.bb : null;
      if(_bbX && _bbX.upper > 0 && _bbX.lower > 0){
        const _clX = C(last);
        if(_clX > _bbX.upper){ score -= 10; _sbFired = true; reasons.push('⚠️ 볼린저 상단 이탈 (종가 밴드 밖 — 다음봉 되돌림 여지)'); }
        else if(_clX < _bbX.lower){ score += 10; _sbFired = true; reasons.push('볼린저 하단 이탈 (종가 밴드 밖 — 다음봉 반등 여지)'); }
      }
    }
    // [S537→S538] 장대봉 단일봉 과확장 → 다음봉 되돌림. reversion 시장(코인)에만 (전 모드 공통). continuation 시장은 C5에서 계속(추세) 처리.
    if(_prof.candleMode === 'reversion'){
      const _rngL = H(last) - L(last);
      if(_rngL > 0){
        const _bRL = Math.abs(C(last) - O(last)) / _rngL;
        if(_bRL > 0.7){
          const _bullL = C(last) >= O(last);
          const _upWL = (H(last) - Math.max(O(last),C(last))) / _rngL;
          const _dnWL = (Math.min(O(last),C(last)) - L(last)) / _rngL;
          if(_bullL && _upWL < 0.05){ score -= 10; _sbFired = true; reasons.push('⚠️ 장대양봉 (단일봉 과확장 — 다음봉 되돌림 여지)'); }
          else if(!_bullL && _dnWL < 0.05){ score += 10; _sbFired = true; reasons.push('장대음봉 (단일봉 과확장 — 다음봉 반등 여지)'); }
        }
      }
    }
    // [S540] 단일봉 반전 캔들 — 엔진 감지 패턴(_engPats) 기반. 전 시장 적용, reversalScale로 강도 차등(US=0.5 약화, 추세장).
    //   해머/드래곤플라이도지=상승반전(+) / 슈팅스타/그레이브스톤도지=하락반전(-) / 도지=직전봉 반대방향 반전(음봉→도지→양봉). _sbFired 연동(약확신 티어).
    const _rvS = _prof.reversalScale || 0;
    if(_rvS > 0 && _engPats && _engPats.length){
      const _hp = nm => _engPats.some(p => p.name === nm);
      let _rv = 0, _rvNm = '';
      if(_hp('해머')){ _rv = 10; _rvNm = '해머'; }
      else if(_hp('드래곤플라이도지')){ _rv = 8; _rvNm = '드래곤플라이도지'; }
      else if(_hp('슈팅스타')){ _rv = -10; _rvNm = '슈팅스타'; }
      else if(_hp('그레이브스톤도지')){ _rv = -8; _rvNm = '그레이브스톤도지'; }
      else if(_hp('도지') && last >= 1){ const _pBull = C(last-1) >= O(last-1); _rv = _pBull ? -6 : 6; _rvNm = (_pBull?'양봉→':'음봉→') + '도지'; }
      if(_rv !== 0){
        const _rvAdj = Math.round(_rv * _rvS);
        if(_rvAdj !== 0){
          score += _rvAdj; _sbFired = true;
          reasons.push((_rv>0?'':'⚠️ ') + _rvNm + ' 반전캔들 (다음봉 ' + (_rv>0?'반등':'되돌림') + ' 여지' + (_rvS < 1 ? ' · 추세장 약화' : '') + ')');
        }
      }
    }
  };
  // [S539] 라벨 결정 — 단일봉 되돌림 신호(장대봉/BB이탈) 발동 시 임계를 ±30→±20으로 낮춰 약확신 방향 콜 허용.
  //   임계 20 = 단일봉(±10)+최소 보강(카운터/다이버전스/매물대 ±8~10) 필요 → 외톨이(±10)·상쇄(<20)는 중립 유지(노이즈 차단). 20~30 구간은 '(단일봉)' 약확신 표기. _sbFired는 reversion 시장에서만 set.
  const _ctLabel = () => {
    if(score >= 30) return '양봉 전이 유망';
    if(score <= -30) return '음봉 전이 유망';
    if(_sbFired && score >= 20) return '양봉 전이 (단일봉)';
    if(_sbFired && score <= -20) return '음봉 전이 (단일봉)';
    return '중립';
  };
  let redCnt = 0, greenCnt = 0;
  for(let i=last; i>=0; i--){ if(C(i) <  O(i)) redCnt++;   else break; }
  for(let i=last; i>=0; i--){ if(C(i) >= O(i)) greenCnt++; else break; }
  // [S503] 최근 8봉 양봉/음봉 카운터 — 양봉 −1, 음봉 +1 (음봉 우세=양봉전이 쪽 +, 양봉 우세=음봉전이 쪽 −). −8~+8 보조점수.
  let _red8 = 0, _green8 = 0;
  for(let i=Math.max(0, n-8); i<=last; i++){ if(C(i) < O(i)) _red8++; else _green8++; }
  const _counter8 = _red8 - _green8;
  // [S491] 정합 — 자체 2봉 감지(S490) 제거. 엔진 Candle.analyze 결과(ind.candle)를 읽어 정합 확보.
  //   분석탭 캔들패턴 카드·조건검색·C 감독관과 동일 판정 공유. 스타·하라미·장악·관통/흑운 전부 엔진 명칭 사용.
  const _cp = (_ind && _ind.candle && Array.isArray(_ind.candle.patterns)) ? _ind.candle
            : (_ind && _ind.patterns && Array.isArray(_ind.patterns.patterns)) ? _ind.patterns
            : (_ind && _ind.patternsLegacy && Array.isArray(_ind.patternsLegacy.patterns)) ? _ind.patternsLegacy
            : null;
  const _engPats = _cp ? _cp.patterns : [];
  const BULL_REV = ['상승장악','피어싱라인','모닝스타','모닝도지스타','상승어밴던드베이비','하라미상승','하라미크로스','집게바닥','상승카운터어택','상승어밴던드베이비'];
  const BEAR_REV = ['하락장악','다크클라우드','이브닝스타','이브닝도지스타','하락어밴던드베이비','하라미하락','하라미크로스','집게천정','하락카운터어택'];
  const _bullPat = _engPats.filter(p => p.dir>0 && BULL_REV.includes(p.name)).sort((a,b)=>b.score-a.score)[0] || null;
  const _bearPat = _engPats.filter(p => p.dir<0 && BEAR_REV.includes(p.name)).sort((a,b)=>b.score-a.score)[0] || null;

  // 강한 반전 패턴(장악10·스타12·도지스타13·어밴던드15 등 강도 10+)은 연속 추세를 덮어 우선.
  //   (모닝스타='음봉-소봉-양봉'처럼 마지막 2봉이 동색이라 연속으로 오인되는 문제 방지)
  //   약한 반전(하라미7·피어싱/다크8·집게7·카운터7)은 연속 다음 순위.
  const _strongBull = (_bullPat && _bullPat.score >= 10) ? _bullPat : null;
  const _strongBear = (_bearPat && _bearPat.score >= 10) ? _bearPat : null;
  let mode = null;
  if(_strongBull && (!_strongBear || _strongBull.score >= _strongBear.score)) mode='flipUp';
  else if(_strongBear) mode='flipDown';
  else if(redCnt >= 2) mode='rebound';
  else if(greenCnt >= 2) mode='reversal';
  else if(_bullPat && (!_bearPat || _bullPat.score >= _bearPat.score)) mode='flipUp';
  else if(_bearPat) mode='flipDown';
  if(!mode) mode = 'count';   // [S503] 연속/패턴 없어도 8봉 카운터로 기본 점수 부여 (비활성 → count 모드)

  const _sma = (arr, p, end) => { if(end+1 < p) return null; let s=0; for(let k=end-p+1;k<=end;k++) s+=arr[k]; return s/p; };
  let score = 0; const reasons = []; let warn = null;   // base 0, 양방향(-100~+100)

  // 공통 추세 — 20MA 기울기 + 60일 고저권
  const ma20now = _sma(closes,20,last), ma20prev = _sma(closes,20,Math.max(0,last-5));
  const slope = (ma20now!=null && ma20prev!=null && ma20prev>0) ? (ma20now - ma20prev)/ma20prev : 0;
  const seg60 = rows.slice(Math.max(0,n-60));
  const hi60 = Math.max(...seg60.map(r=>+r.high)), lo60 = Math.min(...seg60.map(r=>+r.low));
  const pos60 = (hi60>lo60) ? (price - lo60)/(hi60 - lo60) : 0.5;
  const trendUp = slope > 0.005 && pos60 > 0.5;

  // [S503] count 모드 — 연속/패턴 없는 종목. 8봉 카운터만으로 기본 점수 부여 → early return.
  if(mode === 'count'){
    score = _counter8;
    reasons.push(`최근 8봉 — 음봉 ${_red8}·양봉 ${_green8} (카운터 ${_counter8>=0?'+':''}${_counter8})`);
    reasons.push('연속·패턴 신호 없음 — 8봉 분포 기반 기본 점수');
    _applyExtra();
    score = Math.max(-100, Math.min(100, Math.round(score)));
    const label = _ctLabel(); // [S539] 단일봉 신호 시 ±20 약확신
    return { active:true, mode:'count', score, label, reasons, warn:null, redCnt, greenCnt, streak:0, red8:_red8, green8:_green8, counter8:_counter8, asOf: rows[last].date, nextBar:_nextBar, sbFired:_sbFired, regime:_regime };
  }

  // [S491] flip 모드 — 엔진 반전 패턴(ind.candle) 기반. 패턴 강도(score 7~15)에 비례 가점 + 추세 정합 + 거래량.
  if(mode === 'flipUp' || mode === 'flipDown'){
    const fup = mode === 'flipUp', fdir = fup ? 1 : -1;
    const pat = fup ? _bullPat : _bearPat;
    const trendDnF = slope < -0.005 && pos60 < 0.5;
    score += fdir * Math.min(45, Math.round(pat.score * 3));   // 엔진 강도 7~15 → 21~45
    reasons.push((fup?'🔺 ':'🔻 ') + pat.name + ` (캔들 엔진 감지 · 강도 ${pat.score})`);
    if(fup){
      if(trendDnF){ score += 12; reasons.push('하락추세 바닥권 반전 (신뢰도↑)'); }
      else if(trendUp){ score += 6; reasons.push('상승추세 눌림 후 재상승'); }
    } else {
      if(trendUp){ score -= 12; warn = '상승추세 천장권 약세 전환 신호'; reasons.push('⚠️ 상승추세 천장 반전 (신뢰도↑)'); }
      else if(trendDnF){ score -= 6; reasons.push('하락추세 지속'); }
    }
    let v5=0, vk=0; for(let i=Math.max(0,last-5); i<last; i++){ v5+=V(i); vk++; } v5 = vk ? v5/vk : 0;
    if(v5>0 && V(last) > v5*1.2){ score += fdir*10; reasons.push('전환봉 거래량 동반 (신뢰도↑)'); }
    score += _counter8;   // [S503] 8봉 카운터 보조
    if(_counter8 !== 0) reasons.push(`최근 8봉 — 음봉 ${_red8}·양봉 ${_green8} (카운터 ${_counter8>=0?'+':''}${_counter8})`);   // [S504] 카운터를 점수 항목으로 명시
    _applyExtra();
    score = Math.max(-100, Math.min(100, Math.round(score)));
    const label = _ctLabel(); // [S539] 단일봉 신호 시 ±20 약확신
    return { active:true, mode, score, label, reasons, warn, redCnt, greenCnt, streak:0, patName: pat.name, red8:_red8, green8:_green8, counter8:_counter8, asOf: rows[last].date, nextBar:_nextBar, sbFired:_sbFired, regime:_regime };
  }

  // ===== 연속 모드 (rebound / reversal) =====
  const reb = mode === 'rebound';        // 반등 모드(음봉연속) — 양수 지향
  const dir = reb ? 1 : -1;              // 점수 부호: 반등=+, 반전=−
  const streak = reb ? redCnt : greenCnt;
  const trendDn = slope < -0.005 && pos60 < 0.5;   // [S531] 0.4/0.6 비대칭 → 0.5 통일 (trendUp pos60>0.5·flip과 대칭)
  if(reb){
    if(trendUp){ score += 20; reasons.push('상승추세 눌림목 (20MA↑ · 60일 고점권)'); }
    else if(trendDn){ score -= 20; warn = '하락추세 진행 중 — 연속 음봉이 추세 하락의 일부일 수 있음'; reasons.push('⚠️ 하락추세 (20MA↓ · 60일 저점권)'); } // [S531] -25→-20 (reversal trendUp +20과 대칭)
    else { score += 5; reasons.push('추세 횡보'); }
  } else {
    if(trendDn){ score -= 20; warn = '하락추세 속 반등 — 데드캣 바운스 후 재하락 가능'; reasons.push('⚠️ 하락추세 반등 (데드캣 의심)'); }
    else if(trendUp){ score += 20; reasons.push('상승추세 지속 (20MA↑ · 60일 고점권)'); }
    else { score -= 5; reasons.push('추세 횡보'); }
  }

  // [S485] C1-b 연속일수 보정 — '추세 × 연속일수'를 양봉 전이 유망도 축에 반영.
  //   적정(3~5)=신호 성숙 / 과도(6+)=추세 전환 신호로 부호 반전. 부호는 항상 양봉 가능성 기준(↑=+ / ↓=−).
  if(reb){
    if(trendUp && streak >= 3 && streak <= 5){ score += 6; reasons.push(`눌림 ${streak}연속 — 반등 성숙`); }
    else if(streak >= 6){ score -= 8; if(!warn) warn = `음봉 ${streak}연속 — 단순 눌림 넘어 추세 약화 신호`; reasons.push(`⚠️ 음봉 ${streak}연속 (과도)`); }
    else if(trendDn && streak >= 4){ score -= 8; reasons.push(`⚠️ 하락추세 ${streak}연속 — 투매 지속`); }
  } else {
    if(trendDn && streak >= 3 && streak <= 5){ score -= 6; reasons.push(`반락 ${streak}연속 — 반전 성숙`); } // [S531] 대칭: reb의 trendUp 성숙(+6) 거울
    else if(streak >= 6){ score -= 8; if(!warn) warn = `양봉 ${streak}연속 — 과열, 음봉 전이 임박`; reasons.push(`⚠️ 양봉 ${streak}연속 (과열)`); }
    else if(trendUp && streak >= 4){ score += 8; reasons.push(`상승추세 ${streak}연속 — 상승 지속`); } // [S531] 대칭: reb의 trendDn 투매지속(-8) 거울 (기존 데드캣 무점수 노트 대체)
  }

  // C2 압력 고갈 — 거래량 위축 + 몸통 축소 (반등=매도압력 고갈 / 반전=매수압력 고갈)
  let vol5 = 0, vc = 0; for(let i=Math.max(0,last-5); i<last; i++){ vol5 += V(i); vc++; } vol5 = vc ? vol5/vc : 0;
  if(vol5 > 0 && V(last) < vol5 * 0.7){ score += dir*10; reasons.push(reb ? '거래량 위축 (매도압력 고갈)' : '거래량 위축 (매수압력 고갈)'); }
  const body = Math.abs(C(last)-O(last)), bodyPrev = Math.abs(C(last-1)-O(last-1));
  if(bodyPrev > 0 && body < bodyPrev){ score += dir*8; reasons.push(reb ? '음봉 몸통 축소' : '양봉 몸통 축소'); }

  // C3 지지/저항선 겹침 — 200MA · 직전 고점 · 볼린저밴드 (반등=지지/하단 / 반전=저항/상단), 현재가 ±3%
  const near = lv => lv!=null && lv>0 && Math.abs(price-lv)/price <= 0.03;
  const prevSeg = rows.slice(Math.max(0,n-60), Math.max(1,n-5));
  const _bb = (indicators && indicators._advanced && indicators._advanced.bb) ? indicators._advanced.bb
            : (indicators && indicators.bb) ? indicators.bb : null;
  let confl = 0;
  if(near(_sma(closes,200,last))){ confl++; reasons.push('200MA 근접'); }
  if(prevSeg.length && near(Math.max(...prevSeg.map(r=>+r.high)))){ confl++; reasons.push(reb ? '직전 전고점 매물대' : '직전 고점 저항'); }
  const bbLv = reb ? (_bb && _bb.lower) : (_bb && _bb.upper);
  if(near(bbLv)){ confl++; reasons.push(reb ? '볼린저 하단' : '볼린저 상단'); }
  if(confl > 0){ score += dir*confl*8; if(confl >= 2) reasons.push(`${reb?'지지':'저항'}선 ${confl}겹`); }

  // C4 이격/폭 — 반등: 20일 고점 대비 낙폭 / 반전: 20일 저점 대비 급등폭
  if(reb){
    const hi20 = Math.max(...rows.slice(Math.max(0,n-20)).map(r=>+r.high));
    const dd = hi20>0 ? (hi20 - price)/hi20 : 0;
    if(dd >= 0.15){ score += 12; reasons.push(`20일 고점 대비 -${Math.round(dd*100)}% 조정 (눌림 충분)`); }
    else if(dd < 0.05){ score -= 15; reasons.push(`⚠️ 고점권 첫 음봉 (조정 -${Math.round(dd*100)}%, 물림 위험)`); }
  } else {
    const lo20 = Math.min(...rows.slice(Math.max(0,n-20)).map(r=>+r.low));
    const ru = lo20>0 ? (price - lo20)/lo20 : 0;
    if(ru >= 0.15){ score -= 12; reasons.push(`20일 저점 대비 +${Math.round(ru*100)}% 급등 (과열)`); }
    else if(ru < 0.05){ score += 15; reasons.push(`저점 막 반등 (+${Math.round(ru*100)}%, 상승 여지)`); }
  }

  // C5 마지막 봉 꼬리 — 반등: 아래꼬리(매수세) / 반전: 윗꼬리(매도세). [S538] continuation 시장(US/KR)은 장대봉을 추세 계속으로 여기서 처리(연속모드 한정, S535 이전 상태). reversion 시장(코인)은 _applyExtra에서 되돌림.
  const rng = H(last) - L(last), bodyRatio = rng>0 ? body/rng : 0;
  const _cont = _prof.candleMode === 'continuation';
  if(reb){
    const lowerWick = Math.min(O(last),C(last)) - L(last), wr = rng>0 ? lowerWick/rng : 0;
    if(wr >= 0.30){ score += 8; reasons.push('아래꼬리 — 저가 매수세 유입'); }
    else if(_cont && wr < 0.05 && bodyRatio > 0.7){ score -= 12; reasons.push('⚠️ 장대음봉 (꼬리 없음 — 추가 하락 여지)'); } // [S538] continuation: 추세 계속
  } else {
    const upperWick = H(last) - Math.max(O(last),C(last)), ur = rng>0 ? upperWick/rng : 0;
    if(ur >= 0.30){ score -= 8; reasons.push('윗꼬리 — 고가 매도세 출현'); }
    else if(_cont && ur < 0.05 && bodyRatio > 0.7){ score += 12; reasons.push('장대양봉 (꼬리 없음 — 상승 강함)'); } // [S538] continuation: 추세 계속
  }

  score += _counter8;   // [S503] 8봉 카운터 보조
  if(_counter8 !== 0) reasons.push(`최근 8봉 — 음봉 ${_red8}·양봉 ${_green8} (카운터 ${_counter8>=0?'+':''}${_counter8})`);   // [S504] 카운터를 점수 항목으로 명시
  _applyExtra();
  score = Math.max(-100, Math.min(100, Math.round(score)));
  const label = _ctLabel(); // [S539] 단일봉 신호 시 ±20 약확신
  return { active:true, mode, score, label, reasons, warn, redCnt, greenCnt, streak, red8:_red8, green8:_green8, counter8:_counter8, asOf: rows[last].date, nextBar:_nextBar, sbFired:_sbFired, regime:_regime };
}

// [S534] 캔들 전이 신뢰도 — 3시장 바스켓 실측(S532~533) 기반 데이터 티어.
//   결론: 음봉·|점수|40~44·코인/US = sweet spot(baseline +7~10%p·상회 10~11/12종목). 그 외는 신뢰 낮춤.
//   · 양봉 전이 예측 = 어느 시장도 baseline 미달(구조적 약함) · KR = 전 임계 예측력 없음
//   · |점수|≥45 = 과열·극단으로 오히려 edge 급락(45+는 강해도 신뢰 안 올림 — '젤 좋은 구간만 신뢰') · <30 = 예측 임계 미만
function _ctNormMkt(m){
  var s = String(m||'').toLowerCase();
  if(s.indexOf('coin')>=0 || s.indexOf('crypto')>=0 || s.indexOf('upbit')>=0 || s.indexOf('코인')>=0) return 'coin';
  if(s === 'us' || s.indexOf('nasdaq')>=0 || s.indexOf('nyse')>=0 || s.indexOf('해외')>=0) return 'us';
  if(s === 'kr' || s.indexOf('kospi')>=0 || s.indexOf('kosdaq')>=0) return 'kr';
  if(s.indexOf('us')>=0) return 'us';
  return 'kr';
}
function _ctConfidence(score, market, sbFired, regime){
  var mk = _ctNormMkt(market), a = Math.abs(score);
  // [S543] 현재 레짐 게이팅 — 음봉 신뢰는 레짐별로 크게 다름(S542 바스켓 실측). 카드가 방향 잡는 구간만 표시.
  if(a < 30 && !(sbFired && a >= 20)) return { label:'예측 임계 미만', color:'#6b7280', why:'방향 예측 보류 구간 (|점수|<30, 단일봉 신호도 없음)' };
  if(score > 0) return { label:'신뢰 낮음 (양봉)', color:'#dc2626', why:'양봉 전이 예측은 전 시장에서 대체로 baseline 미달 — 상승 전이는 노이즈가 커 신뢰 낮음' };
  if(mk === 'kr') return { label:'예측력 약함 (KR)', color:'#6b7280', why:'KR은 전 레짐에서 음봉 baseline 미달 — 다음봉 색 예측이 잘 통하지 않음 (차후 전용 로직 예정)' };
  // 음봉 (coin/us) — 현재 레짐별 신뢰 (바스켓 실측: 코인은 하락장, US는 횡보·하락장에서 음봉이 통함 / 불장·상승장은 약함)
  var rg = regime || 'side';
  var RGL = ({ bull:'불장', up:'상승장', side:'횡보장', down:'하락장' })[rg] || '중립';
  var REL = {
    coin: { down:'high', up:'mid', side:'low', bull:'low' },
    us:   { down:'high', side:'high', up:'low', bull:'low' }
  };
  var rel = (REL[mk] && REL[mk][rg]) || 'low';
  var wk = (a < 30) ? ' (단일봉)' : '';
  if(rel === 'high') return { label:'신뢰 높음' + (mk==='coin'?' ⭐':'') + wk, color:'#16a34a',
    why:'현재 ' + RGL + ' — ' + (mk==='coin'?'코인':'US') + ' 음봉이 가장 잘 통하는 레짐 (바스켓 +6~12%p · 상회 10~11/12).' };
  if(rel === 'mid') return { label:'신뢰 보통' + wk, color:'#f59e0b',
    why:'현재 ' + RGL + ' — 음봉 약한 우위(+3%p 안팎). 강한 신뢰 구간은 아님.' };
  return { label:'신뢰 낮음 · 추세주의', color:'#dc2626',
    why:'현재 ' + RGL + ' — 이 레짐에선 음봉 전이 적중이 약함(바스켓 edge ≈0~음수). ' + ((mk==='us'&&(rg==='up'||rg==='bull'))?'US는 상승 추세에서 음봉이 특히 안 통함. ':'') + '신뢰 낮춤.' };
}
// [S481] 캔들 전이 예측 카드 (분석탭 전광판 아래, 실험 영역)
// ===== [S549] 단기 추세 매매 (실험 카드) — MA 골든크로스 진입 → 데드크로스 청산. 보조지표 AND(최근 N봉). 독립 룰. =====
const _TREND_MKT_DEFAULT = { kr:[5,9], us:[5,9], coin:[5,9] };
// [S573] 단기추세 기본 프리셋 — 순수 MA 골든/데드크로스만. 매수·매도 보조칩 전부 OFF, 정배열 재진입 OFF (사진 기준 0건 적용 상태).
//   매번 새 객체 반환(aux/sell 참조 공유 방지). MA쌍은 시장별 _TREND_MKT_DEFAULT 사용.
function _trendDefaults(market){
  const d=_TREND_MKT_DEFAULT[market]||[5,9];
  return { s:d[0], l:d[1], n:3,
    aux:{},
    sell:{},
    reentry:false,
    predict:false, predLead:1,   // [S623] 🔮 크로스 예측 진입 (kNN 선행 1~2봉)
    earlyMa5:false,              // [S675] 종가<단기MA 조기청산 (데드크로스보다 빠른 비대칭 익절) — 실험 opt-in
    earlySlope:false,            // [S678] MA5 기울기 하향 조기청산 (종가<MA5보다 부드러움) — 실험 opt-in
    disSl:false, slAtr:3,        // [S675] 넓은 ATR 재앙 손절 (폭락 바닥만, 리스크 정책) — 실험 opt-in
    entrySlope:false, entryConfirm:true,  // [S687] 기울기 조기진입(단기MA 상향전환 시 골든크로스 전 진입) + 확인봉(종가>단기MA). 검증된 기울기 청산의 거울. 실험 opt-in.
    nextOpen:false };  // [S581] 진입방식: false=신호봉 종가(기본) / true=다음봉 시가
}
const _TREND_AUX = [
  {k:'rsiGc',  label:'RSI 골든'},
  {k:'macd0',  label:'MACD 0선↑'},
  {k:'macdGc', label:'MACD 골든'},
  {k:'vol',    label:'거래량↑'},
  {k:'obv',    label:'OBV↑'},
  {k:'ma20',   label:'가격>20MA'},
  {k:'rsiCool',label:'RSI 과열회피'},
  {k:'maLup',  label:'추세 우상향'},
  {k:'gt60',   label:'가격>60MA'}
];
// [S555] 매도(조기청산) 칩 — 매수의 거울상. OR 조건, 데드크로스에 "추가" 트리거. 현재봉 평가.
const _TREND_SELL = [
  {k:'rsiDc',  label:'RSI 데드'},
  {k:'macdDc', label:'MACD 데드'},
  {k:'lt20',   label:'가격<20MA'},
  {k:'rsiHot', label:'RSI 과열익절'},
  {k:'maLdn',  label:'추세 우하향'},
  {k:'lt60',   label:'가격<60MA'},
  {k:'bbUp',   label:'BB상단이탈'},      // [S570] BT 조기청산 bbUpper 대응
  {k:'bbMa5',  label:'BB상단↓5일선'}     // [S570] BT 조기청산 bbMa5Exit 대응 (최근3봉 BB이탈 + 종가<5일선)
];
// [S556] 칩 섹션 접힘 상태 (기본 접힘) — _trendRerender 사이 유지되도록 모듈 변수
let _trendBuyOpen=false, _trendSellOpen=false;
function _trendMkt(stock){ const m=(stock&&(stock._mkt||stock.market))||(typeof currentMarket!=='undefined'?currentMarket:'kr'); return (m==='coin'||m==='us'||m==='kr')?m:'kr'; }
function _trendCfg(market){
  const d=_TREND_MKT_DEFAULT[market]||[5,9];
  let cfg=_trendDefaults(market); // [S572] 기본 프리셋(칩·재진입) 포함 — localStorage 있으면 아래서 덮어씀
  try { const raw=localStorage.getItem('SX_TREND_'+market); if(raw){ const o=JSON.parse(raw); if(o){ cfg.s=+o.s||d[0]; cfg.l=+o.l||d[1]; cfg.n=+o.n||3; cfg.aux=(o.aux&&typeof o.aux==='object')?o.aux:{}; cfg.sell=(o.sell&&typeof o.sell==='object')?o.sell:{}; cfg.reentry=!!o.reentry; cfg.nextOpen=!!o.nextOpen; cfg.predict=!!o.predict; cfg.predLead=(o.predLead==='auto')?'auto':((+o.predLead===2)?2:1); cfg.earlyMa5=!!o.earlyMa5; cfg.earlySlope=!!o.earlySlope; cfg.disSl=!!o.disSl; cfg.slAtr=(+o.slAtr>0)?+o.slAtr:3; cfg.entrySlope=!!o.entrySlope; cfg.entryConfirm=(o.entryConfirm!==false); } } } catch(_){}
  if(!(cfg.s>0)) cfg.s=d[0]; if(!(cfg.l>0)) cfg.l=d[1]; if(cfg.s>=cfg.l) cfg.l=cfg.s+1; if(!(cfg.n>=1)) cfg.n=3;
  return cfg;
}
function _trendSave(market,cfg){ try { localStorage.setItem('SX_TREND_'+market, JSON.stringify(cfg)); } catch(_){} }
// [S571] 단기추세 BB칩 — 실제 BT 엔진이 쓰는 시장별 BB 파라미터 사용 (적용 파라미터 우선, 없으면 시장 기본).
//   기본: 국내 14×1.9 / 해외 20×2 / 코인 9×2.1 (SCR_ANAL_MARKET_DEFAULTS와 동일). BT는 _loadAnalParams().bbLen/bbMult 사용.
function _trendBbParams(market){
  const _def = ({ kr:[14,1.9], us:[20,2.0], coin:[9,2.1] })[market] || [20,2.0];
  try { const ap = (typeof _loadAnalParams === 'function') ? _loadAnalParams() : null;
    if(ap && +ap.bbLen>0 && +ap.bbMult>0) return [+ap.bbLen, +ap.bbMult]; } catch(_){}
  return _def;
}

// ── 지표 시리즈 헬퍼 ──
function _trSma(a,p){ const o=new Array(a.length).fill(null); let s=0; for(let i=0;i<a.length;i++){ s+=a[i]; if(i>=p) s-=a[i-p]; if(i>=p-1) o[i]=s/p; } return o; }
function _trEma(a,p){ const o=new Array(a.length).fill(null); const k=2/(p+1); let e=null,cnt=0,acc=0; for(let i=0;i<a.length;i++){ const v=a[i]; if(v==null){ o[i]=null; continue; } if(e==null){ acc+=v; cnt++; if(cnt>=p){ e=acc/p; o[i]=e; } } else { e=v*k+e*(1-k); o[i]=e; } } return o; }
function _trRsi(close,p){ const n=close.length, o=new Array(n).fill(null); if(n<=p) return o; let g=0,l=0; for(let i=1;i<=p;i++){ const d=close[i]-close[i-1]; if(d>=0)g+=d; else l-=d; } g/=p; l/=p; o[p]= l===0?100:100-100/(1+g/l); for(let i=p+1;i<n;i++){ const d=close[i]-close[i-1]; g=(g*(p-1)+(d>0?d:0))/p; l=(l*(p-1)+(d<0?-d:0))/p; o[i]= l===0?100:100-100/(1+g/l); } return o; }
function _trMacd(close){ const e12=_trEma(close,12), e26=_trEma(close,26); const macd=close.map((_,i)=> (e12[i]!=null&&e26[i]!=null)? e12[i]-e26[i]: null); const sig=_trEma(macd,9); return {macd,sig}; }
function _trObv(close,vol){ const n=close.length, o=new Array(n).fill(null); let v=0; o[0]=0; for(let i=1;i<n;i++){ if(close[i]>close[i-1]) v+=vol[i]; else if(close[i]<close[i-1]) v-=vol[i]; o[i]=v; } return o; }
// [S570] 볼린저밴드 상단 — SMA(p) + mult×표준편차. 단기추세 매도칩(BB상단이탈) 전용. 표준 20×2.
function _trBbUp(close,p,mult){ const n=close.length, up=new Array(n).fill(null); for(let i=p-1;i<n;i++){ let s=0; for(let j=i-p+1;j<=i;j++) s+=close[j]; const m=s/p; let v=0; for(let j=i-p+1;j<=i;j++){ const d=close[j]-m; v+=d*d; } up[i]=m+mult*Math.sqrt(v/p); } return up; }

// ── 전략 백테스트 ──
function _trendBt(rows,cfg,bbP){
  const n=rows.length; if(!n||n<Math.max(30,cfg.l+5)) return null;
  const _bbLen=(bbP&&+bbP[0]>0)?+bbP[0]:20, _bbMult=(bbP&&+bbP[1]>0)?+bbP[1]:2.0; // [S571] 시장별 BB
  const close=rows.map(r=>+(r.close!=null?r.close:r.c));
  const vol=rows.map(r=>+(r.volume!=null?r.volume:(r.v!=null?r.v:0)));
  const maS=_trSma(close,cfg.s), maL=_trSma(close,cfg.l);
  // [S675] ATR(14) 인라인 — 재앙 손절(disSl)용. 단기추세엔 ATR 헬퍼 없음 → TR 직접 계산. disSl ON일 때만 계산(성능).
  let _atr=null;
  if(cfg.disSl){
    const _hi=rows.map(r=>+(r.high!=null?r.high:(r.h!=null?r.h:(r.close!=null?r.close:r.c))));
    const _lo=rows.map(r=>+(r.low!=null?r.low:(r.l!=null?r.l:(r.close!=null?r.close:r.c))));
    const _tr=new Array(n).fill(0);
    for(let i=0;i<n;i++){ const hl=_hi[i]-_lo[i]; _tr[i]=(i===0)?hl:Math.max(hl,Math.abs(_hi[i]-close[i-1]),Math.abs(_lo[i]-close[i-1])); }
    _atr=_trSma(_tr,14);
  }
  const A=cfg.aux||{};        // 매수 (조건간 AND)
  const SEL=cfg.sell||{};     // 매도 (조건간 OR · 데드크로스에 추가)
  const need=Object.keys(A).filter(k=>A[k]);
  const sneed=Object.keys(SEL).filter(k=>SEL[k]);
  // 공유 시리즈 — 매수/매도 어느 한쪽이라도 필요하면 1회 계산
  let rsi,rsiSig,mac,vMa,obv,obvSig,ma20,ma60,bbUp,ma5; // [S570] bbUp/ma5 추가
  const needRsi    = A.rsiGc||A.rsiCool||SEL.rsiDc||SEL.rsiHot;
  const needRsiSig = A.rsiGc||SEL.rsiDc;
  const needMac    = A.macd0||A.macdGc||SEL.macdDc;
  const needMa20   = A.ma20||SEL.lt20;
  const needMa60   = A.gt60||SEL.lt60;
  const needBb     = SEL.bbUp||SEL.bbMa5;   // [S570]
  if(needRsi){ rsi=_trRsi(close,14); if(needRsiSig) rsiSig=_trEma(rsi,9); }
  if(needMac){ mac=_trMacd(close); }
  if(A.vol){ vMa=_trSma(vol,5); }
  if(A.obv){ obv=_trObv(close,vol); obvSig=_trSma(obv,14); }
  if(needMa20){ ma20=_trSma(close,20); }
  if(needMa60){ ma60=_trSma(close,60); }
  if(needBb){ bbUp=_trBbUp(close,_bbLen,_bbMult); }   // [S571] 시장별 BB (BT 엔진과 동일)
  if(SEL.bbMa5){ ma5=_trSma(close,5); }      // [S570] 5일선 (BB상단↓5일선용, cfg.s와 무관 고정 5)
  // 레짐(과열 컷 차등): _btRegimeAt 없으면 'side'(엄격) 폴백 · 인덱스별 메모이즈
  const _regCache={};
  const _isStrong=(i)=>{ let r=_regCache[i]; if(r===undefined){ try{ r=(typeof _btRegimeAt==='function')?_btRegimeAt(rows,i):'side'; }catch(_){ r='side'; } _regCache[i]=r; } return r==='bull'||r==='up'; };
  // 매수: 이벤트형(기존6)=최근N봉 OR-윈도우, 상태형(신규3)=진입봉 기준. 조건간 AND.
  const auxOk=(i)=>{
    if(!need.length) return true;
    const N=Math.max(1,cfg.n||3), lo=Math.max(0,i-N+1);
    const any=fn=>{ for(let j=lo;j<=i;j++) if(fn(j)) return true; return false; };
    if(A.rsiGc && !any(j=>rsi[j]!=null&&rsiSig[j]!=null&&rsi[j]>rsiSig[j])) return false;
    if(A.macd0 && !any(j=>mac.macd[j]!=null&&mac.macd[j]>0)) return false;
    if(A.macdGc && !any(j=>mac.macd[j]!=null&&mac.sig[j]!=null&&mac.macd[j]>mac.sig[j])) return false;
    if(A.vol && !any(j=>vMa[j]!=null&&vol[j]>vMa[j])) return false;
    if(A.obv && !any(j=>obv[j]!=null&&obvSig[j]!=null&&obv[j]>obvSig[j])) return false;
    if(A.ma20 && !any(j=>ma20[j]!=null&&close[j]>ma20[j])) return false;
    // 상태형(진입봉 기준)
    if(A.rsiCool){ if(rsi[i]==null) return false; if(!(rsi[i] <= (_isStrong(i)?80:65))) return false; }
    if(A.maLup){ if(!(maL[i]!=null&&maL[i-2]!=null&&maL[i]>maL[i-2])) return false; }
    if(A.gt60){ if(!(ma60[i]!=null&&close[i]>ma60[i])) return false; }
    return true;
  };
  // 매도(조기청산): 선택 조건 중 하나라도 현재봉에서 참이면 청산 (OR). 미선택 시 false → 데드크로스만.
  const sellHit=(i)=>{
    if(!sneed.length) return false;
    if(SEL.rsiDc && rsi[i]!=null&&rsiSig[i]!=null&&rsi[i]<rsiSig[i]) return true;
    if(SEL.macdDc && mac.macd[i]!=null&&mac.sig[i]!=null&&mac.macd[i]<mac.sig[i]) return true;
    if(SEL.lt20 && ma20[i]!=null&&close[i]<ma20[i]) return true;
    if(SEL.rsiHot && rsi[i]!=null && rsi[i]>=(_isStrong(i)?85:70)) return true;
    if(SEL.maLdn && maL[i]!=null&&maL[i-2]!=null&&maL[i]<maL[i-2]) return true;
    if(SEL.lt60 && ma60[i]!=null&&close[i]<ma60[i]) return true;
    // [S570] BB 상단 이탈 — 종가가 BB 상단 위로 마감
    if(SEL.bbUp && bbUp[i]!=null && close[i]>bbUp[i]) return true;
    // [S570] BB상단↓5일선 — 최근 3봉 이내 BB 상단 이탈 AND 종가 < 5일선 (밴드 과열 스파이크 후 반전)
    if(SEL.bbMa5 && ma5[i]!=null){
      const _bbRecent = (bbUp[i]!=null&&close[i]>bbUp[i])
        || (i>=1&&bbUp[i-1]!=null&&close[i-1]>bbUp[i-1])
        || (i>=2&&bbUp[i-2]!=null&&close[i-2]>bbUp[i-2]);
      if(_bbRecent && close[i]<ma5[i]) return true;
    }
    return false;
  };
  const trades=[]; let pos=null; let _lastExitIdx=-999; // [S570] 쿨다운용
  const _reOn = !!cfg.reentry; // [S570] 정배열 재진입 토글
  // [S581] 진입방식 — nextOpen ON: 신호봉 i의 "다음봉(i+1) 시가"로 진입. 청산검사는 현행대로 종가(별개).
  //   다음봉 없음(마지막봉 신호) → 진입 보류(BT 미반영 = 실전 "내일 시가 매수 예정"). open 폴백 r.open→r.o.
  const _nextOpen = !!cfg.nextOpen;
  const _opens = _nextOpen ? rows.map(r=>+(r.open!=null?r.open:(r.o!=null?r.o:NaN))) : null;
  const _mkPos=(i,re)=>{
    let _p;
    if(_nextOpen){
      const j=i+1; if(j>=n) return null;
      const o=_opens[j]; if(!(o>0)) return null;
      _p={ entry:o, entryIdx:j, re:!!re };
    } else {
      _p={ entry:close[i], entryIdx:i, re:!!re };
    }
    if(_atr && _p.entryIdx<n && _atr[_p.entryIdx]>0) _p.atrEntry=_atr[_p.entryIdx]; // [S675] 진입시점 ATR 고정(재앙손절)
    return _p;
  };
  // [S623] 🔮 크로스 예측 진입 — 해석적 임박(gap 수렴) 게이트 + kNN 확인. 룩어헤드 차단(후보 결과 ≤ 쿼리시점). 벡터 1회 구축.
  const _predOn = !!cfg.predict;
  const _auto = (cfg.predLead==='auto');
  const _lead = _auto ? 2 : ((cfg.predLead===2)?2:1);   // 진입 게이트 최대 창(1/2봉전)
  const _LBL = 3;                                        // [S627] kNN 라벨/미확정 손절 창 = 3봉 고정(진입 타이밍과 디커플)
  const _ma20v=_trSma(close,20), _ma60v=_trSma(close,60);
  const _align=(i)=>(_ma20v[i]!=null&&_ma60v[i]!=null&&close[i]>_ma60v[i]&&_ma20v[i]>_ma60v[i]); // [S627] 장기 정배열(종가>60MA & 20MA>60MA)
  const _KN = (typeof window!=='undefined' && window.SXKNN) ? window.SXKNN : null;
  const _MINB = (_KN&&_KN.MIN_BANK)||40, _KK=(_KN&&_KN.K)||10, _PTHR=0.5;
  let _pPre=null, _pW=null;
  // [S630] D-day는 예측 스위치와 무관 — 최신봉 골든크로스 임박(해석적)이면 OFF여도 kNN 벡터 구축
  let _ddayGate=false;
  if(n>=2 && maS[n-1]!=null && maL[n-1]!=null && maS[n-2]!=null && maL[n-2]!=null){ const _g=maS[n-1]-maL[n-1], _c=_g-(maS[n-2]-maL[n-2]); _ddayGate=(_g<0 && _c>0 && (-_g/_c)<=3.5); }
  if((_predOn||_ddayGate) && _KN && _KN.buildVecs && n>=16+_MINB){ try { _pPre=_KN.buildVecs(rows,16); _pW=_pPre.W; } catch(_eP){ _pPre=null; } }
  const _gcLabelAt=(e)=>{ for(let j=e+1;j<=e+_LBL;j++){ if(j<1||j>=n) break; if(maS[j]!=null&&maL[j]!=null&&maS[j-1]!=null&&maL[j-1]!=null&&maS[j]>maL[j]&&maS[j-1]<=maL[j-1]) return true; } return false; };
  const _dcLabelAt=(e)=>{ for(let j=e+1;j<=e+_LBL;j++){ if(j<1||j>=n) break; if(maS[j]!=null&&maL[j]!=null&&maS[j-1]!=null&&maL[j-1]!=null&&maS[j]<maL[j]&&maS[j-1]>=maL[j-1]) return true; } return false; }; // [S631] 데드크로스 라벨(청산 예측용)
  // 반환: 0=진입안함 / 1·2=진입(유효 선행봉). 자동이면 신호강도(prob)로 1~2 결정.
  // [S629] kNN 확률만 분리 — D-day 예보에서도 재사용. -1=계산불가.
  const _knnProb=(i,labelFn)=>{
    if(!_pPre) return -1;
    const qv=_pPre.vecs[i-_pPre.from]; if(!qv) return -1;
    const lf=labelFn||_gcLabelAt;
    const cand=[];
    for(let e=_pPre.from; e<=i-_LBL; e++){ const cv=_pPre.vecs[e-_pPre.from]; if(!cv) continue; let d=0; for(let t=0;t<qv.length;t++){ const df=(qv[t]-cv[t])*_pW[t]; d+=df*df; } cand.push({d:d,up:lf(e)}); }
    if(cand.length<_MINB) return -1;
    cand.sort((a,b)=>a.d-b.d);
    const k=Math.min(_KK,cand.length), scale=Math.sqrt(cand[k-1].d)||1e-6;
    let wU=0,wA=0; for(let j=0;j<k;j++){ const dist=Math.sqrt(cand[j].d), w=Math.exp(-(dist*dist)/(2*scale*scale+1e-9)); wA+=w; if(cand[j].up) wU+=w; }
    return wA>0?wU/wA:0;   // 비슷한 과거 모양이 3봉내 교차로 이어진 비율
  };
  const _predGc=(i)=>{
    if(!_pPre) return 0;
    if(maS[i]==null||maL[i]==null||maS[i-1]==null||maL[i-1]==null) return 0;
    const gap=maS[i]-maL[i], conv=gap-(maS[i-1]-maL[i-1]);
    if(gap>=0 || conv<=0) return 0;                // 이미 교차 or 발산 → 임박 아님
    const btc = -gap/conv;                          // 투영 교차까지 봉수
    // [S627] 진입 선행봉 결정 — 자동: 정배열이면 2봉·아니면 1봉 / 2봉 고정: 정배열 아니면 진입 안함 / 1봉: 무조건
    const _al=_align(i);
    let lead;
    if(_auto) lead = _al ? 2 : 1;
    else { lead = _lead; if(lead>=2 && !_al) return 0; }
    if(!(btc <= lead+0.5)) return 0;                // 진입 타이밍(1/2봉 앞)
    const prob=_knnProb(i); if(prob<0) return 0;
    return (prob>=_PTHR) ? lead : 0;
  };
  // [S631] 청산 예측 — 데드크로스 임박 시 조기 매도(진입의 거울). 자동: 강추세(정배열)면 인내 1봉·약하면 빨리 2봉.
  const _predDc=(i)=>{
    if(!_pPre) return 0;
    if(maS[i]==null||maL[i]==null||maS[i-1]==null||maL[i-1]==null) return 0;
    const gap=maS[i]-maL[i], conv=gap-(maS[i-1]-maL[i-1]);
    if(gap<=0 || conv>=0) return 0;                // 이미 데드 or 상승강화 → 임박 아님
    const btc = gap/(-conv);                        // 데드크로스까지 봉수
    const _al=_align(i);
    let lead;
    if(_auto) lead = _al ? 1 : 2;                  // 강추세면 인내(1봉), 약하면 조기(2봉)
    else { lead = _lead; if(lead>=2 && _al) return 0; }  // 2봉 조기청산은 강추세(정배열)에선 안함
    if(!(btc <= lead+0.5)) return 0;
    const prob=_knnProb(i,_dcLabelAt); if(prob<0) return 0;
    return (prob>=_PTHR) ? lead : 0;
  };
  for(let i=1;i<n;i++){
    if(maS[i]==null||maL[i]==null||maS[i-1]==null||maL[i-1]==null) continue;
    const gc = maS[i]>maL[i] && maS[i-1]<=maL[i-1];
    const dc = maS[i]<maL[i] && maS[i-1]>=maL[i-1];
    if(pos==null){
      const _pl = _predOn ? _predGc(i) : 0;   // [S624] 0=안함 / 1·2=유효 선행봉
      if(_pl>0 && auxOk(i)){ const p=_mkPos(i,false); if(p){ p.pred=true; p.sigIdx=i; p.predLead=_pl; pos=p; } } // [S623/S624] 예측 선행 진입
      else if(gc && auxOk(i)){ const p=_mkPos(i,false); if(p) pos=p; } // [S581] 진입가/진입idx는 _mkPos가 결정
      // [S570] 재진입 — 실제 청산 이력(_lastExitIdx>=0) + 정배열 유지(maS>maL) + 청산 후 1봉 대기 + 매도조건 해제 + 매수조건 재충족
      else if(_reOn && _lastExitIdx>=0 && maS[i]>maL[i] && (i-_lastExitIdx>1) && !sellHit(i) && auxOk(i)){ const p=_mkPos(i,true); if(p) pos=p; }
      // [S687] 기울기 조기진입 — 단기MA 상향전환(꺾임→상승) 시 골든크로스(maS>maL) 전에 미리 진입(OR). 확인봉(종가>maS)·쿨다운(1봉)·auxOk. 검증된 기울기 청산의 거울.
      //   pre-cross(maS≤maL)에서만 발화 → "조기". 헛바운스(미확정 중 기울기 재하향)는 청산부에서 컷. 진짜 반등이면 곧 골든크로스 도래 → 확정 후 일반 청산.
      else if(cfg.entrySlope && i>=2 && maS[i-2]!=null && maS[i]>maS[i-1] && maS[i-1]<=maS[i-2] && (!cfg.entryConfirm || close[i]>maS[i]) && (i-_lastExitIdx>1) && !(maS[i]>maL[i]) && auxOk(i)){ const p=_mkPos(i,false); if(p){ p.slopeEntry=true; pos=p; } }
    }
    else {
      // [S623] 예측 진입 실패 손절 — 유효 선행봉(predLead) 지나도 실제 골든크로스 미확정(maS≤maL) → 청산(헛신호 컷)
      const _predFail = pos.pred && (i-pos.sigIdx>=_LBL) && !(maS[i]>maL[i]);
      const _predExit = _predOn && _predDc(i)>0;   // [S631] 예측 청산 — 데드크로스 임박 시 조기 매도
      // [S675] 종가<MA5(단기MA) 조기청산 — 데드크로스보다 빠른 비대칭 익절. opt-in. 정배열 재진입과 짝.
      const _earlyMa5 = cfg.earlyMa5 && maS[i]!=null && close[i]<maS[i];
      // [S678] MA5 기울기 하향 조기청산 — 단기MA가 꺾일 때만(종가<MA5보다 부드러움 · 잠깐 눌림엔 무발화 → 빅위너 덜 죽임)
      const _earlySlope = cfg.earlySlope && maS[i]!=null && maS[i-1]!=null && maS[i]<maS[i-1];
      // [S675] 넓은 ATR 재앙 손절 — 폭락 바닥만(리스크 정책·최적화 아님). 진입시점 ATR 고정.
      const _slMult = (cfg.slAtr>0)?cfg.slAtr:3;
      const _disSl = cfg.disSl && pos.atrEntry>0 && close[i] <= pos.entry - _slMult*pos.atrEntry;
      // [S687] 기울기 진입 포지션 확정(골든크로스 도래) 추적 + 미확정 중 기울기 재하향=헛바운스 컷. 확정 후엔 일반 청산(데드크로스 등) 따름.
      if(pos.slopeEntry && !pos.confirmed && maS[i]!=null && maL[i]!=null && maS[i]>maL[i]) pos.confirmed=true;
      const _slopeFail = !!pos.slopeEntry && !pos.confirmed && maS[i]!=null && maS[i-1]!=null && maS[i]<maS[i-1];
      if(dc || sellHit(i) || _predFail || _predExit || _earlyMa5 || _earlySlope || _disSl || _slopeFail){ const pnl=(close[i]/pos.entry-1)*100; trades.push({entry:pos.entry,exit:close[i],pnl:+pnl.toFixed(2),bars:i-pos.entryIdx,entryIdx:pos.entryIdx,exitIdx:i,re:!!pos.re,pred:!!pos.pred,predLead:pos.predLead||0,fail:!!_predFail,predExit:!!_predExit,early:!!_earlyMa5,slope:!!_earlySlope,disSl:!!_disSl,slopeEntry:!!pos.slopeEntry,slopeFail:!!_slopeFail,entryDate:(rows[pos.entryIdx]&&(rows[pos.entryIdx].date||rows[pos.entryIdx].t))||'',exitDate:(rows[i]&&(rows[i].date||rows[i].t))||''}); pos=null; _lastExitIdx=i; }
    }
  }
  // [S626] 예측 적중률 — 예측 발화한 모든 봉에서 실제 골든크로스가 유효 선행봉(L) 내 발생했는지. 미래 확정된 과거 구간만 평가(룩어헤드 아님).
  let _predFires=0, _predHits=0;
  if(_predOn && _pPre){
    for(let i=_pPre.from; i<n; i++){
      const L=_predGc(i); if(L<=0) continue;
      if(i+_LBL > n-1) continue;                 // [S627] 3봉 관측 가능 구간만(룩어헤드 아님)
      _predFires++;
      let hit=false; for(let j=i+1;j<=i+_LBL;j++){ if(maS[j]!=null&&maL[j]!=null&&maS[j-1]!=null&&maL[j-1]!=null&&maS[j]>maL[j]&&maS[j-1]<=maL[j-1]){ hit=true; break; } }
      if(hit) _predHits++;
    }
  }
  const predHit = _predFires>0 ? Math.round(_predHits/_predFires*1000)/10 : null;
  // [S632] 데드크로스(청산) 예측 적중률 — 예측 발화 봉에서 실제 데드크로스가 3봉내 도래했는지(룩어헤드 차단)
  let _predDcFires=0, _predDcHits=0;
  if(_predOn && _pPre){
    for(let i=_pPre.from; i<n; i++){
      const L=_predDc(i); if(L<=0) continue;
      if(i+_LBL > n-1) continue;
      _predDcFires++;
      let hit=false; for(let j=i+1;j<=i+_LBL;j++){ if(maS[j]!=null&&maL[j]!=null&&maS[j-1]!=null&&maL[j-1]!=null&&maS[j]<maL[j]&&maS[j-1]>=maL[j-1]){ hit=true; break; } }
      if(hit) _predDcHits++;
    }
  }
  const predDcHit = _predDcFires>0 ? Math.round(_predDcHits/_predDcFires*1000)/10 : null;
  // [S629/S631] 라이브 D-day 예보 — 골든/데드 양방향. 최신봉 기준, 엔트리 모드 무관(룩어헤드 아님)
  let predDday=null, predDdayProb=null, predDdayType=null;
  if(_pPre && n>=2){
    const li=n-1;
    if(maS[li]!=null&&maL[li]!=null&&maS[li-1]!=null&&maL[li-1]!=null){
      const gp=maS[li]-maL[li], cv=gp-(maS[li-1]-maL[li-1]);
      if(gp<0 && cv>0){ const btc=-gp/cv; if(btc<=3.5){ const pr=_knnProb(li); if(pr>=_PTHR){ predDday=Math.max(1,Math.round(btc)); predDdayProb=Math.round(pr*100); predDdayType='gc'; } } }
      else if(gp>0 && cv<0){ const btc=gp/(-cv); if(btc<=3.5){ const pr=_knnProb(li,_dcLabelAt); if(pr>=_PTHR){ predDday=Math.max(1,Math.round(btc)); predDdayProb=Math.round(pr*100); predDdayType='dc'; } } }
    }
  }
  // [S631] 오늘 예측 청산 발생 여부 — 마지막 거래가 예측 조기매도 & 최신봉
  const _ltr = trades.length?trades[trades.length-1]:null;
  const predExitNow = !!(_ltr && _ltr.predExit && _ltr.exitIdx===n-1);
  let open=null;
  if(pos){ const last=close[n-1]; open={entry:pos.entry,cur:last,pnl:+((last/pos.entry-1)*100).toFixed(2),bars:(n-1)-pos.entryIdx,entryIdx:pos.entryIdx,re:!!pos.re,pred:!!pos.pred,predLead:pos.predLead||0,confirmed:!!(maS[n-1]!=null&&maL[n-1]!=null&&maS[n-1]>maL[n-1]),entryDate:(rows[pos.entryIdx]&&(rows[pos.entryIdx].date||rows[pos.entryIdx].t))||''}; }
  // 통계
  const nT=trades.length; let wins=0,lossN=0,grossW=0,grossL=0,sumPnl=0;
  trades.forEach(t=>{ if(t.pnl>0){wins++;grossW+=t.pnl;} else if(t.pnl<0){lossN++;grossL+=-t.pnl;} sumPnl+=t.pnl; });
  const winRate=nT?Math.round(wins/nT*1000)/10:0;
  const avgWin=wins?+(grossW/wins).toFixed(2):0;
  const avgLoss=lossN?+(grossL/lossN).toFixed(2):0;
  const pf=grossL>0?Math.round(grossW/grossL*100)/100:(grossW>0?99:0);
  const expectancy=nT?+(sumPnl/nT).toFixed(2):0;
  let eq=1,peak=1,mdd=0;
  trades.forEach(t=>{ eq*=(1+t.pnl/100); if(eq>peak)peak=eq; const dd=peak>0?(peak-eq)/peak:0; if(dd>mdd)mdd=dd; });
  const totalPnl=+((eq-1)*100).toFixed(2);
  return { winRate, pf, totalPnl, totalTrades:nT, avgWin, avgLoss, mdd:+(mdd*100).toFixed(2), expectancy, trades, open, lastClose:close[n-1], predHit, predFires:_predFires, predDcHit, predDcFires:_predDcFires, predDday, predDdayProb, predDdayType, predExitNow };
}

// ── 현재 상태 라벨 ──
function _trendState(rows,cfg,bt){
  if(!bt) return { label:'데이터 부족', color:'var(--text3)' };
  if(bt.open){
    // [S625] 예측 진입 & 골든크로스 미확정 → 선행 베팅 상태 명시(소급 아님). predLead봉내 미발생 시 손절 예정.
    if(bt.open.pred && !bt.open.confirmed){
      return { label:`🔮 예측 진입 · ${bt.open.bars===0?'오늘':bt.open.bars+'봉 전'} 매수 · 골든크로스 미확정 (3봉내 미발생 시 손절)`, color:'#7c3aed' };
    }
    return { label:`보유중 · 진입 ${bt.open.bars}봉차 · 평가 ${bt.open.pnl>=0?'+':''}${bt.open.pnl}%`, color: bt.open.pnl>=0?'#22c55e':'#e8365a' };
  }
  // [S631] 오늘 예측 청산(데드크로스 임박 조기매도)
  if(bt.predExitNow){ return { label:`🔮 예측 청산 · 오늘 조기 매도 · 데드크로스 미확정 (임박 감지)`, color:'#e8365a' }; }
  // 마지막 크로스 판정
  const n=rows.length; const close=rows.map(r=>+(r.close!=null?r.close:r.c));
  const maS=_trSma(close,cfg.s), maL=_trSma(close,cfg.l);
  let lastGc=-1,lastDc=-1;
  for(let i=1;i<n;i++){ if(maS[i]==null||maL[i]==null||maS[i-1]==null||maL[i-1]==null) continue;
    if(maS[i]>maL[i]&&maS[i-1]<=maL[i-1]) lastGc=i;
    if(maS[i]<maL[i]&&maS[i-1]>=maL[i-1]) lastDc=i; }
  const N=Math.max(1,cfg.n||3);
  if(lastGc>=0 && lastGc>lastDc){ const ago=(n-1)-lastGc; if(ago<=N){ if(cfg.nextOpen && ago===0) return { label:`🟢 진입 신호 (골든크로스 발생 · 다음봉 시가 매수 예정)`, color:'#22c55e' }; return { label:`🟢 진입 신호 (골든크로스 ${ago}봉 전 매수)`, color:'#22c55e' }; } return { label:`상승 추세 (골든크로스 ${ago}봉 전 매수, 신호창 지남)`, color:'var(--text2)' }; }
  if(lastDc>=0){ const ago=(n-1)-lastDc; return { label:`🔴 청산/관망 (데드크로스 ${ago}봉 전 매도)`, color:'#e8365a' }; }
  return { label:'대기 (크로스 없음)', color:'var(--text3)' };
}

// ── 카드 ──
function _trendGridCell(num,label,color){ return `<div style="flex:1;min-width:0;background:var(--surface2);border-radius:8px;padding:8px 4px;text-align:center"><div style="font-size:15px;font-weight:800;color:${color};line-height:1.2">${num}</div><div style="font-size:9px;color:var(--text3);margin-top:2px">${label}</div></div>`; }
function _trendRenderInner(){
  const ctx = (typeof window!=='undefined' && window._sxTrendCtx) ? window._sxTrendCtx : null;
  if(!ctx || !Array.isArray(ctx.rows)) return '';
  const market=ctx.market, rows=ctx.rows, cfg=_trendCfg(market);
  const _bbp=_trendBbParams(market);
  // [S630] 종목 진입 시 가드 오버라이드 리셋 — 임시 OFF는 종목별·일회성(다른 종목 가면 초기화)
  const _stockKey=ctx.name||'';
  if(window._trendLastStock!==_stockKey){ window._trendGuardOverride={}; window._trendLastStock=_stockKey; }
  const _ov=!!(window._trendGuardOverride&&window._trendGuardOverride[_stockKey]);
  const _btOn=_trendBt(rows,cfg,_bbp);
  // [S628~S630] 선행 가드 — ON이 OFF보다 손해면 손해 표시 + 종목 진입 시 임시 OFF(🔮 탭으로 강제 ON 가능)
  let _guardBadge='', _guardHurt=false, _btOff=null;
  if(cfg.predict){
    try{ _btOff=_trendBt(rows,Object.assign({},cfg,{predict:false}),_bbp); }catch(_g){ _btOff=null; }
    if(_btOff){
      const dE=+(_btOn.expectancy-_btOff.expectancy).toFixed(2);
      const rM=_btOff.mdd>0?_btOn.mdd/_btOff.mdd:1, dM=_btOn.mdd-_btOff.mdd;
      let col,txt;
      if((rM>=1.5&&dM>=5)||dE<=-0.3){ _guardHurt=true; col='#e8365a'; txt=`⚠️ 선행 손해 · 자동 OFF (MDD ${_btOff.mdd}%→${_btOn.mdd}%${dE<0?` · 기댓값 ${dE}`:''}) · 🔮탭=강제${_ov?'OFF':'ON'}`; }
      else if(dE>=0.3&&_btOn.mdd<=_btOff.mdd*1.3){ col='#22c55e'; txt=`✓ 선행 유효 (기댓값 +${dE} vs OFF · MDD ${_btOn.mdd}%)`; }
      else { col='var(--text3)'; txt=`선행 중립 · OFF와 비슷 (기댓값 ${dE>=0?'+':''}${dE} · MDD ${_btOn.mdd}%)`; }
      _guardBadge=`<div style="margin:0 0 8px;padding:7px 11px;border-radius:9px;font-size:10px;font-weight:800;background:${col}1a;color:${col};border:1px solid ${col}55;line-height:1.4">${txt}</div>`;
    }
  }
  // [S630] 효과적 예측 = 글로벌 ON && !(손해 && 오버라이드 안함). 표시용 bt 결정.
  const _effPredict = !!cfg.predict && !(_guardHurt && !_ov);
  const bt = _effPredict ? _btOn : (_btOff || _btOn);
  try{ window._trendGuardState={ stock:_stockKey, hurt:_guardHurt }; }catch(_e){}
  // [S634] 차트 마커 동기화 — effective bt의 실제 진입/청산봉(예측 선행/조기청산/가드OFF 반영). 날짜 기반.
  try{
    if(window._sxTrendCtx){
      window._sxTrendCtx.effPredict = _effPredict; // [S634] 모달이 카드와 동일 bt(가드/오버라이드 반영) 쓰게
      const _trL = (bt&&bt.trades&&bt.trades.length) ? bt.trades[bt.trades.length-1] : null;
      const _opL = (bt&&bt.open) ? bt.open : null;
      window._sxTrendCtx.trendMarkers = {
        entryDate: _opL ? _opL.entryDate : (_trL ? _trL.entryDate : ''),
        entryPred: _opL ? !!_opL.pred : (_trL ? !!_trL.pred : false),
        exitDate:  _trL ? _trL.exitDate : '',
        exitPred:  _trL ? !!_trL.predExit : false
      };
    }
  }catch(_e2){}
  let st=_trendState(rows,cfg,bt);
  if(cfg.predict && _guardHurt && !_ov){ st={ label:`🛡️ ${st.label}`, color:st.color }; }
  const _mkLabel={kr:'국내',us:'해외',coin:'코인'}[market]||market;
  const _def=_TREND_MKT_DEFAULT[market]||[5,9];
  // 날짜
  const _last=rows.length?rows[rows.length-1]:null; const _ld=_last&&(_last.date||_last.t); const _dm=_ld?String(_ld).match(/(\d{4})-?(\d{2})-?(\d{2})/):null;
  const _tdy=new Date(); const _isToday=!!(_dm&&+_dm[1]===_tdy.getFullYear()&&+_dm[2]===_tdy.getMonth()+1&&+_dm[3]===_tdy.getDate());
  const _dTxt=_dm?`${+_dm[2]}/${+_dm[3]}`:'—'; const _dCol=_isToday?'var(--text3)':'#ef4444';
  const head=`<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><span style="font-size:13px;font-weight:800;color:var(--text)">📈 단기 추세 매매</span><span style="font-size:9px;padding:2px 6px;border-radius:4px;background:var(--surface2);color:var(--text3);border:1px solid var(--border)">실험</span><span onclick="_sxVib(12);window._trendOpenDetail&&_trendOpenDetail()" title="거래내역·자산흐름 보기" style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:#7c3aed22;color:#7c3aed;border:1px solid #7c3aed66;cursor:pointer">검증</span><span style="font-size:10px;font-weight:700;color:${_dCol};margin-left:auto">${_isToday?'':'⚠️ '}${_dTxt} 종가기준 매매</span></div>`;
  // MA 입력
  const _inp=(id,val)=>`<input id="${id}" type="number" inputmode="numeric" value="${val}" min="1" max="240" style="width:42px;padding:4px;border:1px solid var(--border);border-radius:6px;font-size:12px;text-align:center;font-weight:700;background:var(--surface);color:var(--text)">`;
  // [S659] LR crossDday 보조 배지 — kNN(bt.predDday, 동기)과 별개 독립 비동기 계산. BT 로직 무관(참고용).
  const _trLrKey = market+'|'+_stockKey+'|'+cfg.s+'|'+cfg.l+'|'+rows.length;
  const _trLid = '_trlr_' + Math.random().toString(36).slice(2,9);
  const _trLrReq = _trendLrRequestAsync(rows, _trLrKey, {s:cfg.s,l:cfg.l}, function(res){
    const el = document.getElementById(_trLid); if(el) el.outerHTML = _trendLrBadgeInline(res);
  });
  const _trLrHtml = _trLrReq.cached
    ? _trendLrBadgeInline(_trLrReq.res)
    : `<span id="${_trLid}" style="margin-left:6px;font-size:9px;color:var(--text3)">🤖 LR…</span>`;
  const maRow=`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;font-size:11px;color:var(--text2)">
    <span style="font-weight:700;color:var(--text)">${_mkLabel} 단기MA</span>
    ${_inp('sxTrendS',cfg.s)}<span style="color:var(--text3)">×</span>${_inp('sxTrendL',cfg.l)}
    <span style="color:var(--text3);font-size:9px">기본 ${_def[0]}×${_def[1]}</span>
    ${bt.predDday?`<span title="kNN+MA수렴 기준 크로스 임박 예보(적중률 동반)" style="margin-left:auto;font-size:10px;font-weight:800;color:${bt.predDdayType==='dc'?'#e8365a':'#7c3aed'};background:${bt.predDdayType==='dc'?'#e8365a':'#7c3aed'}1a;border:1px solid ${bt.predDdayType==='dc'?'#e8365a':'#7c3aed'}55;border-radius:12px;padding:3px 9px">${bt.predDdayType==='dc'?'🔴 데드크로스':'🔮 골든크로스'} D-${bt.predDday}${bt.predDdayProb!=null?` · ${bt.predDdayProb}%`:''}</span>`:`<span style="margin-left:auto"></span>`}
    ${_trLrHtml}
  </div>
  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:9px;font-size:11px;color:var(--text2)">
    <span>보조조건 최근</span>${_inp('sxTrendN',cfg.n)}<span>봉</span>
    <span style="margin-left:auto;display:flex;gap:6px"><span onclick="_sxVib(12);window._trendReset&&_trendReset()" style="font-size:11px;font-weight:800;padding:5px 11px;border-radius:7px;background:var(--surface2);color:var(--text2);border:1px solid var(--border);cursor:pointer">리셋</span><span onclick="_sxVib(15);window._trendApply&&_trendApply()" style="font-size:11px;font-weight:800;padding:5px 12px;border-radius:7px;background:#2563eb;color:#fff;cursor:pointer">적용</span></span>
  </div>`;
  // 매수/매도 토글 칩 — 접기/펼치기 (기본 접힘)
  const _chip=(a,on,fn,onCol)=>`<span onclick="window.${fn}&&${fn}('${a.k}')" style="font-size:10px;font-weight:700;padding:4px 9px;border-radius:14px;border:1px solid;cursor:pointer;${on?('background:'+onCol+';color:#fff;border-color:'+onCol):'background:var(--surface2);color:var(--text3);border-color:var(--border)'}">${a.label}</span>`;
  // [S581] 진입방식 칩 — 조건이 아닌 진입가 결정(청록색 구분). 조건 AND 카운트(_buyCnt)엔 미포함. ON=다음봉 시가, OFF=신호봉 종가.
  const nextOpenChip=`<span onclick="window._trendToggleNextOpen&&_trendToggleNextOpen()" title="신호(골든크로스) 발생 봉의 다음 봉 시가로 진입. OFF면 신호봉 종가 진입. 청산은 종가 기준 유지." style="font-size:10px;font-weight:700;padding:4px 9px;border-radius:14px;border:1px solid;cursor:pointer;${cfg.nextOpen?'background:#0891b2;color:#fff;border-color:#0891b2':'background:var(--surface2);color:#0891b2;border-color:#0891b266'}">⏭️ ${cfg.nextOpen?'다음봉 시가진입':'다음봉 시가진입 OFF'}</span>`;
  const buyChips=nextOpenChip+_TREND_AUX.map(a=>_chip(a,!!(cfg.aux&&cfg.aux[a.k]),'_trendToggleAux','#2563eb')).join('');
  const sellChips=_TREND_SELL.map(a=>_chip(a,!!(cfg.sell&&cfg.sell[a.k]),'_trendToggleSell','#e8365a')).join('');
  const _buyCnt=Object.keys(cfg.aux||{}).filter(k=>cfg.aux[k]).length;
  const _sellCnt=Object.keys(cfg.sell||{}).filter(k=>cfg.sell[k]).length;
  const _section=(title,color,cnt,open,toggleFn,chips)=>{
    const arrow=open?'▼':'▶';
    return `<div style="margin-bottom:8px">`
      +`<div onclick="window.${toggleFn}&&${toggleFn}()" style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:9px;font-weight:800;color:${color};${open?'margin-bottom:6px':''}">`
      +`<span style="font-size:8px;width:8px">${arrow}</span>${title}`
      +`<span style="margin-left:4px;padding:1px 7px;border-radius:8px;background:${color}1f;color:${color};font-weight:800">${cnt}건 적용</span></div>`
      +(open?`<div style="display:flex;flex-wrap:wrap;gap:5px">${chips}</div>`:'')
      +`</div>`;
  };
  const chipRow=_section('🟢 매수 조건 · 모두 충족(AND)','#2563eb',_buyCnt,_trendBuyOpen,'_trendToggleBuyOpen',buyChips)
              + _section('🔴 매도 조건 · 하나라도(OR) · 데드크로스에 추가','#e8365a',_sellCnt,_trendSellOpen,'_trendToggleSellOpen',sellChips);
  // [S570] 정배열 재진입 토글 — 청산 후 정배열 유지 중 악조건 해제 + 매수조건 재충족 시 재매수
  const reChip=`<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">`
    +`<span onclick="window._trendToggleReentry&&_trendToggleReentry()" style="font-size:10px;font-weight:800;padding:5px 11px;border-radius:14px;border:1px solid;cursor:pointer;${cfg.reentry?'background:#16a34a;color:#fff;border-color:#16a34a':'background:var(--surface2);color:var(--text3);border-color:var(--border)'}">🔄 정배열 재진입 ${cfg.reentry?'ON':'OFF'}</span>`
    +`<span style="font-size:9px;color:var(--text3);line-height:1.4;flex:1;min-width:140px">청산 후 정배열(${cfg.s}MA&gt;${cfg.l}MA) 유지 중 매도조건 해제 + 매수조건 재충족 시 재매수</span></div>`;
  // [S623] 🔮 크로스 예측 진입 토글 + 선행봉(1~2)
  const _predLeadLbl=cfg.predLead==='auto'?'자동':((cfg.predLead===2)?'2봉':'1봉');
  const _predDesc=cfg.predLead==='auto'?'정배열이면 진입 빨리(2봉)·청산 인내(1봉), 약하면 반대 (kNN 3봉)':(cfg.predLead===2?'kNN(3봉) — 정배열 진입 2봉전 / 약추세 데드 2봉전 조기청산':'kNN(3봉) 임박 시 진입·청산 1봉전');
  const _phc=(bt&&bt.predHit!=null)?(bt.predHit>=65?'#22c55e':bt.predHit>=50?'#f59e0b':'#ef4444'):'var(--text3)';
  const _predAcc=(_effPredict&&bt&&bt.predFires>0)
    ? `<span title="예측 발화 시점에서 실제 골든크로스가 선행봉 내 도래한 비율 (룩어헤드 차단 · 백테스트 전구간)" style="font-size:10px;font-weight:800;padding:5px 10px;border-radius:14px;background:${_phc}22;color:${_phc};border:1px solid ${_phc}66">적중 ${bt.predHit}% (${bt.predFires}건)</span>`
    : (_effPredict?`<span style="font-size:9px;color:var(--text3)">적중 데이터 부족</span>`:'');
  const predRow=`<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">`
    +`<span onclick="_sxVib(10);window._trendTogglePredict&&_trendTogglePredict()" title="실제 골든크로스를 기다리지 않고, kNN이 '곧 교차할 모양'이라 보면 lead봉 먼저 진입. 예측 실패(교차 미확정) 시 손절." style="font-size:10px;font-weight:800;padding:5px 11px;border-radius:14px;border:1px solid;cursor:pointer;${_effPredict?'background:#7c3aed;color:#fff;border-color:#7c3aed':'background:var(--surface2);color:#7c3aed;border-color:#7c3aed66'}">🔮 크로스 예측 ${_effPredict?'ON':'OFF'}</span>`
    +_predAcc
    +(_effPredict?`<span onclick="_sxVib(10);window._trendCycleLead&&_trendCycleLead()" title="1봉→2봉→자동 순환. 자동: 추세 강하면 2봉, 약하면 1봉 선행." style="font-size:10px;font-weight:800;padding:5px 10px;border-radius:14px;border:1px solid #7c3aed66;background:#7c3aed18;color:#7c3aed;cursor:pointer">선행 ${_predLeadLbl}</span>`:'')
    +`<span style="font-size:9px;color:var(--text3);line-height:1.4;flex:1;min-width:140px">${_predDesc} · 실패 시 손절 (실험 · 백테스트 ON/OFF 비교)</span></div>`;
  // [S675] 🧪 실험 청산 — 종가<단기MA 조기청산 + 넓은 ATR 재앙손절. 기본 OFF(순수 opt-in, A/B 비교용).
  const _slAtrLbl=(cfg.slAtr>0?cfg.slAtr:3)+'×ATR';
  // [S687] 🧪 실험 진입 — 기울기 조기진입(골든크로스 전 선진입). 검증된 기울기 청산의 거울. 기본 OFF.
  const entryRow=`<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">`
    +`<span onclick="_sxVib(10);window._trendToggleEntrySlope&&_trendToggleEntrySlope()" title="단기MA(${cfg.s}MA)가 상향 전환할 때 골든크로스 전에 미리 진입(OR). 검증된 ${cfg.s}MA기울기 청산의 거울. 진짜 반등이면 곧 골든크로스 확정, 헛바운스는 기울기 재하향 시 컷." style="font-size:10px;font-weight:800;padding:5px 11px;border-radius:14px;border:1px solid;cursor:pointer;${cfg.entrySlope?'background:#16a34a;color:#fff;border-color:#16a34a':'background:var(--surface2);color:#16a34a;border-color:#16a34a66'}">📈 ${cfg.s}MA기울기 조기진입 ${cfg.entrySlope?'ON':'OFF'}</span>`
    +(cfg.entrySlope?`<span onclick="_sxVib(10);window._trendToggleEntryConfirm&&_trendToggleEntryConfirm()" title="확인봉: 기울기 상향전환 봉의 종가가 단기MA 위일 때만 진입(노이즈 필터). OFF면 전환 즉시 진입(더 빠르나 페이크↑)." style="font-size:10px;font-weight:800;padding:5px 10px;border-radius:14px;border:1px solid #16a34a66;background:#16a34a18;color:#16a34a;cursor:pointer">✓ 확인봉 ${cfg.entryConfirm?'ON':'OFF'}</span>`:'')
    +`<span style="font-size:9px;color:var(--text3);line-height:1.4;flex:1;min-width:140px">실험 진입 (기본 OFF) · 골든크로스보다 📈빠른 진입 · 청산의 거울 · A/B 비교용</span></div>`;
  const exitRow=`<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">`
    +`<span onclick="_sxVib(10);window._trendToggleEarlyMa5&&_trendToggleEarlyMa5()" title="종가가 단기MA(${cfg.s}MA) 아래로 내려가면 청산. 데드크로스보다 빠른 비대칭 익절. 정배열 재진입과 함께 쓰면 효과적." style="font-size:10px;font-weight:800;padding:5px 11px;border-radius:14px;border:1px solid;cursor:pointer;${cfg.earlyMa5?'background:#d97706;color:#fff;border-color:#d97706':'background:var(--surface2);color:#d97706;border-color:#d9770666'}">⚡ 종가&lt;${cfg.s}MA 조기청산 ${cfg.earlyMa5?'ON':'OFF'}</span>`
    +`<span onclick="_sxVib(10);window._trendToggleEarlySlope&&_trendToggleEarlySlope()" title="단기MA(${cfg.s}MA)가 꺾일 때 청산. 종가&lt;MA5보다 부드러워 잠깐 눌림엔 안 터짐(빅위너 보존)." style="font-size:10px;font-weight:800;padding:5px 11px;border-radius:14px;border:1px solid;cursor:pointer;${cfg.earlySlope?'background:#ea580c;color:#fff;border-color:#ea580c':'background:var(--surface2);color:#ea580c;border-color:#ea580c66'}">📉 ${cfg.s}MA기울기 청산 ${cfg.earlySlope?'ON':'OFF'}</span>`
    +`<span onclick="_sxVib(10);window._trendToggleDisasterSl&&_trendToggleDisasterSl()" title="진입시점 ATR 기준 넓은 손절선(폭락 바닥만). 최적화 대상 아닌 리스크 정책. 종가 ≤ 진입가 − N×ATR 시 청산." style="font-size:10px;font-weight:800;padding:5px 11px;border-radius:14px;border:1px solid;cursor:pointer;${cfg.disSl?'background:#dc2626;color:#fff;border-color:#dc2626':'background:var(--surface2);color:#dc2626;border-color:#dc262666'}">🛡️ 재앙손절 ${cfg.disSl?'ON':'OFF'}</span>`
    +(cfg.disSl?`<span onclick="_sxVib(10);window._trendCycleSlAtr&&_trendCycleSlAtr()" title="손절 폭(ATR 배수) 순환: 3→2.5→2→1.5. 좁힐수록 데드크로스보다 빨리 발화(더 자주 컷)." style="font-size:10px;font-weight:800;padding:5px 10px;border-radius:14px;border:1px solid #dc262666;background:#dc262618;color:#dc2626;cursor:pointer">${_slAtrLbl}</span>`:'')
    +`<span style="font-size:9px;color:var(--text3);line-height:1.4;flex:1;min-width:140px">실험 청산 (기본 OFF) · 데드크로스보다 ⚡빠른 익절 + 🛡️폭락 방어 · A/B 비교용</span></div>`;
  // 상태
  const stateRow=`<div style="font-size:12px;font-weight:700;color:${st.color};margin-bottom:9px;padding:7px 10px;background:var(--surface2);border-radius:8px">${st.label}</div>`;
  // 그리드
  let grid='';
  if(bt && bt.totalTrades>0){
    const wc=bt.winRate>=60?'#22c55e':bt.winRate>=40?'#3b82f6':'#f97316';
    const pfc=bt.pf>=2?'#22c55e':bt.pf>=1.3?'#3b82f6':'#e8365a';
    const pc=bt.totalPnl>=0?'#22c55e':'#e8365a';
    const tc=bt.totalTrades>=20?'#22c55e':bt.totalTrades>=10?'#3b82f6':'#f97316';
    const ec=bt.expectancy>=0?'#22c55e':'#e8365a';
    grid=`<div style="font-size:9px;color:var(--text3);margin-bottom:5px">※ 현재 보유중 매수건은 제외 (확정 매매 기준)</div><div style="display:flex;gap:5px;margin-bottom:5px">${_trendGridCell(bt.winRate+'%','승률',wc)}${_trendGridCell(bt.pf,'손익비',pfc)}${_trendGridCell((bt.totalPnl>=0?'+':'')+bt.totalPnl+'%','수익률',pc)}</div>
    <div style="display:flex;gap:5px">${_trendGridCell(bt.totalTrades,'거래수',tc)}${_trendGridCell(bt.mdd+'%','MDD','#a855f7')}${_trendGridCell((bt.expectancy>=0?'+':'')+bt.expectancy+'%','기댓값',ec)}</div>`;
  } else {
    grid=`<div style="font-size:11px;color:var(--text3);text-align:center;padding:14px 0;background:var(--surface2);border-radius:8px">조건을 만족하는 거래 없음 — 보조지표를 줄이거나 N봉을 늘려보세요</div>`;
  }
  const _buyN=Object.keys(cfg.aux||{}).filter(k=>cfg.aux[k]).length;
  const _sellN=Object.keys(cfg.sell||{}).filter(k=>cfg.sell[k]).length;
  // [S649] 봉수 표기 — S648 600/700 폴백 적용 여부를 눈으로 확인. BT 거래표본 신뢰도 지표(550↑ 초록/미만 주황).
  const _trBars=rows.length, _trBarsCol=_trBars>=550?'#16a34a':'#d97706';
  const note=`<div style="font-size:9px;color:var(--text3);margin-top:9px;border-top:1px solid var(--border);padding-top:6px">실험 지표 · 정식 판정과 무관 · ${_effPredict?`🔮 예측 선행 ${_predLeadLbl}(kNN) → `:''}${cfg.s}MA×${cfg.l}MA 골든크로스${cfg.entrySlope?` +📈${cfg.s}MA기울기 조기진입${cfg.entryConfirm?'(확인봉)':''}`:''} ${cfg.nextOpen?'→ 다음봉 시가 진입':'종가 진입'}${_buyN?` · 매수 ${_buyN}개 AND(최근${cfg.n}봉)`:' · MA 단독'} → 데드크로스${_sellN?` OR 매도 ${_sellN}개`:''} 종가청산${cfg.earlyMa5?` · ⚡종가<${cfg.s}MA 조기청산`:''}${cfg.earlySlope?` · 📉${cfg.s}MA기울기 청산`:''}${cfg.disSl?` · 🛡️${cfg.slAtr>0?cfg.slAtr:3}×ATR 재앙손절`:''}${_effPredict?` · 예측 진입+조기청산 · 실패 시 손절`:''}${cfg.reentry?' · 🔄정배열 재진입':''} · <b style="color:${_trBarsCol}">[${_trBars}봉 기준]</b></div>`;
  // [S677] 🧪 배치 A/B — 대표풀/관심목록 전 종목 × 7설정 자동 BT (단일종목 과적합 점검)
  const _bsRep=_trendBatchSource==='rep';
  const _bsChip=function(on,lab,src){ return '<span onclick="window._trendBatchSetSource&&_trendBatchSetSource(\''+src+'\')" style="font-size:9px;font-weight:700;padding:3px 9px;border-radius:10px;cursor:pointer;'+(on?'background:#0ea5e9;color:#fff':'background:var(--surface2);color:#0ea5e9;border:1px solid #0ea5e966')+'">'+lab+'</span>'; };
  const _bmClose=_trendBatchEarlyMode==='close';
  const _bmChip=function(on,lab,m){ return '<span onclick="window._trendBatchSetMode&&_trendBatchSetMode(\''+m+'\')" style="font-size:9px;font-weight:700;padding:3px 9px;border-radius:10px;cursor:pointer;'+(on?'background:#ea580c;color:#fff':'background:var(--surface2);color:#ea580c;border:1px solid #ea580c66')+'">'+lab+'</span>'; };
  const batchSection=`<div style="margin-top:10px;border-top:1px dashed var(--border);padding-top:9px">`
    +`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px"><span style="font-size:10px;font-weight:800;color:var(--text2);min-width:52px">🧪 배치</span>`+_bsChip(_bsRep,'대표풀','rep')+_bsChip(!_bsRep,'관심목록','watch')+`</div>`
    +`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:7px"><span style="font-size:9px;font-weight:700;color:var(--text3);min-width:52px">조기청산</span>`+_bmChip(_bmClose,'종가&lt;MA5','close')+_bmChip(!_bmClose,'MA5기울기','slope')+`</div>`
    +`<button onclick="window._trendBatchUI&&_trendBatchUI()" style="width:100%;font-size:11px;font-weight:700;padding:8px 0;border-radius:8px;cursor:pointer;color:#0ea5e9;background:var(--surface);border:1px solid #0ea5e966">▶ ${_bsRep?'대표풀':'관심목록'} × 7설정 자동 BT · ${_bmClose?'종가&lt;MA5':'MA5기울기'}</button>`
    +`<div id="sxTrendBatchResult" style="margin-top:8px"></div></div>`;
  return head+maRow+chipRow+reChip+predRow+entryRow+exitRow+_guardBadge+stateRow+grid+note+batchSection;
}
function _buildTrendCard(stock,indicators){
  let rows=(indicators&&indicators._advanced&&Array.isArray(indicators._advanced.rows))?indicators._advanced.rows
            :(stock&&Array.isArray(stock._lastAnalCandles))?stock._lastAnalCandles:null;
  if(!rows||rows.length<30) return '';
  const market=_trendMkt(stock);
  const _tfTr=(typeof _analTF!=='undefined'&&_analTF)?_analTF:'day';
  const _cap=(typeof _btTargetBars==='function')?_btTargetBars(market,_tfTr):600;
  // [S552] 상한 캡 — _advanced.rows가 목표(KIS 700 / OFF 600 / 주·월 400)보다 길면 잘라 BT/카드 봉수 일치.
  try { if(_cap>0 && rows.length>_cap) rows=rows.slice(-_cap); } catch(_){}
  // [S648] 하한 보장 — S552는 상한 캡만이라 분석 미확장(_advanced.rows 200/500봉) 시 목표 미달이었음(캔들전이 S637/S643 전과 동일 증상).
  //   rows<목표*0.95면 fetchRows600 폴백으로 600/700 확보. 캔들전이 완료캐시(_ctRows600Cache) 재사용→이미 받았으면 즉시.
  //   없으면 단기추세 전용 캐시로 비동기 fetch 후 _trendRerender(종목명 가드로 비동기 도착 시 다른 종목 오염 방지). fetchRows600 내부 _rows600Cache가 네트워크 중복 차단.
  try {
    if(rows.length < Math.floor(_cap*0.95)){
      const _cd=(stock&&(stock.code||stock.name))||'';
      const _r6k=_cd+'|'+market+'|'+_tfTr;
      const _done=(Array.isArray(_ctRows600Cache[_r6k]) && _ctRows600Cache[_r6k].length) ? _ctRows600Cache[_r6k]
                : (Array.isArray(_trendRows600Cache[_r6k]) && _trendRows600Cache[_r6k].length) ? _trendRows600Cache[_r6k] : null;
      if(_done){ if(_done.length>rows.length) rows = _done.length>_cap ? _done.slice(-_cap) : _done; }
      else if(!Object.prototype.hasOwnProperty.call(_trendRows600Cache,_r6k) && !Object.prototype.hasOwnProperty.call(_ctRows600Cache,_r6k)){
        _trendRows600Cache[_r6k]='pending';
        (function(_mk,_tf,_c,_k,_cp,_nm){ setTimeout(async function(){
          let r6=null; try{ r6=(window.SXCandleBT&&SXCandleBT.fetchRows600)? await SXCandleBT.fetchRows600(_mk,_tf,_c):null; }catch(_e){}
          _trendRows600Cache[_k]=(r6&&r6.length)? r6 : [];
          try{
            if(window._sxTrendCtx && _sxTrendCtx.name===_nm && Array.isArray(r6) && r6.length>((_sxTrendCtx.rows&&_sxTrendCtx.rows.length)||0)){
              _sxTrendCtx.rows = r6.length>_cp ? r6.slice(-_cp) : r6;
              _trendRerender();
            }
          }catch(_e2){}
        },40); })(market,_tfTr,_cd,_r6k,_cap,(stock&&(stock.name||stock.code))||'');
      }
    }
  } catch(_){}
  try { window._sxTrendCtx={ rows:rows, market:market, name:(stock&&(stock.name||stock.code))||'' }; } catch(_){}
  return `<div style="margin:8px 10px;padding:12px 14px;border-radius:12px;background:var(--surface);border:1px solid var(--border)" id="sxTrendWrap">${_trendRenderInner()}</div>`;
}
function _trendRerender(){ try { const el=document.getElementById('sxTrendWrap'); if(el) el.innerHTML=_trendRenderInner(); } catch(_){} }
function _trendRedrawChart(){
  // [S562] 단기추세 카드 MA 변경/리셋 → 미니차트 단기추세 마커 즉시 갱신
  try{
    if(typeof SXChart==='undefined' || typeof _currentAnalRows==='undefined' || !_currentAnalRows) return;
    var _sv=(typeof currentAnalStock!=='undefined' && currentAnalStock) ? _resolvePurpleSv(currentAnalStock) : null; // [S578] A/C 토글 반영
    if(typeof _currentAnalTrades!=='undefined' && _currentAnalTrades && _currentAnalTrades.length && SXChart.drawMiniWithTrades){
      SXChart.drawMiniWithTrades('miniCandleChart', _currentAnalRows, _currentAnalTrades, _sv);
    } else if(SXChart.drawMini){
      SXChart.drawMini('miniCandleChart', _currentAnalRows, _sv);
    }
  }catch(_){}
}
function _trendApply(){
  const ctx=window._sxTrendCtx; if(!ctx) return; const m=ctx.market; const cfg=_trendCfg(m);
  const gv=id=>{ const e=document.getElementById(id); return e?parseInt(e.value,10):NaN; };
  let s=gv('sxTrendS'), l=gv('sxTrendL'), n=gv('sxTrendN');
  if(s>0) cfg.s=s; if(l>0) cfg.l=l; if(cfg.s>=cfg.l) cfg.l=cfg.s+1; if(n>=1) cfg.n=n;
  _trendSave(m,cfg); _trendRerender(); _trendRedrawChart();
}
function _trendToggleAux(k){ const ctx=window._sxTrendCtx; if(!ctx) return; const m=ctx.market; const cfg=_trendCfg(m); cfg.aux=cfg.aux||{}; cfg.aux[k]=!cfg.aux[k]; _trendSave(m,cfg); _trendRerender(); }
function _trendToggleSell(k){ const ctx=window._sxTrendCtx; if(!ctx) return; const m=ctx.market; const cfg=_trendCfg(m); cfg.sell=cfg.sell||{}; cfg.sell[k]=!cfg.sell[k]; _trendSave(m,cfg); _trendRerender(); }
function _trendToggleReentry(){ const ctx=window._sxTrendCtx; if(!ctx) return; const m=ctx.market; const cfg=_trendCfg(m); cfg.reentry=!cfg.reentry; _trendSave(m,cfg); _trendRerender(); } // [S570]
function _trendToggleNextOpen(){ const ctx=window._sxTrendCtx; if(!ctx) return; const m=ctx.market; const cfg=_trendCfg(m); cfg.nextOpen=!cfg.nextOpen; _trendSave(m,cfg); _trendRerender(); } // [S581] 진입방식 토글 (BT결과 변동 → 즉시 재계산)
function _trendTogglePredict(){ const ctx=window._sxTrendCtx; if(!ctx) return; const m=ctx.market; const cfg=_trendCfg(m); const g=window._trendGuardState, key=ctx.name||''; if(cfg.predict && g && g.stock===key && g.hurt){ window._trendGuardOverride=window._trendGuardOverride||{}; window._trendGuardOverride[key]=!window._trendGuardOverride[key]; _trendRerender(); return; } cfg.predict=!cfg.predict; _trendSave(m,cfg); _trendRerender(); } // [S623/S630] 🔮 토글 — 손해 종목은 전역 대신 종목별 강제 오버라이드
function _trendToggleEarlyMa5(){ const ctx=window._sxTrendCtx; if(!ctx) return; const m=ctx.market; const cfg=_trendCfg(m); cfg.earlyMa5=!cfg.earlyMa5; _trendSave(m,cfg); _trendRerender(); } // [S675] ⚡ 종가<단기MA 조기청산 토글
function _trendToggleDisasterSl(){ const ctx=window._sxTrendCtx; if(!ctx) return; const m=ctx.market; const cfg=_trendCfg(m); cfg.disSl=!cfg.disSl; _trendSave(m,cfg); _trendRerender(); } // [S675] 🛡️ 넓은 ATR 재앙손절 토글
function _trendToggleEarlySlope(){ const ctx=window._sxTrendCtx; if(!ctx) return; const m=ctx.market; const cfg=_trendCfg(m); cfg.earlySlope=!cfg.earlySlope; _trendSave(m,cfg); _trendRerender(); } // [S678] 📉 MA5 기울기 하향 조기청산 토글
function _trendToggleEntrySlope(){ const ctx=window._sxTrendCtx; if(!ctx) return; const m=ctx.market; const cfg=_trendCfg(m); cfg.entrySlope=!cfg.entrySlope; _trendSave(m,cfg); _trendRerender(); } // [S687] 📈 기울기 조기진입 토글
function _trendToggleEntryConfirm(){ const ctx=window._sxTrendCtx; if(!ctx) return; const m=ctx.market; const cfg=_trendCfg(m); cfg.entryConfirm=!cfg.entryConfirm; _trendSave(m,cfg); _trendRerender(); } // [S687] ✓ 확인봉 토글
function _trendCycleSlAtr(){ const ctx=window._sxTrendCtx; if(!ctx) return; const m=ctx.market; const cfg=_trendCfg(m); const seq=[3,2.5,2,1.5]; const cur=cfg.slAtr>0?cfg.slAtr:3; const idx=seq.indexOf(cur); cfg.slAtr=seq[(idx+1)%seq.length]; _trendSave(m,cfg); _trendRerender(); } // [S676] 손절폭 순환 3→2.5→2→1.5 (탭=좁히기 · 3은 데드크로스가 선점해 거의 무발화 → 좁혀야 엔진)

// ===== [S677] 단기추세 배치 A/B — 대표풀/관심목록 전 종목 × 7설정 사다리 자동 BT → 집계(중앙수익·양수%·MDD). 단일종목 과적합 점검. =====
let _trendBatchSource = 'rep';   // 'rep'=대표풀(SXCandleBT.getRepPool) | 'watch'=관심목록(_getWatchlist)
let _trendBatchEarlyMode = 'close';   // [S678] 'close'=종가<MA5 | 'slope'=MA5 기울기 — 사다리 조기청산 트리거 모드
function _trendBatchSetSource(s){ _trendBatchSource=(s==='watch')?'watch':'rep'; const el=document.getElementById('sxTrendBatchResult'); if(el) el.innerHTML=''; _trendRerender(); }
function _trendBatchSetMode(m){ _trendBatchEarlyMode=(m==='slope')?'slope':'close'; const el=document.getElementById('sxTrendBatchResult'); if(el) el.innerHTML=''; _trendRerender(); }
function _trendBatchSleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
// 설정 사다리 — 각 칸이 한 요소씩만 다름(효과 분리). localStorage 무시·프로그램 구성. base=순수MA, slAtr 2(=knee 후보).
function _trendBatchConfigs(market, mode){
  const d=_TREND_MKT_DEFAULT[market]||[5,9];
  const _cc=(typeof _trendCfg==='function')?_trendCfg(market):null;   // [S679] 카드 입력칸과 동기화 — MA쌍을 현재 카드 설정에서 읽음(미설정 시 기본값)
  const sN=(_cc&&_cc.s>0)?_cc.s:d[0];
  const lN=(_cc&&_cc.l>0)?_cc.l:d[1];
  const slope=(mode==='slope');
  const base=function(){ return { s:sN, l:lN, n:3, aux:{}, sell:{}, reentry:false, predict:false, predLead:1, nextOpen:false, earlyMa5:false, earlySlope:false, disSl:false, slAtr:2 }; };
  const setE=function(c){ if(slope) c.earlySlope=true; else c.earlyMa5=true; return c; };
  const eLab=slope?'기울기':'earlyMa5';
  const C=[]; let c;
  c=base(); C.push({label:'MA '+sN+'×'+lN, cfg:c});   // [S679] '순수 MA' → 입력칸 동기화 'MA 5×9'
  c=setE(base()); C.push({label:eLab, cfg:c});
  c=base(); c.disSl=true; C.push({label:'disSl 2×', cfg:c});
  c=base(); c.reentry=true; C.push({label:'재진입', cfg:c});
  c=setE(base()); c.reentry=true; C.push({label:'조기+재진입', cfg:c});
  c=setE(base()); c.reentry=true; c.sell={rsiDc:true,rsiHot:true}; C.push({label:'+RSI칩', cfg:c});
  c=setE(base()); c.reentry=true; c.sell={rsiDc:true,rsiHot:true}; c.disSl=true; C.push({label:'전체+disSl', cfg:c});
  return C;
}
function _trendBatchList(mk){
  if(_trendBatchSource==='watch'){
    try { return (typeof _getWatchlist==='function'?(_getWatchlist(mk)||[]):[]).filter(function(s){return s&&s.code;}).map(function(s){return {code:s.code, name:s.name||s.code};}); } catch(_){ return []; }
  }
  try { const p=(window.SXCandleBT&&SXCandleBT.getRepPool)?SXCandleBT.getRepPool(mk):[]; return (p||[]).map(function(x){return {code:x[0], name:x[1]};}); } catch(_){ return []; }
}
async function _trendBatchRun(mk, tf, onProgress){
  if(!(window.SXCandleBT&&SXCandleBT.fetchRows600)) return { ok:false, reason:'캔들 fetch 미연결(SXCandleBT 미로드)' };
  const list=_trendBatchList(mk);
  if(!list.length) return { ok:false, reason:(_trendBatchSource==='watch'?'관심목록('+mk+')이 비어있음 — 종목 추가':'대표목록 없음('+mk+')') };
  const CAP=20; const capped=list.length>CAP; const use=list.slice(0,CAP);
  const configs=_trendBatchConfigs(mk, _trendBatchEarlyMode);
  const _tgtBars=(typeof _btTargetBars==='function')?_btTargetBars(mk, tf):600;
  const _floor=Math.floor(_tgtBars*0.95);   // [S678] fetchRows600과 동일 95% 기준(일봉 570) — 사과 대 사과
  const bbP=(typeof _trendBbParams==='function')?_trendBbParams(mk):null;
  const per=[]; let skipped=0, skippedShort=0; const barsList=[];
  for(let i=0;i<use.length;i++){
    const s=use[i];
    if(onProgress) onProgress(i+1, use.length, s.name);
    await _trendBatchSleep(0);
    let rows=null;
    try { rows=await SXCandleBT.fetchRows600(mk, tf, s.code); } catch(e){}
    if(!Array.isArray(rows) || rows.length<40){ skipped++; await _trendBatchSleep(8); continue; }
    if(rows.length < _floor){ skippedShort++; await _trendBatchSleep(8); continue; }   // [S678] 봉수 미달 종목 제외(노이즈 차단)
    barsList.push(rows.length);
    const row={ name:s.name, byCfg:[] };
    for(let ci=0;ci<configs.length;ci++){
      let bt=null;
      try { bt=_trendBt(rows, configs[ci].cfg, bbP); } catch(e2){}
      row.byCfg.push((bt&&bt.totalTrades>0)?{ pnl:bt.totalPnl, mdd:bt.mdd, pf:bt.pf, win:bt.winRate, n:bt.totalTrades } : null);
    }
    if(row.byCfg[0]) per.push(row); else skipped++;
    await _trendBatchSleep(12);
  }
  if(per.length<3) return { ok:false, reason:'유효 종목 3개 미만 — 네트워크 확인('+mk+')' };
  const mean=function(a){ return a.length?a.reduce(function(s,x){return s+x;},0)/a.length:null; };
  const med=function(a){ if(!a.length) return null; const b=a.slice().sort(function(x,y){return x-y;}); const m=Math.floor(b.length/2); return b.length%2?b[m]:(b[m-1]+b[m])/2; };
  const agg=configs.map(function(cf,ci){
    const vals=per.map(function(p){return p.byCfg[ci];}).filter(Boolean);
    return { label:cf.label, n:vals.length,
      pnlMean:mean(vals.map(function(v){return v.pnl;})),
      pnlMed:med(vals.map(function(v){return v.pnl;})),
      mddMean:mean(vals.map(function(v){return v.mdd;})),
      posPct:vals.length?Math.round(vals.filter(function(v){return v.pnl>0;}).length/vals.length*1000)/10:null,
      pfMed:med(vals.map(function(v){return v.pf;})) };
  });
  return { ok:true, source:_trendBatchSource, mode:_trendBatchEarlyMode, market:mk, n:per.length, capped:capped, total:list.length, skipped:skipped, skippedShort:skippedShort, medBars:barsList.length?Math.round(med(barsList)):null, minBars:barsList.length?Math.min.apply(null,barsList):null, tgtBars:_tgtBars, agg:agg };
}
function _trendBatchRender(res){
  if(!res||!res.ok) return '<div style="font-size:11px;color:#dc2626;padding:8px 2px">배치 불가 — '+((res&&res.reason)||'')+'</div>';
  const fmtP=function(v){ return v==null?'—':((v>0?'+':'')+(Math.round(v*10)/10)+'%'); };
  const fmt1=function(v){ return v==null?'—':(Math.round(v*10)/10); };
  const rows=res.agg.map(function(g,i){
    const isBase=i===0;
    const medCol=g.pnlMed==null?'var(--text3)':(g.pnlMed>0?'#16a34a':'#dc2626');
    return '<div style="display:flex;align-items:center;font-size:10px;padding:4px 0;border-bottom:1px solid var(--border)'+(isBase?';background:var(--surface2)':'')+'">'
      +'<span style="flex:1.5;font-weight:'+(isBase?800:600)+';color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+g.label+'</span>'
      +'<span style="width:52px;text-align:right;font-weight:800;color:'+medCol+'">'+fmtP(g.pnlMed)+'</span>'
      +'<span style="width:48px;text-align:right;color:var(--text3)">'+fmtP(g.pnlMean)+'</span>'
      +'<span style="width:40px;text-align:right;color:#a855f7">'+fmt1(g.mddMean)+'</span>'
      +'<span style="width:38px;text-align:right;color:var(--text2)">'+(g.posPct==null?'—':g.posPct+'%')+'</span>'
      +'<span style="width:32px;text-align:right;color:var(--text3)">'+fmt1(g.pfMed)+'</span></div>';
  }).join('');
  return '<div style="padding:9px 10px;background:var(--surface);border-radius:9px;border:1px solid #0ea5e955">'
    +'<div style="font-size:11px;font-weight:800;color:#0ea5e9;margin-bottom:5px">🧪 배치 A/B · '+(res.source==='watch'?'관심목록':'대표풀')+' '+String(res.market).toUpperCase()+' · '+(res.mode==='slope'?'MA5기울기':'종가&lt;MA5')+' · '+res.n+'종목'+(res.capped?' (상한20)':'')+'</div>'
    +'<div style="font-size:9px;font-weight:700;color:'+((res.medBars&&res.medBars>=(res.tgtBars||600)*0.99)?'var(--text3)':'#d97706')+';margin-bottom:6px">📊 봉수 중앙 '+(res.medBars||'?')+'/'+(res.tgtBars||600)+'봉'+(res.minBars!=null?' · 최소 '+res.minBars:'')+(res.skippedShort?' · 짧은종목 '+res.skippedShort+'개 제외':'')+'</div>'
    +'<div style="display:flex;font-size:8.5px;font-weight:700;color:var(--text3);padding-bottom:3px;border-bottom:1px solid var(--border)"><span style="flex:1.5">설정</span><span style="width:52px;text-align:right">중앙수익</span><span style="width:48px;text-align:right">평균</span><span style="width:40px;text-align:right">MDD</span><span style="width:38px;text-align:right">양수%</span><span style="width:32px;text-align:right">손익비</span></div>'
    +rows
    +'<div style="font-size:9px;color:var(--text3);margin-top:6px;line-height:1.6">중앙수익=중앙값 수익률(괴물 종목에 안 휘둘림·주력) · 양수%=수익 낸 종목 비율 · MDD·손익비=평균/중앙값. 첫 줄(MA교차 단독)=기준선. 일봉 '+res.n+'종목 · 과적합 점검용.</div>'
    +'</div>';
}
async function _trendBatchUI(){
  const el=document.getElementById('sxTrendBatchResult'); if(!el) return;
  const mk=(window._sxTrendCtx&&window._sxTrendCtx.market)||(typeof currentMarket!=='undefined'?currentMarket:'kr');
  el.innerHTML='<div style="text-align:center;padding:12px 2px;font-size:11px;color:var(--text3)">배치 준비 — 캔들 수집 중…</div>';
  let res;
  try {
    res=await _trendBatchRun(mk, 'day', function(i,total,name){
      const e=document.getElementById('sxTrendBatchResult'); if(!e) return;
      e.innerHTML='<div style="text-align:center;padding:12px 2px;font-size:11px;color:var(--text3)">종목 '+i+'/'+total+' · '+(name||'')+'<br><span style="font-size:9px">'+total+'종목 × 7설정 — 수십 초 걸려요</span></div>';
    });
  } catch(e){ res={ ok:false, reason:String((e&&e.message)||e) }; }
  const e2=document.getElementById('sxTrendBatchResult'); if(e2) e2.innerHTML=_trendBatchRender(res);
}
function _trendCycleLead(){ const ctx=window._sxTrendCtx; if(!ctx) return; const m=ctx.market; const cfg=_trendCfg(m); cfg.predLead = (cfg.predLead===1)?2:((cfg.predLead===2)?'auto':1); _trendSave(m,cfg); _trendRerender(); } // [S624] 1→2→자동 순환
function _trendToggleBuyOpen(){ _trendBuyOpen=!_trendBuyOpen; _trendRerender(); }
function _trendToggleSellOpen(){ _trendSellOpen=!_trendSellOpen; _trendRerender(); }
function _trendReset(){ const ctx=window._sxTrendCtx; if(!ctx) return; const m=ctx.market; _trendSave(m,_trendDefaults(m)); _trendRerender(); _trendRedrawChart(); } // [S572] 리셋=기본 프리셋
if(typeof window!=='undefined'){ window._trendApply=_trendApply; window._trendToggleAux=_trendToggleAux; window._trendToggleSell=_trendToggleSell; window._trendToggleReentry=_trendToggleReentry; window._trendToggleNextOpen=_trendToggleNextOpen; window._trendTogglePredict=_trendTogglePredict; window._trendCycleLead=_trendCycleLead; window._trendToggleEarlyMa5=_trendToggleEarlyMa5; window._trendToggleEarlySlope=_trendToggleEarlySlope; window._trendToggleEntrySlope=_trendToggleEntrySlope; window._trendToggleEntryConfirm=_trendToggleEntryConfirm; window._trendToggleDisasterSl=_trendToggleDisasterSl; window._trendCycleSlAtr=_trendCycleSlAtr; window._trendBatchSetSource=_trendBatchSetSource; window._trendBatchSetMode=_trendBatchSetMode; window._trendBatchUI=_trendBatchUI; window._trendToggleBuyOpen=_trendToggleBuyOpen; window._trendToggleSellOpen=_trendToggleSellOpen; window._trendReset=_trendReset; }
// ── [S550] 거래내역 모달 (캔들전이 검증 모달 패턴) ──
function _trendCloseDetail(){ try{ var el=document.getElementById('sxTrendBTOverlay'); if(el&&el.parentNode) el.parentNode.removeChild(el); }catch(_){} }
function _trendDetailClose(){ try{ history.back(); }catch(e){ _trendCloseDetail(); } }
function _trendDetailInner(bt,cfg,ctx){
  const nm=ctx.name?(' · '+ctx.name):'';
  const auxOn=Object.keys(cfg.aux||{}).filter(k=>cfg.aux[k]);
  const auxLbl=auxOn.length? auxOn.map(k=>{ const a=_TREND_AUX.find(x=>x.k===k); return a?a.label:k; }).join(', ') : 'MA 단독';
  const sellOn=Object.keys(cfg.sell||{}).filter(k=>cfg.sell[k]);
  const sellLbl=sellOn.length? sellOn.map(k=>{ const a=_TREND_SELL.find(x=>x.k===k); return a?a.label:k; }).join(', ') : '';
  const head=`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:14px;font-weight:800;color:var(--text)">📈 단기추세매매 거래내역</span><span style="font-size:9px;padding:2px 6px;border-radius:4px;background:var(--surface2);color:var(--text3);border:1px solid var(--border)">실험</span><span onclick="window._trendDetailClose&&_trendDetailClose()" style="margin-left:auto;font-size:20px;line-height:1;color:var(--text3);cursor:pointer;padding:2px 6px">×</span></div>`;
  const sub=`<div style="font-size:10px;color:var(--text3);margin-bottom:10px">${cfg.s}MA×${cfg.l}MA 골든→데드 · 진입 ${cfg.nextOpen?'다음봉 시가':'종가'} · 매수: ${auxLbl}${auxOn.length?` (최근${cfg.n}봉)`:''}${sellLbl?` · 매도(OR): ${sellLbl}`:''}${nm}</div>`;
  if(!bt || (bt.totalTrades===0 && !bt.open)) return head+sub+'<div style="font-size:12px;color:var(--text3);text-align:center;padding:24px 0">조건을 만족하는 거래가 없어요. 보조지표를 줄이거나 N봉을 늘려보세요.</div>';
  const INIT=1000000; let eq=1; const balAfter=[];
  bt.trades.forEach(t=>{ eq*=(1+t.pnl/100); balAfter.push(Math.round(INIT*eq)); });
  const realizedBal=Math.round(INIT*eq), realizedPnl=realizedBal-INIT;
  let curBal=realizedBal, unreal=0;
  if(bt.open){ unreal=Math.round(realizedBal*(bt.open.pnl/100)); curBal=realizedBal+unreal; }
  const flow=`<div style="font-size:11px;font-weight:800;color:var(--text);margin:4px 0 4px">💰 자산 흐름 <span style="font-size:9px;font-weight:500;color:var(--text3)">(초기 100만원·복리)</span></div>`
    +`<div style="display:flex;gap:6px;margin-bottom:6px"><div style="flex:1;background:var(--surface2);border-radius:8px;padding:8px"><div style="font-size:9px;color:var(--text3)">초기자본</div><div style="font-size:13px;font-weight:800;color:var(--text)">${INIT.toLocaleString()}원</div></div><div style="flex:1;background:var(--surface2);border-radius:8px;padding:8px"><div style="font-size:9px;color:var(--text3)">누적 실현손익(복리)</div><div style="font-size:13px;font-weight:800;color:${realizedPnl>=0?'#22c55e':'#e8365a'}">${realizedPnl>=0?'+':''}${realizedPnl.toLocaleString()}원</div></div></div>`
    +`<div style="border:1.5px solid ${curBal>=INIT?'#22c55e':'#e8365a'};border-radius:8px;padding:9px 10px;margin-bottom:12px"><div style="font-size:9px;color:var(--text3)">현재 보유금${bt.open?` (미실현 ${unreal>=0?'+':''}${unreal.toLocaleString()}원 포함)`:''}</div><div style="font-size:18px;font-weight:800;color:${curBal>=INIT?'#22c55e':'#e8365a'}">${curBal.toLocaleString()}원 <span style="font-size:12px">${(curBal/INIT-1)*100>=0?'+':''}${((curBal/INIT-1)*100).toFixed(2)}%</span></div></div>`;
  const row=(bdg,bc,e,x,pnl,bars,d1,d2,bal)=>`<div style="border-bottom:1px solid var(--border);padding:8px 0"><div style="display:flex;align-items:center;gap:6px;font-size:12px"><span style="font-weight:800;color:${bc};min-width:42px">${bdg}</span><span style="color:var(--text2)">${Math.round(e).toLocaleString()} → ${x==null?'—':Math.round(x).toLocaleString()}</span><span style="margin-left:auto;font-weight:800;color:${bc}">${pnl>=0?'+':''}${pnl}%</span><span style="color:var(--text3);font-size:10px;min-width:30px;text-align:right">${bars}봉</span></div><div style="display:flex;font-size:10px;color:var(--text3);margin-top:2px"><span>${d1} ~ ${d2}</span><span style="margin-left:auto">${bal.toLocaleString()}원</span></div></div>`;
  let list='';
  if(bt.open){ const o=bt.open; list+=row('OPEN','#3b82f6',o.entry,o.cur,o.pnl,o.bars,o.entryDate||'','보유중',curBal); }
  for(let i=bt.trades.length-1;i>=0;i--){ const t=bt.trades[i]; const win=t.pnl>0; list+=row(win?'WIN':(t.pnl<0?'LOSS':'FLAT'),win?'#22c55e':(t.pnl<0?'#e8365a':'var(--text3)'),t.entry,t.exit,t.pnl,t.bars,t.entryDate||'',t.exitDate||'',balAfter[i]); }
  const listHead=`<div style="font-size:11px;font-weight:800;color:var(--text);margin:6px 0 2px">📋 매매 목록 (${bt.totalTrades}건${bt.open?' + 보유 1':''})</div>`;
  // [S632] 골든/데드 예측 적중률 — 모달에선 예측 토글과 무관하게 강제 ON으로 측정해 둘 다 표기
  let accBlock='';
  try{
    const _accBt = cfg.predict ? bt : _trendBt(ctx.rows, Object.assign({},cfg,{predict:true}), _trendBbParams(ctx.market));
    const _ac=(v)=>v==null?'var(--text3)':(v>=65?'#22c55e':v>=50?'#f59e0b':'#ef4444');
    const _gh=_accBt.predHit, _gf=_accBt.predFires||0, _dh=_accBt.predDcHit, _df=_accBt.predDcFires||0;
    accBlock=`<div style="font-size:11px;font-weight:800;color:var(--text);margin:4px 0 4px">🔮 크로스 예측 적중률 <span style="font-size:9px;font-weight:500;color:var(--text3)">(발화→실제 교차 3봉내 도래 · 룩어헤드 차단)</span></div>`
      +`<div style="display:flex;gap:6px;margin-bottom:12px">`
      +`<div style="flex:1;background:var(--surface2);border-radius:8px;padding:8px;text-align:center"><div style="font-size:9px;color:var(--text3)">골든(진입)</div><div style="font-size:16px;font-weight:800;color:${_ac(_gh)}">${_gh==null?'—':_gh+'%'}</div><div style="font-size:9px;color:var(--text3)">${_gf}건</div></div>`
      +`<div style="flex:1;background:var(--surface2);border-radius:8px;padding:8px;text-align:center"><div style="font-size:9px;color:var(--text3)">데드(청산)</div><div style="font-size:16px;font-weight:800;color:${_ac(_dh)}">${_dh==null?'—':_dh+'%'}</div><div style="font-size:9px;color:var(--text3)">${_df}건</div></div>`
      +`</div>`;
  }catch(_eA){}
  // [S582] 레짐별 성과 — BT 단일검증과 동일 함수(_btRegimeBreakdown/_btRenderRegime) 재사용. 확정 거래(bt.trades) 기준·보유건 제외. entryIdx 내장, ctx.rows는 {close|c} 동일구조라 호환.
  let regimeHtml='';
  try{
    if(ctx && Array.isArray(ctx.rows) && bt.trades && bt.trades.length && typeof _btRegimeBreakdown==='function' && typeof _btRenderRegime==='function'){
      regimeHtml=_btRenderRegime(_btRegimeBreakdown(ctx.rows, bt.trades))||'';
    }
  }catch(_){}
  return head+sub+flow+accBlock+regimeHtml+listHead+list;
}
function _trendOpenDetail(){
  const ctx=(typeof window!=='undefined')?window._sxTrendCtx:null;
  if(!ctx||!Array.isArray(ctx.rows)){ try{alert('데이터가 부족합니다. 종목 분석을 먼저 실행해주세요.');}catch(_){} return; }
  const cfg=_trendCfg(ctx.market);
  // [S634] 카드와 동일 effective bt — 가드 자동OFF/오버라이드 반영. effPredict===false면 예측 강제 OFF.
  const _eff=(ctx&&typeof ctx.effPredict!=='undefined')?ctx.effPredict:null;
  const _cfgUse=(_eff===false && cfg.predict)?Object.assign({},cfg,{predict:false}):cfg;
  const bt=_trendBt(ctx.rows,_cfgUse,_trendBbParams(ctx.market));
  _trendCloseDetail();
  const ov=document.createElement('div'); ov.id='sxTrendBTOverlay';
  ov.setAttribute('style','position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:18px');
  ov.addEventListener('click',function(e){ if(e.target===ov) _trendDetailClose(); });
  ov.innerHTML='<div style="width:100%;max-width:400px;max-height:86vh;overflow:auto;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.3)">'+_trendDetailInner(bt,_cfgUse,ctx)+'</div>';
  document.body.appendChild(ov);
  try{ history.pushState({view:'trendBTModal'},''); }catch(e){}
}
if(typeof window!=='undefined'){ window._trendOpenDetail=_trendOpenDetail; window._trendDetailClose=_trendDetailClose; }

// [S611] 라이브 카드 kNN 적중률 — 종목+TF+최신봉 키로 캐시(네비게이션 재계산 방지). 값 null=측정완료·표본부족.
var _ctKnnHitCache = {};
// [S656] 캔들전이 LR(로지스틱 회귀) 보조 점수 캐시 — kNN 캐시와 동일 키 패턴(종목+TF+최신봉+rows길이)
var _ctLrCache = {};
// [S661] 레짐 전환확률(regimeFlip) 캐시 — 종목+TF+rows길이 키
var _regimeLrCache = {};
var _regimeLrPending = {};
function _regimeLrRequestAsync(rows, key, onReady){
  if(Object.prototype.hasOwnProperty.call(_regimeLrCache, key)) return { cached:true, res:_regimeLrCache[key] };
  if(!_regimeLrPending[key]) _regimeLrPending[key] = [];
  _regimeLrPending[key].push(onReady);
  if(_regimeLrPending[key].length === 1){
    setTimeout(function(){
      var res=null; try{ res=(window.SXLR&&SXLR.regimeFlip)?SXLR.regimeFlip(rows,{}):null; }catch(_e){ res=null; }
      _regimeLrCache[key]=res;
      var cbs=_regimeLrPending[key]||[]; delete _regimeLrPending[key];
      cbs.forEach(function(cb){ try{ cb(res); }catch(_e2){} });
    }, 100); // [S661] ADX 사전계산 포함 ~30ms — 캔들전이 카드보다 약간 늦게(메인렌더 이후)
  }
  return { cached:false };
}
// [S661] 레짐 전환확률 인라인 배지 — 레짐 카드 첫 줄(레짐 라벨 옆)에 표시
function _regimeFlipBadge(res){
  if(!res || !res.active) return '';
  var probAvg = res.probLr!=null ? Math.round((res.probKnn+res.probLr)/2) : res.probKnn;
  var col = probAvg>=70?'#dc2626':probAvg>=50?'#d97706':'#16a34a';
  var txt = probAvg>=70?'전환 임박':'전환 주의';
  var knnLrTxt = res.probLr!=null ? ` kNN ${res.probKnn}% · LR ${res.probLr}%` : ` kNN ${res.probKnn}%`;
  return `<span title="레짐 전환 임박 확률 — 5봉 내 레짐 변화 가능성을 kNN+LR로 측정(실험). BT 판정 미반영." style="font-size:9px;font-weight:800;color:${col};background:${col}1a;border:1px solid ${col}55;border-radius:10px;padding:2px 7px;margin-left:6px">🔄 ${txt} ${probAvg}%<span style="font-weight:400;color:var(--text3);font-size:8px">${knnLrTxt}</span></span>`;
}
// [S657] 같은 키로 동시에 여러 곳(캔들전이 카드 + SimPositionLine 사전준비)이 LR을 요청할 때
//   계산을 1회만 실행하고 완료 시 대기 중인 모든 콜백을 한번에 갱신 — 중복 학습(150ms×N) 방지.
var _ctLrPending = {};
// [S635] 풀링 자동전환 — 종목별 판정 캐시 + 토글/카드 재렌더
var _ctPoolAutoCache = {};
var _ctRows600Cache = {}; // [S637] 종목별 600봉 rows 캐시 — 카드 kNN/게이트를 검증툴과 동일 기준으로
var _trendRows600Cache = {}; // [S648] 단기추세 카드 600봉 폴백 캐시 — 캔들전이(_ctRows600Cache) 완료값과 상호 재사용
function _ctRerenderCard(){ try{ var el=document.getElementById('sxCTCardWrap'); var L=window._sxCTLast; if(el&&L&&L.stock) el.outerHTML=_buildTransitionCard(L.stock, L.indicators); }catch(_){} }
function _ctPoolAutoToggle(){ try{ var on=!(window.SXCandleBT&&SXCandleBT.poolAutoOn&&SXCandleBT.poolAutoOn()); if(window.SXCandleBT&&SXCandleBT.poolAutoSet) SXCandleBT.poolAutoSet(on); _ctPoolAutoCache={}; _ctRerenderCard(); }catch(_){} }
if(typeof window!=='undefined'){ window._ctPoolAutoToggle=_ctPoolAutoToggle; window._ctRerenderTransitionCard=_ctRerenderCard; }
function _ctKnnHitInline(res){
  if(!res || res.hitRate==null || res.pred < 8) return '<span style="font-size:10px;font-weight:600;color:var(--text3)">· 적중 표본부족</span>';
  var c = res.hitRate>=58?'#16a34a':res.hitRate>=50?'#f59e0b':'#dc2626';
  return '<span style="font-size:10.5px;font-weight:800;color:'+c+'">· 적중 '+res.hitRate+'%</span><span style="font-size:9px;font-weight:600;color:var(--text3)"> (' + res.pred + '건·150봉)</span>';
}
// [S656] LR(로지스틱 회귀) 보조 결과 인라인 — kNN과 같은 피처를 다른 방식(선형결합)으로 학습한 모델.
//   knnScore와 방향(±30 임계, kNN 카드 컨벤션과 동일)이 일치/불일치하는지 같이 표시 — 교차검증 목적.
function _ctLrInline(res, knnScore){
  if(!res || !res.active){
    return `<div style="margin-top:4px;font-size:10px;color:var(--text3)">🤖 LR 측정 불가${res&&res.reason?' ('+res.reason+')':''}</div>`;
  }
  var col = res.score>=30?'#e3493b':res.score<=-30?'#2563eb':'#f59e0b';
  var sign = res.score>0?'+':'';
  var knnDir = knnScore>=30?1:knnScore<=-30?-1:0;
  var lrDir = res.score>=30?1:res.score<=-30?-1:0;
  var aggHtml = '';
  if(knnDir!==0 && lrDir!==0){
    aggHtml = (knnDir===lrDir)
      ? ' <span style="font-size:9px;font-weight:700;color:#16a34a">· kNN+LR 합의</span>'
      : ' <span style="font-size:9px;font-weight:700;color:#dc2626">· kNN+LR 불일치</span>';
  }
  return `<div style="margin-top:4px;font-size:10.5px;color:var(--text2)">🤖 LR 보조 <span style="font-weight:800;color:${col}">${sign}${res.score}</span> 양봉확률 ${res.prob}%${aggHtml}</div>`;
}
// [S657] LR 비동기 요청(공유) — key가 캐시에 있으면 즉시 {cached:true,res}, 없으면 계산을 등록(이미 같은 key로
//   누가 요청해놨으면 새로 학습 안 하고 대기열에만 추가) 후 {cached:false}. 완료 시 등록된 onReady들 모두 호출.
function _ctLrRequestAsync(rows, key, onReady){
  if(Object.prototype.hasOwnProperty.call(_ctLrCache, key)) return { cached:true, res:_ctLrCache[key] };
  if(!_ctLrPending[key]) _ctLrPending[key] = [];
  _ctLrPending[key].push(onReady);
  if(_ctLrPending[key].length === 1){
    setTimeout(function(){
      var res=null; try { res=(window.SXLR&&SXLR.score)?SXLR.score(rows,{win:16}):null; } catch(_e){ res=null; }
      _ctLrCache[key]=res;
      var cbs = _ctLrPending[key]||[]; delete _ctLrPending[key];
      cbs.forEach(function(cb){ try{ cb(res); }catch(_e2){} });
    }, 60);
  }
  return { cached:false };
}
// [S657] SimPositionLine 사전준비용 LR 한 줄 — _ctPrepLine(kNN)과 같은 위치에 병렬 표시.
function _ctPrepLrInline(res, knnScore, ctxLabel){
  if(!res || !res.active) return '';
  var isUp = res.score>=30, isDn = res.score<=-30;
  var dirTxt = isUp?'양봉 전이 유망':isDn?'음봉 전이 유망':'중립';
  var dirClr = isUp?'#e3493b':isDn?'#2563eb':'#f59e0b';
  var sign = res.score>0?'+':'';
  var knnDir = knnScore>=30?1:knnScore<=-30?-1:0, lrDir = isUp?1:isDn?-1:0;
  var agg = (knnDir!==0 && lrDir!==0) ? (knnDir===lrDir ? ' · 합의' : ' · 불일치') : '';
  return `<div style="margin-top:3px;font-size:10px;color:var(--text3)">🤖 ${ctxLabel}(LR) · <span style="font-weight:800;color:${dirClr}">${sign}${res.score}</span> ${dirTxt}${agg}</div>`;
}
// [S618] 자기-kNN 매우 약함 판정 — 600봉 검증 결과 풀링은 ~40% 밑 극단적 종목(현대차류)만 도움. 45~49%는 오히려 손해 → 임계 42%로 보수화.
function _ctKnnIsWeak(res){ return !!(res && res.hitRate!=null && res.pred>=8 && res.hitRate < 42); }
// [S619] 경계 구간(42~45%) — 데이터 공백 지대(현대차39.3=도움 ~ 신한45=손해 사이, 표본 없음). 확신 대신 "재비교" 경고.
function _ctKnnIsBorderline(res){ return !!(res && res.hitRate!=null && res.pred>=8 && res.hitRate >= 42 && res.hitRate < 45); }
// [S615] 펄스(레이더 핑)+하트비트 효과 CSS 1회 주입
function _ensurePoolNudgeCss(){
  if(typeof document==='undefined' || document.getElementById('sxPoolNudgeCss')) return;
  var st=document.createElement('style'); st.id='sxPoolNudgeCss';
  st.textContent='@keyframes sxPoolPing{0%{box-shadow:0 0 0 0 rgba(14,165,233,.55)}70%{box-shadow:0 0 0 9px rgba(14,165,233,0)}100%{box-shadow:0 0 0 0 rgba(14,165,233,0)}}@keyframes sxPoolBeat{0%,32%,100%{transform:scale(1)}13%{transform:scale(1.22)}}@keyframes sxPoolGlow{0%,100%{border-color:#0ea5e955}50%{border-color:#0ea5e9bb}}@keyframes sxPoolGlowA{0%,100%{border-color:#f59e0b66}50%{border-color:#f59e0bbb}}';
  document.head.appendChild(st);
}
// [S615] 진화형 풀링 추천 넛지 — 맥박치는 글로브 아이콘 + 은은한 테두리 글로우
function _ctPoolNudge(){
  return '<div style="margin-top:8px;padding:8px 11px;border-radius:10px;background:linear-gradient(90deg,#0ea5e914,#7c3aed0e);border:1px solid #0ea5e955;display:flex;align-items:center;gap:10px;animation:sxPoolGlow 2.4s ease-in-out infinite">'
    + '<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#0ea5e9;font-size:13px;flex-shrink:0;animation:sxPoolPing 1.8s ease-out infinite,sxPoolBeat 1.8s ease-in-out infinite">🌐</span>'
    + '<div style="flex:1;min-width:0"><div style="font-size:10.5px;font-weight:800;color:#0ea5e9">자기 패턴이 매우 약해요 — 풀링이 도움될 수 있어요</div>'
    + '<div style="font-size:9px;color:var(--text3);margin-top:1px;line-height:1.45">자기 과거 닮은꼴이 거의 없는 종목이에요. <b style="color:#7c3aed">검증</b> → 🌐 다종목 풀링 비교로 실제 도움 되는지 확인해보세요.</div></div>'
    + '</div>';
}
// [S619] 경계 구간 경고 — 풀링이 도움될지 손해일지 데이터로 알 수 없는 지대. 재비교 유도(주황).
function _ctPoolCaution(){
  return '<div style="margin-top:8px;padding:8px 11px;border-radius:10px;background:#f59e0b12;border:1px solid #f59e0b66;display:flex;align-items:center;gap:10px;animation:sxPoolGlowA 2.6s ease-in-out infinite">'
    + '<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#f59e0b;font-size:13px;flex-shrink:0;animation:sxPoolBeat 2.2s ease-in-out infinite">🔄</span>'
    + '<div style="flex:1;min-width:0"><div style="font-size:10.5px;font-weight:800;color:#d97706">경계 구간 — 풀링 효과가 불확실해요</div>'
    + '<div style="font-size:9px;color:var(--text3);margin-top:1px;line-height:1.45">자기 패턴이 애매하게 약해요(데이터 공백 지대). <b style="color:#7c3aed">검증</b> → 🌐 풀링 비교로 자기 vs 풀링을 직접 대보고 판단하세요.</div></div>'
    + '</div>';
}

function _buildTransitionCard(stock, indicators){
  const rows = (indicators && indicators._advanced && Array.isArray(indicators._advanced.rows)) ? indicators._advanced.rows
             : (stock && Array.isArray(stock._lastAnalCandles)) ? stock._lastAnalCandles : null;
  if(!rows || rows.length < 25) return '';
  const _mktCT = (stock && (stock._mkt || stock.market)) || (typeof currentMarket !== 'undefined' ? currentMarket : 'kr');
  const _tfCT = (typeof _analTF !== 'undefined' && _analTF) ? _analTF : (typeof currentTF !== 'undefined' && currentTF ? currentTF : 'day');
  // [S637] kNN 기준을 검증툴과 동일하게 600봉으로 통일 (분석 rows는 _analCount=200/500봉이라 self-hit 왜곡 — S617). 600봉 1회 fetch·캐시, 미도착 시 분석 rows로 첫 페인트 후 업그레이드.
  let _knnRows = rows;
  let _r600Done = false;
  // [S643] 목표 봉수 — try 밖으로 올려 _have600 게이트에서도 재사용(_btTargetBars: KIS ON 700 / OFF 600 / 주·월 400).
  const _tgtCT = (typeof _btTargetBars==='function') ? _btTargetBars(_mktCT, _tfCT) : 600;
  try {
    // [S639] BT/분석이 이미 확장한 600/700봉(indicators._advanced.rows = 확장 후 runAnalysis 재계산본)을 그대로 재사용 → BT와 동일 캔들 공유, 별도 fetch 없음. 미확장(기본 분석 200/500봉)일 때만 fetchRows600 폴백.
    if (rows.length >= Math.floor(_tgtCT * 0.95)) {
      _r600Done = true;   // 이미 충분(BT 확장본) — rows 그대로
    } else {
      const _r6k = ((stock&&(stock.code||stock.name))||'') + '|' + _mktCT + '|' + _tfCT;
      const _c6 = _ctRows600Cache[_r6k];
      if (Array.isArray(_c6)) { _r600Done = true; if (_c6.length > rows.length) _knnRows = _c6; }   // 폴백 fetch 해결됨(성공/실패 무관) — 더 길면 사용
      else if (!Object.prototype.hasOwnProperty.call(_ctRows600Cache, _r6k)) {
        _ctRows600Cache[_r6k] = 'pending';
        (function(_mk,_tf,_cd,_k){ setTimeout(async function(){
          let r6=null; try { r6=(window.SXCandleBT&&SXCandleBT.fetchRows600)? await SXCandleBT.fetchRows600(_mk,_tf,_cd):null; }catch(_e){}
          _ctRows600Cache[_k] = (r6&&r6.length)? r6 : [];
          _ctRerenderCard();
        },40); })(_mktCT,_tfCT,(stock&&(stock.code||stock.name))||'',_r6k);
      }
    }
  } catch(_e6){}
  // [S643] 게이트 작동 = 실제 봉수 확보(_knnRows.length >= 목표*0.95). 기존 _r600Done(S638)은 'fetch 시도 해결'일 뿐이라
  //   짧은 봉(분석 미확장·폴백 실패)도 true가 돼 풀링 자동전환 게이트가 흔들렸음 → 배지만 뜨고 점수 교체 안 되는 현상.
  //   카드 표시·적중률은 짧아도 유지(영구차단 방지). 풀링 게이트만 봉수 충분 시 작동(폴백 도착 후 재렌더에서 true 전환).
  const _have600 = _r600Done && (_knnRows.length >= Math.floor(_tgtCT * 0.95));
  // [S525] 미니 백테스트 컨텍스트 저장 — 버튼 클릭 시 sx_candle_bt.js가 읽음. [S637] 600봉으로 통일(모달·게이트 동일 기준).
  try { window._sxCTBT = { rows: _knnRows, market: _mktCT, tf: _tfCT, name: (stock && (stock.name || stock.code)) || '', code: (stock && (stock.code || stock.name)) || '' }; } catch(_eCtx){}
  try { window._sxCTLast = { stock: stock, indicators: indicators }; } catch(_eL){} // [S635] 풀링 재렌더용
  const r = _candleTransitionScore(rows, indicators, _mktCT, _tfCT);
  // [S610] kNN 승격 — 검증된 자기유사도 kNN(16×10 @≥30)을 메인 점수로. 뱅크 부족 시 룰 폴백.
  let _kn = null;
  try { if(window.SXKNN && SXKNN.score) _kn = SXKNN.score(_knnRows, { win:16, k:10 }); } catch(_ekn){ _kn = null; }
  const _useKnn = !!(_kn && _kn.active && typeof _kn.score === 'number');
  // [S486] 최신 봉 날짜 표기 — 오늘과 다르면 빨강(데이터 시점 주의). 종목별 최신봉 시차 혼동 방지.
  const _lastDate = (r && r.asOf) ? r.asOf : (rows.length ? rows[rows.length-1].date : null);   // [S505] 판정에 실제 쓰인 확정봉 날짜
  const _dm = _lastDate ? String(_lastDate).match(/(\d{4})-?(\d{2})-?(\d{2})/) : null;
  const _tdy = new Date();
  const _isToday = !!(_dm && +_dm[1]===_tdy.getFullYear() && +_dm[2]===_tdy.getMonth()+1 && +_dm[3]===_tdy.getDate());
  const _dateTxt = _dm ? `${+_dm[2]}/${+_dm[3]}` : '—';
  const _dateCol = _isToday ? 'var(--text3)' : '#ef4444';
  const _dateLabel = _isToday ? `${_dateTxt} 종가기준` : `⚠️ ${_dateTxt} 종가기준`;   // [S505] 확정봉 종가 기준 명시
  const head = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><span style="font-size:13px;font-weight:800;color:var(--text)">🧪 캔들 전이 통계</span><span style="font-size:9px;padding:2px 6px;border-radius:4px;background:var(--surface2);color:var(--text3);border:1px solid var(--border)">실험</span><span onclick="_sxVib(12);window.SXCandleBT&&SXCandleBT.open()" title="유사패턴의 과거 적중률 검증" style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:#7c3aed22;color:#7c3aed;border:1px solid #7c3aed66;cursor:pointer">검증</span><span style="font-size:10px;font-weight:700;color:${_dateCol};margin-left:auto">${_dateLabel}</span></div>`;
  const wrap = inner => `<div id="sxCTCardWrap" style="margin:8px 10px;padding:12px 14px;border-radius:12px;background:var(--surface);border:1px solid var(--border)">${head}${inner}</div>`;
  if(!r.active){
    try { stock._ctKnnPrep = null; } catch(_eRp){} // [S651] 카드 비활성 시 사전준비 잔존값 제거 — 엔진판단 검증 SimPositionLine 오염 방지
    const _cntTxt = (r.redCnt!=null && r.greenCnt!=null) ? ` (음봉 ${r.redCnt} · 양봉 ${r.greenCnt})` : '';
    return wrap(`<div style="font-size:12px;color:var(--text3)">전이 대기 — ${r.reason}${_cntTxt}</div>`);
  }
  // [S610] 메인 점수 = kNN(활성 시) / 룰(폴백). 색·부호·라벨 통일.
  // [S635] 풀링 자동전환 — 토글 ON이면 대표목록 풀과 비교해 확실히 이기는(+3%p) 종목만 _kn을 풀링값으로 교체. 비동기·캐시·기본 OFF. composite/C판정 무관(실험 점수).
  let _poolApplied = false, _poolDelta = null, _poolHit = null, _poolN = null;
  if (_useKnn && _have600 && window.SXCandleBT && SXCandleBT.poolAutoOn && SXCandleBT.poolAutoOn()) {
    const _pak = ((stock&&(stock.code||stock.name))||'') + '|' + _mktCT + '|' + _tfCT + '|' + (_lastDate||'') + '|16x10';
    if (Object.prototype.hasOwnProperty.call(_ctPoolAutoCache, _pak)) {
      const _pv = _ctPoolAutoCache[_pak];
      if (_pv && _pv.applies && _pv.poolCur && _pv.poolCur.active) { _kn = _pv.poolCur; _poolApplied = true; _poolDelta = _pv.delta; _poolHit = _pv.pooledHit; _poolN = _pv.pooledN; }
    } else {
      (function(_r,_key,_mk,_tf,_cd,_nm){ setTimeout(async function(){
        let _v=null; try { _v = (window.SXCandleBT&&SXCandleBT.evalPoolAuto) ? await SXCandleBT.evalPoolAuto(_r,_mk,_tf,_cd,_nm) : {applies:false}; } catch(_e){ _v={applies:false}; }
        _ctPoolAutoCache[_key]=_v;
        if(_v && _v.applies) _ctRerenderCard();   // 이긴 종목만 재렌더(풀링 점수 반영)
      }, 50); })(_knnRows, _pak, _mktCT, _tfCT, (stock&&(stock.code||stock.name))||'', (stock&&(stock.name||stock.code))||'');
    }
  }
  const _pScore = _useKnn ? Math.round(_kn.score) : r.score;
  // [S651] 사전준비 연동 — 엔진판단 검증 그리드(_buildSimPositionLine)가 같은 kNN 결과를 보조 근거로 재사용하도록 저장.
  //   kNN 비활성(룰 폴백)이면 검증 안 된 근거라 null(미표시). 풀링 자동전환 적용 후 값이라 최신.
  //   [S657] _rows/_key 추가 — SimPositionLine이 같은 캐시 키로 LR도 요청할 수 있게(중복 학습 방지).
  const _ctKey = ((stock&&(stock.code||stock.name))||'') + '|' + _tfCT + '|' + (_lastDate||'') + '|' + _knnRows.length;
  try { stock._ctKnnPrep = _useKnn ? { score:_pScore, upFrac:_kn.upFrac, k:_kn.k, nUp:_kn.nUp, nDn:_kn.nDn, _rows:_knnRows, _key:_ctKey } : null; } catch(_ePrep){}
  const col = 'var(--text)';   // [S671] 방향예측 아님 → 매수/매도 색(빨강/파랑) 제거·중립. 방향은 아래 ▲/▼ 분할바가 서술.
  const sign = _pScore > 0 ? '+' : '';
  const _descMain = _useKnn ? (Math.round(_kn.upFrac) + '%') : (sign + _pScore);   // [S671] kNN=양봉비율%(서술 통계) / 룰폴백=점수
  const _pLabel = _useKnn
    ? (_pScore>=30 ? '양봉 우세' : _pScore<=-30 ? '음봉 우세' : '혼조')
    : r.label;
  const _pRight = _useKnn
    ? `16봉 패턴 매칭`
    : (r.mode==='rebound'?`음봉 ${r.streak}연속`:r.mode==='reversal'?`양봉 ${r.streak}연속`:r.mode==='flipUp'?`🔺 ${r.patName||'양전환'}`:r.mode==='flipDown'?`🔻 ${r.patName||'음전환'}`:`8봉 음${r.red8}·양${r.green8}`);
  const top = `<div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:26px;font-weight:800;color:${col}">${_descMain}</span><span style="font-size:13px;font-weight:700;color:${col}">${_pLabel}${r.nextBar?` <span style="font-size:11px;font-weight:600;color:var(--text3)">(${r.nextBar})</span>`:''}</span><span style="font-size:10px;color:var(--text3);margin-left:auto">${_pRight}</span></div>`;
  // [S611] 닮은꼴 이웃 분할바 — 양(빨강)/음(파랑) 비율 시각화 (카드 컨벤션 일치, 눈에 띄게)
  const _knNbrBar = _useKnn ? `<div style="display:flex;align-items:center;gap:9px;margin:10px 0 2px">
    <span style="font-size:10px;font-weight:700;color:var(--text2);flex-shrink:0">닮은꼴 ${_kn.k}개</span>
    <div style="flex:1;display:flex;height:18px;border-radius:9px;overflow:hidden;background:var(--surface2);box-shadow:inset 0 0 0 1px var(--border)">
      ${_kn.nUp>0?`<div style="width:${Math.round(_kn.nUp/_kn.k*100)}%;background:#e3493b;display:flex;align-items:center;justify-content:center"><span style="font-size:11px;font-weight:800;color:#fff">▲ ${_kn.nUp}</span></div>`:''}
      ${_kn.nDn>0?`<div style="width:${Math.round(_kn.nDn/_kn.k*100)}%;background:#2563eb;display:flex;align-items:center;justify-content:center"><span style="font-size:11px;font-weight:800;color:#fff">▼ ${_kn.nDn}</span></div>`:''}
    </div>
  </div>` : '';
  // [S611] kNN 적중률 인라인 — 종목 캐시 적중 시 즉시, 없으면 비동기 측정 후 span 교체(렌더 블로킹 방지). 모달 [검증]과 동일 수치.
  let _hitHtml = '', _nudgeHtml = '';
  if(_useKnn){
    const _hk = _ctKey;
    if(Object.prototype.hasOwnProperty.call(_ctKnnHitCache, _hk)){
      var _cv = _ctKnnHitCache[_hk];
      _hitHtml = _ctKnnHitInline(_cv);
      if(_ctKnnIsWeak(_cv)){ _ensurePoolNudgeCss(); _nudgeHtml = _ctPoolNudge(); }
      else if(_ctKnnIsBorderline(_cv)){ _ensurePoolNudgeCss(); _nudgeHtml = _ctPoolCaution(); }
    } else {
      const _hid = '_ctkh_' + Math.random().toString(36).slice(2,9);
      const _nid = '_ctnd_' + Math.random().toString(36).slice(2,9);
      _hitHtml = `<span id="${_hid}" style="font-size:10px;font-weight:600;color:var(--text3)">· 적중률 측정…</span>`;
      _nudgeHtml = `<div id="${_nid}"></div>`;
      (function(_r,_key,_hi,_ni){ setTimeout(function(){
        var res=null; try { res=(window.SXKNN&&SXKNN.backtestHit)?SXKNN.backtestHit(_r,{win:16,k:10,thr:30}):null; } catch(_e){ res=null; }
        _ctKnnHitCache[_key]=res;
        var el=document.getElementById(_hi); if(el) el.outerHTML=_ctKnnHitInline(res);
        var ne=document.getElementById(_ni); if(ne){ if(_ctKnnIsWeak(res)){ _ensurePoolNudgeCss(); ne.outerHTML=_ctPoolNudge(); } else if(_ctKnnIsBorderline(res)){ _ensurePoolNudgeCss(); ne.outerHTML=_ctPoolCaution(); } }
      }, 30); })(_knnRows, _hk, _hid, _nid);
    }
  }
  // [S656→S657] LR(로지스틱 회귀) 보조 — kNN과 같은 피처(SXKNN.buildVecs)를 다른 방식으로 학습한 별도 모델.
  //   sx_candle_lr.js 미로드/표본부족이면 자동으로 비활성 표시(에러 아님). 공유 비동기 요청(_ctLrRequestAsync) —
  //   SimPositionLine 사전준비가 같은 키로 동시에 요청해도 학습은 1회만 실행됨.
  let _lrHtml = '';
  if(_useKnn){
    const _lid = '_ctlr_' + Math.random().toString(36).slice(2,9);
    const _lrReq = _ctLrRequestAsync(_knnRows, _ctKey, function(res){
      var el=document.getElementById(_lid); if(el) el.outerHTML=_ctLrInline(res, _pScore);
    });
    _lrHtml = _lrReq.cached
      ? _ctLrInline(_lrReq.res, _pScore)
      : `<div id="${_lid}" style="margin-top:4px;font-size:10px;color:var(--text3)">🤖 LR 측정 중…</div>`;
  }
  // [S636] 풀링 적용 시 적중률을 풀링값으로 교체 + 넛지 제거(이미 풀링 ON이라 불필요). 표시=결정 일치.
  if(_poolApplied){
    if(_poolHit!=null){
      var _phC = _poolHit>=58?'#16a34a':_poolHit>=50?'#f59e0b':'#dc2626';
      _hitHtml = '<span style="font-size:10.5px;font-weight:800;color:'+_phC+'">· 적중 '+_poolHit+'%</span><span style="font-size:9px;font-weight:600;color:var(--text3)"> ('+(_poolN||0)+'건·150봉·풀링)</span>';
    }
    _nudgeHtml = '';
  }
  // [S610] 신뢰도 — kNN은 전용 안내(룰용 _ctConfidence는 'KR 약함'이라 검증결과와 상충), 룰 폴백 시 기존 배지
  const _conf = _ctConfidence(r.score, _mktCT, r.sbFired, r.regime);
  // [S635] 풀링 자동전환 토글 + 적용 배지 (kNN 활성 시만). 토글은 전역, 적용 배지는 이 종목이 +3%p 우세일 때.
  const _poolRow = _useKnn ? (function(){
    const _on = !!(window.SXCandleBT && SXCandleBT.poolAutoOn && SXCandleBT.poolAutoOn());
    const _tg = `<span onclick="_sxVib(8);window._ctPoolAutoToggle&&_ctPoolAutoToggle()" title="ON: 시총 상위 대표목록 풀과 비교해, 자기 적중률 50% 미만이면서 풀링이 +3%p 이상 확실히 이기는 종목만 점수를 풀링으로 자동 교체. 도너=대표목록 고정(관심목록 아님). 기본 OFF." style="font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:12px;border:1px solid;cursor:pointer;${_on?'background:#0ea5e9;color:#fff;border-color:#0ea5e9':'background:var(--surface2);color:#0ea5e9;border-color:#0ea5e966'}">🌐 풀링 자동전환 ${_on?'ON':'OFF'}</span>`;
    const _bd = _poolApplied ? `<span style="font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:12px;background:#0ea5e91a;color:#0ea5e9;border:1px solid #0ea5e955">✓ 풀링 적용 · 자기 대비 +${_poolDelta}%p</span>` : (_on?`<span style="font-size:9px;color:var(--text3)">우세 종목만 자동 적용</span>`:'');
    return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:7px">${_tg}${_bd}</div>`;
  })() : '';
  const confHtml = _useKnn
    ? `<div style="margin-top:8px"><span style="font-size:11px;font-weight:800;color:${_poolApplied?'#0ea5e9':'#7c3aed'};padding:3px 9px;border-radius:7px;background:${_poolApplied?'#0ea5e9':'#7c3aed'}1a;border:1px solid ${_poolApplied?'#0ea5e9':'#7c3aed'}55">${_poolApplied?'🌐 풀링 kNN':'🧬 자기유사도 kNN'}</span> ${_hitHtml}<div style="font-size:10px;color:var(--text3);line-height:1.55;margin-top:5px">${_poolApplied?'대표목록(시총상위) 풀을 더해 예측 — 이 종목은 풀링이 자기 단독보다 우세.':'최근 16봉 패턴과 가장 닮은 과거 '+_kn.k+'봉의 다음봉 색으로 예측.'} 적중률은 이 종목 과거 150봉 검증치(모달 [검증]과 동일). |점수|≥30만 방향 신뢰. <b style="color:${_knnRows.length>=550?'#16a34a':'#d97706'}">[kNN 기준 ${_knnRows.length}봉]</b></div>${_lrHtml}</div>`
    : `<div style="margin-top:8px"><span style="font-size:11px;font-weight:800;color:${_conf.color};padding:3px 9px;border-radius:7px;background:${_conf.color}1a;border:1px solid ${_conf.color}55">신뢰도 ${_conf.label}</span><div style="font-size:10px;color:var(--text3);line-height:1.55;margin-top:5px">${_conf.why}</div></div>`;
  // [S482] 0중심 양방향 바 — 중앙(50%)이 0, 양수는 오른쪽(초록)/음수는 왼쪽(빨강)으로 채움
  const _mag = Math.min(50, Math.abs(_pScore)/2);
  const _fill = _pScore >= 0
    ? `<div style="position:absolute;left:50%;width:${_mag}%;height:100%;background:${col}"></div>`
    : `<div style="position:absolute;left:${50-_mag}%;width:${_mag}%;height:100%;background:${col}"></div>`;
  const bar = `<div style="position:relative;height:8px;border-radius:4px;background:var(--surface2);overflow:hidden;margin:8px 0">${_fill}<div style="position:absolute;left:50%;top:0;width:1px;height:100%;background:var(--text3);opacity:.45"></div></div>`;
  // [S620] 휩소(kNN↔룰 방향 충돌) 경고 — 별도 자리 X, 룰 경고와 같은 분홍 박스에 줄로 보충.
  // kNN이 방향 판정(|점수|≥30)을 냈는데 룰이 의미있게(|점수|≥20) 반대쪽을 가리키면 휩소.
  let _whip = '';
  if(_useKnn && Math.abs(_pScore) >= 30 && r.score != null && Math.abs(r.score) >= 20 && Math.sign(r.score) === -Math.sign(_pScore)){
    _whip = _pScore > 0
      ? 'kNN은 양봉 예상, 룰은 과열·반전(음봉) 신호 — 휩소 주의'
      : 'kNN은 음봉 예상, 룰은 반등(양봉) 신호 — 휩소 주의';
  }
  const _wl = [];
  if(r.warn) _wl.push(`<span style="color:#ef4444">⚠️ ${r.warn}</span>`);
  if(_whip) _wl.push(`<span style="color:#d97706">🔀 ${_whip}</span>`);
  const warnHtml = _wl.length ? `<div style="font-size:11px;margin:7px 0;padding:6px 9px;background:#ef444412;border-radius:7px;line-height:1.7">${_wl.join('<br>')}</div>` : '';
  const reasonsHtml = (r.reasons && r.reasons.length) ? `<div style="font-size:11px;color:var(--text2);line-height:1.75;margin-top:6px">${_useKnn?'<span style="font-size:9px;color:var(--text3);font-weight:700">📋 룰 해설 (보조 맥락)</span><br>':''}${r.reasons.map(x=>`· ${x}`).join('<br>')}</div>` : '';
  const note = `<div style="font-size:9px;color:var(--text3);margin-top:9px;border-top:1px solid var(--border);padding-top:6px">${_useKnn?'메인 = 자기유사도 kNN(검증) · 아래 캔들/해설은 보조 · ':''}실험 지표 · 정식 판정과 무관 · <b>유사 패턴 중 양봉이던 비율(서술 통계) · 방향예측 아님</b></div>`;
  // [S545] 미니 백테스트 버튼 → 카드 상단 [검증] 보라 배지로 이전 (head의 onclick=SXCandleBT.open)
  // [S483] 최근 캔들 시퀀스 — 미니 캔들 모양(몸통+꼬리, 차트색 일치) + 특징 패턴명(도지/망치/유성) 표기. 오른쪽=최신.
  const _seqN = 8, _H = 26;
  const _seq = rows.slice(-_seqN);
  const _patName = b => {
    const hi=+b.high, lo=+b.low, op=+b.open, cl=+b.close, rng=hi-lo;
    if(rng<=0) return null;
    const body=Math.abs(cl-op), upW=hi-Math.max(op,cl), dnW=Math.min(op,cl)-lo, bR=body/rng;
    if(bR < 0.1) return '도지';
    if(dnW >= body*2 && upW <= body*0.5 && bR < 0.4) return '망치';
    if(upW >= body*2 && dnW <= body*0.5 && bR < 0.4) return '유성';
    return null;
  };
  const _patCol = { '도지':'#6b7280', '망치':'#e3493b', '유성':'#2563eb' };
  const _cells = _seq.map((b, i) => {
    const hi=+b.high, lo=+b.low, op=+b.open, cl=+b.close, rng=(hi-lo)||1;
    const up = cl>=op, c = up ? '#e3493b' : '#2563eb', isLast = i===_seq.length-1;
    const bodyTopV = hi - Math.max(op,cl), bodyH = Math.abs(cl-op) || rng*0.03;
    const pxTop = (bodyTopV/rng)*_H, pxBody = Math.max(1.5, (bodyH/rng)*_H);
    const pat = _patName(b);
    const wick = `<div style="position:absolute;left:50%;top:0;width:1px;height:${_H}px;background:${c};transform:translateX(-50%);opacity:.55"></div>`;
    const body = `<div style="position:absolute;left:18%;width:64%;top:${pxTop}px;height:${pxBody}px;background:${c};border-radius:1px${isLast?`;box-shadow:0 0 0 1.5px ${c}`:''}"></div>`;
    const lbl = `<div style="height:11px;line-height:11px;font-size:7px;font-weight:700;text-align:center;color:${pat?_patCol[pat]:'transparent'}">${pat||'·'}</div>`;
    return `<div style="flex:1;opacity:${isLast?1:.82}">${lbl}<div style="position:relative;width:100%;height:${_H}px">${wick}${body}</div></div>`;
  }).join('');
  const _seqRow = `<div style="margin:10px 0 2px"><div style="font-size:9px;color:var(--text3);margin-bottom:3px">최근 ${_seq.length}봉 · 캔들 형태 · <span style="color:#e3493b">양봉</span>/<span style="color:#2563eb">음봉</span> (오른쪽=최신)</div><div style="display:flex;gap:3px;align-items:flex-end">${_cells}</div></div>`;
  // [S507] 현재(진행)봉 적중 배지 — 예측 방향(양봉/음봉 전이 유망)과 현재 진행봉의 실제 양/음 일치 여부.
  //   미니캔들 마지막봉이 예측 대상(다음봉)과 같은 날짜(=장중 진행봉)이고 방향성이 있을 때만 표시.
  let _hitRow = '';
  { const _lb = _seq.length ? _seq[_seq.length-1] : null;
    const _nmd = d => { const m=String(d||'').match(/(\d{4})-?(\d{2})-?(\d{2})/); return m?`${+m[2]}/${+m[3]}`:''; };
    if(_lb && (_pScore>=30 || _pScore<=-30) && _nmd(_lb.date)===r.nextBar){
      const _lbUp = (+_lb.close) >= (+_lb.open);
      const _predBull = _pScore >= 30;
      const _hit = (_predBull && _lbUp) || (!_predBull && !_lbUp);
      _hitRow = `<div style="text-align:right;margin:3px 2px 0;font-size:9.5px;font-weight:800;color:${_hit?'#16a34a':'#f59e0b'}">현재봉 ${_nmd(_lb.date)} ${_lbUp?'양봉':'음봉'} · ${_hit?'우세 일치 ✓':'우세 불일치 ✗'}</div>`;
    } }
  return wrap(top + _knNbrBar + confHtml + _poolRow + _nudgeHtml + bar + _seqRow + _hitRow + warnHtml + reasonsHtml + note);
}

// ════════ [S663] 차트예측 카드 (실험) — 증권플러스 '차트예측' 모방 ════════
//   라인형태 kNN(sx_chart_predict.js / SXCP)으로 최근 win봉과 닮은 과거 K개 아날로그의
//   이후 H봉 분포(상승확률·평균/최대수익·구간분포)를 표시 + 예상경로 오버레이.
//   BT·C 슈퍼바이저 미반영(정보 제공만). active일 때만 표시(표본부족/평탄/단기이력은 숨김).
//   피처=B안(종가 z-시퀀스, sx_chart_predict.js). 캔들전이 kNN(buildVecs 138차원)과 용도 분리.
function _cpDrawCanvas(id, qPct, paths, medPath){
  try{
    var cv=document.getElementById(id); if(!cv) return;
    var rect=cv.getBoundingClientRect(), W=rect.width||300, Hh=120, dpr=(window.devicePixelRatio||1);
    cv.width=Math.round(W*dpr); cv.height=Math.round(Hh*dpr);
    var ctx=cv.getContext('2d'); if(!ctx) return; ctx.scale(dpr,dpr);
    var winN=qPct.length, hN=medPath.length-1, total=winN+hN, i, j;
    var lo=0, hi=0;
    for(i=0;i<qPct.length;i++){ if(qPct[i]<lo)lo=qPct[i]; if(qPct[i]>hi)hi=qPct[i]; }
    for(i=0;i<paths.length;i++) for(j=0;j<paths[i].length;j++){ var v=paths[i][j]; if(v<lo)lo=v; if(v>hi)hi=v; }
    for(i=0;i<medPath.length;i++){ if(medPath[i]<lo)lo=medPath[i]; if(medPath[i]>hi)hi=medPath[i]; }
    var pad=Math.max((hi-lo)*0.12, 0.004); lo-=pad; hi+=pad; if(hi-lo<1e-6) hi=lo+1e-6;
    var pL=4,pR=4,pT=6,pB=6, plotW=W-pL-pR, plotH=Hh-pT-pB;
    var X=function(k){ return pL+(total>1?(k/(total-1)):0)*plotW; };
    var Y=function(val){ return pT+(1-(val-lo)/(hi-lo))*plotH; };
    // 0% 기준선
    ctx.strokeStyle='rgba(120,120,120,0.22)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(pL,Y(0)); ctx.lineTo(W-pR,Y(0)); ctx.stroke();
    // 현재(경계) 세로선
    var bx=X(winN-1); ctx.strokeStyle='rgba(120,120,120,0.32)'; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.moveTo(bx,pT); ctx.lineTo(bx,Hh-pB); ctx.stroke(); ctx.setLineDash([]);
    // 아날로그 경로(흐리게) — 경계(0%)에서 시작
    for(i=0;i<paths.length;i++){
      var fin=paths[i][paths[i].length-1];
      ctx.strokeStyle=fin>=0?'rgba(227,73,59,0.20)':'rgba(37,99,235,0.20)'; ctx.lineWidth=1; ctx.beginPath();
      for(j=0;j<paths[i].length;j++){ var xx=X(winN-1+j), yy=Y(paths[i][j]); if(j===0)ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy); }
      ctx.stroke();
    }
    // 쿼리(과거 win봉) 선 — 진회색
    ctx.strokeStyle='#475569'; ctx.lineWidth=1.6; ctx.beginPath();
    for(i=0;i<qPct.length;i++){ var xq=X(i), yq=Y(qPct[i]); if(i===0)ctx.moveTo(xq,yq); else ctx.lineTo(xq,yq); }
    ctx.stroke();
    // 중앙값 경로(굵게) — 색=최종 부호
    var mfin=medPath[medPath.length-1];
    ctx.strokeStyle=mfin>=0?'#e3493b':'#2563eb'; ctx.lineWidth=1.6; ctx.beginPath();
    for(i=0;i<medPath.length;i++){ var xm=X(winN-1+i), ym=Y(medPath[i]); if(i===0)ctx.moveTo(xm,ym); else ctx.lineTo(xm,ym); }
    ctx.stroke();
  }catch(_e){}
}
function _buildChartPredictCard(stock, indicators){
  // rows: 전이카드와 동일 접근(BT확장 시 600/700·기본분석 200/500봉). 차트예측은 그래도 동작, 부족분만 비활성.
  const rows = (indicators && indicators._advanced && Array.isArray(indicators._advanced.rows)) ? indicators._advanced.rows
             : (stock && Array.isArray(stock._lastAnalCandles)) ? stock._lastAnalCandles : null;
  if(!rows || rows.length < 25) return '';   // 25봉 미만(신규상장 등)만 숨김 — 그 외는 비활성도 카드 노출
  if(!(typeof window!=='undefined' && window.SXCP && SXCP.predict)) return '';   // 모듈 미로드 → 조용히 숨김
  if(typeof window!=='undefined') window._sxCpRows = rows;   // [S665] 백테스트(워크포워드)용 현재 rows 보관
  const _regimeOn = !!(typeof window!=='undefined' && window._sxCpRegimeOn);   // [S663] 레짐필터 토글([S668] 기본 OFF — 전역 초기화)
  const _hybridOn = !!(typeof window!=='undefined' && window._sxCpHybridOn);    // [S664] 하이브리드 매칭(형태+구조) 토글(기본 OFF·실험)
  let r; try { r = SXCP.predict(rows, { regime:_regimeOn, match:(_hybridOn?'hybrid':'shape') }); } catch(_e){ return ''; }
  if(typeof window!=='undefined') window._sxCpLast = { stock:stock, indicators:indicators };   // 부분 재렌더용

  const RED='#e3493b', BLUE='#2563eb', AMB='#f59e0b', PUR='#7c3aed';
  const _regCol = (r && r.curRegime==='up') ? RED : (r && r.curRegime==='down') ? BLUE : AMB;
  const _regKr = (r && r.curRegimeKr) || '—';
  // [S663] 차트확인 버튼 + 제목 그룹 — 활성/비활성 카드 공용  ([S666] 색상·라벨 통일: 차트확인 녹색 · 검증(구 백테스트) 보라 — 타 실험카드 [실험]+[검증] 패턴과 정합)
  const _chartBtn = `<span onclick="_sxVib(12);if(typeof SXChart!=='undefined'&&_currentAnalRows)SXChart.openFull(_currentAnalRows,_currentAnalName,_currentAnalTrades,(typeof _resolvePurpleSv==='function'?_resolvePurpleSv(currentAnalStock):(currentAnalStock&&(currentAnalStock._svChartMarker||currentAnalStock._svVerdict))))" title="기존 풀차트(캔들·MA·BB·마커) 열기" style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:#16a34a22;color:#16a34a;border:1px solid #16a34a66;cursor:pointer">📈 차트확인</span>`;
  // [S665] 백테스트(워크포워드) 버튼 — 과거 시점들에서 예측 적중률 검증
  const _btBtn = `<span onclick="_sxVib(12);window._cpRunBacktest&&_cpRunBacktest()" title="워크포워드 백테스트: 과거 각 시점에서 그 시점까지만으로 예측 → 실제 N봉 후 결과와 대조. 방향 적중률·균형정확도(50%=찍기)·추세지속vs전환 적중·캘리브레이션을 4모드(레짐×하이브리드) 비교. 수 초 걸림." style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:#7c3aed22;color:#7c3aed;border:1px solid #7c3aed66;cursor:pointer">검증</span>`;
  // [S667] 범용 신호검증 — kNN·LR·RSI·MA·MACD 중 어느 게 다음 캔들 방향을 실제로 맞히나 비교
  const _svBtn = `<span onclick="_sxVib(12);window._svRunSignalVal&&_svRunSignalVal()" title="범용 신호검증: 캔들 kNN·LR·RSI역추세·MA5/20·MACD 중 어느 게 다음 캔들(양봉/음봉)을 실제로 맞히나를 워크포워드(룩어헤드 0)로 한 잣대 비교. 균형정확도·추세추종 함정·캘리브레이션. LR 학습 포함이라 십여 초 걸림." style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:#0ea5e922;color:#0284c7;border:1px solid #0ea5e966;cursor:pointer">🔬 신호검증</span>`;
  const _titleGroup = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-size:13px;font-weight:800;color:var(--text)">🔮 차트예측</span><span style="font-size:9px;padding:2px 6px;border-radius:4px;background:var(--surface2);color:var(--text3);border:1px solid var(--border)">실험</span>${_chartBtn}${_btBtn}${_svBtn}</div>`;
  // [S663] 레짐 토글 + 현재 레짐 — 카드가 보이면 항상 접근 가능. [S668] 기본 OFF.
  const _toggle = `<span onclick="_sxVib(8);window._cpRegimeToggle&&_cpRegimeToggle()" title="ON: 현재 레짐(상승추세/횡보/하락추세)과 같은 구간만 집계해 장분위기를 맞춤. 같은 레짐 표본이 10개 미만이면 표본부족(끄면 전체). 검증상 추세추종이라 기본 OFF." style="font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:12px;border:1px solid;cursor:pointer;${_regimeOn?`background:${_regCol};color:#fff;border-color:${_regCol}`:`background:var(--surface2);color:${_regCol};border-color:${_regCol}66`}">⚡ 레짐필터 ${_regimeOn?'ON':'OFF'}</span>`;
  // [S664] 하이브리드 매칭 토글(실험) — OFF(기본)=형태만 / ON=형태+셋업(MA·BB·RSI·MACD·거래량·기울기)
  const _hyToggle = `<span onclick="_sxVib(8);window._cpHybridToggle&&_cpHybridToggle()" title="OFF(기본): 라인 형태만으로 유사구간 선택(오버레이가 시각적으로 가장 닮음). ON(실험): 형태 + 기술적 셋업(MA배열·5/20크로스·BB위치·RSI레벨·MACD모멘텀·거래량추세·MA20기울기)을 함께 맞춰 '같은 자리'의 구간을 선택 → 오버레이 형태일치는 다소 약해질 수 있음. 어느 쪽이 더 맞는지는 워크포워드 검증으로만 판정 가능." style="font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:12px;border:1px solid;cursor:pointer;${_hybridOn?`background:${PUR};color:#fff;border-color:${PUR}`:`background:var(--surface2);color:${PUR};border-color:${PUR}66`}">🧬 하이브리드 ${_hybridOn?'ON':'OFF'}</span>`;
  const _regBadge = `<span style="font-size:9.5px;font-weight:700;color:${_regCol}">현재 ${_regKr}${(_regimeOn&&r&&r.active)?` · ${r.n}개`:''}</span>`;
  const _toggleRow = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:9px">${_toggle}${_hyToggle}${_regBadge}</div>`;

  // 비활성도 카드 상시 노출(제목+토글+사유) — 숨기면 토글을 못 켬. (rows 없음/모듈 미로드는 위에서 이미 숨김)
  if(!r || !r.active){
    const _rightTxt = (r && r.regimeOn) ? `${_regKr} 표본부족` : '표본 부족';
    const _hMin = `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap">${_titleGroup}<span style="font-size:10px;color:var(--text3);font-weight:700">${_rightTxt}</span></div>`;
    const _msg = (_regimeOn && r && r.regimeOn)
      ? `⚡ <b style="color:${_regCol}">${_regKr}</b> 레짐과 같은 유사 표본이 ${r.regimeMatched||0}개로 10개 미만이에요. <b>레짐필터를 끄면</b> 전체 표본으로 표시됩니다.`
      : `닮은 유사 표본이 10개 미만이라 예측을 표시할 수 없어요${(r&&r.reason)?` (${r.reason})`:''}. 데이터가 더 쌓이면 표시됩니다.`;
    return `<div id="sxCpCardWrap" style="margin:0 0 10px;padding:12px 14px;background:#fff;border:1px solid var(--border);border-radius:12px">${_hMin}${_toggleRow}<div style="font-size:10px;color:var(--text3);line-height:1.6;margin-top:9px;padding:8px 10px;background:var(--surface2);border-radius:8px">${_msg}</div></div>`;
  }

  const upC = r.upProb>=55?RED : r.upProb<=45?BLUE : AMB;
  const avgC = r.avg>0?RED : r.avg<0?BLUE : AMB;
  const medC = r.median>0?RED : r.median<0?BLUE : AMB;
  const sgn = v => (v>0?'+':'');
  const _band = (r.band!=null) ? r.band : Math.round((r.max-r.min)/2*10)/10;   // [S670] 변동폭 폴백

  const head = `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap">${_titleGroup}<span style="font-size:10px;color:var(--text3);font-weight:700">유사 ${r.n}개 · 최고 ${r.nearSim}%</span></div>`;

  const statBox = (lbl,val,clr) => `<div style="flex:1;text-align:center">
    <div style="font-size:9px;color:var(--text3);margin-bottom:2px">${lbl}</div>
    <div style="font-size:15px;font-weight:800;color:${clr}">${val}</div></div>`;
  // [S670] 방향(상승비율)은 엣지 없음이 검증됨 → 서술 통계로 중립표기. 신뢰가능한 변동폭/리스크를 앞세움.
  const stats = `<div style="display:flex;gap:6px;margin-top:10px;padding:8px 4px;background:var(--surface2);border-radius:8px">
    ${statBox('변동폭', '±'+_band+'%', 'var(--text)')}
    ${statBox('하방리스크', r.min+'%', BLUE)}
    ${statBox('상승비율', r.upProb+'%', 'var(--text2)')}
  </div>
  <div style="text-align:center;font-size:9.5px;color:var(--text3);margin-top:4px">중앙 ${sgn(r.median)}${r.median}% · 상방 +${r.max}% · 80%구간 ${sgn(r.p10!=null?r.p10:r.min)}${r.p10!=null?r.p10:r.min}~${sgn(r.p90!=null?r.p90:r.max)}${r.p90!=null?r.p90:r.max}% · 이후 ${r.h}봉</div>
  <div style="text-align:center;font-size:8.5px;color:var(--text3);margin-top:2px">상승비율=유사패턴 중 상승한 비율(방향예측 아님) · 분포는 참고용</div>`;

  const cid = '_cpcv_' + Math.random().toString(36).slice(2,9);
  const _medFin = r.medPath[r.medPath.length-1];
  const canvas = `<canvas id="${cid}" style="width:100%;height:120px;display:block;margin:10px 0 2px"></canvas>
  <div style="display:flex;justify-content:center;gap:12px;font-size:8.5px;color:var(--text3);margin-bottom:8px">
    <span><span style="display:inline-block;width:10px;height:2px;background:#475569;vertical-align:middle"></span> 과거 ${r.win}봉</span>
    <span><span style="display:inline-block;width:10px;height:3px;background:${_medFin>=0?RED:BLUE};vertical-align:middle"></span> 예상 중앙값</span>
    <span><span style="display:inline-block;width:10px;height:2px;background:#cbd5e1;vertical-align:middle"></span> 유사패턴 ${r.n}개</span>
  </div>`;

  const maxPct = Math.max.apply(null, r.binsPct.concat([1]));
  const binRow = (i) => {
    const isPos=i<=2, bc=isPos?RED:BLUE, w=Math.round(r.binsPct[i]/maxPct*100);
    return `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
      <span style="width:58px;font-size:9px;color:var(--text2);text-align:right;flex-shrink:0">${r.binLabels[i]}</span>
      <div style="flex:1;height:9px;background:var(--surface2);border-radius:4px;overflow:hidden"><div style="width:${w}%;height:100%;background:${bc};opacity:${r.binsPct[i]?0.85:0}"></div></div>
      <span style="width:54px;font-size:9px;font-weight:700;color:${r.binsPct[i]?bc:'var(--text3)'};text-align:left;flex-shrink:0">${r.binsPct[i]}% <span style="font-size:8px;color:var(--text3);font-weight:600">${r.bins[i]}건</span></span>
    </div>`;
  };
  const dist = `<div style="margin-top:4px"><div style="font-size:9px;color:var(--text3);margin-bottom:3px">📊 ${r.h}봉 후 수익 분포</div>${[0,1,2,3,4,5].map(binRow).join('')}</div>`;

  const _matchTxt = (r.matchMode==='hybrid') ? '종가형태+셋업이' : '종가형태가';
  const note = `<div style="font-size:9px;color:var(--text3);margin-top:9px;border-top:1px solid var(--border);padding-top:6px;line-height:1.5">최근 ${r.win}봉 ${_matchTxt} 닮은 과거 ${r.n}개 구간의 이후 ${r.h}봉 분포 · 예측 아님 · BT/판정 미반영 · <b style="color:${rows.length>=400?'#16a34a':'#d97706'}">[기준 ${rows.length}봉]</b></div>`;

  // 오버레이 데이터 + 지연 렌더(캔버스 DOM 삽입 후 그리기 — _ctKnnHit 패턴과 동일)
  const liC = rows.length-1, anchor = (+rows[liC].close)||1;
  const qPct = [];
  for(let k=0;k<r.win;k++) qPct.push((+rows[liC-(r.win-1)+k].close)/anchor - 1);
  const paths = r.analogs.map(a=>a.path), medPath = r.medPath;
  if(typeof window!=='undefined'){ setTimeout(function(){ _cpDrawCanvas(cid, qPct, paths, medPath); }, 0); }

  return `<div id="sxCpCardWrap" style="margin:0 0 10px;padding:12px 14px;background:#fff;border:1px solid var(--border);border-radius:12px">${head}${_toggleRow}${stats}${canvas}${dist}${note}</div>`;
}
// [S663] 차트예측 레짐필터 토글 — 전역 상태 + 카드 부분 재렌더(전이카드 _ctRerenderCard 패턴)
function _cpRerenderCard(){ try{ var el=document.getElementById('sxCpCardWrap'); var L=window._sxCpLast; if(el&&L&&L.stock) el.outerHTML=_buildChartPredictCard(L.stock, L.indicators); }catch(_){} }
function _cpRegimeToggle(){ try{ window._sxCpRegimeOn=!window._sxCpRegimeOn; _cpRerenderCard(); }catch(_){} }
function _cpHybridToggle(){ try{ window._sxCpHybridOn=!window._sxCpHybridOn; _cpRerenderCard(); }catch(_){} }   // [S664]
if(typeof window!=='undefined'){ if(window._sxCpRegimeOn===undefined) window._sxCpRegimeOn=false; if(window._sxCpHybridOn===undefined) window._sxCpHybridOn=false; window._cpRegimeToggle=_cpRegimeToggle; window._cpHybridToggle=_cpHybridToggle; window._cpRerenderCard=_cpRerenderCard; }   // [S668] 레짐 기본 OFF(검증: 레짐ON=추세추종으로 균형정확도 하락 → 순수 형태가 정직한 기본)

// [S665] 워크포워드 백테스트 — 실행/오버레이/결과렌더
function _cpBtOverlay(inner){
  var ov=document.getElementById('sxCpBtOv');
  if(!ov){ ov=document.createElement('div'); ov.id='sxCpBtOv';
    ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 10px';
    ov.onclick=function(e){ if(e.target===ov) _cpCloseBacktest(); };
    document.body.appendChild(ov);
    // [S673] 안드로이드 뒤로가기로 닫기 — 열 때 히스토리 1개 push, 닫기는 중앙 popstate 핸들러(sx_screener.html)가 처리(앱 공통 패턴, 별도 리스너 금지=이중닫힘 방지)
    try{ history.pushState({view:'cpBtModal'},''); }catch(_){}
  }
  ov.innerHTML='<div style="background:#fff;border-radius:14px;max-width:520px;width:100%;padding:16px 16px 18px;box-shadow:0 12px 44px rgba(0,0,0,.32)">'+inner+'</div>';
}
function _cpCloseBacktest(){ try{ history.back(); }catch(_){ var ov=document.getElementById('sxCpBtOv'); if(ov) ov.remove(); } }   // [S673] history.back()→중앙 popstate 핸들러가 모달 제거. 실패 시 직접 제거.
function _cpRunBacktest(){
  try{
    var rows=window._sxCpRows;
    if(!rows||rows.length<60){ if(typeof alert==='function')alert('백테스트할 데이터가 부족해요(60봉+).'); return; }
    if(!(window.SXCP&&SXCP.backtest)){ if(typeof alert==='function')alert('모듈 미로드'); return; }
    _cpBtOverlay('<div style="text-align:center;padding:34px 10px;color:#475569;font-size:13px;font-weight:800">🧪 워크포워드 백테스트 계산 중…<div style="font-size:11px;color:#94a3b8;font-weight:500;margin-top:8px">'+rows.length+'봉 × 4모드 · 수 초 걸릴 수 있어요</div></div>');
    setTimeout(function(){ var bt; try{ bt=SXCP.backtest(rows); }catch(e){ bt={ok:false,reason:String((e&&e.message)||e)}; } _cpBtOverlay(_cpRenderBacktest(bt)); }, 40);
  }catch(_){ _cpCloseBacktest(); }
}
function _cpRenderBacktest(bt){
  var RED='#e3493b',BLUE='#2563eb',GRN='#16a34a',AMB='#f59e0b',T3='#94a3b8';
  var close='<div style="text-align:right;margin-top:14px"><span onclick="window._cpCloseBacktest&&_cpCloseBacktest()" style="display:inline-block;font-size:12px;font-weight:700;color:#475569;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:7px 18px;cursor:pointer">닫기</span></div>';
  if(!bt||!bt.ok){ return '<div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:8px">🧪 백테스트</div><div style="font-size:12px;color:#64748b;line-height:1.6">실행할 수 없어요'+(bt&&bt.reason?' ('+bt.reason+')':'')+'. 일봉 600봉처럼 이력이 충분한 상태에서 시도해줘.</div>'+close; }
  var b=bt.modes[bt.best];
  function bcol(v){ return v==null?T3:v>=56?GRN:v>=52?AMB:v>=48?'#64748b':RED; }
  function trap(m){ if(m.contAcc==null||m.revAcc==null) return '<span style="color:'+T3+'">—</span>';
    var warn=(m.contAcc-m.revAcc)>25;
    return '<span style="color:'+(m.contAcc>=55?GRN:'#64748b')+'">'+m.contAcc+'</span><span style="color:'+T3+'">→</span><span style="color:'+(m.revAcc>=45?'#64748b':RED)+'">'+m.revAcc+'</span>'+(warn?' <span style="color:'+RED+'">⚠️</span>':''); }
  var h='<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:3px"><span style="font-size:15px;font-weight:800;color:#0f172a">🧪 워크포워드 백테스트</span><span style="font-size:10px;color:'+T3+'">'+bt.nTests+'시점 · ['+bt.win+'→'+bt.h+'봉]</span></div>';
  h+='<div style="font-size:11px;color:#475569;margin-bottom:10px">기준선(항상 그 방향 찍기) 실제 상승률 <b>'+bt.baseRate+'%</b> · <b>균형 50%</b>=찍기 수준</div>';
  h+='<div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;padding:0 8px 3px;font-size:8.5px;color:'+T3+';font-weight:700"><span>모드</span><span style="text-align:right">균형정확도</span><span style="text-align:right">지속→전환</span></div>';
  bt.modes.forEach(function(m,i){ var st=i===bt.best;
    h+='<div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:6px 8px;border-radius:7px;'+(st?'background:#eff6ff':'')+'">'
      +'<span style="font-size:11px;font-weight:'+(st?800:600)+';color:#0f172a">'+(st?'★ ':'')+m.label+'</span>'
      +'<span style="font-size:12px;font-weight:800;color:'+bcol(m.balAcc)+';min-width:44px;text-align:right">'+(m.balAcc!=null?m.balAcc+'%':'—')+'</span>'
      +'<span style="font-size:10.5px;font-weight:700;min-width:62px;text-align:right">'+trap(m)+'</span></div>'; });
  h+='<div style="margin-top:11px;padding:10px 11px;background:#f8fafc;border-radius:9px;border:1px solid #eef2f7">';
  h+='<div style="font-size:11px;font-weight:800;color:#0f172a;margin-bottom:5px">★ 최고: '+b.label+'</div>';
  h+='<div style="font-size:10.5px;color:#475569;line-height:1.7">상승콜 <b>'+(b.upAcc!=null?b.upAcc+'%':'—')+'</b>('+b.upCalls+'건) · 하락콜 <b>'+(b.dnAcc!=null?b.dnAcc+'%':'—')+'</b>('+b.dnCalls+'건)<br>중앙값↔실제 상관 <b>r='+b.medCorr+'</b> · 평균오차 '+b.medMAE+'%p · 무승부 '+b.tie+'건 제외</div>';
  var cal=b.calib.filter(function(c){return c.n>0;});
  if(cal.length) h+='<div style="font-size:9px;color:'+T3+';margin-top:7px;line-height:1.6">캘리브레이션(예측상승확률→실제상승률): '+cal.map(function(c){ var col=(c.actUp!=null&&c.actUp>=c.lo)?GRN:'#64748b'; return '<span style="color:'+col+'">'+c.lo+'-'+c.hi+'%→'+(c.actUp!=null?c.actUp+'%':'-')+'('+c.n+')</span>'; }).join(' · ')+'</div>';
  h+='</div>';
  var bv=b.balAcc,verdict,vcol;
  if(bv==null){ verdict='결정 표본 부족'; vcol=T3; }
  else if(bv>=56){ verdict='균형 방향 스킬 있음 (찍기 대비 +'+(Math.round((bv-50)*10)/10)+'p)'; vcol=GRN; }
  else if(bv>=52){ verdict='약한 스킬 (찍기보다 약간 나음)'; vcol=AMB; }
  else if(bv>=48){ verdict='사실상 찍기 수준 — 방향 스킬 미약'; vcol='#64748b'; }
  else { verdict='역방향 경향 — 주의'; vcol=RED; }
  var maxGap=0,gm=null; bt.modes.forEach(function(m){ if(m.contAcc!=null&&m.revAcc!=null){ var g=m.contAcc-m.revAcc; if(g>maxGap){maxGap=g;gm=m;} } });
  h+='<div style="margin-top:10px;font-size:10.5px;line-height:1.65;color:#334155"><b style="color:'+vcol+'">['+verdict+']</b>';
  if(gm&&maxGap>25) h+=' <b>'+gm.label+'</b>은 지속 '+gm.contAcc+'% vs 전환 '+gm.revAcc+'% (격차 '+Math.round(maxGap)+'p) — <b style="color:'+RED+'">전형적 추세추종</b>(천장·바닥에서 정확히 틀림).';
  h+='</div>';
  h+='<div style="margin-top:9px;font-size:9px;color:'+T3+';line-height:1.6;border-top:1px solid #eef2f7;padding-top:7px">⚠️ 단일 종목 '+bt.nTests+'시점 — 노이즈 큼. 여러 종목 집계해야 신뢰 가능(배치 검증이 다음 단계).</div>';
  return h+close;
}
if(typeof window!=='undefined'){ window._cpRunBacktest=_cpRunBacktest; window._cpCloseBacktest=_cpCloseBacktest; window._cpRenderBacktest=_cpRenderBacktest; }

// [S667] 범용 신호 검증기 UI — SXVAL.runSuite 실행 + 결과(오버레이는 _cpBtOverlay 재사용)
// [S669] 신호검증 v2 — 호라이즌 스윕(1/5/10/20봉) + 기대값/페이오프(방향만 → 크기까지)
function _svRunSignalVal(){
  try{
    var rows=window._sxCpRows;
    if(!rows||rows.length<200){ if(typeof alert==='function')alert('호라이즌 스윕엔 데이터가 더 필요해요(200봉+).'); return; }
    if(!(window.SXVAL&&SXVAL.runHorizonSweep)){ if(typeof alert==='function')alert('SXVAL 미로드'); return; }
    _cpBtOverlay('<div style="text-align:center;padding:34px 10px;color:#475569;font-size:13px;font-weight:800">🔬 신호 검증 (호라이즌 스윕) 계산 중…<div style="font-size:11px;color:#94a3b8;font-weight:500;margin-top:8px">'+rows.length+'봉 · 5신호 × 4호라이즌 · LR 학습 포함이라 십여 초 걸릴 수 있어요</div></div>');
    setTimeout(function(){ var r; try{ r=SXVAL.runHorizonSweep(rows); }catch(e){ r={ok:false,reason:String((e&&e.message)||e)}; } _cpBtOverlay(_svRenderSignalVal(r)); }, 40);
  }catch(_){ _cpCloseBacktest(); }
}
function _svRenderSignalVal(r){
  var RED='#e3493b',GRN='#16a34a',AMB='#f59e0b',MUT='#64748b',T3='#94a3b8';
  var close='<div style="text-align:right;margin-top:14px"><span onclick="window._cpCloseBacktest&&_cpCloseBacktest()" style="display:inline-block;font-size:12px;font-weight:700;color:#475569;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:7px 18px;cursor:pointer">닫기</span></div>';
  if(!r||!r.ok){ return '<div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:8px">🔬 신호 검증 — 호라이즌 스윕</div><div style="font-size:12px;color:#64748b;line-height:1.6">실행할 수 없어요'+(r&&r.reason?' ('+r.reason+')':'')+'. 일봉 600봉처럼 이력이 충분할 때 시도해줘.</div>'+close; }
  var H=r.horizons, ncol=H.length;
  function bcol(v){ return v==null?T3:v>=55?GRN:v>=51?AMB:v>=48?MUT:RED; }
  function ecol(v){ return v==null?T3:v>0.05?GRN:v>0?'#65a30d':v>=-0.05?MUT:RED; }
  function hhead(){ return '<div style="display:grid;grid-template-columns:58px repeat('+ncol+',1fr);gap:3px;padding:0 2px 2px;font-size:8px;color:'+T3+';font-weight:700"><span></span>'+H.map(function(h){return '<span style="text-align:center">'+h+'봉</span>';}).join('')+'</div>'; }
  function matrix(pick,colfn,fmt,field){
    field=field||'byH'; var s='';
    r.signals.forEach(function(sig){
      s+='<div style="display:grid;grid-template-columns:58px repeat('+ncol+',1fr);gap:3px;align-items:center;padding:2.5px 2px">'
        +'<span style="font-size:9px;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+sig.label+'</span>'
        +(sig[field]||[]).map(function(m){ var v=m.ok?pick(m):null; return '<span style="text-align:center;font-size:9.5px;font-weight:800;color:'+colfn(v)+'">'+(v!=null?fmt(v):'—')+'</span>'; }).join('')+'</div>';
    });
    return s;
  }
  var h='<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:2px"><span style="font-size:14.5px;font-weight:800;color:#0f172a">🔬 신호 검증 — 호라이즌 스윕</span><span style="font-size:9.5px;color:'+T3+'">'+r.nPts+'시점</span></div>';
  h+='<div style="font-size:10px;color:#475569;margin-bottom:9px;line-height:1.5">종가→종가 H봉 수익 기준 · <b>균형 50%</b>=찍기 · <b>기대값</b>=신호대로 롱/숏 시 트레이드당 평균수익%</div>';
  h+='<div style="display:grid;grid-template-columns:58px repeat('+ncol+',1fr);gap:3px;align-items:center;padding:5px 2px;background:#f8fafc;border-radius:6px;margin-bottom:8px">'
    +'<span style="font-size:8.5px;font-weight:700;color:'+MUT+';line-height:1.15">드리프트<br>항상롱</span>'
    +r.drift.map(function(d){ return '<span style="text-align:center;font-size:9.5px;font-weight:700;color:'+(d==null?T3:d>0?'#0f766e':RED)+'">'+(d==null?'—':(d>0?'+':'')+d+'%')+'</span>'; }).join('')+'</div>';
  h+='<div style="display:grid;grid-template-columns:58px repeat('+ncol+',1fr);gap:3px;align-items:center;padding:4px 2px;background:#fff7ed;border-radius:6px;margin:-3px 0 9px"><span style="font-size:8.5px;font-weight:700;color:'+AMB+';line-height:1.15">드리프트<br>익일시가</span>'+(r.driftOpen||[]).map(function(d){ return '<span style="text-align:center;font-size:9.5px;font-weight:700;color:'+(d==null?T3:d>0?'#b45309':RED)+'">'+(d==null?'—':(d>0?'+':'')+d+'%')+'</span>'; }).join('')+'</div>';
  h+='<div style="font-size:9.5px;font-weight:800;color:#334155;margin:2px 0 1px">균형정확도 — 방향 맞히기(체결 무관)</div>'+hhead()+matrix(function(m){return m.balAcc;},bcol,function(v){return v+'';});
  h+='<div style="font-size:9.5px;font-weight:800;color:#334155;margin:9px 0 1px">방향 기대값 %/트레이드 — 종가체결(기준)</div>'+hhead()+matrix(function(m){return m.dirExp;},ecol,function(v){return (v>0?'+':'')+v;});
  h+='<div style="font-size:9.5px;font-weight:800;color:#b45309;margin:9px 0 1px">방향 기대값 %/트레이드 — 익일시가체결(실체결)</div>'+hhead()+matrix(function(m){return m.dirExp;},ecol,function(v){return (v>0?'+':'')+v;},'byHopen');
  var improved=[], bestCell={v:-1,sig:'—',h:0}, posExp=[], bestLE={v:-1e9,vo:null,sig:'—',h:0};
  r.signals.forEach(function(s){ var a=s.byH[0],z=s.byH[ncol-1];
    if(a.ok&&z.ok&&a.balAcc!=null&&z.balAcc!=null&&(z.balAcc-a.balAcc)>=3) improved.push(s.label+'('+a.balAcc+'→'+z.balAcc+')');
    var pe=0; s.byH.forEach(function(m,i){ if(m.ok&&m.balAcc!=null&&m.balAcc>bestCell.v){bestCell={v:m.balAcc,sig:s.label,h:H[i]};}
      if(m.ok&&m.dirExp!=null&&m.dirExp>0)pe++;
      if(m.ok&&m.longEdge!=null&&m.longEdge>bestLE.v){ var mo=s.byHopen&&s.byHopen[i]; bestLE={v:m.longEdge,vo:(mo&&mo.ok&&mo.longEdge!=null)?mo.longEdge:null,sig:s.label,h:H[i]}; } });
    if(pe>=Math.ceil(ncol*0.75)) posExp.push(s.label);
  });
  var horizonHelps=improved.length>0 || bestCell.v>=55;
  h+='<div style="margin-top:11px;font-size:10.5px;line-height:1.65;color:#334155">';
  if(horizonHelps){ h+='<b style="color:'+GRN+'">[호라이즌 효과 있음]</b> 최고 '+bestCell.sig+' '+bestCell.v+'%@'+bestCell.h+'봉.'+(improved.length?' 길수록 개선: '+improved.join(', ')+'.':'')+' 단기보다 추세 호라이즌에 방향정보가 있다는 신호.'; }
  else { h+='<b style="color:'+MUT+'">[호라이즌 효과 미미]</b> 호라이즌을 늘려도 방향정확도가 의미있게 안 올라(최고 '+bestCell.sig+' '+bestCell.v+'%@'+bestCell.h+'봉) — 방향은 호라이즌 무관하게 거의 효율적.'; }
  h+='</div>';
  h+='<div style="margin-top:6px;font-size:10px;line-height:1.6;color:#475569">';
  if(posExp.length && bestLE.v>0){ h+='<b style="color:#0f766e">기대값</b>: '+posExp.join('·')+' 방향 기대값 대체로 +. 최고 롱선택 엣지 '+(bestLE.v>0?'+':'')+bestLE.v+'%@'+bestLE.h+'봉('+bestLE.sig+' — 상승콜이 단순보유 대비). <b>진짜 테스트</b>: 이 엣지가 드리프트+비용을 넘느냐.'; }
  else { h+='<b>기대값</b>: 방향 기대값도 대부분 0근처/음수 — 크기로도 엣지 안 잡힘.'+(bestLE.v>0?' (최고 롱선택 엣지 +'+bestLE.v+'%@'+bestLE.h+'봉, '+bestLE.sig+')':''); }
  h+='</div>';
  h+='<div style="margin-top:7px;font-size:10px;line-height:1.6;color:#334155;background:#fff7ed;border-radius:6px;padding:7px 9px">';
  if(bestLE.v>-1e8 && bestLE.vo!=null){ var _dec=Math.round((bestLE.v-bestLE.vo)*100)/100, _surv=(bestLE.vo>0 && bestLE.vo>=bestLE.v*0.4);
    h+='<b style="color:'+(_surv?GRN:RED)+'">[실체결 엣지 감쇠]</b> '+bestLE.sig+' 롱선택 엣지 종가 '+(bestLE.v>0?'+':'')+bestLE.v+'% → 익일시가 '+(bestLE.vo>0?'+':'')+bestLE.vo+'% ('+(_dec>=0?'−':'+')+Math.abs(_dec)+'%p '+(_dec>=0?'감쇠':'개선')+'@'+bestLE.h+'봉). '+(_surv?'엣지 상당부분 생존 — 실체결 후보.':'익일시가 진입 시 엣지 대부분 소멸 — 종가 룩어헤드 효과였을 가능성.');
  } else { h+='<b style="color:'+MUT+'">[실체결 감쇠 판단보류]</b> 양의 롱선택 엣지 셀이 없어 종가↔익일시가 비교 생략.'; }
  h+='</div>';
  if(!r.knnReady||!r.lrReady) h+='<div style="margin-top:6px;font-size:9px;color:'+AMB+'">⚠️ '+(!r.knnReady?'kNN ':'')+(!r.lrReady?'LR ':'')+'모듈 미로드로 일부 신호 제외됨.</div>';
  h+='<div style="margin-top:9px;font-size:9px;color:'+T3+';line-height:1.6;border-top:1px solid #eef2f7;padding-top:7px">룩어헤드 0 · 신호 prob는 호라이즌 무관(1회 계산), 결과수익만 호라이즌별 · '+r.step+'봉 간격 표본 · kNN/LR은 다음봉 확률을 장기수익에 평가(h=1 native). <b>체결모델</b>: 종가=close[e](코인 현실·KRX 시간외종가 근사), 익일시가=open[e+1](미국·일반 익일진입) — 청산봉 동일, 차이=갭. ⚠️ 단일종목 '+r.nPts+'시점 — 노이즈 큼, 여러 종목 집계해야 신뢰.</div>';
  return h+close;
}
if(typeof window!=='undefined'){ window._svRunSignalVal=_svRunSignalVal; window._svRenderSignalVal=_svRenderSignalVal; }

// ════════ [S672] C 판정 검증 (SXVVAL) — 접기/펼치기, 기본접기, 펼칠 때 lazy 실행 ════════
function _buildVerdictValCard(stock, indicators){
  const rows = (indicators && indicators._advanced && Array.isArray(indicators._advanced.rows)) ? indicators._advanced.rows
             : (stock && Array.isArray(stock._lastAnalCandles)) ? stock._lastAnalCandles : null;
  if(!rows || rows.length < 200) return '';   // 워크포워드 검증엔 이력 필요(200봉+)
  const mkt = (stock && (stock._mkt || stock.market)) || (typeof currentMarket!=='undefined'?currentMarket:'kr');
  const tf  = (typeof _analTF!=='undefined' && _analTF) ? _analTF : (typeof currentTF!=='undefined'&&currentTF?currentTF:'day');
  try{ window._sxCVCtx = { rows:rows, tf:tf, market:mkt, name:(stock&&(stock.name||stock.code))||'' }; }catch(_e){}
  const cid = '_cvbody_' + Math.random().toString(36).slice(2,9);
  const header = `<div class="cv-toggle" onclick="_sxVib(8);window._cvToggle&&_cvToggle(this,'${cid}')" style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:800;color:var(--text)"><span class="cv-arrow" style="color:var(--accent)">▶</span><span style="display:inline-block;width:15px;height:15px;line-height:15px;text-align:center;border-radius:50%;background:#a855f7;color:#fff;font-size:9px;font-weight:800">C</span>🔬 C 판정 검증<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:var(--surface2);color:var(--text3);border:1px solid var(--border)">실험</span><span class="cv-hint" style="font-size:9px;color:var(--text3);font-weight:600;margin-left:auto">펼치기</span></div>`;
  const bodyDiv = `<div id="${cid}" style="display:none;margin-top:10px" data-loaded="0"></div>`;
  return `<div style="margin:8px 10px;padding:12px 14px;border-radius:12px;background:var(--surface);border:1px solid var(--border)">${header}${bodyDiv}</div>`;
}
function _cvToggle(el, cid){
  try{
    var body=document.getElementById(cid); if(!body) return;
    var open = body.style.display==='none';
    body.style.display = open ? 'block' : 'none';
    var arrow=el.querySelector('.cv-arrow'); if(arrow) arrow.textContent = open ? '▼' : '▶';
    var hint=el.querySelector('.cv-hint'); if(hint) hint.textContent = open ? '접기' : '펼치기';
    if(open && body.getAttribute('data-loaded')!=='1'){ body.setAttribute('data-loaded','1'); _cvRunValidation(cid); }
  }catch(_e){}
}
function _cvRunValidation(cid){
  var body=document.getElementById(cid); if(!body) return;
  var ctx=window._sxCVCtx;
  if(!ctx||!Array.isArray(ctx.rows)||ctx.rows.length<200){ body.innerHTML='<div style="font-size:11px;color:var(--text3)">검증엔 이력이 더 필요해요(200봉+).</div>'; return; }
  if(!(window.SXVVAL&&SXVVAL.run)){ body.innerHTML='<div style="font-size:11px;color:#f59e0b">SXVVAL 미로드</div>'; return; }
  if(!(typeof SXE!=='undefined'&&SXE&&SXE.scrQuickScore)||!(typeof SXC!=='undefined'&&SXC&&SXC.unifiedVerdictV2)){ body.innerHTML='<div style="font-size:11px;color:#f59e0b">분석/C 엔진 미로드</div>'; return; }   // [S673] SXE는 const 전역 → window.SXE는 undefined. bare 이름으로 확인.
  body.innerHTML='<div style="text-align:center;padding:20px 8px;color:#475569;font-size:12px;font-weight:800">🔬 C 판정 워크포워드 계산 중…<div style="font-size:10px;color:#94a3b8;font-weight:500;margin-top:6px">과거 ~80시점서 A점수+C판정 재계산 · 십여 초 걸릴 수 있어요</div></div>';
  setTimeout(function(){ var R; try{ R=SXVVAL.run(ctx.rows, ctx.tf, ctx.market); }catch(e){ R={ok:false,reason:String((e&&e.message)||e)}; } body.innerHTML=_cvRender(R); }, 50);
}
function _cvRender(R){
  var RED='#e3493b',BLUE='#2563eb',GRN='#16a34a',AMB='#f59e0b',MUT='#64748b',T3='var(--text3)';
  if(!R||!R.ok){ return '<div style="font-size:11px;color:var(--text3);line-height:1.6">검증 실행 불가'+(R&&R.reason?' ('+R.reason+')':'')+'. 일봉 600봉처럼 이력 충분할 때 펼쳐줘.</div>'; }
  var rc=function(v){ return v==null?MUT:v>0.3?GRN:v>0?'#65a30d':v>=-0.3?MUT:RED; };
  var sg=function(v){ return (v>0?'+':'')+v; };
  var h='<div style="font-size:10px;color:var(--text2);margin-bottom:8px;line-height:1.5">각 과거 봉에서 그 시점까지로 A점수+C판정 재계산(룩어헤드 0) → 이후 <b>'+R.h+'봉</b> 수익. 진입판정(비보유)이 결과를 가르나.</div>';
  h+='<div style="font-size:10px;color:'+MUT+';margin-bottom:8px">전체 드리프트 종가 <b>'+sg(R.drift.ret)+'%</b>'+(R.driftO?' · 익일시가 <b>'+sg(R.driftO.ret)+'%</b>':'')+' · 승률 '+R.drift.winRate+'% ('+R.nPts+'시점)</div>';
  // verdict별
  h+='<div style="font-size:10.5px;font-weight:800;color:var(--text);margin:2px 0 3px">판정별 이후 '+R.h+'봉 수익</div>';
  h+='<div style="display:grid;grid-template-columns:50px 1fr 1fr 1fr;gap:4px;padding:0 2px 2px;font-size:8px;color:'+T3+';font-weight:700"><span>판정</span><span style="text-align:right">종가</span><span style="text-align:right">익일시가</span><span style="text-align:right">최악</span></div>';
  R.byVerdict.forEach(function(v){ var s=v.stat, so=v.statO; if(!s.n)return;
    h+='<div style="display:grid;grid-template-columns:50px 1fr 1fr 1fr;gap:4px;align-items:center;padding:3px 2px;border-bottom:1px solid var(--border)">'
      +'<span style="font-size:10px;font-weight:800;color:var(--text)">'+v.action+'</span>'
      +'<span style="text-align:right;font-size:10.5px;font-weight:800;color:'+rc(s.ret)+'">'+sg(s.ret)+'%</span>'
      +'<span style="text-align:right;font-size:10.5px;font-weight:800;color:'+rc(so?so.ret:null)+'">'+(so?sg(so.ret)+'%':'—')+'</span>'
      +'<span style="text-align:right;font-size:10px;color:'+RED+'">'+s.worst+'%</span>'
      +'<span style="grid-column:1/-1;font-size:8px;color:'+T3+';text-align:right;margin-top:-2px">승률 '+s.winRate+'% · n='+s.n+'</span></div>'; });
  // passCount별 (간단)
  h+='<div style="font-size:10.5px;font-weight:800;color:var(--text);margin:9px 0 3px">4축 합격수(passCount)별</div>';
  h+='<div style="display:flex;gap:3px">';
  R.byPass.forEach(function(b){ var s=b.stat; var col=rc(s.n?s.ret:null);
    h+='<div style="flex:1;text-align:center;padding:5px 2px;background:var(--surface2);border-radius:6px">'
      +'<div style="font-size:8px;color:'+T3+'">'+b.pass+'축</div>'
      +'<div style="font-size:10px;font-weight:800;color:'+col+'">'+(s.n?sg(s.ret)+'%':'—')+'</div>'
      +'<div style="font-size:7.5px;color:'+T3+'">'+(s.n?s.winRate+'%·n'+s.n:'')+'</div></div>'; });
  h+='</div>';
  // [S674] 분기별 passCount — passCount는 max(반등,추세)라 4축이 두 셋업 섞임. 분리해 4축 딥 원인 진단.
  if(R.byPathPass){
    var _pathRow=function(label, arr){
      var row='<div style="display:flex;gap:3px;align-items:center;margin-top:3px"><span style="font-size:8.5px;font-weight:700;color:var(--text2);width:30px;flex-shrink:0">'+label+'</span>';
      for(var p=1;p<=4;p++){ var s=arr[p].stat, col=rc(s.n?s.ret:null);
        row+='<div style="flex:1;text-align:center;padding:3px 1px;background:var(--surface2);border-radius:5px"><div style="font-size:9px;font-weight:800;color:'+col+'">'+(s.n?sg(s.ret)+'%':'—')+'</div><div style="font-size:7px;color:'+T3+'">'+(s.n?'n'+s.n:'')+'</div></div>'; }
      return row+'</div>';
    };
    h+='<div style="font-size:9px;color:'+T3+';margin:7px 0 1px">↳ 분기별 (1·2·3·4축) — 경로마다 다른 축 사용</div>';
    h+=_pathRow('반등', R.byPathPass.rebound);
    h+=_pathRow('추세', R.byPathPass.trend);
  }
  // 안전캡
  var cap=R.safetyCap.capped, unc=R.safetyCap.uncapped;
  h+='<div style="font-size:10.5px;font-weight:800;color:var(--text);margin:9px 0 3px">🔒 안전캡 효과 (4축 진입급 中)</div>';
  h+='<div style="display:flex;gap:5px">'
    +'<div style="flex:1;padding:6px 7px;background:var(--surface2);border-radius:7px"><div style="font-size:8.5px;color:'+T3+'">위반→캡(막음)</div><div style="font-size:11px;font-weight:800;color:'+rc(cap.n?cap.ret:null)+'">'+(cap.n?sg(cap.ret)+'%':'—')+'</div><div style="font-size:8px;color:'+T3+'">'+(cap.n?'하락 '+cap.avgLoss+'%·n'+cap.n:'표본없음')+'</div></div>'
    +'<div style="flex:1;padding:6px 7px;background:var(--surface2);border-radius:7px"><div style="font-size:8.5px;color:'+T3+'">무위반→진입</div><div style="font-size:11px;font-weight:800;color:'+rc(unc.n?unc.ret:null)+'">'+(unc.n?sg(unc.ret)+'%':'—')+'</div><div style="font-size:8px;color:'+T3+'">'+(unc.n?'하락 '+unc.avgLoss+'%·n'+unc.n:'표본없음')+'</div></div></div>';
  // 자동 해석
  var byV={}, byVo={}; R.byVerdict.forEach(function(v){ byV[v.action]=v.stat; byVo[v.action]=v.statO; });
  function _wm(map,keys){ var s=0,nn=0; keys.forEach(function(a){ if(map[a]&&map[a].n){ s+=map[a].ret*map[a].n; nn+=map[a].n; } }); return nn?{r:Math.round(s/nn*100)/100,n:nn}:null; }
  function wm(keys){ return _wm(byV,keys); }
  var eM=wm(['매수','관심']), aM=wm(['관망','회피']);
  var eMo=_wm(byVo,['매수','관심']), aMo=_wm(byVo,['관망','회피']);
  h+='<div style="margin-top:10px;font-size:10px;line-height:1.6;color:var(--text2)">';
  if(eM&&aM){ var sep=Math.round((eM.r-aM.r)*100)/100;
    if(sep>1) h+='<b style="color:'+GRN+'">[등급이 결과를 가름]</b> 진입급(매수/관심) '+sg(eM.r)+'% vs 회피급(관망/회피) '+sg(aM.r)+'% (+'+sep+'p). C 등급에 변별력 있음.';
    else if(sep>-1) h+='<b style="color:'+MUT+'">[등급 변별력 미미]</b> 진입급 '+sg(eM.r)+'% ≈ 회피급 '+sg(aM.r)+'% ('+sg(sep)+'p) — 방향은 효율적이라 등급이 *수익방향*을 거의 못 가름.';
    else h+='<b style="color:'+RED+'">[등급 역전]</b> 진입급 '+sg(eM.r)+'% < 회피급 '+sg(aM.r)+'% ('+sg(sep)+'p) — 이 종목/기간선 역효과(노이즈 가능).';
  } else { h+='<b style="color:'+MUT+'">[진입 표본 부족]</b> 매수/관심 판정이 적어 변별력 판단 보류.'; }
  if(eM&&aM&&eMo&&aMo){ var _sepC=Math.round((eM.r-aM.r)*100)/100, _sepO=Math.round((eMo.r-aMo.r)*100)/100, _survO=_sepO>0.5;
    h+=' <b style="color:'+(_survO?GRN:RED)+'">[실체결 변별]</b> 익일시가 진입급 '+sg(eMo.r)+'% vs 회피급 '+sg(aMo.r)+'% ('+(_sepO>0?'+':'')+_sepO+'p · 종가 '+(_sepC>0?'+':'')+_sepC+'p). '+(_survO?'실체결서도 변별 유지.':'익일시가 진입 시 변별 거의 소멸 — 종가확정 룩어헤드 효과 가능성.');
  }
  if(cap.n>=5&&unc.n>=5){ var dd=Math.round((unc.ret-cap.ret)*100)/100;
    h+=' <b style="color:'+(dd>0.5?GRN:MUT)+'">[안전캡 '+(dd>0.5?'작동':'불명확')+']</b> 막은 셋업 '+sg(cap.ret)+'% vs 진입 셋업 '+sg(unc.ret)+'%'+(dd>0.5?' → 캡이 더 나쁜 진입을 회피.':' → 큰 차이 없음.');
  }
  h+='</div>';
  // [S674] 4축 딥 분기 진단 — 추세경로 4축이 과열 추격이라 낮은지
  if(R.byPathPass){
    var _t3=R.byPathPass.trend[3].stat, _t4=R.byPathPass.trend[4].stat, _r4=R.byPathPass.rebound[4].stat, _bits=[];
    if(_t4.n>=3 && _r4.n>=3) _bits.push('4축: 추세경로 '+sg(_t4.ret)+'%(n'+_t4.n+') vs 반등경로 '+sg(_r4.ret)+'%(n'+_r4.n+')');
    if(_t3.n>=3 && _t4.n>=3 && _t4.ret < _t3.ret-1) _bits.push('추세경로 4축<3축 → 과열 추격 가능성');
    if(_bits.length) h+='<div style="margin-top:6px;font-size:9.5px;line-height:1.55;color:var(--text2)"><b style="color:'+MUT+'">[분기 진단]</b> '+_bits.join(' · ')+'. 단일종목 표본 작음 → 집계서 확정.</div>';
  }
  // [S681] 점수 신뢰성(2분류) — 4축 점수 캘리브레이션
  if(R.scoreCalib && R.scoreCalib.length){
    h+='<div style="font-size:10.5px;font-weight:800;color:var(--text);margin:11px 0 2px">📊 점수 신뢰성 — 축별 캘리브레이션</div>';
    h+='<div style="font-size:9px;color:'+T3+';margin-bottom:4px;line-height:1.45">IC=점수↔이후'+R.h+'봉수익 순위상관(+면 고점수=고수익) · 고−저=상위⅓ vs 하위⅓ 평균수익. 종가/익일시가.</div>';
    h+='<div style="display:grid;grid-template-columns:50px 1fr 1fr 1fr 1fr;gap:3px;padding:0 2px 2px;font-size:8px;color:'+T3+';font-weight:700"><span>축</span><span style="text-align:right">IC종가</span><span style="text-align:right">IC익일</span><span style="text-align:right">고−저종가</span><span style="text-align:right">고−저익일</span></div>';
    var _icCol=function(v){ return v==null?MUT:v>0.15?GRN:v>0.05?'#65a30d':v>=-0.05?MUT:RED; };
    var _spCol=function(v){ return v==null?MUT:v>0.3?GRN:v>0?'#65a30d':v>=-0.3?MUT:RED; };
    var _icFmt=function(v){ return v==null?'—':(v>0?'+':'')+v.toFixed(2); };
    R.scoreCalib.forEach(function(a){
      h+='<div style="display:grid;grid-template-columns:50px 1fr 1fr 1fr 1fr;gap:3px;align-items:center;padding:3px 2px;border-bottom:1px solid var(--border)">'
        +'<span style="font-size:9.5px;font-weight:800;color:var(--text)">'+a.label+'</span>'
        +'<span style="text-align:right;font-size:10px;font-weight:800;color:'+_icCol(a.icC)+'">'+_icFmt(a.icC)+'</span>'
        +'<span style="text-align:right;font-size:10px;font-weight:800;color:'+_icCol(a.icO)+'">'+_icFmt(a.icO)+'</span>'
        +'<span style="text-align:right;font-size:9.5px;color:'+_spCol(a.hiLoC?a.hiLoC.spread:null)+'">'+(a.hiLoC?(a.hiLoC.spread>0?'+':'')+a.hiLoC.spread+'%':'—')+'</span>'
        +'<span style="text-align:right;font-size:9.5px;color:'+_spCol(a.hiLoO?a.hiLoO.spread:null)+'">'+(a.hiLoO?(a.hiLoO.spread>0?'+':'')+a.hiLoO.spread+'%':'—')+'</span></div>';
    });
    var _good=[], _weak=[], _inv=[];
    R.scoreCalib.forEach(function(a){ var ic=(a.icO!=null?a.icO:a.icC); if(ic==null)return; if(ic>0.1)_good.push(a.label); else if(ic<-0.1)_inv.push(a.label); else _weak.push(a.label); });
    h+='<div style="margin-top:6px;font-size:9.5px;line-height:1.55;color:var(--text2)">';
    if(_good.length) h+='<b style="color:'+GRN+'">[변별 있음]</b> '+_good.join('·')+' — 익일시가 IC>0.1, 고점수가 실제 고수익. ';
    if(_inv.length) h+='<b style="color:'+RED+'">[역전]</b> '+_inv.join('·')+' — 고점수가 오히려 저수익(노이즈/역신호 가능). ';
    if(_weak.length) h+='<b style="color:'+MUT+'">[약함]</b> '+_weak.join('·')+' — 점수레벨이 수익을 거의 못 가름. ';
    h+='⚠️ 단일종목 '+R.nPts+'시점 — IC 노이즈 큼, 집계해야 확정.</div>';
  }
  h+='<div style="margin-top:8px;font-size:8.5px;color:'+T3+';line-height:1.5;border-top:1px solid var(--border);padding-top:6px">진입판정(비보유) 기준 · 이후 '+R.h+'봉 · '+R.step+'봉 간격 '+R.nPts+'시점'+(R.errN?'·'+R.errN+'오류':'')+'. <b>체결</b>: 종가=close[t](코인·KRX시간외종가), 익일시가=open[t+1](미국·일반) — 청산봉 동일, 차이=갭. ⚠️ 단일종목 노이즈 큼 — 집계해야 신뢰. C 진짜 가치는 방향보다 하방.</div>';
  return h;
}
if(typeof window!=='undefined'){ window._cvToggle=_cvToggle; window._cvRunValidation=_cvRunValidation; window._cvRender=_cvRender; }

function _buildR1S1Card(stock, indicators){
  const _mkt = stock.market || stock._market || '';
  const isUS = (_mkt === 'US');
  const fmt = v => isUS ? '$' + (+v).toFixed(2) : Math.round(v).toLocaleString() + '원';
  const _pivot = indicators?.pivot || indicators?._advanced?.pivot || null;
  // [S476] price 기준 동적 저항/지지 (돌파 시 역할 전환 반영)
  const _px = stock.price ?? _pivot?.price ?? indicators?.price ?? null;  // [S476→실시간] 장중 현재가 우선(장마감 시 종가로 수렴 고정)
  const _ps = _pivotResSup(_pivot, _px);
  const _r1 = _ps.res ? Math.round(_ps.res.v) : null;
  const _s1 = _ps.sup ? Math.round(_ps.sup.v) : null;
  const _rk = _ps.res ? _ps.res.k : 'R1';
  const _sk = _ps.sup ? _ps.sup.k : 'S1';
  if(!_r1 && !_s1) return '';
  return `<div style="margin:0 0 8px;padding:8px 12px;background:#fff;border:1px solid var(--border);border-radius:10px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:11px;color:#f97316;font-weight:700">저항 ${_r1 ? fmt(_r1) : '—'}</span>
    <span style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.3px">${_rk} · ${_sk}</span>
    <span style="font-size:11px;color:#3b82f6;font-weight:700">지지 ${_s1 ? fmt(_s1) : '—'}</span>
  </div>`;
}

// [S293] A엔진 배너 중심부 — 진입가/목표가/손절가 표시
//   · [S358 deprecated] 호출 제거됨 — 엔진시뮬 카드(_buildSimPositionLine)와 정보 중복.
//     함수 본체는 롤백 대비 보존 (R1/S1은 _buildR1S1Card로 이미 분리)
//   · 매수/관심 상태에서만 수치 노출, 나머지는 상태 안내
//   · B(BT) 상태와 분리 — B는 하단 엔진판단검증 카드 영역으로 이동
function _buildAEntryLine(stock, svVerdict, indicators){
  const action = svVerdict?.action || '';
  const PURPLE = '#a855f7'; // 보라색 (차트 마커와 동일)
  const BOX_BASE = 'margin-top:6px;padding:6px 8px;border-radius:8px;border-left:3px solid ';
  const BOX_ACTIVE = BOX_BASE + PURPLE + ';background:#fff';
  const BOX_IDLE   = BOX_BASE + 'var(--border)' + ';background:#fff';

  // 코인(COIN) 포함 KRW는 모두 원화 표시, US만 달러
  const _mkt = stock.market || stock._market || '';
  const isUS = (_mkt === 'US');
  const fmt = v => isUS ? '$' + (+v).toFixed(2) : Math.round(v).toLocaleString() + '원';

  // 피봇 저항/지지 — isBuyGroup 여부 무관하게 항상 계산 [S476] price 기준 동적 선택(돌파 역할전환)
  const _pivot = indicators?.pivot || indicators?._advanced?.pivot || null;
  const _pxA = stock.price ?? _pivot?.price ?? indicators?.price ?? null;  // [S476→실시간] 현재가 우선
  const _psA = _pivotResSup(_pivot, _pxA);
  const _r1 = _psA.res ? Math.round(_psA.res.v) : null;
  const _s1 = _psA.sup ? Math.round(_psA.sup.v) : null;
  const _rkA = _psA.res ? _psA.res.k : 'R1';
  const _skA = _psA.sup ? _psA.sup.k : 'S1';
  const pivotRow = (_r1 || _s1) ? `
    <div style="display:flex;justify-content:space-between;margin-top:4px;padding:3px 4px;background:var(--surface2);border-radius:5px">
      <span style="font-size:9px;color:#f97316;font-weight:700">저항 ${_r1 ? fmt(_r1) : '—'}</span>
      <span style="font-size:9px;color:var(--text3)">${_rkA} · ${_skA}</span>
      <span style="font-size:9px;color:#3b82f6;font-weight:700">지지 ${_s1 ? fmt(_s1) : '—'}</span>
    </div>` : '';

  // [S357] BT 보유중(holding)이면 배너/C판정이 '매도 검토'여도 진입분석 동기화 노출
  //   · 기존: action 매수그룹일 때만 진입가 표시 → BT 보유중인데 배너가 매도검토면 "진입가 대기중"으로 강제 가려짐
  //   · 변경: _btState.state==='holding'(entry/tp/sl 보유)이면 action 무관하게 진입분석 활성화
  const _btSt = stock._btState;
  const isBtHolding = !!(_btSt && _btSt.state === 'holding' && _btSt.entry > 0 && _btSt.tp && _btSt.sl);
  const isBuyGroup = (action === '매수' || action === '관심' || action === '보유 유지') || isBtHolding;
  if(!isBuyGroup){
    return `<div style="${BOX_IDLE}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
        <span style="font-size:10px;font-weight:800;color:var(--text3)">📍 진입분석</span>
        <span style="font-size:11px;font-weight:700;color:var(--text3)">진입가 대기중..</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:6px">
        <div style="flex:1;text-align:center;padding:3px 4px;background:var(--surface2);border-radius:6px">
          <div style="font-size:9px;color:var(--text3);margin-bottom:1px">목표가</div>
          <div style="font-size:13px;font-weight:800;color:var(--text3)">—</div>
        </div>
        <div style="flex:1;text-align:center;padding:3px 4px;background:var(--surface2);border-radius:6px">
          <div style="font-size:9px;color:var(--text3);margin-bottom:1px">손절가</div>
          <div style="font-size:13px;font-weight:800;color:var(--text3)">—</div>
        </div>
      </div>${pivotRow}
    </div>`;
  }

  const calc = _calcAEntryTpSl(stock);
  if(!calc && !isBtHolding) return '';

  // [S357] BT 보유중이면 진입가/TP/SL 모두 BT 값으로 완전 동기화 (BT 단일검증 OPEN값과 일치)
  //   · isBtHolding은 위(게이트)에서 _btState.state==='holding' 기준으로 이미 산출
  const dispEp = isBtHolding ? _btSt.entry : calc.ep;
  const dispTp = isBtHolding ? _btSt.tp : calc.tp;
  const dispSl = isBtHolding ? _btSt.sl : calc.sl;

  const tpPct = (((dispTp - dispEp) / dispEp) * 100).toFixed(1);
  const slPct = (((dispSl - dispEp) / dispEp) * 100).toFixed(1);

  return `<div style="${BOX_ACTIVE}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span style="font-size:10px;font-weight:800;color:${PURPLE}">📍 진입분석</span>
      <span style="font-size:11px;font-weight:800;color:var(--text)">진입가 ${fmt(dispEp)}${isBtHolding ? ' <span style="font-size:7px;opacity:.7">BT</span>' : ''}</span>
    </div>
    <div style="display:flex;justify-content:space-between;gap:5px">
      <div style="flex:1;text-align:center;padding:3px 4px;background:rgba(34,197,94,0.08);border-radius:6px">
        <div style="font-size:9px;color:var(--text3);margin-bottom:1px">목표가${isBtHolding ? ' <span style="font-size:7px;opacity:.7">BT</span>' : ''}</div>
        <div style="font-size:11px;font-weight:800;color:#22c55e">${fmt(dispTp)}</div>
        <div style="font-size:9px;color:#22c55e">+${tpPct}%</div>
      </div>
      <div style="flex:1;text-align:center;padding:3px 4px;background:rgba(232,54,90,0.08);border-radius:6px">
        <div style="font-size:9px;color:var(--text3);margin-bottom:1px">손절가${isBtHolding ? ' <span style="font-size:7px;opacity:.7">BT</span>' : ''}</div>
        <div style="font-size:11px;font-weight:800;color:#e8365a">${fmt(dispSl)}</div>
        <div style="font-size:9px;color:#e8365a">${slPct}%</div>
      </div>
    </div>${pivotRow}
  </div>`;
}

// [S651] 캔들전이 kNN 사전준비 — 엔진판단 검증(_buildSimPositionLine)에서 캔들전이 카드의 kNN 결과를 보조 근거로 인용.
//   _buildTransitionCard가 stock._ctKnnPrep에 저장한 값을 재사용(같은 렌더 패스 내에서 먼저 실행되므로 재계산 없음).
//   kNN 비활성(룰 폴백·데이터 부족)이면 '' 반환 — 검증 안 된 근거를 노출하지 않음.
function _ctPrepLine(stock, ctxLabel){
  const p = stock && stock._ctKnnPrep;
  if(!p || typeof p.score !== 'number') return '';
  const isUp = p.score >= 30, isDn = p.score <= -30;
  const dirTxt = isUp ? '양봉 전이 유망' : isDn ? '음봉 전이 유망' : '중립';
  const dirClr = isUp ? '#e3493b' : isDn ? '#2563eb' : '#f59e0b';
  const sign = p.score > 0 ? '+' : '';
  return `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);font-size:10.5px;color:var(--text2)">🧪 ${ctxLabel} · <span style="font-weight:800;color:${dirClr}">${sign}${p.score}</span> ${dirTxt} · 닮은꼴 ${p.nUp}/${p.k}</div>`;
}
// [S657] LR 사전준비 — _ctPrepLine(kNN) 바로 아래 병렬 표시. _ctKnnPrep에 실린 rows/캐시키로
//   캔들전이 카드와 동일한 _ctLrRequestAsync를 호출 → 카드가 이미 계산 중이면 중복 학습 없이 같이 갱신됨.
function _ctPrepLrLine(stock, ctxLabel){
  const p = stock && stock._ctKnnPrep;
  if(!p || typeof p.score !== 'number' || !p._rows || !p._key) return '';
  const _slid = '_simlr_' + Math.random().toString(36).slice(2,9);
  const _req = (typeof _ctLrRequestAsync === 'function') ? _ctLrRequestAsync(p._rows, p._key, function(res){
    const el = document.getElementById(_slid); if(el) el.outerHTML = _ctPrepLrInline(res, p.score, ctxLabel);
  }) : { cached:false };
  return _req.cached
    ? _ctPrepLrInline(_req.res, p.score, ctxLabel)
    : `<div id="${_slid}" style="margin-top:3px;font-size:10px;color:var(--text3)">🤖 LR 측정 중…</div>`;
}
// [S659] 단기추세매매 크로스임박 LR 보조 — 기존 kNN D-day 예보(🔮, _trendBt 내부 동기 계산)와 별개의
//   독립 비동기 계산. 캔들전이용 _ctLrCache/_ctLrRequestAsync와 별도 캐시 사용(용도가 달라 — crossDday vs score,
//   회귀 위험 차단). BT 진입/청산 로직에는 영향 없음 — 순수 병렬 참고 배지.
var _trendLrCache = {};
var _trendLrPending = {};
function _trendLrRequestAsync(rows, key, opts, onReady){
  if(Object.prototype.hasOwnProperty.call(_trendLrCache, key)) return { cached:true, res:_trendLrCache[key] };
  if(!_trendLrPending[key]) _trendLrPending[key] = [];
  _trendLrPending[key].push(onReady);
  if(_trendLrPending[key].length === 1){
    setTimeout(function(){
      var res=null; try { res=(window.SXLR&&SXLR.crossDday)?SXLR.crossDday(rows,opts):null; } catch(_e){ res=null; }
      _trendLrCache[key]=res;
      var cbs=_trendLrPending[key]||[]; delete _trendLrPending[key];
      cbs.forEach(function(cb){ try{ cb(res); }catch(_e2){} });
    }, 80); // [S659] kNN D-day(동기, _trendBt 내부)는 이미 끝난 후 — 메인 렌더 막지 않게 약간 늦춤
  }
  return { cached:false };
}
function _trendLrBadgeInline(res){
  if(!res || !res.active) return '';
  const col = res.type==='dc' ? '#e8365a' : '#7c3aed';
  return `<span title="LR 학습 검증 — kNN D-day 예보와 별개 모델(병렬 참고용, BT 미적용)" style="margin-left:6px;font-size:10px;font-weight:800;color:${col};background:${col}1a;border:1px solid ${col}55;border-radius:12px;padding:3px 9px">🤖 LR ${res.type==='dc'?'데드':'골든'} D-${res.dday} · ${res.prob}%</span>`;
}
function _buildSimPositionLine(stock, btSt, svVerdict){

  // 스타일 공통 (배너 본문과 동일 디자인 언어)
  // [S293] BT 상태별 테두리 색상: holding/buy_signal=녹색, sell_signal=빨강, waiting=파랑, no_data=회색
  const _simBorderClr = (!btSt || btSt.state === 'no_data') ? 'var(--text3)'
    : (btSt.state === 'holding') ? '#22c55e'
    : (btSt.state === 'sell_signal') ? '#e8365a'
    : (btSt.state === 'waiting') ? '#3b82f6'
    : 'var(--text3)';
  const BOX_STYLE = 'margin-top:8px;padding:8px 10px;background:#fff;border-radius:8px;border-left:3px solid ' + _simBorderClr;
  const TITLE_STYLE = 'font-size:11px;color:var(--text2);font-weight:700;margin-bottom:4px;letter-spacing:-.3px';
  const MAIN_STYLE = 'font-size:12px;color:var(--text);font-weight:700;line-height:1.5';
  const SUB_STYLE = 'font-size:10.5px;color:var(--text2);line-height:1.5;margin-top:2px';
  const ACCENT_STYLE_BUY = 'color:var(--buy);font-weight:800';
  const ACCENT_STYLE_SELL = 'color:var(--sell);font-weight:800';

  // ── no_data: BT 미실행 (엔진시뮬 트레이더 자체가 없음) ──
  if(!btSt || btSt.state === 'no_data'){
    return `<div style="${BOX_STYLE}">
      <div style="${TITLE_STYLE}">📊 엔진시뮬 상태</div>
      <div style="${MAIN_STYLE}">엔진시뮬 미실행</div>
      <div style="${SUB_STYLE}">BT 백테스트 실행 시 엔진시뮬 포지션 활성화</div>
    </div>`;
  }

  // ── holding + _isBuySignal=true: 방금 매수 신호 (엔진시뮬 진입 순간) ──
  if(btSt.state === 'holding' && btSt._isBuySignal){
    // [v2.0] 최종 C 판정이 '매수'가 아니면 ▲ 매수 UI 가림
    //   (BT 내부 로직은 그대로 진행, 배너 본문만 "포지션 취소"로 대체)
    //   원칙: 배너 상단 라벨과 본문 일치 — 최종 판정이 매수일 때만 ▲ 신호 본문 노출
    //   - 관심:  점수 일부 부족 / 모멘텀 승급으로 관심까지만 올라옴 → 본문 가림
    //   - 관망:  점수 더 부족  → 본문 가림
    //   - 회피:  진입 부적합  → 본문 가림
    //   v1.x 강등 분기('[강등]' 마커)는 v2.0에서 폐기 — 모멘텀 보정으로 대체
    const _vAct = svVerdict?.action || '';
    if(_vAct === '회피' || _vAct === '관망' || _vAct === '관심'){
      const _titleByAct = _vAct === '회피' ? '엔진시뮬 회피'
                        : _vAct === '관망' ? '엔진시뮬 관찰'
                        : '엔진시뮬 관심';
      const _subByAct = _vAct === '회피' ? 'BT 검증 확인 · 함정 주의 · 진입 신중'
                      : _vAct === '관망' ? 'BT 검증 확인 · 모멘텀 약화 · 진입 보류'
                      : 'BT 검증 확인 · 점수 일부 부족 · 매수 대기';
      return `<div style="${BOX_STYLE}">
        <div style="${TITLE_STYLE}">📊 ${_titleByAct}</div>
        <div style="${MAIN_STYLE}">현재 엔진시뮬 포지션 취소</div>
        <div style="${SUB_STYLE}">${_subByAct}</div>
      </div>`;
    }
    const entry = btSt.entry || 0;
    const entryStr = entry > 0 ? Math.round(entry).toLocaleString() + '원' : '—';
    const tpStr = btSt.tp ? Math.round(btSt.tp).toLocaleString() : '';
    const slStr = btSt.sl ? Math.round(btSt.sl).toLocaleString() : '';
    let tpslLine = '';
    if(tpStr && slStr){
      tpslLine = `<div style="${SUB_STYLE}">목표 ${tpStr} / 손절 ${slStr} <span style="color:var(--text3)">(예정)</span></div>`;
    }
    return `<div style="${BOX_STYLE}">
      <div style="${TITLE_STYLE}">📊 엔진시뮬 신호포착</div>
      <div style="${MAIN_STYLE}"><span style="${ACCENT_STYLE_BUY}">▲ 매수 신호 방금 발생</span></div>
      <div style="${SUB_STYLE}">제안 진입가: ${entryStr}</div>
      ${tpslLine}
      ${_ctPrepLine(stock, '진입 시점 패턴 신뢰도')}
      ${_ctPrepLrLine(stock, '진입 시점 패턴 신뢰도')}
    </div>`;
  }

  // ── holding + _isBuySignal=false: 엔진시뮬 보유중 (▲ 있고 ▼ 없음, 2봉 초과) ──
  if(btSt.state === 'holding'){
    // [v2.0] 보유중인데 C가 회피/관망인 엇갈림 상황 — 간결 통일
    const _vActHold = svVerdict?.action || '';
    if(_vActHold === '회피' || _vActHold === '관망'){
      const _titleH = _vActHold === '회피' ? '엔진시뮬 회피' : '엔진시뮬 관찰';
      const _subH = _vActHold === '회피'
        ? 'BT 검증 확인 · 함정 주의 · 진입 신중'
        : 'BT 검증 확인 · 모멘텀 약화 · 진입 보류';
      return `<div style="${BOX_STYLE}">
        <div style="${TITLE_STYLE}">📊 ${_titleH}</div>
        <div style="${MAIN_STYLE}">현재 엔진시뮬 포지션 취소</div>
        <div style="${SUB_STYLE}">${_subH}</div>
      </div>`;
    }
    const entry = btSt.entry || 0;
    const pnl = typeof btSt.pnl === 'number' ? btSt.pnl : 0;
    const isPlus = pnl >= 0;
    const pnlColor = isPlus ? 'var(--buy)' : 'var(--sell)';
    const pnlStr = (isPlus ? '+' : '') + pnl.toFixed(1) + '%';
    const entryStr = entry > 0 ? Math.round(entry).toLocaleString() + '원' : '—';

    // 진입 날짜 포맷 (예: "2026-04-06" → "4/6")
    let dateStr = '';
    if(btSt.entryDate){
      const raw = String(btSt.entryDate);
      const m = raw.match(/(\d{4})-?(\d{2})-?(\d{2})/);
      if(m){
        dateStr = parseInt(m[2], 10) + '/' + parseInt(m[3], 10);
      }
    }

    // 보유 일수 계산 (entryDate 우선, entryIdx fallback)
    let holdText = '';
    if(btSt.entryDate){
      try{
        const entryDt = new Date(btSt.entryDate);
        const diffMs = Date.now() - entryDt.getTime();
        const diffDays = Math.floor(diffMs / 86400000);
        if(diffDays >= 0 && diffDays < 3650){
          holdText = diffDays + '일차';
        }
      }catch(e){}
    }
    if(!holdText && btSt.entryIdx != null && btSt.totalBars){
      const bars = btSt.totalBars - btSt.entryIdx;
      if(bars > 0) holdText = bars + '봉';
    }

    // TP/SL 라인 (BT 기준 = 엔진시뮬 포지션의 실제 목표/손절)
    let tpslLine = '';
    if(btSt.tp && btSt.sl){
      tpslLine = `<div style="${SUB_STYLE}">목표 ${Math.round(btSt.tp).toLocaleString()} / 손절 ${Math.round(btSt.sl).toLocaleString()}</div>`;
    }

    // [FIX-2] 회피 케이스는 분기 상단에서 이미 early return 처리됨
    //   → 여기 도달 시점은 회피가 아닌 정상 보유중 상태

    // [v2.0] partialHint 배지 — TP/SL 70% 도달 시 양방향 활성 (4축 무관)
    //   '부분 익절 고려' (TP 근접) / '부분 손절 고려' (SL 근접) / '추가 매수 고려' (A 관심/매수)
    let partialBadge = '';
    if(svVerdict?.partialHint){
      const isProfit = svVerdict.partialHint.indexOf('익절') >= 0;
      const isAddBuy = svVerdict.partialHint.indexOf('추가 매수') >= 0;
      const badgeColor = isAddBuy ? '#3b82f6' : isProfit ? 'var(--buy)' : 'var(--sell)';
      const badgeBg    = isAddBuy ? 'rgba(59,130,246,0.15)' : isProfit ? 'rgba(34,197,94,0.15)' : 'rgba(232,54,90,0.15)';
      // [S430] 토스트 폐지 — 과열 사유(partialReason)는 줄(reasonLine)에 합쳐 항상 노출. 배지는 클릭 없는 표기만.
      partialBadge = `<span style="display:inline-block;margin-left:6px;padding:2px 7px;font-size:10px;font-weight:700;color:${badgeColor};background:${badgeBg};border:1px solid ${badgeColor};border-radius:10px;letter-spacing:-.2px;vertical-align:middle">${svVerdict.partialHint}</span>`;
    }

    // [S359] 엔진시뮬 보유중 행동 사유 — svVerdict.action을 매도 표기로 흡수 (배너 통일)
    //   회피/관망은 위에서 early return → 여기 도달 시 보유유지/청산준비/청산검토/즉시청산
    //   '청산'→'매도' 치환, 색은 svVerdict.color(배너/하단버튼과 동일 소스). 계산 변경 없음(A안).
    let reasonBadge = '', reasonLine = '';
    {
      const _actHold = svVerdict?.action || '';
      if(_actHold){
        const _actLabel = _actHold.replace('청산', '매도'); // 청산 검토→매도 검토, 즉시 청산→즉시 매도
        const _actClr = svVerdict.color || 'var(--text3)';
        const _reasonMap = {
          '보유 유지': '지표 양호 · 추세 유지',
          '청산 준비': '지표 둔화 시작',
          '청산 검토': '반등 약화 · 익절/손절 고려',
          '즉시 청산': '전반 약세 · 정리 권고'
        };
        // [S430] (4축 N/4) 제거 — 어느 축이 합격인지 명시 안 돼 혼란. 줄은 종합 행동 방향만.
        let _reasonTxt = _reasonMap[_actHold] || '';
        // [S430] 토스트 폐지 — 배지는 클릭 없는 표기만 (ⓘ/onclick 제거).
        reasonBadge = `<span style="display:inline-block;margin-left:6px;padding:2px 8px;font-size:10px;font-weight:800;color:${_actClr};background:${_actClr}1A;border:1px solid ${_actClr};border-radius:10px;letter-spacing:-.2px;vertical-align:middle">${_actLabel}</span>`;
        // [S430] 과열 사유(partialReason)를 줄에 합쳐 항상 노출(토스트 대체). 부분익절일 때 결정 지표(🔒…)가 줄에 표시됨.
        const _pr = svVerdict.partialReason || '';
        let _lineTxt = _reasonTxt;
        if(_pr) _lineTxt = _lineTxt ? `${_lineTxt} · ${_pr}` : _pr;
        if(_lineTxt) reasonLine = `<div style="${SUB_STYLE};color:${_actClr}">└ ${_lineTxt}</div>`;
      }
    }

    // [S429] 배지 통합 — reasonBadge(보유유지)+partialBadge(부분익절)를 단일 statusBadge로.
    //   우선순위: 청산 계열(매도 신호) > 부분 익절/손절·추가매수 > 보유중(평시).
    //   · 청산 계열은 매도 경고라 부분익절보다 위에 둬 가려지지 않게 보존.
    //   · 평시(보유 유지 + 힌트 없음)는 '보유중' 단일 배지. 라벨은 '엔진시뮬'로 줄여 중복 제거.
    let statusBadge;
    const _curActB = svVerdict?.action || '';
    if(_curActB === '청산 준비' || _curActB === '청산 검토' || _curActB === '즉시 청산'){
      statusBadge = reasonBadge;            // 매도 신호 최우선
    } else if(partialBadge){
      statusBadge = partialBadge;           // 부분 익절/손절/추가 매수 고려 (사유는 줄에 표시)
    } else {
      const _hcClr = svVerdict?.color || 'var(--buy)';  // 보유 유지 색 재활용
      // [S430] 토스트 폐지 — 보유중 배지도 클릭 없는 표기만. 사유는 줄(reasonLine)에 항상 노출.
      statusBadge = `<span style="display:inline-block;margin-left:6px;padding:2px 8px;font-size:10px;font-weight:800;color:${_hcClr};background:${_hcClr}1A;border:1px solid ${_hcClr};border-radius:10px;letter-spacing:-.2px;vertical-align:middle">보유중</span>`;
    }

    return `<div style="${BOX_STYLE}">
      <div style="${TITLE_STYLE}">📊 엔진시뮬${statusBadge}</div>
      <div style="${MAIN_STYLE}"><span style="${ACCENT_STYLE_BUY}">▲${dateStr ? ' ' + dateStr : ''} 진입</span> @ ${entryStr}</div>
      <div style="${SUB_STYLE}">현재 <span style="color:${pnlColor};font-weight:800">${pnlStr}</span>${holdText ? ' · 보유 ' + holdText : ''}</div>
      ${tpslLine}
      ${reasonLine}
      ${_ctPrepLine(stock, '보유중 패턴 모니터링')}
      ${_ctPrepLrLine(stock, '보유중 패턴 모니터링')}
    </div>`;
  }

  // ── sell_signal: 엔진시뮬 매도 완료 (▼ 발생, 2봉 이내) ──
  if(btSt.state === 'sell_signal'){
    const pnl = typeof btSt.pnl === 'number' ? btSt.pnl : 0;
    const isWin = !!btSt.isWin;
    const pnlColor = isWin ? 'var(--buy)' : 'var(--sell)';
    const pnlStr = (pnl >= 0 ? '+' : '') + pnl.toFixed(1) + '%';
    const label = isWin ? '익절' : '손절';
    const exitStr = btSt.exitPrice ? Math.round(btSt.exitPrice).toLocaleString() + '원' : '';
    let dateStr = '';
    if(btSt.exitDate){
      const m = String(btSt.exitDate).match(/(\d{4})-?(\d{2})-?(\d{2})/);
      if(m) dateStr = parseInt(m[2], 10) + '/' + parseInt(m[3], 10);
    }
    const mainText = `<span style="${isWin ? ACCENT_STYLE_BUY : ACCENT_STYLE_SELL}">▼${dateStr ? ' ' + dateStr : ''} 매도</span>${exitStr ? ' @ ' + exitStr : ''}`;
    const subText = `<span style="color:${pnlColor};font-weight:800">${label} ${pnlStr}</span> · 다음 신호 대기 중`;

    // [v1.6] partialHint 배지 — 매도 완료 회고 (A긍정 → "다음엔 일부 남기는 전략")
    let partialBadge = '';
    if(svVerdict?.partialHint){
      const isProfit = svVerdict.partialHint.indexOf('익절') >= 0;
      const isAddBuy = svVerdict.partialHint.indexOf('추가 매수') >= 0;
      const badgeColor = isAddBuy ? '#3b82f6' : isProfit ? 'var(--buy)' : 'var(--sell)';
      const badgeBg    = isAddBuy ? 'rgba(59,130,246,0.15)' : isProfit ? 'rgba(34,197,94,0.15)' : 'rgba(232,54,90,0.15)';
      partialBadge = `<span style="display:inline-block;margin-left:6px;padding:2px 7px;font-size:10px;font-weight:700;color:${badgeColor};background:${badgeBg};border:1px solid ${badgeColor};border-radius:10px;letter-spacing:-.2px;vertical-align:middle">${svVerdict.partialHint}</span>`;
    }

    return `<div style="${BOX_STYLE}">
      <div style="${TITLE_STYLE}">📊 엔진시뮬 완결${partialBadge}</div>
      <div style="${MAIN_STYLE}">${mainText}</div>
      <div style="${SUB_STYLE}">${subText}</div>
    </div>`;
  }

  // ── waiting: 비보유 상태 (C 판정에 따라 관찰 모드 or 회피 모드) ──
  if(btSt.state === 'waiting'){
    const verdictAction = svVerdict?.action || '';

    // 회피 계열: 엔진시뮬이 "진입 안 함" 명시
    if(verdictAction === '회피'){
      return `<div style="${BOX_STYLE}">
        <div style="${TITLE_STYLE}">📊 엔진시뮬 상태</div>
        <div style="${MAIN_STYLE}">엔진시뮬 포지션 없음</div>
        <div style="${SUB_STYLE}">이 종목은 현재 진입 부적합 · 다른 종목 탐색 권장</div>
      </div>`;
    }

    // 관심 계열: BT 검증 성공, 매수 타이밍 대기
    if(verdictAction === '관심'){
      return `<div style="${BOX_STYLE}">
        <div style="${TITLE_STYLE}">📊 엔진시뮬 관찰</div>
        <div style="${MAIN_STYLE}">현재 엔진시뮬 포지션 없음</div>
        <div style="${SUB_STYLE}">BT 검증 성공 · 매수 타이밍 대기 중</div>
        ${_ctPrepLine(stock, '진입 타이밍 패턴 체크')}
        ${_ctPrepLrLine(stock, '진입 타이밍 패턴 체크')}
      </div>`;
    }

    // 관망 계열: 분석만 좋고 BT 미검증 — [S434] 보류 표현 '진입보류'로 통일. 안전필터 강등(capReason) 시 사유 노출.
    if(verdictAction === '관망'){
      const _capR = (svVerdict && svVerdict.capReason) ? String(svVerdict.capReason) : '';
      const _subTxt = _capR ? `🔒 안전필터감지 · ${_capR.replace(/🔒/g, '')}` : 'BT 미검증 · 함정 주의 · 진입 신중';
      return `<div style="${BOX_STYLE}">
        <div style="${TITLE_STYLE}">📊 엔진시뮬 진입보류</div>
        <div style="${MAIN_STYLE}">현재 엔진시뮬 포지션 없음</div>
        <div style="${SUB_STYLE}">${_subTxt}</div>
        ${_ctPrepLine(stock, '패턴 참고 (BT 미검증)')}
        ${_ctPrepLrLine(stock, '패턴 참고 (BT 미검증)')}
      </div>`;
    }

    // 그 외 (기본 waiting)
    return `<div style="${BOX_STYLE}">
      <div style="${TITLE_STYLE}">📊 엔진시뮬 상태</div>
      <div style="${MAIN_STYLE}">엔진시뮬 포지션 없음</div>
      <div style="${SUB_STYLE}">매수 신호 대기 중</div>
      ${_ctPrepLine(stock, '진입 타이밍 패턴 체크')}
      ${_ctPrepLrLine(stock, '진입 타이밍 패턴 체크')}
    </div>`;
  }

  // fallback (이론상 도달 불가)
  return '';
}

// ═══════════════════════════════════════════════════════════════
// S114: 엔진판단 검증 실행 함수 (_runEngineVerify)
//   역할: 분석탭의 "엔진판단 검증" 버튼 클릭 시 단일검증 [▶ 백테스트 실행]과 동일한 동작 수행
//   흐름:
//     1. 사용자가 분석탭에서 "엔진판단 검증 ▶" 클릭
//     2. 내부적으로 단일검증 탭 활성화 (btRunBasic이 단일검증 탭 DOM 요소 참조)
//     3. btRunBasic() 호출 → sx_bt.js 경로 B로 400→600봉 확장 + BT 재실행
//     4. btRunBasic 완료 시 stock._needsAnalRerender = true (S112-fix2 기존 로직)
//     5. switchAnalTab(원래 탭) 복귀 → 분석탭 자동 재렌더 (결과 카드 갱신)
//
//   주의:
//     - 미국 시장은 이미 range=2y로 500봉+ 확보 → btRunBasic 경로 B에서 확장 없이 BT만 재실행
//     - 한국/코인은 400봉 → +200봉 확장 후 BT 재실행 (경로 B 자동 처리)
//     - 단일검증 탭 [▶ 백테스트 실행] 버튼은 그대로 유지 (옵션 조정 후 재실행 가능)
//
//   프로젝트 C v3.0 원칙:
//     - 원칙 ⑤ "정합 우선": 분석탭과 단일검증이 같은 BT 결과 공유 (양방향 동기화)
//     - 원칙 ⑧ "검증가능성": 엔진판단 근거가 실제 BT 결과로 검증됨
// ═══════════════════════════════════════════════════════════════
async function _runEngineVerify(stock){
  if(!stock){
    console.warn('[S115/_runEngineVerify] stock 없음');
    return;
  }
  if(stock._engineVerifyRunning){
    console.log('[S115/_runEngineVerify] 이미 실행 중 — 중복 호출 무시');
    return;
  }
  console.log(`[S115/_runEngineVerify] 엔진판단 검증 시작 (백그라운드): ${stock.name||stock.code}`);
  stock._engineVerifyRunning = true;

  // 진행 토스트 (탭 전환 없음 — 현재 분석탭 유지)
  if(typeof toast === 'function') toast('⏳ 엔진판단 검증 실행 중...');

  try {
    // ─── 의존성 체크 ───
    if(typeof sxRunBtEngine !== 'function'){
      console.error('[S115] sxRunBtEngine 함수 없음');
      if(typeof toast === 'function') toast('❌ BT 엔진 미로드');
      return;
    }
    if(typeof btFetchCandles !== 'function'){
      console.error('[S115] btFetchCandles 함수 없음');
      if(typeof toast === 'function') toast('❌ 캔들 fetch 함수 미로드');
      return;
    }

    // ─── TF / 시장 판별 (sx_bt.js _btTF/_btIsCoin와 동일 로직) ───
    const _tf = (typeof _analTF !== 'undefined' && _analTF) ? _analTF : (typeof currentTF !== 'undefined' ? currentTF : 'day');
    const _isCoin = (typeof currentMarket !== 'undefined') && currentMarket === 'coin';
    // [S168 600봉 통일] 미국(us) 시장 추가 — fetchCandlesExtended가 period1/period2 분할 호출 지원
    // [S218] sx_bt.js의 _btTargetBars 헬퍼 활용 — KIS ON 시 700봉 (분석탭/BT 정합)
    const _isExtSupported = (typeof currentMarket !== 'undefined') && (currentMarket === 'coin' || currentMarket === 'kr' || currentMarket === 'us');
    const _targetCount = (typeof _btTargetBars === 'function')
      ? _btTargetBars(currentMarket, _tf)
      : ((_tf === 'week' || _tf === 'month') ? 400 : 600); // fallback

    let rows = null;

    // ─── 경로 A: _lastAnalCandles가 이미 목표 봉수 충족 (재사용) ───
    if(_isExtSupported && stock._lastAnalCandles && stock._lastAnalCandles.length >= _targetCount){
      // [S228] 무결성 재검증 — 비정상 봉 자동 제거
      const _src = stock._lastAnalCandles;
      const _validated = (typeof _sxIsValidCandle === 'function') ? _src.filter(_sxIsValidCandle) : _src;
      if(_validated.length !== _src.length){
        console.warn(`[S228] [S115 경로 A] _lastAnalCandles 검증: ${_src.length}봉 → ${_validated.length}봉`);
        stock._lastAnalCandles = _validated;
      }
      rows = _validated.slice(-_targetCount);
      console.log(`[S115] 경로 A — 캐시 재사용: ${rows.length}봉`);
    }
    // ─── 경로 B: 부분 캐시(400봉) + 확장 가능 → +200봉 확장 ───
    else if(_isExtSupported && stock._lastAnalCandles && stock._lastAnalCandles.length >= 200 && typeof fetchCandlesExtended === 'function'){
      // [S228] 무결성 재검증 — 비정상 봉 자동 제거
      const _src = stock._lastAnalCandles;
      const _validated = (typeof _sxIsValidCandle === 'function') ? _src.filter(_sxIsValidCandle) : _src;
      if(_validated.length !== _src.length){
        console.warn(`[S228] [S115 경로 B] _lastAnalCandles 검증: ${_src.length}봉 → ${_validated.length}봉`);
        stock._lastAnalCandles = _validated;
      }
      const _existing = _validated.slice();
      const _needed = _targetCount - _existing.length;
      if(_needed > 0){
        try{
          console.log(`[S115] 경로 B — ${_existing.length}봉 → ${_targetCount}봉 확장 (2초 대기)`);
          await new Promise(r => setTimeout(r, 2000));
          const _oldestDate = _existing[0].date;
          const _extra = await fetchCandlesExtended(stock.code, _tf, _oldestDate, _needed);
          if(_extra && _extra.length > 0){
            rows = [..._extra, ..._existing];
            console.log(`[S115] 경로 B 완료: ${_extra.length} + ${_existing.length} = ${rows.length}봉`);
          } else {
            console.warn('[S115] 경로 B 확장 실패 — 기존 봉수로 실행');
            rows = _existing;
          }
        }catch(e){
          console.warn('[S115] 경로 B 확장 예외:', e);
          rows = _existing;
        }
      } else {
        rows = _existing;
      }
      // 확장 결과 _lastAnalCandles 동기화 (S112-fix1 양방향 공유 원칙)
      if(rows && rows.length > _existing.length){
        stock._lastAnalCandles = rows.slice();
        if(rows.length >= 600) stock._analCandlesExtendedStage = 2;
        else if(rows.length >= 400) stock._analCandlesExtendedStage = 1;
      }
    }
    // ─── 경로 C: 캐시 없음 + 시장 지원 → 200봉부터 3단계 확장 ───
    else if(_isExtSupported && typeof fetchCandlesExtended === 'function'){
      console.log(`[S115] 경로 C — 새 3단계 확장 시작 (목표 ${_targetCount}봉)`);
      const _first = await btFetchCandles(stock.code, _isCoin, _tf, 200);
      if(!_first || _first.length === 0){
        throw new Error('초기 200봉 로드 실패');
      }
      rows = _first;
      // 2단계: 400봉
      if(_targetCount > 200){
        await new Promise(r => setTimeout(r, 2000));
        try{
          const _extra1 = await fetchCandlesExtended(stock.code, _tf, rows[0].date, 200);
          if(_extra1 && _extra1.length > 0) rows = [..._extra1, ...rows];
        }catch(e){ console.warn('[S115] 경로 C 2단계 예외:', e); }
      }
      // 3단계: 600봉
      if(_targetCount > 400 && rows.length >= 400){
        await new Promise(r => setTimeout(r, 2000));
        try{
          const _extra2 = await fetchCandlesExtended(stock.code, _tf, rows[0].date, 200);
          if(_extra2 && _extra2.length > 0) rows = [..._extra2, ...rows];
        }catch(e){ console.warn('[S115] 경로 C 3단계 예외:', e); }
      }
      stock._lastAnalCandles = rows.slice();
      if(rows.length >= 600) stock._analCandlesExtendedStage = 2;
      else if(rows.length >= 400) stock._analCandlesExtendedStage = 1;
    }
    // ─── 경로 D: 시장 미지원 (미국 등) — range 확장 결과 그대로 사용 ───
    else {
      const _count = (_tf === 'week' || _tf === 'month') ? 400 : 300;
      rows = await btFetchCandles(stock.code, _isCoin, _tf, _count);
      console.log(`[S115] 경로 D — 시장 미지원, 단일 fetch: ${rows?.length||0}봉`);
    }

    if(!rows || rows.length === 0){
      throw new Error('캔들 데이터 수집 실패');
    }

    // [S428] 단일소스화 가드 — sx_bt.js _mergeBtCandles와 동일 규칙 (부분봉수 퇴보 방지). 분석탭/단일검증 공유
    rows = (typeof _mergeBtCandles === 'function') ? _mergeBtCandles(stock, rows, _targetCount, 'engineVerify') : rows;

    // ─── BT 실행 (단일검증과 동일 파라미터) ───
    const params = (typeof btGetParams === 'function') ? btGetParams() : { buyTh:62, sellTh:38, tpMult:2.5, slMult:1.5 };
    // btGetOpts는 단일검증 탭 DOM(#btOptSlip/#btOptNextBar) 참조하나 없으면 기본값 사용
    const opts = (typeof btGetOpts === 'function') ? btGetOpts() : { slippage:0.001, nextBarEntry:false };

    // S163-diag: 분석탭 _runEngineVerify의 rows 진단 로그 (교차검증과 비교용)
    try{
      const _first = rows[0], _last = rows[rows.length-1];
      const _fDate = _first.date || _first.t || '?';
      const _lDate = _last.date || _last.t || '?';
      const _fClose = _first.close ?? _first.c ?? '?';
      const _lClose = _last.close ?? _last.c ?? '?';
      console.log(`[S163-diag] [분석탭] ${stock.name||stock.code} rows: ${rows.length}봉 · 첫=${_fDate}(C${_fClose}) · 끝=${_lDate}(C${_lClose})`);
    }catch(_){}

    // [S245] 분석탭 BT 호출 직전 전역 상태 진단 — 옵티마이저 [S242]와 동일 형식으로 비교 가능
    //   배경: 분석탭 BT(거래 18건)와 옵티마이저 BT(거래 6건)가 같은 입력·같은 파라미터로
    //        다른 결과를 내는 원인을 추적 중. 입력 데이터·SCR_ANAL_PARAMS는 동일 확인 완료.
    //        남은 의심 — sxRunBtEngine 내부 _doRegimeAdj 분기가 두 BT 시점에 다른 값일 가능성.
    //        _doRegimeAdj = (opts.applyRegimeAdjust !== false) && SXE.regimeAdaptEnabled()
    //        화면상 레짐 OFF여도 실제 전역 `_raEnabled`가 true이면 분석탭만 보정 적용 → 거래 더 많이 진입.
    //   해결: 분석탭 BT 직전에도 옵티마이저 [S242]와 동일하게 전역 상태 출력 → 두 로그 직접 비교.
    try{
      const _ap = (typeof _loadAnalParams === 'function') ? _loadAnalParams() : {};
      const _raEn = (typeof SXE !== 'undefined' && typeof SXE.regimeAdaptEnabled === 'function') ? SXE.regimeAdaptEnabled() : '?';
      window._sxDebugBT && console.log(`[S245] [분석탭] ${stock.name||stock.code} BT호출옵션: applyRegimeAdjust=${opts.applyRegimeAdjust} · slippage=${opts.slippage} · nextBarEntry=${opts.nextBarEntry}`);
      window._sxDebugBT && console.log(`[S245] [분석탭] ${stock.name||stock.code} 전역상태: regimeAdaptEnabled=${_raEn} · applySafetyToBt=${!!SXE._applySafetyToBt} · btEntryGates=${!!SXE._btEntryGates} · btEarlyExit=${!!(SXE._btEarlyExit && SXE._btEarlyExit.enabled)}`);
      window._sxDebugBT && console.log(`[S245] [분석탭] ${stock.name||stock.code} BT파라미터: ${JSON.stringify(params)}`);
      window._sxDebugBT && console.log(`[S245] [분석탭] ${stock.name||stock.code} _loadAnalParams: ${JSON.stringify(_ap)}`);
    }catch(_e){ console.warn(`[S245] 진단 로그 예외: ${_e.message}`); }

    // [S249] 20250530 진입봉 이후 ~30봉의 close 출력 — 옵티마이저와 직접 비교용
    //   배경: [S247/S248] 결과 — entry/tp/sl 100% 동일. 같은 TP(64304)에 분석탭은 도달, 옵티마이저는 영원히 도달 못함.
    //        = 진입 이후의 봉 close 데이터가 두 BT에서 다른 게 100% 확정.
    //        남은 검증 — 어느 봉이 다른지 실제 close 값으로 확인.
    //   해결: 20250530 봉 인덱스를 찾고, 그 봉부터 +30봉의 close를 직접 출력.
    //        분석탭 출력과 옵티마이저 출력을 비교하면 봉별 close 차이가 한눈에 보임.
    try{
      const _idx530 = rows.findIndex(r => (r.date || r.t) === '20250530');
      if(_idx530 >= 0){
        const _slice = rows.slice(_idx530, Math.min(_idx530 + 30, rows.length));
        const _closes = _slice.map(r => `${r.date||r.t}:${r.close}`).join(' | ');
        window._sxDebugBT && console.log(`[S249] [분석탭] ${stock.name||stock.code} 20250530+30봉 close (idx ${_idx530}~${_idx530+_slice.length-1}/${rows.length}): ${_closes}`);
      } else {
        window._sxDebugBT && console.log(`[S249] [분석탭] ${stock.name||stock.code} 20250530 봉 인덱스 없음 (rows ${rows.length}봉)`);
      }
    }catch(_e){ console.warn(`[S249] close 비교 로그 예외: ${_e.message}`); }

    // [S250] close 비정상 봉 전수조사 — undefined/NaN/0 close 가진 봉 인덱스·날짜 출력
    //   배경: [S249] 결과 — idx 400 (20250714)의 close가 옵티마이저에서 undefined.
    //        분석탭은 62500 정상. 옵티마이저 캐시에만 데이터 손상.
    //        손상 범위(한 봉인지 다수인지)와 패턴(연속인지 산발인지) 확인 필요.
    //   해결: rows 전체 스캔해서 close가 비정상(null/undefined/NaN/0)인 봉의 인덱스·날짜·전체 OHLCV 출력.
    //        분석탭/옵티마이저 둘 다 출력 → 패턴 비교로 손상 위치 정확히 특정.
    try{
      const _badRows = rows.map((r, i) => ({i, r}))
        .filter(({r}) => r.close == null || isNaN(r.close) || r.close === 0);
      window._sxDebugBT && console.log(`[S250] [분석탭] ${stock.name||stock.code} close 비정상 봉: ${_badRows.length}개 / 전체 ${rows.length}봉`);
      if(_badRows.length > 0){
        const _samples = _badRows.slice(0, 5).map(({i, r}) =>
          `idx=${i}/date=${r.date||r.t}/o=${r.open}/h=${r.high}/l=${r.low}/c=${r.close}/v=${r.volume}`
        ).join(' | ');
        window._sxDebugBT && console.log(`[S250] [분석탭] ${stock.name||stock.code} 손상샘플(앞 5개): ${_samples}`);
        // 인덱스 패턴 (연속/산발 확인)
        const _allIdx = _badRows.map(({i}) => i);
        window._sxDebugBT && console.log(`[S250] [분석탭] ${stock.name||stock.code} 손상 인덱스 전체: [${_allIdx.join(',')}]`);
      }
    }catch(_e){ console.warn(`[S250] 손상조사 로그 예외: ${_e.message}`); }

    const r = sxRunBtEngine(rows, _tf, params, opts);
    // [S245] BT 직후 raw 결과 — 옵티마이저 [S241]과 동일 형식
    if(r && !r.error){
      window._sxDebugBT && console.log(`[S245] [분석탭] ${stock.name||stock.code} raw결과: rowsLength=${r.rowsLength||rows.length} 거래=${r.totalTrades} 승률=${(r.winRate||0).toFixed(1)}% 수익=${(r.totalPnl||0).toFixed(2)}% MDD=${r.mdd||0}% PF=${r.profitFactor||0} 게이트차단=${r.gateBlocks||0}`);
      // [S246] 진입 날짜 리스트 — 옵티마이저와 직접 비교용
      //   배경: 같은 입력·파라미터·전역상태인데 분석탭(18거래)과 옵티마이저(6거래)의 결과가 다름.
      //        MDD가 정확히 일치(12.19%)하는 건 일부 거래가 양쪽에 공통이라는 뜻.
      //   해결: 진입 날짜 + 타입(WIN/LOSS)을 시간 순서로 출력 → 양쪽 비교 시 어느 진입이 누락됐는지 즉시 보임.
      try{
        const _trades = (r.trades || []).map(t => `${t.entryDate||'?'}/${t.type||'?'}/${(t.pnl||0).toFixed(1)}`).join(' | ');
        window._sxDebugBT && console.log(`[S246] [분석탭] ${stock.name||stock.code} 진입목록(${(r.trades||[]).length}건): ${_trades}`);
      }catch(_e){ console.warn(`[S246] 진입목록 로그 예외: ${_e.message}`); }
      // [S247] 거래 entry/tp/sl 상세 — 7번째 거래(20250530)에서 분기 발생, TP/SL 계산 차이 추적
      //   배경: [S246] 비교 결과 — 첫 6거래(LOSS) 일치, 7번째(20250530)에서 분기.
      //        분석탭 WIN+14.2% 청산 vs 옵티마이저 OPEN 무한 보유.
      //        같은 진입봉에서 청산이 다르다 = TP/SL 가격 계산이 다름.
      //   해결: trades 배열의 entry/tp/sl 값을 출력해서 어느 게 다른지 확정.
      //        atrPct 계산 차이면 tp/sl 비율이 다르고, close 가격 차이면 entry부터 다름.
      try{
        const _details = (r.trades || []).map(t =>
          `${t.entryDate||'?'}:e=${(t.entry||0).toFixed(0)}/tp=${(t.tp||0).toFixed(0)}/sl=${(t.sl||0).toFixed(0)}`
        ).join(' | ');
        window._sxDebugBT && console.log(`[S247] [분석탭] ${stock.name||stock.code} 거래상세: ${_details}`);
      }catch(_e){ console.warn(`[S247] 거래상세 로그 예외: ${_e.message}`); }
      // [S248] 거래 청산 상세 (exit/exitDate/bars) — TP 도달 봉 확인용
      //   배경: [S247] 결과 — entry/tp/sl이 분석탭=옵티마이저 100% 동일 확인.
      //        7번째(20250530) 진입 후 같은 TP(64304)에 분석탭은 도달, 옵티마이저는 영원히 도달 못함.
      //        = 진입 이후의 봉 close 데이터가 두 BT에서 다르다는 결정적 증거.
      //   해결: trade의 exit 가격, exitDate(청산일), bars(보유봉수)를 출력.
      //        분석탭 7번째 trade의 exitDate를 알면 옵티마이저 캐시의 같은 날짜 close 비교 가능.
      try{
        const _exits = (r.trades || []).map(t =>
          `${t.entryDate||'?'}→${t.exitDate||'-'}/exit=${(t.exit||0).toFixed(0)}/${t.bars||0}봉`
        ).join(' | ');
        window._sxDebugBT && console.log(`[S248] [분석탭] ${stock.name||stock.code} 청산상세: ${_exits}`);
      }catch(_e){ console.warn(`[S248] 청산상세 로그 예외: ${_e.message}`); }
    }
    r.rowsLength = rows.length;

    if(r.error){
      console.error('[S115] BT 엔진 오류:', r.error);
      if(typeof toast === 'function') toast('❌ ' + r.error);
      return;
    }

    // ─── 결과 저장 ───
    try{ r._regimeBuckets = (typeof _btRegimeBreakdown==='function')?_btRegimeBreakdown(rows, r.trades):null; }catch(_rg){} // [S546] 레짐 버킷 (종목분석 자동실행 — 재진입 시 덮어써도 유지)
    stock._btResult = r;
    // [S215] BT 실행 시 사용한 TF/옵션/파라미터 함께 저장 — 단일검증 재사용 판정용
    stock._btResultTF = _tf;
    stock._btResultOpts = { slippage: opts.slippage, nextBarEntry: opts.nextBarEntry };
    stock._btResultParams = { buyTh: params.buyTh, sellTh: params.sellTh, tpMult: params.tpMult, slMult: params.slMult };
    if(typeof calcBtScore === 'function') stock._btScore = calcBtScore(r, stock);
    const _curPrice = rows[rows.length-1]?.close || stock.price || 0;
    if(typeof btGetCurrentState === 'function') stock._btState = btGetCurrentState(r, _curPrice);
    console.log(`[S115] ✅ BT 완료: 거래 ${r.totalTrades}회, 승률 ${r.winRate}%, ${rows.length}봉 기준`);

    // ═══════════════════════════════════════════════════════════════
    // S120-2: 강건성 배지 — 200봉 BT 추가 계산 + 편차 판정
    // ═══════════════════════════════════════════════════════════════
    //   → 200봉 vs 600봉 수익률 편차 비교로 구간 의존성(과적합) 탐지
    //
    // [판정 로직]
    //   rows.length >= 400 일 때만 실행 (200봉 slice + 200봉 이상 차이 보장)
    //   200봉 BT를 rows.slice(-200)로 재실행 (네트워크 추가 없음, CPU만 사용)
    //   편차 = |pnl200 - pnl600| / max(|pnl600|, 1)
    //     편차 < 20% → 🌱 신뢰 (robust)
    //     편차 ≥ 20% → ⚠️ 불안 (fragile, 과적합 의심)
    //   거래수 둘 다 >= 3 아니면 null (표본 부족 → 배지 숨김)
    //
    // [저장]
    //   stock._btResult_200 = 200봉 BT 결과
    //   stock._robustness = { label, deviation, pnl200, pnl600, show }
    //
    //   🌱 신뢰: 살아있고 건강하게 자라는 느낌 ("과적합" 전문용어 회피)
    //   ⚠️ 불안: 감정적 직관 ("구간 의존성" 대신 "불안"으로 즉각 이해)
    // ═══════════════════════════════════════════════════════════════
    try {
      if(rows.length >= 400 && typeof sxRunBtEngine === 'function'){
        const _rows200 = rows.slice(-200); // 최근 200봉
        const _r200 = sxRunBtEngine(_rows200, _tf, params, opts);
        if(!_r200.error && typeof _r200.totalPnl === 'number'){
          stock._btResult_200 = _r200;

          const _pnl600 = r.totalPnl || 0;
          const _pnl200 = _r200.totalPnl || 0;
          const _trades600 = r.totalTrades || 0;
          const _trades200 = _r200.totalTrades || 0;

          // 거래수 표본 체크 (둘 다 3건 이상이어야 의미있음)
          if(_trades600 >= 3 && _trades200 >= 3){
            // 편차 계산: |pnl200 - pnl600| / max(|pnl600|, 1)  (1% 이하 분모는 1로 고정해 과민 반응 방지)
            const _base = Math.max(Math.abs(_pnl600), 1);
            const _deviation = Math.abs(_pnl200 - _pnl600) / _base;

            stock._robustness = {
              label: _deviation < 0.2 ? 'trust' : 'fragile',
              deviation: _deviation,
              pnl200: _pnl200,
              pnl600: _pnl600,
              trades200: _trades200,
              trades600: _trades600,
              show: true
            };
            console.log(`[S120] 🌱 강건성: ${stock._robustness.label === 'trust' ? '신뢰' : '불안'} — 편차 ${(_deviation*100).toFixed(1)}% (200봉 ${_pnl200.toFixed(1)}% vs 600봉 ${_pnl600.toFixed(1)}%)`);
          } else {
            stock._robustness = { show: false, reason: 'insufficient_trades' };
            console.log(`[S120] 강건성 배지 숨김 — 거래수 부족 (200봉 ${_trades200}, 600봉 ${_trades600})`);
          }
        } else {
          stock._robustness = { show: false, reason: 'bt200_error' };
        }
      } else {
        stock._robustness = { show: false, reason: 'insufficient_bars' };
        console.log(`[S120] 강건성 배지 스킵 — 봉수 부족 (${rows.length}봉 < 400봉)`);
      }
    } catch(robErr){
      console.warn('[S120] 강건성 계산 예외:', robErr);
      stock._robustness = { show: false, reason: 'exception' };
    }

    // [S464] 코어 베이스라인 — 조기청산 제외(순수 엔진) BT로 강건성/과최적 별도 산출.
    //   조기청산 ON일 때만 의미(OFF면 코어 = 현재 표시값이라 중복 → 숨김). 단일 종목 1회 분석이라 BT 2회 추가 허용.
    //   산식은 메인과 동일: 편차 ≥20% = 불안 / (승률≥85 OR PF≥4) AND 거래<30 = 과최적.
    //   주의: SXE._btEarlyExit.enabled를 잠시 false로 토글하므로 inner try/finally로 반드시 복원.
    stock._coreDiag = { show: false };
    try {
      const _eeOn = SXE._btEarlyExit && SXE._btEarlyExit.enabled;
      if(_eeOn && rows.length >= 400 && typeof sxRunBtEngine === 'function'){
        SXE._btEarlyExit.enabled = false;
        try {
          const _c600 = sxRunBtEngine(rows, _tf, params, opts);
          const _c200 = sxRunBtEngine(rows.slice(-200), _tf, params, opts);
          if(_c600 && !_c600.error && _c200 && !_c200.error){
            const _cp6 = _c600.totalPnl || 0, _cp2 = _c200.totalPnl || 0;
            const _ct6 = _c600.totalTrades || 0, _ct2 = _c200.totalTrades || 0;
            let _cRob = null;
            if(_ct6 >= 3 && _ct2 >= 3){
              const _cDev = Math.abs(_cp2 - _cp6) / Math.max(Math.abs(_cp6), 1);
              _cRob = _cDev < 0.2 ? 'trust' : 'fragile';
            }
            const _cwr = _c600.winRate || 0, _cpf = _c600.profitFactor || 0;
            const _cOver = ((_cwr >= 85 || _cpf >= 4) && _ct6 < 30);
            if(_ct6 > 0) stock._coreDiag = { show: true, rob: _cRob, overfit: _cOver };
            console.log(`[S464] 🧩 코어(조기청산 제외): 강건성 ${_cRob||'–'} · 과최적 ${_cOver?'의심':'없음'} (코어 600봉 ${_cp6.toFixed(1)}% / 200봉 ${_cp2.toFixed(1)}% / 거래 ${_ct6})`);
          }
        } finally {
          SXE._btEarlyExit.enabled = true; // 정상·예외 모두 복원
        }
      }
    } catch(coreErr){
      console.warn('[S464] 코어 베이스라인 예외:', coreErr);
      stock._coreDiag = { show: false };
    }

    // btRenderBasicResult가 단일검증 탭의 #btBasicResult DOM에 결과 렌더
    // 탭이 현재 안 보여도 DOM은 존재 (display:none) → 렌더만 해두면 나중에 단일검증 탭 들어갈 때 바로 보임
    try {
      if(typeof btRenderBasicResult === 'function'){
        btRenderBasicResult(stock, r);
        // btBasicResult 영역 표시 (display:none으로 숨겨져 있을 수 있음)
        const _btResultEl = document.getElementById('btBasicResult');
        if(_btResultEl) _btResultEl.style.display = 'block';
        console.log('[S115] ✅ 단일검증 탭 결과 동기화 완료');
      }
    } catch(e) { console.warn('[S115] 단일검증 탭 렌더 예외:', e); }

    // localStorage 저장
    if(typeof _btSaveBtResult === 'function'){
      try{ _btSaveBtResult(stock, r); }catch(e){ console.warn('[S115] _btSaveBtResult 예외:', e); }
    }

    // 관심종목 캐시 갱신 (기존 S110 로직)
    try{
      if(_tf === 'day' && typeof _isInWatchlist === 'function' && typeof _watchBtSet === 'function' && _isInWatchlist(stock.code)){
        _watchBtSet(stock, r, 'day');
      }
    }catch(e){ console.warn('[S115] watch cache update err', e); }

    if(typeof toast === 'function') toast(`✅ 엔진판단 검증 완료 (거래 ${r.totalTrades}, 승률 ${r.winRate}%)`);

    // ─── 분석탭 재렌더 (결과 카드 갱신) ───
    // stock._engineVerifyOpen 플래그는 버튼 onclick에서 이미 true로 세팅됨
    // → 재렌더 시 카드가 처음부터 display:block으로 그려짐 (열림 유지)
    if(typeof _analTabIdx !== 'undefined' && _analTabIdx === 0 && typeof currentAnalStock !== 'undefined' && currentAnalStock === stock){
      if(typeof runAnalysis === 'function'){
        await runAnalysis(stock);
        console.log('[S115] 분석탭 즉시 재렌더 완료 (엔진판단 검증 카드 열림 유지)');
      }
    } else {
      // 다른 탭에 있으면 플래그로 이관 (S112-fix2)
      stock._needsAnalRerender = true;
    }
  } catch(e) {
    console.error('[S115/_runEngineVerify] 실행 오류:', e);
    if(typeof toast === 'function') toast('❌ 엔진판단 검증 실패: ' + e.message);
  } finally {
    stock._engineVerifyRunning = false;
    // [S547] 확장+검증 완료 후 단일검증 BT를 백그라운드 1회 실행 → 첫 진입에도 자동 표시(레짐 섹션 포함).
    //   _runEngineVerify가 _btResult* 재사용 필드를 동일 _btTargetBars로 세팅 → btRunBasic이 재사용 경로(렌더만)로 빠짐 = 재실행·재귀 없음.
    //   단일검증 DOM(btnBtBasic) 존재 + 현재 BT 종목이 동일할 때만. 숨겨진 탭이면 렌더만 되고 화면 변화 없음.
    try {
      var _svStock = (typeof _btCurrentStock === 'function') ? _btCurrentStock() : ((typeof currentAnalStock !== 'undefined') ? currentAnalStock : null);
      if(typeof btRunBasic === 'function' && document.getElementById('btnBtBasic') && _svStock === stock && stock._btResult){
        setTimeout(function(){ try { btRunBasic(); } catch(_e){} }, 0);
      }
    } catch(_e){}
  }
}
// 전역 노출 (onclick 핸들러에서 호출)
window._runEngineVerify = _runEngineVerify;


// S108 Phase 3-B-9a-ext: 수동 데이터 확장 (? 버튼 클릭 트리거)
//   현재 stage 기준 +200봉 로드 → 기존 데이터와 병합 → BT 재실행 → UI 재렌더
//   stage 전이:
//     0 (200봉) → 클릭 불가 (자동으로 stage 1로 전환되었어야 함)
//     1 (400봉) → 2 (600봉) — 대부분의 케이스
//     2 (600봉) → 호출되지 않음 (버튼 자체가 표시 안 됨)
//
//   흐름:
//     1. stage 플래그 선점 (중복 호출 방지) + 로딩 UX 표시
//     2. 현재 _analCandles의 가장 오래된 봉 날짜로 fetchCandlesExtended 호출
//     3. 새 200봉을 기존 데이터 앞에 병합 ([새 200 + 기존 400] = 600)
//     4. BT 재실행 → 결과 교체
//     5. runAnalysis 재호출 (UI 완전 재렌더)
//
//   실패 시: stage 플래그 원복, 기존 결과 유지, 경고 토스트
async function _loadMoreCandles(stock){
  if(!stock){
    console.warn('[S108-9aExt] stock 없음');
    return;
  }
  const _curStage = stock._analCandlesExtendedStage || (stock._analCandlesExtended ? 1 : 0);
  if(_curStage >= 2){
    console.log('[S108-9aExt] 이미 최대 확장 (600봉) — 건너뜀');
    return;
  }
  const _mkt = stock._mkt || stock.market || currentMarket;
  if(_mkt !== 'coin' && _mkt !== 'kr'){
    console.warn(`[S108-9aExt] 시장 미지원: ${_mkt}`);
    return;
  }
  if(typeof fetchCandlesExtended !== 'function'){
    console.warn('[S108-9aExt] fetchCandlesExtended 미로드');
    return;
  }

  // 현재 _analCandles 확보 — runAnalysis에서 확장된 상태면 400봉, 아니면 200봉
  //   _analCandles는 runAnalysis 안의 지역 변수라 stock._btResult.trades나 indicators로 접근
  //   간단히 stock._lastAnalCandles에 저장되어 있다면 사용, 없으면 재분석 트리거
  const _existingCandles = stock._lastAnalCandles || null;
  if(!_existingCandles || _existingCandles.length === 0){
    console.warn('[S108-9aExt] 기존 캔들 없음 — runAnalysis 재실행으로 대체');
    stock._analCandlesExtendedStage = 2; // 재실행 시 자동 2단계 로드되도록
    if(typeof runAnalysis === 'function') runAnalysis(stock);
    return;
  }

  console.log(`[S108-9aExt] ★ 수동 확장 시작 (stage ${_curStage} → ${_curStage+1}): 현재 ${_existingCandles.length}봉`);

  // 로딩 UX — "?" 버튼이 있던 배너 자리에 로딩 표시
  const _btBanner = document.querySelector('.bt-banner');
  if(_btBanner){
    const _loading = document.createElement('div');
    _loading.id = 'sxLoadMoreOverlay';
    _loading.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;border-radius:inherit;z-index:10;color:#fff;font-size:12px;font-weight:700';
    _loading.innerHTML = '📈 +200봉 로드 중... (2초 대기)';
    _btBanner.style.position = 'relative';
    _btBanner.appendChild(_loading);
  }

  // stage 플래그 선점 (중복 클릭 방지)
  stock._analCandlesExtendedStage = _curStage + 1;

  try{
    const _oldestDate = _existingCandles[0].date;
    console.log(`[S108-9aExt] oldestDate=${_oldestDate}, 확장 API 호출 중...`);
    const _extra = await fetchCandlesExtended(stock.code, _analTF, _oldestDate, 200);
    console.log(`[S108-9aExt] 확장 응답: ${_extra ? _extra.length + '봉' : 'null'}`);

    if(!_extra || _extra.length === 0){
      // 실패 — stage 원복
      console.warn('[S108-9aExt] ⚠ 확장 실패 (null/빈배열) — stage 원복');
      stock._analCandlesExtendedStage = _curStage;
      if(document.getElementById('sxLoadMoreOverlay')) document.getElementById('sxLoadMoreOverlay').remove();
      // [S224] alert → toast 교체 (모바일 UX)
      toast('⚠ 데이터 확장 실패 — 잠시 후 다시 시도해주세요.');
      return;
    }

    // 병합 [새 200봉, 기존 400봉 또는 200봉] = 오래된 순 정렬 유지
    const _merged = [..._extra, ..._existingCandles];
    console.log(`[S108-9aExt] 병합 완료: ${_extra.length} + ${_existingCandles.length} = ${_merged.length}봉`);

    // BT 재실행 (확장 데이터로)
    const _btParams = typeof btGetParams === 'function' ? btGetParams() : {};
    const _rawMerged = _merged.map(c => ({date:c.date,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}));
    // [S221] applyRegimeAdjust:true 명시 — 단일검증/스캐너와 동일 정책으로 정합 회복.
    const _btR = SXE.runBtEngine(_rawMerged, _analTF, _btParams, { applyRegimeAdjust: true });
    if(_btR && !_btR.error){
      try{ _btR._regimeBuckets = (typeof _btRegimeBreakdown==='function')?_btRegimeBreakdown(_rawMerged, _btR.trades):null; }catch(_rg){} // [S546] 레짐 버킷
      const _tr = _btR.totalTrades ?? 0;
      console.log(`[S108-9aExt] ✅ BT 재실행 성공: 거래 ${_tr}회 (점수: ${calcBtScore(_btR, stock)}) — ${_merged.length}봉 기준`);
      stock._btResult = _btR;
      stock._btScore = calcBtScore(_btR, stock);
      const _curPrice = _merged[_merged.length-1]?.close || stock.price || 0;
      stock._btState = typeof btGetCurrentState === 'function' ? btGetCurrentState(_btR, _curPrice) : null;
      // 다음 재분석에서 확장된 캔들 사용하도록 보존
      stock._lastAnalCandles = _merged;
    } else {
      console.warn(`[S108-9aExt] BT 재실행 실패:`, _btR?.error);
      stock._analCandlesExtendedStage = _curStage;
      if(document.getElementById('sxLoadMoreOverlay')) document.getElementById('sxLoadMoreOverlay').remove();
      // [S224] alert → toast 교체
      toast('⚠ BT 재실행 실패: ' + (_btR?.error || '알 수 없는 오류'));
      return;
    }

    // S108 Phase 3-B-9a-ext fix2: 재렌더 전 펼침 상태 캡처 (매수 근거 상세, 매매 근거 상세 등)
    //   문제: runAnalysis 재호출 → DOM 재생성 → 펼쳐진 아코디언이 전부 닫힘
    //   해결: 현재 펼쳐진 토글의 라벨 텍스트를 캡처 → 재렌더 후 같은 라벨 찾아서 다시 펼침
    //   ID는 매번 랜덤 생성되므로(btGuide_xxx), 안정적인 라벨 텍스트 매칭 사용
    //
    //   3차 fix3: "엔진판단 근거" / "진입 검토" 버튼은 itp-toggle-inline 아님 (style.display 토글)
    //     → onclick 속성에서 getElementById('xxx') 참조 타겟을 찾아서 style.display === 'block' 확인
    //     → 버튼 라벨(예: "엔진판단 근거 ▶ 매수 근거 65점") 기반으로 라벨 키 생성
    //
    //   4차 fix4: 스크롤 위치 보존 — 재렌더 후 페이지 맨 위로 튀는 문제 해결
    //     analBody는 스크롤 컨테이너 (overlay 내부), 따라서 scrollTop 캡처
    //     window.scrollY도 함께 캡처 (폴백)
    const _openLabels = [];      // .itp-toggle-inline (.show 클래스 토글)
    const _foldOpenLabels = [];  // .anal-fold (.fold-open 클래스 토글)
    const _displayOpenKeys = []; // style.display 인라인 토글 (엔진판단 근거, 진입 검토 등)
    let _scrollTop = 0;
    let _windowScrollY = 0;
    try{
      // ① 인라인 토글 (.itp-toggle-inline .show)
      document.querySelectorAll('#analBody .itp-toggle-inline').forEach(toggle => {
        const target = toggle.nextElementSibling;
        if(target && target.classList.contains('show')){
          const label = toggle.textContent.trim().replace(/^[▶▼]\s*/, '');
          if(label) _openLabels.push(label);
        }
      });      // ② anal-fold 섹션 (.fold-open)
      document.querySelectorAll('#analBody .anal-fold.fold-open').forEach(fold => {
        const hdr = fold.querySelector('.anal-fold-hdr');
        if(hdr){
          const label = hdr.textContent.trim().replace(/^[▶▼]\s*/, '');
          if(label) _foldOpenLabels.push(label);
        }
      });
      // ③ style.display 토글 (엔진판단 근거, 진입 검토 등)
      //    onclick 속성에 getElementById('xxx')가 있는 클릭 가능한 요소 순회
      //    → 해당 타겟이 display:block 상태면 캡처
      document.querySelectorAll('#analBody [onclick]').forEach(btn => {
        const oc = btn.getAttribute('onclick') || '';
        const m = oc.match(/getElementById\(['"]([^'"]+)['"]\)/);
        if(!m) return;
        const target = document.getElementById(m[1]);
        if(!target) return;
        // style.display === 'block' 이거나 style.display 없고 실제 visible
        const disp = target.style.display;
        if(disp === 'block'){
          // 버튼 라벨 추출 — "엔진판단 근거 ▶ 매수 근거 65점" 같은 텍스트에서
          //   "엔진판단 근거" 같은 앞부분만 추출 (변동하는 점수 부분 제외)
          const fullLabel = btn.textContent.trim();
          // 변동 값 포함 라벨은 첫 단어 2~3개만 키로 사용 (안정성)
          const shortKey = fullLabel.split(/[▶▼\s]+/).slice(0, 2).join(' ').trim();
          if(shortKey) _displayOpenKeys.push(shortKey);
        }
      });
      // ④ 스크롤 위치 캡처 (analBody 내부 + window 양쪽)
      //    analBody는 overlay 내부의 스크롤 컨테이너 — 실제 스크롤이 여기서 발생
      const _analBody = document.getElementById('analBody');
      if(_analBody) _scrollTop = _analBody.scrollTop || 0;
      _windowScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      console.log(`[S108-9aExt] 펼침 상태 캡처: inline=${_openLabels.length}, fold=${_foldOpenLabels.length}, display=${_displayOpenKeys.length} [${_displayOpenKeys.join(', ')}], scroll=${_scrollTop}/${_windowScrollY}`);
    }catch(capErr){ console.warn('[S108-9aExt] 상태 캡처 에러:', capErr); }

    // runAnalysis 재호출 — UI 완전 재렌더 (stock._lastAnalCandles 재사용으로 600봉 유지)
    if(typeof runAnalysis === 'function'){
      await runAnalysis(stock);

      // S108 Phase 3-B-9a-ext fix2: 재렌더 후 펼침 상태 복원
      //   DOM 업데이트가 완료되도록 약간의 지연 후 실행
      (window._sxTrackedTimeout || setTimeout)(() => {
        try{
          let restoredInline = 0, restoredFold = 0, restoredDisp = 0;
          // ① 인라인 토글 복원
          document.querySelectorAll('#analBody .itp-toggle-inline').forEach(toggle => {
            const label = toggle.textContent.trim().replace(/^[▶▼]\s*/, '');
            if(_openLabels.includes(label)){
              const target = toggle.nextElementSibling;
              if(target && !target.classList.contains('show')){
                target.classList.add('show');
                const arrow = toggle.querySelector('.sb-arrow');
                if(arrow) arrow.textContent = '▼';
                restoredInline++;
              }
            }
          });
          // ② fold-open 복원
          document.querySelectorAll('#analBody .anal-fold').forEach(fold => {
            const hdr = fold.querySelector('.anal-fold-hdr');
            if(!hdr) return;
            const label = hdr.textContent.trim().replace(/^[▶▼]\s*/, '');
            if(_foldOpenLabels.includes(label) && !fold.classList.contains('fold-open')){
              fold.classList.add('fold-open');
              restoredFold++;
            }
          });
          // ③ style.display 토글 복원
          document.querySelectorAll('#analBody [onclick]').forEach(btn => {
            const oc = btn.getAttribute('onclick') || '';
            const m = oc.match(/getElementById\(['"]([^'"]+)['"]\)/);
            if(!m) return;
            const target = document.getElementById(m[1]);
            if(!target) return;
            const fullLabel = btn.textContent.trim();
            const shortKey = fullLabel.split(/[▶▼\s]+/).slice(0, 2).join(' ').trim();
            if(_displayOpenKeys.includes(shortKey) && target.style.display !== 'block'){
              target.style.display = 'block';
              restoredDisp++;
            }
          });
          console.log(`[S108-9aExt] 펼침 상태 복원: inline=${restoredInline}/${_openLabels.length}, fold=${restoredFold}/${_foldOpenLabels.length}, display=${restoredDisp}/${_displayOpenKeys.length}`);
          // S108 fix4: 스크롤 위치 복원 (펼침 상태 복원 후 레이아웃 확정된 상태에서 실행)
          //   analBody는 overlay 내부 스크롤 컨테이너 — scrollTop 복원
          //   window.scrollY도 폴백으로 복원
          const _analBody2 = document.getElementById('analBody');
          if(_analBody2 && _scrollTop > 0) _analBody2.scrollTop = _scrollTop;
          if(_windowScrollY > 0) window.scrollTo(0, _windowScrollY);
          console.log(`[S108-9aExt] 스크롤 복원: analBody=${_scrollTop}, window=${_windowScrollY}`);
        }catch(restErr){ console.warn('[S108-9aExt] 상태 복원 에러:', restErr); }
      }, 100);
    }
  }catch(e){
    console.error('[S108-9aExt] 예외:', e);
    stock._analCandlesExtendedStage = _curStage; // 원복
    if(document.getElementById('sxLoadMoreOverlay')) document.getElementById('sxLoadMoreOverlay').remove();
    // [S224] alert → toast 교체
    toast('⚠ 예외 발생: ' + (e.message || e));
  }
}

// S62: BT 배너 생성 (종합행동지침 — 진입 검토×매매전략 교차 판정)
function _buildBtBanner(stock, qs){
  const btData = _getBtData(stock);

  // S79: BT 비지원 TF 체크
  const _btMkt = stock._mkt || stock.market || currentMarket;
  if(!_isBtSupportedTF(_btMkt, _analTF)){
    return `<div class="bt-banner info">
      <div class="bt-banner-header"><div class="bt-banner-title info">매매전략 — 데이터 부족</div></div>
      <div class="bt-action-line neutral">현재 타임프레임은 백테스트 미지원</div>
      <div class="bt-banner-body">이 타임프레임에서는 충분한 매매 데이터를 확보할 수 없습니다. 관심종목에 등록하고 지원 TF에서 거래 10회 이상 누적 후 확인하세요.</div>
    </div>`;
  }

  // 검증 시점 포맷
  let btDateStr = '';
  if(btData && btData.saved_at){
    try{
      const dt = new Date(btData.saved_at);
      btDateStr = (dt.getMonth()+1)+'/'+dt.getDate()+' '+(dt.getHours()<10?'0':'')+dt.getHours()+':'+(dt.getMinutes()<10?'0':'')+dt.getMinutes()+' 검증';
    }catch(e){}
  }

  // S108 Phase 3-B-9a-ext: "?" 버튼을 도움말 → 수동 확장(+200봉) 버튼으로 교체
  //   기존 도움말은 구버전(진입 검토/매매전략 의미가 이미 바뀜, C 9종 판정 체계와 불일치)
  //   새 역할: 데이터 부족 상태에서 "?" 클릭 시 추가 200봉 로드 → BT 재실행 → UI 재렌더
  //   표시 조건: trades < BT_MIN_TRADES AND stage < 2 (최대 2단계 = 600봉)
  //   아이콘 "?"는 유지 (이미 익숙한 위치, 학습 비용 0)
  //
  //   stage 플래그:
  //     0 → 200봉 (스캐너 기본)
  //     1 → 400봉 (분석탭 진입 시 자동 확장 완료)
  //     2 → 600봉 (? 버튼 클릭 시 수동 확장 완료, 최대)
  const _extStageNow = stock._analCandlesExtendedStage || (stock._analCandlesExtended ? 1 : 0);
  const _extMktBanner = stock._mkt || stock.market || currentMarket;
  // [S168 600봉 통일] 미국(us) 시장 추가 — fetchCandlesExtended period1/period2 지원
  const _extSupportedBanner = (_extMktBanner === 'coin' || _extMktBanner === 'kr' || _extMktBanner === 'us');
  // helpBtn은 이제 loadMoreBtn — 조건 충족 시 버튼, 아니면 빈 문자열
  //   조건: (1) 시장 지원 (2) stage < 2 (3) 현재 부족 상태 — 버튼 생성부에서는 (1)+(2)만 체크
  //   실제 표시는 각 분기에서 isInsufficient 조건과 함께 결정 (아래 _loadMoreBtn 사용)
  const _canExpand = _extSupportedBanner && _extStageNow < 2 && typeof fetchCandlesExtended === 'function';
  // S114: ? 버튼 UI만 숨김 — _loadMoreCandles 함수와 _canExpand 로직은 보존 (혹시 모를 다른 조건 대비)
  //   엔진판단 검증 버튼이 역할 대체 (400→600봉 확장 + BT 재실행)
  //   원본: const _loadMoreBtn = _canExpand ? `<span class="bt-help-btn" onclick="_loadMoreCandles(currentAnalStock)" title="+200봉 추가 로드 (현재 ${200+_extStageNow*200}봉 → ${200+(_extStageNow+1)*200}봉)">?</span>` : '';
  const _loadMoreBtn = '';  // S114: UI 숨김 (복원 시 위 원본 주석 참고)
  // 하위 호환: 기존 helpBtn/helpHTML 이름 유지 (다른 분기에서 참조)
  const helpBtn = _loadMoreBtn;
  const helpHTML = ''; // 도움말 HTML 완전 제거 (구버전 내용 — C 9종 판정 체계와 불일치)

  // S109 Phase 3-B-9a-ext-fix5: analScore/analGood은 이제 배너에서 사용 안 함 (원칙 ① 독자 판정 제거)
  //   이전엔 analGood × btGood 2×2 판정에 사용 → 이제 5카드 요약만 표시
  //   변수는 하위 호환 위해 유지 (제거 시 아래 분기에서 참조 리스크)
  const analScore = qs ? qs.score : 0;
  const analGood = analScore >= 60;

  // BT 미실행
  if(!btData){
    return `<div class="bt-banner info">
      <div class="bt-banner-header"><div class="bt-banner-title info">전략 미검증</div>${helpBtn}</div>
      <div class="bt-action-line neutral">단일검증 탭에서 백테스트 후 교차 판단 가능</div>
      <div class="bt-banner-body">진입 검토 ${analScore}점 — 매매전략 미실행. 진입 검토만으로는 전략의 과거 성과를 알 수 없습니다. 단일검증 탭에서 백테스트를 실행하면 두 점수를 교차 비교할 수 있습니다.</div>
      ${helpHTML}
    </div>`;
  }

  const pnl = btData.totalPnl ?? 0;
  const wr = btData.winRate ?? 0;
  const trades = btData.totalTrades ?? 0;
  const mdd = btData.mdd ?? 0;
  const pf = btData.profitFactor ?? 0;

  // 거래 0건
  if(trades === 0){
    return `<div class="bt-banner info">
      <div class="bt-banner-header"><div class="bt-banner-title info">거래 신호 없음</div>${helpBtn}</div>
      <div class="bt-action-line neutral">검증 기간 내 매매 신호 미발생</div>
      <div class="bt-banner-body">설정한 조건에서 매매 신호가 발생하지 않았습니다. 타임프레임이나 임계값을 조정하여 재검증을 권장합니다.</div>
      ${btDateStr?`<div style="font-size:8px;color:var(--text3);margin-top:4px;text-align:right">${btDateStr}</div>`:''}
      ${helpHTML}
    </div>`;
  }

  // S93: 거래수 기반 신뢰도 3색 (점수는 항상 표시)
  let _bReliLabel='', _bReliColor='';
  if(trades < BT_MIN_TRADES){ _bReliLabel='데이터 부족'; _bReliColor='var(--sell)'; }
  else if(trades < 30){ _bReliLabel='데이터 충족'; _bReliColor='var(--accent)'; }
  else { _bReliLabel='데이터 충분'; _bReliColor='var(--buy)'; }

  // S109 Phase 3-B-9a-ext-fix5: 배너 정합성 수정 (원칙 ① 독자 판정 금지 + ⑦ 시간적 일관성)
  //   문제:
  //     (1) trades<10일 때는 "매매전략 — 데이터 부족" 타이틀
  //     (2) trades≥10일 때는 "종합행동지침 — 데이터 충족" 타이틀 (역할 변경!)
  //     (3) analScore×btScore 2×2 독자 판정 ("진입 적기/단기급등/관심/회피")
  //     → 원칙 ⑦ 시간적 일관성 위배 + 원칙 ① 독자 판정 금지 위배
  //
  //   해결: 배너 역할을 "BT 데이터 품질 + 성과 숫자"로 고정
  //     - 타이틀: 항상 "매매전략 — 데이터 XX"
  //     - 내용: 5개 카드 [승률][수익][거래][MDD][손익비]
  //     - 데이터 부족 시: 거래 수와 손익비는 표시, 나머지는 "?"
  //     - actionText("진입 적기" 등) 완전 제거 — C 판정은 이미 상단 배지/매수 근거 평가 카드에 있음
  //
  //   거래 0건 특수 케이스만 예외적으로 유지 (표시할 숫자가 없으므로)
  if(trades === 0){
    return `<div class="bt-banner info">
      <div class="bt-banner-header"><div class="bt-banner-title info">매매전략 — <span style="color:var(--text3);font-weight:700">거래 없음</span></div>${helpBtn}</div>
      <div class="bt-banner-body" style="padding:8px 10px;font-size:11px;color:var(--text3)">검증 기간 내 매매 신호가 발생하지 않았습니다. 타임프레임이나 임계값을 조정하거나 관심종목 등록 후 재검증하세요.</div>
      ${helpHTML}
    </div>`;
  }

  const btScore = calcBtScore(btData, stock);

  // 5카드 생성 함수 — 데이터 부족 시 승률/수익/MDD만 "?"로, 거래/손익비는 항상 표시
  const _insufficient = trades < BT_MIN_TRADES;
  const _fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  // 손익비: BT 결과의 평균이익/평균손실 비율 (없으면 fallback)
  const avgWin = btData.avgWin ?? (btData.avgProfit > 0 ? btData.avgProfit : 0);
  const avgLoss = btData.avgLoss ?? (btData.avgProfit < 0 ? Math.abs(btData.avgProfit) : 0);
  let _rrLabel = '—';
  if(avgWin > 0 && avgLoss > 0){
    const ratio = avgWin / avgLoss;
    _rrLabel = ratio >= 1 ? `${ratio.toFixed(1)} : 1` : `1 : ${(1/ratio).toFixed(1)}`;
  } else if(pf > 0){
    // avgWin/avgLoss 없으면 PF로 추정 표시
    _rrLabel = `PF ${pf.toFixed(2)}`;
  }

  const _cardStyle = 'flex:1;min-width:0;background:var(--surface2);border-radius:6px;padding:6px 3px;text-align:center';
  const _labelStyle = 'font-size:9px;color:var(--text3);font-weight:600;letter-spacing:-.2px';
  const _valueStyle = 'font-size:11px;font-weight:800;margin-top:2px;line-height:1.2;letter-spacing:-.3px';

  // [S292] 승률 4단계: 60%↑녹색 / 40~59%파랑 / 20~39%주황 / 0~19%빨강
  const _wrColor = _insufficient ? 'var(--text3)' : (wr >= 60 ? 'var(--buy)' : wr >= 40 ? '#3b82f6' : wr >= 20 ? '#f97316' : 'var(--sell)');
  // [S295] 총수익률 4단계: ≥100% 녹색 / 50~99.9% 파랑 / 0~49.9% 주황 / <0 빨강
  const _pnlColor = _insufficient ? 'var(--text3)' : (pnl >= 100 ? 'var(--buy)' : pnl >= 50 ? '#3b82f6' : pnl >= 0 ? '#f97316' : 'var(--sell)');
  // [S294] MDD 3단계: <10% 파랑 / 10~19.9% 보라 / ≥20% 빨강
  const _mddColor = _insufficient ? 'var(--text3)' : (mdd < 10 ? '#3b82f6' : mdd < 20 ? '#8b5cf6' : 'var(--sell)');
  const _trColor = _insufficient ? 'var(--sell)' : (trades < 30 ? 'var(--accent)' : 'var(--buy)');

  // [S293] 손익비 색상: ≥2.0 녹색 / 1.5~1.99 파랑 / 1.0~1.49 주황 / <1.0 빨강
  const _rrColor = pf >= 2.0 ? 'var(--buy)' : pf >= 1.5 ? '#3b82f6' : pf >= 1.0 ? '#f97316' : 'var(--sell)';

  const _statsGrid = `<div style="display:flex;gap:4px;margin-top:8px">
    <div style="${_cardStyle}"><div style="${_labelStyle}">승률</div><div style="${_valueStyle};color:${_wrColor}">${_insufficient?'?':wr.toFixed(1)+'%'}</div></div>
    <div style="${_cardStyle}"><div style="${_labelStyle}">수익</div><div style="${_valueStyle};color:${_pnlColor}">${_insufficient?'?':_fmtPct(pnl)}</div></div>
    <div style="${_cardStyle}"><div style="${_labelStyle}">거래</div><div style="${_valueStyle};color:${_trColor}">${trades}</div></div>
    <div style="${_cardStyle}"><div style="${_labelStyle}">MDD</div><div style="${_valueStyle};color:${_mddColor}">${_insufficient?'?':mdd.toFixed(2)+'%'}</div></div>
    <div style="${_cardStyle}"><div style="${_labelStyle}">손익비</div><div style="${_valueStyle};color:${_rrColor}">${_rrLabel}</div></div>
  </div>`;

  // S109 Phase 3-B-9a-ext-fix6: 데이터 부족 시 안내 분기
  //   stage 0~1 (아직 확장 가능): "거래 N회 / 최소 10회 필요 — 신뢰도 주의"
  //   stage 2 (최대 확장 도달, 600봉): "최대 확장 완료 — [권장 TF] 전환 권장"
  //
  //   TF 전환 권장 맵 (600봉 커버리지 기준):
  //     국내: 60분(50일) → 일봉 / 일봉(2.4년) → 주봉 / 주봉·월봉 → 조건 검토
  //     해외: 일봉 → 주봉 / 주봉 → 월봉 / 월봉 → 조건 검토
  //     코인: 60분(25일) → 4시간 / 240m(100일) → 일봉 / 일봉 → 주봉 / 주봉·월봉 → 조건 검토
  let _insufficientNote = '';
  if(_insufficient){
    const _stage = stock._analCandlesExtendedStage || (stock._analCandlesExtended ? 1 : 0);
    const _tf = _analTF || 'day';
    const _mkt = stock._mkt || stock.market || currentMarket;

    if(_stage >= 2){
      // 최대 확장 도달 — TF 전환 권장
      let _recommendTf = null;
      if(_mkt === 'kr'){
        if(_tf === '60m') _recommendTf = '일봉';
        else if(_tf === 'day') _recommendTf = '주봉';
      } else if(_mkt === 'us'){
        if(_tf === 'day') _recommendTf = '주봉';
        else if(_tf === 'week') _recommendTf = '월봉';
      } else if(_mkt === 'coin'){
        if(_tf === '60m') _recommendTf = '4시간';
        else if(_tf === '240m') _recommendTf = '일봉';
        else if(_tf === 'day') _recommendTf = '주봉';
        else if(_tf === 'week') _recommendTf = '월봉';
      }

      if(_recommendTf){
        _insufficientNote = `<div style="margin-top:6px;padding:6px 8px;background:rgba(100,149,237,.08);border-radius:6px;font-size:10px;text-align:center;line-height:1.4">
          <div style="color:var(--sell);font-weight:600">거래 ${trades}회 / 최소 ${BT_MIN_TRADES}회 필요</div>
          <div style="color:var(--accent);margin-top:3px">💡 최대 확장 완료 (600봉) — <b>${_recommendTf}</b> 전환 권장</div>
        </div>`;
      } else {
        // 전환 불가 (주봉/월봉 등)
        _insufficientNote = `<div style="margin-top:6px;padding:6px 8px;background:rgba(100,149,237,.08);border-radius:6px;font-size:10px;text-align:center;line-height:1.4">
          <div style="color:var(--sell);font-weight:600">거래 ${trades}회 / 최소 ${BT_MIN_TRADES}회 필요</div>
          <div style="color:var(--accent);margin-top:3px">💡 최대 확장 완료 — 매매 조건 검토 권장</div>
        </div>`;
      }
    } else {
      // 아직 확장 가능 (기존 안내)
      _insufficientNote = `<div style="margin-top:6px;font-size:10px;color:var(--sell);text-align:center">거래 ${trades}회 / 최소 ${BT_MIN_TRADES}회 필요 — 신뢰도 주의</div>`;
    }
  }

  // S67: 누적 신뢰도 표시
  const _histMkt = stock._mkt || stock.market || currentMarket;
  const _histData = _btHistLoad(_histMkt);
  const _histArr = _histData[stock.code] || [];
  const _histRel = _btHistReliabilityLabel(_histArr.length);
  const _histStats = _btHistCalcStats(_histArr);
  let _histLine = '';
  if(_histArr.length > 0){
    const _hc = _histRel.cls==='full'?'var(--buy)':_histRel.cls==='mid'?'var(--accent)':_histRel.cls==='low'?'var(--sell)':'var(--text3)';
    _histLine = `<div style="margin-top:6px;padding:6px 8px;background:var(--surface2);border-radius:6px;font-size:10px">
      <span style="font-weight:700;color:${_hc}">신뢰도 ${_histRel.text}</span> <span style="color:var(--text3)">${_histRel.desc}</span>`;
    if(_histStats){
      _histLine += ` · 누적 승률 ${_histStats.wr}% · PF ${_histStats.pf} · 총수익 ${_histStats.totalPnl>=0?'+':''}${_histStats.totalPnl}%`;
    }
    _histLine += `</div>`;
  }

  // S109 Phase 3-B-9a-ext-fix5 후속: 신뢰도별 배너 색상 분기
  //   데이터 부족(trades<10)  → info (하늘색) — 신중 분위기
  //   데이터 충족/충분(trades≥10) → pass (녹색) — 검증 완료 분위기
  const _bannerCls = _insufficient ? 'info' : 'pass';

  return `<div class="bt-banner ${_bannerCls}">
    <div class="bt-banner-header"><div class="bt-banner-title ${_bannerCls}">매매전략 — <span style="color:${_bReliColor};font-weight:700">${_bReliLabel}</span></div>${helpBtn}</div>
    ${_statsGrid}
    ${_insufficientNote}
    ${_histLine}
    ${helpHTML}
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// [S356] 종합 점수 전광판 (Score Board) — 분석탭 배너 바로 아래
//   목적: 흩어진 부분점수/4축/구조지표를 서클 그리드로 집약 (한눈 파악)
//   동작: 동기 점수 먼저 노출 → 재무·공시 비동기 채워지면 _sxBoardSetAsync로 확장
//   배치: 배너 직후 — 차후 상단 배너를 대체할 수 있는 포석 (톤 라벨 포함)
//   접힘: 종합 큰 서클 + 섹션 미니 서클 / 펼침: 섹션별 리포트(항목 서클)
//   ※ 분석탭(sx_render) 전용 — 스캐너 워커 미러 불필요
// ══════════════════════════════════════════════════════════════
function _sxbColor(s){
  if(s>=65) return 'var(--buy)';
  if(s>=50) return 'var(--accent)';
  if(s>=35) return '#f59e0b';
  return 'var(--sell)';
}
// [S362] 인버스 색 — 값이 클수록 위험(빨), 작을수록 안정(녹). 구조위치(과열/안정) 전용
function _sxbColorInv(s){
  if(s>=70) return 'var(--sell)';   // 과열
  if(s>=55) return '#f59e0b';        // 주의(상단권)
  if(s<=30) return 'var(--buy)';     // 안정 / 매수 우위
  return 'var(--accent)';             // 중립
}
function _sxbGrade(s){
  if(s>=70) return 'A'; if(s>=55) return 'B'; if(s>=40) return 'C'; if(s>=25) return 'D'; return 'F';
}
function _sxbTone(s){
  if(s>=65) return {t:'강세 우위', c:'var(--buy)'};
  if(s>=55) return {t:'상승 우위', c:'var(--accent)'};
  if(s>=45) return {t:'중립', c:'var(--text2)'};
  if(s>=35) return {t:'약세 우위', c:'#f59e0b'};
  return {t:'약세', c:'var(--sell)'};
}
// SVG 도넛 서클. big=헤드용 대형, neutral=위치값(회색·평균 제외)
// [S357→S502] 전이 삼각형 — 방향(▲/▼)은 Δ 부호 그대로, 색은 '의미'(좋아짐=녹/나빠짐=빨).
//   정방향(높을수록 좋음): ▲녹 / ▼빨 · inverse(구조위치·변동성 등 높을수록 나쁨): ▲빨 / ▼녹
//   〔S502 변경〕 기존 neutral=회색 → inverse 기준 색 반전. 좋은 변화는 항상 녹, 나쁜 변화는 항상 빨.
function _sxbTri(d, inverse){
  if(d==null || isNaN(d) || Math.abs(d)<=2) return '';
  const up = d>0;
  const good = inverse ? !up : up;   // 정방향=상승이 좋음 / inverse=하락이 좋음
  const col = good ? 'var(--buy)' : 'var(--sell)';
  return `<span class="sxb-tri" style="color:${col}">${up?'▲':'▼'}</span>`;
}
// [S385] 분석엔진 파라미터(RSI/BB/ATR/MA) 영향 점수항목 — 이름 보라색 표기(참고용)
//   추세방향/추세신호/이평선배열/골든·데드크로스←MA · 변동성←ATR · 가격모멘텀←RSI · 볼린저%B←BB · 반등신호/강도/눌림목←RSI·BB
const _SXB_PARAM = new Set(['추세방향','추세신호','변동성','가격모멘텀','반등신호','반등강도','눌림목','볼린저%B','크로스신호','추가상승','MTF','방향전이']);
function _sxbCircle(score, label, big, neutral, delta, inverse, byValue, signal, param, colorOverride){
  const r = big?28:18, sw = big?6:5, box=(r+sw)*2;   // [S416] big 32→28/sw 7→6: 헤더 텍스트(상태·등급·▲▼) 한 줄 확보
  const circ = 2*Math.PI*r;
  const sc = Math.max(0, Math.min(100, (typeof score==='number'?score:0)));
  const off = circ*(1-sc/100);
  // [S369] stroke 색: signal('up'/'down')=단방향(≥65만 발동 색) · inverse=값반전 · neutral=회색 · 기본=점수
  // [S417] colorOverride: 헤더 종합점수 도넛 전용 — dist5(TF배지) 색을 그대로 강제해 도넛·배지·TF점 색 일치
  let col;
  if(colorOverride)          col = colorOverride;
  else if(signal === 'up')   col = sc >= 65 ? 'var(--buy)'  : 'var(--text3)';
  else if(signal === 'down') col = sc >= 65 ? 'var(--sell)' : 'var(--text3)';
  else if(inverse)           col = _sxbColorInv(sc);
  else if(neutral)           col = 'var(--text3)';
  else                       col = _sxbColor(sc);
  const fs = big?18:13;   // [S416] big 도넛 축소(r28)에 맞춰 20→18
  // [S414] 점수 숫자 색 = 원(stroke) 색과 완전 통일. 기존 일반 항목은 델타(전이) 기반이라
  //   "점수 77(원 녹색)인데 어제 대비 하락→숫자 빨강" 모순이 생겼음(가격모멘텀 등). 이제 원·숫자·카운터가 한 기준.
  //   전이(어제→오늘 Δ)는 도넛 클릭 토스트(S410)로 확인. signal 미발동(<65)·neutral은 원이 회색이나 숫자는 가독성 위해 기본색.
  let numColor;
  if(colorOverride)          numColor = colorOverride;   // [S417] 헤더 도넛 — 원색과 동일(dist5 색)
  else if(signal === 'up')   numColor = sc >= 65 ? 'var(--buy)'  : 'var(--text)';
  else if(signal === 'down') numColor = sc >= 65 ? 'var(--sell)' : 'var(--text)';
  else if(inverse)           numColor = _sxbColorInv(sc);
  else if(neutral)           numColor = 'var(--text)';
  else                       numColor = _sxbColor(sc);
  return `<div class="sxb-circle${big?' sxb-big':''}"${label && !big ? ` onclick="_sxbWhy && _sxbWhy('${label}')" style="cursor:pointer"` : ''}>`
    + `<svg viewBox="0 0 ${box} ${box}" width="${box}" height="${box}">`
    + `<circle cx="${box/2}" cy="${box/2}" r="${r}" fill="none" stroke="var(--surface3)" stroke-width="${sw}"/>`
    + `<circle cx="${box/2}" cy="${box/2}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${box/2} ${box/2})"/>`
    + `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="800" fill="${numColor}">${Math.round(sc)}</text>`
    + `</svg>`
    + (label?`<div class="sxb-circle-label"${param?' style="color:#a855f7"':''}>${label}${_sxbTri(delta, inverse)}</div>`:'')   // [S502] 전이(어제 대비 |Δ|>2) 도넛 이름 옆 ▲/▼ — 색은 의미 기반(좋음=녹/나쁨=빨). inverse(구조위치 등)는 ▲빨/▼녹 반전
    + `</div>`;
}

// [S375] 도넛 클릭 → "왜 녹/빨인지" 토스트로 사유 표시
//   진입: window._sxBoard.groups에서 항목 찾아 _sxbBuildWhyMsg로 메시지 생성 → toast()
// [S410] 도넛 클릭 토스트 전이 안내 공통 헬퍼 — it.d(전이값) 있는 항목 전부에 "어제→오늘" 한 줄 부착
//   외부 데이터(섹터·공시·도미넌스 등 it.d 없음)는 자동 제외. 전용/byValue/inverse 분기도 이걸로 전이 일관.
function _sxbTrans(it){
  if(!it || typeof it.d !== 'number') return '';
  const v = Math.round(it.v);
  if(Math.abs(it.d) <= 2) return `\n↳ 어제 대비 큰 변화 없음`;
  const prev = Math.round(it.v - it.d);
  return `\n↳ 어제 ${prev} → 오늘 ${v} (Δ ${it.d > 0 ? '+' : ''}${Math.round(it.d)} ${it.d > 0 ? '▲' : '▼'})`;
}
// [S502] 전광판 부문(카테고리) 도넛 클릭 토스트용 — 부문이 무엇을 보는지 한 줄 설명
const _SXB_GROUP_DESC = {
  '추세·구조':   '추세 방향·강도와 가격의 구조적 위치를 종합',
  '모멘텀·진입': '단기 모멘텀과 반등·진입 타이밍을 종합',
  '수급·거래량': '거래량과 자금 유입/이탈 흐름을 종합',
  '펀더멘털':    '밸류·재무·공시 등 기업 체력을 종합',
  '시장·리스크': '거시·심리·이벤트 등 시장 리스크를 종합',
  '기술지표':    '이평선·크로스·과매수도 등 기술적 조건을 종합',
};
// [S502] 부문 도넛 클릭 → 부문 평균 점수·상태·간략 설명·전이 토스트
function _sxbGroupWhy(grp){
  const avg = _sxbAvg(grp.items);
  if(avg == null) return;
  const d = _sxbAvgDelta(grp.items);
  const st = avg>=65 ? '🟢 양호' : (avg<=35 ? '🔴 약세' : '🟡 중립');
  let msg = `📊 ${grp.title} ${avg}점 — ${st}`;
  const desc = _SXB_GROUP_DESC[grp.title];
  if(desc) msg += `\n${desc}`;
  if(typeof d === 'number') msg += _sxbTrans({v: avg, d: d});   // 부문 평균 전이(어제→오늘)
  if(typeof toast === 'function') toast(msg);
  if(typeof _sxVib === 'function') _sxVib(8);
}
function _sxbWhy(itemKey){
  const B = window._sxBoard;
  if(!B || !B.groups) return;
  // [S502] 전광판 부문(추세·구조/모멘텀·진입/수급·거래량/펀더멘털·시장리스크/기술지표) 도넛 — 부문 전용 토스트로 분기
  const grp = B.groups.find(g => g.title === itemKey);
  if(grp){ _sxbGroupWhy(grp); return; }
  let foundItem = null;
  for(const g of B.groups){
    const f = g.items.find(x => x.k === itemKey);
    if(f){ foundItem = f; break; }
  }
  if(!foundItem) return;
  const msg = _sxbBuildWhyMsg(foundItem);
  if(msg){
    if(typeof toast === 'function') toast(msg + _sxbTrans(foundItem)); // [S410] 전이 안내 공통 부착
    if(typeof _sxVib === 'function') _sxVib(8);
  }
}
window._sxbWhy = _sxbWhy;

// [S376/S377] 휩소 배지 클릭 → 사유 토스트
//   엔진판단 방향 ↔ 지표분포 방향 엇갈림 + lowConf 원인 (ADX/ATR/VHF)
//   [S377] 줄바꿈으로 가독성 개선 — 1줄: 엇갈림 / 2줄: 사유
function _sxbWhipWhy(){
  const B = window._sxBoard;
  if(!B) return;
  const momDir = B.verdict && B.verdict.momBadge && B.verdict.momBadge.direction;
  const reasons = (B.lowConfReasons || []).slice();
  // [S432] 엔진방향 vs 지표분포 방향 — distBin은 _sxbHTML에서 _sxBoard.distBin에 저장됨(실제 5분류 압축값).
  const momTxt = momDir === 'up' ? '엔진(▲상승)' : (momDir === 'down' ? '엔진(▼하락)' : '엔진');
  // [S432] 실제 분포방향(distBin) 기반 문구 — flat은 '엇갈림'이 아니라 '지지 부족'으로 구분. 미저장(구버전)이면 momDir 추정 fallback.
  const distBin = B.distBin || null;
  let distTxt, tail;
  if(distBin === 'flat'){ distTxt = '지표(방향 혼조)'; tail = ' — 상승 지지 부족'; }
  else if(distBin === 'down'){ distTxt = '지표(▼하락 우세)'; tail = ' 엇갈림'; }
  else if(distBin === 'up'){ distTxt = '지표(▲상승 우세)'; tail = ' 엇갈림'; }
  else { distTxt = momDir === 'up' ? '지표(▼하락 우세)' : (momDir === 'down' ? '지표(▲상승 우세)' : '지표'); tail = ' 엇갈림'; }
  const reasonTxt = reasons.length ? `\n사유: ${reasons.join(', ')}` : '';
  const msg = `⚡ 휩소주의: ${momTxt} ↔ ${distTxt}${tail}${reasonTxt}`;
  if(typeof toast === 'function') toast(msg);
  if(typeof _sxVib === 'function') _sxVib(8);
}
window._sxbWhipWhy = _sxbWhipWhy;

// [S400/S419] 되돌림주의 배지 클릭 → 발동된 위험 사유 나열 토스트 (투매·다이버전스·과열 흡수)
function _sxbDumpWhy(){
  const B = window._sxBoard;
  if(!B || !B.dumpWarn) return;
  const rs = (B.dumpWarn.reasons && B.dumpWarn.reasons.length) ? B.dumpWarn.reasons : [{l:'위험 신호 감지'}];
  const lines = rs.map(r => `• ${r.l}`).join('\n');
  const msg = `⚠️ 되돌림주의 — 천정/조정 위험 신호 ${rs.length}건\n${lines}\n\n상승 동력이 약하거나 추격 위험이 큰 구간입니다. 익절·손절 기준을 점검하세요.`;
  if(typeof toast === 'function') toast(msg);
  if(typeof _sxVib === 'function') _sxVib(8);
}
window._sxbDumpWhy = _sxbDumpWhy;

// [S596] 도넛 전이 배지 클릭 → 어제 대비 도넛 점수 개선/악화 분포 토스트
function _sxbTransWhy(){
  const B = window._sxBoard;
  if(!B || !B._transInfo) return;
  const t = B._transInfo;
  const dir = t.net >= 2 ? '개선 우위' : (t.net <= -2 ? '악화 우위' : '정체(혼조)');
  const msg = `📊 도넛 전이 — ${dir}\n상승 ${t.up}개 · 하락 ${t.dn}개 · 보합 ${t.flat}개 (어제 대비 |Δ|>2 기준)\n\n현재 점수 위치(5분류)와 별개로, 지표들이 집단적으로 좋아지는지/꺾이는지 방향을 봅니다.`;
  if(typeof toast === 'function') toast(msg);
  if(typeof _sxVib === 'function') _sxVib(8);
}
window._sxbTransWhy = _sxbTransWhy;

// [S434] 안전필터감지 배지 클릭 → 진입보류 사유(안전필터 위반) 나열 토스트
function _sxbSafetyWhy(){
  const B = window._sxBoard;
  if(!B || !B.verdict) return;
  const viol = (B.verdict.safetyViol && B.verdict.safetyViol.length)
    ? B.verdict.safetyViol
    : (B.verdict.capReason ? String(B.verdict.capReason).split(' · ') : []);
  if(!viol.length) return;
  const _capped = !!B.verdict.capReason;
  const lines = viol.map(v => `• ${String(v).replace(/^🔒/, '')}`).join('\n');
  const _head = _capped ? `🔒 안전필터감지 — 진입보류 (${viol.length}건)` : `🔒 안전필터 위험 (${viol.length}건)`;
  const _foot = _capped
    ? '기술적 매수 신호가 있어도 위험 징후가 감지돼 진입을 보류합니다.'
    : '위험 징후가 감지됐어요. 등급 강등까진 아니지만 진입 시 참고하세요.';
  const msg = `${_head}\n${lines}\n\n${_foot} 설정 탭에서 개별 안전필터를 끌 수 있습니다.`;
  if(typeof toast === 'function') toast(msg);
  if(typeof _sxVib === 'function') _sxVib(8);
}
window._sxbSafetyWhy = _sxbSafetyWhy;
// [S477] 상위TF 과열 배지 클릭 → 어느 TF가 왜 과열인지(RSI 과매수 / MA이격 추격) 간략 토스트
function _sxbMtfWhy(){
  const m = window._sxBoard && window._sxBoard._mtf;
  if(!m || !m.det){ if(typeof toast === 'function') toast('⚠️ 상위TF 과열 — 상세 정보 없음'); return; }
  const _lab = { week:'주봉', month:'월봉' };
  const lines = [];
  ['week','month'].forEach(function(tf){
    const d = m.det[tf];
    if(d && d.overheat){
      const ps = [];
      if(d.rsiOver)  ps.push(`RSI ${d.rsi} 과매수`);
      if(d.dispOver) ps.push(`MA20 이격 ${d.dispX}×ATR (추격 과열)`);
      lines.push(`· ${_lab[tf]}: ${ps.join(' · ')}`);
    }
  });
  if(!lines.length) lines.push('· 상위 시간대 과매수/추격 구간');
  const msg = `⚠️ 상위TF 과열\n${lines.join('\n')}\n\n상위 시간대가 과열 구간입니다. 신규 진입은 되돌림 후가 더 안전합니다.`;
  if(typeof toast === 'function') toast(msg);
}
window._sxbMtfWhy = _sxbMtfWhy;

// [S456] 매수신호 혼조 토스트 — A(분석엔진)와 B(BT) 충돌 사유
function _sxbMixWhy(){
  const B = window._sxBoard;
  if(!B || !B.mixWarn || !B.mixWarn.on) return;
  const m = B.mixWarn;
  let msg = `🔀 매수신호 혼조\n${m.detail || ''}`;
  if(m.reasons && m.reasons.length){
    msg += `\n\n안전필터 사유 (${m.reasons.length}건):\n` + m.reasons.map(r => `• ${r}`).join('\n');
  }
  msg += `\n\n분석엔진(▲/▼ 보라)과 백테스트(▲/▼ 녹·빨)의 판단이 엇갈립니다. 검토영역에서 근거를 확인하세요.`;
  if(typeof toast === 'function') toast(msg);
  if(typeof _sxVib === 'function') _sxVib(8);
}
window._sxbMixWhy = _sxbMixWhy;

// [S473] 종합점수 도넛 클릭 → 안전필터 위험(감점/강등) 내역 토스트. _sxbHTML이 저장한 _sxBoard._riskInfo 사용.
function _sxbScoreWhy(){
  const B = window._sxBoard;
  if(!B || !B._riskInfo) return;
  const r = B._riskInfo;
  let msg;
  if(!r.viol || !r.viol.length){
    msg = `📊 종합점수 ${r.display}\n🔒 안전필터 위험 없음 — 감점 없이 그대로예요.`;
  } else {
    const _names = r.viol.map(function(v){ return String(v).replace(/🔒/g, ''); });
    const _show = _names.slice(0, 6).join(' · ') + (_names.length > 6 ? ` 외 ${_names.length - 6}건` : '');
    let _detail = '';
    if(r.penalty > 0) _detail += `\n감점 −${r.penalty}점`;
    if(r.capApplied) _detail += `${r.penalty > 0 ? ' · ' : '\n'}위험 과다로 상한 ${r.cap}점 강등`;
    const _head = (r.display !== r.orig) ? `📊 종합점수 ${r.display} (기본 ${r.orig})` : `📊 종합점수 ${r.display}`;
    msg = `${_head}\n🔒 안전필터 위험 ${r.viol.length}건\n${_show}${_detail}`;
  }
  if(typeof toast === 'function') toast(msg);
  if(typeof _sxVib === 'function') _sxVib(8);
}
window._sxbScoreWhy = _sxbScoreWhy;

// [S375] 항목별 토스트 메시지 빌더 — 점수 색(녹/빨) 사유 설명
function _sxbBuildWhyMsg(it){
  const v = it.v, k = it.k;
  // [S390] MTF / 투자자수급 — 전용 설명 (byValue 기본 메시지보다 우선)
  if(k === 'MTF'){
    const lv = v>=80?'강한 상승 정합':v>=60?'상승 우세':v>40?'혼조':v>=20?'하락 우세':'강한 하락 정합';
    return `📊 MTF ${v}점 — 일·주·월 ${lv} (상위TF 가중)`;
  }
  if(k === '방향전이'){   // [S415] 추세점수(trendPure)의 최근 3봉 평균 대비 변화
    const td = (typeof it._td==='number') ? it._td : null;
    const lv = v>=65?'추세 강화 중 (상승 동력 ↑)':v<=35?'추세 약화 중 (동력 ↓)':'추세 유지 (큰 변화 없음)';
    const tdTxt = td!=null ? ` · 추세점수 3봉평균 대비 ${td>0?'+':''}${td}` : '';
    return `🧭 방향전이 ${v}점 — ${lv}${tdTxt}`;
  }
  if(k === '투자자수급'){
    const lv = v>=65?'외국인·기관 매수세':v<=35?'외국인·기관 매도세':'중립';
    return `💰 투자자수급 ${v}점 — 연속 순매수 기준 ${lv}`;
  }
  if(k === '섹터'){
    const lv = v>=70?'강세 업종':v>=45?'중립 업종':'약세 업종';
    const _detail = (it._rank && it._total) ? ` · ${it._total}개 중 ${it._rank}위${it._sname?' ('+it._sname+')':(it._etf?' ('+it._etf+')':'')}` : '';
    return `🏭 섹터 ${v}점 — ${lv}${_detail}`;
  }
  if(k === '시장심리'){
    const lv = v>=75?'탐욕 (과열 주의)':v>=55?'탐욕 우세':v>45?'중립':v>=25?'공포 우세':'극단 공포';
    return `😨 시장심리 ${v} — 공포탐욕지수 ${lv}`;
  }
  if(k === 'MFI'){
    const lv = v>=65?'자금 유입(매집)':v<=35?'자금 유출(분산)':'중립';
    return `💵 MFI ${v}점 — 가격×거래량 자금흐름 ${lv}`;
  }
  if(k === '도미넌스'){
    const _d = (it._dom!=null) ? ` (BTC.D ${Number(it._dom).toFixed(1)}%)` : '';
    const lv = it._isBtc
      ? (v>=65?'BTC 자금 쏠림 — 강세':v<=35?'BTC 이탈 — 약세':'중립')
      : (v>=65?'알트 우호 — 강세':v<=35?'BTC 쏠림 — 알트 약세':'중립');
    return `🟠 도미넌스 ${v}점${_d} — ${lv}`;
  }
  if(k === '김프'){
    const _k = (it._km!=null) ? ` (${it._km>0?'+':''}${Number(it._km).toFixed(2)}%)` : '';
    const lv = v<=35?'고프리미엄 — 국내 과열 주의':v>=65?'역프/저프 — 저평가':'정상 범위';
    return `🇰🇷 김프 ${v}점${_k} — ${lv}`;
  }
  if(k === '심리도'){
    const lv = v>=75?'과매수 심리':v>=60?'상승 심리':v<=25?'과매도 심리':v<=40?'하락 심리':'중립';
    return `🧠 심리도 ${v}점 — 최근 상승일 비율 ${lv}`;
  }
  if(k === '공시'){   // [S502] 상태 라벨 세분화 + 의미 한 줄 보강
    const lv = v<=10?'⛔ 거래지원 종료·상폐 위험':v<=30?'⚠️ 투자 유의·관리종목':v>=70?'특이 공시 없음 (양호)':'경미한 공시 주의';
    return `📑 공시 ${v}점 — ${lv}\n관리·유의·상폐 등 위험 공시 점검`;
  }
  // [S502] 상대강도(RS) — 시장(지수) 대비 상대 수익률 강도. byValue 기본('양호/약세')보다 우선
  if(k === '상대강도'){
    const lv = v>=65?'시장 대비 강세 (지수 아웃퍼폼)':v<=35?'시장 대비 약세 (지수 언더퍼폼)':'시장과 비슷한 흐름';
    const ic = v>=65?'🟢':v<=35?'🔴':'⚪';
    return `${ic} 상대강도 ${v}점 — ${lv}\n시장지수 대비 종목의 상대 강도`;
  }
  // [S502] 대금전이 — 거래대금 유입/이탈 추세. byValue 기본보다 우선
  if(k === '대금전이'){
    const lv = v>=65?'거래대금 유입 (매수 자금 증가)':v<=35?'거래대금 이탈 (자금 빠짐)':'자금 흐름 중립';
    const ic = v>=65?'🟢':v<=35?'🔴':'⚪';
    return `${ic} 대금전이 ${v}점 — ${lv}\n최근 거래대금의 유입/이탈 방향`;
  }
  // [S502] 밸류 — 적정가 대비 가격 매력(높을수록 저평가). 기존 점수만 표시 → 상태 설명 보강
  if(k === '밸류'){
    const lv = v>=65?'저평가 영역 (가격 매력)':v<=35?'고평가 영역 (가격 부담)':'적정 밸류 수준';
    const ic = v>=65?'🟢':v<=35?'🔴':'⚪';
    return `${ic} 밸류 ${v}점 — ${lv}\n적정가·수급 대비 가격 매력도`;
  }
  // [S502] 재무 — 재무 건전성 종합. 기존 점수만 표시 → 상태 설명 보강
  if(k === '재무'){
    const lv = v>=70?'재무 건전 (안정적)':v>=45?'재무 보통':'재무 취약 (주의)';
    const ic = v>=70?'🟢':v<35?'🔴':'⚪';
    return `${ic} 재무 ${v}점 — ${lv}\n수익성·안정성 등 재무 체력`;
  }
  // [S361] 양방향 크로스신호 (골든/데드 통합)
  if(k === '크로스신호'){
    const fired = (it.fired || []).filter(x=>x);
    const n = fired.length;
    if(n === 0) return `🔀 크로스신호 ${v}점 — 발동된 크로스 없음 (중립)`;
    const dir = v >= 50 ? '골든(상승 전환)' : '데드(하락 전환)';
    const icon = v >= 65 ? '✨' : v <= 35 ? '⚠' : '🔀';
    const note = n < 2 ? '\n(2개↑부터 색 표시 · 현재 1개라 중립)' : '';
    return `${icon} 크로스신호 ${v}점 · ${dir} ${n}개: ${fired.join(', ')}${note}`;
  }
  // [S361] 추가상승 (순추세 추격 여력)
  if(k === '추가상승'){
    const lv = v>=70?'강함':v>=50?'보통':v>=30?'약함':'미흡';
    const txt = v>=65?'순추세 추격 유효':v<=35?'추세 추격 부적합':'중립';
    return `🚀 추가상승 ${v}점 — ${lv} · ${txt}`;
  }
  // 단방향 GC (signal='up')
  if(it.signal === 'up'){
    const fired = (it.fired || []).filter(x=>x);
    if(fired.length){
      const _note = fired.length < 2 ? '\n(2개↑부터 녹색 · 현재 보조 1개)' : '';
      return `✨ ${k} ${v}점 · ${fired.length}개 발동: ${fired.join(', ')}${_note}`;
    }
    return `${k} ${v}점 — 발동 시그널 없음`;
  }
  // 단방향 DC (signal='down')
  if(it.signal === 'down'){
    const fired = (it.fired || []).filter(x=>x);
    if(fired.length){
      const _note = fired.length < 2 ? '\n(2개↑부터 빨강 · 현재 보조 1개)' : '';
      return `⚠ ${k} ${v}점 · ${fired.length}개 발동: ${fired.join(', ')}${_note}`;
    }
    return `${k} ${v}점 — 발동 시그널 없음`;
  }
  // 인버스 (구조위치/변동성/스토캐스틱/볼린저) — 값 자체 색 + 항목별 위치 설명
  if(it.inverse){
    return _sxbInverseLabel(k, v);
  }
  // byValue (값 정방향) — 추세강도/A/D/EOM/Chaikin/이평선 배열
  if(it.byValue){
    if(v >= 65) return `🟢 ${k} ${v}점 — ${_sxbValueLabel(k, v, true)}`;
    if(v <= 35) return `🔴 ${k} ${v}점 — ${_sxbValueLabel(k, v, false)}`;
    return `${k} ${v}점 — 중립`;
  }
  // 일반 (델타 기준) — 4축/부문점수. [S410] 전이("어제→오늘")는 _sxbTrans가 공통 부착하므로 여기선 색(델타 방향) base만
  if(typeof it.d === 'number'){
    if(it.d > 2) return `🟢 ${k} ${v}점`;
    if(it.d < -2) return `🔴 ${k} ${v}점`;
    return `${k} ${v}점`;
  }
  // 그 외 (펀더멘털 등 델타 없는 항목)
  return `${k} ${v}점`;
}

// [S366] 인버스 항목별 위치 설명 — 구조위치/변동성/스토캐스틱/볼린저 (높음=경고/낮음=양호)
function _sxbInverseLabel(key, val){
  switch(key){
    case '변동성':
      if(val >= 70) return `🔴 변동성 ${val} — 변동 폭 큼 (리스크 높음)`;
      if(val <= 30) return `🟢 변동성 ${val} — 변동 폭 낮음 (안정권)`;
      return `변동성 ${val} — 보통 수준`;
    case '스토캐스틱':
      if(val >= 70) return `🔴 스토캐스틱 %K ${val} — 과매수권 (조정 주의)`;
      if(val <= 30) return `🟢 스토캐스틱 %K ${val} — 과매도권 (반등 가능)`;
      return `스토캐스틱 %K ${val} — 중립권`;
    case '볼린저%B':
      if(val >= 70) return `🔴 볼린저 ${val}% — 밴드 상단권 (과매수)`;
      if(val <= 30) return `🟢 볼린저 ${val}% — 밴드 하단권 (과매도)`;
      return `볼린저 ${val}% — 밴드 중앙권`;
    case '구조위치':
    default:
      if(val >= 70) return `🔴 ${key} ${val}% — 20봉 고가권 (과열 주의)`;
      if(val <= 30) return `🟢 ${key} ${val}% — 20봉 저가권 (안정/매수 우위)`;
      return `${key} ${val}% — 중립 구간`;
  }
}
// [S375] byValue 항목별 의미 라벨 — 점수 사유 설명용
function _sxbValueLabel(key, val, positive){
  switch(key){
    case '추세강도':
      return positive ? `ADX ${val} — 강한 추세 형성 중` : `ADX ${val} — 추세 약함 (횡보·전환)`;
    case 'A/D':
      return positive ? '매집 우위 (상승세)' : '분산 우위 (하락세)';
    case 'EOM':
      return positive ? '매수세 우위' : '매도세 우위';
    case 'Chaikin':
      return positive ? '매집 우위 (Chaikin 양수)' : '분산 우위 (Chaikin 음수)';
    case '이평선 배열':
      if(val >= 85) return '완전 정배열 (MA5 > MA20 > MA60)';
      if(val >= 60) return '단기 정배열 (5>20)';
      if(val <= 15) return '완전 역배열 (MA5 < MA20 < MA60)';
      if(val <= 45) return '부분 역배열';
      return '혼조 구간';
    default:
      return positive ? '양호' : '약세';
  }
}
// 점수성 항목만 평균 (neutral=위치값은 제외 / [S367] inverse는 역산 100-v로 포함)
// [S383] 종합점수 6요소 비중 — 전역 기본값 + localStorage 오버라이드. 설정탭 모달에서 조절.
const _SXB_W_DEFAULT = {
  kr:   { trend:0.24, mom:0.16, flow:0.22, fund:0.13, tech:0.13, badge:0.12 },
  us:   { trend:0.24, mom:0.16, flow:0.16, fund:0.18, tech:0.14, badge:0.12 },
  coin: { trend:0.24, mom:0.22, flow:0.15, fund:0.05, tech:0.18, badge:0.16 },
};
function _sxbGetWeights(mkt){
  try{
    const raw = localStorage.getItem('SX_SCORE_WEIGHTS');
    if(raw){ const o = JSON.parse(raw); if(o && o[mkt]) return o[mkt]; }
  }catch(e){}
  return _SXB_W_DEFAULT[mkt] || _SXB_W_DEFAULT.kr;
}
function _sxbSaveWeights(mkt, w){
  try{
    const raw = localStorage.getItem('SX_SCORE_WEIGHTS');
    const o = raw ? JSON.parse(raw) : {};
    o[mkt] = w;
    localStorage.setItem('SX_SCORE_WEIGHTS', JSON.stringify(o));
    return true;
  }catch(e){ return false; }
}

// [S383] 종합점수 비중 조절 모달
let _swCur = 'kr';
const _swKeys = ['trend','mom','flow','fund','tech','badge'];
function openScoreWeightModal(){
  _swCur = (typeof currentMarket !== 'undefined' && _SXB_W_DEFAULT[currentMarket]) ? currentMarket : 'kr';
  _swRender();
  const m = document.getElementById('scoreWeightModal'); if(m){ m.style.display = 'flex'; try{ history.pushState({view:'scoreWeightModal'}, ''); }catch(_){} }  // [S386] 뒤로가기 닫기
}
function closeScoreWeightModal(){
  const m = document.getElementById('scoreWeightModal'); if(m) m.style.display = 'none';
}
function _swSelectMarket(mkt){ _swCur = mkt; _swRender(); }
function _swRender(){
  const w = _sxbGetWeights(_swCur);
  ['kr','us','coin'].forEach(m=>{
    const t = document.getElementById('swTab_'+m);
    if(t){ const on = (m===_swCur); t.style.background = on?'var(--accent)':'var(--surface2)'; t.style.color = on?'#fff':'var(--text)'; }
  });
  _swKeys.forEach(k=>{
    const v = Math.round((w[k]||0) * 100);
    const s = document.getElementById('sw_'+k), vv = document.getElementById('swv_'+k);
    if(s) s.value = v; if(vv) vv.textContent = v;
  });
  _swSlide();
}
function _swSlide(){
  let sum = 0;
  _swKeys.forEach(k=>{
    const s = document.getElementById('sw_'+k), vv = document.getElementById('swv_'+k);
    if(s){ sum += parseInt(s.value)||0; if(vv) vv.textContent = s.value; }
  });
  const el = document.getElementById('swSum');
  if(el) el.textContent = '합계 ' + sum + '%  (비율로 자동 정규화)';
}
function _swSave(){
  const w = {};
  _swKeys.forEach(k=>{ const s = document.getElementById('sw_'+k); w[k] = (parseInt(s.value)||0)/100; });
  _sxbSaveWeights(_swCur, w);
  if(typeof toast === 'function') toast(_swCur.toUpperCase() + ' 종합점수 비중 저장됨 — 재분석 시 적용');
}
function _swReset(){
  _sxbSaveWeights(_swCur, _SXB_W_DEFAULT[_swCur]);
  _swRender();
  if(typeof toast === 'function') toast(_swCur.toUpperCase() + ' 기본값 복원');
}

function _sxbAvg(items){
  const vs = items.filter(it=>typeof it.v==='number' && (it.inverse || !it.neutral))
    .map(it=> it.inverse ? (100 - it.v) : it.v);
  if(!vs.length) return null;
  return Math.round(vs.reduce((a,b)=>a+b,0)/vs.length);
}
// [S357] 섹션 전이 = 델타 있는 점수성 항목들의 평균 변화
function _sxbAvgDelta(items){
  const ds = items.filter(it=>!it.neutral && typeof it.d==='number').map(it=>it.d);
  if(!ds.length) return null;
  return Math.round(ds.reduce((a,b)=>a+b,0)/ds.length);
}
// 현재 window._sxBoard 상태로 전체 HTML 생성 (헤드 + 미니 + 상세)
// [S388] MTF 점수 — 일/주/월 dist5(5분류) 가중 종합 → 전체 추세 정합도
//   방향: 강한상승+2 / 약한상승+1 / 방향혼조0 / 약한하락-1 / 강한하락-2
//   가중: 일1.0·주1.3·월1.6 (상위 TF 우대 → "한 단계 위 TF 동조" 자동 가점) → 0~100
//   _buildBoardGroups엔 안 넣음(각 TF dist5 계산과 순환 회피) · 분포(greens−reds)만 제외 · 종합점수/개수엔 기여
//   가용 TF만으로 계산(없는 TF 제외) → 주/월 백그라운드 수집 완료 시 갱신
// [S393] 국내 섹터 강세 — 업종 레이더(SXE.sectorRadar) 순위 기반 (1위=100, 꼴찌=0)
//   "등락이 순위를 가린다" → 절대 등락률 대신 상대 순위로 섹터 강약 측정
async function _computeSectorScore(stockCode){
  if(!stockCode) return null;
  try{
    const base = (typeof WORKER_BASE!=='undefined') ? WORKER_BASE : 'https://stock-signal-proxy.cheaheechang.workers.dev';
    // 1) 종목 업종코드(industryCode) — m.stock integration. sise_group no와 동일 숫자 체계 → 한글 형식 무관
    const intTarget = `https://m.stock.naver.com/api/stock/${stockCode}/integration`;
    const intRes = await fetch(`${base}/proxy?url=${encodeURIComponent(intTarget)}`, {signal:AbortSignal.timeout(8000)});
    if(!intRes.ok) return null;
    const intJson = await intRes.json();
    const icode = intJson && (intJson.industryCode != null ? intJson.industryCode : (intJson.data && intJson.data.industryCode));
    if(icode == null) return null;
    // 2) 업종 등락률(sise_group) — no 기준 순위 (등락이 순위를 가린다 → 상대 순위)
    const secRes = await fetch(`${base}/naver/sector?type=upjong`, {signal:AbortSignal.timeout(8000)});
    if(!secRes.ok) return null;
    const raw = await secRes.json();
    if(!raw || !Array.isArray(raw.groups)) return null;
    const sorted = [...raw.groups].sort((a,b)=>b.changeRate - a.changeRate);
    const idx = sorted.findIndex(g => String(g.no) === String(icode));
    if(idx < 0) return null;
    const rank = idx+1, total = sorted.length;
    const v = total>1 ? Math.round((total - rank)/(total - 1)*100) : 50;
    return { v: Math.max(0,Math.min(100,v)), rank, total, name: sorted[idx].name, change: sorted[idx].changeRate };
  }catch(e){ return null; }
}
// [S395] 미국 섹터 — SPDR 11개 섹터 ETF 등락률 순위. 종목 세부 GICS 업종 → ETF 키워드 매핑
const _US_SECTOR_ETF = [
  {etf:'XLK',  kw:['반도체','소프트웨어','전화','컴퓨터','전자','하드웨어','테크','정보기술','데이터','시스템','it']},
  {etf:'XLC',  kw:['통신','미디어','엔터','방송','광고','인터넷','게임','콘텐츠','소셜','양방향']},
  {etf:'XLY',  kw:['자동차','백화점','소매','호텔','레스토랑','레저','의류','다각화된소비자','전문소매','유통','섬유','신발']},
  {etf:'XLP',  kw:['식품','음료','담배','생필품','가정용품','기본소비','화장품']},
  {etf:'XLV',  kw:['제약','바이오','건강','헬스','의료','생명과학','생물공학','건강관리']},
  {etf:'XLF',  kw:['은행','보험','증권','금융','카드','캐피탈','자산운용','창업투자','지주']},
  {etf:'XLE',  kw:['석유','가스','에너지','정유']},
  {etf:'XLI',  kw:['항공','기계','운송','건설','방산','산업','우주','국방','물류','인프라','조선','전기장비','상업서비스']},
  {etf:'XLB',  kw:['화학','금속','철강','종이','목재','포장','소재','광물','비철','건축자재']},
  {etf:'XLU',  kw:['전력','수도','유틸리티']},
  {etf:'XLRE', kw:['부동산','리츠']},
];
let _usEtfCache = null, _usEtfCacheTs = 0;
async function _fetchUsSectorEtfs(base){
  if(_usEtfCache && (Date.now()-_usEtfCacheTs) < 300000) return _usEtfCache;  // 5분 캐시 (시장 공통)
  const results = await Promise.allSettled(_US_SECTOR_ETF.map(async m=>{
    const yf = `https://query1.finance.yahoo.com/v8/finance/chart/${m.etf}?interval=1d&range=5d`;
    const res = await fetch(`${base}/proxy?url=${encodeURIComponent(yf)}`, {signal:AbortSignal.timeout(8000)});
    if(!res.ok) throw 0;
    const j = await res.json();
    const r = j && j.chart && j.chart.result && j.chart.result[0];
    const meta = r && r.meta;
    if(!meta) throw 0;
    const cur = meta.regularMarketPrice, prev = meta.chartPreviousClose != null ? meta.chartPreviousClose : meta.previousClose;
    if(cur==null || prev==null || prev===0) throw 0;
    return { etf:m.etf, chg:((cur-prev)/prev)*100 };
  }));
  const arr = results.filter(x=>x.status==='fulfilled').map(x=>x.value);
  if(arr.length < 3) return null;
  _usEtfCache = arr; _usEtfCacheTs = Date.now();
  return arr;
}
async function _computeUsSectorScore(sector){
  if(!sector) return null;
  try{
    const base = (typeof WORKER_BASE!=='undefined') ? WORKER_BASE : 'https://stock-signal-proxy.cheaheechang.workers.dev';
    const s = String(sector).toLowerCase();
    let etf = null;
    for(const m of _US_SECTOR_ETF){ if(m.kw.some(k=>s.includes(k))){ etf=m.etf; break; } }
    if(!etf) return null;  // 매핑 실패 → 도넛 생략(빈칸 유지)
    const arr = await _fetchUsSectorEtfs(base);
    if(!arr) return null;
    const sorted = [...arr].sort((a,b)=>b.chg - a.chg);
    const idx = sorted.findIndex(x=>x.etf===etf);
    if(idx < 0) return null;
    const rank = idx+1, total = sorted.length;
    const v = total>1 ? Math.round((total - rank)/(total - 1)*100) : 50;
    return { v: Math.max(0,Math.min(100,v)), rank, total, etf };
  }catch(e){ return null; }
}
// [S393] 코인 시장심리 — alternative.me 공포탐욕지수 (0~100, 높을수록 탐욕=강세)
// [S360] 코인 거시지표 통합 — 워커 /coin/macro(KV 10분 캐시)에서 도미넌스+김프+공포를 한 번에 수신.
//   〔이력〕 S357~S359는 도미넌스(coingecko)·김프(coinbase)·공포(alt.me)를 클라가 각자 호출 →
//          coingecko 첫 진입 429면 폴백할 클라 캐시가 없어 도미넌스 누락. S360에서 워커 KV로 통합:
//          전 사용자가 캐시 공유 → 누가 한 번 성공하면 10분간 채워짐. 대시보드(index)와도 값 일치.
//   클라 캐시는 같은 분석 세션 내 중복 호출만 막는 짧은 1분 + stale 폴백.
let _coinMacroCache = { data:null, ts:0 };
const _COIN_MACRO_TTL = 60*1000;
async function _fetchCoinMacro(){
  const now = Date.now();
  if(_coinMacroCache.data && (now - _coinMacroCache.ts) < _COIN_MACRO_TTL) return _coinMacroCache.data;
  try{
    const base = (typeof WORKER_BASE!=='undefined') ? WORKER_BASE : 'https://stock-signal-proxy.cheaheechang.workers.dev';
    const res = await fetch(`${base}/coin/macro`, {signal:AbortSignal.timeout(8000)});
    if(res.ok){
      const j = await res.json();
      if(j){ _coinMacroCache.data = j; _coinMacroCache.ts = now; return j; }
    }
  }catch(e){}
  return _coinMacroCache.data; // stale 폴백
}
// [S357→S360] BTC 도미넌스 점수화 — BTC.D% → 0~100. BTC 종목 정방향 / 알트 뒤집기 (byValue 통일)
function _domScoreFromPct(stock, dom){
  if(dom==null || !isFinite(dom)) return null;
  const norm = Math.max(0, Math.min(100, Math.round((dom - 38) / (62 - 38) * 100)));
  const sym = String(stock && stock.code || '').replace(/^(KRW|BTC|USDT)-/, '').toUpperCase();
  const isBtc = (sym === 'BTC');
  return { v: isBtc ? norm : (100 - norm), _dom: dom, _isBtc: isBtc };
}
// [S357→S359→S360] 김프 점수화 — 김프%(업비트 vs 코인베이스 글로벌KRW) → 0~100 후 뒤집기.
//   과열(고김프)↑ → 점수↓ = 빨강/▼. 김프 산출은 워커 /coin/macro(코인베이스 소스)에서 수행.
function _kmScoreFromPct(km){
  if(km==null || !isFinite(km)) return null;
  const norm = Math.max(0, Math.min(100, Math.round((km + 3) / (5 + 3) * 100)));
  return { v: 100 - norm, _km: km };
}
// [S357] 코인 공시(상폐) — 업비트 거래지원 공지(/news/crypto) 키워드 매칭
//   평상 50(중립) / 유의 종목 지정 25(주황) / 거래지원 종료·상장폐지 0(빨강)
//   반환 itp는 advDisclosure 형식(sectorScore/Grade/Text/tone) — 부문별 점수 카드·전광판 공통 재사용
const _COIN_DISC_CRITICAL = ['거래 지원 종료', '거래지원 종료', '거래지원종료', '상장 폐지', '상장폐지', '거래 종료'];
const _COIN_DISC_WARN = ['유의 종목 지정', '유의종목 지정', '투자 유의', '투자유의', '유의 종목'];
async function _computeCoinDisclosureScore(stock){
  try{
    const base = (typeof WORKER_BASE!=='undefined') ? WORKER_BASE : 'https://stock-signal-proxy.cheaheechang.workers.dev';
    const res = await fetch(`${base}/news/crypto?count=50`, {signal:AbortSignal.timeout(8000)});
    if(!res.ok) return null;
    const j = await res.json();
    const items = (j && (j.items || j.data)) || [];
    if(!Array.isArray(items)) return null;
    const sym = String(stock && stock.code || '').replace(/^(KRW|BTC|USDT)-/, '').toUpperCase();
    const name = String(stock && stock.name || '');
    // 종목 매칭: 제목에 심볼(단어경계) 또는 한글명 포함
    const _mention = (title)=>{
      if(!title) return false;
      const T = String(title);
      if(name && T.indexOf(name) >= 0) return true;
      if(sym && new RegExp(`\\b${sym}\\b`).test(T.toUpperCase())) return true;
      return false;
    };
    let hit = null, grade = 'safe';
    for(const it of items){
      const title = it.title || it.name || '';
      if(!_mention(title)) continue;
      if(_COIN_DISC_CRITICAL.some(k=>title.indexOf(k)>=0)){ hit = title; grade = 'critical'; break; }
      if(_COIN_DISC_WARN.some(k=>title.indexOf(k)>=0)){ hit = title; if(grade!=='critical') grade='warn'; }
    }
    let score, sGrade, tone, sText;
    if(grade === 'critical'){
      score = 0; sGrade = 'F'; tone = 'danger';
      sText = `0점 (F등급). ⛔ 거래지원 종료·상장폐지 공지 감지 — 즉시 정리 검토. 기술적 분석과 무관하게 보유 부적격.`;
    } else if(grade === 'warn'){
      score = 25; sGrade = 'D'; tone = 'bearish';
      sText = `25점 (D등급). ⚠️ 투자 유의 종목 지정 감지 — 거래 위험 경고 상태. 신규 진입 보류 권장.`;
    } else {
      score = 50; sGrade = 'C'; tone = 'neutral';
      sText = `50점 (C등급). 최근 거래지원 관련 공지 없음 — 공시 관점 중립.`;
    }
    return { v: score, itp: { sectorScore: score, sectorGrade: sGrade, tone, sectorText: sText } };
  }catch(e){ return null; }
}
// [S476] MTF — dist5(전광판 종합 5분류) 재종합 대신, 일·주·월 원시 지표로 직접 계산(순환·중복 제거).
//   TF별 순수점수(0~100): 정배열 ±25 · ADX+DI ±25 · RSI ±20 · MACD ±15 · OBV ±15.
//   RSI 과열점은 TF 자체 추세로 동적 — 강추세(정배열&ADX>25&+DI>−DI)면 80, 그 외 72(상승장/하락장 기준 분리).
//   판정엔 미관여 — MTF는 도넛 + 정보 배지 전용. 진입 회피/등급캡은 안전필터·되돌림·C가 담당.
function _mtfTfPure(ind){
  if(!ind) return null;
  // [S479] maAlign 폴백 — calcIndicators는 maAlign을 _advanced에만 두고 최상위엔 안 둠(ma5/20/60 평탄값만).
  //   runAnalysis는 최상위로 보강(sx_render L4143)하지만, 백그라운드 fetch(_fetchMultiTfBackground)는 그 보강을
  //   안 거쳐 ind.maAlign이 없음 → 상위 TF가 전부 스킵돼 MTF 배지 미표시. _advanced.maAlign 폴백으로 모든 경로 작동.
  const _maAlign = ind.maAlign || (ind._advanced && ind._advanced.maAlign) || null;
  if(!ind.rsi || !ind.adx || !ind.macd || !ind.obv || !_maAlign) return null;
  const rsi = (typeof ind.rsi === 'object' ? ind.rsi.val : ind.rsi) ?? 50;
  const adx = ind.adx.adx ?? 0, pdi = ind.adx.pdi ?? 0, mdi = ind.adx.mdi ?? 0;
  const maBull = !!_maAlign.bullish, maBear = !!_maAlign.bearish;
  const diUp = pdi > mdi;
  const strongTrend = maBull && adx > 25 && diUp;
  const overTh = strongTrend ? 80 : 72;                                  // 동적 RSI 과열점
  // [S476] MA 이격 과열 — disparity20을 ATR%로 정규화(TF 스케일 흡수). 변동성 대비 2.5배↑ 이격 = 추격 과열.
  //   이격%를 그대로 쓰면 월봉(20개월 MA)이 늘 과열로 잡혀서, ATR 배수로 환산해 일/주/월 동일 기준 적용.
  const _atrPct = (ind.atr && ind.atr.ratio != null) ? ind.atr.ratio : null;
  const _disp20 = (ind.maDisparity && ind.maDisparity.disparity20 != null) ? ind.maDisparity.disparity20 : null;
  const dispOver = (_atrPct != null && _disp20 != null && _atrPct > 0) ? (_disp20 / _atrPct > 2.5) : false;
  let s = 50;
  s += maBull ? 25 : (maBear ? -25 : 0);                                 // ① 정배열 ±25
  const adxStr = Math.max(0, Math.min(1, (adx - 20) / 30));              // ② ADX20→0 · ADX50→1
  s += (diUp ? 1 : -1) * adxStr * 25;                                    //    강도 × 방향 ±25
  let rsiScore;                                                          // ③ RSI ±20 (과열 초과는 감점)
  if(rsi > overTh) rsiScore = Math.max(-20, 20 - (rsi - overTh) * 2);    //    과열 페널티
  else rsiScore = Math.max(-20, Math.min(20, (rsi - 50) / (overTh - 50) * 20));
  s += rsiScore;
  s += ((ind.macd.macd ?? 0) > (ind.macd.signal ?? 0)) ? 12 : -12;       // ④ MACD 골든/데드
  s += ((ind.macd.hist ?? 0) > 0) ? 3 : -3;                              //    히스토그램 방향
  s += (ind.obv.trend === 'up') ? 15 : (ind.obv.trend === 'down' ? -15 : 0); // ⑤ OBV ±15
  if(dispOver) s -= 5;                                                   // ⑥ MA이격 과대 추가 감점(추격 위험)
  const _rsiOver = rsi > overTh;
  const overheat = _rsiOver || dispOver;                                // [S476] 과열 = RSI 과열 OR 이격 과대(복합)
  const _dispX = (_atrPct != null && _disp20 != null && _atrPct > 0) ? Math.round(_disp20 / _atrPct * 10) / 10 : null;
  return { score: Math.max(0, Math.min(100, Math.round(s))), maBull, maBear, overheat,
           rsi: Math.round(rsi), rsiOver: _rsiOver, dispOver, dispX: _dispX };  // [S477] 토스트 사유용 디테일
}
function _computeMtfScore(){
  if(typeof _analTFCache === 'undefined') return null;
  const _W = {day:1.0, week:1.3, month:1.6};                             // 상위 TF 우대 유지
  let sum=0, wsum=0, n=0;
  const _det = {};
  ['day','week','month'].forEach(tf=>{
    const c = _analTFCache[tf];
    const p = c ? _mtfTfPure(c.indicators) : null;                       // 캐시 미수집 TF는 자동 스킵(가용성 가드)
    if(p){ _det[tf] = p; sum += p.score * _W[tf]; wsum += _W[tf]; n++; }
  });
  if(n === 0 || wsum <= 0) return null;
  const v = Math.max(0, Math.min(100, Math.round(sum / wsum)));
  // 배지 플래그 (정보용 — 판정 무관)
  const _ks = Object.keys(_det);
  const allBull = _ks.length >= 2 && _ks.every(k => _det[k].maBull);
  const anyBear = _ks.some(k => _det[k].maBear);
  const _sc = _ks.map(k => _det[k].score);
  const spread = _sc.length ? (Math.max(..._sc) - Math.min(..._sc)) : 0;
  const htfOver = !!((_det.week && _det.week.overheat) || (_det.month && _det.month.overheat));
  const flags = {
    align:     allBull && !anyBear && spread <= 35,                      // 🔥 3TF 정배열 정합
    overheat:  htfOver,                                                  // ⚠️ 상위TF 과열
    divergent: anyBear || spread > 35                                    // 🔀 3TF 역배열 불일치
  };
  return { v, _n:n, det:_det, flags };
}
// ════════════════════════════════════════════════════════════════
// [S487] 거시 경제지표 발표 배지 — 전광판 헤더 배지줄에 회전 표시
//   목적: 홈에만 있으면 발표 시점을 잊으므로 분석탭에서도 '발표임박/결과발표'를 리마인드
//   대상: 발표 1~2일 전(D-2~D-0) = '[XXX 발표임박]' · 발표 당일~다음날(prev 0~1일) = '[XXX 결과발표]'
//   색상: 홈 경제지표 모달 등급색과 동일(good 초록 / neu 회색 / warn 빨강)
//   클릭: 거시 맥락 한 줄 + 대략적 영향 토스트. 점수엔 미반영(맥락 전용).
//   데이터: 워커 /macro/calendar(KV 6h), prev/next 포함. window._sxMacroCal 캐시(5분).
// ════════════════════════════════════════════════════════════════
const _SX_MACRO_COL = { good:'#22c55e', neu:'#94a3b8', warn:'#ef4444' };
let _sxMacroTimer = null, _sxMacroIdx = 0, _sxMacroSoonIdx = 0, _sxMacroResIdx = 0;
function _sxMacroFetch(){
  const now = Date.now();
  if(window._sxMacroCal && window._sxMacroCalTs && (now - window._sxMacroCalTs) < 300000) return Promise.resolve(window._sxMacroCal);
  const base = (typeof WORKER_BASE !== 'undefined') ? WORKER_BASE : 'https://stock-signal-proxy.cheaheechang.workers.dev';
  return fetch(`${base}/macro/calendar`, {signal: AbortSignal.timeout(9000)})
    .then(r => r.ok ? r.json() : null)
    .then(j => { if(j){ window._sxMacroCal = j; window._sxMacroCalTs = now; } return j; })
    .catch(() => window._sxMacroCal || null);
}
function _sxMacroToday(){ return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Seoul'})); }
function _sxMacroDday(ds, t){ // 'YYYY-MM-DD' → +N(남음)/-N(지남) KST 자정 기준
  if(!ds) return null;
  const p = String(ds).split('-').map(Number); if(p.length<3 || p.some(isNaN)) return null;
  const t0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const d0 = new Date(p[0], p[1]-1, p[2]);
  return Math.round((d0 - t0) / 86400000);
}
function _sxMacroMD(ds){ if(!ds) return ''; const p=String(ds).split('-').map(Number); return (p.length>=3 && !p.some(isNaN)) ? `${p[1]}/${p[2]}` : ''; }
// [S496] 미국(ET) 발표일 → 한국 표시일 보정 (FOMC 오후발표는 shift:1 → 한국 익일 새벽)
function _sxMacroKstShift(ds, shift){
  if(!ds || !shift) return ds;
  const p=String(ds).split('-').map(Number); if(p.length<3 || p.some(isNaN)) return ds;
  const d=new Date(p[0],p[1]-1,p[2]); d.setDate(d.getDate()+shift);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// 지표별 등급(cls)·현재수치 텍스트·주식 영향 한 줄
function _sxMacroJudge(it){
  const pick=(t)=>{const x=(it.vals||[]).find(v=>(v.tag||'')===t);return x?x.v:null;};
  if(it.key==='cpi'||it.key==='pce'||it.key==='ppi'){
    const h=pick(''),c=pick('근원'),m=(c!=null)?c:h;
    const cls = m==null?'neu':(m<2.6?'good':(m<=3.5?'neu':'warn'));
    const curTxt = `${h!=null?h.toFixed(1)+'%':''}${c!=null?' · 근원 '+c.toFixed(1)+'%':''}`.trim();
    return {cls, curTxt, impl:'물가가 목표(2%)보다 높으면 금리 인하가 늦어져 주식에 부담, 둔화될수록 호재예요.'};
  }
  if(it.key==='jobs'){
    const nfp=pick('비농업'),ur=pick('실업');
    const cls = nfp==null?'neu':(nfp<0?'warn':(nfp>=150?'good':(nfp>=50?'neu':'warn')));
    const curTxt = `비농업 ${nfp!=null?(nfp>=0?'+':'')+(nfp/10).toFixed(1)+'만':''}${ur!=null?' · 실업 '+ur.toFixed(1)+'%':''}`.trim();
    return {cls, curTxt, impl:'고용이 견조하면 호재지만 너무 강하면 금리 인하 지연 부담, 급랭하면 침체 우려예요.'};
  }
  if(it.key==='retail'){
    const r=pick(''); const cls = r==null?'neu':(r<0?'warn':(r>=3?'good':(r>=1?'neu':'warn')));
    return {cls, curTxt:(r!=null?r.toFixed(1)+'%':''), impl:'소비가 견조하면 기업이익에 우호적, 위축되면 경기 둔화 신호예요.'};
  }
  if(it.key==='gdp'){
    const g=pick(''); const cls = g==null?'neu':(g<0?'warn':(g>=2.5?'good':(g>=1?'neu':'warn')));
    return {cls, curTxt:(g!=null?((g>=0?'+':'')+g.toFixed(1)+'%(연율)'):''), impl:'성장률 2% 이상이면 경기 견조, 0% 이하면 침체 우려로 부담이에요.'};
  }
  return {cls:'neu', curTxt:'', impl:''};
}
// 임박/결과 이벤트만 추출 (발표임박 D-2~0 · 결과발표 prev 0~1일)
function _sxMacroEvents(){
  const d = window._sxMacroCal; if(!d) return [];
  const t = _sxMacroToday();
  const evs = [];
  const push = (key, emoji, label, next, prev, cls, curTxt, impl, slot, shift) => {
    const kNext = _sxMacroKstShift(next, shift);   // [S496] 한국 표시일 보정(FOMC +1일)
    const kPrev = _sxMacroKstShift(prev, shift);
    const dn = kNext ? _sxMacroDday(kNext, t) : null;     // 다음 발표까지 남은 일(한국 기준)
    const sp = kPrev ? -_sxMacroDday(kPrev, t) : null;    // 직전 발표 후 경과 일
    let mode=null, badgeText=null;
    if(dn!=null && dn>=0 && dn<=2){ mode='soon';   badgeText=`${emoji} ${label} 발표임박`; }
    else if(sp!=null && sp>=0 && sp<=1){ mode='result'; badgeText=`${emoji} ${label} 결과발표`; }
    if(!mode) return;
    const md = _sxMacroMD(kNext);
    const slotTxt = slot ? ' '+slot : '';                // 밤/새벽
    const when = mode==='soon' ? `${emoji} ${label} 곧 발표 (${md}${slotTxt})` : `${emoji} ${label} 방금 발표`;
    const cur  = curTxt ? `\n직전: ${curTxt}` : '';
    const tail = mode==='soon' ? '\n발표 전후 변동성 확대에 유의하세요.' : '';
    // [S488] 다중 임박 시 한 토스트에 모을 간략 1줄 (영향 생략, 공통 변동성 문구는 하단 1회)
    const lineWhen = mode==='soon' ? `발표임박 ${md}${slotTxt}` : '결과발표';
    const toastLine = `${emoji} ${label} · ${lineWhen}${curTxt?' · '+curTxt:''}`;
    evs.push({ key, mode, badgeText, cls, toastLine, toastMsg:`${when}${cur}\n\n${impl}${tail}` });
  };
  if(d.fomc) push('fomc','🏦','FOMC', d.fomc.next, d.fomc.prev, 'neu', d.fomc.rate?('현재 '+d.fomc.rate):'', 'FOMC 금리 결정 — 인하 신호면 호재, 매파적이면 부담이에요.', d.fomc.kstSlot, d.fomc.kstShift);
  (d.indicators||[]).forEach(it=>{ const j=_sxMacroJudge(it); push(it.key, it.emoji, it.label, it.next, it.prev, j.cls, j.curTxt, j.impl, it.kstSlot, it.kstShift); });
  evs.sort((a,b)=> (a.mode==='soon'?0:1) - (b.mode==='soon'?0:1)); // 발표임박 우선
  return evs;
}
function _sxMacroBadgeHTML(ev){
  if(!ev) return '';
  const col = _SX_MACRO_COL[ev.cls] || '#94a3b8';
  // [S501] 클릭 시 해당 타입(임박/결과)만 토스트
  return `<span class="sxb-badge" style="color:${col};background:${col}1A;border:1px solid ${col};cursor:pointer" onclick="event.stopPropagation();_sxMacroWhy && _sxMacroWhy('${ev.mode}')">${ev.badgeText}</span>`;
}
// [S488] 클릭 시: 단일이면 상세, 다중이면 한 토스트에 모아 표시 · [S501] mode 주어지면 그 타입만
function _sxMacroWhy(mode){
  let evs = _sxMacroEvents();
  if(mode) evs = evs.filter(e=>e.mode===mode);
  if(!evs.length || typeof toast !== 'function') return;
  if(evs.length === 1){ toast(evs[0].toastMsg); return; }
  const head = mode==='soon' ? '📅 발표 임박' : mode==='result' ? '📅 결과 발표' : '📅 주요 경제지표 발표 알림';
  const tail = (mode==='result') ? '' : '\n\n발표 전후 변동성 확대에 유의하세요.';
  const body = evs.map(e=>e.toastLine).join('\n');
  toast(`${head}\n\n${body}${tail}`);
}
window._sxMacroWhy = _sxMacroWhy;
function _sxMacroTick(){
  // [S500] 임박/결과를 별도 슬롯으로 분리 — 한 슬롯에서 번갈아 뜨던 혼동 해소.
  //        각 타입이 여러 개일 때만 그 슬롯 안에서 회전.
  const soonSlot = document.getElementById('sxMacroSoonSlot');
  const resSlot  = document.getElementById('sxMacroResultSlot');
  if(!soonSlot && !resSlot) return;       // 배지줄 미존재(다른 화면) → 다음 tick
  const evs = _sxMacroEvents();
  const soon   = evs.filter(e=>e.mode==='soon');
  const result = evs.filter(e=>e.mode==='result');
  if(soonSlot){
    if(soon.length){ if(_sxMacroSoonIdx>=soon.length)_sxMacroSoonIdx=0; soonSlot.innerHTML=_sxMacroBadgeHTML(soon[_sxMacroSoonIdx]); _sxMacroSoonIdx++; }
    else { soonSlot.innerHTML=''; _sxMacroSoonIdx=0; }
  }
  if(resSlot){
    if(result.length){ if(_sxMacroResIdx>=result.length)_sxMacroResIdx=0; resSlot.innerHTML=_sxMacroBadgeHTML(result[_sxMacroResIdx]); _sxMacroResIdx++; }
    else { resSlot.innerHTML=''; _sxMacroResIdx=0; }
  }
}
function _sxMacroInit(){                   // _sxbHTML 호출마다 불려도 안전(fetch 캐시·타이머 중복가드)
  _sxMacroFetch().then(()=>{ _sxMacroSoonIdx=0; _sxMacroResIdx=0; _sxMacroTick(); });
  if(!_sxMacroTimer) _sxMacroTimer = setInterval(_sxMacroTick, 2000); // [S488] 회전(같은 타입 다중 시) 2초
}

function _sxbHTML(){
  _sxMacroInit();  // [S487] 거시 발표 배지 데이터 fetch + 회전 타이머 (idempotent)
  const B = window._sxBoard; if(!B) return '';
  const groups = B.groups;
  // [S369] 평균(종합점수)=neutral 제외 / 분포(▲▼):
  //   · signal='up' (GC): ≥65→▲만 (단방향, 발동 없으면 카운트 없음)
  //   · signal='down' (DC): ≥65→▼만 (단방향)
  //   · 인버스(구조위치): 값 반전 — 과열≥70→▼ · 안정≤30→▲
  //   · byValue(추세강도/A/D/EOM/Chaikin/이평선배열): 값 정방향 — ≥65→▲ · ≤35→▼
  //   · 일반(4축/부문): 델타 기준
  // [S357] ▲▼ 분포 + 5분류 판정 → _classifyBoardDist 단일소스 (멀티TF 칩 배지와 완전 일치)
  const _dist = _classifyBoardDist(groups);
  const greens = _dist.greens, reds = _dist.reds;
  // [S393→S476] MTF (멀티TF 추세 정합) — 순수지표 점수. 모멘텀 그룹 도넛 + 정보 배지 동시 생성.
  //   dist는 MTF 제외(순환 방지) · total/개수엔 기여(byValue). 배지는 판정 무관(정보 톤).
  let _mtfBadge = '';
  {
    const _mtf = _computeMtfScore();
    if(_mtf){
      const _momG = groups.find(g=>g.id==='mom');
      if(_momG && !_momG.items.some(it=>it.k==='MTF')) _momG.items.push({k:'MTF', v:_mtf.v, byValue:true});
      // [S476] MTF 정보 배지 — 파랑 계열(정보 톤), 판정 무관. 안전필터(보라)/되돌림(빨강)/혼조(주황)와 시각 구분.
      const _f = _mtf.flags || {};
      if(window._sxBoard) window._sxBoard._mtf = _mtf;                  // [S477] 과열 토스트(_sxbMtfWhy)용 det 저장
      const _mk = (txt, col, fn) => `<span class="sxb-badge" style="color:${col};background:${col}1A;border:1px solid ${col}${fn?';cursor:pointer':''}"${fn?` onclick="event.stopPropagation();${fn}&&${fn}()"`:''}>${txt}</span>`;
      if(_f.align)     _mtfBadge += _mk('🔥 3TF 정배열 정합', '#3b82f6');   // 정합 — 파랑(자명, 클릭 없음)
      if(_f.divergent) _mtfBadge += _mk('🔀 3TF 역배열 불일치', '#94a3b8'); // 불일치 — 회색(자명, 클릭 없음)
      if(_f.overheat)  _mtfBadge += _mk('⚠️ 상위TF 과열', '#0ea5e9', '_sxbMtfWhy'); // 과열 — 하늘, 클릭 시 사유 토스트
    }
  }
  // [S382/S383] 종합점수 = 6요소 가중평균 (5카테고리 + 카운터배지). 시장별 비중(전역/모달 조절).
  //   · 5카테고리: _sxbAvg(inverse 역산 반영) / 배지: net(▲−▼)을 0~100 점수화
  const _mkt = (typeof currentMarket !== 'undefined' && _SXB_W_DEFAULT[currentMarket]) ? currentMarket : 'kr';
  const _W = _sxbGetWeights(_mkt);
  let _wNum = 0, _wDen = 0, _cnt = 0;
  groups.forEach(g=>{
    const ca = _sxbAvg(g.items);                       // 카테고리 평균 (inverse 역산 반영)
    if(ca != null && _W[g.id] != null){ _wNum += ca * _W[g.id]; _wDen += _W[g.id]; }
    g.items.forEach(it=>{ if(typeof it.v==='number' && (it.inverse || !it.neutral)) _cnt++; }); // 점수 기여 항목 수
  });
  // 카운터배지 → 0~100 점수화 (net=▲−▼, 50 기준) 후 6번째 요소로 가중 편입
  const _badgeScore = Math.max(0, Math.min(100, 50 + (greens - reds) * 5));
  if(_W.badge != null){ _wNum += _badgeScore * _W.badge; _wDen += _W.badge; }
  const total = _wDen > 0 ? Math.round(_wNum / _wDen) : 0;
  if (window._sxBoard) window._sxBoard._total = total; // [S403] verdict 카드 1단계 제동용 종합점수 노출 (원본 — 안전필터 감점 전)
  // [S472] 안전필터 위험 점수화 — 전광판 표시 종합점수에만 반영. verdict 입력(_total)은 원본 유지 → 안전필터 이중 캡 방지(verdict는 등급 캡을 따로 받음).
  //   1단계(평소 감점): 도넛 미반영 순수 위험 — 저항근접·가짜돌파·매물대저항·지지선이탈·되돌림주의. 위반당 -3, 상한 -12.
  //   2단계(위험 과다 강등 캡): 전체 안전필터 위반 수 — 6건+ → 상한 65 / 9건+ → 상한 55.
  let _displayTotal = total;
  {
    const _sv = (B.verdict && Array.isArray(B.verdict.safetyViol)) ? B.verdict.safetyViol : [];
    let _penalty = 0, _capApplied = false, _capVal = 0;
    if(_sv.length){
      const _penaltyKeys = ['저항근접','가짜','매물대','지지선이탈','되돌림주의'];
      let _pc = 0;
      _sv.forEach(function(v){ const _s = String(v); if(_penaltyKeys.some(function(k){ return _s.includes(k); })) _pc++; });
      _penalty = Math.min(12, _pc * 3);
      _displayTotal -= _penalty;                              // 1단계 감점
      const _cap = _sv.length >= 9 ? 55 : (_sv.length >= 6 ? 65 : 100); // 2단계 강등 캡
      const _beforeCap = _displayTotal;
      _displayTotal = Math.max(0, Math.min(_displayTotal, _cap));
      if(_cap < 100 && _beforeCap > _cap){ _capApplied = true; _capVal = _cap; }
    }
    // [S473] 종합점수 도넛 클릭 토스트(_sxbScoreWhy)용 위험 정보 저장
    if(window._sxBoard) window._sxBoard._riskInfo = { orig: total, display: _displayTotal, penalty: _penalty, viol: _sv.slice(), capApplied: _capApplied, cap: _capVal };
  }
  const diff = _dist.diff;                                                 // 분포 차이
  // [S357] 5분류 — _classifyBoardDist 단일소스 (dot=컬러동그라미 / 칩 배지와 동일)
  const distDir = _dist.distDir, bi = _dist.dot, bl = _dist.label, bc = _dist.color;
  const tone = _sxbTone(_displayTotal); // [S472] 표시 종합점수 기준
  // [S357] 전이 방향 배지 (5분류 컬러동그라미 + 라벨)
  const transBadge = `<span class="sxb-badge" style="color:${bc};background:${bc}1A;border:1px solid ${bc}">${bi} ${bl}</span>`;
  // [S596] 도넛 전이 배지 — 어제 대비 도넛 점수가 집단적으로 개선/악화 중인지(방향성).
  //   대상: delta(d) 의미 있는 도넛(_sxbAvgDelta와 동일 기준 — !neutral & d 숫자). |Δ|>2를 상승/하락 전이로 카운트(기존 삼각마커 임계와 통일).
  //   5분류(현재 위치)와 직교 정보 → 별도 배지. 예: '강한상승 + 전이 악화' = 고점 둔화 경고가 한 라벨에 묻히지 않음.
  let _transitionBadge = '';
  {
    let _tUp=0, _tDn=0, _tFlat=0;
    (groups||[]).forEach(g=>g.items.forEach(it=>{
      if(it.k==='MTF') return;
      if(it.neutral || typeof it.d!=='number') return;
      if(it.d > 2) _tUp++; else if(it.d < -2) _tDn++; else _tFlat++;
    }));
    const _tNet = _tUp - _tDn;
    if(window._sxBoard) window._sxBoard._transInfo = { up:_tUp, dn:_tDn, flat:_tFlat, net:_tNet };
    if(_tUp+_tDn+_tFlat > 0){
      let _tc, _tlabel, _ticon;
      if(_tNet >= 2){ _tc='var(--buy)';  _ticon='📈'; _tlabel='전이 개선'; }
      else if(_tNet <= -2){ _tc='var(--sell)'; _ticon='📉'; _tlabel='전이 악화'; }
      else { _tc='#94a3b8'; _ticon='⚖️'; _tlabel='전이 정체'; }
      _transitionBadge = `<span class="sxb-badge" style="color:${_tc};background:${_tc}1A;border:1px solid ${_tc};cursor:pointer" onclick="event.stopPropagation();_sxbTransWhy && _sxbTransWhy()">${_ticon} ${_tlabel}</span>`;
    }
  }
  // [S361/S376] 휩소주의 — 엔진판단 ↔ 지표분포 방향 엇갈림 AND 신뢰도 낮음
  //   distDir이 5단계이므로 binary로 압축해서 엇갈림 판정 (strongUp/up→up, strongDown/down→down)
  let whipBadge = '';
  const _momDir = B.verdict && B.verdict.momBadge && B.verdict.momBadge.direction;
  const _distBin = (distDir==='strongUp'||distDir==='up') ? 'up'
                 : (distDir==='strongDown'||distDir==='down') ? 'down' : 'flat';
  // [S432] 토스트(_sxbWhipWhy)가 실제 분포방향을 읽도록 저장 — momDir로 추정하던 문구를 distBin 기반으로 정확화.
  if(window._sxBoard) window._sxBoard.distBin = _distBin;
  // [S599] 익절청산(매도완료+isWin)은 휩소 제외 — BT가 이익 보고 정상 청산한 건 '엇갈림 함정'이 아님.
  //   손절청산·하락유력 등 위험/손실 청산은 그대로 휩소 판정 대상(모멘텀↔도넛 엇갈리면 경고 유효).
  const _isProfitExit = B.verdict && B.verdict.action === '매도 완료' && B.verdict.isWin === true;
  const _isWhip = _momDir && (_momDir==='up'||_momDir==='down') && _momDir!==_distBin && B.lowConf && !_isProfitExit;
  if(_isWhip){
    const _P='#a855f7';
    // [S376] 휩소 배지 클릭 → 토스트로 사유 표시
    whipBadge = `<span class="sxb-badge" style="color:${_P};background:${_P}1A;border:1px solid ${_P};cursor:pointer" onclick="event.stopPropagation();_sxbWhipWhy && _sxbWhipWhy()">⚡ 휩소주의</span>`;
  }
  // [S400] 투매 주의 배지 — 대금 급증 + 가격 하락 + OBV 이탈 (휩소주의와 같은 헤더 배지 패턴)
  let _dumpBadge = '';
  if(B.dumpWarn && B.dumpWarn.on){
    const _DC='#e8365a';
    _dumpBadge = `<span class="sxb-badge" style="color:${_DC};background:${_DC}1A;border:1px solid ${_DC};cursor:pointer" onclick="event.stopPropagation();_sxbDumpWhy && _sxbDumpWhy()">⚠️ 되돌림주의</span>`;
  }
  // [S434→S475] 안전필터 감지 배지 — 위반(safetyViol) 있으면 항상 표시(차트 마커·등급강등 무관).
  //   capReason(C가 실제 등급 강등) 여부로 강도 구분: 강등=진입보류(보라 강조) / 위반만=위험 N건(주황 주의).
  //   〔S475 이전〕 capReason에만 묶여 있어, 위반이 있어도 C가 등급을 안 낮추면 배지가 누락됐음(혼조 배지로만 보임).
  let _safetyBadge = '';
  {
    const _svB = (B.verdict && Array.isArray(B.verdict.safetyViol)) ? B.verdict.safetyViol : [];
    if(_svB.length){
      // [S476→S477] 안전필터 배지 — 색(보라)·모양·라벨 통일. 원천이 '안전필터'임을 한눈에 식별.
      //   강등(capReason=진입보류) vs 위반만 구분은 라벨에서 빼고 클릭 토스트(_sxbSafetyWhy 헤더)에서 안내.
      const _SC = '#a855f7';                                             // 보라 통일
      const _label = `🔒 안전필터 ${_svB.length}건 감지`;
      _safetyBadge = `<span class="sxb-badge" style="color:${_SC};background:${_SC}1A;border:1px solid ${_SC};cursor:pointer" onclick="event.stopPropagation();_sxbSafetyWhy && _sxbSafetyWhy()">${_label}</span>`;
    }
  }
  // [S456] 매수신호 혼조 배지 — A(분석엔진)와 B(BT)가 당일/최근2봉에 반대로 행동. 주황색, 클릭 시 사유 토스트.
  let _mixBadge = '';
  if(B.mixWarn && B.mixWarn.on){
    const _MC='#f59e0b';
    _mixBadge = `<span class="sxb-badge" style="color:${_MC};background:${_MC}1A;border:1px solid ${_MC};cursor:pointer" onclick="event.stopPropagation();_sxbMixWhy && _sxbMixWhy()">🔀 매수신호 혼조</span>`;
  }
  // [S361→S595] 헤드 큰 서클 점수 색 — 5분류 방향 기준(정규화 distDir, 라벨과 톤 일치)
  const headColorDelta = (distDir==='strongUp'||distDir==='up') ? 5 : ((distDir==='strongDown'||distDir==='down') ? -5 : 0);
  // 헤드 (항상 표시 · 클릭 시 펼침) — 톤 라벨 / 배지 행(전이·휩소) / sub
  // 헤드 [S597] 좌우 2열 — 좌: 점수·판정(도넛/톤/상태/5분류·전이) · 우: 경고·이벤트 배지(휩소/안전필터/되돌림/혼조/MTF/거시)
  const _dirBadges  = `${transBadge}${_transitionBadge}`;                         // 방향 판정 (좌)
  const _warnBadges = `${whipBadge}${_dumpBadge}${_safetyBadge}${_mixBadge}${_mtfBadge}<span id="sxMacroSoonSlot">${_sxMacroBadgeHTML(_sxMacroEvents().find(e=>e.mode==='soon'))}</span><span id="sxMacroResultSlot">${_sxMacroBadgeHTML(_sxMacroEvents().find(e=>e.mode==='result'))}</span>`; // 경고·이벤트 (우)
  let h = `<div class="sxb-head" onclick="_sxVib(8);this.parentElement.classList.toggle('sxb-open')">`
    + `<div class="sxb-head-left">`
    +   `<div class="sxb-head-main">`
    +     `<span onclick="event.stopPropagation();_sxbScoreWhy&&_sxbScoreWhy()" style="cursor:pointer">` + _sxbCircle(_displayTotal, '', true, false, headColorDelta, false, false, null, false, bc) + `</span>`   // [S417] colorOverride=bc(dist5 색): 도넛=배지=TF점 [S472] 표시 종합점수 [S473] 클릭→안전필터 위험 토스트
    +     `<div class="sxb-head-txt">`
    +       `<div class="sxb-head-tone" style="color:${tone.c}">${tone.t}</div>`
    +       `<div class="sxb-head-sub">상태 ${_displayTotal} · ${_sxbGrade(_displayTotal)}등급 · ${_cnt}개 지표 · <span style="color:#16a34a;font-weight:700">▲${greens}</span> <span style="color:#ef4444;font-weight:700">▼${reds}</span></div>`
    +       `<div style="font-size:9px;color:var(--text3);margin-top:2px;letter-spacing:-.2px">종목 상태 점수 · 매매 타이밍은 아래 검토영역 참고</div>`
    +     `</div>`
    +   `</div>`
    +   `<div class="sxb-head-dir">${_dirBadges}</div>`
    + `</div>`
    + `<div class="sxb-head-right">${_warnBadges}</div>`
    + `<span class="sxb-arrow">▶</span></div>`;
  // 미니: 섹션 평균 + 섹션 전이 (접힘 상태에서 노출)
  let mini = `<div class="sxb-mini">`;
  groups.forEach(g=>{ const a=_sxbAvg(g.items); mini += _sxbCircle(a==null?0:a, g.title, false, a==null, _sxbAvgDelta(g.items)); });
  mini += `</div>`;
  // 상세: 섹션 카드 + 항목 전이 (펼침 상태에서 노출)
  let det = `<div class="sxb-detail">`;
  groups.forEach(g=>{
    if(!g.items.length) return;
    det += `<div class="sxb-group"><div class="sxb-group-title">${g.title}</div><div class="sxb-group-items">`;
    g.items.forEach(it=>{ const _pp = _SXB_PARAM.has(it.k) || it.k.indexOf('이평선')===0; det += _sxbCircle(it.v, it.k, false, !!it.neutral, it.d, !!it.inverse, !!it.byValue, it.signal, _pp); });
    det += `</div></div>`;
  });
  det += `</div>`;
  return h + mini + det;
}
// 동기 점수로 전광판 초기 구성 + HTML 반환
// [S357] 전광판 그룹(5카테고리 items) 빌더 — _buildScoreBoard와 멀티TF 5분류(_classifyBoardDist)의 단일 소스.
//   기존 _buildScoreBoard 본문에서 g1~g5 push 로직을 그대로 추출 (동작 불변).
function _buildBoardGroups(scores, sv4, structPos, pbScore, D, extras){
  D = D || {}; extras = extras || {};
  const g1=[], g2=[], g3=[], g4=[], g5=[];
  // ① 추세·구조
  if(sv4 && sv4.trendScore!=null) g1.push({k:'추세방향', v:sv4.trendScore, d:D.trendScore});
  if(scores && scores.trend!=null) g1.push({k:'추세신호', v:scores.trend, d:D.trend});
  if(extras.adx && extras.adx.v!=null) g1.push({k:'추세강도', v:extras.adx.v, d:extras.adx.d, byValue:true});      // [S362/S364] ADX 값 기준 분포
  if(structPos!=null) g1.push({k:'구조위치', v:structPos, neutral:true, inverse:true, d:D.struct});                // [S362] 인버스 색(과열 빨/안정 녹)
  if(extras.vola && extras.vola.v!=null) g1.push({k:'변동성', v:extras.vola.v, neutral:true, inverse:true});       // [S362] ATR% — 변동성 심하면 빨강/양호 녹색
  if(extras.rs && extras.rs.v!=null) g1.push({k:'상대강도', v:extras.rs.v, byValue:true});                         // [S438] RS — 시장(지수) 대비 강도. 점수색·분포 카운트 포함
  // ② 모멘텀·진입
  if(scores && scores.momentum!=null) g2.push({k:'가격모멘텀', v:scores.momentum, d:D.momentum});
  if(sv4 && sv4.readyScore!=null) g2.push({k:'반등신호', v:sv4.readyScore, d:D.readyScore});
  if(sv4 && sv4.entryScore!=null) g2.push({k:'반등강도', v:sv4.entryScore, d:D.entryScore});
  if(pbScore!=null) g2.push({k:'눌림목', v:pbScore, d:D.pb});
  if(extras && extras.trans && extras.trans.v!=null) g2.push({k:'방향전이', v:extras.trans.v, byValue:true, _td:extras.trans._td});  // [S415] 추세 전이(trendPure 3봉평균 대비) — 점수색, 카운터·종합 자동 반영
  // ③ 수급·거래량
  if(scores && scores.volume!=null) g3.push({k:'거래량', v:scores.volume, d:D.volume});
  if(extras.ad && extras.ad.v!=null) g3.push({k:'A/D', v:extras.ad.v, d:extras.ad.d, byValue:true});                // [S362/S364] 상태 값 기준 분포
  if(extras.eom && extras.eom.v!=null) g3.push({k:'EOM', v:extras.eom.v, d:extras.eom.d, byValue:true});            // [S362/S364]
  if(extras.chaikin && extras.chaikin.v!=null) g3.push({k:'Chaikin', v:extras.chaikin.v, d:extras.chaikin.d, byValue:true}); // [S362/S364]
  if(extras.mfi && extras.mfi.v!=null) g3.push({k:'MFI', v:extras.mfi.v, byValue:true});                            // [S357] 자금흐름지수 — US/COIN 수급 보강(투자자수급 없는 시장)
  if(extras.tradeValTrend && extras.tradeValTrend.v!=null) g3.push({k:'대금전이', v:extras.tradeValTrend.v, byValue:true}); // [S400] 거래대금 유입/이탈 추세
  // ④ 펀더멘털 (밸류=동기 / 재무·공시=비동기 · 전이 무의미 → 삼각형 생략)
  //   [S357] 코인은 외국인비율 기반 밸류가 항상 40 고정(무의미) → 제외. 대신 '시장·리스크'로 재구성.
  const _isCoinMkt = (typeof currentMarket!=='undefined' && currentMarket==='coin');
  if(!_isCoinMkt && scores && scores.value!=null) g4.push({k:'밸류', v:scores.value});
  if(extras.psycho && extras.psycho.v!=null) g4.push({k:'심리도', v:extras.psycho.v, byValue:true});                // [S357] 코인 시장·리스크 — 상승일 비율(0~100)
  // ⑤ 기술지표 [S367/S369/S370] — 이평선 배열(7단 정밀 / 누락시 (?) 표시) + GC 단방향 + DC 단방향
  if(extras.maAlign && extras.maAlign.v!=null){
    const _maLabel = extras.maAlign._missing ? '이평선 (?)' : '이평선 배열';
    g5.push({k:_maLabel, v:extras.maAlign.v, byValue:true});
  }
  if(extras.stoch && extras.stoch.v!=null) g5.push({k:'스토캐스틱', v:extras.stoch.v, neutral:true, inverse:true});  // [S366] 과매수=빨강(조정주의)/과매도=녹·종합평균 제외
  if(extras.bb && extras.bb.v!=null) g5.push({k:'볼린저%B', v:extras.bb.v, neutral:true, inverse:true});            // [S366] 동상
  // [S361] 골든/데드 2칸 → 양방향 크로스신호 1칸 + 추가상승 1칸
  if(extras.crosssig && extras.crosssig.v!=null) g5.push({k:'크로스신호', v:extras.crosssig.v, byValue:true, fired:extras.crosssig._fired||[]});
  if(extras.upside && extras.upside.v!=null) g5.push({k:'추가상승', v:extras.upside.v, byValue:true});
  return [
    {id:'trend', title:'추세·구조', items:g1},
    {id:'mom',   title:'모멘텀·진입', items:g2},
    {id:'flow',  title:'수급·거래량', items:g3},
    {id:'fund',  title:_isCoinMkt?'시장·리스크':'펀더멘털', items:g4},   // [S357] 코인은 거시·심리·이벤트 재구성
    {id:'tech',  title:'기술지표', items:g5},
  ];
}

// [S357] ▲▼ 분포 카운트 → 5분류 판정 — _sxbHTML와 멀티TF 칩 배지의 단일 소스.
//   기존 _sxbHTML 인라인(greens/reds + diff 5단계)에서 추출. dot=컬러동그라미(결과탭 팔레트 정합).
function _classifyBoardDist(groups){
  let greens=0, reds=0, nContrib=0;
  (groups||[]).forEach(g=>g.items.forEach(it=>{
    if(it.k === 'MTF') return;   // [S418] MTF는 타 TF dist 종합 → 분포 카운트에 넣으면 자기참조 순환(TF 전환마다 배지 변동). 항상 제외(종합점수 가중·도넛 클릭엔 그대로 기여)
    // [S595] 카운트 대상 도넛 수 — 시장별 임계 정규화 분모. 헤더 _cnt(inverse||!neutral)와 동일 기준(MTF만 제외).
    if(typeof it.v==='number' && (it.inverse || !it.neutral)) nContrib++;
    if(it.signal === 'up' && typeof it.v==='number'){
      if(it.v >= 65) greens++;
    } else if(it.signal === 'down' && typeof it.v==='number'){
      if(it.v >= 65) reds++;
    } else if(it.inverse && typeof it.v==='number'){
      if(it.v >= 70) reds++;
      else if(it.v <= 30) greens++;
    } else if(it.byValue && typeof it.v==='number'){
      if(it.v >= 65) greens++;
      else if(it.v < 35) reds++;
    } else if(!it.neutral && typeof it.v==='number'){
      // [S412] 일반(4축/부문): 델타(어제 대비 변화)→점수 절대값 카운트. [S414] 도넛 원/숫자 색(_sxbColor 녹≥65/빨<35)을 그대로 세어
      //   헤더 5분류·TF 배지·MTF가 "현재 점수 색"과 동기화 (종합점수 톤은 별개 — _sxbTone 유지)
      if(it.v >= 65) greens++;
      else if(it.v < 35) reds++;
    }
  }));
  const diff = greens - reds;
  // [S595] 시장별 임계 정규화 — 도넛 수가 시장마다 다름(코인은 펀더멘털 도넛이 적어 N↓). 동일 '확산 비율'이
  //   동일 라벨이 되도록 기준수(REF≈국내 풀세트) 대비 스케일. 국내(N≈26)=1.0배(기존 동작 보존)·코인(N≈20)≈1.3배.
  //   ndiff만 5분류 라벨에 사용 — raw diff/greens/reds는 표시(▲▼)·종합점수 _badgeScore·headColor 그대로(블래스트 최소).
  //   가드: 데이터 미수신(N<10)이면 정규화 생략 / 과보정 방지 스케일 클램프[0.7~1.6].
  const _REF_DONUTS = 26;
  let ndiff = diff;
  if(nContrib >= 10){
    const _scale = Math.max(0.7, Math.min(1.6, _REF_DONUTS / nContrib));
    ndiff = diff * _scale;
  }
  // [S357] 5분류 + 컬러동그라미 (결과탭 verdict 팔레트와 동일 감각: 🟢매수 🔵관심 ⚪중립 🟠회피 🔴매도)
  let distDir, dot, label, color;
  if(ndiff >= 4){       distDir='strongUp';   dot='🟢'; label='강한상승'; color='var(--buy)'; }
  else if(ndiff >= 2){  distDir='up';         dot='🔵'; label='약한상승'; color='var(--accent)'; }
  else if(ndiff >= -1){ distDir='flat';       dot='⚪'; label='방향혼조'; color='#94a3b8'; }
  else if(ndiff >= -3){ distDir='down';       dot='🟠'; label='약한하락'; color='#f59e0b'; }
  else {                distDir='strongDown'; dot='🔴'; label='강한하락'; color='var(--sell)'; }
  return { greens, reds, diff, ndiff, nContrib, distDir, dot, label, color };
}

// [S357] 전광판 입력(struct/pb/extras/deltas/lowConf) 산출 — runAnalysis 인라인에서 추출.
//   멀티TF 칩 5분류(_computeDist5)와 분석탭 전광판이 동일 입력을 쓰도록 단일소스화.
//   인자: scoreMom = 해당 TF의 _scoreMomentum / tf = 해당 TF 키(이전봉 calcIndicators용).
function _computeBoardInputs(stock, indicators, scores, scoreMom, tf){
  const _curTf = tf || 'day';
  let _boardStruct = null, _boardPb = null;
  const _advBI = indicators && indicators._advanced;
  if(_advBI){
    _boardPb = (_advBI.pullback && _advBI.pullback.score) || 0;                 // adv.pullback?.score || 0 와 동일
    if(_advBI.trend && _advBI.trend.struct && _advBI.trend.struct.pos!=null)
      _boardStruct = Math.round(_advBI.trend.struct.pos*100);
  }
  let _boardDeltas = {}, _boardExtras = {};
  try {
    const _mom357 = scoreMom;
    // [S358] 4축은 기존 전이(3봉 평균 대비 delta) 재사용 — 이미 검증된 모멘텀 값
    if(_mom357){
      if(_mom357.delta!=null)      _boardDeltas.readyScore = _mom357.delta;       // 반등신호
      if(_mom357.entryDelta!=null) _boardDeltas.entryScore = _mom357.entryDelta;  // 반등강도
      if(_mom357.trendDelta!=null) _boardDeltas.trendScore = _mom357.trendDelta;  // 추세방향
    }
    // [S362] 추가 항목 현재값 — 추세강도(ADX)/A/D/EOM/Chaikin (방향 상태→점수 매핑 70/50/30)
    let _gcW = 0, _dcW = 0; // [S367/S369] 골든크로스·데드크로스 가중치 합 (각 만점 18)
    const _gcFired = [], _dcFired = []; // [S375] 발동된 시그널 라벨 — 토스트 표시용
    // [S526] calcIndicators 평탄화로 indicators.rsi=숫자·obv=obvLegacy(div 없음)·squeeze 누락 → 풀 ind(_advanced)에서 읽어야 함.
    //   기존 indicators.rsi.div/.val·obv.div·squeeze 직접 읽기는 전부 undefined라 조용히 미발동(다이버전스·RSI과매도반등·스퀴즈 GC/DC 누락). maAlign은 [S374]서 이미 보강됨.
    const _advR = indicators && indicators._advanced;
    if(indicators){
      if(indicators.adx && indicators.adx.adx!=null) _boardExtras.adx = {v:Math.round(indicators.adx.adx)};
      // [S380] A/D·EOM·Chaikin = 엔진 연속 점수(score100) 사용 (기존 _scoreDir362/_scoreVal362 70/50/30 3단계 폐기)
      if(indicators.ad && indicators.ad.score100!=null) _boardExtras.ad = {v:indicators.ad.score100};
      if(indicators.eom && indicators.eom.score100!=null) _boardExtras.eom = {v:indicators.eom.score100};
      if(indicators.chaikinOsc && indicators.chaikinOsc.score100!=null) _boardExtras.chaikin = {v:indicators.chaikinOsc.score100};
      // [S357] MFI — 투자자수급이 없는 시장(US/COIN) 수급 보강. byValue(≥65 유입/≤35 유출)
      if((currentMarket==='us'||currentMarket==='coin') && indicators.mfi!=null && isFinite(indicators.mfi))
        _boardExtras.mfi = {v: Math.max(0, Math.min(100, Math.round(indicators.mfi)))};
      // [S357] 심리도(Psycho) — 코인 '시장·리스크'. 상승일 비율 0~100, byValue
      if(currentMarket==='coin' && indicators.psycho && indicators.psycho.psycho!=null && isFinite(indicators.psycho.psycho))
        _boardExtras.psycho = {v: Math.max(0, Math.min(100, Math.round(indicators.psycho.psycho)))};
      // [S362→S365] 변동성 (ATR%) — 추세·구조. 높을수록 변동성 큼(inverse 색 → 심하면 빨강/양호 녹색)
      //   시장별 기준: 국내/미국 ATR% 1~7% / 코인 1~9% 를 0~100 매핑
      //   [S365] 국내 상한 5%→7%: 급등 대형주(삼성 등)가 곧장 100 만점 찍던 문제 완화
      if(indicators.atr && indicators.atr.ratio > 0){
        const _isCoin = (stock.market === 'COIN' || stock.market === 'coin');
        const _volaMax = _isCoin ? 9 : 7;
        _boardExtras.vola = {v: Math.max(0, Math.min(100, Math.round((indicators.atr.ratio - 1) / (_volaMax - 1) * 100)))};
      }
      // [S363] 스토캐스틱 %K — 기술지표. 값 정방향(byValue: ≥65 녹/≤35 빨)
      if(indicators.stoch && indicators.stoch.k != null){
        _boardExtras.stoch = {v: Math.max(0, Math.min(100, Math.round(indicators.stoch.k)))};
      }
      // [S364] 볼린저 위치 %B — 기술지표. 밴드 내 위치(byValue: 0=하단/50=중앙/100=상단)
      if(indicators.bb && indicators.bb.pctB != null){
        _boardExtras.bb = {v: Math.max(0, Math.min(100, Math.round(indicators.bb.pctB * 100)))};
      }
      // [S367/S368/S370] ⑤ 기술지표 — 이평선 배열 (7단 정밀 / 3단 fallback / 누락 진단)
      const _maA = indicators.maAlign;
      if(_maA && _maA.short!=null && _maA.mid!=null && _maA.long!=null){
        const s=_maA.short, m=_maA.mid, l=_maA.long;
        let mScore;
        if(s>m && m>l) mScore = 90;            // 완전 정배열
        else if(s>m && m<=l) mScore = 65;      // 단기 정배열만 (5>20, 20≤60)
        else if(s<=m && m>l) mScore = 60;      // 장기 정배열만 (5≤20, 20>60)
        else if(s<m && m<l) mScore = 10;       // 완전 역배열
        else if(s>=m && m<l) mScore = 40;      // 장기 역배열만 (20<60)
        else if(s<m && m>=l) mScore = 35;      // 단기 역배열만 (5<20)
        else mScore = 50;                       // 등호 케이스 (혼조)
        _boardExtras.maAlign = {v: mScore};
      } else if(_maA){
        // [S368] short/mid/long 필드 누락 시 bullish/bearish 플래그로 3단 매핑
        _boardExtras.maAlign = {v: _maA.bullish ? 80 : (_maA.bearish ? 20 : 50)};
      } else {
        // [S370] indicators.maAlign 자체 누락 — 도넛 보이게 점수 50 + 라벨에 (?) 표시 (진단)
        _boardExtras.maAlign = {v: 50, _missing: true};
      }
      // [S367/S375] 상태형 골든크로스 — [S526] _advR(풀 ind) 경유 (평탄화엔 div/squeeze 없음)
      if(_advR && _advR.obv && _advR.obv.div === 'bullish'){ _gcW += 2; _gcFired.push('OBV 상승다이버전스'); }
      if(_advR && _advR.rsi && _advR.rsi.div === 'bullish'){ _gcW += 2; _gcFired.push('RSI 상승다이버전스'); }
      if(_advR && _advR.squeeze && _advR.squeeze.squeeze && indicators.maAlign && indicators.maAlign.bullish){ _gcW += 1; _gcFired.push('스퀴즈+정배열'); }
      // [S369/S375] 상태형 데드크로스 — [S526] _advR 경유
      if(_advR && _advR.obv && _advR.obv.div === 'bearish'){ _dcW += 2; _dcFired.push('OBV 하락다이버전스'); }
      if(_advR && _advR.rsi && _advR.rsi.div === 'bearish'){ _dcW += 2; _dcFired.push('RSI 하락다이버전스'); }
      if(_advR && _advR.squeeze && _advR.squeeze.squeeze && indicators.maAlign && indicators.maAlign.bearish){ _dcW += 1; _dcFired.push('스퀴즈+역배열'); }
    }
    const _rowsB357 = (indicators && indicators._advanced && indicators._advanced.rows) || null;
    if(_rowsB357 && _rowsB357.length>=61 && typeof calcIndicators==='function'){
      const _pRows357 = _rowsB357.slice(0, -1);
      const _prevInd357 = calcIndicators(_pRows357, _curTf);
      const _pAdvR = _prevInd357 && _prevInd357._advanced; // [S526] 1봉 전 풀 ind — rsi.val 등 평탄화 누락분 접근용
      const _pcB=_pRows357[_pRows357.length-1], _ppcB=_pRows357[_pRows357.length-2];
      const _prevCR357 = (_ppcB&&_ppcB.close)?((_pcB.close-_ppcB.close)/_ppcB.close*100):(stock.changeRate||0);
      const _prevScores357 = calcEnhancedScores(Object.assign({},stock,{changeRate:_prevCR357}), _prevInd357);
      if(_prevScores357){
        _boardDeltas.momentum = scores.momentum - _prevScores357.momentum;
        _boardDeltas.volume   = scores.volume   - _prevScores357.volume;
        _boardDeltas.trend    = scores.trend    - _prevScores357.trend;
      }
      const _pAdv357 = _prevInd357 && _prevInd357._advanced;
      if(_pAdv357){
        if(_pAdv357.trend && _pAdv357.trend.struct && _pAdv357.trend.struct.pos!=null && _boardStruct!=null)
          _boardDeltas.struct = _boardStruct - Math.round(_pAdv357.trend.struct.pos*100);
        if(_pAdv357.pullback && _pAdv357.pullback.score!=null && _boardPb!=null)
          _boardDeltas.pb = _boardPb - _pAdv357.pullback.score;
      }
      // [S362] 추가 항목 델타 — 1봉 전 indicators와 비교
      if(_boardExtras.adx && _prevInd357.adx && _prevInd357.adx.adx!=null)
        _boardExtras.adx.d = Math.round(indicators.adx.adx - _prevInd357.adx.adx);
      if(_boardExtras.ad && _prevInd357.ad && _prevInd357.ad.score100!=null)
        _boardExtras.ad.d = indicators.ad.score100 - _prevInd357.ad.score100;
      if(_boardExtras.eom && _prevInd357.eom && _prevInd357.eom.score100!=null)
        _boardExtras.eom.d = indicators.eom.score100 - _prevInd357.eom.score100;
      if(_boardExtras.chaikin && _prevInd357.chaikinOsc && _prevInd357.chaikinOsc.score100!=null)
        _boardExtras.chaikin.d = indicators.chaikinOsc.score100 - _prevInd357.chaikinOsc.score100;
      // [S367/S375] 전이형 골든크로스 (1봉 전 vs 현재 비교)
      // ★★★ 핵심 GC (×3)
      if(indicators.macd && _prevInd357.macd && indicators.macd.hist >= 0 && _prevInd357.macd.hist < 0){ _gcW += 3; _gcFired.push('MACD GC ★'); }
      if(indicators.maAlign && _prevInd357.maAlign
         && indicators.maAlign.short!=null && indicators.maAlign.mid!=null
         && _prevInd357.maAlign.short!=null && _prevInd357.maAlign.mid!=null
         && indicators.maAlign.short > indicators.maAlign.mid
         && _prevInd357.maAlign.short <= _prevInd357.maAlign.mid){ _gcW += 3; _gcFired.push('이평선 GC ★'); }
      // [S387] EMA20×EMA120 골든크로스 (장기 추세 전환 — 핵심 ★3)
      if(indicators.ema20!=null && indicators.ema120!=null && _prevInd357.ema20!=null && _prevInd357.ema120!=null
         && indicators.ema20 > indicators.ema120 && _prevInd357.ema20 <= _prevInd357.ema120){ _gcW += 3; _gcFired.push('EMA20×120 GC ★'); }
      if(_advR && _advR.rsi && _pAdvR && _pAdvR.rsi && _advR.rsi.val!=null && _pAdvR.rsi.val!=null
         && _advR.rsi.val >= 30 && _pAdvR.rsi.val < 30){ _gcW += 3; _gcFired.push('RSI 과매도 반등 ★'); }
      // ★★ 중요 (×2)
      if(indicators.stoch && _prevInd357.stoch
         && indicators.stoch.k!=null && indicators.stoch.d!=null
         && _prevInd357.stoch.k!=null && _prevInd357.stoch.d!=null
         && indicators.stoch.k > indicators.stoch.d
         && _prevInd357.stoch.k <= _prevInd357.stoch.d){ _gcW += 2; _gcFired.push('Stoch GC'); }
      if(indicators.bb && _prevInd357.bb
         && indicators.bb.pctB!=null && _prevInd357.bb.pctB!=null
         && _prevInd357.bb.pctB < 0.2 && indicators.bb.pctB > _prevInd357.bb.pctB){ _gcW += 2; _gcFired.push('BB 하단 반등'); }
      // [S369/S375] 전이형 데드크로스 (GC 거울 대칭)
      // ★★★ 핵심 DC (×3)
      if(indicators.macd && _prevInd357.macd && indicators.macd.hist <= 0 && _prevInd357.macd.hist > 0){ _dcW += 3; _dcFired.push('MACD DC ★'); }
      if(indicators.maAlign && _prevInd357.maAlign
         && indicators.maAlign.short!=null && indicators.maAlign.mid!=null
         && _prevInd357.maAlign.short!=null && _prevInd357.maAlign.mid!=null
         && indicators.maAlign.short < indicators.maAlign.mid
         && _prevInd357.maAlign.short >= _prevInd357.maAlign.mid){ _dcW += 3; _dcFired.push('이평선 DC ★'); }
      // [S387] EMA20×EMA120 데드크로스 (장기 추세 전환 — 핵심 ★3)
      if(indicators.ema20!=null && indicators.ema120!=null && _prevInd357.ema20!=null && _prevInd357.ema120!=null
         && indicators.ema20 < indicators.ema120 && _prevInd357.ema20 >= _prevInd357.ema120){ _dcW += 3; _dcFired.push('EMA20×120 DC ★'); }
      if(_advR && _advR.rsi && _pAdvR && _pAdvR.rsi && _advR.rsi.val!=null && _pAdvR.rsi.val!=null
         && _advR.rsi.val < 70 && _pAdvR.rsi.val >= 70){ _dcW += 3; _dcFired.push('RSI 과매수 이탈 ★'); }
      // ★★ 중요 (×2)
      if(indicators.stoch && _prevInd357.stoch
         && indicators.stoch.k!=null && indicators.stoch.d!=null
         && _prevInd357.stoch.k!=null && _prevInd357.stoch.d!=null
         && indicators.stoch.k < indicators.stoch.d
         && _prevInd357.stoch.k >= _prevInd357.stoch.d){ _dcW += 2; _dcFired.push('Stoch DC'); }
      if(indicators.bb && _prevInd357.bb
         && indicators.bb.pctB!=null && _prevInd357.bb.pctB!=null
         && _prevInd357.bb.pctB > 0.8 && indicators.bb.pctB < _prevInd357.bb.pctB){ _dcW += 2; _dcFired.push('BB 상단 하락'); }
    }
    // [S367/S369] ⑤ 기술지표 — GC/DC 점수 매핑 + [S375] 발동 라벨 첨부
    // [S387] 만점 18→21 (EMA20×120 ★3 추가) · 발동 2개↑ → 65~100(녹/빨) · 1개 → 35~64(회색)
    const _GCDC_MAX = 21;
    const _gcN = _gcFired.length, _dcN = _dcFired.length;
    _boardExtras.gc = {v: _gcN === 0 ? 0 : (_gcN >= 2 ? Math.round(65 + (_gcW/_GCDC_MAX)*35) : Math.round(35 + (_gcW/_GCDC_MAX)*29)), _fired: _gcFired.slice(), _n: _gcN};
    _boardExtras.dc = {v: _dcN === 0 ? 0 : (_dcN >= 2 ? Math.round(65 + (_dcW/_GCDC_MAX)*35) : Math.round(35 + (_dcW/_GCDC_MAX)*29)), _fired: _dcFired.slice(), _n: _dcN};
    // [S361] 양방향 크로스신호 — 골든/데드 통합. 50 중립, 2개+부터 65/35 임계 넘어 색 발동(1개는 방향만 살짝).
    let _csV, _csFired, _csDir;
    if(_gcN === 0 && _dcN === 0){ _csV = 50; _csFired = []; _csDir = 'flat'; }
    else if(_gcN >= _dcN){ // 골든 우위
      _csV = _gcN >= 2 ? Math.round(68 + (_gcW/_GCDC_MAX)*32) : Math.round(56 + (_gcW/_GCDC_MAX)*8);
      _csFired = _gcFired.slice(); _csDir = 'up';
    } else { // 데드 우위
      _csV = _dcN >= 2 ? Math.round(32 - (_dcW/_GCDC_MAX)*32) : Math.round(44 - (_dcW/_GCDC_MAX)*8);
      _csFired = _dcFired.slice(); _csDir = 'down';
    }
    _csV = Math.max(0, Math.min(100, _csV));
    _boardExtras.crosssig = {v: _csV, _fired: _csFired, _dir: _csDir, _gcN: _gcN, _dcN: _dcN};
    // [S361] 추가상승 — scoreMomentum 현재봉 upside (= qs.upsideScore와 동일 소스)
    _boardExtras.upside = {v: (scoreMom && scoreMom.history && scoreMom.history[0] ? (scoreMom.history[0].upsideScore ?? 0) : 0)};
    // [S415] 방향전이 — 추세점수(trendPure)의 3봉평균 대비 변화(trendDelta)를 50 기준 점수화. 강화중=녹/약화중=빨/변화없음=50.
    //   x2.5 스케일: trendDelta ±14 → ~85/~15. byValue(점수색)로 모멘텀·진입 그룹에 편입 → 카운터·종합점수 자동 반영.
    if(scoreMom && scoreMom.trendDelta!=null)
      _boardExtras.trans = {v: Math.max(0, Math.min(100, Math.round(50 + scoreMom.trendDelta * 2.5))), _td: scoreMom.trendDelta};
  } catch(_e357){ /* 전이 계산 실패 시 삼각형 없이 진행 (안전) */ }

  // [S359/S376] 휩소 신뢰도 — 추세 약함(ADX<25) or 변동성 큼(ATR%≥5) or 횡보(VHF ranging)
  //   [S376] 사유 라벨도 함께 누적해서 휩소 배지 클릭 시 토스트로 표시
  let _lowConf = false;
  const _lowConfReasons = [];
  try {
    const _adxV = indicators && indicators.adx && indicators.adx.adx;
    const _atrR = indicators && indicators.atr && indicators.atr.ratio;
    const _vhfT = indicators && indicators.vhf && indicators.vhf.trending;
    if(_adxV!=null && _adxV<25) _lowConfReasons.push(`ADX ${Math.round(_adxV)} (추세 약함)`);
    if(_atrR!=null && _atrR>=5) _lowConfReasons.push(`ATR ${Number(_atrR).toFixed(1)}% (변동성↑)`);
    if(_vhfT==='ranging') _lowConfReasons.push('VHF 횡보 구간');
    _lowConf = _lowConfReasons.length > 0;
  } catch(_eLC){}
  _boardExtras._lowConfReasons = _lowConfReasons;

  // [S400+S419→S431] 되돌림주의(dumpWarn) — SXE.calcDumpWarn 단일소스 호출.
  //   투매(대금급증≥65+가격하락+OBV이탈) + 천정위험(RSI/OBV 약세 다이버전스, 과열). 조건검색탭 '되돌림주의 제외'와 동일 판정.
  //   tvScore는 전광판 '대금전이' 항목 복원용(기존 _boardExtras.tradeValTrend). market은 vola 코인판정용으로 stock.market 전달(기존 동일).
  try {
    const _dw = (SXE && SXE.calcDumpWarn) ? SXE.calcDumpWarn(stock._lastAnalCandles || [], indicators, stock.changeRate, stock.market) : null;
    if(_dw){
      if(_dw.tvScore != null) _boardExtras.tradeValTrend = { v: _dw.tvScore };
      if(_dw.on) _boardExtras.dumpWarn = { on:true, reasons:_dw.reasons, tv:_dw.tvScore };
    }
  } catch(_eDW){ /* dumpWarn 실패 시 항목 없이 진행 (안전) */ }

  // [S438] RS(상대강도) → 전광판 점수. rs20(%p)를 0~100 매핑(±20%p=0/100, 0=50). 일봉(indicators.rs 존재)만.
  if(indicators && indicators.rs && indicators.rs.rs20 != null){
    // [S449] 전이값(d) 부여 — 어제 rs20 점수 대비 Δ. _sxbTrans가 "어제→오늘" 한 줄 자동 부착(다른 도넛과 동일).
    const _rsV = Math.max(0, Math.min(100, Math.round(50 + indicators.rs.rs20 * 2.5)));
    const _rsObj = { v: _rsV };
    if(indicators.rs.rs20Prev != null){
      const _rsPrev = Math.max(0, Math.min(100, Math.round(50 + indicators.rs.rs20Prev * 2.5)));
      _rsObj.d = _rsV - _rsPrev;
    }
    _boardExtras.rs = _rsObj;
  }
  return { struct:_boardStruct, pb:_boardPb, deltas:_boardDeltas, extras:_boardExtras, lowConf:_lowConf };
}

// [S357] 멀티TF 칩/캐시용 5분류 1-shot 계산 — 전광판과 동일 체인(입력→그룹→분포).
//   indicators/qs/scoreMom/btScore는 해당 TF의 캐시값. 실패 시 null(칩 배지 생략).
function _computeDist5(stock, indicators, qs, scoreMom, btScore, tf){
  try{
    if(!indicators) return null;
    const _sc = (typeof calcEnhancedScores==='function') ? calcEnhancedScores(stock, indicators) : null;
    if(!_sc) return null;
    const _sv4 = {
      readyScore: qs ? (qs.readyScore ?? 0) : 0,
      entryScore: qs ? (qs.entryScore ?? 0) : 0,
      trendScore: qs ? (qs.trendScore ?? qs.score ?? 0) : 0,
      btScore:    btScore != null ? btScore : 0
    };
    const _bi = _computeBoardInputs(stock, indicators, _sc, scoreMom, tf);
    const _groups = _buildBoardGroups(_sc, _sv4, _bi.struct, _bi.pb, _bi.deltas, _bi.extras);
    return _classifyBoardDist(_groups);
  }catch(_){ return null; }
}

function _buildScoreBoard(scores, sv4, structPos, pbScore, D, verdict, lowConf, extras){
  extras = extras || {};
  window._sxBoard = { verdict: verdict||null, lowConf: !!lowConf, lowConfReasons: (extras && extras._lowConfReasons) || [], dumpWarn: (extras && extras.dumpWarn) || null, mixWarn: (extras && extras.mixWarn) || null, groups: _buildBoardGroups(scores, sv4, structPos, pbScore, D, extras) };
  return `<div class="sxb" id="sxScoreBoard">${_sxbHTML()}</div>`;
}

// 비동기 점수 도착 시 그리드 확장 (재무·공시) — 펼침 상태 보존
function _sxBoardSetAsync(groupId, key, score, opts){
  const B = window._sxBoard; if(!B || score==null) return;
  const g = B.groups.find(x=>x.id===groupId); if(!g) return;
  const ex = g.items.find(it=>it.k===key);
  if(ex){ ex.v = score; if(opts) Object.assign(ex, opts); } else g.items.push(Object.assign({k:key, v:score}, opts||{}));
  const el = document.getElementById('sxScoreBoard');
  if(el){
    const wasOpen = el.classList.contains('sxb-open');
    el.innerHTML = _sxbHTML();
    if(wasOpen) el.classList.add('sxb-open');
  }
}

// [S389] 투자자 수급(외인/기관 순매수) — 네이버 데이터, 국내 전용
//   점수: 연속 순매수(+)/순매도(−) 일수 기반, 외국인 가중↑ (국내 수급 영향이 큼) → 현재 수급 상태
function _computeInvestorScore(inv){
  if(!inv) return null;
  const f = Math.max(-10, Math.min(10, inv.foreignNetBuyDays||0));
  const i = Math.max(-10, Math.min(10, inv.instNetBuyDays||0));
  return Math.max(0, Math.min(100, Math.round(50 + f*4 + i*2.5)));
}
// [S389] 적정가 밑 당일 순매수 규모 (외국인/기관) — 숫자 + 부호색, 연속일수 곁들임
function _renderInvestorRow(inv){
  const el = document.getElementById('sxInvestorRow');
  if(!el) return;
  if(!inv){ el.innerHTML=''; return; }
  const _fmt = (n)=>{ const man=n/10000; const s=man>0?'+':''; return s + (Math.abs(man)>=1 ? Math.round(man).toLocaleString() : man.toFixed(1)) + '만주'; };
  const _seg = (label, net, days)=>{
    if(net==null) return '';
    const col = net>0?'var(--buy)':net<0?'var(--sell)':'var(--text3)';
    const _d = days>0?` ${days}일째 매수` : days<0?` ${-days}일째 매도` : '';
    return `<span style="color:${col};font-weight:700">${label} ${_fmt(net)}</span>`
         + (_d?`<span style="font-size:8px;color:var(--text3)">${_d}</span>`:'');
  };
  const fSeg = _seg('외국인', inv.foreignNetBuy, inv.foreignNetBuyDays);
  const iSeg = _seg('기관', inv.instNetBuy, inv.instNetBuyDays);
  if(!fSeg && !iSeg){ el.innerHTML=''; return; }
  el.innerHTML = `<div style="font-size:10px;letter-spacing:-.2px;line-height:1.45">`
    + `<span style="font-size:8px;color:var(--text3);font-weight:600">당일 순매수 </span>`
    + fSeg + (fSeg&&iSeg?`<span style="color:var(--text3)"> · </span>`:'') + iSeg
    + `</div>`;
}

function renderAnalysisResult(stock, scores, indicators, qs, analTime, sectorItp, maAlignItp, basicItp){
  // S34: 풀차트용 데이터 저장
  _currentAnalRows = indicators?._advanced?.rows || null;
  _currentAnalName = stock.name || '';
  // [S373] maAlign 누락 추적 — sx_diag에서 표시할 진단 데이터 수집 (전/후 비교)
  const _diagSnap = {
    t: new Date().toISOString().slice(11, 19),
    code: stock.code || '?',
    name: stock.name || '?',
    analTF: _analTF,
    indicatorKeys: indicators ? Object.keys(indicators).join(',') : 'NULL',
    indicatorKeyCount: indicators ? Object.keys(indicators).length : 0,
    indicatorsIsStockRef: indicators && stock._indicators === indicators,
    beforeHasMaAlign: !!(indicators && indicators.maAlign),
    beforeMaAlignType: indicators ? (indicators.maAlign === null ? 'null' : typeof indicators.maAlign) : 'no-indicators',
    candleSource: stock._lastAnalCandles ? `_lastAnalCandles(${stock._lastAnalCandles.length})` : (_currentAnalRows ? `_advanced.rows(${_currentAnalRows.length})` : 'none'),
    fixAttempted: false,
    fixResult: '—',
    afterHasMaAlign: false,
    afterSample: null,
  };
  // [S374] indicators에 maAlign 누락 보강 — calcIndicators가 레거시 평탄 형태로 반환하는 게 원인
  //   진단 결과 (S373): indicators 키에 ma5/ma20/ma60 숫자만 있고 maAlign 객체 없음
  //   해결: ① _advanced.maAlign (calcAllScreener 결과 보존) 우선 사용
  //         ② 없으면 평탄 ma5/ma20/ma60으로 maAlign 객체 직접 재구성
  if(indicators && !indicators.maAlign){
    _diagSnap.fixAttempted = true;
    if(indicators._advanced && indicators._advanced.maAlign){
      indicators.maAlign = indicators._advanced.maAlign;
      _diagSnap.fixResult = 'OK from _advanced.maAlign';
    } else if(indicators.ma5 != null && indicators.ma20 != null && indicators.ma60 != null){
      indicators.maAlign = {
        bullish: indicators.ma5 > indicators.ma20 && indicators.ma20 > indicators.ma60,
        bearish: indicators.ma5 < indicators.ma20 && indicators.ma20 < indicators.ma60,
        short: indicators.ma5,
        mid: indicators.ma20,
        long: indicators.ma60,
        xlong: indicators.ma120 != null ? indicators.ma120 : null,
        ma60: indicators.ma60,
      };
      _diagSnap.fixResult = `OK rebuilt (5=${Math.round(indicators.ma5)} 20=${Math.round(indicators.ma20)} 60=${Math.round(indicators.ma60)})`;
    } else {
      _diagSnap.fixResult = 'FAIL (no _advanced.maAlign, no ma5/20/60)';
    }
  } else if(indicators && indicators.maAlign){
    _diagSnap.fixResult = 'NOT_NEEDED';
  }
  _diagSnap.afterHasMaAlign = !!(indicators && indicators.maAlign);
  if(indicators && indicators.maAlign){
    _diagSnap.afterSample = {
      bullish: indicators.maAlign.bullish,
      bearish: indicators.maAlign.bearish,
      short: indicators.maAlign.short,
      mid: indicators.maAlign.mid,
      long: indicators.maAlign.long,
      ma60: indicators.maAlign.ma60,
    };
  }
  try {
    window._sxMaAlignDiag = window._sxMaAlignDiag || [];
    window._sxMaAlignDiag.push(_diagSnap);
    if(window._sxMaAlignDiag.length > 10) window._sxMaAlignDiag.shift();
  } catch(_){}
  // S99: 차트 마커는 통합판정 기준으로 전달 (trades + svVerdict)
  _currentAnalTrades = stock._btResult?.trades || null;
  const body = document.getElementById('analBody');
  const gradeColor = {A:'grade-A',B:'grade-B',C:'grade-C',D:'grade-D',F:'grade-F'};
  const analTimeStr = analTime ? fmtTime(analTime) : '';
  const scanTimeStr = _lastScanTime ? fmtTime(_lastScanTime) : '';

  // quickScore 종합 판정 — S48: qsHTML 제거, body.innerHTML에서 직접 렌더링
  // (레짐카드를 종목명카드 아래로 이동)

  // S103 bugfix: _stratDetailId 함수 본체 스코프로 호이스팅 (IIFE 안/밖 공용 참조)
  const _stratDetailId = 'strat_' + Math.random().toString(36).slice(2,8);

  // v2.0: 4축 룰 + 모멘텀 보정 통합 판정
  let _svVerdict = null;
  const _btSt = stock._btState || null;
  {
    // 1) 4축 점수 수집
    const _scores4 = {
      readyScore: qs ? (qs.readyScore ?? 0) : 0,                  // 반등신호 (v1.8: 바닥신호→반등신호)
      entryScore: qs ? (qs.entryScore ?? 0) : 0,                  // 반등강도 (v1.8: 반등신호→반등강도)
      trendScore: qs ? (qs.trendScore ?? qs.score ?? 0) : 0,      // 추세방향 (v1.8: 추세강도→추세방향)
      upsideScore: qs ? (qs.upsideScore ?? 0) : 0,                // [S357] 추가상승 (순추세 추격)
      maAlignBull: qs ? (qs.maAlignBull === true) : false,        // [S357] 정배열 여부 (추세 경로용)
      ltAlign:    qs ? (qs.ltAlign || 'off') : 'off',             // [S509] 장기 정배열 게이트 (경로선택)
      aTimingOn:  qs ? qs.aTimingOn : undefined,                   // [S512] A 타이밍 발화(오늘 rawScore≥buyTh) — 매수 타이밍 게이트
      btScore:    stock._btScore != null ? stock._btScore : 0,     // 매매전략
      safetyViol: qs && Array.isArray(qs._safetyViol) ? qs._safetyViol : [] // [S426] 안전필터 위반 → C 캡/익절힌트
    };
    const _svMom = stock._scoreMomentum || null;

    // 2) BT 상태 분류
    let _btStateKey = 'waiting';
    if (_btSt) {
      if (_btSt.state === 'holding' && _btSt._isBuySignal) _btStateKey = 'buy_signal';
      else if (_btSt.state === 'holding') _btStateKey = 'holding';
      else if (_btSt.state === 'sell_signal') _btStateKey = 'sell_signal';
      else _btStateKey = 'waiting';
    }

    // 3) v2.0 통합 판정
    //   - 4축 1차 판정 (바닥≥60, 반등≥60, 추세≥50, 매매전략≥60)
    //   - 모멘텀 다수결 → 한 단계 승급/강등
    //   - sell_signal 직격 시 4축 무시, 매도 완료
    //   - buy_signal + (회피/관망) → chartMarker 차단
    const _btStForVerdict = _btSt ? Object.assign({}, _btSt, {
      currentPrice: stock.price,
      winRate:    stock._btResult ? stock._btResult.winRate : null,
      totalTrades: stock._btResult ? stock._btResult.totalTrades : null
    }) : null;
    _svVerdict = SXC.unifiedVerdictV2(_btStateKey, _scores4, _svMom, _btStForVerdict);
    stock._svVerdict = _svVerdict; // 차트 마커용 저장
    // [S455] 차트 보라마커 = A+안전필터(qs.action) 기준. C(_svVerdict 9종판정)은 검토영역 유지.
    //   ▲=qs.action 'BUY'(깨끗한 매수) / ▼=A강등(HOLD인데 안전필터 🔒로 막힘=여기서 사지마라) / 그 외=마커없음.
    {
      const _aMk = (qs && qs.action === 'BUY') ? 'buy'
        : (qs && qs.action === 'HOLD' && Array.isArray(qs.reasons) && qs.reasons.some(r => String(r).indexOf('🔒') >= 0)) ? 'sell'
        : null;
      stock._svChartMarker = Object.assign({}, _svVerdict || {}, { chartMarker: _aMk, chartMarkerHold: false });
    }
    stock._svScores4 = _scores4;   // [S57] 종합해석 가이드용 — 4축 원점수 보존

    // 4) _btAction 매핑 (결과탭 칩용 — 9종 → 4종)
    if(_svVerdict && _svVerdict.action){
      stock._btAction = SXC.mapVerdictToBtAction(_svVerdict.action);
    } else {
      stock._btAction = null;
    }

    // [S361] 상단 배너 제거 — 엔진시뮬 카드가 행동지침([매도 검토] 배지)을 흡수.
    //   · 모멘텀 배지: 전광판(▲N▼N + 부문 삼각형)에 흡수되어 중복이라 폐기
    //   · shiftText: [S293]에서 모멘텀 보정을 4축에 직접 반영하며 사실상 비활성
    //   · _svVerdict 계산(위 1~4단계)은 차트마커/결과탭칩/하단버튼/엔진시뮬카드가 의존 → 유지
  }

  // [S420] 분석탭 해석 카드 자리 맞교환 (C패널 최종판정 ↔ BT패널 활용토글 내부 현재지표요약)
  //   · C패널 "최종 판정" 자리 → "현재 지표 상태 요약"(pg.extras)
  //   · BT패널 활용토글 내부 "현재 지표 상태 요약" 자리 → "최종 판정"(보유유지 등 9종) 카드
  //   취지: 보유유지/매도완료 등 판정=시뮬(BT) 성격 → BT쪽 / RSI·MA·OBV·레짐 안내=지표 성격 → C쪽
  //   ★스코프 주의: 버튼 IIFE(C패널 포함)와 메인 템플릿(BT패널)이 별개 스코프라, 반드시 함수 본체 레벨에
  //     선언해야 양쪽 모두 closure로 접근 가능. (이전 버그: 버튼 IIFE 안에 둬서 BT패널에서 _pgShared 미정의)
  //   배선: pg를 1회 계산(_pgShared) → 양쪽 공유. verdict HTML은 먼저 실행되는 C IIFE가 _swapVerdictHTML에
  //         stash → 나중 실행되는 BT 활용토글이 소비. 폴백: pg=null(verdictAction 없음=BT 거래수 부족)이면 swap 안 함.
  //   타이밍: stock._btScore/_svVerdict는 본 함수 호출 전 세팅·함수 내 불변 → 여기서 계산해도 구 위치(5340)와 동일값.
  //   (sx_render.js 단독 변경, BT 계산 미러 무관)
  let _swapVerdictHTML = '';   // C IIFE가 채움 → BT 활용토글에서 소비 (빈 문자열이면 폴백=swap 안 함)
  let _pgShared = null;        // practicalGuide 1회 계산 — 활용토글 steps + C패널 현재지표요약 공용
  (()=>{
    if(typeof SXI==='undefined' || !SXI.practicalGuide) return;
    const _pgMkt = stock._mkt || stock.market || currentMarket;
    const _pgTfOk = _isBtSupportedTF(_pgMkt, _analTF);
    const _pgTrades = _getBtTotalTrades(stock);
    const _pgInsuf = !_pgTfOk || _pgTrades < BT_MIN_TRADES;
    const _verdictAct = _pgInsuf ? '' : (stock._svVerdict?.action || '');
    const _as = qs?.score ?? scores?.total ?? 0;
    const _bs = _pgInsuf ? 0 : (stock._btScore ?? 0);
    const _sum = (typeof SXI!=='undefined' && SXI.summary) ? SXI.summary(qs?.action, _as, stock._safetyReasons, indicators, _verdictAct || null, qs?.regime || null) : null;
    const _pg4 = _pgInsuf ? null : {
      readyScore: qs ? (qs.readyScore ?? 0) : 0,
      entryScore: qs ? (qs.entryScore ?? 0) : 0,
      trendScore: qs ? (qs.trendScore ?? qs.score ?? 0) : 0,
      upsideScore: qs ? (qs.upsideScore ?? 0) : 0,        // [S508] 추가상승 (추세 경로 표시용)
      maAlignBull: qs ? (qs.maAlignBull === true) : false, // [S508] 정배열 (추세 경로 표시용)
      ltAlign:     qs ? (qs.ltAlign || 'off') : 'off',     // [S509] 장기 정배열 게이트 (표시 정합)
      aTimingOn:   qs ? qs.aTimingOn : undefined,          // [S512] A 타이밍 발화 (관심 강등 사유 표시용)
      btScore:    stock._btScore != null ? stock._btScore : 0
    };
    const _pgMom = stock._svVerdict?.momBadge || null;
    // [S508] C 화면 정합 — 실제 판정 합격수(passCount)·합격경로(passPath)를 그대로 전달.
    //   기존엔 practicalGuide가 BT를 4번째 축으로 가정해 pass4를 따로 재계산 → 실제 판정과 불일치.
    const _pgPass = _pgInsuf ? null : (stock._svVerdict?.passCount ?? null);
    const _pgPath = _pgInsuf ? null : (stock._svVerdict?.passPath ?? null);
    _pgShared = SXI.practicalGuide(_verdictAct, _as, _bs, _sum, indicators, _pg4, _pgMom, _pgPass, _pgPath);
  })();

  // S31: 미니 캔들차트
  let chartHTML = '';
  if(indicators?._advanced?.rows){
    chartHTML = `<div class="mini-chart-wrap" onclick="_sxVib(12);if(typeof SXChart!=='undefined'&&_currentAnalRows)SXChart.openFull(_currentAnalRows,_currentAnalName,_currentAnalTrades,(typeof _resolvePurpleSv==='function'?_resolvePurpleSv(currentAnalStock):(currentAnalStock&&(currentAnalStock._svChartMarker||currentAnalStock._svVerdict))))" style="cursor:pointer"><div class="mini-chart-title">최근 ${Math.min(indicators._advanced.rows.length, 60)}봉 <span style="font-size:8px;color:var(--accent);font-weight:400">(탭하면 상세)</span></div><canvas id="miniCandleChart" width="400" height="180"></canvas></div>`;
  }

  // S99: 매매이력은 분석탭에서 제거 → BT탭(단일검증)에서만 표시
  // 통합 배너에 BT 성적 요약 1줄만 포함됨
  let tradeHistHTML = '';

  // S46: 고급 분석 해석카드 — SXI.adv* 모듈 경유
  // [S356] 전광판용 — 구조위치/눌림목을 함수 스코프로 승격 (adv 블록 내 값을 body.innerHTML 시점에 참조)
  let _boardPb = null, _boardStruct = null;
  let advHTML = '';
  const adv = indicators?._advanced;
  if(adv && typeof SXI!=='undefined'){
    const ctx = adv.context;
    const swing = adv.swingStruct;
    const maConv = adv.maConv;
    const _id = () => 'adv_' + Math.random().toString(36).slice(2,8);
    const _toneKr = {'bullish':'강세','bearish':'약세','neutral':'중립','warning':'경고','danger':'위험','없음':'없음','up':'상승','down':'하락'};
    const advItpRow = (label, val, valCls, itpObj) => {
      const id = _id();
      const dispVal = _toneKr[val] || val;
      let row = `<div class="anal-row itp-row"><span class="al">${label}</span><span class="ar ${valCls||''}">${dispVal}</span>`;
      if(itpObj){
        row += `<span class="itp-toggle" id="${id}t" onclick="_sxVib(8);toggleItp('${id}')">▶</span>`;
        row += `</div><div class="itp-card" id="${id}"><span class="itp-label ${itpObj.tone||'neutral'}">${itpObj.label||''}</span><div>${itpObj.text||''}</div></div>`;
      } else { row += `</div>`; }
      return row;
    };
    // 시장환경
    let envHTML = '';
    const envSummary = MarketEnv.getSummary(currentMarket);
    if(envSummary.state !== 'unknown'){
      const envCls = envSummary.state.includes('bull')?'bullish':envSummary.state.includes('bear')?'bearish':'neutral';
      const envItp = SXI.advMarketEnv(envSummary.state, envSummary.stateLabel, envSummary.indices);
      envHTML = advItpRow('시장 환경', envSummary.stateLabel, envCls, envItp);
    }
    // 눌림목
    const pbScore = adv.pullback?.score || 0;
    _boardPb = pbScore; // [S356] 전광판
    const maArr = indicators.maAlign?.bullish?'bullish':indicators.maAlign?.bearish?'bearish':null;
    const rsiV = typeof indicators.rsi==='number'?indicators.rsi:null;
    const volR = indicators._advanced?.volPattern?.volRatio??null; // [S526] volPattern은 평탄화 누락 → _advanced 경유
    const bbB = indicators.bb?.pctB??null;
    const pbItp = SXI.advPullback(pbScore, maArr, rsiV, volR, bbB);
    // RSI 다이버전스
    const rsiDivVal = adv.rsi.div||'없음';
    const rsiDivItp = SXI.advRsiDiv(rsiDivVal, rsiV, adv.trend?.pct);
    // OBV 다이버전스
    const obvDivVal = adv.obv.div||'없음';
    const obvDivItp = SXI.advObvDiv(obvDivVal, indicators.obv?.trend, volR);
    // 스윙 구조
    const swingVal = swing.higherHighs&&!swing.lowerLows ? 'HH+HL 상승구조' : swing.lowerLows&&!swing.higherHighs ? 'LL+LH 하락구조' : swing.higherHighs&&swing.lowerLows ? '혼조' : '횡보';
    const swingCls = swing.higherHighs&&!swing.lowerLows ? 'bullish' : swing.lowerLows ? 'bearish' : 'neutral';
    const swingItp = SXI.advSwing(swing.higherHighs, swing.lowerLows);
    // MA 수렴도
    const maConvVal = maConv.converging ? `수렴중 ${maConv.spread.toFixed(1)}%` : `분산 ${maConv.spread.toFixed(1)}%`;
    const maConvCls = maConv.converging ? 'neutral' : maConv.spread>5 ? 'bullish' : 'neutral';
    const maConvItp = SXI.advMaConv(maConv.converging, maConv.spread, maArr, indicators.bb?.isSqueeze||indicators._advanced?.squeeze?.squeeze); // [S526] squeeze는 _advanced 경유(평탄화 누락)
    // 추세
    const trendPct = adv.trend.pct;
    const trendCls = trendPct>0?'bullish':trendPct<0?'bearish':'neutral';
    const trendItp = SXI.advTrend(trendPct, indicators.adx?.adx, maArr, indicators.obv?.trend);
    // 구조 위치
    const structPos = (adv.trend.struct.pos*100).toFixed(0);
    _boardStruct = Math.round(adv.trend.struct.pos*100); // [S356] 전광판
    const nearSup = adv.trend.struct.nearSupport;
    const nearRes = adv.trend.struct.nearResistance;
    const structVal = `${structPos}%${nearSup?' (지지근접)':''}${nearRes?' (저항근접)':''}`;
    const structCls = nearSup ? 'bullish' : nearRes ? 'bearish' : 'neutral';
    const structItp = SXI.advStructPos(adv.trend.struct.pos, nearSup, nearRes, adv.trend.struct.support, adv.trend.struct.resist);
    // Stoch 다이버전스
    let stochDivHTML = '';
    if(adv.stochDiv){
      const sdVal = adv.stochDiv;
      const sdCls = sdVal==='bullish'?'bullish':'bearish';
      const sdItp = SXI.advStochDiv(sdVal, rsiDivVal);
      stochDivHTML = advItpRow('Stoch 다이버전스', sdVal, sdCls, sdItp);
    }
    // 심리가격대
    let psychHTML = '';
    if(adv.psychLevel){
      const psych = adv.psychLevel;
      const psychVal = psych.near ? '근접' : '이격';
      const psychCls = psych.near ? 'bullish' : 'neutral';
      const psychItp = SXI.advPsychLevel(psych.near, psych.level, psych.price||indicators.last);
      psychHTML = advItpRow('심리적 가격대', psychVal, psychCls, psychItp);
    }
    // 맥락 분석
    let ctxHTML = '';
    if(ctx.notes.length){
      const ctxBonus = ctx.bonus || 0;
      const ctxCls = ctxBonus>5?'bullish':ctxBonus<-5?'bearish':'neutral';
      const ctxItp = SXI.advContext(ctxBonus, ctx.notes);
      ctxHTML = advItpRow('맥락 분석', `${ctxBonus>0?'+':''}${ctxBonus}점`, ctxCls, ctxItp);
    }

    // [통합 v1.9] 고급해석 단독 항목들을 고급분석에 흡수 — itp(SXI.interpretAll) 결과를 미리 계산
    //   기존: 고급분석(envHTML 등)과 고급해석(itp.vwap 등) 별개 섹션으로 분리
    //   변경: 한 섹션 "고급 분석"으로 통합, 중복 3개(스윙/MA수렴/눌림목)는 advHTML 측만 유지
    //         고급해석 단독 13개(VWAP, 일목균형표, 가격채널, 피벗, MA이격도, 거래량MA,
    //                          A/D, EOM, VHF, 심리도, Chaikin Osc, AB Ratio)는 흡수
    const _itp_inline = (typeof SXI!=='undefined') ? SXI.interpretAll(indicators) : {};
    const _ko_inline = currentMarket==='kr' && !window._kisEnabled;
    const _kisOffBadge_inline = '<span class="kis-off-badge">비활성</span>';
    // advHTML 내에서도 itpRow 형태가 필요 — advItpRow와 동일 시그니처로 KIS 비활성 배지만 추가
    const advItpRowKis = (label, val, valCls, itpObj, kisOff) => {
      const id = 'adv_' + Math.random().toString(36).slice(2,8);
      const dispVal = _toneKr[val] || val;
      const dimCls = kisOff ? ' kis-dimmed' : '';
      let row = `<div class="anal-row itp-row${dimCls}"><span class="al">${label}${kisOff?_kisOffBadge_inline:''}</span><span class="ar ${valCls||''}">${dispVal}</span>`;
      if(itpObj){
        row += `<span class="itp-toggle" id="${id}t" onclick="_sxVib(8);toggleItp('${id}')">▶</span>`;
        row += `</div><div class="itp-card" id="${id}"><span class="itp-label ${itpObj.tone||'neutral'}">${itpObj.label||''}</span><div>${itpObj.text||''}</div></div>`;
      } else { row += `</div>`; }
      return row;
    };
    // [v1.9] 라벨 정리 — "추세" 단어 의미 충돌 해소
    //   "추세 N%" → "가격 기울기 N%" (가격 변화율의 선형회귀 기울기 의미 명확화)
    //   고급해석 흡수 항목 추가 — 중복 3개(스윙/MA수렴/눌림목) 제외
    advHTML = `
    <div class="anal-section">
      <div class="anal-section-title">고급 분석</div>
      ${envHTML}
      ${advItpRow('눌림목', pbScore+'점', pbScore>=50?'bullish':'neutral', pbItp)}
      ${advItpRow('RSI 다이버전스', rsiDivVal, rsiDivVal==='bullish'?'bullish':rsiDivVal==='bearish'?'bearish':'neutral', rsiDivItp)}
      ${advItpRow('OBV 다이버전스', obvDivVal, obvDivVal==='bullish'?'bullish':obvDivVal==='bearish'?'bearish':'neutral', obvDivItp)}
      ${advItpRow('스윙 구조', swingVal, swingCls, swingItp)}
      ${advItpRow('MA 수렴도', maConvVal, maConvCls, maConvItp)}
      ${advItpRow('가격 기울기', trendPct.toFixed(1)+'%', trendCls, trendItp)}
      ${advItpRow('구조 위치', structVal, structCls, structItp)}
      ${stochDivHTML}
      ${psychHTML}
      ${ctxHTML}
      ${_itp_inline.vwap?advItpRowKis('VWAP', indicators.vwap?.position==='above'||indicators.vwap?.position==='above_far'?'위':indicators.vwap?.position==='below'||indicators.vwap?.position==='below_far'?'아래':'근처', _itp_inline.vwap.tone, _itp_inline.vwap):''}
      ${_itp_inline.ichimoku?advItpRowKis('일목균형표', _itp_inline.ichimoku.label, _itp_inline.ichimoku.tone, _itp_inline.ichimoku):''}
      ${_itp_inline.priceChannel?advItpRowKis('가격채널', (()=>{const pc=indicators.priceChannel||indicators._advanced?.priceChannel||{}; return pc.position==='breakout_up'?'상단돌파':pc.position==='breakout_down'?'하단이탈':pc.position==='upper_half'?'상단권':'하단권';})(), _itp_inline.priceChannel.tone, _itp_inline.priceChannel):''}
      ${_itp_inline.pivot?advItpRowKis('피벗', (()=>{const pv=indicators.pivot||indicators._advanced?.pivot||{}; return pv.level||'';})(), _itp_inline.pivot.tone, _itp_inline.pivot):''}
      ${_itp_inline.maDisparity?advItpRowKis('MA 이격도', (()=>{const md=indicators.maDisparity||indicators._advanced?.maDisparity||{}; const parts=[]; if(md.disparity20!=null) parts.push('20: '+(md.disparity20>=0?'+':'')+md.disparity20.toFixed(1)+'%'); if(md.disparity60!=null) parts.push('60: '+(md.disparity60>=0?'+':'')+md.disparity60.toFixed(1)+'%'); return parts.join(' / ')||_itp_inline.maDisparity.label;})(), _itp_inline.maDisparity.tone, _itp_inline.maDisparity):''}
      ${_itp_inline.volumeMA?advItpRowKis('거래량 MA', (indicators._advanced?.volPattern?.volRatio??1).toFixed(1)+'x', _itp_inline.volumeMA.tone, _itp_inline.volumeMA):''}
      ${_itp_inline.adLine?advItpRowKis('A/D (수급)', (()=>{const ad=indicators.ad||indicators._advanced?.ad||{}; return ad.trend==='up'?'상승':ad.trend==='down'?'하락':'횡보';})(), _itp_inline.adLine.tone, _itp_inline.adLine):''}
      ${_itp_inline.eom?advItpRowKis('EOM', (()=>{const e=indicators.eom||indicators._advanced?.eom||{}; /* [S452] EOM 라벨 버그 수정: 엔진 EOM.trend는 'bullish'/'bearish'/'mixed'(='up'/'down' 아님)이라 기존 삼항식이 항상 '중립'으로 떨어짐. 전광판 score100과 동일 기준(≥65/<35)으로 통일 */ const _s=(e.score100!=null)?e.score100:(e.trend==='bullish'?70:e.trend==='bearish'?30:50); return _s>=65?'매수세':_s<35?'매도세':'중립';})(), _itp_inline.eom.tone, _itp_inline.eom):''}
      ${_itp_inline.vhf?advItpRowKis('VHF', (()=>{const v=indicators.vhf||indicators._advanced?.vhf||{}; return v.trending==='trending'?'추세장':v.trending==='ranging'?'횡보장':'보통';})(), _itp_inline.vhf.tone, _itp_inline.vhf):''}
      ${_itp_inline.psycho?advItpRowKis('심리도', (()=>{const p=indicators.psycho||indicators._advanced?.psycho||{}; const val=p.psycho; return val!=null?val.toFixed(0)+'%':'—';})(), _itp_inline.psycho.tone, _itp_inline.psycho, _ko_inline):''}
      ${_itp_inline.chaikinOsc?advItpRowKis('Chaikin (수급)', (()=>{const c=indicators.chaikinOsc||indicators._advanced?.chaikinOsc||{}; return c.val>0?'양수 (매집)':c.val<0?'음수 (분산)':'0';})(), _itp_inline.chaikinOsc.tone, _itp_inline.chaikinOsc):''}
      ${_itp_inline.abRatio?advItpRowKis('AB Ratio', (()=>{const a=indicators.abRatio||indicators._advanced?.abRatio||{}; return a.trend==='bullish'?'매수우위':a.trend==='bearish'?'매도우위':'균형';})(), _itp_inline.abRatio.tone, _itp_inline.abRatio):''}
    </div>`;
  }

  let techHTML = '';
  if(indicators){
    const ind = indicators;
    // [S452] 지표 정합 점검 스냅샷 — 모바일 diag 카드(_diagIndicators)용. EOM 수정 검증 + ADX/DI 값 노출.
    try{
      const _eq = ind.eom || {};
      const _eLabel = (()=>{const _s=(_eq.score100!=null)?_eq.score100:(_eq.trend==='bullish'?70:_eq.trend==='bearish'?30:50); return _s>=65?'매수세':_s<35?'매도세':'중립';})();
      window._sxIndDiag = {
        t: new Date().toLocaleTimeString('ko-KR'),
        name: (stock&&stock.name)||'?', code: (stock&&stock.code)||'?',
        tf: _analTF, kisOn: !!window._kisEnabled,
        eomTrend: _eq.trend!=null?_eq.trend:null,
        eomVal: (typeof _eq.val==='number')?_eq.val:null,
        eomScore: (typeof _eq.score100==='number')?_eq.score100:null,
        eomLabel: _eLabel,
        adx: (ind.adx&&typeof ind.adx.adx==='number')?ind.adx.adx:null,
        plusDI: (ind.adx&&typeof ind.adx.plusDI==='number')?ind.adx.plusDI:null,
        minusDI: (ind.adx&&typeof ind.adx.minusDI==='number')?ind.adx.minusDI:null
      };
    }catch(_){}
    const cls = (v,bull,bear)=>v>=bull?'bullish':v<=bear?'bearish':'neutral';
    // S39: 해석 엔진 연동
    const itp = (typeof SXI!=='undefined') ? SXI.interpretAll(ind) : {};
    // S66: KIS 비활성 시 국내 민감지표 비활성 배지
    const _krNoKis = currentMarket==='kr' && !window._kisEnabled && /^\d+m$/.test(_analTF)===false;
    const _kisOffBadge = '<span class="kis-off-badge">비활성</span>';
    const itpRow = (label, val, valCls, itpData, kisOff) => {
      const id = 'itp_' + Math.random().toString(36).slice(2,8);
      const dimCls = kisOff ? ' kis-dimmed' : '';
      let row = `<div class="anal-row itp-row${dimCls}"><span class="al">${label}${kisOff?_kisOffBadge:''}</span><span class="ar ${valCls||''}">${val}</span>`;
      if(itpData){
        row += `<span class="itp-toggle" id="${id}t" onclick="_sxVib(8);toggleItp('${id}')">▶</span>`;
        row += `</div><div class="itp-card" id="${id}"><span class="itp-label ${itpData.tone}">${itpData.label}</span><div>${itpData.text}</div></div>`;
      } else {
        row += `</div>`;
      }
      return row;
    };
    // S66: 국내+KIS미연결 시 장중 민감지표 비활성 배지 (둔감지표=ADX,OBV,MA,ATR,SAR 제외)
    const _ko = currentMarket==='kr' && !window._kisEnabled;
    techHTML = `
    <div class="anal-section">
      <div class="anal-section-title">기술적 지표${_ko?'<span class="kis-off-badge" style="margin-left:6px">KIS 미연결 — 장중 민감지표 참고용</span>':''}</div>
      ${itpRow('RSI (14)', ind.rsi.toFixed(1), cls(ind.rsi,55,45), itp.rsi, _ko)}
      ${itpRow('MACD', (+ind.macd.macd.toFixed(2)).toLocaleString(), ind.macd.macd>ind.macd.signal?'bullish':'bearish', itp.macd, _ko)}
      ${itpRow('MACD Signal', (+ind.macd.signal.toFixed(2)).toLocaleString(), '', null, _ko)}
      ${itpRow('Stoch %K/%D', ind.stoch.k.toFixed(1)+' / '+ind.stoch.d.toFixed(1), cls(ind.stoch.k,60,40), itp.stoch, _ko)}
      ${itpRow('ADX', ind.adx.adx.toFixed(1), ind.adx.adx>25?'bullish':'neutral', itp.adx)}
      ${(ind.rs && ind.rs.rs20!=null) ? itpRow('RS (20일)', (ind.rs.rs20>=0?'+':'')+ind.rs.rs20+'%p', ind.rs.rs20>=0?'bullish':'bearish') : ''}
      ${itpRow('+DI / -DI', ind.adx.plusDI.toFixed(1)+' / '+ind.adx.minusDI.toFixed(1), '')}
      ${itpRow('CCI (20)', ind.cci.toFixed(1), cls(ind.cci,100,-100), itp.cci)}
      ${itpRow('MFI (14)', ind.mfi.toFixed(1), cls(ind.mfi,60,40), itp.mfi)}
      ${itpRow('BB %B', (ind.bb.pctB*100).toFixed(1)+'%', '', itp.bb, _ko)}
      ${itpRow('BB 폭', ind.bb.width.toFixed(1)+'% '+(ind.bb.isSqueeze?'(수축)':''), '', itp.bbWidth, _ko)}
      ${itpRow('ATR (14)', (+ind.atr.atr.toFixed(0)).toLocaleString()+' ('+ind.atr.ratio.toFixed(1)+'%)', '', itp.atr)}
      ${itpRow('OBV 방향', ind.obv.trend==='up'?'상승':ind.obv.trend==='down'?'하락':'횡보', ind.obv.trend==='up'?'bullish':ind.obv.trend==='down'?'bearish':'neutral', itp.obv)}
      ${itpRow('SAR', ind.psar.trend==='up'?'상승추세':'하락추세', ind.psar.trend==='up'?'bullish':'bearish', itp.sar)}
    </div>
    <div class="anal-section">
      <div class="anal-section-title">이동평균선</div>
      ${ind.ma5?itpRow('MA5', (+ind.ma5.toFixed(0)).toLocaleString(), ind.last>ind.ma5?'bullish':'bearish'):''}
      ${ind.ma20?itpRow('MA20', (+ind.ma20.toFixed(0)).toLocaleString(), ind.last>ind.ma20?'bullish':'bearish'):''}
      ${ind.ma60?itpRow('MA60', (+ind.ma60.toFixed(0)).toLocaleString(), ind.last>ind.ma60?'bullish':'bearish'):''}
      ${ind.ma120?itpRow('MA120', (+ind.ma120.toFixed(0)).toLocaleString(), ind.last>ind.ma120?'bullish':'bearish'):''}
      ${maAlignItp?`<div class="itp-card show" style="margin-top:4px;white-space:pre-line"><span class="itp-label ${maAlignItp.tone}">${maAlignItp.label}</span><div>${maAlignItp.text}</div></div>`:(itp.ma?`<div class="itp-card show" style="margin-top:4px"><span class="itp-label ${itp.ma.tone}">${itp.ma.label}</span><div>${itp.ma.text}</div></div>`:'')}
    </div>
    ${ind.patterns.basic.length||ind.patterns.reversal.length||ind.patterns.continuation.length?`
    <div class="anal-section">
      <div class="anal-section-title">캔들 패턴${_ko?'<span class="kis-off-badge" style="margin-left:6px">비활성</span>':''}</div>
      ${ind.patterns.basic.map(p=>`<div class="anal-row"><span class="al">기본</span><span class="ar">${p}</span></div>`).join('')}
      ${ind.patterns.reversal.map(p=>`<div class="anal-row"><span class="al">반전</span><span class="ar" style="color:var(--buy)">${p}</span></div>`).join('')}
      ${ind.patterns.continuation.map(p=>`<div class="anal-row"><span class="al">지속</span><span class="ar">${p}</span></div>`).join('')}
      ${itp.candle?`<div class="itp-card show" style="margin-top:4px"><span class="itp-label ${itp.candle.tone}">${itp.candle.label}</span><div>${itp.candle.text}</div></div>`:''}
    </div>`:''}
    `;
  }

  // ════════════════════════════════════════════════════════════
  // S39 (Phase3-C-1): 참고사항 카드 — 5단계 다이나믹 레이어 시스템
  //   [배경] 구 "종합평" 제목은 "최종 결론" 뉘앙스를 만들어 C 배너와 충돌
  //          → 평시엔 "참고사항"(L3)으로 위계 명확화 / 공시 발동 시 제목+색 자동 승격
  //
  //   [레이어 매핑 — 공시 tone 기반]
  //     L0 danger   : ⛔ 긴급경고  (빨강, C 판정 무시, 투자 부적격)
  //     L1 bearish  : ⚠️ 위험안내   (주황, 관리종목·자본잠식 등)
  //     L2 warning  : 💡 주의사항    (노랑, 주의 공시 감지)
  //     L3 neutral  : ℹ️ 참고사항    (하늘, 평시 99% 케이스 — 분석엔진 보조)
  //     L4 bullish  : ✨ 긍정요인  (초록, 호재 공시 보강)
  //
  //   [동작 원칙]
  //     - 공시 없음 또는 tone=neutral  → L3 (기본)
  //     - SXI.overrideSummaryWithDisclosure 후 stateLine이 '⛔'로 시작 → L0
  //     - SXI.overrideSummaryWithDisclosure 후 stateLine이 '[주의]' 포함 → L1
  //     - risks 중 '주의 공시 감지'가 있으면 → L2
  //     - keyReasons 중 '호재 공시 감지'가 있으면 → L4
  // ════════════════════════════════════════════════════════════
  function _getSummaryLayerConfig(summary, discTone){
    // 1) 공시 tone 직접 전달된 경우 우선 사용 (가장 신뢰 가능)
    if(discTone === 'danger')  return {level:'l0', icon:'⛔', label:'긴급경고'};
    if(discTone === 'bearish') return {level:'l1', icon:'⚠️', label:'위험안내'};
    // [PATCH mixed] 호재·주의 동시 → 주의 우위로 L2 매핑 (보수 원칙)
    //   참고사항 카드 자체는 L2(주황) 색이지만, 별도의 호재 공시 카드(보라색)에서 양면 정보 노출
    if(discTone === 'mixed')   return {level:'l2', icon:'💡', label:'주의사항'};
    if(discTone === 'warning') return {level:'l2', icon:'💡', label:'주의사항'};
    if(discTone === 'bullish') return {level:'l4', icon:'✨', label:'긍정요인'};
    // 2) discTone 미전달 시 summary 내용물로 추론 (오버라이드가 이미 적용된 상태)
    if(summary){
      const sl = summary.stateLine || '';
      if(sl.indexOf('⛔') === 0 || sl.indexOf('치명적 공시') >= 0)
        return {level:'l0', icon:'⛔', label:'긴급경고'};
      if(sl.indexOf('[주의]') >= 0 || sl.indexOf('위험 공시') >= 0)
        return {level:'l1', icon:'⚠️', label:'위험안내'};
      const risks = summary.risks || [];
      if(risks.some(r => r && r.title && r.title.indexOf('주의 공시') >= 0))
        return {level:'l2', icon:'💡', label:'주의사항'};
      const krs = summary.keyReasons || [];
      if(krs.some(r => r && r.title && r.title.indexOf('호재 공시') >= 0))
        return {level:'l4', icon:'✨', label:'긍정요인'};
    }
    // 3) 기본값: 평시 (L3)
    return {level:'l3', icon:'ℹ️', label:'참고사항'};
  }

  // S103-fix7 Phase3-B-3: verdictAction 5번째 파라미터 전달 — 보유중 5종일 때 보유자 맥락 종합평 생성
  // [S223] 6번째 파라미터 qs.regime 추가 — 27조합 (C × 레짐) 컨텍스트 부착
  let summaryHTML = '';
  if(typeof SXI!=='undefined' && qs && indicators){
    const _verdictActForSummary = stock._svVerdict?.action || null;
    let summary = SXI.summary(qs.action, qs.score, qs.reasons, indicators, _verdictActForSummary, qs.regime || null);
    // S58: 공매도 잔고 → 참고사항 보정 (동기 적용)
    if(summary && stock.shortBalanceRatio && SXI.advShortSelling && SXI.overrideSummaryWithShortSelling){
      const shortItp = SXI.advShortSelling(stock.shortBalanceRatio, {
        price: stock.price, changeRate: stock.changeRate,
        volume: stock.volume, foreignRatio: stock.foreignRatio, marketCap: stock.marketCap
      });
      if(shortItp) summary = SXI.overrideSummaryWithShortSelling(summary, shortItp, stock.shortBalanceRatio);
    }
    if(summary){
      // Phase3-C-1: 레이어 자동 판정 (초기 렌더는 공시 로드 전이므로 summary 내용 기반 추론)
      const _layer = _getSummaryLayerConfig(summary, null);
      summaryHTML = `<div class="itp-summary layer-${_layer.level}">
        <div class="itp-summary-title"><span>${_layer.icon}</span><span>${_layer.label}</span></div>
        ${summary.stateLine?`<div style="font-size:11px;font-weight:800;color:var(--${summary.tone==='bullish'?'buy':summary.tone==='bearish'?'sell':'hold'});margin-bottom:4px">${summary.stateLine}</div>`:''}
        <div class="itp-summary-text">${summary.mainText}</div>
        ${summary.actionGuide?`<div style="font-size:10px;padding:6px 8px;background:var(--surface2);border-radius:6px;margin:6px 0 4px;line-height:1.55"><span style="font-weight:700;color:var(--text)">행동 가이드</span><br><span style="color:var(--text2)">${summary.actionGuide}</span></div>`:''}
        ${summary.invalidation?`<div style="font-size:10px;padding:6px 8px;background:rgba(255,140,0,.06);border-radius:6px;margin-bottom:4px;line-height:1.55"><span style="font-weight:700;color:#ff8c00">무효화 조건</span><br><span style="color:var(--text2)">${summary.invalidation}</span></div>`:''}
        ${summary.buyTrigger?`<div style="font-size:10px;padding:6px 8px;background:var(--buy-bg);border-radius:6px;margin-bottom:6px;line-height:1.55"><span style="font-weight:700;color:var(--buy)">강화 조건</span><br><span style="color:var(--text2)">${summary.buyTrigger}</span></div>`:''}
        ${summary.keyReasons.length?'<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">핵심 이유</div>':''}
        ${summary.keyReasons.map(c=>`<div class="itp-composite ${c.tone}"><div class="itp-composite-title">${c.icon||''} ${c.title}</div><div class="itp-composite-text">${c.text}</div></div>`).join('')}
        ${summary.risks.length?'<div style="font-size:10px;font-weight:700;color:var(--sell);margin:6px 0 4px">위험 요소</div>':''}
        ${summary.risks.map(c=>`<div class="itp-composite ${c.tone}"><div class="itp-composite-title">${c.icon||''} ${c.title}</div><div class="itp-composite-text">${c.text}</div></div>`).join('')}
      </div>`;
    }
  }

  // S77: 현재 적용 파라미터 표시 (실제 적용값 전부 표시)
  const _ap = _loadAnalParams();
  const _raOn = typeof SXE!=='undefined' && SXE.regimeAdaptEnabled();
  const _curTf = typeof _analTF!=='undefined' ? _analTF : 'day';
  const _tfTh = (typeof _scrTfTh!=='undefined') ? _scrTfTh(_curTf) : {buy:62,sell:38};
  const _tfMa = (typeof _scrTfMa!=='undefined') ? _scrTfMa(_curTf) : {short:5,mid:20,long:60};
  const _effBuy = _ap.buyTh > 0 ? _ap.buyTh : _tfTh.buy;
  const _effSell = _ap.sellTh > 0 ? _ap.sellTh : _tfTh.sell;
  const _effMaS = _ap.maShort > 0 ? _ap.maShort : _tfMa.short;
  const _effMaM = _ap.maMid > 0 ? _ap.maMid : _tfMa.mid;
  const _effMaL = _ap.maLong > 0 ? _ap.maLong : _tfMa.long;
  const _effTp = _ap.tpMult > 0 ? _ap.tpMult : 2.5;
  const _effSl = _ap.slMult > 0 ? _ap.slMult : 1.5;
  const _apStr = `[P] RSI${_ap.rsiLen} BB${_ap.bbLen}×${_ap.bbMult} ATR${_ap.atrLen} MA${_effMaS}/${_effMaM}/${_effMaL} B${_effBuy} S${_effSell} TP${_effTp} SL${_effSl} · 레짐${_raOn?'ON':'OFF'}`;
  // S100: 현재 적용 프리셋 출처 라벨
  const _presetLabel = (typeof _getPresetSourceLabel === 'function') ? _getPresetSourceLabel() : '';

  // [S357] 직전 1봉 대비 전이(삼각형)용 — 1봉 전 시점 1회 재계산
  //   4축: stock._scoreMomentum.history[0](현재) vs [1](1봉전) — 추가 계산 0
  //   부문/구조/눌림목: calcIndicators(rows.slice(0,-1)) 1회로 1봉 전 값 산출
  //   밸류·재무·공시는 전이 무의미 → 델타 미산출(삼각형 생략)
  // [S357] 전광판 입력(extras/deltas/lowConf) 산출을 _computeBoardInputs로 위임 — 멀티TF 칩 5분류와 단일소스.
  let _boardDeltas = {}, _boardExtras = {}, _lowConf = false;
  {
    const _bi357 = _computeBoardInputs(stock, indicators, scores, stock._scoreMomentum, _curTf);
    _boardDeltas = _bi357.deltas;
    _boardExtras = _bi357.extras;
    _lowConf     = _bi357.lowConf;
  }
  // [S456] 매수신호 혼조 — A(qs.action)와 B(btState)가 당일/최근2봉에 반대로 행동.
  //   A매수▲ + B 매도신호 = 혼조 / A강등(HOLD&🔒)▼ + B 매수신호 = 혼조(과열 추격 케이스: BT는 진입, A는 막음).
  try {
    const _bs = stock._btState;
    const _rl = (indicators && indicators._advanced && indicators._advanced.rows) ? indicators._advanced.rows.length : 0;
    const _btBuyNow  = !!(_bs && _bs.state === 'holding' && (_bs._isBuySignal || (_bs.entryIdx != null && _rl > 0 && _bs.entryIdx >= _rl - 2)));
    const _btSellNow = !!(_bs && (_bs.state === 'sell_signal' || (_bs.exitIdx != null && _rl > 0 && _bs.exitIdx >= _rl - 2)));
    const _aBuy   = !!(qs && qs.action === 'BUY');
    const _aBlock = !!(qs && qs.action === 'HOLD' && Array.isArray(qs.reasons) && qs.reasons.some(r => String(r).indexOf('🔒') >= 0));
    if (_aBuy && _btSellNow) {
      _boardExtras.mixWarn = { on:true, side:'aBuyBSell', detail:'엔진은 매수(▲)인데 BT는 청산(▼) — 진입 타이밍 엇갈림', reasons:[] };
    } else if (_aBlock && _btBuyNow) {
      const _r = qs.reasons.filter(r => String(r).indexOf('🔒') >= 0).map(r => String(r).replace('🔒',''));
      _boardExtras.mixWarn = { on:true, side:'aBlockBBuy', detail:'BT는 진입(▲)했지만 엔진이 안전필터로 막음(▼) — 과열 추격 위험', reasons:_r };
    }
  } catch (_eMix) {}

  body.innerHTML = `
    ${chartHTML}
    ${_buildR1S1Card(stock, indicators)}
    ${_buildScoreBoard(scores, stock._svScores4, _boardStruct, _boardPb, _boardDeltas, stock._svVerdict, _lowConf, _boardExtras)}
    ${_buildTransitionCard(stock, indicators)}
    ${_buildTrendCard(stock, indicators)}
    ${_buildChartPredictCard(stock, indicators)}
    ${_buildVerdictValCard(stock, indicators)}
    ${tradeHistHTML}
    <div style="padding:4px 10px;margin:0 0 4px;text-align:center">${_presetLabel?`<div style="font-size:10px;font-weight:700;color:var(--accent);margin-bottom:2px">${_presetLabel}</div>`:''}<span style="display:inline-block;font-size:9px;padding:3px 8px;border-radius:4px;background:var(--surface2);color:var(--text3);border:1px solid var(--border)">${_apStr}</span></div>

    <div class="anal-header-card">
      <div class="anal-stock-code">${_esc(stock.code)} · ${_esc(stock.market||'')}${stock.sector?' · '+_esc(stock.sector):''}</div>
      <!-- [업종표시-소형] 종목코드 바로 아래에 같은 작은 스타일로 표시. DART 응답으로 비동기 채움. -->
      ${(()=>{
        const _ic = stock && (stock.industryCode || stock._industryCode);
        const _ist = _ic ? _ksicSectorText(_ic) : '';
        if(_ist){
          return `<div id="analSectorText" class="anal-stock-code" style="margin-top:2px">${_ist}</div>`;
        }
        return `<div id="analSectorText" class="anal-stock-code" style="margin-top:2px;display:none"></div>`;
      })()}
      <div class="anal-stock-name">${stock.name}</div>
      ${(()=>{
        // S103-fix7 Phase3-B-4f.1: 종목 헤더에 현재가 + 전일대비 추가
        //   v2.0 배너의 pnl% 비교 기준점 제공 (배너에는 현재가 미표기)
        //   "종목명 밑에 현재가" 배치로 시각적 안정성 + 중복 제거
        if(!stock.price || stock.price <= 0) return '';
        const _cr = typeof stock.changeRate === 'number' ? stock.changeRate : 0;
        const _crColor = _cr > 0 ? 'var(--buy)' : _cr < 0 ? 'var(--sell)' : 'var(--text3)';
        const _crSign = _cr > 0 ? '+' : '';
        const _crStr = _cr !== 0 ? `<span style="font-size:12px;font-weight:700;color:${_crColor};margin-left:6px">${_crSign}${_cr.toFixed(2)}%</span>` : '';
        const _priceStr = _isUsStock(stock) ? fmtUsPrice(stock.price) : `${stock.price.toLocaleString()}원`;
        return `<div class="anal-stock-price" style="margin-top:4px;font-size:16px;font-weight:800;color:var(--text);letter-spacing:-.3px">${_priceStr}${_crStr}</div>`;
      })()}
      ${(()=>{
        // [S320] 적정주가 2줄 — 현재가 바로 밑
        //   [S321] 1줄 → 2줄 분리 (사용자 요청):
        //     1줄: "적정주가 322,762원"           (강조, 색상)
        //     2줄: "PER 11배 기준 · +23.9% 약간 고평가" (작게, 회색+라벨색)
        //   기준: 한국 PER 11배 / 미국 PER 20배 (시장 평균)
        //   코인: 표시 안 함 (EPS/PER 개념 없음)
        //   적자/EPS 없음: 표시 안 함 (혼란 방지 — 행 자체 생략)
        //   라벨 5단계 (괴리율 기준):
        //     ≤ -20%: 저평가 (파랑)
        //     -20% ~ -10%: 약간 저평가 (옅은 파랑)
        //     -10% ~ +10%: 적정 (녹색)
        //     +10% ~ +30%: 약간 고평가 (옅은 빨강)
        //     > +30%: 고평가 (빨강)
        // [S339] early return 전에 _sxValDebug 기본 정보 채움 — DIG 진단 카드에서 사유 확인 가능
        //   적자/거래정지/coin 등 적정주가 평가 불가 사유를 명시
        const _fin = stock._financial;
        try {
          window._sxValDebug = {
            stockName: stock.name,
            stockCode: stock.code,
            price: stock.price,
            eps: _fin ? _fin.eps : null,
            finSource: _fin ? _fin._source : null,
            epsSource: _fin ? _fin._epsSource : null,
          };
        } catch(_){}

        if(!stock.price || stock.price <= 0){
          try{ window._sxValDebug._reason = '현재가 없음 또는 0 이하'; }catch(_){}
          return '';
        }
        if(currentMarket === 'coin'){
          try{ window._sxValDebug._reason = '코인 시장 — PER 평가 미적용'; }catch(_){}
          return '';
        }
        if(!_fin){
          try{ window._sxValDebug._reason = 'fin 객체 없음 (재무 데이터 미수신 — DART/SEC fetch 실패 또는 진행 중)'; }catch(_){}
          return '';
        }
        if(_fin.eps == null){
          try{ window._sxValDebug._reason = 'EPS null (DART/SEC 응답에서 EPS 추출 실패)'; }catch(_){}
          return '';
        }
        if(_fin.eps <= 0){
          try{ window._sxValDebug._reason = `EPS ≤ 0 (적자 종목: EPS=${Math.round(_fin.eps).toLocaleString()}) — 적정주가 평가 불가`; }catch(_){}
          return '';
        }
        if(typeof SXI === 'undefined' || typeof SXI.valuationJudge !== 'function') return '';
        // [S327 Phase 2] historical 평균 PER 계산 (있으면 시장평균 대체)
        //   - fin._historicalEps: DART 3년치 또는 SEC 5년치 [{year, eps}, ...]
        //   - _analCandles 또는 stock._lastAnalCandles: 분석탭 일봉 시계열
        //   - calcHistoricalPer가 ≥2년 흑자 매칭 시 avgPer 반환, 아니면 null (시장평균 폴백)
        let _histPer = null;
        if(typeof SXI.calcHistoricalPer === 'function' && _fin._historicalEps){
          const _candlesForPer = (typeof _analCandles !== 'undefined' && _analCandles && _analCandles.length > 0)
            ? _analCandles
            : (stock._lastAnalCandles || []);
          if(_candlesForPer && _candlesForPer.length > 0){
            _histPer = SXI.calcHistoricalPer(_fin._historicalEps, _candlesForPer);
          }
          // [진단용] window._sxValDebug에 저장 — 모바일에서는 안 보이지만 PC console에서 확인 가능
          //   사용법: 브라우저 콘솔(F12)에서 `window._sxValDebug` 입력
          try{
            window._sxValDebug = {
              stockName: stock.name,
              stockCode: stock.code,
              historicalEps: _fin._historicalEps || null,
              candlesLen: _candlesForPer.length,
              candlesFirstDate: _candlesForPer[0]?.date || null,
              candlesLastDate: _candlesForPer[_candlesForPer.length-1]?.date || null,
              histPerResult: _histPer
            };
            console.log('[S327 valuation debug]', window._sxValDebug);
          }catch(_){}
        } else {
          // historicalEps 자체 없음 — 진단용
          try{
            window._sxValDebug = {
              stockName: stock.name,
              stockCode: stock.code,
              historicalEps: null,
              reason: 'fin._historicalEps 필드 없음 (DART/SEC 응답 미추출 또는 옛 캐시)',
              finSource: _fin._source,
              hasFinObj: true
            };
            console.log('[S327 valuation debug]', window._sxValDebug);
          }catch(_){}
        }
        // [S338] KOSIS 시총 규모별 PER 폴백 (한국 종목만, 사전 fetch된 _kosisMarketPer 활용)
        //   historical PER 있으면 그것 우선, 없을 때만 사용 (valuationJudge 내부 분기)
        let _marketPer = null;
        if(currentMarket === 'kr' && typeof getKosisPerForStock === 'function' && typeof _kosisMarketPer !== 'undefined' && _kosisMarketPer){
          _marketPer = getKosisPerForStock(stock, _kosisMarketPer);
        }
        const _v = SXI.valuationJudge(_fin, stock.price, stock, _histPer, _marketPer);
        if(!_v) return '';
        // [S327] 부적합 분류 시: 적정/목표주가 행 + 안내 박스 모두 숨김
        //   사유: 다른 부적합 종목(금융업/리츠/석유정제)도 박스 없이 표시되어 통일성
        //   부적합 정보는 valuationJudge 반환값에 여전히 존재 — 필요 시 다른 곳에서 활용 가능
        if(_v.unsuitable){
          return '';
        }
        if(_v.fairPrice == null || _v.diffPct == null) return '';
        const _fpStr = _isUsStock(stock)
          ? `$${_v.fairPrice.toFixed(2)}`
          : `${Math.round(_v.fairPrice).toLocaleString()}원`;
        const _sign = _v.diffPct >= 0 ? '+' : '';

        // [S325] 목표주가 줄 (적정주가 위) — 12M Fwd EPS × Target PER (PER 기반 목표가 공식)
        //   - 상승여력 양수: 녹색 (var(--buy)) — 현재가가 목표가에 비해 낮음 → 매수 매력
        //   - 상승여력 음수: 빨강 (var(--sell)) — 현재가가 목표가보다 높음 → 추격 매수 위험
        //   - epsGrowth 클램프 표시: 30% 캡 시 "성장률 30% 캡 적용" 작게 표기 (정직성)
        let _tpHTML = '';
        if(_v.targetPrice != null && _v.targetDiffPct != null){
          const _tpStr = _isUsStock(stock)
            ? `$${_v.targetPrice.toFixed(2)}`
            : `${Math.round(_v.targetPrice).toLocaleString()}원`;
          const _tpSign = _v.targetDiffPct >= 0 ? '+' : '';
          const _tpColor = _v.targetDiffPct >= 0 ? 'var(--buy)' : 'var(--sell)';
          const _tpAction = _v.targetDiffPct >= 0 ? '상승여력' : '하락여지';
          // 성장률 사용 여부 안내 (epsGrowth 없거나 0이면 "성장 가정 없음")
          const _growthNote = (_v.epsGrowthUsed != null && _v.epsGrowthUsed !== 0)
            ? `성장률 ${_v.epsGrowthUsed >= 0 ? '+' : ''}${_v.epsGrowthUsed.toFixed(1)}% 반영`
            : 'TTM EPS 그대로';
          _tpHTML = `<div class="anal-target-price" style="margin-top:4px;letter-spacing:-.2px;line-height:1.3">`
            + `<div style="font-size:11px;font-weight:700;color:${_tpColor}">밸류 목표가 ${_tpStr}</div>`
            + `<div style="font-size:9px;font-weight:500;color:var(--text3);margin-top:1px">`
            + `PER ${_v.targetPer.toFixed(1)}배 · ${_growthNote} · `
            + `<span style="color:${_tpColor};font-weight:700">${_tpSign}${_v.targetDiffPct.toFixed(1)}% ${_tpAction}</span>`
            + `</div>`
            + `</div>`;
        }

        // [S327/S338] 적정주가 라벨 — PER 폴백 우선순위에 따라 3가지 표시
        //   1순위: historical 사용 → "3년 평균 PER 13.2배 기준"
        //   2순위: KOSIS 시총 규모별 → "대형주 12개월 평균 23.7배 기준"
        //   3순위: 시장평균 폴백 → "시장평균 PER 11배 기준"
        let _perLabelStr;
        if(_v.historicalPer && _v.historicalPer.avgPer != null && _v.historicalPer.validYears >= 2){
          _perLabelStr = `${_v.historicalPer.validYears}년 평균PER ${_v.benchPer.toFixed(1)}배 기준`;
        } else if(_v.marketPerData && _v.marketPerData.avgRecent != null){
          const _catShort = _v.marketPerData.category === 'KOSPI' ? 'KOSPI' : _v.marketPerData.category;
          _perLabelStr = `${_catShort} 최근평균 ${_v.benchPer.toFixed(1)}배 기준`;
        } else {
          _perLabelStr = `시장평균PER ${Math.round(_v.benchPer)}배 기준`;
        }

        return _tpHTML
          + `<div class="anal-fair-price" style="margin-top:4px;letter-spacing:-.2px;line-height:1.3">`
          + `<div style="font-size:11px;font-weight:700;color:${_v.perColor};opacity:${_v.perOpacity}">적정주가 ${_fpStr}</div>`
          + `<div style="font-size:9px;font-weight:500;color:var(--text3);margin-top:1px">`
          + `${_perLabelStr} · `
          + `<span style="color:${_v.perColor};opacity:${_v.perOpacity};font-weight:700">${_sign}${_v.diffPct.toFixed(1)}% ${_v.perLabel}</span>`
          + `</div>`
          + `</div>`;
      })()}
      ${currentMarket==='kr' ? '<div id="sxInvestorRow" style="margin-top:5px;min-height:0"></div>' : ''}
      <div id="discBadgeArea" style="margin-top:4px;min-height:0"></div>
      ${scanTimeStr||analTimeStr?`<div style="font-size:8px;color:var(--text3);margin-top:4px">${scanTimeStr?'검색 '+scanTimeStr:''}${scanTimeStr&&analTimeStr?' · ':''}${analTimeStr?'분석 '+analTimeStr:''}</div>`:''}
      <!-- [업종표시] 위치 이동: 종목코드 바로 아래로 옮김 (anal-stock-code 다음 라인 참조) -->
      ${(()=>{
        const _analSc = qs ? (qs.readyScore ?? qs.score) : scores.total; // S95: 소형 배지
        const _btData = _getBtData(stock);
        const _btScRaw = calcBtScore(_btData, stock);
        const _btTrades2 = _getBtTotalTrades(stock);
        const _btMkt = stock._mkt || stock.market || currentMarket;
        const _btTfOk = _isBtSupportedTF(_btMkt, _analTF);
        const _btNoData = !_btTfOk || _btScRaw == null;
        const _btSc = _btNoData ? null : _btScRaw;
        let _btReliLabel = '', _btReliColor = '';
        if(!_btNoData){
          if(_btTrades2 < BT_MIN_TRADES){ _btReliLabel='부족'; _btReliColor='var(--sell)'; }
          else if(_btTrades2 < 30){ _btReliLabel='충족'; _btReliColor='var(--accent)'; }
          else { _btReliLabel='충분'; _btReliColor='var(--buy)'; }
        }

        const _mom = stock._scoreMomentum;
        // S103-fix7 Phase3-B-4f.4: _momArrow 제거 — 버튼 내부에서 "xx 전이 N%"로 교체되어 더 이상 참조되지 않음.
        //   3단리포트 ready/entry 섹션의 델타 표시는 _deltaTag(_readyDelta/_entryDelta/_trendDelta) 헬퍼가 담당 (중복 제거)

        const _3stageId = 'stage3_' + Math.random().toString(36).slice(2,8);
        // S103-fix7 Phase3-B-4f.4: _analCls 제거 — 버튼 색상이 _timingBtnClr(polarity 기반)로 대체됨
        const _btCls = _btSc!=null?(_btSc>=60?'buy':_btSc>=40?'hold':'sell'):'text3';

        // S103-fix7 Phase3-B-4f.4: 타이밍 라벨을 C 판정 기반으로 산출 (v3.0 3.4 표, 9종 전체 커버)
        //   이전: _mom.delta <= 0 → 매도 검토 / 아니면 진입 검토 (모멘텀만 기반, C와 괴리 가능)
        //   신규: SXC.getTimingButtonLabel(svVerdict.action) — 보유 5종 중 매도완료 제외 → 매도 검토, 나머지 → 진입 검토
        const _svAction4f = stock._svVerdict ? stock._svVerdict.action : null;
        const _timingLabel = SXC.getTimingButtonLabel(_svAction4f);

        // S127: C 전이 확률(_transition) 계산 제거 — 버튼 문구를 "추세 N · 레벨"로 교체하며 불필요해짐
        //   [제거된 계산] const _svRr4f = SXE.calcTpSlRr(...).rr
        //                 const _transition = SXC.calcVerdictTransition(_svAction4f, _analSc, _mom, _svRr4f, stock._btState)
        //   [보존] SXC.calcVerdictTransition 함수 자체는 sx_project_c.js에 유지 (다른 호출부 없음, 향후 복원 시 사용 가능)
        //   [효과] 매 분석탭 렌더 시 calcTpSlRr + calcVerdictTransition 2회 호출 절약

        // [S293] 엔진판단 검증 버튼 색상 — btScore 기반 (BT신뢰도 점수 바와 동일 기준으로 통일)
        //   ≥70 녹색 / ≥50 파랑 / ≥30 주황 / <30 빨강 / 미실행 회색
        let _entryEvalClr;
        if(_btSc == null){
          _entryEvalClr = '#94a3b8'; // BT 미실행 — 회색
        } else if(_btSc >= 70){ _entryEvalClr = '#22c55e';  // 녹색 (우수)
        } else if(_btSc >= 50){ _entryEvalClr = '#3b82f6';  // 파랑 (양호)
        } else if(_btSc >= 30){ _entryEvalClr = '#f97316';  // 주황 (주의)
        } else               { _entryEvalClr = '#e8365a';   // 빨강 (위험)
        }

        // S127 fix3: 진입/매도 검토 버튼 색상 — 배너 C 판정 색을 그대로 상속
        //   [이전 v7.9] switch(action) 수동 매핑 — 9종 중 5종만 case 분기, 나머지(보유 유지/관망/회피)는 default 회색
        //     → 한화 케이스(보유 유지=배너 녹색)에서 버튼만 회색 → 시각 분리 모순 발견
        //   [신규 v7.10] _svVerdict.color 직접 참조 — SXC.unifiedVerdict 반환 색을 single source of truth로 사용
        //     → 배너와 버튼이 모든 9종 상태에서 100% 색상 동기화
        //     → SXC 쪽 색상 변경 시 자동 반영(수동 매핑 누락 가능성 원천 제거)
        //   현재 SXC 매핑(sx_project_c.js L142~183): 매수 #22c55e / 관심 #3b82f6 / 보유 유지 #22c55e /
        //     청산 준비 #f59e0b / 청산 검토 #ff8c00 / 즉시 청산 #e8365a / 매도 완료 #e8365a /
        //     관망 #f59e0b / 회피 #9e9e9e
        //   폴백: _svVerdict 없거나 color 누락 시 중립 회색 #94a3b8
        // [S450][S451] 분석신호검토 버튼 = A(진입타이밍 = scrQuickScore.score) 전용. 라벨·색·배지 모두 A 점수 기준.
        //   [S451] A/B 동그라미 배지색 = 각 텍스트색과 통일(A=_timingBtnClr, B=_entryEvalClr). C(보라)는 혼합이라 고정.
        //   C verdict는 활용가이드(Ⓒ)·엔진시뮬 배지가 담당 → A/B/C 영역 1:1 명확 구분.
        const _aScore = qs ? (qs.score ?? 0) : 0;
        const _timingBtnClr = _aScore >= 70 ? '#22c55e' : _aScore >= 50 ? '#3b82f6' : _aScore >= 30 ? '#f97316' : '#e8365a';

        // S127: 버튼 미리보기용 추세 점수 — 펼침 영역 Layer 4(추세, C) 요약을 버튼에 선노출
        //   펼치기 전에도 "추세가 양호한지/약한지" 즉시 파악 가능 → 버튼=펼침 요약 관계 성립
        //   qs.trendScore 우선, 없으면 qs.score 폴백 (scrQuickScore 출력 구조 보호)
        //   S127-fix1: level 경계를 sx_interpret.js _report.trend.level(3324줄)과 1:1 동기화
        //     [이전] 70/50/30 임의 경계 → 펼침 내부 "하락"인데 버튼은 "약세" 불일치 발생
        //     [신규] 70/60/50/40 경계 (강세/양호/중립/약세/하락) — A 엔진 출력과 완전 동일
        //   [v1.7] 용어 리네이밍 — "강세/약세" 혼동 제거 (추세 등급 vs entryScore 점수명)
        //     · 이전: 강세/양호/중립/약세/하락 ← "강세"가 entryScore 점수명과 이름 충돌
        //     · 신규: 강추세/중추세+/중추세/약추세/하락추세 ← 접미 "추세"로 trend 등급임을 명시
        const _btnTrendScore = qs ? (qs.trendScore ?? qs.score ?? 0) : 0;
        const _btnTrendLevel = _btnTrendScore >= 70 ? '강추세'
                             : _btnTrendScore >= 60 ? '중추세+'
                             : _btnTrendScore >= 50 ? '중추세'
                             : _btnTrendScore >= 40 ? '약추세'
                             : '하락추세';
        // [S450] 분석신호검토 버튼 라벨 = 진입타이밍 점수(A). C verdict는 활용가이드(Ⓒ)로 이동.
        const _btnVerdictTxt = `진입타이밍 ${_aScore}`;

        // S103-fix6c Phase1: 양방향 3단 구조 — 모멘텀 기반 매도 모드 감지 (3단리포트 내부 라벨용)
        //   _entryLabel은 entry 섹션 헤더 + 강세/약세 추이 차트 제목에서 사용
        // S127: _r2eLabel / _e2tLabel 제거 — 전이 박스 삭제로 더 이상 불필요
        // [v1.7] 강세/약세 동적 표기 폐지 → "반등 신호"로 통일
        //   이유: entryScore는 "반등이 실제로 시작됐나"를 보는 지표인데 "강세/약세"는
        //         상승/하락 어느 쪽이든 발생하는 신호라 방향성을 붙이면 오해 소지.
        //         특히 헤더 "약추세" 라벨과 entry 섹션 헤더 "약세"가 공존하면 같은 단어로
        //         다른 것을 가리키는 문제 발생 → 용어 "반등 신호" 단일화
        // [v1.8] entryScore 라벨 "반등 신호" → "반등 강도"
        //   이유: ready 라벨이 "반등 신호"로 이동(눌림→반등 포착 단계). entry는 실제 반등이
        //         시작된 후의 모멘텀 강도(RSI반등+MACD전환+양봉 등)를 보는 지표라 "강도"가 정확.
        const _isSellMode = (_mom && _mom.delta != null && _mom.delta <= 0);
        const _entryLabel = '반등 강도';
        const _stratBtnClr = '#ff9900';

        // S103-fix6c Phase2: 감독관 통합판정 기반 행동 배지 — 진입 검토 버튼 위 왼쪽 정렬
        //   유력(실선진한색): 매수→반등유력 / 즉시청산·매도완료→하락유력 (차트마커 ▲▼과 동기화)
        //   조짐(실선연한색): 관심→반등조짐 / 청산준비·검토→하락조짐 (예고 단계)
        //   그 외(보유유지·관망·회피): 배지 없음 (회피=비보유 진입안함이라 경고 표시 불필요)
        // S103-fix7 Phase3-A-2: '매도 완료'에 하락유력 배지 추가 (▼ 차트마커와 쌍), '회피'는 배지 제거 (비보유 상태)
        // S103-fix7 Phase3-B-7: 인라인 switch 로직 → SXC.getVerdictBadge() 호출로 교체 (sx_project_c.js로 이전)
        // [S598] 매도완료 손익 분리 — isWin 전달(익절청산/손절청산). 즉시청산은 하락유력 유지.
        const _verdictBadgeTop = SXC.getVerdictBadge(stock._svVerdict?.action, stock._svVerdict?.isWin);
        // [S515] A 타이밍 배지 — 좌측(A 버튼 위). C 판정배지(_verdictBadgeTop)는 BT 매도와 짝이라 우측(B 버튼 위)으로 이동.
        //   qs.aTimingOn(=rawScore≥buyTh+15, S514) 기준: 강발화→'진입 신호'(녹색) / 미발화→'진입대기'(중립, "아직 기다려") / 데이터없음→배지없음.
        //   A=홀서빙(타이밍) 발언권 시각화. C 매수 게이트와 동일 신호라, 4축 OK인데 '진입대기'면 그게 바로 매수 보류 사유.
        const _aTimingOn = qs ? qs.aTimingOn : undefined;
        const _aTimingBadge = (_aTimingOn === true)  ? '<span class="tx-badge up">진입 신호</span>'
                            : (_aTimingOn === false) ? '<span class="tx-badge wait">진입대기</span>'
                            : '';
        // [S528] 추가하락 배지 — qs.bearCont.n>0(약세 지속 패턴 감지=rawScore 차감 발동)일 때 표시. 차감을 눈에 보이게(진입대기의 직접 사유).
        const _bearBadge = (qs && qs.bearCont && qs.bearCont.n > 0) ? '<span class="tx-badge bear">추가하락</span>' : '';
        // [S515][S516][S517][S528] 상단 배지 행 — [진입대기(A)][추가하락(A)][하락유력(C)]를 A 버튼 왼쪽 끝에 함께 묶음.
        //   〔순서/이유〕 진입대기 → (사유)추가하락 → 하락유력(C). 한곳에 모으면 "기다림 ← 추가하락 ← C하락" 인과로 읽힘(S516 좌우분리 폐기).
        //   각 배지 margin-left:4px라 사이 간격 자동. 하나만 있어도 그대로 노출, 전부 없으면 행 생략.
        const _topBadgeRow = (_aTimingBadge || _bearBadge || _verdictBadgeTop)
          ? `<div style="display:flex;justify-content:flex-start;align-items:center;margin-top:8px;margin-bottom:-2px">${_aTimingBadge}${_bearBadge}${_verdictBadgeTop}</div>`
          : '';

        // S95: 소형 인라인 배지 — 근거용 (탭→전이상세) — S100: 교차 토글
        // S127: 버튼 내부 문구 교체 — 전이 확률 → 추세 점수/레벨 미리보기
        //   [이전] ${_transition.label} ${_transition.value}% (예: "관망 강등 70%")
        //     → 종합평에 중복 노출되고 의미 전달이 어려움("강등"이라는 표현 모호)
        //   [신규] 추세 ${score} · ${level} (예: "추세 47 · 약세")
        //     → 펼침 Layer 4(추세, C) 요약 = 버튼=미리보기 관계 성립
        //     → 펼치기 전에도 추세 방향성 즉시 파악 가능
        return `${_topBadgeRow}<div style="display:flex;align-items:center;gap:6px;margin-top:6px">
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:4px 10px;border-radius:6px;background:var(--surface2);border:1.5px solid ${_timingBtnClr};cursor:pointer" onclick="_sxVib(10);var el=document.getElementById('${_3stageId}'),s=document.getElementById('${_stratDetailId}');if(s&&s.style.display!=='none'){s.style.display='none';if(currentAnalStock)currentAnalStock._engineVerifyOpen=false;}var willOpen=el.style.display==='none';el.style.display=willOpen?'block':'none';if(currentAnalStock){currentAnalStock._3stageOpen=willOpen;}">
            <span style="font-size:9px;color:${_timingBtnClr};font-weight:700"><span style="display:inline-block;width:13px;height:13px;line-height:13px;text-align:center;border-radius:50%;background:${_timingBtnClr};color:#fff;font-size:8px;font-weight:800;margin-right:3px">A</span>분석신호 검토 <span style="font-size:7px">▶</span></span>
            <span style="font-size:11px;font-weight:800;color:${_timingBtnClr};line-height:1.2">${_btnVerdictTxt}</span>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:4px 10px;border-radius:6px;background:var(--surface2);border:1.5px solid ${_entryEvalClr};cursor:pointer" onclick="_sxVib(10);var el=document.getElementById('${_stratDetailId}'),t=document.getElementById('${_3stageId}');if(t&&t.style.display!=='none'){t.style.display='none';if(currentAnalStock)currentAnalStock._3stageOpen=false;}var willOpen=el.style.display==='none';el.style.display=willOpen?'block':'none';if(currentAnalStock){currentAnalStock._engineVerifyOpen=willOpen;}/* S119 fix2: 자동 실행 완료 후 재클릭 시 재실행 방지 — 이미 BT 결과 있으면 토글만 */if(willOpen&&currentAnalStock&&!currentAnalStock._btResult)_runEngineVerify(currentAnalStock);">
            <span style="font-size:9px;color:${_entryEvalClr};font-weight:700"><span style="display:inline-block;width:13px;height:13px;line-height:13px;text-align:center;border-radius:50%;background:${_entryEvalClr};color:#fff;font-size:8px;font-weight:800;margin-right:3px">B</span>엔진판단 검증 <span style="font-size:7px">▶</span></span>
            <span style="font-size:11px;font-weight:800;color:${_entryEvalClr};line-height:1.2">${stock._btResult && stock._btResult.totalTrades ? `거래 ${stock._btResult.totalTrades} 승률 ${(stock._btResult.winRate||0).toFixed(0)}%` : '거래 ?? 승률 ??'}</span>
          </div>
        </div>

        <div id="${_3stageId}" style="display:${stock._3stageOpen ? 'block' : 'none'};margin-top:8px;padding:10px 12px;background:var(--surface2);border-radius:10px;border:1px solid var(--border)">
        ${(()=>{
          // S81→S82→S99-2: 3단 리포트 렌더링 (verdictAction 전달)
          if(typeof SXI==='undefined' || !SXI.threeStageReport) return '<div style="font-size:10px;color:var(--text3)">해석 엔진 미연결</div>';

          const _lastDate = (indicators && indicators._advanced && indicators._advanced.rows) ? indicators._advanced.rows[indicators._advanced.rows.length-1]?.date : null;
          const _verdictAction = _svVerdict ? _svVerdict.action : null;
          // [S262] market 인자 전달 — 미국/코인 시장 staleness label 정확도 향상
          //   〔이력〕 이전: market 미전달 → _estimateStaleness 내부에서 모든 일봉을 KST 15:30으로 해석.
          //     미국 일봉(EST 16:00)은 약 14.5h, 코인(UTC 00:00)은 6.5h 어긋남 → label 부정확 (수정됨)
          //   효과: 'kr'=KST 15:30, 'us'=EST 16:00, 'coin'=UTC 00:00 종가로 정확 해석.
          const _3stageMkt = stock._mkt || stock.market || currentMarket;
          // S103-fix7 Phase3-A-3: btStateObj 전달 — _buildVerdict에서 매도 pnl/isWin/진입가 맥락 활용
          const _report = SXI.threeStageReport(qs, _mom, stock._btResult, _btSc, _lastDate, stock._btTransitionStats, _verdictAction, stock._btState, _3stageMkt);
          if(!_report) return '<div style="font-size:10px;color:var(--text3)">데이터 부족</div>';

          let html = '';
          // S86: 변화량 표시 헬퍼
          const _deltaTag = function(d){ if(d==null||isNaN(d)) return ''; var s=d>0?'+'+d:d===0?'0':''+d; var c=d>0?'var(--buy)':d<0?'var(--sell)':'var(--text3)'; return ' <span style="font-size:9px;color:'+c+';font-weight:700">'+s+'</span>'; };
          const _readyDelta = _mom ? _mom.delta : null;
          const _entryDelta = _mom ? _mom.entryDelta : null;
          const _trendDelta = _mom ? _mom.trendDelta : null;
          const _upsideDelta = _mom ? _mom.upsideDelta : null; // [S357]

          // [S357] ⓐ 채택 경로 판별 → 카드 활성/비활성 배경
          //   반등 경로(rebound): 반등신호+반등강도+추세방향 활성 / 추세 경로(trend): 추세방향+추가상승 활성
          //   [S511] 추세방향은 양쪽 공통 축 → 두 경로 모두 강조
          var _momDir = (typeof SXC!=='undefined' && SXC.momentumBadge && _mom) ? ((SXC.momentumBadge(_mom)||{}).direction || 'flat') : 'flat';
          var _ppScores = {
            readyScore: _report.ready.score, entryScore: _report.entry.score,
            trendScore: _report.trend.score, upsideScore: _report.upside ? _report.upside.score : 0,
            maAlignBull: qs.maAlignBull === true,
            ltAlign: qs.ltAlign || 'off' // [S511] S509 후속 — passPathOf가 장기정배열 게이트 기반이라 ltAlign 필수(누락 시 화면 경로 ≠ 실제 C 판정)
          };
          var _passPath = (typeof SXC!=='undefined' && SXC.passPathOf) ? SXC.passPathOf(_ppScores, _momDir) : 'none';
          // zone: 'ready'|'entry'|'trend'|'upside' → wrapper style 반환
          var _zoneStyle = function(zone){
            if(_passPath === 'none') return ''; // 매수 경로 없음 → 4카드 중립
            // [S511] 추세방향(trend)은 양쪽 경로 공통 축(반등 trend≥50 / 추세 trend≥55)이라 두 경로 모두 강조.
            //   반등 경로: 반등신호+반등강도+추세방향 / 추세 경로: 추세방향+추가상승
            var active = (_passPath==='trend'   && (zone==='trend'||zone==='upside')) ||
                         (_passPath==='rebound' && (zone==='ready'||zone==='entry'||zone==='trend'));
            if(active) return 'padding:8px 10px 4px;border-left:4px solid #f5b301;background:rgba(245,197,24,.16);border-radius:0 6px 6px 0;'; // [S357] 활성 경로만 연노랑 강조
            return ''; // 비활성·중립 — 흐림 없이 기본 표시 (활성 연노랑만으로 충분히 구분, 내용 모두 노출)
          };

          // 준비 섹션 — S82: 체크박스 시각화
          // [v1.7] 헤더 라벨 "신호" → "바닥 신호" (readyScore = 바닥 조건 축적도)
          // [v1.8] 헤더 라벨 "바닥 신호" → "반등 신호" (눌림 후 반등 신호 포착 단계)
          const rCls = _report.ready.score>=60?'buy':_report.ready.score>=40?'hold':'sell';
          html += '<div style="margin-bottom:10px;'+_zoneStyle('ready')+'">';
          html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:11px;font-weight:800;color:var(--text)">반등 신호</span><span style="font-size:14px;font-weight:800;color:var(--'+rCls+')">'+_report.ready.score+_deltaTag(_readyDelta)+'</span><span style="font-size:9px;color:var(--text3)">'+_report.ready.level+' · '+_report.ready.progress+'</span></div>';
          html += '<div style="font-size:10px;color:var(--text2);line-height:1.6;margin-bottom:4px">'+_report.ready.summary+'</div>';
          // S82→S87: 조건 체크박스 — met만 표시, unmet은 토글로 숨김
          if(_report.ready.met.length || _report.ready.unmet.length) {
            var _mw = _report.ready.metW || [];
            var _uw = _report.ready.unmetW || [];
            var _rUnmetId = 'ru_' + Math.random().toString(36).slice(2,8);
            html += '<div style="display:flex;flex-wrap:wrap;gap:3px 6px;margin-bottom:4px">';
            if(_mw.length) {
              _mw.forEach(function(c){ html += '<span style="font-size:8px;color:var(--buy);white-space:nowrap">[v] '+c.name+' <span style="font-size:7px;opacity:.6">+'+c.weight+'</span></span>'; });
            } else {
              _report.ready.met.forEach(function(c){ html += '<span style="font-size:8px;color:var(--buy);white-space:nowrap">[v] '+c+'</span>'; });
            }
            html += '</div>';
            var _hasRU = _uw.length ? _uw.length : _report.ready.unmet.length;
            if(_hasRU) {
              html += '<div onclick="_sxVib(8);var u=document.getElementById(\''+_rUnmetId+'\');u.style.display=u.style.display===\'none\'?\'flex\':\'none\';this.querySelector(\'span\').textContent=u.style.display===\'none\'?\'▶\':\'▼\'" style="font-size:8px;color:var(--text3);cursor:pointer;margin-bottom:3px"><span>▶</span> 미충족 조건 '+_hasRU+'개</div>';
              html += '<div id="'+_rUnmetId+'" style="display:none;flex-wrap:wrap;gap:3px 6px;margin-bottom:4px">';
              if(_uw.length) {
                _uw.forEach(function(c){ html += '<span style="font-size:8px;color:var(--text3);white-space:nowrap;opacity:.6">[ ] '+c.name+' <span style="font-size:7px">+'+c.weight+'</span></span>'; });
              } else {
                _report.ready.unmet.forEach(function(c){ html += '<span style="font-size:8px;color:var(--text3);white-space:nowrap;opacity:.6">[ ] '+c+'</span>'; });
              }
              html += '</div>';
            }
          }
          // S127: ready 섹션 내부 전이 박스(_r2eLabel) 제거
          //   [이유] 버튼("관망 강등 70%")에 이미 동일 정보 표시 + 종합평에서 C가 재언급
          //         → 3중 노출 방지, 정보 계층 명확화
          html += '</div>';

          // S127: 진입 검토 추이 차트 — Layer 2(ready, A) 섹션 바로 뒤로 이동
          //   [이전 위치] 구간분포 추이 다음 (맨 아래쪽) → 문맥 단절
          //   [신규 위치] ready 섹션 직후 → "검토 13점"의 최근 5봉 변화를 바로 확인 가능
          //   차트 ID는 _3stageId + '_dbc' 그대로 유지 (다른 호출부 없음, 충돌 無)
          if(_mom && _mom.history.length >= 3){
            const _dbCanvasId = _3stageId + '_dbc';
            const rev = _mom.history.slice().reverse();
            html += '<div style="margin-bottom:10px">';
            html += '<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">반등 신호 추이 (최근 '+_mom.lookback+'봉)</div>';
            html += '<canvas id="'+_dbCanvasId+'" style="width:100%;height:48px;display:block"></canvas>';
            html += '</div>';
            (window._sxTrackedTimeout || setTimeout)(function(){ if(typeof SXChart!=='undefined' && SXChart.drawDeltaBar) SXChart.drawDeltaBar(_dbCanvasId, rev, _mom.lookback); }, 60);
          }

          // 진입 섹션
          const eCls = _report.entry.score>=60?'buy':_report.entry.score>=40?'hold':'sell';
          html += '<div style="margin-bottom:10px;'+_zoneStyle('entry')+'">';
          html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:11px;font-weight:800;color:var(--text)">'+_entryLabel+'</span><span style="font-size:14px;font-weight:800;color:var(--'+eCls+')">'+_report.entry.score+_deltaTag(_entryDelta)+'</span><span style="font-size:9px;color:var(--text3)">'+_report.entry.level+'</span></div>';
          html += '<div style="font-size:10px;color:var(--text2);line-height:1.6;margin-bottom:4px">'+_report.entry.summary+'</div>';
          // S84→S87: 진입(강세) 조건별 가중치 — met만 표시, unmet 토글 숨김
          if((_report.entry.met && _report.entry.met.length) || (_report.entry.unmet && _report.entry.unmet.length)) {
            var _emw = _report.entry.metW || [];
            var _euw = _report.entry.unmetW || [];
            var _eUnmetId = 'eu_' + Math.random().toString(36).slice(2,8);
            html += '<div style="display:flex;flex-wrap:wrap;gap:3px 6px;margin-bottom:4px">';
            if(_emw.length) {
              _emw.forEach(function(c){ html += '<span style="font-size:8px;color:var(--buy);white-space:nowrap">[v] '+c.name+' <span style="font-size:7px;opacity:.6">+'+c.weight+'</span></span>'; });
            } else {
              (_report.entry.met||[]).forEach(function(c){ html += '<span style="font-size:8px;color:var(--buy);white-space:nowrap">[v] '+c+'</span>'; });
            }
            html += '</div>';
            var _hasEU = _euw.length ? _euw.length : (_report.entry.unmet||[]).length;
            if(_hasEU) {
              html += '<div onclick="_sxVib(8);var u=document.getElementById(\''+_eUnmetId+'\');u.style.display=u.style.display===\'none\'?\'flex\':\'none\';this.querySelector(\'span\').textContent=u.style.display===\'none\'?\'▶\':\'▼\'" style="font-size:8px;color:var(--text3);cursor:pointer;margin-bottom:3px"><span>▶</span> 미충족 조건 '+_hasEU+'개</div>';
              html += '<div id="'+_eUnmetId+'" style="display:none;flex-wrap:wrap;gap:3px 6px;margin-bottom:4px">';
              if(_euw.length) {
                _euw.forEach(function(c){ html += '<span style="font-size:8px;color:var(--text3);white-space:nowrap;opacity:.6">[ ] '+c.name+' <span style="font-size:7px">+'+c.weight+'</span></span>'; });
              } else {
                (_report.entry.unmet||[]).forEach(function(c){ html += '<span style="font-size:8px;color:var(--text3);white-space:nowrap;opacity:.6">[ ] '+c+'</span>'; });
              }
              html += '</div>';
            }
          }
          if(_report.entry.signals.length) html += '<div style="font-size:9px;color:var(--buy);line-height:1.5;margin-bottom:2px">'+_report.entry.signals.map(function(n){return '[+] '+n}).join('<br>')+'</div>';
          if(_report.entry.warnings.length) html += '<div style="font-size:9px;color:var(--sell);line-height:1.5">'+_report.entry.warnings.map(function(n){return '[-] '+n}).join('<br>')+'</div>';
          // S127: entry 섹션 내부 전이 박스(_e2tLabel) 제거
          //   [이유] ready 박스 제거와 동일 논리 — 정보 중복 배제, Layer 3은 A 엔진 점수 + 조건에 집중
          html += '</div>';

          // S88: 반등 강도 추이 → SXChart.drawDeltaBar 캔버스 (v1.8: 반등신호→반등강도)
          if(_mom && _mom.history.length >= 3){
            const _ebCanvasId = _3stageId + '_ebc';
            const _eRev = _mom.history.slice().reverse().map(function(h){ return {score: h.entryScore || 0}; });
            html += '<div style="margin-bottom:10px">';
            html += '<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">'+_entryLabel+' 추이 (최근 '+_mom.lookback+'봉)</div>';
            html += '<canvas id="'+_ebCanvasId+'" style="width:100%;height:48px;display:block"></canvas>';
            html += '</div>';
            (window._sxTrackedTimeout || setTimeout)(function(){ if(typeof SXChart!=='undefined' && SXChart.drawDeltaBar) SXChart.drawDeltaBar(_ebCanvasId, _eRev, _mom.lookback); }, 70);
          }

          // 추세 섹션 — S127: Layer 4(C) 시각 테마 적용
          //   [이유] A(검토/강세)와 C(추세) 섹션을 시각적으로 구분 — "추세는 판단의 본론"
          //   [스타일] 좌측 4px accent border + 약한 accent-glow 배경 + "추세" 라벨 accent 색상
          //     --accent(파랑 #2563eb) + --accent-glow(rgba blue, 라이트/다크 자동 대응) 사용
          //     하드코딩 색상 금지 — 테마 변수만으로 일관성 유지
          // [v1.7] 헤더 라벨 "추세" → "추세 강도" (헤더 버튼 "강/중/약추세" 등급과 호응)
          // [v1.8] 헤더 라벨 "추세 강도" → "추세 방향"
          //   이유: 시장 레짐 섹션의 "추세강도(ADX)" 표현과 단어 충돌 → 의미 분리
          //         ADX는 추세의 '세기', trendScore는 종합 점수 (방향성 포함)
          const tCls = _report.trend.score>=60?'buy':_report.trend.score>=40?'hold':'sell';
          html += '<div style="margin-bottom:10px;'+_zoneStyle('trend')+'">';
          html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:11px;font-weight:800;color:var(--accent)">추세 방향</span><span style="font-size:14px;font-weight:800;color:var(--'+tCls+')">'+_report.trend.score+_deltaTag(_trendDelta)+'</span><span style="font-size:9px;color:var(--text3)">'+_report.trend.level+'</span></div>';
          // [S404] 추세방향 설명 중 '추가 상승 신호' 문구를 추가상승 점수 색으로 동기화 — 시선 유도(작은 문구 가독성↑)
          var _posHtml = _report.trend.position || '';
          if(_report.upside && /추가 상승 신호/.test(_posHtml)){
            var _upCls2 = _report.upside.score>=60?'buy':_report.upside.score>=40?'hold':'sell';
            _posHtml = _posHtml.replace(/추가 상승 신호/g, '<span style="color:var(--'+_upCls2+');font-weight:800">추가 상승</span> 신호');
          }
          html += '<div style="font-size:10px;color:var(--text2);line-height:1.6;margin-bottom:4px">'+_posHtml+'</div>';
          // S85→S87: 추세 조건별 가중치 — met만 표시, unmet 토글 숨김
          if((_report.trend.metW && _report.trend.metW.length) || (_report.trend.unmetW && _report.trend.unmetW.length)) {
            var _tmw = _report.trend.metW || [];
            var _tuw = _report.trend.unmetW || [];
            var _tUnmetId = 'tu_' + Math.random().toString(36).slice(2,8);
            html += '<div style="display:flex;flex-wrap:wrap;gap:3px 6px;margin-bottom:4px">';
            _tmw.forEach(function(c){
              var gTag = c.group==='ref'?' [참고]':'';
              html += '<span style="font-size:8px;color:var(--buy);white-space:nowrap" title="최대 '+c.maxW+' / '+c.group+'">[+] '+c.name+' <span style="font-size:7px;opacity:.6">'+c.weight+gTag+'</span></span>';
            });
            html += '</div>';
            if(_tuw.length) {
              html += '<div onclick="_sxVib(8);var u=document.getElementById(\''+_tUnmetId+'\');u.style.display=u.style.display===\'none\'?\'flex\':\'none\';this.querySelector(\'span\').textContent=u.style.display===\'none\'?\'▶\':\'▼\'" style="font-size:8px;color:var(--text3);cursor:pointer;margin-bottom:3px"><span>▶</span> 미충족 조건 '+_tuw.length+'개</div>';
              html += '<div id="'+_tUnmetId+'" style="display:none;flex-wrap:wrap;gap:3px 6px;margin-bottom:4px">';
              _tuw.forEach(function(c){
                var gTag = c.group==='ref'?' [참고]':'';
                html += '<span style="font-size:8px;color:var(--sell);white-space:nowrap;opacity:.7" title="최대 '+c.maxW+' / '+c.group+'">[-] '+c.name+' <span style="font-size:7px">'+c.weight+gTag+'</span></span>';
              });
              html += '</div>';
            }
          }
          // [S402] 추세 분해 요약 — trendPure parts 기반 (헤더 trendScore와 일치)
          if(_report.trend.breakdown) {
            var bd = _report.trend.breakdown;
            html += '<div style="font-size:8px;color:var(--text3);line-height:1.5;margin-bottom:4px">';
            if(bd.parts && bd.parts.length){
              html += bd.parts.map(function(p){ return p.name+' '+(p.w>=0?'+':'')+p.w; }).join(' · ') + ' → 종합 ' + bd.combined;
            } else {
              html += '종합 ' + (bd.combined!=null?bd.combined:'-');
            }
            html += '</div>';
          }
          html += '</div>';

          // S88: 추세 방향 추이 → SXChart.drawDeltaBar 캔버스 (v1.8: 추세강도→추세방향)
          if(_mom && _mom.history.length >= 3){
            const _tbCanvasId = _3stageId + '_tbc';
            const _tRev = _mom.history.slice().reverse().map(function(h){ return {score: h.trendScore || 0}; });
            html += '<div style="margin-bottom:10px">';
            html += '<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">추세 방향 추이 (최근 '+_mom.lookback+'봉)</div>';
            html += '<canvas id="'+_tbCanvasId+'" style="width:100%;height:48px;display:block"></canvas>';
            html += '</div>';
            (window._sxTrackedTimeout || setTimeout)(function(){ if(typeof SXChart!=='undefined' && SXChart.drawDeltaBar) SXChart.drawDeltaBar(_tbCanvasId, _tRev, _mom.lookback); }, 80);
          }

          // [S357] 추가 상승 섹션 — 순추세 추격 (ⓐ 채택 경로에 따라 활성/비활성 배경)
          if(_report.upside){
            const uCls = _report.upside.score>=60?'buy':_report.upside.score>=40?'hold':'sell';
            html += '<div style="margin-bottom:10px;'+_zoneStyle('upside')+'">';
            html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:11px;font-weight:800;color:var(--text)">추가 상승</span><span style="font-size:14px;font-weight:800;color:var(--'+uCls+')">'+_report.upside.score+_deltaTag(_upsideDelta)+'</span><span style="font-size:9px;color:var(--text3)">'+_report.upside.level+' · '+_report.upside.progress+'</span></div>';
            // [S404] 추가상승 설명 중 '추세 방향' 문구를 추세방향 점수 색으로 동기화 — 추세↔추가상승 상호 시선 유도
            var _upSumHtml = _report.upside.summary || '';
            if(_report.trend && /추세 방향/.test(_upSumHtml)){
              var _trCls2 = _report.trend.score>=60?'buy':_report.trend.score>=40?'hold':'sell';
              _upSumHtml = _upSumHtml.replace(/추세 방향/g, '<span style="color:var(--'+_trCls2+');font-weight:800">추세 방향</span>');
            }
            html += '<div style="font-size:10px;color:var(--text2);line-height:1.6;margin-bottom:4px">'+_upSumHtml+'</div>';
            if(_report.upside.met.length || _report.upside.unmet.length){
              var _umw = _report.upside.metW || [];
              var _uuw = _report.upside.unmetW || [];
              var _uUnmetId = 'uu_' + Math.random().toString(36).slice(2,8);
              html += '<div style="display:flex;flex-wrap:wrap;gap:3px 6px;margin-bottom:4px">';
              if(_umw.length){
                _umw.forEach(function(c){ html += '<span style="font-size:8px;color:var(--buy);white-space:nowrap">[v] '+c.name+' <span style="font-size:7px;opacity:.6">+'+c.weight+'</span></span>'; });
              } else {
                _report.upside.met.forEach(function(c){ html += '<span style="font-size:8px;color:var(--buy);white-space:nowrap">[v] '+c+'</span>'; });
              }
              html += '</div>';
              var _hasUU = _uuw.length ? _uuw.length : _report.upside.unmet.length;
              if(_hasUU){
                html += '<div onclick="_sxVib(8);var u=document.getElementById(\''+_uUnmetId+'\');u.style.display=u.style.display===\'none\'?\'flex\':\'none\';this.querySelector(\'span\').textContent=u.style.display===\'none\'?\'▶\':\'▼\'" style="font-size:8px;color:var(--text3);cursor:pointer;margin-bottom:3px"><span>▶</span> 미충족 조건 '+_hasUU+'개</div>';
                html += '<div id="'+_uUnmetId+'" style="display:none;flex-wrap:wrap;gap:3px 6px;margin-bottom:4px">';
                if(_uuw.length){
                  _uuw.forEach(function(c){ html += '<span style="font-size:8px;color:var(--text3);white-space:nowrap;opacity:.6">[ ] '+c.name+' <span style="font-size:7px">+'+c.weight+'</span></span>'; });
                } else {
                  _report.upside.unmet.forEach(function(c){ html += '<span style="font-size:8px;color:var(--text3);white-space:nowrap;opacity:.6">[ ] '+c+'</span>'; });
                }
                html += '</div>';
              }
            }
            if(_report.upside.warnings && _report.upside.warnings.length) html += '<div style="font-size:9px;color:var(--sell);line-height:1.5">'+_report.upside.warnings.map(function(n){return '[-] '+n}).join('<br>')+'</div>';
            html += '</div>';

            // 추가 상승 추이
            if(_mom && _mom.history.length >= 3){
              const _ubCanvasId = _3stageId + '_ubc';
              const _uRev = _mom.history.slice().reverse().map(function(h){ return {score: h.upsideScore || 0}; });
              html += '<div style="margin-bottom:10px">';
              html += '<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">추가 상승 추이 (최근 '+_mom.lookback+'봉)</div>';
              html += '<canvas id="'+_ubCanvasId+'" style="width:100%;height:48px;display:block"></canvas>';
              html += '</div>';
              (window._sxTrackedTimeout || setTimeout)(function(){ if(typeof SXChart!=='undefined' && SXChart.drawDeltaBar) SXChart.drawDeltaBar(_ubCanvasId, _uRev, _mom.lookback); }, 90);
            }
          }

          // S87: 구간 분포 추이 → SXChart.drawScoreSpark 캔버스
          if(stock._btTransitionStats && stock._btTransitionStats.timeline && stock._btTransitionStats.timeline.length >= 3) {
            const tl = stock._btTransitionStats.timeline;
            const _tlDetailId = _3stageId + '_tld';
            const _tlCanvasId = _3stageId + '_tlc';
            html += '<div style="margin-bottom:10px">';
            html += '<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">구간 분포 추이 ('+tl.length+'포인트) <span style="font-size:7px;color:var(--text3);font-weight:400">bar 클릭=상세</span></div>';
            html += '<canvas id="'+_tlCanvasId+'" style="width:100%;height:50px;display:block;cursor:pointer"></canvas>';
            html += '<div id="'+_tlDetailId+'" style="display:none;margin-top:4px;padding:4px 8px;background:var(--surface);border-radius:6px;font-size:8px;color:var(--text2);line-height:1.5"></div>';
            html += '</div>';
            // 렌더 후 그리기 (setTimeout으로 DOM 삽입 대기)
            (window._sxTrackedTimeout || setTimeout)(function(){ if(typeof SXChart!=='undefined' && SXChart.drawScoreSpark) SXChart.drawScoreSpark(_tlCanvasId, tl, _tlDetailId); }, 50);
          }

          // S127: 진입 검토 추이 차트는 Layer 2(ready) 섹션 바로 뒤로 이동 — 여기서는 제거
          //   이전 위치(구간분포 추이 다음)는 이미 A→A→C 레이어가 끝난 뒤라 문맥 부정합

          // 데이터 지연 판정
          if(_report.staleness.warning){
            html += '<div style="padding:6px 8px;background:rgba(255,140,0,.08);border-radius:6px;font-size:9px;line-height:1.5;color:var(--text2)">';
            html += '<span style="font-weight:700;color:#ff8c00">데이터 시점: '+_report.staleness.label+'</span><br>'+_report.staleness.warning;
            html += '</div>';
          }

          // [S420] 최종 판정 카드 → _swapVerdictHTML로 stash (BT 활용토글로 이동). 이 자리엔 "현재 지표 상태 요약" 렌더.
          //   폴백: _pgShared 없음(verdictAction 없음=BT 거래수 부족/미지원 TF) → swap 불가 → verdict를 원래대로 C패널에 표시.
          (function(){
            var _vHTML = '<div style="margin-top:8px;padding:8px 10px;background:var(--surface);border-radius:8px;border:1px solid var(--border)">';
            _vHTML += '<div style="font-size:11px;font-weight:800;color:var(--text);margin-bottom:4px">'+_report.verdict.label+'</div>';
            _vHTML += '<div style="font-size:10px;color:var(--text2);line-height:1.6;white-space:pre-line">'+_report.verdict.text+'</div>';
            // [S403] 종합점수(상태) 1단계 제동/가속 — 판정·라벨·색(_svVerdict)은 그대로, UI 해석만 보정
            //   상태 점수가 verdict 방향과 어긋나면(긍정판정+낮은상태 / 부정판정+높은상태) 한 단계 신중·경계 단서 표시
            var _bTot = (window._sxBoard && window._sxBoard._total != null) ? window._sxBoard._total : null;
            var _vLbl = _report.verdict.label || '';
            if(_bTot != null && (_vLbl==='매수'||_vLbl==='관심'||_vLbl==='보유 유지') && _bTot < 50){
              _vHTML += '<div style="font-size:9px;color:var(--sell);margin-top:6px;line-height:1.5;padding-top:6px;border-top:1px dashed var(--border)">⚠️ 종합점수 '+_bTot+'('+_sxbGrade(_bTot)+'등급) — 종목 상태가 약화 구간입니다. 판정보다 한 단계 신중하게(손절·익절 기준 점검) 접근하세요.</div>';
            } else if(_bTot != null && (_vLbl==='청산 검토'||_vLbl==='즉시 청산'||_vLbl==='회피'||_vLbl==='매도 완료') && _bTot >= 65){
              _vHTML += '<div style="font-size:9px;color:var(--buy);margin-top:6px;line-height:1.5;padding-top:6px;border-top:1px dashed var(--border)">ℹ️ 종합점수 '+_bTot+'('+_sxbGrade(_bTot)+'등급) — 상태는 견조한 편이니 과도한 비관은 경계하세요.</div>';
            }
            _vHTML += '</div>';

            if(_pgShared && _pgShared.title){
              // swap 모드: verdict는 BT 활용토글로 보내고(stash), 이 자리엔 현재 지표 상태 요약
              _swapVerdictHTML = _vHTML;
              if(_pgShared.extras && _pgShared.extras.length){
                html += '<div style="margin-top:8px;padding:8px 10px;background:var(--surface);border-radius:8px;border:1px solid var(--border)">';
                html += '<div style="font-size:11px;font-weight:800;color:var(--text);margin-bottom:6px">현재 지표 상태 요약</div>';
                _pgShared.extras.forEach(function(e){ html += '<div style="font-size:10px;color:var(--text2);margin-bottom:3px;line-height:1.5;padding-left:8px;border-left:2px solid var(--accent)">· '+e+'</div>'; });
                html += '</div>';
              }
            } else {
              // 폴백: pg 없음 → swap 안 함, verdict 원래대로 C패널 유지
              html += _vHTML;
              _swapVerdictHTML = '';
            }
          })();

          return html;
        })()}
        </div>`;
      })()}
      <div id="${_stratDetailId}" style="display:${stock._engineVerifyOpen ? 'block' : 'none'};margin-top:8px">
      ${(()=>{
        // S114: "매수 근거 평가" 카드 → "엔진판단 검증 결과" 6칸 카드로 교체
        //   [이전 문제] calcEntryEvaluation이 C 판정과 독립 계산 → 청산/즉시청산 상태에서도 "양호한 매수 60점" 표시 (역행 이슈)
        //     · S112에서 발견된 미래에셋증권 사례: 반등조짐 ⬇ / 전이 20% ⬇ / 매수근거 60점 ⬆ (모순)
        //     · 수학적 재현: 즉시청산 상태 + analScore=45/RR=1.2/BT=75 → "보통 매수 45점" (완전 모순)
        //   [S114 해결] 계산된 점수 대신 "실제 BT 결과"를 표시 → 검증된 데이터이므로 C와 독립이어도 사실
        //     · 프로젝트 C v3.0 원칙 ⑧ "검증가능성" 준수
        //   [레이아웃] 6칸 (승률/손익비/수익률/거래수/MDD/평균이익) — 단일검증 탭과 연동
        //   [데이터 없음 시] "▶ 엔진판단 검증 버튼을 눌러 백테스트를 실행하세요" 안내
        //   [복원 필요 시] 이전 매수 근거 평가 카드 코드는 git 히스토리 또는 s113 백업 참조
        const _btR = stock._btResult;
        if(!_btR || _btR.error || !_btR.totalTrades){
          return `
      <div style="margin-top:10px;padding:14px 12px;background:var(--surface2);border-radius:10px;border-left:3px solid var(--text3);text-align:center">
        <div style="font-size:11px;color:var(--text2);font-weight:700;margin-bottom:6px">📊 엔진판단 검증 결과</div>
        <div style="font-size:10.5px;color:var(--text3);line-height:1.5">백테스트 결과 없음<br>위 <b>엔진판단 검증 ▶</b> 버튼 클릭 시 실행됩니다</div>
      </div>`;
        }
        // BT 결과 6칸: 승률/손익비/수익률 / 거래수/MDD/기댓값
        const _wr = _btR.winRate ?? 0;
        const _pnl = _btR.totalPnl ?? 0;
        const _tr = _btR.totalTrades ?? 0;
        const _mdd = Math.abs(_btR.mdd ?? 0);
        const _avgP = _btR.avgWin ?? (_btR.avgProfit > 0 ? _btR.avgProfit : 0);
        const _avgL = _btR.avgLoss ?? (_btR.avgProfit < 0 ? Math.abs(_btR.avgProfit) : 0);
        // 손익비 (profit factor 우선, 없으면 avgWin/avgLoss)
        let _rr = _btR.profitFactor ?? 0;
        if(!_rr && _avgP > 0 && _avgL > 0) _rr = _avgP / _avgL;
        const _rrStr = _rr > 0 ? _rr.toFixed(2) : '—';
        // [S292] 기댓값 = (승률 × 평균이익) - (패율 × 평균손실)
        //   단일검증 탭과 동일 공식 사용 — 전략 기대수익 직관적 표현
        const _ev = (_tr > 0 && (_avgP > 0 || _avgL > 0))
          ? ((_wr / 100) * _avgP) - ((1 - _wr / 100) * _avgL)
          : 0;
        const _evStr = _tr > 0 ? (_ev >= 0 ? '+' : '') + _ev.toFixed(2) + '%' : '—';
        // S116: 데이터 충족/부족/충분 라벨 (기존 하단 "매매전략" 배너에서 이관)
        //   거래수 기준: < BT_MIN_TRADES(10) = 부족 / < 30 = 충족 / >= 30 = 충분
        let _dataLabel, _dataClr;
        if(_tr < BT_MIN_TRADES){ _dataLabel = '데이터 부족'; _dataClr = '#e8365a'; }
        else if(_tr < 30){ _dataLabel = '데이터 충족'; _dataClr = '#3b82f6'; }
        else { _dataLabel = '데이터 충분'; _dataClr = '#22c55e'; }
        //   승률, 수익률, 기댓값 — 음수 빨강 / 양수 녹색 (간단 2단계)
        //   손익비, MDD — 기본 검정 (var(--text))
        //   거래수 — 데이터 충족 라벨과 동일 색 (부족=빨강/충족=파랑/충분=녹색)
        const _posColor = '#22c55e';  // 녹색 (양수)
        const _negColor = '#e8365a';  // 빨강 (음수)
        // [S292] 승률 4단계: 60%↑녹색 / 40~59%파랑 / 20~39%주황 / 0~19%빨강
        const _wrClr = _wr >= 60 ? _posColor : _wr >= 40 ? '#3b82f6' : _wr >= 20 ? '#f97316' : _negColor;
        // [S295] 총수익률 4단계: ≥100% 녹색 / 50~99.9% 파랑 / 0~49.9% 주황 / <0 빨강
        const _pnlClr = _pnl >= 100 ? _posColor : _pnl >= 50 ? '#3b82f6' : _pnl >= 0 ? '#f97316' : _negColor;
        const _evClr = _ev >= 1.0 ? _posColor : _ev >= 0 ? '#f97316' : _negColor; // [S293] 3단계
        // [S293] 손익비 4단계: ≥2.0 녹색 / 1.5~1.99 파랑 / 1.0~1.49 주황 / <1.0 빨강
        const _rrClr = _rr >= 2.0 ? _posColor : _rr >= 1.5 ? '#3b82f6' : _rr >= 1.0 ? '#f97316' : _negColor;
        // [S294] MDD 3단계: <10% 파랑 / 10~19.9% 보라 / ≥20% 빨강
        const _mddClr = _mdd >= 20 ? _negColor : _mdd >= 10 ? '#8b5cf6' : '#3b82f6';
        const _trClr = _dataClr;       // 거래수는 데이터 충족 라벨과 동일색
        // 봉수 표시 (투명성)
        const _rowsLen = _btR.rowsLength || 0;
        const _rowsBadge = _rowsLen >= 600 ? '🟢' : _rowsLen >= 400 ? '🔵' : _rowsLen > 0 ? '🔴' : '';
        // S120-2: 강건성 배지 (🌱 신뢰 / ⚠️ 불안)
        //   200봉 vs 600봉 수익률 편차 기반 — 구간 의존성(과적합) 탐지
        //   stock._robustness.show=true일 때만 렌더 (봉수/거래수 조건 충족 시)
        let _robBadge = '';
        if(stock._robustness && stock._robustness.show){
          const _rob = stock._robustness;
          const _robIcon = _rob.label === 'trust' ? '🌱' : '⚠️';
          const _robText = _rob.label === 'trust' ? '강건성 신뢰' : '강건성 불안';  // [S398] 라벨 명시 — BT 종합점수와 다른 축
          const _robColor = _rob.label === 'trust' ? '#22c55e' : '#f59e0b';
          const _robBg = _rob.label === 'trust' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)';
          const _robTitle = `200봉 ${_rob.pnl200.toFixed(1)}% vs 600봉 ${_rob.pnl600.toFixed(1)}% · 편차 ${(_rob.deviation*100).toFixed(0)}%`;
          _robBadge = `<span title="${_robTitle}" style="display:inline-flex;align-items:center;gap:2px;padding:2px 7px;background:${_robBg};border-radius:10px;font-size:10px;font-weight:800;color:${_robColor};margin-left:6px">${_robIcon} ${_robText}</span>`;
        }
        return `
      <div style="margin-top:10px;padding:10px 12px;background:var(--surface2);border-radius:10px;border-left:3px solid ${
        (()=>{ const sc=calcBtScore(_btR, stock); return sc==null?'#94a3b8':sc>=70?'#22c55e':sc>=50?'#3b82f6':sc>=30?'#f97316':'#e8365a'; })()
      }">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:4px">
          <div style="font-size:11px;color:var(--text2);font-weight:700;letter-spacing:-.3px">📊 엔진판단 검증 결과${_robBadge}</div>
          <div style="font-size:10px;color:var(--text3);white-space:nowrap">${_rowsBadge} ${_rowsLen}봉</div>
        </div>
        ${(()=>{
          // [S425] 진입 기준 배지 — 타이틀 줄 아래 별도 줄로 표기 (현재 설정이 아닌 결과 산출 모드 기준).
          const _m = _btR.entryMode || 'close';
          const _g = _btR.gapGuard;
          const _t = _m === 'nextOpen' ? ('다음봉 시가 기준' + (_g ? ' ·갭가드' : '')) : '신호봉 종가 기준';
          const _c = _m === 'nextOpen' ? 'var(--accent)' : 'var(--text3)';
          return `<div style="margin-bottom:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="display:inline-flex;align-items:center;padding:2px 8px;background:var(--surface);border:1px solid ${_c};border-radius:10px;font-size:9.5px;font-weight:700;color:${_c};white-space:nowrap">${_t}</span><span style="font-size:9px;color:var(--text3)">※ 현재 보유중 매수건은 제외 (확정 매매 기준)</span></div>`;
        })()}
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
          <div style="text-align:center;padding:6px 2px;background:var(--surface);border-radius:6px">
            <div style="font-size:14px;font-weight:800;color:${_wrClr};line-height:1.2">${_wr.toFixed(1)}%</div>
            <div style="font-size:9px;color:var(--text3);margin-top:1px">승률</div>
          </div>
          <div style="text-align:center;padding:6px 2px;background:var(--surface);border-radius:6px">
            <div style="font-size:14px;font-weight:800;color:${_rrClr};line-height:1.2">${_rrStr}</div>
            <div style="font-size:9px;color:var(--text3);margin-top:1px">손익비</div>
          </div>
          <div style="text-align:center;padding:6px 2px;background:var(--surface);border-radius:6px">
            <div style="font-size:14px;font-weight:800;color:${_pnlClr};line-height:1.2">${_pnl>=0?'+':''}${_pnl.toFixed(1)}%</div>
            <div style="font-size:9px;color:var(--text3);margin-top:1px">수익률</div>
          </div>
          <div style="text-align:center;padding:6px 2px;background:var(--surface);border-radius:6px">
            <div style="font-size:14px;font-weight:800;color:${_trClr};line-height:1.2">${_tr}</div>
            <div style="font-size:9px;color:var(--text3);margin-top:1px">거래수</div>
          </div>
          <div style="text-align:center;padding:6px 2px;background:var(--surface);border-radius:6px">
            <div style="font-size:14px;font-weight:800;color:${_mddClr};line-height:1.2">${_mdd.toFixed(1)}%</div>
            <div style="font-size:9px;color:var(--text3);margin-top:1px">MDD</div>
          </div>
          <div style="text-align:center;padding:6px 2px;background:var(--surface);border-radius:6px">
            <div style="font-size:14px;font-weight:800;color:${_evClr};line-height:1.2">${_evStr}</div>
            <div style="font-size:9px;color:var(--text3);margin-top:1px">기댓값</div>
          </div>
        </div>
        ${(()=>{
          // [S293] BT신뢰도 점수 + B(엔진시뮬) 상태 — 6카드 그리드 아래 배치
          //   · BT신뢰도: 기존 "데이터 충족/부족/충분" 텍스트 → btScore 점수로 대체
          //   · B상태(진입가/목표가/손절가): 배너 중심부에서 이곳으로 이동
          const _btSc = stock._btScore != null ? stock._btScore : (_analBtScore != null ? _analBtScore : null);
          const _btStHere = stock._btState || _analBtState;
          const _svVHere  = stock._svVerdict || null;

          // BT 종합점수 바 + 메타 (표본/강건성/과최적 사유 투명화)
          let _reliabilityHTML = '';
          if(_btSc != null){
            const _reliClr = _btSc >= 70 ? '#22c55e' : _btSc >= 50 ? '#3b82f6' : _btSc >= 30 ? '#f97316' : '#e8365a';
            // [S398] 점수 캡 사유 한 줄 — calcBtScore의 거래수 캡/과최적 캡(S396)과 동일 조건으로 카드에서 재계산.
            //   표본 부족(<20) / 강건성 불안(stock._robustness) / 과최적 의심((승률≥85 OR PF≥4) AND 거래<30)
            const _mTrades = _btR.totalTrades || 0, _mWr = _btR.winRate || 0, _mPf = _btR.profitFactor || 0;
            const _metaParts = [`표본 ${_mTrades}건${_mTrades < 20 ? ' <span style="color:#f59e0b">부족</span>' : ''}`];
            if(stock._robustness && stock._robustness.show)
              _metaParts.push(`강건성 ${stock._robustness.label === 'trust' ? '<span style="color:#22c55e">신뢰</span>' : '<span style="color:#f59e0b">불안</span>'}`);
            if((_mWr >= 85 || _mPf >= 4) && _mTrades < 30)
              _metaParts.push('<span style="color:#f59e0b">과최적 의심</span>');
            // [S464] 코어(조기청산 제외) 베이스라인 한 줄 — 조기청산 ON일 때만 표시(_coreDiag.show)
            let _coreLine = '';
            if(stock._coreDiag && stock._coreDiag.show){
              const _cr = stock._coreDiag.rob;
              const _crTxt = _cr === 'trust' ? '<span style="color:#22c55e">강건성 신뢰</span>'
                          : _cr === 'fragile' ? '<span style="color:#f59e0b">강건성 불안</span>'
                          : '강건성 –';
              const _coTxt = stock._coreDiag.overfit ? '<span style="color:#f59e0b">과최적 의심</span>' : '<span style="color:#22c55e">과최적 없음</span>';
              _coreLine = `<div style="font-size:9px;color:var(--text3);margin-top:3px;letter-spacing:-.2px">🧩 코어(조기청산 제외): ${_crTxt} · ${_coTxt}</div>`;
            }
            _reliabilityHTML = `<div style="margin-top:8px;padding:6px 8px;background:var(--surface);border-radius:6px">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:10px;color:var(--text3);font-weight:700;white-space:nowrap">BT 종합점수</span>
                <div style="flex:1;height:5px;background:var(--surface3);border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${_btSc}%;background:${_reliClr};border-radius:3px;transition:width .4s"></div>
                </div>
                <span style="font-size:11px;font-weight:800;color:${_reliClr};min-width:28px;text-align:right">${_btSc}점</span>
              </div>
              <div style="font-size:9px;color:var(--text3);margin-top:4px;letter-spacing:-.2px">${_metaParts.join(' · ')}</div>${_coreLine}
            </div>`;
          }

          // B상태 (엔진시뮬 포지션)
          const _bSimHTML = (typeof _buildSimPositionLine === 'function' && _btStHere)
            ? _buildSimPositionLine(stock, _btStHere, _svVHere)
            : '';

          // [S305] 변동성 타깃팅 적용 상태 박스 — _btResult.volTarget 메타 기반
          //   목적: 사용자가 분석탭에서 BT 결과의 posScale/추정 ATR%를 즉시 확인.
          //         설정탭 미리보기와 다른 점: 실제 BT 결과의 평균 + 범위 표시 (사후 측정값).
          //   표시 조건: volTarget.active === true (변동성 타깃팅 활성 상태로 BT 실행됨)
          //         OFF로 BT 돌린 경우는 박스 자체를 숨김 (UI 노이즈 최소화).
          //   [S306] 헤더 클릭 시 서술식 상세 안내 펼침 — 사용자가 숫자 의미 즉시 이해
          //   [S307] ATR 실측 통계 + BT 정확도 섹션 추가 — 종목별 BT 신뢰도 가늠 지표
          let _vtBoxHTML = '';
          const _vtMeta = stock._btResult && stock._btResult.volTarget;
          if(_vtMeta && _vtMeta.active && _vtMeta.scaleAvg != null){
            const _vtMarketLabel = (_vtMeta.market === 'coin' || _vtMeta.market === 'crypto') ? '🪙 COIN'
              : (_vtMeta.market === 'us') ? '🇺🇸 US' : '🇰🇷 KR';
            // [S307] 종목 ATR — 실측(atrActualAvg) 우선, 누락 시 역산(target/scaleAvg) 폴백
            const _atrActual = _vtMeta.atrActualAvg;  // BT 직접 측정 (산술평균, 가장 정확)
            const _atrInferred = (_vtMeta.scaleAvg > 0) ? (_vtMeta.targetPct / _vtMeta.scaleAvg) : null;  // 역산 (조화평균)
            const _atrDisplay = _atrActual != null ? _atrActual : _atrInferred;
            // [S307] 오차율 — 실측과 역산의 차이로 BT 정확도 가늠
            const _atrErr = (_atrActual != null && _atrInferred != null && _atrActual > 0)
              ? Math.abs(_atrActual - _atrInferred) / _atrActual * 100
              : null;
            const _scaleClr = _vtMeta.scaleAvg >= 1.0 ? '#22c55e' : '#f59e0b';  // 1.0 이상=초록(증가), 미만=주황(감소)
            const _rangeText = (_vtMeta.scaleMin != null && _vtMeta.scaleMax != null && _vtMeta.scaleMin !== _vtMeta.scaleMax)
              ? `<span style="color:var(--text3);font-size:9px"> (${_vtMeta.scaleMin.toFixed(2)}~${_vtMeta.scaleMax.toFixed(2)})</span>` : '';
            // [S306] 펼침 영역용 고유 ID
            const _vtId = 'vt_' + Math.random().toString(36).slice(2,8);
            // [S307] 실전 미러 진입금 계산 예시 (자산 흐름 카드와 동일한 100만원 기준)
            const _seedKRW = 1000000;
            const _entryKRW = Math.round(_seedKRW * _vtMeta.scaleAvg).toLocaleString();
            // [S306] 자본 비율 (%) 표기 — scaleAvg × 100
            const _capPct = (_vtMeta.scaleAvg * 100).toFixed(0);
            // [S306] clamp 끝점 도달 여부 — ATR 추정 정확도 안내용
            const _clampHit = (_vtMeta.scaleMin <= _vtMeta.clampMin + 0.01) || (_vtMeta.scaleMax >= _vtMeta.clampMax - 0.01);
            // [S307] BT 정확도 판정 — 오차율 기준 색상 + 라벨
            let _accuracyClr, _accuracyLabel, _accuracyDesc;
            if(_atrErr == null){
              _accuracyClr = '#9ca3af'; _accuracyLabel = '측정 불가'; _accuracyDesc = '실측 또는 역산 데이터 누락';
            } else if(_atrErr < 5){
              _accuracyClr = '#22c55e'; _accuracyLabel = 'BT 매우 정확'; _accuracyDesc = '변동성 일관 · 실측과 역산 거의 일치';
            } else if(_atrErr < 15){
              _accuracyClr = '#f59e0b'; _accuracyLabel = 'BT 양호'; _accuracyDesc = '시기별 변동성 차이 있음 · Clamp 영향 가능';
            } else {
              _accuracyClr = '#ef4444'; _accuracyLabel = 'BT 주의'; _accuracyDesc = 'ATR 산포 큼 또는 Clamp 발동 — 결과 신뢰도 ↓';
            }
            // [S307] 표준편차 표기 (실측 평균 ± 표준편차)
            const _atrStdText = (_vtMeta.atrActualStd != null && _vtMeta.atrActualAvg != null)
              ? ` <span style="color:var(--text3);font-size:9px">±${_vtMeta.atrActualStd.toFixed(2)}</span>` : '';

            _vtBoxHTML = `<div style="margin-top:8px;padding:8px 10px;background:rgba(245,158,11,0.06);border-left:3px solid #f59e0b;border-radius:6px;cursor:pointer"
                onclick="if(typeof _sxVib==='function')_sxVib(8);const c=document.getElementById('${_vtId}');c.style.display=c.style.display==='none'?'block':'none';this.querySelector('.vt-arrow').textContent=c.style.display==='block'?'▼':'▶'">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-size:10px;color:#f59e0b;font-weight:800;white-space:nowrap">🎯 변동성 타깃팅</span>
                <span style="font-size:10px;color:var(--text2);font-weight:600">${_vtMarketLabel} 목표 ${_vtMeta.targetPct}%</span>
                ${_atrDisplay != null ? `<span style="font-size:10px;color:var(--text3)">· 종목 ATR ${_atrDisplay.toFixed(2)}%${_atrStdText}</span>` : ''}
                <span class="vt-arrow" style="margin-left:auto;font-size:10px;color:var(--text3);font-weight:700">▶</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:10px;color:var(--text2)">
                <span style="white-space:nowrap">포지션 평균</span>
                <span style="font-weight:800;font-size:13px;color:${_scaleClr}">${_vtMeta.scaleAvg.toFixed(2)}x</span>
                ${_rangeText}
                ${_atrErr != null ? `<span style="font-size:9px;padding:1px 6px;background:${_accuracyClr};color:#fff;border-radius:3px;font-weight:700;margin-left:4px">${_accuracyLabel}</span>` : ''}
                <span style="margin-left:auto;font-size:9px;color:var(--text3)">${_vtMeta.sampleCount}거래</span>
              </div>
            </div>
            <!-- [S306] 서술식 상세 안내 (펼침) -->
            <div id="${_vtId}" style="display:none;margin-top:6px;padding:10px 12px;background:var(--surface);border:1px solid rgba(245,158,11,0.3);border-radius:6px;font-size:11px;color:var(--text2);line-height:1.7">
              <div style="font-size:11px;font-weight:700;color:#f59e0b;margin-bottom:8px">📊 이 숫자의 의미</div>
              <div style="margin-bottom:10px;padding:8px;background:var(--surface2);border-radius:4px">
                <div style="font-weight:600;color:var(--text);margin-bottom:4px">포지션 평균 <span style="color:${_scaleClr};font-size:13px">${_vtMeta.scaleAvg.toFixed(2)}x</span> = 자본의 <b style="color:${_scaleClr}">${_capPct}%</b> 진입</div>
                <div style="font-size:10px;color:var(--text3);line-height:1.6">
                  · <b>1.00x</b> = 자본 100% 진입 (기존 BT 동일)<br>
                  · <b>&lt;1.00x</b> = 변동성 큰 종목 → 보수적 진입 (주황)<br>
                  · <b>&gt;1.00x</b> = 변동성 작은 종목 → 적극적 진입 (초록, 레버리지/추가자금)
                </div>
                <div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);font-size:10px;color:var(--text2)">
                  💰 <b>실전 미러 예시</b>: 종자돈 1,000,000원이면 → <b style="color:${_scaleClr}">${_entryKRW}원</b> 진입 <span style="color:var(--text3);font-size:9px">(자산 흐름 카드와 동일 기준)</span>
                </div>
              </div>
              ${(_vtMeta.scaleMin != null && _vtMeta.scaleMax != null && _vtMeta.scaleMin !== _vtMeta.scaleMax) ? `
              <div style="margin-bottom:10px;padding:8px;background:var(--surface2);border-radius:4px">
                <div style="font-weight:600;color:var(--text);margin-bottom:4px">범위 <span style="color:var(--text2)">${_vtMeta.scaleMin.toFixed(2)}x ~ ${_vtMeta.scaleMax.toFixed(2)}x</span></div>
                <div style="font-size:10px;color:var(--text3);line-height:1.6">
                  거래마다 진입 시점의 ATR%가 다르기 때문에 포지션도 거래마다 달라져요.<br>
                  · 범위 좁음 = 변동성 일정<br>
                  · 범위 넓음 = 시기별 변동성 차이 큼
                </div>
              </div>` : ''}
              ${(_atrActual != null && _atrInferred != null) ? `
              <!-- [S307] BT 정확도 섹션 — 실측 vs 역산 비교로 BT 신뢰도 가늠 -->
              <div style="margin-bottom:10px;padding:8px;background:var(--surface2);border-radius:4px;border-left:3px solid ${_accuracyClr}">
                <div style="font-weight:600;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:6px">
                  📐 BT 정확도
                  <span style="font-size:9px;padding:1px 6px;background:${_accuracyClr};color:#fff;border-radius:3px;font-weight:700">${_accuracyLabel}</span>
                </div>
                <div style="font-size:10px;color:var(--text2);line-height:1.7;font-family:'SF Mono',Consolas,monospace">
                  <div style="display:flex;justify-content:space-between;padding:2px 0">
                    <span style="color:var(--text3)">실측 ATR (BT 직접 측정)</span>
                    <span style="font-weight:700;color:var(--text)">${_atrActual.toFixed(2)}%${_vtMeta.atrActualStd != null ? ` ± ${_vtMeta.atrActualStd.toFixed(2)}%` : ''}</span>
                  </div>
                  ${(_vtMeta.atrActualMin != null && _vtMeta.atrActualMax != null) ? `
                  <div style="display:flex;justify-content:space-between;padding:2px 0;color:var(--text3);font-size:9px">
                    <span>최소 ~ 최대</span>
                    <span>${_vtMeta.atrActualMin.toFixed(2)}% ~ ${_vtMeta.atrActualMax.toFixed(2)}%</span>
                  </div>` : ''}
                  <div style="display:flex;justify-content:space-between;padding:2px 0;border-top:1px dashed var(--border);margin-top:2px;padding-top:4px">
                    <span style="color:var(--text3)">역산 ATR (목표 ÷ 평균)</span>
                    <span style="font-weight:700;color:var(--text)">${_atrInferred.toFixed(2)}%</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;padding:2px 0">
                    <span style="color:var(--text3)">오차율</span>
                    <span style="font-weight:800;color:${_accuracyClr}">${_atrErr.toFixed(1)}%</span>
                  </div>
                </div>
                <div style="margin-top:6px;font-size:9px;color:var(--text3);line-height:1.5">
                  ${_accuracyDesc}
                </div>
                <div style="margin-top:6px;font-size:9px;color:var(--text3);line-height:1.5;padding-top:6px;border-top:1px dashed var(--border)">
                  <b>판정 기준</b>: <span style="color:#22c55e">&lt;5% 매우 정확</span> · <span style="color:#f59e0b">5~15% 양호</span> · <span style="color:#ef4444">&gt;15% 주의</span>
                </div>
              </div>` : (_atrInferred != null ? `
              <div style="margin-bottom:10px;padding:8px;background:var(--surface2);border-radius:4px">
                <div style="font-weight:600;color:var(--text);margin-bottom:4px">종목 ATR 추정 <span style="color:var(--text2)">≈ ${_atrInferred.toFixed(2)}%</span></div>
                <div style="font-size:10px;color:var(--text3);line-height:1.6">
                  역산 추정: 목표 ATR ÷ 평균 비율 = ${_vtMeta.targetPct}% ÷ ${_vtMeta.scaleAvg.toFixed(2)} = ${_atrInferred.toFixed(2)}%${_clampHit ? '<br><span style="color:#f59e0b">⚠ Clamp 끝점 도달 → 추정 부정확</span>' : ''}
                </div>
              </div>` : '')}
              <div style="padding:8px;background:rgba(34,197,94,0.06);border-radius:4px">
                <div style="font-weight:600;color:var(--text);margin-bottom:4px">🎯 효과</div>
                <div style="font-size:10px;color:var(--text3);line-height:1.6">
                  · 변동성 <b style="color:#f59e0b">큰 종목</b> → 작게 (주황) 보수적 진입<br>
                  · 변동성 <b style="color:#22c55e">작은 종목</b> → 크게 (초록) 적극적 진입<br>
                  · 종목 간 자본 손실 폭 균등화 → <b>MDD 격차 평탄화</b><br>
                  · 같은 파라미터로 여러 종목 비교 시 일관성 확보
                </div>
              </div>
              <div style="margin-top:8px;padding:6px 8px;background:var(--surface2);border-radius:4px;font-size:9px;color:var(--text3);line-height:1.5">
                ⚙ 설정 변경: 설정탭 → 변동성 타깃팅 → [설정] → 시장별 목표 ATR% 조정 후 BT 재실행
              </div>
            </div>`;
          }

          if(!_reliabilityHTML && !_bSimHTML && !_vtBoxHTML) return '';
          return _reliabilityHTML + _vtBoxHTML + _bSimHTML;
        })()}
      </div>`;
      })()}
      ${(()=>{
        // ═══════════════════════════════════════════════════════════════
        // S116: "매매 근거 상세" 카드 + "_buildBtBanner" 하단 배너 완전 제거
        //   [삭제 대상 1] 매매 근거 상세 카드 (SXE.calcEntryPrice + SXE.calcTpSlRr + SXI.advTpSl)
        //     · ATR/피봇 수치 → 이미 "지표 분석" 섹션에 존재 (기술적 지표: ATR, 피벗 라인)
        //     · "보수적 접근 필요", "파라미터 조정 검토" 등 판단 문구 → SXI/SXE Layer 1 독자 판단
        //     · "목표가/손절가 산출 근거", "진입가 산출 근거" → SXE 독자 추천
        //     → 모든 텍스트가 프로젝트 C v3.0 원칙 ①(독자판정금지), ②(C의 단일성) 위반
        //   [삭제 대상 2] _buildBtBanner(stock, qs) — 하단 "매매전략 — 데이터 충족" 배너
        //     · 상단 "엔진판단 검증 결과" 6칸 카드와 내용 중복 (승률/수익/거래/MDD/손익비)
        //     · "데이터 충족" 라벨만 엔진판단 검증 결과 카드 타이틀 옆으로 이관 (S116 수정 1)
        //   [유지] 지표 분석 섹션 (ATR, 피벗, ADX 등 원시 측정값) — 판단이 아닌 측정값
        //   [복원 필요 시] S115 이전 sx_render.js 또는 s115_continuity.html 참조
        //
        //   프로젝트 C v3.0 원칙:
        //     · 원칙 ① "독자판정금지": SXE/SXI Layer 1 독자 판단 텍스트 전부 제거
        //     · 원칙 ② "C의 단일성": 판단은 SXC.supervisorJudge(C)만 담당
        //     · 원칙 ⑤ "정합 우선": 상단 6칸 카드(BT 결과)와 중복 제거
        //     · 원칙 ⑦ "UI 역할 분리": 측정값=지표 분석, 판정=C 배너, 검증=BT 6칸 카드
        // ═══════════════════════════════════════════════════════════════
        return '';
      })()}
      <div class="anal-fold" style="margin-top:12px">
        <div class="anal-fold-hdr" onclick="_sxVib(8);this.parentElement.classList.toggle('fold-open')"><span class="anal-fold-arrow">▶</span> 실패 분석 · 전략 라이프사이클</div>
        <div class="anal-fold-body">
      ${(()=>{
        // S70: 실패 분석 (Failure Analysis)
        if(typeof SXI==='undefined' || !SXI.failureAnalysis) return '';
        const _btD = _getBtData(stock);
        if(!_btD || !_btD.trades || !_btD.trades.length) return '';
        const fa = SXI.failureAnalysis(_btD, indicators, qs, _analTF);
        if(!fa) return '';
        const faId = 'fa_' + Math.random().toString(36).slice(2,8);
        const riskColor = fa.riskProfile.level==='danger'?'var(--sell)':fa.riskProfile.level==='warning'?'#ff8c00':fa.riskProfile.level==='bullish'?'var(--buy)':'var(--text2)';
        let faHTML = `<div class="anal-section" style="margin-top:8px">
          <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${faId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:11px;color:var(--accent);cursor:pointer;font-weight:700"><span class="sb-arrow">▶</span> 실패 분석 <span style="font-size:9px;font-weight:600;color:${riskColor};margin-left:4px">${fa.riskProfile.label}</span></div>
          <div class="itp-card" id="${faId}" style="white-space:normal;margin-top:4px">`;

        // 요약
        faHTML += `<div style="font-size:11px;color:var(--text);margin-bottom:10px;line-height:1.6">${fa.summary}</div>`;

        // 승패 통계 비교
        if(fa.stats){
          const st = fa.stats;
          faHTML += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
            <div style="padding:6px 8px;background:var(--buy-bg);border-radius:6px;text-align:center">
              <div style="font-size:9px;color:var(--text3)">이익 거래</div>
              <div style="font-size:13px;font-weight:700;color:var(--buy)">${st.winCount}건</div>
              <div style="font-size:9px;color:var(--text3)">평균 +${st.avgWin}% / ${st.avgWinBars}봉</div>
            </div>
            <div style="padding:6px 8px;background:rgba(255,59,48,.06);border-radius:6px;text-align:center">
              <div style="font-size:9px;color:var(--text3)">손실 거래</div>
              <div style="font-size:13px;font-weight:700;color:var(--sell)">${st.lossCount}건</div>
              <div style="font-size:9px;color:var(--text3)">평균 -${st.avgLoss}% / ${st.avgLossBars}봉</div>
            </div>
          </div>`;
        }

        // 손실 패턴
        if(fa.lossPatterns.length){
          faHTML += `<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:6px">손실 패턴</div>`;
          fa.lossPatterns.forEach(p => {
            faHTML += `<div style="padding:8px;background:var(--surface2);border-radius:6px;margin-bottom:6px;border-left:3px solid var(--sell)">
              <div style="font-size:10px;font-weight:700;color:var(--sell);margin-bottom:3px">${p.title} (${p.count}건, ${p.ratio}%)</div>
              <div style="font-size:10px;color:var(--text2);line-height:1.5;margin-bottom:4px">${p.detail}</div>
              <div style="font-size:10px;color:var(--accent);line-height:1.5">-> ${p.suggestion}</div>
            </div>`;
          });
        }

        // 최악의 거래
        if(fa.worstTrade){
          faHTML += `<div style="padding:8px;background:rgba(255,59,48,.06);border-radius:6px;margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;color:var(--sell);margin-bottom:3px">최대 손실 거래</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${fa.worstTrade.detail}</div>
          </div>`;
        }

        // 연속 손실
        if(fa.streakAnalysis){
          const sa = fa.streakAnalysis;
          faHTML += `<div style="padding:8px;background:rgba(255,140,0,.06);border-radius:6px;margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;color:#ff8c00;margin-bottom:3px">연속 손실 분석</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5;margin-bottom:4px">${sa.detail}</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${sa.interpretation}</div>
          </div>`;
        }

        // MDD 맥락
        if(fa.mddContext){
          const mc = fa.mddContext;
          const mddColor = mc.severity==='위험'?'var(--sell)':mc.severity==='주의'?'#ff8c00':mc.severity==='보통'?'var(--text2)':'var(--buy)';
          faHTML += `<div style="padding:8px;background:var(--surface2);border-radius:6px;margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;color:${mddColor};margin-bottom:3px">MDD ${mc.mdd.toFixed(1)}% — ${mc.severity}</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${mc.advice}</div>
          </div>`;
        }

        // 개선 제안
        if(fa.improvements.length){
          faHTML += `<div style="font-size:10px;font-weight:700;color:var(--text);margin:8px 0 6px">개선 제안</div>`;
          fa.improvements.forEach(imp => {
            const prioColor = imp.priority==='high'?'var(--sell)':imp.priority==='mid'?'#ff8c00':'var(--text3)';
            const prioLabel = imp.priority==='high'?'중요':imp.priority==='mid'?'권장':'참고';
            faHTML += `<div style="padding:8px;background:var(--surface2);border-radius:6px;margin-bottom:6px">
              <div style="font-size:9px;font-weight:700;color:${prioColor};margin-bottom:2px">${prioLabel} — ${imp.area}</div>
              <div style="font-size:10px;color:var(--text2);line-height:1.5">${imp.text}</div>
            </div>`;
          });
        }

        faHTML += `</div></div>`;
        return faHTML;
      })()}
      ${(()=>{
        // S72: 전략 라이프사이클 (Strategy Lifecycle)
        if(typeof SXE==='undefined' || !SXE.strategyLifecycle) return '';
        if(typeof SXI==='undefined' || !SXI.lifecycleGuide) return '';
        const _btD = _getBtData(stock);
        if(!_btD || !_btD.trades || _btD.trades.filter(t=>t.type==='WIN'||t.type==='LOSS').length < 6) return '';
        const regime = qs?.regime || null;
        const lc = SXE.strategyLifecycle(_btD, regime);
        if(!lc) return '';
        const guide = SXI.lifecycleGuide(lc);
        if(!guide) return '';
        const lcId = 'lc_' + Math.random().toString(36).slice(2,8);
        const phaseColor = {'growth':'var(--buy)','mature':'var(--accent)','decline':'#ff8c00','decay':'var(--sell)','early':'var(--text3)','unstable':'#ff8c00'}[lc.phase]||'var(--text2)';
        const gradeColor = {'A':'var(--buy)','B':'var(--accent)','C':'var(--text2)','D':'#ff8c00','F':'var(--sell)'}[lc.health.grade]||'var(--text2)';
        let lcHTML = `<div class="anal-section" style="margin-top:8px">
          <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${lcId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:11px;color:var(--accent);cursor:pointer;font-weight:700"><span class="sb-arrow">▶</span> 전략 라이프사이클 <span style="font-size:9px;font-weight:600;color:${phaseColor};margin-left:4px">${guide.title.replace('전략 상태: ','')}</span> <span style="font-size:9px;font-weight:600;color:${gradeColor};margin-left:4px">${lc.health.grade}</span></div>
          <div class="itp-card" id="${lcId}" style="white-space:normal;margin-top:4px">`;

        // 건강도 + 단계 배지
        lcHTML += `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <div style="padding:4px 10px;border-radius:12px;background:${phaseColor};color:#fff;font-size:10px;font-weight:700">${lc.phaseLabel}</div>
          <div style="font-size:12px;font-weight:700;color:${gradeColor}">${guide.healthText}</div>
        </div>`;

        // 요약
        lcHTML += `<div style="font-size:11px;color:var(--text);margin-bottom:10px;line-height:1.6">${guide.summary}</div>`;

        // 구간별 추이 차트 (텍스트 기반 바)
        if(lc.quarters && lc.quarters.length >= 2){
          lcHTML += `<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:6px">구간별 성과 추이</div>`;
          lcHTML += `<div style="display:grid;grid-template-columns:repeat(${lc.quarters.length},1fr);gap:4px;margin-bottom:8px">`;
          lc.quarters.forEach(q => {
            const barH = Math.max(4, Math.min(40, q.winRate * 0.6));
            const qColor = q.winRate >= 55 ? 'var(--buy)' : q.winRate >= 45 ? 'var(--accent)' : q.winRate >= 35 ? '#ff8c00' : 'var(--sell)';
            lcHTML += `<div style="text-align:center">
              <div style="font-size:9px;color:var(--text3);margin-bottom:2px">${q.label}</div>
              <div style="margin:0 auto;width:24px;height:${barH}px;background:${qColor};border-radius:3px"></div>
              <div style="font-size:9px;color:var(--text2);margin-top:2px">${q.winRate}%</div>
              <div style="font-size:8px;color:var(--text3)">PF${q.pf}</div>
            </div>`;
          });
          lcHTML += `</div>`;
          // 추이 텍스트
          guide.quarterTexts.forEach(qt => {
            lcHTML += `<div style="font-size:10px;color:var(--text2);line-height:1.5;margin-bottom:3px;padding-left:8px;border-left:2px solid var(--accent)">· ${qt}</div>`;
          });
        }

        // 퇴화 신호
        if(guide.decayTexts.length){
          lcHTML += `<div style="font-size:10px;font-weight:700;color:var(--sell);margin:10px 0 6px">퇴화 신호</div>`;
          guide.decayTexts.forEach(dt => {
            const isHigh = dt.startsWith('[심각]');
            lcHTML += `<div style="padding:6px 8px;background:rgba(255,59,48,.06);border-radius:6px;margin-bottom:4px;border-left:3px solid ${isHigh?'var(--sell)':'#ff8c00'}">
              <div style="font-size:10px;color:var(--text2);line-height:1.5">${dt}</div>
            </div>`;
          });
        }

        // 유효기간 추정
        if(lc.validityEstimate){
          const ve = lc.validityEstimate;
          const urgColor = ve.urgency==='immediate'?'var(--sell)':ve.urgency==='soon'?'#ff8c00':'var(--text2)';
          lcHTML += `<div style="padding:8px;background:rgba(255,140,0,.06);border-radius:6px;margin:8px 0;border-left:3px solid ${urgColor}">
            <div style="font-size:10px;font-weight:700;color:${urgColor};margin-bottom:2px">전략 유효기간 추정</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${ve.text}</div>
          </div>`;
        }

        // 레짐 연동
        if(guide.regimeText){
          lcHTML += `<div style="padding:8px;background:var(--surface2);border-radius:6px;margin:8px 0">
            <div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:2px">레짐 연동 분석</div>
            <div style="font-size:10px;color:var(--text2);line-height:1.5">${guide.regimeText}</div>
          </div>`;
        }

        // 행동 제안
        if(guide.actions.length){
          lcHTML += `<div style="font-size:10px;font-weight:700;color:var(--text);margin:8px 0 6px">단계별 행동 제안</div>`;
          guide.actions.forEach((a, i) => {
            lcHTML += `<div style="display:flex;gap:6px;margin-bottom:4px;font-size:10px;line-height:1.6;color:var(--text2)"><span style="flex-shrink:0;width:16px;height:16px;border-radius:50%;background:${phaseColor};color:#fff;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center">${i+1}</span><span>${a}</span></div>`;
          });
        }

        lcHTML += `</div></div>`;
        return lcHTML;
      })()}
        </div>
      </div>
      </div>
      ${(()=>{
        // S69: 초보자 실전 가이드
        // S103-fix7 Phase3-B-1: practicalGuide 입력 _btAction → _svVerdict.action로 교체 (C 직접 소비)
        //   프로젝트 C 원칙 ② "C의 단일성" 준수 — 감독관 판정(_svVerdict) 9종 직접 전달
        // [S420] practicalGuide는 outer에서 1회 계산(_pgShared) → 여기선 재사용 (steps/title/nextAction 등).
        //   〔이력〕 이전: 이 IIFE 안에서 _pgMkt~_pgMom 계산 후 SXI.practicalGuide 재호출 → C패널 현재지표요약 이동 위해 outer로 단일화.
        const pg = _pgShared;
        if(!pg || !pg.title) return '';
        const pgId = 'pg_' + Math.random().toString(36).slice(2,8);
        let pgHTML = `<div class="anal-section" style="margin-top:8px">
          <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${pgId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:11px;color:var(--accent);cursor:pointer;font-weight:700"><span class="sb-arrow">▶</span> <span style="display:inline-block;width:13px;height:13px;line-height:13px;text-align:center;border-radius:50%;background:#a855f7;color:#fff;font-size:8px;font-weight:800;margin-right:2px">C</span>이 결과를 어떻게 활용할까요?</div>
          <div class="itp-card" id="${pgId}" style="white-space:normal;margin-top:4px">
            <div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:8px">${pg.title}</div>`;
        pg.steps.forEach((st,i)=>{
          pgHTML += `<div style="display:flex;gap:6px;margin-bottom:6px;font-size:10px;line-height:1.6;color:var(--text2)"><span style="flex-shrink:0;width:18px;height:18px;border-radius:50%;background:var(--accent);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">${i+1}</span><span>${st}</span></div>`;
        });
        if(pg.nextAction) pgHTML += `<div style="font-size:10px;padding:6px 8px;background:var(--buy-bg);border-radius:6px;margin:6px 0;line-height:1.55"><span style="font-weight:700;color:var(--buy)">다음 행동</span><br><span style="color:var(--text2)">${pg.nextAction}</span></div>`;
        if(pg.caution) pgHTML += `<div style="font-size:10px;padding:6px 8px;background:rgba(255,140,0,.06);border-radius:6px;margin-bottom:4px;line-height:1.55"><span style="font-weight:700;color:#ff8c00">주의</span><br><span style="color:var(--text2)">${pg.caution}</span></div>`;
        if(pg.crossCheck) pgHTML += `<div style="font-size:10px;padding:6px 8px;background:var(--surface2);border-radius:6px;margin-bottom:4px;line-height:1.55"><span style="font-weight:700;color:var(--text)">함께 확인하세요</span><br><span style="color:var(--text2)">${pg.crossCheck}</span></div>`;
        // [S420] 구 "현재 지표 상태 요약" 자리 → "최종 판정"(보유유지 등 9종) 카드. C IIFE가 stash한 _swapVerdictHTML 소비.
        //   (현재 지표 상태 요약은 C패널 최종판정 자리로 이동함) · _swapVerdictHTML 빈 문자열이면 폴백 모드라 미표시.
        //   라벨("최종 판정")은 제거 — verdict 카드 자체에 판정명(보유 유지 등) 헤더가 이미 있어 중복.
        if(_swapVerdictHTML){
          pgHTML += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">${_swapVerdictHTML}</div>`;
        }
        pgHTML += `</div></div>`;
        return pgHTML;
      })()}
    </div>

    ${(()=>{
      if(!qs) return '';
      const regime = qs.regime;
      const tags = stock._smartTags || scrSmartFilterCheck(qs);
      // [v1.6 추가] SXI 모듈 미로드 / advRegime 누락 시 폴백 — 최소한의 레짐 정보는 보장
      //   기존: typeof SXI === 'undefined' 또는 SXI.advRegime 누락 시 regimeItp = null
      //         → 라인 2903 "▶ 레짐 상세 해석" 토글이 통째로 사라짐
      //         → 사용자에게는 "🔒 변동성극단" 배지만 보이고 본문 비어있는 증상
      //   개선: SXI 정상 로드 시 정상 해석, 미로드 시 regime 객체 자체로 최소 텍스트 생성
      const regimeItp = (regime ? (
        (typeof SXI!=='undefined' && SXI.advRegime)
          ? SXI.advRegime(regime)
          : { tone:'neutral',
              label: regime.label || '레짐 정보',
              text: `추세강도(ADX) ${regime.adx!=null?regime.adx.toFixed(0):'?'} · 변동폭(BB) ${regime.bbWidth!=null?regime.bbWidth.toFixed(1):'?'}% · 방향 ${regime.direction||'?'}\n해석 모듈(SXI) 로딩 대기 중 — 새로고침 후 재진입 시 상세 해석이 표시됩니다.` }
      ) : null);
      const regimeItpId = 'regime_' + Math.random().toString(36).slice(2,8);
      // [S661] 레짐 전환확률 — 비동기(~100ms, ADX 사전계산 포함). regime 없으면 스킵.
      let _regimeFlipHtml = '';
      if(regime){
        const _rfRows = (indicators&&indicators._advanced&&indicators._advanced.rows) || null;
        const _rfKey = ((stock&&(stock.code||stock.name))||'') + '|' + (_analTF||'') + '|' + (_rfRows?_rfRows.length:0);
        const _rfId = '_rf_' + Math.random().toString(36).slice(2,9);
        if(_rfRows){
          const _rfReq = _regimeLrRequestAsync(_rfRows, _rfKey, function(res){
            const el=document.getElementById(_rfId); if(el) el.outerHTML=_regimeFlipBadge(res)||'';
          });
          _regimeFlipHtml = _rfReq.cached ? (_regimeFlipBadge(_rfReq.res)||'') : `<span id="${_rfId}" style="font-size:9px;color:var(--text3);margin-left:6px">🔄…</span>`;
        }
      }
      // S71: 레짐 적응형 파라미터 현황
      const _ra = qs._regimeAdapt || null;
      const _aTh = qs._adaptedTh || null;
      const _baseTh = (typeof _getEffectiveTh!=='undefined') ? _getEffectiveTh(_analTF) : null;
      const _raGuide = (typeof SXI!=='undefined' && SXI.regimeAdaptGuide && _ra && _aTh && _baseTh) ? SXI.regimeAdaptGuide(regime, _ra, _aTh, _baseTh) : null;
      const _raEnabled = (typeof SXE!=='undefined' && SXE.regimeAdaptEnabled) ? SXE.regimeAdaptEnabled() : false;
      const _raToggleId = 'raToggle_' + Math.random().toString(36).slice(2,8);
      const _raGuideId = 'raGuide_' + Math.random().toString(36).slice(2,8);
      let _raHTML = '';
      if(_raEnabled && _ra && _ra.buyThAdj !== 0){
        // S125: 레짐 보정은 임계값에 적용되지 않음(슬롯 저장값이 이미 레짐 반영됨).
        //   대신 "현재 시장이 어떤 레짐으로 감지됐는지"만 참고용으로 표시.
        //   BUY 62→57 같은 화살표 표시는 삭제(이중 보정 오해 소지).
        const _raColor = _ra.label==='공격'||_ra.label==='공격+경계'?'var(--buy)':_ra.label==='보수'||_ra.label==='방어'||_ra.label==='방어+경계'?'var(--sell)':'var(--accent)';
        _raHTML = `<div style="margin-top:6px;padding:6px 8px;background:rgba(${_raColor==='var(--buy)'?'0,200,150':_raColor==='var(--sell)'?'255,59,48':'100,140,255'},.08);border-radius:6px;border-left:3px solid ${_raColor}">
          <div style="font-size:10px;font-weight:700;color:${_raColor};margin-bottom:2px">감지 레짐: ${_ra.label}</div>
          <div style="font-size:9px;color:var(--text2);line-height:1.5">현재 슬롯 BUY ${_baseTh?_baseTh.buyTh:'?'} · SELL ${_baseTh?_baseTh.sellTh:'?'} (레짐에 맞춰 저장된 값 그대로 사용)</div>
        </div>`;
        if(_raGuide){
          _raHTML += `<div style="margin-top:4px">
            <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${_raGuideId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600"><span class="sb-arrow">▶</span> 레짐 특성 설명</div>
            <div class="itp-card" id="${_raGuideId}" style="white-space:normal;margin-top:4px">
              <div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:6px">${_raGuide.title}</div>
              ${_raGuide.items.map(it=>`<div style="font-size:10px;color:var(--text2);line-height:1.5;margin-bottom:4px;padding-left:8px;border-left:2px solid var(--accent)">· ${it}</div>`).join('')}
              ${_raGuide.note?`<div style="font-size:10px;color:var(--text3);margin-top:6px;font-style:italic">${_raGuide.note}</div>`:''}
            </div>
          </div>`;
        }
      } else if(!_raEnabled){
        _raHTML = `<div style="margin-top:4px;font-size:9px;color:var(--text3)">레짐 적응: OFF (고정 파라미터 슬롯 사용)</div>`;
      }
      return `<div class="anal-section" style="background:var(--surface2)">
        <div class="anal-section-title" style="margin-bottom:6px">시장 레짐</div>
        ${regime?`<div style="font-size:10px;color:var(--text2);margin-bottom:2px">${regime.icon} ${regime.label} · 추세강도 ${(regime.adx||0).toFixed(0)} · 변동폭 ${(regime.bbWidth||0).toFixed(1)}%</div>${_regimeFlipHtml?`<div style="margin-bottom:4px">${_regimeFlipHtml}</div>`:''}`:''}
        ${qs.reasons&&qs.reasons.length?`<div style="font-size:10px;color:var(--hold);margin-bottom:4px">${qs.reasons.join(' ')}</div>`:''}
        ${tags.length?`<div class="sf-tags" style="margin-top:4px">${tags.map(t=>`<span class="sf-tag ${t.cls || (t.dir>0?'pos':t.dir<0?'neg':'neutral')}">${t.label}</span>`).join('')}</div>`:''}
        ${regimeItp?`<div style="margin-top:8px">
          <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${regimeItpId}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600"><span class="sb-arrow">▶</span> 레짐 상세 해석</div>
          <div class="itp-card" id="${regimeItpId}" style="white-space:pre-line;margin-top:4px"><span class="itp-label ${regimeItp.tone}">${regimeItp.label}</span><div>${regimeItp.text}</div></div>
        </div>`:''}
        ${_raHTML}
      </div>`;
    })()}

    ${summaryHTML}

    ${(()=>{
      // [UI 재배치] 호재 공시 해석 카드 — 기존 위치(결산월 다음, 재무분석 위)에서 이동
      //   참고사항 카드 직후, 부문별 점수 직전에 배치 (사용자 요청: 가독성·중요도 상승)
      //   advDisclosure 결과가 있을 때만 렌더 (스캔 결과 진입 시 이미 채워져 있을 수 있음)
      //   .disc-card-rendered wrap으로 감싸 — _renderDisclosureUI의 사후 삽입과 중복 방지용 식별 마크
      //   tone-* 클래스 추가 — CSS에서 좌측 테두리/배경/제목 색을 동적으로 매핑
      //   (danger/bearish/warning/bullish 4종, neutral은 카드 자체가 안 그려짐)
      if(typeof SXI==='undefined' || !SXI.renderDisclosureCard) return '';
      const di = stock._disclosureItp;
      if(!di) return '';
      const inner = SXI.renderDisclosureCard(di);
      if(!inner) return '';
      const toneCls = di.tone ? `tone-${di.tone}` : '';
      return `<div class="disc-card-rendered ${toneCls}">${inner}</div>`;
    })()}

    ${(()=>{
      // [S57] 종합해석 가이드 — 4축 판정 ↔ 부문별 점수 충돌/일치를 화해시키는 카드
      //   [위치] 참고사항/공시 카드 직후, 부문별 점수 헤더 직전 (접기 바깥, 항상 표시)
      //   사용자가 "점수 좋은데 왜 매도?" "점수 나쁜데 왜 매수?" 헷갈리는 케이스 해결
      //   메인 결론 카드 역할이라 접기 안에 숨기지 않고 노출
      if(typeof SXI==='undefined' || !SXI.unifiedNarrative) return '';
      const _v = stock._svVerdict;
      const _s4 = stock._svScores4;
      if(!_v || !_s4) return '';
      const nar = SXI.unifiedNarrative(_v, scores, _s4, indicators, stock);
      if(!nar) return '';
      // 톤별 색상 매핑 — itp-card 컨벤션 따름
      const toneColor = nar.tone==='bullish'?'#22c55e':nar.tone==='bearish'?'#e8365a':nar.tone==='warning'?'#f59e0b':'#6b7280';
      const toneBg    = nar.tone==='bullish'?'#22c55e0F':nar.tone==='bearish'?'#e8365a0F':nar.tone==='warning'?'#f59e0b0F':'#6b72800F';
      // 충돌 케이스 라벨
      const conflictLbl = nar.conflictType==='sell_with_good_score'?'⚠ 신호 충돌 — 점수 양호 / 판정 매도'
                        : nar.conflictType==='buy_with_bad_score'?'⚠ 신호 충돌 — 점수 부진 / 판정 매수'
                        : nar.conflictType==='aligned_bull'?'✓ 신호 정합 — 매수 우위'
                        : nar.conflictType==='aligned_bear'?'✓ 신호 정합 — 매도 우위'
                        : '— 중립 구간';
      const reasonsHTML = nar.realMessage && nar.realMessage.length
        ? `<ul style="margin:6px 0 8px;padding-left:18px;font-size:11px;line-height:1.55;color:var(--text2)">${nar.realMessage.map(r=>`<li>${r}</li>`).join('')}</ul>`
        : '';
      const reconcileHTML = nar.reconcile
        ? `<div style="margin-top:8px;padding:6px 8px;background:var(--bg2,#f5f5f7);border-radius:6px;font-size:10px;line-height:1.5;color:var(--text3)">${nar.reconcile}</div>`
        : '';
      // 접기 바깥 노출용 — 다른 메인 카드(참고사항/공시)들과 시각 위계 맞추기 위해 margin/padding 살짝 키움
      return `<div class="itp-card show unified-narrative-card" style="margin:0 0 12px;padding:12px 14px;border-left:4px solid ${toneColor};background:${toneBg};border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,0.03)">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap">
          <span style="font-size:11px;font-weight:800;color:${toneColor};letter-spacing:-.2px">📊 종합해석 가이드</span>
          <span style="font-size:9px;color:var(--text3)">· ${conflictLbl}</span>
        </div>
        <div style="font-size:14px;font-weight:800;color:var(--text);margin:2px 0 7px;line-height:1.35">${nar.headline}</div>
        ${reasonsHTML}
        <div style="font-size:11.5px;line-height:1.6;color:var(--text)">${nar.guide}</div>
        ${reconcileHTML}
        <div style="margin-top:9px;padding-top:6px;border-top:1px dashed var(--border);font-size:9px;color:var(--text3)">
          판정 ${nar.action} (4축 ${nar.passCount}/4) · 부문 평균 ${nar.avgSector}점
        </div>
      </div>`;
    })()}

    <div class="anal-fold">
      <div class="anal-fold-hdr" onclick="_sxVib(8);this.parentElement.classList.toggle('fold-open')"><span class="anal-fold-arrow">▶</span> 부문별 점수</div>
      <div class="anal-fold-body">
    <div class="anal-section">
      <div class="anal-row"><span class="al">가격 모멘텀</span><span class="ar ${scores.momentum>=55?'bullish':scores.momentum<=45?'bearish':'neutral'}">${scores.momentum}</span></div>
      ${sectorItp&&sectorItp.momentum?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><span class="itp-label ${sectorItp.momentum.tone}">${sectorItp.momentum.grade}</span><div>${sectorItp.momentum.text}</div></div>`:''}
      ${(typeof currentMarket!=='undefined'&&currentMarket==='coin')?'':`<div class="anal-row"><span class="al">밸류</span><span class="ar ${scores.value>=55?'bullish':scores.value<=45?'bearish':'neutral'}">${scores.value}</span></div>`}
      ${sectorItp&&sectorItp.value?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><span class="itp-label ${sectorItp.value.tone}">${sectorItp.value.grade}</span><div>${sectorItp.value.text}</div></div>`:''}
      <div class="anal-row"><span class="al">거래량</span><span class="ar ${scores.volume>=55?'bullish':scores.volume<=45?'bearish':'neutral'}">${scores.volume}</span></div>
      ${sectorItp&&sectorItp.volume?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><span class="itp-label ${sectorItp.volume.tone}">${sectorItp.volume.grade}</span><div>${sectorItp.volume.text}</div></div>`:''}
      <div class="anal-row"><span class="al">추세신호</span><span class="ar ${scores.trend>=55?'bullish':scores.trend<=45?'bearish':'neutral'}">${scores.trend}</span></div>
      ${sectorItp&&sectorItp.trend?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><span class="itp-label ${sectorItp.trend.tone}">${sectorItp.trend.grade}</span><div>${sectorItp.trend.text}</div></div>`:''}
      ${sectorItp&&sectorItp.relStrength?`<div class="anal-row"><span class="al">상대강도</span><span class="ar ${sectorItp.relStrength.tone}">${sectorItp.relStrength.score}</span></div>`:''}
      ${sectorItp&&sectorItp.relStrength?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><span class="itp-label ${sectorItp.relStrength.tone}">${sectorItp.relStrength.grade}</span><div>${sectorItp.relStrength.text}</div></div>`:''}
      <div id="discSectorArea"></div>
      <div id="fundSectorArea"></div>
    </div>
      </div>
    </div>

    <div class="anal-fold">
      <div class="anal-fold-hdr" onclick="_sxVib(8);this.parentElement.classList.toggle('fold-open')"><span class="anal-fold-arrow">▶</span> 지표 분석</div>
      <div class="anal-fold-body">
    ${advHTML}

    ${techHTML}
      </div>
    </div>

    <div class="anal-fold">
      <div class="anal-fold-hdr" onclick="_sxVib(8);this.parentElement.classList.toggle('fold-open')"><span class="anal-fold-arrow">▶</span> 재무·매크로·기본정보</div>
      <div class="anal-fold-body">
    <div class="anal-section">
      <div class="anal-section-title">기본 정보</div>
      <div class="anal-row"><span class="al">시가총액</span><span class="ar">${_isUsStock(stock) ? fmtUsMCap(stock) : formatMCap(stock.marketCap)}</span></div>
      ${basicItp&&basicItp.marketCap?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><div>${basicItp.marketCap.text}</div></div>`:''}
      ${_isUsStock(stock) && stock._marketCapKrwDisplay ? `<div class="anal-row"><span class="al" style="font-size:10px;color:var(--text3)">원화 환산</span><span class="ar" style="font-size:11px;color:var(--text2)">${stock._marketCapKrwDisplay}</span></div>` : ''}
      <div class="anal-row"><span class="al">현재가</span><span class="ar">${_isUsStock(stock) ? fmtUsPrice(stock.price||0) : formatKRW(stock.price||0)}</span></div>
      <div class="anal-row"><span class="al">등락률</span><span class="ar ${stock.changeRate>0?'bullish':stock.changeRate<0?'bearish':'neutral'}">${stock.changeRate>0?'+':''}${(stock.changeRate||0).toFixed(2)}%</span></div>
      ${basicItp&&basicItp.changeRate?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><div>${basicItp.changeRate.text}</div></div>`:''}
      <div class="anal-row"><span class="al">거래량</span><span class="ar">${(stock.volume||0).toLocaleString()}</span></div>
      <div class="anal-row"><span class="al">거래대금</span><span class="ar">${_isUsStock(stock) ? fmtUsTradeAmt(stock) : formatTradeAmt(stock.tradeAmount)}</span></div>
      ${basicItp&&basicItp.tradeAmount?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><div>${basicItp.tradeAmount.text}</div></div>`:''}
      ${_isUsStock(stock) ? '' : `<div class="anal-row"><span class="al">외국인 지분</span><span class="ar">${(stock.foreignRatio||0).toFixed(1)}%</span></div>`}
      ${_isUsStock(stock) ? '' : (basicItp&&basicItp.foreignRatio?`<div class="itp-card show" style="margin-top:2px;margin-bottom:6px"><div>${basicItp.foreignRatio.text}</div></div>`:'')}
      ${_isUsStock(stock) && stock._exchange ? `<div class="anal-row"><span class="al">거래소</span><span class="ar">${stock._exchange}${stock._marketStatus ? ` <span style="font-size:10px;color:${stock._marketStatus==='OPEN'?'var(--buy)':'var(--text3)'};margin-left:4px">${stock._marketStatus==='OPEN'?'●':'○'} ${stock._marketStatus}</span>` : ''}</span></div>` : ''}
      ${stock.faceValue?`<div class="anal-row"><span class="al">액면가</span><span class="ar">${stock.faceValue.toLocaleString()}원</span></div>`:''}
      ${stock.capital?`<div class="anal-row"><span class="al">자본금</span><span class="ar">${stock.capital.toFixed(0)}억</span></div>`:''}
      ${(()=>{
        if(typeof SXI==='undefined' || !SXI.advCapitalStructure) return '';
        if(!stock.faceValue && !stock.capital) return '';
        const ci = SXI.advCapitalStructure(stock.faceValue, stock.capital, stock.marketCap, stock.price);
        if(!ci) return '';
        const ciId = 'capstr_' + Math.random().toString(36).slice(2,8);
        return `<div class="itp-toggle-inline" onclick="_sxVib(8);const el=document.getElementById('${ciId}');el.classList.toggle('show')"><span class="sb-arrow">▶</span> ${ci.label}</div>
        <div class="itp-card" id="${ciId}" style="white-space:pre-line">
          <span class="itp-label ${ci.tone}">${ci.label}</span>
          <div>${ci.text}</div>
          <div style="margin-top:6px;padding-top:4px;border-top:1px solid var(--border);font-size:10px;color:var(--text2)">${ci.summary}</div>
        </div>`;
      })()}
      ${stock.shortBalanceRatio?`<div class="anal-row"><span class="al">공매도 잔고</span><span class="ar ${stock.shortBalanceRatio>5?'bearish':stock.shortBalanceRatio>2?'neutral':'bullish'}">${stock.shortBalanceRatio.toFixed(2)}%</span></div>`:''}
      ${(()=>{
        if(typeof SXI==='undefined' || !SXI.advShortSelling) return '';
        if(!stock.shortBalanceRatio) return '';
        const si = SXI.advShortSelling(stock.shortBalanceRatio, {
          price: stock.price, changeRate: stock.changeRate,
          volume: stock.volume, foreignRatio: stock.foreignRatio, marketCap: stock.marketCap
        });
        if(!si) return '';
        const siId = 'short_' + Math.random().toString(36).slice(2,8);
        return `<div class="itp-toggle-inline" onclick="_sxVib(8);const el=document.getElementById('${siId}');el.classList.toggle('show')"><span class="sb-arrow">▶</span> ${si.label}</div>
        <div class="itp-card" id="${siId}" style="white-space:pre-line">
          <span class="itp-label ${si.tone}">${si.label}</span>
          <div>${si.text}</div>
          <div style="margin-top:6px;padding-top:4px;border-top:1px solid var(--border);font-size:10px;color:var(--text2)">${si.summary}</div>
        </div>`;
      })()}
      <div class="anal-row"><span class="al">결산월</span><span class="ar" id="analSettleMonth">${_isUsStock(stock) ? (fmtUsSettleMonth(stock) || '—') : '—'}</span></div>
      <div id="settleMonthItpArea"></div>
    </div>

    ${(()=>{
      // S55→S57: 재무분석 카드 (DART 원본 + 네이버 폴백)
      // [Phase 1] 확장: 3개년 비교 표 + IFRS연결 배지 + 순부채비율
      const fin = stock._financial || null;
      if(!fin || typeof SXI==='undefined' || !SXI.advFundamental) return '';
      // [PLAN_7-B] 금융업 판정 — fin·stock 둘 다 통해 일관 사용 (advFundamental + 행 렌더 분기 공유)
      //   advFundamental에 stock 전달 시 내부에서 SXI.isFinancialIndustry 호출하지만,
      //   같은 카드 내 EV/EBITDA 행 렌더에서도 써야 하므로 미리 한 번 계산해서 fin에 박아둠
      const _isFin = (typeof SXI.isFinancialIndustry === 'function') ? SXI.isFinancialIndustry(stock) : false;
      if(_isFin) fin._isFinancial = true;
      const fi = SXI.advFundamental(fin, stock.price, stock);
      if(!fi) return '';
      const fiId = 'fund_' + Math.random().toString(36).slice(2,8);
      const fmtAmt = (v) => { if(v==null) return '—'; const a=Math.abs(v); if(a>=1e12) return (v/1e12).toFixed(1)+'조'; if(a>=1e8) return (v/1e8).toFixed(0)+'억'; if(a>=1e4) return (v/1e4).toFixed(0)+'만'; return v.toLocaleString(); };
      const fmtGr = (v) => { if(v==null) return ''; const s=v>0?'+':''; return `<span class="${v>0?'bullish':v<0?'bearish':'neutral'}" style="font-size:9px;margin-left:4px">(${s}${v.toFixed(1)}%)</span>`; };
      // [Phase 1-B] 헤더 배지: 데이터 출처 + 보고서 종류 + IFRS연결/별도 플래그
      //   _sjLabel은 _fetchDartFinancial에서 매출 행의 sj 필드로 판단 ("연결재무제표"→IFRS연결)
      //   네이버 폴백 시에는 _sjLabel이 없으므로 표시 생략
      const sjBadge = fin._sjLabel ? `<span style="font-size:8px;color:var(--accent);background:rgba(0,140,255,.1);padding:1px 5px;border-radius:3px;margin-left:4px">${fin._sjLabel}</span>` : '';
      // [출처 라벨] 사용자 친화적 한글 표시
      //   기존: NAVER, DART+NAVER → 사용자가 무슨 차이인지 즉시 파악 어려움
      //   수정: DART/네이버/DART+네이버/Yahoo 형태로 출처 명시 + 신뢰도 인지
      // [S321] SEC EDGAR 추가 — 미국 종목 공식 출처 (DART 한국 대응)
      const _srcLabelMap = {
        'dart':       'DART',
        'naver':      '네이버',
        'dart+naver': 'DART+네이버',
        'yahoo':      'Yahoo',
        'sec':        'SEC',
        'sec+naver':  'SEC+네이버',
        'naver_us':   '네이버',
        'none':       '데이터 없음'
      };
      const _srcLabel = _srcLabelMap[fin._source] || (fin._source ? fin._source.toUpperCase() : '');
      const srcBadge = fin._source ? `<span style="font-size:8px;color:var(--text3);float:right">${_srcLabel}${fin._reportLabel ? ' · ' + fin._reportLabel : ''}${sjBadge}</span>` : '';
      // [Phase 1-A] 3개년 비교 가능 여부 — revenuePrev2 같은 전전기 데이터가 하나라도 있으면 표 모드 활성화
      // [S321] SEC도 3년치 제공하므로 동일 조건 적용
      const has3y = (fin._source==='dart' || fin._source==='sec' || fin._source==='sec+naver') && (fin.revenuePrev2!=null || fin.operatingIncomePrev2!=null || fin.netIncomePrev2!=null);
      // 연도 라벨 — DART 보고서 연도 기준 (current = 가장 최근 보고서 연도)
      //   _reportType이 annual이면 연간 보고서, 그 외에는 동일 연도의 분기/반기
      //   fin._reportYear가 없으면 현재년도-1을 추정값으로 사용 (annual은 통상 작년 사업보고서)
      const baseYear = (fin._reportYear || (new Date().getFullYear() - 1));
      const y0 = baseYear, y1 = baseYear-1, y2 = baseYear-2;
      // [Phase 1-A] 3개년 표 HTML (sticky 헤더 없는 단순 표)
      const threeYearTableHTML = has3y ? `
        <div style="margin:6px 0 8px;padding:8px;background:var(--surface2);border-radius:6px;font-size:10px">
          <div style="display:grid;grid-template-columns:42px 1fr 1fr 1fr;gap:4px;color:var(--text3);font-size:9px;font-weight:700;padding-bottom:4px;border-bottom:1px solid var(--border);margin-bottom:4px">
            <div>연도</div><div style="text-align:right">매출액</div><div style="text-align:right">영업이익</div><div style="text-align:right">순이익</div>
          </div>
          ${fin.revenuePrev2!=null||fin.operatingIncomePrev2!=null||fin.netIncomePrev2!=null?`
          <div style="display:grid;grid-template-columns:42px 1fr 1fr 1fr;gap:4px;padding:3px 0">
            <div style="color:var(--text3)">${y2}</div>
            <div style="text-align:right">${fmtAmt(fin.revenuePrev2)}</div>
            <div style="text-align:right;${fin.operatingIncomePrev2!=null&&fin.operatingIncomePrev2<0?'color:var(--sell)':''}">${fmtAmt(fin.operatingIncomePrev2)}</div>
            <div style="text-align:right;${fin.netIncomePrev2!=null&&fin.netIncomePrev2<0?'color:var(--sell)':''}">${fmtAmt(fin.netIncomePrev2)}</div>
          </div>`:''}
          ${fin.revenuePrev!=null||fin.operatingIncomePrev!=null||fin.netIncomePrev!=null?`
          <div style="display:grid;grid-template-columns:42px 1fr 1fr 1fr;gap:4px;padding:3px 0">
            <div style="color:var(--text3)">${y1}</div>
            <div style="text-align:right">${fmtAmt(fin.revenuePrev)}</div>
            <div style="text-align:right;${fin.operatingIncomePrev!=null&&fin.operatingIncomePrev<0?'color:var(--sell)':''}">${fmtAmt(fin.operatingIncomePrev)}</div>
            <div style="text-align:right;${fin.netIncomePrev!=null&&fin.netIncomePrev<0?'color:var(--sell)':''}">${fmtAmt(fin.netIncomePrev)}</div>
          </div>`:''}
          ${fin.revenue!=null||fin.operatingIncome!=null||fin.netIncome!=null?`
          <div style="display:grid;grid-template-columns:42px 1fr 1fr 1fr;gap:4px;padding:3px 0;border-top:1px solid var(--border);margin-top:2px;font-weight:700">
            <div style="color:var(--accent)">${y0}</div>
            <div style="text-align:right">${fmtAmt(fin.revenue)}${fmtGr(fin.revenueGrowth)}</div>
            <div style="text-align:right;${fin.operatingIncome!=null&&fin.operatingIncome<0?'color:var(--sell)':''}">${fmtAmt(fin.operatingIncome)}${fmtGr(fin.opIncomeGrowth)}</div>
            <div style="text-align:right;${fin.netIncome!=null&&fin.netIncome<0?'color:var(--sell)':''}">${fmtAmt(fin.netIncome)}${fmtGr(fin.netIncomeGrowth)}</div>
          </div>`:''}
        </div>` : '';
      // [Phase 2] 분기별 실적 표 — _quarterly 객체에 차분 계산된 단일 분기 매출/영업이익/순이익 들어있음
      //   워커(_fetchDartFinancial)가 q1/half/q3 보고서 받아 누적값 차분 계산
      //   미제출 분기는 _quarterly에 키 자체가 없음 → 자동 숨김
      //   v1: YoY는 생략 (작년 동기 데이터 호출 비용 8배 → v2에서 검토)
      //   [Phase 2 v2 / 옵션 B] prevQ4: 직전년도 4Q (annual + _reportYear의 q3 차분) — q1 앞에 표시해서 자연스러운 시간순 흐름
      const qd = fin._quarterly || null;
      const hasQuarterly = qd && (qd.prevQ4 || qd.q1 || qd.q2 || qd.q3 || qd.q4);
      const renderQRow = (q, label, noTopSep) => {
        if (!q) return '';
        const opNeg = q.operatingIncome != null && q.operatingIncome < 0;
        const niNeg = q.netIncome != null && q.netIncome < 0;
        // 연도 경계(prevQ4 → q1)에서만 구분선. 같은 해 분기들 사이엔 선 없음.
        const sepStyle = noTopSep ? '' : ';border-top:1px solid var(--border);margin-top:2px;padding-top:5px';
        return `<div style="display:grid;grid-template-columns:54px 1fr 1fr 1fr;gap:4px;padding:3px 0${sepStyle}">
          <div style="color:var(--text3)">${label}</div>
          <div style="text-align:right">${fmtAmt(q.revenue)}</div>
          <div style="text-align:right;${opNeg?'color:var(--sell)':''}">${fmtAmt(q.operatingIncome)}</div>
          <div style="text-align:right;${niNeg?'color:var(--sell)':''}">${fmtAmt(q.netIncome)}</div>
        </div>`;
      };
      // 시간순 정렬: prevQ4(작년 4Q) → q1 → q2 → q3 → q4
      // prevQ4 다음 q1 사이에서만 구분선 (연도 경계). 같은 해 안에서는 구분선 없음.
      const quarterlyTableHTML = hasQuarterly ? `
        <div style="margin:6px 0 8px;padding:8px;background:var(--surface2);border-radius:6px;font-size:10px">
          <div style="font-size:9px;color:var(--text3);font-weight:700;margin-bottom:4px">분기별 실적 (단일 분기)</div>
          <div style="display:grid;grid-template-columns:54px 1fr 1fr 1fr;gap:4px;color:var(--text3);font-size:9px;font-weight:700;padding-bottom:4px;border-bottom:1px solid var(--border);margin-bottom:4px">
            <div>분기</div><div style="text-align:right">매출액</div><div style="text-align:right">영업이익</div><div style="text-align:right">순이익</div>
          </div>
          ${qd.prevQ4?renderQRow(qd.prevQ4, `${qd.prevQ4.year} 4Q`, true):''}
          ${qd.q1?renderQRow(qd.q1, `${qd.q1.year} 1Q`, !qd.prevQ4):''}
          ${qd.q2?renderQRow(qd.q2, `${qd.q2.year} 2Q`, true):''}
          ${qd.q3?renderQRow(qd.q3, `${qd.q3.year} 3Q`, true):''}
          ${qd.q4?renderQRow(qd.q4, `${qd.q4.year} 4Q`, true):''}
        </div>` : '';
      return `<div class="anal-section">
        <div class="anal-section-title">재무 분석 ${srcBadge}</div>
        ${has3y ? threeYearTableHTML : `
        ${fin.revenue!=null?`<div class="anal-row"><span class="al">매출액</span><span class="ar">${fmtAmt(fin.revenue)}${fmtGr(fin.revenueGrowth)}</span></div>`:''}
        ${fin.operatingIncome!=null?`<div class="anal-row"><span class="al">영업이익</span><span class="ar ${fin.operatingIncome>0?'bullish':'bearish'}">${fmtAmt(fin.operatingIncome)}${fmtGr(fin.opIncomeGrowth)}</span></div>`:''}
        ${fin.netIncome!=null?`<div class="anal-row"><span class="al">당기순이익</span><span class="ar ${fin.netIncome>0?'bullish':'bearish'}">${fmtAmt(fin.netIncome)}${fmtGr(fin.netIncomeGrowth)}</span></div>`:''}`}
        ${quarterlyTableHTML}
        ${(()=>{
          // [S320] 종합 밸류에이션 라벨 — PER 위에 1줄로 배치
          //   PER 단독 + PBR 단독 → 종합 판정 (5단계 + 혼조 + 평가불가)
          //   - 농심 케이스: PER 13.6배(약간 고평가) + PBR 0.81배(저평가) → 🟡 혼조
          //   - 코인: 표시 안 함 (EPS/PER 없음)
          //   - 둘 다 평가불가: 행 자체 생략
          if(typeof currentMarket !== 'undefined' && currentMarket === 'coin') return '';
          if(typeof SXI === 'undefined' || typeof SXI.valuationJudge !== 'function') return '';
          // [S327 Phase 2] historicalPer 계산 (헤더와 동일 로직)
          let _histPer2 = null;
          if(typeof SXI.calcHistoricalPer === 'function' && fin._historicalEps){
            const _candlesForPer2 = (typeof _analCandles !== 'undefined' && _analCandles && _analCandles.length > 0)
              ? _analCandles
              : (stock._lastAnalCandles || []);
            if(_candlesForPer2 && _candlesForPer2.length > 0){
              _histPer2 = SXI.calcHistoricalPer(fin._historicalEps, _candlesForPer2);
            }
          }
          // [S338] KOSIS 시총 규모별 PER 폴백 (헤더와 동일 로직)
          let _marketPer2 = null;
          if(currentMarket === 'kr' && typeof getKosisPerForStock === 'function' && typeof _kosisMarketPer !== 'undefined' && _kosisMarketPer){
            _marketPer2 = getKosisPerForStock(stock, _kosisMarketPer);
          }
          const _v = SXI.valuationJudge(fin, stock.price, stock, _histPer2, _marketPer2);
          if(!_v) return '';
          if(_v.perStage < 0 && _v.pbrStage < 0) return '';
          const _subHTML = _v.overallSubLabel
            ? ` <span style="font-size:9px;color:var(--text3);font-weight:400;opacity:0.9">(${_v.overallSubLabel})</span>`
            : '';
          return `<div class="anal-row" style="background:var(--surface2);border-radius:6px;margin:4px 0;padding:6px 8px;border-bottom:none">`
            + `<span class="al" style="font-weight:700">${_v.overallEmoji} 밸류에이션</span>`
            + `<span class="ar" style="color:${_v.overallColor};opacity:${_v.overallOpacity};font-weight:700">${_v.overallLabel}${_subHTML}</span>`
            + `</div>`;
        })()}
        ${fin.per!=null?`<div class="anal-row"><span class="al">PER <span style="font-size:9px;color:var(--text3);font-weight:normal;letter-spacing:-.3px">주가수익비율${fin._epsSource==='dart'?' · DART':fin._epsSource==='sec'?' · SEC':''}</span></span><span class="ar ${fin.per>0&&fin.per<=15?'bullish':fin.per>50||fin.per<0?'bearish':'neutral'}">${fin.per.toFixed(1)}배</span></div>`:''}
        ${(()=>{
          // [PLAN_7-B] EV/EBITDA 표시 분기:
          //   - 금융업: 행 숨김 + 작은 안내 한 줄로 대체 (값 표시 자체가 사용자 혼란 유발)
          //   - 일반 업종: 기존대로 값 + 색상 + 근사 마커
          if(fin._isFinancial){
            // 안내문 — 카드 길이 영향 최소화하기 위해 anal-row 형태가 아닌 작은 메시지
            return `<div class="anal-row" style="border-bottom:1px solid var(--border)"><span class="al" style="font-size:9px;color:var(--text3)">EV/EBITDA <span style="font-size:8px">기업가치배수</span></span><span class="ar" style="font-size:9px;color:var(--text3);font-weight:normal">금융업 — 비적용</span></div>`;
          }
          if(fin.evEbitda == null) return '';
          // [PATCH-2026-04 USER REQUEST] (근사)/(조정 추정) 라벨 제거 요청
          //   기존: !fin._ebitdaApprox ? '' : (조정 추정/근사 라벨 표시)
          //   수정: 라벨 자체를 표시하지 않음. 색상 분류는 그대로 유지.
          //   주의: 해석 카드(advFundamental)의 "근사치" 문구는 별개 (참고 정보 전달용 — sx_interpret.js)
          const cls = fin.evEbitda>0&&fin.evEbitda<5?'bullish':fin.evEbitda>15||fin.evEbitda<0?'bearish':'neutral';
          return `<div class="anal-row"><span class="al">EV/EBITDA <span style="font-size:9px;color:var(--text3);font-weight:normal;letter-spacing:-.3px">기업가치배수</span></span><span class="ar ${cls}">${fin.evEbitda.toFixed(1)}배</span></div>`;
        })()}
        ${fin.pbr!=null?`<div class="anal-row"><span class="al">PBR <span style="font-size:9px;color:var(--text3);font-weight:normal;letter-spacing:-.3px">주가순자산비율</span></span><span class="ar ${fin.pbr>0&&fin.pbr<=1.5?'bullish':fin.pbr>5?'bearish':'neutral'}">${fin.pbr.toFixed(2)}배</span></div>`:''}
        ${fin.roe!=null?`<div class="anal-row"><span class="al">ROE <span style="font-size:9px;color:var(--text3);font-weight:normal;letter-spacing:-.3px">자기자본이익률</span></span><span class="ar ${fin.roe>=15?'bullish':fin.roe<0?'bearish':'neutral'}">${fin.roe.toFixed(1)}%</span></div>`:''}
        ${fin.eps!=null?`<div class="anal-row"><span class="al">EPS <span style="font-size:9px;color:var(--text3);font-weight:normal;letter-spacing:-.3px">주당순이익${fin._epsSource==='dart'?' · DART':fin._epsSource==='sec'?' · SEC':''}</span></span><span class="ar">${_isUsStock(stock) ? `$${fin.eps.toFixed(2)}` : `${fin.eps.toLocaleString()}원`}</span></div>`:''}
        ${fin.dividendYield!=null&&fin.dividendYield>0?`<div class="anal-row"><span class="al">배당수익률</span><span class="ar ${fin.dividendYield>=3?'bullish':'neutral'}">${fin.dividendYield.toFixed(1)}%</span></div>`:''}
        ${fin.debtRatio!=null?`<div class="anal-row"><span class="al">부채비율</span><span class="ar ${fin.debtRatio>200?'bearish':fin.debtRatio<50?'bullish':'neutral'}">${fin.debtRatio.toFixed(0)}%</span></div>`:''}
        ${fin.netDebtRatio!=null?`<div class="anal-row"><span class="al">순부채비율</span><span class="ar ${fin.netDebtRatio<0?'bullish':fin.netDebtRatio>100?'bearish':'neutral'}">${fin.netDebtRatio>0?'+':''}${fin.netDebtRatio.toFixed(1)}%</span></div>`:''}
        ${fin.revenue!=null && (fin._source==='dart' || fin._source==='sec' || fin._source==='sec+naver')?`<canvas id="finBarChart" width="280" height="120" style="width:100%;max-width:320px;height:120px;margin:8px auto 4px;display:block"></canvas><div style="font-size:8px;color:var(--text3);text-align:center">매출(파랑) / 영업이익(초록) / 순이익(주황) — ${fin._reportLabel||'연간'} 3기</div>`:''}
        ${(fin._source==='dart' || fin._source==='sec' || fin._source==='sec+naver')?`<div id="finTrendWrap" style="margin-top:8px;display:none"><canvas id="finTrendChart" width="280" height="160" style="width:100%;max-width:320px;height:160px;margin:0 auto;display:block"></canvas><div style="font-size:8px;color:var(--text3);text-align:center" id="finTrendLabel">분기별 추이 로딩중...</div></div>`:''}
        ${(()=>{
          // [데이터 기준 안내] 출처별 분기 표시
          //   기존: DART 출처일 때만 안내 박스 표시 → 네이버 폴백 시 사용자 판단 어려움
          //   개선: dart / dart+naver / naver / yahoo 모두 분기해서 안내
          //   목적: 사용자가 "이 종목 데이터가 어디서 왔고 무엇이 누락되는지" 즉시 인지

          // ── DART 정상 케이스 (기존 동작 유지) ──
          if(fin._source === 'dart' && fin._reportYear){
            const ry = fin._reportYear;
            const rl = fin._reportLabel || '연간';
            const epsBadge = fin._epsSource === 'dart' ? '<span style="color:var(--accent)">EPS·PER 모두 DART 직접</span>' : 'EPS는 시총 추정 (DART 미공시 종목)';
            // [v3.17 EPS-FIX] 시점 자동 + 현재 선택 인지 추천
            //   DART 보고서 발표 일정 (대략):
            //     · 1분기보고서 (q1):  5월 중순 (3월말 결산)
            //     · 반기보고서 (half): 8월 중순 (6월말 결산)
            //     · 3분기보고서 (q3):  11월 중순 (9월말 결산)
            //     · 사업보고서 (annual): 익년 3월말 (12월말 결산)
            //   현재 월 기준으로 "이미 발표됐을 가장 최신" 보고서 추정
            const recommendBlock = (() => {
              const now = new Date();
            const m = now.getMonth() + 1; // 1~12
            const yNow = now.getFullYear();
            // 발표 시점 기준으로 최신 보고서 결정
            //   M월에 가장 최근 등록된 보고서:
            //     · 1~3월: 작년 3분기보고서 (작년 11월 발표)
            //     · 4월~5월 중순: 작년 사업보고서 (3월말 발표)
            //     · 5월말~8월 중순: 당해 1분기보고서
            //     · 8월말~11월 중순: 당해 반기보고서
            //     · 11월말~12월: 당해 3분기보고서
            let latestType, latestLabel, latestDesc, latestYear;
            if(m <= 3){
              latestType = 'q3'; latestLabel = '3분기 보고서'; latestDesc = '작년 11월 발표'; latestYear = yNow - 1;
            } else if(m <= 5){
              // 4월 ~ 5월 중순: 사업보고서가 가장 최신 (1분기는 5월 중순 이후)
              latestType = 'annual'; latestLabel = '사업보고서'; latestDesc = '3월말 발표'; latestYear = yNow - 1;
            } else if(m <= 8){
              latestType = 'q1'; latestLabel = '1분기 보고서'; latestDesc = '5월 발표'; latestYear = yNow;
            } else if(m <= 11){
              latestType = 'half'; latestLabel = '반기 보고서'; latestDesc = '8월 발표'; latestYear = yNow;
            } else {
              latestType = 'q3'; latestLabel = '3분기 보고서'; latestDesc = '11월 발표'; latestYear = yNow;
            }
            // 현재 사용자가 선택한 보고서 종류
            const curType = fin._reportType || 'annual';
            // [v3.17 FIX-2] 사용자가 시점 자동 판단보다 더 최신을 선택한 경우 인정
            //   예: 5월에 q1 선택 → 시점 판단은 annual이지만 사용자가 본 q1이 실제로 더 최신
            //   보고서 시점 순서 (오래된 것 → 최신): q3(작년) < annual(작년) < q1 < half < q3(당해)
            const TYPE_ORDER = {q3_prev: 0, annual: 1, q1: 2, half: 3, q3: 4};
            const latestOrder = (latestType === 'q3' && latestYear < yNow) ? 0 : TYPE_ORDER[latestType];
            const curOrder = TYPE_ORDER[curType] != null ? TYPE_ORDER[curType] : TYPE_ORDER.annual;
            // 사용자 선택이 이미 시점 판단과 같거나 더 최신이면 안내 생략 (잡음 방지)
            if(curOrder >= latestOrder) return '';
            // 안정성 우선 안내 (사업보고서가 가장 검증됨 — 외부감사인 의견 포함)
            const stableYear = (m <= 3) ? (yNow - 2) : (yNow - 1);
            // 현재 선택에 따라 추천 메시지 분기
            let suggestion;
            if(curType === 'annual'){
              // 연간 선택 중 → 더 최신 트렌드 보고 싶으면 분기 추천
              suggestion = `더 최신 트렌드는 <b>${latestLabel}</b> (${latestYear}년 · ${latestDesc})`;
            } else {
              // 분기/반기 선택 중인데 더 최신이 있는 경우만 (이미 위에서 filter됨)
              suggestion = `더 최신은 <b>${latestLabel}</b> (${latestYear}년 · ${latestDesc})`;
            }
            return `<div style="margin-top:3px;padding-top:3px;border-top:1px dashed var(--border);color:var(--text2)">💡 ${suggestion}</div>`;
          })();

          return `<div style="margin-top:8px;padding:6px 8px;background:var(--surface2);border-left:2px solid var(--accent);border-radius:4px;font-size:9px;color:var(--text3);line-height:1.5">
            <div style="font-weight:600;color:var(--text2);margin-bottom:2px">📋 데이터 기준</div>
            <div>· DART <b>${ry}년 ${rl}보고서</b> 기준 (가장 최근 공시값)</div>
            <div>· ${epsBadge}</div>
            <div>· 네이버 등 타 도구는 컨센서스(전망치) 또는 TTM 기준이라 차이 가능</div>
            <div style="margin-top:3px;color:var(--text2)">변경: <span role="button" onclick="if(typeof _sxVib==='function')_sxVib(8);if(typeof _sxGotoFinReportSetting==='function')_sxGotoFinReportSetting();" style="display:inline-block;color:var(--accent);font-weight:600;cursor:pointer;text-decoration:underline;padding:4px 6px;margin:-4px -6px;-webkit-tap-highlight-color:rgba(0,140,255,.3)">⚙ 설정 → 재무 보고서 종류</span></div>
            ${recommendBlock}
          </div>`;
          }

          // ── 네이버 폴백 케이스 (신규) ──
          //   _source === 'naver' 또는 'dart+naver' (배당수익률만 보충된 케이스 등)
          //   사용자에게 "DART 미공시 → 네이버 사용 중"임을 명시 + 누락 항목 안내
          if(fin._source === 'naver' || fin._source === 'dart+naver'){
            const isPartial = fin._source === 'dart+naver';
            return `<div style="margin-top:8px;padding:6px 8px;background:var(--surface2);border-left:2px solid var(--warn,#e8a838);border-radius:4px;font-size:9px;color:var(--text3);line-height:1.5">
              <div style="font-weight:600;color:var(--text2);margin-bottom:2px">📋 데이터 기준</div>
              <div>· 출처: <b>네이버 금융</b>${isPartial?' (DART 일부 보충)':' (DART 미공시)'}</div>
              <div>· PER/PBR/ROE/배당/부채비율 5개 핵심 지표만 표시</div>
              <div>· 3개년 추이·성장률·EV/EBITDA·순부채비율 등 상세 분석은 DART 공시 후 자동 갱신</div>
              <div style="margin-top:3px;color:var(--text2)">· 네이버 데이터는 컨센서스(전망치) 또는 TTM 기준일 수 있어 DART 정식 공시값과 차이 가능</div>
            </div>`;
          }

          // ── [S321] SEC EDGAR 정상 케이스 (미국 종목 공식 공시) ──
          //   _source === 'sec' (SEC만 사용) 또는 'sec+naver' (배당/52주 등 네이버 보충)
          //   한국 DART와 동등 신뢰도 → accent 컬러 + 'SEC 기반' 강조
          if(fin._source === 'sec' || fin._source === 'sec+naver'){
            const ry = fin._reportYear;
            const epsBadge = fin._epsSource === 'sec'
              ? '<span style="color:var(--accent)">EPS·PER 모두 SEC 직접</span>'
              : 'EPS는 네이버/시총 추정 (SEC 미공시 종목)';
            const naverNote = fin._source === 'sec+naver'
              ? '<div>· 배당수익률·52주 고저는 네이버 us-fundamental 보충</div>'
              : '';
            const fyeNote = fin._secFiscalYearEnd
              ? ` <span style="color:var(--text3)">(회계기말 ${fin._secFiscalYearEnd.slice(0,2)}/${fin._secFiscalYearEnd.slice(2)})</span>`
              : '';
            return `<div style="margin-top:8px;padding:6px 8px;background:var(--surface2);border-left:2px solid var(--accent);border-radius:4px;font-size:9px;color:var(--text3);line-height:1.5">
              <div style="font-weight:600;color:var(--text2);margin-bottom:2px">📋 데이터 기준</div>
              <div>· SEC <b>${ry||'—'} 10-K</b> 기준 (가장 최근 공시값)${fyeNote}</div>
              <div>· ${epsBadge}</div>
              ${naverNote}
              <div>· Yahoo Finance 등 타 도구는 TTM(직전 4분기) 기준이라 차이 가능</div>
            </div>`;
          }

          // ── Yahoo (해외) 케이스 ──
          //   미국 주식은 yahoo finance에서 받음 — 이건 정상 동작이라 별도 안내 불필요하지만
          //   사용자 인지를 위해 작은 배지만 표시
          if(fin._source === 'yahoo'){
            return `<div style="margin-top:8px;padding:6px 8px;background:var(--surface2);border-left:2px solid var(--accent);border-radius:4px;font-size:9px;color:var(--text3);line-height:1.5">
              <div style="font-weight:600;color:var(--text2);margin-bottom:2px">📋 데이터 기준</div>
              <div>· 출처: <b>Yahoo Finance</b> (해외 주식 표준)</div>
              <div>· PER/PBR은 TTM(직전 4분기) 기준</div>
            </div>`;
          }

          // ── 네이버 us-fundamental 단독 (SEC 실패 시 폴백) ──
          if(fin._source === 'naver_us'){
            return `<div style="margin-top:8px;padding:6px 8px;background:var(--surface2);border-left:2px solid var(--warn,#e8a838);border-radius:4px;font-size:9px;color:var(--text3);line-height:1.5">
              <div style="font-weight:600;color:var(--text2);margin-bottom:2px">📋 데이터 기준</div>
              <div>· 출처: <b>네이버 금융</b> (SEC EDGAR 미공시 또는 일시 장애)</div>
              <div>· PER/PBR/EPS 등은 TTM 가공값 — 정식 공시 후 자동 갱신</div>
            </div>`;
          }

          // 그 외 (출처 불명) — 안내 생략
          return '';
        })()}
        <div class="itp-toggle-inline" onclick="_sxVib(8);const el=document.getElementById('${fiId}');el.classList.toggle('show');this.querySelector('.sb-arrow').textContent=el.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600;margin-top:6px"><span class="sb-arrow">▶</span> 항목별 상세 해석</div>
        <div class="itp-card" id="${fiId}" style="white-space:pre-line">
          <div>${fi.text}</div>
        </div>
      </div>`;
    })()}

    ${(()=>{
      // S55: 매크로 환경 카드
      const mac = _macroCtx || null;
      if(!mac || typeof SXI==='undefined' || !SXI.advMacro) return '';
      const mi = SXI.advMacro(mac);
      if(!mi) return '';
      const miId = 'macro_' + Math.random().toString(36).slice(2,8);
      const fmt = (v,dec) => v!=null ? v.toFixed(dec||1) : '—';
      return `<div class="anal-section">
        <div class="anal-section-title">매크로 환경</div>
        ${mac.dxy?`<div class="anal-row"><span class="al">달러인덱스</span><span class="ar ${mac.dxy.trend==='down'?'bullish':mac.dxy.trend==='up'?'bearish':'neutral'}">${fmt(mac.dxy.price,2)} (${mac.dxy.change5d>0?'+':''}${fmt(mac.dxy.change5d)}%)</span></div>`:''}
        ${mac.tnx?`<div class="anal-row"><span class="al">미국10년금리</span><span class="ar ${mac.tnx.trend==='down'?'bullish':mac.tnx.trend==='up'?'bearish':'neutral'}">${fmt(mac.tnx.price,2)}%</span></div>`:''}
        ${mac.usdkrw?`<div class="anal-row"><span class="al">달러/원 환율</span><span class="ar ${mac.usdkrw.trend==='down'?'bullish':mac.usdkrw.trend==='up'?'bearish':'neutral'}">${fmt(mac.usdkrw.price,0)}원</span></div>`:''}
        ${mac.vix?`<div class="anal-row"><span class="al">VIX</span><span class="ar ${mac.vix.price>=25?'bearish':mac.vix.price<=15?'bullish':'neutral'}">${fmt(mac.vix.price,1)}</span></div>`:''}
        ${mac.gold?`<div class="anal-row"><span class="al">금(XAU)</span><span class="ar ${mac.gold.trend==='up'?'neutral':mac.gold.trend==='down'?'bullish':'neutral'}">$${fmt(mac.gold.price,1)}</span></div>`:''}
        <div class="itp-toggle-inline" onclick="_sxVib(8);const el=document.getElementById('${miId}');el.classList.toggle('show');this.querySelector('.sb-arrow').textContent=el.classList.contains('show')?'▼':'▶'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600;margin-top:6px"><span class="sb-arrow">▶</span> ${mi.label} (점수: ${mi.score})</div>
        <div class="itp-card" id="${miId}" style="white-space:pre-line">
          <span class="itp-label ${mi.tone}">${mi.label}</span>
          <div>${mi.text}</div>
          <div style="margin-top:6px;padding-top:4px;border-top:1px solid var(--border);font-size:10px;color:var(--text2)">${mi.summary}</div>
        </div>
      </div>`;
    })()}
      </div>
    </div>

    ${(()=>{
      // [S283] 연관 키워드 → 시황 뉴스 섹션 대체
      //   배경: 사용자가 연관 키워드 활용도 낮다고 판단 → 시황 뉴스 3건으로 대체
      //   동작: 분석 렌더 후 150ms 뒤 비동기 fetch (placeholder → 결과)
      //   분기: 한국/한글 코인 → 인앱 모달 + "자세히 보기" / 미국·영문 → 외부 링크 직접
      const _newsId = `newsSection_${(stock.code || stock.ticker || Date.now())}_${Math.floor(Math.random()*1e6)}`;
      if (typeof window !== 'undefined' && window.SXNews) {
        (window._sxTrackedTimeout || setTimeout)(() => {
          try { window.SXNews.load(stock, _newsId); } catch(e) { console.warn('[SXNews] load err', e); }
        }, 150);
      }
      // [S288] 시장별 제목 분기 — 코인은 업비트 공지 기반이므로 "시황 공시"가 정확
      const _isCoinMkt = (typeof currentMarket !== 'undefined' && currentMarket === 'coin') ||
                        /^(KRW|BTC|USDT)-/.test(String(stock.code || ''));
      const _newsTitle = _isCoinMkt ? '🗞️ 최근 시황 공시' : '🗞️ 최근 시황 뉴스';
      return `<div class="anal-section">
        <div class="anal-section-title">${_newsTitle}</div>
        <div id="${_newsId}"><div class="news-loading">뉴스 불러오는 중...</div></div>
      </div>`;
    })()}
  `;
  // S31: 미니 캔들차트 그리기
  if(indicators?._advanced?.rows){
    (window._sxTrackedTimeout || setTimeout)(()=>_drawMiniCandleChart(indicators._advanced.rows, stock._btResult?.trades, _resolvePurpleSv(stock)), 50); // [S578] A/C 토글 반영
  }
  // S57: 재무 바차트 그리기
  // [S321] SEC 출처도 활성화 — 3년치 데이터 동일하게 보유 (sec / sec+naver 둘 다)
  if(stock._financial && (stock._financial._source === 'dart' || stock._financial._source === 'sec' || stock._financial._source === 'sec+naver') && typeof SXChart !== 'undefined' && SXChart.drawFinBar){
    (window._sxTrackedTimeout || setTimeout)(() => SXChart.drawFinBar('finBarChart', stock._financial), 80);
  }
  // S58: 분기별 재무 추이 차트 (비동기 복수 fetch)
  if(currentMarket==='kr' && stock.code && stock._financial && stock._financial._source === 'dart' && typeof SXChart !== 'undefined' && SXChart.drawFinTrend){
    _fetchQuarterlyTrend(stock.code).then(periods => {
      const wrap = document.getElementById('finTrendWrap');
      const label = document.getElementById('finTrendLabel');
      if(!wrap) return;
      if(!periods || periods.length < 2){
        wrap.style.display = 'none';
        return;
      }
      wrap.style.display = 'block';
      if(label) label.textContent = `매출(파랑) / 영업이익(초록) / 순이익(주황) — ${periods.length}기 추이`;
      (window._sxTrackedTimeout || setTimeout)(() => SXChart.drawFinTrend('finTrendChart', periods), 100);
    }).catch(() => {
      const wrap = document.getElementById('finTrendWrap');
      if(wrap) wrap.style.display = 'none';
    });
  }
  // S57→S58: 결산월 비동기 fetch + 해석 (DART company, 1건)
  // [Phase 4-E] 502/5xx 흡수 — 워커 cold start 또는 일시적 5xx 발생 시 1회 재시도
  //   타임아웃 8s → 12s (corp_code resolve 후 DART API 호출 → 보수적 여유)
  //   재시도는 5xx만 대상 (4xx는 영속적 — 종목 없음/파라미터 오류라 재시도 무의미)
  if(currentMarket==='kr' && stock.code){
    const _settleUrl = `${WORKER_BASE}/dart/company?stock_code=${stock.code}`;
    const _settleFetch = async (attempt) => {
      try{
        const r = await fetch(_settleUrl, {signal:AbortSignal.timeout(12000)});
        if(r.ok) return await r.json();
        // 5xx면 1회만 재시도 (attempt==0 → 한 번 더 → attempt==1 → 포기)
        if(r.status >= 500 && attempt === 0){
          await new Promise(rs => setTimeout(rs, 800)); // 짧은 백오프
          return _settleFetch(1);
        }
        return null;
      }catch(_){
        // 네트워크 에러/타임아웃도 1회 재시도
        if(attempt === 0){
          await new Promise(rs => setTimeout(rs, 800));
          return _settleFetch(1);
        }
        return null;
      }
    };
    _settleFetch(0)
      .then(d=>{
        // [업종표시] industry_code → KSIC 매핑 → 헤더 카드의 분석시간 아래에 1줄 표시
        //   - DART API의 industry_code (KSIC 소분류 3자리) 활용
        //   - 매핑 실패하거나 코드 없으면 div 숨김 유지
        //   - 표시 형식: 🏢 섹터 · 업종명  (예: 🏢 전자/반도체/IT장비 · 통신 및 방송장비 제조업)
        try {
          if(d && d.industry_code){
            // [PLAN_7-B 보강] stock 객체에 industryCode 저장 → SXI.isFinancialIndustry의 KSIC 분기 활성화
            //   현재 사양: DART industry_code 응답 도착 시 stock.industryCode에 박아두면 EV/EBITDA 금융업 비적용 판정의 KSIC 자동감지가 작동
            //   효과: 화이트리스트 누락된 중소형 금융주/신규 상장 금융주도 자동 감지
            //   〔이력〕 이전: stock.industryCode 필드를 SXI.isFinancialIndustry가 읽으려 하나 어디서도 채우지 않아 KSIC 분기가 죽은 코드였음 (수정됨)
            if(stock) stock.industryCode = String(d.industry_code).trim();
            const _secText = _ksicSectorText(d.industry_code);
            // [방어] analSectorText DOM이 응답 도착 시점에 아직 안 그려졌을 수 있음 (첫 진입 시 워커 cold start 등 타이밍 이슈)
            //   → 즉시 시도 + 실패 시 다음 프레임 재시도 (DOM이 그 사이에 그려질 시간 확보)
            //   stock.industryCode는 이미 박혔으니 화면 다시 그릴 때(switchAnalTab 등) anal-header-card 동기 렌더에서 자동 표시됨
            const _applySector = () => {
              const _secEl = document.getElementById('analSectorText');
              if(_secEl && _secText){
                _secEl.textContent = _secText;
                _secEl.style.display = 'block';
                return true;
              }
              return false;
            };
            if(!_applySector()){
              // DOM 미존재 → 한 프레임 후 재시도
              setTimeout(_applySector, 100);
            }
          }
        } catch(_) {}
        const el = document.getElementById('analSettleMonth');
        if(el && d && d.acc_month){
          el.textContent = d.acc_month + '월';
          // S58: 결산월 해석 삽입
          const itpArea = document.getElementById('settleMonthItpArea');
          if(itpArea && typeof SXI!=='undefined' && SXI.advSettleMonth){
            const smi = SXI.advSettleMonth(d.acc_month);
            if(smi){
              const smId = 'sm_' + Math.random().toString(36).slice(2,8);
              itpArea.innerHTML = `<div class="itp-toggle-inline" onclick="_sxVib(8);const el=document.getElementById('${smId}');el.classList.toggle('show')"><span class="sb-arrow">▶</span> ${smi.label}</div>
              <div class="itp-card" id="${smId}" style="white-space:pre-line">
                <span class="itp-label ${smi.tone}">${smi.label}</span>
                <div>${smi.text}</div>
                <div style="margin-top:6px;padding-top:4px;border-top:1px solid var(--border);font-size:10px;color:var(--text2)">${smi.summary}</div>
              </div>`;
            }
          }
        }
      })
      .catch(()=>{});
  }
  // [Phase 4-F] 시가총액 보강 — sxSelectStock 직접 진입 시 marketCap:0으로 박힘 + 스캔 중 KRX 502 맞은 종목도 보강
  //   원인 1: 라인 7866 sxSelectStock에서 marketCap:0 으로 새 stock 객체 생성
  //   원인 2: 스캔 중 /krx/market-cap 502 발생 시 marketCap=0 그대로 결과에 박힘 (Phase 4-D는 price만 보강)
  //   설계:
  //     - KRX market-cap은 전종목 응답이라 응답 크기 큼 → 세션 동안 메모리 캐시 (window._mcapCache)
  //     - 5xx 1회 재시도 (cold start 흡수)
  //     - 비동기로 진행 — 분석 렌더 차단 X. fetch 완료 후 stock.marketCap 갱신 + DOM 직접 갱신
  if(currentMarket==='kr' && stock.code && (!stock.marketCap || stock.marketCap===0)){
    const _applyMcap = (mcapEok) => {
      if(!mcapEok || mcapEok <= 0) return;
      stock.marketCap = mcapEok;
      // 분석 화면이 이미 렌더된 후일 수 있음 → DOM 직접 갱신
      // 시가총액 행은 위쪽 '기본 정보' 카드 안 — id 없이 라벨로 찾아야 함
      // 안전하게 anal-row 라벨 매칭으로 갱신
      try{
        const rows = document.querySelectorAll('.anal-row');
        for(const row of rows){
          const al = row.querySelector('.al');
          if(al && al.textContent.trim() === '시가총액'){
            const ar = row.querySelector('.ar');
            // formatMCap 활용 — 다른 위치 표시와 형식 일관
            if(ar && typeof formatMCap === 'function'){
              ar.textContent = formatMCap(mcapEok);
            }
            // 바로 다음 형제가 시총 해석 itp-card — 기존 '시총 정보 없음' 텍스트면 새 해석으로 교체
            const next = row.nextElementSibling;
            if(next && next.classList && next.classList.contains('itp-card')){
              const div = next.querySelector('div');
              if(div && div.textContent && div.textContent.includes('시총 정보 없음')){
                if(typeof SXI !== 'undefined' && SXI.basicInfo){
                  const info = SXI.basicInfo(stock); // stock.marketCap이 이미 갱신된 상태 (위 _applyMcap)
                  if(info && info.marketCap && info.marketCap.text){
                    div.textContent = info.marketCap.text;
                  }
                }
              }
            }
            break;
          }
        }
      }catch(_){}
    };
    // 메모리 캐시 우선
    if(window._mcapCache && window._mcapCache.map && window._mcapCache.ts && (Date.now() - window._mcapCache.ts < 600000)){
      // 캐시 10분 유효
      const v = window._mcapCache.map[stock.code];
      if(v > 0) _applyMcap(v);
    } else {
      // 캐시 없거나 만료 — KRX 호출 (1회 재시도 포함)
      const _mcapFetch = async (attempt) => {
        try{
          const r = await fetch(`${WORKER_BASE}/krx/market-cap`, {signal:AbortSignal.timeout(15000)});
          if(r.ok) return await r.json();
          if(r.status >= 500 && attempt === 0){
            await new Promise(rs => setTimeout(rs, 1000));
            return _mcapFetch(1);
          }
          return null;
        }catch(_){
          if(attempt === 0){
            await new Promise(rs => setTimeout(rs, 1000));
            return _mcapFetch(1);
          }
          return null;
        }
      };
      _mcapFetch(0).then(j=>{
        if(!j) return;
        const raw = j.items || j.OutBlock_1 || j.data || [];
        if(!raw.length) return;
        // 전종목 → 코드별 시총 맵 (억 단위 변환)
        const map = {};
        for(const r of raw){
          const code = r.ISU_SRT_CD || r.code || '';
          if(code){
            const v = parseFloat(String(r.MKTCAP || r.marketCap || 0).replace(/,/g,'')) || 0;
            if(v > 0) map[code] = v / 100000000; // 원 → 억
          }
        }
        window._mcapCache = { map, ts: Date.now() };
        const v = map[stock.code];
        if(v > 0) _applyMcap(v);
      }).catch(()=>{});
    }
  }
  // [재무 부문별 점수] DOM 렌더 직후 fundSectorArea 채우기
  //   stock._financial은 분석 시작 전(665줄)에 await로 채워졌으므로 동기 호출 OK
  //   공시 fetch는 비동기지만 이 호출은 그와 무관하게 진행
  _renderFundSectorRow(stock);
}

// ══ S56: 공시 UI 동적 렌더 (비동기 fetch 완료 후 호출) ══
function _renderDisclosureUI(stock, scores, indicators, qs){
  const di = stock._disclosureItp;
  // 1) 배지 영역 (종목명 카드)
  const badgeArea = document.getElementById('discBadgeArea');
  if(badgeArea && di && di.badges && di.badges.length){
    // S57: 카테고리별 그룹화 배지
    const grouped = {};
    for(const b of di.badges){
      const cat = b.category || '기타';
      if(!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(b);
    }
    // S103-fix6: 카테고리별 2열 그리드 배치 (홀수 마지막은 전체 폭 중앙정렬)
    // S103-fix6b: 좌우 쌍 가운데 수렴 — 좌측 셀 우측정렬 + 우측 셀 좌측정렬
    const catEntries = Object.entries(grouped);
    const isOdd = catEntries.length % 2 === 1;
    let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;align-items:start">';
    catEntries.forEach(([cat, badges], idx) => {
      const isLast = idx === catEntries.length - 1;
      const fullWidth = isOdd && isLast;
      let cellStyle;
      if(fullWidth) cellStyle = 'grid-column:1 / -1;text-align:center';
      else if(idx % 2 === 0) cellStyle = 'text-align:right';  // 좌측 셀: 우측정렬
      else cellStyle = 'text-align:left';                      // 우측 셀: 좌측정렬
      html += `<div style="${cellStyle}"><span style="font-size:8px;color:var(--text3);font-weight:600;margin-right:4px">${cat}</span>`;
      html += badges.map(b => `<span class="disc-badge ${b.cls}" title="${b.date||''}" ${b.url?`data-dart-url="${b.url}"`:''}>${b.text}</span>`).join('');
      html += `</div>`;
    });
    html += '</div>';
    // [S324] 미국 종목은 SEC 원문, 한국은 DART 원문 — di._source로 분기
    const _origin = di._source === 'sec' ? 'SEC' : 'DART';
    html += di.badges.some(b=>b.url) ? `<div style="font-size:7px;color:var(--text3);margin-top:3px;text-align:center">탭하여 ${_origin} 원문 확인 →</div>` : '';
    badgeArea.innerHTML = html;
    badgeArea.querySelectorAll('.disc-badge[data-dart-url]').forEach(el => {
      el.style.cursor = 'pointer';
      el.onclick = () => window.open(el.dataset.dartUrl, '_blank');
    });
  }
  // 2) 부문별 점수 공시 행
  const sectorArea = document.getElementById('discSectorArea');
  if(sectorArea && di){
    const ds = di.sectorScore;
    const dCls = ds>=55?'bullish':ds<=45?'bearish':'neutral';
    // [PATCH disc-dedup] "공시 상세 해석" 토글 카드 제거 — 상단 .disc-card-rendered (블록 ⑤)와 중복
    //   기존: 점수 행 + 등급 카드 + ▶ 공시 상세 해석 (펼치면 di.text 전체 표시)
    //   변경: 점수 행 + 등급 카드 (요약)만 유지. 상세는 상단 컴팩트 카드 하나로 통일.
    sectorArea.innerHTML = `
      <div class="anal-row"><span class="al">공시</span><span class="ar ${dCls}">${ds}</span></div>
      <div class="itp-card show" style="margin-top:2px;margin-bottom:6px">
        <span class="itp-label ${di.tone==='danger'?'danger':di.tone}">${di.sectorGrade}</span>
        <div>${di.sectorText}</div>
      </div>`;
    _sxBoardSetAsync('fund','공시',ds); // [S356] 전광판 펀더멘털 확장
  }
  // 2-2) 부문별 점수 재무 행 — 다른 부문(거래량/추세/공시)과 동일 형식으로 통합
  //   사용자 피드백: "재무 종합평가가 별도 카드라 부문별 점수와 비교 어려움"
  //   → 부문별 영역에 동일 형식으로 합쳐서 한눈 비교 가능하게 변경
  //   별도 헬퍼로 분리해 분석탭 진입 시점/공시 fetch 후 시점 양쪽에서 안전하게 호출
  _renderFundSectorRow(stock);
  // 3) 참고사항 오버라이드 (공시 감지 후 재렌더 — Phase3-C-1 다이나믹 레이어 적용)
  if(di && di.tone !== 'neutral' && typeof SXI!=='undefined' && SXI.overrideSummaryWithDisclosure){
    const summaryEl = document.querySelector('.itp-summary');
    if(summaryEl && qs && indicators){
      // S103-fix7 Phase3-B-3: verdictAction 5번째 파라미터 전달 (공시 갱신 재렌더 시에도 보유 맥락 유지)
      // [S223] 6번째 파라미터 qs.regime 추가 — 27조합 컨텍스트 (공시 재렌더 경로도 동기 적용)
      const _verdictActForDisc = stock._svVerdict?.action || null;
      const baseSummary = SXI.summary(qs.action, qs.score, qs.reasons, indicators, _verdictActForDisc, qs.regime || null);
      if(baseSummary){
        const overridden = SXI.overrideSummaryWithDisclosure(baseSummary, di);
        // Phase3-C-1: 공시 tone 직접 전달 → 레이어 정확히 판정
        const _layer = _getSummaryLayerConfig(overridden, di.tone);
        // 기존 layer-l* 클래스 제거 후 새 레벨 클래스 부착 (border/background 자동 반영)
        summaryEl.classList.remove('layer-l0','layer-l1','layer-l2','layer-l3','layer-l4');
        summaryEl.classList.add('layer-' + _layer.level);
        // 참고사항 HTML 재렌더 (제목도 레이어에 맞춰 동적으로)
        summaryEl.innerHTML = `
          <div class="itp-summary-title"><span>${_layer.icon}</span><span>${_layer.label}</span></div>
          ${overridden.stateLine?`<div style="font-size:11px;font-weight:800;color:var(--${overridden.tone==='bullish'?'buy':overridden.tone==='bearish'?'sell':'hold'});margin-bottom:4px">${overridden.stateLine}</div>`:''}
          <div class="itp-summary-text">${overridden.mainText}</div>
          ${overridden.actionGuide?`<div style="font-size:10px;padding:6px 8px;background:var(--surface2);border-radius:6px;margin:6px 0 4px;line-height:1.55"><span style="font-weight:700;color:var(--text)">행동 가이드</span><br><span style="color:var(--text2)">${overridden.actionGuide}</span></div>`:''}
          ${overridden.invalidation?`<div style="font-size:10px;padding:6px 8px;background:rgba(255,140,0,.06);border-radius:6px;margin-bottom:4px;line-height:1.55"><span style="font-weight:700;color:#ff8c00">무효화 조건</span><br><span style="color:var(--text2)">${overridden.invalidation}</span></div>`:''}
          ${overridden.buyTrigger?`<div style="font-size:10px;padding:6px 8px;background:var(--buy-bg);border-radius:6px;margin-bottom:6px;line-height:1.55"><span style="font-weight:700;color:var(--buy)">강화 조건</span><br><span style="color:var(--text2)">${overridden.buyTrigger}</span></div>`:''}
          ${overridden.keyReasons&&overridden.keyReasons.length?'<div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">핵심 이유</div>':''}
          ${(overridden.keyReasons||[]).map(c=>`<div class="itp-composite ${c.tone}"><div class="itp-composite-title">${c.icon||''} ${c.title}</div><div class="itp-composite-text">${c.text}</div></div>`).join('')}
          ${overridden.risks&&overridden.risks.length?'<div style="font-size:10px;font-weight:700;color:var(--sell);margin:6px 0 4px">위험 요소</div>':''}
          ${(overridden.risks||[]).map(c=>`<div class="itp-composite ${c.tone}"><div class="itp-composite-title">${c.icon||''} ${c.title}</div><div class="itp-composite-text">${c.text}</div></div>`).join('')}
        `;
      }
    }
  }
  // 4) 레짐 카드에 공시 배지 추가
  if(di && di.badges && di.badges.length){
    const regimeSection = document.querySelector('.anal-section [style*="surface2"]');
    if(regimeSection){
      const existing = regimeSection.querySelector('.disc-regime-badges');
      if(!existing){
        const badgeDiv = document.createElement('div');
        badgeDiv.className = 'disc-regime-badges';
        badgeDiv.style.cssText = 'margin-top:4px;display:flex;flex-wrap:wrap;gap:2px';
        badgeDiv.innerHTML = di.badges.map(b => `<span class="disc-badge ${b.cls}">${b.text}</span>`).join('');
        const tagsEl = regimeSection.querySelector('.sf-tags');
        if(tagsEl) tagsEl.after(badgeDiv);
        else regimeSection.appendChild(badgeDiv);
      }
    }
  }
  // 5) [UI 재배치] 호재 공시 카드 사후 삽입
  //   이유: 인라인 템플릿(라인 ~3005)은 초기 렌더 시 stock._disclosureItp가 없으면 빈 문자열 반환 →
  //         비동기 fetch 후 카드가 안 나타나는 케이스 방지. 참고사항(.itp-summary) 직후, 부문별 점수(.anal-fold) 직전에 삽입.
  //   조건: di 있음 + SXI.renderDisclosureCard 함수 존재 + 이미 카드 DOM 없음 (중복 삽입 방지)
  //   tone-* 클래스로 좌측 테두리 색상 동적 적용 (인라인과 동일)
  if(di && typeof SXI!=='undefined' && SXI.renderDisclosureCard){
    const summaryEl = document.querySelector('.itp-summary');
    const existingCard = document.querySelector('.disc-card-rendered');
    if(summaryEl && !existingCard){
      const cardHTML = SXI.renderDisclosureCard(di);
      if(cardHTML){
        const wrap = document.createElement('div');
        const toneCls = di.tone ? `tone-${di.tone}` : '';
        wrap.className = ('disc-card-rendered ' + toneCls).trim();
        wrap.innerHTML = cardHTML;
        // summaryEl 직후에 삽입 (= 부문별 점수 직전)
        summaryEl.after(wrap);
      }
    }
  }
}

/**
 * 부문별 점수 영역에 재무 행을 채우는 헬퍼
 * - 분석탭 진입 직후 호출 (renderAnalysisResult 끝부분)
 * - 공시 fetch 완료 후 _renderDisclosureUI 내부에서도 호출 (재진입 시 갱신)
 * - stock._financial이 없거나 advFundamental 실패 시 안전하게 무시 (행 안 그림)
 *
 * 재무 점수를 별도 카드가 아닌 부문별 점수 영역(거래량/추세/공시 옆)에 통합 배치하여
 * 사용자가 한눈에 모든 부문 점수를 비교할 수 있게 함.
 */
function _renderFundSectorRow(stock){
  const fundArea = document.getElementById('fundSectorArea');
  if(!fundArea) return;
  if(!stock._financial || typeof SXI==='undefined' || !SXI.advFundamental) return;
  try{
    // [PLAN_7-B] 금융업 판정 — 본 카드와 동일한 분기 적용
    const _isFin = (typeof SXI.isFinancialIndustry === 'function') ? SXI.isFinancialIndustry(stock) : false;
    if(_isFin) stock._financial._isFinancial = true;
    const fi = SXI.advFundamental(stock._financial, stock.price, stock);
    if(fi && fi.sectorScore != null){
      const fs = fi.sectorScore;
      const fCls = fs>=55?'bullish':fs<=45?'bearish':'neutral';
      fundArea.innerHTML = `
        <div class="anal-row"><span class="al">재무</span><span class="ar ${fCls}">${fs}</span></div>
        <div class="itp-card show" style="margin-top:2px;margin-bottom:6px">
          <span class="itp-label ${fi.tone}">${fi.sectorGrade}</span>
          <div>${fi.sectorText}</div>
        </div>`;
      _sxBoardSetAsync('fund','재무',fs); // [S356] 전광판 펀더멘털 확장
    }
    // [S399] 적정가 전광판 항목 제거 — 밸류 점수(S397)가 이미 PER 괴리를 반영하므로,
    //   적정가를 전광판에 따로 두면 PER 고평가가 펀더멘털 평균에서 이중 페널티가 됨(밸류↓ + 적정가↓).
    //   적정주가·괴리율 정보는 기본정보의 '적정주가' 라인에 그대로 유지되어 정보 손실 없음.
    //   (전광판 = 밸류로 일원화 / 적정주가 = 정보 표시)
  }catch(_){ /* 재무 처리 실패 시 행 표시 안 함 (안전) */ }
}

// [S275][S276] 미국 종목 분석탭/결과카드 단위 포맷 헬퍼
//   배경: stock.price/marketCap/tradeAmount는 raw 수치 (USD 또는 억 USD)인데
//         기본 formatKRW/formatMCap/formatTradeAmt는 "원/억/조" 한국 단위로 표기 → 오해 유발
//   해결: 미국 종목 분기 — $X.XX 가격, "X조 X억 USD"(네이버 raw) 시총, "XXX억 USD" 거래대금
//         네이버 batch quote의 _marketCapDisplay, _marketCapKrwDisplay, _tradeAmountDisplay 우선 사용
//         (네이버가 원본을 깔끔하게 줘서 별도 계산 불필요)
// ══════════════════════════════════════════════════════════════════════════
// [S283] SXNews — 분석탭 시황 뉴스 fetch + 모달 표시
// ══════════════════════════════════════════════════════════════════════════
//   배경: 사용자가 분석탭 하단 연관 키워드 활용도 낮다고 판단 → 시황 뉴스 3건으로 대체
//   설계: 워커 /news/{kr|us|crypto} 호출 → 결과 카드 리스트로 렌더
//   분기: 한국·한글 코인 → 인앱 모달 + "자세히 보기" 버튼 / 미국·영문 → 외부 링크 직접
//   캐시: Map (분석 화면 내 같은 종목 중복 호출 방지)
window.SXNews = window.SXNews || {
  _cache: new Map(),
  _currentItems: null,

  // 시장 판별 + fetch URL 빌더
  _buildUrl(stock) {
    const base = (typeof WORKER_BASE !== 'undefined') ? WORKER_BASE : 'https://stock-signal-proxy.cheaheechang.workers.dev';
    // 1. 미국 — _mkt='us' 또는 currentMarket='us'
    if (stock._mkt === 'us' || (typeof currentMarket !== 'undefined' && currentMarket === 'us')) {
      const ticker = String(stock.ticker || stock.code || '').split('.')[0];
      if (!ticker) return null;
      return { url: `${base}/news/us?ticker=${encodeURIComponent(ticker)}&count=3`, kind: 'us' };
    }
    // 2. 코인 — currentMarket='coin' 또는 code가 KRW-/BTC-/USDT- 접두사
    const isCoin = (typeof currentMarket !== 'undefined' && currentMarket === 'coin') ||
                   /^(KRW|BTC|USDT)-/.test(String(stock.code || ''));
    if (isCoin) {
      return { url: `${base}/news/crypto?count=3`, kind: 'crypto' };
    }
    // 3. 한국 — 6자리 코드
    if (/^\d{6}$/.test(String(stock.code || ''))) {
      return { url: `${base}/news/kr?code=${stock.code}&count=3`, kind: 'kr' };
    }
    return null;
  },

  async load(stock, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const info = this._buildUrl(stock);
    if (!info) {
      container.innerHTML = '<div class="news-empty">뉴스 미지원 종목</div>';
      return;
    }

    // 캐시 확인 (같은 분석 화면 내 재호출 방지)
    if (this._cache.has(info.url)) {
      this._render(container, this._cache.get(info.url), info.kind);
      return;
    }

    container.innerHTML = '<div class="news-loading">뉴스 불러오는 중...</div>';

    try {
      const res = await fetch(info.url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        container.innerHTML = `<div class="news-error">뉴스 fetch 실패 (${res.status})</div>`;
        return;
      }
      const data = await res.json();
      this._cache.set(info.url, data);
      this._render(container, data, info.kind);
    } catch (e) {
      container.innerHTML = '<div class="news-error">뉴스 fetch 실패</div>';
      console.warn('[SXNews] fetch error:', e);
    }
  },

  _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  },

  _render(container, data, kind) {
    const items = (data && data.items) || [];
    if (!items.length) {
      container.innerHTML = '<div class="news-empty">최근 뉴스 없음</div>';
      return;
    }

    // 영문 여부 — 미국 종목 또는 CoinGecko 폴백 시 영문이므로 모달 대신 직접 외부 링크
    const isEnglish = kind === 'us' || (data && data._source === 'coingecko');

    const html = '<div class="news-list">' + items.map((it, idx) => {
      const timeStr = this._relTime(it.publishedAt);
      const safeTitle = this._esc(it.title);
      const safeSource = this._esc(it.source || '뉴스');
      const safeUrl = this._esc(it.url || '#');
      const clickJs = isEnglish
        ? `window.open(this.href,'_blank','noopener,noreferrer');return false;`
        : `SXNews.openModal(${idx});return false;`;
      return `<a class="news-card" href="${safeUrl}" target="_blank" rel="noopener noreferrer" onclick="_sxVib(8);${clickJs}">
        <div class="news-card-title">${safeTitle}</div>
        <div class="news-card-meta">
          <span class="news-source">${safeSource}</span>
          ${timeStr ? `<span>·</span><span class="news-time">${timeStr}</span>` : ''}
        </div>
      </a>`;
    }).join('') + '</div>';

    container.innerHTML = html;
    // 모달 열 때 사용할 items 보관 (가장 최근 컨테이너만)
    this._currentItems = items;
  },

  openModal(idx) {
    const items = this._currentItems;
    if (!items || !items[idx]) return;
    const it = items[idx];
    const body = document.getElementById('newsModalBody');
    if (body) {
      const timeStr = this._relTime(it.publishedAt);
      body.innerHTML =
        `<div class="nm-title">${this._esc(it.title)}</div>` +
        `<div class="nm-meta"><span class="news-source">${this._esc(it.source || '뉴스')}</span>${timeStr ? ' · ' + timeStr : ''}</div>` +
        `<div class="nm-summary">${it.summary ? this._esc(it.summary) : '요약 정보 없음. "자세히 보기"로 원문을 확인하세요.'}</div>`;
    }
    const ext = document.getElementById('newsModalExtLink');
    if (ext) ext.href = it.url || '#';
    const modal = document.getElementById('newsModal');
    if (modal) {
      // [S288] 모바일 뒤로가기로 모달 닫기 지원 — 기존 [S213] 모달 패턴 통일
      try { history.pushState({view:'newsModal'}, ''); } catch(_) {}
      modal.classList.add('show');
    }
  },

  closeModal() {
    if (typeof _sxVib === 'function') _sxVib(8);
    const modal = document.getElementById('newsModal');
    if (modal) modal.classList.remove('show');
  },

  // 상대 시간 표시 — ISO 또는 "2026.05.12 13:00" 형식 자동 처리
  _relTime(iso) {
    if (!iso) return '';
    let t = NaN;
    try {
      t = new Date(iso).getTime();
      if (isNaN(t)) {
        const m = String(iso).match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/);
        if (m) t = new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]), parseInt(m[4]||0), parseInt(m[5]||0)).getTime();
      }
    } catch(_) {}
    if (!t || isNaN(t)) return String(iso).split('T')[0] || String(iso).slice(0, 10);

    const diff = Date.now() - t;
    if (diff < 0) return '방금';
    const min = Math.floor(diff / 60000);
    if (min < 1) return '방금';
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}일 전`;
    try {
      return new Date(t).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
    } catch(_) { return new Date(t).toISOString().slice(5, 10); }
  }
};

function _isUsStock(stock) {
  if (!stock) return false;
  if (stock._mkt === 'us') return true;
  if (typeof currentMarket !== 'undefined' && currentMarket === 'us' && !stock._mkt) return true;
  return false;
}

function fmtUsPrice(v) {
  if (v == null || v === 0) return '$0';
  // 0.01 미만 (페니주) → 4자리 소수점, 그 외 2자리
  return v < 1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}

function fmtUsMCap(stock) {
  // 네이버 raw 표기 ("4조 2,987억 USD") 우선
  if (stock && stock._marketCapDisplay) return stock._marketCapDisplay;
  // 폴백 — raw marketCap(억 USD)로 직접 환산
  //   master에는 억 단위로 저장됨 (loadUSMaster에서 / 1e8)
  //   1조 USD = 10000억 USD
  const m = stock && stock.marketCap;
  if (!m) return '0';
  if (m >= 10000) return `${(m/10000).toFixed(2)}조 USD`;
  if (m >= 1) return `${m.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')}억 USD`;
  return `${m.toFixed(2)} USD`;
}

function fmtUsTradeAmt(stock) {
  // 네이버 raw 표기 ("115억 USD") 우선
  if (stock && stock._tradeAmountDisplay) return stock._tradeAmountDisplay;
  const v = stock && stock.tradeAmount;
  if (!v) return '0';
  // master에는 백만 단위로 저장됨 ((price × volume) / 1e6)
  if (v >= 100000) return `${(v/100000).toFixed(1)}조 USD`;
  if (v >= 100) return `${(v/100).toFixed(0)}억 USD`;
  if (v >= 1) return `${v.toFixed(0)}백만 USD`;
  return '0';
}

// [S276] 미국 종목 결산월 — 네이버 _financial._income 마지막 period에서 월 추출
//   예: "2025.09.27" → "9월말" / "2024.12.31" → "12월말"
function fmtUsSettleMonth(stock) {
  const inc = stock && stock._financial && stock._financial._income;
  if (!Array.isArray(inc) || !inc.length) return null;
  const lastPeriod = inc[inc.length - 1] && inc[inc.length - 1].period;
  if (!lastPeriod) return null;
  const m = String(lastPeriod).match(/\.(\d{1,2})\./);
  return m ? `${parseInt(m[1], 10)}월말` : null;
}

function formatMCap(v){
  if(!v) return '—';  // [S399] 시총 누락 시 "0" 대신 "—" (0원으로 오인 방지)
  // v는 억원 단위가 정상, 원단위가 들어올 수 있음 → 자동 정규화
  if(v>100000000) v = v / 100000000;
  if(v>=10000) return (v/10000).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'조';
  if(v>=1) return v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'억';
  const man = v * 10000;
  if(man>=10000) return (man/10000).toFixed(0)+'억';
  if(man>=1) return man.toFixed(0).toLocaleString()+'만';
  return '0';
}
function formatTradeAmt(v){
  if(!v) return '0';
  // [S399] v는 백만원 단위가 정상. 원단위 오입력만 정규화.
  //   기존 임계 1e7(10조 백만원)은 정상 대형주 거래대금을 원단위로 오인 → "10백만" 버그.
  //   원단위 거래대금은 1e11~1e13 수준이므로 임계를 1e9로 상향(백만원 단위 정상값은 통과).
  if(v>1000000000) v = v / 1000000;
  if(v>=1000000) return (v/1000000).toFixed(1)+'조';
  if(v>=100) return (v/100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'억';
  if(v>=1) return v.toFixed(0)+'백만';
  return '0';
}
function formatKRW(v){
  if(!v) return '0원';
  if(v>=1000000000000) return (v/1000000000000).toFixed(1)+'조원';
  if(v>=100000000) return (v/100000000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'억원';
  if(v>=10000) return (v/10000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'만원';
  if(v>=1000) return (v/1000).toFixed(0)+'천원';
  return v.toFixed(0)+'원';
}

// ══════════════════════════════════════════════════════════════
//  S73: 섹터 레이더 카드 렌더링
// ══════════════════════════════════════════════════════════════

function renderSectorRadarCard(radarGuide) {
  if (!radarGuide || radarGuide.momentumLabel === '-') return '';
  const g = radarGuide;
  const momBg = g.momentum === 'strong_bull' ? '#f443361a' : g.momentum === 'bull' ? '#ff57221a' : g.momentum === 'bear' ? '#2196f31a' : g.momentum === 'strong_bear' ? '#1565c01a' : 'var(--surface2)';

  let html = `<div class="sx-card sx-sector-radar" style="margin-top:10px">
    <div class="sx-card-hdr" onclick="this.parentElement.classList.toggle('fold')" style="cursor:pointer">
      <span class="sx-card-title">📡 ${g.title}</span>
      <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${g.momentumColor}22;color:${g.momentumColor};font-weight:700">${g.momentumLabel}</span>
      <span class="sx-fold-icon" style="margin-left:auto;font-size:10px;color:var(--text3)">▼</span>
    </div>
    <div class="sx-card-body">
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">${g.summary}</div>`;

  // 강세 TOP5
  if (g.bullTexts.length > 0) {
    html += `<div style="margin-bottom:6px"><div style="font-size:10px;font-weight:700;color:#f44336;margin-bottom:4px">🔺 강세 TOP5</div>`;
    html += g.bullTexts.map(t => {
      const m = t.match(/^(\d+)\.\s+(.+?)\s+([+-]?[\d.]+%)\s+\((.+)\)$/);
      if (m) {
        return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:10px;border-bottom:1px solid var(--border)">
          <span style="color:var(--text3);width:14px">${m[1]}.</span>
          <span style="flex:1;font-weight:600;color:var(--text)">${m[2]}</span>
          <span style="color:#f44336;font-weight:700">${m[3]}</span>
          <span style="color:var(--text3);font-size:9px">${m[4]}</span>
        </div>`;
      }
      return `<div style="font-size:10px;padding:2px 0;color:var(--text2)">${t}</div>`;
    }).join('');
    html += '</div>';
  }

  // 약세 TOP5
  if (g.bearTexts.length > 0) {
    html += `<div style="margin-bottom:6px"><div style="font-size:10px;font-weight:700;color:#2196f3;margin-bottom:4px">🔻 약세 TOP5</div>`;
    html += g.bearTexts.map(t => {
      const m = t.match(/^(\d+)\.\s+(.+?)\s+([+-]?[\d.]+%)\s+\((.+)\)$/);
      if (m) {
        return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:10px;border-bottom:1px solid var(--border)">
          <span style="color:var(--text3);width:14px">${m[1]}.</span>
          <span style="flex:1;font-weight:600;color:var(--text)">${m[2]}</span>
          <span style="color:#2196f3;font-weight:700">${m[3]}</span>
          <span style="color:var(--text3);font-size:9px">${m[4]}</span>
        </div>`;
      }
      return `<div style="font-size:10px;padding:2px 0;color:var(--text2)">${t}</div>`;
    }).join('');
    html += '</div>';
  }

  // 자금 쏠림
  if (g.capitalFlowText) {
    html += `<div style="font-size:10px;padding:6px 8px;border-radius:6px;background:${momBg};color:var(--text2);margin-bottom:6px">${g.capitalFlowText}</div>`;
  }

  // 관심종목 매칭
  if (g.watchlistTexts.length > 0) {
    html += `<div style="margin-top:4px"><div style="font-size:10px;font-weight:700;color:var(--accent);margin-bottom:4px">[참고] 내 관심종목 섹터 현황</div>`;
    html += g.watchlistTexts.map(t => `<div style="font-size:10px;padding:2px 0;color:var(--text2)">${t}</div>`).join('');
    html += '</div>';
  }

  html += '</div></div>';
  return html;
}

// ══════════════════════════════════════════════════════════════
//  S73: 상관/분산 카드 렌더링
// ══════════════════════════════════════════════════════════════

function renderCorrelationCard(corrGuide, corrData) {
  if (!corrGuide || corrGuide.riskLabel === '-') return '';
  const g = corrGuide;

  // 분산 점수 게이지 바
  const score = g.diversityScore || 0;
  const gaugeColor = score >= 75 ? '#4caf50' : score >= 60 ? '#8bc34a' : score >= 45 ? '#ff9800' : score >= 30 ? '#ff5722' : '#f44336';

  let html = `<div class="sx-card sx-correlation" style="margin-top:10px">
    <div class="sx-card-hdr" onclick="this.parentElement.classList.toggle('fold')" style="cursor:pointer">
      <span class="sx-card-title">🔗 ${g.title}</span>
      <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${g.riskColor}22;color:${g.riskColor};font-weight:700">${g.riskLabel}</span>
      <span class="sx-fold-icon" style="margin-left:auto;font-size:10px;color:var(--text3)">▼</span>
    </div>
    <div class="sx-card-body">
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">${g.summary}</div>`;

  // 분산 점수 게이지
  html += `<div style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span style="font-size:10px;font-weight:700;color:var(--text)">분산 점수</span>
      <span style="font-size:12px;font-weight:800;color:${gaugeColor}">${score}점 (${g.diversityGrade})</span>
    </div>
    <div style="height:8px;border-radius:4px;background:var(--surface2);overflow:hidden">
      <div style="height:100%;width:${score}%;border-radius:4px;background:${gaugeColor};transition:width .3s"></div>
    </div>
    <div style="font-size:9px;color:var(--text3);margin-top:3px">${g.diversityText}</div>
  </div>`;

  // 미니 히트맵 (corrData가 있으면)
  if (corrData && corrData.matrix && corrData.matrix.length >= 2 && corrData.matrix.length <= 15) {
    const n = corrData.matrix.length;
    const stocks = corrData.pairs.length > 0 ? null : []; // pairs에서 이름 추출
    const names = [];
    // stocksData가 없으므로 pairs에서 유니크한 이름 추출
    const nameSet = new Set();
    if (corrData.pairs) {
      for (const p of corrData.pairs) {
        if (!nameSet.has(p.a.idx)) { nameSet.add(p.a.idx); names[p.a.idx] = p.a.name; }
        if (!nameSet.has(p.b.idx)) { nameSet.add(p.b.idx); names[p.b.idx] = p.b.name; }
      }
    }

    const cellSize = Math.min(24, Math.floor(260 / n));
    html += `<div style="margin-bottom:8px"><div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:4px">상관 히트맵</div>`;
    html += `<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:8px">`;
    // 헤더
    html += '<tr><td></td>';
    for (let j = 0; j < n; j++) {
      const nm = (names[j] || '').slice(0, 3);
      html += `<td style="width:${cellSize}px;text-align:center;color:var(--text3);padding:1px;font-size:7px;writing-mode:vertical-rl">${nm}</td>`;
    }
    html += '</tr>';
    for (let i = 0; i < n; i++) {
      html += `<tr><td style="text-align:right;padding-right:3px;color:var(--text3);font-size:7px;white-space:nowrap">${(names[i] || '').slice(0, 4)}</td>`;
      for (let j = 0; j < n; j++) {
        const v = corrData.matrix[i][j];
        let bg = '#9e9e9e33';
        if (v === 1) bg = '#4caf5066';
        else if (v !== null) {
          const abs = Math.abs(v);
          if (v > 0) bg = abs > 0.7 ? '#f4433666' : abs > 0.4 ? '#ff980044' : '#4caf5022';
          else bg = abs > 0.4 ? '#2196f366' : '#2196f322';
        }
        const txt = v === 1 ? '1' : v !== null ? v.toFixed(1) : '-';
        html += `<td style="width:${cellSize}px;height:${cellSize}px;text-align:center;background:${bg};border:1px solid var(--border);font-size:7px;color:var(--text)">${txt}</td>`;
      }
      html += '</tr>';
    }
    html += '</table></div></div>';
  }

  // 클러스터 경고
  if (g.clusterTexts.length > 0) {
    html += `<div style="margin-bottom:6px">`;
    html += g.clusterTexts.map(t => `<div style="font-size:10px;padding:4px 8px;border-radius:6px;background:#f443361a;margin-bottom:3px;color:var(--text2)">${t}</div>`).join('');
    html += '</div>';
  }

  // 경고
  if (g.warningTexts.length > 0) {
    html += g.warningTexts.map(t => `<div style="font-size:10px;padding:2px 0;color:var(--text2)">${t}</div>`).join('');
  }

  // 섹터 분포
  if (g.sectorText) {
    html += `<div style="font-size:10px;padding:6px 8px;border-radius:6px;background:var(--surface2);margin-top:6px;color:var(--text2)">[참고] ${g.sectorText}</div>`;
  }

  // [S359] 섹터 분포 상세 — 종목→업종 매칭 검증
  if (g.sectorBreakdown && g.sectorBreakdown.length) {
    html += `<div style="font-size:10px;padding:6px 8px;border-radius:6px;background:var(--surface2);margin-top:6px;color:var(--text3)">`;
    html += `<div style="font-weight:700;margin-bottom:3px;color:var(--text2)">🏭 섹터 분포</div>`;
    html += g.sectorBreakdown.map(t => `<div style="padding:1px 0;line-height:1.4">· ${t}</div>`).join('');
    html += `</div>`;
  }

  // 제안
  if (g.suggestionTexts.length > 0) {
    html += `<div style="margin-top:6px">`;
    html += g.suggestionTexts.map(t => `<div style="font-size:10px;padding:2px 0;color:var(--accent)">${t}</div>`).join('');
    html += '</div>';
  }

  html += '</div></div>';
  return html;
}

// S73: 포트폴리오 진단 전체 렌더 (섹터 레이더 + 상관/분산)
function renderPortfolioDiagnosis(containerId, radarGuide, corrGuide, corrData) {
  const el = document.getElementById(containerId);
  if (!el) return;
  let html = '';
  if (radarGuide) html += renderSectorRadarCard(radarGuide);
  if (corrGuide) html += renderCorrelationCard(corrGuide, corrData);
  if (!html) html = '<div style="padding:20px;text-align:center;font-size:11px;color:var(--text3)">진단 데이터를 로딩 중...</div>';
  el.innerHTML = html;
}

async function saveAnalResult(){
  if(!currentAnalStock) return;
  let indicators = currentAnalStock._indicators || null;
  if(!indicators){
    try{
      const candles = await fetchCandles(currentAnalStock.code, (currentMarket==='kr' && window._kisEnabled) ? 500 : 200, _analTF);
      if(candles && candles.length>=20) indicators = calcIndicators(candles, _analTF);
    }catch(e){}
  }
  const scores = indicators ? calcEnhancedScores(currentAnalStock, indicators) : calcBasicScores(currentAnalStock);
  const result = {
    code: currentAnalStock.code,
    name: currentAnalStock.name,
    scores,
    timestamp: Date.now(),
  };
  try{
    const saved = JSON.parse(localStorage.getItem(KEYS.ANAL_RESULTS)||'[]');
    const idx = saved.findIndex(r=>r.code===result.code);
    if(idx>=0) saved[idx] = result;
    else saved.unshift(result);
    if(saved.length>50) saved.length = 50;
    localStorage.setItem(KEYS.ANAL_RESULTS, JSON.stringify(saved));
    
  }catch(e){}
}

// ══════════════════════════════════════════════════════════════
//  S99-3: Phase C-1 — 분석탭 멀티TF 시스템
// ══════════════════════════════════════════════════════════════

// TF칩 렌더링
function _renderAnalTfChips(){
  const wrap = document.getElementById('analTfChips');
  if(!wrap) return;
  const mkt = currentMarket || 'kr';
  const tfs = (typeof ANAL_TF_MAP !== 'undefined' ? ANAL_TF_MAP[mkt] : null) || [{k:'day',l:'일봉'}];
  // _analTF가 현재 시장에서 유효한지 확인
  if(!tfs.find(t=>t.k===_analTF)) _analTF = 'day';
  let h = '';
  tfs.forEach(t => {
    // KIS 미연결 시 60분 비활성
    const disabled = (mkt==='kr' && t.k==='60m' && !window._kisEnabled);
    const active = (t.k === _analTF);
    const cacheHit = _analTFCache[t.k];
    // [S357] 캐시된 TF의 5분류 컬러동그라미 표시 (verdict 아이콘 → 지표분포 5분류 dot로 교체)
    // [S478] 백그라운드 로딩 중이면 회전 ↻ (캐시 채워지면 dot으로 교체). @keyframes spin(sx_screener.html:765) 재사용
    // [S480] 실제 사용 봉수(diag) 표기 — rows 길이. 데이터가 어디까지 반영됐는지 가시화(예: 일봉 600 / 주봉 200).
    let icon = '';
    const _loading = !cacheHit && window._mtfLoadingTfs && window._mtfLoadingTfs.has(t.k);
    if(_loading){
      icon = `<span class="atf-icon" title="상위 TF 로딩 중" style="display:inline-block;animation:spin .8s linear infinite">↻</span>`;
    } else if(cacheHit){
      const _bars = (cacheHit.rows && cacheHit.rows.length) ? cacheHit.rows.length : null;
      const _barTxt = _bars != null ? `<span class="atf-bars" style="font-size:8px;opacity:.6;margin-left:3px;font-weight:600">${_bars}</span>` : '';
      const _dot = (cacheHit.dist5) ? `<span class="atf-icon" title="${cacheHit.dist5.label}">${cacheHit.dist5.dot}</span>` : '';
      icon = `${_barTxt}${_dot}`;
    }
    h += `<div class="anal-tf-chip${active?' active':''}${disabled?' disabled':''}" onclick="${disabled?'':`_setAnalTF('${t.k}')`}">${t.l}${icon}</div>`;
  });
  wrap.innerHTML = h;
  // [S357] 현재 TF의 5분류 동그라미
  const vEl = document.getElementById('analTfVerdict');
  if(vEl){
    const cur = _analTFCache[_analTF];
    vEl.textContent = (cur && cur.dist5) ? cur.dist5.dot : '';
  }
}

// TF 전환 핸들러
function _setAnalTF(tf){
  if(!tf || tf === _analTF) return;
  _sxVib(10); // S103-fix5: 분석탭 TF 칩 전환
  _analTF = tf;
  // [S354] SX_ANAL_TF 저장 폐기 — 분석탭은 항상 일봉으로 시작(마지막 TF 복원 안 함)
  _renderAnalTfChips();

  const stock = currentAnalStock;
  if(!stock) return;

  // [S350] TF 칩 변경 시 첫 종목분석 진입처럼 완전 재분석 — 캐시 복원(_restoreFromTfCache) 폐기.
  //   배경: 기존엔 _analTFCache(백그라운드 200봉)를 복원해서 다음 문제가 누적됐음.
  //     ① 봉수 부족: 첫 진입 TF는 600봉 확장되는데 칩 전환 TF는 200봉 캐시만 복원
  //     ② _lastAnalCandles 재사용(runAnalysis L763): 이전 TF 캔들을 그대로 써서 데이터 혼선
  //     ③ 해석/부문점수 고정: 캐시 복원이라 TF별 재계산 안 됨 (국내/해외 주봉·월봉 동일 증상 포함)
  //     ④ 단일검증 BT 고정: 캐시 복원은 runAnalysis(L597 _btResult 리셋)를 안 타서 옛 BT 잔류
  //   해결: 캔들/확장단계/BT/모멘텀/판정 메타를 모두 리셋하고 runAnalysis로 600봉 fresh 재분석.
  //         → 첫 진입과 100% 동일 경로 (사용자 제안). 모든 TF·시장 공통 적용.
  stock._lastAnalCandles = null;          // 이전 TF 캔들 무효화 → 새 TF로 fresh fetch
  stock._analCandlesExtendedStage = 0;    // 확장 단계 리셋 → 600봉 재확장 작동
  stock._analCandlesExtended = false;     // 하위 호환 플래그 리셋
  stock._scoreMomentum = null;            // 이전 TF 모멘텀 잔류 방지
  stock._svVerdict = null;
  document.getElementById('analBody').innerHTML = `<div class="anal-loading"><div class="spinner"></div><br>TF 전환 중...</div>`;
  runAnalysis(stock);
}

// 멀티TF 백그라운드 fetch (기본 TF 외)
async function _fetchMultiTfBackground(stock){
  if(!stock) return;
  const mkt = currentMarket || 'kr';
  const tfs = (typeof ANAL_TF_MAP !== 'undefined' ? ANAL_TF_MAP[mkt] : null) || [{k:'day',l:'일봉'}];
  const count = (mkt==='kr' && window._kisEnabled) ? 500 : 200;

  // 기본 TF는 runAnalysis에서 처리하므로 제외
  const otherTfs = tfs.filter(t => t.k !== _analTF && !(mkt==='kr' && t.k==='60m' && !window._kisEnabled));

  // [S478] 로딩 ↻ 표시 — 실제 fetch 대상(캐시 만료/없음)만 로딩셋 등록 후 칩 즉시 갱신. 캐시 유효 TF는 이미 dot이므로 제외.
  const _toLoad = otherTfs.filter(t => { const e = _analTFCache[t.k]; return !(e && Date.now() - e.timestamp < 14400000); });
  window._mtfLoadingTfs = new Set(_toLoad.map(t => t.k));
  if(typeof _renderAnalTfChips === 'function') _renderAnalTfChips();

  const promises = otherTfs.map(async (t) => {
    try {
      // 캐시 유효하면 스킵
      const existing = _analTFCache[t.k];
      if(existing && Date.now() - existing.timestamp < 14400000) return;

      const candles = await fetchCandles(stock.code, count, t.k);
      if(!candles || candles.length < 20) return;

      const indicators = calcIndicators(candles, t.k);
      if(!indicators || !indicators._advanced) return;

      const qs = scrQuickScore(indicators._advanced.rows, t.k, currentMarket);
      const rawRows = candles.map(c=>({date:c.date,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}));

      // BT
      let btResult = null, btScore = null, btState = null;
      if(typeof SXE!=='undefined' && SXE.runBtEngine && rawRows.length >= 60){
        const _btP = typeof btGetParams === 'function' ? btGetParams() : {};
        // [S221] applyRegimeAdjust:true 명시 — 단일검증/스캐너와 동일 정책으로 정합 회복.
        const btR = SXE.runBtEngine(rawRows, t.k, _btP, { applyRegimeAdjust: true });
        if(btR && !btR.error){
          try{ btR._regimeBuckets = (typeof _btRegimeBreakdown==='function')?_btRegimeBreakdown(rawRows, btR.trades):null; }catch(_rg){} // [S546] 레짐 버킷 (tf캐시 저장→복원 유지)
          btResult = btR;
          btScore = (typeof calcBtScore === 'function') ? calcBtScore(btR) : null;
          const _cp = candles[candles.length-1]?.close || stock.price || 0;
          btState = (typeof btGetCurrentState === 'function') ? btGetCurrentState(btR, _cp) : null;
        }
      }

      // v2.0: 4축 룰 + 모멘텀 보정
      let scoreMom = null, svJudge = null, svVerdict = null;
      if(typeof SXE!=='undefined' && SXE.scoreMomentum && rawRows.length >= 80){
        scoreMom = SXE.scoreMomentum(rawRows, t.k, 5);
      }
      const _btStateKey = btState ? (btState.state==='holding' && btState._isBuySignal ? 'buy_signal' : btState.state==='holding' ? 'holding' : btState.state==='sell_signal' ? 'sell_signal' : 'waiting') : 'waiting';
      if(typeof SXC !== 'undefined' && typeof SXC.unifiedVerdictV2 === 'function'){
        const _scores4 = {
          readyScore: qs ? (qs.readyScore ?? 0) : 0,
          entryScore: qs ? (qs.entryScore ?? 0) : 0,
          trendScore: qs ? (qs.trendScore ?? qs.score ?? 0) : 0,
          upsideScore: qs ? (qs.upsideScore ?? 0) : 0,        // [S357] 추가상승
          maAlignBull: qs ? (qs.maAlignBull === true) : false, // [S357] 정배열 여부
          btScore:    btScore != null ? btScore : 0,
          safetyViol: qs && Array.isArray(qs._safetyViol) ? qs._safetyViol : [] // [S426] 안전필터 위반 → C 캡/익절힌트
        };
        const _btStForVerdict = btState ? Object.assign({}, btState, {
          currentPrice: stock.price,
          winRate: btResult ? btResult.winRate : null,
          totalTrades: btResult ? btResult.totalTrades : null
        }) : null;
        svVerdict = SXC.unifiedVerdictV2(_btStateKey, _scores4, scoreMom, _btStForVerdict);
      }

      // 캐시 저장
      _analTFCache[t.k] = {
        rows: candles, indicators, qs, scoreMom, 
        btResult, btScore, btState,
        svJudge, svVerdict,
        // [S357] 해당 TF의 5분류(전광판 지표분포) — 칩 컬러동그라미 배지용
        dist5: _computeDist5(stock, indicators, qs, scoreMom, btScore, t.k),
        // [S349] 백그라운드 계산 TF 메타 — 복원 시 _canReuse가 정확한 TF로 판정 (opts/params는
        //   해당 BT 실행 파라미터 기록; opts 미지정분은 단일검증서 재확인되어 안전)
        btResultTF: t.k,
        btResultParams: (typeof btGetParams === 'function') ? (function(){ const _p=btGetParams(); return {buyTh:_p.buyTh, sellTh:_p.sellTh, tpMult:_p.tpMult, slMult:_p.slMult}; })() : null,
        timestamp: Date.now()
      };

      // [S478] 이 TF 로딩 완료 → 로딩셋에서 제거 (↻ → 5분류 dot)
      if(window._mtfLoadingTfs) window._mtfLoadingTfs.delete(t.k);
      // TF칩 아이콘 즉시 업데이트
      _renderAnalTfChips();
    } catch(e){
      if(window._mtfLoadingTfs) window._mtfLoadingTfs.delete(t.k);   // [S478] 실패해도 ↻ 제거(무한 회전 방지)
      try{ _renderAnalTfChips(); }catch(_){}
      console.warn('[multiTF bg]', t.k, e);
    }
  });

  await Promise.allSettled(promises);
  // [S478] 안전: 잔여 ↻ 정리 — candles 부족 등 early-return으로 delete 누락된 TF의 로딩 표시 제거
  if(window._mtfLoadingTfs && window._mtfLoadingTfs.size){ window._mtfLoadingTfs.clear(); if(typeof _renderAnalTfChips === 'function') _renderAnalTfChips(); }
  // [S394] MTF 자동갱신 — 주/월 dist5가 _analTFCache에 모두 채워진 뒤 전광판 1회 재렌더 → MTF 재계산 반영
  //   (첫 렌더는 가용 TF만 반영되므로, 백그라운드 수집 완료 시점에 일·주·월 정합 MTF로 갱신)
  try{
    const _sb = document.getElementById('sxScoreBoard');
    if(_sb && window._sxBoard){ const _wo = _sb.classList.contains('sxb-open'); _sb.innerHTML = _sxbHTML(); if(_wo) _sb.classList.add('sxb-open'); }
  }catch(_eMtf){}
}

// runAnalysis 완료 후 현재 TF 결과를 캐시에 저장
function _saveCurrentTfCache(stock, indicators, qs, scoreMom, btResult, btScore, btState, svJudge, svVerdict){
  _analTFCache[_analTF] = {
    rows: (indicators && indicators._advanced) ? indicators._advanced.rows : null,
    indicators, qs, scoreMom,
    btResult, btScore, btState,
    svJudge, svVerdict,
    // [S357] 현재 TF의 5분류(전광판 지표분포) — 칩 컬러동그라미 배지용 (분석탭 전광판과 동일 체인)
    dist5: _computeDist5(stock, indicators, qs, scoreMom, btScore, _analTF),
    // [S349] BT 메타 저장 — 캐시 복원 시 단일검증 _canReuse 판정 정확성 보장
    btResultTF: stock._btResultTF,
    btResultOpts: stock._btResultOpts,
    btResultParams: stock._btResultParams,
    timestamp: Date.now()
  };
  _renderAnalTfChips(); // 아이콘 업데이트
}

// 캐시에서 복원하여 렌더
function _restoreFromTfCache(stock, cached, tf){
  // stock 객체에 캐시 데이터 반영
  stock._btResult = cached.btResult;
  stock._btScore = cached.btScore;
  stock._btState = cached.btState;
  stock._scoreMomentum = cached.scoreMom;
  stock._svVerdict = cached.svVerdict;
  // [S349] BT 결과 TF/옵션/파라미터 메타 갱신 — 단일검증·교차검증의 _canReuse 판정이
  //   stale한 _btResultTF를 보고 "한쪽만 반영"되던 버그 수정. cached에 있으면 복원, 없으면 tf로 폴백.
  stock._btResultTF = cached.btResultTF || tf || _analTF;
  if(cached.btResultOpts) stock._btResultOpts = cached.btResultOpts;
  if(cached.btResultParams) stock._btResultParams = cached.btResultParams;

  // BT action 계산
  // S103-fix7 Phase3-B-2: 점수 기반 es×bs 4분류 폐기 → C(_svVerdict.action) 매핑
  //   진단 결과 14종목 14/14 정합 실패 확정으로 C 기반 매핑만 사용
  if(cached.svVerdict && cached.svVerdict.action){
    stock._btAction = SXC.mapVerdictToBtAction(cached.svVerdict.action);
  } else {
    stock._btAction = null; // C 없으면 null (레거시 fallback 하지 않음 — 정합 우선)
  }

  const scores = (typeof calcEnhancedScores === 'function') ? calcEnhancedScores(stock, cached.indicators) : null;
  const sectorItp = (typeof SXI!=='undefined') ? SXI.sectorScores(scores, stock, cached.indicators) : null;
  const maAlignItp = (typeof SXI!=='undefined' && cached.indicators) ? SXI.maAlignment(cached.indicators) : null;
  const basicItp = (typeof SXI!=='undefined') ? SXI.basicInfo(stock) : null;

  renderAnalysisResult(stock, scores, cached.indicators, cached.qs, new Date(), sectorItp, maAlignItp, basicItp);
}


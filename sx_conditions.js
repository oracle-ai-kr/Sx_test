// ════════════════════════════════════════════════════════════
//  SIGNAL X — Conditions & Presets v2.3
//  Phase 2: 기술분석 (캔들+지표 엔진)
//  Phase 3: 검증 분석 (BT + 엔진 판정)
//  의존: currentMarket (글로벌)
// ════════════════════════════════════════════════════════════
const SX_PHASES = [
  {id:'p1', name:'기본 필터', label:'기본 필터', desc:'시장/시세/재무 기반 조건 선택',   icon:'🏗️', color:'#4a90d9'},
  {id:'p2', name:'기술 분석', label:'기술 분석', desc:'캔들+지표 엔진 기반 정밀 분석',   icon:'📊', color:'#e8a838'},
  {id:'p3', name:'검증 분석', label:'검증 분석', desc:'BT + 엔진 판정으로 최종 검증',     icon:'🎯', color:'#50c878'},
];

// S164: P2(기술 분석) 서브그룹 — UI에서 공격/준비/방어/환경 4그룹으로 시각 구분
const SX_P2_GROUPS = [
  {id:'attack',  label:'공격', icon:'⚔️', color:'#e74c3c', desc:'진입 기회 포착 (추세·눌림목·반등·돌파·캔들)'},
  {id:'prep',    label:'준비', icon:'🎯', color:'#e8a838', desc:'진입 전 관찰 (변동성·매집·갭 지지)'},
  {id:'defense', label:'방어', icon:'🛡️', color:'#4a90d9', desc:'리스크 회피 (추격방어·횡보회피·극단변동성·위험감지)'},
  {id:'env',     label:'환경', icon:'🌐', color:'#9b59b6', desc:'시장 환경 조건부 (강세장·약세장)'},
];

// ════════════════════════════════════════════════════════════
//  국내주식 (KR) 조건 트리
// ════════════════════════════════════════════════════════════
const SX_CONDITIONS = [
  // ── Phase 1: 기본 필터 ──
  {id:'scope',name:'범위지정',phase:'p1',groups:[
    {id:'scope_market',name:'시장/업종',conditions:[
      {id:'sector',name:'업종 선택',type:'multi_select',options:['반도체','2차전지','바이오','자동차','IT/소프트웨어','금융','건설','화학','철강','유통','식품','엔터','게임','통신','에너지','기계','운송','섬유/의복','의료정밀','전기전자'],default:[],source:'krx_stock_list'},
    ]},
    {id:'scope_exclude',name:'제외 조건',conditions:[
      // 종목 유형 제외: 이름·시장 패턴으로 판별 가능한 5종 (DART 조회 불필요)
      //   관리종목/거래정지/정리매매/투자경고/불성실공시 등은 'disclosure_filter'로 통합 처리
      //   단기과열·초저유동성은 데이터 소스 부재로 미지원 (추후 추가 가능)
      //   〔이력〕 [통합정리] 12개 옵션 중 9개가 처리 코드 누락으로 무시되던 문제 → 5종으로 정리됨
      {id:'exclude_types',name:'종목 유형 제외',type:'multi_check',options:[
        {id:'preferred',name:'우선주',default:true},
        {id:'etf',name:'ETF',default:true},
        {id:'etn',name:'ETN',default:true},
        {id:'spac',name:'스팩(SPAC)',default:true},
        {id:'reits',name:'리츠(REITs)',default:false},
      ],source:'local',desc:'종목명·시장 정보로 즉시 제외 (DART 조회 불필요)'},
      // disclosure_filter: 강도 3단계
      //   - critical: 상폐/파산/거래정지 등 7종 (항상 ON, 사용자 보호)
      //   - severe:   관리종목/자본잠식 등 9종 (기본 ON, 권장)
      //   - warning:  투자경고/소송 등 12종 (선택)
      //   호재(POSITIVE)는 절대 제외되지 않음 (점수에만 반영)
      //   〔이력〕 [통합정리] 단순 토글 → 강도 3단계로 확장 (정책 세분화)
      {id:'disclosure_filter',name:'공시 기반 제외 (DART)',type:'multi_check',options:[
        {id:'critical',name:'치명 공시 (상폐·파산·거래정지)',default:true},
        {id:'severe',name:'위험 공시 (관리종목·자본잠식·감자)',default:true},
        {id:'warning',name:'경고 공시 (투자경고·소송·횡령)',default:false},
      ],source:'dart_disclosure',desc:'DART 공시 키워드 기반 자동 제외 — 키워드 상세 관리는 [설정] 탭'},
    ]},
    {id:'scope_basic',name:'기본 정보',conditions:[
      // [S341] 최근 N봉 메타조건 — 기술분석/패턴 조건의 평가 윈도우. 내필터 항상 최상단 고정·삭제 불가.
      //   [S590] 기본값 1~3봉 (오늘 기준) — 3시장(KR/US/COIN) 공통 통일. (기존 KR/US 1~5 → 코인과 동일하게)
      //   처리: sx_scan_worker.js에서 id 명시 체크로 메타조건 추출 (카테고리 위치 무관)
      {id:'_recent_n_bars',name:'최근 N봉',type:'range',unit:'봉',min:1,max:60,default:{min:1,max:3},source:'calc_candle',desc:'조건 평가 대상 범위. MA 크로스: N봉 사이 어딘가에 교차 발생 (오늘=N2, 일주일=N7~10, 한달=N20~25). 그 외 조건: N봉 중 한 봉이라도 동시 충족 시 통과',recommend:'1~3 (오늘) / 5~10 (일주일) / 20~25 (한 달)'},
      {id:'market_cap',name:'시가총액',type:'range',unit:'억원',min:0,max:5000000,default:{min:100,max:null},source:'krx_market_cap',desc:'기업 규모 - 작을수록 변동성 큼, 클수록 안정적',recommend:'1,000~10,000 (중형) / 10,000↑ (대형)'},
    ]},
  ]},
  {id:'price_analysis',name:'시세분석',phase:'p1',groups:[
    {id:'price_cond',name:'가격 조건',conditions:[
      {id:'price_range',name:'현재가 범위',type:'range',unit:'원',min:0,max:10000000,default:{min:1000,max:500000},source:'kis_price',desc:'주가 범위 제한 - 저가주/우량주 등 분리 검색 시 활용',recommend:'1,000~50,000 (저가주) / 50,000↑ (중고가주)'},
      {id:'change_rate',name:'전일대비 등락률',type:'range',unit:'%',min:-30,max:30,default:{min:null,max:null},source:'kis_price',desc:'오늘 등락률 - 양수=상승 종목, 음수=하락 종목',recommend:'3↑ (상승) / 5↑ (강한 상승) / -3↓ (하락)'},
      {id:'intraday_range',name:'당일 변동폭',type:'range',unit:'%',min:0,max:30,default:{min:null,max:null},source:'calc_candle',desc:'(고가-저가)/전일종가 - 당일 변동성 크기'},
      {id:'period_change',name:'N일간 주가변동폭',type:'range',unit:'%',min:-80,max:200,default:{min:null,max:null},source:'calc_candle',desc:'5일간 등락률 - 단기 추세 강도'},
      {id:'gap_type',name:'갭 발생',type:'select',options:['설정안함','상승갭 종목','하락갭 종목','갭상승 후 지지','갭하락 후 저항','상승갭 제외'],default:'설정안함',source:'calc_candle',desc:'시가갭 발생 여부 (상승갭 제외 = 오늘 상승갭 발생 종목 회피)'},
      {id:'new_high_low',name:'신고가/신저가',type:'select',options:['설정안함','52주 신고가','52주 신저가','연중 신고가','연중 신저가','20일 신고가','20일 신저가'],default:'설정안함',source:'calc_candle',desc:'52주/연중/20일 신고가/신저가 발생 여부'},
    ]},
    {id:'volume_cond',name:'거래량/거래대금',conditions:[
      {id:'volume_min',name:'거래량 (당일)',type:'range',unit:'주',min:0,max:null,default:{min:50000,max:null},source:'kis_price',desc:'오늘 거래된 주식 수 - 작으면 거래 부진',recommend:'50,000↑ (활발) / 500,000↑ (매우 활발)'},
      {id:'trade_amount',name:'거래대금',type:'range',unit:'백만원',min:0,max:null,default:{min:500,max:null},source:'kis_price',desc:'오늘 거래된 금액 - 시장 관심도 지표 (높을수록 활발)',recommend:'1,000↑ (10억) / 10,000↑ (100억, 시장 주도주)'},
      {id:'volume_avg20_ratio',name:'20일 평균 대비 거래량',type:'range',unit:'%',min:0,max:10000,default:{min:null,max:null},source:'calc_candle',desc:'당일거래량÷20일평균×100 - 200%↑=거래 폭발',recommend:'150↑ (관심 발생) / 200↑ (거래 폭발)'},
      {id:'volume_consec_inc',name:'거래량 연속 증가',type:'range',unit:'봉',min:0,max:30,default:{min:null,max:null},source:'calc_candle',desc:'최근 N봉 연속 거래량 증가 (5봉↑=강한 매수세)'},
    ]},
    {id:'realtime_cond',name:'실시간 시세 [KIS]',kisRequired:true,conditions:[
      {id:'bid_ask_ratio',name:'매도매수잔량비',type:'range',unit:'%',min:0,max:500,default:{min:null,max:null},source:'kis_orderbook',desc:'매수잔량÷매도잔량×100 (100%↑=매수 우세, 100%↓=매도 우세)',recommend:'100↑ (매수 우세) / 150↑ (강한 매수)',kisRequired:true},
      {id:'total_bid_qty',name:'총 매수잔량',type:'range',unit:'주',min:0,max:null,default:{min:null,max:null},source:'kis_orderbook',desc:'사겠다고 대기 중인 주식 수 - 클수록 매수 의지 강함',recommend:'10,000↑ (관심) / 100,000↑ (강한 관심)',kisRequired:true},
      {id:'total_ask_qty',name:'총 매도잔량',type:'range',unit:'주',min:0,max:null,default:{min:null,max:null},source:'kis_orderbook',desc:'팔겠다고 대기 중인 주식 수 - 클수록 매도 압박 강함',recommend:'10,000↑ (매도 압박) / 100,000↑ (강한 매도 압박)',kisRequired:true},
      {id:'trade_strength',name:'체결강도',type:'range',unit:'%',min:0,max:300,default:{min:null,max:null},source:'kis_conclusion',desc:'매수체결÷매도체결×100 (약세장 평균 35~45%, 강세장 55~70%)',recommend:'100↑ (매수 우세) / 120↑ (강세) / 150↑ (매우 강세)',kisRequired:true},
      {id:'buy_ratio',name:'매수비율',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'kis_conclusion',desc:'전체 체결 중 매수 비중 - 50% 초과=매수 우세',recommend:'50↑ (매수 우세) / 60↑ (강한 매수)',kisRequired:true},
    ]},
    {id:'intraday_cond',name:'당일 분봉 [KIS]',kisRequired:true,conditions:[
      {id:'intraday_high_break',name:'당일 전고점 돌파',type:'select',options:['설정안함','돌파','미돌파'],default:'설정안함',source:'kis_minute',desc:'당일 신고가 갱신 종목 - 매수세가 강해 추가 상승 가능성',kisRequired:true},
      {id:'intraday_vwap_pos',name:'분봉 VWAP 위치',type:'select',options:['설정안함','VWAP 위','VWAP 아래'],default:'설정안함',source:'kis_minute',desc:'평균 거래가격 대비 위치 - 위=매수 평균 우위, 아래=매도 평균 우위',kisRequired:true},
      {id:'program_realtime',name:'개인 실시간 순매수',type:'range',unit:'백만원',min:null,max:null,default:{min:null,max:null},source:'kis_program',kisRequired:true,desc:'개인 투자자 순매수 금액 - 양수=개인 매수 우세 (호구잡힘 주의)',recommend:'100↑ (개인 매수) / -100↓ (개인 매도)'},
    ]},
  ]},
  {id:'ranking',name:'순위분석',phase:'p1',groups:[
    {id:'rank_price',name:'시세 순위',conditions:[
      {id:'rank_volume',name:'거래량 상위',type:'range',unit:'위',min:1,max:500,default:{min:null,max:null},source:'krx_market_cap',desc:'거래량 기준 상위 종목 - 거래 활발한 종목 추출',recommend:'1~30위 (매우 활발) / 1~100위 (활발)'},
      {id:'rank_trade_amount',name:'거래대금 상위',type:'range',unit:'위',min:1,max:500,default:{min:null,max:null},source:'krx_market_cap',desc:'거래대금 기준 상위 종목 - 시장 관심 집중 종목',recommend:'1~30위 (시장 주도주) / 1~100위 (관심 종목)'},
      {id:'rank_market_cap',name:'시가총액 상위',type:'range',unit:'위',min:1,max:2000,default:{min:null,max:null},source:'krx_market_cap',desc:'시가총액 기준 상위 종목 - 대형주/중형주 분리',recommend:'1~50위 (대형주) / 1~200위 (중대형주)'},
    ]},
  ]},
  // ── Phase 2: 엔진 기반 ──
  {id:'technical',name:'기술적분석',phase:'p2',groups:[
    {id:'ta_ma',name:'이동평균선',conditions:[
      {id:'price_vs_ma',name:'MA 대비 가격',type:'select',options:['설정안함','MA5 위','MA5 아래','MA20 위','MA20 아래','MA60 위','MA60 아래','MA120 위','MA120 아래'],default:'설정안함',source:'calc_candle',desc:'현재가의 이동평균선 대비 위치 - MA60↑=중기 추세 위'},
      {id:'ma_arrangement',name:'MA 배열',type:'select',options:['설정안함','정배열 (3개)','정배열 (4개)','역배열 (3개)','역배열 (4개)'],default:'설정안함',source:'calc_candle',desc:'단기>중기>장기 순서 - 정배열=상승추세, 역배열=하락추세 (4개=더 강한 신호)'},
    ]},
    {id:'ta_trend',name:'추세지표',conditions:[
      {id:'macd_signal',name:'MACD 시그널',type:'select',options:['설정안함','MACD > Signal (매수)','MACD < Signal (매도)'],default:'설정안함',source:'calc_candle',desc:'MACD vs 시그널선 현재 상태 - 매수=상승 모멘텀 유지. cross는 골든크로스 폴더의 gc_macd 참조'},
      {id:'adx_value',name:'ADX (추세강도)',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추세의 강도 (방향 무관) - 25↑=추세 형성, 40↑=강한 추세, 20↓=횡보',recommend:'25↑ (추세 형성) / 40↑ (강한 추세)'},
      {id:'parabolic_sar',name:'Parabolic SAR',type:'select',options:['설정안함','SAR 아래 (상승 추세)','SAR 위 (하락 추세)'],default:'설정안함',source:'calc_candle',desc:'추세 추종 지표 - SAR 아래=상승, SAR 위=하락 (포지션 청산 신호)'},
      {id:'eom_trend',name:'EOM (이동용이도)',type:'select',options:['설정안함','매수세 (상승)','매도세 (하락)'],default:'설정안함',source:'calc_candle',desc:'가격 움직임의 용이도 - 거래량 대비 가격 변동 (양수=쉽게 상승)'},
      {id:'vhf_state',name:'VHF (추세판별)',type:'select',options:['설정안함','추세장 (>0.4)','횡보장 (<0.3)','보통'],default:'설정안함',source:'calc_candle',desc:'추세 vs 횡보 판별 - 추세장=방향성 매매, 횡보장=박스권 매매'},
    ]},
    {id:'ta_momentum',name:'모멘텀지표',conditions:[
      {id:'rsi_value',name:'RSI',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'상대강도지수 - 30↓=과매도(매수기회), 70↑=과매수(매도기회), 50=중립',recommend:'30↓ (과매도 반등) / 70↑ (과매수 경고)'},
      {id:'rs_value',name:'RS (시장대비 강도)',type:'range',unit:'%p',min:-50,max:50,default:{min:null,max:null},source:'calc_candle',desc:'상대강도(RSI 아님) - 시장지수 대비 20일 상대수익률. 양수=시장 아웃퍼폼(강세), +5%p↑=상대강세. 일봉만 평가',recommend:'+5%p↑ (시장 대비 강세)'},  // [S441] RS 조건검색 항목
      {id:'stoch_k',name:'Stochastic %K',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'스토캐스틱 - 20↓=과매도, 80↑=과매수 (RSI보다 민감)',recommend:'20↓ (과매도) / 80↑ (과매수)'},
      {id:'stoch_cross',name:'Stochastic 크로스',type:'select',options:['설정안함','%K > %D (매수)','%K < %D (매도)'],default:'설정안함',source:'calc_candle',desc:'스토캐스틱 신호선 비교 현재 상태. cross는 골든크로스 폴더의 gc_stoch 참조'},
      {id:'cci_value',name:'CCI',type:'range',unit:'',min:-300,max:300,default:{min:null,max:null},source:'calc_candle',desc:'상품채널지수 - +100↑=강세, -100↓=약세, ±200=극단',recommend:'-100↓ (약세 반등) / +100↑ (강세 추종)'},
      {id:'mfi_value',name:'MFI',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'자금흐름지표 - RSI에 거래량 가중 (20↓=매수, 80↑=매도)',recommend:'20↓ (매수 기회) / 80↑ (매도 신호)'},
      {id:'psycho_value',name:'심리도',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'12일 중 상승일 비율 - 25↓=과매도, 75↑=과매수',recommend:'25↓ (과매도) / 75↑ (과매수)'},
      {id:'new_psycho_value',name:'신심리도',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'EMA 보정 심리도 - 기존 심리도보다 부드러운 신호',recommend:'25↓ (과매도) / 75↑ (과매수)'},
      {id:'ab_ratio_trend',name:'AB Ratio',type:'select',options:['설정안함','매수세 우위 (A>B)','매도세 우위 (A<B)','균형'],default:'설정안함',source:'calc_candle',desc:'고가-시가 vs 시가-저가 - 매수세 우위=장중 강세'},
      {id:'chaikin_osc',name:'Chaikin Oscillator',type:'select',options:['설정안함','양수 (매집)','음수 (분산)'],default:'설정안함',source:'calc_candle',desc:'A/D선 모멘텀 - 양수=세력 매집중, 음수=분산중'},
    ]},
    {id:'ta_channel',name:'채널/밴드',conditions:[
      {id:'bb_position',name:'볼린저 밴드 위치',type:'select',options:['설정안함','상단 돌파','상단 근접','중심선 위','중심선 아래','하단 근접','하단 이탈'],default:'설정안함',source:'calc_candle',desc:'BB 위치 - 상단=강세/과매수, 하단=약세/과매도, 돌파=추세 강화'},
      {id:'bb_width',name:'볼린저 밴드 폭',type:'select',options:['설정안함','스퀴즈 (수축)','확장중'],default:'설정안함',source:'calc_candle',desc:'BB 폭 - 스퀴즈=변동성 폭발 임박, 확장중=추세 진행'},
      {id:'band_pctb',name:'Band %b',type:'range',unit:'',min:-0.5,max:1.5,default:{min:null,max:null},source:'calc_candle',desc:'BB 내 위치 (0=하단, 0.5=중심, 1=상단)',recommend:'0↓ (하단 이탈) / 1↑ (상단 돌파)'},
      {id:'envelope_position',name:'엔벨로프 위치',type:'select',options:['설정안함','상단 돌파','상단 근접','중심선 위','중심선 아래','하단 근접','하단 이탈'],default:'설정안함',source:'calc_candle',desc:'고정 % 채널 위치 - BB와 유사하나 변동성 무관'},
      {id:'pivot_level',name:'피봇 레벨',type:'select',options:['설정안함','R2 이상','R1~R2','P~R1','S1~P','S1~S2','S2 이하'],default:'설정안함',source:'calc_candle',desc:'전일 H/L/C 기반 지지/저항 - R=저항, S=지지, P=피봇'},
      {id:'price_channel',name:'가격채널 (N일)',type:'select',options:['설정안함','상단 돌파','상단 반','하단 반','하단 이탈'],default:'설정안함',source:'calc_candle',desc:'N일 최고/최저가 채널 - 상단 돌파=신고가, 하단 이탈=신저가'},
      {id:'ma_disparity',name:'MA 이격도',type:'select',options:['설정안함','MA20 +5%↑ 과열','MA20 -5%↓ 침체','MA60 +10%↑ 과열','MA60 -10%↓ 침체','MA20 근접 (±2%)','MA60 근접 (±2%)'],default:'설정안함',source:'calc_candle',desc:'이동평균선 대비 거리 - 과열=조정 가능, 침체=반등 가능, 근접=추세 추종'},
      {id:'recent_high_proximity',name:'최근 N봉 고점 근접도',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'현재가÷최근N봉 고가×100. 95%↑=고점 근접 → max 90~95로 설정 시 추격 방어. N봉수는 _recent_n_bars(기본 20봉)에서 조정',recommend:'~90 (고점 추격 방어) / 95↑ (신고가 돌파)'},
      {id:'recent_n_change',name:'최근 N봉 대비 상승률',type:'range',unit:'%',min:-50,max:100,default:{min:null,max:null},source:'calc_candle',desc:'(현재가-N봉전 시작가)÷N봉전×100. max 15~25% 설정 시 단기 급등 추격 방어. N봉수는 _recent_n_bars(기본 5봉)에서 조정',recommend:'~15 (단기 급등 방어) / 20↑ (강한 모멘텀)'},
    ]},
    {id:'ta_ichimoku',name:'일목균형표',conditions:[
      {id:'ichimoku_cloud',name:'구름 위치',type:'select',options:['설정안함','구름 위 (강세)','구름 안 (중립)','구름 아래 (약세)'],default:'설정안함',source:'calc_candle',desc:'가격 vs 구름대 - 구름 위=강세 추세, 안=불확실, 아래=약세'},
      {id:'ichimoku_twist',name:'구름 전환',type:'select',options:['설정안함','양운 전환 (상승)','음운 전환 (하락)'],default:'설정안함',source:'calc_candle',desc:'미래 구름 색상 변화 - 양운 전환=대전환 신호, 음운 전환=하락 신호'},
    ]},
    {id:'ta_volume',name:'거래량 지표',conditions:[
      {id:'obv_trend',name:'OBV 추세',type:'select',options:['설정안함','상승 추세','하락 추세','OBV 다이버전스 (가격↓ OBV↑)'],default:'설정안함',source:'calc_candle',desc:'누적 거래량 - OBV 다이버전스=세력 매집 신호 (강력)'},
      {id:'volume_ma_arr',name:'거래량 MA 배열',type:'select',options:['설정안함','거래량 정배열','거래량 역배열'],default:'설정안함',source:'calc_candle',desc:'거래량 추세 - 정배열=관심 증가, 역배열=관심 감소'},
      {id:'ad_trend',name:'A/D선 추세',type:'select',options:['설정안함','상승 추세','하락 추세','다이버전스 (가격↓ AD↑)'],default:'설정안함',source:'calc_candle',desc:'누적 분산선 - 다이버전스=가격 하락에도 매집 (반전 신호)'},
    ]},
    {id:'ta_momentum_ext',name:'모멘텀 확장',conditions:[
      {id:'trix_signal',name:'TRIX',type:'select',options:['설정안함','TRIX > Signal (매수)','TRIX < Signal (매도)','TRIX > 0 (상승추세)','TRIX < 0 (하락추세)'],default:'설정안함',source:'calc_candle',desc:'TRIX(15) 현재 상태 - vs Signal(SMA9) 또는 vs 0선. cross는 골든크로스 폴더의 gc_trix 참조'},
      {id:'macd_osc_trend',name:'MACD Oscillator',type:'select',options:['설정안함','상승 가속','상승','하락','하락 가속'],default:'설정안함',source:'calc_candle',desc:'MACD-Signal 모멘텀 추이 - 상승 가속=강한 매수, 하락 가속=강한 매도'},
      {id:'price_osc_value',name:'Price Oscillator',type:'select',options:['설정안함','양수 (상승추세)','음수 (하락추세)'],default:'설정안함',source:'calc_candle',desc:'단기-장기 MA 차이 - MACD와 유사하나 % 표시'},
    ]},
    {id:'ta_other',name:'기타 지표',conditions:[
      {id:'demark_setup',name:'Demark TD Setup',type:'select',options:['설정안함','매수셋업 ≥9 (하락소진)','매도셋업 ≥9 (상승소진)','매수셋업 진행중','매도셋업 진행중'],default:'설정안함',source:'calc_candle',desc:'TD Sequential 추세소진 - 9 완성=반전 임박 (매수/매도 정점)'},
      {id:'three_line_break',name:'삼선전환도',type:'select',options:['설정안함','상승 전환','하락 전환','상승 지속','하락 지속'],default:'설정안함',source:'calc_candle',desc:'Three Line Break - 전환=추세 변경 시점, 지속=현재 추세 유지'},
      {id:'binary_wave',name:'Binary Wave',type:'select',options:['설정안함','풀 매수 (5/5)','강한 매수 (4/5)','풀 매도 (0/5)','강한 매도 (1/5)'],default:'설정안함',source:'calc_candle',desc:'5개 지표 합산 - 풀 매수=모든 지표 매수 신호'},
      {id:'sonar_trend',name:'Sonar 모멘텀',type:'select',options:['설정안함','가속 (단기>장기)','감속 (단기<장기)'],default:'설정안함',source:'calc_candle',desc:'단기/장기 모멘텀 비교 - 가속=상승 추세 시작, 감속=하락 추세 시작'},
      {id:'mass_index',name:'Mass Index',type:'select',options:['설정안함','Reversal Bulge (반전신호)','Setup (MI>27)','안정 (MI<26.5)'],default:'설정안함',source:'calc_candle',desc:'변동성 확장/수축 - Reversal Bulge=반전 임박 강력 신호'},
      {id:'vwap_position',name:'VWAP 위치',type:'select',options:['설정안함','VWAP 위 (강세)','VWAP 근처 (±1%)','VWAP 아래 (약세)'],default:'설정안함',source:'calc_candle',desc:'거래량 가중 평균가 - 위=매수 평균 우위, 아래=매도 평균 우위 (기관 기준선)'},
      {id:'swing_structure',name:'구조 패턴 (HH/HL)',type:'select',options:['설정안함','Higher High (고점 상승)','HH+HL (상승구조)','Lower Low (저점 하락)'],default:'설정안함',source:'calc_candle',desc:'스윙 구조 - HH+HL=상승 추세 확정, LL=하락 추세'},
    ]},
  ]},
  // [S317→S318] 골든크로스 — 모든 보조지표 N봉 윈도우 크로스를 한곳에 통합
  //   윈도우 의미: 시작점(N봉 전)에서 A≤B, 현재 봉에서 A>B → 그 사이에 교차 발생
  //   N 추출: _recent_n_bars.max (기본 2 = 직전봉→현재봉)
  //   외부 슬라이드 가드: 워커가 gc_* 감지 시 outer Nactual=1 강제
  //   [S318] 변경 — 기존 기술적분석의 cross 옵션을 모두 흡수:
  //     ma_cross(5×20, 20×60), stoch_slow_cross, ichimoku_cross 항목 완전 이전
  //     macd_signal/stoch_cross/eom_trend/chaikin_osc/trix_signal의 cross 옵션 이전
  {id:'goldencross',name:'골든크로스',phase:'p2',groups:[
    {id:'gc_trend',name:'추세 크로스 (MA/밴드/일목)',conditions:[
      {id:'gc_ma_5_20',name:'MA(5) × MA(20)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'단기 MA(5) × 중기 MA(20) - 최근 N봉 안에 교차. 단기 추세 전환 신호'},
      {id:'gc_ma_5_60',name:'MA(5) × MA(60)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'단기 MA(5) × 장기 MA(60) - 최근 N봉 안에 교차. 단기-장기 추세 전환 (강한 신호)'},
      {id:'gc_ma_20_60',name:'MA(20) × MA(60)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'중기 MA(20) × 장기 MA(60) - 최근 N봉 안에 교차. 중장기 추세 전환'},
      {id:'gc_ema_20_200',name:'EMA(20) × EMA(200)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'EMA(20) × EMA(200) 장기 추세 전환 — 국내 KIS ON(500봉) 전용. ⚡KIS off/해외/코인은 EMA(20)×EMA(120) 사용'},
      {id:'gc_ema_20_120',name:'EMA(20) × EMA(120)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'EMA(20) × EMA(120) 중장기 추세 전환(≈6개월선) — 최근 N봉 안에 교차. 200봉에서 동작, KIS off·해외·코인 공용 (EMA200 경량판)'},
      {id:'gc_bb',name:'MA(단기) × BB중심(SMA)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'단기 MA × BB 중심선(SMA) - 최근 N봉 안에 교차. 시장 자동: KR=MA5×SMA14, COIN=MA5×SMA9, US=MA5×SMA20',recommend:'골든크로스 (단기 추세 BB 돌파)'},
      {id:'gc_ichimoku',name:'일목 전환선(9) × 기준선(26)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'일목균형표 전환선 × 기준선 - 최근 N봉 안에 교차. 단기/중기 신호 전환'},
    ]},
    {id:'gc_oscillator',name:'오실레이터 크로스',conditions:[
      {id:'gc_rsi',name:'RSI(14) × Signal(EMA9)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'RSI(14) vs EMA9(RSI) - 최근 N봉 안에 교차. N봉은 위 "최근 N봉" 메타조건에서 조정 (기본 2봉=직전→현재)',recommend:'골든크로스 (모멘텀 전환 시작)'},
      {id:'gc_macd',name:'MACD(12,26) × Signal(EMA9)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'MACD line(EMA12-EMA26) vs Signal(EMA9) - 최근 N봉 안에 교차',recommend:'골든크로스 (추세 전환 표준 신호)'},
      {id:'gc_stoch',name:'Stoch %K(14) × %D(3)',type:'select',options:['설정안함','골든크로스','데드크로스','골든크로스 (과매도권 %K<30)','데드크로스 (과매수권 %K>70)'],default:'설정안함',source:'calc_candle',desc:'%K(14) vs %D(3) - 최근 N봉 안에 교차. 과매도권/과매수권 옵션은 끝 시점 %K 위치 조건 추가 (강한 반전 신호)',recommend:'골든크로스 (과매도권) (강한 매수 신호)'},
      {id:'gc_stoch_slow',name:'Stoch Slow %K(14,3) × %D(3)',type:'select',options:['설정안함','골든크로스','데드크로스','골든크로스 (과매도권 %K<30)','데드크로스 (과매수권 %K>70)'],default:'설정안함',source:'calc_candle',desc:'Stochastic Slow (3봉 평활화) %K × %D - 최근 N봉 안에 교차. 일반 Stoch보다 부드러운 신호'},
      {id:'gc_dmi',name:'DMI(14) +DI × -DI',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'+DI(14) vs -DI(14) - 최근 N봉 안에 교차 (방향선 전환)',recommend:'골든크로스 (상승 방향 우위 전환)'},
      {id:'gc_cci',name:'CCI(20) × 0선',type:'select',options:['설정안함','골든크로스 (0선 상향)','데드크로스 (0선 하향)'],default:'설정안함',source:'calc_candle',desc:'CCI(20) 0선 교차 - 최근 N봉 안에 발생',recommend:'골든크로스 (0선 상향) (강세 진입)'},
      {id:'gc_mfi',name:'MFI(14) × 50선',type:'select',options:['설정안함','골든크로스 (50선 상향)','데드크로스 (50선 하향)'],default:'설정안함',source:'calc_candle',desc:'MFI(14) 50선 교차 - 최근 N봉 안에 (자금흐름 전환)',recommend:'골든크로스 (50선 상향) (자금 유입 전환)'},
      {id:'gc_trix',name:'TRIX(15) 크로스',type:'select',options:['설정안함','0선 골든크로스','0선 데드크로스','Signal 골든크로스','Signal 데드크로스'],default:'설정안함',source:'calc_candle',desc:'TRIX(15) - 0선 교차(=양수/음수 전환) 또는 Signal(SMA9 of TRIX) 교차. 최근 N봉 안에. 3중 EMA, 노이즈 적은 추세 전환',recommend:'0선 골든크로스 (장기 추세 전환)'},
    ]},
    {id:'gc_volume',name:'거래량/추세 보조 크로스',conditions:[
      {id:'gc_eom',name:'EOM(14) × 0선',type:'select',options:['설정안함','골든크로스 (0선 상향)','데드크로스 (0선 하향)'],default:'설정안함',source:'calc_candle',desc:'EOM(14) 0선 교차 - 최근 N봉 안에. 거래량 대비 가격 움직임 용이도 전환'},
      {id:'gc_obv',name:'OBV × Signal(SMA20)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'OBV vs SMA20(OBV) - 최근 N봉 안에 교차 (거래량 누적선 전환)',recommend:'골든크로스 (매집 전환)'},
      {id:'gc_chaikin',name:'Chaikin Osc(3,10) × 0선',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'Chaikin Oscillator(EMA3-EMA10 of A/D) 0선 교차 - 최근 N봉 안에',recommend:'골든크로스 (매집-분산 전환)'},
    ]},
  ]},
  {id:'pattern',name:'패턴분석',phase:'p2',groups:[
    {id:'pat_basic',name:'기본 캔들',conditions:[
      {id:'candle_type',name:'캔들 유형',type:'multi_check',options:[
        {id:'long_yang',name:'장대양봉'},{id:'long_eum',name:'장대음봉'},{id:'doji',name:'도지 (십자)'},
        {id:'hammer',name:'해머 (망치)'},{id:'shooting_star',name:'슈팅스타'},{id:'spinning_top',name:'스피닝 탑'},
        {id:'inside_day',name:'인사이드데이'},{id:'outside_day',name:'아웃사이드데이'},
        {id:'gravestone_doji',name:'그레이브스톤 도지'},{id:'dragonfly_doji',name:'드래곤플라이 도지'},
        {id:'marubozu_bull',name:'양봉 마루보즈'},{id:'marubozu_bear',name:'음봉 마루보즈'},
        {id:'high_wave',name:'하이웨이브 캔들'},
      ],source:'calc_candle'},
    ]},
    {id:'pat_reversal',name:'반전 패턴',conditions:[
      {id:'reversal_pattern',name:'반전 패턴',type:'multi_check',options:[
        {id:'morning_star',name:'모닝스타 (상승반전)'},{id:'evening_star',name:'이브닝스타 (하락반전)'},
        {id:'bullish_engulfing',name:'상승장악형'},{id:'bearish_engulfing',name:'하락장악형'},
        {id:'harami_bull',name:'하라미 상승'},{id:'harami_bear',name:'하라미 하락'},{id:'harami_cross',name:'하라미크로스'},
        {id:'piercing',name:'관통형 (상승)'},{id:'dark_cloud',name:'흑운형 (하락)'},
        {id:'tweezer_bottom',name:'집게바닥'},{id:'tweezer_top',name:'집게천정'},
        {id:'bullish_counterattack',name:'상승 카운터어택'},{id:'bearish_counterattack',name:'하락 카운터어택'},
        {id:'morning_doji_star',name:'모닝 도지 스타'},{id:'evening_doji_star',name:'이브닝 도지 스타'},
        {id:'abandoned_baby_bull',name:'어밴던드 베이비 (상승)'},{id:'abandoned_baby_bear',name:'어밴던드 베이비 (하락)'},
      ],source:'calc_candle'},
    ]},
    {id:'pat_continuation',name:'지속 패턴',conditions:[
      {id:'continuation_pattern',name:'지속 패턴',type:'multi_check',options:[
        {id:'three_white',name:'적삼병 (상승지속)'},{id:'three_black',name:'흑삼병 (하락지속)'},
        {id:'gap_up',name:'상승 갭'},{id:'gap_down',name:'하락 갭'},
        {id:'advance_block',name:'어드밴스 블럭'},{id:'stalled_pattern',name:'스톨드 패턴'},
        {id:'upside_gap_tasuki',name:'업사이드갭 태스키'},{id:'downside_gap_tasuki',name:'다운사이드갭 태스키'},
      ],source:'calc_candle'},
    ]},
    {id:'pat_transition',name:'캔들 전이 (실험)',conditions:[
      {id:'candle_transition',name:'캔들 전이 신호',type:'multi_check',options:[
        {id:'trans_bull',name:'양봉 전이 유망'},{id:'trans_bear',name:'음봉 전이 유망'},
      ],source:'calc_candle'},
    ]},
  ]},
  {id:'market_env',name:'시장환경',phase:'p2',groups:[
    {id:'env_state',name:'시장 상태',conditions:[
      {id:'mkt_env_state',name:'시장 환경',type:'select',options:['설정안함','강세 포함 (mild_bull+bull)','강세 (bull)','약세강세 (mild_bull)','중립 (neutral)','약세약세 (mild_bear)','약세 (bear)','약세 포함 (mild_bear+bear)'],default:'설정안함',source:'oracle_index',desc:'KOSPI/KOSDAQ 종합 - 강세장만 매수, 약세장 회피용 (2개 국내 지수 평균 등락률로 판정)'},
    ]},
    {id:'env_index',name:'지수 등락률',conditions:[
      {id:'mkt_env_kospi_chg',name:'KOSPI 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index',desc:'당일 KOSPI 등락률 - 시장 흐름에 맞춰 매매 시점 판단',recommend:'0↑ (상승 시) / -1↓ (하락 시)'},
      {id:'mkt_env_kosdaq_chg',name:'KOSDAQ 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index',desc:'당일 KOSDAQ 등락률 - 중소형주 시장 흐름',recommend:'0↑ (상승 시) / -1↓ (하락 시)'},
    ]},
  ]},
  // ── Phase 3: 검증 분석 ──
  {id:'engine_verdict',name:'엔진 판정',phase:'p3',groups:[
    {id:'ta_signal',name:'분석 판정',conditions:[
      {axis4:true,id:'score_range',name:'추세 방향 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추세 방향 0~100 (분석탭 "추세 방향") - 50↑=상승, 70↑=강한 상승',recommend:'50↑ (상승 추세) / 70↑ (강한 상승)'},
      {axis4:true,id:'_ready_score',name:'반등 준비 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'반등 준비 0~100 (과매도+수축+눌림) - 50↑=신호 발현 시작',recommend:'50↑ (반등 준비) / 70↑ (강한 신호)'},
      {axis4:true,id:'_entry_score',name:'반등 전환 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'반등 전환 0~100 (RSI반등+MACD전환) - 진입 타이밍 판단',recommend:'50↑ (진입 가능) / 70↑ (강력 진입)'},
      {axis4:true,id:'_upside_score',name:'추가 상승 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추가 상승 0~100 (정배열+돌파+수급) - 추세 추격 여력, 50↑=여력, 70↑=강한 추격',recommend:'50↑ (추격 여력) / 70↑ (강한 추격)'},
      // [S585] 분석탭 전광판 '추세·구조' 도넛 3종 — 4축 아님(일반 점수형). 워커 s._indicators(=분석탭 indicators)에서 도넛과 동일 공식으로 평가.
      {id:'_adx_score',name:'추세강도(ADX)',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추세강도 0~100 (분석탭 "추세강도" 도넛 = ADX값) - 25↑=추세 형성, 40↑=매우 강한 추세. 횡보(낮음)에선 추세추종 비효율',recommend:'25↑ (추세 형성) / 40↑ (강한 추세)'},
      {id:'_struct_pos',name:'구조위치',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'구조위치 0~100 (분석탭 "구조위치" 도넛 = 최근 고/저점 구간 내 현재가 위치) - 낮을수록 저점 근접(눌림 후보), 높을수록 고점 근접(과열 주의)',recommend:'~35 (저점 근접·눌림) / 40~70 (추세 중단)'},
      {id:'_rs_score',name:'상대강도(RS)',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'상대강도 0~100 (분석탭 "상대강도" 도넛 = 시장지수 대비 20일 초과수익 50+rs20×2.5) - 50=시장과 동일, 50↑=아웃퍼폼. ※일봉 전용(주/월봉·지수 미가용 시 평가 제외→결과 빠짐)',recommend:'55↑ (시장 대비 강세) / 65↑ (뚜렷한 아웃퍼폼)'},
      {id:'_safety_clean',name:'안전필터 클린',type:'select',options:['설정안함','클린 (0개)','1개 이하','2개 이하'],default:'설정안함',source:'calc_candle',desc:'안전필터 미충족 사유 개수 - 클린=함정 위험 없음 (가장 안전)'},
      {id:'_dump_warn',name:'되돌림주의 제외',type:'select',options:['설정안함','되돌림주의 제외'],default:'설정안함',source:'calc_candle',desc:'헤더 ⚠️되돌림주의 배지와 동일 판정 — 투매(대금급증≥65+가격하락+OBV이탈) 또는 천정위험(RSI/OBV 약세 다이버전스·과열 급등) 종목을 결과에서 제외',recommend:'되돌림주의 제외 → 추격 위험·자금 이탈 구간 종목을 걸러냄'},
      {id:'_regime_label',name:'시장 레짐',type:'select',options:['설정안함','추세장','횡보장','추세+변동','전환기'],default:'설정안함',source:'calc_candle',desc:'ADX+BB폭 기반 - 추세장=방향 매매, 횡보장=박스권 매매'},
      {id:'_squeeze',name:'BB 스퀴즈',type:'select',options:['설정안함','스퀴즈 중','스퀴즈 아님'],default:'설정안함',source:'calc_candle',desc:'볼린저밴드 수축 상태 - 스퀴즈=변동성 폭발 임박 (큰 움직임 예고)'},
      {id:'_rsi_div',name:'RSI 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔RSI 괴리 - 강세 다이버전스=상승 반전 신호 (강력)'},
      {id:'_obv_div',name:'OBV 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔OBV 괴리 - 거래량 기반 반전 신호 (RSI보다 강력)'},
      {id:'_pullback_score',name:'눌림목 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'눌림목 매수 적합도 - 상승추세 중 일시 조정 종목 발견',recommend:'50↑ (눌림목 후보) / 70↑ (강력 눌림목)'},
      {id:'_recipe_detect',name:'레시피 감지 🎯',type:'select',options:['설정안함','발동(겹침1+)','순수발동','겹침3+','겹침4+'],default:'설정안함',source:'calc_candle',desc:'레시피(재료패턴) 발동 종목 스캔 - 순수=fake 미동반(혼재없음)·겹침N=동시발동 레시피 수. 정밀 신호감지 필터.'},
      {axis4:true,id:'_dir_mom',name:'방향 전이',type:'select',options:['설정안함','상승 전이중','하락 전이중','횡보'],default:'설정안함',source:'calc_candle',desc:'A분석 모멘텀 방향 - 상승 전이중=함정 진입 방어 효과'},
      {axis4:'buy',id:'_c_buy_marker',name:'매수마커 ▲',type:'select',options:['설정안함','매수마커 있음'],default:'설정안함',source:'calc_candle',desc:'보라 마커 ▲ — 설정탭 차트마커 교차선택(보라 A/C)을 따름. A=진입타이밍(qs.action=BUY) / C=감독관 안전제동 판정. 분석탭 차트 보라 ▲와 동일(S591). 안전필터 🔒 위반 시 자동 제외(깨끗한 매수만).',recommend:'매수마커 있음 → 분석엔진 매수 후보 (안전필터 통과)'},
    ]},
    {id:'pat_trend',name:'단기추세 매매 (실험)',conditions:[
      {id:'trend_cross',name:'단기추세 신호 (MA 크로스)',type:'trend_cross',source:'calc_candle',desc:'단기 MA × 장기 MA 크로스 직접 탐색. 매수=골든크로스 / 매도=데드크로스, 각각 단기×장기 봉수 입력 (분석탭 단기추세매매와 맞춤). 기본 5×9'},
      {id:'knn_dday',name:'kNN 크로스 임박 (D-day)',type:'select',options:['설정안함','골든크로스 임박','데드크로스 임박'],default:'설정안함',source:'calc_candle',desc:'kNN+MA수렴으로 골든/데드 크로스가 3봉 내 임박(과거 유사패턴 적중 50%↑)한 종목. 분석탭 단기추세 D-day와 동일 엔진 · MA는 단기추세매매 설정(cfg.s×cfg.l) 동기화 · 룩어헤드 차단. [S633/S634]',recommend:'골든크로스 임박 → 곧 진입 신호 나올 후보 선점'},
    ]},
  ]},
  {id:'backtest',name:'백테스트',phase:'p3',groups:[
    {id:'ta_bt',name:'백테스트 (실시간)',conditions:[
      {id:'_bt_score',name:'매매전략 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'BT 종합 점수 (수익률+승률+MDD+PF) - 60↑=양호, 80↑=우수',recommend:'60↑ (양호) / 80↑ (우수)'},
      {id:'_bt_pnl',name:'BT 수익률',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'calc_candle',desc:'200봉 백테스트 총수익률 - 0↑=수익, 10↑=양호',recommend:'10↑ (양호) / 30↑ (우수)'},
      {id:'_bt_winrate',name:'BT 승률',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'승리 거래 비율 - 50↑=절반 이상 승, 60↑=양호',recommend:'50↑ (균형) / 60↑ (양호)'},
      {id:'_bt_trades',name:'BT 거래수',type:'range',unit:'회',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'총 청산 거래 수 - 너무 적으면 통계 신뢰성 ↓',recommend:'5↑ (최소 신뢰) / 10↑ (안정 통계)'},
      {id:'_bt_mdd',name:'BT MDD',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'최대 낙폭 절대값 - 작을수록 안정 (max로 사용)',recommend:'~15 (안정) / ~25 (보통)'},
      {id:'_bt_pf',name:'BT 손익비',type:'range',unit:'',min:0,max:10,default:{min:null,max:null},source:'calc_candle',desc:'총수익/총손실 비율 - 1↑=수익 우세, 1.5↑=양호, 2↑=우수',recommend:'1.5↑ (양호) / 2↑ (우수)'},
      {id:'_bt_action',name:'종합행동지침',type:'select',options:['설정안함','매수','관심','관망','회피','보유 유지','청산 준비','청산 검토','즉시 청산','매도 완료'],default:'설정안함',source:'calc_candle',desc:'C로직 9종 판정 (A분석 × B매매전략 교차) - 매수=강력 진입, 관심=주시'},
      {axis4:'buy',id:'_bt_buy_marker',name:'BT 매수마커',type:'select',options:['설정안함','매수마커 있음'],default:'설정안함',source:'calc_candle',desc:'BT엔진이 오늘 매수 신호를 낸 종목 - 차트에 ▲마커 표시된 상태 (_isBuySignal=true)',recommend:'매수마커 있음 → 당일 신규 매수 진입 신호 종목만 필터'},
      {axis4:'buy',id:'_bt_today_entry',name:'오늘 매수진입',type:'select',options:['설정안함','오늘 진입'],default:'설정안하',source:'calc_candle',desc:'BT엔진이 오늘 실제 매수 진입한 종목 (_isBuySignal=true) - BT 매수마커보다 엄격한 필터',recommend:'오늘 진입 → 실시간 BT 매수 신호 종목만 필터 (매수마커의 하위집합)'},
    ]},
  ]},
];

// ════════════════════════════════════════════════════════════
//  코인 조건 트리
// ════════════════════════════════════════════════════════════
const COIN_CONDITIONS = [
  // ── Phase 1 ──
  {id:'scope',name:'범위지정',phase:'p1',groups:[
    {id:'scope_basic',name:'기본 정보',conditions:[
      // [S341] 최근 N봉 메타조건 — 기술분석/패턴 조건의 평가 윈도우. 내필터 항상 최상단 고정·삭제 불가.
      //   COIN 기본값 1~3봉 (4시간 봉 = 12시간 윈도우). 일봉으로 전환 시에도 동일.
      {id:'_recent_n_bars',name:'최근 N봉',type:'range',unit:'봉',min:1,max:60,default:{min:1,max:3},source:'calc_candle',desc:'조건 평가 대상 범위. MA 크로스: N봉 사이 어딘가에 교차 발생 (오늘=N2, 일주일=N7~10, 한달=N20~25). 그 외 조건: N봉 중 한 봉이라도 동시 충족 시 통과',recommend:'1~3 (오늘) / 5~10 (일주일) / 20~25 (한 달)'},
      {id:'market_cap',name:'시가총액',type:'range',unit:'억원',min:0,max:null,default:{min:null,max:null},source:'upbit_ticker'},
      // [v3.17 DEDUP-FIX] 코인 거래대금: 24h 거래대금(volume_cond)으로 일원화
      //   코인은 24시간 시장 → "당일 거래대금" = "24시간 거래대금" 동일 개념
      //   (KR은 일중 거래시간이 한정적이라 trade_amount 유지가 맞음 — 코인만 적용)
      //   〔이력〕 이전: scope_basic의 'trade_amount' + volume_cond의 'trade_amount_24h' 두 조건이
      //     같은 데이터(s.tradeAmount)를 검사하여 사용자 혼란 야기 (sx_scan_worker.js L770/L772)
      //     → scope_basic의 trade_amount 제거하여 일원화 (수정됨)
    ]},
  ]},
  {id:'price_analysis',name:'시세분석',phase:'p1',groups:[
    {id:'price_cond',name:'가격 조건',conditions:[
      {id:'change_rate',name:'전일대비 등락률',type:'range',unit:'%',min:-50,max:50,default:{min:null,max:null},source:'upbit_ticker'},
      {id:'price_range',name:'현재가 범위',type:'range',unit:'원',min:0,max:null,default:{min:null,max:null},source:'upbit_ticker'},
      // S161-2: 코인 방어 프리셋(추격매수/극단변동성)용 조건 추가 — KR과 스펙 동일, 범위만 코인 변동성 반영
      {id:'consecutive_up_down',name:'연속 상승/하락',type:'range',unit:'일',min:-20,max:20,default:{min:null,max:null},source:'calc_candle',desc:'양수=상승, 음수=하락'},
      {id:'gap_type',name:'갭 발생',type:'select',options:['설정안함','상승갭 종목','하락갭 종목','갭상승 후 지지','갭하락 후 저항','상승갭 제외'],default:'설정안함',source:'calc_candle',desc:'시가갭 발생 여부 (상승갭 제외 = 오늘 상승갭 발생 종목 회피)'},
      {id:'new_high_low',name:'신고가/신저가',type:'select',options:['설정안함','52주 신고가','52주 신저가','연중 신고가','연중 신저가','20일 신고가','20일 신저가'],default:'설정안함',source:'calc_candle',desc:'52주/연중/20일 신고가/신저가 발생 여부'},
      {id:'intraday_range',name:'당일 변동폭',type:'range',unit:'%',min:0,max:50,default:{min:null,max:null},source:'calc_candle',desc:'(고가-저가)/전일종가 — 코인은 변동성 큼'},
      {id:'period_change',name:'N일간 주가변동폭',type:'range',unit:'%',min:-80,max:300,default:{min:null,max:null},source:'calc_candle',desc:'5일간 등락률'},
    ]},
    {id:'volume_cond',name:'거래량',conditions:[
      {id:'volume_prev_ratio',name:'전일대비 거래량 비율',type:'range',unit:'%',min:0,max:10000,default:{min:null,max:null},source:'upbit_ticker'},
      {id:'trade_amount_24h',name:'24h 거래대금',type:'range',unit:'백만원',min:0,max:null,default:{min:null,max:null},source:'upbit_ticker'},
      {id:'volume_consec_inc',name:'거래량 연속 증가',type:'range',unit:'봉',min:0,max:30,default:{min:null,max:null},source:'calc_candle',desc:'최근 N봉 연속 거래량 증가 (5봉↑=강한 매수세)'},
      // S161-2: 기존 프리셋(강세장 공격/매집 감지/급등 시작 등)이 참조하지만 UI 누락이었던 조건 추가
      {id:'volume_avg20_ratio',name:'20일 평균 대비 거래량',type:'range',unit:'%',min:0,max:10000,default:{min:null,max:null},source:'calc_candle',desc:'당일거래량÷20일평균×100'},
      {id:'volume_consec_inc',name:'거래량 연속 증가',type:'range',unit:'봉',min:0,max:30,default:{min:null,max:null},source:'calc_candle',desc:'최근 N봉 연속 거래량 증가 (5봉↑=강한 매수세)'},
    ]},
  ]},
  // [정리] 코인 재무분석 카테고리 미지원 (PER/PBR/ROE/배당수익률은 암호화폐에 존재하지 않는 개념)
  //   향후 코인 특화 지표(시총 순위/유통량/도미넌스 등) 도입 시 재추가 예정
  //   〔이력〕 2026-05 이전: 정의는 있었으나 데이터 소스(yahoo_fundamental)가 한국/미국 주식 전용 →
  //     코인에서 사용 시 rangeCheck(null,...)=false → 모든 코인 탈락하던 버그 (제거됨)
  // ── Phase 2 ──
  {id:'technical',name:'기술적분석',phase:'p2',groups:[
    {id:'ta_ma',name:'이동평균선',conditions:[
      {id:'price_vs_ma',name:'MA 대비 가격',type:'select',options:['설정안함','MA5 위','MA5 아래','MA20 위','MA20 아래','MA60 위','MA60 아래','MA120 위','MA120 아래'],default:'설정안함',source:'calc_candle',desc:'현재가의 이동평균선 대비 위치 - MA60↑=중기 추세 위'},
      {id:'ma_arrangement',name:'MA 배열',type:'select',options:['설정안함','정배열 (3개)','정배열 (4개)','역배열 (3개)','역배열 (4개)'],default:'설정안함',source:'calc_candle',desc:'단기>중기>장기 순서 - 정배열=상승추세, 역배열=하락추세 (4개=더 강한 신호)'},
      {id:'ma_disparity',name:'MA 이격도',type:'select',options:['설정안함','MA20 +5%↑ 과열','MA20 -5%↓ 침체','MA60 +10%↑ 과열','MA60 -10%↓ 침체','MA20 근접 (±2%)','MA60 근접 (±2%)'],default:'설정안함',source:'calc_candle',desc:'이동평균선 대비 거리 - 과열=조정 가능, 침체=반등 가능, 근접=추세 추종'},
    ]},
    {id:'ta_trend',name:'추세지표',conditions:[
      {id:'macd_signal',name:'MACD 시그널',type:'select',options:['설정안함','MACD > Signal (매수)','MACD < Signal (매도)'],default:'설정안함',source:'calc_candle',desc:'MACD vs 시그널선 현재 상태 - 매수=상승 모멘텀 유지. cross는 골든크로스 폴더의 gc_macd 참조'},
      {id:'adx_value',name:'ADX (추세강도)',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추세의 강도 (방향 무관) - 25↑=추세 형성, 40↑=강한 추세, 20↓=횡보',recommend:'25↑ (추세 형성) / 40↑ (강한 추세)'},
      {id:'parabolic_sar',name:'Parabolic SAR',type:'select',options:['설정안함','SAR 아래 (상승 추세)','SAR 위 (하락 추세)'],default:'설정안함',source:'calc_candle',desc:'추세 추종 지표 - SAR 아래=상승, SAR 위=하락 (포지션 청산 신호)'},
      {id:'eom_trend',name:'EOM (이동용이도)',type:'select',options:['설정안함','매수세 (상승)','매도세 (하락)'],default:'설정안함',source:'calc_candle',desc:'가격 움직임의 용이도 - 거래량 대비 가격 변동 (양수=쉽게 상승)'},
      {id:'vhf_state',name:'VHF (추세판별)',type:'select',options:['설정안함','추세장 (>0.4)','횡보장 (<0.3)','보통'],default:'설정안함',source:'calc_candle',desc:'추세 vs 횡보 판별 - 추세장=방향성 매매, 횡보장=박스권 매매'},
    ]},
    {id:'ta_momentum',name:'모멘텀지표',conditions:[
      {id:'rsi_value',name:'RSI',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'상대강도지수 - 30↓=과매도(매수기회), 70↑=과매수(매도기회), 50=중립',recommend:'30↓ (과매도 반등) / 70↑ (과매수 경고)'},
      {id:'rs_value',name:'RS (BTC대비 강도)',type:'range',unit:'%p',min:-50,max:50,default:{min:null,max:null},source:'calc_candle',desc:'상대강도(RSI 아님) - BTC 대비 20일 상대수익률. 양수=BTC 아웃퍼폼(강세). BTC 자체는 0. 일봉만 평가',recommend:'+5%p↑ (BTC 대비 강세)'},  // [S441] RS 조건검색 항목(코인=BTC대비)
      {id:'stoch_k',name:'Stochastic %K',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'스토캐스틱 - 20↓=과매도, 80↑=과매수 (RSI보다 민감)',recommend:'20↓ (과매도) / 80↑ (과매수)'},
      {id:'psycho_value',name:'심리도',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'12일 중 상승일 비율 - 25↓=과매도, 75↑=과매수',recommend:'25↓ (과매도) / 75↑ (과매수)'},
      {id:'ab_ratio_trend',name:'AB Ratio',type:'select',options:['설정안함','매수세 우위 (A>B)','매도세 우위 (A<B)','균형'],default:'설정안함',source:'calc_candle',desc:'고가-시가 vs 시가-저가 - 매수세 우위=장중 강세'},
      {id:'chaikin_osc',name:'Chaikin Oscillator',type:'select',options:['설정안함','양수 (매집)','음수 (분산)'],default:'설정안함',source:'calc_candle',desc:'A/D선 모멘텀 - 양수=세력 매집중, 음수=분산중'},
    ]},
    {id:'ta_channel',name:'채널/밴드',conditions:[
      {id:'bb_position',name:'볼린저 밴드 위치',type:'select',options:['설정안함','상단 돌파','상단 근접','중심선 위','중심선 아래','하단 근접','하단 이탈'],default:'설정안함',source:'calc_candle',desc:'BB 위치 - 상단=강세/과매수, 하단=약세/과매도, 돌파=추세 강화'},
      {id:'band_pctb',name:'Band %b',type:'range',unit:'',min:-0.5,max:1.5,default:{min:null,max:null},source:'calc_candle',desc:'BB 내 위치 (0=하단, 0.5=중심, 1=상단)',recommend:'0↓ (하단 이탈) / 1↑ (상단 돌파)'},
      // S161-2: p2_coin_squeeze 프리셋이 참조하던 UI 누락 조건 추가
      {id:'bb_width',name:'볼린저 밴드 폭',type:'select',options:['설정안함','스퀴즈 (수축)','확장중'],default:'설정안함',source:'calc_candle',desc:'BB 폭 - 스퀴즈=변동성 폭발 임박, 확장중=추세 진행'},
      // [v3.10] 신규 안전 가드 — BT 진입 게이트와 동기화 (KR과 동일 정의)
      {id:'recent_high_proximity',name:'최근 N봉 고점 근접도',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'현재가÷최근N봉 고가×100. 95%↑=고점 근접 → max 90~95로 설정 시 추격 방어. N봉수는 _recent_n_bars(기본 20봉)에서 조정',recommend:'~90 (고점 추격 방어) / 95↑ (신고가 돌파)'},
      {id:'recent_n_change',name:'최근 N봉 대비 상승률',type:'range',unit:'%',min:-50,max:100,default:{min:null,max:null},source:'calc_candle',desc:'(현재가-N봉전 시작가)÷N봉전×100. max 15~25% 설정 시 단기 급등 추격 방어. N봉수는 _recent_n_bars(기본 5봉)에서 조정',recommend:'~15 (단기 급등 방어) / 20↑ (강한 모멘텀)'},
    ]},
    {id:'ta_other',name:'기타 지표',conditions:[
      {id:'obv_trend',name:'OBV 추세',type:'select',options:['설정안함','상승 추세','하락 추세'],default:'설정안함',source:'calc_candle',desc:'누적 거래량 - OBV 다이버전스=세력 매집 신호 (강력)'},
      {id:'ad_trend',name:'A/D선 추세',type:'select',options:['설정안함','상승 추세','하락 추세','다이버전스 (가격↓ AD↑)'],default:'설정안함',source:'calc_candle',desc:'누적 분산선 - 다이버전스=가격 하락에도 매집 (반전 신호)'},
      {id:'vwap_position',name:'VWAP 위치',type:'select',options:['설정안함','VWAP 위 (강세)','VWAP 근처 (±1%)','VWAP 아래 (약세)'],default:'설정안함',source:'calc_candle',desc:'거래량 가중 평균가 - 위=매수 평균 우위, 아래=매도 평균 우위 (기관 기준선)'},
      {id:'swing_structure',name:'구조 패턴 (HH/HL)',type:'select',options:['설정안함','Higher High (고점 상승)','HH+HL (상승구조)','Lower Low (저점 하락)'],default:'설정안함',source:'calc_candle',desc:'스윙 구조 - HH+HL=상승 추세 확정, LL=하락 추세'},
    ]},
  ]},
  // [S317→S318] 골든크로스 — 모든 보조지표 N봉 윈도우 크로스를 한곳에 통합
  //   윈도우 의미: 시작점(N봉 전)에서 A≤B, 현재 봉에서 A>B → 그 사이에 교차 발생
  //   N 추출: _recent_n_bars.max (기본 2 = 직전봉→현재봉)
  //   외부 슬라이드 가드: 워커가 gc_* 감지 시 outer Nactual=1 강제
  //   [S318] 변경 — 기존 기술적분석의 cross 옵션을 모두 흡수:
  //     ma_cross(5×20, 20×60), stoch_slow_cross, ichimoku_cross 항목 완전 이전
  //     macd_signal/stoch_cross/eom_trend/chaikin_osc/trix_signal의 cross 옵션 이전
  {id:'goldencross',name:'골든크로스',phase:'p2',groups:[
    {id:'gc_trend',name:'추세 크로스 (MA/밴드/일목)',conditions:[
      {id:'gc_ma_5_20',name:'MA(5) × MA(20)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'단기 MA(5) × 중기 MA(20) - 최근 N봉 안에 교차. 단기 추세 전환 신호'},
      {id:'gc_ma_5_60',name:'MA(5) × MA(60)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'단기 MA(5) × 장기 MA(60) - 최근 N봉 안에 교차. 단기-장기 추세 전환 (강한 신호)'},
      {id:'gc_ma_20_60',name:'MA(20) × MA(60)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'중기 MA(20) × 장기 MA(60) - 최근 N봉 안에 교차. 중장기 추세 전환'},
      {id:'gc_ema_20_120',name:'EMA(20) × EMA(120)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'EMA(20) × EMA(120) 중장기 추세 전환(≈6개월선) — 최근 N봉 안에 교차. 200봉에서 동작, KIS off·해외·코인 공용 (EMA200 경량판)'},
      {id:'gc_bb',name:'MA(단기) × BB중심(SMA)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'단기 MA × BB 중심선(SMA) - 최근 N봉 안에 교차. 시장 자동: KR=MA5×SMA14, COIN=MA5×SMA9, US=MA5×SMA20',recommend:'골든크로스 (단기 추세 BB 돌파)'},
    ]},
    {id:'gc_oscillator',name:'오실레이터 크로스',conditions:[
      {id:'gc_rsi',name:'RSI(14) × Signal(EMA9)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'RSI(14) vs EMA9(RSI) - 최근 N봉 안에 교차. N봉은 위 "최근 N봉" 메타조건에서 조정 (기본 2봉=직전→현재)',recommend:'골든크로스 (모멘텀 전환 시작)'},
      {id:'gc_macd',name:'MACD(12,26) × Signal(EMA9)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'MACD line(EMA12-EMA26) vs Signal(EMA9) - 최근 N봉 안에 교차',recommend:'골든크로스 (추세 전환 표준 신호)'},
      {id:'gc_stoch',name:'Stoch %K(14) × %D(3)',type:'select',options:['설정안함','골든크로스','데드크로스','골든크로스 (과매도권 %K<30)','데드크로스 (과매수권 %K>70)'],default:'설정안함',source:'calc_candle',desc:'%K(14) vs %D(3) - 최근 N봉 안에 교차. 과매도권/과매수권 옵션은 끝 시점 %K 위치 조건 추가 (강한 반전 신호)',recommend:'골든크로스 (과매도권) (강한 매수 신호)'},
      {id:'gc_dmi',name:'DMI(14) +DI × -DI',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'+DI(14) vs -DI(14) - 최근 N봉 안에 교차 (방향선 전환)',recommend:'골든크로스 (상승 방향 우위 전환)'},
      {id:'gc_cci',name:'CCI(20) × 0선',type:'select',options:['설정안함','골든크로스 (0선 상향)','데드크로스 (0선 하향)'],default:'설정안함',source:'calc_candle',desc:'CCI(20) 0선 교차 - 최근 N봉 안에 발생',recommend:'골든크로스 (0선 상향) (강세 진입)'},
      {id:'gc_mfi',name:'MFI(14) × 50선',type:'select',options:['설정안함','골든크로스 (50선 상향)','데드크로스 (50선 하향)'],default:'설정안함',source:'calc_candle',desc:'MFI(14) 50선 교차 - 최근 N봉 안에 (자금흐름 전환)',recommend:'골든크로스 (50선 상향) (자금 유입 전환)'},
      {id:'gc_trix',name:'TRIX(15) 크로스',type:'select',options:['설정안함','0선 골든크로스','0선 데드크로스','Signal 골든크로스','Signal 데드크로스'],default:'설정안함',source:'calc_candle',desc:'TRIX(15) - 0선 교차(=양수/음수 전환) 또는 Signal(SMA9 of TRIX) 교차. 최근 N봉 안에. 3중 EMA, 노이즈 적은 추세 전환',recommend:'0선 골든크로스 (장기 추세 전환)'},
    ]},
    {id:'gc_volume',name:'거래량/추세 보조 크로스',conditions:[
      {id:'gc_eom',name:'EOM(14) × 0선',type:'select',options:['설정안함','골든크로스 (0선 상향)','데드크로스 (0선 하향)'],default:'설정안함',source:'calc_candle',desc:'EOM(14) 0선 교차 - 최근 N봉 안에. 거래량 대비 가격 움직임 용이도 전환'},
      {id:'gc_obv',name:'OBV × Signal(SMA20)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'OBV vs SMA20(OBV) - 최근 N봉 안에 교차 (거래량 누적선 전환)',recommend:'골든크로스 (매집 전환)'},
      {id:'gc_chaikin',name:'Chaikin Osc(3,10) × 0선',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'Chaikin Oscillator(EMA3-EMA10 of A/D) 0선 교차 - 최근 N봉 안에',recommend:'골든크로스 (매집-분산 전환)'},
    ]},
  ]},
  {id:'pattern',name:'패턴분석',phase:'p2',groups:[
    {id:'pat_basic',name:'기본 캔들',conditions:[
      {id:'candle_type',name:'캔들 유형',type:'multi_check',options:[
        {id:'long_yang',name:'장대양봉'},{id:'long_eum',name:'장대음봉'},{id:'doji',name:'도지 (십자)'},
        {id:'hammer',name:'해머 (망치)'},{id:'shooting_star',name:'슈팅스타'},{id:'spinning_top',name:'스피닝 탑'},
        {id:'gravestone_doji',name:'그레이브스톤 도지'},{id:'dragonfly_doji',name:'드래곤플라이 도지'},
        {id:'marubozu_bull',name:'양봉 마루보즈'},{id:'marubozu_bear',name:'음봉 마루보즈'},
        {id:'high_wave',name:'하이웨이브 캔들'},
      ],source:'calc_candle'},
    ]},
    {id:'pat_reversal',name:'반전 패턴',conditions:[
      {id:'reversal_pattern',name:'반전 패턴',type:'multi_check',options:[
        {id:'morning_star',name:'모닝스타'},{id:'evening_star',name:'이브닝스타'},
        {id:'bullish_engulfing',name:'상승장악형'},{id:'bearish_engulfing',name:'하락장악형'},
        {id:'harami_bull',name:'하라미 상승'},{id:'harami_bear',name:'하라미 하락'},
        {id:'bullish_counterattack',name:'상승 카운터어택'},{id:'bearish_counterattack',name:'하락 카운터어택'},
        {id:'morning_doji_star',name:'모닝 도지 스타'},{id:'evening_doji_star',name:'이브닝 도지 스타'},
        {id:'abandoned_baby_bull',name:'어밴던드 베이비 (상승)'},{id:'abandoned_baby_bear',name:'어밴던드 베이비 (하락)'},
      ],source:'calc_candle'},
    ]},
    {id:'pat_continuation',name:'지속 패턴',conditions:[
      {id:'continuation_pattern',name:'지속 패턴',type:'multi_check',options:[
        {id:'three_white',name:'적삼병 (상승지속)'},{id:'three_black',name:'흑삼병 (하락지속)'},
        {id:'gap_up',name:'상승 갭'},{id:'gap_down',name:'하락 갭'},
        {id:'advance_block',name:'어드밴스 블럭'},{id:'stalled_pattern',name:'스톨드 패턴'},
      ],source:'calc_candle'},
    ]},
    {id:'pat_transition',name:'캔들 전이 (실험)',conditions:[
      {id:'candle_transition',name:'캔들 전이 신호',type:'multi_check',options:[
        {id:'trans_bull',name:'양봉 전이 유망'},{id:'trans_bear',name:'음봉 전이 유망'},
      ],source:'calc_candle'},
    ]},
  ]},
  // [v3.17 ENV-FIX] 코인 시장환경: BTC 등락률 기준
  //   sx_scan_worker.js L812~814에서 currentMarket==='coin'일 때 env.btc.cr로 시장상태 판정
  //   코인 변동성 반영하여 range는 ±20%, recommend 기준은 -2% 하락으로 완화
  //   〔이력〕 이전: NASDAQ/SP500 필터를 노출했으나 워커가 코인에서는 처리 안 함 (작동 안 하던 조건)
  //     - mkt_env_state desc: 'KOSPI/KOSDAQ 종합' → 'BTC 등락률 기준' (수정됨)
  //     - mkt_env_nasdaq_chg, mkt_env_sp500_chg 제거 (코인에서 무의미)
  //     - mkt_env_btc_chg 신규 추가 (워커 L844에 처리 코드는 이미 존재했으나 UI 정의가 누락이었음)
  {id:'market_env',name:'시장환경',phase:'p2',groups:[
    {id:'env_state',name:'시장 상태',conditions:[
      {id:'mkt_env_state',name:'시장 환경',type:'select',options:['설정안함','강세 포함 (mild_bull+bull)','강세 (bull)','약세강세 (mild_bull)','중립 (neutral)','약세약세 (mild_bear)','약세 (bear)','약세 포함 (mild_bear+bear)'],default:'설정안함',source:'oracle_index',desc:'BTC 등락률 기준 - 강세장만 매수, 약세장 회피용 (코인 시장은 BTC가 흐름 주도)'},
    ]},
    {id:'env_index',name:'지수 등락률',conditions:[
      {id:'mkt_env_btc_chg',name:'BTC 등락률',type:'range',unit:'%',min:-20,max:20,default:{min:null,max:null},source:'oracle_index',desc:'당일 BTC 등락률 - 코인 시장의 흐름 지표 (BTC 동조성 강함)',recommend:'0↑ (상승 시) / -2↓ (하락 시)'},
    ]},
  ]},
  // ── Phase 3 ──
  {id:'engine_verdict',name:'엔진 판정',phase:'p3',groups:[
    {id:'ta_signal',name:'분석 판정',conditions:[
      {axis4:true,id:'score_range',name:'추세 방향 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추세 방향 0~100 (분석탭 "추세 방향") - 50↑=상승, 70↑=강한 상승',recommend:'50↑ (상승 추세) / 70↑ (강한 상승)'},
      {axis4:true,id:'_ready_score',name:'반등 준비 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'반등 준비 0~100 (과매도+수축+눌림) - 50↑=신호 발현 시작',recommend:'50↑ (반등 준비) / 70↑ (강한 신호)'},
      {axis4:true,id:'_entry_score',name:'반등 전환 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'반등 전환 0~100 (RSI반등+MACD전환) - 진입 타이밍 판단',recommend:'50↑ (진입 가능) / 70↑ (강력 진입)'},
      {axis4:true,id:'_upside_score',name:'추가 상승 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추가 상승 0~100 (정배열+돌파+수급) - 추세 추격 여력, 50↑=여력, 70↑=강한 추격',recommend:'50↑ (추격 여력) / 70↑ (강한 추격)'},
      // [S585] 분석탭 전광판 '추세·구조' 도넛 3종 — 4축 아님(일반 점수형). 워커 s._indicators(=분석탭 indicators)에서 도넛과 동일 공식으로 평가.
      {id:'_adx_score',name:'추세강도(ADX)',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추세강도 0~100 (분석탭 "추세강도" 도넛 = ADX값) - 25↑=추세 형성, 40↑=매우 강한 추세. 횡보(낮음)에선 추세추종 비효율',recommend:'25↑ (추세 형성) / 40↑ (강한 추세)'},
      {id:'_struct_pos',name:'구조위치',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'구조위치 0~100 (분석탭 "구조위치" 도넛 = 최근 고/저점 구간 내 현재가 위치) - 낮을수록 저점 근접(눌림 후보), 높을수록 고점 근접(과열 주의)',recommend:'~35 (저점 근접·눌림) / 40~70 (추세 중단)'},
      {id:'_rs_score',name:'상대강도(RS)',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'상대강도 0~100 (분석탭 "상대강도" 도넛 = 시장지수 대비 20일 초과수익 50+rs20×2.5) - 50=시장과 동일, 50↑=아웃퍼폼. ※일봉 전용(주/월봉·지수 미가용 시 평가 제외→결과 빠짐)',recommend:'55↑ (시장 대비 강세) / 65↑ (뚜렷한 아웃퍼폼)'},
      {id:'_safety_clean',name:'안전필터 클린',type:'select',options:['설정안함','클린 (0개)','1개 이하','2개 이하'],default:'설정안함',source:'calc_candle',desc:'안전필터 미충족 사유 개수 - 클린=함정 위험 없음 (가장 안전)'},
      {id:'_dump_warn',name:'되돌림주의 제외',type:'select',options:['설정안함','되돌림주의 제외'],default:'설정안함',source:'calc_candle',desc:'헤더 ⚠️되돌림주의 배지와 동일 판정 — 투매(대금급증≥65+가격하락+OBV이탈) 또는 천정위험(RSI/OBV 약세 다이버전스·과열 급등) 종목을 결과에서 제외',recommend:'되돌림주의 제외 → 추격 위험·자금 이탈 구간 종목을 걸러냄'},
      {id:'_regime_label',name:'시장 레짐',type:'select',options:['설정안함','추세장','횡보장','추세+변동','전환기'],default:'설정안함',source:'calc_candle',desc:'ADX+BB폭 기반 - 추세장=방향 매매, 횡보장=박스권 매매'},
      {id:'_squeeze',name:'BB 스퀴즈',type:'select',options:['설정안함','스퀴즈 중','스퀴즈 아님'],default:'설정안함',source:'calc_candle',desc:'볼린저밴드 수축 상태 - 스퀴즈=변동성 폭발 임박 (큰 움직임 예고)'},
      {id:'_rsi_div',name:'RSI 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔RSI 괴리 - 강세 다이버전스=상승 반전 신호 (강력)'},
      {id:'_obv_div',name:'OBV 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔OBV 괴리 - 거래량 기반 반전 신호 (RSI보다 강력)'},
      {id:'_pullback_score',name:'눌림목 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'눌림목 매수 적합도 - 상승추세 중 일시 조정 종목 발견',recommend:'50↑ (눌림목 후보) / 70↑ (강력 눌림목)'},
      {id:'_recipe_detect',name:'레시피 감지 🎯',type:'select',options:['설정안함','발동(겹침1+)','순수발동','겹침3+','겹침4+'],default:'설정안함',source:'calc_candle',desc:'레시피(재료패턴) 발동 종목 스캔 - 순수=fake 미동반(혼재없음)·겹침N=동시발동 레시피 수. 정밀 신호감지 필터.'},
      {axis4:true,id:'_dir_mom',name:'방향 전이',type:'select',options:['설정안함','상승 전이중','하락 전이중','횡보'],default:'설정안함',source:'calc_candle',desc:'A분석 모멘텀 방향 - 상승 전이중=함정 진입 방어 효과'},
      {axis4:'buy',id:'_c_buy_marker',name:'매수마커 ▲',type:'select',options:['설정안함','매수마커 있음'],default:'설정안함',source:'calc_candle',desc:'보라 마커 ▲ — 설정탭 차트마커 교차선택(보라 A/C)을 따름. A=진입타이밍(qs.action=BUY) / C=감독관 안전제동 판정. 분석탭 차트 보라 ▲와 동일(S591). 안전필터 🔒 위반 시 자동 제외(깨끗한 매수만).',recommend:'매수마커 있음 → 분석엔진 매수 후보 (안전필터 통과)'},
    ]},
    {id:'pat_trend',name:'단기추세 매매 (실험)',conditions:[
      {id:'trend_cross',name:'단기추세 신호 (MA 크로스)',type:'trend_cross',source:'calc_candle',desc:'단기 MA × 장기 MA 크로스 직접 탐색. 매수=골든크로스 / 매도=데드크로스, 각각 단기×장기 봉수 입력 (분석탭 단기추세매매와 맞춤). 기본 5×9'},
      {id:'knn_dday',name:'kNN 크로스 임박 (D-day)',type:'select',options:['설정안함','골든크로스 임박','데드크로스 임박'],default:'설정안함',source:'calc_candle',desc:'kNN+MA수렴으로 골든/데드 크로스가 3봉 내 임박(과거 유사패턴 적중 50%↑)한 종목. 분석탭 단기추세 D-day와 동일 엔진 · MA는 단기추세매매 설정(cfg.s×cfg.l) 동기화 · 룩어헤드 차단. [S633/S634]',recommend:'골든크로스 임박 → 곧 진입 신호 나올 후보 선점'},
    ]},
  ]},
  {id:'backtest',name:'백테스트',phase:'p3',groups:[
    {id:'ta_bt',name:'백테스트 (실시간)',conditions:[
      {id:'_bt_score',name:'매매전략 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'BT 종합 점수 (수익률+승률+MDD+PF) - 60↑=양호, 80↑=우수',recommend:'60↑ (양호) / 80↑ (우수)'},
      {id:'_bt_pnl',name:'BT 수익률',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'calc_candle',desc:'200봉 백테스트 총수익률 - 0↑=수익, 10↑=양호',recommend:'10↑ (양호) / 30↑ (우수)'},
      {id:'_bt_winrate',name:'BT 승률',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'승리 거래 비율 - 50↑=절반 이상 승, 60↑=양호',recommend:'50↑ (균형) / 60↑ (양호)'},
      {id:'_bt_trades',name:'BT 거래수',type:'range',unit:'회',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'총 청산 거래 수 - 너무 적으면 통계 신뢰성 ↓',recommend:'5↑ (최소 신뢰) / 10↑ (안정 통계)'},
      {id:'_bt_mdd',name:'BT MDD',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'최대 낙폭 절대값 - 작을수록 안정 (max로 사용)',recommend:'~15 (안정) / ~25 (보통)'},
      {id:'_bt_pf',name:'BT 손익비',type:'range',unit:'',min:0,max:10,default:{min:null,max:null},source:'calc_candle',desc:'총수익/총손실 비율 - 1↑=수익 우세, 1.5↑=양호, 2↑=우수',recommend:'1.5↑ (양호) / 2↑ (우수)'},
      {id:'_bt_action',name:'종합행동지침',type:'select',options:['설정안함','매수','관심','관망','회피','보유 유지','청산 준비','청산 검토','즉시 청산','매도 완료'],default:'설정안함',source:'calc_candle',desc:'C로직 9종 판정 (A분석 × B매매전략 교차) - 매수=강력 진입, 관심=주시'},
      // [v1.9] 방향 전이 — _scoreMomentum.direction 기반 (배너의 "— 상승 전이중/하락 전이중" 텍스트와 동일 소스)
      //   매수/관심 프리셋 보강용: 신호여도 모멘텀이 상승 방향일 때만 통과시켜 함정 진입 한 번 더 차단
      {axis4:'buy',id:'_bt_buy_marker',name:'BT 매수마커',type:'select',options:['설정안함','매수마커 있음'],default:'설정안함',source:'calc_candle',desc:'BT엔진이 오늘 매수 신호를 낸 종목 - 차트에 ▲마커 표시된 상태 (_isBuySignal=true)',recommend:'매수마커 있음 → 당일 신규 매수 진입 신호 종목만 필터'},
      {axis4:'buy',id:'_bt_today_entry',name:'오늘 매수진입',type:'select',options:['설정안함','오늘 진입'],default:'설정안하',source:'calc_candle',desc:'BT엔진이 오늘 실제 매수 진입한 종목 (_isBuySignal=true) - BT 매수마커보다 엄격한 필터',recommend:'오늘 진입 → 실시간 BT 매수 신호 종목만 필터 (매수마커의 하위집합)'},
    ]},
  ]},
];

// ════════════════════════════════════════════════════════════
//  해외주식 (US) 조건 트리
// ════════════════════════════════════════════════════════════
const US_CONDITIONS = [
  // ── Phase 1 ──
  {id:'scope',name:'범위지정',phase:'p1',groups:[
    {id:'scope_basic',name:'기본 정보',conditions:[
      // [S341] 최근 N봉 메타조건 — 기술분석/패턴 조건의 평가 윈도우. 내필터 항상 최상단 고정·삭제 불가.
      //   [S590] US 기본값 1~3봉 — 3시장 공통 통일 (기존 1~5 → 1~3).
      {id:'_recent_n_bars',name:'최근 N봉',type:'range',unit:'봉',min:1,max:60,default:{min:1,max:3},source:'calc_candle',desc:'조건 평가 대상 범위. MA 크로스: N봉 사이 어딘가에 교차 발생 (오늘=N2, 일주일=N7~10, 한달=N20~25). 그 외 조건: N봉 중 한 봉이라도 동시 충족 시 통과',recommend:'1~3 (오늘) / 5~10 (일주일) / 20~25 (한 달)'},
      {id:'market_cap',name:'시가총액',type:'range',unit:'M$',min:0,max:null,default:{min:null,max:null},source:'yahoo_fundamental'},
    ]},
  ]},
  // ── S161-2: US 시세분석 그룹 신설 (방어/준비 프리셋 지원) ──
  {id:'price_analysis',name:'시세분석',phase:'p1',groups:[
    {id:'price_cond',name:'가격 조건',conditions:[
      {id:'change_rate',name:'전일대비 등락률',type:'range',unit:'%',min:-30,max:30,default:{min:null,max:null},source:'yahoo_price'},
      {id:'week52_high_ratio',name:'52주 최고가 대비',type:'range',unit:'%',min:-90,max:0,default:{min:null,max:null},source:'yahoo_fundamental',desc:'양수=상승, 음수=하락'},
      {id:'week52_low_ratio',name:'52주 최저가 대비',type:'range',unit:'%',min:0,max:500,default:{min:null,max:null},source:'yahoo_fundamental',desc:'현재가÷52주최저-1'},
      {id:'consecutive_up_down',name:'연속 상승/하락',type:'range',unit:'일',min:-20,max:20,default:{min:null,max:null},source:'calc_candle',desc:'양수=상승, 음수=하락'},
      {id:'gap_type',name:'갭 발생',type:'select',options:['설정안함','상승갭 종목','하락갭 종목','갭상승 후 지지','갭하락 후 저항','상승갭 제외'],default:'설정안함',source:'calc_candle',desc:'시가갭 발생 여부 (상승갭 제외 = 오늘 상승갭 발생 종목 회피)'},
      {id:'new_high_low',name:'신고가/신저가',type:'select',options:['설정안함','52주 신고가','52주 신저가','연중 신고가','연중 신저가','20일 신고가','20일 신저가'],default:'설정안함',source:'calc_candle',desc:'52주/연중/20일 신고가/신저가 발생 여부'},
      {id:'intraday_range',name:'당일 변동폭',type:'range',unit:'%',min:0,max:30,default:{min:null,max:null},source:'calc_candle',desc:'(고가-저가)/전일종가'},
      {id:'period_change',name:'N일간 주가변동폭',type:'range',unit:'%',min:-80,max:200,default:{min:null,max:null},source:'calc_candle',desc:'5일간 등락률'},
    ]},
    {id:'volume_cond',name:'거래량',conditions:[
      {id:'volume_prev_ratio',name:'전일대비 거래량 비율',type:'range',unit:'%',min:0,max:10000,default:{min:null,max:null},source:'yahoo_price',desc:'당일÷전일×100'},
      {id:'volume_avg20_ratio',name:'20일 평균 대비 거래량',type:'range',unit:'%',min:0,max:10000,default:{min:null,max:null},source:'calc_candle',desc:'당일거래량÷20일평균×100'},
      {id:'volume_consec_inc',name:'거래량 연속 증가',type:'range',unit:'봉',min:0,max:30,default:{min:null,max:null},source:'calc_candle',desc:'최근 N봉 연속 거래량 증가 (5봉↑=강한 매수세)'},
    ]},
  ]},
  {id:'fundamental',name:'재무분석',phase:'p1',groups:[
    {id:'fund_valuation',name:'밸류에이션',conditions:[
      {id:'per',name:'PER',type:'range',unit:'배',min:-100,max:200,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'pbr',name:'PBR',type:'range',unit:'배',min:0,max:50,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'dividend_yield',name:'배당수익률',type:'range',unit:'%',min:0,max:30,default:{min:null,max:null},source:'yahoo_fundamental'},
      // [정리] 미국 ROE 조건 미지원
      //   미국은 Yahoo /fundamental 경로를 타는데 ROE를 받아오지 않음 → 항상 null
      //   향후 Yahoo /key-statistics에 returnOnEquity 필드 활용 시 재추가 가능
      //   〔이력〕 2026-05 이전: ROE는 DART/네이버 한국 전용 경로에서만 채워짐 →
      //     미국 종목에서 rangeCheck(null,...)=false → 모든 미국 종목 탈락하던 버그 (제거됨)
    ]},
  ]},
  // ── Phase 2 ──
  {id:'technical',name:'기술적분석',phase:'p2',groups:[
    {id:'ta_ma',name:'이동평균선',conditions:[
      {id:'price_vs_ma',name:'MA 대비 가격',type:'select',options:['설정안함','MA5 위','MA5 아래','MA20 위','MA20 아래','MA60 위','MA60 아래','MA120 위','MA120 아래'],default:'설정안함',source:'calc_candle',desc:'현재가의 이동평균선 대비 위치 - MA60↑=중기 추세 위'},
      {id:'ma_arrangement',name:'MA 배열',type:'select',options:['설정안함','정배열 (3개)','정배열 (4개)','역배열 (3개)','역배열 (4개)'],default:'설정안함',source:'calc_candle',desc:'단기>중기>장기 순서 - 정배열=상승추세, 역배열=하락추세 (4개=더 강한 신호)'},
      {id:'ma_disparity',name:'MA 이격도',type:'select',options:['설정안함','MA20 +5%↑ 과열','MA20 -5%↓ 침체','MA60 +10%↑ 과열','MA60 -10%↓ 침체','MA20 근접 (±2%)','MA60 근접 (±2%)'],default:'설정안함',source:'calc_candle',desc:'이동평균선 대비 거리 - 과열=조정 가능, 침체=반등 가능, 근접=추세 추종'},
    ]},
    {id:'ta_trend',name:'추세지표',conditions:[
      {id:'macd_signal',name:'MACD 시그널',type:'select',options:['설정안함','MACD > Signal (매수)','MACD < Signal (매도)'],default:'설정안함',source:'calc_candle',desc:'MACD vs 시그널선 현재 상태 - 매수=상승 모멘텀 유지. cross는 골든크로스 폴더의 gc_macd 참조'},
      {id:'adx_value',name:'ADX (추세강도)',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추세의 강도 (방향 무관) - 25↑=추세 형성, 40↑=강한 추세, 20↓=횡보',recommend:'25↑ (추세 형성) / 40↑ (강한 추세)'},
      {id:'parabolic_sar',name:'Parabolic SAR',type:'select',options:['설정안함','SAR 아래 (상승 추세)','SAR 위 (하락 추세)'],default:'설정안함',source:'calc_candle',desc:'추세 추종 지표 - SAR 아래=상승, SAR 위=하락 (포지션 청산 신호)'},
      {id:'eom_trend',name:'EOM (이동용이도)',type:'select',options:['설정안함','매수세 (상승)','매도세 (하락)'],default:'설정안함',source:'calc_candle',desc:'가격 움직임의 용이도 - 거래량 대비 가격 변동 (양수=쉽게 상승)'},
      {id:'vhf_state',name:'VHF (추세판별)',type:'select',options:['설정안함','추세장 (>0.4)','횡보장 (<0.3)','보통'],default:'설정안함',source:'calc_candle',desc:'추세 vs 횡보 판별 - 추세장=방향성 매매, 횡보장=박스권 매매'},
    ]},
    {id:'ta_momentum',name:'모멘텀지표',conditions:[
      {id:'rsi_value',name:'RSI',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'상대강도지수 - 30↓=과매도(매수기회), 70↑=과매수(매도기회), 50=중립',recommend:'30↓ (과매도 반등) / 70↑ (과매수 경고)'},
      {id:'rs_value',name:'RS (시장대비 강도)',type:'range',unit:'%p',min:-50,max:50,default:{min:null,max:null},source:'calc_candle',desc:'상대강도(RSI 아님) - 시장지수 대비 20일 상대수익률. 양수=시장 아웃퍼폼(강세), +5%p↑=상대강세. 일봉만 평가',recommend:'+5%p↑ (시장 대비 강세)'},  // [S441] RS 조건검색 항목
      {id:'stoch_k',name:'Stochastic %K',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'스토캐스틱 - 20↓=과매도, 80↑=과매수 (RSI보다 민감)',recommend:'20↓ (과매도) / 80↑ (과매수)'},
      {id:'psycho_value',name:'심리도',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'12일 중 상승일 비율 - 25↓=과매도, 75↑=과매수',recommend:'25↓ (과매도) / 75↑ (과매수)'},
      {id:'ab_ratio_trend',name:'AB Ratio',type:'select',options:['설정안함','매수세 우위 (A>B)','매도세 우위 (A<B)','균형'],default:'설정안함',source:'calc_candle',desc:'고가-시가 vs 시가-저가 - 매수세 우위=장중 강세'},
      {id:'chaikin_osc',name:'Chaikin Oscillator',type:'select',options:['설정안함','양수 (매집)','음수 (분산)'],default:'설정안함',source:'calc_candle',desc:'A/D선 모멘텀 - 양수=세력 매집중, 음수=분산중'},
    ]},
    {id:'ta_channel',name:'채널/밴드',conditions:[
      {id:'bb_position',name:'볼린저 밴드 위치',type:'select',options:['설정안함','상단 돌파','상단 근접','중심선 위','중심선 아래','하단 근접','하단 이탈'],default:'설정안함',source:'calc_candle',desc:'BB 위치 - 상단=강세/과매수, 하단=약세/과매도, 돌파=추세 강화'},
      {id:'band_pctb',name:'Band %b',type:'range',unit:'',min:-0.5,max:1.5,default:{min:null,max:null},source:'calc_candle',desc:'BB 내 위치 (0=하단, 0.5=중심, 1=상단)',recommend:'0↓ (하단 이탈) / 1↑ (상단 돌파)'},
      // S161-2: US에도 BB 스퀴즈 조건 추가 (준비 프리셋 '변동성 수축' 지원)
      {id:'bb_width',name:'볼린저 밴드 폭',type:'select',options:['설정안함','스퀴즈 (수축)','확장중'],default:'설정안함',source:'calc_candle',desc:'BB 폭 - 스퀴즈=변동성 폭발 임박, 확장중=추세 진행'},
      // [v3.10] 신규 안전 가드 — BT 진입 게이트와 동기화 (KR과 동일 정의)
      {id:'recent_high_proximity',name:'최근 N봉 고점 근접도',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'현재가÷최근N봉 고가×100. 95%↑=고점 근접 → max 90~95로 설정 시 추격 방어. N봉수는 _recent_n_bars(기본 20봉)에서 조정',recommend:'~90 (고점 추격 방어) / 95↑ (신고가 돌파)'},
      {id:'recent_n_change',name:'최근 N봉 대비 상승률',type:'range',unit:'%',min:-50,max:100,default:{min:null,max:null},source:'calc_candle',desc:'(현재가-N봉전 시작가)÷N봉전×100. max 15~25% 설정 시 단기 급등 추격 방어. N봉수는 _recent_n_bars(기본 5봉)에서 조정',recommend:'~15 (단기 급등 방어) / 20↑ (강한 모멘텀)'},
    ]},
    {id:'ta_other',name:'기타 지표',conditions:[
      {id:'obv_trend',name:'OBV 추세',type:'select',options:['설정안함','상승 추세','하락 추세'],default:'설정안함',source:'calc_candle',desc:'누적 거래량 - OBV 다이버전스=세력 매집 신호 (강력)'},
      {id:'ad_trend',name:'A/D선 추세',type:'select',options:['설정안함','상승 추세','하락 추세','다이버전스 (가격↓ AD↑)'],default:'설정안함',source:'calc_candle',desc:'누적 분산선 - 다이버전스=가격 하락에도 매집 (반전 신호)'},
      {id:'vwap_position',name:'VWAP 위치',type:'select',options:['설정안함','VWAP 위 (강세)','VWAP 근처 (±1%)','VWAP 아래 (약세)'],default:'설정안함',source:'calc_candle',desc:'거래량 가중 평균가 - 위=매수 평균 우위, 아래=매도 평균 우위 (기관 기준선)'},
      {id:'swing_structure',name:'구조 패턴 (HH/HL)',type:'select',options:['설정안함','Higher High (고점 상승)','HH+HL (상승구조)','Lower Low (저점 하락)'],default:'설정안함',source:'calc_candle',desc:'스윙 구조 - HH+HL=상승 추세 확정, LL=하락 추세'},
    ]},
  ]},
  // [S317→S318] 골든크로스 — 모든 보조지표 N봉 윈도우 크로스를 한곳에 통합
  //   윈도우 의미: 시작점(N봉 전)에서 A≤B, 현재 봉에서 A>B → 그 사이에 교차 발생
  //   N 추출: _recent_n_bars.max (기본 2 = 직전봉→현재봉)
  //   외부 슬라이드 가드: 워커가 gc_* 감지 시 outer Nactual=1 강제
  //   [S318] 변경 — 기존 기술적분석의 cross 옵션을 모두 흡수:
  //     ma_cross(5×20, 20×60), stoch_slow_cross, ichimoku_cross 항목 완전 이전
  //     macd_signal/stoch_cross/eom_trend/chaikin_osc/trix_signal의 cross 옵션 이전
  {id:'goldencross',name:'골든크로스',phase:'p2',groups:[
    {id:'gc_trend',name:'추세 크로스 (MA/밴드/일목)',conditions:[
      {id:'gc_ma_5_20',name:'MA(5) × MA(20)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'단기 MA(5) × 중기 MA(20) - 최근 N봉 안에 교차. 단기 추세 전환 신호'},
      {id:'gc_ma_5_60',name:'MA(5) × MA(60)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'단기 MA(5) × 장기 MA(60) - 최근 N봉 안에 교차. 단기-장기 추세 전환 (강한 신호)'},
      {id:'gc_ma_20_60',name:'MA(20) × MA(60)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'중기 MA(20) × 장기 MA(60) - 최근 N봉 안에 교차. 중장기 추세 전환'},
      {id:'gc_ema_20_120',name:'EMA(20) × EMA(120)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'EMA(20) × EMA(120) 중장기 추세 전환(≈6개월선) — 최근 N봉 안에 교차. 200봉에서 동작, KIS off·해외·코인 공용 (EMA200 경량판)'},
      {id:'gc_bb',name:'MA(단기) × BB중심(SMA)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'단기 MA × BB 중심선(SMA) - 최근 N봉 안에 교차. 시장 자동: KR=MA5×SMA14, COIN=MA5×SMA9, US=MA5×SMA20',recommend:'골든크로스 (단기 추세 BB 돌파)'},
    ]},
    {id:'gc_oscillator',name:'오실레이터 크로스',conditions:[
      {id:'gc_rsi',name:'RSI(14) × Signal(EMA9)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'RSI(14) vs EMA9(RSI) - 최근 N봉 안에 교차. N봉은 위 "최근 N봉" 메타조건에서 조정 (기본 2봉=직전→현재)',recommend:'골든크로스 (모멘텀 전환 시작)'},
      {id:'gc_macd',name:'MACD(12,26) × Signal(EMA9)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'MACD line(EMA12-EMA26) vs Signal(EMA9) - 최근 N봉 안에 교차',recommend:'골든크로스 (추세 전환 표준 신호)'},
      {id:'gc_stoch',name:'Stoch %K(14) × %D(3)',type:'select',options:['설정안함','골든크로스','데드크로스','골든크로스 (과매도권 %K<30)','데드크로스 (과매수권 %K>70)'],default:'설정안함',source:'calc_candle',desc:'%K(14) vs %D(3) - 최근 N봉 안에 교차. 과매도권/과매수권 옵션은 끝 시점 %K 위치 조건 추가 (강한 반전 신호)',recommend:'골든크로스 (과매도권) (강한 매수 신호)'},
      {id:'gc_dmi',name:'DMI(14) +DI × -DI',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'+DI(14) vs -DI(14) - 최근 N봉 안에 교차 (방향선 전환)',recommend:'골든크로스 (상승 방향 우위 전환)'},
      {id:'gc_cci',name:'CCI(20) × 0선',type:'select',options:['설정안함','골든크로스 (0선 상향)','데드크로스 (0선 하향)'],default:'설정안함',source:'calc_candle',desc:'CCI(20) 0선 교차 - 최근 N봉 안에 발생',recommend:'골든크로스 (0선 상향) (강세 진입)'},
      {id:'gc_mfi',name:'MFI(14) × 50선',type:'select',options:['설정안함','골든크로스 (50선 상향)','데드크로스 (50선 하향)'],default:'설정안함',source:'calc_candle',desc:'MFI(14) 50선 교차 - 최근 N봉 안에 (자금흐름 전환)',recommend:'골든크로스 (50선 상향) (자금 유입 전환)'},
      {id:'gc_trix',name:'TRIX(15) 크로스',type:'select',options:['설정안함','0선 골든크로스','0선 데드크로스','Signal 골든크로스','Signal 데드크로스'],default:'설정안함',source:'calc_candle',desc:'TRIX(15) - 0선 교차(=양수/음수 전환) 또는 Signal(SMA9 of TRIX) 교차. 최근 N봉 안에. 3중 EMA, 노이즈 적은 추세 전환',recommend:'0선 골든크로스 (장기 추세 전환)'},
    ]},
    {id:'gc_volume',name:'거래량/추세 보조 크로스',conditions:[
      {id:'gc_eom',name:'EOM(14) × 0선',type:'select',options:['설정안함','골든크로스 (0선 상향)','데드크로스 (0선 하향)'],default:'설정안함',source:'calc_candle',desc:'EOM(14) 0선 교차 - 최근 N봉 안에. 거래량 대비 가격 움직임 용이도 전환'},
      {id:'gc_obv',name:'OBV × Signal(SMA20)',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'OBV vs SMA20(OBV) - 최근 N봉 안에 교차 (거래량 누적선 전환)',recommend:'골든크로스 (매집 전환)'},
      {id:'gc_chaikin',name:'Chaikin Osc(3,10) × 0선',type:'select',options:['설정안함','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'Chaikin Oscillator(EMA3-EMA10 of A/D) 0선 교차 - 최근 N봉 안에',recommend:'골든크로스 (매집-분산 전환)'},
    ]},
  ]},
  {id:'pattern',name:'패턴분석',phase:'p2',groups:[
    {id:'pat_basic',name:'기본 캔들',conditions:[
      {id:'candle_type',name:'캔들 유형',type:'multi_check',options:[
        {id:'long_yang',name:'장대양봉'},{id:'long_eum',name:'장대음봉'},{id:'doji',name:'도지 (십자)'},
        {id:'hammer',name:'해머 (망치)'},{id:'shooting_star',name:'슈팅스타'},{id:'spinning_top',name:'스피닝 탑'},
        {id:'gravestone_doji',name:'그레이브스톤 도지'},{id:'dragonfly_doji',name:'드래곤플라이 도지'},
        {id:'marubozu_bull',name:'양봉 마루보즈'},{id:'marubozu_bear',name:'음봉 마루보즈'},
        {id:'high_wave',name:'하이웨이브 캔들'},
      ],source:'calc_candle'},
    ]},
    {id:'pat_reversal',name:'반전 패턴',conditions:[
      {id:'reversal_pattern',name:'반전 패턴',type:'multi_check',options:[
        {id:'morning_star',name:'모닝스타'},{id:'evening_star',name:'이브닝스타'},
        {id:'bullish_engulfing',name:'상승장악형'},{id:'bearish_engulfing',name:'하락장악형'},
        {id:'harami_bull',name:'하라미 상승'},{id:'harami_bear',name:'하라미 하락'},
        {id:'bullish_counterattack',name:'상승 카운터어택'},{id:'bearish_counterattack',name:'하락 카운터어택'},
        {id:'morning_doji_star',name:'모닝 도지 스타'},{id:'evening_doji_star',name:'이브닝 도지 스타'},
        {id:'abandoned_baby_bull',name:'어밴던드 베이비 (상승)'},{id:'abandoned_baby_bear',name:'어밴던드 베이비 (하락)'},
      ],source:'calc_candle'},
    ]},
    {id:'pat_continuation',name:'지속 패턴',conditions:[
      {id:'continuation_pattern',name:'지속 패턴',type:'multi_check',options:[
        {id:'three_white',name:'적삼병 (상승지속)'},{id:'three_black',name:'흑삼병 (하락지속)'},
        {id:'gap_up',name:'상승 갭'},{id:'gap_down',name:'하락 갭'},
        {id:'advance_block',name:'어드밴스 블럭'},{id:'stalled_pattern',name:'스톨드 패턴'},
      ],source:'calc_candle'},
    ]},
    {id:'pat_transition',name:'캔들 전이 (실험)',conditions:[
      {id:'candle_transition',name:'캔들 전이 신호',type:'multi_check',options:[
        {id:'trans_bull',name:'양봉 전이 유망'},{id:'trans_bear',name:'음봉 전이 유망'},
      ],source:'calc_candle'},
    ]},
  ]},
  {id:'market_env',name:'시장환경',phase:'p2',groups:[
    {id:'env_state',name:'시장 상태',conditions:[
      {id:'mkt_env_state',name:'시장 환경',type:'select',options:['설정안함','강세 포함 (mild_bull+bull)','강세 (bull)','약세강세 (mild_bull)','중립 (neutral)','약세약세 (mild_bear)','약세 (bear)','약세 포함 (mild_bear+bear)'],default:'설정안함',source:'oracle_index',desc:'NASDAQ/S&P500/DOW 종합 - 강세장만 매수, 약세장 회피용 (3개 미국 지수 평균 등락률로 판정)'},
    ]},
    {id:'env_index',name:'지수 등락률',conditions:[
      {id:'mkt_env_nasdaq_chg',name:'NASDAQ 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index'},
      {id:'mkt_env_sp500_chg',name:'S&P500 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index'},
      {id:'mkt_env_dow_chg',name:'DOW 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index'},
    ]},
  ]},
  // ── Phase 3 ──
  {id:'engine_verdict',name:'엔진 판정',phase:'p3',groups:[
    {id:'ta_signal',name:'분석 판정',conditions:[
      {axis4:true,id:'score_range',name:'추세 방향 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추세 방향 0~100 (분석탭 "추세 방향") - 50↑=상승, 70↑=강한 상승',recommend:'50↑ (상승 추세) / 70↑ (강한 상승)'},
      {axis4:true,id:'_ready_score',name:'반등 준비 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'반등 준비 0~100 (과매도+수축+눌림) - 50↑=신호 발현 시작',recommend:'50↑ (반등 준비) / 70↑ (강한 신호)'},
      {axis4:true,id:'_entry_score',name:'반등 전환 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'반등 전환 0~100 (RSI반등+MACD전환) - 진입 타이밍 판단',recommend:'50↑ (진입 가능) / 70↑ (강력 진입)'},
      {axis4:true,id:'_upside_score',name:'추가 상승 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추가 상승 0~100 (정배열+돌파+수급) - 추세 추격 여력, 50↑=여력, 70↑=강한 추격',recommend:'50↑ (추격 여력) / 70↑ (강한 추격)'},
      // [S585] 분석탭 전광판 '추세·구조' 도넛 3종 — 4축 아님(일반 점수형). 워커 s._indicators(=분석탭 indicators)에서 도넛과 동일 공식으로 평가.
      {id:'_adx_score',name:'추세강도(ADX)',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추세강도 0~100 (분석탭 "추세강도" 도넛 = ADX값) - 25↑=추세 형성, 40↑=매우 강한 추세. 횡보(낮음)에선 추세추종 비효율',recommend:'25↑ (추세 형성) / 40↑ (강한 추세)'},
      {id:'_struct_pos',name:'구조위치',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'구조위치 0~100 (분석탭 "구조위치" 도넛 = 최근 고/저점 구간 내 현재가 위치) - 낮을수록 저점 근접(눌림 후보), 높을수록 고점 근접(과열 주의)',recommend:'~35 (저점 근접·눌림) / 40~70 (추세 중단)'},
      {id:'_rs_score',name:'상대강도(RS)',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'상대강도 0~100 (분석탭 "상대강도" 도넛 = 시장지수 대비 20일 초과수익 50+rs20×2.5) - 50=시장과 동일, 50↑=아웃퍼폼. ※일봉 전용(주/월봉·지수 미가용 시 평가 제외→결과 빠짐)',recommend:'55↑ (시장 대비 강세) / 65↑ (뚜렷한 아웃퍼폼)'},
      {id:'_safety_clean',name:'안전필터 클린',type:'select',options:['설정안함','클린 (0개)','1개 이하','2개 이하'],default:'설정안함',source:'calc_candle',desc:'안전필터 미충족 사유 개수 - 클린=함정 위험 없음 (가장 안전)'},
      {id:'_dump_warn',name:'되돌림주의 제외',type:'select',options:['설정안함','되돌림주의 제외'],default:'설정안함',source:'calc_candle',desc:'헤더 ⚠️되돌림주의 배지와 동일 판정 — 투매(대금급증≥65+가격하락+OBV이탈) 또는 천정위험(RSI/OBV 약세 다이버전스·과열 급등) 종목을 결과에서 제외',recommend:'되돌림주의 제외 → 추격 위험·자금 이탈 구간 종목을 걸러냄'},
      {id:'_regime_label',name:'시장 레짐',type:'select',options:['설정안함','추세장','횡보장','추세+변동','전환기'],default:'설정안함',source:'calc_candle',desc:'ADX+BB폭 기반 - 추세장=방향 매매, 횡보장=박스권 매매'},
      {id:'_squeeze',name:'BB 스퀴즈',type:'select',options:['설정안함','스퀴즈 중','스퀴즈 아님'],default:'설정안함',source:'calc_candle',desc:'볼린저밴드 수축 상태 - 스퀴즈=변동성 폭발 임박 (큰 움직임 예고)'},
      {id:'_rsi_div',name:'RSI 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔RSI 괴리 - 강세 다이버전스=상승 반전 신호 (강력)'},
      {id:'_obv_div',name:'OBV 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔OBV 괴리 - 거래량 기반 반전 신호 (RSI보다 강력)'},
      {id:'_pullback_score',name:'눌림목 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'눌림목 매수 적합도 - 상승추세 중 일시 조정 종목 발견',recommend:'50↑ (눌림목 후보) / 70↑ (강력 눌림목)'},
      {id:'_recipe_detect',name:'레시피 감지 🎯',type:'select',options:['설정안함','발동(겹침1+)','순수발동','겹침3+','겹침4+'],default:'설정안함',source:'calc_candle',desc:'레시피(재료패턴) 발동 종목 스캔 - 순수=fake 미동반(혼재없음)·겹침N=동시발동 레시피 수. 정밀 신호감지 필터.'},
      {axis4:true,id:'_dir_mom',name:'방향 전이',type:'select',options:['설정안함','상승 전이중','하락 전이중','횡보'],default:'설정안함',source:'calc_candle',desc:'A분석 모멘텀 방향 - 상승 전이중=함정 진입 방어 효과'},
      {axis4:'buy',id:'_c_buy_marker',name:'매수마커 ▲',type:'select',options:['설정안함','매수마커 있음'],default:'설정안함',source:'calc_candle',desc:'보라 마커 ▲ — 설정탭 차트마커 교차선택(보라 A/C)을 따름. A=진입타이밍(qs.action=BUY) / C=감독관 안전제동 판정. 분석탭 차트 보라 ▲와 동일(S591). 안전필터 🔒 위반 시 자동 제외(깨끗한 매수만).',recommend:'매수마커 있음 → 분석엔진 매수 후보 (안전필터 통과)'},
    ]},
    {id:'pat_trend',name:'단기추세 매매 (실험)',conditions:[
      {id:'trend_cross',name:'단기추세 신호 (MA 크로스)',type:'trend_cross',source:'calc_candle',desc:'단기 MA × 장기 MA 크로스 직접 탐색. 매수=골든크로스 / 매도=데드크로스, 각각 단기×장기 봉수 입력 (분석탭 단기추세매매와 맞춤). 기본 5×9'},
      {id:'knn_dday',name:'kNN 크로스 임박 (D-day)',type:'select',options:['설정안함','골든크로스 임박','데드크로스 임박'],default:'설정안함',source:'calc_candle',desc:'kNN+MA수렴으로 골든/데드 크로스가 3봉 내 임박(과거 유사패턴 적중 50%↑)한 종목. 분석탭 단기추세 D-day와 동일 엔진 · MA는 단기추세매매 설정(cfg.s×cfg.l) 동기화 · 룩어헤드 차단. [S633/S634]',recommend:'골든크로스 임박 → 곧 진입 신호 나올 후보 선점'},
    ]},
  ]},
  {id:'backtest',name:'백테스트',phase:'p3',groups:[
    {id:'ta_bt',name:'백테스트 (실시간)',conditions:[
      {id:'_bt_score',name:'매매전략 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'BT 종합 점수 (수익률+승률+MDD+PF) - 60↑=양호, 80↑=우수',recommend:'60↑ (양호) / 80↑ (우수)'},
      {id:'_bt_pnl',name:'BT 수익률',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'calc_candle',desc:'200봉 백테스트 총수익률 - 0↑=수익, 10↑=양호',recommend:'10↑ (양호) / 30↑ (우수)'},
      {id:'_bt_winrate',name:'BT 승률',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'승리 거래 비율 - 50↑=절반 이상 승, 60↑=양호',recommend:'50↑ (균형) / 60↑ (양호)'},
      {id:'_bt_trades',name:'BT 거래수',type:'range',unit:'회',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'총 청산 거래 수 - 너무 적으면 통계 신뢰성 ↓',recommend:'5↑ (최소 신뢰) / 10↑ (안정 통계)'},
      {id:'_bt_mdd',name:'BT MDD',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'최대 낙폭 절대값 - 작을수록 안정 (max로 사용)',recommend:'~15 (안정) / ~25 (보통)'},
      {id:'_bt_pf',name:'BT 손익비',type:'range',unit:'',min:0,max:10,default:{min:null,max:null},source:'calc_candle',desc:'총수익/총손실 비율 - 1↑=수익 우세, 1.5↑=양호, 2↑=우수',recommend:'1.5↑ (양호) / 2↑ (우수)'},
      {id:'_bt_action',name:'종합행동지침',type:'select',options:['설정안함','매수','관심','관망','회피','보유 유지','청산 준비','청산 검토','즉시 청산','매도 완료'],default:'설정안함',source:'calc_candle',desc:'C로직 9종 판정 (A분석 × B매매전략 교차) - 매수=강력 진입, 관심=주시'},
      // [v1.9] 방향 전이 — _scoreMomentum.direction 기반 (배너의 "— 상승 전이중/하락 전이중" 텍스트와 동일 소스)
      //   매수/관심 프리셋 보강용: 신호여도 모멘텀이 상승 방향일 때만 통과시켜 함정 진입 한 번 더 차단
      {axis4:'buy',id:'_bt_buy_marker',name:'BT 매수마커',type:'select',options:['설정안함','매수마커 있음'],default:'설정안함',source:'calc_candle',desc:'BT엔진이 오늘 매수 신호를 낸 종목 - 차트에 ▲마커 표시된 상태 (_isBuySignal=true)',recommend:'매수마커 있음 → 당일 신규 매수 진입 신호 종목만 필터'},
      {axis4:'buy',id:'_bt_today_entry',name:'오늘 매수진입',type:'select',options:['설정안함','오늘 진입'],default:'설정안하',source:'calc_candle',desc:'BT엔진이 오늘 실제 매수 진입한 종목 (_isBuySignal=true) - BT 매수마커보다 엄격한 필터',recommend:'오늘 진입 → 실시간 BT 매수 신호 종목만 필터 (매수마커의 하위집합)'},
    ]},
  ]},
];

function getConditions(){ return currentMarket==='coin'?COIN_CONDITIONS:currentMarket==='us'?US_CONDITIONS:SX_CONDITIONS; }

// ── Phase별 조건 필터링 유틸 ──
function getConditionsByPhase(phase){ return getConditions().filter(c=>c.phase===phase); }

// ════════════════════════════════════════════════════════════
//  Phase별 프리셋 (조합 시스템용)
// ════════════════════════════════════════════════════════════

// ── KR 프리셋 ──
// S100: KR P1 프리셋 삭제 (기본필터 프리셋 제거)
const PRESETS_KR_P1 = [];

const PRESETS_KR_P2 = [
  // ── 공격 ──
  {id:'p2_kr_trend',name:'추세 추종',phase:'p2',group:'attack',desc:'정배열 + HH/HL 상승 + MACD매수 + OBV상승 + RSI 50~70 + VHF추세장 + 고점 근접 99% 이하',locked:true,conditions:{ma_arrangement:'정배열 (3개)',swing_structure:'HH+HL (상승구조)',macd_signal:'MACD > Signal (매수)',obv_trend:'상승 추세',rsi_value:{min:50,max:70},vhf_state:'추세장 (>0.4)',recent_high_proximity:{min:null,max:99}}},
  {id:'p2_kr_pullback',name:'눌림목 매수',phase:'p2',group:'attack',desc:'정배열 + MA20 근접 + RSI 40~55 + OBV상승',locked:true,conditions:{ma_arrangement:'정배열 (3개)',ma_disparity:'MA20 근접 (±2%)',rsi_value:{min:40,max:55},obv_trend:'상승 추세',vhf_state:'추세장 (>0.4)'}},
  {id:'p2_kr_reversal',name:'반등 시작',phase:'p2',group:'attack',desc:'RSI 과매도 + MACD 골든 + BB 하단 + 심리도 과매도 (최근 5봉 윈도우)',locked:true,conditions:{rsi_value:{min:20,max:35},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',psycho_value:{min:null,max:25},_recent_n_bars:{min:5,max:5}}},
  {id:'p2_kr_breakout',name:'급등 시작',phase:'p2',group:'attack',desc:'20일 신고가 + 거래량 200%↑ + VWAP위 + MACD매수 + EOM매수 + 5봉간 +25% 미만 (이미 급등한 것 제외, 최근 3봉)',locked:true,conditions:{new_high_low:'20일 신고가',volume_avg20_ratio:{min:200,max:null},vwap_position:'VWAP 위 (강세)',macd_signal:'MACD > Signal (매수)',eom_trend:'매수세 (상승)',recent_n_change:{min:null,max:25},_recent_n_bars:{min:3,max:3}}},
  {id:'p2_kr_candle_rev',name:'캔들 반전',phase:'p2',group:'attack',desc:'반전패턴 + RSI 과매도 + 거래량↑ (최근 3봉 윈도우)',locked:true,conditions:{reversal_pattern:['morning_star','bullish_engulfing','morning_doji_star','abandoned_baby_bull','hammer','piercing','tweezer_bottom','harami_bull','dragonfly_doji'],rsi_value:{min:null,max:35},volume_avg20_ratio:{min:150,max:null},_recent_n_bars:{min:3,max:3}}},
  // ── 준비 ──
  {id:'p2_kr_squeeze',name:'변동성 폭발 대기',phase:'p2',group:'prep',desc:'BB 스퀴즈 + VHF 횡보 + 거래량 연속증가 + OBV 상승',locked:true,conditions:{bb_width:'스퀴즈 (수축)',vhf_state:'횡보장 (<0.3)',volume_consec_inc:{min:5,max:null},obv_trend:'상승 추세'}},
  {id:'p2_kr_accumulation',name:'세력 매집',phase:'p2',group:'prep',desc:'OBV상승 + A/D매집 + Chaikin매집 + 횡보 + 거래량↑',locked:true,conditions:{obv_trend:'상승 추세',ad_trend:'상승 추세',chaikin_osc:'양수 (매집)',change_rate:{min:-2,max:2},volume_avg20_ratio:{min:120,max:null}}},
  {id:'p2_kr_gap_support',name:'갭상승 후 지지',phase:'p2',group:'prep',desc:'갭상승 후 지지 + 거래량↑ + EOM매수 + VWAP위',locked:true,conditions:{gap_type:'갭상승 후 지지',volume_avg20_ratio:{min:150,max:null},eom_trend:'매수세 (상승)',vwap_position:'VWAP 위 (강세)'}},
  // ── 방어 (S161: 사진3 기반 추가 — 조건 기반 근사치) ──
  {id:'p2_kr_chase_defense',name:'추격매수 후보',phase:'p2',group:'defense',desc:'5일변동 15%↑ + 거래량 200%↑ + 52주고점 -5%↑ + 연속상승 2일↑ + OBV상승 (돌파 후 추격 모멘텀)',locked:true,conditions:{period_change:{min:15,max:null},volume_avg20_ratio:{min:200,max:null},week52_high_ratio:{min:-5,max:null},consecutive_up_down:{min:2,max:null},obv_trend:'상승 추세'}},
  {id:'p2_kr_sideways_avoid',name:'추세장 종목',phase:'p2',group:'defense',desc:'ADX 20↑ + VHF 추세장 + MACD 매수 (강한 추세 발굴)',locked:true,conditions:{adx_value:{min:20,max:null},vhf_state:'추세장 (>0.4)',macd_signal:'MACD > Signal (매수)'}},
  {id:'p2_kr_vol_extreme',name:'급등 후보',phase:'p2',group:'defense',desc:'당일 변동 8%↑ + 상승갭 + 등락률 3%↑ + 거래량 200%↑ (당일 강한 매수 분출)',locked:true,conditions:{intraday_range:{min:8,max:null},gap_type:'상승갭 종목',change_rate:{min:3,max:null},volume_avg20_ratio:{min:200,max:null}}},
  {id:'p2_kr_breakdown',name:'추세 가속',phase:'p2',group:'defense',desc:'MA60↑ + 정배열 + VWAP↑ + EOM매수 + RSI 60~70 + 거래량 150%↑ + 고점 근접 97% 이하 (과열 직전 가속, 추격 방어 포함)',locked:true,conditions:{price_vs_ma:'MA60 위',ma_arrangement:'정배열 (3개)',vwap_position:'VWAP 위 (강세)',eom_trend:'매수세 (상승)',rsi_value:{min:60,max:70},volume_avg20_ratio:{min:150,max:null},recent_high_proximity:{min:null,max:97}}},
  // [v1.9-1] 바닥 후보 — 점수 시스템 기반 종합 바닥 발굴 (반등 시작과 보완 관계).
  //   분석 점수만 사용 → BT 무관 모든 TF 활성
  {id:'p2_kr_bottom_pick',name:'바닥 후보',phase:'p2',group:'defense',desc:'반등 준비 70↑ + 반등 전환 70↑ + RSI 30↓ (과매도+반등 동력)',locked:true,conditions:{_ready_score:{min:70,max:100},_entry_score:{min:70,max:100},rsi_value:{min:0,max:30}}},
  // ── 환경 ──
  {id:'p2_kr_bull_env',name:'강세장 공격',phase:'p2',group:'env',desc:'정배열 + MACD매수 + 거래량폭발 (강세 종목)',locked:true,conditions:{ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',volume_avg20_ratio:{min:200,max:null}}},
  {id:'p2_kr_bear_env',name:'약세장 방어',phase:'p2',group:'env',desc:'RSI반등 + MACD골든 + BB하단 (최근 5봉 윈도우 — 약세장에서도 살아있는 종목 발굴)',locked:true,conditions:{rsi_value:{min:25,max:40},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',_recent_n_bars:{min:5,max:5}}},
];

const PRESETS_KR_P3 = [
  // [v2.6] 4축 점수 + 방향 전이 + 종합행동지침 6조건 프리셋
  //   v2.0 4축 룰 + 모멘텀 보정 + BT 상태까지 다 반영 — 신규 진입 좋은 종목 발굴 목적
  //   매수 (4합격 + 상승 + C판정 매수): 바닥≥60, 반등≥60, 추세≥50, 전략≥60, 방향=상승 전이중, C=매수
  //   관심 (3합격 + 상승 + C판정 관심): 바닥≥50, 반등≥50, 추세≥40, 전략≥50, 방향=상승 전이중, C=관심
  //   관망 (2합격 + 상승 + C판정 관망): 바닥≥40, 반등≥40, 추세≥30, 전략≥40, 방향=상승 전이중, C=관망
  //   세 칩 모두 '상승 전이중' 동반 — 점수 합격 + 모멘텀 살아있는 종목만 추출
  //   _bt_action 동반 — BT 보유중 종목 자동 제외 (이미 보유 ≠ 신규 진입)
  //   ※ 조건검색 탭에선 _bt_action 트리 노드 숨김 (프리셋만 사용 — 중복 방지)
  {id:'p3_kr_c_buy',  name:'매수',phase:'p3',desc:'순수 4축 60↑ (반등준비·반등전환·추세방향·추가상승 모두 합격) — 신규 진입 최적 후보',locked:true,conditions:{_ready_score:{min:60,max:100},_entry_score:{min:60,max:100},score_range:{min:60,max:100},_upside_score:{min:60,max:100}}},
  {id:'p3_kr_c_watch',name:'관심',phase:'p3',desc:'순수 4축 50↑ (4축 부분 합격) — 선행 포착 후보',locked:true,conditions:{_ready_score:{min:50,max:100},_entry_score:{min:50,max:100},score_range:{min:50,max:100},_upside_score:{min:50,max:100}}},
  {id:'p3_kr_c_observe',name:'관망',phase:'p3',desc:'순수 4축 40↑ (4축 약 합격) — 추가 모멘텀 대기 후보',locked:true,conditions:{_ready_score:{min:40,max:100},_entry_score:{min:40,max:100},score_range:{min:40,max:100},_upside_score:{min:40,max:100}}},
];

// ── COIN 프리셋 ──
const PRESETS_COIN_P1 = [];

const PRESETS_COIN_P2 = [
  // ── 공격 ──
  {id:'p2_coin_trend',name:'추세 라이딩',phase:'p2',group:'attack',desc:'정배열 + MACD매수 + OBV상승 + RSI 50~70 + VHF추세장 + 고점 근접 99% 이하',locked:true,conditions:{ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',obv_trend:'상승 추세',rsi_value:{min:50,max:70},vhf_state:'추세장 (>0.4)',recent_high_proximity:{min:null,max:99}}},
  {id:'p2_coin_pullback',name:'눌림목 매수',phase:'p2',group:'attack',desc:'정배열 + MA20 근접 + RSI 40~55 + OBV상승 + VHF추세장',locked:true,conditions:{ma_arrangement:'정배열 (3개)',ma_disparity:'MA20 근접 (±2%)',rsi_value:{min:40,max:55},obv_trend:'상승 추세',vhf_state:'추세장 (>0.4)'}},
  {id:'p2_coin_reversal',name:'과매도 반등',phase:'p2',group:'attack',desc:'RSI 과매도 + MACD 골든 + BB 하단 + 심리도 과매도 (최근 5봉 윈도우)',locked:true,conditions:{rsi_value:{min:20,max:35},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',psycho_value:{min:null,max:25},_recent_n_bars:{min:5,max:5}}},
  {id:'p2_coin_breakout',name:'급등 시작',phase:'p2',group:'attack',desc:'등락률 5%↑ + 거래량 200%↑ + VWAP위 + MACD매수 + EOM매수 + 5봉간 +40% 미만 (이미 급등한 것 제외, 최근 3봉)',locked:true,conditions:{change_rate:{min:5,max:null},volume_avg20_ratio:{min:200,max:null},vwap_position:'VWAP 위 (강세)',macd_signal:'MACD > Signal (매수)',eom_trend:'매수세 (상승)',recent_n_change:{min:null,max:40},_recent_n_bars:{min:3,max:3}}},
  // ── 준비 ──
  {id:'p2_coin_accumulation',name:'매집 감지',phase:'p2',group:'prep',desc:'OBV상승 + A/D매집 + Chaikin매집 + 횡보 + 거래량↑',locked:true,conditions:{obv_trend:'상승 추세',ad_trend:'상승 추세',chaikin_osc:'양수 (매집)',change_rate:{min:-3,max:3},volume_avg20_ratio:{min:150,max:null}}},
  {id:'p2_coin_squeeze',name:'변동성 폭발 대기',phase:'p2',group:'prep',desc:'BB 스퀴즈 + VHF 횡보 + 거래량 연속증가 + OBV 상승',locked:true,conditions:{bb_width:'스퀴즈 (수축)',vhf_state:'횡보장 (<0.3)',volume_consec_inc:{min:5,max:null},obv_trend:'상승 추세'}},
  // ── 방어 (S161-2: 코인 맞춤 임계값 — KR 대비 완화) ──
  {id:'p2_coin_chase_defense',name:'추격매수 후보',phase:'p2',group:'defense',desc:'5일변동 30%↑ + 거래량 300%↑ + 연속상승 2일↑ + OBV상승 (돌파 후 추격 모멘텀)',locked:true,conditions:{period_change:{min:30,max:null},volume_avg20_ratio:{min:300,max:null},consecutive_up_down:{min:2,max:null},obv_trend:'상승 추세'}},
  {id:'p2_coin_sideways_avoid',name:'추세장 종목',phase:'p2',group:'defense',desc:'ADX 20↑ + VHF 추세장 + MACD 매수 (강한 추세 발굴)',locked:true,conditions:{adx_value:{min:20,max:null},vhf_state:'추세장 (>0.4)',macd_signal:'MACD > Signal (매수)'}},
  {id:'p2_coin_vol_extreme',name:'급등 후보',phase:'p2',group:'defense',desc:'당일 변동 15%↑ + 상승갭 + 등락률 5%↑ + 거래량 250%↑ (당일 강한 매수 분출)',locked:true,conditions:{intraday_range:{min:15,max:null},gap_type:'상승갭 종목',change_rate:{min:5,max:null},volume_avg20_ratio:{min:250,max:null}}},
  // [v1.9-1] 바닥 후보 — 점수 시스템 기반 종합 바닥 발굴. 분석 점수만 사용 → BT 무관 모든 TF 활성
  {id:'p2_coin_bottom_pick',name:'바닥 후보',phase:'p2',group:'defense',desc:'반등 준비 70↑ + 반등 전환 70↑ + RSI 30↓ (과매도+반등 동력)',locked:true,conditions:{_ready_score:{min:70,max:100},_entry_score:{min:70,max:100},rsi_value:{min:0,max:30}}},
  // ── 환경 ──
  {id:'p2_coin_bull_env',name:'강세장 공격',phase:'p2',group:'env',desc:'정배열 + MACD매수 + 거래량폭발 (강세 종목)',locked:true,conditions:{ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',volume_avg20_ratio:{min:200,max:null},eom_trend:'매수세 (상승)'}},
  {id:'p2_coin_bear_env',name:'약세장 방어',phase:'p2',group:'env',desc:'RSI과매도 + MACD골든 + BB하단 (약세장에서 살아있는 종목)',locked:true,conditions:{rsi_value:{min:20,max:35},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',_recent_n_bars:{min:5,max:5}}},
];

const PRESETS_COIN_P3 = [
  // [v2.6] 4축 점수 + 방향 전이 + 종합행동지침 6조건 프리셋
  //   KR과 동일 기준 — 점수/모멘텀/판정은 시장 무관하게 정규화되어 동일 임계 적용
  {id:'p3_coin_c_buy',  name:'매수',phase:'p3',desc:'순수 4축 60↑ (반등준비·반등전환·추세방향·추가상승 모두 합격) — 신규 진입 최적 후보',locked:true,conditions:{_ready_score:{min:60,max:100},_entry_score:{min:60,max:100},score_range:{min:60,max:100},_upside_score:{min:60,max:100}}},
  {id:'p3_coin_c_watch',name:'관심',phase:'p3',desc:'순수 4축 50↑ (4축 부분 합격) — 선행 포착 후보',locked:true,conditions:{_ready_score:{min:50,max:100},_entry_score:{min:50,max:100},score_range:{min:50,max:100},_upside_score:{min:50,max:100}}},
  {id:'p3_coin_c_observe',name:'관망',phase:'p3',desc:'순수 4축 40↑ (4축 약 합격) — 추가 모멘텀 대기 후보',locked:true,conditions:{_ready_score:{min:40,max:100},_entry_score:{min:40,max:100},score_range:{min:40,max:100},_upside_score:{min:40,max:100}}},
];

// ── US 프리셋 ──
const PRESETS_US_P1 = [];

const PRESETS_US_P2 = [
  // ── 공격 ──
  {id:'p2_us_trend',name:'추세 추종',phase:'p2',group:'attack',desc:'정배열 + MACD매수 + OBV상승 + HH/HL + RSI 50~70 + VHF추세장 + 고점 근접 99% 이하',locked:true,conditions:{ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',obv_trend:'상승 추세',swing_structure:'HH+HL (상승구조)',rsi_value:{min:50,max:70},vhf_state:'추세장 (>0.4)',recent_high_proximity:{min:null,max:99}}},
  {id:'p2_us_pullback',name:'눌림목 매수',phase:'p2',group:'attack',desc:'정배열 + MA20 근접 + RSI 40~55 + OBV상승 + VHF추세장',locked:true,conditions:{ma_arrangement:'정배열 (3개)',ma_disparity:'MA20 근접 (±2%)',rsi_value:{min:40,max:55},obv_trend:'상승 추세',vhf_state:'추세장 (>0.4)'}},
  {id:'p2_us_reversal',name:'과매도 반등',phase:'p2',group:'attack',desc:'RSI 과매도 + MACD 골든 + BB 하단 + 심리도 과매도 (최근 5봉 윈도우)',locked:true,conditions:{rsi_value:{min:20,max:35},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',psycho_value:{min:null,max:25},_recent_n_bars:{min:5,max:5}}},
  {id:'p2_us_breakout',name:'급등 시작',phase:'p2',group:'attack',desc:'20일 신고가 + 거래량 200%↑ + VWAP위 + MACD매수 + EOM매수 + 5봉간 +20% 미만 (이미 급등한 것 제외, 최근 3봉)',locked:true,conditions:{new_high_low:'20일 신고가',volume_avg20_ratio:{min:200,max:null},vwap_position:'VWAP 위 (강세)',macd_signal:'MACD > Signal (매수)',eom_trend:'매수세 (상승)',recent_n_change:{min:null,max:20},_recent_n_bars:{min:3,max:3}}},
  {id:'p2_us_candle_rev',name:'캔들 반전',phase:'p2',group:'attack',desc:'반전패턴 + RSI 과매도 + 거래량↑ (최근 3봉 윈도우)',locked:true,conditions:{reversal_pattern:['morning_star','bullish_engulfing','morning_doji_star','abandoned_baby_bull','hammer','piercing','tweezer_bottom','harami_bull','dragonfly_doji'],rsi_value:{min:null,max:35},volume_avg20_ratio:{min:150,max:null},_recent_n_bars:{min:3,max:3}}},
  // ── 준비 (S161-2: 신규) ──
  {id:'p2_us_accumulation',name:'매집 감지',phase:'p2',group:'prep',desc:'OBV상승 + A/D매집 + Chaikin매집 + 횡보 + 거래량↑',locked:true,conditions:{obv_trend:'상승 추세',ad_trend:'상승 추세',chaikin_osc:'양수 (매집)',change_rate:{min:-2,max:2},volume_avg20_ratio:{min:120,max:null}}},
  {id:'p2_us_squeeze',name:'변동성 폭발 대기',phase:'p2',group:'prep',desc:'BB 스퀴즈 + VHF 횡보 + 거래량 연속증가 + OBV 상승',locked:true,conditions:{bb_width:'스퀴즈 (수축)',vhf_state:'횡보장 (<0.3)',volume_consec_inc:{min:5,max:null},obv_trend:'상승 추세'}},
  {id:'p2_us_gap_support',name:'갭상승 후 지지',phase:'p2',group:'prep',desc:'갭상승 후 지지 + 거래량↑ + EOM매수 + VWAP위',locked:true,conditions:{gap_type:'갭상승 후 지지',volume_avg20_ratio:{min:150,max:null},eom_trend:'매수세 (상승)',vwap_position:'VWAP 위 (강세)'}},
  // ── 방어 (S161-2: 신규, US 맞춤 임계값 — KR보다 타이트) ──
  {id:'p2_us_chase_defense',name:'추격매수 후보',phase:'p2',group:'defense',desc:'5일변동 10%↑ + 거래량 180%↑ + 52주고점 -3%↑ + 연속상승 2일↑ + OBV상승 (돌파 후 추격 모멘텀)',locked:true,conditions:{period_change:{min:10,max:null},volume_avg20_ratio:{min:180,max:null},week52_high_ratio:{min:-3,max:null},consecutive_up_down:{min:2,max:null},obv_trend:'상승 추세'}},
  {id:'p2_us_sideways_avoid',name:'추세장 종목',phase:'p2',group:'defense',desc:'ADX 20↑ + VHF 추세장 + MACD 매수 (강한 추세 발굴)',locked:true,conditions:{adx_value:{min:20,max:null},vhf_state:'추세장 (>0.4)',macd_signal:'MACD > Signal (매수)'}},
  {id:'p2_us_vol_extreme',name:'급등 후보',phase:'p2',group:'defense',desc:'당일 변동 6%↑ + 상승갭 + 등락률 2%↑ + 거래량 180%↑ (당일 강한 매수 분출)',locked:true,conditions:{intraday_range:{min:6,max:null},gap_type:'상승갭 종목',change_rate:{min:2,max:null},volume_avg20_ratio:{min:180,max:null}}},
  // [v1.9-1] 바닥 후보 — 점수 시스템 기반 종합 바닥 발굴. 분석 점수만 사용 → BT 무관 모든 TF 활성
  {id:'p2_us_bottom_pick',name:'바닥 후보',phase:'p2',group:'defense',desc:'반등 준비 70↑ + 반등 전환 70↑ + RSI 30↓ (과매도+반등 동력)',locked:true,conditions:{_ready_score:{min:70,max:100},_entry_score:{min:70,max:100},rsi_value:{min:0,max:30}}},
  // ── 환경 ──
  {id:'p2_us_bull_env',name:'강세장 공격',phase:'p2',group:'env',desc:'정배열 + MACD매수 + HH/HL + VWAP위 + 거래량폭발 (강세 종목)',locked:true,conditions:{ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',swing_structure:'HH+HL (상승구조)',vwap_position:'VWAP 위 (강세)',volume_avg20_ratio:{min:200,max:null}}},
  {id:'p2_us_bear_env',name:'약세장 방어',phase:'p2',group:'env',desc:'RSI과매도 + MACD골든 + BB하단 + PER저평가 + 배당 (약세장에서 살아있는 종목)',locked:true,conditions:{rsi_value:{min:0,max:30},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',per:{min:0,max:15},dividend_yield:{min:2,max:null},_recent_n_bars:{min:5,max:5}}},
];

const PRESETS_US_P3 = [
  // [v2.6] 4축 점수 + 방향 전이 + 종합행동지침 6조건 프리셋
  //   KR/COIN과 동일 기준 — 점수/모멘텀/판정은 시장 무관하게 정규화되어 동일 임계 적용
  {id:'p3_us_c_buy',  name:'매수',phase:'p3',desc:'순수 4축 60↑ (반등준비·반등전환·추세방향·추가상승 모두 합격) — 신규 진입 최적 후보',locked:true,conditions:{_ready_score:{min:60,max:100},_entry_score:{min:60,max:100},score_range:{min:60,max:100},_upside_score:{min:60,max:100}}},
  {id:'p3_us_c_watch',name:'관심',phase:'p3',desc:'순수 4축 50↑ (4축 부분 합격) — 선행 포착 후보',locked:true,conditions:{_ready_score:{min:50,max:100},_entry_score:{min:50,max:100},score_range:{min:50,max:100},_upside_score:{min:50,max:100}}},
  {id:'p3_us_c_observe',name:'관망',phase:'p3',desc:'순수 4축 40↑ (4축 약 합격) — 추가 모멘텀 대기 후보',locked:true,conditions:{_ready_score:{min:40,max:100},_entry_score:{min:40,max:100},score_range:{min:40,max:100},_upside_score:{min:40,max:100}}},
];

// ── 프리셋 접근 함수 ──
function getPhasePresets(phase){
  if(currentMarket==='coin'){
    if(phase==='p1') return PRESETS_COIN_P1;
    if(phase==='p2') return PRESETS_COIN_P2;
    if(phase==='p3') return PRESETS_COIN_P3;
  } else if(currentMarket==='us'){
    if(phase==='p1') return PRESETS_US_P1;
    if(phase==='p2') return PRESETS_US_P2;
    if(phase==='p3') return PRESETS_US_P3;
  } else {
    if(phase==='p1') return PRESETS_KR_P1;
    if(phase==='p2') return PRESETS_KR_P2;
    if(phase==='p3') return PRESETS_KR_P3;
  }
  return [];
}

function getAllPhasePresets(){
  return [...getPhasePresets('p1'), ...getPhasePresets('p2'), ...getPhasePresets('p3')];
}

// ── 하위호환: 기존 getDefaultPresets 유지 ──
function getDefaultPresets(){ return getAllPhasePresets(); }

// ── 프리셋 조합 (+ 시스템) ──
// activePresetCombo: [{phase:'p1',presetId:'p1_kr_large'}, {phase:'p2',presetId:'p2_kr_trend'}, ...]
let activePresetCombo = [];

function addPresetToCombo(presetId){
  const all = getAllPhasePresets();
  const p = all.find(x=>x.id===presetId);
  if(!p) return false;
  // 같은 Phase 기존 프리셋 교체
  activePresetCombo = activePresetCombo.filter(c=>c.phase!==p.phase);
  activePresetCombo.push({phase:p.phase, presetId:p.id});
  return true;
}

function removePresetFromCombo(phase){
  activePresetCombo = activePresetCombo.filter(c=>c.phase!==phase);
}

function clearPresetCombo(){
  activePresetCombo = [];
}

function getComboConditions(){
  // 모든 선택된 프리셋의 conditions를 병합 (나중 Phase가 덮어쓰기)
  const merged = {};
  const all = getAllPhasePresets();
  // Phase 순서대로 병합 (p1 → p2 → p3)
  ['p1','p2','p3'].forEach(ph=>{
    const combo = activePresetCombo.find(c=>c.phase===ph);
    if(!combo) return;
    const preset = all.find(p=>p.id===combo.presetId);
    if(!preset) return;
    Object.assign(merged, preset.conditions);
  });
  return merged;
}

function getComboPresetNames(){
  const all = getAllPhasePresets();
  return activePresetCombo.map(c=>{
    const p = all.find(x=>x.id===c.presetId);
    return p ? {phase:c.phase, name:p.name, id:p.id} : null;
  }).filter(Boolean);
}

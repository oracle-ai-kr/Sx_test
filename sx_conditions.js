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
      {id:'exclude_types',name:'제외 종목',type:'multi_check',options:[
        {id:'managed',name:'관리종목',default:true},{id:'warning',name:'투자경고/위험',default:true},
        {id:'preferred',name:'우선주',default:true},{id:'suspended',name:'거래정지',default:true},
        {id:'cleanup',name:'정리매매',default:true},{id:'etf',name:'ETF',default:true},
        {id:'etn',name:'ETN',default:true},{id:'spac',name:'스팩(SPAC)',default:true},
        {id:'reits',name:'리츠(REITs)',default:false},{id:'unfaithful',name:'불성실공시',default:false},
        {id:'overheated',name:'단기과열종목',default:false},{id:'low_liquidity',name:'초저유동성',default:false},
      ],source:'local'},
      {id:'disclosure_filter',name:'공시키워드 제외 (DART)',type:'toggle',default:false,source:'dart_disclosure',desc:'위험 공시(상폐/파산/관리종목/자본잠식 등) 감지 종목 자동 제외'},
    ]},
    {id:'scope_basic',name:'기본 정보',conditions:[
      {id:'market_cap',name:'시가총액',type:'range',unit:'억원',min:0,max:5000000,default:{min:100,max:null},source:'krx_market_cap'},
      {id:'listed_shares',name:'상장주식수',type:'range',unit:'주',min:0,max:null,default:{min:null,max:null},source:'krx_market_cap'},
      {id:'face_value',name:'액면가',type:'range',unit:'원',min:0,max:50000,default:{min:null,max:null},source:'krx_stock_list'},
      {id:'capital',name:'자본금',type:'range',unit:'억원',min:0,max:null,default:{min:null,max:null},source:'krx_stock_list'},
    ]},
  ]},
  {id:'price_analysis',name:'시세분석',phase:'p1',groups:[
    {id:'price_cond',name:'가격 조건',conditions:[
      {id:'price_range',name:'현재가 범위',type:'range',unit:'원',min:0,max:10000000,default:{min:1000,max:500000},source:'kis_price'},
      {id:'change_rate',name:'전일대비 등락률',type:'range',unit:'%',min:-30,max:30,default:{min:null,max:null},source:'kis_price'},
      {id:'open_change_rate',name:'시가대비 등락률',type:'range',unit:'%',min:-30,max:30,default:{min:null,max:null},source:'kis_price'},
      {id:'week52_high_ratio',name:'52주 최고가 대비',type:'range',unit:'%',min:-90,max:0,default:{min:null,max:null},source:'yahoo_fundamental',desc:'현재가÷52주최고-1'},
      {id:'week52_low_ratio',name:'52주 최저가 대비',type:'range',unit:'%',min:0,max:500,default:{min:null,max:null},source:'yahoo_fundamental',desc:'현재가÷52주최저-1'},
      {id:'consecutive_up_down',name:'연속 상승/하락',type:'range',unit:'일',min:-20,max:20,default:{min:null,max:null},source:'naver_sise',desc:'양수=상승, 음수=하락'},
      {id:'price_vs_ma',name:'이동평균 대비 위치',type:'select',options:['설정안함','MA5 위','MA5 아래','MA20 위','MA20 아래','MA60 위','MA60 아래','MA120 위','MA120 아래'],default:'설정안함',source:'naver_sise'},
      {id:'new_high_low',name:'신고가/신저가',type:'select',options:['설정안함','52주 신고가','52주 신저가','연중 신고가','연중 신저가','20일 신고가','20일 신저가'],default:'설정안함',source:'calc_candle',desc:'기간별 고가/저가 갱신'},
      {id:'gap_type',name:'갭 발생',type:'select',options:['설정안함','상승갭 종목','하락갭 종목','갭상승 후 지지','갭하락 후 저항','상승갭 제외'],default:'설정안함',source:'calc_candle',desc:'시가갭 발생 여부 (상승갭 제외 = 오늘 상승갭 발생 종목 회피)'},
      {id:'intraday_range',name:'당일 변동폭',type:'range',unit:'%',min:0,max:30,default:{min:null,max:null},source:'calc_candle',desc:'(고가-저가)/전일종가'},
      {id:'period_change',name:'N일간 주가변동폭',type:'range',unit:'%',min:-80,max:200,default:{min:null,max:null},source:'calc_candle',desc:'5일간 등락률'},
      {id:'upper_shadow_pct',name:'윗꼬리 비율',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'윗꼬리/전체봉 길이'},
      {id:'lower_shadow_pct',name:'아랫꼬리 비율',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'아랫꼬리/전체봉 길이'},
    ]},
    {id:'volume_cond',name:'거래량/거래대금',conditions:[
      {id:'volume_min',name:'거래량 (당일)',type:'range',unit:'주',min:0,max:null,default:{min:50000,max:null},source:'kis_price'},
      {id:'volume_prev_ratio',name:'전일대비 거래량 비율',type:'range',unit:'%',min:0,max:10000,default:{min:null,max:null},source:'kis_price',desc:'당일÷전일×100'},
      {id:'volume_avg20_ratio',name:'20일 평균 대비 거래량',type:'range',unit:'%',min:0,max:10000,default:{min:null,max:null},source:'calc_candle',desc:'당일거래량÷20일평균×100'},
      {id:'trade_amount',name:'거래대금',type:'range',unit:'백만원',min:0,max:null,default:{min:500,max:null},source:'kis_price'},
      {id:'volume_turnover',name:'거래량 회전율',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'krx_market_cap'},
      {id:'volume_consec_inc',name:'거래량 연속 증가',type:'range',unit:'일',min:1,max:20,default:{min:null,max:null},source:'calc_candle',desc:'연속 거래량 증가 일수'},
    ]},
    {id:'foreign_cond',name:'외국인',conditions:[
      {id:'foreign_ratio',name:'외국인 지분율',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'krx_market_cap'},
      {id:'foreign_net_buy',name:'외국인 순매수량',type:'range',unit:'주',min:null,max:null,default:{min:null,max:null},source:'krx_investor',desc:'양수=순매수, 음수=순매도'},
      {id:'foreign_net_buy_days',name:'외국인 연속 순매수/순매도',type:'range',unit:'일',min:-60,max:60,default:{min:null,max:null},source:'naver_investor'},
      {id:'foreign_exhaustion',name:'외국인 소진율',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'naver_sise'},
    ]},
    {id:'institution_cond',name:'기관/프로그램',conditions:[
      {id:'inst_net_buy',name:'기관 순매수량',type:'range',unit:'주',min:null,max:null,default:{min:null,max:null},source:'krx_investor'},
      {id:'inst_net_buy_days',name:'기관 연속 순매수/순매도',type:'range',unit:'일',min:-60,max:60,default:{min:null,max:null},source:'naver_investor'},
      {id:'program_net_buy',name:'프로그램 순매수',type:'range',unit:'백만원',min:null,max:null,default:{min:null,max:null},source:'krx_program'},
    ]},
    {id:'short_cond',name:'공매도/대차',conditions:[
      {id:'short_ratio',name:'공매도 비중',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'krx_short_selling'},
      {id:'short_balance_ratio',name:'공매도 잔고 비중',type:'range',unit:'%',min:0,max:20,default:{min:null,max:null},source:'krx_short_selling'},
    ]},
    {id:'realtime_cond',name:'실시간 시세 [KIS]',kisRequired:true,conditions:[
      {id:'bid_ask_ratio',name:'매도매수잔량비',type:'range',unit:'%',min:0,max:500,default:{min:null,max:null},source:'kis_orderbook',desc:'매수잔량÷매도잔량×100',kisRequired:true},
      {id:'total_bid_qty',name:'총 매수잔량',type:'range',unit:'주',min:0,max:null,default:{min:null,max:null},source:'kis_orderbook',kisRequired:true},
      {id:'total_ask_qty',name:'총 매도잔량',type:'range',unit:'주',min:0,max:null,default:{min:null,max:null},source:'kis_orderbook',kisRequired:true},
      {id:'trade_strength',name:'체결강도',type:'range',unit:'%',min:0,max:300,default:{min:null,max:null},source:'kis_conclusion',desc:'매수체결÷매도체결×100',kisRequired:true},
      {id:'buy_ratio',name:'매수비율',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'kis_conclusion',kisRequired:true},
    ]},
    {id:'intraday_cond',name:'당일 분봉 [KIS]',kisRequired:true,conditions:[
      {id:'intraday_high_break',name:'당일 전고점 돌파',type:'select',options:['설정안함','돌파','미돌파'],default:'설정안함',source:'kis_minute',kisRequired:true},
      {id:'intraday_vwap_pos',name:'분봉 VWAP 위치',type:'select',options:['설정안함','VWAP 위','VWAP 아래'],default:'설정안함',source:'kis_minute',kisRequired:true},
      {id:'program_realtime',name:'프로그램 실시간 순매수',type:'range',unit:'백만원',min:null,max:null,default:{min:null,max:null},source:'kis_program',kisRequired:true},
    ]},
  ]},
  {id:'fundamental',name:'재무분석',phase:'p1',groups:[
    {id:'fund_valuation',name:'주가지표 (밸류에이션)',conditions:[
      {id:'per',name:'PER',type:'range',unit:'배',min:-100,max:200,default:{min:0,max:30},source:'yahoo_fundamental'},
      {id:'pbr',name:'PBR',type:'range',unit:'배',min:0,max:50,default:{min:0,max:5},source:'yahoo_fundamental'},
      {id:'psr',name:'PSR',type:'range',unit:'배',min:0,max:100,default:{min:0,max:10},source:'naver_finance'},
      {id:'ev_ebitda',name:'EV/EBITDA',type:'range',unit:'배',min:-50,max:100,default:{min:0,max:20},source:'naver_finance',desc:'현금 미반영 근사치'},
      {id:'eps',name:'EPS',type:'range',unit:'원',min:null,max:null,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'bps',name:'BPS',type:'range',unit:'원',min:null,max:null,default:{min:null,max:null},source:'naver_finance'},
      {id:'dividend_yield',name:'배당수익률',type:'range',unit:'%',min:0,max:30,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'pcr',name:'PCR',type:'range',unit:'배',min:0,max:100,default:{min:null,max:null},source:'naver_finance',desc:'영업이익 대용 근사치 (영업CF 미분리)'},
      {id:'peg',name:'PEG',type:'range',unit:'',min:-10,max:10,default:{min:0,max:2},source:'naver_finance',desc:'PER/EPS성장률 (성장률>0일 때만)'},
    ]},
    {id:'fund_profit',name:'수익성',conditions:[
      {id:'roe',name:'ROE',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'roa',name:'ROA',type:'range',unit:'%',min:-100,max:100,default:{min:null,max:null},source:'naver_finance',desc:'순이익/총자산'},
      {id:'operating_margin',name:'영업이익률',type:'range',unit:'%',min:-100,max:100,default:{min:null,max:null},source:'naver_finance'},
      {id:'net_margin',name:'순이익률',type:'range',unit:'%',min:-200,max:200,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'ebitda_margin',name:'EBITDA 마진율',type:'range',unit:'%',min:-100,max:100,default:{min:null,max:null},source:'naver_finance',desc:'영업이익/매출 근사치 (감가상각 미분리)'},
    ]},
    {id:'fund_growth',name:'성장성',conditions:[
      {id:'revenue_growth',name:'매출액 증감률',type:'range',unit:'%',min:-100,max:500,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'operating_profit_growth',name:'영업이익 증감률',type:'range',unit:'%',min:-100,max:1000,default:{min:null,max:null},source:'naver_finance'},
      {id:'net_income_growth',name:'순이익 증감률',type:'range',unit:'%',min:-100,max:1000,default:{min:null,max:null},source:'naver_finance'},
      {id:'eps_growth',name:'EPS 증감률',type:'range',unit:'%',min:-100,max:1000,default:{min:null,max:null},source:'yahoo_fundamental'},
    ]},
    {id:'fund_stability',name:'안정성',conditions:[
      {id:'debt_ratio',name:'부채비율',type:'range',unit:'%',min:0,max:1000,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'current_ratio',name:'유동비율',type:'range',unit:'%',min:0,max:1000,default:{min:null,max:null},source:'naver_finance',desc:'총자산/총부채 근사치 (유동항목 미분리)'},
      {id:'interest_coverage',name:'이자보상배율',type:'range',unit:'배',min:0,max:100,default:{min:null,max:null},source:'naver_finance',desc:'DART 이자비용 미분리 → 네이버 폴백 전용'},
    ]},
  ]},
  {id:'ranking',name:'순위분석',phase:'p1',groups:[
    {id:'rank_price',name:'시세 순위',conditions:[
      {id:'rank_change_rate',name:'등락률 상위',type:'range',unit:'위',min:1,max:500,default:{min:null,max:null},source:'krx_market_cap'},
      {id:'rank_volume',name:'거래량 상위',type:'range',unit:'위',min:1,max:500,default:{min:null,max:null},source:'krx_market_cap'},
      {id:'rank_trade_amount',name:'거래대금 상위',type:'range',unit:'위',min:1,max:500,default:{min:null,max:null},source:'krx_market_cap'},
      {id:'rank_market_cap',name:'시가총액 상위',type:'range',unit:'위',min:1,max:2000,default:{min:null,max:null},source:'krx_market_cap'},
      {id:'rank_foreign_ratio',name:'외국인보유 상위',type:'range',unit:'위',min:1,max:500,default:{min:null,max:null},source:'krx_market_cap'},
      {id:'rank_volume_change',name:'거래량증감률 상위',type:'range',unit:'위',min:1,max:500,default:{min:null,max:null},source:'krx_market_cap',desc:'전일대비 거래량 증감 순위'},
      {id:'rank_volatility',name:'변동폭 상위',type:'range',unit:'위',min:1,max:500,default:{min:null,max:null},source:'krx_market_cap',desc:'고가-저가 변동폭 순위'},
    ]},
  ]},
  // ── Phase 2: 엔진 기반 ──
  {id:'technical',name:'기술적분석',phase:'p2',groups:[
    {id:'ta_ma',name:'이동평균선',conditions:[
      {id:'ma_cross',name:'MA 크로스',type:'select',options:['설정안함','골든크로스 (5×20)','데드크로스 (5×20)','골든크로스 (20×60)','데드크로스 (20×60)'],default:'설정안함',source:'calc_candle'},
      {id:'ma_arrangement',name:'MA 배열',type:'select',options:['설정안함','정배열 (3개)','정배열 (4개)','역배열 (3개)','역배열 (4개)'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_trend',name:'추세지표',conditions:[
      {id:'macd_signal',name:'MACD 시그널',type:'select',options:['설정안함','MACD > Signal (매수)','MACD < Signal (매도)','골든크로스 (3일 이내)','데드크로스 (3일 이내)'],default:'설정안함',source:'calc_candle'},
      {id:'adx_value',name:'ADX (추세강도)',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle'},
      {id:'parabolic_sar',name:'Parabolic SAR',type:'select',options:['설정안함','SAR 아래 (상승 추세)','SAR 위 (하락 추세)'],default:'설정안함',source:'calc_candle'},
      {id:'eom_trend',name:'EOM (이동용이도)',type:'select',options:['설정안함','매수세 (상승)','매도세 (하락)','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'가격 움직임의 용이도'},
      {id:'vhf_state',name:'VHF (추세판별)',type:'select',options:['설정안함','추세장 (>0.4)','횡보장 (<0.3)','보통'],default:'설정안함',source:'calc_candle',desc:'추세 vs 횡보 판별'},
    ]},
    {id:'ta_momentum',name:'모멘텀지표',conditions:[
      {id:'rsi_value',name:'RSI',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle'},
      {id:'stoch_k',name:'Stochastic %K',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle'},
      {id:'stoch_cross',name:'Stochastic 크로스',type:'select',options:['설정안함','%K > %D (매수)','%K < %D (매도)','골든크로스 (과매도권)','데드크로스 (과매수권)'],default:'설정안함',source:'calc_candle'},
      {id:'cci_value',name:'CCI',type:'range',unit:'',min:-300,max:300,default:{min:null,max:null},source:'calc_candle'},
      {id:'mfi_value',name:'MFI',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle'},
      {id:'psycho_value',name:'심리도',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'25↓=과매도, 75↑=과매수'},
      {id:'new_psycho_value',name:'신심리도',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'EMA 보정 심리도'},
      {id:'ab_ratio_trend',name:'AB Ratio',type:'select',options:['설정안함','매수세 우위 (A>B)','매도세 우위 (A<B)','균형'],default:'설정안함',source:'calc_candle',desc:'고가-시가 vs 시가-저가'},
      {id:'chaikin_osc',name:'Chaikin Oscillator',type:'select',options:['설정안함','양수 (매집)','음수 (분산)','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'A/D선 모멘텀'},
    ]},
    {id:'ta_channel',name:'채널/밴드',conditions:[
      {id:'bb_position',name:'볼린저 밴드 위치',type:'select',options:['설정안함','상단 돌파','상단 근접','중심선 위','중심선 아래','하단 근접','하단 이탈'],default:'설정안함',source:'calc_candle'},
      {id:'bb_width',name:'볼린저 밴드 폭',type:'select',options:['설정안함','스퀴즈 (수축)','확장중'],default:'설정안함',source:'calc_candle'},
      {id:'band_pctb',name:'Band %b',type:'range',unit:'',min:-0.5,max:1.5,default:{min:null,max:null},source:'calc_candle',desc:'0=하단, 0.5=중심, 1=상단'},
      {id:'envelope_position',name:'엔벨로프 위치',type:'select',options:['설정안함','상단 돌파','상단 근접','중심선 위','중심선 아래','하단 근접','하단 이탈'],default:'설정안함',source:'calc_candle'},
      {id:'pivot_level',name:'피봇 레벨',type:'select',options:['설정안함','R2 이상','R1~R2','P~R1','S1~P','S1~S2','S2 이하'],default:'설정안함',source:'calc_candle'},
      {id:'price_channel',name:'가격채널 (N일)',type:'select',options:['설정안함','상단 돌파','상단 반','하단 반','하단 이탈'],default:'설정안함',source:'calc_candle'},
      {id:'ma_disparity',name:'MA 이격도',type:'select',options:['설정안함','MA20 +5%↑ 과열','MA20 -5%↓ 침체','MA60 +10%↑ 과열','MA60 -10%↓ 침체','MA20 근접 (±2%)','MA60 근접 (±2%)'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_ichimoku',name:'일목균형표',conditions:[
      {id:'ichimoku_cloud',name:'구름 위치',type:'select',options:['설정안함','구름 위 (강세)','구름 안 (중립)','구름 아래 (약세)'],default:'설정안함',source:'calc_candle'},
      {id:'ichimoku_cross',name:'전환선/기준선',type:'select',options:['설정안함','전환선 > 기준선 (매수)','전환선 < 기준선 (매도)'],default:'설정안함',source:'calc_candle'},
      {id:'ichimoku_cloud_change',name:'구름 전환',type:'select',options:['설정안함','구름 양전환 (적→녹)','구름 음전환 (녹→적)'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_volume',name:'거래량 지표',conditions:[
      {id:'obv_trend',name:'OBV 추세',type:'select',options:['설정안함','상승 추세','하락 추세','OBV 다이버전스 (가격↓ OBV↑)'],default:'설정안함',source:'calc_candle'},
      {id:'volume_ma_arr',name:'거래량 MA 배열',type:'select',options:['설정안함','거래량 정배열','거래량 역배열'],default:'설정안함',source:'calc_candle'},
      {id:'ad_trend',name:'A/D선 추세',type:'select',options:['설정안함','상승 (매집)','하락 (분산)','매집 다이버전스 (가격↓ A/D↑)'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_momentum_ext',name:'모멘텀 확장',conditions:[
      {id:'trix_signal',name:'TRIX',type:'select',options:['설정안함','골든크로스','데드크로스','양수 (상승추세)','음수 (하락추세)'],default:'설정안함',source:'calc_candle'},
      {id:'stoch_slow_cross',name:'Stochastic Slow',type:'select',options:['설정안함','골든크로스 (과매도권)','데드크로스 (과매수권)'],default:'설정안함',source:'calc_candle'},
      {id:'macd_osc',name:'MACD Oscillator',type:'select',options:['설정안함','양수 (매수세)','음수 (매도세)','반전 상승','반전 하락'],default:'설정안함',source:'calc_candle'},
      {id:'price_osc_value',name:'Price Oscillator',type:'select',options:['설정안함','양수 (상승추세)','음수 (하락추세)'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_other',name:'기타 지표',conditions:[
      {id:'demark_setup',name:'Demark TD Setup',type:'select',options:['설정안함','매수셋업 ≥9 (하락소진)','매도셋업 ≥9 (상승소진)','매수셋업 진행중','매도셋업 진행중'],default:'설정안함',source:'calc_candle',desc:'TD Sequential 추세소진'},
      {id:'tlb_direction',name:'삼선전환도',type:'select',options:['설정안함','양전환 (상승)','음전환 (하락)'],default:'설정안함',source:'calc_candle'},
      {id:'binary_wave',name:'Binary Wave',type:'select',options:['설정안함','풀 매수 (5/5)','강한 매수 (4/5)','풀 매도 (0/5)','강한 매도 (1/5)'],default:'설정안함',source:'calc_candle'},
      {id:'sonar_signal',name:'Sonar 모멘텀',type:'select',options:['설정안함','매수 신호','매도 신호'],default:'설정안함',source:'calc_candle'},
      {id:'mass_index',name:'Mass Index',type:'select',options:['설정안함','Reversal Bulge (반전신호)','Setup (MI>27)','안정 (MI<26.5)'],default:'설정안함',source:'calc_candle',desc:'변동성 확장/수축'},
      {id:'vwap_position',name:'VWAP 위치',type:'select',options:['설정안함','VWAP 위 (강세)','VWAP 근처 (±1%)','VWAP 아래 (약세)'],default:'설정안함',source:'calc_candle'},
      {id:'swing_structure',name:'구조 패턴 (HH/HL)',type:'select',options:['설정안함','Higher High (고점 상승)','HH+HL (상승구조)','Lower Low (저점 하락)'],default:'설정안함',source:'calc_candle'},
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
  ]},
  {id:'market_env',name:'시장환경',phase:'p2',groups:[
    {id:'env_state',name:'시장 상태',conditions:[
      {id:'mkt_env_state',name:'시장 환경',type:'select',options:['설정안함','강세 포함 (mild_bull+bull)','강세 (bull)','약세강세 (mild_bull)','중립 (neutral)','약세약세 (mild_bear)','약세 (bear)','약세 포함 (mild_bear+bear)'],default:'설정안함',source:'oracle_index',desc:'ORACLE 지수 데이터 기반'},
    ]},
    {id:'env_index',name:'지수 등락률',conditions:[
      {id:'mkt_env_kospi_chg',name:'KOSPI 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index',desc:'당일 KOSPI 등락률'},
      {id:'mkt_env_kosdaq_chg',name:'KOSDAQ 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index',desc:'당일 KOSDAQ 등락률'},
    ]},
  ]},
  // ── Phase 3: 검증 분석 ──
  {id:'engine_verdict',name:'엔진 판정',phase:'p3',groups:[
    {id:'ta_signal',name:'분석 판정',conditions:[
      {id:'score_range',name:'추세 강도 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추세 강도 0~100 (분석탭 "추세 강도")'},
      {id:'_ready_score',name:'바닥 신호 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'바닥 조건 축적도 0~100 (분석탭 "바닥 신호" — 과매도+수축+바닥)'},
      {id:'_entry_score',name:'반등 신호 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'반등 신호 감지 0~100 (분석탭 "반등 신호" — RSI반등+MACD전환)'},
      {id:'_safety_clean',name:'안전필터 클린',type:'select',options:['설정안함','클린 (0개)','1개 이하','2개 이하'],default:'설정안함',source:'calc_candle',desc:'안전필터 미충족 사유 개수'},
      {id:'_regime_label',name:'시장 레짐',type:'select',options:['설정안함','상승추세','하락추세','횡보/약세','횡보/강세'],default:'설정안함',source:'calc_candle',desc:'ADX+BB폭 기반 시장 레짐'},
      {id:'_squeeze',name:'BB 스퀴즈',type:'select',options:['설정안함','스퀴즈 중','스퀴즈 아님'],default:'설정안함',source:'calc_candle',desc:'볼린저밴드 수축 상태'},
      {id:'_rsi_div',name:'RSI 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔RSI 괴리'},
      {id:'_obv_div',name:'OBV 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔OBV 괴리'},
      {id:'_pullback_score',name:'눌림목 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'눌림목 매수 적합도'},
    ]},
  ]},
  {id:'backtest',name:'백테스트',phase:'p3',groups:[
    {id:'ta_bt',name:'백테스트 (실시간)',conditions:[
      {id:'_bt_score',name:'매매전략 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'BT 수익률+승률+MDD+PF 종합 0~100'},
      {id:'_bt_pnl',name:'BT 수익률',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'calc_candle',desc:'200봉 백테스트 총수익률'},
      {id:'_bt_winrate',name:'BT 승률',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'승리 거래 비율'},
      {id:'_bt_trades',name:'BT 거래수',type:'range',unit:'회',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'총 청산 거래 수'},
      {id:'_bt_mdd',name:'BT MDD',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'최대 낙폭 (절대값)'},
      {id:'_bt_pf',name:'BT 손익비',type:'range',unit:'',min:0,max:10,default:{min:null,max:null},source:'calc_candle',desc:'평균이익/평균손실 비율'},
      {id:'_bt_action',name:'종합행동지침',type:'select',options:['설정안함','매수','관심','관망','회피','보유 유지','청산 준비','청산 검토','즉시 청산','매도 완료'],default:'설정안함',source:'calc_candle',desc:'C로직 9종 판정 (A분석 × B매매전략 교차)'},
      // [v1.9] 방향 전이 — _scoreMomentum.direction 기반 (배너의 "— 상승 전이중/하락 전이중" 텍스트와 동일 소스)
      //   매수/관심 프리셋 보강용: 신호여도 모멘텀이 상승 방향일 때만 통과시켜 함정 진입 한 번 더 차단
      {id:'_dir_mom',name:'방향 전이',type:'select',options:['설정안함','상승 전이중','하락 전이중','횡보'],default:'설정안함',source:'calc_candle',desc:'A분석 모멘텀 방향 (배너 라벨과 동일)'},
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
      {id:'market_cap',name:'시가총액',type:'range',unit:'억원',min:0,max:null,default:{min:null,max:null},source:'upbit_ticker'},
      {id:'trade_amount',name:'거래대금',type:'range',unit:'백만원',min:0,max:null,default:{min:null,max:null},source:'upbit_ticker'},
    ]},
  ]},
  {id:'price_analysis',name:'시세분석',phase:'p1',groups:[
    {id:'price_cond',name:'가격 조건',conditions:[
      {id:'change_rate',name:'전일대비 등락률',type:'range',unit:'%',min:-50,max:50,default:{min:null,max:null},source:'upbit_ticker'},
      {id:'price_range',name:'현재가 범위',type:'range',unit:'원',min:0,max:null,default:{min:null,max:null},source:'upbit_ticker'},
      // S161-2: 코인 방어 프리셋(추격매수/극단변동성)용 조건 추가 — KR과 스펙 동일, 범위만 코인 변동성 반영
      {id:'consecutive_up_down',name:'연속 상승/하락',type:'range',unit:'일',min:-20,max:20,default:{min:null,max:null},source:'calc_candle',desc:'양수=상승, 음수=하락'},
      {id:'gap_type',name:'갭 발생',type:'select',options:['설정안함','상승갭 종목','하락갭 종목','갭상승 후 지지','갭하락 후 저항','상승갭 제외'],default:'설정안함',source:'calc_candle',desc:'시가갭 발생 여부 (상승갭 제외 = 오늘 상승갭 발생 종목 회피)'},
      {id:'intraday_range',name:'당일 변동폭',type:'range',unit:'%',min:0,max:50,default:{min:null,max:null},source:'calc_candle',desc:'(고가-저가)/전일종가 — 코인은 변동성 큼'},
      {id:'period_change',name:'N일간 주가변동폭',type:'range',unit:'%',min:-80,max:300,default:{min:null,max:null},source:'calc_candle',desc:'5일간 등락률'},
    ]},
    {id:'volume_cond',name:'거래량',conditions:[
      {id:'volume_prev_ratio',name:'전일대비 거래량 비율',type:'range',unit:'%',min:0,max:10000,default:{min:null,max:null},source:'upbit_ticker'},
      {id:'trade_amount_24h',name:'24h 거래대금',type:'range',unit:'백만원',min:0,max:null,default:{min:null,max:null},source:'upbit_ticker'},
      // S161-2: 기존 프리셋(강세장 공격/매집 감지/급등 시작 등)이 참조하지만 UI 누락이었던 조건 추가
      {id:'volume_avg20_ratio',name:'20일 평균 대비 거래량',type:'range',unit:'%',min:0,max:10000,default:{min:null,max:null},source:'calc_candle',desc:'당일거래량÷20일평균×100'},
    ]},
  ]},
  {id:'fundamental',name:'재무분석',phase:'p1',groups:[
    {id:'fund_valuation',name:'밸류에이션',conditions:[
      {id:'per',name:'PER',type:'range',unit:'배',min:-100,max:200,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'pbr',name:'PBR',type:'range',unit:'배',min:0,max:50,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'dividend_yield',name:'배당수익률',type:'range',unit:'%',min:0,max:30,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'roe',name:'ROE',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'yahoo_fundamental'},
    ]},
  ]},
  // ── Phase 2 ──
  {id:'technical',name:'기술적분석',phase:'p2',groups:[
    {id:'ta_ma',name:'이동평균선',conditions:[
      {id:'ma_cross',name:'MA 크로스',type:'select',options:['설정안함','골든크로스 (5×20)','데드크로스 (5×20)','골든크로스 (20×60)','데드크로스 (20×60)'],default:'설정안함',source:'calc_candle'},
      {id:'ma_arrangement',name:'MA 배열',type:'select',options:['설정안함','정배열 (3개)','정배열 (4개)','역배열 (3개)','역배열 (4개)'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_trend',name:'추세지표',conditions:[
      {id:'macd_signal',name:'MACD 시그널',type:'select',options:['설정안함','MACD > Signal (매수)','MACD < Signal (매도)'],default:'설정안함',source:'calc_candle'},
      {id:'adx_value',name:'ADX (추세강도)',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle'},
      {id:'parabolic_sar',name:'Parabolic SAR',type:'select',options:['설정안함','SAR 아래 (상승 추세)','SAR 위 (하락 추세)'],default:'설정안함',source:'calc_candle'},
      {id:'eom_trend',name:'EOM (이동용이도)',type:'select',options:['설정안함','매수세 (상승)','매도세 (하락)','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle'},
      {id:'vhf_state',name:'VHF (추세판별)',type:'select',options:['설정안함','추세장 (>0.4)','횡보장 (<0.3)','보통'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_momentum',name:'모멘텀지표',conditions:[
      {id:'rsi_value',name:'RSI',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle'},
      {id:'stoch_k',name:'Stochastic %K',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle'},
      {id:'psycho_value',name:'심리도',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'25↓=과매도, 75↑=과매수'},
      {id:'ab_ratio_trend',name:'AB Ratio',type:'select',options:['설정안함','매수세 우위 (A>B)','매도세 우위 (A<B)','균형'],default:'설정안함',source:'calc_candle'},
      {id:'chaikin_osc',name:'Chaikin Oscillator',type:'select',options:['설정안함','양수 (매집)','음수 (분산)','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_channel',name:'채널/밴드',conditions:[
      {id:'bb_position',name:'볼린저 밴드 위치',type:'select',options:['설정안함','상단 돌파','상단 근접','중심선 위','중심선 아래','하단 근접','하단 이탈'],default:'설정안함',source:'calc_candle'},
      {id:'band_pctb',name:'Band %b',type:'range',unit:'',min:-0.5,max:1.5,default:{min:null,max:null},source:'calc_candle',desc:'0=하단, 0.5=중심, 1=상단'},
      // S161-2: p2_coin_squeeze 프리셋이 참조하던 UI 누락 조건 추가
      {id:'bb_width',name:'볼린저 밴드 폭',type:'select',options:['설정안함','스퀴즈 (수축)','확장중'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_other',name:'기타 지표',conditions:[
      {id:'obv_trend',name:'OBV 추세',type:'select',options:['설정안함','상승 추세','하락 추세'],default:'설정안함',source:'calc_candle'},
      {id:'vwap_position',name:'VWAP 위치',type:'select',options:['설정안함','VWAP 위 (강세)','VWAP 근처 (±1%)','VWAP 아래 (약세)'],default:'설정안함',source:'calc_candle'},
      {id:'swing_structure',name:'구조 패턴 (HH/HL)',type:'select',options:['설정안함','Higher High (고점 상승)','HH+HL (상승구조)','Lower Low (저점 하락)'],default:'설정안함',source:'calc_candle'},
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
  ]},
  {id:'market_env',name:'시장환경',phase:'p2',groups:[
    {id:'env_state',name:'시장 상태',conditions:[
      {id:'mkt_env_state',name:'시장 환경',type:'select',options:['설정안함','강세 포함 (mild_bull+bull)','강세 (bull)','약세강세 (mild_bull)','중립 (neutral)','약세약세 (mild_bear)','약세 (bear)','약세 포함 (mild_bear+bear)'],default:'설정안함',source:'oracle_index',desc:'NASDAQ/S&P500 기반'},
    ]},
    {id:'env_index',name:'지수 등락률',conditions:[
      {id:'mkt_env_nasdaq_chg',name:'NASDAQ 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index'},
      {id:'mkt_env_sp500_chg',name:'S&P500 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index'},
    ]},
  ]},
  // ── Phase 3 ──
  {id:'engine_verdict',name:'엔진 판정',phase:'p3',groups:[
    {id:'ta_signal',name:'분석 판정',conditions:[
      {id:'score_range',name:'추세 강도 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추세 강도 0~100 (분석탭 "추세 강도")'},
      {id:'_ready_score',name:'바닥 신호 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'바닥 조건 축적도 0~100 (분석탭 "바닥 신호" — 과매도+수축+바닥)'},
      {id:'_entry_score',name:'반등 신호 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'반등 신호 감지 0~100 (분석탭 "반등 신호" — RSI반등+MACD전환)'},
      {id:'_safety_clean',name:'안전필터 클린',type:'select',options:['설정안함','클린 (0개)','1개 이하','2개 이하'],default:'설정안함',source:'calc_candle',desc:'안전필터 미충족 사유 개수'},
      {id:'_regime_label',name:'시장 레짐',type:'select',options:['설정안함','상승추세','하락추세','횡보/약세','횡보/강세'],default:'설정안함',source:'calc_candle',desc:'ADX+BB폭 기반 시장 레짐'},
      {id:'_squeeze',name:'BB 스퀴즈',type:'select',options:['설정안함','스퀴즈 중','스퀴즈 아님'],default:'설정안함',source:'calc_candle',desc:'볼린저밴드 수축 상태'},
      {id:'_rsi_div',name:'RSI 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔RSI 괴리'},
      {id:'_obv_div',name:'OBV 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔OBV 괴리'},
      {id:'_pullback_score',name:'눌림목 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'눌림목 매수 적합도'},
    ]},
  ]},
  {id:'backtest',name:'백테스트',phase:'p3',groups:[
    {id:'ta_bt',name:'백테스트 (실시간)',conditions:[
      {id:'_bt_score',name:'매매전략 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'BT 수익률+승률+MDD+PF 종합 0~100'},
      {id:'_bt_pnl',name:'BT 수익률',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'calc_candle',desc:'200봉 백테스트 총수익률'},
      {id:'_bt_winrate',name:'BT 승률',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'승리 거래 비율'},
      {id:'_bt_trades',name:'BT 거래수',type:'range',unit:'회',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'총 청산 거래 수'},
      {id:'_bt_mdd',name:'BT MDD',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'최대 낙폭 (절대값)'},
      {id:'_bt_pf',name:'BT 손익비',type:'range',unit:'',min:0,max:10,default:{min:null,max:null},source:'calc_candle',desc:'평균이익/평균손실 비율'},
      {id:'_bt_action',name:'종합행동지침',type:'select',options:['설정안함','매수','관심','관망','회피','보유 유지','청산 준비','청산 검토','즉시 청산','매도 완료'],default:'설정안함',source:'calc_candle',desc:'C로직 9종 판정 (A분석 × B매매전략 교차)'},
      // [v1.9] 방향 전이 — _scoreMomentum.direction 기반 (배너의 "— 상승 전이중/하락 전이중" 텍스트와 동일 소스)
      //   매수/관심 프리셋 보강용: 신호여도 모멘텀이 상승 방향일 때만 통과시켜 함정 진입 한 번 더 차단
      {id:'_dir_mom',name:'방향 전이',type:'select',options:['설정안함','상승 전이중','하락 전이중','횡보'],default:'설정안함',source:'calc_candle',desc:'A분석 모멘텀 방향 (배너 라벨과 동일)'},
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
      {id:'market_cap',name:'시가총액',type:'range',unit:'M$',min:0,max:null,default:{min:null,max:null},source:'yahoo_fundamental'},
    ]},
  ]},
  // ── S161-2: US 시세분석 그룹 신설 (방어/준비 프리셋 지원) ──
  {id:'price_analysis',name:'시세분석',phase:'p1',groups:[
    {id:'price_cond',name:'가격 조건',conditions:[
      {id:'change_rate',name:'전일대비 등락률',type:'range',unit:'%',min:-30,max:30,default:{min:null,max:null},source:'yahoo_price'},
      {id:'week52_high_ratio',name:'52주 최고가 대비',type:'range',unit:'%',min:-90,max:0,default:{min:null,max:null},source:'yahoo_fundamental',desc:'현재가÷52주최고-1'},
      {id:'week52_low_ratio',name:'52주 최저가 대비',type:'range',unit:'%',min:0,max:500,default:{min:null,max:null},source:'yahoo_fundamental',desc:'현재가÷52주최저-1'},
      {id:'consecutive_up_down',name:'연속 상승/하락',type:'range',unit:'일',min:-20,max:20,default:{min:null,max:null},source:'calc_candle',desc:'양수=상승, 음수=하락'},
      {id:'gap_type',name:'갭 발생',type:'select',options:['설정안함','상승갭 종목','하락갭 종목','갭상승 후 지지','갭하락 후 저항','상승갭 제외'],default:'설정안함',source:'calc_candle',desc:'시가갭 발생 여부 (상승갭 제외 = 오늘 상승갭 발생 종목 회피)'},
      {id:'intraday_range',name:'당일 변동폭',type:'range',unit:'%',min:0,max:30,default:{min:null,max:null},source:'calc_candle',desc:'(고가-저가)/전일종가'},
      {id:'period_change',name:'N일간 주가변동폭',type:'range',unit:'%',min:-80,max:200,default:{min:null,max:null},source:'calc_candle',desc:'5일간 등락률'},
    ]},
    {id:'volume_cond',name:'거래량',conditions:[
      {id:'volume_prev_ratio',name:'전일대비 거래량 비율',type:'range',unit:'%',min:0,max:10000,default:{min:null,max:null},source:'yahoo_price',desc:'당일÷전일×100'},
      {id:'volume_avg20_ratio',name:'20일 평균 대비 거래량',type:'range',unit:'%',min:0,max:10000,default:{min:null,max:null},source:'calc_candle',desc:'당일거래량÷20일평균×100'},
    ]},
  ]},
  {id:'fundamental',name:'재무분석',phase:'p1',groups:[
    {id:'fund_valuation',name:'밸류에이션',conditions:[
      {id:'per',name:'PER',type:'range',unit:'배',min:-100,max:200,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'pbr',name:'PBR',type:'range',unit:'배',min:0,max:50,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'dividend_yield',name:'배당수익률',type:'range',unit:'%',min:0,max:30,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'roe',name:'ROE',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'yahoo_fundamental'},
    ]},
  ]},
  // ── Phase 2 ──
  {id:'technical',name:'기술적분석',phase:'p2',groups:[
    {id:'ta_ma',name:'이동평균선',conditions:[
      {id:'ma_cross',name:'MA 크로스',type:'select',options:['설정안함','골든크로스 (5×20)','데드크로스 (5×20)','골든크로스 (20×60)','데드크로스 (20×60)'],default:'설정안함',source:'calc_candle'},
      {id:'ma_arrangement',name:'MA 배열',type:'select',options:['설정안함','정배열 (3개)','역배열 (3개)'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_trend',name:'추세지표',conditions:[
      {id:'macd_signal',name:'MACD 시그널',type:'select',options:['설정안함','MACD > Signal (매수)','MACD < Signal (매도)'],default:'설정안함',source:'calc_candle'},
      {id:'adx_value',name:'ADX (추세강도)',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle'},
      {id:'parabolic_sar',name:'Parabolic SAR',type:'select',options:['설정안함','SAR 아래 (상승 추세)','SAR 위 (하락 추세)'],default:'설정안함',source:'calc_candle'},
      {id:'eom_trend',name:'EOM (이동용이도)',type:'select',options:['설정안함','매수세 (상승)','매도세 (하락)','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle'},
      {id:'vhf_state',name:'VHF (추세판별)',type:'select',options:['설정안함','추세장 (>0.4)','횡보장 (<0.3)','보통'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_momentum',name:'모멘텀지표',conditions:[
      {id:'rsi_value',name:'RSI',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle'},
      {id:'stoch_k',name:'Stochastic %K',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle'},
      {id:'psycho_value',name:'심리도',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'25↓=과매도, 75↑=과매수'},
      {id:'ab_ratio_trend',name:'AB Ratio',type:'select',options:['설정안함','매수세 우위 (A>B)','매도세 우위 (A<B)','균형'],default:'설정안함',source:'calc_candle'},
      {id:'chaikin_osc',name:'Chaikin Oscillator',type:'select',options:['설정안함','양수 (매집)','음수 (분산)','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_channel',name:'채널/밴드',conditions:[
      {id:'bb_position',name:'볼린저 밴드 위치',type:'select',options:['설정안함','상단 돌파','상단 근접','중심선 위','중심선 아래','하단 근접','하단 이탈'],default:'설정안함',source:'calc_candle'},
      {id:'band_pctb',name:'Band %b',type:'range',unit:'',min:-0.5,max:1.5,default:{min:null,max:null},source:'calc_candle',desc:'0=하단, 0.5=중심, 1=상단'},
      // S161-2: US에도 BB 스퀴즈 조건 추가 (준비 프리셋 '변동성 수축' 지원)
      {id:'bb_width',name:'볼린저 밴드 폭',type:'select',options:['설정안함','스퀴즈 (수축)','확장중'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_other',name:'기타 지표',conditions:[
      {id:'obv_trend',name:'OBV 추세',type:'select',options:['설정안함','상승 추세','하락 추세'],default:'설정안함',source:'calc_candle'},
      {id:'vwap_position',name:'VWAP 위치',type:'select',options:['설정안함','VWAP 위 (강세)','VWAP 근처 (±1%)','VWAP 아래 (약세)'],default:'설정안함',source:'calc_candle'},
      {id:'swing_structure',name:'구조 패턴 (HH/HL)',type:'select',options:['설정안함','Higher High (고점 상승)','HH+HL (상승구조)','Lower Low (저점 하락)'],default:'설정안함',source:'calc_candle'},
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
  ]},
  {id:'market_env',name:'시장환경',phase:'p2',groups:[
    {id:'env_state',name:'시장 상태',conditions:[
      {id:'mkt_env_state',name:'시장 환경',type:'select',options:['설정안함','강세 포함 (mild_bull+bull)','강세 (bull)','약세강세 (mild_bull)','중립 (neutral)','약세약세 (mild_bear)','약세 (bear)','약세 포함 (mild_bear+bear)'],default:'설정안함',source:'oracle_index',desc:'NASDAQ/S&P500 기반'},
    ]},
    {id:'env_index',name:'지수 등락률',conditions:[
      {id:'mkt_env_nasdaq_chg',name:'NASDAQ 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index'},
      {id:'mkt_env_sp500_chg',name:'S&P500 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index'},
    ]},
  ]},
  // ── Phase 3 ──
  {id:'engine_verdict',name:'엔진 판정',phase:'p3',groups:[
    {id:'ta_signal',name:'분석 판정',conditions:[
      {id:'score_range',name:'추세 강도 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'추세 강도 0~100 (분석탭 "추세 강도")'},
      {id:'_ready_score',name:'바닥 신호 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'바닥 조건 축적도 0~100 (분석탭 "바닥 신호" — 과매도+수축+바닥)'},
      {id:'_entry_score',name:'반등 신호 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'반등 신호 감지 0~100 (분석탭 "반등 신호" — RSI반등+MACD전환)'},
      {id:'_safety_clean',name:'안전필터 클린',type:'select',options:['설정안함','클린 (0개)','1개 이하','2개 이하'],default:'설정안함',source:'calc_candle',desc:'안전필터 미충족 사유 개수'},
      {id:'_regime_label',name:'시장 레짐',type:'select',options:['설정안함','상승추세','하락추세','횡보/약세','횡보/강세'],default:'설정안함',source:'calc_candle',desc:'ADX+BB폭 기반 시장 레짐'},
      {id:'_squeeze',name:'BB 스퀴즈',type:'select',options:['설정안함','스퀴즈 중','스퀴즈 아님'],default:'설정안함',source:'calc_candle',desc:'볼린저밴드 수축 상태'},
      {id:'_rsi_div',name:'RSI 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔RSI 괴리'},
      {id:'_obv_div',name:'OBV 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔OBV 괴리'},
      {id:'_pullback_score',name:'눌림목 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'눌림목 매수 적합도'},
    ]},
  ]},
  {id:'backtest',name:'백테스트',phase:'p3',groups:[
    {id:'ta_bt',name:'백테스트 (실시간)',conditions:[
      {id:'_bt_score',name:'매매전략 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'BT 수익률+승률+MDD+PF 종합 0~100'},
      {id:'_bt_pnl',name:'BT 수익률',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'calc_candle',desc:'200봉 백테스트 총수익률'},
      {id:'_bt_winrate',name:'BT 승률',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'승리 거래 비율'},
      {id:'_bt_trades',name:'BT 거래수',type:'range',unit:'회',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'총 청산 거래 수'},
      {id:'_bt_mdd',name:'BT MDD',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'최대 낙폭 (절대값)'},
      {id:'_bt_pf',name:'BT 손익비',type:'range',unit:'',min:0,max:10,default:{min:null,max:null},source:'calc_candle',desc:'평균이익/평균손실 비율'},
      {id:'_bt_action',name:'종합행동지침',type:'select',options:['설정안함','매수','관심','관망','회피','보유 유지','청산 준비','청산 검토','즉시 청산','매도 완료'],default:'설정안함',source:'calc_candle',desc:'C로직 9종 판정 (A분석 × B매매전략 교차)'},
      // [v1.9] 방향 전이 — _scoreMomentum.direction 기반 (배너의 "— 상승 전이중/하락 전이중" 텍스트와 동일 소스)
      //   매수/관심 프리셋 보강용: 신호여도 모멘텀이 상승 방향일 때만 통과시켜 함정 진입 한 번 더 차단
      {id:'_dir_mom',name:'방향 전이',type:'select',options:['설정안함','상승 전이중','하락 전이중','횡보'],default:'설정안함',source:'calc_candle',desc:'A분석 모멘텀 방향 (배너 라벨과 동일)'},
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
  {id:'p2_kr_trend',name:'추세 추종',phase:'p2',group:'attack',desc:'정배열 + HH/HL 상승 + MACD매수 + OBV상승 + RSI 50~70 + VHF추세장',locked:true,conditions:{ma_arrangement:'정배열 (3개)',swing_structure:'HH+HL (상승구조)',macd_signal:'MACD > Signal (매수)',obv_trend:'상승 추세',rsi_value:{min:50,max:70},vhf_state:'추세장 (>0.4)'}},
  {id:'p2_kr_pullback',name:'눌림목 매수',phase:'p2',group:'attack',desc:'정배열 + MA20 근접 + RSI 40~55 + OBV상승',locked:true,conditions:{ma_arrangement:'정배열 (3개)',ma_disparity:'MA20 근접 (±2%)',rsi_value:{min:40,max:55},obv_trend:'상승 추세',vhf_state:'추세장 (>0.4)'}},
  {id:'p2_kr_reversal',name:'반등 시작',phase:'p2',group:'attack',desc:'RSI 과매도 + MACD 골든 + BB 하단 + 심리도 과매도',locked:true,conditions:{rsi_value:{min:20,max:35},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',psycho_value:{min:null,max:25}}},
  {id:'p2_kr_breakout',name:'급등 시작',phase:'p2',group:'attack',desc:'20일 신고가 + 거래량 200%↑ + VWAP위 + MACD매수 + EOM매수',locked:true,conditions:{new_high_low:'20일 신고가',volume_avg20_ratio:{min:200,max:null},vwap_position:'VWAP 위 (강세)',macd_signal:'MACD > Signal (매수)',eom_trend:'매수세 (상승)'}},
  {id:'p2_kr_candle_rev',name:'캔들 반전',phase:'p2',group:'attack',desc:'반전패턴 + RSI 과매도 + 거래량↑',locked:true,conditions:{reversal_pattern:['morning_star','bullish_engulfing','morning_doji_star','abandoned_baby_bull','hammer','piercing','tweezer_bottom','harami_bull','dragonfly_doji'],rsi_value:{min:null,max:35},volume_avg20_ratio:{min:150,max:null}}},
  // ── 준비 ──
  {id:'p2_kr_squeeze',name:'변동성 폭발 대기',phase:'p2',group:'prep',desc:'BB 스퀴즈 + VHF 횡보 + 거래량 연속증가 + OBV 상승',locked:true,conditions:{bb_width:'스퀴즈 (수축)',vhf_state:'횡보장 (<0.3)',volume_consec_inc:{min:5,max:null},obv_trend:'상승 추세'}},
  {id:'p2_kr_accumulation',name:'세력 매집',phase:'p2',group:'prep',desc:'OBV상승 + A/D매집 + Chaikin매집 + 횡보 + 거래량↑',locked:true,conditions:{obv_trend:'상승 추세',ad_trend:'상승 추세',chaikin_osc:'양수 (매집)',change_rate:{min:-2,max:2},volume_avg20_ratio:{min:120,max:null}}},
  {id:'p2_kr_gap_support',name:'갭상승 후 지지',phase:'p2',group:'prep',desc:'갭상승 후 지지 + 거래량↑ + EOM매수 + VWAP위',locked:true,conditions:{gap_type:'갭상승 후 지지',volume_avg20_ratio:{min:150,max:null},eom_trend:'매수세 (상승)',vwap_position:'VWAP 위 (강세)'}},
  // ── 방어 (S161: 사진3 기반 추가 — 조건 기반 근사치) ──
  {id:'p2_kr_chase_defense',name:'추격매수 후보',phase:'p2',group:'defense',desc:'5일변동 15%↑ + 거래량 200%↑ + 52주고점 -5%↑ + 연속상승 2일↑ + OBV상승 (돌파 후 추격 모멘텀)',locked:true,conditions:{period_change:{min:15,max:null},volume_avg20_ratio:{min:200,max:null},week52_high_ratio:{min:-5,max:null},consecutive_up_down:{min:2,max:null},obv_trend:'상승 추세'}},
  {id:'p2_kr_sideways_avoid',name:'추세장 종목',phase:'p2',group:'defense',desc:'ADX 20↑ + VHF 추세장 + MACD 매수 (강한 추세 발굴)',locked:true,conditions:{adx_value:{min:20,max:null},vhf_state:'추세장 (>0.4)',macd_signal:'MACD > Signal (매수)'}},
  {id:'p2_kr_vol_extreme',name:'급등 후보',phase:'p2',group:'defense',desc:'당일 변동 8%↑ + 상승갭 + 등락률 3%↑ + 거래량 200%↑ (당일 강한 매수 분출)',locked:true,conditions:{intraday_range:{min:8,max:null},gap_type:'상승갭 종목',change_rate:{min:3,max:null},volume_avg20_ratio:{min:200,max:null}}},
  {id:'p2_kr_breakdown',name:'추세 가속',phase:'p2',group:'defense',desc:'MA60↑ + 정배열 + VWAP↑ + EOM매수 + RSI 60~70 + 거래량 150%↑ (과열 직전 가속)',locked:true,conditions:{price_vs_ma:'MA60 위',ma_arrangement:'정배열 (3개)',vwap_position:'VWAP 위 (강세)',eom_trend:'매수세 (상승)',rsi_value:{min:60,max:70},volume_avg20_ratio:{min:150,max:null}}},
  // [v1.9-1] 바닥 후보 — 점수 시스템 기반 종합 바닥 발굴 (반등 시작과 보완 관계).
  //   분석 점수만 사용 → BT 무관 모든 TF 활성
  {id:'p2_kr_bottom_pick',name:'바닥 후보',phase:'p2',group:'defense',desc:'바닥 신호 70↑ + 반등 신호 70↑ + RSI 30↓ (과매도+반등 동력)',locked:true,conditions:{_ready_score:{min:70,max:100},_entry_score:{min:70,max:100},rsi_value:{min:0,max:30}}},
  // ── 환경 ──
  {id:'p2_kr_bull_env',name:'강세장 공격',phase:'p2',group:'env',desc:'시장강세 + 정배열 + MACD매수 + 거래량폭발',locked:true,conditions:{mkt_env_state:'강세 포함 (mild_bull+bull)',ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',volume_avg20_ratio:{min:200,max:null}}},
  {id:'p2_kr_bear_env',name:'약세장 방어',phase:'p2',group:'env',desc:'시장약세 + RSI반등 + MACD골든 + BB하단',locked:true,conditions:{mkt_env_state:'약세 포함 (mild_bear+bear)',rsi_value:{min:25,max:40},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈'}},
];

const PRESETS_KR_P3 = [
  // [v2.3] 기존 BT 검증/진입 적기/회피 종목 3개 폐기 → C로직 발굴용 2개로 재구성
  //   매수:  C판정 = '매수' (A긍정 × B매수신호) — 최고 조합, 지금 진입 OK
  //   관심:  C판정 = '관심' (A긍정 × B대기)    — 선행 포착, BT 신호 곧 예상
  // [2026-04] 매수/관심 칩에 BT 손익비(≥1.5) + BT MDD(≤25%) 자동 결합 —
  //   별도 칩은 조합 단일 슬롯 구조상 매수/관심과 동시선택 불가라 한 칩에 묶음.
  //   MDD: 한국 주식 기준 25% 이하면 "최악 구간도 견딘 전략"으로 간주 (무난한 필터링 임계)
  {id:'p3_kr_c_buy',  name:'매수',phase:'p3',desc:'C판정 매수 + 상승 전이중 + BT 손익비 1.5↑ + BT MDD 25%↓',locked:true,conditions:{_bt_action:'매수',_dir_mom:'상승 전이중',_bt_pf:{min:1.5,max:null},_bt_mdd:{min:0,max:25}}},
  {id:'p3_kr_c_watch',name:'관심',phase:'p3',desc:'C판정 관심 + 상승 전이중 + BT 손익비 1.5↑ + BT MDD 25%↓',locked:true,conditions:{_bt_action:'관심',_dir_mom:'상승 전이중',_bt_pf:{min:1.5,max:null},_bt_mdd:{min:0,max:25}}},
];

// ── COIN 프리셋 ──
const PRESETS_COIN_P1 = [];

const PRESETS_COIN_P2 = [
  // ── 공격 ──
  {id:'p2_coin_trend',name:'추세 라이딩',phase:'p2',group:'attack',desc:'정배열 + MACD매수 + OBV상승 + RSI 50~70 + VHF추세장',locked:true,conditions:{ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',obv_trend:'상승 추세',rsi_value:{min:50,max:70},vhf_state:'추세장 (>0.4)'}},
  {id:'p2_coin_pullback',name:'눌림목 매수',phase:'p2',group:'attack',desc:'정배열 + MA20 근접 + RSI 40~55 + OBV상승 + VHF추세장',locked:true,conditions:{ma_arrangement:'정배열 (3개)',ma_disparity:'MA20 근접 (±2%)',rsi_value:{min:40,max:55},obv_trend:'상승 추세',vhf_state:'추세장 (>0.4)'}},
  {id:'p2_coin_reversal',name:'과매도 반등',phase:'p2',group:'attack',desc:'RSI 과매도 + MACD 골든 + BB 하단 + 심리도 과매도',locked:true,conditions:{rsi_value:{min:20,max:35},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',psycho_value:{min:null,max:25}}},
  {id:'p2_coin_breakout',name:'급등 시작',phase:'p2',group:'attack',desc:'등락률 5%↑ + 거래량 200%↑ + VWAP위 + MACD매수 + EOM매수',locked:true,conditions:{change_rate:{min:5,max:null},volume_avg20_ratio:{min:200,max:null},vwap_position:'VWAP 위 (강세)',macd_signal:'MACD > Signal (매수)',eom_trend:'매수세 (상승)'}},
  // ── 준비 ──
  {id:'p2_coin_accumulation',name:'매집 감지',phase:'p2',group:'prep',desc:'OBV상승 + A/D매집 + Chaikin매집 + 횡보 + 거래량↑',locked:true,conditions:{obv_trend:'상승 추세',ad_trend:'상승 추세',chaikin_osc:'양수 (매집)',change_rate:{min:-3,max:3},volume_avg20_ratio:{min:150,max:null}}},
  {id:'p2_coin_squeeze',name:'변동성 폭발 대기',phase:'p2',group:'prep',desc:'BB 스퀴즈 + VHF 횡보 + 거래량 연속증가 + OBV 상승',locked:true,conditions:{bb_width:'스퀴즈 (수축)',vhf_state:'횡보장 (<0.3)',volume_consec_inc:{min:5,max:null},obv_trend:'상승 추세'}},
  // ── 방어 (S161-2: 코인 맞춤 임계값 — KR 대비 완화) ──
  {id:'p2_coin_chase_defense',name:'추격매수 후보',phase:'p2',group:'defense',desc:'5일변동 30%↑ + 거래량 300%↑ + 연속상승 2일↑ + OBV상승 (돌파 후 추격 모멘텀)',locked:true,conditions:{period_change:{min:30,max:null},volume_avg20_ratio:{min:300,max:null},consecutive_up_down:{min:2,max:null},obv_trend:'상승 추세'}},
  {id:'p2_coin_sideways_avoid',name:'추세장 종목',phase:'p2',group:'defense',desc:'ADX 20↑ + VHF 추세장 + MACD 매수 (강한 추세 발굴)',locked:true,conditions:{adx_value:{min:20,max:null},vhf_state:'추세장 (>0.4)',macd_signal:'MACD > Signal (매수)'}},
  {id:'p2_coin_vol_extreme',name:'급등 후보',phase:'p2',group:'defense',desc:'당일 변동 15%↑ + 상승갭 + 등락률 5%↑ + 거래량 250%↑ (당일 강한 매수 분출)',locked:true,conditions:{intraday_range:{min:15,max:null},gap_type:'상승갭 종목',change_rate:{min:5,max:null},volume_avg20_ratio:{min:250,max:null}}},
  // [v1.9-1] 바닥 후보 — 점수 시스템 기반 종합 바닥 발굴. 분석 점수만 사용 → BT 무관 모든 TF 활성
  {id:'p2_coin_bottom_pick',name:'바닥 후보',phase:'p2',group:'defense',desc:'바닥 신호 70↑ + 반등 신호 70↑ + RSI 30↓ (과매도+반등 동력)',locked:true,conditions:{_ready_score:{min:70,max:100},_entry_score:{min:70,max:100},rsi_value:{min:0,max:30}}},
  // ── 환경 ──
  {id:'p2_coin_bull_env',name:'강세장 공격',phase:'p2',group:'env',desc:'BTC강세 + 정배열 + MACD매수 + 거래량폭발',locked:true,conditions:{mkt_env_state:'강세 포함 (mild_bull+bull)',ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',volume_avg20_ratio:{min:200,max:null},eom_trend:'매수세 (상승)'}},
  {id:'p2_coin_bear_env',name:'약세장 방어',phase:'p2',group:'env',desc:'BTC약세 + RSI과매도 + MACD골든 + BB하단',locked:true,conditions:{mkt_env_state:'약세 포함 (mild_bear+bear)',rsi_value:{min:20,max:35},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈'}},
];

const PRESETS_COIN_P3 = [
  // [v2.3] KR과 동일 체제 — C로직 발굴용 2개 (매수/관심)
  // [2026-04] 코인은 변동성이 커서 MDD 35% 이하로 완화 (KR 25% 대비)
  {id:'p3_coin_c_buy',  name:'매수',phase:'p3',desc:'C판정 매수 + 상승 전이중 + BT 손익비 1.5↑ + BT MDD 35%↓',locked:true,conditions:{_bt_action:'매수',_dir_mom:'상승 전이중',_bt_pf:{min:1.5,max:null},_bt_mdd:{min:0,max:35}}},
  {id:'p3_coin_c_watch',name:'관심',phase:'p3',desc:'C판정 관심 + 상승 전이중 + BT 손익비 1.5↑ + BT MDD 35%↓',locked:true,conditions:{_bt_action:'관심',_dir_mom:'상승 전이중',_bt_pf:{min:1.5,max:null},_bt_mdd:{min:0,max:35}}},
];

// ── US 프리셋 ──
const PRESETS_US_P1 = [];

const PRESETS_US_P2 = [
  // ── 공격 ──
  {id:'p2_us_trend',name:'추세 추종',phase:'p2',group:'attack',desc:'정배열 + MACD매수 + OBV상승 + HH/HL + RSI 50~70 + VHF추세장',locked:true,conditions:{ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',obv_trend:'상승 추세',swing_structure:'HH+HL (상승구조)',rsi_value:{min:50,max:70},vhf_state:'추세장 (>0.4)'}},
  {id:'p2_us_pullback',name:'눌림목 매수',phase:'p2',group:'attack',desc:'정배열 + MA20 근접 + RSI 40~55 + OBV상승 + VHF추세장',locked:true,conditions:{ma_arrangement:'정배열 (3개)',ma_disparity:'MA20 근접 (±2%)',rsi_value:{min:40,max:55},obv_trend:'상승 추세',vhf_state:'추세장 (>0.4)'}},
  {id:'p2_us_reversal',name:'과매도 반등',phase:'p2',group:'attack',desc:'RSI 과매도 + MACD 골든 + BB 하단 + 심리도 과매도',locked:true,conditions:{rsi_value:{min:20,max:35},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',psycho_value:{min:null,max:25}}},
  {id:'p2_us_breakout',name:'급등 시작',phase:'p2',group:'attack',desc:'20일 신고가 + 거래량 200%↑ + VWAP위 + MACD매수 + EOM매수',locked:true,conditions:{new_high_low:'20일 신고가',volume_avg20_ratio:{min:200,max:null},vwap_position:'VWAP 위 (강세)',macd_signal:'MACD > Signal (매수)',eom_trend:'매수세 (상승)'}},
  {id:'p2_us_candle_rev',name:'캔들 반전',phase:'p2',group:'attack',desc:'반전패턴 + RSI 과매도 + 거래량↑',locked:true,conditions:{reversal_pattern:['morning_star','bullish_engulfing','morning_doji_star','abandoned_baby_bull','hammer','piercing','tweezer_bottom','harami_bull','dragonfly_doji'],rsi_value:{min:null,max:35},volume_avg20_ratio:{min:150,max:null}}},
  // ── 준비 (S161-2: 신규) ──
  {id:'p2_us_accumulation',name:'매집 감지',phase:'p2',group:'prep',desc:'OBV상승 + A/D매집 + Chaikin매집 + 횡보 + 거래량↑',locked:true,conditions:{obv_trend:'상승 추세',ad_trend:'상승 추세',chaikin_osc:'양수 (매집)',change_rate:{min:-2,max:2},volume_avg20_ratio:{min:120,max:null}}},
  {id:'p2_us_squeeze',name:'변동성 폭발 대기',phase:'p2',group:'prep',desc:'BB 스퀴즈 + VHF 횡보 + 거래량 연속증가 + OBV 상승',locked:true,conditions:{bb_width:'스퀴즈 (수축)',vhf_state:'횡보장 (<0.3)',volume_consec_inc:{min:5,max:null},obv_trend:'상승 추세'}},
  {id:'p2_us_gap_support',name:'갭상승 후 지지',phase:'p2',group:'prep',desc:'갭상승 후 지지 + 거래량↑ + EOM매수 + VWAP위',locked:true,conditions:{gap_type:'갭상승 후 지지',volume_avg20_ratio:{min:150,max:null},eom_trend:'매수세 (상승)',vwap_position:'VWAP 위 (강세)'}},
  // ── 방어 (S161-2: 신규, US 맞춤 임계값 — KR보다 타이트) ──
  {id:'p2_us_chase_defense',name:'추격매수 후보',phase:'p2',group:'defense',desc:'5일변동 10%↑ + 거래량 180%↑ + 52주고점 -3%↑ + 연속상승 2일↑ + OBV상승 (돌파 후 추격 모멘텀)',locked:true,conditions:{period_change:{min:10,max:null},volume_avg20_ratio:{min:180,max:null},week52_high_ratio:{min:-3,max:null},consecutive_up_down:{min:2,max:null},obv_trend:'상승 추세'}},
  {id:'p2_us_sideways_avoid',name:'추세장 종목',phase:'p2',group:'defense',desc:'ADX 20↑ + VHF 추세장 + MACD 매수 (강한 추세 발굴)',locked:true,conditions:{adx_value:{min:20,max:null},vhf_state:'추세장 (>0.4)',macd_signal:'MACD > Signal (매수)'}},
  {id:'p2_us_vol_extreme',name:'급등 후보',phase:'p2',group:'defense',desc:'당일 변동 6%↑ + 상승갭 + 등락률 2%↑ + 거래량 180%↑ (당일 강한 매수 분출)',locked:true,conditions:{intraday_range:{min:6,max:null},gap_type:'상승갭 종목',change_rate:{min:2,max:null},volume_avg20_ratio:{min:180,max:null}}},
  // [v1.9-1] 바닥 후보 — 점수 시스템 기반 종합 바닥 발굴. 분석 점수만 사용 → BT 무관 모든 TF 활성
  {id:'p2_us_bottom_pick',name:'바닥 후보',phase:'p2',group:'defense',desc:'바닥 신호 70↑ + 반등 신호 70↑ + RSI 30↓ (과매도+반등 동력)',locked:true,conditions:{_ready_score:{min:70,max:100},_entry_score:{min:70,max:100},rsi_value:{min:0,max:30}}},
  // ── 환경 ──
  {id:'p2_us_bull_env',name:'강세장 공격',phase:'p2',group:'env',desc:'시장강세 + 정배열 + MACD매수 + HH/HL + VWAP위 + 거래량폭발',locked:true,conditions:{mkt_env_state:'강세 포함 (mild_bull+bull)',ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',swing_structure:'HH+HL (상승구조)',vwap_position:'VWAP 위 (강세)',volume_avg20_ratio:{min:200,max:null}}},
  {id:'p2_us_bear_env',name:'약세장 방어',phase:'p2',group:'env',desc:'시장약세 + RSI과매도 + MACD골든 + BB하단 + PER저평가 + 배당',locked:true,conditions:{mkt_env_state:'약세 포함 (mild_bear+bear)',rsi_value:{min:0,max:30},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',per:{min:0,max:15},dividend_yield:{min:2,max:null}}},
];

const PRESETS_US_P3 = [
  // [v2.3] KR/COIN과 동일 체제 — C로직 발굴용 2개 (매수/관심)
  // [2026-04] US 주식도 KR과 동일한 MDD 기준 25% 적용
  {id:'p3_us_c_buy',  name:'매수',phase:'p3',desc:'C판정 매수 + 상승 전이중 + BT 손익비 1.5↑ + BT MDD 25%↓',locked:true,conditions:{_bt_action:'매수',_dir_mom:'상승 전이중',_bt_pf:{min:1.5,max:null},_bt_mdd:{min:0,max:25}}},
  {id:'p3_us_c_watch',name:'관심',phase:'p3',desc:'C판정 관심 + 상승 전이중 + BT 손익비 1.5↑ + BT MDD 25%↓',locked:true,conditions:{_bt_action:'관심',_dir_mom:'상승 전이중',_bt_pf:{min:1.5,max:null},_bt_mdd:{min:0,max:25}}},
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

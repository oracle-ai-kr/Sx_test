// ════════════════════════════════════════════════════════════
//  SIGNAL X — Conditions & Presets v1.0 <!-- S68 -->
//  S68: sx_screener.html에서 분리 — 조건트리 3종 + 프리셋 3종
//  조건트리: SX_CONDITIONS(kr), US_CONDITIONS(us), COIN_CONDITIONS(coin)
//  프리셋: DEFAULT_PRESETS_KR, DEFAULT_PRESETS_US, DEFAULT_PRESETS_COIN
//  의존: currentMarket (글로벌)
// ════════════════════════════════════════════════════════════

// ── 코인 전용 조건 트리 ──
const COIN_CONDITIONS = [
  {id:'scope',name:'범위지정',groups:[
    {id:'scope_basic',name:'기본 정보',conditions:[
      {id:'market_cap',name:'시가총액',type:'range',unit:'억원',min:0,max:null,default:{min:null,max:null},source:'upbit_ticker'},
      {id:'trade_amount',name:'거래대금',type:'range',unit:'백만원',min:0,max:null,default:{min:null,max:null},source:'upbit_ticker'},
    ]},
  ]},
  {id:'price_analysis',name:'시세분석',groups:[
    {id:'price_cond',name:'가격 조건',conditions:[
      {id:'change_rate',name:'전일대비 등락률',type:'range',unit:'%',min:-50,max:50,default:{min:null,max:null},source:'upbit_ticker'},
      {id:'price_range',name:'현재가 범위',type:'range',unit:'원',min:0,max:null,default:{min:null,max:null},source:'upbit_ticker'},
    ]},
    {id:'volume_cond',name:'거래량',conditions:[
      {id:'volume_prev_ratio',name:'전일대비 거래량 비율',type:'range',unit:'%',min:0,max:10000,default:{min:null,max:null},source:'upbit_ticker'},
      {id:'trade_amount_24h',name:'24h 거래대금',type:'range',unit:'백만원',min:0,max:null,default:{min:null,max:null},source:'upbit_ticker'},
    ]},
  ]},
  {id:'technical',name:'기술적분석',groups:[
    {id:'ta_signal',name:'분석 판정',conditions:[
      {id:'_signal_action',name:'매매 신호',type:'select',options:['설정안함','BUY','HOLD','SELL'],default:'설정안함',source:'calc_candle',desc:'분석 임계값 기반 매매 신호'},
      {id:'score_range',name:'진입타이밍 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'정규화 점수 0~100'},
      {id:'_safety_clean',name:'안전필터 클린',type:'select',options:['설정안함','클린 (0개)','1개 이하','2개 이하'],default:'설정안함',source:'calc_candle',desc:'안전필터 미충족 사유 개수'},
      {id:'_regime_label',name:'시장 레짐',type:'select',options:['설정안함','상승추세','하락추세','횡보/약세','횡보/강세'],default:'설정안함',source:'calc_candle',desc:'ADX+BB폭 기반 시장 레짐'},
      {id:'_squeeze',name:'BB 스퀴즈',type:'select',options:['설정안함','스퀴즈 중','스퀴즈 아님'],default:'설정안함',source:'calc_candle',desc:'볼린저밴드 수축 상태'},
      {id:'_rsi_div',name:'RSI 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔RSI 괴리'},
      {id:'_obv_div',name:'OBV 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔OBV 괴리'},
      {id:'_pullback_score',name:'눌림목 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'눌림목 매수 적합도'},
    ]},
    {id:'ta_bt',name:'백테스트 (실시간)',conditions:[
      {id:'_bt_score',name:'매매전략 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'BT 수익률+승률+MDD+PF 종합 0~100'},
      {id:'_bt_pnl',name:'BT 수익률',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'calc_candle',desc:'200봉 백테스트 총수익률'},
      {id:'_bt_winrate',name:'BT 승률',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'승리 거래 비율'},
      {id:'_bt_trades',name:'BT 거래수',type:'range',unit:'회',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'총 청산 거래 수'},
      {id:'_bt_mdd',name:'BT MDD',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'최대 낙폭 (절대값)'},
      {id:'_bt_pf',name:'BT Profit Factor',type:'range',unit:'',min:0,max:10,default:{min:null,max:null},source:'calc_candle',desc:'평균이익/평균손실 비율'},
      {id:'_bt_action',name:'종합행동지침',type:'select',options:['설정안함','진입 적기','단기급등 주의','관심 등록','회피'],default:'설정안함',source:'calc_candle',desc:'진입타이밍×매매전략 교차 판정'},
    ]},
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
      {id:'ichimoku_twist',name:'구름 전환',type:'select',options:['설정안함','양운 전환 (상승)','음운 전환 (하락)'],default:'설정안함',source:'calc_candle',desc:'선행스팬 교차'},
    ]},
    {id:'ta_volume',name:'거래량 지표',conditions:[
      {id:'obv_trend',name:'OBV 추세',type:'select',options:['설정안함','상승 추세','하락 추세','OBV 다이버전스 (가격↓ OBV↑)'],default:'설정안함',source:'calc_candle'},
      {id:'volume_ma_arr',name:'거래량 MA 배열',type:'select',options:['설정안함','정배열 (5>20>60)','역배열 (5<20<60)','20일 MA 돌파'],default:'설정안함',source:'calc_candle'},
      {id:'ad_trend',name:'A/D선 추세',type:'select',options:['설정안함','상승 (매집)','하락 (분산)','매집 다이버전스 (가격↓ A/D↑)'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_momentum_ext',name:'모멘텀 확장',conditions:[
      {id:'trix_signal',name:'TRIX',type:'select',options:['설정안함','TRIX > Signal (매수)','TRIX < Signal (매도)','양수 전환','음수 전환'],default:'설정안함',source:'calc_candle'},
      {id:'stoch_slow_cross',name:'Stochastic Slow',type:'select',options:['설정안함','%K > %D','%K < %D','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle'},
      {id:'macd_osc_trend',name:'MACD Oscillator',type:'select',options:['설정안함','상승 가속','상승','하락','하락 가속'],default:'설정안함',source:'calc_candle'},
      {id:'price_osc_value',name:'Price Oscillator',type:'select',options:['설정안함','양수 (상승추세)','음수 (하락추세)'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_other',name:'기타 지표',conditions:[
      {id:'demark_setup',name:'Demark TD Setup',type:'select',options:['설정안함','매수셋업 ≥9 (하락소진)','매도셋업 ≥9 (상승소진)','매수셋업 진행중','매도셋업 진행중'],default:'설정안함',source:'calc_candle',desc:'TD Sequential 추세소진'},
      {id:'three_line_break',name:'삼선전환도',type:'select',options:['설정안함','상승 전환','하락 전환','상승 지속','하락 지속'],default:'설정안함',source:'calc_candle',desc:'Three Line Break 방향'},
      {id:'binary_wave',name:'Binary Wave',type:'select',options:['설정안함','강세 (≥3)','약세 (≤-3)','중립'],default:'설정안함',source:'calc_candle',desc:'5지표 복합이진신호'},
      {id:'sonar_trend',name:'Sonar 모멘텀',type:'select',options:['설정안함','가속 (단기>장기)','감속 (단기<장기)'],default:'설정안함',source:'calc_candle',desc:'ROC 단기-장기 차이'},
      {id:'mass_index',name:'Mass Index',type:'select',options:['설정안함','Reversal Bulge (반전신호)','Setup (MI>27)','안정 (MI<26.5)'],default:'설정안함',source:'calc_candle',desc:'변동성 확장/수축'},
      {id:'vwap_position',name:'VWAP 위치',type:'select',options:['설정안함','VWAP 위 (강세)','VWAP 근처 (±1%)','VWAP 아래 (약세)','VWAP 크게 위 (+3%↑)','VWAP 크게 아래 (-3%↓)'],default:'설정안함',source:'calc_candle',desc:'20일 누적 가중평균가 대비'},
      {id:'swing_structure',name:'구조 패턴 (HH/HL)',type:'select',options:['설정안함','Higher High (고점 상승)','Higher Low (저점 상승)','HH+HL (상승구조)','Lower Low (저점 하락)'],default:'설정안함',source:'calc_candle',desc:'스윙 고저점 구조'},
    ]},
  ]},
  {id:'pattern',name:'패턴분석',groups:[
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
        {id:'morning_star',name:'모닝스타'},{id:'evening_star',name:'이브닝스타'},
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
  {id:'market_env',name:'시장환경',groups:[
    {id:'env_state',name:'시장 상태',conditions:[
      {id:'mkt_env_state',name:'시장 환경',type:'select',options:['설정안함','강세 (bull)','약세강세 (mild_bull)','중립 (neutral)','약세약세 (mild_bear)','약세 (bear)'],default:'설정안함',source:'oracle_index',desc:'BTC 지수 데이터 기반'},
    ]},
    {id:'env_index',name:'지수 등락률',conditions:[
      {id:'mkt_env_btc_chg',name:'BTC 등락률',type:'range',unit:'%',min:-20,max:20,default:{min:null,max:null},source:'oracle_index',desc:'당일 BTC 등락률'},
    ]},
  ]},
];

// ── 해외주식 조건 트리 (간소화) ──
const US_CONDITIONS = [
  {id:'scope',name:'범위지정',groups:[
    {id:'scope_basic',name:'기본 정보',conditions:[
      {id:'market_cap',name:'시가총액',type:'range',unit:'M$',min:0,max:null,default:{min:null,max:null},source:'yahoo_fundamental'},
    ]},
  ]},
  {id:'technical',name:'기술적분석',groups:[
    {id:'ta_signal',name:'분석 판정',conditions:[
      {id:'_signal_action',name:'매매 신호',type:'select',options:['설정안함','BUY','HOLD','SELL'],default:'설정안함',source:'calc_candle',desc:'분석 임계값 기반 매매 신호'},
      {id:'score_range',name:'진입타이밍 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'정규화 점수 0~100'},
      {id:'_safety_clean',name:'안전필터 클린',type:'select',options:['설정안함','클린 (0개)','1개 이하','2개 이하'],default:'설정안함',source:'calc_candle',desc:'안전필터 미충족 사유 개수'},
      {id:'_regime_label',name:'시장 레짐',type:'select',options:['설정안함','상승추세','하락추세','횡보/약세','횡보/강세'],default:'설정안함',source:'calc_candle',desc:'ADX+BB폭 기반 시장 레짐'},
      {id:'_squeeze',name:'BB 스퀴즈',type:'select',options:['설정안함','스퀴즈 중','스퀴즈 아님'],default:'설정안함',source:'calc_candle',desc:'볼린저밴드 수축 상태'},
      {id:'_rsi_div',name:'RSI 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔RSI 괴리'},
      {id:'_obv_div',name:'OBV 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔OBV 괴리'},
      {id:'_pullback_score',name:'눌림목 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'눌림목 매수 적합도'},
    ]},
    {id:'ta_bt',name:'백테스트 (실시간)',conditions:[
      {id:'_bt_score',name:'매매전략 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'BT 수익률+승률+MDD+PF 종합 0~100'},
      {id:'_bt_pnl',name:'BT 수익률',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'calc_candle',desc:'200봉 백테스트 총수익률'},
      {id:'_bt_winrate',name:'BT 승률',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'승리 거래 비율'},
      {id:'_bt_trades',name:'BT 거래수',type:'range',unit:'회',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'총 청산 거래 수'},
      {id:'_bt_mdd',name:'BT MDD',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'최대 낙폭 (절대값)'},
      {id:'_bt_pf',name:'BT Profit Factor',type:'range',unit:'',min:0,max:10,default:{min:null,max:null},source:'calc_candle',desc:'평균이익/평균손실 비율'},
      {id:'_bt_action',name:'종합행동지침',type:'select',options:['설정안함','진입 적기','단기급등 주의','관심 등록','회피'],default:'설정안함',source:'calc_candle',desc:'진입타이밍×매매전략 교차 판정'},
    ]},
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
    ]},
    {id:'ta_other',name:'기타 지표',conditions:[
      {id:'obv_trend',name:'OBV 추세',type:'select',options:['설정안함','상승 추세','하락 추세'],default:'설정안함',source:'calc_candle'},
      {id:'vwap_position',name:'VWAP 위치',type:'select',options:['설정안함','VWAP 위 (강세)','VWAP 근처 (±1%)','VWAP 아래 (약세)'],default:'설정안함',source:'calc_candle'},
      {id:'swing_structure',name:'구조 패턴 (HH/HL)',type:'select',options:['설정안함','Higher High (고점 상승)','HH+HL (상승구조)','Lower Low (저점 하락)'],default:'설정안함',source:'calc_candle'},
    ]},
  ]},
  {id:'pattern',name:'패턴분석',groups:[
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
  {id:'fundamental',name:'재무분석',groups:[
    {id:'fund_valuation',name:'밸류에이션',conditions:[
      {id:'per',name:'PER',type:'range',unit:'배',min:-100,max:200,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'pbr',name:'PBR',type:'range',unit:'배',min:0,max:50,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'dividend_yield',name:'배당수익률',type:'range',unit:'%',min:0,max:30,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'roe',name:'ROE',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'yahoo_fundamental'},
    ]},
  ]},
  {id:'market_env',name:'시장환경',groups:[
    {id:'env_state',name:'시장 상태',conditions:[
      {id:'mkt_env_state',name:'시장 환경',type:'select',options:['설정안함','강세 (bull)','약세강세 (mild_bull)','중립 (neutral)','약세약세 (mild_bear)','약세 (bear)'],default:'설정안함',source:'oracle_index',desc:'NASDAQ/S&P500 기반'},
    ]},
    {id:'env_index',name:'지수 등락률',conditions:[
      {id:'mkt_env_nasdaq_chg',name:'NASDAQ 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index'},
      {id:'mkt_env_sp500_chg',name:'S&P500 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index'},
    ]},
  ]},
];

function getConditions(){ return currentMarket==='coin'?COIN_CONDITIONS:currentMarket==='us'?US_CONDITIONS:SX_CONDITIONS; }

// ═══ Theme System (SX_MODE 공유) ═══
function applyTheme(){
  const m = localStorage.getItem('SX_MODE')||'white';
  const mode = m==='light'?'white':m==='dark'?'charcoal':m;
  document.body.classList.remove('sx-black','sx-cream','sx-white');
  if(mode==='black') document.body.classList.add('sx-black');
  else if(mode==='cream') document.body.classList.add('sx-cream');
  else if(mode==='white') document.body.classList.add('sx-white');
  renderModeRow();
}
function setMode(m){
  localStorage.setItem('SX_MODE',m);
  applyTheme();
}
function renderModeRow(){
  const row=document.getElementById('modeRow');
  if(!row) return;
  const cur=localStorage.getItem('SX_MODE')||'white';
  const modes=[
    {k:'black',l:'다크',bg:'#000000',bar1:'#1a1a1a',bar2:'#2a2a2a',dot:'#3b82f6'},
    {k:'charcoal',l:'회색',bg:'#28282e',bar1:'#3e3e45',bar2:'#4a4a52',dot:'#3b82f6'},
    {k:'cream',l:'베이지',bg:'#e8dfcf',bar1:'#ddd4c4',bar2:'#d0c5b3',dot:'#2563eb'},
    {k:'white',l:'라이트',bg:'#f3f4f6',bar1:'#e5e7eb',bar2:'#d1d5db',dot:'#2563eb'}
  ];
  row.innerHTML=modes.map(m=>{
    const act=m.k===cur?' active':'';
    return`<div class="mode-card${act}" onclick="setMode('${m.k}')">
      <div class="mode-card-preview" style="background:${m.bg}">
        <div class="mp-dot" style="background:${m.dot}"></div>
        <div class="mp-bar" style="background:${m.bar1};flex:1"></div>
        <div class="mp-bar" style="background:${m.bar2};flex:.6"></div>
      </div>
      <div class="mode-card-info">
        <span class="mode-card-name">${m.l}</span>
        <div class="mode-card-check"></div>
      </div>
    </div>`;
  }).join('');
}

// ═══ 카테고리 이름 매핑 (이모지 제거, 라벨만) ═══
const CAT_LABELS = {
  scope:'범위지정', price_analysis:'시세분석', technical:'기술적분석',
  pattern:'패턴분석', fundamental:'재무분석', ranking:'순위분석'
};

// ── 조건 트리 (인라인) ──
const SX_CONDITIONS = [
  {id:'scope',name:'범위지정',groups:[
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
  {id:'price_analysis',name:'시세분석',groups:[
    {id:'price_cond',name:'가격 조건',conditions:[
      {id:'price_range',name:'현재가 범위',type:'range',unit:'원',min:0,max:10000000,default:{min:1000,max:500000},source:'kis_price'},
      {id:'change_rate',name:'전일대비 등락률',type:'range',unit:'%',min:-30,max:30,default:{min:null,max:null},source:'kis_price'},
      {id:'open_change_rate',name:'시가대비 등락률',type:'range',unit:'%',min:-30,max:30,default:{min:null,max:null},source:'kis_price'},
      {id:'week52_high_ratio',name:'52주 최고가 대비',type:'range',unit:'%',min:-90,max:0,default:{min:null,max:null},source:'yahoo_fundamental',desc:'현재가÷52주최고-1'},
      {id:'week52_low_ratio',name:'52주 최저가 대비',type:'range',unit:'%',min:0,max:500,default:{min:null,max:null},source:'yahoo_fundamental',desc:'현재가÷52주최저-1'},
      {id:'consecutive_up_down',name:'연속 상승/하락',type:'range',unit:'일',min:-20,max:20,default:{min:null,max:null},source:'naver_sise',desc:'양수=상승, 음수=하락'},
      {id:'price_vs_ma',name:'이동평균 대비 위치',type:'select',options:['설정안함','MA5 위','MA5 아래','MA20 위','MA20 아래','MA60 위','MA60 아래','MA120 위','MA120 아래'],default:'설정안함',source:'naver_sise'},
      // S49 추가
      {id:'new_high_low',name:'신고가/신저가',type:'select',options:['설정안함','52주 신고가','52주 신저가','연중 신고가','연중 신저가','20일 신고가','20일 신저가'],default:'설정안함',source:'calc_candle',desc:'기간별 고가/저가 갱신'},
      {id:'gap_type',name:'갭 발생',type:'select',options:['설정안함','상승갭 종목','하락갭 종목','갭상승 후 지지','갭하락 후 저항'],default:'설정안함',source:'calc_candle',desc:'시가갭 발생 여부'},
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
      // S49 추가
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
    // S49: 2단계 (KIS 키 필요) — 잠금 표시
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
  {id:'technical',name:'기술적분석',groups:[
    {id:'ta_signal',name:'분석 판정',conditions:[
      {id:'_signal_action',name:'매매 신호',type:'select',options:['설정안함','BUY','HOLD','SELL'],default:'설정안함',source:'calc_candle',desc:'분석 임계값 기반 매매 신호'},
      {id:'score_range',name:'진입타이밍 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'정규화 점수 0~100'},
      {id:'_safety_clean',name:'안전필터 클린',type:'select',options:['설정안함','클린 (0개)','1개 이하','2개 이하'],default:'설정안함',source:'calc_candle',desc:'안전필터 미충족 사유 개수'},
      {id:'_regime_label',name:'시장 레짐',type:'select',options:['설정안함','상승추세','하락추세','횡보/약세','횡보/강세'],default:'설정안함',source:'calc_candle',desc:'ADX+BB폭 기반 시장 레짐'},
      {id:'_squeeze',name:'BB 스퀴즈',type:'select',options:['설정안함','스퀴즈 중','스퀴즈 아님'],default:'설정안함',source:'calc_candle',desc:'볼린저밴드 수축 상태'},
      {id:'_rsi_div',name:'RSI 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔RSI 괴리'},
      {id:'_obv_div',name:'OBV 다이버전스',type:'select',options:['설정안함','강세 다이버전스','약세 다이버전스'],default:'설정안함',source:'calc_candle',desc:'가격↔OBV 괴리'},
      {id:'_pullback_score',name:'눌림목 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'눌림목 매수 적합도'},
    ]},
    {id:'ta_bt',name:'백테스트 (실시간)',conditions:[
      {id:'_bt_score',name:'매매전략 점수',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'BT 수익률+승률+MDD+PF 종합 0~100'},
      {id:'_bt_pnl',name:'BT 수익률',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'calc_candle',desc:'200봉 백테스트 총수익률'},
      {id:'_bt_winrate',name:'BT 승률',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'승리 거래 비율'},
      {id:'_bt_trades',name:'BT 거래수',type:'range',unit:'회',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'총 청산 거래 수'},
      {id:'_bt_mdd',name:'BT MDD',type:'range',unit:'%',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'최대 낙폭 (절대값)'},
      {id:'_bt_pf',name:'BT Profit Factor',type:'range',unit:'',min:0,max:10,default:{min:null,max:null},source:'calc_candle',desc:'평균이익/평균손실 비율'},
      {id:'_bt_action',name:'종합행동지침',type:'select',options:['설정안함','진입 적기','단기급등 주의','관심 등록','회피'],default:'설정안함',source:'calc_candle',desc:'진입타이밍×매매전략 교차 판정'},
    ]},
    {id:'ta_ma',name:'이동평균선',conditions:[
      {id:'ma_cross',name:'MA 크로스',type:'select',options:['설정안함','골든크로스 (5×20)','데드크로스 (5×20)','골든크로스 (20×60)','데드크로스 (20×60)','골든크로스 (60×120)','데드크로스 (60×120)'],default:'설정안함',source:'calc_candle'},
      {id:'ma_arrangement',name:'MA 배열',type:'select',options:['설정안함','정배열 (3개)','정배열 (4개)','역배열 (3개)','역배열 (4개)'],default:'설정안함',source:'calc_candle'},
      {id:'ma_slope',name:'MA 추세 방향',type:'select',options:['설정안함','MA20 상승중','MA20 하락중','MA60 상승중','MA60 하락중'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_trend',name:'추세지표',conditions:[
      {id:'macd_signal',name:'MACD 시그널',type:'select',options:['설정안함','MACD > Signal (매수)','MACD < Signal (매도)','골든크로스 (3일 이내)','데드크로스 (3일 이내)'],default:'설정안함',source:'calc_candle'},
      {id:'macd_histogram',name:'MACD 히스토그램',type:'select',options:['설정안함','양수 전환','음수 전환','양수 증가중','음수 감소중'],default:'설정안함',source:'calc_candle'},
      {id:'adx_value',name:'ADX (추세강도)',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'20↑=추세존재, 40↑=강한추세'},
      {id:'dmi_cross',name:'DMI 크로스',type:'select',options:['설정안함','+DI > -DI (상승)','+DI < -DI (하락)','+DI 골든크로스','+DI 데드크로스'],default:'설정안함',source:'calc_candle'},
      {id:'parabolic_sar',name:'Parabolic SAR',type:'select',options:['설정안함','SAR 아래 (상승 추세)','SAR 위 (하락 추세)','상승 전환','하락 전환'],default:'설정안함',source:'calc_candle'},
      // S49 추가
      {id:'eom_trend',name:'EOM (이동용이도)',type:'select',options:['설정안함','매수세 (상승)','매도세 (하락)','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle',desc:'가격 움직임의 용이도'},
      {id:'vhf_state',name:'VHF (추세판별)',type:'select',options:['설정안함','추세장 (>0.4)','횡보장 (<0.3)','보통'],default:'설정안함',source:'calc_candle',desc:'추세 vs 횡보 판별'},
    ]},
    {id:'ta_momentum',name:'모멘텀지표',conditions:[
      {id:'rsi_value',name:'RSI',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'30↓=과매도, 70↑=과매수'},
      {id:'stoch_k',name:'Stochastic %K',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle'},
      {id:'stoch_cross',name:'Stochastic 크로스',type:'select',options:['설정안함','%K > %D (매수)','%K < %D (매도)','골든크로스 (과매도권)','데드크로스 (과매수권)'],default:'설정안함',source:'calc_candle'},
      {id:'cci_value',name:'CCI',type:'range',unit:'',min:-300,max:300,default:{min:null,max:null},source:'calc_candle',desc:'-100↓=과매도, +100↑=과매수'},
      {id:'williams_r',name:'Williams %R',type:'range',unit:'',min:-100,max:0,default:{min:null,max:null},source:'calc_candle',desc:'-80~-100=과매도'},
      {id:'roc_value',name:'ROC',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'calc_candle'},
      {id:'momentum_value',name:'Momentum',type:'range',unit:'',min:null,max:null,default:{min:null,max:null},source:'calc_candle'},
      // S49 추가
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
      {id:'price_channel',name:'가격채널 (N일)',type:'select',options:['설정안함','상단 돌파','상단 반','하단 반','하단 이탈'],default:'설정안함',source:'calc_candle',desc:'20일 고가/저가 채널'},
      {id:'ma_disparity',name:'MA 이격도',type:'select',options:['설정안함','MA20 +5%↑ 과열','MA20 -5%↓ 침체','MA60 +10%↑ 과열','MA60 -10%↓ 침체','MA20 근접 (±2%)','MA60 근접 (±2%)'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_ichimoku',name:'일목균형표',conditions:[
      {id:'ichimoku_cloud',name:'구름 위치',type:'select',options:['설정안함','구름 위 (강세)','구름 안 (중립)','구름 아래 (약세)'],default:'설정안함',source:'calc_candle'},
      {id:'ichimoku_cross',name:'전환선/기준선',type:'select',options:['설정안함','전환선 > 기준선 (매수)','전환선 < 기준선 (매도)'],default:'설정안함',source:'calc_candle'},
      {id:'ichimoku_twist',name:'구름 전환',type:'select',options:['설정안함','양운 전환 (상승)','음운 전환 (하락)'],default:'설정안함',source:'calc_candle',desc:'선행스팬 교차'},
      {id:'ichimoku_chikou',name:'후행스팬',type:'select',options:['설정안함','26봉 전 가격 위 (강세)','26봉 전 가격 아래 (약세)'],default:'설정안함',source:'calc_candle'},
    ]},
    {id:'ta_volatility',name:'변동성',conditions:[
      {id:'atr_value',name:'ATR (평균진폭)',type:'range',unit:'',min:0,max:null,default:{min:null,max:null},source:'calc_candle'},
      {id:'atr_ratio',name:'ATR 비율 (ATR/종가)',type:'range',unit:'%',min:0,max:30,default:{min:null,max:null},source:'calc_candle'},
      {id:'std_dev_ratio',name:'표준편차 비율',type:'range',unit:'%',min:0,max:20,default:{min:null,max:null},source:'calc_candle',desc:'20일 종가 표준편차/평균'},
      {id:'true_range_ratio',name:'True Range 비율',type:'range',unit:'%',min:0,max:20,default:{min:null,max:null},source:'calc_candle',desc:'당일 TR/종가'},
      {id:'dx_value',name:'DX (방향성지수)',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'40↑=강한추세'},
    ]},
    {id:'ta_volume',name:'거래량 지표',conditions:[
      {id:'obv_trend',name:'OBV 추세',type:'select',options:['설정안함','상승 추세','하락 추세','OBV 다이버전스 (가격↓ OBV↑)'],default:'설정안함',source:'calc_candle'},
      {id:'mfi_value',name:'MFI',type:'range',unit:'',min:0,max:100,default:{min:null,max:null},source:'calc_candle',desc:'20↓=과매도, 80↑=과매수'},
      {id:'vr_value',name:'VR (Volume Ratio)',type:'range',unit:'%',min:0,max:1000,default:{min:null,max:null},source:'calc_candle',desc:'70↓=매수, 400↑=매도'},
      {id:'volume_ma_arr',name:'거래량 MA 배열',type:'select',options:['설정안함','정배열 (5>20>60)','역배열 (5<20<60)','20일 MA 돌파'],default:'설정안함',source:'calc_candle'},
      {id:'ad_trend',name:'A/D선 추세',type:'select',options:['설정안함','상승 (매집)','하락 (분산)','매집 다이버전스 (가격↓ A/D↑)'],default:'설정안함',source:'calc_candle'},
      {id:'nvi_trend',name:'NVI 추세',type:'select',options:['설정안함','MA 위 (강세)','MA 아래 (약세)'],default:'설정안함',source:'calc_candle',desc:'거래량감소일 주가추세'},
      {id:'pvi_trend',name:'PVI 추세',type:'select',options:['설정안함','MA 위 (강세)','MA 아래 (약세)'],default:'설정안함',source:'calc_candle',desc:'거래량증가일 주가추세'},
    ]},
    {id:'ta_momentum_ext',name:'모멘텀 확장',conditions:[
      {id:'trix_signal',name:'TRIX',type:'select',options:['설정안함','TRIX > Signal (매수)','TRIX < Signal (매도)','양수 전환','음수 전환'],default:'설정안함',source:'calc_candle',desc:'3중 지수이동평균'},
      {id:'stoch_slow_cross',name:'Stochastic Slow',type:'select',options:['설정안함','%K > %D','%K < %D','골든크로스','데드크로스'],default:'설정안함',source:'calc_candle'},
      {id:'macd_osc_trend',name:'MACD Oscillator',type:'select',options:['설정안함','상승 가속','상승','하락','하락 가속'],default:'설정안함',source:'calc_candle',desc:'히스토그램 변화율'},
      {id:'price_osc_value',name:'Price Oscillator',type:'select',options:['설정안함','양수 (상승추세)','음수 (하락추세)'],default:'설정안함',source:'calc_candle',desc:'(EMA12-EMA26)/EMA26'},
    ]},
    {id:'ta_other',name:'기타 지표',conditions:[
      {id:'demark_setup',name:'Demark TD Setup',type:'select',options:['설정안함','매수셋업 ≥9 (하락소진)','매도셋업 ≥9 (상승소진)','매수셋업 진행중','매도셋업 진행중'],default:'설정안함',source:'calc_candle',desc:'TD Sequential 추세소진'},
      {id:'demark_countdown',name:'Demark Countdown',type:'select',options:['설정안함','카운트다운 완성 (13)','카운트다운 진행중 (≥7)'],default:'설정안함',source:'calc_candle',desc:'TD Countdown 반전 확인'},
      {id:'three_line_break',name:'삼선전환도',type:'select',options:['설정안함','상승 전환','하락 전환','상승 지속','하락 지속'],default:'설정안함',source:'calc_candle',desc:'Three Line Break 방향'},
      {id:'binary_wave',name:'Binary Wave',type:'select',options:['설정안함','강세 (≥3)','약세 (≤-3)','중립'],default:'설정안함',source:'calc_candle',desc:'5지표 복합이진신호 (-5~+5)'},
      {id:'sonar_trend',name:'Sonar 모멘텀',type:'select',options:['설정안함','가속 (단기>장기)','감속 (단기<장기)'],default:'설정안함',source:'calc_candle',desc:'ROC 단기-장기 차이'},
      {id:'mass_index',name:'Mass Index',type:'select',options:['설정안함','Reversal Bulge (반전신호)','Setup (MI>27)','안정 (MI<26.5)'],default:'설정안함',source:'calc_candle',desc:'변동성 확장/수축'},
      {id:'vwap_position',name:'VWAP 위치',type:'select',options:['설정안함','VWAP 위 (강세)','VWAP 근처 (±1%)','VWAP 아래 (약세)','VWAP 크게 위 (+3%↑)','VWAP 크게 아래 (-3%↓)'],default:'설정안함',source:'calc_candle',desc:'20일 누적 가중평균가 대비'},
      {id:'swing_structure',name:'구조 패턴 (HH/HL)',type:'select',options:['설정안함','Higher High (고점 상승)','Higher Low (저점 상승)','HH+HL (상승구조)','Lower Low (저점 하락)'],default:'설정안함',source:'calc_candle',desc:'스윙 고저점 구조'},
    ]},
  ]},
  {id:'pattern',name:'패턴분석',groups:[
    {id:'pat_basic',name:'기본 캔들',conditions:[
      {id:'candle_type',name:'캔들 유형',type:'multi_check',options:[
        {id:'long_yang',name:'장대양봉'},{id:'long_eum',name:'장대음봉'},{id:'doji',name:'도지 (십자)'},
        {id:'hammer',name:'해머 (망치)'},{id:'shooting_star',name:'슈팅스타'},{id:'spinning_top',name:'스피닝 탑'},
        {id:'inside_day',name:'인사이드데이'},{id:'outside_day',name:'아웃사이드데이'},
        // S49 추가
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
        // S49 추가
        {id:'bullish_counterattack',name:'상승 카운터어택'},{id:'bearish_counterattack',name:'하락 카운터어택'},
        {id:'morning_doji_star',name:'모닝 도지 스타'},{id:'evening_doji_star',name:'이브닝 도지 스타'},
        {id:'abandoned_baby_bull',name:'어밴던드 베이비 (상승)'},{id:'abandoned_baby_bear',name:'어밴던드 베이비 (하락)'},
      ],source:'calc_candle'},
    ]},
    {id:'pat_continuation',name:'지속 패턴',conditions:[
      {id:'continuation_pattern',name:'지속 패턴',type:'multi_check',options:[
        {id:'three_white',name:'적삼병 (상승지속)'},{id:'three_black',name:'흑삼병 (하락지속)'},
        {id:'gap_up',name:'상승 갭'},{id:'gap_down',name:'하락 갭'},
        // S49 추가
        {id:'advance_block',name:'어드밴스 블럭'},{id:'stalled_pattern',name:'스톨드 패턴'},
        {id:'upside_gap_tasuki',name:'업사이드갭 태스키'},{id:'downside_gap_tasuki',name:'다운사이드갭 태스키'},
      ],source:'calc_candle'},
    ]},
  ]},
  {id:'fundamental',name:'재무분석',groups:[
    {id:'fund_valuation',name:'주가지표 (밸류에이션)',conditions:[
      {id:'per',name:'PER',type:'range',unit:'배',min:-100,max:200,default:{min:0,max:30},source:'yahoo_fundamental'},
      {id:'pbr',name:'PBR',type:'range',unit:'배',min:0,max:50,default:{min:0,max:5},source:'yahoo_fundamental'},
      {id:'psr',name:'PSR',type:'range',unit:'배',min:0,max:100,default:{min:0,max:10},source:'naver_finance'},
      {id:'ev_ebitda',name:'EV/EBITDA',type:'range',unit:'배',min:-50,max:100,default:{min:0,max:20},source:'naver_finance',desc:'현금 미반영 근사치'},
      {id:'eps',name:'EPS',type:'range',unit:'원',min:null,max:null,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'bps',name:'BPS',type:'range',unit:'원',min:null,max:null,default:{min:null,max:null},source:'naver_finance'},
      {id:'dividend_yield',name:'배당수익률',type:'range',unit:'%',min:0,max:30,default:{min:null,max:null},source:'yahoo_fundamental'},
      // S49 추가
      {id:'pcr',name:'PCR',type:'range',unit:'배',min:0,max:100,default:{min:null,max:null},source:'naver_finance',desc:'영업이익 대용 근사치 (영업CF 미분리)'},
      {id:'peg',name:'PEG',type:'range',unit:'',min:-10,max:10,default:{min:0,max:2},source:'naver_finance',desc:'PER/EPS성장률 (성장률>0일 때만)'},
    ]},
    {id:'fund_profit',name:'수익성',conditions:[
      {id:'roe',name:'ROE',type:'range',unit:'%',min:-100,max:200,default:{min:null,max:null},source:'yahoo_fundamental'},
      {id:'roa',name:'ROA',type:'range',unit:'%',min:-100,max:100,default:{min:null,max:null},source:'naver_finance',desc:'순이익/총자산'},
      {id:'operating_margin',name:'영업이익률',type:'range',unit:'%',min:-100,max:100,default:{min:null,max:null},source:'naver_finance'},
      {id:'net_margin',name:'순이익률',type:'range',unit:'%',min:-200,max:200,default:{min:null,max:null},source:'yahoo_fundamental'},
      // S49 추가
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
  {id:'ranking',name:'순위분석',groups:[
    {id:'rank_price',name:'시세 순위',conditions:[
      {id:'rank_change_rate',name:'등락률 상위',type:'range',unit:'위',min:1,max:500,default:{min:null,max:null},source:'krx_market_cap'},
      {id:'rank_volume',name:'거래량 상위',type:'range',unit:'위',min:1,max:500,default:{min:null,max:null},source:'krx_market_cap'},
      {id:'rank_trade_amount',name:'거래대금 상위',type:'range',unit:'위',min:1,max:500,default:{min:null,max:null},source:'krx_market_cap'},
      {id:'rank_market_cap',name:'시가총액 상위',type:'range',unit:'위',min:1,max:2000,default:{min:null,max:null},source:'krx_market_cap'},
      {id:'rank_foreign_ratio',name:'외국인보유 상위',type:'range',unit:'위',min:1,max:500,default:{min:null,max:null},source:'krx_market_cap'},
      // S49 추가
      {id:'rank_volume_change',name:'거래량증감률 상위',type:'range',unit:'위',min:1,max:500,default:{min:null,max:null},source:'krx_market_cap',desc:'전일대비 거래량 증감 순위'},
      {id:'rank_volatility',name:'변동폭 상위',type:'range',unit:'위',min:1,max:500,default:{min:null,max:null},source:'krx_market_cap',desc:'고가-저가 변동폭 순위'},
    ]},
  ]},
  {id:'market_env',name:'시장환경',groups:[
    {id:'env_state',name:'시장 상태',conditions:[
      {id:'mkt_env_state',name:'시장 환경',type:'select',options:['설정안함','강세 (bull)','약세강세 (mild_bull)','중립 (neutral)','약세약세 (mild_bear)','약세 (bear)'],default:'설정안함',source:'oracle_index',desc:'ORACLE 지수 데이터 기반'},
    ]},
    {id:'env_index',name:'지수 등락률',conditions:[
      {id:'mkt_env_kospi_chg',name:'KOSPI 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index',desc:'당일 KOSPI 등락률'},
      {id:'mkt_env_kosdaq_chg',name:'KOSDAQ 등락률',type:'range',unit:'%',min:-10,max:10,default:{min:null,max:null},source:'oracle_index',desc:'당일 KOSDAQ 등락률'},
    ]},
  ]},
];

// ── 기본 프리셋 (시장별) ──
const DEFAULT_PRESETS_KR = [
  // ── S63: 진입타이밍 (엔진 score ≥60 + 핵심 기술 조건) ──
  {id:'preset_entry_timing',name:'진입타이밍',desc:'진입타이밍 60↑ + MACD 매수 + OBV 상승 + 정배열 + 구름 위',locked:true,conditions:{score_range:{min:60,max:null},macd_signal:'MACD > Signal (매수)',obv_trend:'상승 추세',ma_arrangement:'정배열 (3개)',ichimoku_cloud:'구름 위 (강세)'}},
  // ── 기술적 전략 ──
  {id:'preset_breakout',name:'급등 시작 탐지',desc:'20일 신고가 + 거래량 200%↑ + VWAP 위 + MACD 양수 + EOM 매수',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:500,max:null},new_high_low:'20일 신고가',volume_avg20_ratio:{min:200,max:null},trade_amount:{min:300,max:null},vwap_position:'VWAP 위 (강세)',macd_signal:'MACD > Signal (매수)',eom_trend:'매수세 (상승)'}},
  {id:'preset_pullback',name:'눌림목 매수',desc:'MA정배열 + MA20 근접 + RSI 40~55 + OBV상승 + VHF추세장',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:500,max:null},ma_arrangement:'정배열 (3개)',ma_disparity:'MA20 근접 (±2%)',rsi_value:{min:40,max:55},obv_trend:'상승 추세',trade_amount:{min:300,max:null},vhf_state:'추세장 (>0.4)'}},
  {id:'preset_reversal',name:'반등 시작',desc:'RSI 과매도 + MACD 골든 + BB 하단 + 심리도 과매도',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:500,max:null},rsi_value:{min:20,max:35},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',trade_amount:{min:300,max:null},psycho_value:{min:null,max:25}}},
  {id:'preset_accumulation',name:'세력 매집',desc:'OBV 상승 + A/D 매집 + Chaikin 매집 + 가격 횡보 + 거래량↑',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:500,max:null},obv_trend:'상승 추세',ad_trend:'상승 (매집)',chaikin_osc:'양수 (매집)',change_rate:{min:-2,max:2},volume_avg20_ratio:{min:120,max:null},trade_amount:{min:300,max:null}}},
  {id:'preset_breakdown',name:'위험 감지',desc:'MA60↓ + MA역배열 + VWAP↓ + EOM 매도 + RSI 과매수',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:500,max:null},price_vs_ma:'MA60 아래',ma_arrangement:'역배열 (3개)',vwap_position:'VWAP 아래 (약세)',eom_trend:'매도세 (하락)',rsi_value:{min:70,max:null}}},
  {id:'preset_trend',name:'추세 추종',desc:'MA정배열 + HH/HL 상승 + MACD매수 + RSI 50~70 + VHF추세장',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:500,max:null},ma_arrangement:'정배열 (3개)',swing_structure:'HH+HL (상승구조)',macd_signal:'MACD > Signal (매수)',rsi_value:{min:50,max:70},trade_amount:{min:300,max:null},vhf_state:'추세장 (>0.4)'}},
  {id:'preset_foreign',name:'외국인 매집',desc:'외국인 5일 연속 순매수 + 시총 3000억↑ + OBV 상승',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:3000,max:null},foreign_net_buy_days:{min:5,max:null},obv_trend:'상승 추세',trade_amount:{min:500,max:null}}},
  // ── 시장 환경 연동 ──
  {id:'preset_bear_defense',name:'약세장 방어',desc:'시장약세 + 저부채 + 고배당 + 외국인↑ + 저변동성',locked:true,conditions:{mkt_env_state:'약세 (bear)',market_cap:{min:3000,max:null},foreign_ratio:{min:10,max:null},atr_ratio:{min:0,max:3},dividend_yield:{min:2,max:null},debt_ratio:{min:0,max:100}}},
  {id:'preset_bull_attack',name:'강세장 공격',desc:'시장강세 + 정배열 + 거래량폭발 + MACD매수 + RSI 50~70',locked:true,conditions:{mkt_env_state:'강세 (bull)',ma_arrangement:'정배열 (3개)',volume_avg20_ratio:{min:200,max:null},macd_signal:'MACD > Signal (매수)',rsi_value:{min:50,max:70},trade_amount:{min:500,max:null}}},
  // ── 변동성/패턴 ──
  {id:'preset_squeeze_break',name:'변동성 폭발 대기',desc:'BB 스퀴즈 + VHF 횡보 + 거래량 연속증가 + OBV 상승',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:500,max:null},bb_width:'스퀴즈 (수축)',vhf_state:'횡보장 (<0.3)',volume_consec_inc:{min:3,max:null},obv_trend:'상승 추세',trade_amount:{min:300,max:null}}},
  {id:'preset_candle_reversal',name:'캔들 반전 신호',desc:'반전패턴 + RSI 과매도 + 거래량↑ + OBV 다이버전스',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:500,max:null},reversal_pattern:['morning_star','bullish_engulfing','morning_doji_star','abandoned_baby_bull','hammer'],rsi_value:{min:null,max:35},volume_avg20_ratio:{min:150,max:null},trade_amount:{min:300,max:null}}},
  {id:'preset_gap_up',name:'갭상승 후 지지',desc:'갭상승 후 지지 + 거래량↑ + EOM 매수 + VWAP 위',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:500,max:null},gap_type:'갭상승 후 지지',volume_avg20_ratio:{min:150,max:null},eom_trend:'매수세 (상승)',vwap_position:'VWAP 위 (강세)',trade_amount:{min:300,max:null}}},
  // ── S60: 재무 전략 (신규) ──
  {id:'preset_value',name:'가치주 발굴',desc:'PER 0~15 + PBR 0~1.5 + ROE 5%↑ + 부채비율 200↓',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:1000,max:null},per:{min:0,max:15},pbr:{min:0,max:1.5},roe:{min:5,max:null},debt_ratio:{min:0,max:200},trade_amount:{min:500,max:null}}},
  {id:'preset_high_roa',name:'고ROA 저부채',desc:'ROA 5%↑ + 부채비율 100↓ + 영업이익률 8%↑',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:1000,max:null},roa:{min:5,max:null},debt_ratio:{min:0,max:100},operating_margin:{min:8,max:null},trade_amount:{min:500,max:null}}},
  {id:'preset_growth_value',name:'고성장 밸류',desc:'PEG 0~1.2 + 매출성장 15%↑ + 영업이익 증감 15%↑',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:500,max:null},peg:{min:0,max:1.2},revenue_growth:{min:15,max:null},operating_profit_growth:{min:15,max:null},trade_amount:{min:300,max:null}}},
  {id:'preset_profit_quality',name:'수익성 우량',desc:'영업이익률 15%↑ + ROE 10%↑ + PSR 0~5 + EV/EBITDA 0~12',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:1000,max:null},operating_margin:{min:15,max:null},roe:{min:10,max:null},psr:{min:0,max:5},ev_ebitda:{min:0,max:12},trade_amount:{min:500,max:null}}},
  // ── S60: AI 추천 프리셋 ──
  {id:'preset_ai_allweather',name:'🤖 AI 범용 추천',desc:'정배열 + MACD매수 + OBV상승 + RSI 45~65 + 거래량↑ + 저부채',locked:true,conditions:{exclude_types:['managed','warning','preferred','suspended','cleanup','etf','etn','spac'],market_cap:{min:1000,max:null},ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',obv_trend:'상승 추세',rsi_value:{min:45,max:65},volume_avg20_ratio:{min:120,max:null},debt_ratio:{min:0,max:200},trade_amount:{min:500,max:null}}},
  {id:'preset_ai_bull_kr',name:'🤖 AI 강세장',desc:'시장강세 + 정배열 + MACD매수 + 거래량폭발 + HH/HL + VWAP위',locked:true,conditions:{mkt_env_state:'강세 (bull)',ma_arrangement:'정배열 (4개)',macd_signal:'MACD > Signal (매수)',volume_avg20_ratio:{min:200,max:null},swing_structure:'HH+HL (상승구조)',vwap_position:'VWAP 위 (강세)',trade_amount:{min:500,max:null}}},
  {id:'preset_ai_neutral_kr',name:'🤖 AI 보합장',desc:'시장중립 + 눌림목 + OBV매집 + BB중심 + 저변동 + ROE양호',locked:true,conditions:{mkt_env_state:'중립 (neutral)',ma_arrangement:'정배열 (3개)',ma_disparity:'MA20 근접 (±2%)',obv_trend:'상승 추세',band_pctb:{min:0.3,max:0.7},atr_ratio:{min:0,max:4},roe:{min:5,max:null},trade_amount:{min:500,max:null}}},
  {id:'preset_ai_bear_kr',name:'🤖 AI 약세장',desc:'시장약세 + RSI반등 + MACD골든 + BB하단 + 고배당 + 저부채',locked:true,conditions:{mkt_env_state:'약세 (bear)',rsi_value:{min:25,max:40},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',dividend_yield:{min:2,max:null},debt_ratio:{min:0,max:100},market_cap:{min:3000,max:null}}},
];

const DEFAULT_PRESETS_COIN = [
  // ── S63: 진입타이밍 ──
  {id:'preset_coin_entry_timing',name:'진입타이밍',desc:'진입타이밍 60↑ + MACD 매수 + OBV 상승 + 정배열',locked:true,conditions:{score_range:{min:60,max:null},macd_signal:'MACD > Signal (매수)',obv_trend:'상승 추세',ma_arrangement:'정배열 (3개)'}},
  {id:'preset_coin_breakout',name:'급등 시작',desc:'등락률 5%↑ + 거래량 200%↑ + VWAP 위 + MACD매수 + EOM 매수',locked:true,conditions:{change_rate:{min:5,max:null},volume_avg20_ratio:{min:200,max:null},vwap_position:'VWAP 위 (강세)',macd_signal:'MACD > Signal (매수)',eom_trend:'매수세 (상승)'}},
  {id:'preset_coin_pullback',name:'눌림목 매수',desc:'MA정배열 + MA20 근접 + RSI 40~55 + OBV 상승 + VHF추세장',locked:true,conditions:{ma_arrangement:'정배열 (3개)',ma_disparity:'MA20 근접 (±2%)',rsi_value:{min:40,max:55},obv_trend:'상승 추세',vhf_state:'추세장 (>0.4)'}},
  {id:'preset_coin_reversal',name:'과매도 반등',desc:'RSI 과매도 + MACD 골든 + BB하단 + 심리도 과매도',locked:true,conditions:{rsi_value:{min:0,max:30},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',psycho_value:{min:null,max:25}}},
  {id:'preset_coin_trend',name:'추세 라이딩',desc:'MA정배열 + MACD매수 + OBV상승 + RSI 50~70 + VHF추세장',locked:true,conditions:{ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',obv_trend:'상승 추세',rsi_value:{min:50,max:70},vhf_state:'추세장 (>0.4)'}},
  {id:'preset_coin_accumulation',name:'매집 감지',desc:'OBV 상승 + 횡보 + Chaikin 매집 + 거래량↑',locked:true,conditions:{obv_trend:'상승 추세',change_rate:{min:-3,max:3},chaikin_osc:'양수 (매집)',volume_avg20_ratio:{min:150,max:null}}},
  {id:'preset_coin_volatility',name:'변동성 수축',desc:'BB 스퀴즈 + VHF 횡보 + RSI 중립 + OBV 상승',locked:true,conditions:{bb_width:'스퀴즈 (수축)',vhf_state:'횡보장 (<0.3)',rsi_value:{min:40,max:60},obv_trend:'상승 추세'}},
  {id:'preset_coin_bear_def',name:'약세장 방어',desc:'BTC 약세 + RSI 과매도 + MACD 골든 + BB 하단',locked:true,conditions:{mkt_env_state:'약세 (bear)',rsi_value:{min:20,max:35},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈'}},
  {id:'preset_coin_bull_atk',name:'강세장 공격',desc:'BTC 강세 + 정배열 + MACD매수 + 거래량폭발 + EOM 매수',locked:true,conditions:{mkt_env_state:'강세 (bull)',ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',volume_avg20_ratio:{min:200,max:null},eom_trend:'매수세 (상승)'}},
  // ── S60: AI 추천 프리셋 ──
  {id:'preset_coin_ai_allweather',name:'🤖 AI 범용 추천',desc:'정배열 + MACD매수 + OBV상승 + RSI 45~65 + 거래량↑',locked:true,conditions:{ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',obv_trend:'상승 추세',rsi_value:{min:45,max:65},volume_avg20_ratio:{min:120,max:null}}},
  {id:'preset_coin_ai_bull',name:'🤖 AI 강세장',desc:'BTC강세 + 정배열 + MACD매수 + HH/HL + VWAP위 + 거래량폭발',locked:true,conditions:{mkt_env_state:'강세 (bull)',ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',swing_structure:'HH+HL (상승구조)',vwap_position:'VWAP 위 (강세)',volume_avg20_ratio:{min:200,max:null}}},
  {id:'preset_coin_ai_neutral',name:'🤖 AI 보합장',desc:'BTC중립 + 눌림목 + OBV매집 + BB중심 + Chaikin매집',locked:true,conditions:{mkt_env_state:'중립 (neutral)',ma_arrangement:'정배열 (3개)',ma_disparity:'MA20 근접 (±2%)',obv_trend:'상승 추세',band_pctb:{min:0.3,max:0.7},chaikin_osc:'양수 (매집)'}},
  {id:'preset_coin_ai_bear',name:'🤖 AI 약세장',desc:'BTC약세 + RSI반등 + MACD골든 + BB하단 + 심리도과매도',locked:true,conditions:{mkt_env_state:'약세 (bear)',rsi_value:{min:20,max:35},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',psycho_value:{min:null,max:25}}},
];

const DEFAULT_PRESETS_US = [
  // ── S63: 진입타이밍 ──
  {id:'preset_us_entry_timing',name:'진입타이밍',desc:'진입타이밍 60↑ + MACD 매수 + OBV 상승 + 정배열',locked:true,conditions:{score_range:{min:60,max:null},macd_signal:'MACD > Signal (매수)',obv_trend:'상승 추세',ma_arrangement:'정배열 (3개)'}},
  {id:'preset_us_breakout',name:'급등 시작',desc:'정배열 + MACD매수 + RSI 50~70 + VWAP 위 + EOM 매수',locked:true,conditions:{ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',rsi_value:{min:50,max:70},vwap_position:'VWAP 위 (강세)',eom_trend:'매수세 (상승)'}},
  {id:'preset_us_pullback',name:'눌림목 매수',desc:'MA정배열 + RSI 40~55 + OBV상승 + VHF추세장',locked:true,conditions:{ma_arrangement:'정배열 (3개)',rsi_value:{min:40,max:55},obv_trend:'상승 추세',vhf_state:'추세장 (>0.4)'}},
  {id:'preset_us_oversold',name:'과매도 반등',desc:'RSI 과매도 + MACD 골든 + BB 하단 + 심리도 과매도',locked:true,conditions:{rsi_value:{min:0,max:30},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',psycho_value:{min:null,max:25}}},
  {id:'preset_us_value',name:'가치주 발굴',desc:'PER 0~15 + PBR 0~1.5 + ROE 5%↑ + 배당 1%↑',locked:true,conditions:{per:{min:0,max:15},pbr:{min:0,max:1.5},roe:{min:5,max:null},dividend_yield:{min:1,max:null}}},
  {id:'preset_us_trend',name:'추세 추종',desc:'MA정배열 + MACD매수 + OBV상승 + HH/HL상승 + VHF추세장',locked:true,conditions:{ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',obv_trend:'상승 추세',swing_structure:'HH+HL (상승구조)',vhf_state:'추세장 (>0.4)'}},
  {id:'preset_us_bear_def',name:'약세장 방어',desc:'RSI 과매도 + BB 하단 + PER 저평가 + 배당',locked:true,conditions:{rsi_value:{min:0,max:30},bb_position:'하단 이탈',per:{min:0,max:15},dividend_yield:{min:2,max:null}}},
  // ── S60: AI 추천 프리셋 ──
  {id:'preset_us_ai_allweather',name:'🤖 AI 범용 추천',desc:'정배열 + MACD매수 + OBV상승 + RSI 45~65 + PER 0~25',locked:true,conditions:{ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',obv_trend:'상승 추세',rsi_value:{min:45,max:65},per:{min:0,max:25}}},
  {id:'preset_us_ai_bull',name:'🤖 AI 강세장',desc:'시장강세 + 정배열 + MACD매수 + HH/HL + VWAP위',locked:true,conditions:{mkt_env_state:'강세 (bull)',ma_arrangement:'정배열 (3개)',macd_signal:'MACD > Signal (매수)',swing_structure:'HH+HL (상승구조)',vwap_position:'VWAP 위 (강세)'}},
  {id:'preset_us_ai_neutral',name:'🤖 AI 보합장',desc:'시장중립 + 눌림목 + OBV매집 + BB중심 + 가치주',locked:true,conditions:{mkt_env_state:'중립 (neutral)',ma_arrangement:'정배열 (3개)',ma_disparity:'MA20 근접 (±2%)',obv_trend:'상승 추세',band_pctb:{min:0.3,max:0.7},per:{min:0,max:20}}},
  {id:'preset_us_ai_bear',name:'🤖 AI 약세장',desc:'시장약세 + RSI반등 + MACD골든 + BB하단 + 배당 + 저PER',locked:true,conditions:{mkt_env_state:'약세 (bear)',rsi_value:{min:20,max:35},macd_signal:'골든크로스 (3일 이내)',bb_position:'하단 이탈',dividend_yield:{min:2,max:null},per:{min:0,max:15}}},
];

function getDefaultPresets(){
  return currentMarket==='coin'?DEFAULT_PRESETS_COIN:currentMarket==='us'?DEFAULT_PRESETS_US:DEFAULT_PRESETS_KR;
}

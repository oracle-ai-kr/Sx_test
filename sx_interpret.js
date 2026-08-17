// ════════════════════════════════════════════════════════════
//  SIGNAL X — Interpret Engine v5.3
// ════════════════════════════════════════════════════════════
const SXI = {};

// ════════════════════════════════════════════════════════════
//  [PLAN_7-B] 금융업 감지 — EV/EBITDA·EBITDA 마진 비적용 판정용
//  EBITDA는 비금융업의 영업현금창출력 지표인데 금융업(은행/보험/증권/지주)은
//  영업이익 정의 자체가 다르고 감가상각 비중이 낮아 EBITDA가 의미 없거나
//  비현실적 값(음수/극단치)이 나옴. 표시 자체를 생략하는 편이 사용자에게
//  덜 혼란스러움.
//
//  3중 감지 (OR):
//   1) 종목코드 화이트리스트 (대형 금융주 — 가장 확실)
//   2) DART industry_code (KSIC: K64 금융업 / K65 보험·연금 / K66 금융보조)
//   3) 종목명/섹터명 키워드 (은행·보험·증권·금융·지주·생명·화재·손해보험·캐피탈·카드)
//
//  반환: true (금융업) | false
// ════════════════════════════════════════════════════════════
SXI.isFinancialIndustry = function(stock){
  if(!stock) return false;

  // 1) 종목코드 화이트리스트 (KRX 기준, 대형/주요 금융주)
  //    유의: 동일 코드가 변경되거나 신규 상장 시 누락 가능 — 키워드/code가 보조
  const FIN_CODES = new Set([
    // 금융지주
    '105560', // KB금융
    '055550', // 신한지주
    '086790', // 하나금융지주
    '316140', // 우리금융지주
    '175330', // JB금융지주
    '138930', // BNK금융지주
    '139130', // DGB금융지주
    '138040', // 메리츠금융지주
    '071050', // 한국금융지주
    '003540', // 대신증권 — 대신금융그룹 산하
    // 은행
    '024110', // 기업은행
    '323410', // 카카오뱅크
    '006220', // 제주은행
    // 증권
    '006800', // 미래에셋증권
    '005940', // NH투자증권
    '016360', // 삼성증권
    '039490', // 키움증권
    '008560', // 메리츠증권
    '030610', // 교보증권
    '001510', // SK증권
    '003460', // 유화증권
    '003470', // 유안타증권
    '016610', // DB금융투자
    '001270', // 부국증권
    '001720', // 신영증권
    '001750', // 한양증권
    '001200', // 유진투자증권
    '078020', // 이베스트투자증권
    '003530', // 한화투자증권
    '190650', // 케이프(케이프투자증권)
    '102260', // 동부증권 → 현 DB금투
    // 생명보험
    '032830', // 삼성생명
    '088350', // 한화생명
    '085620', // 미래에셋생명
    '082640', // 동양생명
    // 손해보험
    '000810', // 삼성화재
    '005830', // DB손해보험
    '001450', // 현대해상
    '000060', // 메리츠화재
    '000370', // 한화손해보험
    '000540', // 흥국화재
    '000400', // 롯데손해보험
    // 카드/캐피탈
    '029780', // 삼성카드
  ]);
  if(stock.code && FIN_CODES.has(String(stock.code).trim())) return true;

  // 2) DART industry_code (KSIC 첫 글자 K + 첫 두 자리 숫자)
  //    K64 = 금융업 (중앙은행/은행/투자기관/금융지주 등)
  //    K65 = 보험 및 연금업
  //    K66 = 금융 및 보험 관련 서비스업 (증권 중개, 자산운용 등)
  const ic = stock.industryCode || stock._industryCode;
  if(ic){
    const s = String(ic).trim().toUpperCase();
    if(s.startsWith('K64') || s.startsWith('K65') || s.startsWith('K66')) return true;
    // 일부 응답은 K 없이 5자리 숫자 (64xxx ~ 66xxx)
    if(/^6[456]\d{3}$/.test(s)) return true;
    // [추가] DART /dart/company API 실제 응답은 KSIC 소분류 3자리 (641 은행 / 651 보험 / 661 금융서비스)
    //   → 64x / 65x / 66x 패턴 모두 금융업으로 처리
    //   sx_render.js에서 stock.industryCode에 3자리 코드를 박아주는 흐름과 정합 (PLAN_7-B 보강)
    if(/^6[456]\d$/.test(s)) return true;
  }

  // 3) 종목명/섹터명 키워드 매칭
  //    '지주'는 단독으로는 비금융 지주(예: SK스퀘어)도 있어 위험 → '금융지주'만 인정
  //    '생명'은 '○○생명과학/공학/바이오'와 충돌하므로 보험사 이름 패턴(끝-생명)으로 제한
  const text = `${stock.name||''} ${stock.sector||''}`.replace(/\s+/g,'');
  if(!text) return false;
  // 강한 신호 (단독 매칭으로 금융업 확정)
  const FIN_KEYWORDS = [
    '은행', '금융지주', '금융그룹',
    '증권', '투자증권', '금융투자',
    '생명보험',
    '화재', '손해보험', '손보',
    '카드', '캐피탈', '저축은행',
  ];
  for(const kw of FIN_KEYWORDS){
    if(text.includes(kw)){
      // '카드'는 종목명에선 신용카드사 의도가 거의 확실. 일반 단어 충돌 사례 없음
      // '화재'는 '○○화재해상보험'/'○○화재' 외에 사용 사례 사실상 없음
      return true;
    }
  }
  // '생명'은 종목명 끝(또는 끝에서 띄어쓰기 후)에 올 때만 보험사로 인정
  //   매칭: '한화생명', '삼성생명' / 비매칭: '생명과학', 'XX생명공학', '바이오생명'
  //   '○○생명' 끝나는 종목은 거의 모두 보험사이지만, 안전하게 바이오/과학/공학 키워드가
  //   같이 들어간 종목명은 제외
  if(stock.name){
    const nm = String(stock.name).replace(/\s+$/,'');
    if(/생명$/.test(nm) && !/(바이오|생명과학|생명공학|메디|제약|헬스|진단|뉴로|셀)/.test(nm)){
      return true;
    }
  }
  // 섹터명에 '금융'/'보험' 들어가면 거의 확실 (단, '비금융' 같은 부정형은 제외)
  if(stock.sector){
    const sec = String(stock.sector);
    if(/금융|보험/.test(sec) && !/비금융/.test(sec)) return true;
  }

  return false;
};

// ════════════════════════════════════════════════════════════
//  1단계: 지표별 구간 해석
//  반환: { label, tone, text } | null
//  tone: 'bullish'|'bearish'|'neutral'|'warning'|'danger'
// ════════════════════════════════════════════════════════════

SXI.rsi = function(val){
  if(val==null) return null;
  const v=+val;
  if(!Number.isFinite(v)) return null; // [PATCH-1] NaN/Infinity 방어
  if(v<=20) return {label:'극단적 과매도',tone:'bullish',text:`RSI가 ${v.toFixed(1)}로 극단적 과매도 상태입니다. 매도 세력이 거의 소진된 구간으로 기술적 반등 가능성이 높습니다. 다만 강한 하락 추세에서는 RSI가 10~15까지 추가 하락도 가능하므로, MACD 골든크로스나 거래량 급증 같은 보조 확인이 동반될 때 교과서에서는 신뢰도가 크게 높아진다고 봅니다. 2~3개 지표 동시 확인 후 접근을 권합니다.`};
  if(v<=30) return {label:'과매도',tone:'bullish',text:`RSI가 ${v.toFixed(1)}로 과매도 구간입니다. 매도 압력이 과도한 상태이며 반등 첫 번째 후보 구간입니다. MACD 골든크로스·거래량 증가·BB 하단 반등이 함께 나타나면 교과서에서는 신뢰도가 높아진다고 봅니다. 다만 하락 추세가 강할 경우 과매도가 수일간 지속되므로, 실제 반전 양봉 확인 후가 안전합니다.`};
  if(v<=40) return {label:'약세 구간',tone:'bearish',text:`RSI가 ${v.toFixed(1)}로 매도세 우위 약세 구간입니다. 아직 과매도는 아니라 반등 신호로 보기엔 이릅니다. 추세 전환 신호(MACD 방향 전환, 지지선 확인) 없이 매수하면 추가 하락 노출 위험이 큽니다. RSI 30 이하 또는 반전 양봉까지 대기가 유리합니다.`};
  if(v<=50) return {label:'중립 약세',tone:'neutral',text:`RSI가 ${v.toFixed(1)}로 중립~약세입니다. RSI 단독으로 방향 판단이 어려운 탐색 구간이며, MA 배열·거래량 방향을 함께 확인해야 합니다. 횡보장에서 이 구간이 오래 지속되면 에너지 축적 후 돌파가 나올 수 있습니다.`};
  if(v<=60) return {label:'중립 강세',tone:'neutral',text:`RSI가 ${v.toFixed(1)}로 중립~강세입니다. 약한 매수 우위이나 추세 확인은 안 된 상태입니다. MA 정배열·거래량 동반 여부를 함께 보면 교과서에서는 신뢰도가 높아진다고 봅니다. 상승 추세 초기 또는 횡보 상단에서 자주 나타나는 구간입니다.`};
  if(v<=70) return {label:'강세 구간',tone:'bullish',text:`RSI가 ${v.toFixed(1)}로 매수세 우위 강세 구간입니다. 상승 추세 추종에 유리하며, MA 정배열과 함께 나타나면 추세 건강성이 높습니다. 눌림목 접근이 적합한 RSI 영역이며, 70 근접 시 과매수 진입을 주시하세요.`};
  if(v<=80) return {label:'과매수',tone:'warning',text:`RSI가 ${v.toFixed(1)}로 과매수 구간입니다. 강한 추세장에서는 과매수가 2~3주 이상 지속될 수 있어, RSI 70 돌파만으로 바로 매도하면 수익 기회를 놓칠 수 있습니다. 다만 MACD 둔화, 거래량 감소, 윗꼬리 음봉 등 모멘텀 약화가 동반되면 단기 고점을 의심하세요. 신규 매수는 매우 불리합니다.`};
  return {label:'극단적 과매수',tone:'danger',text:`RSI가 ${v.toFixed(1)}로 극단적 과열입니다. 급락이나 급조정이 임박 가능성이 높으며, 보유 중이면 최소 절반 분할 매도를 적극 검토하세요. 신규 진입은 절대 피해야 할 자리입니다.`};
};

SXI.macd = function(hist, prevHist, recentGolden, recentDead){
  if(hist==null) return null;
  const h=+hist, pH=prevHist!=null?+prevHist:null;
  if(!Number.isFinite(h)) return null; // [PATCH-1] NaN/Infinity 방어
  if(recentGolden && h>=0) return {label:'골든크로스 (제로선 위)',tone:'bullish',text:'MACD선이 시그널선을 상향 돌파하면서 제로선 위에 있습니다. 기존 상승 추세가 재가속되는 강력한 신호이며, 거래량 동반 시 교과서에서는 신뢰도가 매우 높아진다고 봅니다. 눌림목 매수 진입 타이밍으로 적합하며, 히스토그램이 빠르게 줄어들기 시작하면 모멘텀 피로를 의심하세요.'};
  if(recentGolden) return {label:'골든크로스 (제로선 아래)',tone:'bullish',text:'MACD선이 제로선 아래에서 골든크로스했습니다. 하락 추세 내 방향 전환 초기 신호이며, 아직 완전한 추세 전환이라 단정하기 이릅니다. 제로선을 상향 돌파하면 추세 전환 확정이며, 그때까지는 기술적 반등으로 접근이 안전합니다.'};
  if(recentDead && h<=0) return {label:'데드크로스 (제로선 아래)',tone:'danger',text:'MACD선이 제로선 아래에서 데드크로스했습니다. 교과서에서는 이를 하락 모멘텀이 본격 강화되는 구간으로 보고 MACD 조합 중 가장 위험한 축에 넣습니다. 청산·비중 조정 시점은 미리 정한 규칙대로 판단하세요. ADX 30 이상이 겹치면 교과서는 하락 가속으로 읽습니다.'};
  if(recentDead) return {label:'데드크로스 (제로선 위)',tone:'bearish',text:'MACD선이 제로선 위에서 데드크로스했습니다. 상승 모멘텀이 피로를 보이는 단계이며, 추세 꺾임 초기 경고입니다. 추가 매수 자제하고, 히스토그램이 음수 전환되는지 주시하세요.'};
  if(h>0 && pH!=null && h>pH) return {label:'양수 확대',tone:'bullish',text:'MACD 히스토그램이 양수이면서 확대 중이어서 상승 모멘텀 가속입니다. 추세 지속 구간의 전형적 패턴이며, 보유 유지에 가장 유리합니다. 확대 폭이 줄어들기 시작하면 모멘텀 둔화 초기 신호이므로 익절 준비를 시작하세요.'};
  if(h>0 && pH!=null && h<=pH) return {label:'양수 축소',tone:'warning',text:'히스토그램이 양수이지만 줄어들고 있어 상승 속도가 둔화 중입니다. 아직 추세가 꺾인 것은 아니지만, 단기 익절과 추격 자제 쪽에 무게를 두세요. 히스토그램이 0 아래로 전환되면 본격적인 매도 압력이 시작될 수 있습니다.'};
  if(h<0 && pH!=null && h<pH) return {label:'음수 확대',tone:'bearish',text:'MACD 히스토그램 음수가 확대 중이어서 하락 모멘텀이 강화되고 있습니다. 신규 매수는 매우 위험하며, 음수 확대가 멈추고 축소 전환을 확인한 후에야 반등 가능성을 검토할 수 있습니다.'};
  if(h<0 && pH!=null && h>=pH) return {label:'음수 축소',tone:'neutral',text:'히스토그램 음수가 줄어들고 있어 하락 모멘텀이 약해지는 중입니다. 바닥 다지기 초기일 수 있으며, RSI 반등과 거래량 증가가 동반되면 반전 가능성이 높아집니다. 양수 전환을 확인하는 것이 안전합니다.'};
  return {label:'중립',tone:'neutral',text:'MACD가 제로선 부근에서 방향성이 약합니다. 다른 지표(RSI, ADX, MA)와 종합 판단이 필요하며, 제로선 부근 횡보는 곧 방향이 결정될 수 있다는 신호이기도 합니다.'};
};

SXI.stoch = function(k, d){
  if(k==null) return null;
  const kv=+k, dv=+(d||k);
  if(!Number.isFinite(kv)) return null; // [PATCH-1] NaN/Infinity 방어
  if(kv<=20 && kv>dv) return {label:'과매도 반전',tone:'bullish',text:`%K(${kv.toFixed(1)})가 과매도 구간에서 %D(${dv.toFixed(1)})를 상향 돌파했습니다. 강력한 단기 반등 신호이며, RSI 과매도·BB 하단 반등과 동시 발생 시 3중 확인이 됩니다. 다만 강한 하락 추세에서는 빈 골든크로스도 있으므로 2~3봉 확인 후 진입이 안전합니다.`};
  if(kv<=20) return {label:'과매도',tone:'bullish',text:`스토캐스틱 %K가 ${kv.toFixed(1)}로 과매도 구간입니다. 반등 가능성이 높지만, %K가 %D를 상향 돌파하는 실제 반전 신호를 기다리는 것이 안전합니다. ADX가 높은 하락 추세에서는 과매도가 오래 지속됩니다.`};
  if(kv<=50) return {label:'하단 중립',tone:'neutral',text:`스토캐스틱 %K가 ${kv.toFixed(1)}로 중간 아래입니다. 뚜렷한 신호는 없으며, MA 정배열이면 눌림목 성격, 역배열이면 약세 지속으로 해석할 수 있습니다.`};
  if(kv<=80) return {label:'상단 중립',tone:'neutral',text:`스토캐스틱 %K가 ${kv.toFixed(1)}로 중간 위에서 약한 매수 우위입니다. 강한 추세에서는 이 구간이 오래 유지되며, ADX 25 이상 + MA 정배열이면 추세 추종 유지가 유리합니다.`};
  if(kv>80 && kv<dv) return {label:'과매수 반전',tone:'bearish',text:`%K(${kv.toFixed(1)})가 과매수 구간에서 %D(${dv.toFixed(1)})를 하향 돌파했습니다. 단기 조정 시작 신호이며, RSI 과매수·MACD 둔화와 함께 나타나면 매도 전환 교과서에서는 그 확률을 높게 봅니다. 분할 익절 검토하세요.`};
  return {label:'과매수',tone:'warning',text:`스토캐스틱 %K가 ${kv.toFixed(1)}로 과매수 구간입니다. 강한 추세에서는 장기 지속 가능하므로, %K가 %D를 하향 돌파하는 실제 반전 신호 확인 후 대응이 효과적입니다.`};
};

SXI.adx = function(adx, pdi, mdi){
  if(adx==null) return null;
  const v=+adx;
  if(!Number.isFinite(v)) return null; // [PATCH-1] NaN/Infinity 방어
  let dir='', dirAction='', dirDetail='';
  if(pdi!=null && mdi!=null){dir=+pdi>+mdi?'상승':'하락'; dirAction=+pdi>+mdi?'매수 보유 쪽이 유리합니다':'매수보다 관망이 낫습니다'; dirDetail=` +DI(${(+pdi).toFixed(1)}) vs -DI(${(+mdi).toFixed(1)}): ${+pdi>+mdi?'매수세 우위':'매도세 우위'}.`;}
  if(v<20) return {label:'추세 없음',tone:'neutral',text:`ADX가 ${v.toFixed(1)}로 뚜렷한 추세가 없습니다.${dirDetail} 횡보 구간일 가능성이 높고, 박스권 매매가 더 적합합니다. ADX가 20을 넘어서면 새 추세 형성이므로 돌파 방향을 주시하세요.`};
  if(v<30){const t=dir?`약한 ${dir} 추세가 형성되기 시작했습니다.`:'추세 형성 초기 단계입니다.'; return {label:'약한 추세',tone:'neutral',text:`${t} ADX ${v.toFixed(1)}.${dirDetail} ADX가 25~30을 넘어가면 추세가 본격화되므로, 현재는 포지션 준비 단계입니다.`};}
  if(v<50) return {label:'강한 추세',tone:dir==='상승'?'bullish':'bearish',text:`ADX ${v.toFixed(1)}로 강한 ${dir} 추세 진행 중.${dirDetail} 추세를 따라가는 전략이 유리하며, 역방향 매매는 매우 위험합니다. ${dir==='상승'?'눌림목 분할 매수가 효과적이며 MA20 지지를 확인하세요':'반등 시 비중 축소를 검토하세요'}.`};
  return {label:'극강 추세',tone:dir==='상승'?'bullish':'danger',text:`ADX ${v.toFixed(1)}로 매우 강한 ${dir} 추세.${dirDetail} 추세의 힘이 극강이지만 동시에 과열 경고입니다. ${dir==='상승'?'익절 시점을 적극 검토하고 신규 진입은 추격이므로 자제하세요':'손절을 반드시 지키세요. ADX 하락 전환 확인 후에야 반등 논의가 가능합니다'}.`};
};

SXI.cci = function(val){
  if(val==null) return null;
  const v=+val;
  if(!Number.isFinite(v)) return null; // [PATCH-1] NaN/Infinity 방어
  if(v<=-200) return {label:'극단적 과매도',tone:'bullish',text:`CCI가 ${v.toFixed(0)}으로 매도 압력이 극심합니다. CCI -200 이하는 매우 드문 수치이며, 기술적 반등 여지가 큽니다. 다만 패닉 구간에서는 추가 하락도 가능하므로, 반전 양봉이나 MACD 골든크로스 같은 보조 확인을 기다리세요.`};
  if(v<=-100) return {label:'과매도',tone:'bullish',text:`CCI가 ${v.toFixed(0)}으로 과매도 구간입니다. 반등 시작 시 초기 매수 구간이 될 수 있으며, RSI·스토캐스틱도 함께 과매도인지 확인하면 교과서에서는 신뢰도가 높아진다고 봅니다. CCI가 -100을 상향 돌파하는 시점이 기술적 기준점입니다.`};
  if(v<=100) return {label:'중립',tone:'neutral',text:`CCI가 ${v.toFixed(0)}으로 정상 범위입니다. 과열이나 침체 신호는 없으며, 다른 모멘텀·추세 지표와 종합 판단이 필요합니다.`};
  if(v<=200) return {label:'과매수',tone:'warning',text:`CCI가 ${v.toFixed(0)}으로 과매수 구간입니다. 이동평균선 대비 가격이 많이 올라간 상태이며, CCI가 +100을 하향 돌파하면 본격적인 조정 신호입니다.`};
  return {label:'극단적 과매수',tone:'danger',text:`CCI가 ${v.toFixed(0)}으로 극단적 과열입니다. 급락 위험이 높으며, 보유 중이면 분할 매도를 검토하세요.`};
};

SXI.mfi = function(val){
  if(val==null) return null;
  const v=+val;
  if(!Number.isFinite(v)) return null; // [PATCH-1] NaN/Infinity 방어
  if(v<=20) return {label:'과매도 (자금유출)',tone:'bullish',text:`MFI가 ${v.toFixed(1)}로 자금 대량 유출 상태입니다. RSI에 거래량 가중치를 더한 MFI가 이 수준이면 실질적 매도 압력이 극에 달했음을 의미합니다. 기술적 반등 시 거래량 동반 상승과 함께 빠른 회복이 나올 수 있습니다.`};
  if(v<=40) return {label:'약세',tone:'neutral',text:`MFI가 ${v.toFixed(1)}로 자금 유출 진행 중이며 매수세가 약합니다. 가격 지지력이 약한 상태이며, 20 이하 진입 시 과매도 반등 구간이 될 수 있습니다.`};
  if(v<=60) return {label:'중립',tone:'neutral',text:`MFI가 ${v.toFixed(1)}로 자금 흐름이 균형입니다. 뚜렷한 방향성이 없어 다른 지표와 종합 판단하세요.`};
  if(v<=80) return {label:'강세',tone:'bullish',text:`MFI가 ${v.toFixed(1)}로 자금 유입 중이며 매수세 우위입니다. 거래량을 동반한 매수 흐름이 상승 추세를 뒷받침하고 있습니다. OBV 상승과 함께라면 건강한 상승입니다.`};
  return {label:'과매수 (자금과잉)',tone:'warning',text:`MFI가 ${v.toFixed(1)}로 자금이 과도하게 유입된 상태입니다. 거래량 기준으로도 과열이며, 대규모 차익실현 매물이 나올 수 있습니다. 익절 타이밍을 검토하세요.`};
};

//  [S1292] 유사-경험 주장 제거 — '통계적으로'·'역사적으로' 13건.
//    이 어구들은 **측정 결과를 인용하는 문장 형식**이다. 그런데 인용할 측정이 없다.
//    배지([미측정]/[측정 미달])가 "안 쟀다"고 말하는데 본문이 "역사적으로 확률이 높다"고 하면
//    화면이 정면으로 충돌한다 — 배지로 덮을 수 없는 종류의 문제였다.
//    ★서술을 지우지 않았다(S1283 원칙). **출처만 바꿨다**:
//      A) 교과서 귀속 9건: '통계적으로/역사적으로 ~하다' → '교과서에서는 ~로 본다'
//      B) 우리 엔진에 대한 주장 4건: 교과서로 돌릴 수 없다(summary·practicalGuide의
//         "통계적으로 유리/손실 확률이 높다"). 근거 주장을 빼고 **규율 진술**로 바꿨다.
//    ⚠남은 것: '확률이 높'(15)·'신뢰도가 매우 높'(18) 33건은 정도 부사라 개별 판단이 필요 — 별건.
//      '가능성이 높'(47)·'대부분'(16)은 헤지 표현이라 그대로 둔다(단정을 피하는 쪽이다).
SXI.bb = function(pctB, width, isSqueeze){
  if(pctB==null) return null;
  const b=+pctB; let res;
  if(!Number.isFinite(b)) return null; // [PATCH-1] NaN/Infinity 방어
  if(b<=0) res={label:'하단 이탈',tone:'bullish',text:`BB 하단 이탈(%B ${(b*100).toFixed(1)}%). 극단적 과매도 상태입니다. 교과서에서는 밴드 밖 체류가 짧다고 보아 반등 가능성을 높게 봅니다. 다만 강한 하락 추세에서는 밴드 워킹(연속 이탈)이 가능하므로, 반전 양봉+거래량 증가 확인 후 접근이 안전합니다. RSI 과매도 동시 발생 시 반등 교과서에서는 그 확률이 크게 높아진다고 봅니다.`};
  else if(b<=0.2) res={label:'하단 근접',tone:'bullish',text:`BB 하단 근접(%B ${(b*100).toFixed(1)}%). 매수 관심 구간이며, 양봉 전환·거래량 증가 동반 시 반등 교과서에서는 그 확률이 높아진다고 봅니다. 하단 이탈로 확대되면 추가 하락이므로, 지지 확인 후 분할 접근이 적절합니다.`};
  else if(b<=0.5) res={label:'하단~중심',tone:'neutral',text:`BB 중심선 아래(%B ${(b*100).toFixed(1)}%). 약한 매도 우위이며, MA20(중심선) 회복 여부가 단기 방향의 열쇠입니다.`};
  else if(b<=0.8) res={label:'중심~상단',tone:'neutral',text:`BB 중심선 위(%B ${(b*100).toFixed(1)}%). 약한 매수 우위이며 상승 추세 유지 중. 중심선이 지지선 역할을 합니다.`};
  else if(b<=1.0) res={label:'상단 근접',tone:'warning',text:`BB 상단 근접(%B ${(b*100).toFixed(1)}%). 단기 과열 가능성이 있으며, 강한 추세에서는 밴드 워킹이 나올 수 있지만 모멘텀 둔화 시 되돌림도 클 수 있습니다.`};
  else res={label:'상단 돌파',tone:'danger',text:`BB 상단 돌파(%B ${(b*100).toFixed(1)}%). 과열 상태입니다. 교과서에서는 밴드 밖에 오래 머물기 어렵다고 봅니다. 신규 진입은 추격이므로 위험하며, 눌림 확인 후 재진입이 안전합니다.`};
  if(isSqueeze) res.text+=' 현재 BB폭 수축(스퀴즈) 상태 — 에너지 축적 중이며 돌파 시 폭발적 움직임 예상. 돌파 방향이 핵심입니다.';
  return res;
};

SXI.bbWidth = function(width, isSqueeze){
  if(width==null) return null;
  if(!Number.isFinite(+width)) return null; // [PATCH-1] NaN/Infinity 방어
  if(isSqueeze) return {label:'스퀴즈 (수축)',tone:'neutral',text:`BB폭이 ${(+width).toFixed(1)}%로 극도로 좁아진 스퀴즈 상태입니다. 시장이 에너지를 축적 중이며, 방향이 정해지면 폭발적 움직임이 예상됩니다. 교과서에서는 스퀴즈 후 돌파를 큰 추세의 시작으로 봅니다. 돌파 방향 확인 후 따라가는 전략이 안전합니다.`};
  if(+width>5) return {label:'확장 (고변동)',tone:'warning',text:`BB폭이 ${(+width).toFixed(1)}%로 크게 벌어져 변동성이 높은 구간입니다. 방향이 맞아도 진폭이 넓어 심리적 부담이 크며, 손절 간격도 넓혀야 합니다. 비중 축소 또는 분할 전략으로 접근하세요.`};
  return {label:'보통',tone:'neutral',text:`BB폭이 ${(+width).toFixed(1)}%로 정상 범위입니다. 일반적인 매매 환경입니다.`};
};

SXI.obv = function(trend, divergence){
  if(!trend) return null;
  if(divergence==='bullish'||divergence===true) return {label:'OBV 상승 다이버전스',tone:'bullish',text:'가격은 하락했지만 누적 거래량(OBV)은 개선 중입니다. 저가 매집 세력이 있음을 시사하며, 바닥 형성의 대표적 선행 지표입니다. RSI 과매도 동시 발생 시 반등 교과서에서는 그 확률이 크게 높아진다고 봅니다.'};
  if(divergence==='bearish') return {label:'OBV 하락 다이버전스',tone:'warning',text:'가격은 상승했지만 OBV는 빠지고 있어, 상승을 뒷받침할 실질 매수 수급이 약해지고 있습니다. 고점권에서 이 신호가 나오면 분할 익절을 검토하세요.'};
  if(trend==='up') return {label:'OBV 상승',tone:'bullish',text:'누적 거래량(OBV)이 상승 추세로 매수세가 지속 유입 중입니다. 가격+OBV 동반 상승은 건강한 상승이며, 가격 횡보+OBV 상승이면 매집 구간일 수 있습니다. 수급 뒷받침 상승은 지속력이 강합니다.'};
  if(trend==='down') return {label:'OBV 하락',tone:'bearish',text:'누적 거래량(OBV)이 감소 추세로 매도세 우위입니다. 가격 횡보 중에도 OBV 하락이면 물량이 빠져나가는 것이며, 지지선 이탈 시 급락 연결 가능. 보유 중이면 손절 라인을 점검하세요.'};
  return {label:'OBV 보합',tone:'neutral',text:'OBV가 횡보 중으로 뚜렷한 수급 방향이 없습니다. 방향이 정해지기를 기다리는 구간입니다.'};
};

SXI.ma = function(arrangement){
  if(!arrangement) return null;
  if(arrangement==='bullish') return {label:'정배열',tone:'bullish',text:'단기 이평선이 장기 위에 정렬된 상승 추세입니다. 눌림목 매수 전략에 적합하며, MA20 부근 지지 시 재진입 구간이 됩니다. MA20 이탈 시 눌림 해석이 약화됩니다.'};
  if(arrangement==='bearish') return {label:'역배열',tone:'bearish',text:'단기 이평선이 장기 아래에 정렬된 하락 추세입니다. 반등이 나와도 이평선이 저항으로 작용하므로, 추세 전환 확인 전 매수는 위험합니다.'};
  return {label:'혼조',tone:'mixed',text:'이평선이 뒤엉켜 있어 추세 전환기일 수 있습니다. 방향이 정리될 때까지 관망이 유리합니다.'};  // [S965] neutral→mixed(보라)
};

SXI.atr = function(ratio){
  if(ratio==null) return null;
  const v=+ratio;
  if(!Number.isFinite(v)) return null; // [PATCH-1] NaN/Infinity 방어
  if(v<1.5) return {label:'저변동',tone:'neutral',text:`변동성 ${v.toFixed(1)}%로 매우 낮아 시장이 숨을 고르고 있습니다. 저변동이 오래 지속되면 에너지 축적 후 돌파 시 빠르고 큰 움직임이 나옵니다. BB 스퀴즈와 함께라면 돌파 준비 구간입니다.`};
  if(v<3) return {label:'보통',tone:'neutral',text:`변동성 ${v.toFixed(1)}%로 정상 범위이며 일반적인 매매 환경입니다.`};
  if(v<5) return {label:'고변동',tone:'warning',text:`변동성 ${v.toFixed(1)}%로 높은 구간입니다. 하루 움직임이 크기 때문에 손절 폭을 넓혀야 하며, 비중 축소 또는 추격 자제가 안전합니다.`};
  return {label:'극변동',tone:'danger',text:`변동성 ${v.toFixed(1)}%로 극단적입니다. 큰 수익과 큰 손실이 동시에 열려 있으며, 소액만 진입하거나 관망이 현명합니다. 반드시 사전에 손절 라인을 정해두세요.`};
};

SXI.sar = function(trend){
  if(!trend) return null;
  if(trend==='up') return {label:'상승추세',tone:'bullish',text:'Parabolic SAR이 가격 아래에 위치해 상승 추세를 뒷받침합니다. 추세 추종 관점에서 보유 유지 구간이며, SAR 가격 이탈 시 추세 전환 신호로 빠른 대응이 필요합니다. MA 정배열과 동시 확인 시 추세 건강성이 높습니다.'};
  return {label:'하락추세',tone:'bearish',text:'Parabolic SAR이 가격 위에 있어 하락 추세입니다. 추세 전환 확인 전까지 매수 보류가 안전하며, SAR이 가격 아래로 반전하면 추세 전환 시도의 첫 번째 신호입니다.'};
};

//  [S1296] strongest 단일 반영 철폐 — 카드가 반대 방향 패턴을 **구조적으로** 숨기고 있었다.
//  ★실측(OOS 스냅 3시장 · 봉 271,370 · 패턴 발동 219,911):
//      방향 충돌(상승·하락 동시 발동) = KR 3,147(발동의 3.6%) · US 5,050(5.3%) · COIN 1,090(2.9%)
//      그 **전건**에서 카드는 strongest 한쪽만 말하고 반대편을 버렸다(숨김 = 충돌 건수와 동일).
//  ★구조적 종속(예외 0건): 스톨드패턴·어드밴스블럭은 발동 조건이 **적삼병의 부분집합**인데
//      (엔진 L822·L827이 적삼병 조건 `ppBody>0&&pBody>0&&body>0&&p.close>pp.close&&r.close>p.close`를 그대로 재사용)
//      score 5·6 < 9라 **strongest가 될 수 없다** → 3시장 5,392회 발동 · 카드 노출 **0회**.
//      실측 검산: 스톨드패턴 3,364회 중 적삼병 없이 발동 **0건** / 어드밴스블럭 2,028회 중 **0건**.
//      ⚠게다가 적삼병 설명문은 "셋째 봉 윗꼬리가 길면 피로 누적 주의"라고 적혀 있었다 —
//        엔진이 **이미 탐지해서 버린 바로 그것**을 사용자에게 육안으로 확인하라고 시키고 있었다.
//  ★조치: ①이름 중복 제거(S1285 렌더와 동일 규칙) ②상승·하락 공존 시 **방향을 말하지 않는다**
//      (tone 'mixed' — S965 보라 팔레트 · 양쪽 최강 패턴 병기) ③충돌 없어도 동시 발동 패턴 병기(정보 손실 0)
//  ⚠우열 판정 금지: 엔진 score(Σ score×dir)는 **손으로 매긴 가중치**이고 사전등록 측정된 적이 없다.
//      합산으로 승자를 뽑으면 근거 없는 방향 주장을 **새로** 만드는 것이다. 카드는 우열을 말하지 않는다.
//  ⚠엔진 무변경(호환 유지). 판정·워커는 candle.strongest를 계속 쓴다 → 판정 영향 0.
//  ⚠[S1296] 설명문 16종 추가: 기존 CT는 22종뿐이라 하이웨이브(24.7k)·하라미크로스(11k) 등
//      **77k회 발동이 "…패턴이 감지되었습니다" 폴백**으로 나갔다. 추가분은 **교과서 예언이 아니라
//      탐지 규칙 재진술**이다 — 조건을 사실로 적고 방향은 "엔진은 …로 분류한다"로 출처를 밝힌다(S1283 원칙).
SXI.candle = function(patterns){
  if(!patterns||!patterns.length) return null;
  const _seen={}, U=[];
  patterns.forEach(pt=>{ if(!pt||!pt.name||_seen[pt.name]) return; _seen[pt.name]=1; U.push(pt); });
  if(!U.length) return null;
  const _abs = pt=>Math.abs(pt.score||0);
  const byS = U.slice().sort((a,b)=>_abs(b)-_abs(a));
  const strongest = byS[0];
  const bulls = byS.filter(pt=>pt.dir>0), bears = byS.filter(pt=>pt.dir<0);
  const dir = strongest.dir>0?'bullish':strongest.dir<0?'bearish':'neutral';
  const CT = {'장대양봉':'강한 매수세로 종가가 고가 근처에서 마감. 상승 추세에서는 지속 확인, 하락 후 지지선에서 나타나면 반전 시작. 다음 봉에서 50% 이상 되돌리지 않으면 상승 지속 교과서에서는 그 확률을 높게 봅니다.','장대음봉':'강한 매도세로 종가가 저가 근처에서 마감. 고점에서 나타나면 반전 경고이며, 다음 봉에서 고가를 회복하지 못하면 손절을 실행하세요.','해머':'하락 중 긴 아래꼬리는 저가 매수세 유입을 보여줍니다. 지지선이나 BB 하단에서 나타나면 신뢰도↑(교과서). 다음 봉 양봉 확인 시 진입 고려하되, 해머 저점이 손절 라인.','슈팅스타':'상승 중 긴 윗꼬리는 고가 매도세를 보여줍니다. 저항선이나 BB 상단에서 나타나면 조정 확률↑(교과서). 기존 보유자는 분할 익절 검토.','도지':'매수/매도 팽팽. 상승 후 도지는 하락 전환, 하락 후 도지는 상승 전환의 전조일 수 있으며, 다음 봉 방향이 핵심.','스피닝탑':'매수/매도 비슷한 힘. 위아래 꼬리가 길어 방향이 정해지지 않았습니다.','모닝스타':'3봉 강세 반전 패턴(음봉→짧은 몸통→양봉). 하락 바닥에서 나타나면 강력한 매수 진입 신호. 둘째 봉 저점이 손절 라인.','이브닝스타':'3봉 약세 반전 패턴(양봉→짧은 몸통→음봉). 상승 고점에서 나타나면 강력한 매도 신호. 보유 중이면 분할 매도를 즉시 실행.','상승장악':'전일 음봉을 완전히 감싸는 양봉. 강한 매수 반전이며, 거래량 동반 시 세력 매수 가능. 이 양봉의 저점이 강한 지지선.','하락장악':'전일 양봉을 완전히 감싸는 음봉. 강한 매도 반전이며, 거래량 급증 동반 시 대규모 매도 이탈. 즉시 비중 축소 검토.','하라미상승':'큰 음봉 안 작은 양봉. 하락 모멘텀 약화 초기 신호. 다음 봉 양봉 확인 후 진입 고려.','하라미하락':'큰 양봉 안 작은 음봉. 상승 모멘텀 약화 초기 조정 신호. 추가 매수 보류.','피어싱라인':'전일 음봉 50%+ 회복 양봉. 반등 초기 신호. 전일 음봉 저점을 손절 라인으로 설정.','다크클라우드':'전일 양봉 50%+ 하락 음봉. 반락 초기 신호. 분할 익절 검토.','적삼병':'3연 양봉. 강한 상승 지속 패턴. 셋째 봉 윗꼬리가 길면 피로 누적 주의.','흑삼병':'3연 음봉. 강한 하락 지속. 보유 중이면 손절 실행.','갭상승':'전일 고가보다 높게 시작. 갭을 메우지 않으면 상승 확인. 갭을 메우고 다시 올라가면 강한 지지 확인.','갭하락':'전일 저가보다 낮게 시작. 갭을 메우지 않으면 하락 확인. 갭 하단이 손절 기준.','집게바닥':'두 봉 저가 동일 수준. 지지선 형성이며, 깨지면 하락 가속.','집게천정':'두 봉 고가 동일 수준. 저항선 형성이며, 돌파 실패 시 조정.','인사이드데이':'금일 고저가가 전일 범위 안. 변동성 수축. 전일 고가 돌파 시 매수, 저가 이탈 시 매도.','아웃사이드데이':'금일 고저가가 전일 범위 초과. 변동성 확대. 양봉=강세, 음봉=약세.','하이웨이브':'몸통이 전체 범위의 20% 미만이고 위·아래 꼬리가 각각 범위의 30%를 넘습니다. 위아래로 크게 흔들렸으나 시가 근처에서 마감했다는 사실 기술이며, 엔진은 방향을 붙이지 않습니다(중립 4).','하라미크로스':'금일 몸통이 범위의 10% 미만(도지급)이고 고저가 전봉 몸통 범위 안에 완전히 들어갑니다. 엔진은 전봉이 음봉이면 상승, 양봉이면 하락으로 — 즉 전봉 방향의 반대로 분류합니다(강도 7).','하락카운터어택':'전봉 양봉 뒤 금일 음봉인데 종가가 전봉 종가와 0.3% 이내로 같습니다. 엔진은 하락(7)으로 분류합니다.','상승카운터어택':'전봉 음봉 뒤 금일 양봉인데 종가가 전봉 종가와 0.3% 이내로 같습니다. 엔진은 상승(7)으로 분류합니다.','모닝도지스타':'모닝스타의 좁은 판입니다 — 가운데 봉 몸통이 범위의 10% 미만(도지)이고, 첫 봉 음봉 → 도지 → 양봉이며 종가가 첫 봉 중심을 넘습니다. 엔진 분류 상승 13으로 전 패턴 중 세 번째로 높은 강도입니다. 모닝스타(12)와 항상 함께 발동합니다.','이브닝도지스타':'이브닝스타의 좁은 판입니다 — 가운데 봉이 도지이고, 첫 봉 양봉 → 도지 → 음봉이며 종가가 첫 봉 중심 아래입니다. 엔진 분류 하락 13. 이브닝스타(12)와 항상 함께 발동합니다.','스톨드패턴':'적삼병(3연 양봉)의 부분집합입니다 — 같은 조건에서 마지막 봉 몸통이 직전 봉의 40% 미만이고 윗꼬리가 몸통보다 깁니다. 엔진은 상승 피로로 보아 하락(5)으로 분류합니다. ★적삼병(상승 9)과 항상 동시 발동하며(실측 3,364회 전건), 강도가 낮아 단독으로는 이 카드에 오르지 못합니다.','어드밴스블럭':'적삼병(3연 양봉)의 부분집합입니다 — 같은 조건에서 몸통이 연속 2회 직전의 85% 미만으로 줄어듭니다. 엔진은 상승 동력 감쇠로 보아 하락(6)으로 분류합니다. ★적삼병(상승 9)과 항상 동시 발동합니다(실측 2,028회 전건).','음봉마루보즈':'몸통이 전체 범위의 95% 이상인 음봉으로 꼬리가 거의 없습니다. 장대음봉(70% 이상)의 부분집합이라 항상 함께 발동합니다. 엔진 분류 하락 7.','양봉마루보즈':'몸통이 전체 범위의 95% 이상인 양봉으로 꼬리가 거의 없습니다. 장대양봉(70% 이상)의 부분집합이라 항상 함께 발동합니다. 엔진 분류 상승 7.','업사이드갭태스키':'갭상승 양봉 뒤 음봉이 나왔으나 그 음봉이 갭을 메우지 못했습니다(종가가 갭 위). 엔진은 상승(6)으로 분류합니다.','다운사이드갭태스키':'갭하락 음봉 뒤 양봉이 나왔으나 그 양봉이 갭을 메우지 못했습니다(종가가 갭 아래). 엔진은 하락(6)으로 분류합니다.','그레이브스톤도지':'도지(몸통 10% 미만) 중 윗꼬리가 범위의 60%를 넘고 아랫꼬리는 10% 미만입니다. 위로 갔다가 전부 되돌린 하루라는 사실 기술이며, 엔진은 하락(6)으로 분류합니다. 도지(중립 3)와 항상 함께 발동합니다.','드래곤플라이도지':'도지 중 아랫꼬리가 범위의 60%를 넘고 윗꼬리는 10% 미만입니다. 아래로 갔다가 전부 회복한 하루이며, 엔진은 상승(6)으로 분류합니다. 도지(중립 3)와 항상 함께 발동합니다.','상승어밴던드베이비':'첫 봉 음봉 → 가운데 도지가 아래로 갭·위로 갭 양쪽으로 고립 → 양봉입니다. 엔진 분류 상승 15로 전 패턴 최고 강도이나, 3시장 271,370봉에서 24회만 발동한 극희소 패턴입니다.','하락어밴던드베이비':'첫 봉 양봉 → 가운데 도지가 양쪽으로 고립 → 음봉입니다. 엔진 분류 하락 15로 최고 강도이나, 3시장 271,370봉에서 9회만 발동한 극희소 패턴입니다.'};
  const _txt = pt => CT[pt.name] || `${pt.name} 패턴이 감지되었습니다.`;
  const _nm  = pt => `${pt.name}(${pt.dir>0?'상승':pt.dir<0?'하락':'중립'} ${_abs(pt)})`;
  //  ── 방향 충돌: 상승·하락이 같은 봉에서 공존하면 **방향을 말하지 않는다** ──
  if(bulls.length && bears.length){
    const b = bulls[0], s = bears[0];
    const rest = byS.filter(pt=>pt!==b && pt!==s).map(_nm);
    return {label:'방향 혼재', tone:'mixed',
      text:'상승 패턴과 하락 패턴이 같은 봉에서 동시에 발동했습니다. <b>어느 쪽이 우세한지는 이 화면이 판정하지 않습니다</b> — 패턴 강도를 합산하는 규칙은 사전등록 측정된 적이 없습니다.'
        + `<div style="margin-top:5px">▲ <b>${_nm(b)}</b> — ${_txt(b)}</div>`
        + `<div style="margin-top:4px">▼ <b>${_nm(s)}</b> — ${_txt(s)}</div>`
        + (rest.length ? `<div style="margin-top:4px;opacity:.75">· 같은 봉 동시 발동: ${rest.join(' · ')}</div>` : '')};
  }
  //  ── 충돌 없음: 최강 패턴을 서술하되 동시 발동 패턴을 병기한다(정보 손실 0) ──
  const rest = byS.slice(1).map(_nm);
  return {label:strongest.name, tone:dir, text:_txt(strongest)
    + (rest.length ? `<div style="margin-top:4px;opacity:.75">· 같은 봉 동시 발동: ${rest.join(' · ')}</div>` : '')};
};

// ════════════════════════════════════════════════════════════
//  고급 분석(Advanced Analysis) 전용 모듈 — S46 신규
//  "고급 분석" 섹션 해석카드: 시장환경/눌림목/다이버전스/스윙/
//  MA수렴도/추세/구조위치/심리가격대/맥락분석 등
//  기술적 지표 해석과 동등 이상의 상세도 목표
// ════════════════════════════════════════════════════════════

SXI.advMarketEnv = function(state, stateLabel, indices){
  if(!state || state==='unknown') return null;
  const bull = state.includes('bull'), bear = state.includes('bear');
  const idxStr = indices&&indices.length ? indices.join(' · ') : '지수 데이터 없음';
  if(bull && state.includes('strong')){
    return {tone:'bullish',label:'강한 강세장',text:`${idxStr}. 시장 전반이 강한 상승 흐름입니다. 매수 신호의 교과서에서는 신뢰도가 크게 높아진다고 보며, 대부분의 종목이 시장 베타를 따라 상승하는 구간입니다. 눌림목 매수·추세 추종 전략이 가장 효과적이며, 약세 종목도 시장 분위기에 끌려 반등이 나올 수 있습니다. 다만 과열 구간에 접어들면 일시 조정이 빠르게 오므로, 개별 종목의 과매수 지표(RSI 80+, BB 상단 이탈)를 함께 점검하세요.`};
  }
  if(bull){
    return {tone:'bullish',label:'강세',text:`${idxStr}. 시장 환경이 우호적이어서 매수 신호의 교과서에서는 신뢰도가 높아진다고 봅니다. 정배열 종목의 눌림목 매수, 거래량 동반 돌파 전략이 유리하며, 약간의 기술적 조정은 매수 기회로 활용할 수 있습니다. 시장 전체가 양호하더라도 업종별 차별화는 존재하므로, 개별 종목의 모멘텀과 수급을 반드시 확인하세요.`};
  }
  if(bear && state.includes('strong')){
    return {tone:'danger',label:'강한 약세장',text:`${idxStr}. 시장 전반이 강한 하락 압력을 받고 있습니다. 대부분의 매수 신호가 무력화되기 쉬우며, 기술적 반등도 짧고 약하게 끝나는 경우가 많습니다. 현금 비중을 높이고, 기존 보유 종목은 손절 기준을 타이트하게 관리하세요. 신규 매수는 시장 반등 신호(지수 양봉 + 거래량 급증 + VIX 하락)가 확인된 후에만 소액으로 접근하는 것이 안전합니다.`};
  }
  if(bear){
    return {tone:'bearish',label:'약세',text:`${idxStr}. 시장 환경이 비우호적이어서 매수 신호에 대한 보수적 접근이 필요합니다. 강한 개별 모멘텀이 있는 종목만 선별적으로 접근하되, 진입 비중을 평소의 50~70%로 줄이고 손절 기준을 엄격히 적용하세요. 시장 약세기에는 방어주·고배당주·역발상 매수보다 현금 확보가 최우선이며, 추세 반전 신호가 나올 때까지 관망하는 것도 좋은 전략입니다.`};
  }
  return {tone:'neutral',label:'중립',text:`${idxStr}. 시장 전반의 환경이 중립적이어서 개별 종목의 기술적 신호에 집중해야 합니다. 지수 방향이 명확하지 않을 때는 업종·테마 순환에 따라 종목별 차별화가 심해지므로, 시장 전체 흐름보다 개별 종목의 수급·모멘텀·차트 구조를 더 비중 있게 판단하세요. 양방향 시나리오를 모두 준비하고, 핵심 지지/저항 이탈 시에만 대응하는 전략이 효율적입니다.`};
};

SXI.advPullback = function(score, maArrange, rsi, volRatio, bbPctB){
  if(score==null) return null;
  const s=+score;
  const maOk = maArrange==='bullish';
  const rsiV = rsi!=null ? +rsi : null;
  const volR = volRatio!=null ? +volRatio : null;
  const bbB = bbPctB!=null ? +bbPctB : null;
  const extras = [];
  if(maOk) extras.push('MA 정배열 지지');
  if(rsiV!=null && rsiV<=40) extras.push(`RSI ${rsiV.toFixed(0)} 과매도 근접`);
  if(volR!=null && volR<0.8) extras.push('거래량 수축(에너지 축적)');
  if(bbB!=null && bbB<=0.3) extras.push('BB 하단 근접');
  const extraStr = extras.length ? ' 보조 확인: '+extras.join(', ')+'.' : '';

  if(s>=80) return {label:'최적 눌림목',tone:'bullish',text:`눌림목 점수 ${s}점. 상승 추세 안에서 조정이 충분히 진행된 이상적 매수 구간입니다.${extraStr} MA20 지지 + RSI 40~50 회복 + 양봉 전환이 동시에 나타나면 교과서에서는 신뢰도가 극대화된다고 봅니다. 진입 시 직전 스윙 저점을 손절 라인으로 설정하고, 1차 목표는 직전 고점 부근입니다. MA20을 종가 기준 이탈하면 눌림목 해석이 무효화되므로 즉시 대응하세요.`};
  if(s>=60) return {label:'눌림목 양호',tone:'bullish',text:`눌림목 점수 ${s}점. 상승 추세 내 조정이 진행 중이며 매수 관심 구간에 진입하고 있습니다.${extraStr} 아직 최적 타이밍은 아닐 수 있으므로, MA20 또는 MA60 지지 확인 + 거래량 반등 신호를 기다린 뒤 분할 진입이 안전합니다. 추세가 살아 있는 한 조정은 기회이지만, 지지선 이탈 시에는 빠르게 시나리오를 전환해야 합니다.`};
  if(s>=40) return {label:'눌림목 보통',tone:'neutral',text:`눌림목 점수 ${s}점. 조건이 일부만 갖춰진 상태입니다.${extraStr} 추세가 아직 강하지 않거나, 조정 폭이 충분하지 않아 매수 진입에는 리스크가 있습니다. RSI가 40 이하로 더 눌리거나, 명확한 지지선(MA20/MA60/피벗 S1)에서 반등이 나올 때까지 기다리는 것이 유리합니다. 성급한 진입은 추가 하락에 노출될 수 있습니다.`};
  if(s>=20) return {label:'눌림목 약함',tone:'neutral',text:`눌림목 점수 ${s}점. 눌림목 매수 조건에 거의 부합하지 않습니다.${extraStr} 추세 자체가 불분명하거나 조정이 시작되지 않은 상태일 수 있습니다. 현 시점에서 눌림목 전략을 적용하기보다는, 추세 방향이 명확해지고 조정이 진행된 후 재검토하는 것이 바람직합니다.`};
  return {label:'해당없음',tone:'neutral',text:`눌림목 점수 ${s}점. 현재 눌림목 매수 조건에 해당하지 않습니다.${extraStr} 역배열이거나 하락 추세 구간에서는 눌림목 전략 자체가 위험합니다. 추세 전환 신호(MA 정배열 회복, MACD 골든크로스, 스윙 구조 HH+HL 형성)를 확인한 후에야 눌림목 접근이 가능합니다.`};
};

SXI.advRsiDiv = function(div, rsiVal, trendPct){
  if(!div || div==='없음' || div==='none') return null;
  const rsiStr = rsiVal!=null ? ` (현재 RSI ${(+rsiVal).toFixed(1)})` : '';
  const trendStr = trendPct!=null ? ` 추세 강도 ${(+trendPct).toFixed(1)}%.` : '';
  if(div==='bullish') return {tone:'bullish',label:'상승 다이버전스',text:`가격은 저점을 갱신했으나 RSI는 저점이 높아지고 있습니다${rsiStr}. 하락 에너지가 약화되며 반등 가능성이 높아지는 전형적인 바닥 선행 신호입니다.${trendStr} 다이버전스 단독으로는 즉시 반전을 의미하지 않으며, 실제 반전 확인 신호(양봉 전환, MACD 골든크로스, 거래량 증가)가 동반될 때 교과서에서는 신뢰도가 크게 상승한다고 봅니다. OBV 다이버전스 또는 Stoch 다이버전스가 동시에 발생하면 "다중 다이버전스"로 반전 교과서에서는 그 확률이 매우 높아진다고 봅니다. 진입 시 다이버전스 시작점(최저가)을 손절 라인으로 설정하세요.`};
  return {tone:'bearish',label:'하락 다이버전스',text:`가격은 고점을 갱신했으나 RSI는 고점이 낮아지고 있습니다${rsiStr}. 상승 탄력이 약화되며 조정 또는 하락 반전 가능성이 있습니다.${trendStr} 하락 다이버전스는 즉시 급락을 의미하기보다 "상승 속도 둔화"의 경고로 해석하세요. 거래량 감소, MACD 히스토그램 축소, BB 상단 이탈 후 복귀 등이 동반되면 조정 교과서에서는 그 확률이 높아진다고 봅니다. 보유 중이면 익절 또는 후행 손절을 타이트하게 조정하고, 신규 매수는 조정 완료 후 재진입 시점을 기다리는 것이 안전합니다.`};
};

SXI.advObvDiv = function(div, obvTrend, volRatio){
  if(!div || div==='없음' || div==='none') return null;
  const volStr = volRatio!=null ? ` 거래량 비율 ${(+volRatio).toFixed(1)}x.` : '';
  if(div==='bullish') return {tone:'bullish',label:'매집 신호',text:`가격 하락에도 OBV(누적 거래량)는 상승 중입니다.${volStr} 이는 가격이 내려가는 와중에 거래량 기반의 세력이 저가 매집을 진행하고 있음을 시사합니다. OBV 상승 다이버전스는 바닥 형성의 대표적인 선행 지표로, RSI 과매도 동시 발생 시 반등 교과서에서는 그 확률이 매우 높아진다고 봅니다. 다만 매집 과정은 시간이 걸릴 수 있으므로, 가격 반등이 실제로 시작되는 것을 확인한 후 진입해도 늦지 않습니다. 세력 매집이 완료되면 거래량 폭발과 함께 급등이 나올 수 있으니, 거래량 증가 + 양봉 돌파 시점을 주시하세요.`};
  return {tone:'bearish',label:'분산 신호',text:`가격 상승에도 OBV는 하락 중입니다.${volStr} 겉보기에는 상승하지만 실질적인 매수 수급이 빠지고 있는 위험한 패턴입니다. 기관이나 세력이 고점에서 물량을 분산 매도하고 있을 가능성이 높으며, 차익실현 매물이 쏟아지면 급락으로 이어질 수 있습니다. 보유 중이면 분할 익절을 적극 검토하고, 신규 매수는 OBV 추세가 회복될 때까지 보류하세요. RSI 과매수 또는 BB 상단 이탈이 동반되면 조정 교과서에서는 그 확률을 매우 높게 봅니다.`};
};

SXI.advStochDiv = function(div, rsiDiv){
  if(!div) return null;
  const rsiSync = rsiDiv && ((div==='bullish'&&rsiDiv==='bullish')||(div==='bearish'&&rsiDiv==='bearish'));
  if(div==='bullish'){
    const syncStr = rsiSync ? ' RSI 다이버전스도 동시에 발생하여 "이중 다이버전스" 상태입니다 — 교과서에서는 이 조합의 반전 신뢰도를 높게 봅니다. OBV 상승 다이버전스까지 3중으로 겹치면 강력한 바닥 신호입니다.' : ' RSI 다이버전스가 동시에 발생하지 않은 상태이므로 단독 신호로는 교과서도 신뢰도를 보통으로 봅니다. RSI나 OBV에서도 다이버전스가 나타나는지 추가 확인이 필요합니다.';
    return {tone:'bullish',label:'Stoch 상승 다이버전스',text:`스토캐스틱이 가격보다 먼저 반등 신호를 보내고 있습니다. 가격은 저점을 낮추었지만 Stoch %K는 저점이 높아지며, 하락 모멘텀의 약화를 나타냅니다.${syncStr} 실제 반전 양봉과 거래량 증가가 동반되면 진입 시점으로 판단할 수 있습니다.`};
  }
  const syncStr = rsiSync ? ' RSI 하락 다이버전스도 동시에 발생하여 이중 확인 상태입니다. 상승 피로가 확실히 누적되고 있으며, 조정 가능성이 높습니다.' : '';
  return {tone:'bearish',label:'Stoch 하락 다이버전스',text:`스토캐스틱이 가격보다 먼저 고점 하향 신호를 보내고 있습니다. 가격은 고점을 높이지만 Stoch %K의 고점은 낮아지고 있어 상승 탄력이 약화되는 조짐입니다.${syncStr} 보유 중이면 후행 손절을 타이트하게 조정하고, 익절을 검토하세요.`};
};

SXI.advSwing = function(higherHighs, lowerLows, recentSwings){
  const swingCount = recentSwings ? ` 최근 스윙 ${recentSwings}회 감지.` : '';
  if(higherHighs && !lowerLows) return {tone:'bullish',label:'상승 구조 (HH+HL)',text:`고점과 저점이 모두 높아지는 전형적 상승 구조입니다.${swingCount} 추세 추종 전략에 가장 적합한 환경으로, 눌림이 올 때 직전 저점(HL) 부근에서 지지가 확인되면 분할 매수 진입 구간이 됩니다. 핵심 손절 기준은 직전 스윙 저점(HL) 이탈이며, 이 라인이 깨지면 상승 구조가 붕괴된 것으로 판단하고 즉시 대응해야 합니다. 상승 구조에서의 매수는 리스크/리워드 비율이 유리하지만, 고점 추격보다는 조정 후 재진입이 더 효율적입니다. ADX가 25 이상이면 추세 강도가 충분하고, 거래량이 고점 갱신 시 동반 증가하면 구조 건강성이 확인됩니다.`};
  if(higherHighs && lowerLows) return {tone:'warning',label:'확산형 (변동성 확대)',text:`고점은 높아지는데 저점도 낮아지는 확산형 구간입니다.${swingCount} 변동성이 급격히 커지고 있으며, 방향이 불분명한 상태입니다. 이 구간에서는 추세 추종이든 역추세든 손실 위험이 크므로, 비중을 크게 줄이거나 관망하는 것이 안전합니다. 확산형이 해소되는 방식(상방 수렴 또는 하방 수렴)을 확인한 뒤 방향을 잡는 것이 현명합니다. BB 폭이 동시에 확장 중이면 변동성 리스크가 더 커집니다.`};
  if(!higherHighs && lowerLows) return {tone:'bearish',label:'하락 구조 (LH+LL)',text:`저점과 고점이 모두 낮아지는 하락 구조입니다.${swingCount} 반등이 나와도 직전 고점(LH)을 넘지 못하면 추세 전환이 아니라 단순 기술적 반등에 불과합니다. 보유 중이면 반등 시 비중 축소를 우선 고려하고, 미보유면 구조 전환(직전 LH 돌파 + 거래량 증가)이 확인될 때까지 매수를 보류하세요. 하락 구조에서 무릎에서 잡겠다는 역발상 매수는 "떨어지는 칼 잡기"가 될 수 있으며, 손절 기준 없이 진입하면 큰 손실로 이어집니다. ADX 30 이상 + 역배열이면 하락이 가속 중이므로 특히 주의하세요.`};
  return {tone:'neutral',label:'횡보 구조',text:`뚜렷한 고저점 패턴 없이 옆으로 움직이고 있습니다.${swingCount} 추세가 형성되지 않은 박스권 상태로, 추세 추종 전략보다 레인지 매매(하단 매수 / 상단 매도)가 더 적합합니다. 횡보가 오래 지속되면 에너지 축적 후 방향이 정해질 때 강한 움직임이 나올 수 있으므로, BB 스퀴즈 · ADX 상승 · 거래량 급증 같은 돌파 전조를 주시하세요. 방향 결정 전까지는 소액 분할로 접근하고, 레인지 이탈 시 빠르게 따라가는 전략이 효율적입니다.`};
};

SXI.advMaConv = function(converging, spread, maArrange, bbSqueeze){
  if(converging==null) return null;
  const sp = (+spread).toFixed(1);
  const extras = [];
  if(bbSqueeze) extras.push('BB 스퀴즈 동시 발생 — 에너지 축적 극대화');
  if(maArrange==='bullish') extras.push('정배열 유지 중');
  else if(maArrange==='bearish') extras.push('역배열 유지 중');
  const extraStr = extras.length ? ' '+extras.join('. ')+'.' : '';

  if(converging && +spread<=2) return {tone:'neutral',label:'강한 수렴 (변곡점 임박)',text:`MA5/20/60 이격 ${sp}%. 이동평균선이 거의 한 점으로 수렴하고 있어 강력한 변곡점이 임박했습니다.${extraStr} 교과서에서는 이 수준의 수렴을 큰 추세의 시작점으로 보고, 볼린저 밴드 스퀴즈와 겹치면 돌파 시 폭발적 움직임을 예상합니다. 다만 **측정 결과는 반대쪽을 가리킵니다** — MA 간격이 가장 좁은 구간은 뒤이은 10봉 변동성이 오히려 **낮았습니다**(3시장 공통). 방향을 예단하기보다, 돌파 방향(상방: MA5가 MA60 상향 돌파 + 양봉 + 거래량 증가 / 하방: MA5가 MA60 하향 이탈 + 음봉)을 확인한 후 따라가는 전략이 안전합니다. 거짓 돌파에 대비해 첫 진입은 소액으로 하고, 방향이 확인되면 추가 진입하세요.`};
  if(converging) return {tone:'neutral',label:'수렴 중',text:`MA5/20/60 이격 ${sp}%. 이동평균선이 모이고 있으며 방향 전환 또는 추세 재개의 전조입니다.${extraStr} 수렴이 더 진행되면 변곡점 임박 단계로 넘어갑니다. ⚠측정에서는 좁은 간격이 뒤이은 변동성을 **낮추는** 쪽으로 나왔습니다(3시장 공통) — '폭발 대기'로 읽지 마세요. 현재는 방향이 정해지지 않은 관망 구간이며, 수렴 해소(이평선이 다시 벌어지기 시작) 방향이 핵심입니다. 수렴 중 거래량이 줄어드는 것은 정상이며, 거래량 급증과 함께 이평선이 벌어지면 새 추세의 시작입니다.`};
  if(+spread>8) return {tone:'warning',label:'과도한 분산',text:`MA5/20/60 이격 ${sp}%. 이동평균선이 매우 크게 벌어져 있어 추세가 과열된 상태입니다.${extraStr} 이 수준의 분산은 단기적으로 평균 회귀(조정)가 나올 가능성이 높습니다. 정배열 과분산이면 상승 과열 → 눌림 조정 예상, 역배열 과분산이면 하락 과매도 → 기술적 반등 예상입니다. 새로운 포지션 진입보다는 기존 포지션 정리를, 반대 방향 진입은 반전 신호 확인 후에 접근하세요.`};
  if(+spread>5) return {tone:'neutral',label:'분산 (추세 진행)',text:`MA5/20/60 이격 ${sp}%. 이동평균선이 벌어져 있어 현재 추세가 진행 중입니다.${extraStr} 정배열이면 상승 추세, 역배열이면 하락 추세가 유지되고 있습니다. 추세 방향 포지션 유지가 유리하며, 이격이 더 벌어지면 과열 구간으로 주의가 필요합니다. 이평선이 다시 모이기 시작하면 추세 둔화의 첫 번째 신호이므로 주의하세요.`};
  return {tone:'neutral',label:'보통',text:`MA5/20/60 이격 ${sp}%. 이동평균선 간격이 정상 범위입니다.${extraStr} 추세가 형성 중이거나 횡보 구간이며, 이격이 벌어지는 방향을 주시하면 추세 방향을 알 수 있습니다.`};
};

SXI.advTrend = function(trendPct, adxVal, maArrange, volTrend){
  if(trendPct==null) return null;
  const pct = +trendPct;
  const extras = [];
  if(adxVal!=null && +adxVal>25) extras.push(`ADX ${(+adxVal).toFixed(0)} (추세 확인)`);
  if(maArrange==='bullish') extras.push('MA 정배열');
  else if(maArrange==='bearish') extras.push('MA 역배열');
  if(volTrend==='up') extras.push('거래량 상승 동반');
  else if(volTrend==='down') extras.push('거래량 감소 주의');
  const extraStr = extras.length ? ' '+extras.join(', ')+'.' : '';

  if(pct>10) return {tone:'bullish',label:'매우 강한 상승',text:`추세 강도 ${pct.toFixed(1)}%. 단기 모멘텀이 매우 강하게 상승 중입니다.${extraStr} 이 수준의 추세 강도는 시장 전체에서도 상위권에 해당하며, 추세 추종 전략이 최적입니다. 다만 급등 후에는 차익실현 매물이 나올 수 있으므로, 과열 지표(RSI 80+, BB 상단 돌파, CCI 200+)를 함께 점검하세요. 보유 중이면 후행 손절을 설정하고 수익을 보호하되, 추세가 살아 있는 한 조기 매도는 자제합니다.`};
  if(pct>5) return {tone:'bullish',label:'강한 상승',text:`추세 강도 ${pct.toFixed(1)}%. 단기 모멘텀이 강하게 상승 중입니다.${extraStr} 추세 추종 전략 유효하며, 눌림 조정 시 분할 추가 매수를 고려할 수 있습니다. 과열 구간 진입 시(RSI 75+) 분할 매도로 수익 실현을 시작하되, 추세가 지속되는 한 전량 매도는 자제하세요. 거래량이 동반 증가하면 추세 건강성이 확인되고, 거래량 감소 시 모멘텀 약화를 의심합니다.`};
  if(pct>1) return {tone:'bullish',label:'완만한 상승',text:`추세 강도 ${pct.toFixed(1)}%. 안정적이지만 약한 상승 흐름입니다.${extraStr} 급등보다 점진적 우상향이 지속되는 패턴으로, 눌림목 구간에서의 분할 매수 전략이 가장 적합합니다. 추세가 약하므로 큰 비중 진입보다 소액 분할로 접근하고, MA20 지지 여부를 핵심 기준으로 삼으세요.`};
  if(pct>-1) return {tone:'neutral',label:'횡보',text:`추세 강도 ${pct.toFixed(1)}%. 뚜렷한 방향 없이 횡보 중입니다.${extraStr} 돌파 방향을 확인한 뒤 진입하는 것이 안전하며, 박스권 상단/하단에서의 레인지 매매를 고려해볼 수 있습니다. 횡보가 오래 지속되면 에너지 축적 후 강한 돌파가 나올 수 있으므로, BB 스퀴즈 · 거래량 급증 신호를 주시하세요.`};
  if(pct>-5) return {tone:'bearish',label:'완만한 하락',text:`추세 강도 ${pct.toFixed(1)}%. 하락 압력이 지속되고 있습니다.${extraStr} 반등이 나와도 이평선 저항에 막혀 다시 하락하는 패턴이 반복될 수 있습니다. 보유 중이면 반등 시 비중 축소를 우선 고려하고, 미보유면 하락 추세 반전(MACD 골든크로스 + 스윙 구조 전환)이 확인될 때까지 관망이 유리합니다.`};
  if(pct>-10) return {tone:'bearish',label:'강한 하락',text:`추세 강도 ${pct.toFixed(1)}%. 강한 하락 모멘텀이 진행 중입니다.${extraStr} 반등 매수("물타기")는 매우 위험하며, 하락 추세에서의 반등은 대부분 짧고 약합니다. 보유 중이면 손절 기준을 엄격히 적용하고, 관망 후 바닥 확인(거래량 급증 양봉 + MACD 양수 전환 + 스윙 구조 HH+HL 형성)을 기다리세요.`};
  return {tone:'danger',label:'매우 강한 하락',text:`추세 강도 ${pct.toFixed(1)}%. 매우 강한 하락 모멘텀으로 패닉 구간에 근접합니다.${extraStr} 손실이 빠르게 확대될 수 있으며, 보유 중이면 즉시 손절을 실행하세요. 기술적 반등이 나오더라도 짧고 약할 가능성이 높으며, 반등에 진입하면 다시 하락에 갇힐 수 있습니다. 시장 전체의 공포 지수가 극에 달할 때까지 현금 보유가 최선의 전략입니다.`};
};

SXI.advStructPos = function(pos, nearSupport, nearResistance, supportPrice, resistPrice){
  if(pos==null) return null;
  const pct = (+pos*100).toFixed(0);
  const supStr = supportPrice ? ` 지지선 약 ${(+supportPrice).toLocaleString()}` : '';
  const resStr = resistPrice ? ` 저항선 약 ${(+resistPrice).toLocaleString()}` : '';

  if(nearSupport && nearResistance) return {tone:'warning',label:'수렴 구간',text:`현재가가 최근 레인지의 ${pct}% 위치이며 지지와 저항이 모두 근접한 수렴 구간입니다.${supStr},${resStr}. 레인지가 극도로 좁아진 상태로, 돌파 방향에 따라 큰 움직임이 나올 수 있습니다. 돌파 전까지는 비중을 줄이고, 돌파 확인(거래량 동반 + 종가 기준) 후 따라가는 전략이 안전합니다.`};
  if(nearSupport) return {tone:'bullish',label:'지지 근접',text:`현재가가 최근 레인지의 ${pct}% 위치로 지지선에 근접합니다.${supStr}. 손절 라인이 가까워 리스크/리워드 비율이 유리한 구간입니다. 지지선에서 반등(양봉 전환 + 거래량 증가)이 확인되면 매수 진입 적합 구간이며, 손절은 지지선 하방 2~3%에 설정합니다. 지지선이 깨지면 다음 지지선까지 빠르게 하락할 수 있으므로, 지지 이탈 시 즉시 대응이 필수입니다. RSI 과매도 또는 BB 하단 접근이 동반되면 반등 교과서에서는 그 확률이 더 높아진다고 봅니다.`};
  if(nearResistance) return {tone:'bearish',label:'저항 근접',text:`현재가가 최근 레인지의 ${pct}% 위치로 저항선에 근접합니다.${resStr}. 돌파 실패 시 하락 반전 가능성이 있으며, 신규 매수보다 기존 물량 일부 익절을 우선 고려하세요. 저항 돌파 시에는 거래량 동반 여부가 핵심 — 거래량 없는 돌파는 거짓 돌파일 교과서에서는 그 확률을 높게 봅니다. 돌파 확인 후 돌파 후 되돌림에서 재진입하는 전략이 가장 안전하며, 돌파 실패 시 빠른 손절이 필요합니다.`};
  if(+pos*100>=70) return {tone:'neutral',label:'상단권',text:`현재가가 최근 레인지의 ${pct}% 위치로 상단권에 있습니다. 저항에 가까워지고 있으며, 돌파 여부에 따라 추가 상승 또는 조정이 결정됩니다. 추격 매수보다는 돌파 확인 또는 눌림 후 재진입이 효율적입니다.`};
  if(+pos*100<=30) return {tone:'neutral',label:'하단권',text:`현재가가 최근 레인지의 ${pct}% 위치로 하단권에 있습니다. 지지에 가까워지고 있으며, 지지 여부에 따라 반등 또는 추가 하락이 결정됩니다. 지지 확인 후 분할 접근을 고려할 수 있습니다.`};
  return {tone:'neutral',label:'중간 위치',text:`현재가가 최근 레인지의 ${pct}% 위치입니다. 지지/저항 모두에서 거리가 있는 중간 구간으로, 방향성 확인이 어렵습니다. 핵심 지지/저항 도달 시에만 대응하는 전략이 효율적이며, 현 위치에서의 성급한 진입은 어느 방향으로든 불리할 수 있습니다.`};
};

SXI.advPsychLevel = function(near, level, price){
  if(!near && near!==false) return null;
  const priceStr = price ? ` (현재가 ${(+price).toLocaleString()})` : '';
  const levelStr = level ? ` 심리가 ${(+level).toLocaleString()}` : '';
  if(near) return {tone:'bullish',label:'심리가 근접',text:`현재가가 라운드넘버(만원단위/천원단위) 근처에 있습니다${priceStr}${levelStr}. 심리적 가격대는 시장 참여자들의 주문이 집중되는 지점으로, 강력한 지지/저항 역할을 합니다. 라운드넘버 위에서 유지되면 지지 확인으로 매수 근거가 되고, 라운드넘버를 하향 이탈하면 심리적 지지 붕괴로 급락 가속이 가능합니다. 옵션 만기일이나 선물 만기일에는 심리가 효과가 더 강해집니다. 돌파 시 다음 라운드넘버까지 빠르게 이동하는 경향이 있어, 돌파 확인 후 진입이 유효합니다.`};
  return {tone:'neutral',label:'심리가 이격',text:`주요 심리적 가격대에서 떨어져 있어 라운드넘버 효과가 미미합니다${priceStr}. 기술적 지표와 차트 구조 중심으로 판단하세요. 다음 라운드넘버 접근 시 심리가 효과가 다시 작용할 수 있으므로, 접근 시점에서 재확인이 필요합니다.`};
};

SXI.advContext = function(bonus, notes, topFactors){
  if(!notes || !notes.length) return null;
  const b = +bonus||0;
  const noteStr = (topFactors||notes).slice(0,5).join(' · ');
  if(b>10) return {tone:'bullish',label:'강한 매수 맥락',text:`복합 맥락 보정 +${b}점. 주요 요인: ${noteStr}. 다수의 기술적 요인이 동시에 매수를 지지하고 있습니다. 정배열 + 상승추세 + 수급 유입 + 모멘텀 강세 등이 겹치는 "다중확인" 구간으로, 매수 신호의 교과서에서는 신뢰도를 매우 높게 봅니다. 다만 모든 것이 좋아 보일 때가 오히려 과열의 시작일 수 있으므로, 과매수 지표와 거래량 추이를 병행 점검하세요. 분할 진입으로 리스크를 관리하면서도 추세를 놓치지 않는 전략이 최적입니다.`};
  if(b>5) return {tone:'bullish',label:'매수 우위 맥락',text:`복합 맥락 보정 +${b}점. 주요 요인: ${noteStr}. 기술적 요인 다수가 매수 쪽으로 기울어져 있어 약간의 매수 우위가 형성됩니다. 강한 확신 구간은 아니지만, 손절 기준을 명확히 설정한 상태에서 분할 접근이 가능합니다. 추가 호재료(거래량 증가, 돌파 확인)가 나오면 비중을 높이세요.`};
  if(b>0) return {tone:'neutral',label:'약간 매수 우위',text:`복합 맥락 보정 +${b}점. 주요 요인: ${noteStr}. 매수 쪽 요인이 조금 우세하나 확정적이지 않습니다. 방향이 좀 더 명확해질 때까지 소액 관찰 매수 또는 관망이 적절합니다.`};
  if(b>-5) return {tone:'neutral',label:'혼합 맥락',text:`복합 맥락 보정 ${b>0?'+':''}${b}점. 주요 요인: ${noteStr}. 매수와 매도 요인이 혼재되어 뚜렷한 방향성이 없습니다. 추세가 불분명할 때는 포지션 비중을 줄이고, 한쪽 방향이 확실해질 때까지 기다리는 것이 리스크 관리에 유리합니다.`};
  if(b>-10) return {tone:'bearish',label:'매도 우위 맥락',text:`복합 맥락 보정 ${b}점. 주요 요인: ${noteStr}. 기술적 요인 다수가 매도 쪽으로 기울어져 있습니다. 보유 중이면 반등 시 비중 축소를 검토하고, 미보유면 신규 매수를 보류하세요. 시장 환경 개선 + 추세 반전 신호가 나올 때까지 관망이 안전합니다.`};
  return {tone:'danger',label:'강한 매도 맥락',text:`복합 맥락 보정 ${b}점. 주요 요인: ${noteStr}. 다수의 기술적 요인이 동시에 매도를 가리키고 있습니다. 역배열 + 하락추세 + 수급 유출 + 모멘텀 약세 등이 겹치는 위험 구간으로, 보유 중이면 손절 또는 대폭 비중 축소를 즉시 실행하세요. 기술적 반등이 나와도 짧고 약할 가능성이 높으며, 반등에 진입하면 다시 하락에 갇힐 수 있습니다.`};
};

// S48: 레짐 상세 해석 — 추세강도(ADX), 변동폭(BB), 방향, 매매전략
SXI.advRegime = function(regime){
  if(!regime) return null;
  const adx = regime.adx||0;
  const bbW = regime.bbWidth||0;
  const dir = regime.direction||'FLAT';
  const label = regime.label||'불명';

  // 추세강도 해석 — [S986] 고ADX(≥40) 방향가드: dir 반영(하락 추세에 "추종 최적=매수" 오해 방지)
  let adxDesc;
  if(adx>=40) adxDesc = (dir==='DOWN')
    ? `추세강도(ADX)가 ${adx.toFixed(0)}으로 매우 강한 하락 추세가 진행 중입니다. 추세를 따르면 매도 방향이라 신규 매수는 부적합하며, 역추세(반등) 매수도 위험합니다.`
    : `추세강도(ADX)가 ${adx.toFixed(0)}으로 매우 강한 추세가 진행 중입니다. 추세 방향(아래)이 상방일 때 추세 추종 매수가 가장 효과적이며, 역추세 매매는 위험합니다.`;
  else if(adx>=30) adxDesc = `추세강도(ADX)가 ${adx.toFixed(0)}으로 뚜렷한 추세가 형성되어 있습니다. 추세 방향을 따라가는 전략이 유효하며, 추세 약화 신호(ADX 꺾임)를 주시하세요.`;
  else if(adx>=25) adxDesc = `추세강도(ADX)가 ${adx.toFixed(0)}으로 추세가 형성되고 있으나 아직 강한 추세(35 이상)에는 미치지 못합니다. 방향성은 있지만 확신할 정도는 아닙니다.`;
  else if(adx>=20) adxDesc = `추세강도(ADX)가 ${adx.toFixed(0)}으로 약한 추세 또는 추세 전환 초기입니다. 뚜렷한 방향이 잡힐 때까지 관망하거나 소액으로 접근하세요.`;
  else adxDesc = `추세강도(ADX)가 ${adx.toFixed(0)}으로 추세가 거의 없는 횡보 구간입니다. 박스권 매매(저점 매수/고점 매도)가 유리하며, 추세 추종 전략은 비효율적입니다.`;

  // 변동폭 해석 — [S986] BB폭은 방향 무지 → "추세추종 유효(=매수)" 단정 제거·방향은 dirDesc로
  let bbDesc;
  if(bbW>=5) bbDesc = `변동폭(BB)이 ${bbW.toFixed(1)}%로 매우 넓어 급등·급락이 빈번한 구간입니다. 손절 폭을 넓게 잡거나 비중을 줄여야 합니다.`;
  else if(bbW>=3) bbDesc = `변동폭(BB)이 ${bbW.toFixed(1)}%로 적당한 움직임을 보이고 있습니다. 방향(아래)이 잡히면 추세 전략을 쓸 만한 변동폭입니다.`;
  else if(bbW>=1.5) bbDesc = `변동폭(BB)이 ${bbW.toFixed(1)}%로 좁은 편이며, 에너지 축적 후 큰 움직임이 나올 수 있습니다. 돌파 방향에 주목하세요.`;
  else bbDesc = `변동폭(BB)이 ${bbW.toFixed(1)}%로 매우 좁아 스퀴즈(수축) 상태입니다. 곧 방향성 있는 큰 움직임이 예상되므로, 돌파 시 빠른 진입 준비를 하세요.`;

  // 방향별 전략
  let dirDesc;
  //  [S1312] ★자기모순 수정 — dirDesc가 **adxDesc를 전혀 보지 않아** 한 문단이 반대 조언을 했다.
  //    실사례(체인링크 ADX 18): "추세가 거의 없는 횡보 구간입니다. … 추세 추종 전략은 비효율적입니다."
  //      바로 다음 줄 → "현재 상승 방향으로, **매수 관점의 추세 추종이 기본 전략입니다.**"
  //      삼성전자(ADX 22)도 동일: "관망하거나 소액으로 접근" → "추세 추종이 기본 전략".
  //    ⚠S986이 **고ADX(≥40)에는 이미 방향 가드**를 넣었다(하락 추세에 "추종=매수" 오해 방지).
  //      그런데 **저ADX 쪽에는 안 넣어서** 반대 방향의 같은 사고가 남아 있었다.
  //    ⇒ ADX가 추세를 지지하지 않는 구간(<20)에서는 '추세 추종' 권유를 하지 않는다.
  //      방향은 사실로 남기고(상승/하락 방향인 것은 맞다) **전략 문구만 ADX와 정합**시킨다.
  //    ⚠새 판정을 만들지 않는다 — 두 문장이 서로 반대되지 않게 맞출 뿐이다.
  const _adxWeak = adx < 20;                    // adxDesc가 "횡보·추세 추종 비효율"이라 말하는 구간
  const _adxMid  = adx >= 20 && adx < 25;       // adxDesc가 "약한 추세·관망 또는 소액"이라 말하는 구간
  if(dir==='UP'){
    dirDesc = _adxWeak
      ? '방향 자체는 위쪽이지만 위에서 본 대로 추세 강도가 받쳐주지 않습니다 — 추세 추종보다 박스권 관점이 앞 문장과 맞습니다.'
      : _adxMid
      ? '방향은 위쪽이나 추세 강도가 아직 약합니다 — 추세 추종은 방향이 굳어진 뒤가 앞 문장과 맞습니다.'
      : '현재 상승 방향으로, 매수 관점의 추세 추종이 기본 전략입니다. 조정 시 눌림목 매수 기회를 노리세요.';
  } else if(dir==='DOWN'){
    dirDesc = (_adxWeak || _adxMid)
      ? '방향 자체는 아래쪽이지만 추세 강도가 약합니다 — 추세로 볼지 흔들림으로 볼지는 이 화면이 정하지 않습니다. 신규 매수는 여전히 신중할 자리입니다.'
      : '현재 하락 방향으로, 신규 매수는 위험합니다. 보유 시 반등 시점에 비중 축소를 검토하세요.';
  } else {
    dirDesc = '방향이 불분명한 구간으로, 지지/저항 돌파를 기다리는 관망 전략이 안전합니다.';
  }

  // 종합 판정
  let tone, labelOut;
  if(adx>=25 && dir==='UP') { tone='bullish'; labelOut='상승 추세 진행'; }
  else if(adx>=25 && dir==='DOWN') { tone='bearish'; labelOut='하락 추세 진행'; }
  else if(adx<20) { tone='neutral'; labelOut='횡보·무추세'; }
  else { tone='warning'; labelOut='추세 전환 가능'; }

  const text = `${adxDesc}\n${bbDesc}\n${dirDesc}`;
  return {tone, label:labelOut, text};
};


// ════════════════════════════════════════════════════════════
//  고급 해석(Deep Interpretation) 보강 — S46
//  눌림목/스윙구조/MA수렴 등 추세·구조 지표를 상세 해석으로 보강
// ════════════════════════════════════════════════════════════

SXI.pullback = function(score){
  if(score==null) return null;
  const s=+score;
  if(s>=80) return {label:'최적 눌림목',tone:'bullish',text:`눌림목 점수 ${s}. 상승 추세 안에서 조정이 충분히 진행된 이상적 매수 구간입니다. MA20 지지와 RSI 반등이 겹치는 자리로, 분할 매수를 적극 고려할 만합니다. 직전 스윙 저점을 손절 라인으로 설정하고, MA20 종가 이탈 시 해석이 무효화됩니다.`};
  if(s>=60) return {label:'눌림목 양호',tone:'bullish',text:`눌림목 점수 ${s}. 조정이 진행 중이며 매수 관심 구간에 진입하고 있습니다. 아직 최적은 아닐 수 있으므로, 지지 확인 + 거래량 반등을 기다린 뒤 분할 진입이 안전합니다.`};
  if(s>=40) return {label:'눌림목 보통',tone:'neutral',text:`눌림목 점수 ${s}. 조건이 일부만 갖춰진 상태로, 추세가 강하지 않거나 조정 폭이 부족합니다. 지지선 도달 시 재검토하세요.`};
  if(s>=20) return {label:'눌림목 약함',tone:'neutral',text:`눌림목 점수 ${s}. 눌림목 매수 조건에 거의 부합하지 않습니다. 추세 방향이 명확해진 후 재검토가 바람직합니다.`};
  return {label:'해당없음',tone:'neutral',text:`눌림목 점수 ${s}. 눌림목 매수 조건에 해당하지 않습니다. 역배열이거나 하락 추세에서는 눌림목 전략 자체가 위험합니다.`};
};

SXI.swingStruct = function(higherHighs, lowerLows){
  if(higherHighs && !lowerLows) return {label:'상승 구조 (HH+HL)',tone:'bullish',text:'고점과 저점이 모두 높아지는 상승 구조입니다. 눌림이 오면 직전 저점에서 지지되는지가 핵심이고, 저점이 깨지면 구조가 무너진 것으로 봐야 합니다. ADX 25 이상이면 추세 강도 확인, 거래량 동반 고점 갱신이면 구조 건강성 양호.'};
  if(higherHighs && lowerLows) return {label:'확산형',tone:'warning',text:'고점은 높아지는데 저점도 낮아지는 확산형입니다. 변동성이 커지고 있고 방향이 불분명하니, 비중을 줄이고 확산 해소 방향을 기다리세요.'};
  if(!higherHighs && lowerLows) return {label:'하락 구조 (LH+LL)',tone:'bearish',text:'저점이 계속 내려가는 하락 구조입니다. 반등이 나와도 고점을 넘기 전까지 추세 전환으로 보기 어렵습니다. 보유 시 반등 비중 축소, 미보유 시 구조 전환 확인까지 관망.'};
  return {label:'횡보 구조',tone:'neutral',text:'뚜렷한 고저점 패턴 없이 옆으로 움직이고 있습니다. 방향이 정해질 때까지 기다리되, BB 스퀴즈·거래량 급증 같은 돌파 전조를 주시하세요.'};
};

//  [S1300] SXI.maConvergence 철거 — **死코드였다**(참조 0 · 동적/브래킷 접근 0 전수 확인 · S1249 절차).
//    백로그가 "SXI.maConvergence의 '분산 → 평균 회귀'가 측정과 부호 반대"라고 지목했으나,
//    이 함수는 interpretAll이 조립만 하고 **화면 어디에도 나가지 않았다.**
//    실제로 렌더되는 것은 SXI.advMaConv(위)이고 같은 문구를 갖고 있다 — 지적은 유효했고 대상이 틀렸다.
//    ⚠서술 자체는 advMaConv에 그대로 둔다(S1283: 지우지 않고 출처를 밝힌다 · 배지 [미측정]).

SXI.vwap = function(position, pct){
  if(!position) return null;
  const p = pct!=null?(+pct).toFixed(1):'';
  if(position==='above_far') return {label:'VWAP 크게 상회',tone:'warning',text:`가격이 단기 평균 매입단가를 ${p}% 상회합니다. 대부분의 단기 매수자가 수익 중이어서 차익실현 매물 출회 가능성이 높습니다. 추격 매수는 위험하며, 눌림 조정 후 VWAP 부근 지지 확인 시 재진입이 안전합니다. 거래량이 줄어들면서 가격이 유지되면 건전한 상승, 거래량 급감이면 매수 고갈 신호입니다.`};
  if(position==='above') return {label:'VWAP 상회',tone:'bullish',text:'가격이 단기 평균 매입단가 위에서 유지되어 단기 수급이 매수 우위입니다. 눌림이 나오더라도 VWAP이 1차 지지 역할을 하며, VWAP 지지 후 반등은 건강한 상승의 전형적 패턴입니다. VWAP 이탈 시 매수 해석 약화에 주의하세요.'};
  if(position==='near') return {label:'VWAP 공방',tone:'neutral',text:'가격이 VWAP 부근에서 공방 중입니다. 매수/매도 균형 상태이며 방향 결정 전 단계입니다. VWAP 위 안착은 매수 신호, 아래 이탈은 단기 하락 신호입니다. 거래량과 캔들 방향을 함께 확인하세요.'};
  if(position==='below') return {label:'VWAP 하회',tone:'bearish',text:'가격이 단기 평균 매입단가 아래입니다. 단기 매수자 대부분이 손실 상태이며, 반등이 나와도 VWAP이 저항으로 작용할 수 있습니다. 추격 매수보다 VWAP 회복 확인 후 접근이 안전합니다.'};
  return {label:'VWAP 크게 하회',tone:'danger',text:`가격이 단기 평균 매입단가를 ${p?Math.abs(+p).toFixed(1)+'% ':'크게 '}하회합니다. 매도 압력이 강한 구간이며, 단기 매수자 대부분이 큰 손실 상태입니다. 반등이 나와도 VWAP과 이평선이 다중 저항으로 작용하여 회복이 어렵습니다. 기술적 반등 시도 시에도 VWAP 부근에서 매도 물량이 쏟아질 수 있으므로 극도의 보수적 접근이 필요합니다.`};
};

SXI.ichimoku = function(priceVsCloud, cloud, signal){
  if(!priceVsCloud) return null;
  if(priceVsCloud==='above' && cloud==='bullish') return {label:'구름 위 (양운)',tone:'bullish',text:'가격이 양운(상승 구름) 위에 있고 전환선이 기준선 위에 있어 중기 추세가 확실히 상승 우위입니다. 일목균형표의 삼역호전(三役好轉) 중 2가지 이상이 충족된 상태로, 눌림목 매수에 가장 유리한 구름 환경입니다. 구름 상단이 지지선 역할을 하며, 구름이 두꺼울수록 지지가 강합니다. 다만 구름과의 괴리가 커지면 단기 되돌림 가능성도 함께 보세요.'};
  if(priceVsCloud==='above') return {label:'구름 위',tone:'bullish',text:'가격이 구름 위에 있어 중기 기준 상승 추세입니다. 구름이 얇아지거나 음운 전환(선행스팬A < 선행스팬B) 시 추세 약화 경고입니다. 전환선과 기준선의 교차 방향도 함께 확인하면 단기 방향 판단에 도움됩니다.'};
  if(priceVsCloud==='inside') return {label:'구름 안',tone:'neutral',text:'가격이 구름 안에 갇혀 있어 방향이 정해지지 않은 과도기 구간입니다. 구름 상단 돌파 시 상승 전환, 하단 이탈 시 하락 가속으로 볼 수 있습니다. 구름이 두꺼울수록 돌파 시 에너지가 크고, 얇을수록 빠르게 통과합니다. 돌파 방향을 기다리되, 거짓 돌파에 대비해 2봉 이상 확인 후 대응하세요.'};
  if(priceVsCloud==='below' && cloud==='bearish') return {label:'구름 아래 (음운)',tone:'danger',text:'가격이 음운(하락 구름) 아래로 가장 약한 상태입니다. 구름이 두꺼운 저항으로 작용하여 반등 폭이 제한됩니다. 구름 돌파에는 상당한 에너지(거래량 + 모멘텀)가 필요하며, 단순 기술적 반등으로는 구름 하단에서 막히기 쉽습니다. 매수는 구름 돌파 확인 후에만 고려하세요.'};
  return {label:'구름 아래',tone:'bearish',text:'가격이 구름 아래에 있어 하락 추세입니다. 구름이 저항으로 작용하며, 구름 돌파 전까지 매수는 위험합니다. 전환선이 기준선 위로 올라오면 반전 초기 신호이지만, 구름 돌파까지는 본격 전환으로 보기 어렵습니다.'};
};

SXI.regime = function(label, direction, adx){
  if(!label) return null;
  const adxStr = adx!=null ? ` ADX ${(+adx).toFixed(0)}.` : '';
  const T = {
    '추세+변동':`추세가 있으면서 변동성도 높은 구간입니다.${adxStr} 방향이 맞으면 수익이 빠르지만 틀리면 손실도 빨라 비중 조절이 핵심입니다. 손절 폭을 평소보다 넓게 잡되 비중을 줄이는 전략이 유효합니다.`,
    '추세장':`뚜렷한 추세가 진행 중입니다.${adxStr} 추세를 따라가는 포지션이 유리하고, 역방향 매매는 위험합니다. 눌림목 매수(상승 시) 또는 반등 매도(하락 시) 전략이 최적입니다.`,
    '횡보장':`방향 없이 옆으로 움직이는 구간입니다.${adxStr} 추세 추종보다 박스권 매매가 더 맞는 환경이며, 돌파 시 빠르게 따라가는 준비를 하세요.`,
    '전환기':`추세가 바뀌고 있는 과도기입니다.${adxStr} 기존 포지션을 정리하고 새 방향이 확인될 때까지 지켜보세요. 전환 초기에 성급하게 진입하면 거짓 신호에 당할 수 있습니다.`
  };
  return {label, tone:direction==='UP'?'bullish':direction==='DOWN'?'bearish':'neutral', text:T[label]||`시장 상태를 분석 중입니다.${adxStr}`};
};

// ════════════════════════════════════════════════════════════
//  1단계-B: 신규 단건 해석 함수 (v2.0)
// ════════════════════════════════════════════════════════════

SXI.priceChannel = function(position, upper, lower, price){
  if(!position) return null;
  const pFmt = (v)=> v!=null ? (+v).toLocaleString() : '';
  const range = upper&&lower ? ` 채널 범위 ${pFmt(lower)}~${pFmt(upper)}.` : '';
  if(position==='breakout_up') return {label:'채널 상단 돌파',tone:'bullish',text:`가격(${pFmt(price)})이 최근 가격 범위 상단(${pFmt(upper)})을 돌파했습니다.${range} N일간의 고점을 돌파한 것으로, 새로운 상승 추세의 시작일 수 있습니다. 거래량이 평소의 1.5배 이상 동반되면 진짜 돌파 교과서에서는 그 확률이 높아진다고 보며, 거래량 없는 돌파는 거짓 돌파 위험이 있습니다. 돌파 직후 돌파 후 되돌림 시 이전 상단이 지지로 전환되면 추가 진입 구간이 됩니다. 되돌림이 채널 안으로 다시 빠지면 거짓 돌파이므로 즉시 매도하세요.`};
  if(position==='breakout_down') return {label:'채널 하단 이탈',tone:'danger',text:`가격(${pFmt(price)})이 최근 가격 범위 하단(${pFmt(lower)})을 이탈했습니다.${range} N일간의 저점을 깨뜨린 것으로 하락 가속 위험이 큽니다. 보유 중이면 즉시 손절 기준을 점검하고, 이탈이 종가 기준으로 확정되면 비중 축소를 실행하세요. 채널 하단 이탈 후 급등 복귀(V자 반등)는 드물며, 대부분 추가 하락 또는 횡보가 이어집니다.`};
  if(position==='upper_half') return {label:'채널 상단권',tone:'warning',text:`가격이 채널 상단권에 위치합니다.${range} 돌파 직전 구간으로, 돌파 성공 시 급등이 가능하지만 실패 시 되돌림이 빠를 수 있습니다. 거래량 증가와 함께 상단 접근이면 돌파 확률↑(교과서), 거래량 감소면 저항 가능성↑. 돌파 확인 전까지는 추격보다 확인 접근이 유리합니다.`};
  if(position==='lower_half') return {label:'채널 하단권',tone:'bullish',text:`가격이 채널 하단권에 위치합니다.${range} 지지 확인 시 반등 시도 구간으로, 하단에서 양봉 전환 + 거래량 증가가 나오면 매수 근거가 됩니다. 다만 하단 이탈 시 추가 약세가 열리므로, 채널 하단을 손절 라인으로 설정하고 진입하세요.`};
  return {label:'채널 중간',tone:'neutral',text:`최근 가격 범위 중간 부근입니다.${range} 상단이든 하단이든 방향 결정 전 단계이며, 위치 기반 신호는 약합니다.`};
};

SXI.pivot = function(level, P, R1, S1, price){
  if(!level || level==='none') return null;
  const pFmt = (v)=> v!=null ? (+v).toLocaleString() : '';
  if(level==='R2+') return {label:'피벗 R2 이상',tone:'warning',text:`가격(${pFmt(price)})이 피벗 R2 이상에 위치해 단기 과열 구간입니다. 피벗(${pFmt(P)}). 피벗 포인트 기준으로 상당히 높은 위치이며, 전일 대비 상승 폭이 큽니다. 기관·데이트레이더의 차익 실현 매물이 집중될 수 있는 구간이므로, 추격 진입보다 눌림 확인이 유리합니다. R2 이상에서 양봉이 지속되면 추세가 매우 강한 것이지만, 거래량 감소와 함께면 고점 피로 신호입니다.`};
  if(level==='R1~R2') return {label:'피벗 R1~R2',tone:'bullish',text:`가격이 피벗(${pFmt(P)})과 R1(${pFmt(R1)}) 위에 있어 단기 매수 우위입니다. R2 돌파 시 추세 가속이 예상되며, 실패 시 R1이 1차 지지가 됩니다. R1 지지 확인 후 추가 매수를 고려할 수 있고, R1 이탈 시 피벗까지 조정 가능성을 열어두세요.`};
  if(level==='P~R1') return {label:'피벗~R1',tone:'bullish',text:`가격이 피벗(${pFmt(P)}) 위에서 R1(${pFmt(R1)})을 향하고 있어 약한 매수 우위입니다. 피벗 위 유지가 핵심이며, 피벗 이탈 시 약세 전환에 유의하세요. 거래량이 늘면서 R1에 접근하면 돌파 교과서에서는 그 확률이 높아진다고 봅니다.`};
  if(level==='S1~P') return {label:'S1~피벗',tone:'neutral',text:`가격이 피벗(${pFmt(P)}) 아래로 내려왔지만 S1(${pFmt(S1)}) 위에서 지지를 받고 있습니다. 피벗 회복 시 매수 신호, S1 이탈 시 추가 하락에 유의하세요. 이 구간은 단기 매수/매도 공방 구간으로, 방향 결정까지 관망이 유리합니다.`};
  if(level==='S1~S2') return {label:'피벗 S1~S2',tone:'bearish',text:`가격이 S1(${pFmt(S1)}) 아래로 하락해 단기 기준 약세 우위입니다. 추가 하락 가능성이 있으며, 반등이 나와도 S1과 피벗이 다중 저항으로 작용합니다. 보수적 접근이 필요하며, 신규 매수보다 관망이 안전합니다.`};
  if(level==='S2-') return {label:'피벗 S2 이하',tone:'danger',text:`가격(${pFmt(price)})이 피벗 S2 이하로 크게 하락한 상태입니다. 극단적 약세 구간이며, 전일 대비 낙폭이 매우 큽니다. 패닉 셀링 가능성이 있으며, 기술적 반등이 나와도 상단의 S1, 피벗이 모두 저항이 되어 회복이 어렵습니다. 매수보다 손절 및 관망이 우선입니다.`};
  return {label:'피벗 근처',tone:'neutral',text:'현재가가 피벗 부근으로 방향 결정 전 단계입니다. 피벗 위 안착은 매수 우위, 아래 이탈은 매도 우위 신호입니다.'};
};

SXI.maDisparity = function(d20, d60){
  if(d20==null && d60==null) return null;
  const v20 = d20!=null ? +d20 : null;
  const v60 = d60!=null ? +d60 : null;
  const primary = v20 != null ? v20 : v60;
  const detail = [];
  if(v20!=null) detail.push(`MA20 이격 ${v20>=0?'+':''}${v20.toFixed(1)}%`);
  if(v60!=null) detail.push(`MA60 이격 ${v60>=0?'+':''}${v60.toFixed(1)}%`);
  const dtxt = detail.join(', ');
  if(primary>10) return {label:'MA 극단 과열',tone:'danger',text:`이동평균선 대비 극단적으로 벌어졌습니다(${dtxt}). 교과서에서는 이 수준의 괴리를 드물게 보고 급격한 되돌림(평균 회귀)을 예상합니다. 보유 중이면 분할 익절을 즉시 시작하고, 신규 진입은 절대 자제하세요.`};
  if(primary>8) return {label:'MA 크게 과열',tone:'danger',text:`이동평균선 대비 괴리가 크게 벌어졌습니다(${dtxt}). 추세는 강할 수 있지만 신규 진입 기준으로는 과열 부담이 큽니다. 조정 시 이격이 줄어드는 과정에서 낙폭이 클 수 있으므로 주의하세요.`};
  if(primary>4) return {label:'MA 과열',tone:'warning',text:`이동평균선 대비 괴리가 벌어지고 있습니다(${dtxt}). 추세가 살아 있다면 가속이지만, 이격이 커질수록 이평선으로의 회귀 압력도 커집니다. 눌림 조정 시 이평선 근처까지 내려올 수 있으므로 추격 매수는 비중을 낮추세요.`};
  if(primary<-10) return {label:'MA 극단 이격',tone:'bullish',text:`이동평균선 대비 하방 괴리가 극단적입니다(${dtxt}). 패닉 셀링 구간일 수 있으며, 기술적 반등 시 폭이 클 수 있습니다. 다만 추세 확인 없이 역발상 매수는 위험하므로, 반전 신호(양봉+거래량) 확인 후 소액 접근하세요.`};
  if(primary<-8) return {label:'MA 크게 이격',tone:'bullish',text:`이동평균선 대비 하방 괴리가 매우 큽니다(${dtxt}). 기술적 반등 가능성이 높지만, 추세 확인이 동반되어야 합니다. 이평선까지의 반등을 1차 목표로 설정할 수 있습니다.`};
  if(primary<-4) return {label:'MA 눌림',tone:'neutral',text:`이동평균선과의 괴리가 줄어드는 중입니다(${dtxt}). 추세가 살아 있다면 눌림목 성격으로 볼 수 있으며, 이평선 근접 시 지지 여부가 핵심입니다.`};
  return {label:'MA 이격 보통',tone:'neutral',text:`이동평균선과의 괴리가 정상 범위입니다(${dtxt}). 이평선과 가격이 균형을 이루고 있어 과열/침체 신호는 없습니다.`};
};

SXI.volumeMA = function(volRatio){
  if(volRatio==null) return null;
  const r=+volRatio;
  if(r>=5) return {label:'거래량 폭등',tone:'bullish',text:`거래량이 평균의 ${r.toFixed(1)}배로 폭등했습니다. 극단적인 거래량은 세력 진입, 중대 뉴스, 또는 패닉 매도를 의미합니다. 양봉이면 강력한 매수 신호, 음봉이면 투매 가능성을 확인하세요. 거래량 폭등 후에는 변동성이 크게 확대되므로 비중 관리에 주의가 필요합니다.`};
  if(r>=3) return {label:'거래량 폭발',tone:'bullish',text:`거래량이 평균의 ${r.toFixed(1)}배로 급증했습니다. 세력이 움직이고 있을 수 있으며, 가격 방향(양봉/음봉)과 일치하는지가 핵심입니다. 돌파 시점의 거래량 폭발은 진짜 돌파의 강력한 확인 신호이며, 조정 시 거래량 감소가 동반되면 건강한 조정입니다.`};
  if(r>=1.5) return {label:'거래량 증가',tone:'bullish',text:`거래량이 평균을 넘어서(${r.toFixed(1)}x) 현재 움직임에 힘이 실리고 있습니다. 추세 방향과 거래량이 일치하면 추세 건강성이 확인되며, 돌파/이탈 시의 거래량 증가는 방향성에 대한 확신을 높여줍니다.`};
  if(r>=0.7) return {label:'거래량 보통',tone:'neutral',text:`거래량이 평균 수준(${r.toFixed(1)}x)이라 특별한 수급 신호는 보이지 않습니다. 돌파나 반전 판단에는 거래량 변화가 동반되어야 교과서에서는 신뢰도가 높아진다고 봅니다.`};
  return {label:'거래량 감소',tone:'neutral',text:`거래량이 평균보다 적습니다(${r.toFixed(1)}x). 시장 참여자의 관심이 줄어든 상태이며, 돌파나 전환의 교과서에서는 신뢰도가 떨어진다고 봅니다. 다만 수축이 오래 지속되면 에너지 축적 후 폭발적 움직임이 나올 수 있어, BB 스퀴즈 동반 시 주의하세요.`};
};

SXI.adLine = function(trend, div){
  if(!trend) return null;
  if(div==='bullish') return {label:'A/D 상승 다이버전스',tone:'bullish',text:'가격은 조정을 받았지만 A/D(Accumulation/Distribution) 라인은 오히려 개선 중입니다. 종가 기준으로 매수세가 살아 있으며, 누군가 조용히 모으고 있을 가능성이 높습니다. OBV 상승 다이버전스와 동시 발생 시 매집 교과서에서는 그 확률이 매우 높아진다고 보며, 가격 반등 시 급등으로 이어질 수 있습니다.'};
  if(div==='bearish') return {label:'A/D 하락 다이버전스',tone:'warning',text:'A/D 라인이 꺾이면서 종가 기준 물량이 빠져나가는 조짐이 보입니다. 가격은 상승하지만 실질 수급은 약해지고 있어, 고점권이라면 차익 실현 매물에 특히 주의해야 합니다. OBV도 하락이면 이중 분산 신호입니다.'};
  if(trend==='up') return {label:'A/D 상승',tone:'bullish',text:'A/D 라인이 올라가며 종가 기준으로 매수세가 우위입니다. 가격이 횡보하더라도 내부 수급은 개선 중일 수 있으며, 향후 가격 상승의 선행 지표가 됩니다. OBV 상승과 함께라면 수급 건강성이 확실합니다.'};
  if(trend==='down') return {label:'A/D 하락',tone:'bearish',text:'A/D 라인이 내려가며 종가 기준 매도세가 우위입니다. 물량이 빠지는 흐름이 지속되고 있어, 지지선 이탈 시 급락으로 연결될 수 있습니다. OBV도 하락이면 수급 악화가 확실합니다.'};
  return {label:'A/D 보합',tone:'neutral',text:'A/D 라인이 횡보 중이라 뚜렷한 수급 방향이 보이지 않습니다. 방향이 정해지기를 기다리는 구간입니다.'};
};

// ════════════════════════════════════════════════════════════
//  2단계: 복합 상황 해석 (4계열 분리)
// ════════════════════════════════════════════════════════════

SXI.compositeMomentum = function(ind){
  const notes=[];
  if(!ind) return notes;
  const rsi=typeof ind.rsi==="number"?ind.rsi:(ind.rsi?.val??ind.rsiLegacy??50);
  const stK=ind.stoch?.k??50, stD=ind.stoch?.d??50;
  const macdH=ind.macd?.hist??ind.macd?.histogram??0;
  const macdPH=ind.macd?.prevHist??null;
  const macdG=ind.macd?.recentGolden??ind.macdLegacy?.recentGolden;
  if(rsi<=30 && stK<=25 && stK>stD) notes.push({tone:'bullish',icon:'[!]',title:'RSI 과매도 + Stoch 골든크로스',text:'단기 반등 조건이 동시에 형성되고 있습니다. 교과서에서는 추세 하락 중이면 기술적 반등, 횡보 하단이면 매수 시도 구간으로 봅니다.'});
  else if(macdG && macdH<0 && macdPH!=null && macdH>macdPH) notes.push({tone:'bullish',icon:'[~]',title:'MACD 골든크로스 + 모멘텀 회복',text:'하락 모멘텀이 약해지며 방향 전환 초기 신호가 나타납니다. 거래량 증가 동반 여부를 함께 확인하세요.'});
  if(rsi>=72 && macdH>0 && macdPH!=null && macdH<=macdPH) notes.push({tone:'warning',icon:'🌡️',title:'과열 후 모멘텀 둔화',text:'가격은 강하지만 상승 속도는 둔화되고 있습니다. 교과서에서는 이를 단기 익절과 추격 자제 쪽으로 읽습니다.'});
  // S51: 심리도 + RSI 복합
  const psyV=ind.psycho?.psycho??null;
  if(psyV!=null && psyV>=80 && rsi>=70) notes.push({tone:'danger',icon:'[X]',title:'심리도 + RSI 이중 과열',text:`심리도 ${psyV.toFixed(0)}% + RSI ${rsi.toFixed(0)} — 투자 심리와 가격 모멘텀 모두 과열 상태입니다. 교과서에서는 이 조합을 급조정 위험 구간으로 봅니다. 추격 매수는 절대 금물입니다. 분할 익절을 강력히 검토하세요.`});
  if(psyV!=null && psyV<=20 && rsi<=30) notes.push({tone:'bullish',icon:'[O]',title:'심리도 + RSI 이중 과매도',text:`심리도 ${psyV.toFixed(0)}% + RSI ${rsi.toFixed(0)} — 투자 심리와 가격 모멘텀 모두 극단적 침체 구간입니다. 교과서에서는 매도 에너지가 소진된 자리로 보고 기술적 반등을 기대합니다. 거래량 증가·양봉이 함께 오는지 확인하세요.`});
  if(psyV!=null && psyV<=20 && stK<=20 && stK>stD) notes.push({tone:'bullish',icon:'💎',title:'심리도 침체 + Stoch 바닥 반전',text:`심리도 ${psyV.toFixed(0)}%에서 스토캐스틱이 골든크로스했습니다. 교과서에서는 이를 극단적 비관 속 첫 반등 신호로 보고 단기 매수 후보로 다룹니다.`});
  return notes;
};

SXI.compositeTrend = function(ind){
  const notes=[];
  if(!ind) return notes;
  const _adv=ind._advanced||ind;   // [S1319] 원본 층 폴백(SXI.interpretAll L1146과 같은 관용구)
  const _mal=ind.maAlign||_adv.maAlign||{};
  const maArr=_mal.bullish?'bull':_mal.bearish?'bear':'mixed';
  const macdD=ind.macd?.recentDead??ind.macdLegacy?.recentDead;
  const rsi=typeof ind.rsi==="number"?ind.rsi:(ind.rsi?.val??ind.rsiLegacy??50);
  const squeeze=ind.squeeze?.squeeze??ind.bb?.isSqueeze;
  const disp20=ind.maDisparity?.disparity20??ind.maDisparityLegacy?.disparity20??null;
  const swHH=ind.swingStruct?.higherHighs??ind.swingStructLegacy?.higherHighs;
  const swLL=ind.swingStruct?.lowerLows??ind.swingStructLegacy?.lowerLows;
  //  ⚠[S1317] adxV2 선언을 여기로 올렸다 — 아래 '정배열 눌림'이 ADX를 보게 되면서
  //    원래 자리(S51 블록)의 const를 그대로 두면 **TDZ ReferenceError**가 난다(S1234 사고 계열).
  const adxV2=ind.adx?.adx??ind.adx??0;
  //  ★[S1317] '정배열 눌림 구간'에 ADX 게이트 — S1312와 **같은 사고**를 다른 카드에서 반복하고 있었다.
  //    S1312가 레짐 카드에서 저ADX 구간의 '추세 추종' 권유를 걷어냈는데, 이 카드는 ADX를
  //    **아예 보지 않아** 같은 종목·같은 화면에서 반대 조언이 남았다(백로그 #11).
  //    실측(3시장 396종): 추세추종 어휘 노트 5건 중 ADX 게이트 없는 것 2건(이 노트와 '3중 수급 확인'),
  //    두 노트 발동 40건 중 **26건(65%)이 ADX<25** — us AAPL 24.4 · TSLA 17.1 · kr 파마리서치 16.4.
  //    ⇒ 정배열·눌림이라는 **사실은 그대로 두고** 추세 추종 권유만 ADX와 정합시킨다(S1312 문법 이식).
  //    ⚠새 판정을 만들지 않는다 — tone·title·발동 조건 전부 불변이고 문구만 갈린다.
  const _s1317W = adxV2 < 20, _s1317M = adxV2 >= 20 && adxV2 < 25;   // S1312와 같은 경계
  if(maArr==='bull' && disp20!=null && Math.abs(disp20)<=2.5) notes.push({tone:'bullish',icon:'[#]',title:'정배열 눌림 구간',text:
    _s1317W ? `상승 추세(정배열)가 유지되는 가운데 눌림 조정이 진행 중입니다. 다만 ADX ${Math.round(adxV2)}로 추세 강도가 받쳐주지 않아 추세 추종 전제가 서지 않습니다.`
    : _s1317M ? `상승 추세(정배열)가 유지되는 가운데 눌림 조정이 진행 중입니다. 다만 ADX ${Math.round(adxV2)}로 추세 강도가 아직 약해, 추세 추종은 방향이 굳어진 뒤가 맞습니다.`
    : '상승 추세가 유지되는 가운데 눌림 조정이 진행 중입니다. 교과서에서는 이를 추세 추종 관점의 재진입 후보로 봅니다.'});
  if(squeeze && maArr==='bull') notes.push({tone:'bullish',icon:'💥',title:'BB 스퀴즈 + 정배열',text:'변동성이 극도로 수축된 상태에서 상승 추세가 유지되고 있습니다. 교과서에서는 수축 뒤의 상방 돌파를 강한 상승의 출발로 봅니다.'});
  if(macdD && maArr==='bear') notes.push({tone:'danger',icon:'🔻',title:'MACD 데드크로스 + 역배열',text:'모멘텀과 추세가 모두 하락을 가리킵니다. 청산 시점은 미리 정한 규칙대로 판단하세요.'});
  if(swHH && !swLL && rsi>=50 && rsi<=70) notes.push({tone:'bullish',icon:'[#]',title:'상승 스윙 + 적정 RSI',text:'스윙 구조가 상방 정리되면서 RSI도 과열 없이 강세 구간에 있습니다. 교과서에서는 이를 추세가 이어지기 좋은 배치로 봅니다.'});
  // S51: VHF 기반 복합 추세 판단
  const vhfV=ind.vhf?.val??null, vhfT=ind.vhf?.trending;
  // [S1317] adxV2는 위로 올렸다(정배열 눌림 게이트가 먼저 쓴다) — 여기서 재선언하면 SyntaxError
  const eomT=ind.eom?.trend, eomV=ind.eom?.val??0;
  const macdG2=ind.macd?.recentGolden??ind.macdLegacy?.recentGolden;
  if(vhfT==='ranging' && squeeze) notes.push({tone:'warning',icon:'🧨',title:'VHF 횡보 + BB 스퀴즈 → 폭발 임박',text:'VHF가 횡보를 확인하고 볼린저 밴드도 극도로 수축된 상태입니다. 교과서에서는 이를 에너지 축적으로 보고 한 방향 돌파를 예상합니다. 돌파 방향은 이 화면이 예측하지 않습니다.'});
  if(vhfT==='trending' && adxV2>=30 && maArr==='bull') notes.push({tone:'bullish',icon:'🚀',title:'VHF 추세 + ADX 강세 + 정배열',text:`VHF ${vhfV?.toFixed(2)||''}가 추세장을 확인하고, ADX ${Math.round(adxV2)}도 강한 방향성을 보여줍니다. 교과서에서는 추세 추종에 유리한 구간으로 보며 역추세 매매를 경계합니다.`});
  if(vhfT==='trending' && eomT==='bullish' && macdG2) notes.push({tone:'bullish',icon:'[!]',title:'VHF 추세 + EOM 매수 + MACD 골든 → 추세 가속', /* [S452] eomT 'up'→'bullish' (EOM.trend 어휘 일치) */text:'추세 형성(VHF) + 가격 이동 용이(EOM 양수) + 모멘텀 전환(MACD 골든)이 동시에 나타나고 있습니다. 교과서에서는 이 3중 확인을 상승 추세 가속 신호로 봅니다.'});
  if(vhfT==='trending' && adxV2>=30 && maArr==='bear') notes.push({tone:'danger',icon:'🔻',title:'VHF 추세 + ADX 강세 + 역배열 → 강한 하락',text:`VHF와 ADX 모두 강한 방향성을 보이며 MA 역배열 상태입니다. 교과서에서는 이 구간의 반등 매수를 경계합니다.`});
  return notes;
};

SXI.compositeFlow = function(ind){
  const notes=[];
  if(!ind) return notes;
  const _adv=ind._advanced||ind;   // [S1319] 원본 층 폴백(SXI.interpretAll L1146과 같은 관용구)
  const _mal=ind.maAlign||_adv.maAlign||{};
  const maArr=_mal.bullish?'bull':_mal.bearish?'bear':'mixed';
  const obvT=ind.obv?.trend;
  //  ⚠[S1319] `div`(문자열 'bullish'/'bearish')와 `divergence`(불리언)는 **다른 양**이다.
  //    평탄 층 obvLegacy에는 `div`가 없고 `divergence:false`만 있어, 기존 ?? 체인은
  //    폴백이 아니라 **죽은 가지**였다(false는 'bullish'와 영원히 안 맞는다).
  //    ⇒ 원본 층 `div`를 사이에 끼운다. 뒤 가지는 지우지 않는다(S1283).
  const obvDiv=ind.obv?.div??_adv.obv?.div??ind.obv?.divergence;
  const vwapPos=ind.vwap?.position??ind.vwapLegacy?.position;
  const volR=ind.volPattern?.volRatio??_adv.volPattern?.volRatio??1;   // [S1319]
  const _cdl=ind.candle||ind.patterns||ind.patternsLegacy||_adv.candle||{};   // [S1319] interpretAll L1144과 동일 우선순위
  const rsi=typeof ind.rsi==="number"?ind.rsi:(ind.rsi?.val??ind.rsiLegacy??50);
  const bbPctB=ind.bb?.pctB;
  const adxF=ind.adx?.adx??ind.adx??0;   // [S1317] '3중 수급 확인'의 추세추종 게이트용
  if(maArr==='bull' && obvT==='up') notes.push({tone:'bullish',icon:'[^]',title:'정배열 + OBV 상승',text:'추세와 수급이 모두 상승을 가리킵니다. 교과서에서는 이를 건강한 상승 패턴으로 보고 눌림목 매수 구간으로 다룹니다.'});
  if(maArr==='bull' && obvT==='down') notes.push({tone:'warning',icon:'[!]',title:'가격↑ OBV↓ 괴리',text:'가격은 상승하지만 거래량은 빠지고 있습니다. 교과서에서는 이 괴리를 매물 출회 시 급락 위험으로 봅니다.'});
  if(obvT==='up' && maArr!=='bull' && maArr!=='bear') notes.push({tone:'bullish',icon:'[?]',title:'횡보 속 매집 가능성',text:'가격은 정체되어도 누적 거래량 흐름은 개선되고 있습니다. 교과서에서는 이를 큰손의 조용한 매집으로 읽습니다.'});
  if((vwapPos==='above'||vwapPos==='above_far') && volR>=1.5) notes.push({tone:'bullish',icon:'💧',title:'VWAP 상회 + 거래량 유입',text:'단기 평균 매입단가 위에서 거래량까지 붙고 있습니다. 교과서에서는 이를 매수 우위 흐름이 강화되는 자리로 봅니다.'});
  if(obvDiv==='bullish') notes.push({tone:'bullish',icon:'[?]',title:'OBV 상승 다이버전스',text:'가격은 저점을 낮추지만 모멘텀 둔화가 확인됩니다. 교과서에서는 이를 하락 압력이 약해지는 초기 반전 신호로 봅니다.'});
  if(obvDiv==='bearish') notes.push({tone:'bearish',icon:'[?]',title:'OBV 하락 다이버전스',text:'가격 상승 대비 상승 모멘텀이 약해지고 있습니다. 교과서에서는 이를 추세 피로 누적으로 봅니다.'});
  if(volR>=2){
    if(_cdl.bullish) notes.push({tone:'bullish',icon:'🚀',title:'거래량 폭발 + 강세 캔들',text:`거래량이 평소의 ${volR.toFixed(1)}배로 급증하며 양봉이 나왔습니다. 교과서에서는 이런 봉을 큰손 진입 신호로 읽습니다.`});
    if(_cdl.bearish) notes.push({tone:'danger',icon:'💣',title:'거래량 폭발 + 약세 캔들',text:`거래량이 평소의 ${volR.toFixed(1)}배로 급증하며 음봉이 나왔습니다. 교과서에서는 이를 대량 매도 출회로 봅니다.`});
  }
  if(bbPctB!=null && bbPctB<=0.1 && rsi<=35) notes.push({tone:'bullish',icon:'[v]',title:'BB 하단 + RSI 과매도',text:'가격 조정은 이어졌지만 하락 강도는 약해지고 있습니다. 교과서에서는 이를 단기 바닥 탐색 구간으로 봅니다.'});
  // S51: Chaikin + OBV + EOM 3중 수급
  const coV=ind.chaikinOsc?.val??null, coT=ind.chaikinOsc?.trend;
  const eomV2=ind.eom?.val??null, eomT2=ind.eom?.trend;
  //  ★[S1317] '3중 수급 확인' — 두 가지를 함께 고친다.
  //    ① 추세추종 권유에 ADX 게이트가 없었다(S1312가 레짐 카드에서 걷어낸 그 사고).
  //    ② *"가능성이 매우 높으며 … 강력한 매수 확인 신호"* — S1302가 잡은 확률·신뢰도 계열과
  //       **표현이 달라 걸러지지 않은** 근거 없는 강도 주장이다(백로그 #10).
  //    ⇒ 지표 사실은 그대로 두고, 주체를 교과서로 옮기고(S1302 A그룹 문법),
  //      추세 추종 권유는 ADX와 정합시키고, 조합 미측정을 명시한다(S1289).
  if(coV!=null && coV>0 && obvT==='up' && eomV2!=null && eomV2>0) notes.push({tone:'bullish',icon:'[$]',title:'3중 수급 확인 (Chaikin+OBV+EOM)',text:
    `Chaikin Osc 양수(매집) + OBV 상승 + EOM 양수(매수 용이) — 세 가지 수급 지표가 동시에 매수 쪽을 가리킵니다. 교과서에서는 이런 조합을 큰손의 물량 확보로 봅니다. `
    + (adxF >= 25
        ? `추세 추종 관점의 매수 확인 신호로도 봅니다.`
        : `다만 ADX ${Math.round(adxF)}로 추세 강도가 받쳐주지 않아 추세 추종 전제는 서지 않습니다.`)
    + ``});
  if(coV!=null && coV<0 && obvT==='down' && eomV2!=null && eomV2<0) notes.push({tone:'danger',icon:'🚨',title:'3중 수급 이탈 (Chaikin+OBV+EOM)',text:`Chaikin Osc 음수(분산) + OBV 하락 + EOM 음수(매도 용이) — 세 가지 수급 지표가 모두 매도 쪽을 가리킵니다. 교과서에서는 이를 대량 매도 진행으로 봅니다. 비중 조정 시점은 미리 정한 규칙대로 판단하세요.`});
  if(coV!=null && coV>0 && obvT==='up' && maArr!=='bull') notes.push({tone:'bullish',icon:'🔎',title:'Chaikin+OBV 매집 (횡보 중)',text:'가격은 횡보하지만 Chaikin Osc와 OBV 모두 매집을 가리킵니다. 교과서에서는 이를 큰손이 조용히 물량을 확보하는 패턴으로 보고 돌파를 주시합니다.'});
  if(eomV2!=null && eomV2>0.5 && volR>=1.5) notes.push({tone:'bullish',icon:'[#]',title:'EOM 강세 + 거래량 유입',text:`EOM ${eomV2.toFixed(2)}로 가격 이동이 매우 용이한 가운데, 거래량도 평소의 ${volR.toFixed(1)}배로 증가했습니다. 교과서에서는 이를 매수 쪽이 적은 힘으로 가격을 올리는 상태로 봅니다.`});
  if(eomV2!=null && eomV2<-0.5 && volR>=1.5) notes.push({tone:'danger',icon:'💥',title:'EOM 약세 + 거래량 급증',text:`EOM ${eomV2.toFixed(2)}로 하락이 용이한 가운데, 거래량이 ${volR.toFixed(1)}배로 급증했습니다. 교과서에서는 이를 매도 우위 흐름으로 봅니다.`});
  return notes;
};

SXI.compositeRisk = function(ind){
  const notes=[];
  if(!ind) return notes;
  const rsi=typeof ind.rsi==="number"?ind.rsi:(ind.rsi?.val??ind.rsiLegacy??50);
  const bbPctB=ind.bb?.pctB;
  const atrR=ind.atr?.ratio??ind.atr?.pct??0;
  const adxV=ind.adx?.adx??ind.adx??0;
  const _adv=ind._advanced||ind;   // [S1319] 원본 층 폴백(SXI.interpretAll L1146과 같은 관용구)
  const _mal=ind.maAlign||_adv.maAlign||{};
  const maArr=_mal.bullish?'bull':_mal.bearish?'bear':'mixed';
  //  [S1319] 5번째 다리 — `trend.struct`는 **_advanced에만** 있다. 평탄층에서는 뒤의
  //    priceChannel 분기로 떨어지는데 그건 **다른 양**이다(상단 절반 어디든 참 = 훨씬 느슨).
  //    노트가 말하는 '상단 저항이 가깝다'는 trend.struct.nearResistance 쪽이다. 프록시는 남긴다(S1283).
  const nearR=ind.trend?.struct?.nearResistance??_adv.trend?.struct?.nearResistance??(ind.priceChannel?.position==='upper_half'||ind.priceChannel?.position==='breakout_up')??false;
  const volR=ind.volPattern?.volRatio??_adv.volPattern?.volRatio??1;   // [S1319]
  const vwapPos=ind.vwap?.position??ind.vwapLegacy?.position;
  const macdH=ind.macd?.hist??ind.macd?.histogram??0;
  const macdPH=ind.macd?.prevHist??null;
  if(rsi>=75 && bbPctB!=null && bbPctB>=0.95) notes.push({tone:'danger',icon:'🌡️',title:'이중 과열 (RSI+BB)',text:'RSI와 볼린저 상단이 동시에 과열 구간입니다. 교과서에서는 이를 급락 위험 구간으로 봅니다. 비중 조정 시점은 미리 정한 규칙대로 판단하세요.'});
  if(atrR>=4 && adxV>=30) notes.push({tone:'warning',icon:'[!]',title:'강한 추세 + 큰 흔들림',text:'추세는 강하지만 흔들림도 큰 구간입니다. 같은 폭이 수익 쪽으로도 손실 쪽으로도 빠르게 움직입니다 — 교과서에서는 이런 구간의 비중을 줄여 잡습니다.'});
  if(nearR && volR<0.8) notes.push({tone:'warning',icon:'🚧',title:'저항 앞 힘 약화',text:'상단 저항은 가까운데 거래량이 약합니다. 교과서에서는 이럴 때 돌파보다 눌림이나 실패 가능성도 함께 열어둡니다.'});
  if((vwapPos==='below'||vwapPos==='below_far') && macdH<0 && macdPH!=null && macdH<macdPH) notes.push({tone:'bearish',icon:'[v]',title:'반등보다 하방 우위',text:'단기 평균단가 아래에서 하락 모멘텀까지 강화되고 있습니다. 교과서에서는 이 구간의 반등을 기술적 반등으로 보수적으로 다룹니다.'});
  if(adxV>=35 && maArr==='bear') notes.push({tone:'danger',icon:'[!]',title:'강한 하락 추세 (ADX '+Math.round(adxV)+')',text:'ADX가 높고 역배열 상태입니다. 교과서에서는 이 구간을 신규 매수에 불리한 자리로 봅니다.'});
  // S51: AB Ratio + 심리도 복합 위험
  const abR=ind.abRatio?.ratio??null, abT=ind.abRatio?.trend;
  const psyR=ind.psycho?.psycho??null;
  if(abR!=null && abR>=1.8 && psyR!=null && psyR>=80) notes.push({tone:'danger',icon:'[X]',title:'AB Ratio 극단 매수 + 심리도 과열',text:`AB Ratio ${abR.toFixed(2)}(강한 매수세) + 심리도 ${psyR.toFixed(0)}%(과열) — 매수 열기가 극에 달했습니다. 장중 고가를 적극적으로 높이는 매수세와 과도한 낙관이 겹쳐, 급격한 차익실현 매물이 쏟아질 위험이 있습니다.`});
  if(abR!=null && abR<=0.55 && psyR!=null && psyR<=20) notes.push({tone:'bullish',icon:'[O]',title:'AB Ratio 극단 매도 + 심리도 침체',text:`AB Ratio ${abR.toFixed(2)}(강한 매도세) + 심리도 ${psyR.toFixed(0)}%(과매도) — 교과서에서는 매도 에너지가 소진 직전인 자리로 보고, 양봉 + 거래량 증가가 함께 오면 바닥 반전 후보로 다룹니다.`});
  if(abT==='bearish' && rsi>=70) notes.push({tone:'warning',icon:'[!]',title:'AB 매도 우위인데 RSI 과매수',text:'가격은 아직 높지만 장중 매도 압력이 매수를 압도하고 있습니다. 고점에서의 물량 분산가 시작되었을 가능성이 있으며, 윗꼬리 음봉 출현에 주의하세요.'});
  return notes;
};

//  ══════ ★★[S1317 발견 → S1319 조치] 이 다섯 함수는 지표를 **잘못된 층에서** 읽고 있었다 ══════
//    `calcIndicators`의 최상위는 **Legacy 뷰**이고(`rsi: ind.rsi.val` · `macd: ind.macdLegacy` …),
//    원본 `calcAllScreener` 결과는 `_advanced`에 통째로 들어 있다.
//    ⚠★두 층은 **상호 보완**이다 — 한쪽이 상위집합이 아니다(잎 44경로 전수 대조):
//        평탄층에만: `macd.prevHist` · `macd.recentGolden/Dead` · `atr.ratio` · `bb.isSqueeze`
//        _advanced만: `maAlign.*` · `candle.*` · `volPattern.volRatio` · `obv.div` · `trend.struct.*`
//      ⇒ **`SXI.composite(ind._advanced)` 통째 교체는 틀린 답이다** — `macd.prevHist`가 없어
//        MACD 계열이 이번엔 반대로 죽는다(통째 867 < 다리 놓기 911). S1317 인수인계가 *"한 줄이면
//        된다"* 고 적은 것은 **틀렸고 여기 기록해 둔다.**
//    ⇒ 끊긴 5곳에만 다리를 놓았다(`SXI.interpretAll` L1146이 이미 쓰던 관용구 `ind.X || _adv.X`):
//        maAlign · candle · volPattern.volRatio · obv.div · trend.struct.nearResistance
//    ★기존 `??` 체인은 원래 두 형태를 다 받으려고 쓴 것이다(`ind.macd?.hist ?? ind.macd?.histogram`).
//      그 체인이 이미 다리를 놓은 곳(squeeze↔bb.isSqueeze · atr.ratio↔pct 등)은 건드리지 않았다.
//    ⚠`obv.div`(문자열)와 `obv.divergence`(불리언)는 **다른 양**이라 기존 체인은 죽은 가지였다.
//    실측 결과(3시장 396종): 발동 705→911 · 노출 노트 23→**42종** · tone 고아 58→**0** · 3컷 잘림 29→59.
//    ⚠판정(verdictAction) 영향 0 — 이 다섯 함수는 서술 전용이고 판정 축에 들어가지 않는다.
SXI.composite = function(ind){
  return [...SXI.compositeMomentum(ind),...SXI.compositeTrend(ind),...SXI.compositeFlow(ind),...SXI.compositeRisk(ind),...SXI.compositeSynergy(ind)];
};

// ════════════════════════════════════════════════════════════
//  S51: 계열 횡단 시너지 해석
//  서로 다른 계열의 지표가 동시에 가리키는 고급 조합
// ════════════════════════════════════════════════════════════
SXI.compositeSynergy = function(ind){
  const notes=[];
  if(!ind) return notes;
  const vhfT=ind.vhf?.trending, vhfV=ind.vhf?.val??0;
  const squeeze=ind.squeeze?.squeeze??ind.bb?.isSqueeze;
  const psyV=ind.psycho?.psycho??null;
  const eomV=ind.eom?.val??null, eomT=ind.eom?.trend;
  const coV=ind.chaikinOsc?.val??null;
  const obvT=ind.obv?.trend;
  const abT=ind.abRatio?.trend, abR=ind.abRatio?.ratio??null;
  const rsi=typeof ind.rsi==='number'?ind.rsi:(ind.rsi?.val??ind.rsiLegacy??50);
  const _adv=ind._advanced||ind;   // [S1319] 원본 층 폴백(SXI.interpretAll L1146과 같은 관용구)
  const _mal=ind.maAlign||_adv.maAlign||{};
  const maArr=_mal.bullish?'bull':_mal.bearish?'bear':'mixed';
  const macdG=ind.macd?.recentGolden??ind.macdLegacy?.recentGolden;
  const adxV=ind.adx?.adx??ind.adx??0;
  const bbW=ind.bb?.width??null;

  // 1. 에너지 축적 폭발 대기: VHF 횡보 + 심리도 중립 + BB 스퀴즈
  if(vhfT==='ranging' && squeeze && psyV!=null && psyV>=35 && psyV<=65)
    notes.push({tone:'warning',icon:'🧨',title:'에너지 축적 → 폭발 대기',text:`VHF 횡보 + BB 스퀴즈 + 심리도 ${psyV.toFixed(0)}%(중립) — 추세도 심리도 방향을 정하지 못한 채 변동성만 극도로 수축되어 있습니다. 교과서에서는 축적된 에너지가 촉매(실적·뉴스·수급) 하나로 풀린다고 봅니다. 돌파 방향은 이 화면이 예측하지 않습니다.`});

  // 2. 바닥 반전 초기 신호: 심리도 과매도 + AB Ratio 매수 전환
  if(psyV!=null && psyV<=25 && abT==='bullish')
    notes.push({tone:'bullish',icon:'🌱',title:'심리도 침체 + AB 매수 전환 → 바닥 반전 초기',text:`심리도 ${psyV.toFixed(0)}%(과매도) 상태에서 AB Ratio가 매수 우위로 전환되었습니다. 교과서에서는 매도 에너지가 소진된 자리에서 장중 매수세가 살아나는 첫 신호로 봅니다. RSI 반등·거래량 증가가 함께 오는지 확인하세요.`});

  // 3. 고점 분배 경고: 심리도 과매수 + AB Ratio 매도 전환
  if(psyV!=null && psyV>=75 && abT==='bearish')
    notes.push({tone:'danger',icon:'[X]',title:'심리도 과열 + AB 매도 전환 → 고점 분배',text:`심리도 ${psyV.toFixed(0)}%(과매수) 상태에서 AB Ratio가 매도 우위로 전환되었습니다. 과열된 낙관 속에서 장중 매도 압력이 커지고 있어, 세력(큰손)이 물량을 던지기 시작했을 가능성이 있습니다. 분할 익절을 강력히 검토하세요.`});

  // 4. 완전 상승 확신: 정배열 + VHF 추세 + EOM 매수 + Chaikin 매집 + OBV 상승
  if(maArr==='bull' && vhfT==='trending' && eomV!=null && eomV>0 && coV!=null && coV>0 && obvT==='up')
    notes.push({tone:'bullish',icon:'🏆',title:'5중 상승 확인 (추세+수급+모멘텀)',text:'MA 정배열 + VHF 추세장 + EOM 매수 용이 + Chaikin 매집 + OBV 상승 — 다섯 축이 모두 상승을 가리킵니다. 교과서에서는 이런 정렬을 강한 컨플루언스로 봅니다.'});

  // 5. 완전 하락 경고: 역배열 + VHF 추세 + EOM 매도 + Chaikin 분산 + OBV 하락
  if(maArr==='bear' && vhfT==='trending' && eomV!=null && eomV<0 && coV!=null && coV<0 && obvT==='down')
    notes.push({tone:'danger',icon:'☠️',title:'5중 하락 경고 (추세+수급+모멘텀)',text:'MA 역배열 + VHF 추세장 + EOM 매도 용이 + Chaikin 분산 + OBV 하락 — 다섯 축이 모두 하락을 가리킵니다. 청산 시점은 미리 정한 규칙대로 판단하세요.'});

  // 6. 횡보 중 방향 탐색: VHF 횡보 + EOM 방향 전환
  if(vhfT==='ranging' && eomV!=null && Math.abs(eomV)>0.3){
    if(eomT==='bullish') notes.push({tone:'bullish',icon:'[?]',title:'횡보 속 EOM 매수 신호',text:`VHF 횡보장이지만 EOM ${eomV.toFixed(2)}로 매수 쪽 이동이 용이해지고 있습니다. 교과서에서는 이를 박스권 상방 돌파의 선행 신호로 보고 BB 상단을 함께 봅니다.`});
    if(eomT==='bearish') notes.push({tone:'bearish',icon:'[?]',title:'횡보 속 EOM 매도 신호',text:`VHF 횡보장이지만 EOM ${eomV.toFixed(2)}로 하락 쪽 이동이 용이해지고 있습니다. 교과서에서는 이를 박스권 하방 이탈의 선행 신호로 보고 BB 하단·지지선을 함께 봅니다.`});
  }

  // 7. 추세 전환 수렴: MACD 골든 + EOM 양수 전환 + AB 매수 전환 (비추세 구간)
  if(macdG && eomV!=null && eomV>0 && abT==='bullish' && vhfT!=='trending')
    notes.push({tone:'bullish',icon:'[~]',title:'3중 전환 신호 (MACD+EOM+AB)',text:'MACD 골든크로스 + EOM 양수 전환 + AB Ratio 매수 우위 — 세 축이 동시에 전환되고 있습니다. 교과서에서는 이를 추세 형성 초기 신호로 보고 VHF 상승 확인을 함께 봅니다.'});

  // 8. BB 확대 + VHF 추세 형성: 변동성 확장 확인 — [S979] maArr 방향 가드 (하락 추세에 "추종 적합" 오표기 수정)
  //  ⚠[S1319] `bb.width`는 **이미 % 단위**(실측 15~90)인데 표기에서 ×100을 또 해
  //    'BB 폭 3077.8%'가 나갔다. 같은 파일 L496(레짐 서술)은 곱하지 않고 쓴다 — 그쪽이 맞다.
  //    ⚠배선 결함(maAlign)에 가려 이 세 분기가 화면에 나간 적이 없어 오래 안 보였다.
  //    ⚠문턱 `bbW>0.1`은 % 단위에서 사실상 상시 참이다 — **문턱은 건드리지 않는다**(발동 조건
  //      변경은 판정 변경이고 이 세션 선언 밖이다 · S1282). 표기만 고친다. 백로그로 넘긴다.
  if(vhfT==='trending' && bbW!=null && bbW>0.1 && adxV>=25){
    if(maArr==='bear')
      notes.push({tone:'danger',icon:'📢',title:'변동성 확장 + 하락 추세',text:`VHF 추세장 + BB 폭 ${bbW.toFixed(1)}% + ADX ${Math.round(adxV)} — BB 스퀴즈가 풀리며 추세가 시작됐고 방향은 아래쪽(역배열)이에요. 추세 추종은 곧 매도 방향이라, 교과서에서는 이 구간의 신규 매수를 피합니다.`});
    else if(maArr==='bull')
      notes.push({tone:'bullish',icon:'📢',title:'변동성 확장 + 상승 추세',text:`VHF 추세장 + BB 폭 ${bbW.toFixed(1)}% + ADX ${Math.round(adxV)} — BB 스퀴즈가 풀리며 추세가 시작됐고 방향은 위쪽(정배열)이에요. 교과서에서는 이 구간을 추세 추종 진입 자리로 봅니다.`});
    else
      notes.push({tone:'neutral',icon:'📢',title:'변동성 확장 + 추세 형성',text:`VHF 추세장 + BB 폭 ${bbW.toFixed(1)}% + ADX ${Math.round(adxV)} — BB 스퀴즈가 풀리며 추세가 형성 중이나 방향(정/역배열)이 아직 뚜렷하지 않아요. 방향 확인 후 대응하세요.`});
  }

  return notes;
};

// ════════════════════════════════════════════════════════════
//  3단계: 종합평 생성 (v2.0 확장)
//  반환: tone, mainText, keyReasons, risks, composites,
//        stateLine, actionGuide, invalidation, buyTrigger
// ════════════════════════════════════════════════════════════

//  S103-fix7 Phase3-B-3: summary에 verdictAction 6번째 파라미터 추가 — 보유중 5종(보유유지/청산준비/청산검토/즉시청산/매도완료)일 때 stateLine 보유자 맥락으로 재작성, actionGuide/buyTrigger는 비보유자용이라 숨김. 비보유 4종(매수/관심/관망/회피)은 기존 그대로 유지.
// [S223] v3.0 6분류 구도 마지막 칸 — 서머리 27조합 (C × 레짐) 통합
//   ① 시그니처 7번째 파라미터 regime 추가 — qs.regime 객체({direction:UP/DOWN/FLAT, adx, bbWidth, label})를 받아 mainText 끝에 1문장 레짐 컨텍스트를 자연스럽게 덧붙임
//   ② 27조합 = 9 verdictAction × 3 regime direction(UP/DOWN/FLAT)
//   ③ 비파괴적 설계 — 기존 9분류 stateLine/mainText는 보존, 레짐 컨텍스트는 mainText 뒤에 부착만 함
//   ④ verdictAction 미지정(action 4종 분기로 빠진 경우)에도 레짐 컨텍스트는 동일하게 적용 (action을 verdictAction과 매핑)
//   ⑤ regime 미지정/null 시 컨텍스트 부착 생략 (역호환성 보장 — 호출자가 6번째 인자 누락해도 정상 동작)
//
//  레짐 컨텍스트 보정 헬퍼 — verdictAction × regime.direction의 27조합을 mainText 뒤에 자연스럽게 덧붙임
//  ════ [S1312] ★'시장 레짐'이 한 화면에서 두 값으로 읽혔다 — 축 이름 정합 ════
//    실사례(삼성전자): 레짐 카드는 "전환기 · 추세 전환 초기"인데 참고사항은 "시장 레짐은 상승 추세입니다".
//                (JPMorgan): 레짐 카드 "횡보·무추세"인데 핵심 이유는 "상승 추세가 유지되는 가운데".
//    ★모순이 아니다 — `MarketRegime.detect`가 내는 **두 축이 직교**한다:
//        `label`     = ADX·BB폭 → 추세+변동 / 추세장 / 횡보장 / 전환기   ← **강도·변동성 축**
//        `direction` = DI·MA배열·기울기 → UP / DOWN / FLAT              ← **방향 축**
//      "전환기(강도 약)이면서 방향은 UP"은 정상 상태다.
//    ⚠그런데 화면이 **둘 다 "시장 레짐"이라 불러** 사용자에게 모순으로 보였다.
//      이번 세션의 '단기'(5·10·20 vs 5·20·60 · S1310)와 **같은 병**이다 — 한 이름이 두 축을 가리킨다.
//    ⇒ 이 함수의 문구에서 축을 명시한다: "시장 레짐" → "레짐 **방향**". 값·판정·분기 무변경.
SXI._attachRegimeContext = function(verdictAction, regime){
  if(!regime || !regime.direction) return '';
  const dir = regime.direction; // 'UP' | 'DOWN' | 'FLAT'
  // verdictAction 미지정 시 빈 문자열 (action 4종 분기로 들어온 비보유 케이스도 verdictAction이 채워져 있어야 함)
  if(!verdictAction) return '';
  // 27조합 멘트 — 각 9분류 × 3 레짐방향에 맞춘 1문장 컨텍스트
  const M = {
    '매수': {
      UP:   ' 레짐 방향은 상승입니다(강도·변동성은 위 레짐 카드 참조). 레짐이 판정 적중을 높인다는 측정은 없습니다(원장 추세신호 3시장 측정 미달).',
      DOWN: ' 다만 레짐 방향은 하락이라 추세 역방향 진입에 해당하므로, 비중을 줄이고 손절 기준을 더 엄격히 적용하세요.',
      FLAT: ' 레짐 방향이 횡보라 큰 추세 추진력은 기대하기 어렵습니다. 박스권 상단 저항을 함께 확인하세요.'
    },
    '관심': {
      UP:   ' 레짐 방향이 상승이므로 진입 트리거 발동 시 추세 동조 효과를 기대할 수 있습니다.',
      DOWN: ' 레짐 방향이 하락이라 트리거가 나오더라도 단기 반등에 그칠 가능성이 있으니, 관망 비중을 늘리는 편이 안전합니다.',
      FLAT: ' 레짐 방향은 횡보입니다(강도·변동성은 위 레짐 카드 참조). 레짐이 트리거 적중을 낮춘다는 측정은 없습니다(원장 추세신호 3시장 측정 미달). 거래량 동반 돌파 확인 후 진입을 고려하세요.'
    },
    '관망': {
      UP:   ' 레짐 방향은 상승이지만 종목 자체 신호가 부족합니다. 동일 섹터 강세주로 시야를 넓혀보는 것도 방법입니다.',
      DOWN: ' 레짐 방향도 하락이라 관망이 가장 적절한 선택입니다. 추세 전환 신호가 나올 때까지 기다리세요.',
      FLAT: ' 레짐 방향도 횡보라 관망이 정석입니다. 박스권 돌파 또는 추세 형성 신호를 기다리세요.'
    },
    '회피': {
      UP:   ' 레짐 방향은 상승이지만 이 종목은 회피 대상입니다. 추세를 따라가려면 다른 강세주로 종목을 바꾸세요.',
      DOWN: ' 레짐 방향도 하락이라 회피 판정이 더욱 분명합니다. 신규 진입은 위험합니다.',
      FLAT: ' 레짐 방향이 횡보임에도 회피 신호가 나온 것은 종목 고유 위험이 누적된 결과입니다. 진입을 자제하세요.'
    },
    '보유 유지': {
      UP:   ' 레짐 방향은 상승입니다. 레짐이 보유 성과를 높인다는 측정은 없습니다(원장 추세신호 3시장 측정 미달).',
      DOWN: ' 다만 레짐 방향은 하락이므로, 익절 목표를 보수적으로 잡고 트레일링 스톱을 좁혀두는 편이 안전합니다.',
      FLAT: ' 레짐 방향이 횡보라 큰 추가 상승은 기대하기 어렵습니다. 박스권 상단 근접 시 부분 익절도 고려하세요.'
    },
    '청산 준비': {
      UP:   ' 레짐 방향이 상승이라 약화 신호가 단기 조정에 그칠 수도 있으니, 즉시 청산보다는 분할 익절로 대응하세요.',
      DOWN: ' 레짐 방향도 하락입니다. 레짐이 약화 신호 적중을 높인다는 측정은 없습니다(원장 추세신호 3시장 측정 미달). 청산 시점을 앞당기는 것을 적극 검토하세요.',
      FLAT: ' 레짐 방향이 횡보라 추세 회복 동력이 부족합니다. 박스권 하단 이탈 전 비중 축소를 권장합니다.'
    },
    '청산 검토': {
      UP:   ' 레짐 방향은 상승이지만 종목 지표가 명확히 악화된 상태입니다. 종목 고유 약세이므로 보유 유지 명분이 약합니다.',
      DOWN: ' 레짐 방향도 하락이라 청산 명분이 매우 분명합니다. 손절 기준을 즉시 점검하고 실행하세요.',
      FLAT: ' 레짐 방향이 횡보라 추세 반전 기대도 약합니다. 청산 후 재진입 기회를 노리는 편이 효율적입니다.'
    },
    '즉시 청산': {
      UP:   ' 레짐 방향이 상승임에도 매도 신호가 나온 것은 종목 고유 약세가 매우 강하다는 뜻입니다. 신호대로 즉시 실행하세요.',
      DOWN: ' 레짐 방향도 하락입니다. 레짐이 매도 신호 적중을 높인다는 측정은 없습니다(원장 추세신호 3시장 측정 미달). 청산 시점은 미리 정한 규칙대로 판단하세요.',
      FLAT: ' 레짐 방향이 횡보임에도 매도 신호가 발생했습니다. 박스권 이탈 가능성이 있으니 신호대로 실행하세요.'
    },
    '매도 완료': {
      UP:   ' 레짐 방향이 상승이라 동일 섹터 다른 강세주로 자금을 회전하면 추세 동조 수익을 노릴 수 있습니다.',
      DOWN: ' 레짐 방향이 하락이라 청산 후 재진입을 서두르지 마세요. 시장 회복 신호 확인 후 접근이 안전합니다.',
      FLAT: ' 레짐 방향이 횡보라 새로운 추세 형성 시점까지 현금 비중을 유지하는 것도 좋은 전략입니다.'
    }
  };
  const row = M[verdictAction];
  if(!row) return '';
  return row[dir] || '';
};

SXI.summary = function(action, score, reasons, ind, verdictAction, regime){
  const composites = SXI.composite(ind);
  const keyReasons = composites.filter(c=>c.tone==='bullish'||c.tone==='bearish').slice(0,3);
  const risks = composites.filter(c=>c.tone==='danger'||c.tone==='warning');
  let tone='neutral',mainText='',stateLine='',actionGuide='',invalidation='',buyTrigger='';
  const maArr=ind?.maAlign?.bullish?'bull':ind?.maAlign?.bearish?'bear':'mixed';
  const vwapPos=ind?.vwap?.position??ind?.vwapLegacy?.position??'';
  const swHH=ind?.swingStruct?.higherHighs??ind?.swingStructLegacy?.higherHighs;

  // S103-fix7 Phase3-B-3: 보유중 5종 먼저 처리 (비보유 BUY/SELL/HOLD 분기보다 우선)
  //   _svVerdict.action이 보유 맥락이면 종합평도 보유자 관점으로 전환
  const _isHolding = verdictAction && ['보유 유지','청산 준비','청산 검토','즉시 청산','매도 완료'].includes(verdictAction);

  if(_isHolding){
    // 보유중 맥락 — 비보유자용 actionGuide/buyTrigger는 숨김, stateLine/invalidation만 보유자 관점
    switch(verdictAction){
      case '보유 유지':
        tone='bullish';
        stateLine='보유 중 · 지표 양호';
        mainText='보유 중인 포지션의 지표가 양호합니다. 중복된 판정은 상단 배너와 "이 결과를 어떻게 활용할까요?"를 참고하세요.';
        invalidation='MA20 또는 주요 지지선 이탈 시 보유 판정이 약화될 수 있습니다.';
        break;
      case '청산 준비':
        tone='neutral';
        stateLine='보유 중 · 지표 약화 신호';
        mainText='보유 중이지만 모멘텀이 약해지고 있습니다. 상단 판정과 실전 가이드를 함께 참고하세요.';
        invalidation='지표가 다시 개선되면 보유 지속이 가능합니다. 반대로 지지선 이탈 시 "매도 검토" 단계로 격상될 수 있습니다.';
        break;
      case '청산 검토':
        tone='bearish';
        stateLine='보유 중 · 지표 악화';
        mainText='보유 중인 종목의 지표가 명확히 악화되었습니다. 매도 계획 실행을 검토할 단계입니다.';
        invalidation='주요 지지선 회복 + 거래량 동반 양봉 출현 시 회복 가능성이 있습니다.';
        break;
      case '즉시 청산':
        tone='bearish';
        stateLine='매도 신호 발생';
        mainText='분석 엔진이 매도 신호를 확인했습니다. 계획대로 매도를 실행하는 것이 이 엔진의 규칙입니다.';
        invalidation='신호 이후에도 분석 지표가 강하게 반등하면 재진입 기회를 볼 수 있으나, 규칙 우선이 원칙입니다.';
        break;
      case '매도 완료':
        tone='bearish';
        stateLine='매도 체결 완료';
        mainText='이 종목의 매매 사이클이 완료되었습니다. 상단 배너의 익절/손절 결과를 확인하세요.';
        invalidation='';
        break;
    }
    // 보유중에는 actionGuide, buyTrigger 숨김 (비보유자 관점 메시지라 혼란 유발)
    actionGuide='';
    buyTrigger='';
    if(reasons && reasons.length) mainText+=' 단, 안전필터에서 '+reasons.join(', ')+' 조건이 감지되어 주의가 필요합니다.';
    // [S223] 27조합 — 보유중 verdictAction × regime.direction 컨텍스트 부착
    mainText += SXI._attachRegimeContext(verdictAction, regime);
    return {tone,mainText,keyReasons,risks,composites,stateLine,actionGuide,invalidation,buyTrigger};
  }

  // 비보유 (매수/관심/관망/회피) 또는 verdictAction 미지정 — 기존 BUY/SELL/HOLD 분기 유지
  if(action==='BUY'){
    tone='bullish';
    if(score>=75){stateLine='강한 상승 우위 구간';mainText='여러 지표가 상승을 지지하고 있습니다. 다만 추격 진입보다는 구조상 지지 확인이 함께 나오면 더 안정적입니다.';actionGuide='추세 방향 보유 유지가 유리하며, 눌림 시 분할 추가 매수 고려 가능합니다.';}
    else if(score>=65){stateLine='매수 우위 구간';mainText='매수 우위 흐름이지만 확신 구간은 아닙니다. 거래량과 추세 지속 여부를 함께 확인하세요.';actionGuide='분할 진입이 적절하며, 한 번에 풀 비중 진입은 피하세요.';}
    else{stateLine='약한 매수 신호';mainText='조건부 진입이 가능하지만, 손절 기준을 명확히 설정하고 소액으로 접근하세요.';actionGuide='소액 분할 진입 후 추세 확인 시 추가 진입을 고려하세요.';}
    invalidation=(vwapPos==='above'||vwapPos==='above_far')?'VWAP 이탈 또는 최근 스윙 저점 이탈 시 매수 해석이 약화됩니다.':'MA20 이탈 또는 직전 저점 이탈 시 매수 해석이 약화됩니다.';
    buyTrigger='거래량 증가 + 저항 돌파가 나오면 매수 해석이 강화됩니다.';
  } else if(action==='SELL'){
    tone='bearish';
    if(score<=25){stateLine='강한 하락 우위 구간';mainText='여러 지표가 하락을 가리키고 있으며, 보유 중이면 손절 또는 비중 축소를 적극 검토하세요.';actionGuide='보유 중이면 손절 기준을 반드시 지키고, 미보유면 관망하세요.';}
    else if(score<=35){stateLine='매도 우위 구간';mainText='추세가 하락으로 전환되고 있으며, 신규 매수를 자제하고 기존 포지션을 점검하세요.';actionGuide='추가 매수를 자제하고, 반등 시 비중 축소를 고려하세요.';}
    else{stateLine='약한 매도 신호';mainText='즉각적인 매도보다는 추이를 지켜보되, 추가 하락에 대비한 손절 기준을 설정하세요.';actionGuide='손절 기준을 확인하고 추세 악화 시 비중 축소를 준비하세요.';}
    invalidation='주요 이평선 회복 또는 거래량 동반 양봉 출현 시 매도 해석이 약화됩니다.';
    buyTrigger='';
  } else {
    tone='neutral';
    if(score>=55){stateLine=maArr==='bull'?'상승 추세 내 눌림 조정 구간':'약한 매수 우위';mainText='추세는 아직 살아 있고 수급도 크게 무너지지 않았습니다. 다만 저항 인접 여부와 거래량 회복을 함께 확인해야 합니다.';actionGuide=swHH?'추격 진입보다 MA20 또는 VWAP 재지지 확인 후 분할 접근이 유리합니다.':'추세 확인 후 소액 분할 접근을 고려하세요.';}
    else if(score>=45){stateLine='중립 구간';mainText='매수/매도 어느 쪽도 우위가 아닙니다. 다음 방향 결정을 기다리는 것이 현명합니다.';actionGuide='신규 진입을 보류하고, 방향이 정리된 후 접근하세요.';}
    else{stateLine='약한 매도 우위';mainText='약간 매도 우위지만 추세가 확정되지 않았습니다. 보유 중이면 손절 기준을 확인하세요.';actionGuide='보유 중이면 손절 기준을 점검하고, 미보유면 관망하세요.';}
    invalidation=maArr==='bull'?'VWAP 이탈 또는 최근 스윙 저점 이탈 시 눌림목 해석은 약화됩니다.':'추가 하락 시 매도 전환 가능성을 열어두세요.';
    buyTrigger='거래량 증가 + 저항 돌파가 나오면 BUY 전환 가능성이 높아집니다.';
  }
  if(reasons && reasons.length) mainText+=' 단, 안전필터에서 '+reasons.join(', ')+' 조건이 감지되어 주의가 필요합니다.';
  // [S223] 27조합 — 비보유 verdictAction × regime.direction 컨텍스트 부착
  //   verdictAction 미지정 시 action(BUY/SELL/HOLD) + score를 기반으로 4종(매수/관심/관망/회피) 폴백 매핑
  let _vaForRegime = verdictAction;
  if(!_vaForRegime){
    if(action==='BUY')      _vaForRegime = (score>=65) ? '매수' : '관심';
    else if(action==='SELL') _vaForRegime = (score<=25) ? '회피' : '관망';
    else                     _vaForRegime = '관망';
  }
  mainText += SXI._attachRegimeContext(_vaForRegime, regime);
  return {tone,mainText,keyReasons,risks,composites,stateLine,actionGuide,invalidation,buyTrigger};
};

// ════════════════════════════════════════════════════════════
//  S49 신규: 5개 해석 함수
// ════════════════════════════════════════════════════════════

SXI.eom = function(eom){
  if(!eom||eom.val==null) return null;
  const v=eom.val, sma=eom.sma, t=eom.trend, cr=eom.cross;
  if(cr==='golden' && v>0) return {label:'골든크로스 (양수)',tone:'bullish',text:`EOM ${v.toFixed(2)} — SMA 위로 골든크로스하며 양수 영역입니다. 거래량 대비 가격 이동이 매우 용이한 구간으로, 적은 거래량으로도 가격이 쉽게 상승할 수 있습니다. 이는 매수세가 효율적으로 가격을 끌어올리고 있다는 의미이며, MA 정배열·MACD 양수와 함께 나타나면 추세 가속 구간입니다. 거래량이 동반 증가하면 상승 모멘텀이 더욱 강화됩니다.`};
  if(cr==='golden') return {label:'골든크로스 (음수권)',tone:'bullish',text:`EOM ${v.toFixed(2)} — 아직 음수권이지만 SMA를 상향 돌파했습니다. 하락 저항이 완화되기 시작하는 초기 신호이며, 제로선 돌파를 확인하면 본격적인 매수 전환 근거가 됩니다. RSI 과매도 반등이나 MACD 골든크로스와 동시 발생 시 반전 교과서에서는 신뢰도가 크게 높아진다고 봅니다.`};
  if(cr==='dead' && v<0) return {label:'데드크로스 (음수)',tone:'bearish',text:`EOM ${v.toFixed(2)} — SMA 아래로 데드크로스하며 음수 영역입니다. 가격 하락이 쉽게 이루어지는 구간으로, 매도 압력이 효율적으로 작용하고 있습니다. 거래량이 증가하면서 EOM이 더 깊은 음수로 향하면 하락 가속 경고입니다. 신규 매수를 자제하고, 보유 중이면 비중 축소를 검토하세요.`};
  if(cr==='dead') return {label:'데드크로스 (양수권)',tone:'bearish',text:`EOM ${v.toFixed(2)} — 아직 양수권이지만 SMA를 하향 돌파했습니다. 상승 용이도가 약화되기 시작하는 초기 경고이며, 제로선을 하향 돌파하면 매도세가 주도권을 가지게 됩니다. 추격 매수를 자제하고 기존 포지션은 손절 기준을 점검하세요.`};
  // [S452] 기존 t==='up'/'down'은 EOM.trend('bullish'/'bearish'/'mixed')와 어휘가 달라 항상 죽은 가지 → cross 없으면 무조건 아래 '중립'으로 떨어짐.
  //   전광판 도넛·EOM 행 라벨과 동일하게 score100(상대 z) 기준으로 통일 → 세 표시가 항상 일치. (score100 누락 시 val 부호 폴백)
  const _es = (typeof eom.score100==='number') ? eom.score100 : (v>0?70:v<0?30:50);
  if(_es>=85) return {label:'강한 매수세',tone:'bullish',text:`EOM ${v.toFixed(2)} — 강한 양수로, 거래량 대비 가격 상승이 매우 용이합니다. 매수 세력이 효율적으로 가격을 견인하고 있으며, 추세 추종 전략에 유리한 구간입니다. BB 상단 확장·ADX 상승과 함께라면 상승 추세가 건강합니다. EOM이 피크 후 꺾이기 시작하면 모멘텀 둔화 초기 신호로 주의하세요.`};
  if(_es>=65) return {label:'매수세 우위',tone:'bullish',text:`EOM ${v.toFixed(2)} — 양수 영역으로, 거래량 대비 가격 이동이 상승 쪽에 유리합니다. 매수 세력이 주도하는 정상 구간이며, OBV 상승·A/D 매집과 함께 나타나면 건강한 상승입니다. 다만 수치가 크지 않아 강한 추세라고 단정하기엔 이릅니다.`};
  if(_es<=15) return {label:'강한 매도세',tone:'bearish',text:`EOM ${v.toFixed(2)} — 강한 음수로, 가격 하락이 매우 쉽게 이루어지고 있습니다. 매도 세력이 효율적으로 가격을 끌어내리고 있으며, 반등 시도가 번번이 실패할 가능성이 높습니다. RSI 극단적 과매도 + 거래량 감소가 동시에 나타나야 바닥 신호를 논의할 수 있습니다.`};
  if(_es<35) return {label:'매도세 우위',tone:'bearish',text:`EOM ${v.toFixed(2)} — 음수 영역으로, 가격 하락이 상승보다 쉬운 구간입니다. 매도 압력이 우세하며, 지지선 이탈 위험에 주의하세요. MACD 데드크로스·OBV 하락과 함께 나타나면 하락 추세 지속 가능성이 높습니다.`};
  return {label:'중립',tone:'neutral',text:`EOM ${v.toFixed(2)} — 제로선 부근으로 매수세와 매도세가 균형 상태입니다. 방향이 결정되지 않은 탐색 구간이며, EOM이 한 방향으로 확실하게 이탈할 때를 기다리는 것이 안전합니다. VHF와 함께 참고하면 추세 형성 여부를 더 정확하게 판단할 수 있습니다.`};
};

SXI.vhf = function(vhf){  // [S986] VHF=추세 강도만·방향 무지 → 극강추세(v≥0.6) 문구에 "방향 별도 확인" caveat
  if(!vhf||vhf.val==null) return null;
  const v=vhf.val, st=vhf.trending;
  if(st==='trending' && v>=0.6) return {label:'극강 추세장',tone:'bullish',text:`VHF ${v.toFixed(3)} — 매우 강한 추세가 형성된 상태입니다. 교과서에서는 추세 추종 전략(이평선·MACD·ADX)의 신뢰도가 가장 높은 구간으로 봅니다. 단 VHF는 강도만 볼 뿐 방향은 모르므로 상승/하락은 MA 정배열·ADX 방향으로 별도 확인하세요 — 하락 추세라면 추종은 매도 방향이라 신규 매수는 부적합합니다. 역추세 매매(볼린저 밴드 반전, 스토캐스틱 과매수/과매도)는 매우 위험하므로 절대 시도하지 마세요. 상승 추세로 확인되면 눌림목 매수·추세선 지지 확인이 가장 효과적입니다. 단, VHF가 피크를 찍고 하락 전환하면 추세 피로의 첫 신호이므로 주의하세요.`};
  if(st==='trending') return {label:'추세장',tone:'bullish',text:`VHF ${v.toFixed(3)} (>0.4) — 추세가 형성된 상태입니다. MA 정배열·MACD·ADX 등 추세 지표를 우선 참고하세요. RSI·스토캐스틱의 과매수 신호는 추세장에서 오래 지속되므로, 이것만으로 매도 판단하면 수익 기회를 놓칠 수 있습니다. EOM이 같은 방향이면 추세 건강성이 확인됩니다. 추세 방향과 반대로 매매하는 것은 위험합니다.`};
  if(st==='ranging' && v<=0.2) return {label:'강한 횡보장',tone:'bearish',text:`VHF ${v.toFixed(3)} — 극도로 방향성이 없는 횡보장입니다. 교과서에서는 추세 지표(MA·MACD·ADX)의 신뢰도가 매우 낮다고 보며, 볼린저 밴드·스토캐스틱·RSI의 과매수/과매도 반전 신호가 더 유효합니다. 이 구간이 오래 지속되면 에너지 축적 후 폭발적 돌파가 나올 가능성이 높으므로, BB 스퀴즈와 함께 모니터링하세요. 돌파 방향을 예측하기보다 돌파 확인 후 진입이 안전합니다.`};
  if(st==='ranging') return {label:'횡보장',tone:'bearish',text:`VHF ${v.toFixed(3)} (<0.3) — 횡보 구간입니다. 추세가 약한 상태이며, 볼린저 밴드·스토캐스틱 등 역추세(오실레이터) 지표가 유효합니다. 교과서에서는 MA 정배열/역배열 신호의 신뢰도가 낮다고 보므로 맹신하지 마세요. 박스권 상단/하단에서의 매도/매수가 적합하며, 돌파 시 VHF 상승을 확인하면 추세 전환 근거가 됩니다.`};
  return {label:'전환 구간',tone:'neutral',text:`VHF ${v.toFixed(3)} — 추세장도 횡보장도 아닌 전환 구간입니다. 추세 지표와 역추세 지표 모두 신뢰도가 중간이며, 어느 전략을 쓸지 판단이 어렵습니다. VHF가 상승하면 추세 형성, 하락하면 횡보 진입으로 해석하세요. ADX·BB 폭과 함께 방향 판단에 활용하면 효과적입니다.`};
};

SXI.psycho = function(psy){
  if(!psy) return null;
  const p=psy.psycho, np=psy.newPsycho, z=psy.zone;
  if(p==null) return null;
  const npStr = np!=null?' / 신심리도 '+np.toFixed(0)+'%':'';
  if(p>=85) return {label:'극단적 과매수',tone:'danger',text:`심리도 ${p.toFixed(0)}%${npStr} — 투자 심리가 극단적으로 낙관에 치우쳐 있습니다. 최근 거래일 대부분이 상승으로, 시장 참여자 대다수가 추가 상승을 기대하는 과열 상태입니다. 교과서에서는 이 수준을 차익실현 매물이 쏟아지는 구간으로 봅니다. 신규 매수는 매우 위험하며, 보유 중이면 분할 익절을 강력히 검토하세요. RSI 과매수·MFI 과잉과 동시 발생 시 조정 교과서에서는 그 확률이 극대화된다고 봅니다.`};
  if(p>=75 || z==='overbought') return {label:'과매수',tone:'warning',text:`심리도 ${p.toFixed(0)}%${npStr} — 과매수 구간입니다. 최근 거래일 중 상승일 비중이 75% 이상으로, 투자 심리가 과도한 낙관에 가깝습니다. 단기 조정 가능성이 높으며, 거래량 감소·윗꼬리 음봉 등 모멘텀 약화 신호가 보이면 고점 경계하세요. 강한 추세장에서는 과매수가 수일간 지속될 수 있으므로 MACD 둔화나 ADX 하락 같은 보조 확인이 필요합니다.`};
  if(p>=60) return {label:'낙관',tone:'bullish',text:`심리도 ${p.toFixed(0)}%${npStr} — 낙관 구간입니다. 상승일 비중이 우세하여 시장 심리가 긍정적이지만, 아직 과열은 아닙니다. MA 정배열·MACD 양수와 함께라면 건강한 상승 추세입니다. 다만 75% 이상으로 올라가면 과매수 진입이므로 점진적으로 경계 수준을 높여가세요.`};
  if(p>=40) return {label:'중립',tone:'neutral',text:`심리도 ${p.toFixed(0)}%${npStr} — 중립 구간입니다. 상승일과 하락일이 비슷한 비율로, 뚜렷한 심리 편향이 없습니다. 방향 결정을 위해 RSI·MACD·VHF 등 다른 기술 지표와 종합 판단이 필요합니다.${np!=null&&Math.abs(np-p)>10?' 신심리도와 심리도 간 괴리가 크면 최근 변동 패턴이 바뀌고 있다는 신호입니다.':''}`};
  if(p>=25) return {label:'비관',tone:'bearish',text:`심리도 ${p.toFixed(0)}%${npStr} — 비관 구간입니다. 하락일 비중이 우세하여 매도 심리가 강한 상태입니다. 추가 하락 가능성이 있으나, 25% 아래로 떨어지면 과매도 반등 구간이 됩니다. MACD 골든크로스·거래량 증가가 나타나면 심리 반전의 첫 신호로 볼 수 있습니다.`};
  if(p>=15) return {label:'과매도',tone:'bullish',text:`심리도 ${p.toFixed(0)}%${npStr} — 과매도 구간입니다. 최근 거래일 대부분이 하락으로, 매도 세력이 거의 소진된 상태입니다. 기술적 반등 가능성이 높으며, RSI 과매도·BB 하단 이탈과 동시 발생 시 반전 교과서에서는 신뢰도를 매우 높게 봅니다. 다만 강한 하락 추세에서는 과매도가 지속될 수 있으므로 실제 반전 양봉을 확인한 후 진입이 안전합니다.`};
  return {label:'극단적 과매도',tone:'bullish',text:`심리도 ${p.toFixed(0)}%${npStr} — 극단적 과매도입니다. 거의 모든 거래일이 하락으로, 매도 에너지가 완전히 소진된 상태입니다. 교과서에서는 이 수준에서 강한 기술적 반등을 기대합니다. RSI 극단적 과매도·거래량 급감 후 증가가 함께 나타나면 바닥 신호가 됩니다. 분할 매수를 시작할 수 있는 구간이지만, 패닉 셀링 국면에서는 15% 이하 유지도 가능하므로 분할 접근이 필수입니다.`};
};

SXI.chaikinOsc = function(co){
  if(!co||co.val==null) return null;
  const v=co.val, t=co.trend, cr=co.cross;
  if(cr==='golden' && v>0) return {label:'골든크로스 (양수)',tone:'bullish',text:`Chaikin Osc ${v.toFixed(0)} — A/D 모멘텀이 양으로 전환되며 제로선 위에서 골든크로스했습니다. 거래량이 가격 상승을 적극 뒷받침하는 매집 가속 구간입니다. OBV 상승·외국인 순매수와 함께 나타나면 기관/세력의 매집이 본격화되고 있을 가능성이 높습니다. 추세 추종 전략에 강한 확인 신호로 활용하세요.`};
  if(cr==='golden') return {label:'골든크로스 (음수권)',tone:'bullish',text:`Chaikin Osc ${v.toFixed(0)} — 아직 음수권이지만 단기 A/D가 장기 A/D를 상향 돌파했습니다. 매도 압력이 완화되기 시작하는 초기 신호이며, 양수 전환을 확인하면 매집 전환이 확정됩니다. RSI 과매도 반등·MACD 골든크로스와 동시 발생 시 바닥 확인 교과서에서는 신뢰도가 높아진다고 봅니다.`};
  if(cr==='dead' && v<0) return {label:'데드크로스 (음수)',tone:'bearish',text:`Chaikin Osc ${v.toFixed(0)} — A/D 모멘텀이 음으로 전환되며 제로선 아래에서 데드크로스했습니다. 거래량이 하락을 뒷받침하는 분산(매도) 가속 구간으로, 대형 매물이 쏟아질 위험이 있습니다. OBV 하락·기관 순매도와 함께 나타나면 하락 추세가 강화됩니다. 신규 매수를 자제하고 보유 중이면 비중 축소를 검토하세요.`};
  if(cr==='dead') return {label:'데드크로스 (양수권)',tone:'bearish',text:`Chaikin Osc ${v.toFixed(0)} — 아직 양수권이지만 단기 A/D가 장기 A/D를 하향 돌파했습니다. 매집 강도가 약화되기 시작하는 초기 경고이며, 음수 전환 시 본격적인 분산 구간으로 진입합니다. 추격 매수를 자제하고, 이미 보유 중이면 모멘텀 변화를 주시하세요.`};
  // [S452] '강한 매집' 티어 제거: ChaikinOsc.trend은 부호(bullish/bearish)뿐 'up' 미발생 → 죽은 가지였음. 아래 v>0 '매집 구간'이 흡수(동작 불변). 모멘텀 slope 필드 추가 시 재도입 가능.
  if(v>0) return {label:'매집 구간',tone:'bullish',text:`Chaikin Osc ${v.toFixed(0)} — 양수 영역으로, 거래량 가중 A/D선의 단기 모멘텀이 장기보다 높습니다. 매수세가 우위인 정상 구간이며, 가격 상승이 거래량 뒷받침을 받고 있습니다. 수치가 줄어들기 시작하면 매집 약화 초기 신호이므로 주의하세요.`};
  // [S452] '강한 분산' 티어 제거: 동일 사유(trend은 부호뿐, 'down' 미발생). 아래 v<0 '분산 구간'이 흡수(동작 불변).
  if(v<0) return {label:'분산 구간',tone:'bearish',text:`Chaikin Osc ${v.toFixed(0)} — 음수 영역으로, A/D 모멘텀이 하락 쪽에 기울어 있습니다. 매도 거래량이 매수보다 우세하며, 지지선 이탈 시 추가 하락 가속 가능성이 있습니다. 제로선 위로 올라올 때까지 신규 매수는 리스크가 높습니다.`};
  return {label:'중립',tone:'neutral',text:`Chaikin Osc ${v.toFixed(0)} — 제로선 부근으로 매집도 분산도 뚜렷하지 않습니다. 방향 결정 전 탐색 구간이며, OBV·EOM과 함께 방향 전환 신호를 기다리세요.`};
};

SXI.abRatio = function(ab){
  if(!ab) return null;
  const a=ab.a, b=ab.b, r=ab.ratio, t=ab.trend;
  if(a==null||b==null) return null;
  const rStr = r!=null?r.toFixed(2):'N/A';
  if(t==='bullish' && r!=null && r>=1.5) return {label:'강한 매수세 우위',tone:'bullish',text:`AB Ratio — A(${a.toFixed(1)}) >> B(${b.toFixed(1)}), 비율 ${rStr}. 매수세(고가-시가 평균)가 매도세(시가-저가 평균)를 크게 압도하고 있습니다. 시장 참여자들이 적극적으로 고가를 높이고 있으며, 이는 상승 압력이 매우 강하다는 의미입니다. 추세장에서 이 패턴이 나타나면 추가 상승 여력이 큽니다. MA 정배열·EOM 양수와 함께 나타나면 건강한 상승의 강력한 확인 신호입니다. 다만 A 비율이 극단적으로 높으면(2.0 이상) 단기 과열 가능성도 있으므로, RSI·심리도와 함께 점검하세요.`};
  if(t==='bullish') return {label:'매수세 우위',tone:'bullish',text:`AB Ratio — A(${a.toFixed(1)}) > B(${b.toFixed(1)}), 비율 ${rStr}. 매수세가 매도세보다 우위입니다. 장중에 시가 대비 고가 쪽으로 가격이 더 많이 이동하여, 매수 참여자가 적극적으로 가격을 끌어올리는 양상입니다. MACD 양수·OBV 상승과 함께 나타나면 상승 추세가 건강하며, 눌림목 매수 전략에 유리한 환경입니다. B 비율이 급등하면서 균형 또는 매도세 전환이 나타나면 추세 변화 초기 신호입니다.`};
  if(t==='bearish' && r!=null && r<=0.67) return {label:'강한 매도세 우위',tone:'bearish',text:`AB Ratio — A(${a.toFixed(1)}) << B(${b.toFixed(1)}), 비율 ${rStr}. 매도세(시가-저가 평균)가 매수세를 크게 압도하고 있습니다. 장중에 시가 대비 저가 쪽으로 가격이 더 많이 이동하여, 매도 압력이 매우 강합니다. 이 패턴에서 지지선 이탈이 나타나면 하락이 가속될 수 있습니다. 신규 매수는 매우 위험하며, 보유 중이면 손절 기준을 엄격하게 적용하세요. RSI 극단적 과매도 + EOM 양수 전환이 동시에 나타나야 반등을 논의할 수 있습니다.`};
  if(t==='bearish') return {label:'매도세 우위',tone:'bearish',text:`AB Ratio — A(${a.toFixed(1)}) < B(${b.toFixed(1)}), 비율 ${rStr}. 매도세가 매수세보다 강합니다. 장중 시가 대비 저가 방향으로의 이동이 더 큰 양상으로, 하방 압력이 우세합니다. MACD 음수·OBV 하락과 함께 나타나면 하락 추세 지속 가능성이 높습니다. 반등 시도가 있더라도 상방 추진력이 약해 윗꼬리 음봉으로 마감될 가능성이 큽니다. A 비율이 증가하면서 균형으로 전환되는지 주시하세요.`};
  return {label:'균형',tone:'neutral',text:`AB Ratio — A(${a.toFixed(1)}) ≈ B(${b.toFixed(1)}), 비율 ${rStr}. 매수세와 매도세가 균형을 이루고 있습니다. 장중 고가와 저가 방향 이동이 비슷하여 뚜렷한 방향 편향이 없습니다. 횡보장에서 자주 나타나며, VHF 횡보와 함께 나타나면 박스권 매매가 적합합니다. 한쪽이 급격히 우위를 점하면 방향 결정 신호이므로, 돌파 시 A/B 비율 변화를 함께 확인하세요.`};
};

// ════════════════════════════════════════════════════════════
//  4단계: 전체 조립 함수 (분석 오버레이용)
// ════════════════════════════════════════════════════════════

SXI.interpretAll = function(ind){
  if(!ind) return {};
  const adv = ind._advanced || ind; // calcIndicators 래퍼 경유 시 _advanced에 전체 데이터
  const rsiV=typeof ind.rsi==='number'?ind.rsi:(ind.rsi?.val??ind.rsiLegacy??null);
  const macdObj=ind.macd||ind.macdLegacy||{};
  const stochObj=ind.stoch||ind.stochLegacy||{};
  const adxObj=ind.adx||ind.adxLegacy||{};
  const bbObj=ind.bb||ind.bbLegacy||{};
  const obvObj=ind.obv||ind.obvLegacy||{};
  const candleObj=ind.candle||ind.patterns||ind.patternsLegacy||adv.candle||{};
  const atrObj=ind.atr||{};
  const maAlign=ind.maAlign||adv.maAlign||{};
  const psarObj=ind.psar||{};
  const swingObj=ind.swingStruct||ind.swingStructLegacy||adv.swingStruct||{};
  //  [S1300] maConvObj 철거 — 유일 소비처였던 maConvergence 키가 사라져 고아가 됐다.
  //    ⚠advMaConv는 renderAnalysisResult가 직접 maConv를 넘겨 호출하므로 interpretAll 경유가 아니다.
  const vwapObj=ind.vwap||ind.vwapLegacy||{};
  const ichimokuObj=ind.ichimoku||ind.ichimokuLegacy||{};
  const regimeObj=ind.regime||adv.regime||{};
  const pchObj=ind.priceChannel||ind.priceChannelLegacy||{};
  const pivotObj=ind.pivot||ind.pivotLegacy||{};
  const dispObj=ind.maDisparity||ind.maDisparityLegacy||{};
  const adLineObj=ind.ad||ind.adLegacy||{};
  const pullbackScore=ind.pullback?.score??adv.pullback?.score??null;
  const volRatio=ind.volPattern?.volRatio??adv.volPattern?.volRatio??null;

  return {
    rsi: SXI.rsi(rsiV),
    macd: SXI.macd(macdObj.hist??macdObj.histogram, macdObj.prevHist, macdObj.recentGolden, macdObj.recentDead),
    stoch: SXI.stoch(stochObj.k, stochObj.d),
    adx: SXI.adx(adxObj.adx, adxObj.pdi??adxObj.plusDI, adxObj.mdi??adxObj.minusDI),
    cci: SXI.cci(ind.cci),
    mfi: SXI.mfi(ind.mfi),
    bb: SXI.bb(bbObj.pctB, bbObj.width, bbObj.isSqueeze??ind.squeeze?.squeeze??adv.squeeze?.squeeze),
    bbWidth: SXI.bbWidth(bbObj.width, bbObj.isSqueeze??ind.squeeze?.squeeze??adv.squeeze?.squeeze),
    obv: SXI.obv(obvObj.trend, obvObj.div??obvObj.divergence),
    ma: SXI.ma(maAlign.bullish?'bullish':maAlign.bearish?'bearish':null),
    atr: SXI.atr(atrObj.pct??atrObj.ratio),
    sar: SXI.sar(psarObj.trend),
    candle: SXI.candle(candleObj.patterns?[...candleObj.patterns]:null),
    pullback: SXI.pullback(pullbackScore),
    swingStruct: SXI.swingStruct(swingObj.higherHighs, swingObj.lowerLows),
    //  [S1300] maConvergence 키 제거 — 소비처 0(死코드 철거). 렌더는 SXI.advMaConv 경유.
    vwap: SXI.vwap(vwapObj.position, vwapObj.pct),
    ichimoku: SXI.ichimoku(ichimokuObj.priceVsCloud, ichimokuObj.cloud, ichimokuObj.signal),
    regime: SXI.regime(regimeObj.label, regimeObj.direction, regimeObj.adx),
    priceChannel: SXI.priceChannel(pchObj.position, pchObj.upper, pchObj.lower, pchObj.price),
    pivot: SXI.pivot(pivotObj.level, pivotObj.P, pivotObj.R1, pivotObj.S1, pivotObj.price),
    maDisparity: SXI.maDisparity(dispObj.disparity20, dispObj.disparity60),
    volumeMA: SXI.volumeMA(volRatio),
    adLine: SXI.adLine(adLineObj.trend, adLineObj.score!=null?(adLineObj.score>3?'bullish':adLineObj.score<-3?'bearish':null):null),
    // S49 신규 5개
    eom: SXI.eom(ind.eom||adv.eom),
    vhf: SXI.vhf(ind.vhf||adv.vhf),
    psycho: SXI.psycho(ind.psycho||adv.psycho),
    chaikinOsc: SXI.chaikinOsc(ind.chaikinOsc||adv.chaikinOsc),
    abRatio: SXI.abRatio(ind.abRatio||adv.abRatio),
  };
};

// ── 버전 ──
// SXI.version → 파일 끝으로 이동 (S54)

// ════════════════════════════════════════════════════════════
//  5단계: 부문별 점수 해석 (S43 신규)
// ════════════════════════════════════════════════════════════
SXI.sectorScores = function(scores, stock, ind){
  if(!scores) return null;
  const res = {};
  const m=scores.momentum, mG=m>=70?'A':m>=55?'B':m>=40?'C':m>=25?'D':'F';
  let mT=`${m}점 (${mG}등급). `;
  if(ind){
    const rsi=typeof ind.rsi==='number'?ind.rsi:(ind.rsi?.val??50);
    const macdUp=ind.macd?.macd>ind.macd?.signal;
    const cr=stock?.changeRate||0;
    mT+=`RSI ${rsi.toFixed(0)}${rsi>60?' (매수↑)':rsi<40?' (매도↑)':''}, MACD ${macdUp?'시그널↑':'시그널↓'}, 등락률 ${cr>0?'+':''}${cr.toFixed(1)}%. `;
    if(m>=70) mT+='상승 모멘텀이 매우 강하며 추세 추종에 유리합니다.';
    else if(m>=55) mT+='상승 모멘텀 우위이지만 강하지는 않습니다.';
    else if(m>=40) mT+='모멘텀이 약세 쪽이며 관망이 유리합니다.';
    else mT+='하락 모멘텀이 강합니다. 반전 신호를 기다리세요.';
  }
  res.momentum={score:m,grade:mG,tone:m>=55?'bullish':m<=45?'bearish':'neutral',text:mT};

  // [S357] 코인은 밸류(외국인비율 기반)가 항상 40 고정 → 무의미하므로 카드 생략.
  //   전광판도 '시장·리스크'로 재구성하며 밸류 제외 → 부문별 점수와 일관.
  const _isCoin = (typeof currentMarket!=='undefined' && currentMarket==='coin')
                || /^(KRW|BTC|USDT)-/.test(String(stock && stock.code || ''));
  if(!_isCoin){
    const v=scores.value, vG=v>=70?'A':v>=55?'B':v>=40?'C':v>=25?'D':'F';
    const fr=stock?.foreignRatio||0;
    let vT=`${v}점 (${vG}등급). 외국인 ${fr.toFixed(1)}%`;
    if(fr>30) vT+=' — 외국인 선호 우량주, 하방 제한적.';
    else if(fr>15) vT+=' — 보통 수준.';
    else if(fr>5) vT+=' — 낮은 편, 유동성 주의.';
    else vT+=' — 매우 낮음, 급등락 빈번 가능.';
    vT+=' ';
    // [S397] 밸류 점수에 PER 괴리 반영됨 — 외국인 base 대비 방향 안내 ("향후 추가 예정" 정정)
    const _baseGuess = fr>30?65 : fr>15?55 : fr>5?48 : 40;
    if(v <= _baseGuess-3) vT+='PER 고평가가 점수에 반영되었습니다.';
    else if(v >= _baseGuess+3) vT+='PER 저평가가 점수에 반영되었습니다.';
    else vT+='PER 괴리는 중립 수준입니다.';
    res.value={score:v,grade:vG,tone:v>=55?'bullish':v<=45?'bearish':'neutral',text:vT};
  }

  const vo=scores.volume, voG=vo>=70?'A':vo>=55?'B':vo>=40?'C':vo>=25?'D':'F';
  let voT=`${vo}점 (${voG}등급). `;
  if(ind){
    const mfi=ind.mfi,vr=ind.vr,obvT=ind.obv?.trend;
    voT+=`MFI ${typeof mfi==='number'?mfi.toFixed(0):'N/A'}${mfi>60?' (유입)':mfi<40?' (유출)':''}, VR ${typeof vr==='number'?vr.toFixed(0):'N/A'}, OBV ${obvT==='up'?'↑':obvT==='down'?'↓':'—'}. `;
    if(vo>=70) voT+='수급이 확실히 뒷받침되어 추세 지속력이 높습니다.';
    else if(vo>=55) voT+='매수 수급이 살아있습니다.';
    else if(vo>=40) voT+='뚜렷한 수급 방향이 없습니다.';
    else voT+='거래량 부족으로 신뢰도가 낮습니다.';
  }
  res.volume={score:vo,grade:voG,tone:vo>=55?'bullish':vo<=45?'bearish':'neutral',text:voT};

  const t=scores.trend, tG=t>=70?'A':t>=55?'B':t>=40?'C':t>=25?'D':'F';
  let tT=`${t}점 (${tG}등급). `;
  if(ind){
    const adxV=ind.adx?.adx??0;
    const bull=ind.ma5&&ind.ma20&&ind.ma60&&ind.ma5>ind.ma20&&ind.ma20>ind.ma60;
    const sarUp=ind.psar?.trend==='up';
    tT+=`ADX ${adxV.toFixed(0)}${adxV>25?' (추세↑)':' (추세↓)'}, MA ${bull?'정배열':'혼조/역배열'}, SAR ${sarUp?'↑':'↓'}. `;
    if(t>=70) tT+='상승 추세가 강하며 추세 추종에 최적입니다.';
    else if(t>=55) tT+='약한 상승 추세 형성 중.';
    else if(t>=40) tT+='추세가 약하거나 횡보 중.';
    else tT+='하락 추세 또는 추세 부재.';
  }
  res.trend={score:t,grade:tG,tone:t>=55?'bullish':t<=45?'bearish':'neutral',text:tT};

  // [S439] RS(상대강도) 부문 — 시장(지수) 대비 강도. ind.rs(일봉)만. RSI(과매수·과매도)와 무관.
  //   rs20(%p)을 0~100 점수로 매핑(전광판 S438과 동일: 50 + rs20*2.5, ±20%p=0/100).
  if(ind && ind.rs && ind.rs.rs20 != null){
    const _rs20 = ind.rs.rs20, _rs60 = ind.rs.rs60;
    const _rsS = Math.max(0, Math.min(100, Math.round(50 + _rs20 * 2.5)));
    const _rsG = _rsS>=70?'A':_rsS>=55?'B':_rsS>=40?'C':_rsS>=25?'D':'F';
    let _rsT = `${_rsS}점 (${_rsG}등급). 시장 대비 20일 ${_rs20>=0?'+':''}${_rs20}%p`;
    if(_rs60 != null) _rsT += `, 60일 ${_rs60>=0?'+':''}${_rs60}%p`;
    _rsT += '. ';
    if(_rs20 >= 10) _rsT += '시장을 크게 앞서는 강세 종목입니다.';
    else if(_rs20 >= 3) _rsT += '시장 대비 상대 강세입니다.';
    else if(_rs20 > -3) _rsT += '시장과 비슷한 흐름입니다.';
    else if(_rs20 > -10) _rsT += '시장 대비 상대 약세입니다.';
    else _rsT += '시장에 크게 뒤처지는 약세 종목입니다.';
    res.relStrength = {score:_rsS, grade:_rsG, tone:_rs20>=3?'bullish':_rs20<=-3?'bearish':'neutral', text:_rsT};
  }

  // S56: 공시 부문 (stock._disclosureItp가 있으면)
  if(stock && stock._disclosureItp){
    const di = stock._disclosureItp;
    res.disclosure = {score:di.sectorScore, grade:di.sectorGrade, tone:di.tone==='danger'?'bearish':di.tone, text:di.sectorText};
  }
  return res;
};

// [S985] SXI.unifiedNarrative 삭제 — S981서 종합해석 카드 호출부 제거된 死코드(4축↔부문별점수 화해 카드, 호출처 0).

// ════════════════════════════════════════════════════════════
//  6단계: MA 배열 상세 해석 (S43 신규)
// ════════════════════════════════════════════════════════════
SXI.maAlignment = function(ind){
  if(!ind) return null;
  const last=ind.last||ind.price||0;
  const ma5=ind.ma5,ma20=ind.ma20,ma60=ind.ma60,ma120=ind.ma120;
  if(!ma5&&!ma20) return null;
  const pD=(a,b)=>b?((a-b)/b*100).toFixed(1):'N/A';
  const lines=[];
  if(ma5) lines.push({n:'MA5',v:ma5,ab:last>ma5,d:pD(last,ma5)});
  if(ma20) lines.push({n:'MA20',v:ma20,ab:last>ma20,d:pD(last,ma20)});
  if(ma60) lines.push({n:'MA60',v:ma60,ab:last>ma60,d:pD(last,ma60)});
  if(ma120) lines.push({n:'MA120',v:ma120,ab:last>ma120,d:pD(last,ma120)});
  const bull=ma5&&ma20&&ma60&&ma5>ma20&&ma20>ma60;
  const bear=ma5&&ma20&&ma60&&ma5<ma20&&ma20<ma60;
  const fullBull=bull&&ma120&&ma60>ma120;
  const fullBear=bear&&ma120&&ma60<ma120;
  let gcDc='';
  if(ma5&&ma20){const gap=((ma5-ma20)/ma20)*100; if(Math.abs(gap)<1) gcDc=gap>0?'[주의] MA5/MA20 근접 — GC 직후 또는 DC 직전':'[주의] MA5/MA20 근접 — DC 직후 또는 GC 직전';}
  let srNote='';
  if(ma20&&last>ma20){const d=((last-ma20)/ma20)*100;if(d<2) srNote=`현재가 MA20 바로 위(${d.toFixed(1)}%) — 지지 테스트 중`;}
  else if(ma20&&last<ma20){const d=((ma20-last)/last)*100;if(d<2) srNote=`현재가 MA20 바로 아래(${d.toFixed(1)}%) — 저항 테스트 중`;}
  const arr=fullBull?'완전 정배열 (5>20>60>120)':fullBear?'완전 역배열':bull?'정배열 (5>20>60)':bear?'역배열':'혼조';
  const tone=fullBull||bull?'bullish':fullBear||bear?'bearish':'mixed';  // [S965] 혼조 케이스 neutral→mixed(보라). 정배열/역배열 불변.
  let text=`【${arr}】\n`;
  lines.forEach(l=>{text+=`${l.n}: ${(+l.v).toLocaleString()} — 현재가 ${l.ab?'위':'아래'} (${l.d}%)\n`;});
  if(gcDc) text+=gcDc+'\n';
  if(srNote) text+=srNote+'\n';
  if(fullBull) text+='\n모든 이평선이 상승 정렬로 가장 강한 구조. 눌림목 매수 최적이며 MA20 지지 확인하며 보유. MA20 이탈 시 경고, MA60 이탈 시 추세 전환.';
  else if(bull) text+='\n단기·중기 정배열 상승 추세. MA120이 아직 뒤따라오지 못해 장기 전환 초기일 수 있습니다.';
  else if(fullBear) text+='\n모든 이평선이 하락 정렬로 가장 약한 구조. 반등이 나와도 모든 이평선이 저항. 매수 매우 위험.';
  else if(bear) text+='\n단기·중기 역배열 하락 추세. 반등이 MA20·MA60에서 막히기 쉽습니다.';
  else text+='\n이평선 뒤엉킴 — 추세 전환기. 방향 정리까지 관망 유리.';
  return {label:arr,tone,text,lines,gcDc,srNote};
};

// ════════════════════════════════════════════════════════════
//  7단계: 기본 정보 의미 해석 (S43 신규)
// ════════════════════════════════════════════════════════════
SXI.basicInfo = function(stock){
  if(!stock) return null;
  const res={};
  // [S277-C] 미국 종목 — 해석 카드 단위 USD 표기 (오해 방지)
  //   배경: 분석탭은 [S276]에서 단위 차별화됐지만 해석 카드 텍스트는 "시총 4.3조 — 대형주" 같이 단위 누락
  //   해결: 미국 종목이면 fmtMC/fmtTA 결과 뒤에 " USD" 접미사 추가 (한국식 "X조 USD" 통일)
  const _isUS_int = stock._mkt === 'us';
  const _usSfx = _isUS_int ? ' USD' : '';
  // mc는 억원 단위가 정상이나, 원단위가 들어올 수 있음 → 자동 정규화
  let mc=stock.marketCap||0;
  if(mc>100000000) mc = mc / 100000000; // 원→억 변환 (100억 이상이 원단위로 들어온 경우)
  const fmtMC = (v) => v>=10000 ? `${(v/10000).toFixed(1)}조` : v>=1 ? `${Math.round(v).toLocaleString()}억` : '정보 없음';
  if(mc>=100000) res.marketCap={text:`시총 ${fmtMC(mc)}${_usSfx} — ${_isUS_int ? '글로벌 초대형주' : '국내 최대급 대형주'}. 유동성 풍부, 슬리피지 적음. 시장 전체 영향을 크게 받습니다.`};
  else if(mc>=10000) res.marketCap={text:`시총 ${fmtMC(mc)}${_usSfx} — 대형주. 기관 관심 대상이며 안정성과 유동성 양호.`};
  else if(mc>=3000) res.marketCap={text:`시총 ${fmtMC(mc)}${_usSfx} — 중형주. 개별 이슈에 민감하며 성장성과 밸류 균형이 중요.`};
  else if(mc>=500) res.marketCap={text:`시총 ${fmtMC(mc)}${_usSfx} — 소형주. 변동성 크고 세력 급등락 빈번. 소액 분할 접근 필수.`};
  else if(mc>0) res.marketCap={text:`시총 ${fmtMC(mc)}${_usSfx} — 초소형주. 극심한 변동성과 유동성 부족. 극소액만 투입하세요.`};
  else res.marketCap={text:'시총 정보 없음.'};

  // ta는 백만원 단위가 정상이나, 원단위가 들어올 수 있음 → 자동 정규화
  let ta=stock.tradeAmount||0;
  if(ta>1000000000) ta = ta / 1000000; // 원→백만원 변환
  const fmtTA = (v) => v>=1000000 ? `${(v/1000000).toFixed(1)}조` : v>=100 ? `${(v/100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',')}억` : v>=1 ? `${Math.round(v)}백만` : '정보 없음';
  // [S277-C] (위 _usSfx 재사용)
  if(ta>=100000) res.tradeAmount={text:`거래대금 ${fmtTA(ta)}${_usSfx} — 시장 관심 집중. 체결 빠르고 슬리피지 거의 없음.`};
  else if(ta>=10000) res.tradeAmount={text:`거래대금 ${fmtTA(ta)}${_usSfx} — 적정 수준. 일반 매매 지장 없음.`};
  else if(ta>=1000) res.tradeAmount={text:`거래대금 ${fmtTA(ta)}${_usSfx} — 다소 적음. 분할 매매 필요.`};
  else if(ta>0) res.tradeAmount={text:`거래대금 ${fmtTA(ta)}${_usSfx} — 매우 적음. 유동성 부족으로 체결 어려울 수 있음.`};
  else res.tradeAmount={text:'거래대금 정보 없음.'};

  const fr=stock.foreignRatio||0;
  if(fr>40) res.foreignRatio={text:`외국인 ${fr.toFixed(1)}% — 매우 높음. 글로벌 기관 참여, 재무 신뢰 높음. 외국인 순매도 전환 시 하방 압력 주의.`};
  else if(fr>20) res.foreignRatio={text:`외국인 ${fr.toFixed(1)}% — 양호. 밸류에이션 프리미엄 반영 가능.`};
  else if(fr>5) res.foreignRatio={text:`외국인 ${fr.toFixed(1)}% — 낮은 편. 국내 수급에 더 민감.`};
  else if(fr>0) res.foreignRatio={text:`외국인 ${fr.toFixed(1)}% — 매우 낮음. 개인 투자자 비중 높아 수급 변동성 큼.`};
  else res.foreignRatio={text:'외국인 지분 정보 없음.'};

  const cr=stock.changeRate||0;
  if(cr>=10) res.changeRate={text:`등락률 +${cr.toFixed(2)}% — 급등. 추격 매수 매우 위험. 다음 날 갭하락 빈번.`};
  else if(cr>=5) res.changeRate={text:`등락률 +${cr.toFixed(2)}% — 강한 상승. 거래량 동반 여부가 추세 판단의 열쇠.`};
  else if(cr>=2) res.changeRate={text:`등락률 +${cr.toFixed(2)}% — 양호한 상승. 건강한 추세에서 자주 보이는 수준.`};
  else if(cr>0) res.changeRate={text:`등락률 +${cr.toFixed(2)}% — 소폭 상승. 큰 방향성은 없음.`};
  else if(cr>-2) res.changeRate={text:`등락률 ${cr.toFixed(2)}% — 소폭 하락. 일상적 변동 범위.`};
  else if(cr>-5) res.changeRate={text:`등락률 ${cr.toFixed(2)}% — 약세. 지지선 확인 필요.`};
  else if(cr>-10) res.changeRate={text:`등락률 ${cr.toFixed(2)}% — 강한 하락. 손절 기준 점검하세요.`};
  else res.changeRate={text:`등락률 ${cr.toFixed(2)}% — 급락. 반등 기대보다 리스크 관리가 우선.`};
  return res;
};

// ════════════════════════════════════════════════════════════
//  S54: 연관 키워드 모듈
//  종목의 섹터/테마/지표 상태를 기반으로 검색용 키워드 생성
//  클릭 시 클립보드 복사용
// ════════════════════════════════════════════════════════════

SXI._sectorThemes = {
  '반도체':['반도체 관련주','반도체 수혜주','HBM 관련주','AI 반도체','시스템반도체','파운드리','반도체 장비주','반도체 소재','메모리 반도체','TSMC 관련주','엔비디아 수혜주','반도체 후공정','반도체 패키징','GPU 관련주','DDR5 관련주','반도체 테스트','웨이퍼 관련주','EUV 관련주','NPU 관련주','온디바이스AI'],
  '2차전지':['2차전지 관련주','배터리 관련주','리튬 관련주','양극재','음극재','전해질','분리막','전고체 배터리','LFP 배터리','NCM 배터리','배터리 리사이클링','ESS 관련주','전기차 배터리','나트륨이온 배터리','실리콘 음극재','바인더','도전재','배터리 셀','배터리 모듈','CTP 기술'],
  '바이오':['바이오 관련주','신약 개발','임상시험','바이오시밀러','ADC 항체','세포유전자치료','mRNA','면역항암제','바이오CMO','바이오CDMO','GLP-1 관련주','비만치료제','알츠하이머 치료제','희귀질환','진단키트','바이오벤처','FDA 승인','기술수출','바이오텍','마이크로바이옴'],
  '자동차':['자동차 관련주','전기차 관련주','자율주행','자동차 부품','SDV','자동차 전장','자동차 반도체','타이어','전기차 충전','모빌리티','UAM 관련주','수소차','하이브리드','자동차 경량화','ADAS','라이다','카메라 모듈','커넥티드카','PBV','전기차 플랫폼'],
  'IT/소프트웨어':['IT 관련주','소프트웨어 관련주','AI 관련주','클라우드','SaaS','사이버보안','빅데이터','디지털전환','블록체인','핀테크','메타버스','로봇 관련주','RPA','엣지컴퓨팅','디지털트윈','양자컴퓨터 관련주','생성형AI','AI 에이전트','LLM 관련주','데이터센터'],
  '금융':['금융주','은행주','증권주','보험주','핀테크','디지털금융','가상자산','금리 수혜주','배당주','고배당주','리츠 관련주','대출','카드사','자산운용','PEF','벤처캐피탈','금융플랫폼','인슈어테크','오픈뱅킹','마이데이터'],
  '건설':['건설주','건설 관련주','부동산','인프라','SOC','해외건설','플랜트','발전소','스마트건설','모듈러주택','리모델링','도시정비','GTX','원전 관련주','해상풍력 건설','데이터센터 건설','물류센터','산업단지','인테리어','건축자재'],
  '화학':['화학주','석유화학','정밀화학','2차전지 소재','바이오화학','특수가스','반도체 소재','디스플레이 소재','탄소나노튜브','수소','그린수소','탄소중립','탄소배출권','화학소재','코팅소재','접착제','촉매','합성수지','OLED 소재','포토레지스트'],
  '철강':['철강주','철강 관련주','고강도강','전기강판','스테인리스','특수강','비철금속','구리','알루미늄','니켈','희토류 관련주','철스크랩','고로','전기로','탄소중립 철강','수소환원제철','풍력 소재','조선 소재','자동차 강판','인프라 수혜'],
  '유통':['유통주','유통 관련주','이커머스','편의점','백화점','할인점','홈쇼핑','라이브커머스','물류','풀필먼트','라스트마일','콜드체인','새벽배송','면세점','리테일테크','O2O','구독경제','PB상품','도매','프랜차이즈'],
  '식품':['식품주','식품 관련주','HMR','건강기능식품','K-푸드','대체육','식물성 단백질','프로바이오틱스','음료','주류','라면','제과','프리미엄 식품','할랄식품','비건식품','밀키트','펫푸드','식품첨가물','곡물','원자재'],
  '엔터':['엔터 관련주','K-pop 관련주','아이돌','한류','콘텐츠','OTT','웹툰','IP 비즈니스','드라마','영화','음원','굿즈','팬덤 플랫폼','버추얼 아이돌','AI 엔터','스트리밍','공연','매니지먼트','뮤지컬','방송'],
  '게임':['게임주','게임 관련주','모바일게임','PC게임','콘솔게임','MMORPG','FPS','게임 IP','e스포츠','게임 플랫폼','클라우드 게임','VR게임','AI NPC','게임 엔진','웹3 게임','P2E','메타버스 게임','게임 퍼블리싱','인디게임','게임 스튜디오'],
  '통신':['통신주','통신 관련주','5G','6G 관련주','네트워크장비','데이터센터','CDN','위성통신','IoT','스마트시티','엣지컴퓨팅','통신장비','안테나','광통신','해저케이블','인공위성','저궤도위성','B2B ICT','MVNO','OTT 플랫폼'],
  '에너지':['에너지 관련주','신재생에너지','태양광','풍력','수소에너지','ESS','원자력','SMR 관련주','LNG','석유','정유','가스','전력','송배전','에너지저장','탄소중립','그린에너지','해상풍력','지열','바이오에너지'],
  '기계':['기계주','기계 관련주','로봇','산업용로봇','공작기계','자동화','스마트팩토리','CNC','반도체 장비','디스플레이 장비','배터리 장비','방산','항공우주','드론','3D프린팅','레이저','유압기기','공조','금형','FA시스템'],
  '운송':['운송주','운송 관련주','해운','조선','항공','물류','택배','컨테이너','벌크선','LNG선','유조선','선박','항만','조선기자재','항공화물','철도','화물운송','포워딩','해운 운임','BDI 지수'],
  '섬유/의복':['섬유 관련주','의류 관련주','패션','스포츠웨어','아웃도어','기능성섬유','친환경섬유','OEM','ODM','K-패션','명품','화장품','뷰티','SPA','원단','합성섬유','탄소섬유','방적','염색','리사이클링 섬유'],
  '의료정밀':['의료기기 관련주','의료정밀','정밀기기','헬스케어','디지털헬스','원격의료','의료AI','수술로봇','체외진단','의료영상','치과','안과','정형외과','재활','의료데이터','EMR','PHR','웨어러블 헬스','바이오센서','의료소모품'],
  '전기전자':['전기전자 관련주','전력반도체','PCB','MLCC','커넥터','센서','LED','디스플레이','OLED','마이크로LED','전력변환','인버터','변압기','전선','모터','액추에이터','전자부품','수동소자','임베디드','IoT 디바이스']
};

SXI._signalKeywords = {
  'MA60 ↑':['이동평균선 돌파','MA60 골든크로스','중기 추세 전환','추세 상향 돌파','60일선 지지','중기 매수 신호'],
  'MA60 ↓':['MA60 이탈','중기선 하향 이탈','추세 하락 전환','60일선 저항'],
  'MA20 ↑':['20일선 돌파','단기 골든크로스','단기 추세 전환','20일 이평 지지'],
  '정배열':['정배열 종목','이평선 정배열','추세 강화','상승 추세 진입','이평선 우상향','골든크로스 완성'],
  '역배열':['역배열 종목','이평선 역배열','하락 추세','추세 약화','이평선 우하향','데드크로스'],
  'RSI ↑ 다이버':['RSI 다이버전스','상승 다이버전스','반전 신호','기술적 반등','바닥 다이버전스','추세 반전'],
  'RSI ↓ 다이버':['RSI 하락 다이버전스','하락 전환 신호','추세 피로','천장 다이버전스','매도 경고'],
  'OBV ↑ 다이버':['OBV 다이버전스','거래량 선행 신호','세력 매집','물량 흡수','세력'],
  'OBV ↓ 다이버':['OBV 하락 다이버전스','매집 이탈','물량 출회','거래량 이탈'],
  'Vol ↓':['거래량 감소','거래량 위축','매물 소화','관망세','에너지 축적','조용한 매집'],
  'Vol ↑':['거래량 급증','거래량 폭발','세력 참여','돌파 신호','거래량 동반 상승','수급 유입'],
  '눌림50':['눌림목 매수','눌림목 진입','조정 매수','눌림 기회','지지선 반등','조정 후 재상승'],
  '스퀴즈':['볼린저밴드 스퀴즈','변동성 수축','돌파 임박','에너지 축적','밴드 수렴','변동성 폭발 대기'],
  'BB상단':['볼린저밴드 상단','과매수 구간','상단 돌파','밴드워크','강세 지속'],
  'BB하단':['볼린저밴드 하단','과매도 구간','반등 기대','지지 확인','하단 이탈 주의'],
  'MACD↑':['MACD 골든크로스','MACD 매수 신호','모멘텀 전환','시그널선 돌파'],
  'MACD↓':['MACD 데드크로스','MACD 매도 신호','모멘텀 약화','하락 모멘텀'],
  'GC':['골든크로스','이평선 골든크로스','매수 신호','추세 전환점'],
  'DC':['데드크로스','이평선 데드크로스','매도 신호','하락 전환'],
  'RSI71':['RSI 과매수','과열 주의','단기 조정 예상','차익실현 구간'],
  'RSI81':['RSI 극과매수','급등 과열','조정 임박','추격매수 위험'],
};

SXI._actionKeywords = {
  'BUY':['매수 타이밍','저점 매수','진입 시점','매수 전략','수익 전략','분할 매수','적정 매수가'],
  'SELL':['매도 시점','차익 실현','리스크 관리','손절 전략','하방 리스크','분할 매도','익절 타이밍'],
  'HOLD':['관망','보유 전략','추세 관찰','횡보 대응','포지션 유지','추가 매수 대기']
};

SXI._scaleKeywords = {
  large:['대형주','블루칩','기관 매수','외국인 매수','시가총액 상위','코스피200','MSCI 편입'],
  mid:['중형주','성장주','실적 성장','중소형 가치주','턴어라운드','코스닥150','히든챔피언'],
  small:['소형주','테마주','급등주','저평가','개인투자자','소외주 발굴','저PBR','저PER','가치주'],
  micro:['초소형주','동전주','급등 테마','변동성','단타','스윙 매매','소액 투자','급등락']
};

SXI._trendKeywords = {
  uptrend:['상승추세','추세 매매','추세 추종','우상향','눌림목','신고가','52주 신고가'],
  downtrend:['하락추세','반등 매매','저점 매수','바닥 확인','역추세','52주 신저가','낙폭 과대'],
  sideways:['횡보','박스권','레인지 매매','돌파 대기','지지 저항','수렴 패턴','삼각수렴']
};

// S54: 캔들 패턴 키워드
SXI._candleKeywords = {
  'hammer':['망치형','반등 캔들','하락 반전','바닥 신호','하방 꼬리'],
  'inverted_hammer':['역망치형','매수 시도','반등 가능','상방 압력'],
  'engulfing_bull':['상승 장악형','강세 반전','매수세 우위','대양봉 장악'],
  'engulfing_bear':['하락 장악형','약세 반전','매도세 우위','대음봉 장악'],
  'doji':['도지','십자형','방향 모색','추세 전환 가능','매매 균형'],
  'morning_star':['샛별형','바닥 확인','3봉 반전','강한 매수 신호'],
  'evening_star':['석별형','천장 확인','3봉 반전','강한 매도 신호'],
  'three_white':['적삼병','연속 양봉','강한 상승','매수세 확대'],
  'three_black':['흑삼병','연속 음봉','강한 하락','매도세 확대'],
  'harami_bull':['상승 잉태형','조정 후 반등','매수 대기','추세 전환'],
  'harami_bear':['하락 잉태형','상승 후 조정','매도 대기','모멘텀 약화'],
  'shooting_star':['유성형','천장 신호','매도 압력','윗꼬리 캔들'],
  'bullish_pin':['상승 핀바','긴 아랫꼬리','매수세 유입','반등 기대'],
  'bearish_pin':['하락 핀바','긴 윗꼬리','매도 압력','저항 확인'],
  'marubozu_bull':['장대양봉','강한 매수세','상승 지속','꼬리 없는 양봉'],
  'marubozu_bear':['장대음봉','강한 매도세','하락 지속','꼬리 없는 음봉'],
  'spinning_top':['스피닝탑','팽이형','방향 미정','변동성 대기'],
};

// S54: 매매 기법 키워드
SXI._techniqueKeywords = {
  breakout:['돌파 매매','저항선 돌파','박스권 돌파','신고가 돌파','거래량 돌파','돌파 후 눌림'],
  pullback:['눌림목 매매','조정 매수','되돌림 매수','이평선 눌림','지지선 매수','1차 눌림'],
  swing:['스윙 매매','파동 매매','고점 매도','저점 매수','N자형 패턴','ABC 조정'],
  scalp:['단타 매매','초단타','스캘핑','호가창 매매','1분봉 매매','틱 매매'],
  position:['포지션 매매','장기 투자','가치 투자','배당 투자','적립식 매수'],
  divergence:['다이버전스 매매','역행 신호','오실레이터 괴리','기술적 괴리'],
  gap:['갭 매매','갭상승','갭하락','시초가 갭','장초반 갭 메우기','갭 지지'],
  channel:['채널 매매','추세선 매매','상승 채널','하락 채널','채널 이탈'],
};

// S54: 수급/투자자 키워드
SXI._investorKeywords = {
  foreign_buy:['외국인 순매수','외국인 매집','외국인 보유 비중','글로벌 자금 유입'],
  foreign_sell:['외국인 순매도','외국인 이탈','외국인 비중 감소'],
  inst_buy:['기관 순매수','기관 매집','연기금 매수','투신 매수','사모펀드'],
  inst_sell:['기관 순매도','기관 이탈','프로그램 매도'],
  program:['프로그램 매매','알고리즘 매매','차익거래','비차익거래'],
  retail:['개인 순매수','개인투자자','동학개미','개인 비중','개인 매수세'],
  short:['공매도','공매도 잔고','대차잔고','숏커버링','공매도 과열'],
};

// S54: 재무/밸류에이션 키워드
SXI._valuationKeywords = {
  value:['저PER주','저PBR주','가치주','저평가주','자산가치','내재가치','할인율'],
  growth:['성장주','고성장','매출 성장','실적 개선','어닝 서프라이즈','컨센서스 상회'],
  dividend:['배당주','고배당','배당수익률','배당성향','배당 성장','배당락','중간배당'],
  turnaround:['턴어라운드','실적 반등','적자 탈출','흑자 전환','구조조정','체질 개선'],
  event:['실적 발표','분기 실적','연간 실적','어닝시즌','IR','공시','유상증자','무상증자','액면분할','자사주 매입','CB 전환'],
};

// S54: 차트 분석 키워드  
SXI._chartKeywords = {
  support:['지지선','지지 확인','지지 반등','강한 지지','지지 이탈','핵심 지지'],
  resistance:['저항선','저항 돌파','저항 매물대','매물벽','저항 테스트','천장권'],
  trendline:['추세선','상승 추세선','하락 추세선','추세선 이탈','추세선 지지'],
  pattern:['차트 패턴','쌍바닥','쌍봉','헤드앤숄더','역헤드앤숄더','삼각수렴','깃발형','쐐기형','컵앤핸들','원형 바닥'],
  volume_analysis:['거래량 분석','거래대금 분석','거래량 이동평균','OBV','거래량 프로필','매물대 분석'],
  fibonacci:['피보나치','피보나치 되돌림','38.2% 되돌림','61.8% 되돌림','황금비율'],
  elliott:['엘리엇 파동','1파','3파','5파','조정파','충격파','파동 분석'],
};




// ════════════════════════════════════════════════════════════
//  [S320] 밸류에이션 판정 — PER 기반 적정주가 + PER/PBR 종합 라벨
//    용도:
//      1) 분석 모달 헤더 "현재가" 밑 적정주가 1줄 (PER 11배/20배 기준)
//      2) 재무 카드 PER 위 종합 밸류에이션 라벨 (PER+PBR 결합)
//    시장별 기준 PER:
//      - 한국 (kr): 11배 (KOSPI 역사적 평균)
//      - 미국 (us): 20배 (S&P 500 역사적 평균)
//      - 코인: 호출 측에서 회피 (EPS/PER 개념 없음)
//    PER 단계 (괴리율 기준, 5단계 + 평가불가):
//      ≤ -20%: 저평가 (0)
//      -20% ~ -10%: 약간 저평가 (1)
//      -10% ~ +10%: 적정 (2)  ← 녹색
//      +10% ~ +30%: 약간 고평가 (3)
//      > +30%: 고평가 (4)
//      EPS ≤ 0 (적자): 평가 불가 (-1)
//    PBR 단계 (절대값 기준, 4단계 매핑):
//      ≤ 1.0: 저평가 (0)
//      1.0 ~ 3.0: 적정 (2)
//      3.0 ~ 5.0: 약간 고평가 (3)
//      > 5.0: 고평가 (4)
//    종합 판정:
//      - 둘 다 평가불가 → 평가 불가 (⚪)
//      - 한쪽만 평가가능 → 그쪽 단독 판정
//      - PER/PBR 단계 차이 ≥ 2 → 혼조 (🟡)
//      - 그 외 → 평균 단계
//    농심 검증: PER 13.6배(약간 고평가=3) + PBR 0.81배(저평가=0)
//              → 차이 3 ≥ 2 → 혼조 ✓
//              → 적정주가 = 29,342 × 11 = 322,762원
//              → 괴리율 (400,000-322,762)/322,762 = +23.9% → 약간 고평가 ✓
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
//  [S326] PER 평가 부적합 분류 감지 (isPerInadequate)
// ════════════════════════════════════════════════════════════════════
//  〔배경〕 PER × EPS 기반 적정/목표주가는 다음 분류에서 의미가 매우 약함:
//    1) 지주회사: 자회사 지분가치(NAV)로 평가해야 함 (두산 +3668% 같은 왜곡 발생)
//    2) 금융업 (은행/보험/증권): 자본 구조가 달라 PBR·ROE가 더 적합
//    3) 리츠 (REITs): P/FFO·배당수익률 기반
//    4) 자원/광산: 원자재 사이클이라 PER 변동 큼 — EV/EBITDA·PBR 적합
//    5) 석유정제/에너지: 자원 카테고리 (정유 마진 사이클)
//    6) 부동산 임대/시행: NAV·P/FFO 적합
//
//  〔감지 우선순위〕 정확도 높은 순:
//    1) 종목명 (항상 사용 가능) — "지주", "홀딩스", "Holdings", "리츠", "REIT"
//    2) KRX 업종 인덱스 sector (결과탭부터 사용 가능) — "금융업", "은행", "증권", "보험"
//    3) KSIC industry_code (분석탭 진입 후 DART에서 받음) — 051~080(광업), 191~192(석유정제), 641~662(금융), 681~682(부동산)
//
//  〔반환〕 { unsuitable: bool, category: string, tip: string }
//          unsuitable=false면 정상 PER 평가 진행
// ════════════════════════════════════════════════════════════════════
SXI.isPerInadequate = function(stock){
  if(!stock) return { unsuitable: false };

  const name = String(stock.name || '');
  const code = String(stock.code || '');
  const sector = String(stock.sector || '');                            // KRX IDX_NM
  const ksicCode = String(stock.industryCode || stock._industryCode || '').trim();
  const isUS = stock._mkt === 'us';

  // [S326] 알려진 한국 대기업 지주회사 — 종목명에 "지주"/"홀딩스" 없는 케이스 보강
  //   KSIC 715(회사 본부) 분류에 등록 안 되어 있거나 정보가 시점차로 미도달 시 안전망
  //   메이저 지주사 위주로 최소화 (false positive 방지)
  const KR_HOLDING_CODES = new Set([
    '003550', // LG
    '034730', // SK
    '078930', // GS
    '180640', // 한진칼
    '001040', // CJ
    '000150', // 두산
    '004800', // 효성
    '002020', // 코오롱
    '267250', // HD현대
    '028260', // 삼성물산 (사실상 그룹 지주)
    '003490', // 대한항공 (한진칼 자회사이나 별도 사례)
    '383800', // LX홀딩스 (홀딩스로 이미 잡히나 보강)
  ]);

  // 1) 지주회사 (종목명) — 한국: "지주", "홀딩스" / 미국: "Holdings"
  if(/지주|홀딩스/.test(name)){
    return { unsuitable:true, category:'지주회사', tip:'자회사 NAV 기반 평가가 적합 (PER 평가 부적합)' };
  }
  if(isUS && /\bHoldings\b/i.test(name)){
    return { unsuitable:true, category:'지주회사 (Holdings)', tip:'NAV 기반 평가가 적합' };
  }

  // 1-b) 알려진 한국 대기업 지주사 (화이트리스트)
  if(!isUS && KR_HOLDING_CODES.has(code)){
    return { unsuitable:true, category:'지주회사', tip:'그룹 지주 — 자회사 NAV 기반 평가가 적합' };
  }

  // 1-c) KSIC 715 (회사 본부 및 경영 컨설팅) — 한국 표준 지주회사 분류
  if(/^715$/.test(ksicCode)){
    return { unsuitable:true, category:'지주회사', tip:'자회사 NAV 기반 평가가 적합' };
  }

  // 2) 리츠 (REITs) — 종목명 기반
  if(/리츠/.test(name)){
    return { unsuitable:true, category:'리츠 (부동산투자신탁)', tip:'P/FFO·배당수익률 기반 평가가 적합' };
  }
  if(isUS && /\bREIT\b|\bRealty\b|\sTrust$/i.test(name)){
    return { unsuitable:true, category:'리츠 (REIT)', tip:'P/FFO·배당수익률 기반 평가가 적합' };
  }

  // 3) 금융업 — KRX sector 기반 (이미 fin._isFinancial로 advFundamental에서 처리되지만 이중 안전망)
  //   주의: "기타금융"은 지주사가 들어갈 수 있어 위에서 먼저 처리됨
  if(/금융|은행|보험|증권/.test(sector)){
    return { unsuitable:true, category:'금융업', tip:'PBR·ROE 기반 평가가 적합 (자본 구조 차이)' };
  }
  // KSIC 코드: 641~649(은행/저축), 651~653(보험), 661~662(금융서비스)
  if(/^(641|642|649|651|652|653|661|662)$/.test(ksicCode)){
    return { unsuitable:true, category:'금융업', tip:'PBR·ROE 기반 평가가 적합' };
  }

  // 4) 자원/광산 — KSIC 051~080
  if(/^(051|052|061|062|071|072|080)$/.test(ksicCode)){
    return { unsuitable:true, category:'자원/광산', tip:'원자재 사이클 — EV/EBITDA·PBR 기반 평가가 적합' };
  }

  // 5) 석유정제 — KSIC 191~192
  if(/^(191|192)$/.test(ksicCode)){
    return { unsuitable:true, category:'석유정제/에너지', tip:'정유 마진 사이클 — Forward PER·EV/EBITDA 권장' };
  }

  // 6) 부동산 임대/시행 — KSIC 681~682
  if(/^(681|682)$/.test(ksicCode)){
    return { unsuitable:true, category:'부동산', tip:'P/FFO·NAV 기반 평가가 적합' };
  }

  // 정상 케이스 — PER 평가 적합
  return { unsuitable:false };
};

// ════════════════════════════════════════════════════════════════════
//  [S327 Phase 2] 종목별 historical 평균 PER 계산 (calcHistoricalPer)
// ════════════════════════════════════════════════════════════════════
//  〔배경〕 시장평균 PER(KR 11배 / US 20배) 고정값 대신 종목 자체 historical 평균 사용
//          → 종목 특성 반영 + 두산 같은 왜곡 완화 (Phase 1 부적합 감지와 결합)
//
//  〔입력〕
//    - historicalEps: [{ year: 2024, eps: 29342 }, ...] (year 내림차순)
//    - candles: 일봉 시계열 [{ date: 'YYYY-MM-DD', close: number, ... }, ...]
//
//  〔로직〕 각 회계연도에 대해:
//    1) 그 연도 종료일(12-31)에 가장 가까운 candle의 close 사용
//    2) PER = close / eps (eps>0인 흑자 해만 사용)
//    3) 흑자 해가 ≥2개일 때만 평균 PER 반환 (1개면 신뢰도 부족 → null 반환)
//
//  〔단순화 사유〕 결산월이 다른 종목(예: Apple 9월 결산) 있지만, 평균에 미치는 영향은 작음
//                정확한 결산월 매칭은 향후 개선 (현재는 12-31 기준 단일)
//
//  〔반환〕 { avgPer: number|null, validYears: number, minPer: number, maxPer: number, stdev: number }
//          validYears < 2 시 avgPer = null (시장평균 폴백 사용)
// ════════════════════════════════════════════════════════════════════
SXI.calcHistoricalPer = function(historicalEps, candles){
  if(!Array.isArray(historicalEps) || historicalEps.length === 0) return { avgPer:null, validYears:0 };
  if(!Array.isArray(candles) || candles.length === 0) return { avgPer:null, validYears:0 };

  const perList = [];
  const perDetails = [];     // 디버그용 ({ year, eps, close, per })

  for(const e of historicalEps){
    if(!e || e.year == null || e.eps == null) continue;
    if(e.eps <= 0) continue;                       // 적자 해 제외

    // 해당 연도 12-31에 가장 가까운 candle 찾기
    const targetDate = `${e.year}-12-31`;
    let bestCandle = null, bestDiff = Infinity;
    for(const c of candles){
      if(!c || !c.date || c.close == null || c.close <= 0) continue;
      // [S329] candle.date 형식 정규화 — 'YYYYMMDD'(KIS/네이버 일부) → 'YYYY-MM-DD'
      //   원인: new Date('20231205')는 Invalid Date → getTime()=NaN → 매칭 영영 실패
      //   해결: 8자리 숫자만 있으면 하이픈 추가, 이미 'YYYY-MM-DD'면 그대로 사용
      let cd = String(c.date).slice(0, 10);
      if(/^\d{8}$/.test(cd)){
        cd = cd.slice(0, 4) + '-' + cd.slice(4, 6) + '-' + cd.slice(6, 8);
      }
      // 같은 연도만 매칭 (12월 종가 우선, 12월 없으면 그 연도 마지막 영업일)
      if(cd.slice(0, 4) !== String(e.year)) continue;
      const d = Math.abs(new Date(cd).getTime() - new Date(targetDate).getTime());
      if(d < bestDiff){
        bestDiff = d;
        bestCandle = c;
      }
    }
    if(!bestCandle) continue;

    const per = bestCandle.close / e.eps;
    // 이상치 제거 (PER 5~80 범위만 평균에 포함) — 일시적 EPS 변동/구조변화 방어
    if(per < 5 || per > 80) continue;

    perList.push(per);
    perDetails.push({ year: e.year, eps: e.eps, close: bestCandle.close, per: per });
  }

  if(perList.length < 2) return { avgPer:null, validYears: perList.length, details: perDetails };

  const avg = perList.reduce((a, b) => a + b, 0) / perList.length;
  const min = Math.min(...perList);
  const max = Math.max(...perList);
  const variance = perList.reduce((a, b) => a + (b - avg) * (b - avg), 0) / perList.length;
  const stdev = Math.sqrt(variance);

  return {
    avgPer: avg,
    validYears: perList.length,
    minPer: min,
    maxPer: max,
    stdev: stdev,
    details: perDetails
  };
};

SXI.valuationJudge = function(fin, price, stock, historicalPer, marketPerData){
  if(!fin) return null;

  // [S326] PER 평가 부적합 감지 — 지주사/금융/리츠/자원/광산 등은 PER 평가가 의미 없음
  //   감지 시: fairPrice/targetPrice 둘 다 null 유지 + unsuitable 플래그 + category/tip 반환
  //   렌더링에서 unsuitable 시 적정/목표주가 행 자체 숨김 + 안내 박스 표시
  const inadeq = (typeof SXI.isPerInadequate === 'function') ? SXI.isPerInadequate(stock) : { unsuitable:false };

  const isUS = stock && stock._mkt === 'us';
  // [S327/S338] PER 폴백 우선순위:
  //   1순위: 종목별 historical 평균 PER (Phase 2) — 가장 정확, 종목 특성 반영
  //   2순위: KOSIS 시총 규모별 PER (KR만, [S338]) — 시장 사이클 + 규모 반영
  //   3순위: 시장평균 PER 하드코딩 (KR 11/US 20) — 최후 폴백
  //   benchPer (적정 PER): 위에서 선택된 값
  //   targetPer (목표 PER): benchPer × 1.20 (낙관선 시나리오)
  let benchPer, targetPer, perSource;
  if(historicalPer && historicalPer.avgPer != null && historicalPer.validYears >= 2){
    // [1순위] 종목별 historical 평균
    benchPer = historicalPer.avgPer;
    targetPer = historicalPer.avgPer * 1.20;
    perSource = `${historicalPer.validYears}년 평균 PER`;
  } else if(!isUS && marketPerData && marketPerData.avgRecent != null && marketPerData.avgRecent > 0){
    // [2순위] KOSIS 시총 규모별 12개월 평균 (한국 종목만 KOSIS 데이터 있음)
    //   12개월 평균 사용 — 월별 변동 흡수, 시장 사이클 반영
    benchPer = marketPerData.avgRecent;
    targetPer = marketPerData.avgRecent * 1.20;
    const catLabel = marketPerData.category === 'KOSPI' ? 'KOSPI' : marketPerData.category;
    perSource = `${catLabel} 최근평균 PER`;
  } else {
    // [3순위] 시장평균 하드코딩 폴백
    benchPer = isUS ? 20 : 11;
    targetPer = isUS ? 25 : 15;
    perSource = `시장평균 PER ${benchPer}배`;
  }

  // [S326] 부적합 분류면 fairPrice/targetPrice 산출 자체를 건너뛰고 안내만 반환
  //   PBR/PER stage 정보는 그대로 계산 (재무카드 색상 등 다른 곳에서 사용)
  if(inadeq.unsuitable){
    // PBR 단독 판정만 유지 (재무카드 PBR 색상 등에 필요)
    let pbrStage = -1;
    if(fin.pbr != null && fin.pbr > 0){
      if(fin.pbr <= 1.0) pbrStage = 0;
      else if(fin.pbr <= 3.0) pbrStage = 2;
      else if(fin.pbr <= 5.0) pbrStage = 3;
      else pbrStage = 4;
    }
    return {
      // 가격 행 모두 null — 렌더링에서 unsuitable 시 행 자체 숨김
      fairPrice: null, diffPct: null, benchPer: benchPer, isUS: isUS,
      targetPrice: null, targetDiffPct: null, targetPer: targetPer,
      fwdEps: null, epsGrowthUsed: null,
      // 부적합 안내용
      unsuitable: true,
      unsuitCategory: inadeq.category,
      unsuitTip: inadeq.tip,
      // PER 단독 (없음)
      perStage: -1, perLabel: '평가불가', perColor: 'var(--text3)', perOpacity: 0.6,
      // PBR 단독 유지
      pbrStage: pbrStage,
      pbrLabel: pbrStage>=0 ? ['저평가','약간 저평가','적정','약간 고평가','고평가'][pbrStage] : '평가불가',
      // 종합 (재무카드 밸류에이션 라인용) — 평가불가 처리
      overallStage: -1, overallLabel: '평가불가',
      overallEmoji: '⚪', overallColor: 'var(--text3)', overallOpacity: 0.6,
      overallSubLabel: `${inadeq.category} — PER 평가 부적합`
    };
  }

  // ── PER 단독 판정 (적정주가 계산 + 5단계) ──
  let perStage = -1;
  let fairPrice = null;
  let diffPct = null;
  let targetPrice = null;
  let targetDiffPct = null;
  let fwdEps = null;
  let epsGrowthUsed = null;
  if(fin.eps != null && fin.eps > 0 && price != null && price > 0){
    // 적정주가 (보수, 시장평균 PER)
    fairPrice = fin.eps * benchPer;
    diffPct = (price - fairPrice) / fairPrice * 100;
    if(diffPct <= -20) perStage = 0;
    else if(diffPct <= -10) perStage = 1;
    else if(diffPct <= 10) perStage = 2;
    else if(diffPct <= 30) perStage = 3;
    else perStage = 4;

    // [S325] 목표주가 (낙관, 12M Fwd EPS × Target PER)
    //   epsGrowth를 ±30% 클램프 후 적용 (적자 회복/이상치 방어)
    //   ROE/매출성장 등 fallback 없이 epsGrowth만 사용 (가장 정확한 지표)
    let g = (typeof fin.epsGrowth === 'number' && isFinite(fin.epsGrowth)) ? fin.epsGrowth : 0;
    if(g > 30) g = 30;
    if(g < -30) g = -30;
    epsGrowthUsed = g;
    fwdEps = fin.eps * (1 + g / 100);
    targetPrice = fwdEps * targetPer;
    targetDiffPct = (targetPrice - price) / price * 100;
  }

  // ── PBR 단독 판정 (4단계 매핑) ──
  let pbrStage = -1;
  if(fin.pbr != null && fin.pbr > 0){
    if(fin.pbr <= 1.0) pbrStage = 0;
    else if(fin.pbr <= 3.0) pbrStage = 2;
    else if(fin.pbr <= 5.0) pbrStage = 3;
    else pbrStage = 4;
  }

  // ── 종합 단계 결정 ──
  // stage: -1=평가불가, 0=저평가, 1=약간저평가, 2=적정, 3=약간고평가, 4=고평가, 5=혼조
  let overallStage;
  if(perStage < 0 && pbrStage < 0) overallStage = -1;
  else if(perStage < 0) overallStage = pbrStage;
  else if(pbrStage < 0) overallStage = perStage;
  else if(Math.abs(perStage - pbrStage) >= 2) overallStage = 5;
  else overallStage = Math.round((perStage + pbrStage) / 2);

  // ── 라벨/이모지/색상 매핑 ──
  const stageToLabel = (s) => {
    switch(s){
      case 0: return '저평가';
      case 1: return '약간 저평가';
      case 2: return '적정';
      case 3: return '약간 고평가';
      case 4: return '고평가';
      case 5: return '혼조';
      default: return '평가 불가';
    }
  };
  const stageToEmoji = (s) => {
    switch(s){
      case 0: return '🔵';
      case 1: return '🔵';
      case 2: return '🟢';
      case 3: return '🟠';
      case 4: return '🔴';
      case 5: return '🟡';
      default: return '⚪';
    }
  };
  // 색상: 적정=녹색(buy), 저평가군=파랑(accent), 고평가군=빨강(sell), 혼조=노랑(amber), 평가불가=회색(text3)
  const stageToColor = (s) => {
    switch(s){
      case 0: case 1: return 'var(--accent)';
      case 2: return 'var(--buy)';
      case 3: case 4: return 'var(--sell)';
      case 5: return '#f59e0b';
      default: return 'var(--text3)';
    }
  };
  // 약간 단계는 opacity로 톤다운 (저평가/고평가는 진한 색)
  const stageToOpacity = (s) => (s === 1 || s === 3) ? '0.75' : '1';

  // ── 서브 라벨 조립 ("PER 약간 고평가 · PBR 저평가") ──
  const subParts = [];
  if(perStage >= 0) subParts.push(`PER ${stageToLabel(perStage)}`);
  if(pbrStage >= 0) subParts.push(`PBR ${stageToLabel(pbrStage)}`);

  return {
    // 적정주가 1줄용
    fairPrice: fairPrice,
    diffPct: diffPct,
    benchPer: benchPer,
    isUS: isUS,
    // [S327 Phase 2] PER 출처 라벨 — UI에 "5년 평균 PER 13.2배 기준" 같이 표시
    //   시장평균 폴백 시: "시장평균 PER 11배"
    //   historical 사용 시: "3년 평균 PER" (validYears 표시)
    perSource: perSource,
    historicalPer: historicalPer || null,
    marketPerData: marketPerData || null,    // [S338] KOSIS 시총 규모별 PER (UI 라벨용)
    // [S325] 목표주가 (낙관 시나리오) — 적정주가 위에 별도 표시
    //   = 12M Fwd EPS × Target PER
    //   - fwdEps:  EPS × (1 + epsGrowth, ±30% 클램프)
    //   - targetPer: 시장평균 = KR 15배/US 25배 / historical 사용 시 = 평균 PER × 1.20
    //   - targetDiffPct: (목표가 - 현재가) / 현재가 × 100 (양수=상승여력, 음수=하락여지)
    targetPrice: targetPrice,
    targetDiffPct: targetDiffPct,
    targetPer: targetPer,
    fwdEps: fwdEps,
    epsGrowthUsed: epsGrowthUsed,
    // PER 단독 (적정주가 라인 색상에 사용)
    perStage: perStage,
    perLabel: stageToLabel(perStage),
    perColor: stageToColor(perStage),
    perOpacity: stageToOpacity(perStage),
    // PBR 단독
    pbrStage: pbrStage,
    pbrLabel: stageToLabel(pbrStage),
    // 종합 (재무카드 밸류에이션 라인용)
    overallStage: overallStage,
    overallLabel: stageToLabel(overallStage),
    overallEmoji: stageToEmoji(overallStage),
    overallColor: stageToColor(overallStage),
    overallOpacity: stageToOpacity(overallStage),
    overallSubLabel: subParts.join(' · ')
  };
};

// ════════════════════════════════════════════════════════════
//  S55: 재무제표 해석 (advFundamental)
//  [PLAN_7-B] 옵셔널 3번째 인자 stock — 금융업 감지용
//    하위 호환: stock 미전달 시 fin._isFinancial 플래그 또는 fin 자체에서 추론
// ════════════════════════════════════════════════════════════
SXI.advFundamental = function(fin, price, stock){
  if(!fin) return null;
  const lines = [];
  let tone = 'neutral';
  let bullCount = 0, bearCount = 0;

  // [S277-C] 미국 종목 판별 + 단위 포맷 헬퍼
  //   배경: EPS/BPS 해석 카드에 "원" 표기 잘못됨 (미국 종목 분석 시 오해 유발)
  //   해결: 미국이면 EPS "$X.XX", BPS "$X" 형식, 한국은 기존 "X원" 유지
  const _isUS_fin = stock && stock._mkt === 'us';
  const _fmtEpsUnit = (v) => _isUS_fin ? `$${v.toFixed(2)}` : `${v.toLocaleString()}원`;
  const _fmtBpsUnit = (v) => _isUS_fin ? `$${Math.round(v).toLocaleString()}` : `${Math.round(v).toLocaleString()}원`;

  // [PLAN_7-B] 금융업 여부 판정 — 우선순위:
  //   1) fin._isFinancial 명시값 (호출자가 미리 계산한 경우)
  //   2) stock 인자 기반 SXI.isFinancialIndustry
  //   기본값 false — 구조적으로 안전한 쪽 (금융업 미판정 시 일반 종목으로 처리)
  const isFinancial = (fin._isFinancial != null)
    ? !!fin._isFinancial
    : (stock ? SXI.isFinancialIndustry(stock) : false);

  // ── 밸류에이션 ──
  if(fin.per != null){
    if(fin.per < 0){
      lines.push(`PER ${fin.per.toFixed(1)}배 — 적자 상태입니다. 순이익이 마이너스이므로 PER 지표의 유효성이 떨어집니다. 턴어라운드 가능성이나 매출 추이를 별도 확인해야 합니다.`);
      bearCount += 2;
    } else if(fin.per <= 8){
      lines.push(`PER ${fin.per.toFixed(1)}배 — 극저평가 구간입니다. 시장이 이 기업의 성장성을 낮게 보거나, 일시적 실적 호조에 기인할 수 있습니다. 이익의 지속가능성을 확인하면 가치 투자 매력이 높습니다.`);
      bullCount += 2;
    } else if(fin.per <= 15){
      lines.push(`PER ${fin.per.toFixed(1)}배 — 적정~저평가 구간입니다. 업종 평균 대비 매력적인 밸류에이션으로, 실적이 유지된다면 안전마진이 존재합니다.`);
      bullCount += 1;
    } else if(fin.per <= 30){
      lines.push(`PER ${fin.per.toFixed(1)}배 — 보통 수준입니다. 시장의 성장 기대가 반영된 가격이며, 실적 성장률이 PER을 정당화하는지가 관건입니다.`);
    } else {
      lines.push(`PER ${fin.per.toFixed(1)}배 — 고평가 구간입니다. 높은 성장 기대가 이미 주가에 반영되어 있으며, 실적 미달 시 급락 위험이 있습니다.`);
      bearCount += 1;
    }
  }

  if(fin.pbr != null){
    if(fin.pbr > 0 && fin.pbr <= 0.7){
      lines.push(`PBR ${fin.pbr.toFixed(2)}배 — 장부가치 대비 30% 이상 할인 거래 중입니다. 자산가치 대비 저렴하나, 수익성이 낮거나 구조적 문제가 있을 수 있습니다.`);
      bullCount += 1;
    } else if(fin.pbr > 0 && fin.pbr <= 1.5){
      lines.push(`PBR ${fin.pbr.toFixed(2)}배 — 적정 수준입니다. 자산가치와 시장가치가 비교적 균형을 이루고 있습니다.`);
    } else if(fin.pbr > 3){
      lines.push(`PBR ${fin.pbr.toFixed(2)}배 — 장부가치 대비 높은 프리미엄입니다. 무형자산·브랜드가치가 크거나, 시장의 과도한 기대가 반영된 상태입니다.`);
      bearCount += 1;
    }
  }

  // ── 수익성 ──
  if(fin.roe != null){
    if(fin.roe >= 20){
      lines.push(`ROE ${fin.roe.toFixed(1)}% — 매우 우수한 자기자본수익률입니다. 주주자본 대비 효율적인 이익 창출이 이루어지고 있어, 주가 상승의 펀더멘털 동력이 됩니다.`);
      bullCount += 2;
    } else if(fin.roe >= 10){
      lines.push(`ROE ${fin.roe.toFixed(1)}% — 양호한 수익성입니다. 자본 효율이 적절하며, 안정적 이익 구조를 갖추고 있습니다.`);
      bullCount += 1;
    } else if(fin.roe >= 0){
      lines.push(`ROE ${fin.roe.toFixed(1)}% — 낮은 수익성입니다. 자본 대비 이익 창출력이 약하며, 개선 모멘텀이 필요합니다.`);
    } else {
      lines.push(`ROE ${fin.roe.toFixed(1)}% — 자기자본이 잠식되고 있습니다. 적자 구조가 지속되면 재무건전성 악화로 이어질 수 있습니다.`);
      bearCount += 2;
    }
  }

  // ── 안정성 ──
  if(fin.debtRatio != null){
    if(fin.debtRatio > 300){
      lines.push(`부채비율 ${fin.debtRatio.toFixed(0)}% — 재무 위험이 매우 높습니다. 금리 상승이나 매출 감소 시 유동성 위기 가능성이 있으며, 손절 기준을 타이트하게 설정해야 합니다.`);
      bearCount += 2;
    } else if(fin.debtRatio > 200){
      lines.push(`부채비율 ${fin.debtRatio.toFixed(0)}% — 다소 높은 수준입니다. 업종 특성을 감안하더라도 레버리지 리스크에 주의가 필요합니다.`);
      bearCount += 1;
    } else if(fin.debtRatio > 100){
      lines.push(`부채비율 ${fin.debtRatio.toFixed(0)}% — 적정 범위입니다.`);
    } else {
      lines.push(`부채비율 ${fin.debtRatio.toFixed(0)}% — 재무구조가 매우 건전합니다. 무차입 또는 저차입 경영으로, 금리 변동에 대한 내성이 강합니다.`);
      bullCount += 1;
    }
  }

  // [Phase 1-C] 순부채비율 = (총부채 - 현금) / 자기자본 × 100
  //   부채비율(D/E)이 단순히 부채 규모를 보는 반면, 순부채비율은 보유현금을 차감하여
  //   "실질 차입 부담"을 보여줌. 음수는 넷캐시 상태(현금 > 부채)로 매우 건전.
  if(fin.netDebtRatio != null){
    if(fin.netDebtRatio < -20){
      lines.push(`순부채비율 ${fin.netDebtRatio.toFixed(1)}% — 넷캐시 상태입니다. 보유현금이 총부채를 크게 상회해, 자사주매입·배당·M&A 등 자본활용 여력이 풍부합니다.`);
      bullCount += 2;
    } else if(fin.netDebtRatio < 0){
      lines.push(`순부채비율 ${fin.netDebtRatio.toFixed(1)}% — 보유현금이 총부채보다 많은 약한 넷캐시 상태입니다. 재무 안정성이 양호합니다.`);
      bullCount += 1;
    } else if(fin.netDebtRatio < 50){
      lines.push(`순부채비율 +${fin.netDebtRatio.toFixed(1)}% — 자기자본 대비 실질 차입 부담이 낮은 편입니다. 재무구조가 안정적입니다.`);
    } else if(fin.netDebtRatio < 100){
      lines.push(`순부채비율 +${fin.netDebtRatio.toFixed(1)}% — 자기자본 수준의 실질 차입이 있습니다. 금리 환경에 따라 이자비용 부담이 커질 수 있어 주시가 필요합니다.`);
    } else {
      lines.push(`순부채비율 +${fin.netDebtRatio.toFixed(1)}% — 자기자본 대비 실질 차입이 매우 큽니다. 금리 상승기 이자비용 급증으로 수익성이 압박받을 수 있습니다.`);
      bearCount += 1;
    }
  }

  // ── 배당 ──
  if(fin.dividendYield != null && fin.dividendYield > 0){
    if(fin.dividendYield >= 4){
      lines.push(`배당수익률 ${fin.dividendYield.toFixed(1)}% — 고배당주입니다. 하락 시 배당 수익이 하방을 지지하며, 장기 보유 매력이 높습니다.`);
      bullCount += 1;
    } else if(fin.dividendYield >= 2){
      lines.push(`배당수익률 ${fin.dividendYield.toFixed(1)}% — 양호한 배당입니다. 예금 금리 대비 매력적인 수준으로, 하락 국면에서 안전판 역할을 합니다.`);
    } else {
      lines.push(`배당수익률 ${fin.dividendYield.toFixed(1)}% — 소폭 배당이 있습니다.`);
    }
  }

  // ── EPS ──
  if(fin.eps != null){
    if(fin.eps > 0){
      lines.push(`EPS ${_fmtEpsUnit(fin.eps)} — 주당 순이익이 양수입니다. ${price ? `현재가 대비 이익수익률은 ${((fin.eps/price)*100).toFixed(1)}%입니다.`:''}`.trim());
    } else if(fin.eps < 0){
      lines.push(`EPS ${_fmtEpsUnit(fin.eps)} — 주당 순손실 상태입니다.`);
    }
  }

  // ── S60: ROA ──
  if(fin.roa != null){
    if(fin.roa >= 15){
      lines.push(`ROA ${fin.roa.toFixed(1)}% — 총자산수익률이 극히 우수합니다. 보유 자산 대비 이익 창출 효율이 최상위권이며, 자본 배분 능력이 뛰어난 경영진이 있음을 시사합니다. 동종 업계 평균 대비 프리미엄을 정당화할 수 있는 수준이고, 이 효율이 유지되는 한 복리 성장 효과가 주가에 긍정적으로 작용합니다.`);
      bullCount += 2;
    } else if(fin.roa >= 8){
      lines.push(`ROA ${fin.roa.toFixed(1)}% — 총자산수익률이 우수합니다. 설비·재고·매출채권 등 투하자본 대비 수익 창출이 효율적이며, 자산 경량 비즈니스 모델이거나 높은 가동률을 유지하고 있을 가능성이 높습니다. ROE와 함께 보면 레버리지 없이 자체 수익력이 강한지 판단할 수 있습니다.`);
      bullCount += 1;
    } else if(fin.roa >= 3){
      lines.push(`ROA ${fin.roa.toFixed(1)}% — 보통 수준의 자산수익률입니다. 제조업·건설업 등 대규모 설비가 필요한 업종이라면 무난하지만, IT·서비스업이라면 자산 활용 효율 개선 여지가 있습니다. 동종 업계 ROA 평균과 비교하여 상대적 위치를 확인하세요.`);
    } else if(fin.roa >= 0){
      lines.push(`ROA ${fin.roa.toFixed(1)}% — 낮은 자산수익률입니다. 대규모 투자 후 아직 수익이 본격화되지 않았거나, 자산 회전율이 낮아 비효율이 존재합니다. 향후 매출 확대로 자산 가동률이 올라가면 개선 가능하지만, 현 상태에서는 투자 매력이 제한적입니다.`);
    } else {
      lines.push(`ROA ${fin.roa.toFixed(1)}% — 자산 대비 순손실 상태입니다. 보유 자산이 이익을 창출하지 못하고 오히려 비용만 발생시키고 있으며, 이 상태가 지속되면 자산 매각이나 구조조정 압력이 커집니다. 턴어라운드 시점을 면밀히 모니터링해야 합니다.`);
      bearCount += 2;
    }
  }

  // ── S60: 영업이익률 ──
  if(fin.operatingMargin != null){
    if(fin.operatingMargin >= 25){
      lines.push(`영업이익률 ${fin.operatingMargin.toFixed(1)}% — 매출 4분의 1 이상이 영업이익으로 남는 고마진 기업입니다. 브랜드 파워, 기술 독점, 또는 네트워크 효과로 강력한 가격 결정력을 보유하고 있으며, 원가 상승이나 경기 둔화에도 이익 방어력이 뛰어납니다. 이런 마진이 3년 이상 유지되면 경제적 해자(moat)가 있다고 볼 수 있습니다.`);
      bullCount += 2;
    } else if(fin.operatingMargin >= 15){
      lines.push(`영업이익률 ${fin.operatingMargin.toFixed(1)}% — 높은 마진율입니다. 본업에서의 수익 구조가 탄탄하며, 매출 변동이 있어도 흑자를 유지할 수 있는 비용 구조를 갖추고 있습니다. 경쟁사 대비 원가 우위나 차별화된 제품·서비스가 마진을 뒷받침하는지 확인하면 투자 확신을 높일 수 있습니다.`);
      bullCount += 1;
    } else if(fin.operatingMargin >= 5){
      lines.push(`영업이익률 ${fin.operatingMargin.toFixed(1)}% — 적정 수준의 마진입니다. 업종 평균 부근으로, 안정적이지만 경쟁 심화나 원가 상승 시 마진 압박을 받을 수 있습니다. 매출 성장률과 함께 보면서 마진이 개선 추세인지 악화 추세인지 방향성이 더 중요합니다.`);
    } else if(fin.operatingMargin >= 0){
      lines.push(`영업이익률 ${fin.operatingMargin.toFixed(1)}% — 박리다매형 사업 구조이거나 비용 효율화가 필요한 상황입니다. 매출 규모가 크더라도 이익으로 남는 비율이 적어, 금리 인상이나 원자재 가격 상승 등 외부 변수에 취약합니다. 비용 구조 개선 계획이 있는지 살펴보세요.`);
    } else {
      lines.push(`영업이익률 ${fin.operatingMargin.toFixed(1)}% — 영업적자 상태입니다. 매출로 운영 비용을 감당하지 못하고 있으며, 성장을 위한 의도적 적자(투자 단계)인지, 구조적 수익성 문제인지 반드시 구분해야 합니다. 영업적자가 2분기 이상 지속되면 자금 소진 속도(burn rate)를 체크하세요.`);
      bearCount += 2;
    }
  }

  // ── S60: 순이익률 ──
  if(fin.netMargin != null){
    if(fin.netMargin >= 20){
      lines.push(`순이익률 ${fin.netMargin.toFixed(1)}% — 최종 수익성이 매우 높습니다. 영업이익에서 이자·세금·감가상각을 차감한 후에도 매출의 ${fin.netMargin.toFixed(0)}%가 순이익으로 남으며, 영업외 비용이 적고 세무 효율도 양호합니다. 배당 여력이나 자사주 매입 여력도 충분합니다.`);
      bullCount += 1;
    } else if(fin.netMargin >= 8){
      lines.push(`순이익률 ${fin.netMargin.toFixed(1)}% — 양호한 수준입니다. 영업이익 대비 순이익 차이가 크지 않아 영업외 손실이 적고, 재무 비용 관리가 잘 되고 있습니다.`);
    } else if(fin.netMargin >= 0){
      lines.push(`순이익률 ${fin.netMargin.toFixed(1)}% — 흑자이지만 마진이 얇습니다. 영업이익률과의 차이가 크다면 이자 비용이나 일회성 영업외 손실이 이익을 깎아먹고 있을 수 있습니다. 재무 비용 구조를 함께 점검하세요.`);
    } else if(fin.netMargin >= -10){
      lines.push(`순이익률 ${fin.netMargin.toFixed(1)}% — 순손실 상태입니다. 영업은 흑자인데 순이익이 적자라면 이자 비용이나 환차손 등 영업외 요인이 원인일 수 있습니다. 손실 원인이 일시적인지 구조적인지 파악이 중요합니다.`);
      bearCount += 1;
    } else {
      lines.push(`순이익률 ${fin.netMargin.toFixed(1)}% — 대규모 순손실 상태입니다. 매출 대비 ${Math.abs(fin.netMargin).toFixed(0)}%의 손실이 발생하고 있으며, 자본 잠식 위험이 있습니다. 현금 흐름과 부채 상환 일정을 반드시 확인하세요.`);
      bearCount += 2;
    }
  }

  // ── S60: EBITDA 마진 (근사치) ──
  // [PLAN_7-B] 금융업은 EBITDA 자체가 비적용 — 라인 자체 스킵
  if(fin.ebitdaMargin != null && !isFinancial){
    if(fin.ebitdaMargin >= 30){
      lines.push(`EBITDA 마진 ${fin.ebitdaMargin.toFixed(1)}% — 현금 창출력이 매우 우수합니다. 감가상각·이자·세금 전 이익이 매출의 30% 이상이며, 설비 투자나 부채 상환에 충분한 현금을 생성하고 있습니다. 차입 매수(LBO) 대상으로서도 매력적인 수준입니다 (감가상각 미분리 근사치).`);
      bullCount += 2;
    } else if(fin.ebitdaMargin >= 15){
      lines.push(`EBITDA 마진 ${fin.ebitdaMargin.toFixed(1)}% — 양호한 현금 창출력입니다. 영업활동에서 안정적으로 현금이 유입되고 있으며, EV/EBITDA와 함께 보면 기업가치 대비 현금흐름의 적정성을 판단할 수 있습니다 (근사치).`);
      bullCount += 1;
    } else if(fin.ebitdaMargin >= 5){
      lines.push(`EBITDA 마진 ${fin.ebitdaMargin.toFixed(1)}% — 보통 수준의 현금 창출력입니다 (근사치). 감가상각비가 큰 업종이라면 실제 EBITDA는 이보다 높을 수 있습니다.`);
    } else if(fin.ebitdaMargin >= 0){
      lines.push(`EBITDA 마진 ${fin.ebitdaMargin.toFixed(1)}% — 현금 창출 여력이 미미합니다 (근사치). 설비 교체나 부채 상환에 어려움이 있을 수 있으며, 외부 자금 조달 의존도가 높아질 수 있습니다.`);
    } else {
      lines.push(`EBITDA 마진 ${fin.ebitdaMargin.toFixed(1)}% — 영업활동에서 현금이 유출되고 있습니다 (근사치). 본업 자체가 현금을 소모하는 구조이며, 외부 자금 없이는 사업 지속이 어려울 수 있습니다.`);
      bearCount += 1;
    }
  }

  // ── S60: PSR ──
  if(fin.psr != null){
    if(fin.psr > 0 && fin.psr <= 0.5){
      lines.push(`PSR ${fin.psr.toFixed(2)}배 — 시가총액이 연매출의 절반 이하입니다. 시장이 이 기업의 매출을 극도로 할인하고 있으며, 수익성만 개선되면 주가 재평가 폭이 매우 클 수 있습니다. 다만 만성 적자 기업이 아닌지 반드시 순이익률과 함께 확인하세요.`);
      bullCount += 2;
    } else if(fin.psr <= 1){
      lines.push(`PSR ${fin.psr.toFixed(2)}배 — 매출 대비 저평가 구간입니다. 같은 업종에서 PSR 1배 미만은 시장이 성장 둔화나 수익성 문제를 우려하고 있다는 의미이지만, 턴어라운드 시 재평가 잠재력이 큽니다.`);
      bullCount += 1;
    } else if(fin.psr <= 3){
      lines.push(`PSR ${fin.psr.toFixed(2)}배 — 매출 대비 적정 밸류에이션입니다. 대부분의 제조업·유통업에서 PSR 1~3배는 합리적 수준이며, 매출 성장률이 PSR 배수를 정당화하는지가 판단 기준입니다.`);
    } else if(fin.psr <= 7){
      lines.push(`PSR ${fin.psr.toFixed(2)}배 — 매출 대비 다소 높은 밸류에이션입니다. SaaS·플랫폼 등 고마진 비즈니스라면 수용 가능하지만, 전통 산업에서 이 수준은 과열 신호일 수 있습니다. 매출 성장률 20% 이상이 동반되는지 확인하세요.`);
    } else {
      lines.push(`PSR ${fin.psr.toFixed(2)}배 — 매출 대비 고평가 구간입니다. 연매출의 ${fin.psr.toFixed(0)}배를 시가총액으로 지불하고 있으며, 높은 성장 기대가 이미 주가에 선반영되어 있습니다. 성장 둔화 시 밸류에이션 디레이팅 위험이 매우 큽니다.`);
      bearCount += 1;
    }
  }

  // ── S60 / Phase 3: EV/EBITDA — 정확한 EBITDA 기반 (감가상각 추출 실패 시 _ebitdaApprox 마커) ──
  // [PLAN_7-B] 금융업(은행/보험/증권/금융지주)은 EBITDA 자체가 비적용 지표
  //   영업이익 정의 차이 + 감가상각 비중 미미로 EBITDA가 음수/극단치로 나오기 쉬움
  //   → 일반 5단계 해석 스킵, 안내 라인 1줄로 대체. PBR/ROE 같은 다른 지표 비중을 강조
  if(isFinancial){
    if(fin.evEbitda != null){
      lines.push(`EV/EBITDA는 금융업(은행·보험·증권·금융지주)에 적합하지 않은 지표입니다. 금융업은 영업이익의 정의가 일반 제조·서비스업과 다르고 감가상각 비중이 작아 EBITDA 산출이 의미를 갖기 어렵습니다. 대신 PBR(자산 대비 평가)·ROE(자본 효율)·배당수익률을 우선 참고하세요.`);
    }
  } else if(fin.evEbitda != null){
    // [PATCH ebitda-fallback-v2] _ebitdaApprox 3-state 처리
    //   null/false = 정확값 / 'adjustment' = 조정 항목 기반 추정 (대기업 간접법 요약형) / true = 영업이익 단독 추정
    //   조정 추정은 영업이익 단독보다 정확하지만 충당금 등이 섞여 약간 과대평가 가능 — 메시지로 명시
    let approxNote = '';
    if(fin._ebitdaApprox === 'adjustment'){
      approxNote = ' (현금흐름표 조정 항목 기반 추정 — 충당금 등이 섞여 다소 과대평가 가능)';
    } else if(fin._ebitdaApprox){
      approxNote = ' (감가상각 데이터 미발견 — 영업이익 기반 근사치)';
    }
    if(fin.evEbitda > 0 && fin.evEbitda <= 5){
      lines.push(`EV/EBITDA ${fin.evEbitda.toFixed(1)}배 — 기업가치(시총+순차입금) 대비 현금 창출력이 매우 높습니다. 이론적으로 ${fin.evEbitda.toFixed(0)}년이면 기업 인수 비용을 회수할 수 있는 수준이며, 사모펀드·전략적 투자자의 M&A 관심 대상이 될 수 있습니다${approxNote}.`);
      bullCount += 2;
    } else if(fin.evEbitda <= 8){
      lines.push(`EV/EBITDA ${fin.evEbitda.toFixed(1)}배 — 저평가 구간입니다. 업종 평균이 보통 8~12배인 점을 감안하면 매력적인 밸류에이션이며, 이익이 유지되는 한 안전마진이 존재합니다${approxNote}.`);
      bullCount += 1;
    } else if(fin.evEbitda <= 15){
      lines.push(`EV/EBITDA ${fin.evEbitda.toFixed(1)}배 — 적정 수준입니다. 대부분의 업종에서 합리적인 밸류에이션 범위이며, 동종 업계 중간값과 비교하여 상대적 저평가/고평가를 판단하세요${approxNote}.`);
    } else if(fin.evEbitda <= 25){
      lines.push(`EV/EBITDA ${fin.evEbitda.toFixed(1)}배 — 다소 높은 밸류에이션입니다. 시장이 향후 이익 성장을 기대하고 있으나, 기대가 충족되지 않으면 주가 조정 위험이 있습니다${approxNote}.`);
    } else {
      lines.push(`EV/EBITDA ${fin.evEbitda.toFixed(1)}배 — 고평가 구간입니다. 현금 창출 대비 기업가치가 과도하게 높으며, 이익 성장이 급격히 이루어지지 않는 한 밸류에이션 부담이 큽니다${approxNote}.`);
      bearCount += 1;
    }
  }

  // ── S60: BPS ──
  if(fin.bps != null && price > 0){
    const bpsRatio = price / fin.bps;
    if(bpsRatio > 0 && bpsRatio < 0.5){
      lines.push(`BPS ${_fmtBpsUnit(fin.bps)} (PBR ${bpsRatio.toFixed(2)}배) — 주가가 장부가치의 절반 이하입니다. 청산가치보다 저렴하게 거래되고 있어, 자산가치 투자(asset play) 관점에서 매력적이나, 수익성이 지속적으로 낮거나 자산의 실질 가치가 장부와 괴리될 수 있으므로 자산 구성(부동산/설비/재고 등)을 확인하세요.`);
      bullCount += 1;
    } else if(bpsRatio < 0.7){
      lines.push(`BPS ${_fmtBpsUnit(fin.bps)} (PBR ${bpsRatio.toFixed(2)}배) — 장부가치 대비 30% 이상 할인 거래 중입니다. 자산의 질이 양호하다면 밸류 트랩이 아닌 진정한 저평가일 수 있습니다.`);
      bullCount += 1;
    } else if(bpsRatio >= 0.7 && bpsRatio <= 1.5){
      lines.push(`BPS ${_fmtBpsUnit(fin.bps)} (PBR ${bpsRatio.toFixed(2)}배) — 장부가치와 시장가치가 비교적 균형 잡힌 구간입니다.`);
    } else if(bpsRatio > 3){
      lines.push(`BPS ${_fmtBpsUnit(fin.bps)} (PBR ${bpsRatio.toFixed(1)}배) — 주가가 장부가치의 ${bpsRatio.toFixed(1)}배입니다. 브랜드·특허·기술력 등 재무제표에 잡히지 않는 무형자산이 크거나, 시장의 성장 기대가 높게 반영된 상태입니다. 무형자산의 지속성을 판단하세요.`);
    }
  }

  // ── S60: PCR (근사치) ──
  if(fin.pcr != null){
    if(fin.pcr > 0 && fin.pcr <= 3){
      lines.push(`PCR ${fin.pcr.toFixed(1)}배 — 주가가 영업현금흐름 대비 극저평가입니다. 기업이 벌어들이는 현금 대비 시장에서 매우 싸게 평가받고 있으며, PER은 감가상각 등으로 왜곡될 수 있으나 PCR은 실질 현금 기준이므로 더 신뢰할 수 있습니다 (영업이익 대용 근사치).`);
      bullCount += 2;
    } else if(fin.pcr <= 7){
      lines.push(`PCR ${fin.pcr.toFixed(1)}배 — 현금흐름 대비 저평가 구간입니다. 감가상각이 큰 업종에서는 PER보다 PCR이 더 정확한 밸류에이션 잣대이며, 이 수준은 매력적입니다 (근사치).`);
      bullCount += 1;
    } else if(fin.pcr <= 15){
      lines.push(`PCR ${fin.pcr.toFixed(1)}배 — 적정 수준입니다. 현금 창출력 대비 주가가 합리적이며, 동종 업계 PCR과 비교하면 상대적 위치를 파악할 수 있습니다 (근사치).`);
    } else if(fin.pcr <= 30){
      lines.push(`PCR ${fin.pcr.toFixed(1)}배 — 현금흐름 대비 다소 높은 밸류에이션입니다. 고성장 기업이라면 수용 가능하지만, 성숙 기업에서 이 수준은 주의가 필요합니다 (근사치).`);
    } else {
      lines.push(`PCR ${fin.pcr.toFixed(1)}배 — 현금흐름 대비 고평가입니다. 영업에서 벌어들이는 현금 대비 주가가 과도하게 높으며, 현금흐름 감소 시 급격한 조정 위험이 있습니다 (근사치).`);
      bearCount += 1;
    }
  }

  // ── S60: PEG ──
  if(fin.peg != null){
    if(fin.peg > 0 && fin.peg <= 0.5){
      lines.push(`PEG ${fin.peg.toFixed(2)} — 성장성 대비 극저평가입니다. PER이 EPS 성장률의 절반도 안 되는 수준으로, 피터 린치 기준으로 '숨겨진 성장주'에 해당합니다. 교과서에서는 이익 성장이 1~2분기 더 확인되면 주가 재평가가 따라온다고 봅니다 — 이 서술을 잰 측정은 없습니다.`);
      bullCount += 2;
    } else if(fin.peg <= 0.8){
      lines.push(`PEG ${fin.peg.toFixed(2)} — 성장성 대비 저평가입니다. PER이 이익 성장률보다 낮아 밸류에이션 매력이 높습니다. 다만 PEG는 과거 성장률 기준이므로, 향후에도 성장세가 유지될지 사업 전망을 확인하세요.`);
      bullCount += 1;
    } else if(fin.peg <= 1.2){
      lines.push(`PEG ${fin.peg.toFixed(2)} — 성장성 대비 적정 밸류에이션입니다. PER이 EPS 성장률과 비슷한 수준으로, '성장에 합당한 가격'을 지불하고 있습니다. PEG 1 부근은 밸류에이션과 성장의 균형점으로 평가됩니다.`);
      bullCount += 1;
    } else if(fin.peg <= 2.0){
      lines.push(`PEG ${fin.peg.toFixed(2)} — 성장성 대비 보통~다소 높습니다. PER이 이익 성장률을 초과하고 있어, 시장이 미래 성장 가속을 기대하고 있습니다. 성장 둔화 시 PER 수축(디레이팅) 위험이 있으므로 실적 추이를 면밀히 모니터링하세요.`);
    } else {
      lines.push(`PEG ${fin.peg.toFixed(2)} — 성장성 대비 고평가입니다. PER이 이익 성장률의 ${fin.peg.toFixed(1)}배로, 현재 성장률로는 밸류에이션을 정당화하기 어렵습니다. 성장 모멘텀이 급격히 가속되지 않는 한 주가 조정 위험이 크며, 실적 발표 시 기대치 미달에 특히 취약합니다.`);
      bearCount += 1;
    }
  }

  // ── S60: 유동비율 (근사치 — 총자산/총부채) ──
  if(fin.currentRatio != null){
    if(fin.currentRatio >= 400){
      lines.push(`유동비율 ${fin.currentRatio.toFixed(0)}% — 단기 지급능력이 매우 충분합니다. 부채의 4배 이상의 자산을 보유하고 있어 유동성 위기 가능성이 극히 낮습니다. 다만 자산 활용 효율이 지나치게 보수적일 수 있으므로, 유휴 자산이 수익을 창출하고 있는지도 확인하세요 (총자산/총부채 근사치).`);
      bullCount += 1;
    } else if(fin.currentRatio >= 200){
      lines.push(`유동비율 ${fin.currentRatio.toFixed(0)}% — 안정적인 재무 구조입니다. 자산이 부채의 2배 이상이어서 금리 인상이나 매출 급감에도 단기적으로 버틸 여력이 충분합니다. 채권자 관점에서 신용 위험이 낮은 수준입니다 (근사치).`);
      bullCount += 1;
    } else if(fin.currentRatio >= 150){
      lines.push(`유동비율 ${fin.currentRatio.toFixed(0)}% — 적정 수준입니다. 단기 부채 상환에 무리가 없으며, 대부분의 업종에서 안정적으로 평가되는 범위입니다 (근사치).`);
    } else if(fin.currentRatio >= 100){
      lines.push(`유동비율 ${fin.currentRatio.toFixed(0)}% — 유동성이 다소 빡빡합니다. 자산과 부채가 비슷한 규모로, 매출 급감이나 대규모 만기 도래 시 자금 압박을 받을 수 있습니다. 차입금 만기 구조와 현금성 자산 비중을 점검하세요 (근사치).`);
    } else {
      lines.push(`유동비율 ${fin.currentRatio.toFixed(0)}% — 총부채가 총자산을 초과합니다. 회계적으로 자본잠식 상태이거나 그에 근접하며, 추가 자금 조달 없이는 부채 상환이 어려울 수 있습니다. 증자, 자산 매각, 구조조정 등의 계획을 반드시 확인하세요 (근사치).`);
      bearCount += 2;
    }
  }

  // ── S60: EPS 성장률 ──
  if(fin.epsGrowth != null){
    if(fin.epsGrowth >= 100){
      lines.push(`EPS 성장률 +${fin.epsGrowth.toFixed(1)}% — 주당이익이 2배 이상 급증했습니다. 턴어라운드, 신사업 매출 반영, 또는 원가 구조 개선이 극적으로 이루어진 상태입니다. 다만 이 수준의 성장은 일회성 요인(자산 매각, 환율 효과 등)일 수 있으므로 지속 가능성을 반드시 검증하세요.`);
      bullCount += 2;
    } else if(fin.epsGrowth >= 30){
      lines.push(`EPS 성장률 +${fin.epsGrowth.toFixed(1)}% — 강력한 이익 성장세입니다. 매출 성장과 마진 개선이 동시에 이루어지고 있을 가능성이 높으며, 이 추세가 2~3분기 지속되면 PER 프리미엄이 정당화됩니다. 시장 컨센서스 대비 어닝 서프라이즈 여부도 주가에 큰 영향을 줍니다.`);
      bullCount += 1;
    } else if(fin.epsGrowth >= 10){
      lines.push(`EPS 성장률 +${fin.epsGrowth.toFixed(1)}% — 안정적인 이익 성장입니다. 두 자릿수 EPS 성장은 대부분의 기관투자자가 선호하는 수준이며, 배당 인상이나 자사주 매입 여력 확대로 이어질 수 있습니다.`);
    } else if(fin.epsGrowth >= 0){
      lines.push(`EPS 성장률 +${fin.epsGrowth.toFixed(1)}% — 이익이 소폭 증가했습니다. 성장 모멘텀이 약해지고 있을 수 있으며, 매출 성장률과 비교하여 마진 변화를 확인하세요. EPS 성장이 매출 성장보다 낮다면 비용 압박이 있다는 신호입니다.`);
    } else if(fin.epsGrowth > -30){
      lines.push(`EPS 성장률 ${fin.epsGrowth.toFixed(1)}% — 이익이 감소했습니다. 매출 둔화인지, 비용 증가인지, 일회성 손실인지 원인 파악이 중요합니다. 영업이익 성장률과 비교하여 영업외 요인이 얼마나 영향을 미쳤는지 확인하세요.`);
      bearCount += 1;
    } else {
      lines.push(`EPS 성장률 ${fin.epsGrowth.toFixed(1)}% — 이익이 급감했습니다. 주당순이익이 30% 이상 하락한 것은 실적에 구조적 문제가 있음을 시사하며, 시장의 이익 추정치 하향 조정과 함께 PER 디레이팅이 동시에 발생할 수 있어 주가 하방 압력이 매우 큽니다.`);
      bearCount += 2;
    }
  }

  // 종합 판정
  if(bullCount >= 4) tone = 'bullish';
  else if(bullCount >= 2 && bearCount === 0) tone = 'bullish';
  else if(bearCount >= 3) tone = 'bearish';
  else if(bearCount >= 2 && bullCount === 0) tone = 'bearish';

  // S57: 재무 트렌드 해석 (DART 원본 성장률)
  if(fin.revenueGrowth != null || fin.opIncomeGrowth != null || fin.netIncomeGrowth != null){
    lines.push('');
    lines.push('── 재무 트렌드 (전기 대비) ──');
    if(fin.revenueGrowth != null){
      const g = fin.revenueGrowth;
      if(g >= 30){ lines.push(`매출 성장률 ${g>0?'+':''}${g.toFixed(1)}% — 고성장 구간입니다. 시장 점유율 확대나 신사업이 실적에 반영되고 있으며, PER 프리미엄이 정당화될 수 있습니다.`); bullCount++; }
      else if(g >= 10){ lines.push(`매출 성장률 ${g>0?'+':''}${g.toFixed(1)}% — 안정적 성장세입니다. 업종 평균 대비 양호한 수준이며, 실적 지속성을 확인하면 중장기 투자 매력이 있습니다.`); bullCount++; }
      else if(g >= 0) lines.push(`매출 성장률 ${g>0?'+':''}${g.toFixed(1)}% — 소폭 성장이나 정체 구간입니다.`);
      else if(g > -20) lines.push(`매출 성장률 ${g.toFixed(1)}% — 매출이 소폭 감소했습니다. 일시적 요인인지, 구조적 둔화인지 확인이 필요합니다.`);
      else { lines.push(`매출 성장률 ${g.toFixed(1)}% — 매출이 크게 감소했습니다. 주력 사업의 경쟁력 약화나 시장 축소 가능성이 있으며, 턴어라운드 시점을 신중히 판단하세요.`); bearCount++; }
    }
    if(fin.opIncomeGrowth != null){
      const g = fin.opIncomeGrowth;
      if(g >= 50){ lines.push(`영업이익 성장률 ${g>0?'+':''}${g.toFixed(1)}% — 수익성이 크게 개선되었습니다. 원가 절감이나 매출 레버리지 효과가 나타나고 있으며, 주가 재평가 동력이 됩니다.`); bullCount++; }
      else if(g >= 15) lines.push(`영업이익 성장률 ${g>0?'+':''}${g.toFixed(1)}% — 양호한 수익성 개선입니다.`);
      else if(g >= 0) lines.push(`영업이익 성장률 ${g>0?'+':''}${g.toFixed(1)}% — 수익성이 유지되고 있습니다.`);
      else if(g > -30) lines.push(`영업이익 성장률 ${g.toFixed(1)}% — 수익성이 악화되고 있습니다. 비용 구조 변화를 점검하세요.`);
      else { lines.push(`영업이익 성장률 ${g.toFixed(1)}% — 수익성이 급격히 악화되었습니다. 영업적자 전환 위험이 있으며, 비용 구조 개선 없이는 주가 하방 압력이 지속됩니다.`); bearCount++; }
    }
    if(fin.netIncome != null && fin.netIncomePrev != null){
      if(fin.netIncome > 0 && fin.netIncomePrev < 0){ lines.push('흑자전환에 성공했습니다. 턴어라운드 초기 단계로, 실적 개선이 지속되면 주가 재평가 가능성이 높습니다.'); bullCount += 2; }
      else if(fin.netIncome < 0 && fin.netIncomePrev > 0){ lines.push('적자로 전환되었습니다. 일회성 요인인지 구조적 문제인지 반드시 확인하세요. 적자 기업은 밸류에이션 기준이 달라지므로 투자 판단에 주의가 필요합니다.'); bearCount += 2; }
      else if(fin.netIncomeGrowth != null){
        const g = fin.netIncomeGrowth;
        if(g >= 30) lines.push(`순이익 성장률 ${g>0?'+':''}${g.toFixed(1)}% — 실적 개선이 뚜렷합니다.`);
        else if(g <= -30) lines.push(`순이익 성장률 ${g.toFixed(1)}% — 순이익이 크게 감소했습니다.`);
      }
    }
  }

  const labels = {
    bullish: '재무 우량 — 펀더멘털 지지력 확보',
    bearish: '재무 취약 — 펀더멘털 리스크 존재',
    neutral: '재무 보통 — 추가 확인 필요'
  };

  // [재무 종합평가 시각화] 다른 부문(반등준비/추세/공시)과 동일한 형식의 점수/등급 산출
  //   기존 bullCount/bearCount는 유지 (외부 호환 위해), 추가로 sectorScore/sectorGrade 노출
  //   계산식: 50 (중립) + (bullCount × 4) - (bearCount × 4), 0~100 클램프
  //   bullCount/bearCount는 advFundamental 내부에서 PER/PBR/ROE/부채비율/성장률/마진 등 항목별로 ±1~±2 가산
  //   일반적으로 bullCount-bearCount 차이가 ±10을 넘기 어렵게 설계되어 있어 ×4 곱셈 시 합리적 범위
  let _sectorScore = 50 + (bullCount - bearCount) * 4;
  if (_sectorScore < 0) _sectorScore = 0;
  if (_sectorScore > 100) _sectorScore = 100;
  _sectorScore = Math.round(_sectorScore);
  // 등급: 다른 부문과 일관된 컷오프 (A:75↑, B:60↑, C:40↑, D:40↓)
  const _sectorGrade = _sectorScore >= 75 ? 'A' : _sectorScore >= 60 ? 'B' : _sectorScore >= 40 ? 'C' : 'D';
  // 한 줄 요약 텍스트 (스크린샷의 다른 부문처럼 "X점 (Y등급). 핵심 한 줄.")
  const _gradeReason =
    _sectorGrade === 'A' ? '우량 지표가 다수 감지되어 펀더멘털이 견고합니다.' :
    _sectorGrade === 'B' ? '대체로 양호하나 일부 약점 존재 — 트렌드 점검 권장.' :
    _sectorGrade === 'C' ? '우량/취약 지표 혼재 — 단독 판단보다 기술적 신호와 함께 보세요.' :
    '취약 지표가 다수 감지되어 펀더멘털 리스크가 큽니다.';
  const _sectorText = `${_sectorScore}점 (${_sectorGrade}등급). ${_gradeReason}`;
  // 핵심 강점/약점 라인 추출 (점수 영향이 큰 ±2 라인 우선)
  //   현재는 lines 배열 전체를 그대로 쓰지만, 향후 라인별 score weight를 메타로 붙이면 더 정교화 가능
  //   네이버 폴백 케이스 등으로 항목 수가 적으면 자동으로 짧아짐

  return {
    tone, label: labels[tone],
    text: lines.join('\n'),
    summary: tone === 'bullish' ? '밸류에이션·수익성·안정성 측면에서 긍정적 신호가 우세합니다. 기술적 매수 신호와 겹치면 교과서에서는 신뢰도가 높아진다고 봅니다.'
      : tone === 'bearish' ? '재무 지표에서 부정적 신호가 다수 감지됩니다. 기술적 매수 신호가 있더라도 포지션 크기를 줄이고 손절을 타이트하게 설정하세요.'
      : '재무 상태가 중립적입니다. 기술적 분석 위주로 판단하되, 재무 개선/악화 추이를 모니터링하세요.',
    bullCount, bearCount,
    // [추가] 시각화용 필드 — 다른 부문(거래량/추세신호/공시)과 동일 형식
    sectorScore: _sectorScore,
    sectorGrade: _sectorGrade,
    sectorText: _sectorText
  };
};

// ════════════════════════════════════════════════════════════
//  S55: 매크로 환경 해석 (advMacro)
// ════════════════════════════════════════════════════════════
SXI.advMacro = function(macro){
  if(!macro) return null;
  const lines = [];
  let tone = 'neutral';
  let score = 0; // -100 ~ +100

  // ── 달러인덱스 ──
  if(macro.dxy){
    const d = macro.dxy;
    if(d.trend === 'down' && d.change5d < -1){
      lines.push(`달러인덱스 하락 추세 (5일 ${d.change5d.toFixed(1)}%) — 글로벌 유동성이 신흥시장·위험자산으로 유입되기 좋은 환경입니다. 원화 강세 + 외국인 매수 유인이 됩니다.`);
      score += 20;
    } else if(d.trend === 'down'){
      lines.push('달러 소폭 약세 — 위험자산에 소극적 호재입니다.');
      score += 8;
    } else if(d.trend === 'up' && d.change5d > 1){
      lines.push(`달러인덱스 상승 (5일 +${d.change5d.toFixed(1)}%) — 신흥시장 자금 유출 압력이 커지고 있습니다. 원화 약세와 외국인 매도가 겹칠 수 있어 주의가 필요합니다.`);
      score -= 20;
    } else if(d.trend === 'up'){
      lines.push('달러 소폭 강세 — 위험자산에 소극적 부정 요인입니다.');
      score -= 8;
    } else {
      lines.push('달러 횡보 중 — 방향성 관찰이 필요합니다.');
    }
    if(d.rsiVal >= 70){
      lines.push(`달러 RSI ${d.rsiVal.toFixed(0)} 과매수 — 단기 되돌림(달러 약세 반전) 가능성이 있어, 역설적으로 주식에 호재로 작용할 수 있습니다.`);
      score += 5;
    } else if(d.rsiVal <= 30){
      lines.push(`달러 RSI ${d.rsiVal.toFixed(0)} 과매도 — 달러 반등 가능성이 있어 위험자산에 단기 압박 요인입니다.`);
      score -= 5;
    }
  }

  // ── 금리 (미국 10년물) ──
  if(macro.tnx){
    const d = macro.tnx;
    if(d.trend === 'down'){
      const str = Math.abs(d.change5d) > 2 ? '급락' : '하락';
      lines.push(`미국 10년 금리 ${str} (${d.price.toFixed(2)}%) — 금리 하락은 성장주·기술주에 유리하고, 할인율 하락으로 주식 밸류에이션이 상향됩니다.`);
      score += Math.abs(d.change5d) > 2 ? 15 : 8;
    } else if(d.trend === 'up'){
      const str = Math.abs(d.change5d) > 2 ? '급등' : '상승';
      lines.push(`미국 10년 금리 ${str} (${d.price.toFixed(2)}%) — 금리 상승은 성장주 밸류에이션 부담을 키우고, 채권 대비 주식 매력도를 떨어뜨립니다.`);
      score -= Math.abs(d.change5d) > 2 ? 15 : 8;
    } else {
      lines.push(`미국 10년 금리 ${d.price.toFixed(2)}% 횡보 — 금리 방향성이 불확실해 시장 변동성이 낮을 수 있습니다.`);
    }
  }

  // ── 환율 (USD/KRW) ──
  if(macro.usdkrw){
    const d = macro.usdkrw;
    if(d.trend === 'up' && d.change5d > 1){
      lines.push(`원화 약세 (환율 5일 +${d.change5d.toFixed(1)}%) — 외국인 투자자 입장에서 한국 주식의 원화 환산 수익률이 나빠져 매도 압력이 증가합니다. 수출주에는 긍정적이나 시장 전체적으로는 부담입니다.`);
      score -= 10;
    } else if(d.trend === 'down' && d.change5d < -1){
      lines.push(`원화 강세 (환율 5일 ${d.change5d.toFixed(1)}%) — 외국인 자금 유입 환경이 조성되고 있습니다. 내수주에 유리하며 전반적으로 긍정적입니다.`);
      score += 10;
    } else {
      lines.push(`환율 안정 (${d.price.toFixed(0)}원) — 큰 방향성 없이 안정적입니다.`);
    }
  }

  // ── VIX ──
  if(macro.vix){
    const v = macro.vix;
    if(v.price >= 30){
      lines.push(`VIX ${v.price.toFixed(1)} — 극심한 공포 구간입니다. 교과서에서는 이 구간에서 매수 신호를 낮춰 보고 현금 비중을 높이라고 봅니다 — VIX가 우리 신호의 적중을 낮춘다는 측정은 없습니다. 역발상 매수는 VIX 하향 반전 확인 후를 권합니다.`);
      score -= 25;
    } else if(v.price >= 20){
      lines.push(`VIX ${v.price.toFixed(1)} — 불안 구간입니다. 시장 변동성이 높아 기술적 신호의 노이즈가 커집니다. 포지션 크기를 줄이는 것이 바람직합니다.`);
      score -= 10;
    } else if(v.price <= 13){
      lines.push(`VIX ${v.price.toFixed(1)} — 극도의 안정입니다. 위험자산 선호 환경이나, 장기간 저VIX 유지 후 급등 가능성도 경계해야 합니다.`);
      score += 8;
    } else {
      lines.push(`VIX ${v.price.toFixed(1)} — 정상 범위입니다.`);
    }
  }

  // ── 금 (안전자산 바로미터) ──
  if(macro.gold){
    const g = macro.gold;
    if(g.trend === 'up' && g.change5d > 2){
      lines.push(`금 가격 급등 (5일 +${g.change5d.toFixed(1)}%) — 안전자산 수요가 급증하고 있습니다. 지정학적 리스크나 인플레 우려가 시장을 지배하는 신호일 수 있습니다.`);
      score -= 8;
    } else if(g.trend === 'down' && g.change5d < -2){
      lines.push(`금 가격 하락 (5일 ${g.change5d.toFixed(1)}%) — 안전자산 수요가 줄고 위험자산으로 자금이 이동하는 위험자산 선호 환경입니다.`);
      score += 8;
    }
  }

  // ── 크로스에셋 상관관계 ──
  if(macro.dxy && macro.gold){
    if(macro.dxy.trend === 'up' && macro.gold.trend === 'up' && macro.dxy.change5d > 1 && macro.gold.change5d > 1){
      lines.push('[주의] 달러와 금이 동반 상승 — 일반적 역상관이 깨진 비정상 패턴으로, 지정학적 위기(전쟁·제재)나 글로벌 불확실성 급등을 시사합니다. 극도의 주의가 필요합니다.');
      score -= 15;
    }
  }
  if(macro.dxy && macro.tnx){
    if(macro.dxy.trend === 'up' && macro.tnx.trend === 'up'){
      lines.push('달러↑ + 금리↑ 복합 압박 — 긴축적 금융 환경이 지속되고 있습니다. 성장주·고밸류 종목은 특히 불리하며, 가치주·저변동 종목 선호 전략이 유효합니다.');
      score -= 10;
    } else if(macro.dxy.trend === 'down' && macro.tnx.trend === 'down'){
      lines.push('달러↓ + 금리↓ 완화 환경 — 유동성이 풍부해지고 위험자산 선호가 확대됩니다. 성장주·중소형주에 긍정적이며, 기술적 매수 신호의 교과서에서는 신뢰도가 높아진다고 봅니다.');
      score += 10;
    }
  }

  // 종합 판정
  const clamped = Math.max(-100, Math.min(100, score));
  if(clamped >= 15) tone = 'bullish';
  else if(clamped <= -15) tone = 'bearish';

  const labels = {
    bullish: '매크로 우호 — 위험자산 선호 환경',
    bearish: '매크로 비우호 — 보수적 접근 필요',
    neutral: '매크로 중립 — 기술적 분석 위주 판단'
  };

  return {
    tone, label: labels[tone], score: clamped,
    text: lines.join('\n'),
    summary: tone === 'bullish' ? '글로벌 매크로 환경이 주식시장에 우호적입니다. 교과서에서는 매크로 우호와 기술적 매수 신호가 겹칠 때를 더 나은 자리로 봅니다 — 이 결합을 잰 측정은 없습니다.'
      : tone === 'bearish' ? '매크로 역풍이 불고 있습니다. 기술적 매수 신호가 있더라도 포지션을 줄이고, 방어적 섹터·가치주 중심으로 접근하세요.'
      : '매크로 방향성이 불확실합니다. 기술적 분석에 더 큰 비중을 두되, 급변 가능성에 대비하세요.'
  };
};

SXI.version = '3.1';

// ════════════════════════════════════════════════════════════
//  S56: DART 공시 해석 (advDisclosure)
// ════════════════════════════════════════════════════════════

/**
 * 공시 키워드 기반 상세 해석
 * @param {Array} keywords - [{keyword, grade, report_nm, rcept_dt, dart_url}]
 * @returns {object} {tone, label, text, summary, badges, sectorScore, sectorGrade, sectorText}
 */
SXI.advDisclosure = function(keywords){
  if(!keywords || !keywords.length){
    return {
      tone:'neutral', label:'공시 이슈 없음',
      text:'최근 1개월 내 주요 위험/호재성 공시가 감지되지 않았습니다. 공시 관점에서 중립입니다.',
      summary:'공시 관련 특이사항 없음.',
      badges:[], sectorScore:50, sectorGrade:'C',
      sectorText:'50점 (C등급). 최근 주요 공시 없음 — 공시 관점 중립.'
    };
  }
  const badges = [];
  const lines = [];
  let tone = 'neutral';
  let hasCritical = false, hasSevere = false, hasWarning = false, hasPositive = false;
  const seen = new Set();

  // 등급별 해석 매핑
  const kwExplain = {
    '상장폐지':'상장폐지 결정이 나면 거래가 완전히 중단됩니다. 보유 중이라면 정리매매 기간 안에 반드시 매도하세요. 정리매매 기간에도 가격이 급락하므로 빠른 대응이 핵심입니다.',
    '파산':'파산 절차가 개시되면 기업이 살아남을 가능성이 매우 낮습니다. 주주에게 돌아올 잔여 자산은 거의 없으며, 투자금 회수가 극히 어렵습니다. 보유 중이면 즉시 매도를 검토하세요.',
    '거래정지':'매매가 중단된 상태이며, 재개 시점이 불확실합니다. 자금이 장기간 묶일 수 있고, 재개 후에도 급락 가능성이 큽니다. 이미 보유 중이면 재개 후 즉시 대응 계획을 세워두세요.',
    '회생절차':'법원 관리 하에 구조조정이 진행되며, 기존 주주 지분이 대폭 희석될 가능성이 높습니다. 회생 성공률도 낮으므로, 투자금 대부분을 잃을 수 있다는 점을 인지하세요.',
    '회생개시':'회생 개시 결정으로 법원이 경영권을 넘겨받았습니다. 기존 주식 가치가 크게 떨어질 가능성이 높으니, 신규 진입은 절대 피하세요.',
    '워크아웃':'채권단 주도로 구조조정이 진행되며, 대규모 감자로 주주 지분이 크게 줄어들 수 있습니다. 주주 권리가 사실상 제한되는 상황입니다.',
    '청산':'기업의 모든 자산을 처분해 부채를 갚는 절차입니다. 부채 상환 후 남는 자산이 주주에게 돌아올 가능성은 거의 없습니다.',
    '관리종목':'관리종목으로 지정되면 상장폐지 직전 경고 상태입니다. 정해진 기간 안에 개선하지 못하면 상폐 절차에 들어가므로, 신규 매수는 절대 피하고 보유 중이면 반등 시 매도를 검토하세요.',
    '자본잠식':'누적 적자로 자본금이 깎여나간 상태입니다. 잠식률이 50%를 넘으면 관리종목, 전액잠식이면 상장폐지 위험이 커집니다. 재무 개선 없이는 투자 가치가 없습니다.',
    '자본전액잠식':'부채가 자산을 넘어선 상태로 기업 가치가 사실상 마이너스입니다. 상장폐지 가능성이 극히 높으므로 즉시 이탈하세요.',
    '감자':'주식 수를 줄이거나 액면가를 낮춰 기존 주주의 지분 가치가 크게 줄어듭니다. 특히 유상감자라면 주주에게 매우 불리하니, 감자 비율과 조건을 반드시 확인하세요.',
    '감사의견거절':'회계 감사인이 재무제표를 신뢰할 수 없다고 판단한 것으로, 관리종목 지정이나 상장폐지 사유가 됩니다. 재무 투명성 자체가 무너진 상태이므로 투자에 적합하지 않습니다.',
    '부적정의견':'재무제표가 심하게 왜곡되었다는 감사 결과입니다. 기업이 공시한 수치를 믿을 수 없으며, 투자 판단의 근거 자체가 사라진 상태입니다.',
    '의견거절':'감사인이 의견 표명 자체를 거부한 것으로, 재무 상태에 심각한 문제가 있다는 신호입니다. 관리종목 지정 가능성이 높습니다.',
    '정리매매':'상장폐지가 확정된 뒤 마지막으로 거래할 수 있는 기간입니다. 가격 급락이 불가피하며, 투기 목적 매수는 극히 위험합니다.',
    '상장적격성':'상장폐지 여부를 최종 결정하는 실질심사가 진행 중입니다. 심사 결과에 따라 상폐가 확정될 수 있으므로 매수를 보류하세요.',
    '유상증자':'새 주식을 발행해 돈을 모으는 과정에서 기존 주주 지분이 희석됩니다. 조달 목적이 사업 확장이면 장기 호재일 수 있지만, 부채 상환이 목적이면 부정적입니다. 증자 규모와 목적을 반드시 확인하세요.',
    '전환사채':'전환사채(CB) 발행은 나중에 주식으로 바뀔 수 있어 지분 희석의 원인이 됩니다. 전환가격이 현재가보다 낮으면 전환 압력이 커지므로, 전환 조건을 꼭 확인하세요.',
    '신주인수권':'신주인수권(BW) 행사 시 새 주식이 나오므로 지분이 희석됩니다. 행사 가격과 물량에 따라 영향이 달라지니 공시 원문을 확인하세요.',
    '횡령':'경영진 횡령은 기업 지배구조의 근본적 문제를 보여줍니다. 경영 신뢰가 무너진 상태이므로, 사법 절차 결과와 무관하게 투자 매력이 크게 떨어집니다.',
    '배임':'경영진이 회사에 손해를 끼치는 행위로, 기업 가치 훼손과 법적 리스크가 동시에 발생합니다. 배상 규모에 따라 재무 부담이 커질 수 있습니다.',
    '소송':'소송 결과에 따라 거액 배상이나 사업 중단 위험이 있습니다. 소송 규모가 시가총액 대비 크다면 주가에 큰 영향을 줄 수 있으니 내용을 확인하세요.',
    '분식':'분식회계가 적발되면 관리종목 지정, 과징금, 대표 구속 등 줄줄이 악재가 터집니다. 재무제표를 믿을 수 없는 상태이므로 투자를 피하세요.',
    '불성실공시':'공시 의무를 제대로 이행하지 않은 기업으로 지정된 상태입니다. 정보 투명성에 의문이 있으며, 숨겨진 악재가 있을 수 있습니다.',
    '투자주의':'비정상적인 거래 패턴이 감지되어 거래소가 경고한 상태입니다. 작전 세력이 개입했을 가능성이 있으니 매수를 자제하세요.',
    '투자경고':'투자주의보다 한 단계 높은 경고로, 추가 제재가 예고된 상태입니다. 거래 제한이 걸릴 수 있으므로 주의하세요.',
    '투자위험':'가장 높은 수준의 경고로, 거래 제한이 수반될 수 있습니다. 매수를 절대 피하세요.',
    '조회공시':'시장에 확인되지 않은 정보가 돌고 있어 거래소가 사실 확인을 요구한 것입니다. 결과에 따라 호재가 될 수도, 악재가 될 수도 있으니 공시 결과를 기다리세요.',
    '자사주취득':'회사가 자기 주식을 직접 사들이는 것으로, 주가를 지지하겠다는 의지를 보여줍니다. 매수 물량이 추가되므로 단기적으로 긍정적이며, 기술적 매수 신호와 겹치면 교과서에서는 신뢰도가 높아진다고 봅니다.',
    '자사주소각':'매입한 자기주식을 영구히 없애는 것으로, 남은 주식의 가치가 올라갑니다. 주주환원 정책 중 가장 강력한 호재이며, 장기 투자 매력을 높입니다.',
    '배당':'주주에게 이익을 나누겠다는 공시로, 기업의 재무 건전성과 주주 친화적 경영 의지를 보여줍니다. 배당수익률이 높으면 하락 시 하방 지지력도 강해집니다.',
    '무상증자':'기존 주주에게 공짜로 주식을 나눠주는 것으로, 기업의 재무 여력을 보여주는 호재입니다. 유통 주식이 늘어 유동성도 개선됩니다.',
    '흑자전환':'적자에서 흑자로 돌아선 것은 기업 체질 개선의 강력한 신호입니다. 턴어라운드 초기에 진입하면 높은 수익을 기대할 수 있습니다.',
    '계약체결':'대규모 계약은 매출 성장 동력을 확보했다는 뜻입니다. 계약 규모가 시가총액 대비 크면 주가에 강한 호재로 작용합니다.',
    '대규모수주':'큰 규모의 수주는 향후 매출이 이미 확정되었음을 뜻합니다. 실적 개선 기대로 주가에 긍정적이며, 수주잔고가 쌓이면 장기 성장 기반이 됩니다.',
    '실적개선':'영업이익이나 순이익이 전년 대비 크게 늘었다는 공시로, 기업 펀더멘탈이 좋아지고 있다는 명확한 근거입니다.'
  };

  // [PATCH disclose-fold] 본문 분할 표시용 — 각 라인을 {date, keyword, body} 객체로 별도 수집
  //   기존 lines 문자열 배열은 호환 유지 (text 필드로 합쳐 반환)
  //   lineEntries는 renderDisclosureCard에서 날짜순 정렬 + 최근 2건/나머지 분할에 사용
  const lineEntries = [];

  for(const kw of keywords){
    if(seen.has(kw.keyword)) continue;
    seen.add(kw.keyword);
    const badgeCls = kw.grade==='CRITICAL'?'danger':kw.grade==='SEVERE'?'warning':kw.grade==='WARNING'?'caution':'positive';
    // S57: 카테고리 정보 추가
    let catLabel = '';
    if(typeof SXE!=='undefined' && SXE.DISCLOSURE_CATEGORIES){
      for(const [,cat] of Object.entries(SXE.DISCLOSURE_CATEGORIES)){
        if(cat.keywords.some(c=>c.keyword===kw.keyword)){ catLabel = cat.label; break; }
      }
    }
    badges.push({text:kw.keyword, cls:badgeCls, grade:kw.grade, date:kw.rcept_dt, url:kw.dart_url, category:catLabel});

    if(kw.grade==='CRITICAL') hasCritical = true;
    if(kw.grade==='SEVERE') hasSevere = true;
    if(kw.grade==='WARNING') hasWarning = true;
    if(kw.grade==='POSITIVE') hasPositive = true;

    const explain = kwExplain[kw.keyword] || `"${kw.keyword}" 관련 공시가 감지되었습니다. 공시 원문을 확인하여 영향을 판단하세요.`;
    const dateStr = kw.rcept_dt ? ` (${kw.rcept_dt.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')})` : '';
    const formattedLine = `【${kw.keyword}】${dateStr}\n${explain}`;
    lines.push(formattedLine);
    lineEntries.push({
      date: kw.rcept_dt || '',          // YYYYMMDD 형식 (정렬용)
      keyword: kw.keyword,
      grade: kw.grade,
      tone: badgeCls,                    // disc-badge 클래스 (positive/caution/warning/danger)
      formatted: formattedLine,          // 화면에 그대로 표시할 텍스트
    });
  }

  // [PATCH disclose-fold] 날짜 내림차순 정렬 — 최신 공시가 위로
  //   YYYYMMDD 문자열은 사전식 비교가 곧 시간 비교
  lineEntries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // 톤 결정
  // [PATCH mixed] 호재(POSITIVE) + 주의(WARNING) 동시 감지 시 'mixed' 톤으로 분류
  //   기존: 둘 다 있으면 어느 분기도 안 잡혀 tone이 초기값 'neutral'로 남음 → 카드 숨김
  //   수정: 'mixed' 신설 → 라벨/색상 별도 → 사용자가 호재·악재 모두 인지 가능
  //   우선순위: danger > bearish > mixed > warning > bullish > neutral
  //     (CRITICAL/SEVERE는 호재 동반 여부와 무관하게 압도적이므로 mixed보다 위)
  if(hasCritical) tone = 'danger';
  else if(hasSevere) tone = 'bearish';
  else if(hasWarning && hasPositive) tone = 'mixed';
  else if(hasWarning) tone = 'warning';
  else if(hasPositive) tone = 'bullish';

  // 부문 점수
  // [PATCH mixed] mixed 케이스(호재+주의 동시) 점수 = 45점 (warning 35 + positive 70 평균보다 약간 보수적)
  //   호재가 주의 일부를 상쇄하지만, 안전 원칙상 중립(50)보다 살짝 낮게
  let sScore = 50;
  if(hasCritical) sScore = 5;
  else if(hasSevere) sScore = 20;
  else if(hasWarning && hasPositive) sScore = 45;
  else if(hasWarning) sScore = 35;
  else if(hasPositive) sScore = 70;
  const sGrade = sScore>=70?'A':sScore>=55?'B':sScore>=40?'C':sScore>=25?'D':'F';

  // 부문 텍스트
  let sText = `${sScore}점 (${sGrade}등급). `;
  if(hasCritical) sText += '⛔ 치명적 공시(상폐/파산/거래정지 등) 감지. 기술적 분석과 무관하게 투자 부적격 종목입니다.';
  else if(hasSevere) sText += '[주의] 위험 공시(관리종목/자본잠식/감자 등) 감지. 펀더멘탈 리스크가 매우 높습니다.';
  else if(hasWarning && hasPositive) sText += '호재·주의 공시 동시 감지. 호재가 주의를 일부 상쇄하나, 악재의 영향 규모를 우선 점검하세요.';
  else if(hasWarning) sText += '주의 공시(유상증자/전환사채/소송 등) 감지. 지분 희석 또는 법적 리스크에 주의하세요.';
  else sText += '호재성 공시(자사주/배당/흑자전환 등) 감지. 펀더멘탈 개선 신호입니다.';

  // 라벨
  // [PATCH mixed] mixed 라벨 추가 — "혼재" 키워드로 사용자에게 양면 인지 유도
  const labels = {
    danger:'⛔ 치명적 공시 — 즉시 이탈',
    bearish:'[주의] 위험 공시 — 투자 부적합',
    mixed:'[혼재] 호재·주의 공시 — 양면 확인 필요',
    warning:'[주의] 주의 공시 — 리스크 확인 필요',
    bullish:'[확인] 호재 공시 — 펀더멘탈 개선',
    neutral:'공시 이슈 없음'
  };

  // 요약
  let summary = '';
  if(hasCritical) summary = '상장폐지·파산·거래정지 등 치명적 공시가 감지되었습니다. 기술적 지표와 무관하게 이 종목은 투자 대상에서 즉시 제외해야 합니다. 기존 보유자는 가능한 빨리 포지션을 정리하세요.';
  else if(hasSevere) summary = '관리종목·자본잠식·감자 등 심각한 펀더멘탈 위험이 감지되었습니다. 기술적 매수 신호가 있더라도 교과서에서는 신뢰도를 매우 낮게 보며, 반등 시 매도 전략이 적합합니다.';
  else if(hasWarning && hasPositive) summary = '호재와 악재 공시가 동시에 감지되었습니다. 공시 원문을 반드시 확인하고, 악재의 영향 규모를 우선 점검하세요.';
  else if(hasWarning) summary = '유상증자·전환사채·소송 등 주의가 필요한 공시가 감지되었습니다. 지분 희석 규모와 소송 결과에 따른 영향을 확인 후 판단하세요.';
  else if(hasPositive) summary = '자사주·배당·흑자전환 등 호재성 공시가 감지되었습니다. 교과서에서는 호재 공시와 기술적 매수 신호가 겹칠 때를 더 나은 자리로 봅니다 — 이 결합을 잰 측정은 없습니다.';
  else summary = '공시 관련 특이사항 없음.';

  return {
    tone, label: labels[tone] || labels.neutral,
    text: lines.join('\n\n'),
    lineEntries,                                  // [PATCH disclose-fold] 분할 렌더용 정렬된 엔트리
    summary, badges, sectorScore: sScore, sectorGrade: sGrade, sectorText: sText
  };
};

// ════════════════════════════════════════════════════════════════════
//  [S323] SEC 공시 해석 (advDisclosureSec) — DART advDisclosure 미국 대응
// ════════════════════════════════════════════════════════════════════
//  〔배경〕 미국 종목에도 한국처럼 공시 배지/점수/상세 표시.
//          SEC EDGAR /sec/disclosure 응답(filings)을 받아 advDisclosure와 동등한 형식으로 변환.
//  〔입력 형식〕 워커 /sec/disclosure 응답의 filings 배열:
//      [{ form, filed, reportDate, accessionNumber, items, description, url, documentUrl }, ...]
//  〔분류 기준〕
//    1) 8-K + items 코드: SEC 8-K item 매핑 테이블 (가장 중요 — 임시 변동 공시)
//    2) 10-K / 20-F: 연간 보고서 (정기, 약한 호재)
//    3) 10-Q: 분기 보고서 (정기, 약한 호재)
//    4) SC 13D: 5%+ 지분 액티브 신고 (주의 — 적대적/행동주의 가능성)
//    5) SC 13G: 5%+ 지분 패시브 신고 (호재 — 기관 매수)
//  〔반환 형식〕 SXI.advDisclosure와 완전 동일 (renderDisclosureCard 재사용)
//
//  〔8-K item 매핑 — 가장 자주 사용되는 항목 우선〕
//    호재: 1.01(중요계약) / 2.01(M&A 완료) / 7.01(공정공시) / 8.01(자발 공시)
//    주의: 1.02(계약 해지) / 2.03(부채) / 3.02(전환사채/CB) / 4.01(회계사 변경) / 5.02(임원 변경)
//    악재: 2.04(채무 trigger) / 2.05(구조조정 비용) / 2.06(자산 손상)
//    치명: 3.01(상폐 통보) / 4.02(재무제표 부인)
//    중립: 2.02(실적 발표 — 호불호 분기) / 5.01/5.03/5.07/9.01
// ════════════════════════════════════════════════════════════════════
const SEC_8K_ITEM_MAP = {
  '1.01': { type:'positive', name:'중요 계약 체결', impact:'신규 사업/공급 계약 체결. 계약 규모와 상대방을 확인하면 사업 확장 신호 여부를 판단할 수 있습니다.', score: 62 },
  '1.02': { type:'warning',  name:'중요 계약 해지', impact:'기존 사업 축소 가능성. 매출에 미치는 영향 규모를 8-K 원문에서 확인하세요.', score: 38 },
  '1.03': { type:'critical', name:'파산 보호 신청', impact:'⛔ Chapter 11 또는 Chapter 7 파산 절차. 주주 가치 거의 회복 불가.', score: 8 },
  '2.01': { type:'positive', name:'M&A 인수 완료', impact:'인수합병 마무리 — 시너지 기대 또는 신사업 진출. 인수가격과 자금조달 방식을 확인하세요.', score: 68 },
  '2.02': { type:'neutral',  name:'실적 발표', impact:'분기 실적이 발표되었습니다. 컨센서스 대비 매출/EPS 결과를 SEC 원문에서 확인하세요.', score: 50 },
  '2.03': { type:'warning',  name:'대규모 부채 발생', impact:'신규 부채 또는 신용한도 변경 — 재무 부담 증가 가능성.', score: 40 },
  '2.04': { type:'bearish',  name:'채무 약정 trigger', impact:'재무 약정(covenant) 위반 또는 가속화 조건 발동. 유동성 위기 신호.', score: 28 },
  '2.05': { type:'bearish',  name:'사업 종료 비용', impact:'구조조정 또는 사업 부문 정리 비용 발생 — 단기 손익 악화.', score: 30 },
  '2.06': { type:'bearish',  name:'자산 손상', impact:'영업권/무형자산 손상차손 인식 — 회계상 자산 가치 감소.', score: 28 },
  '3.01': { type:'critical', name:'상장폐지 통보', impact:'⛔ 거래소 상장폐지 절차 진행 중. 즉시 매도 검토.', score: 10 },
  '3.02': { type:'warning',  name:'비등록 지분 발행', impact:'전환사채/PIPE 등 비등록 신주 발행 — 기존 주주 지분 희석 가능성.', score: 35 },
  '3.03': { type:'warning',  name:'주주 권리 변경', impact:'주주 권리 또는 주식 종류 변경 — 영향 규모 확인 필요.', score: 42 },
  '4.01': { type:'warning',  name:'회계법인 교체', impact:'외부 감사인 변경 — 회계 의견 차이 가능성. 변경 사유를 확인하세요.', score: 38 },
  '4.02': { type:'critical', name:'재무제표 부인', impact:'⛔ 이전에 공시한 재무제표를 더 이상 신뢰할 수 없다는 공식 발표. 매우 위험.', score: 8 },
  '5.01': { type:'neutral',  name:'지배구조 변경', impact:'대주주/경영권 변동 — 호불호 분기. 인수 주체와 의도를 확인하세요.', score: 45 },
  '5.02': { type:'neutral',  name:'임원 변경', impact:'CEO/CFO/이사회 변경 — 사임/해임 사유에 따라 의미가 달라집니다.', score: 45 },
  '5.03': { type:'neutral',  name:'정관 변경', impact:'회사 정관 또는 부속 규정 수정.', score: 50 },
  '5.07': { type:'neutral',  name:'주주총회 결과', impact:'안건 의결 결과 — 안건 내용을 확인하세요.', score: 50 },
  '7.01': { type:'positive', name:'공정공시 (Reg FD)', impact:'IR/투자자 대상 자료 공개 — 일반적으로 신사업/제품 발표.', score: 55 },
  '8.01': { type:'positive', name:'기타 자율 공시', impact:'자발적 공시 — 일반적으로 회사가 알리고 싶은 호재성 내용.', score: 55 },
  '9.01': { type:'neutral',  name:'재무제표 첨부', impact:'다른 공시의 보조 자료 첨부 — 단독으로는 큰 의미 없음.', score: 50 },
};

SXI.advDisclosureSec = function(filings){
  // 빈 응답 = 한국과 동일 중립 응답 (renderDisclosureCard 호환)
  if(!filings || !filings.length){
    return {
      tone:'neutral', label:'공시 이슈 없음',
      text:'최근 90일 내 주요 SEC 공시(8-K, 10-K, 10-Q 등)가 감지되지 않았습니다. SEC 공시 관점에서 중립입니다.',
      summary:'SEC 공시 관련 특이사항 없음.',
      badges:[], sectorScore:50, sectorGrade:'C',
      sectorText:'50점 (C등급). 최근 주요 SEC 공시 없음 — 공시 관점 중립.',
      lineEntries:[],
      _source:'sec'
    };
  }

  const badges = [];
  const lines = [];
  const lineEntries = [];
  let hasCritical = false, hasSevere = false, hasWarning = false, hasPositive = false;
  let totalScore = 0;
  let scoreCount = 0;

  // [정렬] 최신순 (filed 내림차순)
  const sorted = filings.slice().sort((a, b) => (b.filed || '').localeCompare(a.filed || ''));

  for(const f of sorted){
    const fForm = f.form || '';
    const fDate = f.filed || '';
    const fUrl  = f.documentUrl || f.url || null;

    if(fForm === '8-K' || fForm === '8-K/A'){
      // 8-K items 처리 — items는 콤마 구분 ("2.02,9.01")
      const itemsStr = f.items || '';
      const codes = itemsStr ? itemsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
      if(codes.length === 0){
        // items 없는 8-K — 일반 호재성으로 약하게 분류
        badges.push({ type:'neutral', text:'8-K (기타 변동)', date: fDate, url: fUrl, score: 50 });
        // [S324 FIX] formatted 속성 필수 — renderDisclosureCard가 e.formatted를 사용
        //   누락 시 lineEntries entries 본문이 undefined로 렌더 → 카드 안 빈 공간 발생
        const fmt = `【8-K (기타)】 ${fDate}\n분류 항목 없는 변동 공시. SEC 원문 확인 권장.`;
        lines.push(fmt);
        lineEntries.push({ date: fDate, tone:'neutral', title:'8-K (기타)', desc:'분류 항목 없는 변동 공시', formatted: fmt, url: fUrl });
        totalScore += 50; scoreCount++;
        continue;
      }
      // 각 item 코드별 분류
      for(const code of codes){
        const meta = SEC_8K_ITEM_MAP[code];
        if(!meta){
          // 매핑 안 된 코드 — 그대로 표시
          badges.push({ type:'neutral', text:`8-K Item ${code}`, date: fDate, url: fUrl, score: 50 });
          const fmtu = `【8-K Item ${code}】 ${fDate}\n분류 매핑 없는 항목 — SEC 원문에서 내용을 확인하세요.`;
          lines.push(fmtu);
          lineEntries.push({ date: fDate, tone:'neutral', title:`Item ${code}`, desc:'분류 매핑 없음', formatted: fmtu, url: fUrl });
          totalScore += 50; scoreCount++;
          continue;
        }
        const badgeType = (meta.type === 'critical') ? 'danger'
                        : (meta.type === 'bearish')  ? 'bearish'
                        : (meta.type === 'warning')  ? 'warning'
                        : (meta.type === 'positive') ? 'bullish'
                        : 'neutral';
        badges.push({ type: badgeType, text:`8-K Item ${code} (${meta.name})`, date: fDate, url: fUrl, score: meta.score });
        const fmt = `【8-K Item ${code}】 ${meta.name} (${fDate})\n${meta.impact}`;
        lines.push(fmt);
        lineEntries.push({ date: fDate, tone: badgeType, title:`Item ${code} ${meta.name}`, desc: meta.impact, formatted: fmt, url: fUrl });
        if(meta.type === 'critical') hasCritical = true;
        else if(meta.type === 'bearish') hasSevere = true;
        else if(meta.type === 'warning') hasWarning = true;
        else if(meta.type === 'positive') hasPositive = true;
        totalScore += meta.score; scoreCount++;
      }
    } else if(fForm === '10-K' || fForm === '10-K/A' || fForm === '20-F' || fForm === '20-F/A'){
      const label = (fForm.startsWith('20-F')) ? '연간보고서 (외국인 발행사)' : '연간보고서';
      badges.push({ type:'neutral', text:`${fForm} (${label})`, date: fDate, url: fUrl, score: 55 });
      const fmt = `【${fForm}】 ${label} (${fDate})\n정기 공시 — 사업 현황, 위험요인, 재무제표 전체 확인 가능.`;
      lines.push(fmt);
      lineEntries.push({ date: fDate, tone:'bullish', title:`${fForm} ${label}`, desc:'정기 연간보고서', formatted: fmt, url: fUrl });
      hasPositive = true;
      totalScore += 55; scoreCount++;
    } else if(fForm === '10-Q' || fForm === '10-Q/A'){
      badges.push({ type:'neutral', text:`${fForm} (분기보고서)`, date: fDate, url: fUrl, score: 55 });
      const fmt = `【${fForm}】 분기보고서 (${fDate})\n분기 실적 + 재무 상태 업데이트.`;
      lines.push(fmt);
      lineEntries.push({ date: fDate, tone:'bullish', title:`${fForm} 분기보고서`, desc:'분기 실적 정기 공시', formatted: fmt, url: fUrl });
      hasPositive = true;
      totalScore += 55; scoreCount++;
    } else if(fForm.startsWith('SC 13D')){
      badges.push({ type:'warning', text:`${fForm} (5%+ 지분 — 액티브)`, date: fDate, url: fUrl, score: 40 });
      const fmt = `【${fForm}】 5%+ 지분 액티브 신고 (${fDate})\n적대적 인수 또는 행동주의 투자자 등장 가능성. 누가 신고했는지 SEC 원문에서 확인.`;
      lines.push(fmt);
      lineEntries.push({ date: fDate, tone:'warning', title:`${fForm} 5%+ 지분`, desc:'액티브 신고', formatted: fmt, url: fUrl });
      hasWarning = true;
      totalScore += 40; scoreCount++;
    } else if(fForm.startsWith('SC 13G')){
      badges.push({ type:'positive', text:`${fForm} (5%+ 지분 — 패시브)`, date: fDate, url: fUrl, score: 58 });
      const fmt = `【${fForm}】 5%+ 지분 패시브 신고 (${fDate})\n기관의 패시브 매수 — 호재.`;
      lines.push(fmt);
      lineEntries.push({ date: fDate, tone:'bullish', title:`${fForm} 5%+ 지분`, desc:'패시브 매수 신고', formatted: fmt, url: fUrl });
      hasPositive = true;
      totalScore += 58; scoreCount++;
    } else {
      // 기타 form (DEF 14A 위임장 등) — 중립 처리
      badges.push({ type:'neutral', text: fForm, date: fDate, url: fUrl, score: 50 });
      const fmt = `【${fForm}】 (${fDate})\n기타 정기/일회성 공시.`;
      lines.push(fmt);
      lineEntries.push({ date: fDate, tone:'neutral', title: fForm, desc:'기타 공시', formatted: fmt, url: fUrl });
      totalScore += 50; scoreCount++;
    }
  }

  // tone 결정 — 가장 심각한 단계 우선
  let tone = 'neutral';
  if(hasCritical) tone = 'danger';
  else if(hasSevere) tone = 'bearish';
  else if(hasWarning && !hasPositive) tone = 'warning';
  else if(hasWarning && hasPositive) tone = 'warning';      // 혼조 시 보수적
  else if(hasPositive) tone = 'bullish';

  const sScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 50;
  const sGrade = sScore >= 80 ? 'A' : sScore >= 65 ? 'B' : sScore >= 45 ? 'C' : sScore >= 30 ? 'D' : 'E';

  const labels = {
    'danger':  '치명적 SEC 공시 감지',
    'bearish': '부정적 SEC 공시 감지',
    'warning': '주의 SEC 공시 감지',
    'bullish': '호재성 SEC 공시 감지',
    'neutral': '일반 SEC 공시'
  };

  let summary = '';
  if(hasCritical) summary = '상장폐지·재무제표 부인·파산 등 치명적 SEC 공시가 감지되었습니다. 보유 중이면 즉시 정리를 검토하세요.';
  else if(hasSevere) summary = '자산 손상·구조조정 비용·채무 약정 위반 등 부정적 SEC 공시가 감지되었습니다. 신규 매수는 자제하세요.';
  else if(hasWarning && hasPositive) summary = '호재와 악재 SEC 공시가 동시에 감지되었습니다. 8-K 원문을 확인하고 영향 규모를 점검하세요.';
  else if(hasWarning) summary = '지분 변동·전환사채·임원 변경 등 주의가 필요한 SEC 공시가 있습니다.';
  else if(hasPositive) summary = '정기 보고서 또는 호재성 SEC 공시 — 큰 이슈 없는 정상 활동.';
  else summary = 'SEC 공시 관련 특이사항 없음.';

  const sText = `${sScore}점 (${sGrade}등급). ${summary}`;

  return {
    tone, label: labels[tone] || labels.neutral,
    text: lines.join('\n\n'),
    lineEntries,
    summary, badges,
    sectorScore: sScore, sectorGrade: sGrade, sectorText: sText,
    _source: 'sec'   // 출처 표시 (한국 'dart' 대응)
  };
};

/**
 * 공시 감지 시 종합평(summary) 오버라이드
 * @param {object} baseSummary - SXI.summary() 원본 결과
 * @param {object} discItp - SXI.advDisclosure() 결과
 * @returns {object} 수정된 summary
 */
SXI.overrideSummaryWithDisclosure = function(baseSummary, discItp){
  if(!discItp || discItp.tone === 'neutral') return baseSummary;
  const s = {...baseSummary};

  if(discItp.tone === 'danger'){
    // CRITICAL: 종합평 전면 교체
    s.tone = 'bearish';
    s.stateLine = '⛔ 치명적 공시 감지 — 투자 부적격';
    s.mainText = '이 종목에서 상장폐지, 파산, 거래정지 등 치명적 공시가 감지되었습니다. 기술적 분석 결과와 무관하게 이 종목은 신규 진입이 금지되며, 기존 보유자는 즉시 포지션 정리를 검토해야 합니다.';
    s.actionGuide = '⛔ 신규 매수 금지. 기존 보유 시 손절 또는 즉시 매도를 적극 검토하세요. 기술적 반등 신호가 나타나더라도 펀더멘탈 위험이 압도적입니다.';
    s.invalidation = '';
    s.buyTrigger = '';
    // 공시 카드를 핵심이유 최상단에 삽입
    s.keyReasons = [{
      tone:'danger', icon:'⛔',
      title:'치명적 공시 감지',
      text: discItp.badges.map(b => `${b.text} (${b.date||''})`).join(', ') + ' — ' + discItp.summary
    }, ...s.risks, ...s.keyReasons.filter(r=>r.tone==='bullish').slice(0,1)];
    s.risks = [];
  } else if(discItp.tone === 'bearish'){
    // SEVERE: 종합평 톤 하향 + 경고 삽입
    s.tone = 'bearish';
    s.stateLine = '[주의] 위험 공시 감지 — ' + (s.stateLine || '');
    s.mainText = '이 종목에서 관리종목·자본잠식·감자 등 심각한 공시가 감지되었습니다. ' + s.mainText;
    s.actionGuide = '[주의] 신규 매수 자제. ' + (s.actionGuide || '보유 중이면 비중 축소를 적극 검토하세요.');
    // 공시 경고를 risks 최상단에 삽입
    s.risks.unshift({
      tone:'danger', icon:'[!]',
      title:'위험 공시 감지',
      text: discItp.badges.map(b => b.text).join(', ') + ' — ' + discItp.summary
    });
  } else if(discItp.tone === 'mixed'){
    // [PATCH mixed] 호재·주의 동시 — 양쪽 다 노출 (호재는 keyReasons로, 주의는 risks로)
    //   사용자가 두 면을 모두 인지하고 판단할 수 있도록 정보 손실 없이 전달
    const positiveBadges = discItp.badges.filter(b => b.cls === 'positive');
    const warningBadges = discItp.badges.filter(b => b.cls === 'caution');
    if(warningBadges.length){
      s.risks.unshift({
        tone:'warning', icon:'[!]',
        title:'주의 공시 감지',
        text: warningBadges.map(b => b.text).join(', ') + ' — 지분 희석/소송 등 영향을 우선 점검하세요.'
      });
    }
    if(positiveBadges.length){
      s.keyReasons.push({
        tone:'bullish', icon:'[v]',
        title:'호재 공시 감지',
        text: positiveBadges.map(b => b.text).join(', ') + ' — 펀더멘탈 개선 신호이나, 위 주의 공시와 함께 판단하세요.'
      });
    }
    if(s.tone === 'bullish') s.mainText += ' 단, 주의 공시가 동시에 감지되어 공시 원문 확인이 필요합니다.';
  } else if(discItp.tone === 'warning'){
    // WARNING: 경고 추가
    s.risks.unshift({
      tone:'warning', icon:'[!]',
      title:'주의 공시 감지',
      text: discItp.badges.map(b => b.text).join(', ') + ' — ' + discItp.summary
    });
    if(s.tone === 'bullish') s.mainText += ' 단, 주의 공시가 감지되어 공시 원문 확인 후 판단하세요.';
  } else if(discItp.tone === 'bullish'){
    // POSITIVE: 가점
    s.keyReasons.push({
      tone:'bullish', icon:'[v]',
      title:'호재 공시 감지',
      text: discItp.badges.map(b => b.text).join(', ') + ' — ' + discItp.summary
    });
  }
  return s;
};

// ════════════════════════════════════════════════════════════
//  S58: 공매도 잔고 → 종합평 오버라이드
// ════════════════════════════════════════════════════════════
/**
 * 공매도 잔고 비중에 따라 종합평 보정
 * @param {object} baseSummary - SXI.summary() 또는 이전 override 결과
 * @param {object} shortItp - SXI.advShortSelling() 결과
 * @param {number} ratio - 공매도 잔고 비중 (%)
 * @returns {object} 수정된 summary
 */
SXI.overrideSummaryWithShortSelling = function(baseSummary, shortItp, ratio){
  if(!shortItp || shortItp.tone === 'neutral') return baseSummary;
  const s = {...baseSummary};
  // keyReasons, risks 깊은 복사
  s.keyReasons = [...(s.keyReasons||[])];
  s.risks = [...(s.risks||[])];

  if(shortItp.tone === 'bearish' && ratio >= 10){
    // 매우 높은 공매도: 더 강한 경고
    if(s.tone !== 'bearish') s.tone = 'bearish';
    s.stateLine = '[하락] 공매도 잔고 과다 — ' + (s.stateLine || '');
    s.risks.unshift({
      tone:'danger', icon:'[v]',
      title:'공매도 잔고 심각 (' + ratio.toFixed(1) + '%)',
      text: '공매도 잔고가 10%를 넘어 시장이 이 종목의 구조적 하락을 예상하고 있습니다. ' + shortItp.summary
    });
    if(s.actionGuide){
      s.actionGuide += ' 공매도 잔고가 극히 높으므로 신규 매수를 자제하세요.';
    }
  } else if(shortItp.tone === 'bearish' && ratio >= 5){
    // 높은 공매도: 톤 하향 + 위험 요소 삽입
    if(s.tone === 'bullish'){
      s.tone = 'neutral';
      s.mainText += ' 그러나 공매도 잔고 비중이 높아(' + ratio.toFixed(1) + '%) 상승 지속성에 의문이 있습니다. 숏커버링 랠리 가능성을 감안하되, 포지션 크기를 줄이세요.';
    }
    s.risks.unshift({
      tone:'bearish', icon:'[v]',
      title:'공매도 잔고 경고 (' + ratio.toFixed(1) + '%)',
      text: shortItp.summary
    });
    if(s.actionGuide){
      s.actionGuide += ' 공매도 잔고가 높으므로 진입 시 손절라인을 타이트하게 설정하세요.';
    }
  } else if(shortItp.tone === 'warning'){
    // 보통 공매도: 주의 요소 추가
    s.risks.push({
      tone:'warning', icon:'[#]',
      title:'공매도 잔고 관찰 (' + ratio.toFixed(1) + '%)',
      text: shortItp.summary
    });
  } else if(shortItp.tone === 'bullish'){
    // 극소 공매도: 긍정 요소 추가
    s.keyReasons.push({
      tone:'bullish', icon:'[#]',
      title:'공매도 부담 없음',
      text: shortItp.summary
    });
  }

  return s;
};

// ════════════════════════════════════════════════════════════
//  S58: 공매도 잔고 해석 (advShortSelling)
// ════════════════════════════════════════════════════════════
/**
 * 공매도 잔고 비중 기반 상세 해석
 * @param {number} ratio - 공매도 잔고 비중 (%)
 * @param {object} [ctx] - 추가 맥락 {price, changeRate, volume, foreignRatio, marketCap}
 * @returns {object} {tone, label, text, summary}
 */
SXI.advShortSelling = function(ratio, ctx){
  if(ratio == null || ratio < 0) return null;
  ctx = ctx || {};
  const lines = [];
  let tone = 'neutral';

  if(ratio >= 10){
    tone = 'bearish';
    lines.push(`공매도 잔고 비중 ${ratio.toFixed(2)}% — 매우 높은 수준입니다. 시장 참여자들이 이 종목의 하락에 강하게 베팅하고 있으며, 펀더멘탈이나 수급에 심각한 우려가 있다는 신호입니다.`);
    lines.push('공매도 잔고가 10%를 넘으면 기관·외국인이 구조적 하락을 예상하는 경우가 많습니다. 기술적 반등이 나타나더라도 "숏커버링 랠리"일 가능성이 높아 지속성을 신뢰하기 어렵습니다.');
    lines.push('신규 매수는 매우 위험합니다. 보유 중이면 반등 시 비중 축소를 적극 검토하세요. 공매도 잔고가 감소세로 전환되는지 추적 관찰이 필요합니다.');
  } else if(ratio >= 5){
    tone = 'bearish';
    lines.push(`공매도 잔고 비중 ${ratio.toFixed(2)}% — 높은 수준입니다. 하락 베팅이 상당히 쌓여 있으며, 기관 또는 외국인이 하방 리스크를 인식하고 있다는 뜻입니다.`);
    lines.push('다만, 공매도 잔고가 높다는 것은 역설적으로 "숏커버링 수요"가 잠재되어 있다는 의미이기도 합니다. 호재 발생 시 공매도 청산 매수가 동시에 터지면서 급등하는 "숏스퀴즈"가 나타날 수 있습니다.');
    if(ctx.changeRate > 3){
      lines.push(`오늘 ${ctx.changeRate.toFixed(1)}% 상승 중인 점을 감안하면, 현재 숏커버링이 진행 중일 가능성이 있습니다. 다만 일시적 반등인지 추세 전환인지는 거래량과 후속 흐름으로 판단해야 합니다.`);
    }
    lines.push('기술적 매수 신호가 있더라도 포지션을 줄이고 손절을 타이트하게 설정하세요.');
  } else if(ratio >= 2){
    tone = 'warning';
    lines.push(`공매도 잔고 비중 ${ratio.toFixed(2)}% — 보통 수준입니다. 일정량의 공매도 포지션이 존재하나, 시장에서 극단적 하락을 예상하는 수준은 아닙니다.`);
    lines.push('공매도 비중이 2~5% 구간에서는 수급 요인보다 개별 종목의 펀더멘탈과 기술적 흐름이 더 중요합니다. 공매도 잔고 추이가 증가세인지 감소세인지를 함께 관찰하면 방향성 판단에 도움이 됩니다.');
    if(ctx.foreignRatio > 30){
      lines.push(`외국인 지분율 ${ctx.foreignRatio.toFixed(1)}%로 높은 편이어서, 외국인 매도와 공매도가 겹치면 수급 악화가 빠르게 진행될 수 있습니다. 외국인 순매수/매도 동향도 함께 확인하세요.`);
    }
  } else if(ratio >= 0.5){
    tone = 'neutral';
    lines.push(`공매도 잔고 비중 ${ratio.toFixed(2)}% — 낮은 수준입니다. 시장에서 이 종목에 대한 하락 베팅이 미미하며, 공매도로 인한 추가 하방 압력은 거의 없습니다.`);
    lines.push('공매도 부담이 적은 종목은 기술적 신호에 따른 매매가 비교적 자유롭습니다. 다른 분석 지표에 집중하는 것이 효율적입니다.');
  } else {
    tone = 'bullish';
    lines.push(`공매도 잔고 비중 ${ratio.toFixed(2)}% — 극히 낮은 수준입니다. 시장 참여자들이 이 종목의 하락 가능성을 거의 보지 않고 있으며, 공매도 압력이 전무합니다.`);
    lines.push('공매도가 거의 없는 종목은 상승 시 매도 압력이 적어 추세가 강하게 이어질 수 있습니다. 기술적 매수 신호와 결합 시 교과서에서는 신뢰도가 높아진다고 봅니다.');
  }

  // 시가총액 맥락
  if(ctx.marketCap){
    if(ctx.marketCap < 3000 && ratio >= 3){
      lines.push(`시가총액 ${(ctx.marketCap/10000).toFixed(1)}조원 이하의 중소형주에서 공매도 잔고 ${ratio.toFixed(1)}%는 유동성 대비 상당한 규모입니다. 소형주의 공매도는 주가에 더 큰 영향을 미치므로 각별히 주의하세요.`);
    } else if(ctx.marketCap > 100000 && ratio >= 5){
      lines.push(`대형주임에도 공매도 잔고가 ${ratio.toFixed(1)}%로 높은 것은 기관 투자자들의 확신이 담긴 하락 베팅입니다. 대형주 공매도는 리서치 기반의 구조적 판단인 경우가 많아 가볍게 볼 수 없습니다.`);
    }
  }

  const labels = {
    bullish: '공매도 잔고 극소 — 매도 압력 없음',
    neutral: '공매도 잔고 낮음 — 수급 중립',
    warning: '공매도 잔고 보통 — 추이 관찰 필요',
    bearish: '공매도 잔고 높음 — 하방 압력 경고'
  };

  const summaries = {
    bullish: '공매도 잔고가 극히 낮아 수급 측면에서 긍정적입니다. 상승 시 매도 저항이 적습니다.',
    neutral: '공매도 잔고가 낮은 수준이며, 수급 중립입니다. 다른 분석 지표에 집중하세요.',
    warning: '공매도 잔고가 보통 수준입니다. 잔고 추이가 증가 중이면 주의가 필요합니다.',
    bearish: '공매도 잔고가 높아 하방 압력이 존재합니다. 기술적 매수 신호가 있어도 포지션 크기를 줄이세요.'
  };

  return {
    tone, label: labels[tone],
    text: lines.join('\n'),
    summary: summaries[tone]
  };
};

// ════════════════════════════════════════════════════════════
//  S58: 자본 구조 해석 (advCapitalStructure)
// ════════════════════════════════════════════════════════════
/**
 * 액면가 + 자본금 기반 구조 해석
 * @param {number} faceValue - 액면가 (원)
 * @param {number} capital - 자본금 (억원)
 * @param {number} marketCap - 시가총액 (억원)
 * @param {number} [price] - 현재가
 * @returns {object} {tone, label, text, summary}
 */
SXI.advCapitalStructure = function(faceValue, capital, marketCap, price){
  if(faceValue == null && capital == null) return null;
  const lines = [];
  let tone = 'neutral';
  let bullCount = 0, bearCount = 0;

  // 액면가 해석
  if(faceValue != null){
    if(faceValue >= 5000){
      lines.push(`액면가 ${faceValue.toLocaleString()}원 — 표준 액면가(5,000원)입니다. 대부분의 상장기업이 채택하는 수준이며, 액면분할 이력이 없는 전통적 기업 구조입니다.`);
    } else if(faceValue >= 1000){
      lines.push(`액면가 ${faceValue.toLocaleString()}원 — 액면분할을 실시한 기업입니다. 주당 가격을 낮춰 소액투자 접근성을 높인 것으로, 유동성 개선 의도가 반영되어 있습니다.`);
    } else if(faceValue >= 100){
      lines.push(`액면가 ${faceValue.toLocaleString()}원 — 소액 액면가입니다. 여러 차례 액면분할을 거쳤거나 처음부터 낮은 액면가로 설정된 기업입니다. 주식 수가 매우 많아 유동성이 풍부합니다.`);
    } else if(faceValue > 0){
      lines.push(`액면가 ${faceValue.toLocaleString()}원 — 극소 액면가입니다. 발행주식수가 매우 많으며, 자본 구조 변동(감자 후 재상장 등)을 거친 경우가 있습니다. 주식 수 대비 자본금 규모를 반드시 확인하세요.`);
    }

    // 액면가 대비 주가 배율
    if(price && faceValue > 0){
      const ratio = price / faceValue;
      if(ratio < 1){
        lines.push(`현재 주가가 액면가보다 낮습니다 (${ratio.toFixed(2)}배). 이는 자본잠식 가능성을 시사하며, 기업 존속 자체에 위험이 있을 수 있습니다. 재무제표를 반드시 확인하세요.`);
        bearCount += 2;
      } else if(ratio < 2){
        lines.push(`주가가 액면가의 ${ratio.toFixed(1)}배로, 액면가 근처에서 거래 중입니다. 시장이 기업 가치를 매우 낮게 평가하는 상태이며, 저PBR 가치주이거나 실적 부진 기업일 수 있습니다.`);
        bearCount++;
      }
    }
  }

  // 자본금 해석
  if(capital != null && marketCap){
    const capRatio = (capital / marketCap) * 100;
    if(capital < 50){
      lines.push(`자본금 ${capital.toFixed(0)}억원 — 소규모 자본금입니다. 초기 기업이거나 자본 규모가 작은 기업으로, 유상증자·전환사채 등 자금조달 이벤트에 주가 민감도가 높습니다.`);
    } else if(capital < 500){
      lines.push(`자본금 ${capital.toFixed(0)}억원 — 중소규모 자본금입니다.`);
    } else if(capital < 5000){
      lines.push(`자본금 ${capital.toFixed(0)}억원 — 중견 규모의 자본금입니다. 안정적인 자본 기반을 갖추고 있으며, 대규모 자금조달 없이도 사업 운영이 가능한 수준입니다.`);
    } else {
      lines.push(`자본금 ${capital.toFixed(0)}억원 — 대규모 자본금입니다. 대형 기업의 자본 구조로, 재무적 안정성이 높습니다.`);
      bullCount++;
    }

    if(capRatio > 100){
      lines.push(`자본금이 시가총액보다 큽니다 (시총 대비 ${capRatio.toFixed(0)}%). 이는 시장이 기업의 자산 가치를 액면가치 이하로 평가하는 극단적 저평가 상태이거나, 자본잠식·적자 누적에 따른 기업 가치 훼손을 반영합니다.`);
      bearCount += 2;
    } else if(capRatio > 50){
      lines.push(`자본금이 시가총액의 절반 이상(${capRatio.toFixed(0)}%)을 차지합니다. 시장 프리미엄이 매우 낮은 상태로, 자산가치 대비 저평가 가능성과 성장 기대 부재를 동시에 나타냅니다.`);
      bearCount++;
    }
  }

  if(bullCount >= 2) tone = 'bullish';
  else if(bearCount >= 2) tone = 'bearish';
  else if(bearCount >= 1) tone = 'warning';

  const labels = {
    bullish: '자본 구조 양호 — 안정적 기반',
    bearish: '자본 구조 취약 — 리스크 점검 필요',
    warning: '자본 구조 주의 — 추가 확인 권장',
    neutral: '자본 구조 보통'
  };

  return {
    tone, label: labels[tone],
    text: lines.join('\n'),
    summary: tone === 'bearish' ? '자본 구조에서 부정적 신호가 감지됩니다. 재무제표와 자본변동을 면밀히 확인하세요.'
      : tone === 'warning' ? '자본 구조에 일부 주의 요소가 있습니다. 액면가 대비 주가 수준을 참고하세요.'
      : '자본 구조가 안정적이며, 특별한 리스크 요인이 없습니다.'
  };
};

// ════════════════════════════════════════════════════════════
//  S58: 결산월 해석 (advSettleMonth)
// ════════════════════════════════════════════════════════════
/**
 * 결산월 기반 투자 시점 해석
 * @param {number|string} month - 결산월 (1~12)
 * @returns {object} {tone, label, text, summary}
 */
SXI.advSettleMonth = function(month){
  if(month == null) return null;
  const m = parseInt(month);
  if(isNaN(m) || m < 1 || m > 12) return null;

  const lines = [];
  const now = new Date();
  const curMonth = now.getMonth() + 1; // 1~12

  // 결산 시점까지 남은 개월 수
  let monthsToSettle = m - curMonth;
  if(monthsToSettle <= 0) monthsToSettle += 12;

  // 실적 시즌 판단
  const isCommon = (m === 12);
  const settleLabel = m + '월';

  if(isCommon){
    lines.push(`결산월 12월 — 가장 일반적인 결산 주기입니다. 매년 3월 주주총회, 4월 사업보고서 공시가 이루어지며, 국내 대부분의 기업과 동일한 사이클을 따릅니다.`);
    // 시기별 조언
    if(curMonth >= 1 && curMonth <= 3){
      lines.push('현재 시점은 결산 이후~사업보고서 공시 직전입니다. 잠정실적과 최종 감사 결과 차이에 주의하세요. 배당주라면 배당 기준일(보통 12월 말)이 이미 지났으므로 배당락 반영 여부를 확인하세요.');
    } else if(curMonth >= 4 && curMonth <= 5){
      lines.push('실적 시즌입니다. 1분기 실적과 연간 사업보고서가 동시에 나오는 시기로, 실적 서프라이즈 또는 쇼크에 따른 주가 변동이 큽니다. 실적 발표 전후 포지션 관리에 주의하세요.');
    } else if(curMonth >= 10 && curMonth <= 12){
      lines.push('결산 시즌이 다가오고 있습니다. 기관의 연말 포트폴리오 조정(윈도우 드레싱)과 배당 투자 수요가 겹치는 시기입니다. 배당수익률이 높은 종목은 12월 배당 기준일까지 매수세가 이어질 수 있습니다.');
    }
  } else {
    lines.push(`결산월 ${settleLabel} — 비일반 결산 주기입니다. 12월 결산이 아닌 기업은 금융업(3월), 학교법인(2월), 외국계 기업 등에서 주로 나타납니다.`);
    lines.push(`비표준 결산 기업은 실적 발표 시점이 다른 종목과 다르기 때문에, 시장 전체의 실적 시즌과 무관하게 개별 이벤트가 발생합니다. 결산월 +1~2개월 후 실적 공시를 주시하세요.`);
    if(m === 3){
      lines.push('3월 결산은 금융회사(은행·보험·증권)에서 많이 사용합니다. 금융업 규제와 배당 정책이 주가에 큰 영향을 미칩니다.');
    } else if(m === 6){
      lines.push('6월 결산 기업은 반기 실적이 연간 실적 역할을 합니다. 7~8월에 사업보고서가 공시되므로 이 시기 실적에 주목하세요.');
    }
  }

  lines.push(`현재 시점 기준 결산까지 약 ${monthsToSettle}개월 남았습니다. 결산 2~3개월 전부터는 실적 추정치 변동과 기관 수급 변화에 민감해지므로, 이 기간에 진입한다면 실적 리스크를 감안한 포지션 사이징이 필요합니다.`);

  return {
    tone: 'neutral',
    label: `결산월 ${settleLabel}${isCommon ? ' (표준)' : ' (비표준)'}`,
    text: lines.join('\n'),
    summary: isCommon ? '12월 결산 표준 기업입니다. 시장 전체 실적 시즌과 동기화되어 있어 정보 접근성이 좋습니다.'
      : `${settleLabel} 결산 비표준 기업입니다. 실적 발표 시점이 시장과 다르므로 개별 일정을 추적하세요.`
  };
};

// ════════════════════════════════════════════════════════════
//  S58: 공시 카드 해석 렌더용 (advDisclosureSummary)
// ════════════════════════════════════════════════════════════
/**
 * 공시 해석 결과를 분석탭 카드로 렌더하기 위한 요약
 * (기존 advDisclosure 결과를 받아서 카드 형태로 정리)
 * @param {object} discItp - SXI.advDisclosure() 결과
 * @returns {string} HTML string
 */
SXI.renderDisclosureCard = function(discItp){
  if(!discItp || discItp.tone === 'neutral') return '';
  const badgeHTML = discItp.badges.map(b => {
    const cls = b.cls || 'neutral';
    const catStr = b.category ? `<span style="font-size:7px;color:var(--text3);margin-left:2px">[${b.category}]</span>` : '';
    const dateStr = b.date ? `<span style="font-size:7px;color:var(--text3);margin-left:3px">${b.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}</span>` : '';
    const urlAttr = b.url ? ` data-dart-url="${b.url}" onclick="window.open(this.dataset.dartUrl,'_blank')" style="cursor:pointer"` : '';
    return `<span class="disc-badge ${cls}"${urlAttr}>${b.text}${catStr}${dateStr}</span>`;
  }).join('');

  // [PATCH disclose-fold] 본문 분할 렌더 — 최근 2건은 즉시 표시, 나머지는 토글로 접음
  //   discItp.lineEntries가 있으면 이 경로로, 없으면 기존 text 통째로 (폴백 호환)
  //   모바일 화면에서 공시가 5~6건 쌓이면 카드가 너무 길어지는 문제 해결
  //   [S57-compact] 단락 간 \n\n → \n 축소 — 모바일 화면에서 카드가 과도하게 커지는 문제 추가 개선
  let bodyHTML;
  const entries = discItp.lineEntries || null;
  if(entries && entries.length > 0){
    const HEAD_COUNT = 2;                            // 항상 보일 갯수
    const head = entries.slice(0, HEAD_COUNT);
    const tail = entries.slice(HEAD_COUNT);
    const headHTML = head.map(e => e.formatted).join('\n');
    if(tail.length > 0){
      // 토글 ID — 같은 페이지 내 다른 카드와 충돌 방지
      const tid = 'disc_more_' + Math.random().toString(36).slice(2, 8);
      const tailHTML = tail.map(e => e.formatted).join('\n');
      // [S57-compact v4] 토글 영역 여백 최소화 — margin/padding 1px까지
      bodyHTML = `<div style="margin:0;padding:0">${headHTML}</div>
        <div class="itp-toggle-inline" onclick="_sxVib(8);const c=document.getElementById('${tid}');c.classList.toggle('show');this.querySelector('.sb-arrow').textContent=c.classList.contains('show')?'▼':'▶';this.querySelector('.sb-label').textContent=c.classList.contains('show')?'추가 ${tail.length}건 접기':'추가 ${tail.length}건 보기'" style="font-size:10px;color:var(--accent);cursor:pointer;font-weight:600;margin:2px 0 0 0 !important;padding:1px 0 0 0 !important;border-top:1px dashed var(--border)"><span class="sb-arrow">▶</span> <span class="sb-label">추가 ${tail.length}건 보기</span></div>
        <div class="itp-card disc-more-body" id="${tid}" style="background:transparent !important;padding:0 !important;margin:1px 0 0 0 !important">${tailHTML}</div>`;
    } else {
      bodyHTML = `<div style="margin:0;padding:0">${headHTML}</div>`;
    }
  } else {
    // 폴백: lineEntries 없으면 text 통째로 (구버전 discItp 호환)
    bodyHTML = `<div style="margin:0;padding:0">${discItp.text}</div>`;
  }

  // [S57-compact v4] 카드 컴팩트화 — 위아래 폭 최대 압축
  //   v3에서도 안 줄어든 원인: CSS specificity 또는 다른 코드의 override 가능성
  //   → 모든 padding/margin을 !important로 강제하고, 본문 div에도 padding:0 명시
  //   v3 대비 추가:
  //     a) anal-section margin-bottom 6 → 4 !important (카드 외부 간격도 축소)
  //     b) badge 영역 margin-bottom 3 → 2
  //     c) itp-card padding 5px 8px → 4px 7px !important
  //     d) 본문 div에 padding:0 명시 (브라우저 div 기본 padding 차단)
  //     e) summary 구분선 padding-top 2 → 1
  //   ※ console에 "DISC_CARD v4 RENDERED" 출력 — 캐시 적용 확인용
  if(typeof console !== 'undefined' && console.log) console.log('[DISC_CARD v4] rendered, tone=' + discItp.tone);
  return `<div class="anal-section" style="margin:0 0 4px 0 !important;padding:7px !important">
    <div class="anal-section-title" style="margin:0 0 3px 0 !important;padding:0 !important">${discItp.label} <span style="font-size:9px;color:#22c55e;font-weight:400">[v4]</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin:0 0 2px 0;padding:0">${badgeHTML}</div>
    <div class="itp-card show" style="white-space:pre-line;padding:4px 7px !important;line-height:1.4 !important;margin:0 !important">
      ${bodyHTML}
      <div style="margin:2px 0 0 0;padding:1px 0 0 0;border-top:1px solid var(--border);font-size:10px;color:var(--text2)">${discItp.summary}</div>
    </div>
  </div>`;
};

// ════════════════════════════════════════════════════════════
//  S69: 초보자 실전 가이드 (practicalGuide)
//  행동지침 4분류 + 점수 + 지표 상태 → 단계별 안내
//  반환: { title, steps[], nextAction, caution, crossCheck }
// ════════════════════════════════════════════════════════════

// S103-fix7 Phase3-B-1: practicalGuide 시그니처 — verdictAction 9종 직접 수신
//   현재 사양: 프로젝트 C 원칙 ② "C의 단일성" 준수 — _btAction 파생 의존성 제거, _svVerdict.action 직접 소비
//   9종 분기: 매수/관심/관망/회피 (비보유) + 보유 유지/청산 준비/청산 검토/즉시 청산/매도 완료 (보유/청산 맥락)
//   비보유 4종(매수/관심/관망/회피) 가이드는 v1과 동일, 신규 5종(보유중~매도완료) 가이드 추가
//   배치: SXI 모듈에 그대로 유지 (sx_render.js가 활발히 사용 중 — sx_project_c.js로 이전 시 호출 경로 변경 부담)
//
// [v2.0] 4축 점수(scores4) + 모멘텀 배지(momBadge) 옵셔널 인자 추가
//   - scores4: {readyScore, entryScore, trendScore, btScore} — 사용자가 보는 4개 점수 그대로 가이드에 노출
//   - momBadge: {direction, label, deltas} — 모멘텀 보정 사유 설명용
//   - v1 호환: scores4 미전달 시 v1 텍스트 폴백 (analScore 단일 호출 그대로 작동)
SXI.practicalGuide = function(verdictAction, analScore, btScore, summary, ind, scores4, momBadge, passCount, passPath){
  //  ════ [S1305] BT 전략점수(btScore) 방향 주장 철거 ════
  //    ★근거: `sx_project_c.js:131`이 명시한다 — **S293에서 판정 4번째 축이 btScore → momDir로 교체**됐고
  //      "btScore는 하단 BT신뢰도 점수 바에서 별도 표시"로 강등됐다. 그런데 practicalGuide만
  //      `_as`(진입타이밍)와 `_bs`(매매전략)를 나란히 놓고 판정 축인 양 서술해 **4축 시절 잔재**로 남았다.
  //      S508이 인자 전달(passCount·passPath)은 고쳤으나 **서술은 그대로 두었다.**
  //    ★서술 자체도 부정확했다: `calcBtScore(btData, stock)`의 btData는 **그 종목의 백테스트**인데
  //      화면은 "이런 **조건**에서 매매했을 때"라고 말했다. 조건이 아니라 **종목**이다.
  //    ⇒ 방향 주장 3건 제거 · 점수 병기는 사실 진술로 정정 · btScore 값 자체는 계속 표시한다.
  //      (calcBtScore는 철거하지 않는다 — BT 신뢰도 바·결과 카드 배지가 정상 소비 중.)
  //    ⇒ 철거 전 원문 박제 완료(S1305 보드 등재 · 전부 파랑):
  //        q_1a0043725ae_9exbs BT 점수 낮으면 실제로 성과가 나쁜가?
  //        q_1a0043725af_nr8ik BT 점수 높으면 실제로 수익이 났는가?
  //        q_1a0043725b0_j755z 차트 좋아도 BT 낮으면 수익 내기 어려운 패턴인가?
  const s = analScore || 0;
  const b = btScore || 0;
  const sm = summary || {};
  const safetyCount = (sm.risks || []).length;
  const maArr = ind?.maAlign?.bullish ? 'bull' : ind?.maAlign?.bearish ? 'bear' : 'mixed';
  // [S255] regime 객체 접근 경로 + 분기 비교 라벨 일괄 정정 (아래 L3098~3107)
  //   〔이력〕 누락된 사실 3가지가 누적된 데드 분기:
  //     ① L2882 `ind?._regime?.label` — `_regime` 필드 자체가 존재하지 않음 (한 글자 오타 후보지만 그것만 아님)
  //     ② calcIndicators 반환 객체(sx_analysis_engine.js L3181~3242)에 regime 필드가 직접 노출되지 않음.
  //        base 객체 전체는 `_advanced` 필드로만 전달됨 → ind.regime은 undefined.
  //     ③ 분석엔진(L1944~1948)이 만드는 regime.label은 '추세장'/'추세+변동'/'횡보장'/'전환기' 4종이고
  //        L3096~3097은 '상승추세'/'하락추세'와 비교 → 라벨 자체도 미일치.
  //     세 요인 모두로 실전 가이드 시장 레짐 컨텍스트 텍스트가 누락되어 왔음 (수정됨)
  //   수정: ① _advanced.regime로 폴백 ② regime.label + regime.direction 조합으로 정확 판정
  //     '추세장' 또는 '추세+변동' 라벨 + UP/DOWN 방향일 때만 명확한 추세 메시지 추가.
  //     '횡보장'/'전환기'/FLAT은 별도 메시지 미추가(텍스트 폭증 방지).
  const regime = ind?.regime || ind?._advanced?.regime || null;
  // [S256] rsiVal 정의 정정 — calcIndicators 반환에서 ind.rsi는 단일 number(L3195: rsi: ind.rsi.val)
  //   〔이력〕 이전: ind?.rsi?.value ?? ind?.rsiLegacy ?? null
  //     ① ind.rsi가 number라 .value는 undefined → null폴백 시도
  //     ② calcIndicators 반환 객체에 rsiLegacy 직접 노출 안 됨 (_advanced.rsiLegacy로만 접근 가능)
  //     ③ 두 폴백 모두 실패하여 rsiVal 영구 null → L3092~3094 RSI 과매도/과매수 안내 텍스트 누락 (수정됨)
  //   수정: typeof 가드 + _advanced 폴백으로 두 가지 입력 형태 호환:
  //     ① ind.rsi가 number(calcIndicators 반환): 직접 사용
  //     ② ind.rsi가 객체(calcAllScreener base 직접 전달): .val 사용
  //     ③ _advanced.rsi.val로 최종 폴백
  const rsiVal = (typeof ind?.rsi === 'number') ? ind.rsi
               : (ind?.rsi?.val ?? ind?._advanced?.rsi?.val ?? null);
  // [S258] 데드 변수 3개 삭제 (이전: bbPos/vwapPos/adx)
  //   〔이력〕 practicalGuide 함수 안에서 선언만 있고 사용처 0건. 코드 청소 목적 정리.
  //   필요 시 동일 패턴으로 재선언 가능: const bbPos = ind?.bb?.position ?? ind?.bbLegacy?.position ?? '';
  const obv = ind?.obv?.trend ?? ind?.obvLegacy?.trend ?? '';

  // [v2.0] 4축 점수 헬퍼 — scores4 전달 시 활성, 없으면 v1 폴백 텍스트 사용
  const has4 = scores4 && typeof scores4 === 'object';
  const r4 = has4 ? (scores4.readyScore || 0) : 0;
  const e4 = has4 ? (scores4.entryScore || 0) : 0;
  const t4 = has4 ? (scores4.trendScore || 0) : 0;
  const u4 = has4 ? (scores4.upsideScore || 0) : 0;          // [S508] 추가상승
  const ltBull = has4 ? (scores4.ltAlign === 'bull') : false; // [S509] 장기 정배열(게이트=추세 경로 합격축)
  const aTimingOn = has4 ? scores4.aTimingOn : undefined;      // [S512] A 타이밍 발화 여부
  // 합격/미달 점수 라벨링
  const _ck = (v, th) => v >= th ? '✓' : '✗';
  // [S508] C 판정 로직 정합 — 전략(BT)은 합격 축이 아님(S293에서 제거, 하단 신뢰도 바로 별도 표시).
  //   실제 4번째 축은 모멘텀(momDir==='up'). 화면도 듀얼 경로(반등/추세)에 맞춰 그린다.
  //   · 반등 경로(역추세): 반등준비≥60 · 반등전환≥60 · 추세방향≥50 · 모멘텀↑
  //   · 추세 경로(순추세): 추가상승≥60 · 추세방향≥55 · 장기정배열 · 모멘텀↑  [S509] 단기→장기 정배열 게이트
  //   합격한 경로(passPath)의 축만 보여주면 체크마크 합 = 실제 passCount로 자동 정합.
  //   라벨은 A 카드와 통일(바닥/반등 → 반등준비/반등전환).
  const _momPass = !!(momBadge && momBadge.direction === 'up');
  const _momMark = _momPass ? '상승 ↑✓'
    : (momBadge && momBadge.direction === 'down' ? '하락 ↓✗' : '횡보 ➡✗');
  const _isTrendPath = (passPath === 'trend');
  // 실제 판정 합격수 우선, 미전달 시 경로별 재계산 폴백 ([S509] 추세 경로 3축=장기정배열)
  const _passReal = (typeof passCount === 'number') ? passCount
    : (_isTrendPath
        ? ((u4>=60?1:0) + (t4>=55?1:0) + (ltBull?1:0) + (_momPass?1:0))
        : ((r4>=60?1:0) + (e4>=60?1:0) + (t4>=50?1:0) + (_momPass?1:0)));
  const _axisNames = _isTrendPath
    ? '추가상승·추세방향·장기정배열·모멘텀'
    : '반등준비·반등전환·추세방향·모멘텀';
  const _scoreLine = has4
    ? (_isTrendPath
        ? `추가상승 ${u4}${_ck(u4,60)} · 추세방향 ${t4}${_ck(t4,55)} · 장기정배열 ${ltBull?'✓':'✗'} · 모멘텀 ${_momMark} (합격 ${_passReal}/4)`
        : `반등준비 ${r4}${_ck(r4,60)} · 반등전환 ${e4}${_ck(e4,60)} · 추세방향 ${t4}${_ck(t4,50)} · 모멘텀 ${_momMark} (합격 ${_passReal}/4)`)
    : '';
  // 모멘텀 배지 텍스트 (강등/승급 사유 설명용)
  const _momText = (momBadge && momBadge.direction === 'up')
    ? `모멘텀 상승 (바닥 ${momBadge.deltas?.ready>=0?'+':''}${momBadge.deltas?.ready||0} · 반등 ${momBadge.deltas?.entry>=0?'+':''}${momBadge.deltas?.entry||0} · 추세 ${momBadge.deltas?.trend>=0?'+':''}${momBadge.deltas?.trend||0})`
    : (momBadge && momBadge.direction === 'down')
    ? `모멘텀 하락 (바닥 ${momBadge.deltas?.ready||0} · 반등 ${momBadge.deltas?.entry||0} · 추세 ${momBadge.deltas?.trend||0})`
    : '';

  const guide = { title:'', steps:[], nextAction:'', caution:'', crossCheck:'' };

  // ── 9종 분기 (_svVerdict.action 직접 소비) ──

  if(verdictAction === '매수'){
    // 비보유 + 매수 신호 (최적 진입)
    guide.title = '매수 조건이 충족된 상태입니다';
    if(has4){
      // [v2.0] 4축 텍스트 — 사용자가 보는 점수 그대로 노출
      guide.steps = [
        `${_scoreLine}`,
        `${_axisNames}이 모두 매수에 유리한 상태입니다.`,
      ];
      if(_momText){
        guide.steps.push(`${_momText} — 모멘텀이 살아있는 상태입니다 — 다만 모멘텀이 매수 신호 적중을 높인다는 측정은 없습니다.`);
      } else {
        guide.steps.push(`점수는 합격이지만 모멘텀은 횡보 상태입니다. 급할 필요 없이 분할 매수로 접근하면 안전합니다.`);
      }
    } else {
      guide.steps = [
        `진입타이밍 ${s}점 — 현재 기술적 지표들이 매수에 유리한 방향으로 정렬되어 있습니다. 이 점수는 RSI·MACD·볼린저밴드·이동평균선 등 여러 지표를 종합한 결과입니다.`,
        `매매전략 ${b}점 — 이 종목의 과거 백테스트 성과를 0~100으로 환산한 값입니다(수익률·승률·PF·MDD·기댓값 합산). 판정 축이 아니라 참고 지표이며, 이 점수가 앞으로의 수익을 예측한다는 측정은 없습니다.`,
        `두 점수가 모두 높고 분석 엔진도 매수 신호를 확인했습니다. "지금 기술적으로 좋고 + 과거에도 이런 상황에서 수익이 났고 + 모멘텀도 살아있다"는 종합 판정입니다.`,
      ];
    }
    if(safetyCount > 0){
      guide.steps.push(`다만 안전필터에서 ${safetyCount}건의 주의 사항이 감지되었습니다. 한 번에 전 자금을 투입하지 말고, 2~3회에 나눠서 분할 매수하는 것을 권합니다.`);
    }
    guide.nextAction = '분석 엔진이 제시한 TP(익절가)와 SL(손절가)을 반드시 확인한 후 진입하세요. 감정적 매수를 피하고, 계획한 대로 실행하는 것이 중요합니다.';
    guide.caution = '매수 후 주가가 바로 오르지 않을 수 있습니다. 단기 변동에 흔들리지 말고, 손절선을 지키는 것이 가장 중요합니다. 손절선을 넘어서면 반드시 매도하세요.';
    guide.crossCheck = '진입 전 업종 흐름과 전체 시장 분위기도 한 번 더 확인하세요. 개별 종목이 아무리 좋아도 시장이 급격히 악화되면 함께 하락할 수 있습니다.';

  } else if(verdictAction === '관심'){
    // 비보유 + 일부 합격 (3합격 또는 모멘텀 승급)
    guide.title = '아직 매수 타이밍은 아니지만, 지켜볼 가치가 있습니다';
    if(has4){
      // [S512] A 타이밍 게이트로 강등된 관심(passCount=매수급인데 오늘 A 미발화)은 사유를 다르게 설명.
      const _timingGated = (typeof passCount==='number' && passCount>=4 && aTimingOn===false);
      guide.steps = [`${_scoreLine}`];
      if(_timingGated){
        guide.steps.push(`4축 셋업은 매수 수준(${passCount}/4)인데, 진입타이밍(A ${s}점)이 아직 매수 확신선(진입 기준+여유)에 못 미쳐 관심 단계입니다.`);
        guide.steps.push(`자리는 갖춰졌으니 서두를 필요 없습니다 — 내일 진입타이밍 점수가 확신선을 넘으면 매수로 올라갑니다. 매일 A 점수를 확인하세요.`);
      } else {
        guide.steps.push(`일부 조건이 부족해 매수 신호 확정에는 한 단계 모자란 상태입니다.`);
        if(_momText && momBadge?.direction === 'up'){
          guide.steps.push(`다만 ${_momText} — 점수는 모자라지만 모멘텀이 살아나는 중이라 진입 시점이 곧 올 가능성이 있습니다. 관심 종목 등록을 권합니다.`);
        } else {
          guide.steps.push(`미달 항목의 점수가 합격선까지 올라오면 매수 신호로 격상됩니다. 매일 점수 변화를 추적하세요.`);
        }
      }
    } else {
      guide.steps = [
        `진입타이밍 ${s}점 — 현재 기술적으로는 매수하기 좋은 시점이 아닙니다. 지표들이 아직 매수 방향으로 정렬되지 않았습니다.`,
        `매매전략 ${b}점 — 이 종목의 과거 백테스트 성과 환산값입니다. 과거 성과가 앞으로도 이어진다는 측정은 없으므로, 진입 판단은 조건 충족 여부로 하세요.`,
        `쉽게 말해 "좋은 종목인데 지금은 싼 자리가 아니다"라는 뜻입니다. 관심 종목에 등록해두고, 진입타이밍 점수가 올라올 때 다시 확인하세요.`,
      ];
    }
    guide.nextAction = '☆ 버튼으로 관심 종목에 등록하세요. 매일 장 마감 후 점수 변화를 확인하면서, 진입타이밍이 60점 이상이 되면 그때 매수를 검토하세요.';
    guide.caution = '지금 "어차피 오를 거니까" 하고 미리 사면 안 됩니다. 진입 시점이 나쁘면 좋은 종목이라도 손실을 볼 수 있습니다. 기다림도 전략입니다.';
    guide.crossCheck = '이 종목이 속한 업종의 전체 흐름을 확인하세요. 업종이 상승 전환하면 이 종목도 빠르게 진입 시점이 올 수 있습니다.';

  } else if(verdictAction === '관망'){
    // 비보유 + 2합격 또는 모멘텀 강등/승급
    guide.title = '단기적으로는 좋아 보이지만 주의가 필요합니다';
    if(has4){
      guide.steps = [
        `${_scoreLine}`,
        `충족 조건이 부족해 매수 신호로는 부족합니다.`,
      ];
      if(_momText && momBadge?.direction === 'down'){
        guide.steps.push(`또한 ${_momText} — 점수가 꺾이는 중이라 매수했다가 추가 하락에 물릴 위험이 있습니다.`);
      } else if(_momText && momBadge?.direction === 'up'){
        guide.steps.push(`다만 ${_momText} — 모멘텀은 살아나는 중이니 다음 봉에서 점수 추가 합격 여부를 확인 후 진입하세요.`);
      } else {
        guide.steps.push(`모멘텀도 횡보 상태라 방향성이 명확해질 때까지 관망이 안전합니다.`);
      }
    } else {
      guide.steps = [
        `진입타이밍 ${s}점 — 현재 기술적으로 매수 신호가 나오고 있습니다. 차트상으로는 좋은 자리처럼 보일 수 있습니다.`,
        `매매전략 ${b}점 — 이 종목의 과거 백테스트 성과 환산값입니다. 점수가 낮다고 앞으로 수익을 못 낸다는 측정은 없습니다 — 참고 지표입니다.`,
        `이런 상황은 단기 급등 후 빠르게 하락하는 경우가 많습니다. 매수하더라도 빠르게 수익 실현해야 하며, 오래 보유하면 위험합니다.`,
      ];
    }
    guide.nextAction = '경험이 부족하다면 이 종목은 건너뛰는 것이 안전합니다. 매매하더라도 당일~2일 이내 단기 매매만 고려하세요.';
    guide.caution = '과거 전략 성과가 낮다는 것은 "이런 차트 모양에서 샀다가 손해 본 경우가 많았다"는 뜻입니다. 단일검증 탭에서 파라미터를 조정해보고, 그래도 성과가 낮으면 다른 종목을 찾는 것이 낫습니다.';
    guide.crossCheck = '단일검증 탭에서 이 종목의 백테스트를 직접 확인해보세요. 승률이 50% 미만이거나 MDD(최대 낙폭)가 -20%를 넘으면 위험한 종목입니다.';

  } else if(verdictAction === '회피'){
    // 비보유 + 1↓ 합격 (대다수 부진) 또는 모멘텀 강등
    guide.title = '현재 이 종목은 매수하기 적합하지 않습니다';
    if(has4){
      guide.steps = [
        `${_scoreLine}`,
        `충족 진입 조건이 거의 갖춰지지 않았습니다.`,
      ];
      if(_momText && momBadge?.direction === 'down'){
        guide.steps.push(`게다가 ${_momText} — 점수도 낮고 모멘텀까지 꺾이고 있어 추가 하락 가능성이 높습니다.`);
      } else {
        guide.steps.push(`이런 조건에서의 진입은 이 엔진이 권하지 않습니다. 다른 종목을 검토하세요.`);
      }
    } else {
      //  [S1302] 두 가지를 고쳤다.
      //    ① ★결함: 이 분기는 `b`(매매전략/BT 점수)를 **출력만 하고 검사하지 않았다.**
      //       분기 조건은 `verdictAction==='회피' && !has4`뿐이라 b가 80이어도
      //       "매매전략 80점 — 성과가 좋지 않았습니다"가 그대로 나갔다. 이제 b를 실제로 본다.
      //    ② "높은 확률로 손실을 보게 됩니다" — 교과서로 돌릴 수 없는 **우리 엔진에 대한 주장**이다.
      //       회피 판정(비보유 사다리 통과 조건 ≤1)의 실제 손실률을 잰 적이 없다.
      //       ⇒ Q&A 보드 등재 완료: **q_1a0034b09d3_yckcq** "판정이 '회피'인 종목에 투자하면
      //         실제로 높은 확률로 손실을 보는가?"(S1301 · 파랑 — 답 없음). 답이 나오면 여기를 고친다.
      //       근거 주장을 빼고 **규율 진술**로 바꾼다(S1292 B그룹 문법).
      guide.steps = [
        `진입타이밍 ${s}점 — 기술적으로 매수 조건이 갖춰지지 않았습니다. 하락 추세이거나 방향이 불확실한 상태입니다.`,
        (b > 0
          ? `매매전략 ${b}점 — 이 종목의 과거 백테스트 성과 환산값입니다. 판정 축이 아니라 참고 지표입니다(S293).`
          : `매매전략 점수 없음 — 백테스트 거래 수가 부족해 산출되지 않았습니다.`),
        `이 엔진은 이 조건에서의 진입을 권하지 않습니다. 회피 판정 종목의 실제 손실률은 측정한 적이 없습니다(Q&A 보드 등재).`,
      ];
    }
    guide.nextAction = '이 종목은 넘기고 다른 종목을 찾아보세요. 결과 탭에서 "매수" 또는 "보유 유지" 판정을 받은 종목을 우선 검토하는 것이 효율적입니다.';
    guide.caution = '"많이 빠졌으니까 반등하겠지"라는 생각은 위험합니다. 빠지는 데는 이유가 있고, 더 빠질 수 있습니다. 반등 신호가 확인된 종목만 매수하세요.';
    guide.crossCheck = '이 종목이 정말 관심 있다면, 관심 종목에만 등록해두고 점수가 개선될 때까지 기다리세요. 급할수록 돌아가는 것이 투자의 기본입니다.';

  } else if(verdictAction === '보유 유지'){
    // 보유 중 + 지표 양호 (지속 보유)
    guide.title = '보유를 유지하며 지표 변화를 관찰하세요';
    guide.steps = [
      `진입타이밍 ${s}점, 매매전략 ${b}점 — 보유 중인 종목의 현재 상태가 양호합니다. 매도 신호가 나올 때까지 유지하는 것이 일반적입니다.`,
      `분석 엔진이 "지속 보유" 판정을 내렸습니다. 점수 모멘텀이 악화되지 않는 한 포지션을 변경할 이유가 없습니다.`,
      `익절 목표가(TP)까지 아직 여유가 있다면 서두르지 말고 기다리세요. 조급한 수익 실현보다 계획된 매도가 장기 수익률을 높입니다.`,
    ];
    guide.nextAction = '미리 정한 익절가(TP)와 손절가(SL)를 유지하세요. 중간에 임의로 수정하면 감정적 매매가 되기 쉽습니다. 차트 마커와 배너에서 TP/SL을 재확인하세요.';
    guide.caution = '"조금 올랐으니 팔자" 또는 "조금 빠졌으니 더 살자"는 충동을 조심하세요. 보유 판정이 유지되는 한 원래 계획을 따르는 것이 가장 안전합니다.';
    guide.crossCheck = '매일 장 마감 후 점수 변화와 분석 엔진 판정을 확인하세요. "매도 준비" 또는 "매도 검토"로 바뀌면 그때 대응하면 됩니다.';

  } else if(verdictAction === '청산 준비'){
    // 보유 중 + 분석 약화 (단계적 대비)
    guide.title = '분석 지표가 약해지고 있습니다. 매도를 준비하세요';
    guide.steps = [
      `진입타이밍 ${s}점, 매매전략 ${b}점 — 보유 중이지만 지표 모멘텀이 하락 방향으로 바뀌고 있습니다. 아직 매도 신호는 아니지만 경계가 필요한 단계입니다.`,
      `분석 엔진이 "매도 준비" 판정을 내렸습니다. 당장 모두 팔라는 뜻은 아니고, "대응 계획을 준비하라"는 의미입니다.`,
      `수익이 나있다면 분할 익절을 고려하세요. 일부(예: 30~50%)를 미리 팔아 수익을 확정하고, 나머지는 추세 반전이 명확해질 때까지 유지할 수 있습니다.`,
    ];
    guide.nextAction = '손절가(SL)를 진입가 위로 올리는 "트레일링 스톱" 전략을 고려하세요. 이렇게 하면 손실 위험은 없애고 상승 여지만 남깁니다. 구체적 가격은 차트와 BT 결과를 참고하세요.';
    guide.caution = '"지금은 조금 빠지지만 곧 다시 오를 거야"라는 희망적 관측은 위험합니다. 분석 엔진이 약화 신호를 감지했다는 건 객관적 근거가 있다는 뜻입니다.';
    guide.crossCheck = '매매전략 점수는 참고 지표입니다(S293에서 판정 축에서 제외). 판정 격상은 진입·청산 조건 충족 여부로 결정됩니다.';

  } else if(verdictAction === '청산 검토'){
    // 보유 중 + 분석 악화 (적극 청산 검토)
    guide.title = '분석 지표가 악화되었습니다. 적극적으로 매도를 검토하세요';
    guide.steps = [
      `진입타이밍 ${s}점, 매매전략 ${b}점 — 보유 중인 종목의 지표가 명확히 악화되고 있습니다. 추가 상승 여력이 줄어들고 하락 위험이 커진 상태입니다.`,
      `분석 엔진이 "매도 검토" 판정을 내렸습니다. "매도 준비"보다 한 단계 심각한 상태로, 방어적 행동이 필요합니다.`,
      `수익이 나있다면 즉시 일부 또는 전량 익절을 고려하세요. 손실이 나있다면 손절선 근처라면 규칙대로 정리하는 것이 추가 손실을 막는 길입니다.`,
    ];
    guide.nextAction = '감정을 배제하고 매매 계획을 실행하세요. 익절 목표가에 도달하지 않았더라도, 분석 엔진 판정이 악화되면 선제적 매도가 현명할 수 있습니다.';
    guide.caution = '"조금만 더 기다리면 회복할 것"이라는 생각에 매몰되지 마세요. 이 단계에서 보유를 지속하는 것은 세운 계획을 벗어나는 선택입니다.';
    guide.crossCheck = 'BT 결과에서 "평균 보유기간"과 "최대 손실 구간"을 다시 확인하세요. 보유 기간이 평균을 초과했다면 매도 쪽으로 기울이는 것이 합리적입니다.';

  } else if(verdictAction === '즉시 청산'){
    // 보유 중 + 매도 신호 발생 (즉시 실행)
    guide.title = '매도 신호가 발생했습니다. 즉시 매도하세요';
    guide.steps = [
      `진입타이밍 ${s}점, 매매전략 ${b}점 — 보유 중인 종목에서 명확한 매도 신호가 발생했습니다. BT 엔진이 최근 2봉 이내에 매도 조건을 확인했습니다.`,
      `분석 엔진이 "즉시 매도" 판정을 내렸습니다. 이것은 BT와 분석 엔진이 모두 "지금 나가라"고 말하는 가장 강한 매도 신호입니다.`,
      `망설이지 말고 계획한 대로 매도를 실행하세요. 매도 신호를 무시하고 버티면 세운 계획이 무너집니다.`,
    ];
    guide.nextAction = '즉시 시장가 또는 현재 호가 근처에서 매도하세요. "조금만 더 올라가면 팔자"는 욕심이 가장 흔한 실수입니다. 계획대로 실행하는 것이 장기 승률을 높입니다.';
    guide.caution = '매도 신호가 확정되었을 때 머뭇거리면 단 하루 만에 수 %씩 추가 손실을 볼 수 있습니다. 룰을 지킨 매도는 결코 후회할 선택이 아닙니다.';
    guide.crossCheck = '차트에서 ▼ 매도 마커 위치를 확인하세요. 마커가 찍힌 이유(추세 이탈, 손절선 터치 등)를 이해하면 향후 비슷한 상황에서 더 빠르게 결정할 수 있습니다.';

  } else if(verdictAction === '매도 완료'){
    // 보유 중 + 매도 체결 완료 (결산 단계)
    guide.title = '매도가 완료되었습니다. 결과를 정리하고 다음 기회를 찾으세요';
    guide.steps = [
      `진입타이밍 ${s}점, 매매전략 ${b}점 — 이 종목의 매매 사이클이 한 바퀴 완료되었습니다. 배너에 표시된 익절/손절 결과와 수익률을 확인하세요.`,
      `분석 엔진이 "매도 완료" 판정을 내렸습니다. BT 엔진이 매도를 확정한 상태로, 이 포지션은 더 이상 유효하지 않습니다.`,
      `승패와 무관하게 이번 매매에서 배운 점을 짧게 기록해두면 다음 거래에 도움이 됩니다. 특히 손실인 경우 원인 분석이 중요합니다.`,
    ];
    guide.nextAction = '결과 탭으로 돌아가 다음 종목을 찾으세요. "매수" 또는 "관심" 판정을 받은 종목을 우선 검토하는 것이 효율적입니다.';
    guide.caution = '방금 매도한 종목이 다시 오른다고 해서 무리하게 재진입하지 마세요. 새로운 매수 신호가 객관적으로 확인된 후에만 다시 진입하는 것이 원칙입니다.';
    guide.crossCheck = '이번 매매의 수익률과 보유 기간을 BT 평균과 비교해보세요. 평균 이상이라면 전략이 잘 맞는 종목일 수 있으니 관심 종목에 계속 등록해두세요.';

  } else {
    // verdictAction 없거나 알 수 없음 — 가이드 미표시
    return null;
  }

  // ── 추가 맥락 (지표 상태에 따라) — 9종 공통 적용 ──
  const extras = [];
  if(rsiVal != null){
    if(rsiVal <= 30) extras.push('RSI가 과매도 구간('+rsiVal.toFixed(0)+')입니다. 매도 압력이 과도한 상태로, 반등 가능성이 있지만 하락이 더 이어질 수도 있으니 확인 후 접근하세요.');
    else if(rsiVal >= 70) extras.push('RSI가 과매수 구간('+rsiVal.toFixed(0)+')입니다. 이미 많이 오른 상태이므로, 지금 매수하면 고점에 물릴 위험이 있습니다.');
  }
  if(maArr === 'bull') extras.push('이동평균선이 정배열(상승 정렬) 상태입니다. 단기선이 장기선 위에 있어 상승 추세가 유지되고 있다는 의미입니다.');
  else if(maArr === 'bear') extras.push('이동평균선이 역배열(하락 정렬) 상태입니다. 단기선이 장기선 아래에 있어 하락 추세가 지속되고 있다는 의미입니다.');

  // [S255] OBV 분기 비교 정정 — ind.obv.trend의 실제 값은 'up'/'down'/'flat' (분석엔진 obvObj.trend)
  //   〔이력〕 한국어 라벨 '상승 추세'/'하락 추세'와 비교 → 영구 false. 거래량 추세 안내 텍스트 누락 (수정됨)
  if(obv === 'up') extras.push('OBV(거래량 누적)가 상승 중입니다. 거래량이 가격 상승을 뒷받침하고 있어 추세의 건강성이 양호합니다.');
  else if(obv === 'down') extras.push('OBV(거래량 누적)가 하락 중입니다. 거래량이 빠지고 있어 가격 상승이 지속되기 어려울 수 있습니다.');

  // [S255] 분기 비교 정정 — regime.label('추세장'/'추세+변동') + regime.direction('UP'/'DOWN') 조합으로 판정
  //   '추세장' 또는 '추세+변동' 라벨일 때만 명확한 추세 상태로 간주. '횡보장'/'전환기'/FLAT은 메시지 미추가.
  const _isTrendLabel = regime && (regime.label === '추세장' || regime.label === '추세+변동');
  if(_isTrendLabel && regime.direction === 'UP') extras.push('현재 시장 레짐은 "상승추세"입니다. 전체적으로 매수에 유리한 환경이지만, 개별 종목 상태도 반드시 확인하세요.');
  else if(_isTrendLabel && regime.direction === 'DOWN') extras.push('현재 시장 레짐은 "하락추세"입니다. 시장 전체가 약세이므로, 매수는 평소보다 더 신중하게 접근하세요.');

  guide.extras = extras;
  return guide;
};

// ════════════════════════════════════════════════════════════
//  S71: 레짐 적응형 파라미터 해석 (regimeAdaptGuide)
//  현재 레짐에 따른 파라미터 보정 현황을 초보자에게 설명
//  반환: { title, items[], note } | null
// ════════════════════════════════════════════════════════════

// [S1092] regimeAdaptGuide 철거 — 레짐 임계값 보정 자체가 제거됨

// ════════════════════════════════════════════════════════════
//  S70: 실패 분석 (Failure Analysis)
//  BT 거래 내역 → 손실 원인 진단 + 패턴 분류 + 개선 제안
//  반환: { hasFails, summary, lossPatterns[], worstTrade, streakAnalysis,
//          mddContext, improvements[], riskProfile } | null
// ════════════════════════════════════════════════════════════

SXI.failureAnalysis = function(btData, indicators, qs, tf){
  if(!btData || !btData.trades || !btData.trades.length) return null;

  const trades = btData.trades.filter(t => t.type === 'WIN' || t.type === 'LOSS');
  const losses = trades.filter(t => t.type === 'LOSS');
  const wins = trades.filter(t => t.type === 'WIN');

  if(!trades.length) return null;

  const totalTrades = trades.length;
  const lossCount = losses.length;
  const winCount = wins.length;
  const winRate = totalTrades > 0 ? (winCount / totalTrades * 100) : 0;
  const totalPnl = btData.totalPnl ?? 0;
  const mdd = btData.mdd ?? 0;
  const pf = btData.profitFactor ?? 0;

  // ── 1. 손실 패턴 분류 ──
  const lossPatterns = [];

  // 1a. 보유 기간별 분류
  const shortHold = losses.filter(t => t.bars <= 3);
  const midHold = losses.filter(t => t.bars > 3 && t.bars <= 10);
  const longHold = losses.filter(t => t.bars > 10);

  if(shortHold.length > 0 && shortHold.length >= lossCount * 0.5){
    const avgPnl = (shortHold.reduce((s,t) => s + t.pnl, 0) / shortHold.length).toFixed(2);
    lossPatterns.push({
      type: 'quick_stop',
      title: '빠른 손절 반복',
      count: shortHold.length,
      ratio: Math.round(shortHold.length / lossCount * 100),
      detail: `손실 거래의 ${Math.round(shortHold.length / lossCount * 100)}%가 3봉 이내에 손절되었습니다 (평균 손실 ${avgPnl}%). 진입 직후 바로 하락하는 패턴이 반복되고 있어, 진입 시점이 너무 이르거나 변동성 대비 손절폭이 좁을 가능성이 있습니다.`,
      suggestion: '손절폭(SL배수)을 현재보다 0.5 정도 넓히거나, 다음봉 시가 진입(Next-bar Entry)을 활성화하여 확인 후 진입을 시도해보세요.'
    });
  }

  if(longHold.length > 0 && longHold.length >= lossCount * 0.3){
    const avgPnl = (longHold.reduce((s,t) => s + t.pnl, 0) / longHold.length).toFixed(2);
    lossPatterns.push({
      type: 'slow_bleed',
      title: '느린 하락 손실',
      count: longHold.length,
      ratio: Math.round(longHold.length / lossCount * 100),
      detail: `손실 거래의 ${Math.round(longHold.length / lossCount * 100)}%가 10봉 이상 보유 후 손절되었습니다 (평균 손실 ${avgPnl}%). 횡보 후 하락하는 패턴으로, 목표가 도달 전에 추세가 꺾이는 경우입니다.`,
      suggestion: '목표가(TP배수)를 현재보다 0.5 낮추어 빠른 수익 실현을 시도하거나, 보유 기간 상한(예: 15봉)을 설정하는 것을 검토하세요.'
    });
  }

  // 1b. 손실 규모별 분류
  const bigLosses = losses.filter(t => Math.abs(t.pnl) >= 5);
  const smallLosses = losses.filter(t => Math.abs(t.pnl) < 2);

  if(bigLosses.length > 0){
    const avgBigLoss = (bigLosses.reduce((s,t) => s + t.pnl, 0) / bigLosses.length).toFixed(2);
    lossPatterns.push({
      type: 'big_loss',
      title: '대형 손실 발생',
      count: bigLosses.length,
      ratio: Math.round(bigLosses.length / lossCount * 100),
      detail: `${bigLosses.length}건의 거래에서 -5% 이상의 대형 손실이 발생했습니다 (평균 ${avgBigLoss}%). 이 거래들만으로 전체 수익을 상당 부분 잠식합니다.`,
      suggestion: '변동성(ATR) 대비 손절 배수가 적절한지 점검하세요. 손절폭을 ATR×1.0~1.5 범위로 줄이면 대형 손실을 제한할 수 있습니다.'
    });
  }

  if(smallLosses.length > 0 && smallLosses.length >= lossCount * 0.6){
    lossPatterns.push({
      type: 'death_by_cuts',
      title: '잦은 소규모 손절',
      count: smallLosses.length,
      ratio: Math.round(smallLosses.length / lossCount * 100),
      detail: `손실의 ${Math.round(smallLosses.length / lossCount * 100)}%가 -2% 미만의 소규모 손절입니다. 개별 손실은 작지만, 누적되면서 전체 성과를 악화시킵니다. 과잉 매매(overtrading) 신호일 수 있습니다.`,
      suggestion: 'BUY 임계값을 5~10점 올려서 진입 빈도를 줄이세요. 더 확실한 신호에서만 진입하면 승률이 개선될 수 있습니다.'
    });
  }

  // 1c. 승패 순서 패턴
  let maxConsecLoss = 0, curConsecLoss = 0, streakStart = -1, worstStreakStart = -1;
  const streaks = [];
  trades.forEach((t, i) => {
    if(t.type === 'LOSS'){
      if(curConsecLoss === 0) streakStart = i;
      curConsecLoss++;
      if(curConsecLoss > maxConsecLoss){
        maxConsecLoss = curConsecLoss;
        worstStreakStart = streakStart;
      }
    } else {
      if(curConsecLoss >= 3){
        streaks.push({ start: streakStart, length: curConsecLoss, trades: trades.slice(streakStart, streakStart + curConsecLoss) });
      }
      curConsecLoss = 0;
    }
  });
  if(curConsecLoss >= 3){
    streaks.push({ start: streakStart, length: curConsecLoss, trades: trades.slice(streakStart, streakStart + curConsecLoss) });
  }

  // ── 2. 최악의 거래 상세 ──
  let worstTrade = null;
  if(losses.length){
    // S-BUGFIX: reduce에 초기값 추가 (가드 밖에서 쓰일 경우 대비 + 방어적 코딩)
    const worst = losses.reduce((a, b) => a.pnl < b.pnl ? a : b, losses[0]);
    const entryStr = worst.entry ? worst.entry.toLocaleString() : '—';
    const exitStr = worst.exit ? worst.exit.toLocaleString() : '—';
    worstTrade = {
      pnl: worst.pnl,
      bars: worst.bars,
      entry: worst.entry,
      exit: worst.exit,
      detail: `최대 손실 거래: ${entryStr} → ${exitStr}, ${worst.pnl}% (${worst.bars}봉 보유). ${worst.bars <= 3 ? '진입 직후 급락하여 빠르게 손절된 케이스입니다. 변동성이 큰 구간에서 진입했을 가능성이 높습니다.' : worst.bars > 10 ? '오래 보유했지만 결국 손절된 케이스입니다. 중간에 탈출 기회가 있었을 수 있습니다.' : '보유 중 추세가 반전되어 손절에 도달한 전형적 패턴입니다.'}`
    };
  }

  // ── 3. 연속 손실 분석 ──
  let streakAnalysis = null;
  if(maxConsecLoss >= 3){
    const totalStreakLoss = streaks.length ? streaks.reduce((s, st) => {
      return s + st.trades.reduce((ss, t) => ss + t.pnl, 0);
    }, 0) : 0;
    streakAnalysis = {
      maxStreak: maxConsecLoss,
      streakCount: streaks.length,
      totalStreakLoss: +totalStreakLoss.toFixed(2),
      detail: `최대 ${maxConsecLoss}연속 손실이 발생했습니다${streaks.length > 1 ? ` (3연속 이상 구간 ${streaks.length}회)` : ''}. 연속 손실 누적 ${totalStreakLoss.toFixed(1)}%.`,
      interpretation: maxConsecLoss >= 5
        ? '5연속 이상 손실은 전략과 현재 시장 환경이 맞지 않을 가능성이 높습니다. 타임프레임 변경 또는 파라미터 전면 재조정을 강력히 권합니다.'
        : maxConsecLoss >= 4
        ? '4연속 손실은 일시적 비효율일 수 있지만, 반복되면 전략 적합성을 재검토해야 합니다. 다른 타임프레임에서도 테스트해보세요.'
        : '3연속 손실은 정상 범위 내에서 발생할 수 있지만, 자금 관리(1회 투자 비중 줄이기)로 충격을 완화할 수 있습니다.'
    };
  }

  // ── 4. MDD 맥락 ──
  let mddContext = null;
  if(mdd > 0){
    const absMdd = Math.abs(mdd);
    let severity, advice;
    if(absMdd <= 5){
      severity = '양호';
      advice = '최대 낙폭이 5% 이내로 자금 관리가 양호합니다. 현재 손절 설정을 유지해도 좋습니다.';
    } else if(absMdd <= 10){
      severity = '보통';
      advice = '최대 낙폭 5~10%는 일반적인 수준입니다. 연속 손실 구간에서 포지션 크기를 줄이면 MDD를 추가로 낮출 수 있습니다.';
    } else if(absMdd <= 20){
      severity = '주의';
      advice = '최대 낙폭 10~20%는 상당한 수준입니다. 한 번에 투입하는 비중을 전체 자금의 20% 이내로 제한하고, 손절폭을 재조정하세요.';
    } else {
      severity = '위험';
      advice = '최대 낙폭 20% 이상은 매우 위험합니다. 전략 자체의 적합성을 근본적으로 재검토해야 합니다. 다른 종목 / 타임프레임 / 파라미터 조합을 시도하세요.';
    }
    mddContext = {
      mdd: absMdd,
      severity,
      detail: `최대 자산 감소(MDD)가 ${absMdd.toFixed(1)}%입니다.`,
      advice
    };
  }

  // ── 5. 승/패 비교 분석 ──
  const avgWin = wins.length ? (wins.reduce((s,t) => s + t.pnl, 0) / wins.length) : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s,t) => s + t.pnl, 0) / losses.length) : 0;
  const avgWinBars = wins.length ? Math.round(wins.reduce((s,t) => s + t.bars, 0) / wins.length) : 0;
  const avgLossBars = losses.length ? Math.round(losses.reduce((s,t) => s + t.bars, 0) / losses.length) : 0;

  // ── 6. 종합 개선 제안 ──
  const improvements = [];

  // 승률 기반
  if(winRate < 40){
    improvements.push({
      area: '진입 조건',
      priority: 'high',
      text: `승률이 ${winRate.toFixed(0)}%로 낮습니다. BUY 임계값을 현재보다 5~10점 높여서 더 확실한 신호에서만 진입하세요. 또는 다음봉 시가 진입(Next-bar)으로 잘못된 신호를 1봉 만에 걸러낼 수 있습니다.`
    });
  } else if(winRate < 50){
    improvements.push({
      area: '진입 조건',
      priority: 'mid',
      text: `승률이 ${winRate.toFixed(0)}%로 개선 여지가 있습니다. 현재 타임프레임(${tf})에서 BUY 임계값을 3~5점 조정하거나, 다른 타임프레임으로 전환해보세요.`
    });
  }

  // PF 기반
  if(pf > 0 && pf < 1.0){
    improvements.push({
      area: '손익비',
      priority: 'high',
      text: `손익비(PF)가 ${pf}로 1.0 미만입니다. 평균 이익(${avgWin.toFixed(1)}%)이 평균 손실(${avgLoss.toFixed(1)}%)보다 작아, 이기더라도 전체적으로 손해입니다. 목표가 배수를 높이거나 손절 배수를 줄여서 개선하세요.`
    });
  } else if(pf >= 1.0 && pf < 1.3){
    improvements.push({
      area: '손익비',
      priority: 'mid',
      text: `손익비(PF) ${pf}은 수수료와 슬리피지를 감안하면 실질 수익이 거의 없는 수준입니다. 목표가를 약간 높이거나 손절을 타이트하게 가져가세요.`
    });
  }

  // 보유 기간 비대칭
  if(avgWinBars > 0 && avgLossBars > 0 && avgLossBars > avgWinBars * 1.5){
    improvements.push({
      area: '보유 전략',
      priority: 'mid',
      text: `평균 보유 기간이 이익(${avgWinBars}봉) 대비 손실(${avgLossBars}봉)이 ${(avgLossBars/avgWinBars).toFixed(1)}배 깁니다. 손실 거래에서 너무 오래 버티는 경향이 있습니다. 시간 기반 손절(예: ${Math.max(avgWinBars + 3, 10)}봉 이내 목표 미도달 시 매도)을 검토하세요.`
    });
  }

  // 거래 빈도
  if(totalTrades >= 20 && winRate < 45){
    improvements.push({
      area: '거래 빈도',
      priority: 'mid',
      text: `총 ${totalTrades}회 거래 중 승률 ${winRate.toFixed(0)}%입니다. 거래 빈도를 줄이면 (BUY 임계값↑) 불필요한 진입을 걸러내어 승률을 높일 수 있습니다.`
    });
  }

  // TF 제안
  if(totalPnl < 0){
    const tfSuggest = tf === 'day' ? '주봉(week)' : tf === 'week' ? '일봉(day)' : tf === '60m' ? '일봉(day)' : '다른 타임프레임';
    improvements.push({
      area: '타임프레임',
      priority: 'low',
      text: `현재 ${tf} 타임프레임에서 총수익률이 음수입니다. ${tfSuggest}으로 전환하면 다른 패턴이 포착될 수 있습니다. 같은 종목이라도 TF에 따라 성과가 크게 달라집니다.`
    });
  }

  // ── 7. 리스크 프로파일 ──
  let riskLevel, riskLabel;
  if(mdd > 20 || (pf < 0.8 && totalTrades >= 5)){
    riskLevel = 'danger'; riskLabel = '고위험';
  } else if(mdd > 10 || pf < 1.0 || winRate < 40){
    riskLevel = 'warning'; riskLabel = '주의';
  } else if(mdd > 5 || pf < 1.3){
    riskLevel = 'neutral'; riskLabel = '보통';
  } else {
    riskLevel = 'bullish'; riskLabel = '양호';
  }

  // ── 8. 종합 요약 ──
  let summaryText;
  const hasFails = losses.length > 0;

  if(!hasFails){
    summaryText = `전체 ${totalTrades}회 거래 모두 수익으로 마감했습니다. 전략 성과가 우수하지만, 거래 수가 적으면 과적합(overfitting) 가능성도 있으므로 다른 종목이나 기간에서도 검증해보세요.`;
  } else if(winRate >= 60 && pf >= 1.5){
    summaryText = `${totalTrades}회 중 ${lossCount}건 손실 (승률 ${winRate.toFixed(0)}%). 전반적으로 양호한 성과이며, 손실 거래는 전략의 정상적인 비용입니다. 아래 손실 패턴을 참고하여 미세 조정하면 더 나은 결과를 기대할 수 있습니다.`;
  } else if(winRate >= 45){
    summaryText = `${totalTrades}회 중 ${lossCount}건 손실 (승률 ${winRate.toFixed(0)}%). 승률은 보통 수준이며, ${pf >= 1.0 ? '손익비로 수익을 유지하고 있습니다. 아래 패턴별 개선으로 성과를 높일 여지가 있습니다.' : '손익비도 낮아 전체 수익이 부진합니다. 아래 개선 제안을 적극 검토하세요.'}`;
  } else {
    summaryText = `${totalTrades}회 중 ${lossCount}건 손실 (승률 ${winRate.toFixed(0)}%). 승률이 낮아 전략 조정이 필요합니다. 아래 실패 패턴을 분석하고, 파라미터·타임프레임·진입 조건을 재검토하세요.`;
  }

  return {
    hasFails,
    summary: summaryText,
    stats: {
      totalTrades, winCount, lossCount, winRate: +winRate.toFixed(1),
      avgWin: +avgWin.toFixed(2), avgLoss: +avgLoss.toFixed(2),
      avgWinBars, avgLossBars, pf, totalPnl, mdd
    },
    lossPatterns,
    worstTrade,
    streakAnalysis,
    mddContext,
    improvements,
    riskProfile: { level: riskLevel, label: riskLabel }
  };
};

// ============================================================
//  S72: 전략 라이프사이클 해석 (Strategy Lifecycle Guide) — 5축 ③
// ============================================================
SXI.lifecycleGuide = function(lc){
  if(!lc) return null;

  const { phase, phaseLabel, phaseDetail, quarters, trends, decaySignals, validityEstimate, regimeCorrelation, health } = lc;

  // ── 1. 제목 + 종합 요약 ──
  let title = `전략 상태: ${phaseLabel}`;
  let summaryText = phaseDetail;

  // ── 2. 구간별 추이 해석 ──
  const quarterTexts = [];
  if(quarters && quarters.length >= 2){
    const first = quarters[0];
    const last = quarters[quarters.length - 1];
    quarterTexts.push(`초기 구간(Q1): 승률 ${first.winRate}%, PF ${first.pf}, 누적수익 ${first.cumPnl}%`);
    quarterTexts.push(`최근 구간(Q${quarters.length}): 승률 ${last.winRate}%, PF ${last.pf}, 누적수익 ${last.cumPnl}%`);

    // 추세 해석
    if(trends){
      const wrDir = trends.winRate > 0.5 ? '상승' : trends.winRate < -0.5 ? '하락' : '보합';
      const pfDir = trends.pf > 0.05 ? '개선' : trends.pf < -0.05 ? '악화' : '유지';
      quarterTexts.push(`추세: 승률 ${wrDir} (기울기 ${trends.winRate > 0 ? '+' : ''}${trends.winRate}), 손익비 ${pfDir}`);
    }
  }

  // ── 3. 퇴화 신호 해석 ──
  const decayTexts = [];
  if(decaySignals && decaySignals.length){
    decaySignals.forEach(d => {
      const sevLabel = d.severity === 'high' ? '[심각]' : '[주의]';
      decayTexts.push(`${sevLabel} ${d.text}`);
    });
  }

  // ── 4. 단계별 행동 제안 ──
  const actions = [];
  switch(phase){
    case 'growth':
      actions.push('현재 파라미터를 유지하세요. 전략이 시장에 잘 맞는 구간입니다.');
      actions.push('이 시기에 다른 종목에서도 같은 파라미터로 테스트하면 전략의 범용성을 확인할 수 있습니다.');
      actions.push('과도한 자신감에 의한 포지션 확대는 주의하세요. 성장기는 영원하지 않습니다.');
      break;
    case 'mature':
      actions.push('안정적 성과를 유지 중입니다. 무리한 파라미터 변경보다는 정기 모니터링을 권합니다.');
      actions.push('레짐 변화 시 빠르게 대응할 수 있도록 레짐 적응형 파라미터를 켜두는 것을 추천합니다.');
      actions.push('리밸런싱 주기(월 1회 정도)를 정해 전략 건강도를 점검하세요.');
      break;
    case 'decline':
      actions.push('성과가 완만하게 하락 중입니다. 아래 항목을 순서대로 점검하세요:');
      actions.push('1단계: 타임프레임을 변경하여 같은 종목을 다시 테스트');
      actions.push('2단계: BUY 임계값을 3~5점 조정하여 진입 빈도 변경');
      actions.push('3단계: 레짐 적응형 파라미터가 OFF라면 ON으로 전환');
      break;
    case 'decay':
      actions.push('전략 퇴화가 감지되었습니다. 적극적 조치가 필요합니다:');
      actions.push('1단계: 현재 파라미터로의 추가 진입을 즉시 중단하세요.');
      actions.push('2단계: 다른 타임프레임 또는 다른 종목에서 백테스트를 재실행하세요.');
      actions.push('3단계: BUY/SELL 임계값, TP/SL 배수를 전면 재설정하세요.');
      if(validityEstimate){
        actions.push(`유효기간 추정: ${validityEstimate.text}`);
      }
      break;
    case 'early':
      actions.push('거래 수가 적어 아직 판단하기 이릅니다.');
      actions.push('더 긴 기간의 데이터로 백테스트하거나, 누적 저장을 활용하여 데이터를 쌓아가세요.');
      actions.push('최소 10건 이상의 거래 후 라이프사이클 판정이 의미를 가집니다.');
      break;
    case 'unstable':
      actions.push('구간별 성과 편차가 큽니다. 전략이 특정 환경에서만 작동할 가능성이 있습니다.');
      actions.push('레짐 적응형 파라미터를 활성화하면 시장 환경에 따른 자동 보정이 이루어집니다.');
      actions.push('변동성이 큰 구간을 피하려면 진입 조건을 보수적으로 조정하세요.');
      break;
  }

  // ── 5. 레짐 연동 해석 ──
  let regimeText = null;
  if(regimeCorrelation){
    regimeText = regimeCorrelation.text;
  }

  // ── 6. 건강도 해석 ──
  let healthText = `전략 건강도: ${health.score}점 (${health.grade}등급)`;
  if(health.grade === 'A') healthText += ' — 우수한 상태입니다.';
  else if(health.grade === 'B') healthText += ' — 양호하지만 지속적 모니터링이 필요합니다.';
  else if(health.grade === 'C') healthText += ' — 보통 수준이며, 일부 개선이 필요합니다.';
  else if(health.grade === 'D') healthText += ' — 주의가 필요합니다. 파라미터 재검토를 권합니다.';
  else healthText += ' — 위험 수준입니다. 즉시 전략 재조정이 필요합니다.';

  return {
    title,
    summary: summaryText,
    quarterTexts,
    decayTexts,
    actions,
    regimeText,
    healthText,
    phase,
    healthGrade: health.grade,
    healthScore: health.score
  };
};

// ══════════════════════════════════════════════════════════════
//  S73: 종목간 상관/분산 경고 해석 (5축④)
// ══════════════════════════════════════════════════════════════

/**
 * 상관/분산 경고 해석
 * @param {Object} corrData - SXE.crossCorrelation() 반환값
 * @returns {Object} { title, riskLabel, riskColor, summary, clusterTexts[], warningTexts[], suggestionTexts[], diversityText, sectorText }
 */
SXI.correlationGuide = function(corrData) {
  if (!corrData || corrData.error) {
    return { title: '포트폴리오 상관 분석', riskLabel: '-', riskColor: '#888', summary: '관심목록에 2종목 이상 등록하세요.', clusterTexts: [], warningTexts: [], suggestionTexts: [], diversityText: '', sectorText: '', sectorBreakdown: [] };
  }

  const { concentrationRisk, diversityScore, grade, clusters, warnings, suggestions, sectorDistribution, stats } = corrData;

  // 위험 라벨/색상
  const riskMap = {
    high: { label: '높은 집중 위험', color: '#f44336' },
    medium: { label: '주의 필요', color: '#ff9800' },
    low: { label: '양호', color: '#4caf50' }
  };
  const risk = riskMap[concentrationRisk] || riskMap.low;

  // 요약
  let summary = `${stats.count}종목 분석 | 평균 상관 ${(stats.avgCorr * 100).toFixed(1)}% | 분산 점수 ${diversityScore}점(${grade})`;
  if (concentrationRisk === 'high') {
    summary += ' — 포트폴리오가 특정 방향에 과도하게 집중되어 있습니다.';
  } else if (concentrationRisk === 'medium') {
    summary += ' — 일부 종목 간 상관이 높아 분산 효과가 제한적입니다.';
  } else {
    summary += ' — 전반적으로 적절한 분산 상태입니다.';
  }

  // 클러스터 해석
  const clusterTexts = clusters.map(cl => {
    const names = cl.stocks.map(s => s.name).join(', ');
    const avgR = (cl.avgCorr * 100).toFixed(1);
    if (cl.avgCorr >= 0.85) return `[주의] ${names} — 극단적 동조(${avgR}%). 같은 뉴스에 같은 방향으로 급등/급락할 위험이 큽니다.`;
    if (cl.avgCorr >= 0.7) return `🔗 ${names} — 고상관(${avgR}%). 유사한 패턴으로 움직이므로 동시 보유 시 위험이 집중됩니다.`;
    return `[참고] ${names} — 상관(${avgR}%).`;
  });

  // 경고 해석
  const warningTexts = warnings.map(w => {
    const icon = w.severity === 'high' ? '[X]' : '[!]';
    return `${icon} ${w.text}`;
  });

  // 제안
  const suggestionTexts = suggestions.map(s => `[팁] ${s}`);

  // 분산 점수 해석
  let diversityText = '';
  if (grade === 'A') diversityText = '분산 투자가 잘 되어 있습니다. 개별 종목 리스크가 효과적으로 분산됩니다.';
  else if (grade === 'B') diversityText = '양호한 분산 상태이나, 고상관 종목 쌍에 유의하세요.';
  else if (grade === 'C') diversityText = '분산 효과가 보통 수준입니다. 다른 섹터나 역상관 종목 추가를 검토하세요.';
  else if (grade === 'D') diversityText = '분산이 부족합니다. 포트폴리오 리밸런싱을 강력히 권합니다.';
  else diversityText = '매우 위험한 집중 상태입니다. 즉시 포트폴리오 재구성이 필요합니다.';

  // 섹터 분포 해석
  let sectorText = '';
  if (sectorDistribution && sectorDistribution.length > 0) {
    const top = sectorDistribution[0];
    // [S358] 미분류(섹터 미확보)는 "집중" 메시지를 내지 않음 — 잘못된 경고 방지
    if (top.name === '미분류') {
      sectorText = '';
    } else if (top.ratio >= 60) sectorText = `${top.name} 섹터에 ${top.ratio}% 집중 — 해당 섹터 하락 시 포트폴리오 전체가 큰 타격을 받을 수 있습니다.`;
    else if (top.ratio >= 40) sectorText = `${top.name} 섹터 비중 ${top.ratio}%로 다소 편중되어 있습니다.`;
    else sectorText = `섹터 분포가 비교적 고르게 분산되어 있습니다.`;
  }

  // [S359] 섹터 분포 상세 — 종목→업종 매칭 검증용 (미분류 포함, 종목 많은 섹터 우선)
  const sectorBreakdown = (sectorDistribution || []).map(d => {
    const nm = d.name || '미분류';
    const list = (d.stocks || []).join(', ');
    return list ? `${nm} (${d.count}): ${list}` : `${nm} (${d.count})`;
  });

  return {
    title: '포트폴리오 상관/분산 진단',
    riskLabel: risk.label,
    riskColor: risk.color,
    summary,
    clusterTexts,
    warningTexts,
    suggestionTexts,
    diversityText,
    diversityGrade: grade,
    diversityScore,
    sectorText,
    sectorBreakdown
  };
};

/**
 * 섹터 레이더 해석
 * @param {Object} radarData - SXE.sectorRadar() 반환값
 * @returns {Object} { title, momentumLabel, momentumColor, summary, bullTexts[], bearTexts[], watchlistTexts[], capitalFlowText }
 */
SXI.sectorRadarGuide = function(radarData) {
  if (!radarData || radarData.error) {
    return { title: '섹터 레이더', momentumLabel: '-', momentumColor: '#888', summary: '섹터 데이터를 불러올 수 없습니다.', bullTexts: [], bearTexts: [], watchlistTexts: [], capitalFlowText: '' };
  }

  const { top5Bull, top5Bear, momentum, capitalFlow, watchlistMatch, summary: summ } = radarData;

  // 모멘텀 라벨/색상
  const momMap = {
    strong_bull: { label: '강한 상승', color: '#f44336' },
    bull: { label: '상승 우위', color: '#ff5722' },
    neutral: { label: '혼조', color: '#9333ea' },
    bear: { label: '하락 우위', color: '#2196f3' },
    strong_bear: { label: '강한 하락', color: '#1565c0' }
  };
  const mom = momMap[momentum] || momMap.neutral;

  // 요약
  const typeLabel = radarData.type === 'theme' ? '테마' : '업종';
  let summaryText = `${typeLabel} ${summ.totalSectors}개 중 상승 ${summ.bullCount}개(${summ.bullRatio}%) · 하락 ${summ.bearCount}개 | 평균 ${summ.avgChange > 0 ? '+' : ''}${summ.avgChange}%`;

  // 강세 해석
  const bullTexts = top5Bull.map((g, i) => {
    const sign = g.changeRate > 0 ? '+' : '';
    return `${i + 1}. ${g.name} ${sign}${g.changeRate.toFixed(2)}% (${g.incrCnt}/${g.totalCnt} 상승, 강도 ${g.strength}%)`;
  });

  // 약세 해석
  const bearTexts = top5Bear.map((g, i) => {
    return `${i + 1}. ${g.name} ${g.changeRate.toFixed(2)}% (${g.descCnt}/${g.totalCnt} 하락, 약도 ${g.weakness}%)`;
  });

  // 관심종목 매칭 해석
  const watchlistTexts = watchlistMatch.map(w => {
    const sign = w.sectorChange > 0 ? '+' : '';
    const status = w.isBull ? '[양호] 강세권' : '[위험] 약세권';
    return `${w.name} → ${w.sector} ${status} (${sign}${w.sectorChange.toFixed(2)}%, ${w.sectorRank}/${w.totalSectors}위)`;
  });

  // 자금 쏠림 해석
  let capitalFlowText = '';
  if (capitalFlow === 'concentrated') capitalFlowText = '[집중] 자금이 소수 섹터에 집중되고 있습니다. 쏠림 장세에 유의하세요.';
  else if (capitalFlow === 'moderate') capitalFlowText = '[참고] 특정 섹터로 자금 유입이 감지됩니다.';
  else capitalFlowText = '📋 자금이 섹터 전반에 고르게 분포되어 있습니다.';

  return {
    title: `${typeLabel} 레이더`,
    momentumLabel: mom.label,
    momentumColor: mom.color,
    summary: summaryText,
    bullTexts,
    bearTexts,
    watchlistTexts,
    capitalFlowText,
    momentum,
    type: radarData.type
  };
};


// [S985] SXI.threeStageReport 클러스터 삭제(threeStageReport/_estimateTransition/_estimateStaleness/_buildVerdict + S81 배너/JSDoc)
//         Phase3-A-3 verdictAction 직수신 전환으로 _threeStageReport 미할당 = 死코드(호출처 0, _stock._threeStageReport 항상 null 폴백).

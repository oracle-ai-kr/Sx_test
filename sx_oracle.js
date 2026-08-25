/**
 * sx_oracle.js — SIGNAL X 종목풀(ORACLE) 데이터 로더
 *
 * 역할:
 *   - oracle_*.json 8개 파일을 fetch로 가져와서 메모리 캐시
 *   - 인덱스/스크리너에서 동일 인터페이스로 사용
 *
 * 데이터 출처:
 *   - oracle_kospi.json / oracle_kosdaq.json (KRX 시세)
 *   - oracle_etf.json (ETF 마스터)
 *   - oracle_coin.json (Upbit + CoinGecko 시총)
 *   - oracle_us_sp500/ndx/dow/etf.json (해외)
 *   - oracle_kospi200 / kosdaq150 / coin_major.json ([S1441] 대상 칩 지수풀 · 기준일 2026-08-25)
 *
 * 사용법:
 *   await OracleData.loadAll();                  // 앱 진입 시 1회
 *   const kospi = OracleData.get('kospi');       // 동기 접근
 *   const all = OracleData.getAll();             // 전체 합본
 *
 * 시리얼: [S226] ORACLE 마이그레이션 (Phase 3)
 */

(function(global){
  'use strict';

  // [S1441] 지수 구성종목 3종 추가 — 대상 칩(코스피200·코스닥150·코인 대표종목)의 코드 목록.
  //   ⚠ getAll()이 전 키를 합치므로 중복이 생길 수 있으나 소비처 0곳(sx_oracle.js 밖 참조 없음).
  const KEYS = ['kospi','kosdaq','etf','coin','us_sp500','us_ndx','us_dow','us_etf',
                'kospi200','kosdaq150','coin_major'];

  // 메모리 캐시
  const _cache = {};
  let _loadedAt = 0;
  let _loadPromise = null;

  /**
   * 단일 JSON 파일 fetch
   * @param {string} key - 'kospi', 'kosdaq', 'etf', 'coin', 'us_sp500' 등
   * @returns {Promise<Array>}
   */
  async function fetchOne(key){
    try{
      const url = `oracle_${key}.json?_t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-cache' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if(!Array.isArray(data)) throw new Error('not array');
      return data;
    } catch(e){
      console.warn(`[ORACLE] ${key} fetch 실패:`, e.message);
      return [];
    }
  }

  /**
   * 8개 ORACLE 파일 병렬 로드
   * @returns {Promise<Object>} {kospi, kosdaq, ...}
   */
  async function loadAll(){
    // 동시 호출 시 단일 Promise 공유
    if(_loadPromise) return _loadPromise;

    _loadPromise = (async () => {
      const results = await Promise.all(KEYS.map(k => fetchOne(k)));
      KEYS.forEach((k, i) => { _cache[k] = results[i] || []; });
      _loadedAt = Date.now();
      const total = KEYS.reduce((sum, k) => sum + _cache[k].length, 0);
      console.log(`[ORACLE] 로드 완료: ${total}개 (${KEYS.map(k => `${k}=${_cache[k].length}`).join(', ')})`);
      return _cache;
    })();

    return _loadPromise;
  }

  /**
   * 동기 접근 — loadAll() 완료 후 사용
   * @param {string} key
   * @returns {Array}
   */
  function get(key){
    return _cache[key] || [];
  }

  /**
   * 전체 합본 (KOSPI + KOSDAQ + ETF 등 한국 시장 통합 등에 사용)
   * @returns {Array}
   */
  function getAll(){
    const out = [];
    KEYS.forEach(k => { if(_cache[k]) out.push(..._cache[k]); });
    return out;
  }

  /**
   * 특정 키 그룹 합본
   * @param {Array<string>} keys - 합칠 키 배열
   * @returns {Array}
   */
  function getMerged(keys){
    const out = [];
    keys.forEach(k => { if(_cache[k]) out.push(..._cache[k]); });
    return out;
  }

  /**
   * 로드 상태 확인
   * @returns {Object} {loaded: boolean, loadedAt: number, counts: {...}}
   */
  function getStatus(){
    const counts = {};
    KEYS.forEach(k => { counts[k] = (_cache[k] || []).length; });
    return {
      loaded: _loadedAt > 0,
      loadedAt: _loadedAt,
      counts,
      total: Object.values(counts).reduce((a,b) => a+b, 0)
    };
  }

  /**
   * 캐시 초기화 (테스트/재로드용)
   */
  function clear(){
    KEYS.forEach(k => { _cache[k] = []; });
    _loadedAt = 0;
    _loadPromise = null;
  }

  /**
   * 레거시 localStorage ORACLE_* 키 정리
   *   Phase 3 후 더는 사용하지 않으므로 1회 정리
   */
  function cleanupLegacyStorage(){
    const legacyKeys = [
      'ORACLE_KOSPI', 'ORACLE_KOSDAQ', 'ORACLE_ETF', 'ORACLE_COIN',
      'ORACLE_US_SP500', 'ORACLE_US_NDX', 'ORACLE_US_DOW', 'ORACLE_US_ETF',
      'ORACLE_ETF_TS', 'ORACLE_COIN_TS', 'ORACLE_US_TS'
    ];
    let removed = 0;
    legacyKeys.forEach(k => {
      try{
        if(localStorage.getItem(k) !== null){
          localStorage.removeItem(k);
          removed++;
        }
      }catch(_){}
    });
    if(removed > 0) console.log(`[ORACLE] 레거시 localStorage ${removed}개 정리`);
    return removed;
  }

  // export
  global.OracleData = {
    KEYS,
    loadAll,
    get,
    getAll,
    getMerged,
    getStatus,
    clear,
    cleanupLegacyStorage,
    // 호환성 — 스크리너 코드에서 자주 쓰는 형태
    fetchOne
  };

})(typeof self !== 'undefined' ? self : this);

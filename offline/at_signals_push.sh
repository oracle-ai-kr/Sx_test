#!/bin/bash
# [S930] SX 자동매매 ① 신호 push — 실엔진(오프라인 하네스 계보) headless 실행 → 신호원장 → Worker KV
#  용도: GitHub Actions cron / 로컬 수동. 레포 원본 4파일 + 하네스 2파일 cat → combined_sig.js (미러 없음 = 원칙 #1).
#  env: WORKER_BASE(필수) · AT_KEY(필수·shared secret) · SRC(레포루트,기본 .) · OFF_DIR(하네스,기본 offline)
#  [S940] 스냅 자동갱신: snap_builder_s940.js가 신호 생성 전 최신 일봉 fetch→리빌드(런타임·커밋 안 함). [S1192] kr=네이버·coin=업비트.
#         커밋 snap_{mkt}.json은 이제 "풀 매니페스트"(종목 코드목록)로만 사용 · 빌더 실패/미지원 시 커밋 스냅 폴백.
set -euo pipefail
SRC="${SRC:-.}"
OFF="${OFF_DIR:-offline}"
: "${WORKER_BASE:?WORKER_BASE 필요}"
: "${AT_KEY:?AT_KEY 필요}"
BUILD="/tmp/combined_sig.js"

echo "[1/3] combined_sig.js 빌드 (실엔진 cat·미러 없음)"
cat "$OFF/sx_offline_shim.js" \
    "$SRC/sx_analysis_engine.js" \
    "$SRC/sx_feature_library.js" \
    "$SRC/sx_cell_data.js" \
    "$SRC/sx_project_c.js" \
    "$SRC/sx_recipe_core.js" \
    "$SRC/sx_exec_core.js" \
    "$SRC/sx_verdict_val.js" \
    "$OFF/sig_runner_s927.js" > "$BUILD"   # [S1180] +feature_library·cell_data — 레시피 v2(어휘규칙) 판정용 · [S1663] +exec_core — 코인 신호에 레짐 v3(rg5 · 🚪 출구 분할 축) 각인(미로드면 rg5=null · 안전)
node --check "$BUILD"

echo "[2/3] 시장별 신호 생성 + PUT"
MARKETS="${MARKETS:-kr,us,coin,coin4h}"   # [S1497] 실행 시장 필터(쉼표) — yml이 cron별로 주입: 06:30 UTC=kr,us · 00:05 UTC=coin,coin4h(확정봉) · [S1663] 04·08·12·16·20:05 UTC=coin4h(4시간봉 경계 직후)
echo "  MARKETS=$MARKETS"
FAIL=0
# [S1672] 중복 실행 회피 — 워커가 이미 이 봉의 원장을 갖고 있으면(=dispatch가 먼저 도착) 그 시장은 빌드·PUT을 건너뛴다(수십 초). 스케줄 폴백(:25)이 겹쳐도 Actions 분을 안 태운다. FORCE=1이면 무시.
#   기대 asof = 마지막 마감 봉의 KST 시작 시각(coin 일봉 = 어제 09:00 · coin4h = 직전 4시간 봉) — 러너 asof(candle_date_time_kst)와 같은 형식.
FORCE="${FORCE:-0}"
expected_asof() {   # $1=봉 길이(초) · SX_NOW_EPOCH(시험용) 없으면 지금
  local now="${SX_NOW_EPOCH:-$(date -u +%s)}" bar="$1" cur last
  cur=$(( now / bar * bar )); last=$(( cur - bar ))
  date -u -d "@$(( last + 32400 ))" +%Y-%m-%dT%H:%M:%S
}
worker_asof() {   # $1=mkt → 워커 원장 asof(없으면 빈 문자열)
  curl -sS --max-time 15 -H "x-at-key: $AT_KEY" "$WORKER_BASE/sx/autotrade/signals/asof?mkt=$1" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);process.stdout.write(String(o.asof||""));}catch(e){}})' 2>/dev/null || true
}
for pair in "kr:snap_kr.json" "us:snap_us.json" "coin:snap_coin.json" "coin4h:snap_coin.json"; do   # [S1663] coin4h — 풀 매니페스트는 코인 일봉과 같은 파일(코드 목록만 쓴다) · 빌더가 240분봉으로 리빌드 · 폴백(커밋 스냅=일봉)이면 그 실행은 건너뛴다
  mkt="${pair%%:*}"; snap="${pair##*:}"
  case ",$MARKETS," in *",$mkt,"*) ;; *) echo "  - $mkt skip (MARKETS)"; continue;; esac
  if [ ! -f "$SRC/$snap" ]; then echo "  - $mkt skip (no $snap)"; continue; fi
  if [ "$FORCE" != "1" ] && { [ "$mkt" = "coin" ] || [ "$mkt" = "coin4h" ]; }; then   # [S1672] 코인 두 트랙만(KR/US는 스케줄 그대로)
    if [ "$mkt" = "coin4h" ]; then want=$(expected_asof 14400); else want=$(expected_asof 86400); fi
    have=$(worker_asof "$mkt")
    if [ -n "$have" ] && [ "$have" = "$want" ]; then echo "  - $mkt skip (워커 asof $have = 기대 $want · 이미 도착 · S1672)"; continue; fi
    echo "  - $mkt 진행 (워커 asof ${have:-없음} · 기대 $want)"
  fi
  out="/tmp/sig_$mkt.json"
  # [S940] 스냅 자동갱신 — 최신 캔들로 리빌드(런타임·커밋 안 함). 미지원(us)/실패 시 커밋 스냅 폴백. [S1192] coin=업비트 지원.
  # [S1633] us는 S1228부터 지원(야후) — 위 '미지원(us)'는 옛 문구. Actions에서 야후 직접이 막히면 빌더가 워커 /proxy 경유(WORKER_BASE env 상속 · nocache).
  usesnap="$SRC/$snap"
  fresh="/tmp/fresh_snap_$mkt.json"
  if node "$OFF/snap_builder_s940.js" "$mkt" --pool "$SRC/$snap" --out "$fresh"; then
    usesnap="$fresh"; echo "  - $mkt 스냅 갱신 ✓ (런타임 최신)"
  else
    if [ "$mkt" = "coin4h" ]; then echo "  - coin4h 스냅 갱신 실패 → 이번 실행 skip(일봉 커밋 스냅을 4시간 원장에 넣지 않는다)"; FAIL=1; continue; fi   # [S1663]
    echo "  - $mkt 스냅 갱신 skip → 커밋 스냅 사용"
  fi
  # [S1193] 청산용 캔들 팩 push (KR·신선 스냅 성공 시) — 워커 청산判定이 CF→네이버 직접 fetch에 의존하지 않게.
  #   최근 60봉(완성봉) 추출 → PUT /sx/autotrade/candles. 실패해도 신호 파이프라인은 계속(경고만).
  if [ "$mkt" = "kr" ] && [ "$usesnap" = "$fresh" ]; then
    node -e '
const fs=require("fs");const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const out={schema:"sx_candle_pack_v1",asof:s.baseDate,stocks:{}};
for(const c in s.stocks){const r=s.stocks[c].rows||[];const t=r.slice(-60).map(p=>({time:Date.parse(String(p[0]).slice(0,4)+"-"+String(p[0]).slice(4,6)+"-"+String(p[0]).slice(6,8)+"T00:00:00+09:00"),open:+p[1],high:+p[2],low:+p[3],close:+p[4],volume:+p[5]}));if(t.length>=25)out.stocks[c]=t;}
fs.writeFileSync("/tmp/candle_pack_kr.json",JSON.stringify(out));console.error("  - kr 캔들팩 "+Object.keys(out.stocks).length+"종 추출");' "$fresh" || echo "  - kr 캔들팩 추출 실패(skip)"
    if [ -f /tmp/candle_pack_kr.json ]; then
      pcode=$(curl -sS -o /tmp/pack_resp.json -w "%{http_code}" -X PUT \
        "$WORKER_BASE/sx/autotrade/candles?mkt=kr" \
        -H "Content-Type: application/json" -H "x-at-key: $AT_KEY" \
        --data-binary "@/tmp/candle_pack_kr.json")
      if [ "$pcode" = "200" ]; then echo "  - kr 캔들팩 PUT ✓"; else echo "  - kr 캔들팩 PUT ✗ HTTP $pcode"; cat /tmp/pack_resp.json || true; fi
    fi
  fi
  # [S1634] US 캔들팩 push — US 가상 원장이 신호와 같은 스냅의 봉으로 판정(워커가 야후를 따로 부르지 않음). 최근 120봉 · 신호 PUT보다 먼저(신호 수신이 판정을 부른다).
  if [ "$mkt" = "us" ] && [ "$usesnap" = "$fresh" ]; then
    node -e '
const fs=require("fs");const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const out={schema:"sx_candle_pack_v1",asof:s.baseDate,stocks:{}};
for(const c in s.stocks){const r=s.stocks[c].rows||[];const t=r.slice(-120).map(p=>({time:Date.parse(String(p[0])),open:+p[1],high:+p[2],low:+p[3],close:+p[4],volume:+p[5]})).filter(x=>isFinite(x.time));if(t.length>=25)out.stocks[c]=t;}
fs.writeFileSync("/tmp/candle_pack_us.json",JSON.stringify(out));console.error("  - us 캔들팩 "+Object.keys(out.stocks).length+"종 추출");' "$fresh" || echo "  - us 캔들팩 추출 실패(skip)"
    if [ -f /tmp/candle_pack_us.json ]; then
      pcode=$(curl -sS -o /tmp/pack_resp_us.json -w "%{http_code}" -X PUT \
        "$WORKER_BASE/sx/autotrade/candles?mkt=us" \
        -H "Content-Type: application/json" -H "x-at-key: $AT_KEY" \
        --data-binary "@/tmp/candle_pack_us.json")
      if [ "$pcode" = "200" ]; then echo "  - us 캔들팩 PUT ✓"; else echo "  - us 캔들팩 PUT ✗ HTTP $pcode"; cat /tmp/pack_resp_us.json || true; fi
    fi
  fi
  SNAP="$usesnap" OUT="$out" node "$BUILD" "$mkt"
  code=$(curl -sS -o /tmp/put_resp.json -w "%{http_code}" -X PUT \
    "$WORKER_BASE/sx/autotrade/signals?mkt=$mkt" \
    -H "Content-Type: application/json" -H "x-at-key: $AT_KEY" \
    --data-binary "@$out")
  if [ "$code" = "200" ]; then
    echo "  - $mkt PUT ✓ $(python3 -c "import json;d=json.load(open('/tmp/put_resp.json'));print('asof',d['asof'],'count',d['count'])" 2>/dev/null || true)"
    # [S1634] US 원장 판정 결과 한 줄(신호 PUT 응답의 usLedger)
    if [ "$mkt" = "us" ]; then node -e 'const d=(JSON.parse(require("fs").readFileSync("/tmp/put_resp.json","utf8")).usLedger)||{};console.log("  - us 원장 "+(d.error?("⚠ "+d.error):(d.skipped?d.skipped:(d.first?("첫 가동 · 기준 봉 "+d.lastBar+" · 대기 후보 "+d.pending+"종"):("봉 "+(((d.bars||[]).join(","))||"새 봉 없음")+" · 매수 "+d.buys+" · 청산 "+d.sells+" · NAV $"+Math.round(d.nav||0)+" · 보유 "+d.n)))));' 2>/dev/null || true; fi
  else
    echo "  - $mkt PUT ✗ HTTP $code"; cat /tmp/put_resp.json || true; FAIL=1
  fi
done

echo "[3/3] 완료 (fail=$FAIL)"
exit $FAIL

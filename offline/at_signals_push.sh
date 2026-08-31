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
    "$SRC/sx_verdict_val.js" \
    "$OFF/sig_runner_s927.js" > "$BUILD"   # [S1180] +feature_library·cell_data — 레시피 v2(어휘규칙) 판정용
node --check "$BUILD"

echo "[2/3] 시장별 신호 생성 + PUT"
MARKETS="${MARKETS:-kr,us,coin}"   # [S1497] 실행 시장 필터(쉼표) — yml이 cron별로 주입: 06:30 UTC=kr,us · 00:05 UTC=coin(확정봉)
echo "  MARKETS=$MARKETS"
FAIL=0
for pair in "kr:snap_kr.json" "us:snap_us.json" "coin:snap_coin.json"; do
  mkt="${pair%%:*}"; snap="${pair##*:}"
  case ",$MARKETS," in *",$mkt,"*) ;; *) echo "  - $mkt skip (MARKETS)"; continue;; esac
  if [ ! -f "$SRC/$snap" ]; then echo "  - $mkt skip (no $snap)"; continue; fi
  out="/tmp/sig_$mkt.json"
  # [S940] 스냅 자동갱신 — 최신 캔들로 리빌드(런타임·커밋 안 함). 미지원(us)/실패 시 커밋 스냅 폴백. [S1192] coin=업비트 지원.
  usesnap="$SRC/$snap"
  fresh="/tmp/fresh_snap_$mkt.json"
  if node "$OFF/snap_builder_s940.js" "$mkt" --pool "$SRC/$snap" --out "$fresh"; then
    usesnap="$fresh"; echo "  - $mkt 스냅 갱신 ✓ (런타임 최신)"
  else
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
  SNAP="$usesnap" OUT="$out" node "$BUILD" "$mkt"
  code=$(curl -sS -o /tmp/put_resp.json -w "%{http_code}" -X PUT \
    "$WORKER_BASE/sx/autotrade/signals?mkt=$mkt" \
    -H "Content-Type: application/json" -H "x-at-key: $AT_KEY" \
    --data-binary "@$out")
  if [ "$code" = "200" ]; then
    echo "  - $mkt PUT ✓ $(python3 -c "import json;d=json.load(open('/tmp/put_resp.json'));print('asof',d['asof'],'count',d['count'])" 2>/dev/null || true)"
  else
    echo "  - $mkt PUT ✗ HTTP $code"; cat /tmp/put_resp.json || true; FAIL=1
  fi
done

echo "[3/3] 완료 (fail=$FAIL)"
exit $FAIL

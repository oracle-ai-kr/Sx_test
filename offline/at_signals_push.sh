#!/bin/bash
# [S930] SX 자동매매 ① 신호 push — 실엔진(오프라인 하네스 계보) headless 실행 → 신호원장 → Worker KV
#  용도: GitHub Actions cron / 로컬 수동. 레포 원본 4파일 + 하네스 2파일 cat → combined_sig.js (미러 없음 = 원칙 #1).
#  env: WORKER_BASE(필수) · AT_KEY(필수·shared secret) · SRC(레포루트,기본 .) · OFF_DIR(하네스,기본 offline)
#  스냅 최신성은 레포 커밋에 의존(snap_{mkt}.json). 스냅 자동갱신은 후속 과제.
set -euo pipefail
SRC="${SRC:-.}"
OFF="${OFF_DIR:-offline}"
: "${WORKER_BASE:?WORKER_BASE 필요}"
: "${AT_KEY:?AT_KEY 필요}"
BUILD="/tmp/combined_sig.js"

echo "[1/3] combined_sig.js 빌드 (실엔진 cat·미러 없음)"
cat "$OFF/sx_offline_shim.js" \
    "$SRC/sx_analysis_engine.js" \
    "$SRC/sx_project_c.js" \
    "$SRC/sx_recipe_core.js" \
    "$SRC/sx_verdict_val.js" \
    "$OFF/sig_runner_s927.js" > "$BUILD"
node --check "$BUILD"

echo "[2/3] 시장별 신호 생성 + PUT"
FAIL=0
for pair in "kr:snap_kr.json" "us:snap_us.json" "coin:snap_coin.json"; do
  mkt="${pair%%:*}"; snap="${pair##*:}"
  if [ ! -f "$SRC/$snap" ]; then echo "  - $mkt skip (no $snap)"; continue; fi
  out="/tmp/sig_$mkt.json"
  SNAP="$SRC/$snap" OUT="$out" node "$BUILD" "$mkt"
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

#!/usr/bin/env bash
# Local/CI smoke test for the single-image deployment.
#
#   ./deploy/smoke-test.sh http://127.0.0.1:10000
#
# The basic checks (UI, liveness, health) need no API keys. Set
# SMOKE_PROVIDER_TESTS=1 to also exercise POST /feed and POST /ask; that
# requires a working database and the configured Groq/Gemini keys.
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:10000}"
BASE_URL="${BASE_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

request() {
  local method="$1"
  local path="$2"
  local output="$3"
  shift 3
  curl -sS --max-time 60 -X "${method}" -o "${output}" -w '%{http_code}' "$@" "${BASE_URL}${path}"
}

echo "Smoke testing ${BASE_URL}"

status="$(curl -sS --max-time 30 -o "${TMP_DIR}/index.html" -w '%{http_code}' "${BASE_URL}/")"
[[ "${status}" == "200" ]] || fail "GET / returned HTTP ${status}"
grep -q '<div id="root"></div>' "${TMP_DIR}/index.html" || fail "GET / did not return the React shell"

status="$(request GET /live "${TMP_DIR}/live.json")"
[[ "${status}" == "200" ]] || fail "GET /live returned HTTP ${status}"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["status"]=="ok"' "${TMP_DIR}/live.json" \
  || fail "GET /live returned an unexpected payload"

status="$(request GET /health "${TMP_DIR}/health.json")"
[[ "${status}" == "200" ]] || fail "GET /health returned HTTP ${status}: $(cat "${TMP_DIR}/health.json")"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["checks"]["api"]["status"]=="ok"; assert d["checks"]["database"]["status"]=="ok"' "${TMP_DIR}/health.json" \
  || fail "GET /health reported a broken dependency"

if [[ "${SMOKE_PROVIDER_TESTS:-0}" == "1" ]]; then
  status="$(request POST /feed "${TMP_DIR}/feed.json" \
    -H 'Content-Type: application/json' \
    --data '{"title":"Smoke test","text":"The heat equation is u_t = alpha^2 u_xx. This note is long enough to pass validation."}')"
  [[ "${status}" == "200" ]] || fail "POST /feed returned HTTP ${status}: $(cat "${TMP_DIR}/feed.json")"
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert isinstance(d["documentId"], str); assert isinstance(d["chunks"], int)' "${TMP_DIR}/feed.json" \
    || fail "POST /feed returned an unexpected payload"

  status="$(request POST '/ask?stream=false' "${TMP_DIR}/ask.json" \
    -H 'Content-Type: application/json' \
    --data '{"question":"What is the heat equation?"}')"
  [[ "${status}" == "200" ]] || fail "POST /ask returned HTTP ${status}: $(cat "${TMP_DIR}/ask.json")"
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert isinstance(d["answer"], str); assert "verification" in d' "${TMP_DIR}/ask.json" \
    || fail "POST /ask returned an unexpected payload"

  headers="$(curl -sS --max-time 120 -D - -o "${TMP_DIR}/ask.sse" -X POST "${BASE_URL}/ask" \
    -H 'Content-Type: application/json' \
    -H 'Accept: text/event-stream' \
    --data '{"question":"What is the heat equation?"}')"
  grep -qi '^content-type: text/event-stream' <<<"${headers}" || fail "POST /ask did not return an SSE stream"
  grep -q 'data: ' "${TMP_DIR}/ask.sse" || fail "POST /ask SSE stream contained no events"
fi

echo "PASS: UI, liveness and health checks succeeded"
if [[ "${SMOKE_PROVIDER_TESTS:-0}" == "1" ]]; then
  echo "PASS: /feed, JSON /ask and SSE /ask succeeded"
fi

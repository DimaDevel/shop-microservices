#!/usr/bin/env bash
#
# Runs the k6 stress test against the gateway while clinic.js profiles it,
# producing a flamegraph/doctor report you can correlate with the saturation
# point k6 finds.
#
# Prerequisites:
#   - Downstream stack (auth/user/product/order/... services, Postgres, Kafka,
#     Redis) already running, e.g. via `docker-compose up --build`, with the
#     gateway itself NOT started by docker-compose (this script runs it
#     locally so clinic can instrument it).
#   - .env at repo root with JWT_SECRET / JWT_REFRESH_SECRET / INTERNAL_SECRET etc.
#
# Usage:
#   ./load-tests/k6/run-stress-with-clinic.sh [doctor|flame|bubbleprof]
#
# Output:
#   A .clinic/ directory under services/gateway with the HTML report.

set -euo pipefail

CLINIC_TYPE="${1:-doctor}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATEWAY_DIR="$REPO_ROOT/services/gateway"
HEALTH_URL="${API_URL:-http://localhost:3000}/health"

if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi

echo "Building gateway..."
npm run build --prefix "$GATEWAY_DIR"

echo "Starting gateway under clinic $CLINIC_TYPE..."
# setsid puts the whole npx -> clinic -> node chain in its own process group, so
# SIGINT can be delivered to every process in it at once (npx alone does not
# reliably forward signals down to the wrapped node process).
(
  cd "$GATEWAY_DIR" && exec setsid npx clinic "$CLINIC_TYPE" -- node dist/main
) &
CLINIC_PID=$!

echo "Waiting for gateway to come up..."
for _ in $(seq 1 60); do
  if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
  echo "Gateway did not become healthy in time" >&2
  kill -- "-$CLINIC_PID" 2>/dev/null || true
  exit 1
fi

echo "Gateway is up, running k6 stress test..."
k6 run "$REPO_ROOT/load-tests/k6/stress.js"
K6_EXIT=$?

echo "Stopping gateway so clinic can write its report..."
kill -SIGINT -- "-$CLINIC_PID"
wait "$CLINIC_PID"

echo "Clinic report written under $GATEWAY_DIR/.clinic"
exit "$K6_EXIT"

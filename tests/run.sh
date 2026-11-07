#!/usr/bin/env bash
# Runs each API test suite against a fresh database with the real server and a fake WhatsApp (Meta) API.
set -uo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL="${DATABASE_URL:-postgres://${PG_USER:-brela}:${PG_PASS:-brela}@localhost:5432/${PG_DB:-brela}}"
export ADMIN_EMAIL=boss@test.co ADMIN_PASSWORD='Secret123!' ADMIN_NAME=Neema JWT_SECRET=ci-secret NODE_ENV=test PORT=3000
export ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
export WHATSAPP_TOKEN=tok WHATSAPP_PHONE_NUMBER_ID=PN1 WHATSAPP_VERIFY_TOKEN=vt WHATSAPP_APP_SECRET=sec WA_GRAPH_BASE=http://localhost:4010 WA_AUTOREPLY=true
run() {
  local name=$1
  echo "=== $name ==="
  node tests/reset.js || exit 1
  node tests/mock-graph.js & local mock=$!
  node server.js >"/tmp/server-$name.log" 2>&1 & local srv=$!
  for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/login.html" >/dev/null && break; sleep 0.5; done
  node "tests/$name.test.js"; local code=$?
  kill $srv $mock 2>/dev/null; wait $srv $mock 2>/dev/null
  if [ $code -ne 0 ]; then echo "---- server log ($name)"; tail -40 "/tmp/server-$name.log"; exit $code; fi
}
run api; run whatsapp; run report; run playbook
echo "All test suites passed"

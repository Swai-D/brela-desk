#!/usr/bin/env bash
# Runs each API test suite against a fresh database with the real server and a fake WhatsApp (Meta) API.
set -uo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL="${DATABASE_URL:-postgres://${PG_USER:-brela}:${PG_PASS:-brela}@localhost:5432/${PG_DB:-brela}}"
export ADMIN_EMAIL=boss@test.co ADMIN_PASSWORD='Secret123!' ADMIN_NAME=Neema JWT_SECRET=ci-secret NODE_ENV=test PORT=3000
export ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
export AI_BASE_ANTHROPIC=http://localhost:4020/anthropic AI_BASE_OPENAI=http://localhost:4020/openai AI_BASE_GOOGLE=http://localhost:4020/google AI_BASE_XAI=http://localhost:4020/xai AI_BASE_MISTRAL=http://localhost:4020/mistral AI_BASE_KIMI=http://localhost:4020/kimi AI_BASE_DEEPSEEK=http://localhost:4020/deepseek AI_BASE_OPENROUTER=http://localhost:4020/openrouter
export WHATSAPP_TOKEN=tok WHATSAPP_PHONE_NUMBER_ID=PN1 WHATSAPP_VERIFY_TOKEN=vt WHATSAPP_APP_SECRET=sec WA_GRAPH_BASE=http://localhost:4010 WA_AUTOREPLY=true
run() {
  local name=$1
  echo "=== $name ==="
  node tests/reset.js || exit 1
  node tests/mock-graph.js & local mock=$!
  node tests/mock-ai.js & local mockai=$!
  node server.js >"/tmp/server-$name.log" 2>&1 & local srv=$!
  for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/login.html" >/dev/null && break; sleep 0.5; done
  node "tests/$name.test.js"; local code=$?
  kill $srv $mock $mockai 2>/dev/null; wait $srv $mock $mockai 2>/dev/null
  if [ $code -ne 0 ]; then echo "---- server log ($name)"; tail -40 "/tmp/server-$name.log"; exit $code; fi
}
run api; run whatsapp; run report; run playbook; run crud; run roles; run deploy; run pagination; run track; run frontend; run history; run lists; run engine; run ai; run templates; run package; run studio; run registry; run options; run scenarios; run wizards; run chat; run help
echo "All test suites passed"

#!/bin/zsh
set -eu
unsetopt BG_NICE

SERVICE_DIR="$(cd "$(dirname "$0")" && pwd)"
JAVA_BIN="$SERVICE_DIR/runtime/jdk-21.0.12.1+1-jre/Contents/Home/bin/java"
LT_DIR="$SERVICE_DIR/runtime/LanguageTool-6.9-SNAPSHOT"
NODE_BIN="${TYPOGRAF_NODE:-$(command -v node || true)}"
if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="/Users/mihailnagajcev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$JAVA_BIN" || ! -f "$LT_DIR/languagetool-server.jar" || ! -x "$NODE_BIN" ]]; then
  print -u2 "Не найдены локальные Java, LanguageTool или Node.js. См. README.md в этой папке."
  exit 1
fi

cd "$LT_DIR"
"$JAVA_BIN" -cp languagetool-server.jar org.languagetool.server.HTTPServer \
  --config "$SERVICE_DIR/runtime/server.properties" --port 8081 &
LT_PID=$!
trap 'kill "$LT_PID" 2>/dev/null || true' EXIT INT TERM

LT_READY=0
for attempt in {1..40}; do
  if curl -fsS --max-time 2 -X POST -d 'language=ru' --data-urlencode 'text=Проверка.' \
    http://127.0.0.1:8081/v2/check >/dev/null 2>&1; then
    LT_READY=1
    break
  fi
  sleep 1
done
if [[ "$LT_READY" -ne 1 ]]; then
  print -u2 "LanguageTool не запустился на порту 8081."
  exit 1
fi

cd "$SERVICE_DIR"
"$NODE_BIN" server.mjs

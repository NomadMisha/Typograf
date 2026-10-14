#!/bin/zsh
set -eu
unsetopt BG_NICE
SERVICE_DIR="$(cd "$(dirname "$0")" && pwd)"
OLLAMA_BIN="$SERVICE_DIR/runtime/ollama/ollama"
NODE_BIN="${TYPOGRAF_NODE:-$(command -v node || true)}"
if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="/Users/mihailnagajcev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$OLLAMA_BIN" || ! -x "$NODE_BIN" ]]; then
  print -u2 "Не найдены Ollama или Node.js. См. README.md в этой папке."
  exit 1
fi
export OLLAMA_HOST=127.0.0.1:11434
export OLLAMA_MODELS="$SERVICE_DIR/runtime/models"
export OLLAMA_NO_CLOUD=1
export OLLAMA_MAX_LOADED_MODELS=1
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_CONTEXT_LENGTH=8192
if [[ "${TYPOGRAF_AI_CPU:-0}" == 1 ]]; then
  export LLAMA_ARG_DEVICE=none
  export LLAMA_ARG_KV_OFFLOAD=0
fi
mkdir -p "$OLLAMA_MODELS"
OLLAMA_PID=''
LT_PID=''
trap '[[ -z "$LT_PID" ]] || kill "$LT_PID" 2>/dev/null || true; [[ -z "$OLLAMA_PID" ]] || kill "$OLLAMA_PID" 2>/dev/null || true' EXIT INT TERM
if ! curl -fsS --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  "$OLLAMA_BIN" serve >"$SERVICE_DIR/runtime/ollama.log" 2>&1 &
  OLLAMA_PID=$!
  for attempt in {1..30}; do
    if curl -fsS --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi
MODEL="${TYPOGRAF_AI_MODEL:-qwen3:4b}"
if [[ "$MODEL" == *cloud* ]]; then
  print -u2 "Для этого запуска требуется локальная модель без суффикса cloud."
  exit 1
fi
if ! "$OLLAMA_BIN" show "$MODEL" >/dev/null 2>&1; then
  print "Скачиваем локальную модель $MODEL. Это нужно только при первом запуске."
  "$OLLAMA_BIN" pull "$MODEL"
fi
JAVA_BIN="$SERVICE_DIR/runtime/jdk-21.0.12.1+1-jre/Contents/Home/bin/java"
LT_DIR="$SERVICE_DIR/runtime/LanguageTool-6.9-SNAPSHOT"
if ! curl -fsS --max-time 2 -X POST -d 'language=ru' --data-urlencode 'text=Проверка.' http://127.0.0.1:8081/v2/check >/dev/null 2>&1; then
  if [[ -x "$JAVA_BIN" && -f "$LT_DIR/languagetool-server.jar" ]]; then
    cd "$LT_DIR"
    "$JAVA_BIN" -Xmx512m -cp languagetool-server.jar org.languagetool.server.HTTPServer \
      --config "$SERVICE_DIR/runtime/server.properties" --port 8081 >"$SERVICE_DIR/runtime/languagetool.log" 2>&1 &
    LT_PID=$!
    for attempt in {1..20}; do
      if curl -fsS --max-time 2 -X POST -d 'language=ru' --data-urlencode 'text=Проверка.' http://127.0.0.1:8081/v2/check >/dev/null 2>&1; then break; fi
      sleep 1
    done
  else
    print "LanguageTool не установлен: нейропроверка работает отдельно, проверка пунктуации онлайн может быть недоступна."
  fi
fi
print "Локальная нейропроверка: http://127.0.0.1:4173"
print "Откройте адрес в браузере. После обычной проверки нажмите «Проверить нейросетью»."
cd "$SERVICE_DIR"
"$NODE_BIN" server.mjs

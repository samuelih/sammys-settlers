#!/usr/bin/env bash
# Start a JSettlers Java server with the WebSocket listener enabled, for web-client
# development and Playwright E2E. Runs the already-compiled classes directly via `java`
# (SOCServer reads jsettlers.* options as PROGRAM args, not JVM -D flags).
#
# Usage:
#   web/scripts/start-test-server.sh [--tcp PORT] [--ws PORT] [--bots N] [--foreground]
# Env overrides: JS_TCP_PORT, JS_WS_PORT, JS_BOTS, JAVA_BIN
#
# Defaults: TCP 8881, WS 8888, 7 bots. Writes a log to /tmp/js-web-server.log and prints
# the PID. Requires the project to have been compiled at least once:
#   JAVA_HOME=/opt/homebrew/opt/openjdk@17 gradle compileJava processResources
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

JS_TCP_PORT="${JS_TCP_PORT:-8881}"
JS_WS_PORT="${JS_WS_PORT:-8888}"
JS_BOTS="${JS_BOTS:-7}"
FOREGROUND=0
JAVA_BIN="${JAVA_BIN:-/opt/homebrew/opt/openjdk@17/bin/java}"
if ! [ -x "$JAVA_BIN" ]; then JAVA_BIN="$(command -v java)"; fi

while [ $# -gt 0 ]; do
  case "$1" in
    --tcp) JS_TCP_PORT="$2"; shift 2;;
    --ws) JS_WS_PORT="$2"; shift 2;;
    --bots) JS_BOTS="$2"; shift 2;;
    --foreground) FOREGROUND=1; shift;;
    *) echo "Unknown arg: $1" >&2; exit 2;;
  esac
done

find_jar() { find "$HOME/.gradle/caches" -name "$1" 2>/dev/null | head -1; }
GSON="$(find_jar 'gson-2.8.6.jar')"
JWS="$(find_jar 'Java-WebSocket-1.5.6.jar')"
SLF4J="$(find_jar 'slf4j-api-2.0.6.jar')"
if [ -z "$JWS" ]; then
  echo "Java-WebSocket jar not found in gradle cache. Run: gradle compileJava (downloads deps)." >&2
  exit 1
fi

CP="build/classes/java/main:build/resources/main:src/main/resources:$GSON:$JWS:$SLF4J"
LOG=/tmp/js-web-server.log
: > "$LOG"

# JVM system properties (must precede the main class). allow.debug is read via
# System.getProperty (not a program arg) and enables the "debug" chat user, which
# E2E tests use to deterministically grant resources/dev cards / free-place pieces.
JVM_ARGS=(-Djsettlers.allow.debug=Y)

# SOCServer reads jsettlers.* options as PROGRAM args (parsed by parseCmdline).
ARGS=(soc.server.SOCServer
  "-Djsettlers.port=$JS_TCP_PORT"
  "-Djsettlers.websocket.port=$JS_WS_PORT"
  "-Djsettlers.startrobots=$JS_BOTS")

echo "Starting JSettlers server: TCP=$JS_TCP_PORT WS=$JS_WS_PORT bots=$JS_BOTS (debug user enabled)"
if [ "$FOREGROUND" = "1" ]; then
  exec "$JAVA_BIN" "${JVM_ARGS[@]}" -cp "$CP" "${ARGS[@]}"
fi

"$JAVA_BIN" "${JVM_ARGS[@]}" -cp "$CP" "${ARGS[@]}" > "$LOG" 2>&1 &
PID=$!
echo "PID=$PID  log=$LOG"

# Wait up to 40s for the WebSocket listener to come up.
for _ in $(seq 1 40); do
  if grep -q "WebSocket listener started" "$LOG" 2>/dev/null; then
    echo "WebSocket listener ready on port $JS_WS_PORT"
    exit 0
  fi
  if grep -qiE "Exiting due to|Exception in thread .main." "$LOG" 2>/dev/null; then
    echo "Server failed to start; see $LOG" >&2
    tail -20 "$LOG" >&2
    exit 1
  fi
  sleep 1
done
echo "Timed out waiting for WebSocket listener; see $LOG" >&2
exit 1

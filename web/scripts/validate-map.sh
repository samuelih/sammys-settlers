#!/usr/bin/env bash
# Validate an exported .map.json against the REAL Sammys-Settlers Java custom-map validator.
#
# This is the round-trip proof for the web map editor (Phase 5): a .map.json produced by the
# TypeScript editor is fed through the actual soc.server.CustomMapLoader /
# soc.server.CustomMapValidator pipeline (the same code the live server uses), via a tiny
# standalone CLI (web/scripts/MapValidateCLI.java).
#
# Usage:
#   web/scripts/validate-map.sh <path-to.map.json>
#
# Exit codes: 0 = VALID, 1 = INVALID (validation/parse failure or missing file), 2 = setup error.
#
# Requires the project to have been compiled at least once so build/classes + build/resources exist:
#   JAVA_HOME=/opt/homebrew/opt/openjdk@17 gradle compileJava processResources
# (gson is pulled from the gradle cache, like web/scripts/start-test-server.sh does.)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [ $# -ne 1 ]; then
  echo "Usage: web/scripts/validate-map.sh <path-to.map.json>" >&2
  exit 2
fi
MAP_JSON="$1"

JAVA_BIN="${JAVA_BIN:-/opt/homebrew/opt/openjdk@17/bin/java}"
if ! [ -x "$JAVA_BIN" ]; then JAVA_BIN="$(command -v java)"; fi
JAVAC_BIN="${JAVAC_BIN:-/opt/homebrew/opt/openjdk@17/bin/javac}"
if ! [ -x "$JAVAC_BIN" ]; then JAVAC_BIN="$(command -v javac)"; fi

MAIN_CLASSES="build/classes/java/main"
MAIN_RES="build/resources/main"
if [ ! -d "$MAIN_CLASSES" ]; then
  echo "Compiled classes not found at $MAIN_CLASSES." >&2
  echo "Run: JAVA_HOME=/opt/homebrew/opt/openjdk@17 gradle compileJava processResources" >&2
  exit 2
fi

# Locate gson in the gradle cache (same approach as start-test-server.sh).
find_jar() { find "$HOME/.gradle/caches" -name "$1" 2>/dev/null | head -1; }
GSON="$(find_jar 'gson-2.8.6.jar')"
if [ -z "$GSON" ]; then
  GSON="$(find_jar 'gson-*.jar')"
fi
if [ -z "$GSON" ]; then
  echo "gson jar not found in gradle cache. Run: gradle compileJava (downloads deps)." >&2
  exit 2
fi

# Compile the standalone CLI on demand (only when its source is newer than the .class, or no .class).
SCRIPTS_DIR="web/scripts"
CLI_SRC="$SCRIPTS_DIR/MapValidateCLI.java"
CLI_OUT="$SCRIPTS_DIR/.classes"
CLI_CLASS="$CLI_OUT/MapValidateCLI.class"
if [ ! -f "$CLI_CLASS" ] || [ "$CLI_SRC" -nt "$CLI_CLASS" ]; then
  mkdir -p "$CLI_OUT"
  "$JAVAC_BIN" -cp "$MAIN_CLASSES" -d "$CLI_OUT" "$CLI_SRC"
fi

# Classpath: CLI classes, compiled server classes, server resources, and gson (like the test server).
CP="$CLI_OUT:$MAIN_CLASSES:$MAIN_RES:$GSON"

set +e
OUTPUT="$("$JAVA_BIN" -cp "$CP" MapValidateCLI "$MAP_JSON")"
STATUS=$?
set -e

echo "$OUTPUT"
exit "$STATUS"

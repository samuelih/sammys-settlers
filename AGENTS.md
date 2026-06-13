# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

JSettlers is a Java client-server implementation of *Settlers of Catan*. The same codebase builds two JARs: a server (`SOCServer`) and a full client (`SOCPlayerClient`) that can also host a server or run offline practice games against robot players. It originated as Robert S Thomas' AI-agent dissertation, so the robot/bot subsystem is first-class, not an afterthought.

## Build & test

The build is **Gradle 6.9.x or 7.x** and targets **Java 8** (`sourceCompatibility`/`targetCompatibility = 1.8`) for client compatibility, though it compiles on newer JDKs. There is **no Gradle wrapper checked in** — `gradle` must be installed and on `PATH`. The Gradle build also shells out to `python3`/`python` for several test/codegen tasks, so Python must be available too.

```bash
gradle build      # compile, build JARs into build/libs/, run unit tests
gradle assemble   # build JARs without running tests
gradle test       # run JUnit 4 unit tests (also runs python tests via testPython)
gradle extraTest  # run unit tests PLUS lengthy functional tests (depends on test)
gradle javadoc    # API docs -> build/docs/javadoc/
gradle clean
```

Run a **single Java test** (extraTest example — same `--tests` flag works for `test`):
```bash
gradle extraTest --exclude-task extraTestPython --exclude-task testPython --tests TestActionsMessages.testBuildAndMove
```

> **IMPORTANT:** Even when running `SOCServer`/`SOCPlayerClient` directly from an IDE, you must first run `gradle assemble` (or `build`) at least once to copy `src/main/resources/` into the build output. Otherwise startup fails with `Packaging error: Cannot determine JSettlers version`.

Test layout: unit tests in `src/test/java/soctest/**` (+ `src/test/python/`); long-running functional tests in `src/extraTest/java/soctest/**` (+ `src/extraTest/python/`). The `extraTest` source set has its own classpath wired in `build.gradle` and is **not** part of the shipped JARs.

The `test` task also runs `testSrcDBTemplateTokens` and `testSrcDBTemplates`, which verify the SQL scripts in `src/main/bin/sql/` are consistent with their template — see "Database" below.

## Running locally

```bash
java -jar build/libs/JSettlersServer-<ver>.jar              # server, port 8880, 7 bots, no DB needed
java -jar build/libs/JSettlers-<ver>.jar localhost 8880     # client connecting to that server
```

Useful dev JVM flags (place **before** `-jar`): `-Djsettlers.allow.debug=Y` (enable the `debug` chat-command user outside practice games), `-Djsettlers.debug.traffic=Y` (log all SOCMessage traffic in/out), `-Djsettlers.startrobots=N`. Game-option defaults are set with `-o NAME=value` (e.g. `-o VP=t13`) or the equivalent `-Djsettlers.gameopt.NAME=value`. A `jsserver.properties` file in the working dir is read at startup; validate config with `--test-config`.

## Architecture

### Client ⇄ server message protocol
Everything flows through **`soc.message.SOCMessage`** subclasses (one class per message type, ~120 of them). On the wire these are plain unicode strings via `DataOutputStream.writeUTF` / `readUTF` — deliberately simple so non-Java clients/bots can interop. Read `SOCMessage`'s javadoc before touching the protocol. `doc/Message-Sequences-for-Game-Actions.md` documents the message sequences for each game action.

Server-side dispatch (start at `soc.server.SOCServer`):
- **`SOCServerMessageHandler`** — connection/lobby-level messages (join, channels, etc.)
- **`SOCGameMessageHandler`** — in-game player actions
- **`SOCGameHandler`** — per-game logic glue; designed so future game *types* would each extend `GameHandler`

Client-side: **`SOCPlayerClient`** owns network + game-list window; **`SOCPlayerInterface`** is the in-game UI. The 2.0 refactor inserted `PlayerClientListener` and `GameDisplay` interfaces between `SOCPlayerClient` and the AWT/Swing UI to keep network handling separate from display.

### Game model (`soc.game`)
Authoritative game state lives **at the server** in `SOCGame` and its fields; clients hold only partial state. Core "business logic" is in `SOCGame`, `SOCPlayer`, and `SOCBoard`. The sea board and all scenarios use **`SOCBoardLarge`**. Pieces sit at edges, nodes, or hexes addressed by integer coordinates — coordinate systems differ between the classic board and sea board (see `SOCBoard`/`SOCBoardLarge` javadocs and `doc/hexcoord*.gif`).

### Game options & scenarios — the central extensibility mechanism
Game rules, house rules, and scenarios are all driven by **`SOCGameOption`** (registered in `SOCGameOptionSet.getAllKnownOptions` — read that javadoc before adding any rule/option). Conventions encoded in keynames:
- Names starting with `_SC_` = scenario-specific rules.
- Names starting with `_` = server-set internal options, hidden from the New Game UI.
- `_EXT_BOT` / `_EXT_CLI` / `_EXT_GAM` = reserved, unused by core, for third-party bots/clients/games to pass data.
- "Inactive" options are hidden until enabled at server startup via `jsettlers.gameopts.activate=...`; "third-party" options use `FLAG_3RD_PARTY` for forward/backward compat.

### Robots / AI (`soc.robot`)
Bots connect to the server **exactly like human clients** (they speak SOCMessage). Built-in bots run inside the server JVM. The per-game decision loop is in **`SOCRobotBrain.run()`**, not in `SOCRobotClient`. To write or experiment with a bot, start from the trivial subclasses in `soc.robot.sample3p` (`Sample3PClient`, `Sample3PBrain`). Run bot-only games for testing with `-Djsettlers.startrobots=10 -Djsettlers.bots.botgames.total=7`.

### Packages
`soc.server` (+ `soc.server.database`, `soc.server.genericServer`), `soc.client`, `soc.game`, `soc.message`, `soc.robot`, `soc.baseclient`, `soc.util`. `soc.debug` / `soc.disableDebug` provide a swappable `D` debug-print class (see Debugging). **`soc.extra`** is reusable test/dev code (e.g. `RecordingSOCServer`, `GameEventLog`, `GameActionExtractor`) developed alongside main but excluded from shipped JARs. `net.nand.util.i18n` is the standalone PropertiesTranslatorEditor (PTE) i18n tooling, built separately via `gradle i18neditorJar`.

The JARs are assembled by hand-picked package includes in `build.gradle` (`serverJar` excludes `soc.client`; `fullJar` includes it) — when adding a new top-level package, update those task `include` lists or it won't ship.

## Conventions that bite

- **Indentation:** spaces only, basic indent 4; braces on their own line; lines < ~120 chars. Import individual classes, never `soc.game.*` (some classes intentionally avoid importing others for separation).
- **Java `.properties` files use ISO-8859-1**, not UTF-8. Characters outside that range must be `\uXXXX`-escaped (or run `native2ascii`). Use the PTE editor or it's easy to corrupt strings.
- **i18n:** never build user-facing strings with `+`. Use `strings.get(...)` / `messageToPlayerKeyed*` / `messageToGameKeyed*` with `{0}` placeholders. Client strings in `soc/client/strings/data*.properties`, server strings in `soc/server/strings/*.properties`. Add a trailing comment with the English text when the key isn't self-explanatory. In-progress externalization is marked `/*I*/"..."/*18N*/`.
- **Java source is also Java 8** — no diamond-operator cleanup has been done in much of the code; match the surrounding style rather than modernizing opportunistically.
- New methods/fields get javadoc including an `@since` tag and a one-sentence summary.
- Early `return`s mid-method are flagged with a prominent comment, e.g. `return;   // <--- Early return: ... ---`.

## Debugging

- **`D.ebugPrintlnINFO`** output is toggled per-class by the import at the top of the file: switch `import soc.disableDebug.D;` → `import soc.debug.D;` to enable.
- Debug chat commands (type into a game's chat box; `*help*` lists them) can grant resources/dev cards, free-place pieces, etc. Enabled automatically in practice games; on a multiplayer server requires `-Djsettlers.allow.debug=Y` + connecting as user `debug`.
- `*FREEPLACE* 1` / `0` toggles Free Placement mode for setting up board states.
- `*SAVEGAME* name` / `*LOADGAME* name` / `*RESUMEGAME*` snapshot games to JSON (requires a GSON jar on the classpath; needs `jsettlers.savegame.dir` set). `soc.extra.server.RecordingSOCServer` additionally records network-message logs (`*savelog*`).
- `=*= showcoords` / `hidecoords` in chat shows board coordinates under the mouse.

## Database (optional)

The user/score/bot-params DB is **entirely optional** — the server runs fully without it (only persistent accounts/stats are lost). Code must stay vendor-neutral across MySQL, PostgreSQL, SQLite, Oracle. Schema lives in `soc.server.database.SOCDBHelper`; runtime upgrades go in `SOCDBHelper.upgradeSchema()`. **Never hand-edit the generated `src/main/bin/sql/jsettlers-tables-*.sql`** — edit `src/main/bin/sql/template/jsettlers-tables-tmpl.sql` and regenerate with `render.py` (the `testSrcDBTemplates` build task enforces this). See `doc/Database.md`.

## Further docs

`doc/Readme.developer.md` is the authoritative developer guide (deep detail on all of the above). `doc/Versions.md` = changelog/upgrade notes; `doc/Message-Sequences-for-Game-Actions.md` = protocol sequences; `doc/Release-Testing.md` = manual release checklist. The experimental **`v3` branch** replaces SOCMessage with Protobuf/JSON-over-HTTP.

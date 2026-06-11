# JSettlers Web Migration — Shared Architecture Spec

> This is the **single source of truth** for the web-migration initiative. Every workflow agent
> MUST read this file first and follow it exactly. It encodes decisions already made from a deep
> read of the Java codebase. Do not re-litigate these decisions.

Repo root: `/Users/samharrell/Personal Projects/JSettlers2-main`
Java: `/opt/homebrew/opt/openjdk@17/bin/java` (set `JAVA_HOME=/opt/homebrew/opt/openjdk@17` for builds).
Gradle 7.6.6 is on PATH and finds Java 17 itself. Node v20, npm 10.

## 1. Goal & Big Picture

Replace ONLY the Java **Swing client** with a modern **web client** (TypeScript/React/SVG). Keep the
Java **server** (`SOCServer`, `SOCGame`, `soc.robot` bots, scenarios, custom maps) as the authoritative
brain. The web client speaks the existing `soc.message.SOCMessage` protocol to the server over a new
**WebSocket** transport. Nothing in the existing Java server/client is deleted; the Swing client stays
working as a fallback.

```
Browser (web/, TS/React/SVG)  --WebSocket text frames (1 SOCMessage each)-->  Java SOCServer (unchanged logic)
```

## 2. Wire protocol — EXACT format (verified from Java source)

Each `SOCMessage` serializes to a single command string via `toCmd()`:

```
<typeId><SEP><field1><SEP2><field2><SEP2>...
SEP  = '|'  (0x7C)
SEP2 = ','  (0x2C)
```

- `typeId` is the integer message-type constant from `soc/message/SOCMessage.java`
  (e.g. VERSION=9998, SERVERPING=9999, STATUSMESSAGE=1069, CHANNELS=1003, GAMES=1019,
  GAMESWITHOPTIONS=1083, JOINGAME=1013, JOINGAMEAUTH=1021, NEWGAMEWITHOPTIONSREQUEST=1078,
  SITDOWN=1012, STARTGAME=1018, GAMEMEMBERS=1017, BOARDLAYOUT2=1084, GAMESTATE=1025, TURN=1026,
  PLAYERELEMENT=1024, PLAYERELEMENTS=1086, PUTPIECE=1009, ROLLDICE=1031, DICERESULT=1028, ...).
- Blank optional field token: `EMPTYSTR = "\t"` (a single TAB char, 0x09).
- "No game" token used where a game name field is required but empty: `GAME_NONE = ""` (0x16).
- Most messages parse the part after the first `|` by splitting on `,` (SEP2) with `StringTokenizer`.
  NOTE: `StringTokenizer` SKIPS empty tokens — a few messages rely on this; when porting a specific
  message, read its `parseDataStr()` to replicate exact tokenization, including `EMPTYSTR` handling.
- Multi-messages (`SOCMessageMulti`, e.g. `SOCGamesWithOptions`, `SOCPotentialSettlements`,
  `SOCBoardLayout2` sometimes) may contain multiple `|` (SEP) groups. Read each class's
  `toCmd`/`parseDataStr`/`parseDataArr` carefully.

Example — `SOCVersion.toCmd()`:
```
9998|2700,2.7.00,<build>,<feats>,<locale>     // vernum, verstr, build, feats, cliLocale
```
(build/feats/locale optional; blank => EMPTYSTR; trailing cliLocale omitted entirely if null.)

### Transport framing decision (IMPORTANT)
The Java TCP transport (`NetConnection`) wraps each command in `DataOutputStream.writeUTF` (a 2-byte
length prefix + modified-UTF8). **The WebSocket transport does NOT do this.** Each WebSocket **text
frame** carries exactly one raw `toCmd()` string. WebSocket already provides framing. So:
- Server→client: `webSocket.send(cmdString)`.
- Client→server: `onMessage(cmdString)` → `SOCMessage.toMsg(cmdString)` → push to server `inQueue`.
- TS client: `ws.send(cmd)` / `ws.onmessage = e => decode(e.data)`.

This means the TS codec only needs to produce/parse the `toCmd()` strings — NO writeUTF emulation.

## 3. Connection handshake (verified from SOCServer)

1. Client opens WebSocket.
2. Server (`newConnection2`) immediately sends: `SOCVersion` (server version+features) then `SOCChannels`.
3. Client sends `SOCVersion` as its FIRST message (vernum 2700, verstr "2.7.00", build EMPTYSTR or null,
   feats EMPTYSTR, locale "en_US"). The server handles it in `processFirstCommand` →
   `handleVERSION` → then sends the **game list**.
4. Game list: server sends `SOCGames` (older clients) or `SOCGamesWithOptions` (1.1.07+). Since the web
   client reports version 2700, expect `SOCGamesWithOptions` (typeId 1083). Also `SOCChannels`.
5. To create/join games the client uses `SOCNewGameWithOptionsRequest` (1078) / `SOCJoinGame` (1013).
   Server replies `SOCJoinGameAuth` (1021), `SOCGameMembers`, board layout, etc.

Use `-Djsettlers.allow.debug=Y` is NOT required for web. For practice-vs-bots, start the server with
bots: `-Djsettlers.startrobots=7`. The web client then creates a normal server game and adds bots /
locks seats just like the Swing client does (study `SOCPlayerClient`/`SOCServerMessageHandler` flows).

## 4. Java server changes (ADDITIVE ONLY — do not change existing behavior)

New files in package `soc.server.genericServer` (same package required to access `ourServer.inQueue`,
`addConnection`, `removeConnection`, `processFirstCommand`):

- **`WebSocketConnection.java`** — `extends Connection`. Wraps an `org.java_websocket.WebSocket`.
  - `put(String s)` → `ws.send(s)` (synchronized; guard if closing).
  - `connect()` → returns true (already open); set `connected=true`, `connectTime=new Date()`.
  - `isConnected()`, `disconnect()` (ws.close), `disconnectSoft()`, `host()` (remote address),
    `isInputAvailable()` → return false (so server sets the version timer; safe), `run()` → no-op
    (WS is event-driven; reading happens in the bridge's onMessage).
  - `getData()`/version fields inherited.
- **`WebSocketServerBridge.java`** — `extends org.java_websocket.server.WebSocketServer`.
  - Constructor takes `(InetSocketAddress addr, Server ourServer)`.
  - `onOpen(ws, handshake)`: create `WebSocketConnection`, stash it on the ws via `ws.setAttachment(conn)`,
    then call `ourServer.addConnection(conn)` **on a new thread** (addConnection runs newConnection1/2
    which send the greeting; mirror NetConnection where this happens in the conn thread). After
    addConnection returns, do NOT block.
  - `onMessage(ws, msg)`: `conn = ws.getAttachment()`; `SOCMessage m = SOCMessage.toMsg(msg)`. For the
    FIRST message call `ourServer.processFirstCommand(m, conn)`; if it returns false (or for subsequent
    messages) push `ourServer.inQueue.push(m, conn)` when `m != null`. Track first-message per conn.
  - `onClose(...)`: `ourServer.removeConnection(conn, false)`.
  - `onError(...)`: log; if conn known, removeConnection.
  - `onStart()`: log "WebSocket listener started on port N".
- **`SOCServer` wiring**: in `serverUp()` (after `super`/robot startup), if property
  `jsettlers.websocket.port` is set and > 0, construct and `.start()` a `WebSocketServerBridge` on that
  port bound to `this`. Add the property constant `PROP_JSETTLERS_WEBSOCKET_PORT = "jsettlers.websocket.port"`
  near `PROP_JSETTLERS_PORT`, register it in the help/props map, and read it. Wrap in try/catch so a WS
  failure never kills the TCP server. Print a clear startup line.
- **`build.gradle`**: add dependency `implementation 'org.java-websocket:Java-WebSocket:1.5.6'`
  (transitively pulls `org.slf4j:slf4j-api`). Add both jars to the `serverJar` and `fullJar`
  `Class-Path` manifest entries (space-separated, like the existing `gson.jar`) AND document that the
  jars must sit next to the server jar — OR (preferred for E2E) add a `JavaExec` task `runServer` that
  runs `soc.server.SOCServer` with `sourceSets.main.runtimeClasspath` so gradle supplies the deps.
  Add a `runServer` task:
  ```groovy
  task runServer(type: JavaExec) {
      group = 'application'
      classpath = sourceSets.main.runtimeClasspath
      mainClass = 'soc.server.SOCServer'
      systemProperties System.getProperties()   // pass -D props through
      args = (project.findProperty('socArgs') ?: '').toString().split(' ').findAll { it }
  }
  ```
  Keep all existing tests green — the new package classes belong to `soc/server/**` which is already
  included in jars, so no include-list change needed.

Do NOT modify `Server.java`, `Connection.java`, `NetConnection.java` logic. Only ADD.

## 5. Web client (`web/`) — structure & stack

Stack: **TypeScript · Vite · React 18 · SVG board · CSS custom-properties theming · Zustand · Vitest ·
Playwright.** ESM. Strict TS.

```
web/
  package.json            # scripts: dev, build, preview, test (vitest run), test:e2e (playwright)
  tsconfig.json  tsconfig.node.json
  vite.config.ts          # also configures vitest (test: { environment: 'jsdom' })
  playwright.config.ts    # webServer: vite preview/dev; baseURL http://localhost:5173
  index.html
  src/
    main.tsx  App.tsx
    theme/        tokens.css (CSS vars: colors, spacing, typography), themes.css (light/dark/colorblind)
    protocol/     index.ts, SOCMessage.ts (base + registry + encode/decode), constants.ts (typeIds,
                  SEP/SEP2/EMPTYSTR/GAME_NONE, enums: GameState, PlayerElement types, resource types,
                  piece types), messages/*.ts (one module per group). Vitest tests alongside (*.test.ts).
    net/          GameConnection.ts (WebSocket wrapper: connect, send(SOCMessage), onMessage dispatch,
                  reconnect, version handshake), useConnection hook.
    store/        gameStore.ts (Zustand): connection state, server version, games list, current game,
                  board, players, hand, turn, gameState. Pure reducers updated by protocol dispatch.
    screens/      ConnectScreen.tsx, LobbyScreen.tsx, GameScreen.tsx, MapEditorScreen.tsx
    components/   design-system primitives (Button, Panel, Dialog, Toast, etc.) + game UI
    board/        BoardSVG.tsx + hex/port/piece SVG components, coord math (SOCBoardLarge 0xRRCC)
    map-editor/   editor canvas, validation (mirror CustomMapValidator), import/export .map.json
  docs/           MIGRATION_SPEC.md (this), protocol.md (ported-message reference, keep updated)
  e2e/            *.spec.ts Playwright tests
  public/         static assets
```

Conventions:
- Strict TypeScript, no `any` in protocol code. Each ported message documents the Java source class.
- Keep protocol pure (no React imports) so it's unit-testable in Vitest.
- Theming via CSS variables only; no hard-coded colors in components.
- Accessibility: semantic HTML, ARIA, keyboard nav, color-blind-safe palettes.
- Add `data-testid` attributes generously for Playwright (e.g. `data-testid="game-list"`,
  `data-testid="hex-<coord>"`, `data-testid="player-panel-<n>"`).

## 6. Board model (for the SVG renderer)

The sea/large board uses `SOCBoardLarge`, coords `0xRRCC` (row in high byte, col in low byte; rows
0x01..0x15 odd-numbered usable, cols 0x01..0x16). Board arrives in `SOCBoardLayout2` (typeId 1084) as
named layout parts ("LH" land hexes, "PL" ports, "RH" robber hex, etc.). Pieces are placed at nodes
(settlements/cities), edges (roads/ships), hexes (robber). Read `SOCBoardLarge.java`,
`SOCBoardLayout2.java`, and `doc/hexcoord*.gif` references when building the renderer. Render hexes as
SVG polygons; nodes/edges computed from hex geometry. Player colors: blue, red, orange/green, etc.
(match `SOCPlayerInterface` ordering: 0=blue,1=green? — verify in `SOCPlayerInterface`/`ColorSquare`).

## 7. Map editor (Phase 5)

Mirror the validation rules in `soc/server/CustomMapValidator.java` and the JSON schema in
`soc/server/CustomMapLoader.java` + `src/main/bin/custommaps/sample-island.map.json` +
`doc/Custom-Maps.md`. Editor exports `.map.json` that the REAL Java `CustomMapValidator` accepts;
the Playwright round-trip test invokes the Java validator (via the `runServer`/a small gradle/java
exec) to prove acceptance.

## 8. Testing & gates (per phase)

- Java: `JAVA_HOME=/opt/homebrew/opt/openjdk@17 gradle compileJava` (fast incremental). Full
  `gradle build` before commit (must keep all existing tests green).
- Web unit: `npm run build` (tsc + vite) and `npm test` (Vitest) — protocol round-trip tests are the
  backbone; every ported message has an encode→decode→encode identity test plus a fixture captured
  from Java semantics.
- E2E: start Java server with `gradle runServer -DsocArgs=... -Djsettlers.websocket.port=8888
  -Djsettlers.startrobots=7`, start `npm run dev` (or preview), run `npx playwright test`.
- Playwright config should auto-start the web server; the Java server is started by the test
  harness/global-setup (or assumed running — document clearly).

## 9. Coding etiquette for agents

- Match existing Java style (4-space indent, braces on own line, `@since 2.7.00` javadoc on new
  methods/fields, early-return comments). Add GPLv3-style file headers to new Java files matching the
  surrounding files.
- Web code: Prettier-style 2-space indent, named exports, small modules.
- NEVER break the build. If you add a Java file, make sure it compiles against Java 8 source level
  (no records, no `var` in fields, no switch-expressions — Java 8!). `var` locals are NOT allowed
  (Java 8). Use explicit types.
- Leave the working tree compiling and tests green for your scope.
</content>
</invoke>

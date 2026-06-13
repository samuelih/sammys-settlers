# JSettlers Web Client

A modern **TypeScript / React / SVG** client for JSettlers (Settlers of Catan). It
replaces *only* the Java Swing client: it speaks the existing
`soc.message.SOCMessage` protocol to the unchanged Java `SOCServer` over a new,
**additive WebSocket transport**. The server, game logic, robots, scenarios and
custom-map loader are untouched and remain authoritative; the Swing client still
works as before.

```
Browser (web/, TS/React/SVG)  ──WebSocket text frames (1 SOCMessage each)──▶  Java SOCServer (unchanged logic)
```

This is a **working vertical slice**, not a finished product. It connects, runs the
lobby, plays a full sea-board game against the built-in bots (placement, roll,
build, trade, dev cards, robber, discard, game-over), has a Settings panel and a
standalone Map Editor with a real Java validation round-trip. It is **not yet at
parity** with the Swing client — see [Scope vs. the Swing client](#scope-vs-the-swing-client).

For the design details (transport, handshake, codec, store, board geometry) see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The wire protocol that the TypeScript
codec implements is tracked message-by-message in [`docs/protocol.md`](docs/protocol.md);
the decisions behind the whole migration are in [`docs/MIGRATION_SPEC.md`](docs/MIGRATION_SPEC.md).


## Tech stack

- **TypeScript** (strict mode) · **React 18** · **Vite 5** (dev server + build)
- **Zustand** for state (one game store + a UI store + a settings store)
- **SVG** board rendering (no canvas, no game-engine library)
- **CSS custom properties** for theming (light / dark / color-blind palettes)
- **Vitest** for unit tests (`jsdom` environment), **Playwright** for E2E
- The transport is the browser's native **WebSocket** (text frames). The protocol
  layer is pure TypeScript with no React/DOM dependency, so it is unit-testable.

The web client lives entirely under `web/` and has no Java build dependency at
runtime — it only needs a running `SOCServer` with the WebSocket listener enabled.


## Running it end-to-end

You need two things running: the **Java server** (with the WebSocket listener on)
and the **web dev server**. Below is the full sequence from a clean checkout.

### 1. Build the Java project once

The web transport depends on the `Java-WebSocket` jar (pulled by Gradle) and on the
compiled server classes / resources existing on disk. Build them once:

```bash
# from the repo root
JAVA_HOME=/opt/homebrew/opt/openjdk@17 gradle assemble
```

`gradle assemble` compiles the server, copies `src/main/resources/` into the build
output (required — see the repo `CLAUDE.md`), and downloads the WebSocket dependency
into your Gradle cache. (A faster `JAVA_HOME=… gradle compileJava processResources`
is enough for the helper scripts, but `assemble` is the safe one-shot.)

### 2. Start the server with the WebSocket listener

```bash
web/scripts/start-test-server.sh        # TCP 8881, WebSocket 8888, 7 bots, debug user
```

This script runs the already-compiled classes directly via `java`. Two details
matter and are easy to get wrong:

- **`SOCServer` reads its `jsettlers.*` options as *program arguments*, not JVM
  `-D` flags.** So `-Djsettlers.port=…`, `-Djsettlers.websocket.port=…` and
  `-Djsettlers.startrobots=…` are passed *after* the main class name, where
  `SOCServer.parseCmdline` reads them. The script does exactly this.
- **`jsettlers.allow.debug` is the exception — it is read with
  `System.getProperty`, so it *is* a real JVM `-D` flag** and must precede the main
  class. The script sets `-Djsettlers.allow.debug=Y`, which enables the `debug`
  chat user. The Playwright interaction tests rely on it to deterministically grant
  resources / dev cards and free-place pieces.

The script waits for the `WebSocket listener started on port 8888` log line, then
prints the PID and exits (the server keeps running in the background; log at
`/tmp/js-web-server.log`). Override ports/bots with `--tcp`, `--ws`, `--bots`, or
run it in the foreground with `--foreground`.

> Alternative (no helper script): `JAVA_HOME=/opt/homebrew/opt/openjdk@17 gradle
> runServer -Djsettlers.websocket.port=8888 -Djsettlers.startrobots=7`. The
> `runServer` Gradle task runs `SOCServer` on the full runtime classpath, so Gradle
> supplies the WebSocket + gson jars for you; it passes JVM `-D` props through and
> reads `-PsocArgs='…'` for program args. The TCP listener and the WebSocket
> listener run side by side either way.

### 3. Start the web client

```bash
cd web
npm install
npm run dev            # Vite dev server, default http://localhost:5173
```

Open http://localhost:5173, then on the Connect screen enter host `localhost` and
port `8888` (the WebSocket port) and connect. You should land in the lobby; create a
game, sit, start, and three bots fill the empty seats.


## Tests

### Unit tests (Vitest)

```bash
cd web
npm test               # vitest run
```

These cover the protocol codec (every ported message has encode→decode→encode
round-trip and known-wire-string tests, several cross-checked against the live Java
server), the board coordinate math, the Zustand store reducers, and the React
components/screens. They need no server.

There is also a small set of **live** discovery tests (`net/liveDiscovery.test.ts`)
that exercise the option-discovery handshake against a running server on WS 8888;
they are part of `npm test` but only meaningful when the server is up.

### End-to-end tests (Playwright)

Playwright drives a real browser against the **live Java server** (it does *not*
start the server for you — only the web preview). One-time browser install, then:

```bash
cd web
npx playwright install chromium     # one time
npm run build                       # Playwright's webServer serves the built app

# In another terminal (or beforehand): start the Java server
web/scripts/start-test-server.sh    # TCP 8881, WS 8888, 7 bots, debug user

npx playwright test                 # runs the e2e/ specs
```

`playwright.config.ts` auto-starts the web app via `npm run preview` on port 5173;
the **Java server must already be running** on WS 8888. The specs are:

| Spec | What it proves (against a live server + bots) |
| ---- | --------------------------------------------- |
| `smoke.spec.ts` | The app shell renders (no server needed). |
| `connectivity.spec.ts` | Connects over WebSocket and reaches the lobby. |
| `lobby.spec.ts` | Create a 4-player game, sit, start, get 3 bots seated. |
| `game.spec.ts` | Sea-board (`SBL=t`) game: drive full human initial placement (2 settlements + 2 roads) and complete a normal dice roll. |
| `interactions.spec.ts` | A turn's worth of interactions: 4:1 bank trade, buy a dev card, play Knight + move the robber (uses the `debug` user to set up deterministic state). |
| `ck-game.spec.ts` | Create an `SC_CK` game and exercise C&K UI/state: barbarian track, knight buy/activate, commodity grant, and city-improvement build. |
| `ck-botgame.spec.ts` | Run many `SC_CK` rounds against bots and assert barbarian/progress-card mechanics do not stall the server. |
| `map-editor.spec.ts` | Load the sample map, live-validate, make a valid edit, export `.map.json`; and a duplicate-coordinate edit is flagged invalid. |


## Map editor + Java validation round-trip

The Map Editor (reachable from the app shell, no server connection required) edits a
sea-board layout, validates it live in the browser (mirroring
`soc.server.CustomMapValidator`), and exports a `.map.json` file. The honest proof
that the exported file is *actually* accepted by JSettlers is a round-trip through
the real Java validator:

```bash
web/scripts/validate-map.sh path/to/exported.map.json
# exit 0 = VALID, 1 = INVALID, 2 = setup error
```

The script compiles a tiny standalone CLI (`web/scripts/MapValidateCLI.java`) on
demand and feeds the JSON through the same `soc.server.CustomMapLoader` /
`CustomMapValidator` pipeline the live server uses (gson pulled from the Gradle
cache). It needs the project compiled at least once (step 1 above). The web E2E
map-editor spec produces an export artifact that this script can verify.


## Project layout

```
web/
  index.html  vite.config.ts  playwright.config.ts  tsconfig*.json
  package.json                # scripts: dev, build, preview, test, test:e2e
  scripts/                    # start-test-server.sh, validate-map.sh, MapValidateCLI.java
  docs/                       # MIGRATION_SPEC.md, protocol.md, ARCHITECTURE.md
  e2e/                        # Playwright specs (smoke, connectivity, lobby, game, interactions, map-editor)
  src/
    protocol/                 # SOCMessage codec: base + registry, constants (typeIds, enums,
                              #   SEP/SEP2/EMPTYSTR), messages/*.ts (one module per message),
                              #   gameOptions.ts. Pure TS, no React. ~67 message modules.
    net/                      # GameConnection.ts — WebSocket wrapper: connect, version handshake,
                              #   send(SOCMessage), per-type dispatch, reconnect.
    store/                    # Zustand stores: gameStore (connection + lobby + game state +
                              #   action senders), uiStore (which screen), settingsStore.
    board/                    # SVG sea board: BoardSVG.tsx + pieces/, coords.ts (0xRRCC math +
                              #   pixel geometry), boardModel.ts (decode SOCBoardLayout2).
    screens/                  # ConnectScreen, LobbyScreen, GameRoom, GameScreen, MapEditorScreen,
                              #   SettingsScreen, Root.tsx (router).
    components/               # design-system primitives (Button, Panel, Dialog, Toast, …) +
                              #   newgame/ (New Game dialog + option fields).
    map-editor/               # editor grid/actions, mapSchema.ts, validation.ts (mirrors the Java
                              #   validator), import/export.
    theme/                    # tokens.css (CSS vars), useTheme.ts.
    util/                     # sound.ts (WebAudio effects).
```


## Scope vs. the Swing client

**What the web client does today (Playwright-proven where noted):**

- Connect over WebSocket; version + feature handshake; option/scenario discovery.
- Lobby: see the game list, create a game with the full standard game-option set
  (sea board, player count, victory points, house rules, scenario picker), sit, lock
  seats, and start vs. bots.
- A playable **sea-board** game end to end: initial placement, dice roll, build
  (road/ship/settlement/city), bank/port and player-to-player trade offers, buy &
  play dev cards (Knight/Road Building/Monopoly/Year of Plenty), robber & pirate
  movement, choosing a rob victim, discarding on a 7, and game-over with final scores.
- A playable **Cities & Knights** server-backed slice: `SC_CK` game creation,
  commodities, city improvements, metropolises, aggregate knights, barbarian attacks,
  progress-card hand/play flows, and a full official expansion reference catalog in
  the C&K sidebar.
- A read-only in-game **game log** (server text + a derived event log).
- A Settings panel: theme (light/dark/system), color-blind palettes, sound on/off +
  volume, board render quality, and font scale.
- A standalone **Map Editor** with live validation and a real Java validator round-trip.

**Not yet at parity / deferred** (the web client does *not* do these yet):

- **Sea board only.** The renderer targets `SOCBoardLarge` (sea/large board, the
  `SBL` option). The classic 4-player hexagonal board's coordinate system is not
  rendered.
- **Cities & Knights is not exact boxed-game parity.** The web client now lists every
  official component and all 54 progress cards, but only sends actions backed by the
  Java server. City walls, the merchant pawn, board-placed knights, event-die behavior,
  and many official progress-card effects are still reference-only; see
  `doc/Cities-and-Knights-Implemented.md` (repo root). Other scenarios (fog hexes,
  gift ports, cloth villages, wonders) remain selectable but have **no scenario-specific
  UI** yet.
- **In-game chat is supported** (text input under the game log). There is no
  lobby/channel chat.
- **No accounts / persistence / reconnect-into-running-game**, no spectator UX
  beyond the join-as-observer step, no board reset/ask-reset flow, no "ask special
  build" 6-player flow surfaced in the UI, no game-stats/timing dialogs.
- **Single connection, single game at a time** in the UI; no multi-game window
  management like the Swing client.
- Authentication, i18n of the web UI strings, and full keyboard-shortcut coverage
  are not implemented.

The Java Swing client remains the full-featured, supported client; this web client
is the in-development alternative front end.

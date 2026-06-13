# Sammys-Settlers Improvements — June 2026

This is the single summary of an improvement initiative carried out on top of the
`2.7.00`-in-development line. It is the place to read first if you want to understand
everything that changed and why. Every claim here is verifiable in the repository;
where something is groundwork, a limitation, or deliberately deferred, this document
says so plainly rather than overselling it.

Baseline for "what changed" is commit `aa68826` ("Baseline: Sammys-Settlers as downloaded,
before improvement work"). All work landed in four commits on `main`, built and tested
in waves behind green gates, plus one post-review fix commit:

| Commit    | Title |
| --------- | ----- |
| `f3d3c91` | Add preferences dialog/registry, custom map loading, and C&K design docs |
| `6e8e54c` | Add board rendering quality prefs, themes, color-blind mode, hotkeys, C&K groundwork |
| `48c4989` | Add left-click build flow on board, robot fallback for unknown inventory items |
| `989675a` | Fix issues found in post-implementation code review |

(The earlier commit `2e0fc1d` "Fix TestI18NGameoptScenStrings failure when project path
contains spaces" predates this initiative's baseline and is not part of it.)


## 1. Overview

| Workstream | What shipped | Key files | Commits |
| ---------- | ------------ | --------- | ------- |
| Graphics & themes | Board rendering-quality preferences (antialiasing, image-scaling interpolation) actually consumed by the board; dice-number circle image caching; per-graphics-set externalized `theme.properties`; color-blind assist mode for the solid-color UI | `src/main/java/soc/client/SOCBoardPanel.java`, `src/main/java/soc/client/ColorSquare.java`, `src/main/resources/resources/hexes/pastel/theme.properties`, `src/main/resources/resources/hexes/classic/theme.properties` | `6e8e54c`, `989675a` |
| Playability & UX | A central **Preferences…** dialog and preference registry; UI font-size scaling at startup; in-game build hotkeys; left-click confirm-to-build on the board; TradePanel auto-reject countdown layout fix | `src/main/java/soc/client/PreferencesDialog.java`, `src/main/java/soc/client/UserPreferences.java`, `src/main/java/soc/client/SwingMainDisplay.java`, `src/main/java/soc/client/SOCPlayerInterface.java`, `src/main/java/soc/client/TradePanel.java`, `src/main/java/soc/client/SOCBoardPanel.java` | `f3d3c91`, `6e8e54c`, `48c4989`, `989675a` |
| Custom maps | Server-side, off-by-default loading of user-defined board layouts from `*.map.json` files, registered as custom scenarios; full validator; sample map; documentation | `src/main/java/soc/server/CustomMapLoader.java`, `src/main/java/soc/server/CustomMapValidator.java`, `src/main/java/soc/server/SOCBoardAtServer.java`, `src/main/java/soc/server/SOCServer.java`, `src/main/java/soc/game/SOCScenario.java`, `src/main/bin/custommaps/sample-island.map.json`, `doc/Custom-Maps.md` | `f3d3c91`, `989675a` |
| Cities & Knights groundwork | Phase 0 only: reserved inactive-hidden options, a disabled scenario stub, `SOCSpecialItem` improvement tracks, a barbarian-strength counter, and a decision-complete design doc plus proposed message sequences | `src/main/java/soc/game/SOCGameOptionSet.java`, `src/main/java/soc/game/SOCScenario.java`, `src/main/java/soc/game/SOCSpecialItem.java`, `src/main/java/soc/game/SOCGame.java`, `doc/Cities-and-Knights-Design.md`, `doc/Message-Sequences-for-Game-Actions.md` | `f3d3c91`, `6e8e54c`, `989675a` |
| Robot robustness | Built-in bot no longer hangs when asked to place an inventory item for a scenario it has no strategy for; it cancels the placement gracefully | `src/main/java/soc/robot/SOCRobotBrain.java` | `48c4989`, `989675a` |
| Build/test fixes | Wave gates kept the suite green; the C&K option keynames were shortened to satisfy the 8-character keyname limit; the I18N path-with-spaces fix | `src/main/java/soc/game/SOCGameOptionSet.java`, `src/main/java/soc/game/SOCSpecialItem.java`, `src/main/resources/resources/strings/server/toClient.properties` | `6e8e54c` |


## 2. Workstreams

### 2.1 Graphics & themes

**What changed.** Three rendering/accessibility preferences are now actually consumed by
the board renderer (`SOCBoardPanel`):

- `renderAntialiasing` — smooth edges on/off.
- `renderInterpolation` — image scaling quality: `nearest`, `bilinear`, or `bicubic`.
- `colorBlindMode` — `off`, `deuteranopia`, `protanopia`, or `tritanopia`.

A single helper `SOCBoardPanel.setRenderingHints(Graphics)` reads the two render
preferences once per rescale into cached fields and is applied at every draw/scale site,
so quality is consistent and preference-driven. Dice-number circles are now rendered once
into a cached translucent image per dice value (cleared on rescale), serving the classic,
6-player-rotated, and sea boards.

Each hex graphics set under `resources/hexes/<set>/` gained a `theme.properties` file
(`pastel` and `classic` provided). The format and every key are documented inside
`resources/hexes/pastel/theme.properties`: `key=RRGGBB` (six hex digits, no leading `#`,
ASCII only); an empty value or `none` means no color; any omitted key falls back to the
compiled-in default. The current default colors are baked into the files, so visual output
is unchanged out of the box — but a themer can now re-skin a set (hex border colors, the
water border, the pirate-path line color, and the dice-circle rarity colors) without
recompiling. These files ship in the client/full JAR via the existing `resources/**`
include; the server JAR does not ship them (the server does not render boards).

Color-blind mode remaps the **solid-color UI**: resource counters, trade dialogs, building
costs (`ColorSquare`), the dice-number circles on hexes, piece fallback colors, and the
pirate-path line. The deuteranopia and protanopia (red-green) modes share an Okabe-Ito-inspired
blue/orange/yellow/brown palette for squares plus a light-blue→orange→dark gradient for dice
rarity; tritanopia (blue-yellow) uses a red/teal/pink palette and a light-grey→pink→dark-red
dice gradient.

**How to use it.** Open the **Preferences…** dialog (see §2.2) and set the *Display* and
*Accessibility* controls. `renderAntialiasing` and `renderInterpolation` take effect at the
next board rescale; `colorBlindMode` and any theme color change take effect **after a restart
or a hex-graphics-set reload, not live** — the same model the hex-graphics-set preference has
always used, because resource colors are compared internally by object reference.

**Developer notes.** Color-blind palettes are centralized for easy tuning (in
`ColorSquare` and the dice-palette table in `SOCBoardPanel`); the values are reasonable
accessibility choices selected by design heuristics rather than measured in a CVD simulator,
so a reviewer with simulation tooling may want to adjust the specific `RRGGBB` values. The
`ColorSquare` resource color constants were made non-`final` and are reassigned once at class
load, before any `ColorSquare` exists, preserving the existing `c == CLAY` reference-equality
tooltip logic — do not reassign the palette at runtime after squares exist.

### 2.2 Playability & UX

**Preferences dialog and registry.** A new **Preferences…** button on the client's main
panel (in the local-server label row of `SwingMainDisplay`, always enabled) opens a modal
User Preferences dialog. It centralizes existing and new client preferences under
*General* / *Display* / *Accessibility* headers:

- Sound effects (all games)
- Auto-reject bot trades after N seconds (a negative value disables)
- Remembered face icon ID
- Hex graphics set (Pastel / Classic)
- Force UI scale (0 = auto; requires restart)
- Smooth board drawing / antialiasing
- Board image scaling quality (Nearest / Bilinear / Bicubic)
- UI font size (Small / Normal / Large / Extra large; requires restart)
- Color-blind assist mode (Off / Deuteranopia / Protanopia / Tritanopia)

Changes apply on **OK** (Cancel discards). Some — UI scale, UI font size, rendering quality,
color-blind mode — take effect only for newly opened windows or after restart. The one
exception, fixed during code review, is the **hex graphics set**: changing it now reloads the
board graphics of any open games immediately, the same way the New Game Options frame does.

UI font size is applied at startup by `SwingMainDisplay.scaleUIManagerFontsForFontSizePref()`
(small −2pt, large +3pt, extra-large +6pt, never below 8pt), called before any window is
created.

**Build hotkeys.** New in-game keyboard shortcuts for the seated client player, using the
same modifier convention as the existing Roll/Done/trade shortcuts (Ctrl on Linux/generic,
Cmd on macOS, Alt on Windows):

| Shortcut       | Action                | Notes |
| -------------- | --------------------- | ----- |
| Ctrl/Cmd-S     | Buy/place a Settlement | Same as the Settlement button (toggles cancel if already placing) |
| Ctrl/Cmd-K     | Buy/place a City       | Uses **K**, not C — Ctrl-C is the existing Counter-offer shortcut |
| Ctrl/Cmd-B     | Buy a Development Card  | **Only in games of 4 or fewer players** — in 6-player games Ctrl/Cmd-B remains *Ask Special Build* |

For reference, the existing related shortcuts are unchanged: Ctrl-R = Roll, Ctrl-D =
Done/End-turn, Ctrl-A/J/C = Accept/Reject/Counter a trade offer. Because all of these
require the Ctrl/Cmd modifier, none of them fire while you are typing in the chat box. The
new build shortcuts route through the same `SOCBuildingPanel.clickBuildingButton` path as the
on-screen buttons, so they are no-ops unless the action is currently legal (correct game
state, enough resources). Road and End-turn shortcuts were intentionally **not** added: Ctrl-R
is already Roll and Ctrl-D already ends the turn, and the codebase keeps each Ctrl-keystroke
uniquely bound within the game window.

**Left-click build flow.** During your normal turn (not initial placement), left-clicking a
spot where you can build a road, ship, settlement, or city now selects it and shows a
confirmation prompt in the game's message area ("Click again to build … here, or right-click /
press Escape to cancel."); a second left-click on the same spot builds it. Clicking a
different spot, clicking empty board area, right-clicking, or pressing Escape cancels. This
complements — it does not replace — the existing right-click build menu, which still works
exactly as before, and the long-standing "right-click the build location" new-user hint still
appears (up to twice) when you left-click somewhere that is *not* a buildable target.
Affordability and placement legality are enforced by the same hover logic as before, so the
flow only offers targets you can actually afford and place. The build request sent is
identical to the right-click menu's, including the multi-phase build sequence and the
Forgotten Tribe (`_SC_FTRI`) "place ship that removes a port" confirmation dialog. Four new
client i18n keys were added under `board.leftclick.confirm.*` (English only; other locales
fall back).

**TradePanel countdown fix.** The bot auto-reject countdown timer text is now always shown on
its own line below the Accept/Reject/Counter buttons. Previously, in the compact narrow
layout, it could overlap the stacked buttons.

**Developer notes.** The canonical place to add a client preference is the
`UserPreferences.PreferenceDescriptor` registry (`UserPreferences.getRegisteredPreferences()`):
register a descriptor and the preference auto-appears in `PreferencesDialog` with the correct
control (checkbox / spinner / combo). The existing static `getPref`/`putPref` API is unchanged
and remains how values are read and written; a `String` overload was added for choice
preferences stored as strings. The per-game sound-mute preference
(`SOCPlayerInterface.PREF_SOUND_MUTE`) is deliberately **not** in the registry and is
unchanged. No new i18n keys were added by the hotkey work.

### 2.3 Custom maps

**What changed.** The server can now load user-defined board layouts from JSON files at
startup and offer each as a custom scenario. This is a **server-admin feature, off by
default**. The pipeline: `SOCServer` reads the `jsettlers.custommaps.dir` property,
soft-checks that GSON is on the classpath (a server without `gson.jar` still starts, with a
warning), then `CustomMapLoader` scans the directory for `*.map.json` files, parses each via
GSON, validates it with `CustomMapValidator`, and registers a custom `SOCScenario`.
`SOCBoardAtServer` detects a registered custom scenario and feeds its parsed arrays through
the existing board-placement code. Clients need no update: the layout is sent with the
standard `SOCBoardLayout2` message, so any current client can play a custom map.

**v1 is standard rules only.** A custom map changes only the **board** — land hexes, dice
numbers, ports, land areas, an optional robber/pirate start, and an optional `shuffle` flag —
on the sea board, with the standard 10-VP win condition. It cannot define scenario-specific
options, special edges, villages, fortresses, wonders, or fog.

**How to set it up.**

1. Create a directory for your maps, e.g. `custommaps/`.
2. Copy the shipped example `src/main/bin/custommaps/sample-island.map.json` into it, or
   write your own.
3. Start the server with `-Djsettlers.custommaps.dir=custommaps` (or set
   `jsettlers.custommaps.dir` in `jsserver.properties`), and ensure `gson.jar` is on the
   classpath — the same dependency the savegame feature uses, already on the shipped JARs'
   `Class-Path`.
4. The server scans the directory once at startup and logs each loaded map, e.g.
   `Custom map loaded: sample-island.map.json -> scenario SC_XSAMP ("Sample Two Islands")`.
5. Players then pick the custom map from the normal scenario list when creating a New Game.

Custom scenarios are keyed with the reserved `SC_X` prefix
(`SOCScenario.CUSTOM_SCENARIO_KEY_PREFIX`) plus the first four alphanumerics of the filename
(e.g. `sample-island.map.json` → `SC_XSAMP`). Invalid maps are **skipped with a logged
warning, not fatal**. If two files' first four alphanumerics collide, the second is skipped —
rename one.

**Caveats worth surfacing to authors.** When `shuffle` is `false`, the layout (including any
adjacent 6s/8s) is placed exactly as written, but port *types* are always shuffled among the
fixed port edges. A deeper port-edge-vs-coastline consistency check runs only when a game
actually starts, so a port that overlaps land or faces water can pass load-time validation
yet fail game creation — authors should test by actually starting a game. The full
file-format reference, a field-by-field sample walkthrough, the scenario-key naming/collision
rules, and explicit lists of what **is** and what **is not** validated are in
[doc/Custom-Maps.md](Custom-Maps.md).

**Developer notes.** The new server property is
`SOCServer.PROP_JSETTLERS_CUSTOMMAPS_DIR = "jsettlers.custommaps.dir"`. Registration uses the
new server-side `SOCScenario.registerCustomScenario(...)` companion to `addKnownScenario`,
with `minVersion 2000` and options `SBL=t,VP=t10`. Custom-map boards do not set a visual-shift
("VS") layout part, so they may render slightly off-center compared with tuned built-in
scenarios; this is cosmetic and a candidate future enhancement (a `visualShift` JSON field).

### 2.4 Cities & Knights groundwork

**Honest framing up front: no Cities & Knights gameplay is implemented.** This release ships
**Phase 0 (groundwork) only**, and it changes no existing-game behavior. The single source of
truth for the roadmap and representation decisions is
[doc/Cities-and-Knights-Design.md](Cities-and-Knights-Design.md); the proposed network
messages live only in the clearly-marked "PROPOSED (design stage, not implemented)" section at
the end of [doc/Message-Sequences-for-Game-Actions.md](Message-Sequences-for-Game-Actions.md)
and must not be read as implemented protocol.

What Phase 0 actually added:

- **Five reserved inactive-hidden boolean options** plus the scenario flag, all
  `FLAG_INACTIVE_HIDDEN | FLAG_DROP_IF_UNUSED`, `minVersion 2000`, `lastModVersion 2700`:
  `_CK_KNI`, `_CK_IMP`, `_CK_PROG`, `_CK_BARB`, `_CK_METR`, and `_SC_CK`. (The Java constant
  names — `K__CK_KNIGHTS`, etc. — keep the long descriptive form; the *key strings* are the
  short ones. See §3.)
- **A disabled `SC_CK` scenario stub** (`SOCScenario.K_SC_CK`), `minVersion 2000`,
  `lastModVersion 2700`, with `scOpts` of only active base options (`SBL=t,VP=t13`). It exists
  to reserve the key and anchor documentation; it cannot be selected in normal play.
- **Three `SOCSpecialItem` city-improvement tracks** — Trade, Politics, Science — with
  `typeKey`s `_CK_IMP/T`, `_CK_IMP/P`, `_CK_IMP/S`, levels 1–5, and interim standard-resource
  costs (level N costs N of a stand-in resource: Trade=sheep, Politics=ore, Science=wheat),
  wired into `SOCSpecialItem.makeKnownItem`.
- **A barbarian-strength counter** in `SOCGame` (`getBarbarianStrength()`,
  `advanceBarbarianStrength()`) advanced once per `rollDice()` when `_CK_BARB` is set, with new
  `RollResult` fields `ck_barbarianStrength` and `ck_barbarianAttackFired` (always `false` in
  Phase 0; attack resolution is a log-only stub). Modeled on the `SC_PIRI` `sc_piri_*` fields.

**How a server admin would experiment with the `_CK_*` options.** Because they are
inactive-hidden, they never appear in the New Game UI and can only be enabled at server
startup with `-Djsettlers.gameopts.activate=_CK_KNI,_CK_IMP,_CK_PROG,_CK_BARB,_CK_METR`
(property `SOCServer.PROP_JSETTLERS_GAMEOPTS_ACTIVATE`). **What that would do:** it makes the
options selectable and the barbarian counter would advance on each roll in a game that has
`_CK_BARB` set. **What it would not do:** there is no Cities & Knights gameplay — no knights,
no improvements purchasable in play, no progress cards, no barbarian attacks resolved, no
metropolis awards, and no commodities. The `SC_CK` scenario stub still cannot be played
meaningfully. Activation is for groundwork experimentation and tests only.

The C&K win target is 13 VP, achieved via the existing `VP` option (`VP=t13`);
`checkForWinner()` already honors `vp_winner`, verified by test rather than reimplemented.

### 2.5 Robot robustness

**What changed.** A behavior change for the built-in robot only. Previously, if a bot was
asked to place an inventory item for a scenario it had no strategy for (currently anything
other than `SC_FTRI`'s gift port), it logged an error and did nothing, hanging until the
server force-ended its turn. Now `SOCRobotBrain.planAndPlaceInvItem()` falls back via the new
`fallbackUnknownInvItemPlacement(SOCInventoryItem)`: it asks the server to cancel the
placement (`SOCCancelBuildRequest` with `INV_ITEM_PLACE_CANCEL`), which returns the item to the
bot's hand and resumes play at `PLAY1`.

The code-review fix corrected the original two-branch design: the bot **cannot** legally end
its own turn in `PLACING_INV_ITEM` (`SOCGame.canEndTurn` is false there), so it always sends
the cancel. The server checks the item's `canCancelPlay` flag itself; if it refuses with a
decline, the bot's `handleDECLINEPLAYERREQUEST` resets its expect flags and the bot waits
quietly for the server's turn timer rather than hanging.

There are no user-facing strings, config keys, or protocol changes — only existing messages
are sent.

**Developer notes.** To give the built-in bot a real placement strategy for a new
`PLACING_INV_ITEM` item, add a branch in `planAndPlaceInvItem()` before the fallback is
reached. The fallback contract is documented in the javadoc of both
`planAndPlaceInvItem()` and `fallbackUnknownInvItemPlacement()`.

### 2.6 Build/test fixes

The work was implemented in build-gated waves (A, B, C); each gate ran the full suite and had
to be green before the next wave proceeded. Two notable fixes happened along the way:

- **The `_CK_*` 8-character keyname rename (Gate B).** Wave B initially registered the C&K
  options with their long descriptive key strings (`_CK_KNIGHTS`, `_CK_IMPROV`, …). The
  `SOCGameOption` constructor enforces a hard 8-character limit on keynames, so this produced
  an `ExceptionInInitializerError` in `SOCGameOptionSet.getAllKnownOptions` that aborted whole
  test classes (24 failures on the first iteration). The fix shortened the **key strings**
  while keeping the Java constant names intact: `_CK_KNIGHTS → _CK_KNI`, `_CK_IMPROV →
  _CK_IMP`, `_CK_PROGRESS → _CK_PROG`, `_CK_BARBARIAN → _CK_BARB`, `_CK_METROPOLIS → _CK_METR`
  (`_SC_CK` was already valid). The matching i18n keys in
  `src/main/resources/resources/strings/server/toClient.properties`, the `SOCSpecialItem`
  `typeKey` literals (`_CK_IMP/T|P|S`), and stale references in comments/docs were all updated
  to match. **These short keys are the real, current ones — trust the code over any older
  notes that show the long names.**
- **I18N path-with-spaces (pre-baseline).** `TestI18NGameoptScenStrings` was made robust to a
  project path containing spaces (commit `2e0fc1d`, just before this initiative's baseline).


## 3. Verification

**Build/test status.** The suite was green at every gate:

- **Gate A** (`f3d3c91`): 275 Java unit tests + 7 Python tests, 0 failures.
- **Gate B** (`6e8e54c`): after the keyname fix, **281 Java unit tests + 7 Python tests**,
  0 failures, 0 skipped (the new test count reflects the added `TestCKGroundwork` and
  `TestCustomMapLoader` suites).
- **Gate C** (`48c4989`): 281 Java + 7 Python tests, 0 failures, on the first build.

`testSrcDBTemplateTokens` and `testSrcDBTemplates` passed at each gate as well. Note: the
gates were run by the implementing agents; re-run `gradle build` to confirm in your own
environment (this document was written without running gradle).

**Tests added.** `soctest.server.TestCustomMapLoader` (parse-success of the sample plus every
validation failure mode, key derivation, and register/double-register collision) and
`soctest.game.TestCKGroundwork` (option existence/flags/minVersion, the activation API, the
scenario stub, improvement-item costs/levels, the barbarian counter, and that the `VP` option
drives the win at 13).

**Adversarial review outcome.** A post-implementation code review was run and **found real
issues, which were fixed** in commit `989675a` ("Fix issues found in post-implementation code
review"). The confirmed findings fixed:

- **Hex graphics set did not apply to open games.** `PreferencesDialog` now calls
  `SOCPlayerClient.reloadBoardGraphics()` when the hex-graphics-set choice changes, so open
  games refresh immediately (as the New Game Options frame already did).
- **Left-click target not cancelled on a non-hoverable click.** `SOCBoardPanel` now clears a
  pending left-click build target when the player left-clicks a non-hoverable spot (board
  margin, between hexes), matching the other cancel branches.
- **Robot fallback could attempt an illegal end-turn.** As described in §2.5, the bot can't
  end its turn in `PLACING_INV_ITEM`; the fallback now always sends the cancel and relies on
  the server (and, if declined, the turn timer) instead of a now-removed end-turn branch.
- **Custom-map validator gaps.** `CustomMapValidator` now rejects duplicate port edges and
  requires a port to face a declared **non-water** land hex (previously it accepted any
  declared hex, including water). `TestCustomMapLoader` gained coverage for these.


## 4. Honest limitations & roadmap

These are stated plainly so nobody is surprised later.

- **Color-blind mode does not recolor the hex bitmap art.** The painted `.gif` hex tiles are
  unchanged. Color-blind mode remaps only the solid-color UI (resource counters, trade
  dialogs, building costs, dice-number circles, piece fallback colors, the pirate-path line).
  Players with color vision deficiency still see the original hex artwork; recolored hex
  bitmaps are a possible future enhancement. Color-blind mode and theme color changes are also
  **restart-applied, not live**.
- **Custom maps are standard-rules-only (v1).** They change the board, not the rules: no
  scenario-specific options, special edges, villages, fortresses, wonders, or fog. **Bots play
  custom maps with generic base-game logic** — they have no map-specific strategy. The board
  has no visual-shift layout part, so it may render slightly off-center. Several authoring
  properties are deliberately **not validated** (playability/fairness, island connectivity,
  land-area contiguity, hex-count-vs-player-count), and the port-coastline check only runs at
  game start. See [doc/Custom-Maps.md](Custom-Maps.md).
- **Cities & Knights is groundwork only.** Phase 0 is reserved inactive options, a disabled
  stub, two flag-hidden prototypes, and documentation — nothing playable. The structural
  blocker is the **commodity (cloth/coin/paper 6th-resource) refactor**: the entire codebase
  assumes exactly five resources, so commodities need their own release. The phased roadmap,
  each phase independently shippable behind inactive options, is in
  [doc/Cities-and-Knights-Design.md](Cities-and-Knights-Design.md):
  Phase 0 — Groundwork (this release);
  Phase 1 — Non-commodity mechanics;
  Phase 2 — Commodity / 6th-resource refactor (the blocker);
  Phase 3 — Progress cards + knights + client UI;
  Phase 4 — Bot competence.
  The proposed message sequences (with placeholder constants) await protocol review in the
  PROPOSED section of
  [doc/Message-Sequences-for-Game-Actions.md](Message-Sequences-for-Game-Actions.md).
- **Deferred graphics/UX items.** Recolored hex bitmaps for color-blind mode; live
  re-rendering of already-open windows for preferences other than the hex graphics set;
  building-button tooltips advertising the new hotkeys (the button references live in
  `SOCBuildingPanel`, outside this initiative's edited files); Road/End-turn build hotkeys
  (skipped to keep each Ctrl-keystroke uniquely bound); CVD-simulator tuning of the
  color-blind palette values.


## 5. Cross-references

- [doc/Custom-Maps.md](Custom-Maps.md) — custom map file format, validation, and troubleshooting.
- [doc/Cities-and-Knights-Design.md](Cities-and-Knights-Design.md) — the decision-complete C&K
  design and multi-release roadmap.
- [doc/Message-Sequences-for-Game-Actions.md](Message-Sequences-for-Game-Actions.md) — protocol
  sequences, including the PROPOSED (not implemented) C&K section.
- [doc/Versions.md](Versions.md) — changelog; the client/UX items above belong under the
  `2.7.00` notes.


## 6. Web client migration (TypeScript/React over WebSocket)

A separate, later strand of this initiative replaced *only* the Java Swing client with a
new web client under `web/`. The Java server, game model, robots, scenarios, and the
custom-map loader are unchanged and remain authoritative; the Swing client still works.
The web client speaks the existing `soc.message.SOCMessage` protocol to `SOCServer` over a
new **additive WebSocket listener**. As elsewhere in this document, claims below are
verifiable in the repository, and where something is a vertical slice, partial, or deferred
it is said plainly.

This work landed in a series of phase commits on `main` (`15f3fec`, `9003fdf`, `90f0d90`,
`6c5dcde`, `ab409b8`, `562430e`, `1b38538`, `5c2d712`), separate from the four-commit
Swing/server initiative summarized in section 1.

### 6.1 The seven phases

| Phase | Scope |
| ----- | ----- |
| 1 | Web client foundation + Java WebSocket transport (handshake, protocol codec core, connect screen) |
| 2 | Lobby & game setup: game list, New Game dialog with option/scenario discovery, create/sit/lock/start vs bots |
| 3 | In-game core loop: decode `SOCBoardLayout2`, render the SVG sea board, drive initial placement and the dice roll |
| 4 | Full interactions: trading (bank/port + player offers), dev cards, robber/pirate, discard, game-over; Settings panel |
| 5 | Standalone web Map Editor with live validation and a real Java `CustomMapValidator` round-trip |
| 6 | Visual polish: board art, animations, responsive chrome, themes/color-blind/sound/font settings |
| 7 | Playwright E2E suite + documentation (this section, `web/README.md`, `web/docs/ARCHITECTURE.md`) |

### 6.2 Architecture (verifiable)

- **Transport (additive, server-side).** New `WebSocketConnection` and
  `WebSocketServerBridge` in `soc.server.genericServer` (package-private access to the
  server internals) bridge `org.java-websocket` sockets into the existing `Server`. The
  defining decision: **each WebSocket text frame carries exactly one raw
  `SOCMessage.toCmd()` string — no `writeUTF` length prefix** (WebSocket provides framing),
  so the server speaks the same protocol over TCP and WebSocket. `SOCServer` starts the
  listener only when `jsettlers.websocket.port` is set; a start failure is logged and never
  stops the TCP server. `Server.java`/`Connection.java`/`NetConnection.java` are untouched.
  - Key files: `src/main/java/soc/server/genericServer/WebSocketConnection.java`,
    `…/WebSocketServerBridge.java`, the wiring + `PROP_JSETTLERS_WEBSOCKET_PORT` in
    `src/main/java/soc/server/SOCServer.java`, and the `Java-WebSocket` dependency +
    `runServer` task in `build.gradle`.
- **Client (`web/`).** TypeScript (strict) · React 18 · Vite · SVG board · Zustand · CSS
  custom-property theming. A pure-TS protocol codec (~67 `SOCMessage` modules under
  `web/src/protocol/`, each documenting its Java source class and reproducing
  `toCmd()`/`parseDataStr()` faithfully); a `GameConnection` WebSocket wrapper
  (`web/src/net/`) that performs the version/feature handshake and dispatches decoded
  messages; a `gameStore` (`web/src/store/`) that reduces messages into UI state and sends
  player actions; an SVG sea-board renderer (`web/src/board/`) using the `SOCBoardLarge`
  `0xRRCC` coordinates and pixel geometry ported from `SOCBoardPanel`.
  - The design is documented in `web/docs/ARCHITECTURE.md`; the message-by-message wire
    reference (with documented format subtleties) is in `web/docs/protocol.md`.

### 6.3 What works and is Playwright-proven

The Vitest unit suite (34 test files) covers the protocol codec — every ported message has
an encode→decode→encode round-trip plus known-wire-string fixtures, many cross-checked
byte-for-byte against the live Java server — the board coordinate math, and the store
reducers/components.

The Playwright E2E specs (`web/e2e/`) run against a **live Java server with bots** (started
by `web/scripts/start-test-server.sh`: TCP 8881, WS 8888, 7 bots, `debug` user). They prove,
end to end:

- connect over WebSocket and reach the lobby (`connectivity.spec.ts`);
- create a 4-player game, sit, start, and get three bots seated (`lobby.spec.ts`);
- a sea-board (`SBL=t`) game: drive a full human initial placement (2 settlements + 2 roads)
  and complete a normal dice roll (`game.spec.ts`);
- a turn of interactions — 4:1 bank trade, buy a dev card, play Knight + move the robber,
  using the `debug` user for deterministic setup (`interactions.spec.ts`);
- the Map Editor: load the sample map, validate live, make a valid edit, export `.map.json`,
  and have a duplicate-coordinate edit flagged invalid (`map-editor.spec.ts`).

The map-editor export is additionally checked through the **real Java validator** via
`web/scripts/validate-map.sh`, which runs `soc.server.CustomMapLoader`/`CustomMapValidator`
— the same code the live server uses.

### 6.4 Honest limitations / not yet at parity with the Swing client

- **Sea board only.** The renderer targets `SOCBoardLarge`; the classic hexagonal 4-player
  board's coordinate system is not rendered.
- **No scenario-specific rules/UI.** Scenarios are discoverable and selectable in the New
  Game dialog (so the server may apply them), but there is no client UI for scenario
  mechanics (fog hexes, gift ports, special items, cloth, Cities & Knights).
- **No human chat.** The in-game panel is a read-only log; the only outbound text path is the
  `debug` command sender the tests use. No lobby/channel chat.
- **No accounts/persistence, no reconnect-into-running-game, no board-reset flow, no
  game-stats/timing dialogs, no 6-player special-build UI, no web-UI i18n, and only partial
  keyboard support.** A single connection and single game at a time in the UI.
- **E2E depends on a manually-started Java server** (Playwright serves only the web app) and
  on macOS/Homebrew paths in the helper scripts (`/opt/homebrew/opt/openjdk@17`); the
  defaults are overridable via flags/env.

The Java Swing client remains the full-featured, supported client; this web client is the
in-development alternative front end.

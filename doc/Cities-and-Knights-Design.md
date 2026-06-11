# Cities & Knights Design

This is a **decision-complete design document** for adding *Cities & Knights*-style rules
to JSettlers. It does not describe shipped behavior: as of this writing, no Cities & Knights
gameplay is implemented. The document exists so that the groundwork landing in this release
(reserved game options, a disabled scenario stub, two flag-hidden prototypes, and proposed
message sequences) is built against an agreed plan, and so the multi-release roadmap that
follows can be picked up one independently-shippable phase at a time.

It replaces and expands the one-line TODO entry "Cities & Knights support" in
[Readme.developer.md](Readme.developer.md). Proposed network message sequences for the new
actions live in the clearly-marked PROPOSED section at the end of
[Message-Sequences-for-Game-Actions.md](Message-Sequences-for-Game-Actions.md); protocol
review should happen against that section before any of those messages are implemented.

Throughout, every design decision cites the existing JSettlers pattern it reuses, so that
the eventual implementation imitates proven code rather than inventing new mechanisms.


## 1. Honest verdict up front

A playable Cities & Knights is **not** achievable in a single initiative, and this document
does not pretend otherwise. The blocking item is structural, not just effort: Cities & Knights
adds three commodities (cloth, coin, paper) on top of the five base resources, and the entire
JSettlers codebase assumes exactly five resources. See [section 5](#5-the-commodity-problem-honestly)
for the full analysis. On top of commodities, Cities & Knights needs knight semantics that
conflict with the existing meaning of "knight" (dev-card count feeding Largest Army), a
progress-card deck, a barbarian state machine, metropolis tracking, client UI, and bot strategy.

What *is* realistic now, and what the groundwork in this release commits to:

1. This design document, resolving the hard representation questions before code is written.
2. Reserved `_CK_*` game-option keys behind `FLAG_INACTIVE_HIDDEN`, plus a disabled
   `K_SC_CK` scenario stub, claiming the namespace with correct version gating.
3. Two small flag-hidden prototypes with unit tests: `SOCSpecialItem` improvement-track
   entries, and a barbarian strength counter in `SOCGame`/`RollResult`.
4. Proposed message sequences documented for protocol review.

The remainder is a phased roadmap. Each phase is independently shippable behind inactive
options; promising more than Phase 0 in this cycle would be dishonest.


## 2. Scope & phasing

Each phase below is independently shippable behind inactive (hidden) options, so that
incomplete work never reaches an unprepared player and so reviewers can evaluate one
self-contained slice at a time.

### Phase 0 — Groundwork (this release)

- This design document.
- Reserved inactive `_CK_*` options and the disabled `K_SC_CK` scenario stub
  (see [section 6](#6-game-option--scenario-surface)).
- `SOCSpecialItem` improvement-track entries (trade / politics / science, levels 1-5)
  added to `makeKnownItem`, exercised by a unit test but reachable only when the hidden
  options are activated.
- A barbarian strength counter in `SOCGame`, advanced in `rollDice()` and surfaced in
  `RollResult`, modeled directly on the `SC_PIRI` pirate-fleet fields; attack resolution
  stubbed (logging only) until knight semantics exist.
- Proposed message sequences documented for review.

Nothing in Phase 0 changes behavior for existing games: the options are inactive and hidden,
the scenario is disabled, and the prototypes are only reachable when an operator explicitly
activates the hidden options at server startup.

### Phase 1 — Non-commodity mechanics

City improvements (as Special Items), the barbarian attack resolution, and metropolis awards
become playable, **paid for in the five standard resources as an interim house rule**. This
deliberately sidesteps the commodity refactor so a meaningful slice can ship first. VP target
is 13 via the existing `VP` option.

### Phase 2 — Commodity / 6th-resource refactor

The big one. Introduce a `ResourceSet` abstraction, then extend it to carry commodities;
gate the new wire encoding behind a `SOCFeatureSet` flag and version negotiation. See
[section 5](#5-the-commodity-problem-honestly). This is realistically a multi-class,
both-sides-of-the-protocol effort plus a robot retune, and likely warrants its own release.

### Phase 3 — Progress cards + knights + client UI

Progress-card deck (as `SOCInventoryItem` subclass), city-linked knight state with
activate/promote/move, and the client rendering and dialogs for all of the above.

### Phase 4 — Bot competence

Teach the built-in bots to value commodities, choose improvements, activate and move knights,
and respond to barbarian threats. Sequenced last because bot tuning is empirical and easiest
to iterate after the rules and protocol are stable.


## 3. Key representation decisions (with rationale and cited patterns)

### 3.1 Knights are city-linked player state, NOT a new `SOCPlayingPiece`

**Decision:** Represent a player's knights as per-player state associated with the player's
cities (presence, level 1-3 "basic / strong / mighty", and active/inactive), tracked in
`SOCPlayer`. Do **not** add a `KNIGHT` constant to `SOCPlayingPiece` or place knights on the
board as independent pieces.

**Rationale — what this avoids.** `SOCPlayingPiece` currently defines
`ROAD=0, SETTLEMENT=1, CITY=2, SHIP=3, FORTRESS=4, VILLAGE=5`. Adding a board-placed
`KNIGHT` piece type would pull the new type through the entire piece pipeline:

- `SOCGame.putPiece()` and the placement state machine, which are tightly wound around the
  existing piece types and their game states.
- The `SOCPutPiece` / `SOCMovePiece` / `SOCRemovePiece` protocol and every client and bot
  that interprets `pieceType`.
- A direct semantic collision with the word "knight" already in the codebase:
  `SOCPlayer.numKnights` (`getNumKnights()` / `setNumKnights()` / increment near
  `SOCPlayer.java` line 2544-2564) counts **Soldier development cards played**, which feeds
  **Largest Army** (`SOCGameElements.GEType.LARGEST_ARMY_PLAYER`). In Cities & Knights there
  is no Largest Army at all, and "knight" means something completely different. Overloading
  `numKnights` or the `KNIGHT` dev-card constant (`SOCDevCardConstants.KNIGHT = 9`) would be
  a rules conflict, not a convenience.

Keeping knights as player state (analogous to how warship counts are tracked per player in
`SC_PIRI` via `SOCPlayerElement.PEType.SCENARIO_WARSHIP_COUNT` rather than as new piece types)
confines the change to `SOCPlayer` fields plus a small number of `SOCPlayerElement` element
types, and leaves `putPiece`, the piece protocol, and Largest Army untouched.

**Note on display:** knights still appear on the board visually in the physical game, sitting
at city nodes. That is a *client rendering* concern (Phase 3), drawn from the per-player
knight state at known city node coordinates — it does not require the knight to be a
server-side board piece.

### 3.2 City improvements are `SOCSpecialItem` typed entries with levels 1-5 per track

**Decision:** Model the three improvement tracks (Trade, Politics, Science) as
`SOCSpecialItem`s with a per-track `typeKey`, using the item's existing `level` field for the
1-5 improvement level, following the `SC_WOND` Wonders pattern exactly.

**Cited pattern — `SC_WOND`.** `SOCSpecialItem` already supports per-game and per-player
items with a `level` (`getLevel()`), a per-level resource `cost` (`SOCResourceSet`),
`Requirement`s (`req`), and an optional `startingCostPiecetype`. The Wonders scenario uses
exactly this: `makeKnownItem(typeKey, idx)` (around `SOCSpecialItem.java` line 230) fills
`cost`/`req`/`sv`/`startingCostPiecetype` from the static arrays `COST_SC_WOND`,
`REQ_SC_WOND`, `SV_SC_WOND`, and a wonder is built up level by level via `playerPickItem`.
The class javadoc explicitly says new item types add their field initialization to that
factory.

City improvements map onto this naturally:

- Three `typeKey`s, one per track. Per the `SOCSpecialItem` class javadoc convention, when an
  option has more than one special-item type the key is `optionName + "/" + shortKey`, so the
  tracks would be e.g. `"_CK_IMP/T"` (Trade), `"_CK_IMP/P"` (Politics),
  `"_CK_IMP/S"` (Science).
- The `level` field holds the current track level (0-5). Buying the next level costs the
  appropriate commodity (Phase 2) or interim standard-resource cost (Phase 1), parsed into a
  `SOCResourceSet` cost array exactly like `COST_SC_WOND`.
- A per-player Special Item per track is kept in the player's Special Item list (the Wonders
  scenario already keeps a reference both in the game's list and at index 0 of the player's
  list — the same dual-list bookkeeping applies).

This is the **lower-risk** alternative to extending `SOCCity` with an improvements field
(which would bloat that intentionally lean class). It reuses the requirement-checking
(`checkRequirements`), cost-checking (`checkCost`), and network handling already proven by
`SC_WOND`, so the Phase 0 prototype is just new static cost/requirement data plus a factory
branch.

**Phase 0 prototype scope:** add the three `typeKey`s and their per-level cost/requirement
static arrays to `makeKnownItem`, with a unit test in `src/test/java/soctest/game/` modeled
on `TestSpecialItem.testMakeKnownItem` / `testRequirementParseGood`. No new message types
(reuses `SOCSetSpecialItem`).

### 3.3 Progress cards are a `SOCInventoryItem` subclass, following `SC_FTRI`

**Decision:** Implement the progress-card deck (Trade / Politics / Science decks) as a
`SOCInventoryItem` subclass, distinct from `SOCDevCard`, following the `SC_FTRI` gift-port
pattern. Progress cards are playable on the turn received (no one-per-turn dev-card limit).

**Cited pattern — `SC_FTRI` and `SOCInventoryItem`.** `SOCInventoryItem` is explicitly the
base class for inventory items that are **not** dev cards and are **not** subject to the
"at most 1 dev card per turn" rule (see its class javadoc: "Except for `SOCDevCard`s, these
items aren't subject to the rule of playing at most 1 Development Card per turn"). `SC_FTRI`
uses it for gift trade ports. The javadoc's "When adding a new kind of inventory item"
checklist is the implementation spec: pick a unique `itype` (the field is documented to not
overlap dev-card constants), gate it on a scenario game option, wire it through
`SOCGame.canPlayInventoryItem` / `playInventoryItem`, and choose `SOCSimpleRequest` /
`SOCSimpleAction` / `SOCInventoryItemAction` for the network flow.

Why not reuse `SOCDevCard`? The dev-card type space is capped
(`SOCDevCardConstants.MAXPLUSONE = 10`, `KNIGHT = 9`), the dev-card play path enforces the
one-per-turn rule and one-turn delay we explicitly don't want, and `SC_PIRI` already
overloads the `KNIGHT` dev card for Warships — piling progress cards onto the same constants
invites collisions. A dedicated subclass keeps progress-card lifecycle and play rules separate
and follows the established `SOCInventoryItem` extension point.

### 3.4 Barbarian attack is a `SOCGame` counter advanced in `rollDice()`, following `SC_PIRI`

**Decision:** Add a barbarian strength/position counter to `SOCGame`, advance it inside
`rollDice()`, and surface the per-roll result through new fields on the nested
`SOCGame.RollResult` class — modeled directly on the existing `SC_PIRI` pirate-fleet plumbing.

**Cited pattern — `SC_PIRI` in `rollDice()`.** `SOCGame.rollDice()` (around line 6635)
already contains a scenario block, guarded by `isGameOptionSet(SOCGameOptionSet.K_SC_PIRI)`,
that runs **before** the 7-handling: it advances the pirate fleet along its path, computes a
victim, and copies the outcome onto `currentRoll` via the `RollResult` fields
`sc_piri_fleetAttackVictim` and `sc_piri_fleetAttackRsrcs` (declared on the nested
`RollResult` class around line 10762). The same shape applies to barbarians:

- A `SOCGame` field for barbarian advancement (the classic rule advances the ship one step
  each time the smaller die... in C&K it advances on each roll until a threshold is reached;
  the exact rule is a Phase 1 detail). The counter advances in the new
  `isGameOptionSet(_CK_BARB)` block in `rollDice()`.
- New `RollResult` fields (e.g. a barbarian-attack-fired flag and per-player city-loss /
  resource-loss results) mirroring the `sc_piri_*` fields, set in that block.
- Resolution timing: like `SC_PIRI`, the barbarian step runs before the standard 7-discard
  handling, and uses the established early-return-to-pick-gold idiom already present in that
  method (the `// <--- Early return: ... ---` comment at line 6696 is the model).

**Phase 0 prototype scope:** the counter advances in `rollDice()` under the inactive
`_CK_BARB` option, the new `RollResult` fields are populated, and attack *resolution* is
stubbed to a log line (no city downgrades, no resource theft) until knight semantics land in
Phase 1/3. A unit test asserts the counter advances and the `RollResult` fields are set.

The eventual attack-result announcement reuses the `SC_PIRI_FORT_ATTACK_RESULT` (value 1001)
`SOCSimpleAction` pattern — that constant already demonstrates "send game-data updates, then a
single result action carrying a strength value and an outcome code." A barbarian-attack-result
`SOCSimpleAction` constant in the same 1000+ scenario range is the natural fit; see the
PROPOSED message sequences.

### 3.5 Metropolis is an automatic VP award to the track leader

**Decision:** A metropolis is an automatic 2-VP award to the player who is the sole leader of
an improvement track (first to reach the qualifying level), re-evaluated when any player's
track level changes; no board placement and no player choice.

**Cited pattern — Special VP and `checkForWinner` re-evaluation.** JSettlers already awards
non-piece "Special Victory Points" and already re-checks the winner whenever VP can change:
`SOCGame` raises VP and calls `checkForWinner()` from the points-gaining paths (e.g. around
`SOCGame.java` line 2692, `getTotalVP() >= vp_winner || hasScenarioWinCondition`). A
metropolis is just another contributor to a player's total VP, recomputed when a track leader
changes and folded into the existing `checkForWinner()` call sites. Keeping it automatic (sole
leader of a track) avoids both a board piece and an interactive choice, and keeps the
recompute cheap (only when a track level actually changes). This mirrors how `SC_WOND` awards
the win to the higher-level wonder holder without a board piece.

### 3.6 VP target 13 via the existing `VP` option

**Decision:** Set the win target to 13 VP using the existing `VP` game option; do not add new
win-target machinery.

**Cited pattern.** `SOCGame.vp_winner` is already read from the `VP` option
(`SOCGame.java` line 1573: `op.getOptionIntValue("VP", VP_WINNER_STANDARD, true)`, with
`VP_WINNER_STANDARD = 10` at line 630), and scenarios already set non-default targets in their
option strings — e.g. `SC_FTRI` uses `VP=t13`, `SC_CLVI` uses `VP=t14`. The `K_SC_CK`
scenario's option string therefore simply includes `VP=t13`. `checkForWinner()` already honors
`vp_winner`, so this needs **verification with a test, not reimplementation**.


## 4. Bot impact summary

The built-in bots connect as ordinary clients speaking `SOCMessage`, join via
`BOTJOINREQUEST`, and receive game options (including scenario flags) at join time. The brain
(`SOCRobotBrain.run()`) and its helpers (`SOCRobotDM`, `SOCRobotNegotiator`, plus
`RobberStrategy` / `DiscardStrategy` / `OpeningBuildStrategy`) gate scenario behavior on
`game.isGameOptionSet(...)`. Crucially, **unknown game options are tolerated**: a bot in a
game whose scenario it doesn't understand passes the options through and simply doesn't act on
the unfamiliar mechanics (for unhandled placement states it logs and does nothing). This means
Phase 0-2 can ship without any bot work — bots will join `_CK_*` games and play the base game
acceptably, ignoring improvements/knights/barbarians.

Two concrete bot consequences to plan for:

- **Resource loops are hard-coded to five resources.** The robot trading and discard logic
  iterates `CLAY..WOOD` literally:
  `DiscardStrategy.java` line 122-123 and `SOCRobotNegotiator.java` at lines 217-218, 238-239,
  380-381, 448-449, 1665-1666, 2310-2311, 2583-2584, 2600-2601, 2636-2637, 2673-2674,
  2698-2699 (and similar). Every one of these caps at `SOCResourceConstants.WOOD` and would
  silently ignore commodities until updated. This is part of the Phase 2 commodity refactor
  blast radius, not a Phase 0/1 concern.
- **Competent C&K bot play is Phase 4 and empirical.** It needs commodity valuation, an
  improvement-planning analog to `SOCPossiblePiece`, knight activate/move/defense decisions,
  and metropolis-leader awareness. Initial C&K bot play will be weak; tuning is best done
  after rules and protocol stabilize.

Third-party bots (`soc.robot.sample3p`) are unaffected: they declare their own feature sets
and would opt out of C&K just as `Sample3PClient` opts out of other scenarios.


## 5. The commodity problem, honestly

Cities & Knights adds three commodities — **cloth, coin, paper** — gained from upgraded cities
and tradeable. JSettlers assumes exactly five resources everywhere, and the assumption is
baked into numeric constants, not just loops.

### 5.1 Why the constants break

`SOCResourceConstants` defines:

```
CLAY=1, ORE=2, SHEEP=3, WHEAT=4, WOOD=5
UNKNOWN=6
GOLD_LOCAL=6              // same numeric value as UNKNOWN
CLOTH_STOLEN_LOCAL=7
MIN=1, MAXPLUSONE=7       // "one past maximum value (7; max value is 6 == UNKNOWN)"
```

The class javadoc itself warns: *"Many pieces of code depend on these values and their count...
those are the 5 resource types (count==5 or ==6 (unknown) is also assumed). Adding a new
resource type would require changes in many places."* The numeric slots **6 and 7 are already
occupied**: `GOLD_LOCAL` squats on 6 (sharing `UNKNOWN`'s value), and `CLOTH_STOLEN_LOCAL`
squats on 7. There is no free contiguous slot for three commodities without renumbering
`UNKNOWN`/`GOLD_LOCAL`/`CLOTH_STOLEN_LOCAL` and `MAXPLUSONE`, and those values are mirrored in
the wire protocol (next section). Note: the C&K "cloth" commodity is **unrelated** to the
existing `SC_CLVI` cloth, which is tracked outside the resource set entirely
(`SOCPlayer.getCloth()`); reusing `CLOTH_STOLEN_LOCAL` would be a trap.

### 5.2 Blast radius (verified)

- **`SOCResourceSet` array layout.** The set is backed by
  `int[] resources = new int[SOCResourceConstants.MAXPLUSONE]` (`SOCResourceSet.java` lines
  67, 83), indexed by the resource constants, with `UNKNOWN` at index 6. `getAmounts(boolean)`
  builds a 5- or 6-element array keyed off `WOOD`/`UNKNOWN` (lines 184-197), and the whole
  class is documented as a 5-resources-plus-unknown layout. Growing it is a layout change, not
  a loop tweak.
- **Wire encodings.** `SOCPlayerElement.PEType` hard-codes `CLAY(1)..WOOD(5)` and
  `UNKNOWN_RESOURCE(6)` with a comment that these match `SOCResourceConstants`
  (`SOCPlayerElement.java` lines 130-152). `SOCDiceResultResources` and `SOCResourceCount`
  encode resource counts in this same compact, position-dependent format. Adding commodities
  means new element types and a new dice-result encoding that older clients can't parse.
- **Bank / port / trade logic.** Bank, port, and player-trade validation all reason over the
  five-resource set; 4:1 / 3:1 / 2:1 trades and the 2:1 commodity ports of C&K need new
  handling.
- **Client resource UI.** The hand panel resource squares and trade UI render exactly five
  resource types; commodities need new squares and a distinct visual treatment.
- **Hard-coded 5-resource loops in `soc.robot`.** Enumerated in
  [section 4](#4-bot-impact-summary): `DiscardStrategy` and `SOCRobotNegotiator` iterate
  `CLAY..WOOD` literally in at least a dozen places.

Realistically this touches **50+ classes**, both sides of a version-negotiated wire protocol,
plus a robot retune, plus `SavedGameModel` support (most scenarios can't even be saved yet).

### 5.3 Migration plan

1. **Introduce a `ResourceSet` abstraction first.** Before adding any commodity, refactor
   resource access behind an interface so callers stop assuming a fixed five-element layout.
   This is a no-behavior-change refactor that can land before Phase 2.
2. **Extend the abstraction to carry commodities** as a separate, optional dimension rather
   than renumbering `SOCResourceConstants` in place where avoidable; isolate the commodity
   indices so base-game code paths are unchanged when commodities are absent.
3. **Gate the new wire encoding behind a `SOCFeatureSet` flag and version negotiation.**
   `SOCFeatureSet` already carries capability flags like `CLIENT_SEA_BOARD` ("sb"),
   `CLIENT_6_PLAYERS` ("6pl"), and `CLIENT_SCENARIO_VERSION` ("sc"); a new client feature
   (e.g. a `CLIENT_CK_COMMODITIES` flag) lets the server send the extended encoding only to
   clients that understand it, and refuse C&K-commodity games to clients that don't —
   mirroring how `SC` sets `CLIENT_SCENARIO_VERSION` (`SOCGameOptionSet.java` line 541).
4. **Version-gate the new messages and update bot loops** as part of the same release, since
   the server and built-in bots ship together.

This sequencing keeps every step reviewable and keeps the base game bit-for-bit compatible
until the commodity encoding is explicitly negotiated.


## 6. Game option & scenario surface

The next wave registers reserved option keys and a disabled scenario stub. Nothing here is
active in normal play.

### 6.1 Reserved `_CK_*` options

Register these in `SOCGameOptionSet.getAllKnownOptions()` alongside the existing inactive
options (`K_PLAY_FO`, `K_PLAY_VPO` at `SOCGameOptionSet.java` lines 595-600 are the template),
each with `SOCGameOption.FLAG_INACTIVE_HIDDEN | FLAG_DROP_IF_UNUSED`:

| Key            | Meaning                                                   |
|----------------|----------------------------------------------------------|
| `_CK_KNI`  | Knights mechanic (city-linked knight state)              |
| `_CK_IMP`   | City improvements (Trade / Politics / Science tracks)    |
| `_CK_PROG` | Progress-card decks instead of standard dev cards        |
| `_CK_BARB`| Barbarian attack state machine                           |
| `_CK_METR`| Metropolis VP awards to track leaders                   |

**Flag rationale:**

- `FLAG_INACTIVE_HIDDEN` keeps each option out of the New Game UI and out of normal option
  negotiation until an operator activates it at startup via
  `jsettlers.gameopts.activate=...` (`SOCServer.PROP_JSETTLERS_GAMEOPTS_ACTIVATE`). This is
  exactly how `_PLAY_FO` / `_PLAY_VPO` stay hidden today. It lets the namespace be claimed and
  the prototypes be tested without exposing unfinished rules to players.
- `FLAG_DROP_IF_UNUSED` matches every other scenario option (`K_SC_*` all set it): the option
  is omitted from game-option lists when not set, avoiding clutter and keeping older-client
  negotiation clean.

**`minVersion` rationale.** Use `minVersion = 2000`, matching all existing `_SC_*` scenario
options (`SOCGameOptionSet.java` lines 553-579), because that is the first version that
understands sea-board scenarios and the `SC` option / `SOCScenarioInfo` negotiation that
delivers scenario names and descriptions. The `lastModVersion` is the version that introduces
the key (this release). Because these are inactive-hidden, older clients never see them; the
2000 floor is the conservative, convention-matching choice and leaves room to raise it later if
a `_CK_*` mechanic ends up requiring a genuinely new message type (in which case that specific
option's `minVersion` would be the version that adds the message).

Naming follows the project conventions documented in `getAllKnownOptions`: a leading `_`
marks server-set/internal options hidden from the New Game UI; the `_CK_` cluster groups the
Cities & Knights rules just as `_SC_` groups scenario rules. (The main scenario flag itself,
`_SC_CK`, follows the `_SC_` convention; see below.)

### 6.2 `K_SC_CK` scenario stub

Add a disabled scenario stub `K_SC_CK = "SC_CK"` to `SOCScenario.initAllScenarios()`
(the existing `K_SC_WOND` / `K_SC_PIRI` entries around `SOCScenario.java` lines 226-251 are
the template), and the matching main option key `K_SC_CK = "_SC_CK"` in `SOCGameOptionSet`.

- The scenario's option string ties together the `_CK_*` rules plus `SBL=t` and `VP=t13`,
  e.g. `"_SC_CK=t,_CK_IMP=t,_CK_KNI=t,_CK_PROG=t,_CK_BARB=t,_CK_METR=t,SBL=t,VP=t13"`.
  (The exact base-board choice — classic vs. sea board — is a Phase 1 decision; C&K is
  traditionally played on the base board, but JSettlers scenarios are sea-board based, so the
  stub may start on `SBL`.)
- The scenario is **disabled/stubbed**: because its constituent `_CK_*` options are
  `FLAG_INACTIVE_HIDDEN`, the scenario cannot be selected in a normal server. It exists to
  reserve the `SC_CK` key and to anchor documentation and tests.
- `minVersion = 2000`, same rationale as the options above, so the existing `SOCScenarioInfo`
  negotiation would deliver its name/description to 2.0+ clients once enabled.


## 7. Cross-references

- Reserved option / scenario registration patterns: `SOCGameOptionSet.getAllKnownOptions()`,
  `SOCScenario.initAllScenarios()`.
- Improvements: `SOCSpecialItem.makeKnownItem()` and the `SC_WOND` static data.
- Progress cards: `SOCInventoryItem` ("When adding a new kind of inventory item" checklist)
  and the `SC_FTRI` usage.
- Barbarian: `SOCGame.rollDice()` `SC_PIRI` block and `SOCGame.RollResult` `sc_piri_*` fields.
- Metropolis / VP: `SOCGame.checkForWinner()`, `vp_winner`, and the `VP` option.
- Proposed network messages: the PROPOSED section of
  [Message-Sequences-for-Game-Actions.md](Message-Sequences-for-Game-Actions.md).

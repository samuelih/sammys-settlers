# Ported SOCMessage protocol reference

This file tracks the `soc.message.SOCMessage` subclasses ported to the TypeScript
protocol core (`web/src/protocol/`). It is the human-readable companion to the
code; keep it updated as more messages are ported. See `MIGRATION_SPEC.md`
section 2 for the overall wire-format rules.

## Wire-format tokens (from `SOCMessage.java`)

| Token      | Value          | TS constant (`constants.ts`) |
|------------|----------------|------------------------------|
| `SEP`      | `\|` (0x7C)    | `SEP`                        |
| `SEP2`     | `,` (0x2C)     | `SEP2`                       |
| `EMPTYSTR` | TAB (0x09)     | `EMPTYSTR`                   |
| `GAME_NONE`| ^V/SYN (0x16)  | `GAME_NONE`                  |

A command is `<typeId><SEP><field1><SEP2><field2>...`. Multi-messages
(`SOCMessageMulti`) use `SEP` between every field group instead of `SEP2`.
Each WebSocket text frame carries exactly one `toCmd()` string (no `writeUTF`
length-prefix framing — that is TCP-only). `decode(raw)` reads the integer type
id up to the first `SEP` and dispatches to the registered parser, returning
`null` for unknown/garbled input (matching Java `SOCMessage.toMsg`).

## Ported messages (connect + game-list phase)

Direction: **S→C** server-to-client, **C→S** client-to-server, **both** either way.
Example wire strings are verified byte-for-byte against the real Java classes
(`<TAB>` = the `EMPTYSTR` tab character).

| typeId | Message | Dir | Wire format | Example | Java source |
|--------|---------|-----|-------------|---------|-------------|
| 9998 | `SOCVersion` | both | `9998` SEP `vernum` SEP2 `verstr` SEP2 `build` SEP2 `feats` [SEP2 `cliLocale`] | `9998\|2700,2.7.00,<TAB>,<TAB>,en_US` | `SOCVersion.java` |
| 9999 | `SOCServerPing` | both | `9999` SEP `sleepTime` | `9999\|50` | `SOCServerPing.java` |
| 1059 | `SOCRejectConnection` | S→C | `1059` SEP `text` | `1059\|Too many clients` | `SOCRejectConnection.java` |
| 1069 | `SOCStatusMessage` | S→C | `1069` SEP [`svalue` SEP2] `status` | `1069\|4,Name in use` / `1069\|Welcome` | `SOCStatusMessage.java` |
| 1003 | `SOCChannels` | S→C | `1003` SEP `chan1` SEP2 `chan2` … | `1003\|general,lobby` / `1003\|` (empty) | `SOCChannels.java` |
| 1019 | `SOCGames` | S→C | `1019` SEP `game1` SEP2 `game2` … | `1019\|g1,g2` / `1019\|` (empty) | `SOCGames.java` |
| 1083 | `SOCGamesWithOptions` | S→C | `1083` SEP `game1` SEP `opts1` SEP `game2` SEP `opts2` … | `1083\|game1\|BC=t4\|game2\|-` / `1083` (empty) | `SOCGamesWithOptions.java` (multi) |
| 1016 | `SOCNewGame` | S→C | `1016` SEP `game` | `1016\|MyGame` | `SOCNewGame.java` |
| 1079 | `SOCNewGameWithOptions` | S→C | `1079` SEP `game` SEP2 `minVers` SEP2 `opts` | `1079\|mygame,2700,-` | `SOCNewGameWithOptions.java` |
| 1015 | `SOCDeleteGame` | S→C | `1015` SEP `game` | `1015\|MyGame` | `SOCDeleteGame.java` |

## Ported messages (lobby + game-setup phase — Phase 2)

All wire strings below are verified **byte-for-byte** against the real Java
classes (captured via small JVM harnesses) and additionally cross-checked
against the **live server on WS 8888**: every TS-produced string parses in the
Java decoder, and every server frame decodes (and re-encodes byte-identically
for the multi-messages). `<TAB>` = `EMPTYSTR`.

| typeId | Message | Dir | Wire format | Example | Java source |
|--------|---------|-----|-------------|---------|-------------|
| 1011 | `SOCLeaveGame` | both | `1011` SEP `nick` SEP2 `host` SEP2 `game` | `1011\|bob,-,mygame` | `SOCLeaveGame.java` |
| 1012 | `SOCSitDown` | both | `1012` SEP `game` SEP2 `nick` SEP2 `pn` SEP2 `robot` | `1012\|mygame,bob,2,true` | `SOCSitDown.java` |
| 1013 | `SOCJoinGame` | both | `1013` SEP `nick` SEP2 `pw` SEP2 `host` SEP2 `game` | `1013\|myname,<TAB>,<TAB>,mygame` | `SOCJoinGame.java` |
| 1017 | `SOCGameMembers` | S→C | `1017` SEP `game` SEP2 `m1` SEP2 `m2` … | `1017\|ga,player0,droid 1,debug` | `SOCGameMembers.java` |
| 1018 | `SOCStartGame` | both | `1018` SEP `game` [SEP2 `gameState`] | `1018\|mygame` / `1018\|mygame,5` | `SOCStartGame.java` |
| 1025 | `SOCGameState` | S→C | `1025` SEP `game` SEP2 `state` | `1025\|mygame,5` | `SOCGameState.java` |
| 1021 | `SOCJoinGameAuth` | S→C | `1021` SEP `game` [SEP2 `h` SEP2 `w` [SEP2 `S` SEP2 `vs…`]] | `1021\|mygame` / `1021\|ga,20,21,S,-2,1,3,0` | `SOCJoinGameAuth.java` |
| 1068 | `SOCSetSeatLock` | both | single: `1068` SEP `game` SEP2 `pn` SEP2 `state`; all: `1068` SEP `game` SEP2 `state`×(4\|6) | `1068\|g,2,true` / `1068\|g,false,true,clear,false` | `SOCSetSeatLock.java` |
| 1078 | `SOCNewGameWithOptionsRequest` | C→S | `1078` SEP `nick` SEP2 `pw` SEP2 `host` SEP2 `game` SEP2 `optsStr` | `1078\|myname,<TAB>,<TAB>,mygame,BC=t4,PL=4` | `SOCNewGameWithOptionsRequest.java` |
| 1080 | `SOCGameOptionGetDefaults` | both | `1080` [SEP `opts`] | `1080` / `1080\|PL=4,BC=t4` | `SOCGameOptionGetDefaults.java` |
| 1081 | `SOCGameOptionGetInfos` | C→S | `1081` SEP `key1` SEP2 `key2` … (`-`, `?I18N`, `?CHANGES` markers) | `1081\|-` / `1081\|PL,BC,?I18N` | `SOCGameOptionGetInfos.java` |
| 1082 | `SOCGameOptionInfo` | S→C | **multi** `1082` SEP `key` SEP `type` SEP `minV` SEP `lastMod` SEP `defB` SEP `defI` SEP `minI` SEP `maxI` SEP `curB` SEP `curI/str` SEP `flags` SEP `desc` [SEP `enum…`] | `1082\|PL\|2\|-1\|1108\|f\|4\|2\|6\|f\|4\|0\|Maximum # players` | `SOCGameOptionInfo.java` (multi) |
| 1101 | `SOCScenarioInfo` | both | **multi**; server: `1101` SEP `key` SEP `minV` SEP `lastMod` SEP `opts` SEP `title` [SEP `longDesc`]; client: `1101` SEP `[` SEP `key…` [SEP `?`] | `1101\|SC_NSHO\|2000\|2000\|_SC_SEAC=t,SBL=t,VP=t13\|New Shores` / `1101\|[\|SC_NSHO` / `1101\|?` / `1101\|-` | `SOCScenarioInfo.java` (multi) |

### Game-option model (`gameOptions.ts`)

`GameOptionDescriptor` / `GameOptType` are the shared UI ↔ protocol type. Helper
functions: `descriptorFromInfo(SOCGameOptionInfo)` builds a descriptor;
`serializeOptions(descriptors, hideEmptyStringOpts?, sortByKey?)` packs the
`KEY=value,…` string for `SOCNewGameWithOptionsRequest`; `parseOptions(str,
byKey)` unpacks it; `packValue`, `optTypeName`/`optTypeCode` are low-level
helpers. Verified against `SOCGameOption.packOptionsToString`:

| Input (chosen) | `serializeOptions(...)` | Notes |
|----------------|-------------------------|-------|
| PL=4, VP(t,13), BC(t,4), N7(f,7), PLB=t, SC="SC_NSHO" | `PL=4,VP=t13,BC=t4,N7=f7,PLB=t,SC=SC_NSHO` | insertion order |
| same, `sortByKey=true` | `BC=t4,N7=f7,PL=4,PLB=t,SC=SC_NSHO,VP=t13` | by key |
| SC="" , PL=6, `hideEmptyStringOpts=true` | `PL=6` | empty STR omitted |
| SC="" , PL=6, `hideEmptyStringOpts=false` | `PL=6,SC=` | empty STR kept |
| (none) | `-` | empty set |

## Status values (`SOCStatusMessage` `SV_*`)

Exposed as `StatusValue` in `constants.ts`. Full list: `SV_OK` (0),
`SV_NOT_OK_GENERIC` (1), `SV_NAME_NOT_FOUND` (2), `SV_PW_WRONG` (3),
`SV_NAME_IN_USE` (4), `SV_CANT_JOIN_GAME_VERSION` (5), `SV_PROBLEM_WITH_DB` (6),
`SV_ACCT_CREATED_OK` (7), `SV_ACCT_NOT_CREATED_ERR` (8),
`SV_NEWGAME_OPTION_UNKNOWN` (9), `SV_NEWGAME_OPTION_VALUE_TOONEW` (10),
`SV_NEWGAME_ALREADY_EXISTS` (11), `SV_NEWGAME_NAME_REJECTED` (12),
`SV_NAME_TOO_LONG` (13), `SV_NEWGAME_TOO_MANY_CREATED` (14),
`SV_NEWCHANNEL_TOO_MANY_CREATED` (15), `SV_PW_REQUIRED` (16),
`SV_ACCT_NOT_CREATED_DENIED` (17), `SV_ACCT_CREATED_OK_FIRST_ONE` (18),
`SV_NAME_NOT_ALLOWED` (19), `SV_OK_SET_NICKNAME` (20), `SV_OK_DEBUG_MODE_ON` (21),
`SV_GAME_CLIENT_FEATURES_NEEDED` (22), `SV_SERVER_SHUTDOWN` (23),
`SV_MUST_AUTH_FIRST` (24), `SV_GAME_STARTING_OPPORTUNISTIC_OPTS_REMOVED` (25),
`SV_GAME_STARTED_CANNOT_SIT_CLIENT_VERSION` (26).

## Format subtleties to preserve (verified against Java)

1. **`SOCVersion` optional fields.** `build` and `feats` are emitted as
   `EMPTYSTR` (TAB) when null; `cliLocale` is **omitted entirely** (no trailing
   SEP2) when null. On parse, empty/EMPTYSTR tokens become `null`. Parsing uses
   `StringTokenizer(s, SEP2)`, which **skips empty tokens** — the port replicates
   this by filtering empty split segments. Constructing with `build == null` and
   `feats != null` throws (Java parity).

2. **`SOCStatusMessage` optional value.** The `svalue` is only written when
   `> 0`. On parse, only the substring before the **first** `SEP2` is treated as
   the value, and only if it is a clean integer (negative clamps to 0); a
   non-numeric prefix keeps the whole string as `status` with `svalue = 0`. Data
   starting with `SEP2` is garbled → `null`. The status text may contain `SEP2`
   chars when `svalue > 0`, and they are preserved.

3. **Empty game/channel lists.** `SOCChannels`/`SOCGames` with no entries emit a
   trailing `SEP` (`1003|`, `1019|`); the empty data portion parses to an empty
   list (StringTokenizer skips it). `SOCGamesWithOptions` with no games emits
   **just the type id** `1083` (no `SEP` at all); `decode` handles the
   no-`SEP` case.

4. **`SOCGamesWithOptions` is a multi-message.** Fields are separated by `SEP`,
   in `(gameName, optsStr)` pairs; an options-less / unjoinable game has `-` as
   its `optsStr`. Blank params are sent as `EMPTYSTR` and restored to `""` on
   parse (`parseData_FindEmptyStrs`). An odd number of params is garbled →
   `null`.

5. **`SOCNewGameWithOptions` leading-comma quirk.** Java's parser reads `game`
   and `minVers` with `SEP2`, then takes the rest with `st.nextToken(SEP)`. Because
   the `SEP2` boundary after `minVers` is consumed but the token value begins at
   it, the parsed options string **keeps a leading `,`** (e.g. the wire `-`
   parses to `,-`; `BC=t4,N7=f7` parses to `,BC=t4,N7=f7`). The bare-`"-"` → null
   mapping therefore (almost) never fires on the wire. As a consequence Java's
   own `decode(encode(...))` is **not** a byte identity: it accumulates one
   leading comma per round-trip. The TS port reproduces this exactly rather than
   normalizing, so its output matches the Java server/client byte-for-byte. See
   `messages/SOCNewGameWithOptions.ts` header and the dedicated test.

6. **`SOCNewGameWithOptionsRequest` has the SAME leading-comma quirk.** Parsing
   reads `nickname,password,host,game` with `SEP2`, then `optsStr =
   st.nextToken(SEP)`, so the decoded `optsStr` keeps a leading `,` (the wire
   `BC=t4,PL=4` → `,BC=t4,PL=4`; `-` → `,-`). Outgoing requests built from the
   UI use a clean `optsStr` (no leading comma); both directions are reproduced
   byte-for-byte. Empty password is emitted as `EMPTYSTR` and normalized to `""`
   on parse. Verified against the live Java decoder.

7. **`SeatLockState` wire encoding (NOT the enum ordinal).** The Java enum
   ordinals are `UNLOCKED=0, LOCKED=1, CLEAR_ON_RESET=2`, but `SOCSetSeatLock`
   sends back-compat strings: **LOCKED → `"true"`, UNLOCKED → `"false"`,
   CLEAR_ON_RESET → `"clear"`**. Two wire forms: single-seat `game,pn,state`
   vs all-seats `game,state×(4|6)`. The parser distinguishes them by whether the
   token after `game` starts with a digit (→ player number → single-seat).
   All-seats count must be exactly 4 or 6. An unrecognized state string or wrong
   count is garbled → `null`.

8. **`SOCSitDown` boolean rendering.** `robotFlag` is emitted via Java's
   `Boolean.toString` → lowercase `"true"`/`"false"`. On parse Java uses
   `Boolean.valueOf(token)`, which is `true` **only** for the case-insensitive
   string `"true"`; anything else (`"false"`, `"yes"`, `""`) is `false`.

9. **`SOCGameOption` OTYPE_* numbering (corrected).** The real wire values from
   `SOCGameOption.java` are **`UNKNOWN=0, BOOL=1, INT=2, INTBOOL=3, ENUM=4,
   ENUMBOOL=5, STR=6, STRHIDE=7`** (see `constants.ts` `OptionType`). An earlier
   migration note listed an incorrect numbering (BOOL=0…); the protocol code
   uses the real values, which travel in field [1] of `SOCGameOptionInfo`.

10. **`SOCGameOptionInfo` is a multi-message with a legacy flags-field form.**
    Field [10] (`optFlags`) is an **integer** for v2.0.00+ clients, but the
    server's end-of-list marker `OPTINFO_NO_MORE_OPTS` is built with `cliVers=0`
    so it sends the legacy `'t'`/`'f'` form (`'t'` = FLAG_DROP_IF_UNUSED, `'f'`
    /`""` = 0). The port stores `optFlags` (numeric) **and** `flagsWireForm` (the
    exact token) so re-encoding is byte-faithful. For STR/STRHIDE, field [9] is
    the string value (`""`/EMPTYSTR stored as `null`); for ENUM/ENUMBOOL, field
    [7] (`maxIntValue`) is the choice count and fields [12+] are the choices.
    Confirmed against the **live server**: all 32 captured `1082` frames decode
    and re-encode byte-identically.

11. **`SOCGameOptionInfo` value packing** (`packValue` / `serializeOptions`):
    `BOOL → t/f`, `INT,ENUM → int`, `INTBOOL,ENUMBOOL → t/f + int` (e.g. `t4`,
    `f7`), `STR,STRHIDE → string`, `UNKNOWN → ?`. Pairs are `KEY=value` joined by
    `SEP2`; an empty set packs to `-`. `parseOptions` tolerates leading/doubled
    commas (the StringTokenizer artifact) and accepts `t/T/y/Y` (true) and
    `f/F/n/N` (false) for the boolean char, matching `parseOptionNameValue`.

12. **`SOCScenarioInfo` direction marker.** `pa[0]` of `"["` (`MARKER_SCEN_NAME_LIST`)
    or `"?"` (`MARKER_ANY_CHANGED`) means the message is a **client request**;
    otherwise it's a **server reply**. Server full reply is
    `key,minVers,lastMod,opts,title[,longDesc]`; `lastMod == -2`
    (`MARKER_KEY_UNKNOWN`) means the key is unknown; a single `"-"` is the
    end-of-list marker. Client request is optional `"["` + keynames + optional
    trailing `"?"`. All forms verified against the live Java decoder.

13. **`SOCGameOptionGetInfos` token handling.** `"-"` (any new/changed),
    `"?I18N"` (localized descs), and `"?CHANGES"` (any-changed alongside specific
    keys) are control tokens, not option keys: on parse they're pulled into
    boolean flags and removed from `optionKeys`. So `1081|PL,?CHANGES` decodes to
    keys `[PL]` + `hasTokenGetAnyChanges`, and re-encodes to `1081|PL` (NOT
    byte-identical — the marker is now a flag). `"-"` mixed with specific keys is
    garbled → `null`. `hasOnlyTokenI18n` sends bare `?I18N` (no `-`).

14. **`SOCJoinGameAuth` optional fields.** Plain form is just `game`. For
    `SOCBoardLarge` games the server adds `,height,width`, optionally followed by
    `,S,vs0,vs1,…` (the `"S"`-marked Visual-Shift array, length ≥ 2). An
    unrecognized marker where `"S"` is expected, or a `vs` array shorter than 2,
    is garbled → `null`.

## Ported messages (in-game core loop — Phase 3)

All wire strings below are **verified against the live Java server on WS 8888**:
in a sea-board practice game every captured frame of these types decoded and
re-encoded **byte-identically** through the TS codec (`1009`, `1024`, `1025`,
`1026`, `1028`, `1057`, `1084`, `1086`, `1096`). `<C1>` = `(char)1`, `<C0>` =
`(char)0` (special separators).

| typeId | Message | Dir | Wire format | Example | Java source |
|--------|---------|-----|-------------|---------|-------------|
| 1009 | `SOCPutPiece` | both | `1009` SEP `game` SEP2 `pn` SEP2 `pieceType` SEP2 `coord` | `1009\|ga,3,1,1543` | `SOCPutPiece.java` |
| 1010 | `SOCGameTextMsg` | both | `1010` SEP `game` `<C0>` `nick` `<C0>` `text` | `1010\|ga<C0>debug<C0>hi` | `SOCGameTextMsg.java` |
| 1024 | `SOCPlayerElement` | S→C | `1024` SEP `game` SEP2 `pn` SEP2 `action` SEP2 `elemType` SEP2 `amount` [SEP2 `Y`] | `1024\|ga,-1,100,19,0` | `SOCPlayerElement.java` |
| 1026 | `SOCTurn` | S→C | `1026` SEP `game` SEP2 `pn` [SEP2 `gameState`] | `1026\|ga,3,5` | `SOCTurn.java` |
| 1028 | `SOCDiceResult` | S→C | `1028` SEP `game` SEP2 `result` | `1028\|ga,8` / `1028\|ga,-1` | `SOCDiceResult.java` |
| 1031 | `SOCRollDice` | C→S | `1031` SEP `game` | `1031\|ga` | `SOCRollDice.java` |
| 1032 | `SOCEndTurn` | C→S | `1032` SEP `game` | `1032\|ga` | `SOCEndTurn.java` |
| 1043 | `SOCBuildRequest` | C→S | `1043` SEP `game` SEP2 `pieceType` (−1 = Special Building) | `1043\|ga,0` | `SOCBuildRequest.java` |
| 1044 | `SOCCancelBuildRequest` | both | `1044` SEP `game` SEP2 `pieceType` (−2 CARD, −3 inv-item) | `1044\|ga,-2` | `SOCCancelBuildRequest.java` |
| 1054 | `SOCFirstPlayer` | S→C | `1054` SEP `game` SEP2 `pn` | `1054\|ga,2` | `SOCFirstPlayer.java` |
| 1055 | `SOCSetTurn` | S→C | `1055` SEP `game` SEP2 `pn` | `1055\|ga,1` | `SOCSetTurn.java` |
| 1057 | `SOCPotentialSettlements` | S→C | `1057` SEP `game` SEP2 `pn` { SEP2 `psNode` }* [ SEP2 `NA` SEP2 `n` SEP2 `PAN` SEP2 `pan` { SEP2 `LA#` … }* { SEP2 `SE` … }* ] | `1057\|ga,-1,NA,4,PAN,1,LA1,2050,…` | `SOCPotentialSettlements.java` |
| 1063 | `SOCResourceCount` | S→C | `1063` SEP `game` SEP2 `pn` SEP2 `count` | `1063\|ga,2,7` | `SOCResourceCount.java` |
| 1066 | `SOCLongestRoad` | S→C | `1066` SEP `game` SEP2 `pn` (−1 = none) | `1066\|ga,-1` | `SOCLongestRoad.java` |
| 1067 | `SOCLargestArmy` | S→C | `1067` SEP `game` SEP2 `pn` (−1 = none) | `1067\|ga,0` | `SOCLargestArmy.java` |
| 1084 | `SOCBoardLayout2` | S→C | `1084` SEP `game` SEP2 `bef` { SEP2 `key` SEP2 `value` }* where value is an int or `[`len {SEP2 int}* | `1084\|ga,3,RH,2823,LH,[99,…,PL,[39,…,VS,[4,…` | `SOCBoardLayout2.java` |
| 1086 | `SOCPlayerElements` | S→C | **multi** `1086` SEP `game` SEP `pn` SEP `action` SEP `et0` SEP `amt0` … | `1086\|ga\|0\|100\|1\|0\|2\|0…` | `SOCPlayerElements.java` (multi) |
| 1091 | `SOCGameServerText` | S→C | `1091` SEP `game` `<C1>` `text` | `1091\|ga<C1>It is your turn.` | `SOCGameServerText.java` |
| 1092 | `SOCDiceResultResources` | S→C | **multi** `1092` SEP `game` SEP `n` SEP `pn` SEP `total` SEP (`amt` SEP `type`)+ SEP `0` … | `1092\|ga\|2\|0\|5\|3\|3\|0\|2\|7\|1\|1\|2\|5` | `SOCDiceResultResources.java` (multi) |
| 1093 | `SOCMovePiece` | both | `1093` SEP `game` SEP2 `pn` SEP2 `ptype` SEP2 `fromCoord` SEP2 `toCoord` | `1093\|ga,2,3,2051,2309` | `SOCMovePiece.java` |
| 1096 | `SOCGameElements` | S→C | **multi** `1096` SEP `game` SEP `et0` SEP `val0` SEP `et1` SEP `val1` … | `1096\|ga\|4\|-1` | `SOCGameElements.java` (multi) |

### Board model (`board/boardModel.ts`)

`boardFromLayout2(SOCBoardLayout2, {width?, height?})` → `BoardModel`. It decodes
the v3 (`SOCBoardLarge`) parts: **LH** into `BoardHex[]` (3 ints per hex:
coord 0xRRCC, hexType, diceNum — water/desert are **not** remapped for LH),
**PL** into `BoardPort[]` (the array is THREE blocks — `[types(P) | edges(P) |
facings(P)]`, not interleaved; ports with edge < 0 are skipped), **RH**→
`robberHex`, **PH**→`pirateHex`. Width/height come from the optional dims
(from `SOCJoinGameAuth`); otherwise the standard large-board size `0x10`,
expanded to contain every seen coordinate. `parsePotentialSettlements(msg)`
returns `{ playerNumber, potentialNodes, startingLandArea, landAreasLegalNodes,
legalNodes }`, where `legalNodes` is the de-duplicated union of all land areas
(sea board) or the player's `psNodes`.

### In-game element enums (`constants.ts`)

`GameState` (full set, NEW=0 … OVER=1000), `Resource` (CLAY=1…UNKNOWN=6),
`PlayerElementAction` (SET=100, GAIN=101, LOSE=102), `PlayerElementType`
(CLAY=1…WOOD=5, UNKNOWN_RESOURCE=6, ROADS=10, SETTLEMENTS=11, CITIES=12,
SHIPS=13, NUMKNIGHTS=15, RESOURCE_COUNT=17, PLAYED_DEV_CARD_FLAG=19,
NUM_PICK_GOLD_HEX_RESOURCES=101, SCENARIO_SVP=102, …), and `GameElementType`
(ROUND_COUNT=1, DEV_CARD_COUNT=2, FIRST_PLAYER=3, CURRENT_PLAYER=4,
LARGEST_ARMY_PLAYER=5, LONGEST_ROAD_PLAYER=6, …). All values verified against
the Java enums.

## Phase-3 format subtleties to preserve (verified against Java)

15. **`SOCBoardLayout2` parts are base-10 on the wire**, in a stable key order.
    `toCmd` uses `Integer.toString` for scalar parts and `[<len>,v0,v1,…` for
    array parts. The hexadecimal seen in `toString()`/logs is display-only.
    Array parts whose declared `[<len>` exceeds the remaining tokens are garbled
    → `null`. The web port preserves the parts list in insertion order so a
    captured `1084` re-encodes byte-for-byte (verified live).

16. **`LH` does NOT remap water/desert** (only the legacy `HL` part did, in the
    Java constructor). LH hexType uses the v3 numbering directly (WATER=6,
    DESERT=0, GOLD=7, FOG=8), so the board model passes hexType through unchanged.

17. **`PL` (large board) stores ports in three blocks, not interleaved.** For
    `P` ports the array is `[type0..typeP-1, edge0..edgeP-1, facing0..facingP-1]`
    (length 3·P). Reconstructing each port reads index `i`, `i+P`, `i+2P`. A
    port with `edge < 0` is a movable port not currently placed and is skipped.
    Facings are `SOCBoard.FACING_*` (NE=1, E=2, SE=3, SW=4, W=5, NW=6) — note
    the pre-existing `web/src/board/types.ts` had these reversed; corrected to
    match the Java source (the wire uses the Java values).

18. **`SOCPlayerElement` news flag rides a trailing `Y`.** On the wire the action
    is always SET/GAIN/LOSE (100/101/102); the Java `*_NEWS` pseudo-actions
    (−100…) are internal and never serialized. `isNews` is carried by an optional
    6th token `Y`. Parsing accepts 5 or 6 SEP2 tokens.

19. **Mi-style multi-messages (`1086`, `1092`, `1096`) use `SEP` between every
    field**, with the game name first and the rest base-10 ints (not SEP2). The
    data portion handed to the parser is `game|p0|p1|…`. `SOCPlayerElements`
    needs ≥1 (type,amount) pair (param count after game even and ≥4);
    `SOCGameElements` needs ≥1 (type,value) pair (even and ≥2). An odd/short
    count is garbled → `null`.

20. **`SOCDiceResultResources` (`1092`) int packing.** `pa[0]` = number of
    gaining players; then per player `pn, newTotal, (amount, resType)+`, with a
    `0` separator before each subsequent player (none after the last). Amounts
    are positive; resTypes are 1..5. A `pa[0]` that disagrees with the number of
    decoded players is garbled → `null`.

21. **`SOCGameServerText` (`1091`) / `SOCGameTextMsg` (`1010`) use special
    separators**, not SEP2: `(char)1` (`GAMESERVERTEXT`) and `(char)0`
    (`GAMETEXTMSG`), chosen so commas in the text need no escaping. The text is
    everything after that single separator; an empty game or text portion is
    garbled → `null`.

22. **`SOCTurn` (`1026`) optional state field.** `gameState` is emitted only when
    `> 0` (the Java constructor clamps values ≤ 0 to 0). So `1026|ga,2` (no
    state) and `1026|ga,3,5` (with state) are both valid; the port reproduces the
    omit-when-0 behavior, making the round-trip byte-faithful.

23. **`SOCBuildRequest` vs `SOCCancelBuildRequest` validation.** `SOCBuildRequest`
    rejects `pieceType < -1` (−1 = Special Building). `SOCCancelBuildRequest`
    accepts the special negatives CARD (−2) and INV_ITEM_PLACE_CANCEL (−3) and
    does **not** validate. `SOCPutPiece`/`SOCMovePiece` reject negative piece
    types / coordinates (the Java constructor throws → parse returns `null`).

## Lobby & game-setup flow (verified against the live server, WS 8888)

The Phase-2 client implements this create→sit→start sequence (captured live;
unrelated board/element frames such as `1057`/`1058`/`1086` omitted):

```
C→S  1078|WebPlayer,<TAB>,<TAB>,<game>,PL=4   SOCNewGameWithOptionsRequest
S→C  1079|<game>,-1,PL=4                       SOCNewGameWithOptions (lobby broadcast; creator gets it)
S→C  1021|<game>                               SOCJoinGameAuth  (server AUTO-JOINS the requester)
S→C  1069|Welcome to Java Settlers of Catan!   SOCStatusMessage (SV_OK; not an error)
S→C  1068|<game>,false,false,false,false       SOCSetSeatLock (all-seats greeting)
     …board layout / player-element frames…
S→C  1017|<game>,WebPlayer                      SOCGameMembers   ("all sent" signal; creator is an OBSERVER, seat -1)

C→S  1012|<game>,WebPlayer,0,false             SOCSitDown (creator must sit explicitly)
S→C  1025|<game>,0                              SOCGameState (NEW)
S→C  1013|WebPlayer,<TAB>,<TAB>,<game>          SOCJoinGame (broadcast: member joined)
S→C  1012|<game>,WebPlayer,0,false             SOCSitDown (authoritative echo → sets mySeat)

C→S  1018|<game>                               SOCStartGame (request; no state)
S→C  1013|droid 1,…  1013|droid 2,…  1013|robot 6,…   bots join the 3 unlocked empty seats
S→C  1012|<game>,droid 2,1,true                SOCSitDown (bot, robotFlag=true)  + 1025|<game>,1 (READY)
S→C  1012|<game>,droid 1,2,true                …
S→C  1012|<game>,robot 6,3,true                …
S→C  1018|<game>,5                             SOCStartGame (state START1A → "game started")
S→C  1026|<game>,0,5                            SOCTurn
```

Surprises worth noting for later phases:
* **The creator is auto-joined as an observer, not seated.** No SITDOWN is sent
  for them; the client must send `SOCSitDown` to take a seat.
* **`SOCGameMembers` is the join-complete signal**, exactly as documented in the
  Java `joinGame()` send order.
* **The "game started" signal is `SOCStartGame` with `state ≥ START1A` (5)**, not
  a bare STARTGAME. The interim `SOCGameState` values during bot seating are
  `READY` (1), which is `< START1A`, so the room view stays put until state 5.
* **Bot `SOCSitDown` carries `robotFlag=true`**; the human's carries `false`.

## New Game option discovery (defaults-first flow) — verified live, WS 8888

The New Game dialog needs the FULL standard option set as fully-typed
descriptors. Getting there requires TWO things, both verified against the live
server:

**1. Advertise client features in the VERSION handshake.** Our `SOCVersion`
reply MUST carry a non-null `build` AND the encoded feature list
`;6pl;sb;sc=2700;` (constants `CLIENT_VERSION_BUILD` / `CLIENT_FEATURES` in
`net/GameConnection.ts`), mirroring the Swing client's `ClientNetwork`
(`6pl` = CLIENT_6_PLAYERS, `sb` = CLIENT_SEA_BOARD, `sc=<vers>` =
CLIENT_SCENARIO_VERSION):

  * If `build` is null while `feats` is non-null, Java `SOCVersion`'s constructor
    **throws** and the server **drops the whole VERSION message** (seen in the
    server log as `IllegalArgumentException: null verBuild, non-null feats`),
    leaving the connection feature-limited. So build must be non-null whenever
    feats is sent.
  * Without the features, the server marks the connection "feature-limited"
    (`SOCClientData.hasLimitedFeats`) and returns `SBL`, `PLB`, `PLP`, and all
    `_SC_*`/`SC` options as `OTYPE_UNKNOWN`, and clamps `PL` max to 4
    (`SOCGameOptionSet.optionsNotSupported` / `optionsTrimmedForSupport`).
  * Declaring `sc` equal to our own version also clears the limited-features flag
    entirely (`SOCServer.setClientVersSendGamesOrReject` lines 7538-7551), so
    even plain options like `NT` come back fully typed.

**2. Use the defaults-first discovery flow** (mirrors the Swing client's
`MessageHandler.handleGAMEOPTIONGETDEFAULTS`), NOT a bare `1081|-`:

```
C→S  1080                                  SOCGameOptionGetDefaults (request)
S→C  1080|BC=t4,NT=f,PLB=f,SBL=f,N7=f7,RD=f,VP=f10,PL=4,…   (all known keys + defaults)
C→S  1081|BC,NT,PLB,SBL,N7,RD,VP,PL,…,?I18N SOCGameOptionGetInfos (EXPLICIT key list)
S→C  1082|PL|2|-1|1108|f|4|2|6|f|4|0|Maximum # players       SOCGameOptionInfo (fully typed)
S→C  1082|VP|3|-1|2000|f|10|10|20|f|10|1|Victory points to win: #
S→C  1082|SBL|1|2000|2000|f|0|0|0|f|0|1|Use sea board
S→C  1082|BC|3|-1|1107|t|4|3|9|t|4|0|Break up clumps of # or more same-type hexes/ports
     …one 1082 per key…
S→C  1082|-|0|…|-                          end-of-list marker
```

The server returns full type/desc/range info ONLY for explicitly-listed keys (or
options newer than the client). A same-version client sending `1081|-`/`?CHANGES`
gets most options as `OTYPE_UNKNOWN` (no type to render). Sending the explicit
key list from the `1080` reply is what makes every option arrive fully typed.

The web client implements this in `store/gameStore.ts`: `requestGameOptions()`
sends `1080`; the `GAMEOPTIONGETDEFAULTS` handler runs `parseDefaultsKeys()` and
sends the explicit `1081`; the `GAMEOPTIONINFO` handler builds descriptors with
`descriptorFromInfo()` and seeds each with its captured default via
`mergeDefaultValue()`. The dialog filters to user-relevant options (hides keys
starting with `_`, hides `unknown`-typed, hides `SC` which is the scenario
picker) and keeps `SBL`, `PL`, `PLB`, `VP`, `BC`, `N7`, `NT`, `RD`, etc. Verified
live: 23 keys in the defaults reply, 24 `1082` frames, **zero** `OTYPE_UNKNOWN`
(test `net/liveDiscovery.test.ts`).

## Ported messages (full in-game interactions — Phase 4)

Every wire string below was captured **byte-for-byte from the real Java classes**
(a small JVM harness that constructs each message and prints `toCmd()`), and each
was additionally fed back through the **Java decoder** (`SOCMessage.toMsg`) and
re-encoded to confirm it parses and round-trips identically (50/50 strings:
`ok=50 mismatch=0 null=0`). The TS round-trip + known-wire-string tests live in
`src/protocol/interaction-messages.test.ts`.

Resource sets inside these messages are the five known amounts CLAY, ORE, SHEEP,
WHEAT, WOOD (resource types 1..5) in that order; **UNKNOWN (type 6) is not
included** in those 5-int blocks (the one exception is `SOCDiscard`, which carries
a sixth UNKNOWN amount). See `messages/resourceSet.ts` (`ResourceSet`,
`giveGetToInts`, `resourceSetFromInts`).

### Trade

| typeId | Message | Dir | Wire format | Example | Java source |
|--------|---------|-----|-------------|---------|-------------|
| 1040 | `SOCBankTrade` | both | `1040` SEP `game` { SEP2 `give`×5 } { SEP2 `get`×5 } [SEP2 `pn`] | `1040\|ga,0,0,3,0,0,1,0,0,0,0` / `…,2` | `SOCBankTrade.java` |
| 1041 | `SOCMakeOffer` | both | `1041` SEP `game` SEP2 `from` { SEP2 `to`(bool) }×maxPl { SEP2 `give`×5 } { SEP2 `get`×5 } | `1041\|ga,3,false,false,true,false,0,1,0,1,0,0,0,1,0,0` | `SOCMakeOffer.java` |
| 1039 | `SOCAcceptOffer` | both | `1039` SEP `game` SEP2 `accepting` SEP2 `offering` [ { SEP2 `toAc`×5 } { SEP2 `toOf`×5 } ] | `1039\|ga,2,3` / `1039\|ga,2,3,0,0,2,0,0,1,0,0,0,4` | `SOCAcceptOffer.java` |
| 1037 | `SOCRejectOffer` | both | `1037` SEP `game` SEP2 `pn` [SEP2 `reasonCode`] | `1037\|ga,1` / `1037\|ga,-1,2` | `SOCRejectOffer.java` |
| 1038 | `SOCClearOffer` | both | `1038` SEP `game` SEP2 `pn` (−1 = all) | `1038\|ga,2` / `1038\|ga,-1` | `SOCClearOffer.java` |
| 1042 | `SOCClearTradeMsg` | S→C | `1042` SEP `game` SEP2 `pn` (−1 = all) | `1042\|ga,3` / `1042\|ga,-1` | `SOCClearTradeMsg.java` |

### Dev cards

| typeId | Message | Dir | Wire format | Example | Java source |
|--------|---------|-----|-------------|---------|-------------|
| 1045 | `SOCBuyDevCardRequest` | C→S | `1045` SEP `game` (the whole data portion is the game name) | `1045\|ga` | `SOCBuyDevCardRequest.java` |
| 1046 | `SOCDevCardAction` | S→C | `1046` SEP `game` SEP2 `pn` SEP2 `action` SEP2 `cardType` [SEP2 `cardType`…] | `1046\|ga,3,0,9` (DRAW knight) / `1046\|ga,2,3,4,5,6` (multi VP) | `SOCDevCardAction.java` |
| 1047 | `SOCDevCardCount` | S→C | `1047` SEP `game` SEP2 `numDevCards` | `1047\|ga,19` | `SOCDevCardCount.java` |
| 1048 | `SOCSetPlayedDevCard` | S→C | `1048` SEP `game` SEP2 `pn` SEP2 `played`(bool) | `1048\|ga,2,true` | `SOCSetPlayedDevCard.java` |
| 1049 | `SOCPlayDevCardRequest` | C→S | `1049` SEP `game` SEP2 `devCardType` | `1049\|ga,9` (knight) | `SOCPlayDevCardRequest.java` |
| 1052 | `SOCPickResources` | both | `1052` SEP `game` { SEP2 `res`×5 } [SEP2 `pn` SEP2 `reasonCode`] | `1052\|ga,1,0,0,1,0` / `…,3,2` | `SOCPickResources.java` |
| 1053 | `SOCPickResourceType` | C→S | `1053` SEP `game` SEP2 `resourceType` | `1053\|ga,3` (Monopoly sheep) | `SOCPickResourceType.java` |

`SOCDevCardConstants` (TS `DevCardType` in `constants.ts`): `UNKNOWN=0`,
`ROADS=1`, `DISC=2`, `MONO=3`, `CAP=4`, `MARKET=5`, `UNIV=6`, `TEMPLE=7`,
`CHAPEL=8`, `KNIGHT=9` (CAP/MARKET/UNIV/TEMPLE/CHAPEL are the VP cards). Dev-card
actions (TS `DevCardAction`): `DRAW=0`, `PLAY=1`, `ADD_NEW=2`, `ADD_OLD=3`,
`CANNOT_PLAY=4`, `REMOVE_NEW=5`, `REMOVE_OLD=6`.

### Robber / discard

| typeId | Message | Dir | Wire format | Example | Java source |
|--------|---------|-----|-------------|---------|-------------|
| 1029 | `SOCDiscardRequest` | S→C | `1029` SEP `game` SEP2 `numDiscards` | `1029\|ga,4` | `SOCDiscardRequest.java` |
| 1033 | `SOCDiscard` | both | `1033` SEP `game` SEP2 [`p`pn SEP2] `clay` SEP2 `ore` SEP2 `sheep` SEP2 `wheat` SEP2 `wood` SEP2 `unknown` | `1033\|ga,2,0,1,0,0,0` / `1033\|ga,p3,2,0,1,0,0,0` | `SOCDiscard.java` |
| 1034 | `SOCMoveRobber` | both | `1034` SEP `game` SEP2 `pn` SEP2 `coord` (positive robber, negative/0 pirate) | `1034\|ga,2,103` / `1034\|ga,2,-260` | `SOCMoveRobber.java` |
| 1035 | `SOCChoosePlayer` | both | `1035` SEP `game` SEP2 `choice` (≥0 victim pn; −1 none, −2 robber, −3 pirate) | `1035\|ga,2` / `1035\|ga,-1` | `SOCChoosePlayer.java` |
| 1036 | `SOCChoosePlayerRequest` | S→C | `1036` SEP `game` [SEP2 `NONE`] { SEP2 `choice`(bool) }×maxPl | `1036\|ga,false,true,false,true` / `1036\|ga,NONE,…` | `SOCChoosePlayerRequest.java` |
| 1102 | `SOCRobberyResult` | S→C | `1102` SEP `game` SEP2 `perp` SEP2 `victim` SEP2 ⟨stolen⟩ SEP2 `T`/`F` [SEP2 `victimAmt` [SEP2 `extra`]] | `1102\|ga,2,3,R,3,1,T` | `SOCRobberyResult.java` |

`SOCRobberyResult`'s ⟨stolen⟩ block is one of: `R` SEP2 resType SEP2 amount
(single resource); `E` SEP2 peTypeValue SEP2 amount (player element, e.g. cloth
= 106); or `S` { SEP2 resType SEP2 amount } (a resource set of only nonzero
types). Examples: `1102|ga,2,3,S,1,1,3,2,T` (set), `1102|ga,1,0,E,106,2,T`
(cloth), `1102|ga,1,2,R,6,5,F,3,7` (totals form with victimAmount + extraValue).

### Misc

| typeId | Message | Dir | Wire format | Example | Java source |
|--------|---------|-----|-------------|---------|-------------|
| 1061 | `SOCGameStats` | both | players: `1061` SEP `game` { SEP2 `score` } { SEP2 `robot`(bool) }; timing: `1061` SEP `game` SEP2 `t`stype { SEP2 `val` } | `1061\|ga,10,4,0,7,false,true,true,false` / `1061\|ga,t2,1700000000,1,0` | `SOCGameStats.java` |
| 1089 | `SOCSimpleRequest` | both | `1089` SEP `game` SEP2 `pn` SEP2 `reqType` SEP2 `value1` SEP2 `value2` (all 4 ints always sent) | `1089\|ga,2,1,2,0` | `SOCSimpleRequest.java` |
| 1090 | `SOCSimpleAction` | S→C | `1090` SEP `game` SEP2 `pn` SEP2 `actType` SEP2 `value1` SEP2 `value2` | `1090\|ga,3,1,18,0` (DEVCARD_BOUGHT) | `SOCSimpleAction.java` |
| 1104 | `SOCDeclinePlayerRequest` | S→C | `1104` SEP `game` SEP2 `gameState` SEP2 `reasonCode` [SEP2 `detail1` SEP2 `detail2` [SEP2 `reasonText`]] | `1104\|ga,20,4,1,1543` / `1104\|ga,0,3,0,0,You can't, comma, here` | `SOCDeclinePlayerRequest.java` |

## Phase-4 format subtleties to preserve (verified against Java)

24. **Resource-set packing is five amounts CLAY..WOOD, UNKNOWN excluded.** Every
    trade/pick message serializes a resource set as exactly the five amounts in
    resource-type order 1..5 (`for (i = CLAY; i <= WOOD; i++)`). UNKNOWN (type 6)
    is never part of those blocks. The lone exception is `SOCDiscard`, which
    appends a **sixth** UNKNOWN amount (used to report the discard *total* to
    other players as `UNKNOWN=total`).

25. **`SOCMakeOffer`'s `to[]` length is implicit.** The boolean recipient array
    has one element per player number (= game.maxPlayers, 4 or 6) but its length
    is **not** sent. The parser computes it as *(tokens after `from`) − 10*,
    because the trailing 10 tokens are always the two 5-int give/get blocks. The
    booleans are Java `Boolean.toString`/`valueOf` (lowercase, and only the exact
    case-insensitive string `"true"` parses as true).

26. **`SOCChoosePlayerRequest` "NONE" marker + strict booleans.** An optional
    leading `NONE` token (before the choice booleans) sets `canChooseNone`. Each
    choice token is true **only when it exactly equals `"true"`** — Java uses
    `tok.equals("true")` here (case-**sensitive**), unlike the `Boolean.valueOf`
    used by `SOCMakeOffer`/`SOCSetPlayedDevCard`/`SOCGameStats`. A lone `NONE`
    with no choices is garbled → null.

27. **`SOCDiscard`'s player-number field is `p<pn>` near the START.** The v2.5+
    player number rides a literal `p3`-style token placed right after the game
    name (not at the end) so older clients drop the whole message instead of
    misreading a trailing field. Parser: if the token after the game name starts
    with `p`, it's the player number; then exactly 6 amounts follow.

28. **Dev-card action numbering vs card-type numbering.** `SOCDevCardAction`'s
    action field (`DRAW=0`, `PLAY=1`, `ADD_NEW=2`, `ADD_OLD=3`, `CANNOT_PLAY=4`,
    `REMOVE_NEW=5`, `REMOVE_OLD=6`) is **distinct** from its card-type field
    (`DevCardType`: `UNKNOWN=0`, `ROADS=1`, …, `KNIGHT=9`). NOTE the v2.0.00
    swap: `KNIGHT` is **9** and `UNKNOWN` is **0** in the version we speak (they
    were 0 and 9 in v1.x). The single-card form has exactly one card-type token;
    a message with **2+** card-type tokens is the multi-card form (`cardTypes`),
    used only at end-of-game to reveal VP cards. >100 card types → null (DoS
    guard). A single-element multi-list constructs the single-card form.

29. **`SOCRobberyResult`'s tail is order-and-zero-sensitive.** `victimAmount` and
    `extraValue` are appended only when `(victimAmount != 0) || (extraValue != 0)`;
    when appended, `victimAmount` always comes first, then `extraValue` is
    appended **only if** `extraValue != 0`. So `…,T,0,4` (victimAmount 0 written
    because extraValue 4 follows) is valid, but a bare `…,T,0` never appears. The
    `T`/`F` boolean and the `R`/`E`/`S` type chars are single characters; anything
    else is garbled → null.

30. **`SOCRejectOffer` / `SOCPickResources` / `SOCDeclinePlayerRequest` optional
    tails.** `SOCRejectOffer` omits `reasonCode` when 0. `SOCPickResources` emits
    `pn` **and** `reasonCode` together, only when either is nonzero (a lone
    trailing `pn` is garbled → null). `SOCDeclinePlayerRequest` emits the
    `detail1,detail2[,reasonText]` tail only when a detail or the text is set;
    `reasonText` is **last and may contain commas** — Java reads "the rest of the
    string" for it (via an unlikely delimiter), strips one leading SEP2, and
    right-trims trailing whitespace (leading whitespace of the text is preserved).

31. **`SOCGameStats` has two shapes told apart by the first post-game token.** A
    leading `t<stype>` token (e.g. `t2`) is the non-`TYPE_PLAYERS` form whose
    remaining tokens are stat values (TYPE_TIMING stores unix seconds). A leading
    **digit** is `TYPE_PLAYERS`: equal numbers of integer scores then boolean
    robot flags, `maxPlayers = floor((tokensAfterGame) / 2)` (a trailing odd
    token is ignored, matching Java). A `t1` (claiming TYPE_PLAYERS via the
    t-form) is rejected → null.

32. **`SOCSimpleRequest` / `SOCSimpleAction` always send all four ints.** They
    extend `SOCMessageTemplate4i`, whose `toCmd` writes `pn, type, value1, value2`
    unconditionally (even when the values are 0). So a "bare" request still ends
    in `,0,0`. Request/action type codes below 1000 are general; 1000+ are
    gametype-specific (see `SimpleRequestType` / `SimpleActionType`).

## Phase-4 store + GameScreen integration

`store/gameStore.ts` now reduces the interaction messages above into per-game
state and exposes matching action senders; `screens/GameScreen.tsx` renders the
UI. Store reducer tests: `store/gameInteractions.test.ts`; UI render tests:
`screens/GameScreenInteractions.test.tsx`.

* **Trade.** `MAKEOFFER`→`offers[from]`, `CLEAROFFER`/`CLEARTRADEMSG`/`ACCEPTOFFER`
  clear offers/responses, `REJECTOFFER`→`offerResponses[pn]='reject'`. Senders:
  `bankTrade(give,get)`, `makeOffer(give,get,toPlayers)`, `acceptOffer(fromPn)`,
  `rejectOffer()`, `clearOffer()`. UI: `data-testid="trade-panel"` with
  `bank-trade-give/ratio/get/submit`, `offer-give/get/propose`, and per-offer
  `offer-<pn>` + `accept-offer-<pn>` / `reject-offer-<pn>`.
* **Dev cards.** The local player's real inventory is built from
  `DEVCARDACTION` (DRAW/ADD_NEW → new bag, ADD_OLD → playable bag, PLAY/REMOVE_*
  → remove; VP cards CAP..CHAPEL → vpCards bag); opponents' `UNKNOWN` cards only
  bump `PlayerView.devCardCount`. `DEVCARDCOUNT` and `SIMPLEACTION(DEVCARD_BOUGHT,
  v1=remaining)` set the deck count. Senders: `buyDevCard()`, `playKnight()`,
  `playRoadBuilding()`, `playMonopoly()`, `playYearOfPlenty()`,
  `pickMonopoly(resType)`, `pickResources(resList)`. UI: `data-testid="devcard-panel"`
  with `buy-devcard` and `play-knight`/`play-roadbuilding`/`play-monopoly`/`play-yop`.
* **Robber/discard.** `MOVEROBBER` (positive→`board.robberHex`, negative→
  `board.pirateHex` as abs), `CHOOSEPLAYERREQUEST`→`robVictims`,
  `DISCARDREQUEST`→`discardRequired`, `ROBBERYRESULT`→game-log line. In
  `PLACING_ROBBER`/`PLACING_PIRATE` the board's `onHexClick` calls
  `moveRobber(hex, pirate?)`. Senders: `moveRobber(hexCoord,pirate?)`,
  `choosePlayer(pn)`, `discard(resList)`. UI dialogs: `monopoly-dialog`,
  `pick-resources-dialog`, `discard-dialog`, `rob-victim-dialog` (+ `rob-victim-<pn>`).
* **Game over.** On the `GAMESTATE`/`TURN` transition to `OVER (1000)` the winner
  is taken from `CURRENT_PLAYER`/`TURN.playerNumber`; `GAMESTATS (TYPE_PLAYERS)`
  fills `finalScores`. UI overlay: `data-testid="game-over"` (+ `game-over-winner`,
  `final-score-<pn>`).
* **Debug.** `sendDebug(text)` sends a `SOCGameTextMsg` whose text is a debug
  chat command (server runs them with `-Djsettlers.allow.debug=Y`).

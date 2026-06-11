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

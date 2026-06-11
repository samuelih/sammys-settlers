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

### Reserved type ids (not yet ported; used in later phases)

| typeId | Constant | Java source |
|--------|----------|-------------|
| 1078 | `NEWGAMEWITHOPTIONSREQUEST` | `SOCNewGameWithOptionsRequest.java` |
| 1013 | `JOINGAME` | `SOCJoinGame.java` |
| 1021 | `JOINGAMEAUTH` | `SOCJoinGameAuth.java` |

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

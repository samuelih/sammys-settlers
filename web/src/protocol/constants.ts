// Protocol constants ported from soc.message.SOCMessage (Java).
//
// These mirror the exact wire-format tokens and message-type IDs used by the
// Java SOCServer so the TypeScript client can interoperate over WebSocket.
// Each WebSocket text frame carries exactly one `toCmd()` string; see
// web/docs/MIGRATION_SPEC.md section 2. Keep these values in sync with
// src/main/java/soc/message/SOCMessage.java.

/**
 * Main separator token SEP, between the type id and the rest of the message.
 * Java: `SOCMessage.sep` ('|', 0x7C). At most one SEP per non-multi message.
 */
export const SEP = '|';

/**
 * Secondary separator token SEP2, between fields after the SEP.
 * Java: `SOCMessage.sep2` (',', 0x2C).
 */
export const SEP2 = ',';

/**
 * Placeholder token for a null/empty optional field, to avoid two adjacent
 * separators. Java: `SOCMessage.EMPTYSTR` (a single TAB, 0x09).
 */
export const EMPTYSTR = '\t';

/**
 * "Not for any game" marker, used where a game-name field is required but the
 * message isn't about any game. Java: `SOCMessage.GAME_NONE` (^V / SYN, 0x16).
 */
export const GAME_NONE = '';

/**
 * Message-type IDs (the integer that precedes the first SEP in a command).
 * Values copied verbatim from `SOCMessage.java`'s constants. Only the subset
 * needed for connect + game list (plus a few reserved for later phases) is
 * defined here; add more as additional messages are ported.
 */
export const MessageType = {
  /** {@link SOCVersion} — cli/serv version handshake. @since 1.1.00 */
  VERSION: 9998,
  /** {@link SOCServerPing} — keep-alive / disconnect notice. */
  SERVERPING: 9999,
  /** {@link SOCRejectConnection} — server refuses this connection. */
  REJECTCONNECTION: 1059,
  /** {@link SOCStatusMessage} — status text + optional status value. */
  STATUSMESSAGE: 1069,
  /** {@link SOCChannels} — list of all chat-channel names. */
  CHANNELS: 1003,
  /** {@link SOCGames} — list of all game names (older clients). */
  GAMES: 1019,
  /** {@link SOCGamesWithOptions} — game names + options (1.1.07+). @since 1.1.07 */
  GAMESWITHOPTIONS: 1083,
  /** {@link SOCNewGame} — a new game was created (no options). */
  NEWGAME: 1016,
  /** {@link SOCNewGameWithOptions} — a new game was created, with options. @since 1.1.07 */
  NEWGAMEWITHOPTIONS: 1079,
  /** {@link SOCDeleteGame} — a game was destroyed. */
  DELETEGAME: 1015,

  // --- Lobby / game-setup phase (Phase 2) ---

  /** {@link SOCLeaveGame} — someone is leaving a game. */
  LEAVEGAME: 1011,
  /** {@link SOCSitDown} — request/announce a player sitting down at a seat. */
  SITDOWN: 1012,
  /** {@link SOCJoinGame} — join a game as player/observer, or create options-less game. */
  JOINGAME: 1013,
  /** {@link SOCGameMembers} — list of players + observers in a game. */
  GAMEMEMBERS: 1017,
  /** {@link SOCStartGame} — request/announce a game starting. */
  STARTGAME: 1018,
  /** {@link SOCGameState} — current game state of a game. */
  GAMESTATE: 1025,
  /** {@link SOCJoinGameAuth} — server authorizes client to join a game. */
  JOINGAMEAUTH: 1021,
  /** {@link SOCSetSeatLock} — set lock state of one or all seats. @since 2.0.00 */
  SETSEATLOCK: 1068,
  /** {@link SOCNewGameWithOptionsRequest} — client requests game creation with options. @since 1.1.07 */
  NEWGAMEWITHOPTIONSREQUEST: 1078,
  /** {@link SOCGameOptionGetDefaults} — current new-game option defaults. @since 1.1.07 */
  GAMEOPTIONGETDEFAULTS: 1080,
  /** {@link SOCGameOptionGetInfos} — client asks server about option info. @since 1.1.07 */
  GAMEOPTIONGETINFOS: 1081,
  /** {@link SOCGameOptionInfo} — server's info about one game option (multi). @since 1.1.07 */
  GAMEOPTIONINFO: 1082,
  /** {@link SOCScenarioInfo} — scenario info request/reply (multi). @since 2.0.00 */
  SCENARIOINFO: 1101,
} as const;

/**
 * Type of a {@link MessageType} value (the numeric type id).
 */
export type MessageTypeId = (typeof MessageType)[keyof typeof MessageType];

/**
 * {@link SOCGames#MARKER_THIS_GAME_UNJOINABLE} ('?', 0x3F): if a game name in a
 * game-list message starts with this char, this client is too limited to join
 * that game. (Java source comment misnames the codepoint; the literal '\077'
 * octal is 0x3F '?'.)
 */
export const MARKER_THIS_GAME_UNJOINABLE = '?';

/**
 * Status-value codes for {@link SOCStatusMessage} (the `SV_*` constants in
 * `SOCStatusMessage.java`). Sent as the first SEP2 field when nonzero.
 */
export const StatusValue = {
  /** Welcome, OK to give a username and optional password. @since 1.1.06 */
  SV_OK: 0,
  /** Generic "not OK". @since 1.1.06 */
  SV_NOT_OK_GENERIC: 1,
  /** Name not found in server's accounts. @since 1.1.06 */
  SV_NAME_NOT_FOUND: 2,
  /** Incorrect password. @since 1.1.06 */
  SV_PW_WRONG: 3,
  /** This name is already logged in. @since 1.1.06 */
  SV_NAME_IN_USE: 4,
  /** Game version too new for this client to join. @since 1.1.06 */
  SV_CANT_JOIN_GAME_VERSION: 5,
  /** Temporary database problem. @since 1.1.06 */
  SV_PROBLEM_WITH_DB: 6,
  /** Account created successfully. @since 1.1.06 */
  SV_ACCT_CREATED_OK: 7,
  /** Account could not be created, or server has no accounts. @since 1.1.06 */
  SV_ACCT_NOT_CREATED_ERR: 8,
  /** New game requested with unknown game option(s). @since 1.1.07 */
  SV_NEWGAME_OPTION_UNKNOWN: 9,
  /** New game requested with option/value too new for client. @since 1.1.07 */
  SV_NEWGAME_OPTION_VALUE_TOONEW: 10,
  /** New game requested, but it already exists. @since 1.1.07 */
  SV_NEWGAME_ALREADY_EXISTS: 11,
  /** Game/player name rejected (bad characters, etc). @since 1.1.07 */
  SV_NEWGAME_NAME_REJECTED: 12,
  /** Game/player name too long. @since 1.1.07 */
  SV_NAME_TOO_LONG: 13,
  /** Client already created too many active games. @since 1.1.10 */
  SV_NEWGAME_TOO_MANY_CREATED: 14,
  /** Client already created too many active channels. @since 1.1.10 */
  SV_NEWCHANNEL_TOO_MANY_CREATED: 15,
  /** Password required but missing. @since 1.1.19 */
  SV_PW_REQUIRED: 16,
  /** Not authorized to create accounts. @since 1.1.19 */
  SV_ACCT_NOT_CREATED_DENIED: 17,
  /** Account created and was the server's first one. @since 1.1.20 */
  SV_ACCT_CREATED_OK_FIRST_ONE: 18,
  /** Requested nickname is reserved/not allowed. @since 1.2.00 */
  SV_NAME_NOT_ALLOWED: 19,
  /** Authenticated, but client must update its case-sensitive nickname. @since 1.2.00 */
  SV_OK_SET_NICKNAME: 20,
  /** Connected OK and server Debug Mode is on. @since 2.0.00 */
  SV_OK_DEBUG_MODE_ON: 21,
  /** Game requires client feature(s) too new for this client. @since 2.0.00 */
  SV_GAME_CLIENT_FEATURES_NEEDED: 22,
  /** Server is shutting down cleanly; don't reconnect immediately. @since 2.1.00 */
  SV_SERVER_SHUTDOWN: 23,
  /** Sent message requiring auth before authenticating. @since 2.4.00 */
  SV_MUST_AUTH_FIRST: 24,
  /** Opportunistic game options removed at game start. @since 2.7.00 */
  SV_GAME_STARTING_OPPORTUNISTIC_OPTS_REMOVED: 25,
  /** Game started; sitting down now needs a newer client version. @since 2.7.00 */
  SV_GAME_STARTED_CANNOT_SIT_CLIENT_VERSION: 26,
} as const;

/**
 * Type of a {@link StatusValue} code.
 */
export type StatusValueCode = (typeof StatusValue)[keyof typeof StatusValue];

/**
 * Seat-lock states from {@code soc.game.SOCGame.SeatLockState} (enum, ordinals
 * UNLOCKED=0, LOCKED=1, CLEAR_ON_RESET=2). Used by {@link SOCSetSeatLock}.
 *<P>
 * IMPORTANT: the ordinal is NOT what goes on the wire. {@link SOCSetSeatLock}
 * encodes each state as one of the back-compat strings {@code "true"} (LOCKED),
 * {@code "false"} (UNLOCKED), or {@code "clear"} (CLEAR_ON_RESET); see
 * {@link SeatLockWire}.
 */
export const SeatLockState = {
  /** Seat not locked; a bot can sit here / be taken over. Ordinal 0. */
  UNLOCKED: 0,
  /** Seat locked; no bot sits here / can't be taken over. Ordinal 1. */
  LOCKED: 1,
  /** Active game only: on reset, leave this seat vacant. Ordinal 2. */
  CLEAR_ON_RESET: 2,
} as const;

/**
 * Type of a {@link SeatLockState} value (the enum ordinal).
 */
export type SeatLockStateValue = (typeof SeatLockState)[keyof typeof SeatLockState];

/**
 * Wire strings for each {@link SeatLockState}, exactly as
 * {@code SOCSetSeatLock.toCmd()} writes them. LOCKED -> "true",
 * UNLOCKED -> "false", CLEAR_ON_RESET -> "clear" (back-compat with the
 * pre-2.0.00 boolean form). Parsing accepts only these three exact strings.
 */
export const SeatLockWire = {
  [SeatLockState.LOCKED]: 'true',
  [SeatLockState.UNLOCKED]: 'false',
  [SeatLockState.CLEAR_ON_RESET]: 'clear',
} as const;

/**
 * Game-option type codes from {@code soc.game.SOCGameOption} (OTYPE_*).
 *<P>
 * NOTE: These are the REAL wire values from the Java source, which differ from
 * the (incorrect) mapping in some task descriptions. Verified against
 * {@code SOCGameOption.java}: UNKNOWN=0, BOOL=1, INT=2, INTBOOL=3, ENUM=4,
 * ENUMBOOL=5, STR=6, STRHIDE=7. The numeric type travels in field [1] of
 * {@link SOCGameOptionInfo}.
 */
export const OptionType = {
  /** Unknown type (version mismatch). Ordinal 0. */
  OTYPE_UNKNOWN: 0,
  /** Boolean. Ordinal 1. Packs as "t"/"f". */
  OTYPE_BOOL: 1,
  /** Integer with min/max. Ordinal 2. Packs as the int. */
  OTYPE_INT: 2,
  /** Integer + boolean. Ordinal 3. Packs as "t"/"f" then int (e.g. "t4"). */
  OTYPE_INTBOOL: 3,
  /** Enumerated choice stored as 1-based int. Ordinal 4. Packs as the int. */
  OTYPE_ENUM: 4,
  /** Enum + boolean. Ordinal 5. Packs like INTBOOL (e.g. "f2"). */
  OTYPE_ENUMBOOL: 5,
  /** Text string (max length is maxIntValue). Ordinal 6. Packs as the string. */
  OTYPE_STR: 6,
  /** Hidden text string. Ordinal 7. Packs as the string. */
  OTYPE_STRHIDE: 7,
} as const;

/** Lowest OTYPE value known here (= {@link OptionType.OTYPE_UNKNOWN}). */
export const OTYPE_MIN = OptionType.OTYPE_UNKNOWN;

/** Highest OTYPE value known here (= {@link OptionType.OTYPE_STRHIDE}). */
export const OTYPE_MAX = OptionType.OTYPE_STRHIDE;

/**
 * {@code SOCGameOption} option-flag bits ({@code optFlags}; field [10] of
 * {@link SOCGameOptionInfo} for clients v2.0.00+). Verified against
 * {@code SOCGameOption.java}.
 */
export const OptionFlag = {
  /** Drop option if unused/at default. 0x01. */
  FLAG_DROP_IF_UNUSED: 0x01,
  /** Internal game property; client shouldn't send it. 0x02. */
  FLAG_INTERNAL_GAME_PROPERTY: 0x02,
  /** Inactive, hidden until activated at server. 0x04. */
  FLAG_INACTIVE_HIDDEN: 0x04,
  /** Formerly inactive, now activated. 0x08. */
  FLAG_ACTIVATED: 0x08,
  /** Third-party option for forward/backward compat. 0x10. */
  FLAG_3RD_PARTY: 0x10,
  /** Drop if parent option unused. 0x20. */
  FLAG_DROP_IF_PARENT_UNUSED: 0x20,
  /** Client sets this bool value once locally. 0x40. */
  FLAG_SET_AT_CLIENT_ONCE: 0x40,
  /** Opportunistic game option. 0x80. */
  FLAG_OPPORTUNISTIC: 0x80,
  /** Below min version to create games with an Opportunistic option. 0x100. */
  FLAG_OPPORTUNISTIC_CLIENT_JOIN_ONLY: 0x100,
} as const;

/**
 * Selected game-state values from {@code soc.game.SOCGame} (verified against
 * the Java source). Only the subset the lobby/game-room phase needs is defined;
 * later phases add the rest. The lobby treats any state {@code >= START1A} as
 * "the game has started" (play/setup is under way).
 */
export const GameState = {
  /** Brand new game; players are sitting down. Value 0. */
  NEW: 0,
  /** Ready to start playing (bots requested, not yet placed). Value 1. */
  READY: 1,
  /** Players place their 1st settlement. Value 5; first "in-play" state. */
  START1A: 5,
  /** Players place their 1st road. Value 6. */
  START1B: 6,
  /** Players place their 2nd settlement. Value 10. */
  START2A: 10,
  /** Normal play has begun; roll or play a card. Value 15. */
  ROLL_OR_CARD: 15,
  /** Current player has finished rolling. Value 20. */
  PLAY1: 20,
  /** Loading a saved game. Value 990. */
  LOADING: 990,
  /** The game is over. Value 1000. */
  OVER: 1000,
} as const;

/**
 * Lowest game-state value that means a game has begun setup/play (no new
 * players can sit). Mirrors the server's {@code state >= START1A} checks.
 */
export const GAME_STATE_MIN_STARTED = GameState.START1A;

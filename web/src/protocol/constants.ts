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

  // --- Reserved for later phases (not yet ported to a message class) ---

  /** {@link SOCNewGameWithOptionsRequest} — client requests game creation. @since 1.1.07 */
  NEWGAMEWITHOPTIONSREQUEST: 1078,
  /** {@link SOCJoinGame} — join a game as player/observer, or create options-less game. */
  JOINGAME: 1013,
  /** {@link SOCJoinGameAuth} — server authorizes client to join a game. */
  JOINGAMEAUTH: 1021,
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

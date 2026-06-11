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

  // --- In-game core loop (Phase 3) ---

  /** {@link SOCPutPiece} — place/announce a piece on the board. */
  PUTPIECE: 1009,
  /** {@link SOCGameTextMsg} — player chat / legacy server text in a game. */
  GAMETEXTMSG: 1010,
  /** {@link SOCPlayerElement} — one part of a player's status (resource/piece count, flag). */
  PLAYERELEMENT: 1024,
  /** {@link SOCTurn} — start of a player's turn; optional new game state. */
  TURN: 1026,
  /** {@link SOCDiceResult} — total amount rolled on the dice, or -1 to clear. */
  DICERESULT: 1028,
  /** {@link SOCRollDice} — client asks to roll the dice. */
  ROLLDICE: 1031,
  /** {@link SOCEndTurn} — client asks to end its turn. */
  ENDTURN: 1032,
  /** {@link SOCBuildRequest} — client asks to build a piece type. */
  BUILDREQUEST: 1043,
  /** {@link SOCCancelBuildRequest} — cancel a build/placement (both directions). */
  CANCELBUILDREQUEST: 1044,
  /** {@link SOCFirstPlayer} — which player number is first this game. */
  FIRSTPLAYER: 1054,
  /** {@link SOCSetTurn} — set current player number (no state change). */
  SETTURN: 1055,
  /** {@link SOCPotentialSettlements} — legal/potential settlement nodes + land areas (multi). */
  POTENTIALSETTLEMENTS: 1057,
  /** {@link SOCResourceCount} — a player's total resource count. */
  RESOURCECOUNT: 1063,
  /** {@link SOCLongestRoad} — which player has Longest Road, or -1. */
  LONGESTROAD: 1066,
  /** {@link SOCLargestArmy} — which player has Largest Army, or -1. */
  LARGESTARMY: 1067,
  /** {@link SOCBoardLayout2} — the board layout as named parts (keyed). @since 1.1.08 */
  BOARDLAYOUT2: 1084,
  /** {@link SOCPlayerElements} — several player-status elements at once (multi). @since 2.0.00 */
  PLAYERELEMENTS: 1086,
  /** {@link SOCGameServerText} — a text announcement from the server in a game. @since 2.0.00 */
  GAMESERVERTEXT: 1091,
  /** {@link SOCDiceResultResources} — resources gained by players on a roll (multi). @since 2.0.00 */
  DICERESULTRESOURCES: 1092,
  /** {@link SOCMovePiece} — move a piece (currently only ships) to a new edge. @since 2.0.00 */
  MOVEPIECE: 1093,
  /** {@link SOCGameElements} — several game-status fields at once (multi). @since 2.0.00 */
  GAMEELEMENTS: 1096,

  // --- Full in-game interactions (Phase 4) ---

  // Trade
  /** {@link SOCRejectOffer} — reject all offers ("no thanks"), or server reply-reason code. */
  REJECTOFFER: 1037,
  /** {@link SOCClearOffer} — retract an offer, or server clears offers from displays. */
  CLEAROFFER: 1038,
  /** {@link SOCAcceptOffer} — accept a trade offer; from server may include traded resources. */
  ACCEPTOFFER: 1039,
  /** {@link SOCBankTrade} — request/announce a trade with the bank or a port. */
  BANKTRADE: 1040,
  /** {@link SOCMakeOffer} — make/update or announce a player trade offer. */
  MAKEOFFER: 1041,
  /** {@link SOCClearTradeMsg} — clear trade messages/responses in client UI. */
  CLEARTRADEMSG: 1042,

  // Dev cards
  /** {@link SOCBuyDevCardRequest} — client asks to buy a development card. */
  BUYDEVCARDREQUEST: 1045,
  /** {@link SOCDevCardAction} — a player is drawing/playing/adding/removing a dev card. */
  DEVCARDACTION: 1046,
  /** {@link SOCDevCardCount} — number of dev cards left in the deck (older clients). */
  DEVCARDCOUNT: 1047,
  /** {@link SOCSetPlayedDevCard} — set the "played a dev card this turn" flag (older clients). */
  SETPLAYEDDEVCARD: 1048,
  /** {@link SOCPlayDevCardRequest} — client asks to play a development card. */
  PLAYDEVCARDREQUEST: 1049,
  /** {@link SOCPickResources} — resources picked (Year of Plenty / Gold Hex). */
  PICKRESOURCES: 1052,
  /** {@link SOCPickResourceType} — resource type chosen (Monopoly). */
  PICKRESOURCETYPE: 1053,

  // Robber / discard
  /** {@link SOCDiscardRequest} — server asks a player to discard N cards. */
  DISCARDREQUEST: 1029,
  /** {@link SOCDiscard} — the resources a player chose to discard. */
  DISCARD: 1033,
  /** {@link SOCMoveRobber} — move the robber (positive coord) or pirate (negative). */
  MOVEROBBER: 1034,
  /** {@link SOCChoosePlayer} — client's choice of whom to rob / robber-or-pirate. */
  CHOOSEPLAYER: 1035,
  /** {@link SOCChoosePlayerRequest} — server prompts player to choose a victim. */
  CHOOSEPLAYERREQUEST: 1036,
  /** {@link SOCRobberyResult} — server reports a robbery's victim and what was stolen. @since 2.5.00 */
  ROBBERYRESULT: 1102,

  // Misc
  /** {@link SOCGameStats} — game stats (final scores / timing), or a request for them. */
  GAMESTATS: 1061,
  /** {@link SOCSimpleRequest} — generic player request / server prompt with 2 detail values. @since 1.1.18 */
  SIMPLEREQUEST: 1089,
  /** {@link SOCSimpleAction} — generic in-game action/event from server with 2 detail values. @since 1.1.19 */
  SIMPLEACTION: 1090,
  /** {@link SOCDeclinePlayerRequest} — server declines a player's request, with a reason. @since 2.5.00 */
  DECLINEPLAYERREQUEST: 1104,
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
 * Game-state values from {@code soc.game.SOCGame} (verified against the Java
 * source). The lobby treats any state {@code >= START1A} as "the game has
 * started" (play/setup is under way).
 */
export const GameState = {
  /** Brand new game; players are sitting down. Value 0. */
  NEW: 0,
  /** Ready to start playing (bots requested, not yet placed). Value 1. */
  READY: 1,
  /** Players place their 1st settlement. Value 5; first "in-play" state. */
  START1A: 5,
  /** Players place their 1st road or ship. Value 6. */
  START1B: 6,
  /** Players place their 2nd settlement. Value 10. */
  START2A: 10,
  /** Players place their 2nd road or ship. Value 11. */
  START2B: 11,
  /** Players place their 3rd settlement (some scenarios). Value 12. */
  START3A: 12,
  /** Players place their 3rd road or ship (some scenarios). Value 13. */
  START3B: 13,
  /** Normal play has begun; roll dice or play a card. Value 15. */
  ROLL_OR_CARD: 15,
  /** Current player has finished rolling; may build/trade/buy. Value 20. */
  PLAY1: 20,
  /** Current player is placing a road. Value 30. */
  PLACING_ROAD: 30,
  /** Current player is placing a settlement. Value 31. */
  PLACING_SETTLEMENT: 31,
  /** Current player is placing a city. Value 32. */
  PLACING_CITY: 32,
  /** Current player is moving the robber. Value 33. */
  PLACING_ROBBER: 33,
  /** Current player is moving the pirate (sea board). Value 34. */
  PLACING_PIRATE: 34,
  /** Current player is placing a ship (sea board). Value 35. */
  PLACING_SHIP: 35,
  /** Placing 1st free road/ship from Road Building card. Value 40. */
  PLACING_FREE_ROAD1: 40,
  /** Placing 2nd free road/ship from Road Building card. Value 41. */
  PLACING_FREE_ROAD2: 41,
  /** Placing a special inventory item (some scenarios). Value 42. */
  PLACING_INV_ITEM: 42,
  /** Waiting for players to discard after a 7 is rolled. Value 50. */
  WAITING_FOR_DISCARDS: 50,
  /** Waiting for current player to choose a victim to rob. Value 51. */
  WAITING_FOR_ROB_CHOOSE_PLAYER: 51,
  /** Waiting for Discovery (Year of Plenty) card resource choice. Value 52. */
  WAITING_FOR_DISCOVERY: 52,
  /** Waiting for Monopoly card resource-type choice. Value 53. */
  WAITING_FOR_MONOPOLY: 53,
  /** Waiting for current player to choose to move robber or pirate. Value 54. */
  WAITING_FOR_ROBBER_OR_PIRATE: 54,
  /** Waiting to rob cloth or a resource (SC_CLVI scenario). Value 55. */
  WAITING_FOR_ROB_CLOTH_OR_RESOURCE: 55,
  /** Waiting for current player to pick free resource(s) from a gold hex. Value 56. */
  WAITING_FOR_PICK_GOLD_RESOURCE: 56,
  /** The 6-player Special Building Phase. Value 100. */
  SPECIAL_BUILDING: 100,
  /** Loading a saved game. Value 990. */
  LOADING: 990,
  /** Loaded game is paused, waiting to resume. Value 992. */
  LOADING_RESUMING: 992,
  /** The game is over. Value 1000. */
  OVER: 1000,
} as const;

/**
 * Type of a {@link GameState} value.
 */
export type GameStateValue = (typeof GameState)[keyof typeof GameState];

/**
 * Lowest game-state value that means a game has begun setup/play (no new
 * players can sit). Mirrors the server's {@code state >= START1A} checks.
 */
export const GAME_STATE_MIN_STARTED = GameState.START1A;

/**
 * Resource-type constants from {@code soc.game.SOCResourceConstants}.
 * CLAY..WOOD are 1..5; UNKNOWN is 6. These also match the land
 * {@code SOCBoard.*_HEX} type numbers (CLAY_HEX == CLAY, etc).
 */
export const Resource = {
  /** Clay (brick); lowest resource type. Value 1. */
  CLAY: 1,
  /** Ore. Value 2. */
  ORE: 2,
  /** Sheep (wool). Value 3. */
  SHEEP: 3,
  /** Wheat (grain). Value 4. */
  WHEAT: 4,
  /** Wood (lumber); highest known resource type. Value 5. */
  WOOD: 5,
  /** Unknown resource type (opponent's hidden cards). Value 6. */
  UNKNOWN: 6,
} as const;

/** Lowest resource type ({@link Resource.CLAY}). Java {@code SOCResourceConstants.MIN}. */
export const RESOURCE_MIN = Resource.CLAY;

/** Highest known resource type ({@link Resource.WOOD}). Java {@code SOCResourceConstants.WOOD}. */
export const RESOURCE_MAX_KNOWN = Resource.WOOD;

/**
 * Type of a {@link Resource} value.
 */
export type ResourceValue = (typeof Resource)[keyof typeof Resource];

/**
 * Playing-piece type numbers from {@code soc.game.SOCPlayingPiece}.
 * Used in {@link SOCPutPiece} / {@link SOCMovePiece} / {@link SOCBuildRequest}.
 */
export const PieceTypeConst = {
  /** Road. Value 0. */
  ROAD: 0,
  /** Settlement. Value 1. */
  SETTLEMENT: 1,
  /** City. Value 2. */
  CITY: 2,
  /** Ship (sea board). Value 3. */
  SHIP: 3,
  /** Fortress (SC_PIRI scenario). Value 4. */
  FORTRESS: 4,
  /** Village (SC_CLVI scenario; not player-owned). Value 5. */
  VILLAGE: 5,
} as const;

/**
 * {@code SOCPlayerElement} action types: how to apply the element amount.
 * Verified against {@code SOCPlayerElement.java}.
 */
export const PlayerElementAction = {
  /** Set the element to this value. Value 100. */
  SET: 100,
  /** Increase the element by this amount. Value 101. */
  GAIN: 101,
  /** Decrease the element by this amount. Value 102. */
  LOSE: 102,
} as const;

/**
 * Type of a {@link PlayerElementAction} value.
 */
export type PlayerElementActionValue =
  (typeof PlayerElementAction)[keyof typeof PlayerElementAction];

/**
 * {@code SOCPlayerElement.PEType} element-type values (sent as the int element
 * type in {@link SOCPlayerElement} / {@link SOCPlayerElements}). Verified
 * against {@code SOCPlayerElement.java}. CLAY..WOOD match {@link Resource}.
 */
export const PlayerElementType = {
  /** Unknown type (version mismatch). Value 0. */
  UNKNOWN_TYPE: 0,
  /** Clay (brick) resource count. Value 1. */
  CLAY: 1,
  /** Ore resource count. Value 2. */
  ORE: 2,
  /** Sheep (wool) resource count. Value 3. */
  SHEEP: 3,
  /** Wheat (grain) resource count. Value 4. */
  WHEAT: 4,
  /** Wood (lumber) resource count. Value 5. */
  WOOD: 5,
  /** Amount of unknown-type resources, or total resource count on join. Value 6. */
  UNKNOWN_RESOURCE: 6,
  /** Number of road pieces available to place. Value 10. */
  ROADS: 10,
  /** Number of settlement pieces available to place. Value 11. */
  SETTLEMENTS: 11,
  /** Number of city pieces available to place. Value 12. */
  CITIES: 12,
  /** Number of ship pieces available to place (sea board). Value 13. */
  SHIPS: 13,
  /** Number of knights (soldiers) played in army. Value 15. */
  NUMKNIGHTS: 15,
  /** Asking to build during Special Building Phase (6-player). Value 16. */
  ASK_SPECIAL_BUILD: 16,
  /** Total resources held in hand; SET only. Value 17. */
  RESOURCE_COUNT: 17,
  /** Node coord of most recently placed settlement; SET only. Value 18. */
  LAST_SETTLEMENT_NODE: 18,
  /** Has played a dev card this turn (1/0). Value 19. */
  PLAYED_DEV_CARD_FLAG: 19,
  /** Needs to discard (1/0); not sent over network. Value 20. */
  DISCARD_FLAG: 20,
  /** Already Special-Built this turn (1/0); not sent over network. Value 21. */
  HAS_SPECIAL_BUILT: 21,
  /** Stat: count of Discovery cards played; not sent over network. Value 22. */
  NUM_PLAYED_DEV_CARD_DISC: 22,
  /** Stat: count of Monopoly cards played; not sent over network. Value 23. */
  NUM_PLAYED_DEV_CARD_MONO: 23,
  /** Stat: count of Road Building cards played; not sent over network. Value 24. */
  NUM_PLAYED_DEV_CARD_ROADS: 24,
  /** Number of remaining undos. Value 25. */
  NUM_UNDOS_REMAINING: 25,
  /** Number of resources to pick from a gold hex (sea board). Value 101. */
  NUM_PICK_GOLD_HEX_RESOURCES: 101,
  /** Special Victory Points (scenarios). Value 102. */
  SCENARIO_SVP: 102,
  /** Player-event flags bitmask (scenarios). Value 103. */
  PLAYEREVENTS_BITMASK: 103,
  /** SVP land-areas bitmask (scenarios). Value 104. */
  SCENARIO_SVP_LANDAREAS_BITMASK: 104,
  /** Encoded starting land areas (sent at reconnect). Value 105. */
  STARTING_LANDAREAS: 105,
  /** Cloth count held (SC_CLVI scenario). Value 106. */
  SCENARIO_CLOTH_COUNT: 106,
  /** Number of ships converted to warships (SC_PIRI scenario). Value 107. */
  SCENARIO_WARSHIP_COUNT: 107,
} as const;

/**
 * Type of a {@link PlayerElementType} value.
 */
export type PlayerElementTypeValue =
  (typeof PlayerElementType)[keyof typeof PlayerElementType];

/**
 * {@code SOCGameElements.GEType} element-type values (sent as the int element
 * type in {@link SOCGameElements}). Verified against {@code SOCGameElements.java}.
 */
export const GameElementType = {
  /** Unknown type (version mismatch). Value 0. */
  UNKNOWN_TYPE: 0,
  /** Current round of play. Value 1. */
  ROUND_COUNT: 1,
  /** Number of dev cards remaining in the deck. Value 2. */
  DEV_CARD_COUNT: 2,
  /** Player number of the first player. Value 3. */
  FIRST_PLAYER: 3,
  /** Player number of the current player, or -1. Value 4. */
  CURRENT_PLAYER: 4,
  /** Player number with Largest Army, or -1. Value 5. */
  LARGEST_ARMY_PLAYER: 5,
  /** Player number with Longest Road/Route, or -1. Value 6. */
  LONGEST_ROAD_PLAYER: 6,
  /** Special Building Phase upcoming player number; not sent over network. Value 7. */
  SPECIAL_BUILDING_AFTER_PLAYER: 7,
  /** One ship edge placed this turn (sea board, on load). Value 8. */
  SHIP_PLACED_THIS_TURN_EDGE: 8,
  /** Is robber/pirate being moved for a Knight card (1/0). Value 9. */
  IS_PLACING_ROBBER_FOR_KNIGHT_CARD_FLAG: 9,
  /** Has built a city this turn (1/0); N7C house rule, undo only. Value 10. */
  HAS_BUILT_CITY_N7C: 10,
} as const;

/**
 * Type of a {@link GameElementType} value.
 */
export type GameElementTypeValue =
  (typeof GameElementType)[keyof typeof GameElementType];

/**
 * Development-card type constants from {@code soc.game.SOCDevCardConstants}.
 *<P>
 * IMPORTANT: In v2.0.00 the values of {@link #UNKNOWN} and {@link #KNIGHT} were
 * swapped to make room for more card types. The web client speaks v2.7.00, so
 * these are the post-swap values: {@code UNKNOWN=0}, {@code KNIGHT=9}. The
 * legacy v1.x values ({@code KNIGHT=0}, {@code UNKNOWN=9}) are exposed as
 * {@link #KNIGHT_FOR_VERS_1_X} / {@link #UNKNOWN_FOR_VERS_1_X} for completeness;
 * the server only sends them to v1.x clients, which we are not.
 *<P>
 * CAP/MARKET/UNIV/TEMPLE/CHAPEL (4..8) are the Victory-Point card types.
 * (Before v2.0.00, MARKET was {@code LIB}; before v2.5.00, TEMPLE was {@code TEMP};
 * before v2.0.00, CHAPEL was {@code TOW}.)
 */
export const DevCardType = {
  /** Minimum valid card type ({@link #UNKNOWN}). Value 0. */
  MIN: 0,
  /** Dev card of unknown type (reporting to other players). Value 0. */
  UNKNOWN: 0,
  /** Lowest "known" card type ({@link #ROADS}). Value 1. */
  MIN_KNOWN: 1,
  /** Road Building card. Value 1. */
  ROADS: 1,
  /** Discovery / Year of Plenty card. Value 2. */
  DISC: 2,
  /** Monopoly card. Value 3. */
  MONO: 3,
  /** Capitol / Governor's House / Great Hall VP card. Value 4. */
  CAP: 4,
  /** Market VP card (was {@code LIB} before v2.0.00). Value 5. */
  MARKET: 5,
  /** University VP card. Value 6. */
  UNIV: 6,
  /** Temple / Library VP card (was {@code TEMP} before v2.5.00). Value 7. */
  TEMPLE: 7,
  /** Tower / Chapel VP card (was {@code TOW} before v2.0.00). Value 8. */
  CHAPEL: 8,
  /** Knight / Soldier / Robber card. Value 9 (was 0 before v2.0.00). */
  KNIGHT: 9,
  /** One past the highest defined card type ({@link #KNIGHT}). Value 10. */
  MAXPLUSONE: 10,
  /** Legacy v1.x value for {@link #KNIGHT}. Value 0. */
  KNIGHT_FOR_VERS_1_X: 0,
  /** Legacy v1.x value for {@link #UNKNOWN}. Value 9. */
  UNKNOWN_FOR_VERS_1_X: 9,
} as const;

/**
 * Type of a {@link DevCardType} value.
 */
export type DevCardTypeValue = (typeof DevCardType)[keyof typeof DevCardType];

/**
 * {@code SOCDevCardAction} action constants: what's happening to the card.
 * Verified against {@code SOCDevCardAction.java}.
 */
export const DevCardAction = {
  /** DRAW (Buy): add as new to player's hand. Value 0. */
  DRAW: 0,
  /** PLAY: remove as old from player's hand. Value 1. */
  PLAY: 1,
  /** ADD_NEW: add as new to player's hand. Value 2. */
  ADD_NEW: 2,
  /** ADD_OLD: add as old to player's hand. Value 3. */
  ADD_OLD: 3,
  /** CANNOT_PLAY: bot can't play that card now (sent only to the bot; pn=-1). Value 4. @since 1.1.17 */
  CANNOT_PLAY: 4,
  /** REMOVE_NEW: remove a new card from the hand (undo). Value 5. @since 2.7.00 */
  REMOVE_NEW: 5,
  /** REMOVE_OLD: remove an old card from the hand (undo). Value 6. @since 2.7.00 */
  REMOVE_OLD: 6,
} as const;

/**
 * Type of a {@link DevCardAction} value.
 */
export type DevCardActionValue =
  (typeof DevCardAction)[keyof typeof DevCardAction];

/**
 * Special {@link SOCChoosePlayer#choice} values from {@code SOCChoosePlayer.java}.
 * A non-negative choice is a victim player number; these negatives are special.
 */
export const ChoosePlayerChoice = {
  /** Chose to not rob from anyone (some scenarios). Value -1. @since 2.0.00 */
  CHOICE_NO_PLAYER: -1,
  /** In WAITING_FOR_ROBBER_OR_PIRATE: move the robber. Value -2. @since 2.0.00 */
  CHOICE_MOVE_ROBBER: -2,
  /** In WAITING_FOR_ROBBER_OR_PIRATE: move the pirate ship. Value -3. @since 2.0.00 */
  CHOICE_MOVE_PIRATE: -3,
} as const;

/**
 * Reply/decline reason codes for {@link SOCRejectOffer} (the {@code REASON_*}
 * constants in {@code SOCRejectOffer.java}). Standard codes are &gt; 0; values
 * &lt; 0 are reserved for third-party bots/forks. @since 2.5.00
 */
export const RejectOfferReason = {
  /** Can't offer/accept/bank-trade now (usually wrong resources). Value 1. */
  REASON_CANNOT_MAKE_TRADE: 1,
  /** Can't trade now because it isn't the client's turn. Value 2. */
  REASON_NOT_YOUR_TURN: 2,
  /** Can't make this trade offer now. Value 3. */
  REASON_CANNOT_MAKE_OFFER: 3,
} as const;

/**
 * Reason codes for {@link SOCPickResources} when announced from server (the
 * {@code REASON_*} constants in {@code SOCPickResources.java}). @since 2.5.00
 */
export const PickResourcesReason = {
  /** Generic pick. Value 1. */
  REASON_GENERIC: 1,
  /** Discovery / Year of Plenty (received from the bank). Value 2. */
  REASON_DISCOVERY: 2,
  /** Gold Hex pick. Value 3. */
  REASON_GOLD_HEX: 3,
} as const;

/**
 * Reason codes for {@link SOCDeclinePlayerRequest} (the {@code REASON_*}
 * constants in {@code SOCDeclinePlayerRequest.java}). @since 2.5.00
 */
export const DeclineReason = {
  /** Not covered by other reason codes. Value 0. */
  REASON_OTHER: 0,
  /** Game rules/conditions prevent it for the rest of the game. Value 1. */
  REASON_NOT_THIS_GAME: 1,
  /** Not the player's turn. Value 2. */
  REASON_NOT_YOUR_TURN: 2,
  /** Player is current but can't act right now (game state). Value 3. */
  REASON_NOT_NOW: 3,
  /** Requested location/coordinate isn't permitted ("can't build here"). Value 4. */
  REASON_LOCATION: 4,
  /** Right turn/state but wrong specifics (e.g. invalid victim). Value 5. */
  REASON_SPECIFICS: 5,
} as const;

/**
 * Request-type codes for {@link SOCSimpleRequest} (the constants in
 * {@code SOCSimpleRequest.java}). Codes below 1000 are general; 1000+ are
 * gametype-specific.
 */
export const SimpleRequestType = {
  /** Server prompts client to pick free resources from a gold hex. Value 1. @since 2.0.00 */
  PROMPT_PICK_RESOURCES: 1,
  /** Current player wants to attack their pirate fortress (SC_PIRI). Value 1000. @since 1.1.18 */
  SC_PIRI_FORT_ATTACK: 1000,
  /** Current player wants to place a trade port they've been given (SC_FTRI). Value 1001. @since 2.0.00 */
  TRADE_PORT_PLACE: 1001,
} as const;

/**
 * Action-type codes for {@link SOCSimpleAction} (the constants in
 * {@code SOCSimpleAction.java}). Codes below 1000 are general; 1000+ are
 * gametype-specific.
 */
export const SimpleActionType = {
  /** Current player bought a dev card; value1 = cards remaining. Value 1. @since 1.1.19 */
  DEVCARD_BOUGHT: 1,
  /** Bank/port trade succeeded (bots only; deprecated in v2.0.00). Value 2. @since 1.1.19 */
  TRADE_SUCCESSFUL: 2,
  /** Current player monopolized a resource; v1=total, v2=resType. Value 3. @since 2.0.00 */
  RSRC_TYPE_MONOPOLIZED: 3,
  /** A board edge became (or stopped being) a Special Edge. Value 4. @since 2.0.00 */
  BOARD_EDGE_SET_SPECIAL: 4,
  /** Pirate-fortress attack result (SC_PIRI). Value 1001. @since 2.0.00 */
  SC_PIRI_FORT_ATTACK_RESULT: 1001,
  /** Current player removed a trade port from the board (SC_FTRI). Value 1002. @since 2.0.00 */
  TRADE_PORT_REMOVED: 1002,
  /** Player undid placing/moving a ship by a Village (SC_CLVI). Value 1003. @since 2.7.00 */
  SC_CLVI_VILLAGE_PLAYER_REMOVED: 1003,
} as const;

/**
 * Statistics-type codes for {@link SOCGameStats} (the {@code TYPE_*} constants
 * in {@code SOCGameStats.java}).
 */
export const GameStatsType = {
  /** Final player scores + robot flags at end of game. Value 1. */
  TYPE_PLAYERS: 1,
  /** Game timing (created/started/finished as unix seconds). Value 2. @since 2.7.00 */
  TYPE_TIMING: 2,
} as const;

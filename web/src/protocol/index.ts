// Public surface of the protocol core.
//
// Importing this module also runs each message module's side-effecting
// registerParser() call, so decode() can dispatch to every ported message.
// Keep additions here in sync with messages/*.ts as more types are ported.

export * from './constants';
export {
  type SOCMessage,
  type MessageParser,
  encode,
  decode,
  registerParser,
} from './SOCMessage';

// Ported messages (each self-registers its parser on import).
export { SOCVersion } from './messages/SOCVersion';
export { SOCServerPing } from './messages/SOCServerPing';
export { SOCRejectConnection } from './messages/SOCRejectConnection';
export { SOCStatusMessage } from './messages/SOCStatusMessage';
export { SOCChannels } from './messages/SOCChannels';
export { SOCGames } from './messages/SOCGames';
export {
  SOCGamesWithOptions,
  type GameWithOptions,
} from './messages/SOCGamesWithOptions';
export { SOCNewGame } from './messages/SOCNewGame';
export { SOCNewGameWithOptions } from './messages/SOCNewGameWithOptions';
export { SOCDeleteGame } from './messages/SOCDeleteGame';

// Lobby / game-setup phase (Phase 2). Each self-registers its parser on import.
export { SOCJoinGame } from './messages/SOCJoinGame';
export { SOCJoinGameAuth } from './messages/SOCJoinGameAuth';
export { SOCSitDown } from './messages/SOCSitDown';
export { SOCStartGame } from './messages/SOCStartGame';
export { SOCGameState } from './messages/SOCGameState';
export { SOCSetSeatLock } from './messages/SOCSetSeatLock';
export { SOCLeaveGame } from './messages/SOCLeaveGame';
export { SOCGameMembers } from './messages/SOCGameMembers';
export { SOCNewGameWithOptionsRequest } from './messages/SOCNewGameWithOptionsRequest';
export {
  SOCGameOptionGetInfos,
  OPTKEY_GET_I18N_DESCS,
  OPTKEY_GET_ANY_CHANGES,
} from './messages/SOCGameOptionGetInfos';
export { SOCGameOptionGetDefaults } from './messages/SOCGameOptionGetDefaults';
export { SOCGameOptionInfo } from './messages/SOCGameOptionInfo';
export {
  SOCScenarioInfo,
  type ScenarioDetails,
  MARKER_ANY_CHANGED,
  MARKER_SCEN_NAME_LIST,
  MARKER_NO_MORE_SCENS,
  MARKER_KEY_UNKNOWN,
} from './messages/SOCScenarioInfo';

// In-game core loop (Phase 3). Each self-registers its parser on import.
export { SOCBoardLayout2, type LayoutPart } from './messages/SOCBoardLayout2';
export { SOCPotentialSettlements } from './messages/SOCPotentialSettlements';
export { SOCTurn } from './messages/SOCTurn';
export { SOCSetTurn } from './messages/SOCSetTurn';
export { SOCFirstPlayer } from './messages/SOCFirstPlayer';
export { SOCLongestRoad } from './messages/SOCLongestRoad';
export { SOCLargestArmy } from './messages/SOCLargestArmy';
export { SOCPlayerElement } from './messages/SOCPlayerElement';
export { SOCPlayerElements } from './messages/SOCPlayerElements';
export { SOCGameElements } from './messages/SOCGameElements';
export { SOCDiceResult } from './messages/SOCDiceResult';
export {
  SOCDiceResultResources,
  type DiceResultPlayer,
} from './messages/SOCDiceResultResources';
export { SOCPutPiece } from './messages/SOCPutPiece';
export { SOCMovePiece } from './messages/SOCMovePiece';
export { SOCRollDice } from './messages/SOCRollDice';
export { SOCEndTurn } from './messages/SOCEndTurn';
export { SOCBuildRequest } from './messages/SOCBuildRequest';
export {
  SOCCancelBuildRequest,
  CANCEL_CARD,
  CANCEL_INV_ITEM_PLACE,
} from './messages/SOCCancelBuildRequest';
export { SOCResourceCount } from './messages/SOCResourceCount';
export {
  SOCGameServerText,
  UNLIKELY_CHAR1,
} from './messages/SOCGameServerText';
export {
  SOCGameTextMsg,
  SEP2_ALT,
  SERVERNAME,
  SERVER_FOR_CHAT,
} from './messages/SOCGameTextMsg';

// Full in-game interactions (Phase 4). Each self-registers its parser on import.
// Trade
export { SOCBankTrade } from './messages/SOCBankTrade';
export { SOCMakeOffer, type TradeOffer } from './messages/SOCMakeOffer';
export { SOCAcceptOffer } from './messages/SOCAcceptOffer';
export { SOCRejectOffer } from './messages/SOCRejectOffer';
export { SOCClearOffer } from './messages/SOCClearOffer';
export { SOCClearTradeMsg } from './messages/SOCClearTradeMsg';
// Dev cards
export { SOCBuyDevCardRequest } from './messages/SOCBuyDevCardRequest';
export {
  SOCDevCardAction,
  DEVCARD_MAX_MULTIPLE,
} from './messages/SOCDevCardAction';
export { SOCDevCardCount } from './messages/SOCDevCardCount';
export { SOCSetPlayedDevCard } from './messages/SOCSetPlayedDevCard';
export { SOCPlayDevCardRequest } from './messages/SOCPlayDevCardRequest';
export { SOCPickResources } from './messages/SOCPickResources';
export { SOCPickResourceType } from './messages/SOCPickResourceType';
// Robber / discard
export { SOCMoveRobber } from './messages/SOCMoveRobber';
export { SOCChoosePlayer } from './messages/SOCChoosePlayer';
export { SOCChoosePlayerRequest } from './messages/SOCChoosePlayerRequest';
export { SOCDiscard } from './messages/SOCDiscard';
export { SOCDiscardRequest } from './messages/SOCDiscardRequest';
export {
  SOCRobberyResult,
  type RobberyStolen,
} from './messages/SOCRobberyResult';
// Misc
export { SOCSimpleRequest } from './messages/SOCSimpleRequest';
export { SOCSimpleAction } from './messages/SOCSimpleAction';
export { SOCDeclinePlayerRequest } from './messages/SOCDeclinePlayerRequest';
export { SOCGameStats } from './messages/SOCGameStats';

// Resource-set + trade-offer model helpers used by the interaction messages.
export {
  type ResourceSet,
  emptyResourceSet,
  resourceSet,
  getAmount as resourceGetAmount,
  setAmount as resourceSetAmount,
} from './messages/resourceSet';

// Game-option model (descriptor type + (de)serialization helpers).
export {
  type GameOptType,
  type GameOptionDescriptor,
  type ParsedOptionValue,
  optTypeName,
  optTypeCode,
  descriptorFromInfo,
  packValue,
  serializeOptions,
  parseOptions,
  parseDefaultsKeys,
  mergeDefaultValue,
} from './gameOptions';

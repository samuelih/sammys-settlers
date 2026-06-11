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

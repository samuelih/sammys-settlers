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

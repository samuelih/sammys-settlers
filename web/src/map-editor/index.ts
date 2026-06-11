/** Public surface of the custom-map editor data layer (schema, validation, preview). */
export type {
  CustomMap,
  MapLandHex,
  MapPort,
  MapLandArea,
  HexTypeName,
  PortTypeName,
  FacingName,
} from './mapSchema';
export {
  HEX_TYPE_NAMES,
  PORT_TYPE_NAMES,
  FACING_NAMES,
  SUPPORTED_PLAYER_COUNTS,
  parseCoord,
  encodeCoord,
  rowOf,
  colOf,
  coordOf,
  parseMapJson,
  fromRaw,
  serializeMapJson,
  emptyMap,
} from './mapSchema';
export type { ValidationIssue, Severity } from './validation';
export {
  validate,
  isValid,
  adjacentHexToEdge,
  facingForEdge,
  MAX_ROW,
  MAX_COL,
} from './validation';
export {
  placeHex,
  clearHex,
  setHexDice,
  placePort,
  clearPort,
  toggleRobber,
  togglePirate,
  setName,
  setDescription,
  togglePlayerCount,
  setShuffle,
  indexOfHexAt,
  indexOfPortAt,
} from './editorActions';
export {
  enumerateHexCells,
  candidatePortEdges,
  edgesAroundHex,
  legalFacingsForEdge,
} from './editorGrid';
export type { GridHexCell, GridEdgeCell } from './editorGrid';
export { SAMPLE_MAP_JSON } from './sampleMapData';

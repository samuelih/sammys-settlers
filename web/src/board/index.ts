/** Public surface of the board renderer + geometry. */
export * from './types';
// FACING_* constants come from ./types (re-exported by ./coords too); export the
// rest of the coords API by name to avoid a duplicate-export ambiguity on FACING_*.
export {
  HALFDELTA_X,
  HALFDELTA_Y,
  DELTA_X,
  DELTA_Y,
  HEXY_OFF_SLOPE,
  HEX_CENTER_DY,
  TOP_MARGIN,
  rowOf,
  colOf,
  coordOf,
  getAdjacentNodesToHex,
  getAdjacentNodesToEdge,
  getAdjacentEdgeToNode,
  getAdjacentEdgesToNode,
  getAdjacentNodeToEdge,
  portFacingOffset,
  hexToPixel,
  nodeToPixel,
  edgeToPixel,
  hexPolygonPoints,
  dicePipCount,
} from './coords';
export type { Point, EdgePixels } from './coords';
export { BoardSVG, default } from './BoardSVG';
export type { BoardSVGProps } from './BoardSVG';

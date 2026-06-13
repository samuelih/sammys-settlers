import type { JSX } from 'react';
import { useMemo } from 'react';

import {
  type CustomMap,
  parseCoord,
  encodeCoord,
  rowOf,
  colOf,
} from '../mapSchema';
import {
  enumerateHexCells,
  candidatePortEdges,
  boardSizeForMap,
  hexToPixel,
  type GridHexCell,
} from '../editorGrid';
import {
  hexPolygonPoints,
  HALFDELTA_X,
  HALFDELTA_Y,
  HEX_CENTER_DY,
  HEXY_OFF_SLOPE,
  TOP_MARGIN,
} from '../../board/coords';
import { type HexKind } from '../../board/types';
import { BoardDefs } from '../../board/pieces/BoardDefs';
import { ResourceMotif } from '../../board/pieces/ResourceMotif';
import { TerrainTexture, terrainTextureFor } from '../../board/pieces/TerrainTexture';
import styles from '../../screens/MapEditorScreen.module.css';

/** Which interaction the canvas is in: placing hexes/dice, ports, robber, pirate. */
export type EditorTool = 'hex' | 'dice' | 'port' | 'robber' | 'pirate';

/** Map a hex-type name to its canvas fill CSS-module class. */
const CELL_CLASS: Record<string, string> = {
  clay: styles.cellClay,
  ore: styles.cellOre,
  sheep: styles.cellSheep,
  wheat: styles.cellWheat,
  wood: styles.cellWood,
  desert: styles.cellDesert,
  gold: styles.cellGold,
  water: styles.cellWater,
};

export interface EditorCanvasProps {
  map: CustomMap;
  tool: EditorTool;
  /** Show every 0xRRCC coordinate label on the grid. */
  showCoordinates?: boolean;
  /**
   * Click on a hex cell (empty or occupied). `coord` is the integer 0xRRCC.
   * `alt` is true for alt-click / right-click (clear / cycle).
   */
  onHexClick: (coord: number, alt: boolean) => void;
  /** Click on a port edge slot. `alt` true => clear the port there. */
  onPortClick: (edge: number, alt: boolean) => void;
}

/** Render a single placed-or-empty hex cell. */
function HexCell({
  cell,
  type,
  diceNum,
  tool,
  showCoordinates,
  onHexClick,
}: {
  cell: GridHexCell;
  type: string | null;
  diceNum: number;
  tool: EditorTool;
  showCoordinates: boolean;
  onHexClick: EditorCanvasProps['onHexClick'];
}): JSX.Element {
  const { x: cx, y: cy } = cell.center;
  const points = hexPolygonPoints(cx, cy);
  const placed = type !== null;
  const kind = placed ? kindForType(type) : 'water';
  const cellClass = placed
    ? `${styles.cell} ${CELL_CLASS[type] ?? ''}`
    : `${styles.cell} ${styles.cellWater} ${styles.cellEmpty}`;
  const showDice = diceNum >= 2 && diceNum <= 12 && diceNum !== 7;
  const hot = diceNum === 6 || diceNum === 8;
  const tokenR = HALFDELTA_X * 0.42;
  const coordStr = encodeCoord(cell.coord);
  const hasTexture = terrainTextureFor(kind) !== null;

  const handle = (ev: React.MouseEvent): void => {
    ev.preventDefault();
    onHexClick(cell.coord, ev.altKey || ev.metaKey || ev.shiftKey);
  };

  return (
    <g
      data-testid={`editor-hex-${coordStr}`}
      data-coord={coordStr}
      data-hextype={type ?? ''}
      data-dicenum={diceNum}
    >
      <polygon
        className={cellClass}
        points={points}
        onClick={handle}
        onContextMenu={handle}
        aria-label={`Hex ${coordStr}${placed ? ` (${type})` : ' (empty)'}`}
      />
      {hasTexture ? (
        <g
          className={styles.cellTextureClip}
          clipPath="url(#hex-clip)"
          transform={`translate(${cx} ${cy})`}
          pointerEvents="none"
        >
          <TerrainTexture kind={kind} className={styles.cellTexture} />
        </g>
      ) : (
        <polygon className={styles.cellGrain} points={points} fill={`url(#hexgrain-${kind})`} pointerEvents="none" />
      )}
      <polygon className={styles.cellSheen} points={points} fill={`url(#hexgrad-${kind})`} pointerEvents="none" />
      <polygon className={styles.cellRim} points={hexPolygonPoints(cx, cy, 0.96)} pointerEvents="none" />
      {!hasTexture && <ResourceMotif kind={kind} cx={cx} cy={cy} hx={HALFDELTA_X} hy={HALFDELTA_Y} />}
      {showCoordinates && (
        <text
          className={`${styles.coordLabel}${placed ? ` ${styles.coordLabelPlaced}` : ''}`}
          x={cx}
          y={cy - HALFDELTA_Y * 0.62}
        >
          {coordStr.replace('0x', '')}
        </text>
      )}
      {showDice && (
        <g
          data-testid={`editor-dice-${coordStr}`}
          onClick={tool === 'dice' ? handle : undefined}
          onContextMenu={handle}
        >
          <circle className={styles.diceToken} cx={cx} cy={cy + HEX_CENTER_DY} r={tokenR} />
          <text
            className={`${styles.diceText}${hot ? ` ${styles.diceTextHot}` : ''}`}
            x={cx}
            y={cy + HEX_CENTER_DY + tokenR * 0.35}
            fontSize={tokenR * 1.1}
          >
            {diceNum}
          </text>
        </g>
      )}
    </g>
  );
}

/**
 * Interactive editor canvas: a fixed honeycomb of placeable hex cells plus the
 * port-edge slots around placed hexes, with robber/pirate markers. Coordinates are
 * labelled on every cell. The canvas is pure/presentational: every edit is reported
 * up through {@link EditorCanvasProps.onHexClick} / {@link EditorCanvasProps.onPortClick};
 * the parent owns the {@link CustomMap} state.
 *
 * Geometry (hex polygon points, pixel mapping) is reused READ-ONLY from the
 * in-game board's `coords.ts`, so the editor and the live board render identically.
 */
export function EditorCanvas({
  map,
  tool,
  showCoordinates = true,
  onHexClick,
  onPortClick,
}: EditorCanvasProps): JSX.Element {
  const boardSize = useMemo(() => boardSizeForMap(map), [map]);
  const cells = useMemo(
    () => enumerateHexCells(boardSize.height, boardSize.width),
    [boardSize.height, boardSize.width],
  );

  // Index placed hexes by integer coord for O(1) cell lookup.
  const placedByCoord = useMemo(() => {
    const m = new Map<number, { type: string; diceNum: number }>();
    for (const h of map.landHexes ?? []) {
      const c = parseCoord(h.coord);
      if (c !== null) {
        m.set(c, { type: (h.type ?? '').toLowerCase(), diceNum: h.diceNum });
      }
    }
    return m;
  }, [map.landHexes]);

  const placedCoords = useMemo(() => [...placedByCoord.keys()], [placedByCoord]);

  // Port edges: candidate slots around placed hexes, plus the actual placed ports.
  const portEdges = useMemo(() => candidatePortEdges(placedCoords), [placedCoords]);
  const placedPorts = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of map.ports ?? []) {
      const e = parseCoord(p.edge);
      if (e !== null) {
        m.set(e, (p.type ?? '').toLowerCase());
      }
    }
    return m;
  }, [map.ports]);

  const robber = parseCoord(map.robberHex);
  const pirate = parseCoord(map.pirateHex);

  // ViewBox sized to the grid extent (all enumerated cells) plus a margin.
  const { viewBox } = useMemo(() => computeViewBox(cells), [cells]);

  const showPortSlots = tool === 'port';

  return (
    <svg
      data-testid="editor-canvas"
      data-board-height={boardSize.height}
      data-board-width={boardSize.width}
      className={styles.canvas}
      viewBox={viewBox}
      role="application"
      aria-label="Map editor canvas"
      preserveAspectRatio="xMidYMid meet"
    >
      <BoardDefs />

      {/* Hex cells (empty + placed). */}
      <g data-testid="editor-hex-cells">
        {cells.map((cell) => {
          const placed = placedByCoord.get(cell.coord) ?? null;
          return (
            <HexCell
              key={cell.coord}
              cell={cell}
              type={placed ? placed.type : null}
              diceNum={placed ? placed.diceNum : 0}
              tool={tool}
              showCoordinates={showCoordinates}
              onHexClick={onHexClick}
            />
          );
        })}
      </g>

      {/* Port edge slots (only while the port tool is active) + placed ports. */}
      <g data-testid="editor-port-slots">
        {showPortSlots &&
          portEdges.map((e) => (
            <line
              key={`slot-${e.coord}`}
              data-testid={`editor-port-slot-${encodeCoord(e.coord)}`}
              className={styles.portEdge}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              onClick={(ev) => {
                ev.preventDefault();
                onPortClick(e.coord, ev.altKey || ev.metaKey || ev.shiftKey);
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                onPortClick(e.coord, true);
              }}
            />
          ))}
        {[...placedPorts.entries()].map(([edge, ptype]) => {
          const px = edgeMid(edge);
          return (
            <g key={`port-${edge}`} data-testid={`editor-port-${encodeCoord(edge)}`}>
              <circle
                className={styles.portMarker}
                cx={px.x}
                cy={px.y}
                r={HALFDELTA_X * 0.4}
                onClick={(ev) => {
                  ev.preventDefault();
                  onPortClick(edge, ev.altKey || ev.metaKey || ev.shiftKey || tool === 'port');
                }}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  onPortClick(edge, true);
                }}
              />
              <text className={styles.portText} x={px.x} y={px.y + 2.5}>
                {ptype === 'misc' || ptype === '3:1' ? '3:1' : ptype.slice(0, 2).toUpperCase()}
              </text>
            </g>
          );
        })}
      </g>

      {/* Robber / pirate markers. */}
      {robber !== null && robber > 0 && (
        <g data-testid="editor-robber" pointerEvents="none">
          <circle
            className={styles.robberMarker}
            cx={hexToPixel(robber).x}
            cy={hexToPixel(robber).y - HALFDELTA_Y * 0.45}
            r={HALFDELTA_X * 0.3}
          />
          <text
            className={styles.markerLabel}
            x={hexToPixel(robber).x}
            y={hexToPixel(robber).y - HALFDELTA_Y * 0.45 + 2.5}
          >
            R
          </text>
        </g>
      )}
      {pirate !== null && pirate > 0 && (
        <g data-testid="editor-pirate" pointerEvents="none">
          <circle
            className={styles.pirateMarker}
            cx={hexToPixel(pirate).x + HALFDELTA_X * 0.5}
            cy={hexToPixel(pirate).y - HALFDELTA_Y * 0.45}
            r={HALFDELTA_X * 0.3}
          />
          <text
            className={styles.markerLabel}
            x={hexToPixel(pirate).x + HALFDELTA_X * 0.5}
            y={hexToPixel(pirate).y - HALFDELTA_Y * 0.45 + 2.5}
          >
            P
          </text>
        </g>
      )}
    </svg>
  );
}

/** Midpoint pixel of an edge coord (re-derived locally to avoid extra imports). */
function edgeMid(edge: number): { x: number; y: number } {
  const r = rowOf(edge);
  const c = colOf(edge);
  // Reuse the same linear mapping as hexToPixel for the edge "center" reference.
  return { x: c * HALFDELTA_X, y: r * HALFDELTA_Y + TOP_MARGIN };
}

/** Compute an SVG viewBox spanning all enumerated cells, with a one-hex margin. */
function computeViewBox(cells: GridHexCell[]): { viewBox: string } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    const { x, y } = cell.center;
    if (x - HALFDELTA_X < minX) minX = x - HALFDELTA_X;
    if (y - HALFDELTA_Y < minY) minY = y - HALFDELTA_Y;
    if (x + HALFDELTA_X > maxX) maxX = x + HALFDELTA_X;
    // S apex hangs one slope-height below the linear grid extent.
    if (y + HALFDELTA_Y + HEXY_OFF_SLOPE > maxY) maxY = y + HALFDELTA_Y + HEXY_OFF_SLOPE;
  }
  const pad = HALFDELTA_X;
  const x = minX - pad;
  const y = minY - pad;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  return { viewBox: `${x} ${y} ${w} ${h}` };
}

/** Convert loose map type strings into known board-art motif keys. */
function kindForType(type: string | null): HexKind {
  const normalized = (type ?? '').toLowerCase();
  switch (normalized) {
    case 'clay':
    case 'ore':
    case 'sheep':
    case 'wheat':
    case 'wood':
    case 'desert':
    case 'gold':
    case 'water':
      return normalized as HexKind;
    default:
      return 'unknown';
  }
}

export default EditorCanvas;

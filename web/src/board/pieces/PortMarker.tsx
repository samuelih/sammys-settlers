import type { JSX } from 'react';
import { type BoardPort, RESOURCE_HEX_TYPES, hexKind, type HexKind } from '../types';
import {
  edgeToPixel,
  getAdjacentNodesToEdge,
  nodeToPixel,
  portFacingOffset,
} from '../coords';
import styles from '../BoardSVG.module.css';

/** Port type 0 = misc 3:1; 1..5 = clay/ore/sheep/wheat/wood 2:1. */
function portLabel(ptype: number): string {
  if (ptype <= 0) {
    return '3:1';
  }
  return '2:1';
}

/** Resource key for a 2:1 port (used for an accessible data attribute + tint). */
function portResource(ptype: number): HexKind | 'misc' {
  if (ptype <= 0) {
    return 'misc';
  }
  const hexType = RESOURCE_HEX_TYPES[ptype - 1];
  return hexType === undefined ? 'unknown' : hexKind(hexType);
}

/** CSS-variable accent for the port badge ring, tinted by served resource. */
const PORT_TINT: Record<string, string> = {
  misc: 'var(--port-stroke)',
  clay: 'var(--hex-fill-clay)',
  ore: 'var(--hex-fill-ore)',
  sheep: 'var(--hex-fill-sheep)',
  wheat: 'var(--hex-fill-wheat)',
  wood: 'var(--hex-fill-wood)',
  unknown: 'var(--port-stroke)',
};

const PORT_TEXTURE = '/board-pieces/port-dock.png';
const RESOURCE_TEXTURE: Partial<Record<HexKind, string>> = {
  clay: '/board-tiles/clay.png',
  ore: '/board-tiles/ore.png',
  sheep: '/board-tiles/sheep.png',
  wheat: '/board-tiles/wheat.png',
  wood: '/board-tiles/wood.png',
};

export interface PortMarkerProps {
  port: BoardPort;
}

/**
 * A Catan-style harbor marker attached to both corner nodes of the port edge.
 * The generated dock sprite sits offshore while two pier arms make the two valid
 * settlement/city corners visually explicit. The overlaid badge shows `3:1`
 * (misc) or `2:1` plus the served resource texture.
 */
export function PortMarker({ port }: PortMarkerProps): JSX.Element {
  const edge = edgeToPixel(port.edge);
  const [nodeA, nodeB] = getAdjacentNodesToEdge(port.edge).map(nodeToPixel);
  const resource = portResource(port.ptype);
  const tint = PORT_TINT[resource] ?? 'var(--port-stroke)';
  const land = portFacingOffset(port.facing);
  const landLen = Math.hypot(land.x, land.y);
  const outward =
    landLen > 0
      ? { x: -land.x / landLen, y: -land.y / landLen }
      : { x: -Math.sin((edge.angle * Math.PI) / 180), y: Math.cos((edge.angle * Math.PI) / 180) };
  const mx = edge.cx + outward.x * 20;
  const my = edge.cy + outward.y * 20;
  const assetSize = 42;
  const iconHref = resource !== 'misc' && resource !== 'unknown' ? RESOURCE_TEXTURE[resource] : null;
  const iconId = `port-icon-${port.edge}-${port.ptype}`;
  const iconR = 5.3;
  const ratioY = iconHref ? my - 4.6 : my + 0.4;
  return (
    <g
      data-testid={`port-${port.edge}`}
      data-port-type={port.ptype}
      data-port-resource={resource}
      pointerEvents="none"
    >
      <path className={styles.portPier} d={`M ${nodeA.x} ${nodeA.y} Q ${edge.cx} ${edge.cy} ${mx} ${my}`} />
      <path className={styles.portPier} d={`M ${nodeB.x} ${nodeB.y} Q ${edge.cx} ${edge.cy} ${mx} ${my}`} />
      <circle className={styles.portNodeCap} cx={nodeA.x} cy={nodeA.y} r={3.6} />
      <circle className={styles.portNodeCap} cx={nodeB.x} cy={nodeB.y} r={3.6} />

      <g transform={`translate(${mx} ${my}) rotate(${edge.angle})`}>
        <image
          className={styles.portDock}
          href={PORT_TEXTURE}
          x={-assetSize / 2}
          y={-assetSize / 2}
          width={assetSize}
          height={assetSize}
          preserveAspectRatio="xMidYMid meet"
        />
      </g>

      <circle className={styles.portBadgeRing} cx={mx} cy={my} r={11.6} style={{ stroke: tint }} />
      <text className={styles.portLabel} x={mx} y={ratioY} fontSize={iconHref ? 8.1 : 10.2}>
        {portLabel(port.ptype)}
      </text>
      {iconHref && (
        <>
          <defs>
            <clipPath id={iconId} clipPathUnits="userSpaceOnUse">
              <circle cx={mx} cy={my + 6.1} r={iconR} />
            </clipPath>
          </defs>
          <image
            href={iconHref}
            x={mx - iconR}
            y={my + 6.1 - iconR}
            width={iconR * 2}
            height={iconR * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${iconId})`}
          />
          <circle className={styles.portResourceRing} cx={mx} cy={my + 6.1} r={iconR} />
        </>
      )}
    </g>
  );
}

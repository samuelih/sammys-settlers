import type { JSX } from 'react';
import { type BoardPort, RESOURCE_HEX_TYPES, hexKind } from '../types';
import { edgeToPixel, getAdjacentNodeToEdge, nodeToPixel } from '../coords';
import styles from '../BoardSVG.module.css';

/** Port type 0 = misc 3:1; 1..5 = clay/ore/sheep/wheat/wood 2:1. */
function portLabel(ptype: number): string {
  if (ptype <= 0) {
    return '3:1';
  }
  return '2:1';
}

/** Resource key for a 2:1 port (used for an accessible data attribute). */
function portResource(ptype: number): string {
  if (ptype <= 0) {
    return 'misc';
  }
  const hexType = RESOURCE_HEX_TYPES[ptype - 1];
  return hexType === undefined ? 'unknown' : hexKind(hexType);
}

export interface PortMarkerProps {
  port: BoardPort;
}

/**
 * A small marker at a port's edge, nudged toward the land node the port faces
 * (so it reads as belonging to that corner of the board), labeled `3:1` for a
 * misc port or `2:1` for a resource port. The resource is exposed via
 * `data-port-resource` for theming/tests.
 */
export function PortMarker({ port }: PortMarkerProps): JSX.Element {
  const edge = edgeToPixel(port.edge);

  // Bias the marker from the edge midpoint a little toward the facing land node,
  // so a 2:1 sheep port visually hugs the coastline corner it serves.
  let mx = edge.cx;
  let my = edge.cy;
  try {
    const landNode = getAdjacentNodeToEdge(port.edge, port.facing);
    const np = nodeToPixel(landNode);
    mx = edge.cx + (np.x - edge.cx) * 0.45;
    my = edge.cy + (np.y - edge.cy) * 0.45;
  } catch {
    // facing perpendicular / bad data — fall back to the edge midpoint
  }

  const r = 9;
  return (
    <g
      data-testid={`port-${port.edge}`}
      data-port-type={port.ptype}
      data-port-resource={portResource(port.ptype)}
      pointerEvents="none"
    >
      <circle className={styles.portMarker} cx={mx} cy={my} r={r} />
      <text className={styles.portLabel} x={mx} y={my} fontSize={r * 0.78}>
        {portLabel(port.ptype)}
      </text>
    </g>
  );
}

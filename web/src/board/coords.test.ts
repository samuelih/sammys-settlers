import { describe, it, expect } from 'vitest';
import {
  coordOf,
  rowOf,
  colOf,
  getAdjacentNodesToEdge,
  getAdjacentEdgeToNode,
  getAdjacentEdgesToNode,
  getAdjacentNodesToHex,
  getAdjacentNodeToEdge,
  hexToPixel,
  nodeToPixel,
  edgeToPixel,
  hexPolygonPoints,
  dicePipCount,
  portFacingOffset,
  HALFDELTA_X,
  HALFDELTA_Y,
  TOP_MARGIN,
  FACING_NE,
  FACING_E,
  FACING_W,
  FACING_NW,
} from './coords';

describe('coord helpers', () => {
  it('packs and unpacks 0xRRCC', () => {
    const c = coordOf(0x03, 0x05);
    expect(c).toBe(0x0305);
    expect(rowOf(c)).toBe(3);
    expect(colOf(c)).toBe(5);
  });
});

describe('getAdjacentNodesToEdge (SOCBoardLarge port)', () => {
  it('vertical "|" edge (r odd) -> nodes (r-1,c) and (r+1,c)', () => {
    // edge (3,3): r is odd -> vertical
    const [a, b] = getAdjacentNodesToEdge(coordOf(3, 3));
    expect(a).toBe(coordOf(2, 3));
    expect(b).toBe(coordOf(4, 3));
  });

  it('sloped edge (r even) -> nodes (r,c) and (r,c+1)', () => {
    // edge (2,4): r even -> sloped
    const [a, b] = getAdjacentNodesToEdge(coordOf(2, 4));
    expect(a).toBe(coordOf(2, 4));
    expect(b).toBe(coordOf(2, 5));
  });

  it('round-trips: each edge end is the original edge coord nearby', () => {
    const edge = coordOf(5, 7); // vertical
    const [a, b] = getAdjacentNodesToEdge(edge);
    expect(rowOf(a)).toBe(4);
    expect(rowOf(b)).toBe(6);
    expect(colOf(a)).toBe(7);
    expect(colOf(b)).toBe(7);
  });
});

describe('getAdjacentEdgeToNode / getAdjacentEdgesToNode', () => {
  it('dir 0 (NW/SW) -> (r, c-1)', () => {
    expect(getAdjacentEdgeToNode(coordOf(2, 4), 0)).toBe(coordOf(2, 3));
  });
  it('dir 1 (NE/SE) -> (r, c)', () => {
    expect(getAdjacentEdgeToNode(coordOf(2, 4), 1)).toBe(coordOf(2, 4));
  });
  it('dir 2 (N/S) -> S edge for a "Y" node, N edge for an "A" node', () => {
    // node (2,4): s = r/2 = 1, c = 4 -> (odd, even) -> "Y" -> S edge (r+1,c)
    expect(getAdjacentEdgeToNode(coordOf(2, 4), 2)).toBe(coordOf(3, 4));
    // node (2,5): s = 1, c = 5 -> (odd, odd) -> "A" -> N edge (r-1,c)
    expect(getAdjacentEdgeToNode(coordOf(2, 5), 2)).toBe(coordOf(1, 5));
  });
  it('returns 3 adjacent edges', () => {
    const edges = getAdjacentEdgesToNode(coordOf(2, 4));
    expect(edges).toHaveLength(3);
    expect(new Set(edges).size).toBe(3);
  });
});

describe('getAdjacentNodesToHex', () => {
  it('returns 6 distinct corner nodes, clockwise from N', () => {
    const hex = coordOf(3, 3);
    const nodes = getAdjacentNodesToHex(hex);
    expect(nodes).toEqual([
      coordOf(2, 3), // N
      coordOf(2, 4), // NE
      coordOf(4, 4), // SE
      coordOf(4, 3), // S
      coordOf(4, 2), // SW
      coordOf(2, 2), // NW
    ]);
  });

  it('every hex corner edge connects two of the hex nodes', () => {
    const hex = coordOf(3, 3);
    const nodes = getAdjacentNodesToHex(hex);
    const nodeSet = new Set(nodes);
    // Each adjacent edge of a corner node touches at least one other corner.
    for (const n of nodes) {
      const ends = getAdjacentEdgesToNode(n).flatMap((e) => getAdjacentNodesToEdge(e));
      expect(ends.some((x) => nodeSet.has(x) && x !== n)).toBe(true);
    }
  });
});

describe('getAdjacentNodeToEdge (port facing)', () => {
  it('vertical edge faces N node via NE/NW, S node via SE/SW', () => {
    const edge = coordOf(3, 3); // vertical
    expect(getAdjacentNodeToEdge(edge, FACING_NE)).toBe(coordOf(2, 3));
    expect(getAdjacentNodeToEdge(edge, FACING_NW)).toBe(coordOf(2, 3));
  });
  it('throws when facing is perpendicular to a vertical edge', () => {
    const edge = coordOf(3, 3); // vertical -> E/W are perpendicular
    expect(() => getAdjacentNodeToEdge(edge, FACING_E)).toThrow();
    expect(() => getAdjacentNodeToEdge(edge, FACING_W)).toThrow();
  });
  it('a facing node is always one of the edge end nodes', () => {
    const edge = coordOf(2, 4); // sloped
    const ends = new Set(getAdjacentNodesToEdge(edge));
    // sloped "/" or "\": at least one non-perpendicular facing yields an end node
    const node = getAdjacentNodeToEdge(edge, FACING_E);
    expect(ends.has(node)).toBe(true);
  });
});

describe('pixel mapping (SOCBoardPanel large-board port)', () => {
  it('hexToPixel is linear: x=col*27, y=row*23+margin', () => {
    expect(hexToPixel(coordOf(3, 3))).toEqual({
      x: 3 * HALFDELTA_X,
      y: 3 * HALFDELTA_Y + TOP_MARGIN,
    });
  });

  it('nodeToPixel uses the SAME mapping as hexToPixel', () => {
    const coord = coordOf(2, 4);
    expect(nodeToPixel(coord)).toEqual(hexToPixel(coord));
  });

  it('edgeToPixel endpoints are the two end-node pixels; vertical edge is ~90deg', () => {
    const edge = coordOf(3, 3); // vertical
    const [a, b] = getAdjacentNodesToEdge(edge);
    const pa = nodeToPixel(a);
    const pb = nodeToPixel(b);
    const e = edgeToPixel(edge);
    expect(e.x1).toBe(pa.x);
    expect(e.y1).toBe(pa.y);
    expect(e.x2).toBe(pb.x);
    expect(e.y2).toBe(pb.y);
    // vertical edge: same x, so angle is +90 (b is below a)
    expect(Math.abs(e.angle)).toBeCloseTo(90, 5);
    expect(e.cx).toBe(pa.x);
  });

  it('sloped edge has a non-vertical angle', () => {
    const e = edgeToPixel(coordOf(2, 4));
    expect(Math.abs(Math.abs(e.angle) - 90)).toBeGreaterThan(1);
  });
});

describe('hexPolygonPoints', () => {
  it('produces 6 comma-pairs centered on (cx,cy)', () => {
    const pts = hexPolygonPoints(100, 100).split(' ');
    expect(pts).toHaveLength(6);
    // N apex is centered horizontally, HALFDELTA_Y above center
    expect(pts[0]).toBe(`100,${100 - HALFDELTA_Y}`);
    // SE shoulder is HALFDELTA_X right, HALFDELTA_Y below
    expect(pts[2]).toBe(`${100 + HALFDELTA_X},${100 + HALFDELTA_Y}`);
  });

  it('corners coincide with the real hex node pixels', () => {
    const hex = coordOf(3, 3);
    const center = hexToPixel(hex);
    const polyPts = hexPolygonPoints(center.x, center.y)
      .split(' ')
      .map((p) => {
        const [x, y] = p.split(',').map(Number);
        return { x, y };
      });
    const nodePts = getAdjacentNodesToHex(hex).map(nodeToPixel);
    expect(polyPts).toEqual(nodePts);
  });
});

describe('dicePipCount', () => {
  it('6 - |7-n|, none for 7/desert/water', () => {
    expect(dicePipCount(2)).toBe(1);
    expect(dicePipCount(8)).toBe(5);
    expect(dicePipCount(6)).toBe(5);
    expect(dicePipCount(12)).toBe(1);
    expect(dicePipCount(7)).toBe(0);
    expect(dicePipCount(0)).toBe(0);
  });
});

describe('portFacingOffset', () => {
  it('matches SOCBoardPanel DELTAX/DELTAY_FACING', () => {
    expect(portFacingOffset(FACING_NE)).toEqual({ x: HALFDELTA_X, y: -2 * HALFDELTA_Y });
    expect(portFacingOffset(FACING_E)).toEqual({ x: 2 * HALFDELTA_X, y: 0 });
  });
});

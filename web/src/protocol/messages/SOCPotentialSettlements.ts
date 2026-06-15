// SOCPotentialSettlements — a player's (or all players') legal/potential settlement nodes.
// Ported from src/main/java/soc/message/SOCPotentialSettlements.java.
//
// Two wire shapes:
//
// (A) Simple, single land area:
//   POTENTIALSETTLEMENTS SEP game SEP2 playerNumber { SEP2 nodeCoord }*
//
// (B) Extended (v2.0.00+), multiple land areas and/or legal sea edges:
//   POTENTIALSETTLEMENTS SEP game SEP2 playerNumber { SEP2 psNode }*
//     SEP2 NA SEP2 <numAreas> SEP2 PAN SEP2 <startingLandArea>
//     { SEP2 LA<i> { SEP2 node }* }*
//     { SEP2 SE { SEP2 (edgeHex | 0) }* }*
//
// In shape (B):
//   * The psNodes before "NA" are the player's unique potential settlements.
//     An empty (but non-null) psNodes list is sent as the single node 0; if no
//     psNode tokens appear at all, psNodes is null.
//   * "NA" = number of land areas; "PAN" = starting land area number.
//   * Each "LA<i>" is followed by that area's legal node coords. None of the
//     LA#s equals PAN (that area's list would just repeat psNodes).
//   * "SE" lists are legal sea edges for ships (SC_PIRI only); coords are HEX,
//     ranges use a positive,negative pair. A lone 0 pads an empty final SE list.
//     Rare; preserved but not used by the core renderer.
//
// playerNumber -1 means "all players" (typical before game start; on the sea
// board this also sets the shared legal settlements and recomputes legal roads).
//
// Parsing replicates SOCPotentialSettlements.parseDataStr, including the special
// empty/null psNodes handling and land-area completeness check.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseJavaInt } from '../javaInt';

/** Strict base-10 integer check (Java Integer.parseInt). */
function parseIntStrict(s: string): number | null {
  return parseJavaInt(s);
}

/** Strict base-16 integer check (Java Integer.parseInt(s, 16)). Allows leading '-'. */
function parseHexStrict(s: string): number | null {
  if (!/^[+-]?[0-9a-fA-F]+$/.test(s)) {
    return null;
  }
  return Number.parseInt(s, 16);
}

/**
 * Legal/potential settlement nodes for one or all players. Mirrors Java
 * {@code SOCPotentialSettlements}.
 */
export class SOCPotentialSettlements implements SOCMessage {
  readonly type = MessageType.POTENTIALSETTLEMENTS;

  /** Name of the game. */
  readonly game: string;

  /** Seat number, or -1 for all players. */
  readonly playerNumber: number;

  /**
   * Player's unique potential settlement node coords, or null if not sent
   * (sea board before game start uses {@link landAreasLegalNodes} instead).
   * May be an empty array (game started, currently no potential nodes).
   */
  readonly psNodes: number[] | null;

  /**
   * Starting land area number (PAN), or 0. Only meaningful when
   * {@link landAreasLegalNodes} is non-null.
   */
  readonly startingLandArea: number;

  /**
   * Per-land-area legal node sets, or null if only one area. Index 0 is unused
   * (null); indexes 1..numAreas are arrays of node coords.
   */
  readonly landAreasLegalNodes: ReadonlyArray<number[] | null> | null;

  /**
   * Legal sea edges per player for restricted ship placement (SC_PIRI), or null.
   * Outer index is a player position; inner array holds edge coords / ranges.
   */
  readonly legalSeaEdges: ReadonlyArray<number[]> | null;

  /**
   * @param game                 game name
   * @param playerNumber         seat number, or -1
   * @param psNodes              potential settlement nodes, or null
   * @param startingLandArea     PAN value (0 if not applicable)
   * @param landAreasLegalNodes  per-area legal nodes (index 0 null), or null
   * @param legalSeaEdges        per-player legal sea edges, or null
   */
  constructor(
    game: string,
    playerNumber: number,
    psNodes: number[] | null,
    startingLandArea = 1,
    landAreasLegalNodes: ReadonlyArray<number[] | null> | null = null,
    legalSeaEdges: ReadonlyArray<number[]> | null = null,
  ) {
    this.game = game;
    this.playerNumber = playerNumber;
    this.psNodes = psNodes;
    this.startingLandArea = startingLandArea;
    this.landAreasLegalNodes = landAreasLegalNodes;
    this.legalSeaEdges = legalSeaEdges;
  }

  /** Number of land areas defined (1 if no land-area data). */
  get areaCount(): number {
    return this.landAreasLegalNodes !== null ? this.landAreasLegalNodes.length - 1 : 1;
  }

  toCmd(): string {
    if (this.landAreasLegalNodes === null && this.legalSeaEdges === null) {
      return this.toCmdSimple();
    }
    return this.toCmdExtended();
  }

  /** Encode shape (A): POTENTIALSETTLEMENTS game pn { node }*. */
  private toCmdSimple(): string {
    let cmd = `${MessageType.POTENTIALSETTLEMENTS}${SEP}${this.game}${SEP2}${this.playerNumber}`;
    if (this.psNodes !== null) {
      for (const n of this.psNodes) {
        cmd += `${SEP2}${n}`;
      }
    }
    return cmd;
  }

  /** Encode shape (B): with NA/PAN/LA#/SE groups. */
  private toCmdExtended(): string {
    let cmd = `${MessageType.POTENTIALSETTLEMENTS}${SEP}${this.game}${SEP2}${this.playerNumber}`;

    if (this.psNodes !== null) {
      if (this.psNodes.length > 0) {
        for (const n of this.psNodes) {
          cmd += `${SEP2}${n}`;
        }
      } else {
        cmd += `${SEP2}0`; // empty (non-null) psNodes sent as the single node 0
      }
    }

    const lan = this.landAreasLegalNodes;
    cmd += `${SEP2}NA${SEP2}${lan !== null ? lan.length - 1 : 0}`;
    cmd += `${SEP2}PAN${SEP2}${this.startingLandArea}`;

    if (lan !== null) {
      for (let i = 1; i < lan.length; ++i) {
        cmd += `${SEP2}LA${i}`;
        const nodes = lan[i];
        if (nodes !== null) {
          for (const n of nodes) {
            cmd += `${SEP2}${n}`;
          }
        }
      }
    }

    const lse = this.legalSeaEdges;
    if (lse !== null) {
      for (let i = 0; i < lse.length; ++i) {
        cmd += `${SEP2}SE`;
        const arr = lse[i];
        if (arr.length === 0 && i === lse.length - 1) {
          cmd += `${SEP2}0`; // pad empty final SE list
        } else {
          for (let k of arr) {
            cmd += SEP2;
            if (k < 0) {
              cmd += '-';
              k = -k;
            }
            cmd += k.toString(16);
          }
        }
      }
    }

    return cmd;
  }

  /**
   * Parse the data portion. Faithfully mirrors Java parseDataStr, including the
   * empty/null psNodes handling and required land-area completeness.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCPotentialSettlements | null {
    // Java StringTokenizer on SEP2 (skips empty tokens).
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const game = tok[0];
    const pn = parseIntStrict(tok[1]);
    if (pn === null) {
      return null;
    }

    let i = 2;
    const ps: number[] = [];
    let lan: Array<number[] | null> | null = null;
    let pan = 0;
    let legalSeaEdges: number[][] | null = null;
    let hadNA = false;

    // psNodes until "NA"
    while (i < tok.length) {
      const t = tok[i];
      ++i;
      if (t === 'NA') {
        hadNA = true;
        break;
      }
      const n = parseIntStrict(t);
      if (n === null) {
        return null;
      }
      ps.push(n);
    }

    let psNodes: number[] | null = ps;

    if (hadNA) {
      // numArea
      if (i >= tok.length) {
        return null;
      }
      const numArea = parseIntStrict(tok[i]);
      ++i;
      if (numArea === null || numArea < 0) {
        return null;
      }
      if (numArea > 0) {
        lan = new Array<number[] | null>(numArea + 1).fill(null);
      }

      // PAN
      if (i >= tok.length || tok[i] !== 'PAN') {
        return null;
      }
      ++i;
      if (i >= tok.length) {
        return null;
      }
      const panParsed = parseIntStrict(tok[i]);
      ++i;
      if (panParsed === null || panParsed < 0) {
        return null;
      }
      pan = panParsed;

      // first "LA#"/"SE" token (or none)
      let cur: string | null;
      if (i < tok.length) {
        cur = tok[i];
        ++i;
      } else {
        cur = null;
        if (numArea > 1 || pan !== 1) {
          return null;
        }
      }

      // Land-area loop, starting with cur == "LA#"
      // Mirrors Java's while(st.hasMoreTokens()) guarded loop.
      while (cur !== null && i < tok.length) {
        if (!cur.startsWith('LA')) {
          if (cur === 'SE') {
            break; // sea edges, handled below
          }
          return null; // unrecognized
        }

        const areaNum = parseIntStrict(cur.substring(2));
        if (areaNum === null || areaNum <= 0) {
          return null;
        }
        const ls: number[] = [];

        // node coords until next "LA#" or "SE"
        let nextMarker: string | null = null;
        while (i < tok.length) {
          const t = tok[i];
          ++i;
          if (t === 'SE' || t.startsWith('LA')) {
            nextMarker = t;
            break;
          }
          const n = parseIntStrict(t);
          if (n === null) {
            return null;
          }
          ls.push(n);
        }

        if (lan === null) {
          return null; // numArea was 0 but got LA tokens
        }
        if (areaNum >= lan.length) {
          return null; // area number out of range
        }
        lan[areaNum] = ls;

        cur = nextMarker;
      }

      // Legal sea edges: optional "SE" groups (cur === "SE" here)
      if (cur === 'SE') {
        const allLSE: number[][] = [];
        // We've consumed the leading "SE" into `cur`; parse following coord
        // groups, each group delimited by the next "SE".
        let seActive = true;
        while (seActive) {
          const lse: number[] = [];
          let sawNextSE = false;
          while (i < tok.length) {
            const t = tok[i];
            ++i;
            if (t === 'SE') {
              sawNextSE = true;
              break;
            }
            const edge = parseHexStrict(t);
            if (edge === null) {
              return null;
            }
            if (edge !== 0) {
              lse.push(edge);
            }
          }
          allLSE.push(lse);
          seActive = sawNextSE;
        }
        legalSeaEdges = allLSE;
      }

      // empty ps list is sent solely as {0}; otherwise null if not sent
      if (ps.length === 0) {
        psNodes = null;
      } else if (ps.length === 1 && ps[0] === 0) {
        psNodes = [];
      } else {
        psNodes = ps;
      }

      // all land areas must be defined
      if (numArea > 0 && lan !== null) {
        for (let a = 1; a <= numArea; ++a) {
          if (lan[a] === null) {
            return null;
          }
        }
      }
    }

    if (lan === null) {
      if (legalSeaEdges !== null) {
        if (pn <= 0) {
          return null; // not well-formed (per Java constructor)
        }
        return new SOCPotentialSettlements(game, pn, psNodes, 0, null, legalSeaEdges);
      }
      return new SOCPotentialSettlements(game, pn, psNodes);
    }
    return new SOCPotentialSettlements(game, pn, psNodes, pan, lan, legalSeaEdges);
  }
}

registerParser(MessageType.POTENTIALSETTLEMENTS, SOCPotentialSettlements.parse);

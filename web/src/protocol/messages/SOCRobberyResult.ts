// SOCRobberyResult — server reports a robbery's perpetrator, victim, and loot.
// Ported from src/main/java/soc/message/SOCRobberyResult.java. @since 2.5.00
//
// Wire format:
//   ROBBERYRESULT SEP game SEP2 perpPN SEP2 victimPN SEP2 <stolen> SEP2 <gainLose>
//     [SEP2 victimAmount [SEP2 extraValue]]
// where <stolen> is ONE of:
//   - 'R' SEP2 resType SEP2 amount                         (single resource type)
//   - 'E' SEP2 peTypeValue SEP2 amount                     (a player-element, e.g. cloth)
//   - 'S' (SEP2 resType SEP2 amount)*                      (a resource set; only nonzero amounts)
// <gainLose> is 'T' (amount is a delta gained/lost) or 'F' (amount/victimAmount
// are new totals to set).
//
// Tricky tail encoding (matches Java toCmd exactly):
//   * victimAmount + extraValue are appended ONLY when (victimAmount != 0) ||
//     (extraValue != 0). When appended, victimAmount always goes first; then
//     extraValue is appended ONLY when extraValue != 0.
//   * So the cases are: neither (no tail); victimAmount != 0 & extraValue == 0
//     (tail = victimAmount); extraValue != 0 (tail = victimAmount, extraValue —
//     victimAmount may be 0 here).
//   * For the 'S' set form, isGainLose is always true and amount/victimAmount
//     are unused (0).
// Parsing mirrors the Java tokenizer; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { type ResourceSet, emptyResourceSet, parseIntStrict } from './resourceSet';

/** What was stolen, mirroring the 'R'/'E'/'S' wire discriminator. */
export type RobberyStolen =
  | { kind: 'res'; resType: number }
  | { kind: 'peType'; peType: number }
  | { kind: 'resSet'; resSet: ResourceSet };

/**
 * Robbery result report. Mirrors Java {@code SOCRobberyResult}.
 */
export class SOCRobberyResult implements SOCMessage {
  readonly type = MessageType.ROBBERYRESULT;

  /** Name of the game. */
  readonly game: string;

  /** Perpetrator player number, or -1 if none (e.g. pirate-fleet attack). */
  readonly perpPN: number;

  /** Victim player number, or -1 if none. */
  readonly victimPN: number;

  /** What was stolen (single resource type, player-element, or resource set). */
  readonly stolen: RobberyStolen;

  /** True if amount is a delta gained/lost; false if amount/victimAmount are new totals. */
  readonly isGainLose: boolean;

  /** Amount stolen (if isGainLose) or perp's new total. Unused for a resSet. */
  readonly amount: number;

  /** Victim's new total if !isGainLose; 0 otherwise. Unused for a resSet. */
  readonly victimAmount: number;

  /** Optional scenario/expansion info, or 0 (e.g. SC_PIRI pirate-fleet strength). */
  readonly extraValue: number;

  /**
   * @param game          game name
   * @param perpPN        perpetrator player number, or -1
   * @param victimPN      victim player number, or -1
   * @param stolen        what was stolen
   * @param isGainLose    true = delta gained/lost, false = totals to set
   * @param amount        amount stolen / perp's new total (default 0)
   * @param victimAmount  victim's new total if !isGainLose (default 0)
   * @param extraValue    optional extra info (default 0)
   */
  constructor(
    game: string,
    perpPN: number,
    victimPN: number,
    stolen: RobberyStolen,
    isGainLose: boolean,
    amount = 0,
    victimAmount = 0,
    extraValue = 0,
  ) {
    this.game = game;
    this.perpPN = perpPN;
    this.victimPN = victimPN;
    this.stolen = stolen;
    this.isGainLose = isGainLose;
    this.amount = amount;
    this.victimAmount = victimAmount;
    this.extraValue = extraValue;
  }

  toCmd(): string {
    let cmd =
      `${MessageType.ROBBERYRESULT}${SEP}${this.game}` +
      `${SEP2}${this.perpPN}${SEP2}${this.victimPN}${SEP2}`;
    if (this.stolen.kind === 'resSet') {
      cmd += 'S';
      const rs = this.stolen.resSet;
      const amts = [rs.clay, rs.ore, rs.sheep, rs.wheat, rs.wood];
      for (let rt = 1; rt <= 5; ++rt) {
        const am = amts[rt - 1];
        if (am !== 0) {
          cmd += `${SEP2}${rt}${SEP2}${am}`;
        }
      }
    } else if (this.stolen.kind === 'peType') {
      cmd += `E${SEP2}${this.stolen.peType}${SEP2}${this.amount}`;
    } else {
      cmd += `R${SEP2}${this.stolen.resType}${SEP2}${this.amount}`;
    }
    cmd += `${SEP2}${this.isGainLose ? 'T' : 'F'}`;
    if (this.victimAmount !== 0 || this.extraValue !== 0) {
      cmd += `${SEP2}${this.victimAmount}`;
      if (this.extraValue !== 0) {
        cmd += `${SEP2}${this.extraValue}`;
      }
    }
    return cmd;
  }

  /**
   * Parse the data portion. Mirrors Java {@code parseDataStr}'s tokenizer logic.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCRobberyResult | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    // game, perp, victim, typeChar, typeval, ... , boolChar  => min 6 tokens
    if (tok.length < 6) {
      return null;
    }
    const game = tok[0];
    const ppn = parseIntStrict(tok[1]);
    const vpn = parseIntStrict(tok[2]);
    if (ppn === null || vpn === null) {
      return null;
    }
    const typeChar = tok[3];
    if (typeChar.length !== 1) {
      return null;
    }
    const typeval = parseIntStrict(tok[4]);
    if (typeval === null) {
      return null;
    }

    let i = 5;
    let stolen: RobberyStolen;
    let amount = 0;
    let boolTok: string;

    if (typeChar === 'S') {
      const rset = emptyResourceSet();
      if (i >= tok.length) {
        return null; // missing first amount
      }
      const firstAmt = parseIntStrict(tok[i]);
      if (firstAmt === null) {
        return null; // first amount garbled
      }
      addResAmount(rset, typeval, firstAmt);
      ++i;
      // Read (resType, amount) pairs until the next token isn't a digit (it's T/F).
      for (;;) {
        if (i >= tok.length) {
          return null; // ran out before the bool char
        }
        const s = tok[i];
        if (!isDigitStart(s)) {
          break; // most likely the T/F field
        }
        const rt = parseIntStrict(s);
        const am = parseIntStrict(tok[i + 1]);
        if (rt === null || am === null) {
          return null;
        }
        addResAmount(rset, rt, am);
        i += 2;
      }
      stolen = { kind: 'resSet', resSet: rset };
      boolTok = tok[i];
      ++i;
    } else if (typeChar === 'R' || typeChar === 'E') {
      const am = parseIntStrict(tok[i]);
      if (am === null) {
        return null;
      }
      amount = am;
      ++i;
      if (i >= tok.length) {
        return null;
      }
      boolTok = tok[i];
      ++i;
      stolen =
        typeChar === 'E'
          ? { kind: 'peType', peType: typeval }
          : { kind: 'res', resType: typeval };
    } else {
      return null;
    }

    if (boolTok.length !== 1) {
      return null;
    }
    let isGainLose: boolean;
    if (boolTok === 'T') {
      isGainLose = true;
    } else if (boolTok === 'F') {
      isGainLose = false;
    } else {
      return null;
    }

    let victimAmount = 0;
    let extraValue = 0;
    if (i < tok.length) {
      const va = parseIntStrict(tok[i]);
      if (va === null) {
        return null;
      }
      victimAmount = va;
      ++i;
      if (i < tok.length) {
        const ev = parseIntStrict(tok[i]);
        if (ev === null) {
          return null;
        }
        extraValue = ev;
      }
    }

    return new SOCRobberyResult(
      game,
      ppn,
      vpn,
      stolen,
      isGainLose,
      amount,
      victimAmount,
      extraValue,
    );
  }
}

/** True if the token starts with an ASCII digit (Java {@code Character.isDigit}). */
function isDigitStart(s: string): boolean {
  if (s.length === 0) {
    return false;
  }
  const c = s.charCodeAt(0);
  return c >= 48 && c <= 57;
}

/** Add an amount to the resource set by 1-based resource type. */
function addResAmount(rs: ResourceSet, resType: number, amount: number): void {
  switch (resType) {
    case 1:
      rs.clay += amount;
      break;
    case 2:
      rs.ore += amount;
      break;
    case 3:
      rs.sheep += amount;
      break;
    case 4:
      rs.wheat += amount;
      break;
    case 5:
      rs.wood += amount;
      break;
    default:
      rs.unknown += amount;
      break;
  }
}

registerParser(MessageType.ROBBERYRESULT, SOCRobberyResult.parse);

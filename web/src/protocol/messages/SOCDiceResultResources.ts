// SOCDiceResultResources — resources gained by players on a dice roll + new totals.
// Ported from src/main/java/soc/message/SOCDiceResultResources.java
// (extends SOCMessageTemplateMi).
//
// Wire format (SEP between every field):
//   DICERESULTRESOURCES SEP game SEP <int params...>
// where the int params encode:
//   pa[0] = number of players gaining resource(s)
//   then per gaining player:
//     playerNumber
//     newTotalResourceCount
//     (amountGained, resourceType) pairs, amounts never 0
//     0  -- separates this player from the next (omitted after the LAST player)
//
// So players are delimited by a 0 token, except the final player has no trailing
// 0 (it ends the message). Amounts are positive; resource types are 1..5
// (CLAY..WOOD). This single message replaces the older
// SOCPlayerElement(GAIN)+SOCGameTextMsg+SOCResourceCount sequence. Min client
// version 2.0.00.

import { MessageType, type ResourceValue } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseTemplateMi, templateMiToCmd } from './templateMi';

/** One player's gain from the roll. */
export interface DiceResultPlayer {
  /** Seat number that gained resources. */
  playerNumber: number;
  /** Player's new total resource count (includes unknown resources). */
  total: number;
  /**
   * Resources gained, as (resourceType, amount) pairs. resourceType is a
   * {@link ResourceValue} (CLAY=1..WOOD=5); amount is positive.
   */
  resources: ReadonlyArray<{ type: ResourceValue; amount: number }>;
}

/**
 * Per-player resources gained on a roll. Mirrors Java {@code SOCDiceResultResources}.
 */
export class SOCDiceResultResources implements SOCMessage {
  readonly type = MessageType.DICERESULTRESOURCES;

  /** Name of the game. */
  readonly game: string;

  /** Players who gained resources, in wire order. */
  readonly players: readonly DiceResultPlayer[];

  /**
   * @param game     game name
   * @param players  per-player gains (must be non-empty for a valid message)
   */
  constructor(game: string, players: readonly DiceResultPlayer[]) {
    this.game = game;
    this.players = players;
  }

  /** Encode {@link players} into the flat int param array (see class header). */
  getParams(): number[] {
    const n = this.players.length;
    const pa: number[] = [n];
    for (let p = 0; p < n; ++p) {
      const pl = this.players[p];
      pa.push(pl.playerNumber);
      pa.push(pl.total);
      for (const r of pl.resources) {
        pa.push(r.amount);
        pa.push(r.type);
      }
      if (p !== n - 1) {
        pa.push(0); // separator before next player; none after the last
      }
    }
    return pa;
  }

  toCmd(): string {
    return templateMiToCmd(MessageType.DICERESULTRESOURCES, this.game, this.getParams());
  }

  /**
   * Parse the data portion. Mirrors the Java client constructor's int decoding.
   *
   * @returns the parsed message, or null if garbled / counts mismatch
   */
  static parse(data: string): SOCDiceResultResources | null {
    const parts = parseTemplateMi(data);
    if (parts === null) {
      return null;
    }
    const { game, params } = parts;
    if (params.length < 1) {
      return null;
    }

    const plCount = params[0];
    if (plCount < 0) {
      return null;
    }
    const players: DiceResultPlayer[] = [];
    const L = params.length;
    let i = 1;
    let parsedCount = 0;

    while (i < L) {
      // playerNumber, total
      if (i + 1 >= L) {
        return null; // truncated mid-player
      }
      const playerNumber = params[i];
      ++i;
      const total = params[i];
      ++i;

      const resources: Array<{ type: ResourceValue; amount: number }> = [];
      // pairs of (amount, type) until a 0 amount or end of array
      let amount = params[i];
      ++i;
      while (amount !== 0 && i < L) {
        const restype = params[i] as ResourceValue;
        ++i;
        resources.push({ type: restype, amount });
        if (i < L) {
          amount = params[i];
          ++i;
        } else {
          amount = 0; // last player, end of array
        }
      }

      players.push({ playerNumber, total, resources });
      ++parsedCount;
    }

    if (parsedCount !== plCount) {
      return null; // player count mismatch
    }

    return new SOCDiceResultResources(game, players);
  }
}

registerParser(MessageType.DICERESULTRESOURCES, SOCDiceResultResources.parse);

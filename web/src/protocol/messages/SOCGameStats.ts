// SOCGameStats — game stats (final player scores, or game timing), or a request for them.
// Ported from src/main/java/soc/message/SOCGameStats.java.
//
// Two wire forms, distinguished by the first token after the game name:
//
//  1. TYPE_PLAYERS (statType 1, the default):
//       GAMESTATS SEP game SEP2 sc0 SEP2 sc1 ... SEP2 scN SEP2 rb0 SEP2 rb1 ... SEP2 rbN
//     Equal numbers of integer scores and boolean robot flags (lowercase
//     "true"/"false"), one pair per seat (game.maxPlayers seats). On parse Java
//     computes maxPlayers = (tokenCountAfterGame + 1) / 2 (the +1 is because the
//     first score token was already read). Scores are indexed 0..maxPlayers-1
//     regardless of seated players; vacant seats score 0.
//
//  2. Other types (e.g. TYPE_TIMING, statType 2; @since 2.7.00):
//       GAMESTATS SEP game SEP2 't'<statType> SEP2 v0 SEP2 v1 ...
//     The first token is the literal 't' followed by the stat-type number; the
//     remaining tokens are the stat values (stored as long in Java to hold unix
//     seconds without y2038 problems). No robot flags.
//
// The two forms are told apart by whether the first token after game starts with
// 't' (other type) or a digit (TYPE_PLAYERS). Garbled -> null.

import { GameStatsType, MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Game statistics or a request for them. Mirrors Java {@code SOCGameStats}.
 */
export class SOCGameStats implements SOCMessage {
  readonly type = MessageType.GAMESTATS;

  /** Name of the game. */
  readonly game: string;

  /** Stats type (GameStatsType): TYPE_PLAYERS=1 or TYPE_TIMING=2, etc. */
  readonly statType: number;

  /**
   * Stat values. For TYPE_PLAYERS these are the per-seat scores; for other types
   * they're type-specific values (e.g. TYPE_TIMING's unix seconds). Stored as
   * numbers; JS numbers safely hold the unix-second magnitudes involved.
   */
  readonly scores: readonly number[];

  /**
   * For TYPE_PLAYERS, where the robots are sitting (parallel to {@link scores}).
   * Null for other stat types.
   */
  readonly robots: readonly boolean[] | null;

  /**
   * @param game      game name
   * @param statType  stats type (GameStatsType)
   * @param scores    stat values
   * @param robots    robot-seat flags (TYPE_PLAYERS only), else null
   */
  constructor(
    game: string,
    statType: number,
    scores: readonly number[],
    robots: readonly boolean[] | null,
  ) {
    this.game = game;
    this.statType = statType;
    this.scores = scores;
    this.robots = robots;
  }

  toCmd(): string {
    let cmd = `${MessageType.GAMESTATS}${SEP}${this.game}`;
    if (this.statType !== GameStatsType.TYPE_PLAYERS) {
      cmd += `${SEP2}t${this.statType}`;
    }
    for (const sc of this.scores) {
      cmd += `${SEP2}${sc}`;
    }
    if (this.statType === GameStatsType.TYPE_PLAYERS && this.robots !== null) {
      for (const rb of this.robots) {
        cmd += `${SEP2}${rb ? 'true' : 'false'}`;
      }
    }
    return cmd;
  }

  /**
   * Parse the data portion. Mirrors Java {@code parseDataStr}'s two-form logic.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCGameStats | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const game = tok[0];
    const first = tok[1];
    const ch = first.charAt(0);

    if (ch === 't') {
      // Other stat type: 't'<statType> then long values.
      const stype = parseIntStrict(first.substring(1));
      if (stype === null || stype === GameStatsType.TYPE_PLAYERS) {
        return null;
      }
      const scores: number[] = [];
      for (let i = 2; i < tok.length; ++i) {
        const v = parseIntStrict(tok[i]);
        if (v === null) {
          return null;
        }
        scores.push(v);
      }
      return new SOCGameStats(game, stype, scores, null);
    }

    if (ch >= '0' && ch <= '9') {
      // TYPE_PLAYERS: scores then robot flags. Java: maxPlayers =
      // (countTokensAfterFirstScore + 1) / 2 with integer (floor) division, where
      // total = tok.length - 1 score+robot tokens. It reads maxPlayers scores then
      // maxPlayers robots; if total is odd, the extra token is simply ignored
      // (Java does NOT error on that). If a robot token is missing it would throw
      // -> null, which we mirror via the length check.
      const total = tok.length - 1;
      const maxPlayers = Math.floor(total / 2);
      if (1 + 2 * maxPlayers > tok.length) {
        return null; // not enough tokens for maxPlayers scores + maxPlayers robots
      }
      const scores: number[] = [];
      for (let i = 0; i < maxPlayers; ++i) {
        const sc = parseIntStrict(tok[1 + i]);
        if (sc === null) {
          return null;
        }
        scores.push(sc);
      }
      const robots: boolean[] = [];
      for (let i = 0; i < maxPlayers; ++i) {
        // Java Boolean.valueOf: true only for case-insensitive "true".
        robots.push(tok[1 + maxPlayers + i].toLowerCase() === 'true');
      }
      return new SOCGameStats(game, GameStatsType.TYPE_PLAYERS, scores, robots);
    }

    return null;
  }
}

registerParser(MessageType.GAMESTATS, SOCGameStats.parse);

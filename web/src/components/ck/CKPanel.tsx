// Cities & Knights in-game UI: the local player's C&K panel (commodities,
// improvement tracks, knights, barbarian track, progress-card hand), the
// compact per-opponent summary rendered inside player panels, the transient
// barbarian-attack banner, and the Trade Monopoly commodity picker dialog.
//
// Visible only in C&K games (CurrentGame.isCKGame); all rules/costs follow
// doc/Cities-and-Knights-Implemented.md. Client-side button gating is
// best-effort — the server is authoritative and denials are toasted by the
// store's SIMPLEREQUEST / OP_DECLINE / CANNOT_PLAY handlers.

import { useEffect, useState } from 'react';

import { Button, Dialog } from '../index';
import {
  CKCommodity,
  CKProgressCard,
  CK_BARBARIAN_ATTACK_THRESHOLD,
  CK_MAX_KNIGHTS,
  CK_MIGHTY_KNIGHT_POLITICS_LEVEL,
  GameState,
} from '../../protocol';
import {
  type CKBarbarianAttack,
  type CurrentGame,
  type PlayerView,
  CK_TRACK_NAMES,
  ckActivateKnight,
  ckBuyImprovement,
  ckBuyKnight,
  ckPlayProgressCard,
  ckPromoteKnight,
  pickMonopoly,
} from '../../store/gameStore';
import styles from './CKPanel.module.css';

/** Human-readable C&K progress-card names, keyed by itype (11..19). */
export const CK_PROGRESS_CARD_NAMES: Record<number, string> = {
  [CKProgressCard.RESOURCE_MONOPOLY]: 'Resource Monopoly',
  [CKProgressCard.TRADE_MONOPOLY]: 'Trade Monopoly',
  [CKProgressCard.MASTER_MERCHANT]: 'Master Merchant',
  [CKProgressCard.WARLORD]: 'Warlord',
  [CKProgressCard.WEDDING]: 'Wedding',
  [CKProgressCard.CONSTITUTION]: 'Constitution (VP)',
  [CKProgressCard.IRRIGATION]: 'Irrigation',
  [CKProgressCard.MINING]: 'Mining',
  [CKProgressCard.PRINTER]: 'Printer (VP)',
};

/** The three improvement tracks in display order, with their commodity. */
const TRACKS: ReadonlyArray<{
  track: 0 | 1 | 2;
  key: keyof PlayerView['ck']['improvements'];
  testid: string;
  commodity: keyof PlayerView['ck']['commodities'];
  commodityLabel: string;
}> = [
  { track: 0, key: 'trade', testid: 'trade', commodity: 'cloth', commodityLabel: 'cloth' },
  { track: 1, key: 'politics', testid: 'politics', commodity: 'coin', commodityLabel: 'coin' },
  { track: 2, key: 'science', testid: 'science', commodity: 'paper', commodityLabel: 'paper' },
];

/** Commodity rows in display order. */
const COMMODITIES: ReadonlyArray<{
  key: keyof PlayerView['ck']['commodities'];
  label: string;
  pickValue: number;
}> = [
  { key: 'cloth', label: 'Cloth', pickValue: CKCommodity.CK_CLOTH },
  { key: 'coin', label: 'Coin', pickValue: CKCommodity.CK_COIN },
  { key: 'paper', label: 'Paper', pickValue: CKCommodity.CK_PAPER },
];

/** Total knights of a view (all levels). */
function totalKnights(view: PlayerView): number {
  const k = view.ck.knights;
  return k.lv1 + k.lv2 + k.lv3;
}

/** Active knights of a view (all levels). */
function activeKnights(view: PlayerView): number {
  const k = view.ck.knights;
  return k.activeLv1 + k.activeLv2 + k.activeLv3;
}

/** Seat label helper (name when seated, else "Seat N"). */
function seatName(cg: CurrentGame, pn: number): string {
  const v = cg.playerViews[pn];
  return v != null && v.seated && v.name !== '' ? v.name : `Seat ${pn + 1}`;
}

/**
 * True if `itype` is playable by the local player right now (best-effort
 * client gating; see doc rules): only on my turn, monopolies (11/12) only in
 * PLAY1, all other progress cards in ROLL_OR_CARD or PLAY1. There is no
 * one-per-turn limit and no new-card delay for progress cards.
 */
export function canPlayProgressCard(cg: CurrentGame, itype: number): boolean {
  if (cg.mySeat < 0 || cg.mySeat !== cg.currentPlayerNumber) {
    return false;
  }
  const st = cg.gameState;
  if (
    itype === CKProgressCard.RESOURCE_MONOPOLY ||
    itype === CKProgressCard.TRADE_MONOPOLY
  ) {
    return st === GameState.PLAY1;
  }
  return st === GameState.PLAY1 || st === GameState.ROLL_OR_CARD;
}

/** The barbarian strength track (0..7 pips) with the current strength. */
function BarbarianTrack({ strength }: { strength: number }): JSX.Element {
  const pips = [];
  for (let i = 1; i <= CK_BARBARIAN_ATTACK_THRESHOLD; ++i) {
    pips.push(
      <span
        key={i}
        className={`${styles.barbarianPip} ${i <= strength ? styles.barbarianPipFilled : ''}`}
        aria-hidden="true"
      />,
    );
  }
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Barbarians</p>
      <div
        className={styles.barbarian}
        data-testid="ck-barbarian"
        data-strength={strength}
      >
        <span className={styles.barbarianPips}>{pips}</span>
        <span className={styles.barbarianText}>
          {strength} / {CK_BARBARIAN_ATTACK_THRESHOLD}
        </span>
      </div>
    </div>
  );
}

/**
 * The Cities & Knights sidebar panel body: the local player's commodities,
 * improvement tracks (with Build buttons + metropolis badges), knights (with
 * Buy/Activate/Promote), the barbarian track, and the progress-card hand.
 */
export function CKPanel({
  cg,
  myView,
  isMyTurn,
}: {
  cg: CurrentGame;
  myView: PlayerView | null;
  isMyTurn: boolean;
}): JSX.Element {
  const canAct = isMyTurn && cg.gameState === GameState.PLAY1 && myView !== null;
  const ck = myView?.ck ?? null;

  // Knight action gating (doc "Knights" table; server authoritative).
  const knightsTotal = myView !== null ? totalKnights(myView) : 0;
  const knightsActive = myView !== null ? activeKnights(myView) : 0;
  const canBuyKnight =
    canAct &&
    myView !== null &&
    myView.resources.sheep >= 1 &&
    myView.resources.ore >= 1 &&
    knightsTotal < CK_MAX_KNIGHTS;
  const canActivateKnight =
    canAct && myView !== null && myView.resources.wheat >= 1 && knightsActive < knightsTotal;
  const canPromoteKnight =
    canAct &&
    myView !== null &&
    myView.resources.sheep >= 1 &&
    myView.resources.ore >= 1 &&
    ck !== null &&
    (ck.knights.lv1 > 0 ||
      (ck.knights.lv2 > 0 &&
        ck.improvements.politics >= CK_MIGHTY_KNIGHT_POLITICS_LEVEL));

  // Group the progress hand by itype so each card type renders one chip.
  const handCounts = new Map<number, number>();
  for (const itype of cg.myProgressHand) {
    handCounts.set(itype, (handCounts.get(itype) ?? 0) + 1);
  }
  const handEntries = [...handCounts.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div data-testid="ck-panel">
      {/* My commodities */}
      {ck !== null && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Commodities</p>
          <div className={styles.commodities}>
            {COMMODITIES.map(({ key, label }) => (
              <span
                key={key}
                className={styles.commodityChip}
                data-testid={`ck-commodity-${key}`}
                data-commodity={key}
              >
                <span className={styles.commodityLabel}>{label}</span>
                <span className={styles.commodityValue}>{ck.commodities[key]}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Improvement tracks */}
      {ck !== null && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>City improvements</p>
          {TRACKS.map(({ track, key, testid, commodity, commodityLabel }) => {
            const level = ck.improvements[key];
            const nextCost = level + 1;
            const owner = cg.ckMetropolisOwners[track];
            const canBuild =
              canAct && level < 5 && ck.commodities[commodity] >= nextCost;
            return (
              <div className={styles.trackRow} key={key} data-testid={`ck-track-${testid}`}>
                <span className={styles.trackName}>{CK_TRACK_NAMES[track]}</span>
                <span className={styles.pips} aria-label={`Level ${level} of 5`}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span
                      key={i}
                      className={`${styles.pip} ${i <= level ? styles.pipFilled : ''}`}
                      aria-hidden="true"
                    />
                  ))}
                </span>
                {level < 5 ? (
                  <span className={styles.trackCost}>
                    next: {nextCost} {commodityLabel}
                  </span>
                ) : (
                  <span className={styles.trackCost}>max</span>
                )}
                {owner >= 0 && (
                  <span
                    className={styles.metropolisBadge}
                    data-testid={`ck-metropolis-${testid}`}
                  >
                    Metropolis: {seatName(cg, owner)}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid={`ck-build-${testid}`}
                  disabled={!canBuild}
                  onClick={() => ckBuyImprovement(track)}
                >
                  Build
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Knights */}
      {ck !== null && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Knights</p>
          <p className={styles.knightSummary} data-testid="ck-knights">
            basic ×{ck.knights.lv1} (active {ck.knights.activeLv1}) · strong ×
            {ck.knights.lv2} (active {ck.knights.activeLv2}) · mighty ×
            {ck.knights.lv3} (active {ck.knights.activeLv3})
          </p>
          <div className={styles.knightButtons}>
            <Button
              size="sm"
              variant="secondary"
              data-testid="ck-knight-buy"
              disabled={!canBuyKnight}
              onClick={ckBuyKnight}
              title="1 sheep + 1 ore"
            >
              Buy
            </Button>
            <Button
              size="sm"
              variant="secondary"
              data-testid="ck-knight-activate"
              disabled={!canActivateKnight}
              onClick={ckActivateKnight}
              title="1 wheat"
            >
              Activate
            </Button>
            <Button
              size="sm"
              variant="secondary"
              data-testid="ck-knight-promote"
              disabled={!canPromoteKnight}
              onClick={ckPromoteKnight}
              title="1 sheep + 1 ore; mighty requires Politics 3"
            >
              Promote
            </Button>
          </div>
        </div>
      )}

      {/* Barbarian track (game-level; shown to observers too) */}
      <BarbarianTrack strength={cg.ckBarbarianStrength} />

      {/* My progress-card hand */}
      {myView !== null && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Progress cards</p>
          {handEntries.length === 0 ? (
            <p className={styles.progressEmpty} data-testid="ck-progress-empty">
              No progress cards yet.
            </p>
          ) : (
            <div className={styles.progressHand}>
              {handEntries.map(([itype, count]) => (
                <div
                  key={itype}
                  className={styles.progressCard}
                  data-testid={`ck-progress-${itype}`}
                >
                  <span className={styles.progressCardName}>
                    {CK_PROGRESS_CARD_NAMES[itype] ?? `Progress card ${itype}`}
                    {count > 1 ? ` ×${count}` : ''}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid={`ck-progress-play-${itype}`}
                    disabled={!canPlayProgressCard(cg, itype)}
                    onClick={() => ckPlayProgressCard(itype)}
                  >
                    Play
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact C&K summary for another player's panel: commodities, knight totals,
 * improvement levels, hidden progress-hand count, and revealed VP progress
 * cards. (Metropolis badges render next to the player name; see GameScreen.)
 */
export function CKPlayerSummary({ view }: { view: PlayerView }): JSX.Element {
  const ck = view.ck;
  const vpCards = ck.vpProgressCards;
  return (
    <div className={styles.playerSummary} data-testid={`ck-player-${view.playerNumber}`}>
      <span className={styles.playerSummaryRow}>
        <span data-testid={`ck-player-commodities-${view.playerNumber}`}>
          Cloth {ck.commodities.cloth} · Coin {ck.commodities.coin} · Paper{' '}
          {ck.commodities.paper}
        </span>
      </span>
      <span className={styles.playerSummaryRow}>
        <span data-testid={`ck-player-knights-${view.playerNumber}`}>
          Knights {totalKnights(view)} (active {activeKnights(view)})
        </span>
        <span data-testid={`ck-player-improvements-${view.playerNumber}`}>
          T{ck.improvements.trade} P{ck.improvements.politics} S{ck.improvements.science}
        </span>
        <span data-testid={`ck-player-hand-${view.playerNumber}`}>
          Progress {ck.progressCards}
        </span>
      </span>
      {vpCards.length > 0 && (
        <span
          className={styles.playerSummaryRow}
          data-testid={`ck-player-vpcards-${view.playerNumber}`}
        >
          {vpCards
            .map((it) => CK_PROGRESS_CARD_NAMES[it] ?? `Card ${it}`)
            .join(', ')}
        </span>
      )}
    </div>
  );
}

/** How long the barbarian-attack banner stays up, in ms. */
const ATTACK_BANNER_MS = 6000;

/**
 * Transient banner announcing a barbarian-attack result. Re-shows on each new
 * attack (keyed by the attack's seq) and auto-hides after a few seconds.
 */
export function CKBarbarianBanner({
  attack,
}: {
  attack: CKBarbarianAttack;
}): JSX.Element | null {
  const [visibleSeq, setVisibleSeq] = useState<number>(attack.seq);

  useEffect(() => {
    setVisibleSeq(attack.seq);
    const t = setTimeout(() => setVisibleSeq(-1), ATTACK_BANNER_MS);
    return () => clearTimeout(t);
  }, [attack.seq]);

  if (visibleSeq !== attack.seq) {
    return null; // <--- Early return: banner timed out ---
  }

  return (
    <div
      className={`${styles.attackBanner} ${attack.defendersWon ? styles.attackBannerWon : ''}`}
      data-testid="ck-barbarian-banner"
      data-defenders-won={attack.defendersWon ? 'true' : 'false'}
      role="status"
    >
      Barbarians attacked! Strength {attack.strength} vs defense {attack.defense} —
      defenders {attack.defendersWon ? 'won' : 'lost'}.
    </div>
  );
}

/**
 * Trade Monopoly commodity picker: choose cloth/coin/paper; sends
 * SOCPickResourceType with the commodity constant (1..3) via pickMonopoly().
 */
export function CKCommodityPickDialog(): JSX.Element {
  return (
    <Dialog
      open
      onClose={() => undefined}
      hideCloseButton
      closeOnOverlayClick={false}
      title="Trade Monopoly — choose a commodity"
    >
      <div className={styles.picker} data-testid="ck-commodity-pick">
        <p className={styles.pickerSummary}>
          Every other player gives you 1 of the chosen commodity.
        </p>
        <div className={styles.pickerButtons}>
          {COMMODITIES.map(({ key, label, pickValue }) => (
            <Button
              key={key}
              variant="secondary"
              data-testid={`ck-pick-${key}`}
              onClick={() => pickMonopoly(pickValue)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

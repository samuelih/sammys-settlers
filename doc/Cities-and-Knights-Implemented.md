# Cities & Knights — implemented rules and protocol

This document describes the **shipped** Cities & Knights implementation (scenario `SC_CK`),
which realizes Phases 1–3 of [Cities-and-Knights-Design.md](Cities-and-Knights-Design.md).
Where the boxed game and this implementation differ, the difference is listed in
[Simplifications](#simplifications). All mechanics are gated on the `_CK_*` game options and
are inert in every other game.

## Scenario

`SC_CK` ("Cities & Knights") plays on the sea board with VP target 13:
option string `_SC_CK=t,_CK_IMP=t,_CK_KNI=t,_CK_PROG=t,_CK_BARB=t,_CK_METR=t,SBL=t,VP=t13`.

## Commodities (`_CK_IMP`)

Three commodities exist as per-player counters **separate from the 5-resource
`SOCResourceSet`** (design doc §5.3 step 2): cloth=1, coin=2, paper=3
(`SOCPlayer` commodity constants).

Production on a non-7 roll: each **city** adjacent to a producing hex yields
1 resource + 1 commodity instead of 2 resources:

| Hex      | City yields        |
|----------|--------------------|
| Pasture  | 1 sheep + 1 cloth  |
| Mountain | 1 ore + 1 coin     |
| Forest   | 1 wood + 1 paper   |

Hills and fields still yield 2 resources. Settlements are unchanged. The robber blocks the
hex as usual.

Wire: commodity counts are announced with `SOCPlayerElement`/`SOCPlayerElements`
`PEType`s `CK_CLOTH_COUNT(110)`, `CK_COIN_COUNT(111)`, `CK_PAPER_COUNT(112)`
(GAIN on production, SET on join/loss).

## City improvements (`_CK_IMP`)

Per-player special items `"_CK_IMP/T"` (Trade), `"_CK_IMP/P"` (Politics), `"_CK_IMP/S"`
(Science), each at the player's special-item index 0, levels 0–5, created for every player
in `updateAtBoardLayout()` (server and client).

Building level N costs **N of the track's commodity** (Trade=cloth, Politics=coin,
Science=paper). Purchase: client sends `SOCSetSpecialItem(OP_PICK, typeKey, gi=-1, pi=0)`
on the player's turn in `PLAY1`/`SPECIAL_BUILDING`. Server pays commodities (announced as
`SOCPlayerElement` SET of the commodity count), replies `OP_SET_PICK` with the new level,
then runs the metropolis check.

## Metropolis (`_CK_METR`)

For each track, the first player to reach level 4 claims that track's metropolis (+2 Special
VP). Another player can steal it only by exceeding the holder's level (i.e. reaching 5 while
the holder is at 4); the previous holder then loses the 2 SVP.

Wire: `SOCSimpleAction` `CK_METROPOLIS_CLAIMED(1005)` with value1=track (0=Trade, 1=Politics,
2=Science), value2=new owner player number, preceded by `SOCPlayerElement(SCENARIO_SVP, SET)`
for each affected player.

## Knights (`_CK_KNI`)

Knights are **per-player state**, not board pieces (design doc §3.1): counts by level
(1=basic, 2=strong, 3=mighty), each count split active/inactive. A player may have at most
6 knights total. Mighty promotion requires Politics improvement level ≥ 3.

| Action            | Cost            | Effect |
|-------------------|-----------------|--------|
| Buy knight        | 1 sheep + 1 ore | +1 inactive basic knight |
| Activate knight   | 1 wheat         | lowest-level inactive knight becomes active |
| Promote knight    | 1 sheep + 1 ore | lowest-level knight (active or not, prefers inactive) goes up one level; level 3 requires Politics ≥ 3 |

Wire: client sends `SOCSimpleRequest` `CK_BUY_KNIGHT(1002)`, `CK_ACTIVATE_KNIGHT(1003)`,
`CK_PROMOTE_KNIGHT(1004)` on their turn in `PLAY1`. Server pays resources (standard
`SOCPlayerElement` LOSE messages), then announces the new knight counts with `PEType`s
`CK_KNIGHTS_LV1..LV3(113..115)` (total per level) and `CK_KNIGHTS_ACTIVE_LV1..LV3(116..118)`
(active per level), all SET. A denied request is echoed back with pn=-1 per the
`SOCSimpleRequest` convention.

## Barbarians (`_CK_BARB`)

The barbarian strength counter advances by 1 on **every dice roll** and is announced with
`SOCGameElements` `GEType CK_BARBARIAN_STRENGTH(11)`. When it reaches 7 the barbarians
attack, then the counter resets to 0:

- Barbarian strength = total cities of all players (a metropolis counts, but is immune to
  loss).
- Catan's defense = Σ over players of (knight level × active knights of that level).
- **Defense ≥ strength:** defenders win. The sole player with the highest non-zero
  contribution is "Defender of Catan": +1 Special VP. On a tie, each tied player instead
  draws a progress card (if `_CK_PROG`).
- **Defense < strength:** every player who owns ≥1 city and has the (joint-)lowest defense
  contribution loses one city: it is downgraded to a settlement (announced as standard
  `SOCRemovePiece`(city) + `SOCPutPiece`(settlement) so all clients and bots stay in sync).
  Metropolis cities are immune; if all of a victim's cities are metropolises, they lose
  nothing.
- After any attack, **all active knights deactivate** (counts re-announced).

Wire: `SOCSimpleAction` `CK_BARBARIAN_ATTACK_RESULT(1004)` value1=barbarian strength,
value2=defense, sent before the per-player consequences;
`CK_DEFENDER_OF_CATAN(1006)` value1=player number, value2=new SVP total of that player.

## Progress cards (`_CK_PROG`)

Three decks (Trade / Politics / Science) of `SOCInventoryItem`s, itypes 11–19. On each
non-7 roll, die1 selects the deck (1-2 Trade, 3-4 Politics, 5-6 Science) and **every** seated
player whose matching improvement-track level L ≥ 1 and die2 ≤ L+1 draws that deck's top
card (hand limit 4; victory-point cards are exempt, are revealed immediately, and are worth
+1 SVP on draw). Played cards return to the bottom of their deck.

| itype | Card | Deck | Effect |
|-------|------|------|--------|
| 11 | Resource Monopoly | Trade | name a resource; take up to 2 of it from each other player |
| 12 | Trade Monopoly | Trade | name a commodity; take 1 of it from each other player |
| 13 | Master Merchant | Trade | take 2 random resources from the opponent holding the most resources |
| 14 | Warlord | Politics | activate all your inactive knights for free |
| 15 | Wedding | Politics | each player with more VP than you gives you 1 random resource |
| 16 | Constitution | Politics | +1 VP (revealed and scored when drawn) |
| 17 | Irrigation | Science | gain 2 wheat per distinct fields hex adjacent to your settlements/cities |
| 18 | Mining | Science | gain 2 ore per distinct mountains hex adjacent to your settlements/cities |
| 19 | Printer | Science | +1 VP (revealed and scored when drawn) |

Deck composition (each deck 10 cards): Trade = 4× Resource Monopoly, 4× Trade Monopoly,
2× Master Merchant; Politics = 5× Warlord, 4× Wedding, 1× Constitution; Science =
5× Irrigation, 4× Mining, 1× Printer.

Playing: unlike dev cards there is **no one-per-turn limit and no new-card delay**; cards are
playable the turn they are drawn, on the holder's turn in `ROLL_OR_CARD`/`PLAY1`
(Resource/Trade Monopoly only in `PLAY1`).

Wire:
- Draw: server sends the drawing player `SOCInventoryItemAction(ADD_PLAYABLE, itype)`;
  other players see `ADD_PLAYABLE` with itype = 0 (hidden hand). VP cards are announced to
  all with their real itype as `ADD_OTHER` with `isKept` and `isVP` set, plus the SVP
  element message.
- Play: client sends `SOCInventoryItemAction(PLAY, itype)`. Server validates, replies
  `PLAYED` (or `CANNOT_PLAY` privately), applies the effect, and announces resulting
  element/text messages.
- Resource Monopoly / Trade Monopoly set game state `WAITING_FOR_MONOPOLY`; the client then
  sends `SOCPickResourceType` with a resource constant 1–5 (Resource Monopoly) or commodity
  constant 1–3 (Trade Monopoly). Results are announced with the same element + text pattern
  as dev-card Monopoly, capped per the card.

## Joining / reconnecting

`SOCGameHandler` sends a joining client all C&K state: commodity counts, knight counts,
improvement levels (`SOCSetSpecialItem(OP_SET)` per player track with level > 0), barbarian
strength, metropolis owners (`CK_METROPOLIS_CLAIMED` per owned track), and the joining
player's own progress-card hand.

## Bots

Built-in bots join `SC_CK` games and play the base game: they ignore the unknown `PEType`s /
`SOCSimpleAction`s, never buy knights/improvements and never play progress cards, so no new
decision states can block them. City downgrades reach bots as standard
`SOCRemovePiece`/`SOCPutPiece`, keeping their board model consistent.

## Simplifications

Differences from the boxed game, chosen to fit JSettlers' architecture (see design doc):

- No event/red dice: the standard dice double as them (die1 = deck select, die2 = draw gate;
  barbarians advance every roll instead of on the ship face).
- Knights are not placed on the board (no placement, movement, robber-chasing, or
  intersection blocking); they exist as leveled counts per player.
- Defender of Catan tie-break draws from a random deck rather than a chosen one.
- Barbarian city loss picks the victim's oldest non-metropolis city automatically.
- Progress deck is a subset (9 card types); Alchemist, Deserter, Spy, Saboteur, Bishop,
  Diplomat, Intrigue, Crane, Engineer, Inventor, Medicine, Smith, Commercial Harbor,
  Merchant, and Merchant Fleet are not implemented.
- City walls, the merchant pawn, and 2:1 commodity ports are not implemented.
- Improvement purchase doesn't require owning a city, and metropolis is tracked per player
  rather than attached to a specific city.
- Largest Army remains in effect (standard dev cards are still in the game alongside
  progress cards).
- `*SAVEGAME*`/`*LOADGAME*` does not yet persist C&K state.

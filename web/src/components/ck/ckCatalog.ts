import { CKProgressCard } from '../../protocol';

export type CKDeckKey = 'trade' | 'politics' | 'science';

export type CKSupport = 'implemented' | 'partial' | 'reference';

export interface CKDeckInfo {
  key: CKDeckKey;
  name: string;
  commodity: 'cloth' | 'coin' | 'paper';
  color: 'trade' | 'politics' | 'science';
  officialCount: number;
}

export interface CKProgressCatalogEntry {
  slug: string;
  name: string;
  legacyNames?: readonly string[];
  deck: CKDeckKey;
  count: number;
  timing: string;
  summary: string;
  itemType?: number;
  support: CKSupport;
  supportNote: string;
}

export interface CKComponentEntry {
  name: string;
  count: string;
  icon: string;
  summary: string;
  support: CKSupport;
}

export const CK_DECKS: readonly CKDeckInfo[] = [
  { key: 'trade', name: 'Trade', commodity: 'cloth', color: 'trade', officialCount: 18 },
  { key: 'politics', name: 'Politics', commodity: 'coin', color: 'politics', officialCount: 18 },
  { key: 'science', name: 'Science', commodity: 'paper', color: 'science', officialCount: 18 },
];

export const CK_DECK_BY_KEY: Readonly<Record<CKDeckKey, CKDeckInfo>> = CK_DECKS.reduce(
  (acc, deck) => ({ ...acc, [deck.key]: deck }),
  {} as Record<CKDeckKey, CKDeckInfo>,
);

/**
 * Official 2025 CATAN Cities & Knights progress-card catalog.
 *
 * Summaries are intentionally short paraphrases for in-app reference. The
 * server currently implements the item types listed in `itemType`; entries
 * without one are shown as reference-only until the Java rules layer supports
 * them.
 */
export const CK_PROGRESS_CATALOG: readonly CKProgressCatalogEntry[] = [
  {
    slug: 'commercial-harbor',
    name: 'Commercial Harbor',
    deck: 'trade',
    count: 2,
    timing: 'Action phase',
    summary: 'Offer one resource to each opponent; each gives a commodity if able.',
    support: 'reference',
    supportNote: 'Needs commodity-aware player trade selection.',
  },
  {
    slug: 'guild-dues',
    name: 'Guild Dues',
    legacyNames: ['Master Merchant'],
    deck: 'trade',
    count: 2,
    timing: 'Action phase',
    summary: 'Take two resource or commodity cards from one player with more VP.',
    itemType: CKProgressCard.MASTER_MERCHANT,
    support: 'partial',
    supportNote: 'Server takes two random resources from the richest opponent.',
  },
  {
    slug: 'merchant',
    name: 'Merchant',
    deck: 'trade',
    count: 6,
    timing: 'Action phase',
    summary: 'Place the merchant by your building for 2:1 trades and +1 VP.',
    support: 'reference',
    supportNote: 'Needs merchant piece, hex ownership, and temporary 2:1 trade state.',
  },
  {
    slug: 'merchant-fleet',
    name: 'Merchant Fleet',
    deck: 'trade',
    count: 2,
    timing: 'Action phase',
    summary: 'Choose a resource or commodity; trade it 2:1 for the rest of the turn.',
    support: 'reference',
    supportNote: 'Needs turn-scoped commodity/resource maritime-rate override.',
  },
  {
    slug: 'resource-monopoly',
    name: 'Resource Monopoly',
    deck: 'trade',
    count: 4,
    timing: 'Action phase',
    summary: 'Name a resource; each opponent gives up to two of it.',
    itemType: CKProgressCard.RESOURCE_MONOPOLY,
    support: 'implemented',
    supportNote: 'Playable through the server-backed monopoly picker.',
  },
  {
    slug: 'trade-monopoly',
    name: 'Trade Monopoly',
    deck: 'trade',
    count: 2,
    timing: 'Action phase',
    summary: 'Name a commodity; each opponent gives one of it if able.',
    itemType: CKProgressCard.TRADE_MONOPOLY,
    support: 'implemented',
    supportNote: 'Playable through the C&K commodity picker.',
  },
  {
    slug: 'diplomacy',
    name: 'Diplomacy',
    legacyNames: ['Diplomat'],
    deck: 'politics',
    count: 2,
    timing: 'Action phase',
    summary: 'Remove an open road; if it is yours, build one road for free.',
    support: 'reference',
    supportNote: 'Needs open-route analysis and remove/build follow-up flow.',
  },
  {
    slug: 'encouragement',
    name: 'Encouragement',
    legacyNames: ['Warlord'],
    deck: 'politics',
    count: 2,
    timing: 'Action phase',
    summary: 'Activate all of your inactive knights at no cost.',
    itemType: CKProgressCard.WARLORD,
    support: 'implemented',
    supportNote: 'Server implements the older Warlord-named equivalent.',
  },
  {
    slug: 'espionage',
    name: 'Espionage',
    legacyNames: ['Spy'],
    deck: 'politics',
    count: 3,
    timing: 'Action phase',
    summary: 'Inspect another progress-card hand and take one non-VP card.',
    support: 'reference',
    supportNote: 'Needs hidden-hand reveal and card-steal targeting UI.',
  },
  {
    slug: 'intrigue',
    name: 'Intrigue',
    deck: 'politics',
    count: 2,
    timing: 'Action phase',
    summary: 'Displace an opponent knight connected to one of your routes.',
    support: 'reference',
    supportNote: 'Needs board-placed knights and displacement rules.',
  },
  {
    slug: 'sabotage',
    name: 'Sabotage',
    legacyNames: ['Saboteur'],
    deck: 'politics',
    count: 2,
    timing: 'Action phase',
    summary: 'Players with at least your VP discard half their resource/commodity hand.',
    support: 'reference',
    supportNote: 'Needs commodity-aware discard prompts.',
  },
  {
    slug: 'taxation',
    name: 'Taxation',
    legacyNames: ['Bishop'],
    deck: 'politics',
    count: 2,
    timing: 'Action phase',
    summary: 'Move the robber and steal one random card from each adjacent owner.',
    support: 'reference',
    supportNote: 'Needs multi-victim robber resolution and commodity stealing.',
  },
  {
    slug: 'treason',
    name: 'Treason',
    legacyNames: ['Deserter'],
    deck: 'politics',
    count: 2,
    timing: 'Action phase',
    summary: 'An opponent removes a knight; you may place one no stronger.',
    support: 'reference',
    supportNote: 'Needs board-placed knight inventory and placement flow.',
  },
  {
    slug: 'constitution',
    name: 'Constitution',
    deck: 'politics',
    count: 1,
    timing: 'Immediate',
    summary: 'Revealed victory point progress card.',
    itemType: CKProgressCard.CONSTITUTION,
    support: 'implemented',
    supportNote: 'Revealed and scored immediately when drawn.',
  },
  {
    slug: 'wedding',
    name: 'Wedding',
    deck: 'politics',
    count: 2,
    timing: 'Action phase',
    summary: 'Players with more VP give you two resource/commodity cards if able.',
    itemType: CKProgressCard.WEDDING,
    support: 'partial',
    supportNote: 'Server takes one random resource from each higher-VP opponent.',
  },
  {
    slug: 'alchemy',
    name: 'Alchemy',
    legacyNames: ['Alchemist'],
    deck: 'science',
    count: 2,
    timing: 'Before dice',
    summary: 'Choose the production dice result, then resolve the event die normally.',
    support: 'reference',
    supportNote: 'Needs pre-roll progress-card play and event die support.',
  },
  {
    slug: 'crane',
    name: 'Crane',
    deck: 'science',
    count: 2,
    timing: 'Action phase',
    summary: 'Build one city improvement for one fewer commodity.',
    support: 'reference',
    supportNote: 'Needs one-shot improvement discount state.',
  },
  {
    slug: 'engineering',
    name: 'Engineering',
    legacyNames: ['Engineer'],
    deck: 'science',
    count: 1,
    timing: 'Action phase',
    summary: 'Build one city wall at no cost.',
    support: 'reference',
    supportNote: 'Needs city-wall pieces and wall inventory.',
  },
  {
    slug: 'invention',
    name: 'Invention',
    legacyNames: ['Inventor'],
    deck: 'science',
    count: 2,
    timing: 'Action phase',
    summary: 'Swap two number discs, except 2, 6, 8, or 12.',
    support: 'reference',
    supportNote: 'Needs number-token mutation messages and board update UX.',
  },
  {
    slug: 'irrigation',
    name: 'Irrigation',
    deck: 'science',
    count: 2,
    timing: 'Action phase',
    summary: 'Gain two wheat for each distinct adjacent fields hex.',
    itemType: CKProgressCard.IRRIGATION,
    support: 'implemented',
    supportNote: 'Server grants wheat from adjacent fields.',
  },
  {
    slug: 'medicine',
    name: 'Medicine',
    deck: 'science',
    count: 2,
    timing: 'Action phase',
    summary: 'Upgrade one settlement to a city for one wheat and two ore.',
    support: 'reference',
    supportNote: 'Needs discounted city-build targeting.',
  },
  {
    slug: 'mining',
    name: 'Mining',
    deck: 'science',
    count: 2,
    timing: 'Action phase',
    summary: 'Gain two ore for each distinct adjacent mountains hex.',
    itemType: CKProgressCard.MINING,
    support: 'implemented',
    supportNote: 'Server grants ore from adjacent mountains.',
  },
  {
    slug: 'road-building',
    name: 'Road Building',
    deck: 'science',
    count: 2,
    timing: 'Action phase',
    summary: 'Build two roads at no cost.',
    support: 'reference',
    supportNote: 'Needs progress-card-specific free-route placement.',
  },
  {
    slug: 'smithing',
    name: 'Smithing',
    legacyNames: ['Smith'],
    deck: 'science',
    count: 2,
    timing: 'Action phase',
    summary: 'Promote up to two knights at no cost.',
    support: 'reference',
    supportNote: 'Needs explicit knight selection and free promotion flow.',
  },
  {
    slug: 'printing',
    name: 'Printing',
    legacyNames: ['Printer'],
    deck: 'science',
    count: 1,
    timing: 'Immediate',
    summary: 'Revealed victory point progress card.',
    itemType: CKProgressCard.PRINTER,
    support: 'implemented',
    supportNote: 'Server implements this as Printer and scores it immediately.',
  },
];

export const CK_PROGRESS_BY_ITEM_TYPE: Readonly<Record<number, CKProgressCatalogEntry>> =
  CK_PROGRESS_CATALOG.reduce((acc, card) => {
    if (card.itemType !== undefined) {
      acc[card.itemType] = card;
    }
    return acc;
  }, {} as Record<number, CKProgressCatalogEntry>);

export const CK_PROGRESS_CARD_NAMES: Readonly<Record<number, string>> =
  Object.fromEntries(
    Object.entries(CK_PROGRESS_BY_ITEM_TYPE).map(([itype, card]) => [
      Number(itype),
      card.name,
    ]),
  ) as Record<number, string>;

export const CK_COMPONENTS: readonly CKComponentEntry[] = [
  {
    name: 'Commodity cards',
    count: '36',
    icon: 'commodity',
    summary: '12 cloth, 12 coin, and 12 paper cards. Cities on pasture, mountains, and forest produce one resource plus one commodity.',
    support: 'implemented',
  },
  {
    name: 'Progress cards',
    count: '54',
    icon: 'progress',
    summary: '18 Trade, 18 Politics, and 18 Science cards. The webapp lists every official card below.',
    support: 'partial',
  },
  {
    name: 'Event and red dice',
    count: '3 dice',
    icon: 'dice',
    summary: 'Official C&K uses an event die plus a red production die to move barbarians and draw progress cards.',
    support: 'partial',
  },
  {
    name: 'Knights',
    count: '24',
    icon: 'knight',
    summary: 'Each player has six board knights: two basic, two strong, and two mighty.',
    support: 'partial',
  },
  {
    name: 'City walls',
    count: '12',
    icon: 'wall',
    summary: 'Three per player; each wall under a city raises the 7-roll hand limit by two.',
    support: 'reference',
  },
  {
    name: 'Metropolises',
    count: '3',
    icon: 'metropolis',
    summary: 'One for each improvement track, placed on cities and worth two additional VP.',
    support: 'partial',
  },
  {
    name: 'Merchant',
    count: '1',
    icon: 'merchant',
    summary: 'Controlled through Merchant cards for one VP and 2:1 trades on its hex resource.',
    support: 'reference',
  },
  {
    name: 'Barbarian ship',
    count: '1',
    icon: 'barbarian',
    summary: 'Moves along the barbarian track and triggers attacks when it reaches Catan.',
    support: 'partial',
  },
  {
    name: 'Defender VP tokens',
    count: '6',
    icon: 'vp',
    summary: 'Awarded to the sole strongest defender after a successful barbarian defense.',
    support: 'implemented',
  },
  {
    name: 'Improvement boards and cubes',
    count: '4 boards, 12 cubes',
    icon: 'improvement',
    summary: 'Track Trade, Politics, and Science levels from basic city through level five.',
    support: 'implemented',
  },
];

export function progressDeckTotal(deck: CKDeckKey): number {
  return CK_PROGRESS_CATALOG
    .filter((card) => card.deck === deck)
    .reduce((sum, card) => sum + card.count, 0);
}

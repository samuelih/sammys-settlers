import { describe, expect, it } from 'vitest';

import { CKProgressCard } from '../../protocol';
import {
  CK_COMPONENTS,
  CK_DECKS,
  CK_PROGRESS_BY_ITEM_TYPE,
  CK_PROGRESS_CATALOG,
  progressDeckTotal,
} from './ckCatalog';

describe('Cities & Knights official catalog', () => {
  it('lists the full official 54-card progress deck', () => {
    expect(CK_PROGRESS_CATALOG.reduce((sum, card) => sum + card.count, 0)).toBe(54);
    for (const deck of CK_DECKS) {
      expect(progressDeckTotal(deck.key)).toBe(deck.officialCount);
    }
  });

  it('maps server-backed item types to their official current-edition names', () => {
    expect(CK_PROGRESS_BY_ITEM_TYPE[CKProgressCard.WARLORD]?.name).toBe('Encouragement');
    expect(CK_PROGRESS_BY_ITEM_TYPE[CKProgressCard.MASTER_MERCHANT]?.legacyNames).toContain('Master Merchant');
    expect(CK_PROGRESS_BY_ITEM_TYPE[CKProgressCard.PRINTER]?.name).toBe('Printing');
  });

  it('includes the official C&K pieces and materials missing from the old web panel', () => {
    expect(CK_COMPONENTS.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'City walls',
        'Merchant',
        'Metropolises',
        'Barbarian ship',
        'Event and red dice',
      ]),
    );
  });
});

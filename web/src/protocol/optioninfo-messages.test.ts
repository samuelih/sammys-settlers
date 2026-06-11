import { describe, it, expect } from 'vitest';
import {
  decode,
  encode,
  SOCGameOptionGetInfos,
  SOCGameOptionGetDefaults,
  SOCGameOptionInfo,
  SOCScenarioInfo,
} from './index';
import { OptionType } from './constants';

// Wire strings verified against the real Java classes (TAB = EMPTYSTR "\t").

describe('SOCGameOptionGetInfos', () => {
  it('matches Java: empty list -> "1081|-"', () => {
    expect(new SOCGameOptionGetInfos(null, false, false).toCmd()).toBe(
      '1081|-',
    );
  });

  it('matches Java: key list', () => {
    expect(
      new SOCGameOptionGetInfos(['PL', 'BC'], false, false).toCmd(),
    ).toBe('1081|PL,BC');
  });

  it('matches Java: key list + ?I18N', () => {
    expect(new SOCGameOptionGetInfos(['PL', 'BC'], true, false).toCmd()).toBe(
      '1081|PL,BC,?I18N',
    );
  });

  it('matches Java: "-" + ?I18N (older client)', () => {
    expect(new SOCGameOptionGetInfos(null, true, false).toCmd()).toBe(
      '1081|-,?I18N',
    );
  });

  it('matches Java: only ?I18N (same version)', () => {
    expect(new SOCGameOptionGetInfos(null, true, true).toCmd()).toBe(
      '1081|?I18N',
    );
  });

  it('decodes a key list', () => {
    const m = decode('1081|PL,BC') as SOCGameOptionGetInfos;
    expect(m.optionKeys).toEqual(['PL', 'BC']);
    expect(m.hasTokenGetI18nDescs).toBe(false);
    expect(m.hasOnlyTokenI18n).toBe(false);
  });

  it('decodes "-" to null keys', () => {
    const m = decode('1081|-') as SOCGameOptionGetInfos;
    expect(m.optionKeys).toBeNull();
  });

  it('decodes only-?I18N', () => {
    const m = decode('1081|?I18N') as SOCGameOptionGetInfos;
    expect(m.optionKeys).toBeNull();
    expect(m.hasTokenGetI18nDescs).toBe(true);
    expect(m.hasOnlyTokenI18n).toBe(true);
  });

  it('pulls ?CHANGES out of the list (Java parity, not byte-identical)', () => {
    const m = decode('1081|PL,?CHANGES') as SOCGameOptionGetInfos;
    expect(m.optionKeys).toEqual(['PL']);
    expect(m.hasTokenGetAnyChanges).toBe(true);
    // Java re-encodes to "1081|PL" (the marker is now a separate flag).
    expect(m.toCmd()).toBe('1081|PL');
  });

  it('returns null when "-" is mixed with specific keys', () => {
    expect(decode('1081|-,PL')).toBeNull();
  });

  it('round-trips the byte-stable shapes', () => {
    for (const m of [
      new SOCGameOptionGetInfos(null, false, false),
      new SOCGameOptionGetInfos(['PL', 'BC'], false, false),
      new SOCGameOptionGetInfos(['PL', 'BC'], true, false),
      new SOCGameOptionGetInfos(null, true, false),
      new SOCGameOptionGetInfos(null, true, true),
    ]) {
      const back = decode(encode(m)) as SOCGameOptionGetInfos;
      expect(back).toBeInstanceOf(SOCGameOptionGetInfos);
      expect(back.toCmd()).toBe(m.toCmd());
    }
  });
});

describe('SOCGameOptionGetDefaults', () => {
  it('matches Java: with opts', () => {
    expect(new SOCGameOptionGetDefaults('PL=4,BC=t4').toCmd()).toBe(
      '1080|PL=4,BC=t4',
    );
  });

  it('matches Java: null opts -> just the type id', () => {
    expect(new SOCGameOptionGetDefaults(null).toCmd()).toBe('1080');
  });

  it('decodes empty data to null opts', () => {
    expect((decode('1080') as SOCGameOptionGetDefaults).opts).toBeNull();
  });

  it('decodes an opts string', () => {
    expect((decode('1080|PL=4,BC=t4') as SOCGameOptionGetDefaults).opts).toBe(
      'PL=4,BC=t4',
    );
  });

  it('round-trips', () => {
    for (const m of [
      new SOCGameOptionGetDefaults(null),
      new SOCGameOptionGetDefaults('PL=4'),
    ]) {
      const back = decode(encode(m)) as SOCGameOptionGetDefaults;
      expect(back).toBeInstanceOf(SOCGameOptionGetDefaults);
      expect(back).toEqual(m);
    }
  });
});

describe('SOCGameOptionInfo (multi-message)', () => {
  // Ground-truth wire strings captured from the real Java class.
  const PL = '1082|PL|2|-1|1108|f|4|2|6|f|4|0|Maximum # players';
  const VP = '1082|VP|3|-1|2000|f|10|10|20|f|10|1|Victory points to win: #';
  const BC =
    '1082|BC|3|-1|1107|t|4|3|9|t|4|0|Break up clumps of # or more same-type hexes/ports';
  const N7 = '1082|N7|3|-1|1107|f|7|1|999|f|7|0|Roll no 7s during first # rounds';
  const PLB = '1082|PLB|1|1108|1113|f|0|0|0|f|0|1|Use 6-player board';
  const SC = '1082|SC|6|2000|2000|f|0|0|8|f|\t|1|Game Scenario: #';
  const NOMORE = '1082|-|0|2147483647|2147483647|f|0|0|0|f|0|f|-';

  it('decodes an OTYPE_INT option (PL)', () => {
    const m = decode(PL) as SOCGameOptionInfo;
    expect(m.key).toBe('PL');
    expect(m.optType).toBe(OptionType.OTYPE_INT);
    expect(m.minVersion).toBe(-1);
    expect(m.lastModVersion).toBe(1108);
    expect(m.defaultIntValue).toBe(4);
    expect(m.minIntValue).toBe(2);
    expect(m.maxIntValue).toBe(6);
    expect(m.curIntValue).toBe(4);
    expect(m.optFlags).toBe(0);
    expect(m.desc).toBe('Maximum # players');
  });

  it('decodes an OTYPE_INTBOOL option (VP) with FLAG_DROP_IF_UNUSED', () => {
    const m = decode(VP) as SOCGameOptionInfo;
    expect(m.optType).toBe(OptionType.OTYPE_INTBOOL);
    expect(m.defaultBoolValue).toBe(false);
    expect(m.defaultIntValue).toBe(10);
    expect(m.maxIntValue).toBe(20);
    expect(m.optFlags).toBe(1); // FLAG_DROP_IF_UNUSED
  });

  it('decodes an OTYPE_BOOL option (PLB)', () => {
    const m = decode(PLB) as SOCGameOptionInfo;
    expect(m.optType).toBe(OptionType.OTYPE_BOOL);
    expect(m.minVersion).toBe(1108);
    expect(m.curBoolValue).toBe(false);
  });

  it('decodes an OTYPE_STR option (SC) with EMPTYSTR current value', () => {
    const m = decode(SC) as SOCGameOptionInfo;
    expect(m.optType).toBe(OptionType.OTYPE_STR);
    expect(m.maxIntValue).toBe(8); // max string length
    expect(m.curStrValue).toBeNull(); // empty -> null
    expect(m.desc).toBe('Game Scenario: #');
  });

  it('decodes the end-of-list marker (legacy "f" flags field preserved)', () => {
    const m = decode(NOMORE) as SOCGameOptionInfo;
    expect(m.key).toBe('-');
    expect(m.optType).toBe(OptionType.OTYPE_UNKNOWN);
    expect(m.isNoMoreOpts()).toBe(true);
    expect(m.desc).toBe('-');
    // Java's OPTINFO_NO_MORE_OPTS is built with cliVers=0, so field [10] is the
    // legacy 'f' (FLAG_DROP_IF_UNUSED unset) rather than the integer "0".
    expect(m.optFlags).toBe(0);
    expect(m.flagsWireForm).toBe('f');
  });

  it('re-encodes to the exact Java wire string for each type', () => {
    for (const wire of [PL, VP, BC, N7, PLB, SC, NOMORE]) {
      const m = decode(wire) as SOCGameOptionInfo;
      expect(m).toBeInstanceOf(SOCGameOptionInfo);
      expect(m.toCmd()).toBe(wire);
    }
  });

  it('round-trips an ENUM option (synthetic; no ENUM in default known set)', () => {
    // OTYPE_ENUM=4: maxIntValue is the number of choices; fields [12+] are them.
    const wire =
      '1082|UR|4|2000|2000|f|2|1|3|f|2|0|Pick one: #|First|Second|Third';
    const m = decode(wire) as SOCGameOptionInfo;
    expect(m.optType).toBe(OptionType.OTYPE_ENUM);
    expect(m.maxIntValue).toBe(3);
    expect(m.enumVals).toEqual(['First', 'Second', 'Third']);
    expect(m.toCmd()).toBe(wire);
  });

  it('returns null when fewer than 11 fields (garbled)', () => {
    expect(decode('1082|PL|2|-1|1108|f|4|2|6|f|4')).toBeNull();
  });
});

describe('SOCScenarioInfo (multi-message)', () => {
  // Ground-truth wire strings captured from the real Java class.
  it('decodes a full server reply', () => {
    const wire = '1101|SC_NSHO|2000|2000|_SC_SEAC=t,SBL=t,VP=t13|New Shores';
    const m = decode(wire) as SOCScenarioInfo;
    expect(m.isFromServer).toBe(true);
    expect(m.isKeyUnknown).toBe(false);
    expect(m.noMoreScens).toBe(false);
    expect(m.scKey).toBe('SC_NSHO');
    expect(m.scenario).not.toBeNull();
    expect(m.scenario?.minVersion).toBe(2000);
    expect(m.scenario?.opts).toBe('_SC_SEAC=t,SBL=t,VP=t13');
    expect(m.scenario?.title).toBe('New Shores');
    expect(m.scenario?.longDesc).toBeNull();
    expect(m.toCmd()).toBe(wire);
  });

  it('decodes the end-of-list marker', () => {
    const m = decode('1101|-') as SOCScenarioInfo;
    expect(m.isFromServer).toBe(true);
    expect(m.noMoreScens).toBe(true);
    expect(m.scKey).toBe('-');
    expect(m.toCmd()).toBe('1101|-');
  });

  it('decodes an unknown-key server reply', () => {
    const m = decode('1101|SC_FAKE|0|-2') as SOCScenarioInfo;
    expect(m.isFromServer).toBe(true);
    expect(m.isKeyUnknown).toBe(true);
    expect(m.scKey).toBe('SC_FAKE');
    expect(m.toCmd()).toBe('1101|SC_FAKE|0|-2');
  });

  it('decodes a client single-key request', () => {
    const m = decode('1101|[|SC_NSHO') as SOCScenarioInfo;
    expect(m.isFromServer).toBe(false);
    expect(m.requestKeys).toEqual(['SC_NSHO']);
    expect(m.requestAnyChanged).toBe(false);
    expect(m.toCmd()).toBe('1101|[|SC_NSHO');
  });

  it('decodes a client key-list + any-changed request', () => {
    const m = decode('1101|[|SC_NSHO|SC_4ISL|?') as SOCScenarioInfo;
    expect(m.isFromServer).toBe(false);
    expect(m.requestKeys).toEqual(['SC_NSHO', 'SC_4ISL']);
    expect(m.requestAnyChanged).toBe(true);
    expect(m.toCmd()).toBe('1101|[|SC_NSHO|SC_4ISL|?');
  });

  it('decodes a client any-changed-only request', () => {
    const m = decode('1101|?') as SOCScenarioInfo;
    expect(m.isFromServer).toBe(false);
    expect(m.requestKeys).toBeNull();
    expect(m.requestAnyChanged).toBe(true);
    expect(m.toCmd()).toBe('1101|?');
  });

  it('builds the same wire strings via the factory helpers', () => {
    expect(SOCScenarioInfo.requestKey('SC_NSHO').toCmd()).toBe(
      '1101|[|SC_NSHO',
    );
    expect(
      SOCScenarioInfo.request(['SC_NSHO', 'SC_4ISL'], true).toCmd(),
    ).toBe('1101|[|SC_NSHO|SC_4ISL|?');
    expect(SOCScenarioInfo.request([], true).toCmd()).toBe('1101|?');
    expect(SOCScenarioInfo.noMore().toCmd()).toBe('1101|-');
    expect(SOCScenarioInfo.unknownKey('SC_FAKE').toCmd()).toBe(
      '1101|SC_FAKE|0|-2',
    );
    expect(
      SOCScenarioInfo.fromServer({
        key: 'SC_NSHO',
        minVersion: 2000,
        lastModVersion: 2000,
        opts: '_SC_SEAC=t,SBL=t,VP=t13',
        title: 'New Shores',
        longDesc: null,
      }).toCmd(),
    ).toBe('1101|SC_NSHO|2000|2000|_SC_SEAC=t,SBL=t,VP=t13|New Shores');
  });

  it('throws when building an empty request', () => {
    expect(() => SOCScenarioInfo.request([], false)).toThrow();
  });
});

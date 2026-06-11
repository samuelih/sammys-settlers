import { describe, it, expect } from 'vitest';
import {
  descriptorFromInfo,
  optTypeName,
  optTypeCode,
  packValue,
  serializeOptions,
  parseOptions,
  parseDefaultsKeys,
  mergeDefaultValue,
  type GameOptionDescriptor,
} from './gameOptions';
import { decode, SOCGameOptionInfo } from './index';
import { OptionType } from './constants';

describe('optTypeName / optTypeCode', () => {
  it('maps the real OTYPE_* values to type names', () => {
    expect(optTypeName(OptionType.OTYPE_UNKNOWN)).toBe('unknown');
    expect(optTypeName(OptionType.OTYPE_BOOL)).toBe('bool');
    expect(optTypeName(OptionType.OTYPE_INT)).toBe('int');
    expect(optTypeName(OptionType.OTYPE_INTBOOL)).toBe('intbool');
    expect(optTypeName(OptionType.OTYPE_ENUM)).toBe('enum');
    expect(optTypeName(OptionType.OTYPE_ENUMBOOL)).toBe('enumbool');
    expect(optTypeName(OptionType.OTYPE_STR)).toBe('str');
    expect(optTypeName(OptionType.OTYPE_STRHIDE)).toBe('strhide');
  });

  it('round-trips name <-> code', () => {
    for (const n of [
      'bool',
      'int',
      'intbool',
      'enum',
      'enumbool',
      'str',
      'strhide',
      'unknown',
    ] as const) {
      expect(optTypeName(optTypeCode(n))).toBe(n);
    }
  });
});

describe('descriptorFromInfo', () => {
  it('builds an INT descriptor (PL)', () => {
    const info = decode(
      '1082|PL|2|-1|1108|f|4|2|6|f|4|0|Maximum # players',
    ) as SOCGameOptionInfo;
    const d = descriptorFromInfo(info);
    expect(d.key).toBe('PL');
    expect(d.optType).toBe('int');
    expect(d.defaultIntValue).toBe(4);
    expect(d.minIntValue).toBe(2);
    expect(d.maxIntValue).toBe(6);
    expect(d.curIntValue).toBe(4);
    expect(d.dropIfUnused).toBe(false);
    expect(d.desc).toBe('Maximum # players');
  });

  it('builds an INTBOOL descriptor (VP) with dropIfUnused', () => {
    const info = decode(
      '1082|VP|3|-1|2000|f|10|10|20|f|10|1|Victory points to win: #',
    ) as SOCGameOptionInfo;
    const d = descriptorFromInfo(info);
    expect(d.optType).toBe('intbool');
    expect(d.curBoolValue).toBe(false);
    expect(d.curIntValue).toBe(10);
    expect(d.dropIfUnused).toBe(true);
  });

  it('builds a STR descriptor (SC) with empty current value', () => {
    const info = decode(
      '1082|SC|6|2000|2000|f|0|0|8|f|\t|1|Game Scenario: #',
    ) as SOCGameOptionInfo;
    const d = descriptorFromInfo(info);
    expect(d.optType).toBe('str');
    expect(d.curStrValue).toBe(''); // empty wire -> "" for the UI text field
    expect(d.maxIntValue).toBe(8);
  });

  it('builds an ENUM descriptor with choices', () => {
    const info = decode(
      '1082|UR|4|2000|2000|f|2|1|3|f|2|0|Pick one: #|First|Second|Third',
    ) as SOCGameOptionInfo;
    const d = descriptorFromInfo(info);
    expect(d.optType).toBe('enum');
    expect(d.enumVals).toEqual(['First', 'Second', 'Third']);
    expect(d.curIntValue).toBe(2);
  });
});

describe('packValue', () => {
  const bool = (v: boolean): GameOptionDescriptor => ({
    key: 'PLB',
    optType: 'bool',
    desc: '',
    curBoolValue: v,
  });
  const intOpt = (v: number): GameOptionDescriptor => ({
    key: 'PL',
    optType: 'int',
    desc: '',
    curIntValue: v,
  });
  const intbool = (b: boolean, i: number): GameOptionDescriptor => ({
    key: 'VP',
    optType: 'intbool',
    desc: '',
    curBoolValue: b,
    curIntValue: i,
  });
  const str = (s: string): GameOptionDescriptor => ({
    key: 'SC',
    optType: 'str',
    desc: '',
    curStrValue: s,
  });

  it('packs each type like Java packValue', () => {
    expect(packValue(bool(true))).toBe('t');
    expect(packValue(bool(false))).toBe('f');
    expect(packValue(intOpt(4))).toBe('4');
    expect(packValue(intbool(true, 13))).toBe('t13');
    expect(packValue(intbool(false, 7))).toBe('f7');
    expect(packValue(str('SC_NSHO'))).toBe('SC_NSHO');
    expect(packValue(str(''))).toBe('');
    expect(packValue({ key: 'X', optType: 'unknown', desc: '' })).toBe('?');
  });
});

describe('serializeOptions', () => {
  const mk = (
    key: string,
    optType: GameOptionDescriptor['optType'],
    parts: Partial<GameOptionDescriptor>,
  ): GameOptionDescriptor => ({ key, optType, desc: '', ...parts });

  const chosen: GameOptionDescriptor[] = [
    mk('PL', 'int', { curIntValue: 4 }),
    mk('VP', 'intbool', { curBoolValue: true, curIntValue: 13 }),
    mk('BC', 'intbool', { curBoolValue: true, curIntValue: 4 }),
    mk('N7', 'intbool', { curBoolValue: false, curIntValue: 7 }),
    mk('PLB', 'bool', { curBoolValue: true }),
    mk('SC', 'str', { curStrValue: 'SC_NSHO' }),
  ];

  it('matches Java packOptionsToString in insertion order', () => {
    // Verified: PL=4,VP=t13,BC=t4,N7=f7,PLB=t,SC=SC_NSHO
    expect(serializeOptions(chosen)).toBe(
      'PL=4,VP=t13,BC=t4,N7=f7,PLB=t,SC=SC_NSHO',
    );
  });

  it('matches Java sorted-by-key output', () => {
    // Verified: BC=t4,N7=f7,PL=4,PLB=t,SC=SC_NSHO,VP=t13
    expect(serializeOptions(chosen, false, true)).toBe(
      'BC=t4,N7=f7,PL=4,PLB=t,SC=SC_NSHO,VP=t13',
    );
  });

  it('matches Java hideEmptyStringOpts (omit empty string options)', () => {
    const withEmpty: GameOptionDescriptor[] = [
      mk('SC', 'str', { curStrValue: '' }),
      mk('PL', 'int', { curIntValue: 6 }),
    ];
    // Verified hideEmpty -> "PL=6"; keepEmpty -> "PL=6,SC="
    expect(serializeOptions(withEmpty, true, true)).toBe('PL=6');
    expect(serializeOptions(withEmpty, false, true)).toBe('PL=6,SC=');
  });

  it('matches Java empty map -> "-"', () => {
    expect(serializeOptions([])).toBe('-');
  });

  it('skips unknown-typed options', () => {
    const list: GameOptionDescriptor[] = [
      mk('PL', 'int', { curIntValue: 4 }),
      mk('ZZ', 'unknown', {}),
    ];
    expect(serializeOptions(list)).toBe('PL=4');
  });

  it('round-trips through descriptorFromInfo -> serializeOptions', () => {
    // PL=4 from its info should serialize back to "PL=4".
    const info = decode(
      '1082|PL|2|-1|1108|f|4|2|6|f|4|0|Maximum # players',
    ) as SOCGameOptionInfo;
    const d = descriptorFromInfo(info);
    expect(serializeOptions([d])).toBe('PL=4');
  });
});

describe('parseOptions', () => {
  const descs = new Map<string, GameOptionDescriptor>([
    ['PL', { key: 'PL', optType: 'int', desc: '' }],
    ['VP', { key: 'VP', optType: 'intbool', desc: '' }],
    ['BC', { key: 'BC', optType: 'intbool', desc: '' }],
    ['PLB', { key: 'PLB', optType: 'bool', desc: '' }],
    ['SC', { key: 'SC', optType: 'str', desc: '' }],
  ]);

  it('parses a packed string into typed values', () => {
    const m = parseOptions('PL=4,VP=t13,BC=t4,PLB=t,SC=SC_NSHO', descs);
    expect(m.get('PL')).toEqual({ intValue: 4 });
    expect(m.get('VP')).toEqual({ boolValue: true, intValue: 13 });
    expect(m.get('BC')).toEqual({ boolValue: true, intValue: 4 });
    expect(m.get('PLB')).toEqual({ boolValue: true });
    expect(m.get('SC')).toEqual({ strValue: 'SC_NSHO' });
  });

  it('treats "-" and "" as an empty set', () => {
    expect(parseOptions('-', descs).size).toBe(0);
    expect(parseOptions('', descs).size).toBe(0);
  });

  it('tolerates a leading comma (StringTokenizer artifact)', () => {
    const m = parseOptions(',BC=t4,PL=4', descs);
    expect(m.get('BC')).toEqual({ boolValue: true, intValue: 4 });
    expect(m.get('PL')).toEqual({ intValue: 4 });
  });

  it('accepts y/n boolean spellings (Java parity)', () => {
    expect(parseOptions('PLB=y', descs).get('PLB')).toEqual({
      boolValue: true,
    });
    expect(parseOptions('PLB=n', descs).get('PLB')).toEqual({
      boolValue: false,
    });
  });

  it('skips unknown keys (no descriptor to interpret)', () => {
    const m = parseOptions('PL=4,ZZ=99', descs);
    expect(m.has('PL')).toBe(true);
    expect(m.has('ZZ')).toBe(false);
  });

  it('throws on a malformed value', () => {
    expect(() => parseOptions('PL=xx', descs)).toThrow();
    expect(() => parseOptions('PLB=zz', descs)).toThrow();
  });

  it('serialize -> parse is a stable round-trip', () => {
    const list: GameOptionDescriptor[] = [
      { key: 'PL', optType: 'int', desc: '', curIntValue: 5 },
      { key: 'VP', optType: 'intbool', desc: '', curBoolValue: true, curIntValue: 12 },
      { key: 'SC', optType: 'str', desc: '', curStrValue: 'SC_4ISL' },
    ];
    const packed = serializeOptions(list);
    const parsed = parseOptions(packed, descs);
    expect(parsed.get('PL')).toEqual({ intValue: 5 });
    expect(parsed.get('VP')).toEqual({ boolValue: true, intValue: 12 });
    expect(parsed.get('SC')).toEqual({ strValue: 'SC_4ISL' });
  });
});

describe('parseDefaultsKeys (SOCGameOptionGetDefaults reply)', () => {
  it('extracts ordered keys + raw values from a real defaults string', () => {
    // Captured live from the server (WS 8888), trimmed to standard opts.
    const ostr = 'BC=t4,NT=f,PLB=f,SBL=f,N7=f7,RD=f,VP=f10,PL=4';
    const { keys, values } = parseDefaultsKeys(ostr);
    expect(keys).toEqual(['BC', 'NT', 'PLB', 'SBL', 'N7', 'RD', 'VP', 'PL']);
    expect(values.get('BC')).toBe('t4');
    expect(values.get('N7')).toBe('f7');
    expect(values.get('VP')).toBe('f10');
    expect(values.get('PL')).toBe('4');
    expect(values.get('SBL')).toBe('f');
  });

  it('handles a string-valued default and underscore keys', () => {
    const { keys, values } = parseDefaultsKeys('SC=SC_NSHO,_SC_SEAC=f,PL=6');
    expect(keys).toEqual(['SC', '_SC_SEAC', 'PL']);
    expect(values.get('SC')).toBe('SC_NSHO');
    expect(values.get('_SC_SEAC')).toBe('f');
  });

  it('tolerates leading/doubled commas and treats "-"/"" as empty', () => {
    expect(parseDefaultsKeys(',,PL=4,,BC=t4').keys).toEqual(['PL', 'BC']);
    expect(parseDefaultsKeys('-').keys).toEqual([]);
    expect(parseDefaultsKeys('').keys).toEqual([]);
  });

  it('skips a pair with no "=" without throwing', () => {
    const { keys } = parseDefaultsKeys('PL=4,GARBAGE,BC=t4');
    expect(keys).toEqual(['PL', 'BC']);
  });
});

describe('mergeDefaultValue (seed descriptor from defaults reply)', () => {
  const desc = (
    optType: GameOptionDescriptor['optType'],
  ): GameOptionDescriptor => ({ key: 'X', optType, desc: 'X' });

  it('merges a bool default into default+current', () => {
    const d = mergeDefaultValue(desc('bool'), 't');
    expect(d.defaultBoolValue).toBe(true);
    expect(d.curBoolValue).toBe(true);
  });

  it('merges an int default', () => {
    const d = mergeDefaultValue(desc('int'), '6');
    expect(d.defaultIntValue).toBe(6);
    expect(d.curIntValue).toBe(6);
  });

  it('merges an intbool default (e.g. VP=f10)', () => {
    const d = mergeDefaultValue(desc('intbool'), 'f10');
    expect(d.defaultBoolValue).toBe(false);
    expect(d.curBoolValue).toBe(false);
    expect(d.defaultIntValue).toBe(10);
    expect(d.curIntValue).toBe(10);
  });

  it('merges a str default', () => {
    const d = mergeDefaultValue(desc('str'), 'SC_NSHO');
    expect(d.curStrValue).toBe('SC_NSHO');
  });

  it('keeps the descriptor unchanged on a malformed value', () => {
    const base = desc('int');
    expect(mergeDefaultValue(base, 'xx')).toBe(base);
  });
});

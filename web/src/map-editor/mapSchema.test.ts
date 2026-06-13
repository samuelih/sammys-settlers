// Tests for the custom-map schema: the "0xRRCC" coord codec, JSON <-> typed-model
// parse/serialize, and a lossless round-trip of the real sample-island map.

import { describe, it, expect } from 'vitest';
import {
  parseCoord,
  encodeCoord,
  rowOf,
  colOf,
  coordOf,
  parseMapJson,
  serializeMapJson,
  fromRaw,
  emptyMap,
  type CustomMap,
} from './mapSchema';
import { sampleMapText as sampleText } from './testFixtures';

describe('parseCoord / encodeCoord', () => {
  it('decodes a 0xRRCC string into (row<<8)|col', () => {
    expect(parseCoord('0x0309')).toBe(0x0309);
    expect(rowOf(0x0309)).toBe(0x03);
    expect(colOf(0x0309)).toBe(0x09);
  });

  it('accepts an optional 0x / 0X prefix and bare hex, case-insensitively', () => {
    expect(parseCoord('0309')).toBe(0x0309);
    expect(parseCoord('0X0309')).toBe(0x0309);
    expect(parseCoord('0x030b')).toBe(0x030b);
    expect(parseCoord('0x030B')).toBe(0x030b);
  });

  it('trims whitespace', () => {
    expect(parseCoord('  0x0309  ')).toBe(0x0309);
  });

  it('returns null for null/blank/invalid/negative', () => {
    expect(parseCoord(null)).toBeNull();
    expect(parseCoord(undefined)).toBeNull();
    expect(parseCoord('')).toBeNull();
    expect(parseCoord('   ')).toBeNull();
    expect(parseCoord('0xZZ')).toBeNull();
    expect(parseCoord('hello')).toBeNull();
    expect(parseCoord('-0x10')).toBeNull();
  });

  it('encodes back to canonical 0x + 4 uppercase hex digits', () => {
    expect(encodeCoord(0x0309)).toBe('0x0309');
    expect(encodeCoord(0x030b)).toBe('0x030B');
    expect(encodeCoord(0x0f0b)).toBe('0x0F0B');
  });

  it('round-trips encode(parse(x)) for canonical strings', () => {
    for (const s of ['0x0309', '0x050C', '0x0B0D', '0x0F0B', '0x0807']) {
      const v = parseCoord(s);
      expect(v).not.toBeNull();
      expect(encodeCoord(v as number)).toBe(s);
    }
  });

  it('coordOf composes row/col', () => {
    expect(coordOf(0x03, 0x09)).toBe(0x0309);
    expect(coordOf(0x0f, 0x0b)).toBe(0x0f0b);
  });
});

describe('parseMapJson — the sample map', () => {
  it('parses every documented field of sample-island.map.json', () => {
    const map = parseMapJson(sampleText);
    expect(map.name).toBe('Sample Two Islands');
    expect(map.description).toMatch(/two-island variant/);
    expect(map.playerCounts).toEqual([3, 4]);
    expect(map.shuffle).toBe(false);

    expect(map.landHexes).toHaveLength(12);
    expect(map.landHexes[0]).toEqual({
      type: 'clay',
      coord: '0x0309',
      diceNum: 5,
      landArea: 1,
    });
    expect(map.landHexes[11]).toEqual({
      type: 'wheat',
      coord: '0x0F0B',
      diceNum: 8,
      landArea: 2,
    });

    expect(map.landAreas).toEqual([
      { area: 1, count: 8 },
      { area: 2, count: 4 },
    ]);
    expect(map.ports).toHaveLength(4);
    expect(map.ports?.[0]).toEqual({ type: 'misc', edge: '0x0807', facing: 'SE' });
    expect(map.robberHex).toBe('0x0709');
    expect(map.pirateHex).toBe('0x0D0C');
  });
});

describe('parseMapJson — error / defaulting behavior', () => {
  it('throws on non-JSON text', () => {
    expect(() => parseMapJson('not json {')).toThrow(/JSON parse error/);
  });

  it('throws when the top level is not an object', () => {
    expect(() => parseMapJson('[1,2,3]')).toThrow(/must be a JSON object/);
  });

  it('fills GSON-style defaults for missing fields', () => {
    const map = parseMapJson('{}');
    expect(map.name).toBe('');
    expect(map.playerCounts).toEqual([]);
    expect(map.shuffle).toBe(false);
    expect(map.landHexes).toEqual([]);
    expect(map.description).toBeUndefined();
    expect(map.landAreas).toBeUndefined();
    expect(map.ports).toBeUndefined();
    expect(map.boardHeight).toBeUndefined();
    expect(map.boardWidth).toBeUndefined();
    expect(map.robberHex).toBeUndefined();
    expect(map.pirateHex).toBeUndefined();
  });

  it('coerces a hex missing landArea without inventing the field', () => {
    const map = fromRaw({
      name: 'x',
      playerCounts: [4],
      landHexes: [{ type: 'clay', coord: '0x0309', diceNum: 5 }],
    });
    expect(map.landHexes[0].landArea).toBeUndefined();
  });

  it('parses optional custom board size fields', () => {
    const map = parseMapJson(
      [
        '{ "name": "Sized", "playerCounts": [4], "shuffle": false,',
        '"boardHeight": 18, "boardWidth": 19, "landHexes": [] }',
      ].join(' '),
    );
    expect(map.boardHeight).toBe(18);
    expect(map.boardWidth).toBe(19);
  });
});

describe('serializeMapJson', () => {
  it('omits empty optional fields and keeps required ones', () => {
    const map: CustomMap = {
      name: 'Tiny',
      playerCounts: [4],
      shuffle: false,
      landHexes: [{ type: 'clay', coord: '0x0309', diceNum: 5 }],
    };
    const out = JSON.parse(serializeMapJson(map));
    expect(out).toEqual({
      name: 'Tiny',
      playerCounts: [4],
      shuffle: false,
      landHexes: [{ type: 'clay', coord: '0x0309', diceNum: 5 }],
    });
    expect('description' in out).toBe(false);
    expect('ports' in out).toBe(false);
    expect('landAreas' in out).toBe(false);
    expect('boardHeight' in out).toBe(false);
    expect('boardWidth' in out).toBe(false);
    expect('robberHex' in out).toBe(false);
  });

  it('serializes custom board size when present', () => {
    const map: CustomMap = {
      name: 'Sized',
      playerCounts: [4],
      shuffle: false,
      boardHeight: 18,
      boardWidth: 19,
      landHexes: [{ type: 'clay', coord: '0x0309', diceNum: 5 }],
    };
    const out = JSON.parse(serializeMapJson(map));
    expect(out.boardHeight).toBe(18);
    expect(out.boardWidth).toBe(19);
  });

  it('writes a trailing newline', () => {
    expect(serializeMapJson(emptyMap()).endsWith('\n')).toBe(true);
  });
});

describe('round-trip parse -> serialize -> parse', () => {
  it('preserves the sample map exactly (data-equivalent)', () => {
    const first = parseMapJson(sampleText);
    const serialized = serializeMapJson(first);
    const second = parseMapJson(serialized);
    expect(second).toEqual(first);
  });

  it('serialized sample re-parses to the same field values as the original JSON', () => {
    const original = JSON.parse(sampleText);
    const reSerialized = JSON.parse(serializeMapJson(parseMapJson(sampleText)));
    expect(reSerialized).toEqual(original);
  });
});

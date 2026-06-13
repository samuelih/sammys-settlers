import { describe, it, expect } from 'vitest';
import {
  decode,
  encode,
  SOCServerPing,
  SOCRejectConnection,
  SOCStatusMessage,
  SOCChannels,
  StatusValue,
} from './index';

// Wire strings below are captured from the real Java classes' toCmd();
// see web/docs/protocol.md.

describe('SOCServerPing', () => {
  it('matches the Java wire string', () => {
    expect(new SOCServerPing(50).toCmd()).toBe('9999|50');
    expect(new SOCServerPing(-1).toCmd()).toBe('9999|-1');
  });

  it('round-trips', () => {
    for (const st of [50, -1, 0]) {
      const back = decode(encode(new SOCServerPing(st)));
      expect(back).toBeInstanceOf(SOCServerPing);
      expect((back as SOCServerPing).sleepTime).toBe(st);
    }
  });
});

describe('SOCRejectConnection', () => {
  it('matches the Java wire string (text used verbatim)', () => {
    expect(new SOCRejectConnection('Too many clients').toCmd()).toBe(
      '1059|Too many clients',
    );
  });

  it('round-trips', () => {
    const original = new SOCRejectConnection('nope');
    const back = decode(encode(original));
    expect(back).toBeInstanceOf(SOCRejectConnection);
    expect(back).toEqual(original);
  });
});

describe('SOCStatusMessage', () => {
  it('omits svalue when 0 (Java: SV_OK not sent)', () => {
    expect(new SOCStatusMessage(StatusValue.SV_OK, 'Welcome').toCmd()).toBe(
      '1069|Welcome',
    );
  });

  it('includes svalue when > 0', () => {
    expect(new SOCStatusMessage(StatusValue.SV_NAME_IN_USE, 'Name in use').toCmd()).toBe(
      '1069|4,Name in use',
    );
  });

  it('keeps embedded SEP2 chars in the status text when svalue > 0', () => {
    const msg = new SOCStatusMessage(10, 'msg,gname,OPT');
    expect(msg.toCmd()).toBe('1069|10,msg,gname,OPT');
    const back = decode(msg.toCmd()) as SOCStatusMessage;
    expect(back.svalue).toBe(10);
    expect(back.status).toBe('msg,gname,OPT');
  });

  it('parses text starting with non-numeric prefix as sv=0 with whole text', () => {
    // "Welcome to Sammys-Settlers" has no comma -> no svalue; status is whole string.
    const back = decode('1069|Welcome to Sammys-Settlers') as SOCStatusMessage;
    expect(back.svalue).toBe(0);
    expect(back.status).toBe('Welcome to Sammys-Settlers');
  });

  it('returns null when data starts with SEP2 (garbled)', () => {
    expect(decode('1069|,oops')).toBeNull();
  });

  it('round-trips', () => {
    const cases: SOCStatusMessage[] = [
      new SOCStatusMessage(0, 'Welcome'),
      new SOCStatusMessage(4, 'Name in use'),
      new SOCStatusMessage(10, 'msg,gname,OPT'),
    ];
    for (const original of cases) {
      const back = decode(encode(original));
      expect(back).toBeInstanceOf(SOCStatusMessage);
      expect(back).toEqual(original);
    }
  });
});

describe('SOCChannels', () => {
  it('matches the Java wire string', () => {
    expect(new SOCChannels(['general', 'lobby']).toCmd()).toBe('1003|general,lobby');
  });

  it('serializes an empty list as "1003|"', () => {
    expect(new SOCChannels([]).toCmd()).toBe('1003|');
  });

  it('round-trips (including empty)', () => {
    for (const channels of [['general', 'lobby'], []]) {
      const original = new SOCChannels(channels);
      const back = decode(encode(original));
      expect(back).toBeInstanceOf(SOCChannels);
      expect((back as SOCChannels).channels).toEqual(channels);
    }
  });
});

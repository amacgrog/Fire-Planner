import { describe, it, expect } from 'vitest';
import { parseUsNumberFieldEntry } from '../helpers/markup.js';

describe('parseUsNumberFieldEntry', () => {
  const src = [
    "  { key: 'a', type: 'number', min: 0, max: 25 },",
    "  { key: 'b', type: 'bool' },",
    "  { key: 'c', type: 'number', min: LOW },",
    "  { key: 'd', type: 'number', opts: {",
    '    min: 1 },',
  ].join('\n');

  it('reads the type and the literal bounds of an entry', () => {
    expect(parseUsNumberFieldEntry(src, 'a')).toStrictEqual({ key: 'a', type: 'number', min: 0, max: 25 });
  });

  it('throws on a missing entry, a non-number entry, a non-literal bound and an entry not closed on its line', () => {
    expect(() => parseUsNumberFieldEntry(src, 'zz')).toThrow('not found');
    expect(() => parseUsNumberFieldEntry(src, 'b')).toThrow('not a number field');
    expect(() => parseUsNumberFieldEntry(src, 'c')).toThrow('not a number literal');
    expect(() => parseUsNumberFieldEntry(src, 'd')).toThrow('not closed');
  });
});

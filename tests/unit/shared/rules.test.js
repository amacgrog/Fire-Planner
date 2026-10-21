import { describe, it, expect } from 'vitest';
import { withRuleRow, withCompiledFlags } from '../helpers/rules.js';

describe('withRuleRow', () => {
  it('removes the row after fn and after a throwing fn', () => {
    const table = {};
    const r = withRuleRow(table, 'zz1', { a: 1 }, () => {
      expect(table.zz1).toStrictEqual({ a: 1 });
      return 7;
    });
    expect(r).toBe(7);
    expect('zz1' in table).toBe(false);
    expect(() => withRuleRow(table, 'zz2', { a: 2 }, () => { throw new Error('boom'); })).toThrow('boom');
    expect('zz2' in table).toBe(false);
  });

  it('throws on a second registration of the same code for the same table; a new table is fine', () => {
    const t1 = {};
    withRuleRow(t1, 'zzd', {}, () => {});
    expect(() => withRuleRow(t1, 'zzd', {}, () => {})).toThrow();
    const t2 = {};
    expect(withRuleRow(t2, 'zzd', {}, () => 'ok')).toBe('ok');
  });
});

describe('withCompiledFlags', () => {
  it('sets, runs, and restores (also after a throw)', () => {
    const rules = [{ k: 1 }, { k: 2 }, {}];
    withCompiledFlags(rules, 'k', 9, () => {
      expect(rules.map((r) => r.k)).toStrictEqual([9, 9, 9]);
    });
    expect(rules[0].k).toBe(1);
    expect(rules[1].k).toBe(2);
    expect('k' in rules[2]).toBe(false);
    expect(() => withCompiledFlags(rules, 'k', 5, () => { throw new Error('x'); })).toThrow('x');
    expect(rules[0].k).toBe(1);
    expect(rules[1].k).toBe(2);
    expect('k' in rules[2]).toBe(false);
  });
});

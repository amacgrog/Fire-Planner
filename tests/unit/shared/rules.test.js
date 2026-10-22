import { describe, it, expect, inject } from 'vitest';
import { world } from '../helpers/world.js';
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

describe('withRuleRow, real rows and worlds', () => {
  it('refuses a code that is already a row of the table, and leaves the row alone', () => {
    const table = { real: { a: 1 } };
    expect(() => withRuleRow(table, 'real', {}, () => {})).toThrow('already a row');
    expect(table.real).toStrictEqual({ a: 1 });
  });

  it("the real rules tables of two worlds each accept the same synthetic code", async () => {
    const country = inject('country');
    const path = country === 'us' ? 'us/core/tax/state-rules.js' : 'canada/core/tax/province-rules.js';
    const name = country === 'us' ? 'STATE_RULES' : 'PROVINCE_RULES';
    const w1 = await world();
    const t1 = (await w1.load(path))[name];
    expect(withRuleRow(t1, 'zz', {}, () => 1)).toBe(1);
    const w2 = await world();
    const t2 = (await w2.load(path))[name];
    expect(t2).not.toBe(t1);
    expect(withRuleRow(t2, 'zz', {}, () => 2)).toBe(2);
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

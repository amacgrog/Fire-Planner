import { describe, it, afterAll, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const c = makeCounter();
const load = async () => (await (await world()).load('shared/core/format/sankey-model.js'));
const G = (key, label, items) => ({ key, label, value: items.reduce((s, it) => s + it.value, 0), items });
const I = (key, label, value, extra = {}) => ({ key, label, value, ...extra });
const half = (n) => n / 2;
const cols = () => ({
  in: [
    G('earned', 'Earned income', [I('wagesA', 'Wages · Partner A', 100), I('employer', 'Employer contributions', 1.5)]),
    G('retirement', 'Retirement income', [I('oas', 'OAS', 40, { gross: 50, recovery: 10 }), I('rest', 'Other retirement income', 1.8)]),
    G('savings', 'From savings', [I('roth', 'Roth', 20)]),
  ],
  out: [
    G('taxes', 'Taxes', [I('tax', 'Taxes', 30)]),
    G('essentials', 'Essentials', [I('housing', 'Housing', 60), I('rest', 'Other essentials', 4)]),
    G('extra', 'Extra & one-time', [I('rest', 'Other extra & one-time', 1.2), I('lumpExp:0', 'New roof', 70, { sub: 'One-time expense 1' })]),
  ],
});

describe('sankeyModel', () => {
  it('drops items under one display dollar and keeps every node equal to its links', async () => {
    const { sankeyModel } = await load();
    const m = sankeyModel(cols(), half, false);
    // in display dollars (half): employer 0.75 and the retirement rest 0.9 are dropped
    c.expect(m.total).toBe(50 + 20 + 10);
    c.expect(m.columns[0].map((n) => n.id).join()).toBe('in:wagesA,in:oas,in:roth');
    c.expect(m.columns[1].map((n) => n.value).join()).toBe('50,20,10');
    c.expect(m.columns[2][0].value).toBe(80);
    c.expect(m.columns[4].map((n) => n.id).join()).toBe('out:tax,out:housing,out:rest,out:lumpExp:0');
    for (const n of m.columns.flat()) {
      const outSum = m.links.filter((l) => l.from === n.id).reduce((s, l) => s + l.value, 0);
      const inSum = m.links.filter((l) => l.to === n.id).reduce((s, l) => s + l.value, 0);
      if (n.id === 'hub') c.expect(inSum).toBe(n.value);
      else if (m.columns[0].includes(n) || m.columns[3].includes(n)) c.expect(outSum).toBe(n.value);
      else c.expect(inSum).toBe(n.value);
    }
  });
  it('a key used twice in a column gets its group', async () => {
    const { sankeyModel } = await load();
    const m = sankeyModel(cols(), (n) => n, false);
    const ids = m.columns[4].map((n) => n.id);
    c.expect(ids.join()).toBe('out:tax,out:housing,out:rest,out:extra:rest,out:lumpExp:0');
    c.expect(new Set(m.columns.flat().map((n) => n.id)).size).toBe(m.columns.flat().length);
  });
  it('tooltip lines, group items, notes and colors', async () => {
    const { sankeyModel } = await load();
    const m = sankeyModel(cols(), (n) => n, true, { retirement: ['OAS recovery tax $10'] });
    const node = (id) => m.columns.flat().find((n) => n.id === id);
    c.expect(node('in:oas').lines).toStrictEqual(['Gross OAS $50', 'OAS recovery tax $10']);
    c.expect(node('out:lumpExp:0').lines).toStrictEqual(['One-time expense 1']);
    c.expect(node('g:retirement').lines).toStrictEqual(['OAS recovery tax $10']);
    c.expect(node('g:essentials').items).toStrictEqual([{ label: 'Housing', value: 60 }, { label: 'Other essentials', value: 4 }]);
    // an account item keeps the bar chart's color (dark theme Roth); the first group item takes the group hue
    c.expect(node('in:roth').color).toBe('#008300');
    c.expect(node('in:wagesA').color).toBe('#3987e5');
    // the second item of a group: the hue mixed 18% toward white in the dark theme (#3987e5 -> #5d9dea)
    c.expect(node('in:employer').color).toBe('#5d9dea');
  });
  it('null when the year has under one display dollar', async () => {
    const { sankeyModel } = await load();
    c.expect(sankeyModel(cols(), (n) => n / 1000, false)).toBe(null);
  });
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(29);
});

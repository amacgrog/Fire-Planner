import { describe, it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const c = makeCounter();
const load = async () => (await (await world()).load('shared/core/format/sankey-layout.js'));
const N = (id, value) => ({ id, value, label: id });
const BOX = { width: 800, height: 288, xs: [0, 100, 200, 300, 400], nodeW: 6, gap: 16, top: 0, bottom: 288, labelH: 22, minLabelBand: 10 };

// three columns of 128 split 64/64, 32/32/64 and 128; scale is 2 (288 - 2 * 16 = 256 = 128 * 2)
const model3 = () => ({
  columns: [
    [N('a1', 64), N('a2', 64)],
    [N('b1', 32), N('b2', 32), N('b3', 64)],
    [N('c1', 128)],
  ],
  links: [
    { from: 'a1', to: 'b1', value: 32 }, { from: 'a1', to: 'b2', value: 32 },
    { from: 'a2', to: 'b3', value: 64 },
    { from: 'b1', to: 'c1', value: 32 }, { from: 'b2', to: 'c1', value: 32 }, { from: 'b3', to: 'c1', value: 64 },
  ],
});

describe('layoutSankey', () => {
  it('one scale', async () => {
    const { layoutSankey } = await load();
    const L = layoutSankey(model3(), BOX);
    c.expect(L.scale).toBe(2);
    for (const col of model3().columns) {
      for (const n of col) {
        const p = L.nodes.get(n.id);
        c.expect((p.y1 - p.y0) / n.value).toBe(L.scale);
      }
    }
  });
  it('centred', async () => {
    const { layoutSankey } = await load();
    const m = {
      columns: [[N('t', 100)], [N('p', 25), N('q', 25), N('r', 25), N('s', 25)]],
      links: ['p', 'q', 'r', 's'].map((to) => ({ from: 't', to, value: 25 })),
    };
    const L = layoutSankey(m, BOX);
    const mid = (BOX.top + BOX.bottom) / 2;
    const t = L.nodes.get('t');
    c.expect(Math.abs((t.y0 + t.y1) / 2 - mid) <= 1e-9).toBe(true);
    const f = L.nodes.get('p'), l = L.nodes.get('s');
    c.expect(Math.abs((f.y0 + l.y1) / 2 - mid) <= 1e-9).toBe(true);
  });
  it('fits', async () => {
    const { layoutSankey } = await load();
    const L = layoutSankey(model3(), BOX);
    // unclamped: gapUsed = min(16, 0.3 * 288 / 2) = 16; busiest column holds 128 * 2 + 2 * 16 = 288
    c.expect(2 * 128 + 16 * 2 <= BOX.bottom - BOX.top + 1e-9).toBe(true);
    c.expect(L.nodes.get('b3').y1 <= BOX.bottom).toBe(true);
    c.expect(L.nodes.get('b1').y0 >= BOX.top).toBe(true);
  });
  it('links stack', async () => {
    const { layoutSankey } = await load();
    const m = {
      columns: [[N('s', 128)], [N('x', 32), N('y', 32), N('z', 64)]],
      links: [{ from: 's', to: 'x', value: 32 }, { from: 's', to: 'y', value: 32 }, { from: 's', to: 'z', value: 64 }],
    };
    const L = layoutSankey(m, BOX);
    const s = L.nodes.get('s');
    c.expect(L.links.length).toBe(3);
    c.expect(L.links[0].sy0).toBe(s.y0);
    c.expect(L.links[1].sy0).toBe(L.links[0].sy1);
    c.expect(L.links[2].sy0).toBe(L.links[1].sy1);
    c.expect(L.links[2].sy1).toBe(s.y1);
    c.expect(L.links[0].ty0).toBe(L.nodes.get('x').y0);
    c.expect(L.links[0].ty1).toBe(L.nodes.get('x').y1);
  });
  it('links follow the neighbour column order', async () => {
    const { layoutSankey } = await load();
    const m = {
      columns: [[N('s', 6)], [N('x', 1), N('y', 2), N('z', 3)]],
      links: [{ from: 's', to: 'z', value: 3 }, { from: 's', to: 'x', value: 1 }, { from: 's', to: 'y', value: 2 }],
    };
    const L = layoutSankey(m, BOX);
    c.expect(L.links.map((k) => k.to)).toStrictEqual(['x', 'y', 'z']);
    c.expect(L.links[0].sy0).toBe(L.nodes.get('s').y0);
  });
  it('crowded column', async () => {
    const { layoutSankey } = await load();
    const nodes = [];
    for (let i = 1; i <= 12; i++) nodes.push(N('n' + i, i));
    const L = layoutSankey({ columns: [nodes], links: [] }, { ...BOX, height: 200, bottom: 200 });
    const vis = nodes.map((n) => L.nodes.get(n.id)).filter((p) => !p.labelHidden).map((p) => p.labelY).sort((a, b) => a - b);
    for (let i = 1; i < vis.length; i++) c.expect(vis[i] - vis[i - 1] >= 22 - 1e-9).toBe(true);
    c.expect(L.nodes.get('n12').labelHidden).toBe(false);
    c.expect(nodes.some((n) => L.nodes.get(n.id).labelHidden)).toBe(true);
    for (const p of vis) c.expect(p - 11 >= 0 - 1e-9 && p + 11 <= 200 + 1e-9).toBe(true);
  });
  it('label tolerance: a label that fits is not hidden by rounding', async () => {
    const { layoutSankey } = await load();
    const m = { columns: [[N('a', 12.99011887610516), N('b', 8.463015284440225), N('big', 88.92993155024598)]], links: [] };
    const L = layoutSankey(m, { ...BOX, height: 200, bottom: 14.476605984749757 + 200, top: 14.476605984749757, gap: 2, minLabelBand: 0 });
    c.expect(L.nodes.get('b').labelHidden).toBe(false);
    const ys = ['a', 'b', 'big'].map((id) => L.nodes.get(id)).filter((p) => !p.labelHidden).map((p) => p.labelY).sort((x, y) => x - y);
    for (let i = 1; i < ys.length; i++) c.expect(ys[i] - ys[i - 1] >= 22 - 1e-9).toBe(true);
  });
  it('duplicate ids throw', async () => {
    const { layoutSankey } = await load();
    expect(() => layoutSankey({ columns: [[N('a', 1)], [N('a', 1)]], links: [] }, BOX)).toThrow(/duplicate/);
  });
  it('a zero-value node has its label hidden', async () => {
    const { layoutSankey } = await load();
    const L = layoutSankey({ columns: [[N('a', 10), N('z', 0)]], links: [] }, BOX);
    c.expect(L.nodes.get('z').labelHidden).toBe(true);
    c.expect(L.nodes.get('a').labelHidden).toBe(false);
  });
  it('links are ordered by source column, source row, target row', async () => {
    const { layoutSankey } = await load();
    const m = {
      columns: [[N('a', 2), N('b', 2)], [N('x', 2), N('y', 2)], [N('p', 4)]],
      links: [
        { from: 'y', to: 'p', value: 2 }, { from: 'b', to: 'y', value: 2 },
        { from: 'x', to: 'p', value: 2 }, { from: 'a', to: 'x', value: 2 },
      ],
    };
    const L = layoutSankey(m, BOX);
    c.expect(L.links.map((k) => k.from + k.to)).toStrictEqual(['ax', 'by', 'xp', 'yp']);
  });
  it('empty', async () => {
    const { layoutSankey } = await load();
    const L = layoutSankey({ columns: [[N('a', 0)], [N('b', 0)]], links: [{ from: 'a', to: 'b', value: 0 }] }, BOX);
    c.expect(L.nodes.size).toBe(0);
    c.expect(L.links.length).toBe(0);
  });
  it('busy', async () => {
    const { layoutSankey } = await load();
    const nodes = [];
    for (let i = 0; i < 29; i++) nodes.push(N('n' + i, 1000 + i * 37));
    const L = layoutSankey({ columns: [nodes], links: [] }, { ...BOX, height: 300, bottom: 300 });
    c.expect(L.scale > 0).toBe(true);
    for (const n of nodes) {
      const p = L.nodes.get(n.id);
      c.expect(p.y1 - p.y0 > 0).toBe(true);
    }
    // unclamped: gapUsed = min(16, 0.3 * 300 / 28); the column must fit without the clamp
    const gapUsed = Math.min(16, (0.3 * 300) / 28);
    const sum = nodes.reduce((a, n) => a + n.value, 0);
    c.expect(L.scale * sum + gapUsed * 28 <= 300 + 1e-9).toBe(true);
    c.expect(L.nodes.get('n28').y1 <= 300).toBe(true);
  });
  it('sides', async () => {
    const { layoutSankey } = await load();
    const L = layoutSankey(model3(), { ...BOX, sides: ['right', 'left', 'left'] });
    c.expect(L.nodes.get('a1').side).toBe('right');
    c.expect(L.nodes.get('b1').side).toBe('left');
    const five = { columns: [0, 1, 2, 3, 4].map((i) => [N('k' + i, 10)]), links: [] };
    const L5 = layoutSankey(five, BOX);
    c.expect([0, 1, 2, 3, 4].map((i) => L5.nodes.get('k' + i).side)).toStrictEqual(['left', 'right', 'right', 'left', 'right']);
  });
  it('a thin band whose label had to slide is hidden', async () => {
    const { layoutSankey } = await load();
    const L = layoutSankey({ columns: [[N('big', 1000), N('thin', 1)]], links: [] }, { ...BOX, height: 100, bottom: 100, labelH: 40 });
    c.expect(L.nodes.get('big').labelHidden).toBe(false);
    c.expect(L.nodes.get('thin').labelHidden).toBe(true);
  });
});

describe('sankeyColumnXs', () => {
  it('spreads columns with room outside the end bars', async () => {
    const { sankeyColumnXs } = await load();
    c.expect(sankeyColumnXs(800, 5, 100)).toStrictEqual([100, 250, 400, 550, 700]);
    c.expect(sankeyColumnXs(800, 5, 100, 6)).toStrictEqual([100, 248.5, 397, 545.5, 694]);
  });
});

describe('fitLabel', () => {
  it('truncates with an ellipsis', async () => {
    const { fitLabel } = await load();
    c.expect(fitLabel('Into traditional (your contributions)', 100, 11)).toBe('Into tradition…');
    c.expect(fitLabel('Roth', 100, 11)).toBe('Roth');
  });
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(87);
});

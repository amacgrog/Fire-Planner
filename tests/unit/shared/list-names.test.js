// The optional name on every list row: normalizing, labels, and that a name changes no number, seed or fingerprint.
import { it, expect, inject, vi } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

const isUS = inject('country') === 'us';
const KEYS = ['loans', 'incomeSources', 'oneTimeIncome', 'extraExpenses', 'spendingTiers', 'lumpExpenses'];
const SIM = 'shared/core/projection/simulate.js';

async function setup() {
  const w = await world();
  const { DYN } = await w.load(`${w.country}/core/inputs/dyn.js`);
  return { w, DYN };
}
// One row per list (a loan with a balance, the others with an amount), each named `names[k]`.
function plan(DYN, names) {
  const out = {};
  for (const k of KEYS) {
    const row = { ...DYN[k].fresh(), name: names ? names[k] : undefined };
    if (!names) delete row.name;
    if (k === 'loans') Object.assign(row, { principal: 20000, balance: 15000, rate: 5, term: 5 });
    else row.amount = 4000;
    out[k] = [row];
  }
  return out;
}
const allNames = (v) => Object.fromEntries(KEYS.map((k) => [k, v]));
const stripped = (s) => {
  const o = { ...s };
  for (const k of KEYS) o[k] = s[k].map(({ name, ...r }) => r);
  return o;
};

it('name kept', async () => {
  const { w, DYN } = await setup();
  for (const k of KEYS) {
    const s = await w.setState({ [k]: [{ ...DYN[k].fresh(), name: '  Travel  ' }] });
    expect(s[k][0].name).toBe('Travel');
  }
});

it('name clip', async () => {
  const { w, DYN } = await setup();
  let s = await w.setState({ extraExpenses: [{ ...DYN.extraExpenses.fresh(), name: 'x'.repeat(50) }] });
  expect(s.extraExpenses[0].name.length).toBe(40);
  s = await w.setState({ lumpExpenses: [{ ...DYN.lumpExpenses.fresh(), name: '<b>Roof</b> & "gutters"' }] });
  expect(s.lumpExpenses[0].name).toBe('<b>Roof</b> & "gutters"');
});

it('non-string', async () => {
  const { w, DYN } = await setup();
  for (const bad of [12, null, undefined, {}, ['a']]) {
    const s = await w.setState({ loans: [{ ...DYN.loans.fresh(), name: bad }] });
    expect(s.loans[0].name).toBe('');
  }
  const row = DYN.loans.fresh();
  delete row.name;
  expect((await w.setState({ loans: [row] })).loans[0].name).toBe('');
});

it('old save', async () => {
  const { w, DYN } = await setup();
  const s = await w.setState(plan(DYN, null));
  for (const k of KEYS) {
    expect(s[k].length).toBe(1);
    expect(s[k][0].name).toBe('');
  }
});

it('numbers unchanged', async () => {
  const { w, DYN } = await setup();
  const eng = await engine(w);
  await w.setState(plan(DYN, null));
  const without = JSON.stringify(eng.simulateRaw().rows);
  await w.setState(plan(DYN, allNames('Named')));
  const withNames = JSON.stringify(eng.simulateRaw().rows);
  expect(withNames).toBe(without);
});

it('labels', async () => {
  const { w, DYN } = await setup();
  const { itemLabel } = await w.load('shared/core/inputs/list-titles.js');
  const { listRowLabel } = await w.load('shared/core/inputs/dyn-fields.js');
  expect(itemLabel('lumpExpenses', { name: '' }, 0)).toBe('One-time expense 1');
  expect(itemLabel('lumpExpenses', { name: '  ' }, 0)).toBe('One-time expense 1');
  expect(itemLabel('lumpExpenses', { name: 'Roof' }, 0)).toBe('Roof');
  expect(listRowLabel(DYN.loans, { name: 'Car' }, 1)).toBe('Loan 2 · Car');
  expect(listRowLabel(DYN.loans, { name: '' }, 1)).toBe('Loan 2');
});

it('seed', async () => {
  const { w, DYN } = await setup();
  const { monteCarloSeed } = await w.load(SIM);
  const named = await w.setState(plan(DYN, allNames('Named')));
  const a = monteCarloSeed(2026, 500, named);
  const other = await w.setState(plan(DYN, allNames('Other')));
  expect(monteCarloSeed(2026, 500, other)).toBe(a);
  expect(monteCarloSeed(2026, 500, stripped(named))).toBe(a);
  const blank = await w.setState(plan(DYN, null));
  expect(monteCarloSeed(2026, 500, blank)).toBe(a);
  expect(monteCarloSeed(2026, 500, stripped(blank))).toBe(a);
});

it('withoutListNames leaves rows without a name as they are', async () => {
  const { w } = await setup();
  const { withoutListNames } = await w.load('shared/core/inputs/lists.js');
  const row = { amount: 1 };
  const out = withoutListNames({ loans: [row], x: 5 });
  expect(out.loans[0]).toBe(row);
  expect(out.x).toBe(5);
  expect(withoutListNames({ loans: [{ name: 'a', amount: 1 }] }).loans).toStrictEqual([{ amount: 1 }]);
});

it('monte carlo', async () => {
  const { w, DYN } = await setup();
  const eng = await engine(w);
  await w.setState(plan(DYN, null));
  const without = eng.monteCarloSummary(500);
  await w.setState(plan(DYN, allNames('Named')));
  expect(eng.monteCarloSummary(500)).toStrictEqual(without);
});

it.runIf(isUS)('fingerprint', async () => {
  const { w, DYN } = await setup();
  // plan-optimizer.js sits in the UI tree: its imports look elements up at load, so give them an empty document.
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} });
  try {
    const { storedPlanFingerprint } = await w.load('us/ui/results/plan-optimizer.js');
    const named = await w.setState(plan(DYN, allNames('Named')));
    const a = storedPlanFingerprint(named);
    expect(storedPlanFingerprint(stripped(named))).toBe(a);
    const blank = await w.setState(plan(DYN, null));
    expect(storedPlanFingerprint(blank)).toBe(a);
  } finally {
    vi.unstubAllGlobals();
  }
});

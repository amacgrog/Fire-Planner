// Feedback B1: a Social Security start age past 70 under the "if the law changes" switch (src/us/core/inputs/ss-start-age.js).
// The engine pays nothing before the start age and the entered amount from it (socialSecurityIncome); the switch only moves the
// start ages' limit from 70 to 75, clamped in normalizeState. w.setState normalizes the patch alone, so a patch without the key
// goes through the migration (a start age past 70 with no key turns the switch on): the "off" cases set it false explicitly.
import { it, vi, afterAll, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 36;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// A single retiree at 65 with 2,000 a month of Social Security and no inflation, so the yearly benefit is 2,000 x 12 = 24,000.
const SINGLE = {
  singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 90, incomeA: 0, spending: 40000, taxable: 800000, cash: 30000,
  inflation: 0, ssMonthlyA: 2000, stateTax: 'tx', acaEnabled: false, healthcare: 0,
};
const ssAt = (rows, age) => rows.find((r) => r.age === age).ss;

it('on: a start age of 72 pays nothing before 72 and the entered amount from 72', async () => {
  const w = await world();
  const s = await w.setState({ ...SINGLE, ssLateStartEnabled: true, ssStartAgeA: 72 });
  c.expect(s.ssStartAgeA).toBe(72);
  const rows = (await engine(w)).simulate().rows;
  c.expect(rows.filter((r) => r.age < 72).map((r) => r.ss)).toStrictEqual([0, 0, 0, 0, 0, 0, 0]);
  c.expect(ssAt(rows, 72)).toBe(24000);
  c.expect(ssAt(rows, 73)).toBe(24000);
});

it('off: a start age of 72 is clamped to 70, and the benefit starts at 70', async () => {
  const w = await world();
  const s = await w.setState({ ...SINGLE, ssLateStartEnabled: false, ssStartAgeA: 72, ssStartAgeB: 71 });
  c.expect(s.ssStartAgeA).toBe(70);
  c.expect(s.ssStartAgeB).toBe(70);
  const rows = (await engine(w)).simulate().rows;
  c.expect(ssAt(rows, 69)).toBe(0);
  c.expect(ssAt(rows, 70)).toBe(24000);
});

it('on: a start age above 75 is clamped to 75; ages at or under the limit are kept', async () => {
  const w = await world();
  const s = await w.setState({ ...SINGLE, ssLateStartEnabled: true, ssStartAgeA: 80, ssStartAgeB: 75 });
  c.expect(s.ssStartAgeA).toBe(75);
  c.expect(s.ssStartAgeB).toBe(75);
  const t = await w.setState({ ...SINGLE, ssLateStartEnabled: false, ssStartAgeA: 70, ssStartAgeB: 62 });
  c.expect(t.ssStartAgeA).toBe(70);
  c.expect(t.ssStartAgeB).toBe(62);
});

it('migration: a save without the key and a start age past 70 opens with the switch on', async () => {
  const w = await world();
  const a = await w.setState({ ssStartAgeB: 72 });
  c.expect(a.ssLateStartEnabled).toBe(true);
  c.expect(a.ssStartAgeB).toBe(72);
  const b = await w.setState({ ssStartAgeA: 80 });
  c.expect(b.ssLateStartEnabled).toBe(true);
  c.expect(b.ssStartAgeA).toBe(75);
  const d = await w.setState({ ssStartAgeA: 68 });
  c.expect(d.ssLateStartEnabled).toBe(false);
  c.expect(d.ssStartAgeA).toBe(68);
  // A hand-edited string is not a true switch.
  const e = await w.setState({ ssLateStartEnabled: 'false', ssStartAgeA: 72 });
  c.expect(e.ssLateStartEnabled).toBe(false);
  c.expect(e.ssStartAgeA).toBe(70);
});

it("the start ages' FIELDS limits (MCP) are 62 to SS_START_AGE_MAX_LAW_CHANGE", async () => {
  const w = await world();
  const { SS_START_AGE_MAX_LAW_CHANGE } = await w.load('us/core/inputs/ss-start-age.js');
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} });
  try {
    const { FIELDS } = await w.load('us/ui/inputs/fields.js');
    const limits = FIELDS.filter((f) => f.key === 'ssStartAgeA' || f.key === 'ssStartAgeB').map((f) => [f.min, f.max]);
    c.expect(limits).toStrictEqual([[62, SS_START_AGE_MAX_LAW_CHANGE], [62, SS_START_AGE_MAX_LAW_CHANGE]]);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('clampSsStartAges lowers only the top', async () => {
  const w = await world();
  const { clampSsStartAges, ssStartAgeMax } = await w.load('us/core/inputs/ss-start-age.js');
  const s = { ssLateStartEnabled: false, ssStartAgeA: 72, ssStartAgeB: 60 };
  clampSsStartAges(s);
  c.expect(s).toStrictEqual({ ssLateStartEnabled: false, ssStartAgeA: 70, ssStartAgeB: 60 });
  c.expect(ssStartAgeMax({ ssLateStartEnabled: true })).toBe(75);
  c.expect(ssStartAgeMax({ ssLateStartEnabled: false })).toBe(70);
});

it('the switch moves neither the Monte Carlo seed nor a stored plan fingerprint', async () => {
  const w = await world();
  const { monteCarloSeed } = await w.load('shared/core/projection/simulate.js');
  const s = await w.setState({ ...SINGLE, ssLateStartEnabled: false });
  const { ssLateStartEnabled, ...without } = s;
  c.expect(monteCarloSeed(2026, 500, s)).toBe(monteCarloSeed(2026, 500, without));
  // plan-optimizer.js sits in the UI tree: its imports look elements up at load, so give them an empty document.
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} });
  try {
    const { storedPlanFingerprint } = await w.load('us/ui/results/plan-optimizer.js');
    // The fingerprint normalizes first (a missing key becomes false), so compare the switch on and off with the same ages.
    c.expect(storedPlanFingerprint({ ...s, ssLateStartEnabled: true })).toBe(storedPlanFingerprint(s));
  } finally {
    vi.unstubAllGlobals();
  }
});

// The identical-partner household of tests/survivor_symmetry.js (US), with both benefits from 72 under the switch: who dies at
// 75 must not change anything. Before 72 nothing is paid; at 72-74 both benefits (2 x 24,000); from 75 the survivor keeps the
// greater of two equal benefits (24,000).
const COUPLE = {
  singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62,
  lifeExpectancyA: 90, lifeExpectancyB: 90, incomeA: 0, incomeB: 0, spending: 60000, taxable: 400000,
  tradIraA: 0, tradIraB: 0, trad401kA: 300000, trad401kB: 300000, rothIraA: 50000, rothIraB: 50000, roth401kA: 0, roth401kB: 0,
  cash: 30000, inflation: 0, dividendYield: 0, pensionCoverage: 'both', pensionYearlyA: 30000, pensionYearlyB: 30000,
  pensionStartAgeA: 62, pensionStartAgeB: 62, survivorEnabled: true, survivorDeathAge: 75, survivorSpendingPct: 70,
  ltcEnabled: false, healthcare: 0, ssMonthlyA: 2000, ssMonthlyB: 2000, ssLateStartEnabled: true, ssStartAgeA: 72, ssStartAgeB: 72,
  stateTax: 'tx', acaEnabled: false,
};

it('survivor symmetry holds with a start age past 70', async () => {
  const rowsFor = async (survivorPartner) => {
    const w = await world();
    await w.setState({ ...COUPLE, survivorPartner });
    return (await engine(w)).simulate().rows;
  };
  const a = await rowsFor('A'),
    b = await rowsFor('B');
  c.expect(a.length).toBe(b.length);
  c.expect(a.map((r) => r.ss)).toStrictEqual(b.map((r) => r.ss));
  for (const k of ['tax', 'income', 'investable']) c.expect(a.map((r) => r[k])).toStrictEqual(b.map((r) => r[k]));
  c.expect(ssAt(a, 71)).toBe(0);
  c.expect(ssAt(a, 72)).toBe(48000);
  c.expect(ssAt(a, 74)).toBe(48000);
  c.expect(ssAt(a, 75)).toBe(24000);
  c.expect(ssAt(a, 80)).toBe(24000);
});

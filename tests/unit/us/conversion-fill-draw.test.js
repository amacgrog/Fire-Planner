// The plain Roth-conversion bracket fill counts the year's own traditional draw (Batch 5 follow-ups S1, spec 4.1):
// solveRothConversion's `drawBelow` (the pass's estTrad) sits below the conversion, so the fill converts only the room left in
// the bracket above the draw. The hand literals are the 2026 federal figures (federal-rules.js): MFJ 10% top 24,800, MFJ 24% top
// 403,550, MFJ standard deduction 32,200 (both 60: no age addition); single 12% top 50,400, single standard deduction 16,100.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { scanHouseholds } from '../helpers/scan-grid.mjs';
import { usPlan } from '../helpers/us-plan.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { scenarios } = require('../../snapshot_scenarios.js');
const { legacyToAccounts } = require('../../legacy_balances.js');
const { SPLIT_H1 } = require('../../helpers/plan-households.js');

// The profile fields solveRothConversionTop reads (property tax, mortgage interest, the 162(l) and inherited estimates are read
// with `|| 0`, so they are left out).
const MFJ = { filing: 'mfj', ageA: 60, ageB: 60, otherA: 0, otherB: 0, ssA: 0, ssB: 0 };

async function setup(patch) {
  const w = await world();
  await w.setState(patch);
  const rc = await w.load('us/core/withdrawals/roth-conversion.js');
  const ctx = await w.ctx();
  return { ctx, ...rc };
}

it('a 10% fill in a $190,000-draw year converts 0', async () => {
  const { ctx, solveRothConversion } = await setup({ rothConvBracket: 10 });
  // 24,800 + 32,200 = 57,000 of ordinary income fills the 10% bracket: the draw alone is above it.
  expect(solveRothConversion(ctx, MFJ, 1e6, 0, 60, 190000)).toBe(0);
});

it('a 24% fill converts only the 24% room above the draw', async () => {
  const { ctx, solveRothConversion } = await setup({ rothConvBracket: 24 });
  // 403,550 (24% top) + 32,200 (standard deduction) - 190,000 (the draw) = 245,750; the bisection's last step is 1e6 / 2^24
  // (about 0.0596).
  const LIT = 245750;
  const x = solveRothConversion(ctx, MFJ, 1e6, 0, 60, 190000);
  expect(Math.abs(x - LIT) <= 0.06).toBe(true);
});

it('with no draw the fill is unchanged', async () => {
  const { ctx, solveRothConversion, solveRothConversionTop } = await setup({ rothConvBracket: 24 });
  expect(solveRothConversion(ctx, MFJ, 1e6, 0, 60, 0)).toBe(solveRothConversionTop(ctx, MFJ, 1e6, 0, 24, 0));
});

it('two returns: the draw counts in the single-filer branch too', async () => {
  const { ctx, solveRothConversion } = await setup({ rothConvBracket: 12 });
  const TWO = { filing: 'single', ageA: 60, ageB: 60, otherA: 0, otherB: 20000, ssA: 0, ssB: 0 };
  // 50,400 (12% top) + 16,100 (standard deduction) = 66,500 of ordinary income at year 0: 20,000 + a 46,500 draw fills it.
  expect(solveRothConversion(ctx, TWO, 1e6, 0, 60, 46500)).toBe(0);
  // (not vacuous: with no draw the fill converts)
  expect(solveRothConversion(ctx, TWO, 1e6, 0, 60, 0) > 0).toBe(true);
});

// A converting year with no finite limit (single, under 63: no IRMAA ceiling; ACA off: no ACA line) runs the pass loop and fills
// against its own pass's draw estimate, not last year's (or 0 in the first retired year). The wiring only: the row's conversion
// is the fill at the kept pass's own estTrad and convertible balance. The year converges (Task 2b, a secant step): the first retired
// year iterates (more than one pass), and the kept pass's realized discretionary draw is within MAGI_ITER_TOL ($1, engine-state.js)
// of the estimate it filled against. The first retired year (60) may take up to 7 passes: seeded at estTrad 0, its first pass
// converts the whole bracket, the next estimate lands above the bracket top (conversion 0, the draw flat there), and the line
// crosses that kink before the step settles. A seeded year (61) settles within 5.
it('a conversion year with no finite limit fills against its own draw', async () => {
  const w = await world();
  await w.setState({
    singlePerson: true, ageA: 60, retireAgeA: 60, lifeExpectancyA: 70, stateTax: 'tx', acaEnabled: false,
    ssMonthlyA: 0, pensionCoverage: 'none', pensionYearlyA: 0,
    tradIraA: 0, trad401kA: 1500000, rothIraA: 0, roth401kA: 0, taxable: 0, cash: 0, spending: 120000,
    rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 62, rothConvBracket: 24, cliffGuardEnabled: false,
  });
  const e = await engine(w);
  const { solveRothConversionTop } = await w.load('us/core/withdrawals/roth-conversion.js');
  const ctx = await w.ctx();
  const { rows } = e.simulateRaw();
  const trace = e.accountTrace();
  for (const age of [60, 61]) {
    const i = rows.findIndex((r) => r.age === age);
    const row = rows[i], t = trace[i];
    expect(row.conversionAmount > 0).toBe(true);
    expect(t.estTrad > 0).toBe(true);
    expect(row.conversionAmount).toBe(solveRothConversionTop(ctx, t.profile, t.convertible, i, 24, t.estTrad));
    if (age === 60) expect(t.passes > 1).toBe(true);
    expect(t.passes <= (age === 60 ? 7 : 5)).toBe(true);
    const draw = row.traditionalWithdrawn - row.rmd - (row.inheritedDraw || 0);
    expect(Math.abs(draw - t.estTrad) <= 1).toBe(true);
  }
});

// The forced pick's tie (spec 4.1, review M3): a forced MAGI-iteration year re-runs the pass that overpaid the premium least, and
// an overpay tie goes to the pass with the smallest drift in any year whose conversion read the draw estimate, not only in a sized
// year. The household is scan-grid #24 (MFJ, 58, 401(k) 250k + 250k, taxable 300k, spending 60k, no elections, conversions on at
// the 22% fill) with the guard off (a single phase: phases clear the pass log); at 63 its plain-fill (unsized) year is forced with
// a three-way overpay tie whose seed is not the smallest drift (found by scanning the grid's 384 converting households, Task 3).
it('a forced plain-fill year breaks an overpay tie by the smallest drift', async () => {
  const w = await world();
  const h = scanHouseholds({ conversions: true }).find((x) => x.g.filing === 'mfj' && x.g.age === 58 && x.g.trad === 500000
    && x.g.taxable === 300000 && x.g.spending === 60000 && x.g.elections === 'none');
  await w.setState({ ...h.patch, cliffGuardEnabled: false });
  const e = await engine(w);
  const { rows } = e.simulateRaw();
  const trace = e.accountTrace();
  const i = rows.findIndex((r) => r.age === 63);
  const t = trace[i], L = t.passLog;
  expect(t.forcedPass).toBe(true);
  expect(rows[i].convChoice).toBe(undefined); // unsized: the plain fill
  expect(t.convertible > 0).toBe(true);
  const over = (p) => p.charged - p.realized;
  const ok = L.filter((p) => p.realized <= p.charged + 1e-9);
  const least = Math.min(...ok.map(over));
  const ties = L.map((p, j) => j).filter((j) => L[j].realized <= L[j].charged + 1e-9 && over(L[j]) === least);
  const best = ties.reduce((a, j) => (L[j].drift < L[a].drift ? j : a), ties[0]);
  expect(ties.length > 1).toBe(true);
  expect(best === ties[0]).toBe(false); // (not vacuous: the seed of the tie is not the smallest drift)
  expect(t.picked).toBe(best);
});

// Task 2c: a unit-slope year. In scan-grid's two-returns couple at 66 (401(k) 250k + 250k, taxable 300k, spending 130k, no
// elections, conversions on at the 22% fill; the guard off: a single phase), the year at 72 draws a fixed traditional total, so
// each dollar the fill gives back comes back as a dollar of draw: the realized draw moves one for one with the estimate and the line
// through two passes has no fixed point. The secant step's rounding sent the estimate to 0 and the year ran all 8 passes
// (MAGI_ITER_MAX, engine-state.js); the step now goes to the conversion's kink (here: the convertible balance) and the year settles,
// its realized draw within MAGI_ITER_TOL ($1) of the estimate the fill read.
it('a unit-slope year steps to the conversion kink and settles', async () => {
  const w = await world();
  const h = scanHouseholds({ conversions: true }).find((x) => x.g.filing === 'single-couple' && x.g.age === 66
    && x.g.trad === 500000 && x.g.taxable === 300000 && x.g.spending === 130000 && x.g.elections === 'none');
  await w.setState({ ...h.patch, cliffGuardEnabled: false });
  const e = await engine(w);
  const { rows } = e.simulateRaw();
  const trace = e.accountTrace();
  const i = rows.findIndex((r) => r.age === 72);
  const row = rows[i], t = trace[i];
  expect(row.conversionAmount > 0).toBe(true);
  expect(t.passes < 8).toBe(true);
  const draw = row.traditionalWithdrawn - row.rmd - (row.inheritedDraw || 0);
  expect(Math.abs(draw - t.estTrad) <= 1).toBe(true);
});

// Task 2c, option Y (owner 2026-10-31): an ACA year whose fill reads the draw takes the clamped secant while the two paired passes
// were charged the same premium. scan-grid's MFJ couple at 52 (401(k) 250k + 250k, taxable 300k, spending 60k, no elections,
// conversions on at the 22% fill; the guard off: a single phase) at 60: the premium is flat across the passes, and under the damped
// step the year ran all 8 passes (MAGI_ITER_MAX) and ended in a forced pass; it now settles, its realized draw within
// MAGI_ITER_TOL ($1) of the estimate the fill read.
it('an ACA year whose fill reads the draw settles while the premium holds', async () => {
  const w = await world();
  const h = scanHouseholds({ conversions: true }).find((x) => x.g.filing === 'mfj' && x.g.age === 52 && x.g.trad === 500000
    && x.g.taxable === 300000 && x.g.spending === 60000 && x.g.elections === 'none');
  await w.setState({ ...h.patch, cliffGuardEnabled: false });
  const e = await engine(w);
  const { rows } = e.simulateRaw();
  const trace = e.accountTrace();
  const i = rows.findIndex((r) => r.age === 60);
  const row = rows[i], t = trace[i];
  expect(t.passLog.length > 0).toBe(true); // an ACA year (its passes priced the premium off the estimate)
  expect(row.conversionAmount > 0).toBe(true);
  expect(t.passes < 8).toBe(true);
  expect(t.forcedPass).toBe(false);
  const draw = row.traditionalWithdrawn - row.rmd - (row.inheritedDraw || 0);
  expect(Math.abs(draw - t.estTrad) <= 1).toBe(true);
});

// ... and keeps the damped step when the paired passes were charged different premiums: scan-grid's two-returns couple at 52
// (401(k) 750k + 750k, taxable 300k, spending 60k, no elections, conversions on; the guard off) at 61 is charged a different premium
// on every pass, so every step is today's damped one (weight 1, then 0.5 from pass 3), the same double as before option Y, although
// the line's slope would allow a secant step in some of them (below 1 - 1e-3; none is a unit slope, so no kink jump).
it('an ACA year whose premium moves between passes keeps the damped step', async () => {
  const w = await world();
  const h = scanHouseholds({ conversions: true }).find((x) => x.g.filing === 'single-couple' && x.g.age === 52 && x.g.trad === 1500000
    && x.g.taxable === 300000 && x.g.spending === 60000 && x.g.elections === 'none');
  await w.setState({ ...h.patch, cliffGuardEnabled: false });
  const e = await engine(w);
  const { rows } = e.simulateRaw();
  const trace = e.accountTrace();
  const i = rows.findIndex((r) => r.age === 61);
  const t = trace[i], L = t.passLog;
  expect(rows[i].conversionAmount > 0).toBe(true);
  expect(t.forcedPass).toBe(false);
  expect(L.length).toBe(t.passes); // every pass logged: log index = pass index
  expect(L.length >= 5).toBe(true); // (not vacuous: steps at weight 0.5 too)
  let secantable = 0;
  for (let k = 1; k + 1 < L.length; k++) {
    expect(L[k].charged === L[k - 1].charged).toBe(false);
    expect(L[k].estTrad === L[k - 1].estTrad).toBe(false);
    const s = (L[k].realizedTrad - L[k - 1].realizedTrad) / (L[k].estTrad - L[k - 1].estTrad);
    expect(Math.abs(s - 1) > 1e-3).toBe(true); // not a unit slope (no kink jump)
    if (s < 1 - 1e-3) secantable++;
    expect(L[k + 1].estTrad).toBe(L[k].estTrad + (k >= 3 ? 0.5 : 1) * (L[k].realizedTrad - L[k].estTrad));
  }
  expect(secantable > 0).toBe(true); // (not vacuous: a secant step would have run there under the same premium)
});

// Task 2d (Fable audit finding 3): a non-ACA year whose fill reads the draw takes the secant step for estTrad, but the other
// estimates keep the damped step. scan-grid's single person at 52 (401(k) 500k, taxable 2000k, spending 60k, conversions on at the
// 22% fill), its plan as the tools run it (the guard on: the kept cliff plan applied), at 68: with the conversion pinned to 0 (the
// same plan, rothBracketByAge 68:0) the year's MAGI sits just under an IRMAA tier line. The conversion ceiling keeps the year in
// that tier; with the gains estimate stepping undamped it overshot the line, irmaaTierCeiling returned the next tier's line and the
// year converted up to it at the 8-pass cap. The line here is read from the rules module (irmaa.js), not copied from a run.
it('a secant year keeps the conversion in the IRMAA tier its no-conversion MAGI sits in', async () => {
  for (const elections of ['none', 'rule55']) {
    const w = await world();
    const h = scanHouseholds({ conversions: true }).find((x) => x.g.filing === 'single-person' && x.g.age === 52 && x.g.trad === 500000
      && x.g.taxable === 2000000 && x.g.spending === 60000 && x.g.elections === elections);
    expect(h).toBeDefined();
    await w.setState(h.patch);
    const e = await engine(w);
    const trace = e.accountTrace();
    const { rows } = e.simulate();
    const i = rows.findIndex((r) => r.age === 68);
    const row = rows[i];
    const store = await w.load('shared/core/store.js');
    const { cliffPlanStore } = await w.load('us/core/cliff-plan-store.js');
    const { storeRunContext } = await w.load('us/core/cliff-plan/planning.js');
    const { runProjection } = await w.load('us/core/projection/run-projection.js');
    const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
    const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
    const { MAGI_ITER_MAX } = await w.load('us/core/projection/engine-state.js');
    const ir = await w.load('us/core/healthcare/irmaa.js');
    const st = store.state;
    const ctx0 = storeRunContext(st, { plan: cliffPlanStore.plan, planMode: 'apply', overrides: { rothBracketByAge: new Map([[68, 0]]), withdrawalMixByAge: null } });
    const row0 = runProjection(ctx0, { mode: STANDARD_MODE, source: standardYearSource(st), retireAgeA: st.retireAgeA, retireAgeB: st.retireAgeB }).rows[i];
    expect(row0.age).toBe(68);
    expect(row0.conversionAmount).toBe(0);
    expect(row.conversionAmount > 0).toBe(true); // (not vacuous: the year converts)
    // The first IRMAA tier line above the no-conversion MAGI, in the engine's MAGI (the single return's own benefit).
    const line = ir.magiForIrmaaLine(ir.irmaaTierCeiling(ctx0, ir.irmaaMagiOf(row0.magiProxy, row0.ss, 'single'), 'single', row.year), row0.ss, 'single');
    expect(Number.isFinite(line)).toBe(true);
    expect(row0.magiProxy <= line).toBe(true);
    expect(row.magiProxy <= line).toBe(true);
    expect(trace[i].passes < MAGI_ITER_MAX).toBe(true);
  }
});

// Task 2f (spec 4.1, "The IRMAA tier within a year"): the conversion ceiling caps at min(line, hold) for the IRMAA holds the year
// loop keeps (irmaaHold, household; irmaaHoldA / irmaaHoldB, per return), and reports the line it computed in CEIL_OUT. With every
// hold Infinity it is the very double of a call without them. The arguments: a retired single person at 66 (the household branch)
// and a two-return couple at 66 (the two-return branch), ACA off, no Social Security (the engine's MAGI is IRMAA's).
it('the conversion ceiling caps at the IRMAA hold and reports its line', async () => {
  const w = await world();
  await w.setState({ acaEnabled: false, stateTax: 'tx' });
  const { conversionMagiCeiling, CEIL_OUT } = await w.load('us/core/withdrawals/roth-conversion.js');
  const ctx = await w.ctx();
  const H = { acaEligibleA: false, acaEligibleB: false, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false, workingA: false, workingB: false, age: 66, ageB: 66, preConvMagi: 80000, filing: 'single', year: 0, profile: { singlePerson: true, ssA: 0, ssB: 0, dependents: [] } };
  const base = conversionMagiCeiling(ctx, H);
  expect([CEIL_OUT.lineA, CEIL_OUT.lineB]).toStrictEqual([NaN, NaN]);
  expect(CEIL_OUT.line).toBe(109000); // the 2026 single first-tier bound (irmaa.js IRMAA_TIERS), no Social Security to translate
  expect(base).toBe(109000);
  expect(Object.is(conversionMagiCeiling(ctx, { ...H, irmaaHold: Infinity, irmaaHoldA: Infinity, irmaaHoldB: Infinity }), base)).toBe(true);
  expect(conversionMagiCeiling(ctx, { ...H, irmaaHold: 90000 })).toBe(90000);
  expect(CEIL_OUT.line).toBe(109000); // the line before the hold
  expect(conversionMagiCeiling(ctx, { ...H, irmaaHold: 120000 })).toBe(109000); // a hold above the line binds nothing
  // Two returns: each return allows (its line - its MAGI) / its share of the conversion; A's MAGI 60,000, B's 0, share 1/2.
  const T = { ...H, singlePerson: false, twoReturns: true, preConvMagi: 60000, preMagiA: 60000, preMagiB: 0, shareA: 0.5, profile: { singlePerson: false, ssA: 0, ssB: 0, dependents: [] } };
  const base2 = conversionMagiCeiling(ctx, T);
  expect([CEIL_OUT.line, CEIL_OUT.lineA, CEIL_OUT.lineB]).toStrictEqual([NaN, 109000, 109000]);
  expect(base2).toBe(158000); // A binds: (109,000 - 60,000) / 0.5 = 98,000 of room
  expect(Object.is(conversionMagiCeiling(ctx, { ...T, irmaaHold: Infinity, irmaaHoldA: Infinity, irmaaHoldB: Infinity }), base2)).toBe(true);
  expect(conversionMagiCeiling(ctx, { ...T, irmaaHoldA: 100000 })).toBe(140000); // (100,000 - 60,000) / 0.5 = 80,000 of room
  expect(conversionMagiCeiling(ctx, { ...T, irmaaHoldB: 20000 })).toBe(100000); // B binds: (20,000 - 0) / 0.5 = 40,000
  expect(conversionMagiCeiling(ctx, { ...T, irmaaHold: 1 })).toBe(158000); // the household hold is not read on two returns
});

// The tier line just above `m` (engine MAGI) and the one below it, for a single return with benefit `ss` in year `year`.
function tierLines(ir, ctx, m, ss, year) {
  const x = ir.irmaaMagiOf(m, ss, 'single'),
    tiers = ir.irmaaTiers(ctx, 'single', year),
    j = tiers.findIndex(([cap, , inc]) => (inc ? x <= cap : x < cap));
  const at = (k) => ir.magiForIrmaaLine(ir.irmaaTierCeiling(ctx, tiers[k][0], 'single', year), ss, 'single');
  return { hi: at(j), lo: j > 0 ? at(j - 1) : -Infinity };
}

// A single return's year at `age` with the conversion pinned to 0 (rothBracketByAge age:0), under the store's plan as the tools
// run it (none with the guard off): the year's no-conversion row (the premise of the tier and release cases) and its tier lines.
async function noConversionYear(w, age, i, year) {
  const store = await w.load('shared/core/store.js');
  const { cliffPlanStore } = await w.load('us/core/cliff-plan-store.js');
  const { storeRunContext } = await w.load('us/core/cliff-plan/planning.js');
  const { runProjection } = await w.load('us/core/projection/run-projection.js');
  const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const ir = await w.load('us/core/healthcare/irmaa.js');
  const st = store.state;
  const plan = st.cliffGuardEnabled ? cliffPlanStore.plan : null;
  const ctx0 = storeRunContext(st, { plan, planMode: plan ? 'apply' : 'off', overrides: { rothBracketByAge: new Map([[age, 0]]), withdrawalMixByAge: null } });
  const row0 = runProjection(ctx0, { mode: STANDARD_MODE, source: standardYearSource(st), retireAgeA: st.retireAgeA, retireAgeB: st.retireAgeB }).rows[i];
  return { row0, ...tierLines(ir, ctx0, row0.magiProxy, row0.ss, year) };
}

// The release cases' check: at `age` the year released a hold (`converged`: on a pass that had converged), converts more than $0
// and lands above the tier line below its no-conversion MAGI and at most the one above it; the kept pass holds the higher line.
async function releaseCase(patch, age, converged) {
  const w = await world();
  await w.setState(patch);
  const { MAGI_ITER_MAX } = await w.load('us/core/projection/engine-state.js');
  const e = await engine(w);
  const trace = e.accountTrace();
  const { rows } = e.simulate();
  const i = rows.findIndex((r) => r.age === age);
  const row = rows[i], t = trace[i];
  const { row0, hi, lo } = await noConversionYear(w, age, i, row.year);
  expect(row0.age).toBe(age);
  expect(row0.conversionAmount).toBe(0);
  expect(row0.magiProxy > lo && row0.magiProxy <= hi).toBe(true); // the premise: the no-conversion MAGI sits between the two lines
  expect(t.holdReleases > 0).toBe(true); // a hold below it was released (W4: the trace's count)
  if (converged) expect(t.holdReleasesConverged > 0).toBe(true);
  expect(row.conversionAmount > 0).toBe(true);
  expect(row.magiProxy > lo).toBe(true);
  expect(row.magiProxy <= hi).toBe(true);
  expect(t.irmaaHold).toBe(hi); // the kept pass reads the higher line (released, then held there)
  expect(t.passes < MAGI_ITER_MAX).toBe(true);
}
const gridOf = (filing, age, trad, taxable, spending) => scanHouseholds({ conversions: true }).find((x) => x.g.filing === filing && x.g.age === age
  && x.g.trad === trad && x.g.taxable === taxable && x.g.spending === spending && x.g.elections === 'none').patch;

// The probe release (rule 2): a year whose no-conversion MAGI sits above the tier line an earlier pass read converts to the next
// line, as main's rule intends: the pass that converted nothing under the held lower line realized a MAGI above it, so the hold
// is released and the next pass reads its own line. scan-grid's single person at 52 (401(k) 500k, taxable 2000k, spending 130k, no
// elections, conversions on at the 22% fill) at 69, and the HoH household at 66 (401(k) 500k, taxable 2000k, spending 130k) at 66,
// the guard off (one phase). Found by scanning the grid for released years (Task 2f); the premise is checked with the conversion
// pinned to 0, as the tier case does.
it('a pass converting nothing releases the held tier when the year sits higher', async () => {
  await releaseCase({ ...gridOf('single-person', 52, 500000, 2000000, 130000), cliffGuardEnabled: false }, 69, false);
  await releaseCase({ ...gridOf('hoh', 66, 500000, 2000000, 130000), cliffGuardEnabled: false }, 66, false);
});

// The converged probe (rule 2's second case): a pass that converted nothing under the held line and came within MAGI_ITER_TOL of
// its estimates would end the phase at 0; its no-conversion MAGI is above the held line, so the release makes it take the update
// and the year converts to the higher line. scan-grid's single person at 62 (401(k) 500k, taxable 300k, spending 130k, no
// elections, conversions on), its plan as the tools run it, at 65 (found by scanning the grid; the trace counts the release).
it('a converged pass converting nothing still releases the held tier', async () => {
  await releaseCase(gridOf('single-person', 62, 500000, 300000, 130000), 65, true);
});

// The gate (rule 0, review C1): the holds act only on a pass whose conversion is solved under the MAGI ceiling. A conversions-off
// household at 63+ and the same household converting only outside its window give the same rows, row for row, with the holds
// forced off (ctx.test.irmaaHoldOff: the conversion ceiling as before Task 2f) as with them on, in the plan modes the engine runs
// (off, and choose with both levers).
it('the IRMAA holds change nothing in a year that does not fill under the ceiling', async () => {
  const h = scanHouseholds({ conversions: false }).find((x) => x.g.filing === 'mfj' && x.g.age === 66 && x.g.trad === 1500000
    && x.g.taxable === 2000000 && x.g.spending === 130000 && x.g.elections === 'none');
  for (const patch of [h.patch, { ...h.patch, rothConvEnabled: true, rothConvStartAge: 55, rothConvEndAge: 60 }]) {
    const runs = [];
    for (const off of [false, true]) {
      const w = await world();
      await w.setState(patch);
      (await w.load('us/core/test-hooks.js')).assignIrmaaHoldOff(off);
      const P = await usPlan(w);
      const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
      runs.push([P.runPlanMode({ planMode: 'off' }).rows, P.runPlanMode({ planMode: 'choose', plan: makePlan({ levers: { order: true, split: true } }) }).rows]);
    }
    expect(runs[0][0].some((r) => r.age >= 63)).toBe(true);
    expect(runs[1]).toStrictEqual(runs[0]);
  }
});

// The secant years without the damping (rule 4): the non-draw estimates take the plain step again (b50d53b's weight 1), the tier
// being protected by the hold. The snapshot's `std G two returns 66 irmaa smooth` (two single returns at 66, 401(k) 250k + 250k,
// taxable 300k, spending 130k, smooth, converting 66-72 at the 22% fill, the guard off: one phase) at 66 and 67: under 90f9e8b's
// damped gains step both years ran all MAGI_ITER_MAX passes; they now settle, the draw and the gains estimates within
// MAGI_ITER_TOL ($1, engine-state.js) of what the kept pass realized.
it('a secant year settles its draw and gains estimates without the damping', async () => {
  const w = await world();
  const sc = scenarios(true).find((s) => s.name === 'std G two returns 66 irmaa smooth');
  await w.setState({ ...legacyToAccounts(sc.patch, null), cliffGuardEnabled: false });
  const { MAGI_ITER_MAX, MAGI_ITER_TOL } = await w.load('us/core/projection/engine-state.js');
  const e = await engine(w);
  const { rows } = e.simulateRaw();
  const trace = e.accountTrace();
  for (const i of [0, 1]) {
    const row = rows[i], t = trace[i];
    expect(row.conversionAmount > 0).toBe(true);
    expect(t.passes < MAGI_ITER_MAX).toBe(true);
    const draw = row.traditionalWithdrawn - row.rmd - (row.inheritedDraw || 0);
    expect(Math.abs(draw - t.estTrad) <= MAGI_ITER_TOL).toBe(true);
    expect(Math.abs(t.gainRealized - t.estGain) <= MAGI_ITER_TOL).toBe(true);
  }
});

// The replay check (ctx.test.replayCheck, testHooks' counters): every replayed pass (R2-R6), forced pass and seeded phase's first
// pass of a run repeats its source (the holds entering it, its conversion and MAGI). `run` runs the household; the counters of
// `kinds` (null: their sum over every kind) must be above 0 and replayMismatch 0.
async function replayChecked(patch, run, kinds) {
  const w = await world();
  await w.setState(patch);
  const { testHooks, assignReplayCheck } = await w.load('us/core/test-hooks.js');
  assignReplayCheck(true);
  await run(w);
  if (kinds === null) expect(Object.keys(testHooks).filter((k) => k.startsWith('replayChecked')).reduce((n, k) => n + testHooks[k], 0) > 0).toBe(true);
  else for (const k of kinds) expect(testHooks['replayChecked' + k] > 0, k).toBe(true);
  expect(testHooks.replayMismatchLast).toBe(null);
  expect(testHooks.replayMismatch).toBe(0);
  return testHooks;
}
// The plan as the tools run it (planning: choose and its replays) and its apply run, with the trace.
const plannedRun = async (w) => {
  const e = await engine(w);
  e.simulate();
  e.accountTrace();
};

// (f) The tier household of 90f9e8b's case, the release households and the converged probe's, planned (the guard on) and run: no
// replayed, forced or seeded pass differs from its source.
it('the replay check: the tier and release households repeat every replayed pass', async () => {
  for (const elections of ['none', 'rule55']) {
    const h = scanHouseholds({ conversions: true }).find((x) => x.g.filing === 'single-person' && x.g.age === 52 && x.g.trad === 500000
      && x.g.taxable === 2000000 && x.g.spending === 60000 && x.g.elections === elections);
    await replayChecked(h.patch, plannedRun, null);
  }
  await replayChecked(gridOf('single-person', 52, 500000, 2000000, 130000), plannedRun, null);
  await replayChecked(gridOf('hoh', 66, 500000, 2000000, 130000), plannedRun, null);
  await replayChecked(gridOf('single-person', 62, 500000, 300000, 130000), plannedRun, null);
});

// Targeted (review I5): the sites the scan data does not reach.
// S1, the 162(l) switch (seHeld) kept the holds: a self-employed single person (net 20,000 a year to 69) from 63, ACA on, 401(k)
// 300k, taxable 100k, spending 50k, converting 63-72 at the 22% fill, the guard off (found by a sweep of such households).
it('the replay check reaches the 162(l) switch (S1) in a converting household', async () => {
  const ZERO = { cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
  const patch = { ...ZERO, singlePerson: true, ageA: 63, retireAgeA: 69, incomeA: 20000, incomeKindA: 'self', acaEnabled: true, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, medicalInflation: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0, megaBackdoor: false, cliffGuardEnabled: false, taxable: 100000, trad401kA: 300000, spending: 50000, rothConvEnabled: true, rothConvStartAge: 63, rothConvEndAge: 72, rothConvBracket: 22 };
  let rows = null;
  await replayChecked(patch, async (w) => {
    rows = (await usPlan(w)).runPlanMode({ planMode: 'off' }).rows;
  }, ['SeedS1']);
  expect(rows.some((r) => r.conversionAmount > 0)).toBe(true);
});

// R1, the forced pick restores the holds: scan-grid #24 (the forced plain-fill case above) at 63, an ACA year whose fill reads the
// ceiling (a finite hold), forced; the guard off.
it('the replay check reaches a forced year with a finite hold (R1)', async () => {
  const h = scanHouseholds({ conversions: true }).find((x) => x.g.filing === 'mfj' && x.g.age === 58 && x.g.trad === 500000
    && x.g.taxable === 300000 && x.g.spending === 60000 && x.g.elections === 'none');
  let t = null;
  await replayChecked({ ...h.patch, cliffGuardEnabled: false }, async (w) => {
    const e = await engine(w);
    const rows = e.simulateRaw().rows;
    t = e.accountTrace()[rows.findIndex((r) => r.age === 63)];
  }, ['Forced']);
  expect(t.forcedPass).toBe(true);
  expect(Number.isFinite(t.irmaaHold)).toBe(true);
});

// R2, apply's split pass that drew nothing replays the stage's starting record: two-return-split.test.js's carry-in 2 household
// (SPLIT_H1 in Nevada with ACA, B's pension 62,000 from 61, spending 14,500, life 62) with a split intent at 61.
it('the replay check reaches apply\'s split pass that drew nothing (R2)', async () => {
  const patch = { ...SPLIT_H1, acaEnabled: true, acaEnhanced: false, stateTax: 'nv', pensionYearlyB: 62000, pensionStartAgeB: 61, lifeExpectancyA: 62, lifeExpectancyB: 62, spending: 14500 };
  await replayChecked(patch, async (w) => {
    const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
    (await usPlan(w)).runPlanMode({ planMode: 'apply', plan: makePlan({ splits: { 61: 'A' } }) });
  }, ['R2']);
});

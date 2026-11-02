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

// ... and keeps the damped step when the paired passes were charged different premiums (more than PREMIUM_SAME_TOL apart, S3 Task
// 8c): scan-grid's two-returns couple at 58 (401(k) 250k + 250k, taxable 2000k, spending 60k, SEPP elections, conversions on at the
// 22% fill), smooth withdrawals, the guard off (one phase), at 63 is charged a different premium on each pass the update pairs
// (13,878.15, 13,924.05, 13,919.42, 13,919.84, 13,919.82: gaps 45.90, 4.64, 0.42 and 0.018), so each such step is today's damped
// one (weight 1, then 0.5 from pass 3), the same double as before option Y, although the line's slope would allow a secant step
// there (below 1 - 1e-3; none is a unit slope, so no kink jump). The check runs per pair: a pair within PREMIUM_SAME_TOL (as a
// converging year's tail eventually is) is the same premium, not this case's rule, and is skipped; at least one damped step (weight
// 0.5) must stand where the secant was available (here the pairs at passes 3 and 4, gaps 0.42 and 0.018). Re-found at S3 Task 8c
// (review I1: made per pair; the scan grid's other candidates, both withdrawal modes, are SEPP households with damped-secant gaps
// of $0.011-$0.044, or one whose conversion is under a cent): the household before it (two returns at 52, 750k + 750k, taxable 300k,
// spending 60k, no elections, default withdrawals, at 61) was charged a "different" premium on every pass only by rounding noise
// ($0.00001-$0.00015: the fill's `estTrad + conversion` is the bracket top only to rounding), the same premium within
// PREMIUM_SAME_TOL, so under 8c it takes the secant (7 passes -> 3) and no longer tests the damped step (ruling 17; a premise check,
// ruling 7). Found by sweeping the scan grid (both withdrawal modes, guard off) for an ACA year of at least 5 logged passes with a
// damped step, charged differently from the pass before it, where a secant would have run.
it('an ACA year whose premium moves between passes keeps the damped step', async () => {
  const w = await world();
  const h = scanHouseholds({ conversions: true, mode: 'smooth' }).find((x) => x.g.filing === 'single-couple' && x.g.age === 58 && x.g.trad === 500000
    && x.g.taxable === 2000000 && x.g.spending === 60000 && x.g.elections === 'sepp');
  await w.setState({ ...h.patch, cliffGuardEnabled: false });
  const { PREMIUM_SAME_TOL } = await w.load('us/core/projection/engine-state.js');
  const e = await engine(w);
  const { rows } = e.simulateRaw();
  const trace = e.accountTrace();
  const i = rows.findIndex((r) => r.age === 63);
  const t = trace[i], L = t.passLog;
  expect(rows[i].healthcare > 0).toBe(true); // a marketplace year
  expect(rows[i].conversionAmount > 0).toBe(true);
  expect(t.forcedPass).toBe(false);
  expect(L.length).toBe(t.passes); // every pass logged: log index = pass index
  expect(L.length >= 5).toBe(true); // (not vacuous: steps at weight 0.5 too)
  let dampedSecantable = 0;
  for (let k = 1; k + 1 < L.length; k++) {
    if (!(Math.abs(L[k].charged - L[k - 1].charged) > PREMIUM_SAME_TOL)) continue; // the same premium: not this case's rule
    expect(L[k].estTrad === L[k - 1].estTrad, `pass ${k}`).toBe(false);
    const s = (L[k].realizedTrad - L[k - 1].realizedTrad) / (L[k].estTrad - L[k - 1].estTrad);
    expect(Math.abs(s - 1) > 1e-3, `pass ${k}`).toBe(true); // not a unit slope (no kink jump)
    if (k >= 3 && s < 1 - 1e-3) dampedSecantable++;
    expect(L[k + 1].estTrad, `pass ${k}`).toBe(L[k].estTrad + (k >= 3 ? 0.5 : 1) * (L[k].realizedTrad - L[k].estTrad));
  }
  expect(dampedSecantable > 0).toBe(true); // (not vacuous: a damped step where the secant would have run under the same premium)
});

// S3 Task 8c (ruling 17): a pass charged the same premium as the pass before it (within PREMIUM_SAME_TOL) takes the plain step, not
// the damped one: the estimates between the two crossed no step of the ACA schedule, so the cliff the damping guards against is not
// in play. scan-grid's MFJ couple at 52 (401(k) 750k + 750k, taxable 2000k, spending 60k, no elections, conversions on at the 22%
// fill), the guard off (one phase), at 63 and 64: every pass sits over the 400% line and pays the same full premium. Before 8c the
// damped gains step (weight 0.5 from pass 3) crawled: 63 ended forced (9 passes, kept drift $4.31) and 64 took all 8 passes; now
// both converge, 64 in fewer passes.
it('an ACA year whose passes pay the same premium steps undamped', async () => {
  const w = await world();
  await w.setState({ ...gridOf('mfj', 52, 1500000, 2000000, 60000), cliffGuardEnabled: false });
  const { fplForHousehold, acaHouseholdSize } = await w.load('us/core/healthcare/aca.js');
  const { MAGI_ITER_TOL, PREMIUM_SAME_TOL } = await w.load('us/core/projection/engine-state.js');
  const ctx = await w.ctx();
  const e = await engine(w);
  const { rows } = e.simulateRaw();
  const trace = e.accountTrace();
  for (const age of [63, 64]) {
    const i = rows.findIndex((r) => r.age === age), t = trace[i], L = t.passLog;
    const line = fplForHousehold(ctx, acaHouseholdSize(ctx, ctx.inputs.singlePerson, false, i), i) * 4;
    expect(rows[i].healthcare > 0, `at ${age}`).toBe(true); // a marketplace year
    // the premise: over the line on every pass, each charged the first pass's premium (within the tolerance)
    expect(L.length >= 2, `at ${age}`).toBe(true);
    expect(L.every((p) => p.preConv > line), `at ${age}`).toBe(true);
    expect(L.every((p) => Math.abs(p.charged - L[0].charged) <= PREMIUM_SAME_TOL), `at ${age}`).toBe(true);
    expect(t.forcedPass, `at ${age}`).toBe(false);
    expect(L.at(-1).drift <= MAGI_ITER_TOL, `at ${age}`).toBe(true);
    if (age === 64) expect(t.passes < 8, 'at 64').toBe(true);
  }
});

// S3 Task 8c (ruling 17): option Y's secant reads the same test, so a fill that reads the draw takes it through sub-cent noise in the
// premium. The snapshot's `hist R rothConv+aca | real2000` (the couple at 52, converting 52-60 at the 24% fill, ACA on, the guard on,
// on the 2000 real-returns path) at 59 (year index 7): every pass is charged 6,174.40, but the doubles differ below a thousandth of a
// cent (the fill's `estTrad + conversion` is the bracket top only to rounding), so before 8c `healthcare === secHc` failed, the
// secant never ran and the year ended unresolved after 8 damped passes.
it('a fill that holds the MAGI estimate takes the secant through sub-cent premium noise', async () => {
  const w = await world();
  const sc = scenarios(true).find((s) => s.name === 'hist R rothConv+aca | real2000');
  const base = await w.setState({});
  await w.setState({ ...JSON.parse(JSON.stringify(base)), ...legacyToAccounts(sc.patch, base) });
  const { magiStats, MAGI_ITER_TOL, PREMIUM_SAME_TOL } = await w.load('us/core/projection/engine-state.js');
  const e = await engine(w);
  const rowFn = (await usPlan(w)).rowFnFor(sc.series);
  e.simulate(); // plans the household first, so the counter below is the trace run's alone
  const u0 = magiStats.unresolved;
  const trace = e.accountTrace(undefined, undefined, rowFn);
  const unresolved = magiStats.unresolved - u0;
  const t = trace[7], L = t.passLog;
  expect(t.profile.ageA).toBe(59);
  // the premise: the charges differ, by at most the tolerance; the conversion reads the draw (the estimate moves, and the fill's
  // estTrad + conversion stays the bracket top to within a cent)
  const charged = L.map((p) => p.charged);
  expect(L.length >= 2).toBe(true);
  expect(Math.max(...charged) - Math.min(...charged) > 0).toBe(true);
  expect(Math.max(...charged) - Math.min(...charged) <= PREMIUM_SAME_TOL).toBe(true);
  expect(L.some((p) => p.estTrad !== L[0].estTrad)).toBe(true);
  expect(L.every((p) => p.conversion > 0 && Math.abs(p.estTrad + p.conversion - (L[0].estTrad + L[0].conversion)) <= 0.01)).toBe(true);
  expect(t.passes <= 4).toBe(true);
  expect(L.at(-1).drift <= MAGI_ITER_TOL).toBe(true);
  expect(t.forcedPass).toBe(false);
  expect(unresolved).toBe(0); // the run's unresolved years (before 8c: this one)
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

// Task 2g (spec 4.1, the tighter release): CEIL_OUT also says whether a hold set the ceiling: `held` (household) when the hold is
// below the line and no lower cap (the ACA 400% line) set the ceiling; `heldA` / `heldB` (two returns) when that return's held
// room is the room that set it. A retired single person at 63 on the marketplace (ACA on, not enhanced): the 400% line is 4 x the
// 2026 single FPL (aca.js fplForHousehold: 15,650 x 4 = 62,600 in year 0); the IRMAA first-tier line 109,000.
it('the conversion ceiling says when the hold set it', async () => {
  const w = await world();
  await w.setState({ acaEnabled: true, acaEnhanced: false, stateTax: 'tx' });
  const { conversionMagiCeiling, CEIL_OUT } = await w.load('us/core/withdrawals/roth-conversion.js');
  const ctx = await w.ctx();
  const H = { acaEligibleA: true, acaEligibleB: false, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false, workingA: false, workingB: false, age: 63, ageB: 63, preConvMagi: 40000, filing: 'single', year: 0, profile: { singlePerson: true, ssA: 0, ssB: 0, dependents: [] } };
  const held = () => [CEIL_OUT.held, CEIL_OUT.heldA, CEIL_OUT.heldB];
  // the ACA line caps at 62,599: the 62,600 line less the $1 margin (S3, Task 8b)
  expect(conversionMagiCeiling(ctx, H)).toBe(62599);
  expect(held()).toStrictEqual([false, false, false]);
  expect(conversionMagiCeiling(ctx, { ...H, irmaaHold: 100000 })).toBe(62599); // below the line, above the ACA cap: not binding
  expect(CEIL_OUT.line).toBe(109000);
  expect(held()).toStrictEqual([false, false, false]);
  expect(conversionMagiCeiling(ctx, { ...H, irmaaHold: 50000 })).toBe(50000); // under both: the hold set the ceiling
  expect(held()).toStrictEqual([true, false, false]);
  expect(conversionMagiCeiling(ctx, { ...H, irmaaHold: 62599 })).toBe(62599); // a tie with the ACA cap counts as binding
  expect(held()).toStrictEqual([true, false, false]);
  // a hold between the ACA cap (62,599) and the line (62,600): the cap is lower, so the hold did not set the ceiling
  expect(conversionMagiCeiling(ctx, { ...H, irmaaHold: 62600 })).toBe(62599);
  expect(held()).toStrictEqual([false, false, false]);
  expect(conversionMagiCeiling(ctx, { ...H, acaEligibleA: false, irmaaHold: 100000 })).toBe(100000); // off the marketplace: binding
  expect(held()).toStrictEqual([true, false, false]);
  expect(conversionMagiCeiling(ctx, { ...H, acaEligibleA: false, irmaaHold: 120000 })).toBe(109000); // above the line: not binding
  expect(held()).toStrictEqual([false, false, false]);
  // Two returns (ACA off for them): A's MAGI 60,000, B's 0, share 1/2; the unheld rooms are 98,000 (A) and 218,000 (B).
  const T = { ...H, acaEligibleA: false, singlePerson: false, twoReturns: true, age: 66, ageB: 66, preConvMagi: 60000, preMagiA: 60000, preMagiB: 0, shareA: 0.5, profile: { singlePerson: false, ssA: 0, ssB: 0, dependents: [] } };
  expect(conversionMagiCeiling(ctx, T)).toBe(158000);
  expect(held()).toStrictEqual([false, false, false]);
  expect(conversionMagiCeiling(ctx, { ...T, irmaaHoldA: 100000 })).toBe(140000); // A's held room 80,000 is the minimum
  expect(held()).toStrictEqual([false, true, false]);
  expect(conversionMagiCeiling(ctx, { ...T, irmaaHoldB: 20000 })).toBe(100000); // B's held room 40,000 is the minimum
  expect(held()).toStrictEqual([false, false, true]);
  expect(conversionMagiCeiling(ctx, { ...T, irmaaHoldA: 100000, irmaaHoldB: 50000 })).toBe(140000); // B held at 100,000 of room: not the minimum
  expect(held()).toStrictEqual([false, true, false]);
  expect(conversionMagiCeiling(ctx, { ...T, irmaaHoldA: 100000, irmaaHoldB: 40000 })).toBe(140000); // both held rooms 80,000: both bind
  expect(held()).toStrictEqual([false, true, true]);
  expect(conversionMagiCeiling(ctx, { ...T, irmaaHoldA: 120000 })).toBe(158000); // above A's line: not held
  expect(held()).toStrictEqual([false, false, false]);
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
// is released and the next pass reads its own line. scan-grid's single person at 66 (401(k) 1500k, taxable 300k, spending 130k, no
// elections, conversions on at the 22% fill) at 68, and the HoH household at 66 (401(k) 500k, taxable 2000k, spending 130k) at 66,
// the guard off (one phase). Found by scanning the grid for released years (Task 2f); the premise is checked with the conversion
// pinned to 0, as the tier case does. The first household was re-found at S3 (the rule moved the single person at 52 (401(k) 500k,
// taxable 2000k, spending 130k)'s later years: at 69 it no longer releases a hold).
it('a pass converting nothing releases the held tier when the year sits higher', async () => {
  await releaseCase({ ...gridOf('single-person', 66, 1500000, 300000, 130000), cliffGuardEnabled: false }, 68, false);
  await releaseCase({ ...gridOf('hoh', 66, 500000, 2000000, 130000), cliffGuardEnabled: false }, 66, false);
});

// The converged probe (rule 2's second case): a pass that converted nothing under the held line and came within MAGI_ITER_TOL of
// its estimates would end the phase at 0; its no-conversion MAGI is above the held line, so the release makes it take the update
// and the year converts to the higher line. scan-grid's single person at 62 (401(k) 500k, taxable 300k, spending 130k, no
// elections, conversions on), its plan as the tools run it, at 65 (found by scanning the grid; the trace counts the release).
it('a converged pass converting nothing still releases the held tier', async () => {
  await releaseCase(gridOf('single-person', 62, 500000, 300000, 130000), 65, true);
});

// An ACA year over the 400% line converts (S3, rulings 1 and 3). Before S3 this case was 'a pass converting nothing under the ACA
// line keeps a hold that did not set the ceiling': the ACA line set the ceiling below the year's MAGI, so the year converted $0 and
// the tighter release (Task 2g) released nothing. Its premise was the brake itself (an ACA year over the line held at $0), which
// S3 removes: over the line the credit is already lost, so the line holds nothing and the IRMAA ceiling (the hold, or the tier
// line) caps the conversion. The tighter release for a year under the line stays tested at the direct-call level ('the conversion
// ceiling says when the hold set it'). scan-grid's single person at 62 (401(k) 500k, taxable 2000k, spending 130k, no elections,
// conversions on at the 22% fill), the guard off, at 63 and 64: with the conversion pinned to 0 the year's MAGI is over the line
// (the premise); the year converts more than $0 ($29,319 at 63) and stays in the IRMAA tier its no-conversion MAGI sits in, and pays the very
// premium of the pinned year (both over the line pay the full premium: the conversion costs no credit).
it('an ACA year over the 400% line converts under its IRMAA hold', async () => {
  const w = await world();
  await w.setState({ ...gridOf('single-person', 62, 500000, 2000000, 130000), cliffGuardEnabled: false });
  const { fplForHousehold } = await w.load('us/core/healthcare/aca.js');
  const { MAGI_ITER_MAX, MAGI_ITER_TOL } = await w.load('us/core/projection/engine-state.js');
  const ctx = await w.ctx();
  const e = await engine(w);
  const { rows } = e.simulateRaw();
  const trace = e.accountTrace();
  for (const age of [63, 64]) {
    const i = rows.findIndex((r) => r.age === age), row = rows[i];
    const line = fplForHousehold(ctx, 1, i) * 4; // the 400% line, a household of 1
    const { row0, hi } = await noConversionYear(w, age, i, row.year);
    expect(row0.age).toBe(age);
    expect(row0.conversionAmount).toBe(0);
    expect(row0.healthcare > 0).toBe(true); // a marketplace year
    expect(row0.magiProxy > line).toBe(true); // the premise: over the line with no conversion
    expect(row.conversionAmount > 0).toBe(true);
    // in the IRMAA tier the no-conversion year sits in, up to the iteration's tolerance: the fill sizes the conversion on the pass's
    // estimate, and a converged pass realizes at most MAGI_ITER_TOL more (at 63 the row lands $0.87 over the earn-year tier line).
    // Harmless while the tiers index: the surcharge is charged on the charge year's table (irmaaSurcharge at the charge year),
    // indexed two years past the earn-year line the ceiling reads, so it is the same at the landing MAGI and $1 below it; only a
    // flat index (zero inflation) would price a full tier step for the overshoot.
    expect(row.magiProxy - hi <= MAGI_ITER_TOL).toBe(true);
    // Tripwires (review M5): the year converges, unforced, in fewer than MAGI_ITER_MAX passes (asserted; S3 Task 8c's run took 6 at
    // both ages). Before S3 Task 8c it converged on its 8th and last allowed pass
    // (MAGI_ITER_MAX), drift $0.90: the damped step (weight 0.5 from pass 3) applied to the gains estimate in a year whose passes
    // all pay the same full premium made each drift about 0.42 of the last (6,243, 1,058, 179, then 30, 12.6, 5.2, 2.2, 0.90). 8c
    // takes the plain step while consecutive passes are charged the same premium (within PREMIUM_SAME_TOL), so each drift is about
    // 0.17 of the last throughout (at 63: 6,243, 1,058, 179, 30, 5.15, 0.87; at 64 the last drift is $0.94).
    // Not luck, and not a straddle. If these fail, read it as "the convergence slowed", not as a broken rule.
    expect(trace[i].forcedPass || trace[i].capPicked).toBe(false);
    expect(trace[i].passes < MAGI_ITER_MAX, `at ${age}`).toBe(true);
    expect(trace[i].passLog.at(-1).drift <= MAGI_ITER_TOL).toBe(true);
    expect(row.healthcare).toBe(row0.healthcare);
  }
});

// (g) A year whose pre-conversion MAGI straddles the 400% line between passes (S3, ruling 4): one pass's preConvMagi (the passLog's
// `preConv`) at or under the household line, capped at the line, another's over it, filling the bracket above the draw. The
// existing ACA branch of the iteration handles it: the year ends converged (the last logged pass within MAGI_ITER_TOL) or forced
// (the forced pick re-runs a logged pass charged at least its realized price), never unresolved. scan-grid's single person at 52
// (401(k) 500k, taxable 300k, spending 60k, no elections, conversions on at the 22% fill), the guard off, found by a sweep of the
// grid on this tree: at 59 the passes sit at 0, 5,670, 57,394, 60,229 and 74,412 (at or under the 74,412 line; each realized the
// full premium, charged the credit price) and 80,082 and 77,247 (over it), and the year ends forced, keeping the last pass over the
// line (the over regime, charged its realized price); at 60 the first pass sits at 31,871 (under the 76,272 line)
// and the rest over it (88,039 to 158,230), and the year converges in the over regime. No price check here: before the $1 margin a
// year capped at the line can land cents over it (the knife-edge; (g2), Task 8b).
it('a year whose pre-conversion MAGI crosses the line between passes ends converged or forced, never unresolved', async () => {
  const w = await world();
  await w.setState({ ...gridOf('single-person', 52, 500000, 300000, 60000), cliffGuardEnabled: false });
  const { fplForHousehold, acaHouseholdSize } = await w.load('us/core/healthcare/aca.js');
  const { magiStats, MAGI_ITER_TOL } = await w.load('us/core/projection/engine-state.js');
  const ctx = await w.ctx();
  const e = await engine(w);
  const u0 = magiStats.unresolved;
  const { rows } = e.simulateRaw();
  expect(magiStats.unresolved - u0).toBe(0);
  const trace = e.accountTrace();
  const regimes = [];
  for (const age of [59, 60]) {
    const i = rows.findIndex((r) => r.age === age), t = trace[i], L = t.passLog;
    const line = fplForHousehold(ctx, acaHouseholdSize(ctx, true, false, i), i) * 4;
    expect(rows[i].healthcare > 0).toBe(true); // a marketplace year
    // the premise (re-review N2): the year straddles the line between passes
    expect(L.some((p) => p.preConv <= line)).toBe(true);
    expect(L.some((p) => p.preConv > line)).toBe(true);
    let kept;
    if (t.forcedPass) {
      expect(t.picked >= 0).toBe(true);
      kept = L[t.picked];
      expect(kept.realized <= kept.charged + 1e-9).toBe(true); // the pick ran: never a pass charged under its realized price
    } else {
      kept = L.at(-1);
      expect(kept.drift <= MAGI_ITER_TOL).toBe(true);
    }
    regimes.push([age, t.forcedPass ? 'forced' : 'converged', kept.preConv > line ? 'over' : 'under']);
  }
  expect(regimes).toStrictEqual([[59, 'forced', 'over'], [60, 'converged', 'over']]); // the regime each year kept
});

// (g2) The price of a straddling year (S3, ruling 4; Task 8b): on (g)'s household, a year that is not forced keeps its last pass,
// and that pass is never charged under its realized price by more than $1. A year whose passes straddle the line keeps either the
// over regime (charged the full premium it realizes) or the under one, capped at the line less the $1 margin, so its realized MAGI
// is at most the line and it keeps the credit; under the line the premium's slope is the applicable percentage (about 10 cents a
// dollar), so a $1 drift moves it about $0.10. Before the margin a year capped at the line itself could land cents over it and be
// kept charged the credit price while realizing the full premium (the knife-edge). Checked on every year that logs its passes (the
// straddling years among them, so not vacuous).
it('a straddling year is never kept under its realized price', async () => {
  const w = await world();
  await w.setState({ ...gridOf('single-person', 52, 500000, 300000, 60000), cliffGuardEnabled: false });
  const { fplForHousehold, acaHouseholdSize } = await w.load('us/core/healthcare/aca.js');
  const ctx = await w.ctx();
  const e = await engine(w);
  const { rows } = e.simulateRaw();
  const trace = e.accountTrace();
  let straddles = 0;
  rows.forEach((r, i) => {
    const t = trace[i], L = t ? t.passLog : null;
    if (!L || L.length === 0 || t.forcedPass) return;
    const line = fplForHousehold(ctx, acaHouseholdSize(ctx, true, false, i), i) * 4;
    if (L.some((p) => p.preConv <= line) && L.some((p) => p.preConv > line)) straddles++;
    expect(L.at(-1).realized - L.at(-1).charged <= 1, `at ${r.age}`).toBe(true);
  });
  expect(straddles > 0).toBe(true);
});

// A year over the line only because it converts (S3, ruling 11, review C1): `preConvMagi` includes the draw that pays the
// conversion's own tax (and, over the line, the full premium), so a year whose no-conversion MAGI is under the line can have two
// consistent states, under (capped at the line, the credit kept) and over (the conversion's tax lifts the draw over the line, the cap
// lifts, the fill converts, the full premium is owed); last year's draw (`prevDiscTraditional`, the seed of the year's estimate)
// picked one. Constructed: a single person at 59, retired, on the marketplace (ACA on, not enhanced, Texas), a 401(k) of 1,500k and
// nothing else, spending 9k, converting 59-64 at the 22% fill, the guard off; with a one-time expense of 15,000 (fixed dollars) at
// 60, paid from the traditional draw, 60 is truly over its line (pinned to no conversion), and 61, whose own no-conversion MAGI is
// under the line, starts from the higher draw. (Found by bisecting the spending and the expense in a scratch script: at spending
// 7k-11k with the 15k expense the two runs kept different states.)
// Until S3 Task 8d this case pinned the seed's pick for the owner: with the expense 61 kept the over state (converting past the line,
// the credit the pinned year keeps lost), without it the under state. Task 8d (ruling 19, the ruling-11 probe) changes it: the line
// keeps its cap until a pass converting nothing shows the year over it, and 61's no-conversion MAGI is under the line, so with the
// expense 61 keeps the under state too, converting to the line less the $1 margin, and pays less than the same household with the
// probe off (ctx.test.acaProbeOff: S3's behaviour, the over state's premium). Every converting year 61-64 whose pinned year is at or
// under the line ends at or under it, in both runs (planning: without the probe, S3, the run without the expense keeps the over state at
// 62-64 too).
it('the probe keeps a year under the line when its no-conversion MAGI is under it', async () => {
  const ZERO = { cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
  const base = { ...ZERO, singlePerson: true, ageA: 59, retireAgeA: 59, lifeExpectancyA: 95, acaEnabled: true, acaEnhanced: false, stateTax: 'tx', children: [],
    taxable: 0, trad401kA: 1500000, spending: 9000, rothConvEnabled: true, rothConvStartAge: 59, rothConvEndAge: 64, rothConvBracket: 22, cliffGuardEnabled: false };
  const lump = [{ amount: 15000, age: 60, repeatEvery: 0, untilAge: 60, flat: true, followGrowth: false, growth: 0 }];
  const runOf = async (lumpExpenses, probeOff) => {
    const w = await world();
    if (probeOff) (await w.load('us/core/test-hooks.js')).assignAcaProbeOff(true);
    await w.setState({ ...base, lumpExpenses });
    const { fplForHousehold } = await w.load('us/core/healthcare/aca.js');
    const { MAGI_ITER_TOL } = await w.load('us/core/projection/engine-state.js');
    const ctx = await w.ctx();
    const e = await engine(w);
    const { rows } = e.simulateRaw();
    const trace = e.accountTrace();
    const at = async (age) => {
      const i = rows.findIndex((r) => r.age === age);
      const { row0 } = await noConversionYear(w, age, i, rows[i].year);
      return { row: rows[i], row0, t: trace[i], line: fplForHousehold(ctx, 1, i) * 4 };
    };
    const years = [];
    for (const age of [61, 62, 63, 64]) years.push(await at(age));
    return { y60: await at(60), y61: years[0], years, tol: MAGI_ITER_TOL };
  };
  const withLump = await runOf(lump, false), without = await runOf([], false), withLumpOff = await runOf(lump, true);
  // the premise (unchanged): the expense reaches the seed (re-review N1): 60 is truly over the line, and 61's first logged estimate
  // is higher with it; 61's no-conversion MAGI is under the line in both runs
  expect(withLump.y60.row0.magiProxy > withLump.y60.line).toBe(true);
  expect(withLump.y61.t.passLog[0].estTrad > without.y61.t.passLog[0].estTrad).toBe(true);
  for (const r of [withLump, without]) {
    const { row0, line } = r.y61;
    expect(row0.conversionAmount).toBe(0);
    expect(row0.magiProxy <= line).toBe(true);
  }
  // with the expense: 61 converts, to the line less the $1 margin (Task 8b) within the iteration's tolerance, at or under the line,
  // and pays less than with the probe off (the over state's full premium; same process)
  const y = withLump.y61;
  expect(y.row.conversionAmount > 0).toBe(true);
  expect(y.row.magiProxy <= y.line).toBe(true);
  expect(Math.abs(y.row.magiProxy - (y.line - withLump.tol)) <= withLump.tol).toBe(true);
  expect(withLumpOff.y61.row.magiProxy > withLumpOff.y61.line).toBe(true); // (the probe off keeps S3's over state)
  expect(y.row.healthcare < withLumpOff.y61.row.healthcare).toBe(true);
  // every converting year 61-64 of both runs whose pinned year is at or under the line ends at or under it
  let checked = 0;
  for (const r of [withLump, without])
    for (const { row, row0, line } of r.years) {
      if (!(row.conversionAmount > 0) || !(row0.magiProxy <= line)) continue;
      checked++;
      expect(row.magiProxy <= line, `at ${row.age}`).toBe(true);
    }
  expect(checked >= 2).toBe(true);
});

// S3 Task 8d (ruling 19), the exactness: a year truly over the line (a pass converting nothing realizes a MAGI over it) computes S3's
// row after one probe pass. The probe pass is a measurement: its passLog entry is popped and it continues before the update, so the
// next pass repeats it with the cap lifted, from the same estimates and the same secant pair. scan-grid's MFJ couple at 52 (401(k)
// 250k + 250k, taxable 2000k, spending 60k, no elections, conversions on at the 22% fill), the guard off (one phase): the probe fires
// (planning: 9 probe passes) and every row is the very row of the same household with the probe off (ctx.test.acaProbeOff, one
// process), each year taking its probe-off passes plus its probe passes.
it('a year truly over the line computes the S3 row after one probe pass', async () => {
  const runOf = async (probeOff) => {
    const w = await world();
    if (probeOff) (await w.load('us/core/test-hooks.js')).assignAcaProbeOff(true);
    await w.setState({ ...gridOf('mfj', 52, 500000, 2000000, 60000), cliffGuardEnabled: false });
    const e = await engine(w);
    return { rows: e.simulateRaw().rows, trace: e.accountTrace() };
  };
  const on = await runOf(false), off = await runOf(true);
  expect(on.trace.some((t) => t.acaProbes > 0)).toBe(true); // the premise: the probe fired
  expect(off.trace.every((t) => t.acaProbes === 0)).toBe(true);
  expect(on.rows).toStrictEqual(off.rows);
  expect(on.trace.map((t) => t.passes)).toStrictEqual(off.trace.map((t, i) => t.passes + on.trace[i].acaProbes));
});

// S3 Task 8d, two returns (ruling 19 per return, ruling 2): a return over its own line only because the conversion lifts it keeps its
// cap. scan-grid's couple filing two single returns at 52 (401(k) 250k + 250k, taxable 2000k, spending 130k, no elections,
// conversions on at the 22% fill), the guard off, at 52-56: with the probe off (S3) the year converts $122,099-$131,165, lifting A's
// MAGI to 129,555-141,592 over its line (A's MAGI pinned to no conversion is 59,186-66,552, under it) and losing the credit; with the
// probe A's MAGI sits at its line less the $1 margin, each year pays less, and the run lasts longer (planning: 92 -> 94).
it('a two-return year keeps the cap on the return its conversion lifts over the line', async () => {
  const runOf = async (probeOff) => {
    const w = await world();
    if (probeOff) (await w.load('us/core/test-hooks.js')).assignAcaProbeOff(true);
    await w.setState({ ...gridOf('single-couple', 52, 500000, 2000000, 130000), cliffGuardEnabled: false });
    const { fplForHousehold } = await w.load('us/core/healthcare/aca.js');
    const { MAGI_ITER_TOL } = await w.load('us/core/projection/engine-state.js');
    const ctx = await w.ctx();
    const e = await engine(w);
    return { res: e.simulateRaw(), lineA: (i) => fplForHousehold(ctx, 1, i) * 4, tol: MAGI_ITER_TOL }; // A's line: no children
  };
  const on = await runOf(false), off = await runOf(true);
  for (const age of [52, 53, 54, 55, 56]) {
    const i = on.res.rows.findIndex((r) => r.age === age), row = on.res.rows[i], rowOff = off.res.rows[i], lineA = on.lineA(i);
    expect(rowOff.conversionAmount > 0 && rowOff.magiA > lineA, `premise at ${age}`).toBe(true); // S3: converts over A's line
    expect(row.conversionAmount > 0, `at ${age}`).toBe(true);
    expect(row.magiA <= lineA, `at ${age}`).toBe(true);
    expect(Math.abs(row.magiA - (lineA - on.tol)) <= on.tol, `at ${age}`).toBe(true);
    expect(row.healthcare < rowOff.healthcare, `at ${age}`).toBe(true);
  }
  expect(on.res.depletedAge === null || (off.res.depletedAge !== null && on.res.depletedAge >= off.res.depletedAge)).toBe(true);
});

// S3 Task 8d with the guard on (the plan as the tools run it): a ruling-11 year keeps its credit. From the conversion_sizing grid's
// guard-on list (Task 9): the couple filing two single returns at 52 (401(k) 750k + 750k, taxable 300k, spending 130k, SEPP), at 52.
// With the probe off (S3) the year converts over A's line and pays the full premium; with the probe it converts to A's line less
// the $1 margin, each return at or under its line, and pays less. (The other candidate, the single person at 58 (1500k, 300k, 130k,
// rule 55) at 64, ends forced: its capped conversion lifts the draw over the line, so the pick re-runs a pass converting 0.)
const GUARD_ON_2R = () => scanHouseholds({ conversions: true }).find((x) => x.g.filing === 'single-couple' && x.g.age === 52 && x.g.trad === 1500000
  && x.g.taxable === 300000 && x.g.spending === 130000 && x.g.elections === 'sepp').patch;
it('a guard-on ruling-11 year keeps its credit', async () => {
  const runOf = async (probeOff) => {
    const w = await world();
    if (probeOff) (await w.load('us/core/test-hooks.js')).assignAcaProbeOff(true);
    await w.setState(GUARD_ON_2R());
    const { fplForHousehold } = await w.load('us/core/healthcare/aca.js');
    const ctx = await w.ctx();
    const e = await engine(w);
    const { rows } = e.simulate();
    const i = rows.findIndex((r) => r.age === 52);
    return { row: rows[i], line: fplForHousehold(ctx, 1, i) * 4 }; // each return's line (a household of 1: no children)
  };
  const on = await runOf(false), off = await runOf(true);
  expect(on.row.healthcare > 0).toBe(true); // a marketplace year
  expect(off.row.magiA > off.line).toBe(true); // the premise: S3 converts over A's line
  expect(on.row.conversionAmount > 0).toBe(true);
  expect(on.row.magiA <= on.line).toBe(true);
  expect(on.row.magiB <= on.line).toBe(true);
  expect(on.row.healthcare < off.row.healthcare).toBe(true);
});

// S3 Task 8d: the replay check reaches a probed year. The guard-on household above, its plan's choose run (the phases: the trial
// winner's replay R6 and the trial seeds P5) with ctx.test.replayCheck: no replayed or seeded pass differs from its source (acaShown
// compared with the holds), and some year that probed (acaProbes > 0) replayed or seeded a pass. The trace's push is intercepted to
// read the counters at each year's end.
it('the replay check reaches a probed year', async () => {
  const w = await world();
  await w.setState(GUARD_ON_2R());
  const { testHooks, assignReplayCheck } = await w.load('us/core/test-hooks.js');
  assignReplayCheck(true);
  const e = await engine(w);
  e.simulate(); // the plan search (choose and its replays) and the apply run
  const store = await w.load('shared/core/store.js');
  const { runProjection } = await w.load('us/core/projection/run-projection.js');
  const { storeContext } = await w.load('us/core/projection/store-context.js');
  const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const { cliffPlanStore } = await w.load('us/core/cliff-plan-store.js');
  expect(cliffPlanStore.plan !== null).toBe(true);
  const keys = Object.keys(testHooks).filter((k) => k.startsWith('replayChecked'));
  const total = () => keys.reduce((n, k) => n + testHooks[k], 0);
  let prev = total(), reached = 0;
  const trace = { push(t) { const now = total(); if (t.acaProbes > 0 && now > prev) reached++; prev = now; } };
  const ctx = storeContext({ planMode: 'choose', plan: cliffPlanStore.plan });
  runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(ctx.inputs), retireAgeA: store.state.retireAgeA, retireAgeB: store.state.retireAgeB, trace });
  expect(reached > 0).toBe(true);
  expect(testHooks.replayMismatchLast).toBe(null);
  expect(testHooks.replayMismatch).toBe(0);
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

// The release in an ACA year (S3, ruling 3, review I2): over the line the ACA line no longer competes with the IRMAA hold, so a hold
// can set the ceiling at 63-64 and the probe release can fire there (before S3 the ACA line set the ceiling and no release was
// due). scan-grid's HoH household at 58 (401(k) 500k, taxable 2000k, spending 130k, no elections, conversions on at the 22% fill),
// the guard off, at 63 (found by a sweep of the grid's single persons and HoH households): every pass sits over the line, the second
// pass converts nothing under the held line and releases it, and the year converges converting more than $0. That run has one phase,
// so nothing is replayed in it (replayMismatch 0 there holds with no pass checked); the replay coverage is the second household:
// scan-grid's single person at 52 (401(k) 1500k, taxable 300k, spending 130k, no elections, conversions on), planned (the guard on)
// and run with the replay check on (found by a sweep of the grid, both withdrawal modes, guard on: the planned runs whose ACA year at
// 63-64 releases a hold): at 63 every pass sits over the line, a pass releases its hold and the year converges converting more than
// $0, in a run that replays passes (forced picks, R6 replays, seeded phases) and repeats every one. The counters are the run's, not
// the year's: the check does not say the released year itself was replayed.
it('an over-the-line ACA year at 63-64 can release its hold', async () => {
  const yearAt = async (w, run, age) => {
    const { fplForHousehold, acaHouseholdSize } = await w.load('us/core/healthcare/aca.js');
    const ctx = await w.ctx();
    const e = await engine(w);
    const { rows } = run(e);
    const i = rows.findIndex((r) => r.age === age);
    return { row: rows[i], t: e.accountTrace()[i], line: fplForHousehold(ctx, acaHouseholdSize(ctx, ctx.inputs.singlePerson, false, i), i) * 4 };
  };
  const released = ({ row, t, line }) => {
    expect(row.healthcare > 0).toBe(true); // a marketplace year
    expect(t.passLog.every((p) => p.preConv > line)).toBe(true); // over the line on every pass
    expect(row.magiProxy > line).toBe(true);
    expect(t.holdReleases > 0).toBe(true);
    expect(t.passLog.some((p) => p.released)).toBe(true);
    expect(t.forcedPass).toBe(false);
    expect(row.conversionAmount > 0).toBe(true);
  };
  // the guard off, one phase (HoH: a household of 2 with the child)
  const w = await world();
  await w.setState({ ...gridOf('hoh', 58, 500000, 2000000, 130000), cliffGuardEnabled: false });
  released(await yearAt(w, (e) => e.simulateRaw(), 63));
  // the guard on, planned and run with the replay check on: replayChecked asserts some replay kind > 0 and replayMismatch 0
  let y = null;
  await replayChecked(gridOf('single-person', 52, 1500000, 300000, 130000), async (w2) => {
    y = await yearAt(w2, (e) => e.simulate(), 63);
  }, null);
  released(y);
});

// Targeted (review I5): the sites the scan data does not reach.
// S1, the 162(l) switch (seHeld) kept the holds: a self-employed single person (net 20,000 a year to 69) from 63, ACA on, 401(k)
// 300k, taxable 100k, spending 80k, converting 63-72 at the 22% fill, the guard off (found by a sweep of such households; re-found at
// S3: the rule moved the same household at spending 50k's later years, and its 162(l) switch no longer seeds a phase; re-found at S3
// Task 8c: at spending 70k the year now converges before the switch).
it('the replay check reaches the 162(l) switch (S1) in a converting household', async () => {
  const ZERO = { cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
  const patch = { ...ZERO, singlePerson: true, ageA: 63, retireAgeA: 69, incomeA: 20000, incomeKindA: 'self', acaEnabled: true, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, medicalInflation: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0, megaBackdoor: false, cliffGuardEnabled: false, taxable: 100000, trad401kA: 300000, spending: 80000, rothConvEnabled: true, rothConvStartAge: 63, rothConvEndAge: 72, rothConvBracket: 22 };
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

// Task 4b (the cap pick, Fable bd7ea0b follow-up 1): a year whose fill reads the draw and that prices no premium off an estimate has
// no forced pick; at the cap it re-runs its logged pass with the smallest drift. scan-grid's HoH household at 62 (401(k) 1500k,
// taxable 300k, spending 130k, no elections, conversions on at the 22% fill), smooth withdrawals, the guard off (one phase: phases
// clear the pass log). At 70 smooth fixes the year's traditional total while the fill wants more, so the year cycles with period 4
// and before the cap pick kept its last pass (drift $50,461, converting 0). `capYear` runs it and returns the age-70 trace entry, its
// row and the magiStats of the trace's run alone.
const CAP_AGE = 70;
async function capYear(w) {
  const h = scanHouseholds({ conversions: true, mode: 'smooth' }).find((x) => x.g.filing === 'hoh' && x.g.age === 62 && x.g.trad === 1500000
    && x.g.taxable === 300000 && x.g.spending === 130000 && x.g.elections === 'none');
  await w.setState({ ...h.patch, cliffGuardEnabled: false });
  const { magiStats } = await w.load('us/core/projection/engine-state.js');
  const e = await engine(w);
  const { rows } = e.simulateRaw();
  const s0 = { ...magiStats };
  const trace = e.accountTrace();
  const stats = Object.fromEntries(Object.keys(magiStats).map((k) => [k, magiStats[k] - s0[k]]));
  const i = rows.findIndex((r) => r.age === CAP_AGE);
  return { t: trace[i], row: rows[i], trace, stats };
}

it('a non-ACA plain-fill year at the cap keeps its smallest-drift pass', async () => {
  const { t, row } = await capYear(await world());
  const L = t.passLog;
  expect(t.capPicked).toBe(true);
  expect(L.length > 1).toBe(true);
  const least = Math.min(...L.map((p) => p.drift));
  const first = L.findIndex((p) => p.drift === least);
  expect(t.picked).toBe(first); // the first logged pass at the least drift
  expect(L[first].drift).toBe(least);
  expect(least < 50461).toBe(true);
  expect(L[L.length - 1].drift > least).toBe(true); // (not vacuous: the last pass was not the best one)
  expect(row.conversionAmount).toBe(L[first].conversion);
  expect(t.estTrad).toBe(L[first].estTrad);
});

it('a cap pick is not a forced year', async () => {
  const { t, trace, stats } = await capYear(await world());
  expect(t.forcedPass).toBe(false);
  expect(stats.capPicked >= 1).toBe(true);
  expect(stats.capPicked).toBe(trace.filter((x) => x.capPicked).length);
  expect(trace.some((x) => x.capPicked && x.forcedPass)).toBe(false);
  // (review M5) the household has no forced year: every capPicked year would show here had it been counted forced
  expect(trace.some((x) => x.forcedPass)).toBe(false);
  expect(stats.forced).toBe(0);
});

// Review I1: the cap pick skips a pass that released its IRMAA hold (rule 2: a pass converting 0 under a held line the year sits
// above). scan-grid's single person at 62 (401(k) 1500k, taxable 300k, spending 130k, no elections, conversions on), default mode,
// the guard off, at 69: the year cycles to the cap and its smallest-drift pass is the probe release's own pass. Re-found at S3 (the
// rule moved the single person at 52 (401(k) 500k, taxable 2000k, spending 130k)'s later years: its year at 70 no longer releases).
it('the cap pick skips a pass that released its hold', async () => {
  const w = await world();
  await w.setState({ ...gridOf('single-person', 62, 1500000, 300000, 130000), cliffGuardEnabled: false });
  const e = await engine(w);
  const { rows } = e.simulateRaw();
  const t = e.accountTrace()[rows.findIndex((r) => r.age === 69)], L = t.passLog;
  const least = Math.min(...L.map((p) => p.drift));
  expect(L.some((p) => p.released && p.drift === least)).toBe(true); // (not vacuous: a released pass has the least drift)
  expect(t.holdReleases > 0).toBe(true);
  expect(t.capPicked).toBe(true);
  const kept = L.filter((p) => !p.released);
  const leastKept = Math.min(...kept.map((p) => p.drift));
  expect(t.picked).toBe(L.findIndex((p) => !p.released && p.drift === leastKept));
  expect(L[t.picked].released).toBe(false);
  expect(rows[rows.findIndex((r) => r.age === 69)].conversionAmount).toBe(L[t.picked].conversion);
});

it('an ACA year at the cap keeps the forced pick', async () => {
  const w = await world();
  const h = scanHouseholds({ conversions: true }).find((x) => x.g.filing === 'mfj' && x.g.age === 58 && x.g.trad === 500000
    && x.g.taxable === 300000 && x.g.spending === 60000 && x.g.elections === 'none');
  await w.setState({ ...h.patch, cliffGuardEnabled: false });
  const e = await engine(w);
  const { rows } = e.simulateRaw();
  const t = e.accountTrace()[rows.findIndex((r) => r.age === 63)];
  expect(t.forcedPass).toBe(true);
  expect(t.capPicked).toBe(false);
});

it('a converged year logs no cap pick', async () => {
  const w = await world();
  const h = scanHouseholds({ conversions: true }).find((x) => x.g.filing === 'single-couple' && x.g.age === 66
    && x.g.trad === 500000 && x.g.taxable === 300000 && x.g.spending === 130000 && x.g.elections === 'none');
  await w.setState({ ...h.patch, cliffGuardEnabled: false });
  const { magiStats } = await w.load('us/core/projection/engine-state.js');
  const e = await engine(w);
  const s0 = magiStats.capPicked;
  const { rows } = e.simulateRaw();
  expect(rows.some((r) => r.conversionAmount > 0)).toBe(true);
  expect(magiStats.capPicked - s0).toBe(0);
});

it('the replay check reaches a cap-picked year', async () => {
  let t = null;
  const hooks = await replayChecked({}, async (w) => {
    t = (await capYear(w)).t;
  }, ['CapPick']);
  expect(t.capPicked).toBe(true);
  expect(hooks.replayCheckedCapPick > 0).toBe(true);
});

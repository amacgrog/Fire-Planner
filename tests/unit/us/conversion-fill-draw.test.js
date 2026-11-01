// The plain Roth-conversion bracket fill counts the year's own traditional draw (Batch 5 follow-ups S1, spec 4.1):
// solveRothConversion's `drawBelow` (the pass's estTrad) sits below the conversion, so the fill converts only the room left in
// the bracket above the draw. The hand literals are the 2026 federal figures (federal-rules.js): MFJ 10% top 24,800, MFJ 24% top
// 403,550, MFJ standard deduction 32,200 (both 60: no age addition); single 12% top 50,400, single standard deduction 16,100.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { scanHouseholds } from '../helpers/scan-grid.mjs';

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

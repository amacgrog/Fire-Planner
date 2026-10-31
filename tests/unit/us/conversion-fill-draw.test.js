// The plain Roth-conversion bracket fill counts the year's own traditional draw (Batch 5 follow-ups S1, spec 4.1):
// solveRothConversion's `drawBelow` (the pass's estTrad) sits below the conversion, so the fill converts only the room left in
// the bracket above the draw. The hand literals are the 2026 federal figures (federal-rules.js): MFJ 10% top 24,800, MFJ 24% top
// 403,550, MFJ standard deduction 32,200 (both 60: no age addition); single 12% top 50,400, single standard deduction 16,100.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

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

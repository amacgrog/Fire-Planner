// The ACA 400% line caps a Roth conversion only while the year's MAGI is still under it (conversionMagiCeiling). Once the
// pre-conversion MAGI is over the line the premium credit is already lost (no enhanced credit), so a conversion costs no
// subsidy and the line must not hold it at zero; the IRMAA ceiling next to it already works this way (it keeps the year in
// the tier it already sits in). Lines at year 0 (tax index factor 1): one person 15,650 x 4 = 62,600, two 21,150 x 4 = 84,600.
// The margin (S3, Task 8b, follow-up 4): where the line caps, it caps at the line less MAGI_ITER_TOL ($1), household and per
// return, so a converged year (its realized MAGI at most MAGI_ITER_TOL over its estimate) lands at or under the line instead of
// cents over it, losing the whole credit; the over-the-line test reads the line itself, so a year within $1 under the line
// converts nothing and a year over it is not capped.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { scanHouseholds } from '../helpers/scan-grid.mjs';

async function setup() {
  const w = await world();
  await w.setState({ acaEnabled: true, acaEnhanced: false, singlePerson: false, children: [] });
  w.setTaxYear(2026);
  const { conversionMagiCeiling, CEIL_OUT } = await w.load('us/core/withdrawals/roth-conversion.js');
  const ctx = await w.ctx();
  // Both retired, both under 63 (no IRMAA ceiling), both on the marketplace.
  const args = (patch) => ({
    acaEligibleA: true, acaEligibleB: true, singlePerson: false, isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false,
    workingA: false, workingB: false, age: 60, ageB: 58, filing: 'mfj', year: 0, profile: { ssA: 0, ssB: 0 }, ...patch,
  });
  return { ceiling: (patch) => conversionMagiCeiling(ctx, args(patch)), out: CEIL_OUT };
}

it('household return: under the line, the line caps the conversion', async () => {
  const { ceiling } = await setup();
  expect(ceiling({ preConvMagi: 50000 })).toBe(84599); // the line less the $1 margin
});

it('household return: already over the line, the line does not cap it', async () => {
  const { ceiling } = await setup();
  expect(ceiling({ preConvMagi: 155000 })).toBe(Infinity);
});

it('household return: exactly at the line, the line still caps it (no room left)', async () => {
  const { ceiling } = await setup();
  // 84,599, below the MAGI: the year's conversion room (magiSafeRoom = max(0, ceiling - preConvMagi)) clamps to 0
  expect(ceiling({ preConvMagi: 84600 })).toBe(84599);
});

it('household return: within $1 under the line, no room', async () => {
  const { ceiling } = await setup();
  expect(ceiling({ preConvMagi: 84599.5 })).toBe(84599); // under the line, so capped; the cap is below the MAGI: no room
});

it('two returns: a return over its own line no longer caps the conversion; one under it still does', async () => {
  const { ceiling } = await setup();
  const two = { twoReturns: true, shareA: 0.5 };
  // A over its 62,600 line, B not on the marketplace: no cap.
  expect(ceiling({ ...two, acaEligibleB: false, preConvMagi: 100000, preMagiA: 100000, preMagiB: 0 })).toBe(Infinity);
  // A over, B under at 40,000: B's room (62,600 - 1 - 40,000) / 0.5 = 45,198 above the household's 140,000.
  expect(ceiling({ ...two, preConvMagi: 140000, preMagiA: 100000, preMagiB: 40000 })).toBe(185198);
});

// S3 Task 8d (ruling 19, the ruling-11 probe): `acaShown` (bit 1: the household's line, or return A's; bit 2: return B's) says a
// pass converting nothing showed the year (that return) over the line. Over the line with the bit clear the line still caps, at the
// line less the $1 margin, and CEIL_OUT says so (`acaProbe`, per return `acaProbeA` / `acaProbeB`, with the line(s) it computed);
// with the bit set the over-the-line rule applies as above. Every call above passes no `acaShown` (the default 3: S3's doubles).
it('over the line and not shown, the line still caps (the probe)', async () => {
  const { ceiling, out } = await setup();
  const probe = () => [out.acaLine, out.acaProbe, out.acaProbeA, out.acaProbeB];
  expect(ceiling({ preConvMagi: 155000, acaShown: 0 })).toBe(84599); // over 84,600, not shown: capped at the line less $1
  expect(probe()).toStrictEqual([84600, true, false, false]);
  expect(ceiling({ preConvMagi: 155000, acaShown: 1 })).toBe(Infinity); // shown: no cap
  expect(probe()).toStrictEqual([84600, false, false, false]);
  expect(ceiling({ preConvMagi: 50000, acaShown: 0 })).toBe(84599); // under the line: capped, nothing to probe
  expect(probe()).toStrictEqual([84600, false, false, false]);
  // Two returns (A over its 62,600 line at 100,000, B under at 40,000, household 140,000, share 1/2). Not shown: A's room
  // max(0, (62,599 - 100,000) / 0.5) = 0, the ceiling 140,000, A probed; bit 2 alone leaves A's bit clear (the same); bit 1: A has no
  // ACA room, B's (62,599 - 40,000) / 0.5 = 45,198 caps (ruling 2): 185,198.
  const two = { twoReturns: true, shareA: 0.5, preConvMagi: 140000, preMagiA: 100000, preMagiB: 40000 };
  const probeAB = () => [out.acaLineA, out.acaLineB, out.acaProbeA, out.acaProbeB, out.acaProbe];
  expect(ceiling({ ...two, acaShown: 0 })).toBe(140000);
  expect(probeAB()).toStrictEqual([62600, 62600, true, false, false]);
  expect(ceiling({ ...two, acaShown: 2 })).toBe(140000);
  expect(probeAB()).toStrictEqual([62600, 62600, true, false, false]);
  expect(ceiling({ ...two, acaShown: 1 })).toBe(185198);
  expect(probeAB()).toStrictEqual([62600, 62600, false, false, false]);
  expect(Number.isNaN(out.acaLine)).toBe(true); // the household line is not computed on two returns
});

// Task 8d review I1: a return with no share of the conversion is never flagged. A owns no traditional money (share 0): A's line caps
// nothing (its room is Infinity: no share, no limit), so A is not "capped only because its bit is clear", and B's room caps:
// (62,599 - 40,000) / 1 = 22,599 above the household's 140,000.
it('a return with no share of the conversion is not probed', async () => {
  const { ceiling, out } = await setup();
  expect(ceiling({ twoReturns: true, shareA: 0, preConvMagi: 140000, preMagiA: 100000, preMagiB: 40000, acaShown: 0 })).toBe(162599);
  expect([out.acaProbeA, out.acaProbeB]).toStrictEqual([false, false]);
});

// S3 (rulings 1 and 3): in a year over the line the ACA line no longer competes with an IRMAA hold, so a hold under the IRMAA line
// sets the ceiling (CEIL_OUT's held flags: the probe release reads them). Setup as conversion-fill-draw.test.js's 'the conversion
// ceiling says when the hold set it': a retired single person at 63 on the marketplace (ACA on, not enhanced), year 0: the 400% line
// 15,650 x 4 = 62,600; the IRMAA first-tier line 109,000 (no Social Security to translate).
async function setup63() {
  const w = await world();
  await w.setState({ acaEnabled: true, acaEnhanced: false, stateTax: 'tx' });
  const { conversionMagiCeiling, CEIL_OUT } = await w.load('us/core/withdrawals/roth-conversion.js');
  const ctx = await w.ctx();
  const H = { acaEligibleA: true, acaEligibleB: false, singlePerson: true, isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false, workingA: false, workingB: false, age: 63, ageB: 63, filing: 'single', year: 0, profile: { singlePerson: true, ssA: 0, ssB: 0, dependents: [] } };
  return { ceiling: (patch) => conversionMagiCeiling(ctx, { ...H, ...patch }), held: () => [CEIL_OUT.held, CEIL_OUT.heldA, CEIL_OUT.heldB] };
}

// (e) Over the line (70,000 > 62,600): the IRMAA hold at 100,000 is the ceiling and set it (before S3: 62,600, the ACA line set
// it, held false); with no hold the IRMAA line 109,000, held false.
it('over the line, the IRMAA hold sets the ceiling', async () => {
  const { ceiling, held } = await setup63();
  expect(ceiling({ preConvMagi: 70000, irmaaHold: 100000 })).toBe(100000);
  expect(held()).toStrictEqual([true, false, false]);
  expect(ceiling({ preConvMagi: 70000 })).toBe(109000);
  expect(held()).toStrictEqual([false, false, false]);
  // S3 Task 8d: not shown, the ACA cap 62,599 is below the hold, so the hold did not set the ceiling (a probe pass can never
  // release); shown, (e)'s 100,000 and the hold set it.
  expect(ceiling({ preConvMagi: 70000, irmaaHold: 100000, acaShown: 0 })).toBe(62599);
  expect(held()).toStrictEqual([false, false, false]);
  expect(ceiling({ preConvMagi: 70000, irmaaHold: 100000, acaShown: 1 })).toBe(100000);
  expect(held()).toStrictEqual([true, false, false]);
});

// (f) Two returns: A at 63 on the marketplace, over its 62,600 line at 70,000; B at 66 (off the marketplace, IRMAA) at 0; share 1/2.
// A's ACA room is Infinity; A's held room (100,000 - 70,000) / 0.5 = 60,000; B's IRMAA room (109,000 - 0) / 0.5 = 218,000: the
// ceiling 70,000 + 60,000 = 130,000, A's hold set it (before S3: A's ACA room max(0, (62,600 - 70,000) / 0.5) = 0, the ceiling
// 70,000, heldA false).
it('two returns, A over its line at 63: A\'s IRMAA hold sets the ceiling', async () => {
  const { ceiling, held } = await setup63();
  const T = { singlePerson: false, twoReturns: true, ageB: 66, preConvMagi: 70000, preMagiA: 70000, preMagiB: 0, shareA: 0.5, profile: { singlePerson: false, ssA: 0, ssB: 0, dependents: [] } };
  expect(ceiling({ ...T, irmaaHoldA: 100000 })).toBe(130000);
  expect(held()).toStrictEqual([false, true, false]);
  // Rulings 2 and 3 together (review M2): B at 62 on the marketplace, under its 62,600 line at 40,000 (no IRMAA room before 63). B's
  // ACA room (62,600 - 1 - 40,000) / 0.5 = 45,198 is below A's held room 60,000, so it caps the conversion and A's hold did not set
  // it: the ceiling 110,000 + 45,198 = 155,198, held all false.
  expect(ceiling({ ...T, acaEligibleB: true, ageB: 62, preConvMagi: 110000, preMagiB: 40000, irmaaHoldA: 100000 })).toBe(155198);
  expect(held()).toStrictEqual([false, false, false]);
});

// The knife-edge (S3, Task 8b, follow-up 4): before the margin a year capped at the line converged with its realized MAGI up to
// MAGI_ITER_TOL over its estimate, so it could land cents over the line and owe the full premium while charged the credit price.
// Households from S2's knife-edge list (scan grid, default mode, conversions on, the guard on, each with its plan as the tools run
// it): the MFJ couple at 52 (401(k) 750k + 750k, taxable 300k, spending 130k; at 54 on 2fc43c7: MAGI 88,882.88, cents over the
// 88,882.88 line, charged 8,852.73, priced 19,291.37; on the rule alone (Task 8) 54 lands at the line and 59 lands $0.006 over it),
// the HoH household at 58 (401(k) 500k, taxable 300k, spending 60k; 61 lands $0.002 over on the rule alone) and the couple filing
// two returns at 62 (401(k) 250k + 250k, taxable 2000k, spending 60k; 62 lands $0.35 over each return's line on the rule alone).
// No row that converts lands over its line by at most MAGI_ITER_TOL: the household line (the engine's household size, the child
// included) or, on two returns, each return's own (A with the qualifying children, B alone), as the ceiling forms them. Not
// vacuous: some converting row lands within $2 under its line.
it('a converged year the 400% line caps lands at or under it', async () => {
  const H = [['mfj', 52, 1500000, 300000, 130000], ['hoh', 58, 500000, 300000, 60000], ['single-couple', 62, 500000, 2000000, 60000]];
  let near = 0;
  for (const [filing, age, trad, taxable, spending] of H) {
    const h = scanHouseholds({ conversions: true }).find((x) => x.g.filing === filing && x.g.age === age && x.g.trad === trad
      && x.g.taxable === taxable && x.g.spending === spending && x.g.elections === 'none');
    const w = await world();
    await w.setState(h.patch);
    const { fplForHousehold, acaHouseholdSize } = await w.load('us/core/healthcare/aca.js');
    const { qualifyingChildCount } = await w.load('shared/core/inputs/lists.js');
    const { taxYearOf } = await w.load('us/core/tax/federal-rules.js');
    const { MAGI_ITER_TOL } = await w.load('us/core/projection/engine-state.js');
    const e = await engine(w);
    const { rows } = e.simulate();
    const ctx = await w.ctx();
    const inputs = ctx.inputs;
    rows.forEach((r, i) => {
      if (!(r.conversionAmount > 0)) return;
      const pairs = filing === 'single-couple'
        ? [[r.magiA, fplForHousehold(ctx, 1 + qualifyingChildCount(inputs, taxYearOf(ctx, i)), i) * 4], [r.magiB, fplForHousehold(ctx, 1, i) * 4]]
        : [[r.magiProxy, fplForHousehold(ctx, acaHouseholdSize(ctx, inputs.singlePerson, false, i), i) * 4]];
      for (const [m, line] of pairs) {
        expect(m - line > 0 && m - line <= MAGI_ITER_TOL, `${filing} at ${r.age}: ${m} over ${line}`).toBe(false);
        if (m <= line && line - m <= 2) near++;
      }
    });
  }
  expect(near > 0).toBe(true);
});

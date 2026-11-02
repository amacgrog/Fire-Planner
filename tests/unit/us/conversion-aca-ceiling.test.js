// The ACA 400% line caps a Roth conversion only while the year's MAGI is still under it (conversionMagiCeiling). Once the
// pre-conversion MAGI is over the line the premium credit is already lost (no enhanced credit), so a conversion costs no
// subsidy and the line must not hold it at zero; the IRMAA ceiling next to it already works this way (it keeps the year in
// the tier it already sits in). Lines at year 0 (tax index factor 1): one person 15,650 x 4 = 62,600, two 21,150 x 4 = 84,600.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

async function setup() {
  const w = await world();
  await w.setState({ acaEnabled: true, acaEnhanced: false, singlePerson: false, children: [] });
  w.setTaxYear(2026);
  const { conversionMagiCeiling } = await w.load('us/core/withdrawals/roth-conversion.js');
  const ctx = await w.ctx();
  // Both retired, both under 63 (no IRMAA ceiling), both on the marketplace.
  const args = (patch) => ({
    acaEligibleA: true, acaEligibleB: true, singlePerson: false, isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false,
    workingA: false, workingB: false, age: 60, ageB: 58, filing: 'mfj', year: 0, profile: { ssA: 0, ssB: 0 }, ...patch,
  });
  return { ceiling: (patch) => conversionMagiCeiling(ctx, args(patch)) };
}

it('household return: under the line, the line caps the conversion', async () => {
  const { ceiling } = await setup();
  expect(ceiling({ preConvMagi: 50000 })).toBe(84600);
});

it('household return: already over the line, the line does not cap it', async () => {
  const { ceiling } = await setup();
  expect(ceiling({ preConvMagi: 155000 })).toBe(Infinity);
});

it('household return: exactly at the line, the line still caps it (no room left)', async () => {
  const { ceiling } = await setup();
  expect(ceiling({ preConvMagi: 84600 })).toBe(84600);
});

it('two returns: a return over its own line no longer caps the conversion; one under it still does', async () => {
  const { ceiling } = await setup();
  const two = { twoReturns: true, shareA: 0.5 };
  // A over its 62,600 line, B not on the marketplace: no cap.
  expect(ceiling({ ...two, acaEligibleB: false, preConvMagi: 100000, preMagiA: 100000, preMagiB: 0 })).toBe(Infinity);
  // A over, B under at 40,000: B's room (62,600 - 40,000) / 0.5 = 45,200 above the household's 100,000.
  expect(ceiling({ ...two, preConvMagi: 140000, preMagiA: 100000, preMagiB: 40000 })).toBe(185200);
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
});

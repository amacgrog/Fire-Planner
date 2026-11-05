// The bracket card's pure helpers (src/us/ui/results/roth-optimizer.js; the module touches no DOM at load): ageRanges (S4 Task 11,
// ruling 7), the card's age lists; scheduleWhy, the conversion schedule's why cell (schedule-why plan, ruling 3: the first rule that
// applies wins, the solver's line labels mapped); and scheduleRows, the schedule's rows (ruling 1: which rows show, ruling 2: the
// collapse of adjacent $0 rows with one why), with revision 2 (R2-1: every window year shows; R2-3: the why of a row under $1).
// All on constructed rows: the households are drawn in test_conversion_schedule.js.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const c = makeCounter();
const PLAN = 'the cliff plan';

it('ageRanges', async () => {
  const w = await world();
  const { ageRanges } = await w.load('us/ui/results/roth-optimizer.js');
  c.expect(ageRanges([60, 61, 62])).toBe('60-62');
  c.expect(ageRanges([59, 61, 62, 63])).toBe('59, 61-63');
  c.expect(ageRanges([60])).toBe('60');
  c.expect(ageRanges([])).toBe('');
  c.expect(ageRanges([62, 60, 61, 61])).toBe('60-62'); // unsorted, a repeat
  c.expect(ageRanges([64, 60, 66, 65])).toBe('60, 64-66');
});

// Ruling 3, in order. No household converts in a phased fill year (searched 2026-11-03: the fixture, the gap households of
// conversion-plan.test.js and its two-return couple at 75 and 100, the scan grid's 384 converting households in both withdrawal
// modes), so the why cell is fed constructed rows.
it('scheduleWhy: ruling 3, the first rule that applies', async () => {
  const w = await world();
  const { scheduleWhy } = await w.load('us/ui/results/roth-optimizer.js');
  // 3.1: under $1 and stayed under: the line, mapped. A sized year whose stay-under trial won (convChoice, 'stayUnder', $0).
  c.expect(scheduleWhy({ conversionAmount: 0, convChoice: 'just under ACA 400% line', cliffChoice: 'stayed under ACA 400% line', convHeldBy: 'stayUnder' }, 22, PLAN)).toBe('Stayed under the ACA 400% line');
  // the fixture's 62-63: stayed under, no held kind (the fill was 0)
  c.expect(scheduleWhy({ conversionAmount: 0, cliffChoice: 'stayed under ACA 400% line' }, 22, PLAN)).toBe('Stayed under the ACA 400% line');
  // under $1 but not $0
  c.expect(scheduleWhy({ conversionAmount: 0.5, cliffChoice: 'stayed under IRMAA tier', convHeldBy: 'stayUnder' }, 22, PLAN)).toBe('Stayed under an IRMAA tier');
  // a converting stay-under year is not 3.1: nothing held it, the flat bracket (3.6)
  c.expect(scheduleWhy({ conversionAmount: 12000, cliffChoice: 'stayed under ACA 400% line' }, 22, PLAN)).toBe('Fill to the top of the 22% bracket');
  // 3.2: convChoice with no held kind, or 'sized'
  c.expect(scheduleWhy({ conversionAmount: 57000, convChoice: 'the top of the 10% bracket', convHeldBy: 'sized' }, 22, PLAN)).toBe('The top of the 10% bracket');
  c.expect(scheduleWhy({ conversionAmount: 0, convChoice: 'no conversion (tax-aware)', convHeldBy: 'sized' }, 22, PLAN)).toBe('No conversion (tax-aware)');
  c.expect(scheduleWhy({ conversionAmount: 64000, convChoice: "just over ACA 400% line (Partner B's return)" }, 22, PLAN)).toBe("Just over ACA 400% line (Partner B's return)");
  // 3.2 before 3.3: a sized year's own target wins over a fill cliffChoice
  c.expect(scheduleWhy({ conversionAmount: 12000, convChoice: 'the top of the 12% bracket', cliffChoice: 'filled to ACA 400% line' }, 22, PLAN)).toBe('The top of the 12% bracket');
  // 3.3: filled to, mapped
  c.expect(scheduleWhy({ conversionAmount: 12000, cliffChoice: 'filled to ACA 400% line' }, 22, PLAN)).toBe('Filled to the ACA 400% line');
  // 3.3 before 3.4: a missed fill plan held by the natural cap ('plan') with its fill cliffChoice
  c.expect(scheduleWhy({ conversionAmount: 9000, cliffChoice: 'filled to IRMAA tier', convHeldBy: 'plan' }, 22, PLAN)).toBe('Filled to an IRMAA tier');
  // 3.4: the held kinds
  c.expect(scheduleWhy({ conversionAmount: 20226, convHeldBy: 'aca' }, 22, PLAN)).toBe('Held by the ACA 400% line');
  c.expect(scheduleWhy({ conversionAmount: 0, convHeldBy: 'aca' }, 22, PLAN)).toBe('Held by the ACA 400% line'); // the guard-off brake
  c.expect(scheduleWhy({ conversionAmount: 75739, convHeldBy: 'irmaa' }, 22, PLAN)).toBe('Held under an IRMAA tier');
  c.expect(scheduleWhy({ conversionAmount: 30000, convHeldBy: 'balance' }, 22, PLAN)).toBe('The whole remaining balance');
  // a missed plan (no cliffChoice): the plan's fill, the plan's stay-under, named by the label passed
  c.expect(scheduleWhy({ conversionAmount: 9000, convHeldBy: 'plan' }, 22, PLAN)).toBe("Held by the cliff plan's fill");
  c.expect(scheduleWhy({ conversionAmount: 0, convHeldBy: 'stayUnder' }, 22, 'the applied plan')).toBe("Held by the applied plan's stay-under");
  // 3.4 before 3.5: the convFell fallback with 'aca' says the line, not the fallback text
  c.expect(scheduleWhy({ conversionAmount: 15000, convChoice: 'the bracket conversion (target not reachable this year)', convHeldBy: 'aca' }, 22, PLAN)).toBe('Held by the ACA 400% line');
  // sized at the balance: the held kind (3.4) wins over the target
  c.expect(scheduleWhy({ conversionAmount: 30000, convChoice: 'the top of the 24% bracket', convHeldBy: 'balance' }, 22, PLAN)).toBe('The whole remaining balance');
  // 3.5: a convChoice with a held kind that 3.4 does not name
  c.expect(scheduleWhy({ conversionAmount: 15000, convChoice: 'the top of the 12% bracket', convHeldBy: 'other' }, 22, PLAN)).toBe('The top of the 12% bracket');
  // 3.6: nothing: the flat bracket passed
  c.expect(scheduleWhy({ conversionAmount: 12000 }, 10, PLAN)).toBe('Fill to the top of the 10% bracket');
  c.expect(scheduleWhy({ conversionAmount: 12000, convHeldBy: 'other' }, 24, PLAN)).toBe('Fill to the top of the 24% bracket');
  // rule 0: an IRA basis year whose conversion is all tax-free basis, whatever the target; a basis year with a taxable part is not
  c.expect(scheduleWhy({ conversionAmount: 0, conversionGross: 40000, convChoice: 'no conversion (tax-aware)', convHeldBy: 'sized' }, 22, PLAN)).toBe('Tax-free basis only');
  c.expect(scheduleWhy({ conversionAmount: 0.4, conversionGross: 100000 }, 22, PLAN)).toBe('Tax-free basis only');
  c.expect(scheduleWhy({ conversionAmount: 30000, conversionGross: 40000 }, 22, PLAN)).toBe('Fill to the top of the 22% bracket');
});

it('scheduleWhy: the label map (exact labels, the rest unchanged)', async () => {
  const w = await world();
  const { scheduleWhy } = await w.load('us/ui/results/roth-optimizer.js');
  const under = (label) => scheduleWhy({ conversionAmount: 0, cliffChoice: 'stayed under ' + label }, 22, PLAN);
  const filled = (label) => scheduleWhy({ conversionAmount: 5000, cliffChoice: 'filled to ' + label }, 22, PLAN);
  c.expect(under('Medicaid line')).toBe('Stayed under the Medicaid line');
  c.expect(under('ACA credit floor (100%)')).toBe('Stayed under the ACA credit floor');
  c.expect(under('ACA 400% line')).toBe('Stayed under the ACA 400% line');
  c.expect(under('IRMAA tier')).toBe('Stayed under an IRMAA tier');
  c.expect(filled('Medicaid line')).toBe('Filled to the Medicaid line');
  c.expect(filled('ACA credit floor (100%)')).toBe('Filled to the ACA credit floor');
  // an unknown label, a near miss, an Object.prototype name: unchanged
  c.expect(under('Some new line')).toBe('Stayed under Some new line');
  c.expect(under('ACA 400% line (Partner A)')).toBe('Stayed under ACA 400% line (Partner A)');
  c.expect(filled('constructor')).toBe('Filled to constructor');
});

// Revision 2 (R2-3): a row under $1, the first rule that applies; each step against the steps after it.
it('scheduleWhy: R2-3, a row under $1', async () => {
  const w = await world();
  const { scheduleWhy } = await w.load('us/ui/results/roth-optimizer.js');
  const why = (r) => scheduleWhy({ conversionAmount: 0, ...r }, 10, PLAN);
  // 1. stayed under, before a split, a 'none' target, a held kind and convZeroBy
  c.expect(why({ cliffChoice: 'stayed under ACA 400% line', drawSplit: 'A', convChoice: 'no conversion (tax-aware)', convHeldBy: 'stayUnder', convZeroBy: 'full' })).toBe('Stayed under the ACA 400% line');
  // 2. a split year: a split phased-fill $0 year (the fill's cliffChoice) and a sized split year (its target) say the split
  c.expect(why({ drawSplit: 'A', cliffChoice: 'filled to ACA 400% line' })).toBe("No conversion; Partner A's accounts drawn first");
  c.expect(why({ drawSplit: 'B', convChoice: 'the top of the 12% bracket', convHeldBy: 'sized' })).toBe("No conversion; Partner B's accounts drawn first");
  // 3. the sizing's no conversion, before a held kind (whole string: it shares the prefix of the fallback)
  c.expect(why({ convChoice: 'no conversion (tax-aware)', convHeldBy: 'sized' })).toBe('No conversion (tax-aware)');
  c.expect(why({ convChoice: 'no conversion (tax-aware)', convHeldBy: 'aca' })).toBe('No conversion (tax-aware)');
  // 4. the held kind, before convZeroBy and a fill cliffChoice; a convFell $0 year held by the line says the line
  c.expect(why({ convHeldBy: 'aca', convZeroBy: 'full', cliffChoice: 'filled to IRMAA tier' })).toBe('Held by the ACA 400% line');
  c.expect(why({ convChoice: 'the bracket conversion (target not reachable this year)', convHeldBy: 'aca' })).toBe('Held by the ACA 400% line');
  c.expect(why({ convHeldBy: 'balance' })).toBe('The whole remaining balance');
  // 5. convZeroBy with the bracket passed, before a fill cliffChoice and a target; a convFell $0 year with no room says so
  c.expect(why({ convZeroBy: 'full' })).toBe('No room left in the 10% bracket');
  c.expect(scheduleWhy({ conversionAmount: 0.6, convZeroBy: 'full' }, 22, PLAN)).toBe('No room left in the 22% bracket');
  c.expect(why({ convZeroBy: 'full', cliffChoice: 'filled to ACA 400% line' })).toBe('No room left in the 10% bracket');
  c.expect(why({ convZeroBy: 'full', convChoice: 'the bracket conversion (target not reachable this year)' })).toBe('No room left in the 10% bracket');
  c.expect(why({ convZeroBy: 'empty' })).toBe('Nothing left to convert');
  c.expect(why({ convZeroBy: 'locked' })).toBe('Locked by the 72(t) payments');
  c.expect(why({ convZeroBy: 'locked', cliffChoice: 'filled to ACA 400% line' })).toBe('Locked by the 72(t) payments');
  // 6. a fill cliffChoice, then any other target (a sized $0 year whose target is a bracket top)
  c.expect(why({ cliffChoice: 'filled to ACA 400% line', convChoice: 'the top of the 12% bracket' })).toBe('Filled to the ACA 400% line');
  c.expect(why({ convChoice: 'the top of the 12% bracket', convHeldBy: 'sized' })).toBe('The top of the 12% bracket');
  c.expect(why({ convChoice: 'just under ACA 400% line' })).toBe('Just under ACA 400% line');
  // 7. nothing: the fallback (whole string)
  c.expect(why({})).toBe('No conversion');
  c.expect(why({ convHeldBy: 'other' })).toBe('No conversion');
  // a row that converts ignores drawSplit and convZeroBy (ruling 3)
  c.expect(scheduleWhy({ conversionAmount: 5000, drawSplit: 'A', convZeroBy: 'full' }, 22, PLAN)).toBe('Fill to the top of the 22% bracket');
});

// a row as the engine's rows carry the fields (only the ones the schedule reads)
const row = (age, conversionAmount, more = {}) => ({ age, year: age - 58, conversionAmount, ...more });
const SU = { cliffChoice: 'stayed under ACA 400% line' };
const FULL = { convZeroBy: 'full' };

it('scheduleRows: R2-1, which rows show', async () => {
  const w = await world();
  const { scheduleRows } = await w.load('us/ui/results/roth-optimizer.js');
  const rows = [
    row(56, 0, SU), // outside the window, $0, not held: hidden
    row(57, 30000), // outside the window, converts: shown
    row(58, 0, { convHeldBy: 'aca' }), // outside the window, held: shown
    row(59, 20226, { convHeldBy: 'aca' }), // the window's first age
    row(60, 0), // in the window, no reason: the fallback, shown
    row(61, 41000),
    row(62, 0, { convHeldBy: 'aca' }),
    row(63, 0, SU),
    row(64, 0.4, { cliffChoice: 'filled to ACA 400% line' }), // under $1
    row(65, 0, FULL), // the window's last age
    row(66, 0, SU), // outside the window, $0: hidden
    row(67, 0, { convHeldBy: 'stayUnder', cliffChoice: 'stayed under ACA 400% line' }), // outside the window, held: shown
  ];
  const frozen = rows.map((r) => Object.freeze(r)); // only reads the rows
  c.expect(scheduleRows(frozen, 22, PLAN, 59, 65)).toStrictEqual([
    { from: 57, to: 57, amount: 30000, year: -1, why: 'Fill to the top of the 22% bracket' },
    { from: 58, to: 58, amount: 0, year: 0, why: 'Held by the ACA 400% line' },
    { from: 59, to: 59, amount: 20226, year: 1, why: 'Held by the ACA 400% line' },
    { from: 60, to: 60, amount: 0, year: 2, why: 'No conversion' },
    { from: 61, to: 61, amount: 41000, year: 3, why: 'Fill to the top of the 22% bracket' },
    { from: 62, to: 62, amount: 0, year: 4, why: 'Held by the ACA 400% line' },
    { from: 63, to: 63, amount: 0, year: 5, why: 'Stayed under the ACA 400% line' },
    { from: 64, to: 64, amount: 0, year: 6, why: 'Filled to the ACA 400% line' },
    { from: 65, to: 65, amount: 0, year: 7, why: 'No room left in the 22% bracket' },
    { from: 67, to: 67, amount: 0, year: 9, why: 'Stayed under the ACA 400% line' },
  ]);
  // nothing in the window and nothing outside it that converts or was held: no row
  c.expect(scheduleRows([row(60, 0), row(61, 0.9, FULL)], 22, PLAN, 62, 65)).toStrictEqual([]);
  c.expect(scheduleRows([], 22, PLAN, 59, 65)).toStrictEqual([]);
  // the returned objects are new: not the rows
  const out = scheduleRows(frozen, 22, PLAN, 59, 65);
  c.expect(out.some((o) => frozen.includes(o))).toBe(false);
});

it('scheduleRows: ruling 2, the collapse', async () => {
  const w = await world();
  const { scheduleRows } = await w.load('us/ui/results/roth-optimizer.js');
  // the fixture (window 59-67): 60-61 no room left in the 10% bracket, 62-63 stayed under with 'full' and 64-66 'stayUnder' (the
  // stayed-under why for all five), 67 no room again
  const fixture = [
    row(58, 0), row(59, 20226, { convHeldBy: 'aca' }), row(60, 0, FULL), row(61, 0, FULL),
    row(62, 0, { ...SU, ...FULL }), row(63, 0, { ...SU, ...FULL }),
    row(64, 0, { ...SU, convHeldBy: 'stayUnder' }), row(65, 0, { ...SU, convHeldBy: 'stayUnder' }), row(66, 0, { ...SU, convHeldBy: 'stayUnder' }),
    row(67, 0, FULL), row(68, 0),
  ];
  c.expect(scheduleRows(fixture, 10, PLAN, 59, 67)).toStrictEqual([
    { from: 59, to: 59, amount: 20226, year: 1, why: 'Held by the ACA 400% line' },
    { from: 60, to: 61, amount: 0, year: 2, why: 'No room left in the 10% bracket' },
    { from: 62, to: 66, amount: 0, year: 4, why: 'Stayed under the ACA 400% line' },
    { from: 67, to: 67, amount: 0, year: 9, why: 'No room left in the 10% bracket' },
  ]);
  // a gap of one hidden age (outside the window): no merge across it
  c.expect(scheduleRows([row(62, 0, { convHeldBy: 'aca' }), row(63, 0), row(64, 0, { convHeldBy: 'aca' })], 22, PLAN, 70, 75)).toStrictEqual([
    { from: 62, to: 62, amount: 0, year: 4, why: 'Held by the ACA 400% line' },
    { from: 64, to: 64, amount: 0, year: 6, why: 'Held by the ACA 400% line' },
  ]);
  // different whys: no merge
  c.expect(scheduleRows([row(62, 0, SU), row(63, 0, { convHeldBy: 'aca' }), row(64, 0, { convHeldBy: 'aca' })], 22, PLAN, 59, 70)).toStrictEqual([
    { from: 62, to: 62, amount: 0, year: 4, why: 'Stayed under the ACA 400% line' },
    { from: 63, to: 64, amount: 0, year: 5, why: 'Held by the ACA 400% line' },
  ]);
  // a converting row inside a run breaks it, and converting rows never merge with each other
  c.expect(scheduleRows([row(62, 0, SU), row(63, 5000, SU), row(64, 0, SU), row(67, 70000, { convHeldBy: 'irmaa' }), row(68, 72000, { convHeldBy: 'irmaa' })], 22, PLAN, 62, 64)).toStrictEqual([
    { from: 62, to: 62, amount: 0, year: 4, why: 'Stayed under the ACA 400% line' },
    { from: 63, to: 63, amount: 5000, year: 5, why: 'Fill to the top of the 22% bracket' },
    { from: 64, to: 64, amount: 0, year: 6, why: 'Stayed under the ACA 400% line' },
    { from: 67, to: 67, amount: 70000, year: 9, why: 'Held under an IRMAA tier' },
    { from: 68, to: 68, amount: 72000, year: 10, why: 'Held under an IRMAA tier' },
  ]);
  // a converting row then a $0 row with the same why: no merge (the run starts after the converting row)
  c.expect(scheduleRows([row(63, 0, { convHeldBy: 'aca' }), row(64, 9000, { convHeldBy: 'aca' }), row(65, 0, { convHeldBy: 'aca' }), row(66, 0, { convHeldBy: 'aca' })], 22, PLAN, 63, 66)).toStrictEqual([
    { from: 63, to: 63, amount: 0, year: 5, why: 'Held by the ACA 400% line' },
    { from: 64, to: 64, amount: 9000, year: 6, why: 'Held by the ACA 400% line' },
    { from: 65, to: 66, amount: 0, year: 7, why: 'Held by the ACA 400% line' },
  ]);
  // split years collapse by partner
  c.expect(scheduleRows([row(60, 0, { drawSplit: 'A' }), row(61, 0, { drawSplit: 'A' }), row(62, 0, { drawSplit: 'B' })], 22, PLAN, 60, 62)).toStrictEqual([
    { from: 60, to: 61, amount: 0, year: 2, why: "No conversion; Partner A's accounts drawn first" },
    { from: 62, to: 62, amount: 0, year: 4, why: "No conversion; Partner B's accounts drawn first" },
  ]);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  // ageRanges 6, scheduleWhy (ruling 3) 24, the label map 9, R2-3 21, R2-1 4, ruling 2 6
  expect(c.total).toBe(70);
});

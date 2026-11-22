// SS claiming optimizer PR 5: the spousal benefit in src/us/core/income/social-security.js. A spouse whose own amount at full
// retirement age is under half the other's gets the excess on top of their own benefit (20 CFR 404.333, POMS RS 00615.020),
// reduced for their age when it starts (25/36 of 1% a month for 36 months, 5/12 of 1% beyond, 404.410(b); no delayed credits,
// 404.313(e)(2)), from the latest of their filing age, the other's, 62 and a year of marriage (deemed filing, POMS GN 00204.035;
// 404.330(a)(1)). The tax year is 2026 and inflation 0, so a year's benefit is the monthly figure x 12 x the factors. The own
// factor in units of 1/3600 as in ss-claim-basis.test.js (62: 2520, 63: 2700, 64: 2880, 67: 3600, 70: 4464 for an FRA of 67), the
// spousal factor likewise (62: 2340, 63: 2520, 64: 2700, 65: 3000, 66: 3300, 67 on: 3600). Every figure is invented.
import { it, afterAll, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';
import { usCoreFilesContaining } from '../helpers/markup.js';

const NEW_COUNT = 102;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// A married couple of 62 in 2026 (both born 1964, full retirement age 67), A 3,000 and B 1,000 a month at full retirement age,
// both claiming at 62 unless a case says otherwise, survivor modeling off: B's excess is 1,500 - 1,000 = 500 a month.
const SPOUSAL = {
  singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62,
  lifeExpectancyA: 90, lifeExpectancyB: 90, incomeA: 0, incomeB: 0, spending: 60000, taxable: 400000,
  tradIraA: 0, tradIraB: 0, trad401kA: 300000, trad401kB: 300000, rothIraA: 50000, rothIraB: 50000, roth401kA: 0, roth401kB: 0,
  cash: 30000, inflation: 0, dividendYield: 0, pensionCoverage: 'none', pensionYearlyA: 0, pensionYearlyB: 0, survivorEnabled: false,
  ltcEnabled: false, healthcare: 0, ssMonthlyA: 3000, ssMonthlyB: 1000, ssStartAgeA: 62, ssStartAgeB: 62, ssLateStartEnabled: false,
  ssBenefitBasisA: 'pia', ssBenefitBasisB: 'pia', stateTax: 'tx', acaEnabled: false,
};
const ssModule = async (patch) => {
  const w = await world();
  await w.setState({ ...SPOUSAL, ...patch });
  return { w, m: await w.load('us/core/income/social-security.js'), ctx: await w.ctx() };
};
// Partner p's slot in the year they are a, factor and paid 1.
const paid = async (patch, p, ages) => {
  const { m, ctx } = await ssModule(patch);
  return ages.map((a) => m.paidBenefitYearly(ctx, p, a, 1, 1));
};
const rowsOf = async (patch) => {
  const w = await world();
  await w.setState({ ...SPOUSAL, ...patch });
  return (await engine(w)).simulateRaw().rows;
};
const ssAt = (rows, age) => rows.find((r) => r.age === age).ss;

it('the spousal factor (404.410(b), RS 00615.201)', async () => {
  const { m } = await ssModule({});
  c.expect(m.ssSpousalFactor(804, 62)).toBe(2340 / 3600);
  c.expect(m.ssSpousalFactor(804, 62)).toBe(0.65);
  c.expect(m.ssSpousalFactor(804, 63)).toBe(2520 / 3600);
  c.expect(m.ssSpousalFactor(804, 64)).toBe(2700 / 3600);
  c.expect(m.ssSpousalFactor(804, 65)).toBe(3000 / 3600);
  c.expect(m.ssSpousalFactor(804, 66)).toBe(3300 / 3600);
  for (const x of [67, 68, 70]) c.expect(m.ssSpousalFactor(804, x)).toBe(1);
  c.expect(m.ssSpousalFactor(804, 60)).toBe(2340 / 3600);
  c.expect(m.ssSpousalFactor(792, 62)).toBe((3600 - 900 - 180) / 3600);
});

it('the excess at 62 and at full retirement age', async () => {
  c.expect((await paid({}, 'B', [62]))[0]).toBe(1000 * 12 * (2520 / 3600) + 500 * 12 * (2340 / 3600));
  const rows = await rowsOf({});
  c.expect(ssAt(rows, 62)).toBe(3000 * 12 * (2520 / 3600) + (1000 * 12 * (2520 / 3600) + 500 * 12 * (2340 / 3600)));
  c.expect(ssAt(rows, 80)).toBe(3000 * 12 * (2520 / 3600) + (1000 * 12 * (2520 / 3600) + 500 * 12 * (2340 / 3600)));
  c.expect(await paid({ ssStartAgeA: 67, ssStartAgeB: 67 }, 'B', [66, 67])).toStrictEqual([0, 1000 * 12 * 1 + 500 * 12 * 1]);
  // The higher earner gets none.
  c.expect((await paid({}, 'A', [62]))[0]).toBe(3000 * 12 * (2520 / 3600));
});

it('deemed filing, in both orders and at different ages', async () => {
  // Spouse first: B files at 62, A at 67, so B's excess starts at B's 67, unreduced.
  c.expect(await paid({ ssStartAgeA: 67 }, 'B', [62, 66, 67])).toStrictEqual([1000 * 12 * (2520 / 3600), 1000 * 12 * (2520 / 3600), 1000 * 12 * (2520 / 3600) + 500 * 12 * 1]);
  // Worker first: A at 62, B at 64.
  c.expect(await paid({ ssStartAgeB: 64 }, 'B', [63, 64])).toStrictEqual([0, 1000 * 12 * (2880 / 3600) + 500 * 12 * (2700 / 3600)]);
  // A is 64 and B 62 today; A starts at 66 (year 2, B's 64).
  const diff = { ageA: 64, retireAgeA: 64, ssStartAgeA: 66 };
  c.expect(await paid(diff, 'B', [63, 64])).toStrictEqual([1000 * 12 * (2520 / 3600), 1000 * 12 * (2520 / 3600) + 500 * 12 * (2700 / 3600)]);
  const { m, ctx } = await ssModule(diff);
  c.expect(m.ssSpousalStart(ctx, 'B')).toStrictEqual({ x: 64, monthly: 500 * (2700 / 3600) });
  // No delayed credits on the excess: B at 70.
  c.expect(await paid({ ssStartAgeB: 70 }, 'B', [69, 70])).toStrictEqual([0, 1000 * 12 * (4464 / 3600) + 500 * 12 * 1]);
  // A past 70 under the late-start switch: the excess starts at B's 73.
  c.expect(await paid({ ssLateStartEnabled: true, ssStartAgeA: 73 }, 'B', [72, 73])).toStrictEqual([1000 * 12 * (2520 / 3600), 1000 * 12 * (2520 / 3600) + 500 * 12 * 1]);
});

it('the marriage gate (404.330(a)(1)): a year of marriage, in whole years', async () => {
  const own62 = 1000 * 12 * (2520 / 3600);
  // Start single, marry at A's 64 (year 2): from year 3, B's 65.
  c.expect(await paid({ marryLater: true, marriageAgeA: 64 }, 'B', [62, 64, 65])).toStrictEqual([own62, own62, own62 + 500 * 12 * (3000 / 3600)]);
  // Married this year: from year 1.
  c.expect(await paid({ marryLater: true, marriageAgeA: 62 }, 'B', [62, 63])).toStrictEqual([own62, own62 + 500 * 12 * (2520 / 3600)]);
  // Married two years ago: from year 0.
  c.expect((await paid({ marryLater: true, marriageAgeA: 60 }, 'B', [62]))[0]).toBe(own62 + 500 * 12 * (2340 / 3600));
  // Two single filers: never.
  const single = await ssModule({ filingStatus: 'single' });
  for (const a of [62, 70, 90]) c.expect(single.m.paidBenefitYearly(single.ctx, 'B', a, 1, 1)).toBe(single.m.ownBenefitYearly(single.ctx, 'B', a, 1, 1));
  c.expect(single.m.ssSpousalStart(single.ctx, 'B')).toBe(null);
});

it('whose PIA is known', async () => {
  // No own benefit (an amount of 0, in either basis): the whole half.
  for (const ssBenefitBasisB of ['atClaim', 'pia']) c.expect((await paid({ ssMonthlyB: 0, ssBenefitBasisB }, 'B', [62]))[0]).toBe(1500 * 12 * (2340 / 3600));
  // B's amount as paid at the start age, A's in atClaim, or B at exactly half: none.
  for (const patch of [{ ssBenefitBasisB: 'atClaim' }, { ssBenefitBasisA: 'atClaim' }, { ssMonthlyB: 1500 }, { ssMonthlyA: 0 }]) {
    const { m, ctx } = await ssModule(patch);
    for (const a of [62, 67, 80]) c.expect(m.paidBenefitYearly(ctx, 'B', a, 1, 1)).toBe(m.ownBenefitYearly(ctx, 'B', a, 1, 1));
    c.expect(m.ssSpousalStart(ctx, 'B')).toBe(null);
  }
  // A as the spouse.
  c.expect((await paid({ ssMonthlyA: 1000, ssMonthlyB: 3000 }, 'A', [62]))[0]).toBe(1000 * 12 * (2520 / 3600) + 500 * 12 * (2340 / 3600));
});

it('collecting and claims now', async () => {
  // B is 65, collecting since 63; A is 66, collecting since 64 (B was 63): paid from year 0 at the factor of 63.
  const coll = { ageA: 66, ageB: 65, retireAgeA: 66, retireAgeB: 65, ssStartAgeA: 64, ssStartAgeB: 63, ssCollectingA: true, ssCollectingB: true };
  c.expect((await paid(coll, 'B', [65]))[0]).toBe(1000 * 12 * (2700 / 3600) + 500 * 12 * (2520 / 3600));
  const { m, ctx } = await ssModule(coll);
  c.expect(m.ssSpousalStart(ctx, 'B')).toStrictEqual({ x: 63, monthly: 500 * (2520 / 3600) });
  // Both 64 with starts of 62, not collecting: both claim now.
  c.expect((await paid({ ageA: 64, ageB: 64, retireAgeA: 64, retireAgeB: 64 }, 'B', [64]))[0]).toBe(1000 * 12 * (2880 / 3600) + 500 * 12 * (2700 / 3600));
  // No own benefit, collecting since 62 at 64; A (64) starts at 66: the excess starts at B's 66.
  const none = { ageA: 64, ageB: 64, retireAgeA: 64, retireAgeB: 64, ssMonthlyB: 0, ssBenefitBasisB: 'atClaim', ssCollectingB: true, ssStartAgeA: 66 };
  c.expect(await paid(none, 'B', [65, 66])).toStrictEqual([0, 1500 * 12 * (3300 / 3600)]);
});

it('the survivor period pays no excess', async () => {
  const patch = { survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 75, survivorSpendingPct: 70 };
  const rows = await rowsOf(patch);
  c.expect(ssAt(rows, 74)).toBe(3000 * 12 * (2520 / 3600) + (1000 * 12 * (2520 / 3600) + 500 * 12 * (2340 / 3600)));
  const { m, ctx } = await ssModule(patch);
  c.expect(ssAt(rows, 75)).toBe(m.survivorBenefitYearly(ctx, true, 13, 75, 75, 1, 1));
  c.expect(ssAt(rows, 75)).toBe(Math.min(36000 * 1, Math.max(36000 * 0.825, 36000 * (2520 / 3600))));
});

it('the benefit cut and the inflation factor apply to the excess', async () => {
  const rows = await rowsOf({ ssBenefitCutPct: 22, ssBenefitCutStartYear: 2030 });
  c.expect(ssAt(rows, 65)).toBe(3000 * 12 * (2520 / 3600) + (1000 * 12 * (2520 / 3600) + 500 * 12 * (2340 / 3600)));
  c.expect(ssAt(rows, 66)).toBe(3000 * 12 * (2520 / 3600) * 1 * 0.78 + (1000 * 12 * (2520 / 3600) * 1 * 0.78 + 500 * 12 * (2340 / 3600) * 1 * 0.78));
  const { m, ctx } = await ssModule({});
  c.expect(m.paidBenefitYearly(ctx, 'B', 62, 1.37, 0.78)).toBe(1000 * 12 * (2520 / 3600) * 1.37 * 0.78 + 500 * 12 * (2340 / 3600) * 1.37 * 0.78);
  c.expect(m.spousalExcessYearly(ctx, 'B', 62, 1.37, 0.78)).toBe(500 * 12 * (2340 / 3600) * 1.37 * 0.78);
});

it('the cliff plan reads the same benefit', async () => {
  for (const patch of [{}, { ssStartAgeA: 67, ssMonthlyB: 0 }, { ageA: 64, retireAgeA: 64, ssStartAgeA: 66 }]) {
    const { w, m, ctx } = await ssModule(patch);
    const solver = await w.load('us/core/cliff-plan/solver.js');
    for (const y of [0, 2, 5, 10]) {
      const want = m.paidBenefitYearly(ctx, 'A', ctx.inputs.ageA + y, 1, 1) + 0 + (m.paidBenefitYearly(ctx, 'B', ctx.inputs.ageB + y, 1, 1) + 0);
      c.expect(solver.benefitIncomeAt(ctx, y, false, 1, null)).toBe(want);
    }
  }
});

it('nothing moves outside the rule', async () => {
  // The default plan (a couple, both amounts as paid at the start age).
  const w = await world();
  await w.setState({});
  const d = await w.load('us/core/income/social-security.js');
  const dctx = await w.ctx();
  for (const a of [62, 70, 90]) for (const p of ['A', 'B']) c.expect(d.paidBenefitYearly(dctx, p, a, 1, 1)).toBe(d.ownBenefitYearly(dctx, p, a, 1, 1));
  // Identical partners in pia, and exactly half (ss-survivor.test.js's A 1,000 / B 2,000).
  for (const patch of [{ ssMonthlyA: 2000, ssMonthlyB: 2000 }, { ssMonthlyA: 1000, ssMonthlyB: 2000 }]) {
    const { m, ctx } = await ssModule(patch);
    for (const a of [62, 70, 90]) for (const p of ['A', 'B']) c.expect(m.paidBenefitYearly(ctx, p, a, 1, 1)).toBe(m.ownBenefitYearly(ctx, p, a, 1, 1));
  }
});

it('the stream key covers the excess and its split', async () => {
  const key = async (patch) => {
    const { m, ctx } = await ssModule(patch);
    return m.ssStreamKey(ctx);
  };
  c.expect((await key({ ssStartAgeA: 67 })) === (await key({ ssStartAgeA: 67, ssStartAgeB: 64 }))).toBe(false);
  // No own benefit: every B start at or below A's 67 pays alike; 68 does not.
  const none = { ssMonthlyB: 0, ssBenefitBasisB: 'atClaim', ssStartAgeA: 67 };
  const k62 = await key({ ...none, ssStartAgeB: 62 });
  for (const b of [63, 65, 67]) c.expect(await key({ ...none, ssStartAgeB: b })).toBe(k62);
  c.expect((await key({ ...none, ssStartAgeB: 68 })) === k62).toBe(false);
  // One sum, two splits: B's own 1,500 (A in atClaim, no excess) against own 1,000 plus 500, both from 67; A 36,000 a year in both.
  const p1 = { ssBenefitBasisA: 'atClaim', ssMonthlyB: 1500, ssStartAgeA: 67, ssStartAgeB: 67 },
    p2 = { ssStartAgeA: 67, ssStartAgeB: 67 };
  const s1 = await ssModule(p1),
    s2 = await ssModule(p2);
  for (const a of [66, 67, 80])
    for (const p of ['A', 'B']) c.expect(s1.m.paidBenefitYearly(s1.ctx, p, a, 1, 1)).toBe(s2.m.paidBenefitYearly(s2.ctx, p, a, 1, 1));
  c.expect((await key(p1)) === (await key(p2))).toBe(false);
});

it('one reader: no core module but social-security.js calls ownBenefitYearly', () => {
  c.expect(usCoreFilesContaining('ownBenefitYearly')).toStrictEqual(['income/social-security.js']);
});

// A Roth conversion under the Rhode Island and Pennsylvania retirement exclusions (US). The year's conversion is the first
// dollars of taxFor's traditionalExtra (profile.conv, set by the year loop) and reaches the state as sources.convA/B, with its
// own 401(k) dollars (conv401kA/B: the ledger converts IRAs first, profile.convK401FracA/B). Each filer's 401(k) part
// (retirement401kA/B) is the RMD at the start-of-year share (k401FracA/B), the conversion's 401(k) dollars, and the rest of
// the draw at the share after the conversion (k401DrawFracA/B).
//   Pennsylvania: a traditional IRA converted to a Roth IRA is not taxable at any age (PA-40 instructions 2025, "Roth IRA
//   Rollover"; Personal Income Tax Guide DFO-02, "Special Rules for Converting Traditional IRAs to Roth IRAs"): the row's
//   applies.conversionExempt.
//   Rhode Island: IRA income never qualifies for the pension and annuity modification, and a taxable distribution from a
//   401(k) reported on Form 1040 line 5b does (PUB 2026-01): an IRA conversion is taxed, a 401(k) one takes the exclusion.
// Every expected value is worked by hand in the comment beside it. The state tax is the profile's taxFor under the state
// minus taxFor under Texas (renting, standard deduction: the state tax does not move the federal one).
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { withRuleRow } from '../helpers/rules.js';
import { engine } from '../helpers/engine.js';

// The tolerance of the state-mechanism suite (a rate times a base is not exact in binary).
const near = (a, b, label) => expect(Math.abs(a - b) <= 0.005, label + ': expected ' + b + ', got ' + a).toBe(true);
// A share computed by the engine against a hand ratio (a quotient of doubles).
const share = (a, b, label) => expect(Math.abs(a - b) <= 1e-12, label + ': expected ' + b + ', got ' + a).toBe(true);

async function setup() {
  const w = await world();
  const { STATE_RULES: R } = await w.load('us/core/tax/state-rules.js');
  const { taxFor } = await w.load('us/core/tax/federal-tax.js');
  const st = await w.setState();
  w.setTaxYear(2026);
  st.inflation = 0;
  const now = await w.ctxBuilder();
  const stateOf = (code, p, trad) => {
    st.stateTax = code;
    const a = taxFor(now(), p, 0, trad);
    st.stateTax = 'tx';
    return a - taxFor(now(), p, 0, trad);
  };
  return { w, R, st, stateOf };
}

const person = (o) => Object.assign({ year: 0, filing: 'single', singlePerson: true, otherA: 0, otherB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 55, ageB: null, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0, dependents: [], ownerShareA: 1, k401FracA: 0, k401FracB: 0, conv: 0 }, o);
const couple = (o) => person(Object.assign({ filing: 'mfj', singlePerson: false, ageB: 52, ownerShareA: 0.5 }, o));

it('Pennsylvania: a conversion is not taxed at any age', async () => {
  const { stateOf } = await setup();
  // Flat 3.07%, no deduction; wages 100,000 keep Tax Forgiveness out (eligibility income far over 6,500): 3,070 on the wages.
  const pa = (o, trad) => stateOf('pa', person(Object.assign({ wageA: 100000, otherA: 100000 }, o)), trad);
  near(pa({ conv: 30000 }, 30000), 3070, 'A 55, a 30,000 IRA conversion: only the wages are taxed');
  near(pa({ conv: 0 }, 30000), 3991, 'the same 30,000 as a draw at 55 is taxed: 3.07% x 130,000');
  near(pa({ conv: 30000 }, 50000), 3684, 'conversion 30,000 plus an IRA draw 20,000 at 55: the draw is taxed, 3.07% x 120,000');
  near(pa({ conv: 30000, k401FracA: 1 }, 50000), 3070, 'retired, all 401(k): the draw is excluded (after retirement) and so is the conversion');
  near(pa({ conv: 30000, k401FracA: 0.5 }, 50000), 3377, 'half 401(k): the 20,000 draw is half 401(k), 10,000 taxed (3,070 + 307)');
  near(pa({ conv: 30000, k401FracA: 0.5, k401DrawFracA: 1 }, 50000), 3070, 'the draw after the conversion is all 401(k): excluded');
  // Still working (the employer-plan share is 0), a conversion out of a 401(k) (it is still a conversion), an IRA draw 20,000.
  near(pa({ conv: 30000, convK401FracA: 1 }, 50000), 3684, 'working, a 401(k) conversion: excluded once, the IRA draw taxed (3.07% x 120,000)');
  near(pa({ conv: 30000, convK401FracA: 1, k401FracA: 1, k401DrawFracA: 0 }, 50000), 3684, 'retired, a 401(k) conversion and an IRA draw: the conversion is not counted twice');
  near(pa({ conv: 30000 }, 10000), 3070, 'a probe below the conversion (10,000): all of it is conversion');
  near(pa({ conv: 30000, ageA: 60 }, 50000), 3070, 'from 59.5 every traditional dollar is excluded, as before');

  // Joint, A 55 (owns 75% of the pool) and B 52, wages 100,000 on A. Conversion 40,000 (A 30,000, B 10,000), both excluded.
  const paJ = (o, trad) => stateOf('pa', couple(Object.assign({ wageA: 100000, otherA: 100000, ownerShareA: 0.75 }, o)), trad);
  near(paJ({ conv: 40000 }, 40000), 3070, 'joint: the conversion is excluded on both partners');
  near(paJ({ conv: 40000 }, 60000), 3684, 'joint: the 20,000 IRA draw on top is taxed (15,000 A, 5,000 B): 3.07% x 120,000');
  // Two returns (filing single, not one person), B with wages 50,000 so B's return has no forgiveness either.
  const paS = (o, trad) => paJ(Object.assign({ filing: 'single', wageB: 50000, otherB: 50000 }, o), trad);
  near(paS({ conv: 40000 }, 40000), 4605, 'two returns: each return excludes its part of the conversion (3.07% x 150,000)');
  near(paS({ conv: 40000 }, 60000), 5219, 'two returns: the draw is taxed on both returns (4,605 + 3.07% x 20,000)');
});

it('Rhode Island: an IRA conversion is taxed, a 401(k) conversion takes the exclusion', async () => {
  const { stateOf } = await setup();
  // 3.75% to 82,050; single 11,200 + 5,250 = 16,450; joint 22,400 + 2 x 5,250 = 32,900. From 67, up to 50,000 of
  // pension and 401(k) money per filer, under the AGI limits (107,000 single, 133,750 joint).
  const ri = (o, trad) => stateOf('ri', person(Object.assign({ ageA: 68, k401FracA: 1 }, o)), trad);
  near(ri({ conv: 40000 }, 40000), 883.125, 'single 68: a 40,000 IRA conversion is taxed, 3.75% x (40,000 - 16,450)');
  near(ri({ conv: 40000, convK401FracA: 1 }, 40000), 0, 'the same conversion out of a 401(k) is excluded (under the 50,000 cap)');
  near(ri({ conv: 0 }, 40000), 0, 'a 40,000 401(k) draw is excluded, as before');
  near(ri({ conv: 30000 }, 60000), 508.125, 'IRA conversion 30,000 + 401(k) draw 30,000: the draw is excluded, 3.75% x (30,000 - 16,450)');
  near(ri({ conv: 40000, convK401FracA: 1 }, 80000), 508.125, '401(k) conversion 40,000 + 401(k) draw 40,000: 50,000 excluded, 3.75% x (30,000 - 16,450)');
  near(ri({ conv: 40000, ageA: 66 }, 40000), 883.125, 'under 67 nothing qualifies: the same figure');
  // IRA 100,000 and 401(k) 100,000 at the start of the year (share 0.5); the 40,000 conversion takes IRA money, leaving
  // 60,000 IRA and 100,000 401(k): the 40,000 draw after it is 100 / 160 = 0.625 401(k), 25,000 excluded.
  // Taxed: 40,000 + 15,000 = 55,000; 3.75% x (55,000 - 16,450) = 1,445.625.
  near(ri({ conv: 40000, k401FracA: 0.5, k401DrawFracA: 0.625 }, 80000), 1445.625, 'the draw after an IRA conversion is 62.5% 401(k)');
  // An RMD of 20,000 at the start-of-year share 0.5 (10,000 excluded), an IRA conversion 30,000 and a 10,000 draw that is
  // all 401(k) after it (excluded). Taxed: 10,000 + 30,000 = 40,000; 3.75% x (40,000 - 16,450) = 883.125.
  near(ri({ otherA: 20000, rmdA: 20000, conv: 30000, k401FracA: 0.5, k401DrawFracA: 1 }, 40000), 883.125, 'an RMD at the start-of-year share, the draw at the share after the conversion');

  // Joint, A 68 and B 67, all 401(k), equal shares: conversion 40,000 and a draw of 60,000 (30,000 each, excluded).
  const riJ = (o, trad) => stateOf('ri', couple(Object.assign({ ageA: 68, ageB: 67, k401FracA: 1, k401FracB: 1 }, o)), trad);
  near(riJ({ conv: 40000 }, 100000), 266.25, 'joint, IRA conversion: only the conversion is taxed, 3.75% x (40,000 - 32,900)');
  near(riJ({ conv: 40000, convK401FracA: 1, convK401FracB: 0 }, 100000), 0, 'joint: A\'s half from a 401(k) is excluded (50,000 in all), B\'s IRA half 20,000 is under the deduction left');
  near(riJ({ conv: 0 }, 100000), 0, 'joint, the same 100,000 all drawn: 50,000 each, every dollar excluded');
  // Two returns (filing single): each return carries half the conversion (20,000) and half the draw (excluded).
  near(riJ({ conv: 40000, filing: 'single' }, 100000), 266.25, 'two returns, IRA conversion: 3.75% x (20,000 - 16,450) on each return');
  near(riJ({ conv: 40000, filing: 'single', convK401FracB: 1 }, 100000), 133.125, 'two returns: B\'s 401(k) half is excluded, A\'s IRA half taxed');
});

it('another state: a conversion is still a traditional draw', async () => {
  const { R, stateOf } = await setup();
  // A synthetic flat 10% row with no deduction that excludes a filer's traditional income from 59.5 (no employer-plan options).
  const zero3 = { single: 0, mfj: 0, hoh: 0 };
  const idx = { bracketsIndexed: false, standardDeductionIndexed: false, personalExemptionIndexed: false, creditAmountsIndexed: false, creditThresholdsIndexed: false, retirementExclusionIndexed: false };
  const row = {
    name: 'Synthetic', status: 'migrated', sourceKind: 'none', source: null, asOf: null, indexing: idx,
    statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' }, tax: { kind: 'flat', rate: 0.1 }, additions: [],
    base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
    standardDeduction: { ...zero3 }, standardDeductionPhase: { kind: 'none' }, exemption: { ...zero3 }, exemptionPhaseOut: { kind: 'none' }, dependentExemption: 0,
    seniorExemption: { kind: 'none' }, federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false }, schedule: [],
    retirementExclusion: { kind: 'perPerson', pensionMinAge: 0, traditionalMinAge: 59.5, applies: { pension: true, traditional: true }, tiers: [[0, null]], reducedBy: 'none', share: null },
    credits: [], federalTaxSubtraction: 'none', localTax: 'notModeled', notes: '',
  };
  withRuleRow(R, 'zzc', row, () => {
    near(stateOf('zzc', person({ conv: 30000, convK401FracA: 1 }), 30000), 3000, 'at 55 the conversion is taxed: 10% x 30,000');
    near(stateOf('zzc', person({ conv: 30000, ageA: 62 }), 30000), 0, 'at 62 it is excluded like any traditional dollar');
  });
});

// Single, 68, retired, Rhode Island; spending 20,000 drawn from traditional money (with the conversion's tax); a 12% bracket
// fill from 68. No inflation, renting, no health costs, no Social Security.
const RI_RETIREE = {
  singlePerson: true, ageA: 68, retireAgeA: 68, lifeExpectancyA: 72, ageB: 68, retireAgeB: 68, lifeExpectancyB: 72,
  returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0, dividendYield: 0, medicalInflation: 0, healthcare: 0, medicareYearly: 0,
  acaEnabled: false, ltcEnabled: false, ssMonthlyA: 0, ssMonthlyB: 0, tenure: 'rent', rent: 0, rentGrowth: 0, incomeA: 0, incomeB: 0,
  taxable: 0, cash: 0, cashReserve: 0, bondYears: 0, spending: 20000, stateTax: 'ri', children: [], survivorEnabled: false,
  tradIraA: 0, trad401kA: 0, tradIraB: 0, trad401kB: 0, rothIraA: 0, roth401kA: 0, rothIraB: 0, roth401kB: 0,
  rothConvEnabled: true, rothConvStartAge: 68, rothConvEndAge: 70, rothConvBracket: 12, incomeSources: [], oneTimeIncome: [],
};

// Year 0 of a run: the engine's own profile, its conversion and draw, and RI's part of taxFor on them.
async function year0(w, patch) {
  await w.setState({ ...RI_RETIREE, ...patch });
  const e = await engine(w);
  const tr = e.accountTrace()[0], rows = e.simulateRaw().rows;
  const conv = tr.conversionAmount, t = rows[0].traditionalWithdrawn;
  const { taxFor } = await w.load('us/core/tax/federal-tax.js');
  const st = (await w.load('shared/core/store.js')).state;
  const now = await w.ctxBuilder();
  st.stateTax = 'ri';
  const a = taxFor(now(), { ...tr.profile }, 0, conv + t);
  st.stateTax = 'tx';
  const b = taxFor(now(), { ...tr.profile }, 0, conv + t);
  st.stateTax = 'ri';
  return { p: tr.profile, conv, t, ri: a - b };
}

it('the year loop: a conversion out of a 401(k) takes the RI exclusion', async () => {
  const { w } = await setup();
  // All money in a 401(k): the conversion and the draw are both 401(k) money; RI excludes up to 50,000 of them and taxes the
  // rest over the deduction: 3.75% x (conv + t - 50,000 - 16,450). A relational check: conv and t are the engine's (the
  // figures are pinned above).
  const y = await year0(w, { trad401kA: 1000000 });
  expect(y.conv + y.t > 66450 && y.conv + y.t < 107000, 'over the cap and the deduction, under the AGI limit (' + y.conv + ', ' + y.t + ')').toBe(true);
  expect(y.p.conv).toBe(y.conv);
  expect(y.p.convK401FracA).toBe(1);
  expect(y.p.k401DrawFracA).toBe(1);
  near(y.ri, 0.0375 * (y.conv + y.t - 50000 - 16450), 'RI: 50,000 of the 401(k) money excluded');
});

it('the year loop: an IRA conversion leaves the draw more 401(k) money', async () => {
  const { w } = await setup();
  // IRA 200,000 and 401(k) 200,000, no growth: the conversion takes IRA money only (convK401FracA 0), and the draw after it
  // is 200,000 / (400,000 - conv) 401(k). RI: 3.75% x (conv + t - t x that share - 16,450) (the 401(k) part of the draw is
  // under the cap).
  const y = await year0(w, { tradIraA: 200000, trad401kA: 200000 });
  expect(y.conv > 0 && y.conv < 200000 && y.conv + y.t < 107000, 'an IRA-only conversion under the AGI limit (' + y.conv + ', ' + y.t + ')').toBe(true);
  expect(y.p.k401FracA).toBe(0.5);
  expect(y.p.convK401FracA).toBe(0);
  const f = 200000 / (400000 - y.conv);
  share(y.p.k401DrawFracA, f, 'the draw\'s 401(k) share after the conversion');
  near(y.ri, 0.0375 * (y.conv + y.t - y.t * f - 16450), 'RI: the draw\'s 401(k) part excluded, the conversion taxed');
});

it('the year loop: a conversion past the IRA reads the grown IRA', async () => {
  const { w } = await setup();
  // IRA 10,000 and 401(k) 500,000 with a 5% return (all in stocks, no bond bucket): the ledger converts after growth, so the
  // IRA gives 10,500 and the rest of the conversion is 401(k) money: convK401FracA = (conv - 10,500) / conv.
  const y = await year0(w, { tradIraA: 10000, trad401kA: 500000, returnRate: 5 });
  expect(y.conv > 10500, 'the conversion is larger than the grown IRA (' + y.conv + ')').toBe(true);
  share(y.p.convK401FracA, (y.conv - 10500) / y.conv, 'the conversion\'s 401(k) share');
  expect(y.p.k401DrawFracA).toBe(1);
});

// The year loop replays its ledger steps for the conversion (accountsConvertPreview); with no discretionary draw and no
// contribution after the conversion, the year's closing shares (the trace) are the replay's shares, so the draw's 401(k)
// shares the profile holds must be the trace's own ratios (to the last bits a no-op contribution's renormalization moves).
async function replayMatches(w, patch, hist) {
  await w.setState({ ...RI_RETIREE, spending: 0, cash: 1000000, ...patch });
  const e = await engine(w);
  const tr = e.accountTrace(undefined, undefined, hist)[0],
    row = (hist ? e.simulateHistorical(hist) : e.simulateRaw()).rows[0];
  expect(tr.conversionAmount > 0, 'a conversion (' + tr.conversionAmount + ')').toBe(true);
  expect(row.traditionalWithdrawn, 'no discretionary draw: only the required distributions').toBe(row.rmd);
  const s = tr.tradShares;
  share(tr.profile.k401DrawFracA, s[1] / (s[0] + s[1]), 'A\'s 401(k) share after the conversion');
  share(tr.profile.k401DrawFracB, s[3] / (s[2] + s[3]), 'B\'s 401(k) share after the conversion');
  return tr;
}

it('the replay follows the ledger: a couple at RMD age with a bond bucket and returns', async () => {
  const { w } = await setup();
  // A 78 and B 75: each partner's RMD comes out of their own accounts at a different divisor, so it moves the partners'
  // balance ratio, and with it the IRAs-first conversion's split between the two IRAs (large IRAs: the conversion takes part
  // of them, so each partner's 401(k) share after it depends on that split). Rhode Island.
  const couple = {
    singlePerson: false, ageA: 78, retireAgeA: 70, lifeExpectancyA: 83, ageB: 75, retireAgeB: 70, lifeExpectancyB: 80,
    tradIraA: 300000, trad401kA: 300000, tradIraB: 100000, trad401kB: 200000, returnRate: 6, bondReturn: 3, bondYears: 3,
    rothConvStartAge: 78, rothConvEndAge: 80, rothConvBracket: 22,
  };
  let tr = await replayMatches(w, couple, null);
  expect(tr.profile.convK401FracA, 'the IRAs cover the conversion').toBe(0);
  // The historical engine (the bucket strategy), a year of 12% stocks and 4% bonds.
  await replayMatches(w, couple, (y) => [1990 + y, 12, 4, 0]);
  // Small IRAs: the conversion runs into the 401(k)s, one pooled 401(k) share for both partners.
  tr = await replayMatches(w, { ...couple, tradIraA: 20000, tradIraB: 10000 }, null);
  expect(tr.profile.convK401FracA > 0 && tr.profile.convK401FracA === tr.profile.convK401FracB, 'one pooled 401(k) share, past the IRAs').toBe(true);
});

it('the replay follows the ledger: a 72(t) plan holds its IRA out of the conversion', async () => {
  const { w } = await setup();
  // Both 55, retired at 50; A's IRA pays a 72(t) plan (from 50 to 59.5), so the conversion leaves it alone and takes B's IRA
  // first, then the 401(k)s. Pennsylvania (it reads the 401(k) shares). Cash pays the year's tax (no discretionary draw).
  const tr = await replayMatches(w, {
    singlePerson: false, ageA: 55, retireAgeA: 50, lifeExpectancyA: 60, ageB: 55, retireAgeB: 50, lifeExpectancyB: 60, stateTax: 'pa',
    tradIraA: 300000, trad401kA: 100000, tradIraB: 50000, trad401kB: 100000, returnRate: 5, sepp72tIraA: true,
    rothConvStartAge: 55, rothConvEndAge: 57, rothConvBracket: 12,
  }, null);
  // B's IRA grows to 52,500 and goes first; the rest of the conversion is 401(k) money: (conv - 52,500) / conv.
  expect(tr.conversionAmount > 52500, 'past B\'s IRA (' + tr.conversionAmount + ')').toBe(true);
  share(tr.profile.convK401FracA, (tr.conversionAmount - 52500) / tr.conversionAmount, 'A\'s IRA (under the plan) is left out');
});

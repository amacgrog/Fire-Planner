// Self-employment tax, payroll, the tax profile, the state base and the ACTC (E1c Task 3, US).
// Spec: docs/superpowers/specs/2026-10-08-e1c-self-employment-design.md. Hand-computed; the clock is pinned to 2026 (tests/unit/clock.js).
// Converted from tests/self_employment.js (Playwright); the old script executed 60 near and assert checks (page-error check
// excluded), this file asserts the same 60 (NEW_COUNT tracks them). Each it block sets up its own world, state and tax year; the
// old page carried state from one engine call to the next, which only matters through inert leftovers (see the engine blocks).
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';
import { withRuleRow } from '../helpers/rules.js';
import { usContributions } from '../helpers/us-contributions.js';

const NEW_COUNT = 60;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// Every failing check is reported, not only the first (expect.soft), and each one counts once.
const near = (a, b, tol, msg) => {
  c.tick();
  expect.soft(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`).toBe(true);
};
const check = (cond, msg) => {
  c.tick();
  expect.soft(cond, msg).toBe(true);
};
const same = (a, b, msg) => {
  c.tick();
  expect.soft(a, msg).toBe(b);
};
const deep = (a, b, msg) => {
  c.tick();
  expect.soft(a, msg).toStrictEqual(b);
};

async function setup() {
  const w = await world();
  const state = await w.setState();
  w.setTaxYear(2026);
  const hooks = await usContributions(w);
  const fed = await w.load('us/core/tax/federal-tax.js');
  const { STATE_RULES } = await w.load('us/core/tax/state-rules.js');
  const e = await engine(w);
  return { w, state, hooks, fed, STATE_RULES, e };
}

it('the pure function (year 0, no indexing)', async () => {
  const { hooks } = await setup();
  const setax = (se, wages) => hooks.selfEmploymentTax(se, wages, 0);
  let r = setax(100000, 0);
  near(r.ne, 92350, 1e-9, 'ne');
  near(r.tax, 14129.55, 1e-6, 'se 100,000 tax (11,451.40 + 2,678.15)');
  near(r.half, 7064.775, 1e-6, 'half');
  r = setax(100000, 150000);
  near(r.tax, 6956.15, 1e-6, 'Social Security only on 184,500 - 150,000 = 34,500: 4,278 + 2,678.15');
  r = setax(100000, 200000);
  near(r.tax, 2678.15, 1e-6, 'Medicare only above the wage base');
  r = setax(400, 0);
  deep([r.tax, r.half, r.ne], [0, 0, 0], '$400 floor: ne 369.40 owes nothing');
  r = setax(434, 0);
  near(r.tax, 61.322247, 1e-6, 'just over the floor: ne 400.799 x 15.3%');
  near(r.ne, 400.799, 1e-6, 'ne over the floor');
});

it('payroll', async () => {
  const { hooks, fed } = await setup();
  const pay = (o) => fed.payrollTax({ wageA: 0, wageB: 0, healthPremiumA: 0, healthPremiumB: 0, filing: 'single', year: 0, ...o });
  const r = hooks.selfEmploymentTax(100000, 180000, 0);
  near(r.tax, 558 + 2678.15, 1e-6, 'selfEmploymentTax(100000, 180000): 558 + 2,678.15');
  near(
    pay({ wageA: 180000, seTaxA: 3236.15, seNeA: 92350 }),
    13770 + 3236.15 + 0.009 * (272350 - 200000),
    1e-6,
    'payroll: FICA 13,770 + SE tax + Additional Medicare on wages plus net earnings',
  );
  near(pay({ wageA: 180000, seTaxA: 3236.15, seNeA: 92350 }), 17657.3, 1e-6, 'payroll total');
});

it('ACTC earned income and the state base', async () => {
  const { state: st, fed, STATE_RULES: R } = await setup();
  const zero3 = { single: 0, mfj: 0, hoh: 0 };
  const zzx = {
    name: 'Synthetic', status: 'migrated', sourceKind: 'none', source: null, asOf: null,
    indexing: { bracketsIndexed: false, standardDeductionIndexed: false, personalExemptionIndexed: false, creditAmountsIndexed: false, creditThresholdsIndexed: false, retirementExclusionIndexed: false },
    statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' }, tax: { kind: 'flat', rate: 0.1 }, additions: [],
    base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
    standardDeduction: { ...zero3 }, standardDeductionPhase: { kind: 'none' }, exemption: { ...zero3 }, exemptionPhaseOut: { kind: 'none' }, dependentExemption: 0,
    seniorExemption: { kind: 'none' }, federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false }, schedule: [],
    retirementExclusion: { kind: 'none' }, credits: [], federalTaxSubtraction: 'none', localTax: 'notModeled', notes: '',
  };
  st.inflation = 0;
  const profile = (o) => Object.assign({ year: 0, filing: 'mfj', singlePerson: false, otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 40, ageB: 40, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0, dependents: [], seOn: true }, o);
  st.stateTax = 'tx';
  const kid = [{ age: 5, student: false, qualifyingChild: true }];
  const actcSe = fed.taxFor(profile({ wageA: 0, otherA: 9293.5225, seNetA: 9293.5225, seEarnedA: 9293.5225, dependents: kid }), 0, 0);
  const actcNoEarned = fed.taxFor(profile({ wageA: 0, otherA: 9293.5225, seNetA: 9293.5225, seEarnedA: 0, dependents: kid }), 0, 0);
  let state;
  withRuleRow(R, 'zzx', zzx, () => {
    st.stateTax = 'zzx';
    state = fed.taxFor(profile({ filing: 'single', singlePerson: true, otherA: 50000, seNetA: 50000, wageA: 0 }), 0, 0);
  });
  st.stateTax = 'tx';
  const stateTx = fed.taxFor(profile({ filing: 'single', singlePerson: true, otherA: 50000, seNetA: 50000, wageA: 0 }), 0, 0);
  near(actcSe, -1019.028375, 1e-6, 'ACTC: 15% x (9,293.5225 - 2,500)');
  near(actcNoEarned, 0, 1e-6, 'no seEarned: no ACTC');
  near(state - stateTx, 5000, 1e-6, 'state base: 10% of 50,000 of self-employment net');
});

const BASE = {
  singlePerson: true, ageA: 45, retireAgeA: 60, incomeA: 100000, incomeKindA: 'self', inflation: 0, incomeGrowth: 0, stateTax: 'tx',
  k401PctA: 0, catchupPctA: 0, iraPctA: 0, profitSharingPctA: 0, megaBackdoor: false, healthPremiumA: 0,
  survivorEnabled: false, incomeSources: [],
};

// The engine as the old page ran it: patch the state, take the account trace, then the rows. Copies come back.
function engineRunner(state, e) {
  return (patch, mutate) => {
    Object.assign(state, { ...BASE, ...patch });
    if (mutate) mutate(state);
    const trace = e.accountTrace();
    const rows = e.simulate().rows;
    return structuredClone({ trace: trace.map((t) => ({ profile: t.profile, ficaTax: t.ficaTax })), rows: rows.map((x) => ({ wages: x.wages })) });
  };
}

it('engine: the self-employed partner', async () => {
  const { state, e } = await setup();
  const run = engineRunner(state, e);
  let r = run({});
  near(r.trace[0].ficaTax, 14129.55, 1e-6, 'engine year 0: SE tax, no W-2 wages');
  near(r.trace[0].profile.seNetA, 92935.225, 1e-6, 'seNetA');
  near(r.trace[0].profile.sePlanNetA, 92935.225, 1e-6, 'sePlanNetA');
  same(r.trace[0].profile.wageA, 0, 'no W-2 wages');
  same(r.rows[0].wages, 100000, 'cash: the profit');

  r = run({ retireAgeA: 45 });
  same(r.trace[0].ficaTax, 0, 'retired self-employed: no SE tax');
  same(r.trace[0].profile.seNetA || 0, 0, 'retired self-employed: no seNet');

  r = run({ singlePerson: false, incomeB: 0, ageB: 45, retireAgeB: 45, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 47 });
  near(r.trace[1].ficaTax, 14129.55, 1e-6, 'dies: year 1 SE tax');
  same(r.trace[2].ficaTax, 0, 'dies: year 2 nothing');

  // matchA 50 stays on the state from here on, as on the old page (self-employed pay takes no match).
  r = run({ matchA: 50, healthPremiumA: 200 });
  near(r.trace[0].ficaTax, 14129.55, 1e-6, 'stale W-2 fields: SE tax unchanged');
  same(r.rows[0].wages, 100000, 'stale W-2 fields: no premium');

  // legacy identical
  const R = { singlePerson: false, ageA: 52, ageB: 50, retireAgeA: 60, retireAgeB: 58, incomeA: 90000, incomeB: 60000 };
  const a = run({ ...R, incomeKindA: 'wages' });
  const b = run({ ...R, incomeKindA: 'wages' }, (st) => {
    delete st.incomeKindA;
    delete st.incomeKindB;
  });
  same(JSON.stringify(a.trace), JSON.stringify(b.trace), 'legacy identical: trace');
  same(JSON.stringify(a.rows), JSON.stringify(b.rows), 'legacy identical: rows');
});

// ---- Solo 401(k) (Task 4) ----
const L = { deferral: 24500, catchUp: 8000, annualAdditions: 72000, compensation: 360000, ira: 7500 };
const noPct = { deferral: 0, catchUp: 0, profit: 0, afterTax: 0, ira: 0 };
const stream = ({ owner = 0, pay = 0, ...o }) => ({ owner, pay, stream: { kind: 'self', contribute: true, deferralPct: 0, deferralType: 'traditional', matchPct: 0, profitSharingPct: 0, afterTaxPct: 0, personalPct: 0, ...o } });

it('Solo 401(k) contributions', async () => {
  const { hooks } = await setup();
  const solo = (q) =>
    hooks.soloPlanContributions({
      se: [0, 0], half: [0, 0], main: [0, 0], w2Comp: [0, 0], iraLeft: [L.ira, L.ira],
      mainPct: [noPct, noPct], list: [], rooms: { deferral: [L.deferral, L.deferral], catchUp: [0, 0], personal: [0, 0] },
      annualAdditions: L.annualAdditions, compensation: L.compensation, mainRoth: false, iraPretax: false, megaOn: false,
      ...q,
    });
  const halfOf = (se) => hooks.selfEmploymentTax(se, 0, 0).half;

  const h100 = halfOf(100000), C100 = 100000 - h100;
  near(C100, 92935.225, 1e-6, 'C for se 100,000');
  let r = solo({ se: [100000, 0], half: [h100, 0], main: [100000, 0], mainPct: [{ ...noPct, profit: 25 }, noPct] });
  near(r.out.trad[1], 18587.045, 1e-6, '25% profit sharing: C x 0.25 / 1.25');
  near(r.out.planCut[0], 18587.045, 1e-6, '25%: planCut');
  same(r.out.iraCut[0], 0, '25%: no IRA cut');
  near(r.out.employeeTrad, 18587.045, 1e-6, '25%: employeeTrad');
  r = solo({ se: [100000, 0], half: [h100, 0], main: [100000, 0], mainPct: [{ ...noPct, profit: 10 }, noPct] });
  near(r.out.trad[1], C100 / 11, 1e-6, '10%: C / 11 = 8,448.656818');
  r = solo({ se: [100000, 0], half: [h100, 0], main: [100000, 0], mainPct: [{ ...noPct, deferral: 100, profit: 25, afterTax: 100 }, noPct], megaOn: true });
  near(r.out.roth[1], 28912.955, 1e-6, 'deferral + profit + after-tax: after-tax money');
  near(r.out.trad[1], 43087.045, 1e-6, 'deferral 24,500 + profit 18,587.045');
  near(r.out.trad[1] + r.out.roth[1], 72000, 1e-6, 'all additions 72,000');
  const h1m = halfOf(1000000);
  r = solo({ se: [1000000, 0], half: [h1m, 0], main: [1000000, 0], mainPct: [{ ...noPct, profit: 10 }, noPct] });
  near(r.out.trad[1], 36000, 1e-6, 'compensation limit: 10% x 360,000');
  r = solo({ se: [1000000, 0], half: [h1m, 0], main: [1000000, 0], mainPct: [{ ...noPct, deferral: 100, profit: 25 }, noPct] });
  near(r.out.trad[1], 24500 + 47500, 1e-6, 'room binds: profit sharing limited to 72,000 - 24,500 = 47,500');
  r = solo({ se: [100000, 0], half: [h100, 0], main: [100000, 0], mainPct: [{ ...noPct, deferral: 100 }, noPct], rooms: { deferral: [12250, 0], catchUp: [0, 0], personal: [0, 0] } });
  near(r.out.trad[1], 12250, 1e-9, 'deferral room after a W-2 job used 12,250');
  const h300 = halfOf(300000);
  r = solo({ se: [300000, 0], half: [h300, 0], main: [300000, 0], mainPct: [{ ...noPct, deferral: 100, catchUp: 100 }, noPct], rooms: { deferral: [24500, 0], catchUp: [8000, 0], personal: [0, 0] }, mainRoth: false });
  near(r.out.trad[1], 32500, 1e-9, 'catch-up at 55: traditional, no forced Roth');
  same(r.out.roth[1], 0, 'catch-up: nothing forced to Roth');
  const h5 = halfOf(5000);
  r = solo({ se: [5000, 0], half: [h5, 0], main: [5000, 0], mainPct: [{ ...noPct, ira: 100 }, noPct], iraPretax: false });
  near(r.out.roth[0], 4646.76125, 1e-6, 'Roth IRA on self-employment pay (compensation C)');
  const h20 = halfOf(20000);
  r = solo({ se: [20000, 0], half: [h20, 0], main: [20000, 0], mainPct: [{ ...noPct, ira: 100 }, noPct], iraPretax: true });
  near(r.out.trad[0], 7500, 1e-9, 'traditional IRA 7,500');
  near(r.out.iraCut[0], 7500, 1e-9, 'IRA cut');
  same(r.out.planCut[0], 0, 'IRA is not plan money');
  r = solo({
    se: [100000, 0], half: [h100, 0], main: [60000, 0], mainPct: [{ ...noPct, profit: 25 }, noPct],
    list: [stream({ owner: 0, pay: 40000, profitSharingPct: 10 })],
  });
  near(r.out.trad[1], 0.6 * C100 * 0.2 + (0.4 * C100) / 11, 1e-6, 'two sources: P_main + P_stream');
  r = solo({ se: [0, 100000], half: [0, h100], main: [0, 0], list: [stream({ owner: 1, pay: 100000, profitSharingPct: 10 })] });
  near(r.out.trad[3], C100 / 11, 1e-6, 'owner B: slot 3');
  near(r.out.planCut[1], C100 / 11, 1e-6, 'owner B: planCut[1]');
  same(r.out.trad[1], 0, 'owner B: nothing in A slot');
  r = solo({ se: [100000, 0], half: [h100, 0], main: [0, 0], list: [stream({ owner: 0, pay: 100000, matchPct: 50 })] });
  same(r.out.trad[1], 0, 'self stream match ignored');
});

it('engine: the Solo money lands and leaves cash', async () => {
  const { state, fed, e } = await setup();
  const SOLO = { k401PctA: 100, profitSharingPctA: 25, returnRate: 0, bondReturn: 0, hysaRate: 0, bondYears: 0, taxable: 2000000, spending: 50000 };
  // What the old page carried into this section from the earlier engine calls (BASE re-sets the rest): the stale match, partner B's
  // fields and the survivor settings of the earlier blocks, and the deleted incomeKindB. iraType is set inside this section.
  Object.assign(state, { matchA: 50, incomeB: 60000, ageB: 50, retireAgeB: 58, survivorPartner: 'A', survivorDeathAge: 47 });
  delete state.incomeKindB;
  // A run's year-0 account trace and first row, copied.
  const eng2 = (patch) => {
    Object.assign(state, { ...BASE, ...SOLO, ...patch });
    const trace = e.accountTrace();
    const rows = e.simulate().rows;
    return structuredClone({ trad: trace[0].trad, roth: trace[0].roth, profile: trace[0].profile, tradStart: state.trad401kA, rows0: rows[0] });
  };
  const s1 = eng2({});
  near(s1.trad[1] - s1.tradStart, 24500 + 18587.045, 1e-6, 'engine: Solo money in the traditional 401(k)');
  near(s1.profile.seNetA, 92935.225 - 24500 - 18587.045, 1e-6, 'engine: seNetA net of the plan money');
  near(s1.profile.sePlanNetA, 92935.225 - 24500 - 18587.045, 1e-6, 'engine: sePlanNetA net of the plan money');
  const s2 = eng2({ iraPctA: 100, iraType: 'traditional' });
  near(s2.profile.sePlanNetA, s1.profile.sePlanNetA, 1e-6, 'IRA: sePlanNetA unchanged');
  near(s1.profile.seNetA - s2.profile.seNetA, 7500, 1e-6, 'IRA: seNetA 7,500 lower');
  const s0 = eng2({ k401PctA: 0, profitSharingPctA: 0 });
  check(s0.rows0.taxable !== undefined || s0.rows0.cash !== undefined, 'row has balances');
  const bal = (x) => (x.rows0.taxable || 0) + (x.rows0.cash || 0);
  // Hand difference: the Solo money (24,500 + 18,587.045) leaves cash and taxable, less the tax it saves. The saving is the
  // engine's own year-0 tax difference (row.tax: it includes the tax on the year's taxable sales, which taxFor on the bare
  // profile does not), and taxFor on each run's year-0 profile must show a saving of the same sign.
  const saved = s0.rows0.tax - s1.rows0.tax;
  const want = 24500 + 18587.045 - saved;
  check(saved > 1000, `Solo money saves tax: ${saved}`);
  near(bal(s0) - bal(s1), want, 1e-3, 'Solo money leaves cash (hand difference; 1e-3: the taxable sale is solved by bisection)');
  const taxOf = (x) => fed.taxFor({ ...x.profile, seOn: true }, 0, 0);
  check(taxOf(s0) > taxOf(s1), 'taxFor on the profiles also shows the saving');
  const s3 = eng2({ matchA: 50 });
  near(s3.trad[1] - s3.tradStart, 24500 + 18587.045, 1e-6, 'stale W-2 fields: no match');
});

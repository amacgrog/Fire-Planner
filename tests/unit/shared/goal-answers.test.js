// The goal answers (src/shared/core/analysis/goal-answers.js) and every sentence of src/shared/core/format/answer-text.js:
// the retirement-age answer on the draw household and on the default household (both planners), its edges, the housing and
// survivor variants, the room change, the legacy figure and the text functions on literal inputs.
import { it, expect, inject, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const c = makeCounter();
const EXPECTED = 113;

const GA = 'shared/core/analysis/goal-answers.js';
const AT = 'shared/core/format/answer-text.js';
const MOVES = 'shared/core/analysis/moves.js';
const PV = 'shared/core/analysis/projection-verdict.js';
const ROOM = 'shared/core/analysis/spending-room.js';
const isUS = inject('country') === 'us';
const usIt = isUS ? it : it.skip;
const SHORT = isUS ? 78000 : 76000;

const DRAW = { singlePerson: true, ageA: 65, retireAgeA: 65, lifeExpectancyA: 74, incomeA: 0, inflation: 0, returnRate: 0,
  bondReturn: 0, hysaRate: 0, dividendYield: 0, healthcare: 0, medicareYearly: 0, ltcEnabled: false, ssMonthlyA: 0,
  tenure: 'rent', rent: 0, taxable: 0, cash: 0, emergencyCash: 0, bondYears: 0, trad401kA: 0,
  rothIraA: 400000, rothIraBasisA: 400000 };

async function setup(patch) {
  const w = await world();
  const state = await w.setState(patch);
  if (isUS) (await w.load('us/core/cliff-plan/planning.js')).refreshCliffPlan();
  const ctxFor = (await w.load('shared/ui/results/state-context.js')).stateContextFor();
  return { w, state, ctxFor };
}

async function w0() {
  return (await world()).load(AT);
}

async function answer(w, state, ctxFor) {
  const { drainSteps } = await w.load(ROOM);
  const { projectionVerdict } = await w.load(PV);
  const { retireAnswerSteps } = await w.load(GA);
  const v = projectionVerdict(state, ctxFor);
  return { v, r: drainSteps(retireAnswerSteps(state, ctxFor, v)) };
}

// The DRAW household is 65 and already retired (retireAgeA === ageA): no partner is still working, so nothing is shifted and
// the range is empty (before the 2026-11-15 fix it scanned shifts 0-5, putting the retiree back to work).
usIt('retire answer on DRAW', async () => {
  const { w, state, ctxFor } = await setup({ ...DRAW, spending: 30000 });
  const { r } = await answer(w, state, ctxFor);
  c.expect(r).toStrictEqual({ lastsFrom: null, comfortableFrom: null, perYear: null, lo: 0, hi: -1, empty: true });
});

it('retire answer agrees with the word check', async () => {
  for (const patch of [{}, { spending: SHORT }]) {
    const { w, state, ctxFor } = await setup(patch);
    const { projectionWord } = await w.load(PV);
    const { retireShift } = await w.load(MOVES);
    const { r } = await answer(w, state, ctxFor);
    const word = (k) => projectionWord({ ...state, ...retireShift(state, k) }, ctxFor).word;
    if (r.lastsFrom !== null && r.comfortableFrom !== null) c.expect(r.lastsFrom <= r.comfortableFrom).toBe(true);
    if (r.lastsFrom !== null) {
      c.expect(word(r.lastsFrom)).not.toBe('short');
      if (r.lastsFrom > r.lo) c.expect(word(r.lastsFrom - 1)).toBe('short');
    } else c.expect(word(r.hi)).toBe('short');
    if (r.comfortableFrom !== null) {
      c.expect(word(r.comfortableFrom)).toBe('comfortable');
      if (r.comfortableFrom > r.lo) c.expect(word(r.comfortableFrom - 1)).not.toBe('comfortable');
    } else c.expect(word(r.hi)).not.toBe('comfortable');
    c.expect(r.perYear === null || r.perYear % 100 === 0).toBe(true);
  }
});

it('retire answer edges', async () => {
  const run = async (patch) => {
    const { w, state, ctxFor } = await setup(patch);
    const { retireShift, retireShiftRange } = await w.load(MOVES);
    const { agesText } = await w.load(AT);
    return { state, retireShift, retireShiftRange, agesText, ...(await answer(w, state, ctxFor)) };
  };
  // a single person: retireShift leaves B alone
  const single = await run({ singlePerson: true, ageB: 60, retireAgeB: 70 });
  c.expect(single.retireShift(single.state, 3)).toStrictEqual({ retireAgeA: 58, retireAgeB: 70 });
  c.expect(single.retireShiftRange(single.state)).toStrictEqual({ lo: single.r.lo, hi: single.r.hi });
  // a couple with Partner B already retired: only A is shifted, so A's bounds alone set the range (lo -7, not 0 as before
  // the 2026-11-15 fix) and the label names only A
  const retired = await run({ ageB: 43, retireAgeB: 43 });
  c.expect(retired.r.lo).toBe(-7);
  c.expect(retired.retireShift(retired.state, 3)).toStrictEqual({ retireAgeA: 58, retireAgeB: 43 });
  c.expect(retired.retireShiftRange(retired.state)).toStrictEqual({ lo: retired.r.lo, hi: retired.r.hi });
  c.expect(retired.agesText(retired.state, 3)).toBe('at A 58');
  // at the age-70 cap: nothing later
  const late = await run({ retireAgeA: 70 });
  c.expect(late.r.hi).toBe(0);
  c.expect(late.r.lastsFrom === null || (late.r.lastsFrom >= late.r.lo && late.r.lastsFrom <= 0)).toBe(true);
});

it('retire answer with no range', async () => {
  const { retireAnswerText } = await w0();
  const RETIRED = 'In the projection: you have already retired, so no retirement age is tested.';
  const PAST_CAP = 'In the projection: retirement ages past 70 are not tested here.';
  for (const [patch, text] of [
    [{ singlePerson: true, ageA: 72, retireAgeA: 72, lifeExpectancyA: 95 }, RETIRED],
    [{ ageA: 72, retireAgeA: 72, ageB: 72, retireAgeB: 72, lifeExpectancyA: 95, lifeExpectancyB: 95 }, RETIRED],
    // still working past the age-70 cap: no shift in range
    [{ singlePerson: true, ageA: 72, retireAgeA: 75, lifeExpectancyA: 95 }, PAST_CAP],
  ]) {
    const { w, state, ctxFor } = await setup(patch);
    const { r } = await answer(w, state, ctxFor);
    c.expect(r.empty).toBe(true);
    c.expect(r.lo > r.hi).toBe(true);
    c.expect(r.lastsFrom).toBe(null);
    c.expect(r.comfortableFrom).toBe(null);
    c.expect(retireAnswerText(state, r)).toBe(text);
  }
  const { w, state, ctxFor } = await setup({});
  c.expect((await answer(w, state, ctxFor)).r.empty).toBe(false);
});

it('house variants', async () => {
  const w = await world();
  const { houseVariants } = await w.load(GA);
  c.expect(houseVariants({ tenure: 'own', mortgage: 300000, extraPrincipal: 0 })).toStrictEqual([
    { key: 'rent', patch: { tenure: 'rent' } },
    { key: 'payoff', patch: { extraPrincipal: 500 } },
  ]);
  c.expect(houseVariants({ tenure: 'own', mortgage: 300000, extraPrincipal: 300 })).toStrictEqual([
    { key: 'rent', patch: { tenure: 'rent' } },
    { key: 'payoff', patch: { extraPrincipal: 0 } },
  ]);
  c.expect(houseVariants({ tenure: 'rent', mortgage: 300000, extraPrincipal: 0 })).toStrictEqual([{ key: 'own', patch: { tenure: 'own' } }]);
  c.expect(houseVariants({ tenure: 'rentThenBuy', mortgage: 300000, extraPrincipal: 0 })).toStrictEqual([{ key: 'rent', patch: { tenure: 'rent' } }]);
  c.expect(houseVariants({ tenure: 'own', mortgage: 0, extraPrincipal: 0 })).toStrictEqual([{ key: 'rent', patch: { tenure: 'rent' } }]);
});

it('survivor variants', async () => {
  const w = await world();
  const { survivorVariants } = await w.load(GA);
  c.expect(survivorVariants({ singlePerson: false })).toStrictEqual([
    { partner: 'A', patch: { survivorEnabled: true, survivorPartner: 'A' } },
    { partner: 'B', patch: { survivorEnabled: true, survivorPartner: 'B' } },
  ]);
  c.expect(survivorVariants({ singlePerson: true })).toStrictEqual([]);
});

usIt('room change', async () => {
  const { w, state, ctxFor } = await setup({ ...DRAW, spending: 30000 });
  const { drainSteps } = await w.load(ROOM);
  const { roomChangeSteps } = await w.load(GA);
  const gen = roomChangeSteps(state, { ...state, spending: 28000 }, ctxFor, 10000);
  c.expect(gen.next()).toStrictEqual({ value: 'run', done: false });
  // 28,000 a year leaves 12,000 of room on 400,000 over 10 years; the base room is 10,000
  c.expect(drainSteps(roomChangeSteps(state, { ...state, spending: 28000 }, ctxFor, 10000))).toBe(2000);
});

it('legacy value and phrase', async () => {
  const { w, state, ctxFor } = await setup(isUS ? { ...DRAW, spending: 30000 } : {});
  const seam = await w.load(isUS ? 'us/core/seam-legacyValue.js' : 'canada/core/seam-legacyValue.js');
  const { simulateWith } = await w.load('shared/core/projection/runs.js');
  const ctx = ctxFor(state);
  const sim = simulateWith(ctx);
  const last = sim.rows[sim.rows.length - 1];
  const v = seam.legacyValue(ctx, sim);
  c.expect(Number.isFinite(v)).toBe(true);
  if (isUS) {
    // no inflation: today's dollars are the nominal total
    c.expect(v).toBe(last.total);
    c.expect(seam.LEGACY_PHRASE('$1M')).toBe("the plan ends with about $1M in today's dollars, the home included");
  } else {
    c.expect(v <= last.total / (last.cumFactor ?? 1)).toBe(true);
    c.expect(seam.LEGACY_PHRASE('$1M')).toBe(
      "the after-tax estate is about $1M in today's dollars, after tax on the RRSP/RRIF and gains at the last death, and probate",
    );
  }
});

it('ageRanges and agesText', async () => {
  const w = await world();
  const { ageRanges, agesText } = await w.load(AT);
  c.expect(ageRanges([59, 61, 62, 63])).toBe('59, 61-63');
  c.expect(agesText({ singlePerson: true, ageA: 50, retireAgeA: 60, ageB: 50, retireAgeB: 50 }, -2)).toBe('at 58');
  c.expect(agesText({ singlePerson: false, ageA: 50, retireAgeA: 60, ageB: 45, retireAgeB: 50 }, 2)).toBe('at A 62 / B 52');
  // only the partners still working are named
  c.expect(agesText({ singlePerson: false, ageA: 50, retireAgeA: 60, ageB: 50, retireAgeB: 50 }, 2)).toBe('at A 62');
  c.expect(agesText({ singlePerson: false, ageA: 60, retireAgeA: 60, ageB: 45, retireAgeB: 50 }, 2)).toBe('at B 52');
});

it('retireAnswerText', async () => {
  const w = await world();
  const { retireAnswerText } = await w.load(AT);
  const couple = { singlePerson: false, ageA: 48, retireAgeA: 56, ageB: 48, retireAgeB: 56 };
  const single = { singlePerson: true, ageA: 50, retireAgeA: 65, ageB: 50, retireAgeB: 65 };
  c.expect(retireAnswerText(couple, { lastsFrom: 0, comfortableFrom: 2, perYear: 4300, lo: -3, hi: 10 })).toBe(
    'In the projection: Comfortable from A 58 / B 58; Tight from A 56 / B 56; runs out if you retire before A 56 / B 56. Each year earlier costs about $4K a year of room.',
  );
  c.expect(retireAnswerText(single, { lastsFrom: null, comfortableFrom: null, perYear: null, lo: 0, hi: 5 })).toBe(
    'In the projection: runs out at every age up to 70.',
  );
  c.expect(retireAnswerText(couple, { lastsFrom: -2, comfortableFrom: -2, perYear: 300, lo: -2, hi: 9 })).toBe(
    'In the projection: Comfortable even at A 54 / B 54.',
  );
  c.expect(retireAnswerText({ ...single, retireAgeA: 60 }, { lastsFrom: 1, comfortableFrom: null, perYear: null, lo: 0, hi: 9 })).toBe(
    'In the projection: Tight from 61; runs out if you retire before 61.',
  );
  c.expect(retireAnswerText(single, { lastsFrom: 0, comfortableFrom: 3, perYear: 6200, lo: 0, hi: 5 })).toBe(
    'In the projection: Comfortable from 68; Tight from 65. Each year earlier costs about $6K a year of room.',
  );
});

it('spendAnswerText', async () => {
  const w = await world();
  const { spendAnswerText } = await w.load(AT);
  const base = { spending: 60000, spendingTiers: [] };
  const v = (o) => ({ guardrails: false, unfixable: false, atCap: false, cutPct: 0, shown: 0, ...o });
  c.expect(spendAnswerText(base, v({ shown: 9000 }), 0)).toBe('About $69K a year, $9K more than today.');
  c.expect(spendAnswerText(base, v({ shown: 0 }), 0)).toBe('About $60K a year: what you spend now, with nothing to spare.');
  c.expect(spendAnswerText(base, v({ shown: -6000 }), 0)).toBe('About $54K a year, $6K less than today.');
  c.expect(spendAnswerText(base, v({ shown: 100000, atCap: true }), 0)).toBe('More than $160K a year: the search stops at $100K more.');
  c.expect(spendAnswerText(base, v({ shown: -60000, unfixable: true }), 0)).toBe(
    "Even spending nothing runs out: cutting spending alone can't fix this.",
  );
  const tiers = { ...base, spendingTiers: [{ amount: 50000 }] };
  c.expect(spendAnswerText(tiers, v({ shown: 3000 }), 0)).toBe('About $3K a year more than you plan, in every retired year.');
  c.expect(spendAnswerText(tiers, v({ shown: -3000 }), 0)).toBe('About $3K a year less than you plan, in every retired year.');
});

it('spend answer under guardrails', async () => {
  const w = await world();
  const { spendAnswerText } = await w.load(AT);
  const base = { spending: 60000, spendingTiers: [] };
  c.expect(spendAnswerText(base, { guardrails: true, cutPct: 20, shown: 0, atCap: false, unfixable: false }, 9000)).toBe(
    "Without guardrails, about $69K a year ($9K more than today). With them on, the worst year's spending is cut by up to 20%.",
  );
  c.expect(spendAnswerText(base, { guardrails: true, cutPct: 35, shown: 0, atCap: false, unfixable: false }, -6000)).toBe(
    "Without guardrails, about $54K a year ($6K less than today). With them on, the worst year's spending is cut by up to 35%.",
  );
});

it('houseAnswerText', async () => {
  const w = await world();
  const { houseAnswerText } = await w.load(AT);
  const own = { tenure: 'own', extraPrincipal: 0, buyAge: 50 };
  c.expect(houseAnswerText(own, [{ key: 'rent', delta: 3000 }])).toBe('Renting would leave about $3K a year more room than owning.');
  c.expect(houseAnswerText(own, [{ key: 'rent', delta: -3200 }])).toBe('Owning leaves about $3K a year more room than renting.');
  c.expect(houseAnswerText(own, [{ key: 'rent', delta: 400 }])).toBe('Owning or renting makes little difference (under $500 a year).');
  c.expect(houseAnswerText(own, [{ key: 'rent', delta: -400 }])).toBe('Owning or renting makes little difference (under $500 a year).');
  const rent = { ...own, tenure: 'rent' };
  c.expect(houseAnswerText(rent, [{ key: 'own', delta: 2000 }])).toBe(
    'Buying the home in your housing settings would leave about $2K a year more room than renting.',
  );
  c.expect(houseAnswerText(rent, [{ key: 'own', delta: -2000 }])).toBe('Renting leaves about $2K a year more room than buying.');
  c.expect(houseAnswerText(rent, [{ key: 'own', delta: 100 }])).toBe('Owning or renting makes little difference (under $500 a year).');
  const rtb = { ...own, tenure: 'rentThenBuy' };
  c.expect(houseAnswerText(rtb, [{ key: 'rent', delta: 6000 }])).toBe(
    'Renting throughout would leave about $6K a year more room than buying at 50.',
  );
  c.expect(houseAnswerText(rtb, [{ key: 'rent', delta: -6000 }])).toBe(
    'Buying at 50 leaves about $6K a year more room than renting throughout.',
  );
  c.expect(houseAnswerText(rtb, [{ key: 'rent', delta: 0 }])).toBe('Buying at 50 or renting throughout makes little difference (under $500 a year).');
  c.expect(houseAnswerText(own, [{ key: 'payoff', delta: 1500 }])).toBe(
    'Paying an extra $500 a month on the mortgage would add about $1.5K a year of room.',
  );
  c.expect(houseAnswerText(own, [{ key: 'payoff', delta: -1500 }])).toBe(
    'Paying an extra $500 a month on the mortgage would cost about $1.5K a year of room.',
  );
  const extra = { ...own, extraPrincipal: 300 };
  c.expect(houseAnswerText(extra, [{ key: 'payoff', delta: 1500 }])).toBe(
    'Your extra $300 a month on the mortgage costs about $1.5K a year of room against investing it.',
  );
  c.expect(houseAnswerText(extra, [{ key: 'payoff', delta: -1500 }])).toBe(
    'Your extra $300 a month on the mortgage adds about $1.5K a year of room against investing it.',
  );
  c.expect(houseAnswerText(own, [{ key: 'payoff', delta: 200 }])).toBe('An extra mortgage payment makes little difference (under $500 a year).');
  // several changes join with a space
  c.expect(houseAnswerText(own, [{ key: 'rent', delta: 3000 }, { key: 'payoff', delta: 1500 }])).toBe(
    'Renting would leave about $3K a year more room than owning. Paying an extra $500 a month on the mortgage would add about $1.5K a year of room.',
  );
});

it('survivorAnswerText', async () => {
  const w = await world();
  const { survivorAnswerText } = await w.load(AT);
  const base = { survivorDeathAge: 85, ageA: 48, ageB: 45 };
  const room = (word, shown) => ({ word, shown, guardrails: false, cutPct: 0, depletedAge: null });
  c.expect(
    survivorAnswerText(base, [
      { partner: 'A', verdict: room('comfortable', 8000) },
      { partner: 'B', verdict: { word: 'short', shown: -4000, guardrails: false, cutPct: 0, depletedAge: 83 } },
    ]),
  ).toBe("If Partner A dies at 85: Comfortable, about $8K a year of room. If Partner B dies at 85: Short, the money runs out at A's age 83.");
  // A dies: the run-out age is the survivor B's, three years younger than A
  c.expect(survivorAnswerText(base, [{ partner: 'A', verdict: { word: 'short', shown: -4000, guardrails: false, cutPct: 0, depletedAge: 83 } }])).toBe(
    "If Partner A dies at 85: Short, the money runs out at B's age 80.",
  );
  c.expect(survivorAnswerText(base, [{ partner: 'A', verdict: room('tight', 2000) }])).toBe(
    'If Partner A dies at 85: Tight, about $2K a year of room.',
  );
  c.expect(
    survivorAnswerText(base, [{ partner: 'B', verdict: { word: 'tight', shown: 0, guardrails: true, cutPct: 20, depletedAge: null } }]),
  ).toBe('If Partner B dies at 85: Tight, guardrails cut spending by up to 20%.');
});

it('ageScale', async () => {
  const w = await world();
  const { ageScale, endAgeText, scaledAgeText } = await w.load(AT);
  const couple = { singlePerson: false, ageA: 48, ageB: 43, lifeExpectancyA: 100, lifeExpectancyB: 100 };
  // B is younger with the same life expectancy, so B ends the run
  c.expect(ageScale(couple)).toStrictEqual({ who: "B's ", end: 100, shift: -5 });
  c.expect(scaledAgeText(ageScale(couple), 103)).toBe("B's age 98");
  // A ends the run when A's years left are more (or tie)
  c.expect(ageScale({ ...couple, lifeExpectancyB: 90 })).toStrictEqual({ who: "A's ", end: 100, shift: 0 });
  c.expect(ageScale({ ...couple, lifeExpectancyB: 95 })).toStrictEqual({ who: "A's ", end: 100, shift: 0 });
  // alone: B's fields are ignored
  const alone = ageScale({ ...couple, singlePerson: true, lifeExpectancyB: 120 });
  c.expect(alone).toStrictEqual({ who: '', end: 100, shift: 0 });
  c.expect(endAgeText(alone)).toBe('age 100');
});

it('legacyAnswerText', async () => {
  const w = await world();
  const { legacyAnswerText } = await w.load(AT);
  const phrase = (x) => `it ends with ${x}`;
  const alone = { who: '', end: 95, shift: 0 };
  c.expect(legacyAnswerText(phrase, 1234567, alone, null)).toBe('At age 95, it ends with $1.2M.');
  c.expect(legacyAnswerText(phrase, 40000, alone, 90)).toBe('At age 95, it ends with $40K. The investments run out at age 90.');
  // B ends the run, five years younger: A's 103 is B's 98
  c.expect(legacyAnswerText(phrase, 40000, { who: "B's ", end: 100, shift: -5 }, 103)).toBe(
    "At B's age 100, it ends with $40K. The investments run out at B's age 98.",
  );
});

it('moveText', async () => {
  const w = await world();
  const { ageScale, debtText, moveText, movesHeadText, NO_MOVES_TEXT } = await w.load(AT);
  const base = { singlePerson: false, ageA: 48, retireAgeA: 56, ageB: 48, retireAgeB: 56, spending: 60000, lifeExpectancyA: 95, lifeExpectancyB: 95 };
  // a tie: the ages are on A's scale
  const sc = ageScale(base);
  const short = { word: 'short', depletedAge: 83, guardrails: false, cutPct: 0 };
  const tight = { word: 'tight', depletedAge: null, guardrails: false, cutPct: 0 };
  const guarded = { word: 'tight', depletedAge: null, guardrails: true, cutPct: 40 };
  const verdict = (o) => ({ word: 'tight', guardrails: false, cutPct: 0, ...o });
  const mv = (key, patch, v, fixes, gain, label = key) => ({ key, label, patch, verdict: v, fixes, gain });
  const retire2 = mv('retire', { retireAgeA: 58, retireAgeB: 58 }, verdict({ word: 'tight' }), true, 0);
  c.expect(moveText(retire2, base, sc, short)).toStrictEqual({
    what: 'Retire 2 years later (at A 58 / B 58)',
    result: "fixes it: lasts through A's age 95",
  });
  c.expect(moveText(mv('retire', { retireAgeA: 57, retireAgeB: 57 }, verdict({ word: 'comfortable' }), true, 0), base, sc, tight)).toStrictEqual({
    what: 'Retire 1 year later (at A 57 / B 57)',
    result: 'makes it Comfortable in the projection',
  });
  // only one partner still working: the shift is that partner's and the label names only them
  c.expect(moveText(mv('retire', { retireAgeA: 59, retireAgeB: 43 }, verdict({}), true, 0), { ...base, ageB: 43, retireAgeB: 43 }, sc, short).what).toBe(
    'Retire 3 years later (at A 59)',
  );
  c.expect(moveText(mv('retire', { retireAgeA: 56, retireAgeB: 53 }, verdict({}), true, 0), { ...base, ageA: 56, ageB: 40, retireAgeB: 50 }, sc, short).what).toBe(
    'Retire 3 years later (at B 53)',
  );
  const single = { ...base, singlePerson: true, retireAgeA: 60 };
  c.expect(moveText(mv('retire', { retireAgeA: 65, retireAgeB: 56 }, verdict({}), false, 700), single, sc, short)).toStrictEqual({
    what: 'Retire 5 years later (at 65)',
    result: '+$500 a year of room',
  });
  c.expect(moveText(mv('spend', { spending: 54000 }, verdict({ word: 'tight' }), true, -6000), base, sc, short)).toStrictEqual({
    what: 'Spend about $6K less a year',
    result: "fixes it: lasts through A's age 95",
  });
  c.expect(moveText(mv('guardrails', { guardrailsEnabled: true }, verdict({ guardrails: true, cutPct: 25 }), true, 0, 'Turn on guardrails'), base, sc, short)).toStrictEqual({
    what: 'Turn on guardrails',
    result: "lasts through A's age 95, with spending cut by up to 25% in bad years",
  });
  c.expect(moveText(mv('split', { pensionSplitEnabled: true }, verdict({}), false, 2300, 'Turn on pension income splitting'), base, sc, tight)).toStrictEqual({
    what: 'Turn on pension income splitting',
    result: '+$2K a year of room',
  });
  c.expect(moveText(mv('x', {}, verdict({ guardrails: true, cutPct: 28 }), false, 12, 'Lever'), base, sc, guarded)).toStrictEqual({
    what: 'Lever',
    result: 'worst-year cut 40% → 28%',
  });
  c.expect(movesHeadText(short, sc)).toBe("Runs out at A's age 83 in the projection. Biggest fixes:");
  // B five years younger: A's 83 is B's 78
  c.expect(movesHeadText(short, ageScale({ ...base, ageB: 43 }))).toBe("Runs out at B's age 78 in the projection. Biggest fixes:");
  c.expect(movesHeadText(tight, sc)).toBe('Tight in the projection. What helps most:');
  c.expect(movesHeadText({ ...tight, debtLeft: 2400 }, sc)).toBe("Tight: $2.4K (today's dollars) of debt is still owed at A's age 95. Raise its payment to clear it inside the plan.");
  c.expect([debtText(593.6), debtText(999.4), debtText(2400)]).toStrictEqual(['$594', '$999', '$2.4K']);
  c.expect(movesHeadText({ ...short, debtLeft: 2400 }, sc)).toBe("Runs out at A's age 83 in the projection. Biggest fixes:");
  c.expect(NO_MOVES_TEXT).toBe('None of the changes tested here helps on its own.');
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(EXPECTED);
});

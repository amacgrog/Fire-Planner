// "Convert nothing" in the whole-run sizing pass (Batch 5 follow-ups S2, spec 4.2): a `choose` run with sizing records its `none`
// winners (cliffConvNone, Partner A's ages ascending, not enumerable); computeCliffPlan's pass walks them after the shortlist with
// the budget left, each a trial adding 'none' at that age, accepted only by greedyAccepts (report.sized's noneProposed and
// noneTried). The household is the snapshot's `std G two returns 62 aca smooth` (two single returns at 62, 401(k) 750k + 750k,
// taxable 300k, spending 60k, ACA, smooth, converting at the 22% fill, the guard on), where Task 5's measurement found `none`
// winners at 62-64 while the kept plan converted there. Engine outputs are compared between runs in one process.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { usPlan } from '../helpers/us-plan.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { scenarios } = require('../../snapshot_scenarios.js');
const { legacyToAccounts } = require('../../legacy_balances.js');

const NAME = 'std G two returns 62 aca smooth';

// A fresh world with the household set. `plan(test)` is computeCliffPlan (the deferred pass: search on) on a context built after
// the state (`test`: fields over the context's test switches, through newRunContext); `choose(p, trace)` and `apply(p)` are
// single runs in that plan mode (usPlan's runPlanMode).
async function setup() {
  const sc = scenarios(true).find((s) => s.name === NAME);
  const w = await world();
  await w.setState(legacyToAccounts(sc.patch, null));
  const { computeCliffPlan } = await w.load('us/core/projection/run-projection.js');
  const { newRunContext } = await w.load('shared/core/projection/run-context.js');
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const P = await usPlan(w);
  const plan = async (test = null) => {
    const ctx = await w.ctx();
    return computeCliffPlan(test ? newRunContext({ ...ctx, test: { ...ctx.test, ...test } }) : ctx);
  };
  const choose = (p, trace = false) => P.runPlanMode({ planMode: 'choose', plan: p, planTrace: trace });
  const apply = (p) => P.runPlanMode({ planMode: 'apply', plan: p });
  return { w, plan, choose, apply, makePlan, ageA: sc.patch.ageA };
}

it('cliffConvNone lists the ages whose winner is none', async () => {
  const { choose, apply, makePlan, plan, ageA } = await setup();
  const auto = await plan();
  // the pass's proposal run: the kept bracket, no levers (the kept plan holds no orders or splits), conv: {}
  const p = makePlan({ bracket: auto.plan.bracket, bracketFrom: auto.plan.bracketFrom, conv: {} });
  const r = choose(p, true),
    none = r.sim.cliffConvNone;
  expect(Object.keys(r.sim).includes('cliffConvNone')).toBe(false);
  const expected = [];
  for (const t of r.trace) if (t.conv && t.conv.winner === 'none') expected.push(ageA + t.year);
  expect(expected.length > 0).toBe(true);
  expect(none).toStrictEqual(expected);
  // ascending, and every one also a recorded intent (choose records each winner that is not the bracket)
  for (let i = 1; i < none.length; i++) expect(none[i] > none[i - 1]).toBe(true);
  for (const a of none) expect(r.sim.cliffConvIntents[a]).toBe('none');
  // a choose run with conv null, and an apply run, record none
  expect(choose({ ...p, conv: null }).sim.cliffConvNone).toBe(undefined);
  expect(apply(auto.plan).sim.cliffConvNone).toBe(undefined);
});

it('a kept none target converts 0 at its age', async () => {
  const { plan, apply } = await setup();
  const auto = await plan();
  const s = auto.report.sized;
  expect(s.kept).toBe(true);
  expect(s.convIntents.none > 0).toBe(true);
  expect(s.noneTried > 0).toBe(true);
  expect(s.noneTried <= s.noneProposed).toBe(true);
  const noneAt = Object.keys(auto.plan.conv).filter((a) => auto.plan.conv[a] === 'none');
  expect(noneAt.length).toBe(s.convIntents.none);
  const rows = apply(auto.plan).rows;
  for (const a of noneAt) {
    const row = rows.find((x) => x.age === Number(a));
    expect(row.conversionAmount).toBe(0);
  }
  // not vacuous: the same ages convert when the plan holds no target there
  const rest = Object.fromEntries(Object.entries(auto.plan.conv).filter(([, t]) => t !== 'none'));
  const restRows = apply({ ...auto.plan, conv: rest }).rows;
  for (const a of noneAt) expect(restRows.find((x) => x.age === Number(a)).conversionAmount > 0).toBe(true);
});

it('a full budget tries no none age', async () => {
  const { plan, choose, makePlan } = await setup();
  const full = await plan();
  const n = full.report.sized.proposed;
  const capped = await plan({ convRunBudget: n });
  const s = capped.report.sized;
  expect(s.proposed).toBe(n);
  expect(s.tried).toBe(n);
  expect(s.noneTried).toBe(0);
  // the budget left the none ages untried
  expect(s.budgetHit).toBe(true);
  expect(capped.plan.conv === null || Object.values(capped.plan.conv).every((t) => t !== 'none')).toBe(true);
  const sv = choose(makePlan({ bracket: capped.plan.bracket, bracketFrom: capped.plan.bracketFrom, conv: {} })).sim;
  expect(s.noneProposed).toBe(sv.cliffConvNone.length);
  expect(s.noneProposed > 0).toBe(true);
});

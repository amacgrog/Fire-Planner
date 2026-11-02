// Task 2g: the stay-under superset candidate (computeCliffPlan's stage 0). scan-grid's single person at 66 (401(k) 1500k, taxable
// 300k, spending 130k, smooth withdrawals, conversions on at the 22% fill): at the 24% bracket `choose` keeps the natural year at
// 66, 68 and 70 (each year's IRMAA tier 2 stay-under met its line and cut premium plus IRMAA, but lost the year's score), and
// records 7 intents; the run holding every met stay-under (10 intents, 66-75) lasts to 86 with the first home draw at 83, against
// 85 / 82 for the plan without it. Hand figures: the ages, read off the traced runs (task-2g-trace-report.md).
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { scanHouseholds } from '../helpers/scan-grid.mjs';
import { usPlan } from '../helpers/us-plan.js';

const householdOf = (el) => scanHouseholds({ mode: 'smooth', conversions: true }).find((x) => x.name.startsWith('single person; age 66; 401(k) 1500k A; taxable 300k; spending 130k; elections ' + el));

it('choose at 24% drops three met stay-unders that the superset holds', async () => {
  const w = await world();
  await w.setState(householdOf('none').patch);
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const store = await w.load('shared/core/store.js');
  const p = await usPlan(w);
  const c = p.runPlanMode({ planMode: 'choose', plan: makePlan({ bracket: 24, bracketFrom: store.state.rothConvBracket }) });
  expect(Object.keys(c.sim.cliffIntents)).toStrictEqual(['67', '69', '71', '72', '73', '74', '75']);
  expect(Object.keys(c.sim.cliffAltIntents)).toStrictEqual(['66', '67', '68', '69', '70', '71', '72', '73', '74', '75']);
  expect(c.sim.cliffAltIntents[66]).toStrictEqual({ kind: 'under', line: 'irmaa2', ret: 'H' });
  expect(c.depletedAge).toBe(85);
});

it('the plan keeps the superset: 86 / 83 on every election', async () => {
  for (const el of ['none', 'rule55', 'sepp']) {
    const w = await world();
    await w.setState(householdOf(el).patch);
    const { computeCliffPlan } = await w.load('us/core/projection/run-projection.js');
    const { plan, report } = computeCliffPlan(await w.ctx());
    const kept = report.candidates[report.keptIndex];
    expect([el, plan.bracket, kept.depletedAge, kept.homeDrawAge, Object.keys(plan.intents).length]).toStrictEqual([el, 24, 86, 83, 10]);
    // the kept bracket's candidates: choose's own `all` and the superset after it, the superset kept and lasting longer
    const alls = report.candidates.filter((x) => x.family === 'all');
    expect(alls.length).toBe(2);
    expect(kept).toBe(alls[1]);
    expect(alls[1].depletedAge > alls[0].depletedAge).toBe(true);
  }
});

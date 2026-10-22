// The plan-mode hooks of the US test installer (src/us/ui/install-test-hooks.js): __test_runPlanMode,
// __test_planTrace and __test_rowFnFor, ported line for line from that installer (test-only code, not production ui/ code).
// Every src/ module comes from the caller's world; `state` is read live from the store namespace.
import { guardWorld } from './world.js';

export async function usPlan(w) {
  const store = await w.load('shared/core/store.js');
  const { HIST } = await w.load('shared/core/projection/historical-data.js');
  const { runProjection } = await w.load('us/core/projection/run-projection.js');
  const { storeContext } = await w.load('us/core/projection/store-context.js');
  const { BUCKET_MODE, STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { historicalYearSource, standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const { afterTaxEndValueUS } = await w.load('us/core/cliff-plan/solver.js');
  const { ensureTestPlan } = await w.load('us/core/cliff-plan/planning.js');
  const { cliffPlanStore } = await w.load('us/core/cliff-plan-store.js');

  // __test_runPlanMode: one run in a given plan mode. rowFn: the bucket engine on that path.
  const runPlanMode = ({ planMode, plan = null, rowFn = null, planTrace = false, endValue = false }) => {
    const state = store.state;
    const tr = planTrace ? [] : null;
    let sim, value, estate;
    const measure = () => {
      if (!endValue) return;
      value = afterTaxEndValueUS(ctx, sim);
      const e = sim.estate;
      estate = { roth: e.roth, traditional: e.traditional, taxable: e.taxable };
    };
    // The plan options are given only with planMode (storeContext); with planMode undefined the state's plan applies.
    const ctx = storeContext({ plan, planMode, taxFactors: rowFn ? [] : null });
    if (!rowFn) {
      sim = runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(state), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planTrace: tr });
      measure();
    } else {
      sim = runProjection(ctx, { mode: BUCKET_MODE, source: historicalYearSource(state, rowFn, ctx.taxFactors), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planTrace: tr });
      measure();
    }
    return { rows: sim.rows, depletedAge: sim.depletedAge, intents: sim.cliffIntents || null, trace: tr, sim, ...(endValue ? { value, estate } : null) };
  };

  // __test_planTrace: without rowFn, the standard `choose` run; with it, an `apply` run of the state's plan on that path.
  const planTrace = (rowFn) => {
    const state = store.state;
    const trace = [];
    if (!rowFn) runProjection(storeContext({ planMode: 'choose', plan: null }), { mode: STANDARD_MODE, source: standardYearSource(state), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planTrace: trace });
    else {
      ensureTestPlan();
      const ctx = storeContext({ planMode: 'apply', plan: cliffPlanStore.plan, taxFactors: [] });
      runProjection(ctx, { mode: BUCKET_MODE, source: historicalYearSource(state, rowFn, ctx.taxFactors), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, planTrace: trace });
    }
    return trace;
  };

  // __test_rowFnFor: tests/snapshot.js's rowFnFor and mulberry32, verbatim. Keep in step with __test_rowFnFor in
  // src/us/ui/install-test-hooks.js (a change there must be copied here).
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rowFnFor(series) {
    const wrap = (i) => HIST[((i % HIST.length) + HIST.length) % HIST.length];
    switch (series.type) {
      case 'real': {
        const i0 = series.start - HIST[0][0];
        return (y) => wrap(i0 + y);
      }
      case 'crashFirst':
        return (y) => [2000 + y, [-30, -18, -5][y] ?? 9, y < 3 ? -3 : 3, y < 3 ? 6 : 4, y < 3 ? 2 : 4.5];
      case 'sawtooth':
        return (y) => [2000 + y, y % 2 ? -15 : 25, 3, y % 2 ? 6 : 2, 4];
      case 'boom':
        return (y) => [2000 + y, 15, 2, 3, null].slice(0, 4);
      case 'flat':
        return (y) => [2000 + y, 0, 0, 0, 0];
      case 'mc': {
        const rnd = mulberry32(series.seed), B = 5, out = [];
        const maxStart = HIST.length - B;
        while (out.length < 120) {
          const s = Math.floor(rnd() * (maxStart + 1));
          for (let i = 0; i < B; i++) out.push(HIST[s + i]);
        }
        return (y) => out[y];
      }
    }
    throw new Error('unknown series ' + series.type);
  }

  return guardWorld(w, { runPlanMode, planTrace, rowFnFor }, 'usPlan');
}

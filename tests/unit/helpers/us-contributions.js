// The US contribution functions as the old window.__test_* hooks wrapped them (mirror of the matching lines of
// src/us/ui/install-test-hooks.js), built per world from their core/ modules. Several fill module scratch objects
// (SE_OUT, SOLO_PLAN), so each wrapper copies the result before returning.
import { guardWorld } from './world.js';

export async function usContributions(w) {
  const contrib = await w.load('us/core/income/contributions.js');
  const fed = await w.load('us/core/tax/federal-tax.js');
  const store = await w.load('shared/core/store.js');
  const now = await w.ctxBuilder();
  return guardWorld(w, {
    // __test_selfEmploymentTax
    selfEmploymentTax: (se, wages, y) => ({ ...fed.selfEmploymentTax(now(), se, wages, y, fed.SE_OUT) }),
    // __test_allocatePlanRoom
    allocatePlanRoom(room, amounts) {
      const out = [];
      const left = contrib.allocatePlanRoom(room, amounts, out);
      return { out, left };
    },
    // __test_soloPlanContributions
    soloPlanContributions(q) {
      const P = contrib.SOLO_IN;
      for (const k of ['se', 'half', 'main', 'w2Comp', 'iraLeft']) { P[k][0] = q[k][0]; P[k][1] = q[k][1]; }
      for (let o = 0; o < 2; o++) Object.assign(P.mainPct[o], { deferral: 0, catchUp: 0, profit: 0, afterTax: 0, ira: 0 }, q.mainPct[o]);
      P.list = { n: q.list.length, items: q.list };
      P.rooms = JSON.parse(JSON.stringify(q.rooms));
      Object.assign(P, { annualAdditions: q.annualAdditions, compensation: q.compensation, mainRoth: !!q.mainRoth, iraPretax: !!q.iraPretax, megaOn: !!q.megaOn });
      contrib.soloPlanContributions(P, contrib.SOLO_PLAN);
      return { out: JSON.parse(JSON.stringify(contrib.SOLO_PLAN)), rooms: P.rooms };
    },
    // __test_retirementContributions: the patch is applied to state for the call and state is restored afterwards.
    retirementContributions(patch, args) {
      const state = store.state;
      const saved = JSON.parse(JSON.stringify(state));
      try {
        Object.assign(state, patch);
        if (Array.isArray(args.streamList)) args = { ...args, streamList: { n: args.streamList.length, items: args.streamList } };
        return structuredClone(contrib.retirementContributions(args)); // a copy: the old hook returned a serialized one
      } finally {
        for (const k of Object.keys(state)) delete state[k];
        Object.assign(state, saved);
      }
    },
  }, 'usContributions');
}

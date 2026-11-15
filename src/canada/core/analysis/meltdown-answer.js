// The Canada meltdown goal's answer: the RRSP meltdown at each bracket against none, the best bracket and the sentence

import { displayValueOf } from '../../../shared/core/format/display-value.js';
import { compact } from '../../../shared/core/format/numbers.js';
import { pricingContextFor } from '../../../shared/core/projection/run-source.js';
import { simulateWith } from '../../../shared/core/projection/runs.js';
import { afterTaxEstate } from './estate.js';

  // The after-tax estate of one run in today's dollars (priced with the context of the run it prices).
  function realEstate(ctx, sim, inflation) {
    const last = sim.rows[sim.rows.length - 1];
    return displayValueOf('real', inflation, afterTaxEstate(pricingContextFor(ctx), sim), last.year, last.cumFactor);
  }

  // One run per bracket with the meltdown on, and one with it off. `selected` is the run of `base`. `best` follows the card's
  // rule: the highest estate among the brackets not worse than `selected` (no earlier depletion), or among all when none is.
  // Yields 'run' after every projection.
  export function* meltdownAnswerSteps(base, contextFor, brackets, selected) {
    const results = [];
    for (const bracket of brackets) {
      const ctx = contextFor({ ...base, meltdownEnabled: true, meltdownBracket: bracket });
      const sim = simulateWith(ctx);
      yield 'run';
      results.push({ bracket, estate: realEstate(ctx, sim, base.inflation), depletedAge: sim.depletedAge || null });
    }
    const offCtx = contextFor({ ...base, meltdownEnabled: false });
    const offSim = simulateWith(offCtx);
    yield 'run';
    const off = { estate: realEstate(offCtx, offSim, base.inflation), depletedAge: offSim.depletedAge || null };
    const notWorse = results.filter((r) =>
      selected.depletedAge ? !r.depletedAge || r.depletedAge >= selected.depletedAge : !r.depletedAge,
    );
    const pool = notWorse.length ? notWorse : results;
    const best = pool.length ? pool.reduce((a, b) => (b.estate > a.estate ? b : a)) : null;
    return { results, off, best };
  }

  // The answer as one sentence. With the meltdown already on at another bracket than `best`, it compares both against none.
  export function meltdownAnswerText(a, base) {
    const { best, off, results } = a;
    if (!best) return 'No bracket was tested.';
    const cur = base.meltdownEnabled ? results.find((r) => r.bracket === base.meltdownBracket) : undefined;
    if (cur && cur.bracket !== best.bracket) {
      const x = cur.estate - off.estate,
        y = best.estate - cur.estate;
      return `Your meltdown at ${cur.bracket}% leaves about ${compact(Math.abs(x))} ${x >= 0 ? 'more' : 'less'} after-tax estate than none; ${best.bracket}% would leave about ${compact(y)} more than ${cur.bracket}%.`;
    }
    const gain = best.estate - off.estate,
      what = `an RRSP meltdown to the top of the ${best.bracket}% bracket`;
    if (best.depletedAge && (!off.depletedAge || best.depletedAge < off.depletedAge)) {
      return `No: ${what} makes the money run out at ${best.depletedAge} instead of ${off.depletedAge ?? 'lasting'}.`;
    }
    if (gain >= 500) return `Yes: ${what} leaves about ${compact(gain)} more after-tax estate at the end (today's dollars).`;
    if (gain <= -500) return `No: ${what} leaves about ${compact(-gain)} less after-tax estate at the end.`;
    return 'A meltdown makes little difference here (under $500 of after-tax estate at the end).';
  }

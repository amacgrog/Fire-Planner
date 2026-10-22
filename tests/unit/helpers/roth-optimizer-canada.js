import { meltdownBracketValues } from './markup.js';

// The sweep of computeRothOptimizer (src/canada/ui/results/roth-optimizer.js, a ui/ module that reads the
// bracket candidates from the DOM), ported without the DOM: the candidates come from the markup shell. Runs the
// standard projection once per candidate bracket and picks the highest after-tax estate among the plans that do
// not shorten the portfolio's life. Keep it in step with that function.
export async function computeRothOptimizerCanada(w, selected) {
  const { simulate } = await w.load('shared/core/projection/simulate.js');
  const { afterTaxEstate } = await w.load('canada/core/analysis/estate.js');
  const { displayValue } = await w.load('shared/core/format/charts.js');
  const store = await w.load('shared/core/store.js');
  const state = store.state;
  const savedEnabled = state.meltdownEnabled;
  const savedBracket = state.meltdownBracket;
  const results = meltdownBracketValues().map((bracket) => {
    state.meltdownEnabled = true;
    state.meltdownBracket = bracket;
    const sim = simulate();
    const end = sim.rows.at(-1);
    return {
      bracket,
      endAssets: displayValue(end.total, end.year),
      afterTaxEstate: displayValue(afterTaxEstate(sim), end.year),
      lifetimeTax: sim.rows.reduce((sum, r) => sum + displayValue(r.tax + (r.oasClawback || 0) - (r.benefits || 0), r.year), 0),
      depletedAge: sim.depletedAge,
    };
  });
  state.meltdownEnabled = savedEnabled;
  state.meltdownBracket = savedBracket;
  const notWorse = results.filter((r) => (selected.depletedAge ? !r.depletedAge || r.depletedAge >= selected.depletedAge : !r.depletedAge));
  const pool = notWorse.length ? notWorse : results;
  const best = pool.reduce((a, b) => (b.afterTaxEstate > a.afterTaxEstate ? b : a));
  return { results, best, currentBracket: savedBracket };
}

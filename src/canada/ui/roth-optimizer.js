// Computes and annotates the Roth and RRSP optimizer results

import { afterTaxEstate } from '../core/analysis/estate.js';
import { money } from '../../shared/core/money-format.js';
import { simulate } from '../../shared/core/simulate.js';
import { displayValue } from '../../shared/core/spending-and-loans.js';
import { state } from '../../shared/core/store.js';

  export function computeRothOptimizer(selected) {
    const candidates = [...document.getElementById('meltdownBracket').options].map((o) =>
      Number(o.value),
    );
    const savedEnabled = state.meltdownEnabled,
      savedBracket = state.meltdownBracket;
    const results = candidates.map((bracket) => {
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
    // "Not worse" = doesn't deplete when the current plan doesn't, and doesn't
    // deplete earlier when it does — a bracket that shortens the portfolio's life
    // isn't actually an improvement. The pick is the highest after-tax estate (7N N8:
    // pre-tax end assets count an RRSP dollar like a TFSA dollar and would undervalue
    // melting down); the lifetime tax stays in the table.
    const notWorse = results.filter((r) =>
      selected.depletedAge ? !r.depletedAge || r.depletedAge >= selected.depletedAge : !r.depletedAge,
    );
    const pool = notWorse.length ? notWorse : results;
    const best = pool.reduce((a, b) => (b.afterTaxEstate > a.afterTaxEstate ? b : a));
    lastRothOptimizer = { results, best, currentBracket: savedBracket };
    return lastRothOptimizer;
  }
  // The shared renderRothOptimizer (a region both planners carry) writes the lifetime-tax summary and a four-column table; the Canada
  // page then replaces them (7N N8): the table gains the after-tax estate column and the recommendation is the highest after-tax estate.
  let lastRothOptimizer = null;
  export function annotateRothOptimizer() {
    const o = lastRothOptimizer;
    if (!o) return;
    const { results, best, currentBracket } = o,
      current = results.find((r) => r.bracket === currentBracket),
      summaryEl = document.getElementById('rothOptimizerSummary'),
      rowsEl = document.getElementById('rothOptimizerRows'),
      lastsLabel = (r) =>
        r.depletedAge
          ? `Age ${r.depletedAge}`
          : `Age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+`;
    if (best.bracket === currentBracket) {
      summaryEl.innerHTML = `Your current <b>${currentBracket}%</b> bracket target already leaves the highest after-tax estate among the available options here.`;
    } else {
      const gain = best.afterTaxEstate - current.afterTaxEstate,
        savings = current.lifetimeTax - best.lifetimeTax;
      summaryEl.innerHTML = `Recommended: fill to the <b>${best.bracket}%</b> bracket instead of your current <b>${currentBracket}%</b> — an estimated <b>${money(gain)}</b> more after-tax estate (end assets less the tax on the RRSP/RRIF and unrealized gains at the last death, and probate fees, today's dollars)${savings >= 0 ? ` and <b>${money(savings)}</b> less lifetime tax` : ` at <b>${money(-savings)}</b> more lifetime tax`}, without shortening how long the portfolio lasts.`;
    }
    rowsEl.innerHTML = results
      .map(
        (r) =>
          `<tr${r.bracket === best.bracket ? ' style="font-weight:700"' : ''}><td>${r.bracket}%${r.bracket === currentBracket ? ' (current)' : ''}${r.bracket === best.bracket ? ' ★' : ''}</td><td>${money(r.lifetimeTax)}</td><td>${money(r.endAssets)}</td><td>${money(r.afterTaxEstate)}</td><td><span class="table-status ${r.depletedAge ? 'fail' : ''}">${lastsLabel(r)}</span></td></tr>`,
      )
      .join('');
  }

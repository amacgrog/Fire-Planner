import { money } from '../core/money-format.js';
import { state } from '../core/store.js';
import { computeRothOptimizer } from '#country/ui/seam-computeRothOptimizer';

  export function renderRothOptimizer(selected) {
    const card = document.getElementById('rothOptimizerCard'),
      summaryEl = document.getElementById('rothOptimizerSummary'),
      rowsEl = document.getElementById('rothOptimizerRows');
    const { results, best, currentBracket } = computeRothOptimizer(selected);
    const current = results.find((r) => r.bracket === currentBracket);
    const lastsLabel = (r) =>
      r.depletedAge
        ? `Age ${r.depletedAge}`
        : `Age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+`;
    if (best.bracket === currentBracket) {
      summaryEl.innerHTML = `Your current <b>${currentBracket}%</b> bracket target is already the lifetime-tax-minimizing choice among the available options here.`;
    } else {
      const savings = current.lifetimeTax - best.lifetimeTax;
      summaryEl.innerHTML = `Recommended: fill to the <b>${best.bracket}%</b> bracket instead of your current <b>${currentBracket}%</b> — an estimated <b>${money(savings)}</b> less lifetime tax (income + payroll, today's dollars) over the projection, without shortening how long the portfolio lasts.`;
    }
    rowsEl.innerHTML = results
      .map(
        (r) =>
          `<tr${r.bracket === best.bracket ? ' style="font-weight:700"' : ''}><td>${r.bracket}%${r.bracket === currentBracket ? ' (current)' : ''}${r.bracket === best.bracket ? ' ★' : ''}</td><td>${money(r.lifetimeTax)}</td><td>${money(r.endAssets)}</td><td><span class="table-status ${r.depletedAge ? 'fail' : ''}">${lastsLabel(r)}</span></td></tr>`,
      )
      .join('');
    card.hidden = false;
  }

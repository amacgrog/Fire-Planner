// Draws the selected chart view (the projection and its comparison lines)

import { updateChartGapPartnerButtons, updateChartShiftModeButtons } from './chart-controls.js';
import { pct } from '../../../shared/core/format/numbers.js';
import { assignChartShiftMode, chartGapPartner, chartShiftMode, chartView, mcPathCount } from '../../../shared/core/chart-prefs.js';
import { runHistoricalCycles, runMonteCarlo, simulate, simulateAtRealCagr } from '../../../shared/core/projection/simulate.js';
import { cagrColors } from '../../../shared/core/format/charts.js';
import { mode, state } from '../../../shared/core/store.js';
import { getBondYears } from '../../../shared/core/projection/year-factors.js';
import { renderMonteCarloChart } from '../../../shared/ui/charts/monte-carlo-chart.js';
import { renderChart } from '../../../shared/ui/charts/projection-chart.js';

  // The CAGR lines the last CAGR view drew (label, end total, depletion age); read by the analysis test hook.
  export let lastCagrSims = null;
  export function assignLastCagrSims(v) {
    lastCagrSims = v;
  }
  export function renderChartView(selected) {
    const titleEl = document.getElementById('chartTitle'),
      subEl = document.getElementById('chartSub'),
      legend = document.getElementById('chartLegend'),
      noteEl = document.getElementById('chartViewNote'),
      canvas = document.getElementById('chart'),
      histCard = document.getElementById('histSuccessCard'),
      mcCard = document.getElementById('mcSuccessCard');
    histCard.hidden = chartView !== 'hist';
    mcCard.hidden = chartView !== 'mc';
    document.getElementById('mcPathCountRow').hidden = chartView !== 'mc';
    // The Both/Gap shift-mode switch only applies to the ±1yr/±3yr
    // comparison itself (not CAGR/Historical/Monte Carlo), and the whole
    // switch is meaningless — not just "Gap" — for a single-person plan or
    // when both partners already share the same retirement year: with
    // nothing to narrow/widen, "Both together" would be the only real
    // choice anyway, which is identical to not having a switch at all. So
    // the entire row hides rather than showing a permanently-disabled Gap
    // button — re-checked on every render (not just on a chart-view
    // change) so it reacts live to sliders/toggles.
    const shiftModeRow = document.getElementById('chartShiftModeRow'),
      shiftGapBtn = document.getElementById('chartShiftGapBtn'),
      gapDisabled = state.singlePerson || state.retireAgeA === state.retireAgeB;
    shiftModeRow.hidden = (chartView !== '1yr' && chartView !== '3yr') || gapDisabled;
    shiftGapBtn.disabled = gapDisabled;
    shiftGapBtn.title = "Hold one partner's retirement date fixed and vary only the other's";
    if (gapDisabled && chartShiftMode === 'gap') assignChartShiftMode('together');
    updateChartShiftModeButtons();
    // The Vary: Partner A/B picker only makes sense once Gap mode is
    // actually active (and available) — hidden otherwise. Its two buttons
    // always show a determinate choice: chartGapPartner if the person
    // explicitly picked one, or the auto-detected earlier partner if not.
    document.getElementById('chartGapPartnerRow').hidden = !(chartShiftMode === 'gap' && !gapDisabled);
    updateChartGapPartnerButtons();
    if (chartView === 'mc') {
      const mc = runMonteCarlo(mcPathCount);
      const rate = document.getElementById('mcSuccessRate'),
        sub = document.getElementById('mcSuccessSub');
      rate.textContent = `${(mc.successRate * 100).toFixed(0)}%`;
      rate.className =
        mc.successRate === 1 ? 'positive' : mc.successRate < 0.9 ? 'negative' : 'warning';
      sub.textContent = `Portfolio survived to the end of the projection in ${mc.paths.filter((p) => !p.depletedAge).length} of ${mc.paths.length} simulated paths, each built from randomly shuffled 5-year blocks of actual 1928–2025 market history.`;
      titleEl.textContent = `Monte Carlo: ${mc.paths.length.toLocaleString()} simulated paths`;
      subEl.textContent =
        'Shaded bands show total assets by age across all simulated paths: the darker band is where the middle 50% of paths landed (25th–75th percentile), the lighter band is the middle 80% (10th–90th percentile). The line is the median (50th percentile) path. Narrower bands with even fewer paths (500) can look artificially tight — 1,000–2,000 gives a smoother read.';
      legend.innerHTML = `<span><i class="swatch" style="background:#2563eb"></i><span>Median</span></span><span><i class="swatch" style="background:rgba(37,99,235,0.4)"></i><span>25th–75th pct. (middle 50%)</span></span><span><i class="swatch" style="background:rgba(37,99,235,0.2)"></i><span>10th–90th pct. (middle 80%)</span></span>`;
      noteEl.textContent = `Each path stitches together random 5-year blocks of real historical stock/inflation/bond returns (block bootstrap), rather than sampling each year independently — this preserves real sequencing and market regime behavior instead of allowing unrealistic runs. Bond reserve sized to ${getBondYears()} years of expenses, same withdrawal order as the historical backtest.`;
      canvas.setAttribute(
        'aria-label',
        `Projected total assets by age across ${mc.paths.length} Monte Carlo simulated paths`,
      );
      renderMonteCarloChart(mc);
      return;
    }
    if (chartView === 'hist') {
      const { cycles, successRate, projectionYears } = runHistoricalCycles();
      const rate = document.getElementById('histSuccessRate'),
        sub = document.getElementById('histSuccessSub');
      if (!cycles.length) {
        rate.textContent = '—';
        rate.className = '';
        sub.textContent = `Not enough of the 1928–2025 record (98 years) to cover a ${projectionYears}-year projection.`;
        titleEl.textContent = 'Historical S&P 500 backtest';
        subEl.textContent = '';
        legend.innerHTML = '';
        noteEl.textContent = '';
        return;
      }
      rate.textContent = `${(successRate * 100).toFixed(0)}%`;
      rate.className = successRate === 1 ? 'positive' : successRate < 0.9 ? 'negative' : 'warning';
      sub.textContent = `Portfolio survived to the end of the projection in ${cycles.filter((c) => !c.depletedAge).length} of ${cycles.length} historical starting years (${cycles[0].startYear}–${cycles.at(-1).startYear}). Those windows overlap heavily (only about ${Math.max(1, Math.floor(98 / Math.max(1, projectionYears)))} are fully independent), so treat the rate as approximate.`;
      titleEl.textContent = 'Total assets across every historical starting year';
      subEl.textContent = `Same inputs, replayed starting from each calendar year 1928–2025 that has a full ${projectionYears}-year run of actual S&P 500 returns, inflation, and bond returns available.`;
      legend.innerHTML = `<span><i class="swatch" style="background:#0e9f9a"></i><span>Survived</span></span><span><i class="swatch" style="background:#dc2626"></i><span>Depleted</span></span>`;
      // Naming every failing starting year in this note text (an earlier
      // version of this feature did) doesn't scale — a rougher scenario
      // can fail dozens of starting years, and a long comma-separated list
      // crowds the note area under the chart for little benefit when
      // hovering any line already identifies it directly. So this just
      // points at hover instead of listing years; the success-rate sub-line
      // above already gives the count.
      noteEl.textContent = `Bond reserve sized to ${getBondYears()} years of expenses: down years draw cash then bonds only; up years pay from taxable→traditional→Roth and refill the bond reserve the same way. Bond/HYSA/mortgage rates stay at your entered values — only stock growth and inflation follow history. Hover over any line to see its starting year, outcome, and value at that age.`;
      canvas.setAttribute(
        'aria-label',
        `Projected total assets by age across ${cycles.length} historical starting years`,
      );
      const series = cycles.map((c) => ({ sim: c, color: c.depletedAge ? '#dc2626' : '#0e9f9a' }));
      renderChart(series, (r) => (mode === 'real' ? r.total / r.cumFactor : r.total));
      return;
    }
    if (chartView === 'cagr') {
      titleEl.textContent = 'Total assets across real investment returns';
      // Comparison rates are 0-7% real in whole-percent steps, but with your
      // actual entered assumption (rounded to the nearest tenth) swapped in
      // for real, exactly, rather than snapped to the nearest whole percent
      // and mislabeled "(current)" — e.g. a 4.5% real assumption used to
      // round down and display as an inexact "4% (current)". Whichever
      // whole-percent point sits closest to that exact value is dropped so
      // the sweep doesn't show two near-duplicate points right next to each
      // other (ties favor dropping the lower one, so 4.5% drops 4% and
      // keeps 5%).
      const currentReal = Math.round(((1 + pct(state.returnRate)) / (1 + pct(state.inflation)) - 1) * 1000) / 10;
      const baseInts = [0, 1, 2, 3, 4, 5, 6, 7];
      let closestInt = baseInts[0],
        bestDist = Infinity;
      for (const n of baseInts) {
        const d = Math.abs(n - currentReal);
        if (d < bestDist - 1e-9) {
          bestDist = d;
          closestInt = n;
        }
      }
      const rates = baseInts.filter((n) => n !== closestInt).concat([currentReal]).sort((a, b) => a - b);
      const fmtRate = (r) => (Number.isInteger(r) ? `${r}%` : `${r.toFixed(1)}%`);
      subEl.textContent = `Same retirement dates and inflation input; investment growth swept across real returns for comparison, with your current ${fmtRate(currentReal)} assumption included exactly.`;
      const series = rates.map((r, i) => ({
        sim: simulateAtRealCagr(r),
        color: cagrColors[i],
        highlight: r === currentReal,
        label: `${fmtRate(r)}${r === currentReal ? ' (current)' : ''}`,
      }));
      lastCagrSims = series.map((s) => ({ label: s.label, total: s.sim.rows.at(-1).total, depletedAge: s.sim.depletedAge }));
      legend.innerHTML = series
        .map(
          (s, i) =>
            `<span><i class="swatch" style="background:${s.color}"></i><span>${fmtRate(rates[i])}${rates[i] === currentReal ? ' (current)' : ''}</span></span>`,
        )
        .join('');
      noteEl.textContent = `Bond, HYSA, and mortgage rates stay at their entered values; only portfolio growth varies. ${state.inflation}% inflation applied on top of each real rate.`;
      canvas.setAttribute(
        'aria-label',
        `Projected total assets by age across a sweep of real investment returns, including your current ${fmtRate(currentReal)} assumption`,
      );
      renderChart(series);
    } else {
      const yrs = chartView === '1yr' ? 1 : 3,
        label = `${yrs} yr${yrs > 1 ? 's' : ''}`;
      // 'gap' mode only makes sense with two partners on different dates;
      // chartShiftModeRow's own visibility/disabled state (set in render())
      // already prevents picking 'gap' in those cases, but this guards
      // against a stale chartShiftMode value if singlePerson or the dates
      // are toggled/edited after 'gap' was already selected.
      const gapMode =
        chartShiftMode === 'gap' && !state.singlePerson && state.retireAgeA !== state.retireAgeB;
      let early, late, earlyLabel, lateLabel, ariaSuffix, note;
      if (gapMode) {
        // Which partner moves: an explicit pick (chartGapPartner) sticks
        // regardless of who's actually earlier; with no explicit pick yet,
        // default to auto-tracking whichever partner currently retires
        // earlier (this feature's original behavior).
        const movingIsA = chartGapPartner
          ? chartGapPartner === 'A'
          : state.retireAgeA < state.retireAgeB;
        const movingAge = movingIsA ? state.retireAgeA : state.retireAgeB,
          movingFloor = movingIsA ? state.ageA : state.ageB,
          fixedAge = movingIsA ? state.retireAgeB : state.retireAgeA;
        // sign > 0: moving partner currently retires before the fixed
        // partner, so moving "closer" means retiring later (age goes up).
        // sign < 0: moving partner currently retires after the fixed
        // partner (only reachable via an explicit pick against the grain,
        // e.g. deliberately varying the later-retiring partner instead),
        // so "closer" means retiring earlier (age goes down) instead.
        const sign = movingAge <= fixedAge ? 1 : -1;
        // "Closer" clamps at the fixed partner's own date, so the gap can
        // close to zero but never overshoots into flipping who's earlier.
        // "Farther" floors/caps at the moving partner's current age / 70,
        // same bounds the "Both" branch below already uses.
        const closerAge =
            sign > 0 ? Math.min(fixedAge, movingAge + yrs) : Math.max(fixedAge, movingAge - yrs),
          fartherAge =
            sign > 0 ? Math.max(movingFloor, movingAge - yrs) : Math.min(70, movingAge + yrs);
        early = simulate(movingIsA ? closerAge : state.retireAgeA, movingIsA ? state.retireAgeB : closerAge);
        late = simulate(movingIsA ? fartherAge : state.retireAgeA, movingIsA ? state.retireAgeB : fartherAge);
        // Actual years moved, not the requested ±1/±3 — when the two
        // partners are already closer together than that (e.g. 1 year
        // apart on the ±3yr view), "Closer" clamps at the fixed partner's
        // own date well short of a full 3-year move, so the label needs to
        // say "1 yr" there, not a "3 yrs" that never actually happened.
        const closerYrs = Math.round(Math.abs(closerAge - movingAge)),
          fartherYrs = Math.round(Math.abs(fartherAge - movingAge));
        // Labels name the moving partner and their resulting age directly
        // (e.g. "Partner A → 48") rather than just "Closer"/"Farther" on
        // their own — a real user read the bare adjectives as "both
        // partners move toward/away from each other," when only the named
        // partner's date ever changes; the other partner's date (spelled
        // out in `note` below) never appears in the legend/tooltip at all
        // otherwise, so there was nothing there to contradict that reading.
        const movingLabel = movingIsA ? 'Partner A' : 'Partner B',
          fixedLabel = movingIsA ? 'Partner B' : 'Partner A',
          autoNote = chartGapPartner ? '' : ' (currently the earlier of the two)';
        earlyLabel = `${movingLabel} → ${closerAge} (closer)`;
        lateLabel = `${movingLabel} → ${fartherAge} (farther)`;
        ariaSuffix = `for ${movingLabel} retiring up to ${label} earlier or later, while ${fixedLabel} stays fixed at retirement age ${fixedAge}`;
        note = `Only ${movingLabel}'s date moves${autoNote}; ${fixedLabel}'s stays fixed at retirement age ${fixedAge}.`;
        if (closerYrs < yrs)
          note += ` "Closer" stops at ${closerYrs} yr${closerYrs === 1 ? '' : 's'} here since that's as far as it can move before reaching ${fixedLabel}'s date.`;
      } else {
        early = simulate(
          Math.max(state.ageA, state.retireAgeA - yrs),
          Math.max(state.ageB, state.retireAgeB - yrs),
        );
        late = simulate(Math.min(70, state.retireAgeA + yrs), Math.min(70, state.retireAgeB + yrs));
        earlyLabel = `Both −${label}`;
        lateLabel = `Both +${label}`;
        ariaSuffix = `${label} apart`;
        note = state.singlePerson
          ? ''
          : `Both partners' dates move together, by the same amount.${
              gapDisabled ? '' : ' Switch to "Fix one partner" above to instead hold one partner\'s date and vary only the other\'s.'
            }`;
      }
      titleEl.textContent = 'Total assets across retirement dates';
      subEl.textContent =
        'Investments + cash + home equity, after projected spending and estimated federal + provincial income tax.';
      // Legend, hover-tooltip line order, and canvas draw order all follow
      // the same top-to-bottom convention as the CAGR sweep: the "+N"/
      // "Farther" line (later retirement — generally the higher line, more
      // compounding time before withdrawals start) listed first, "Selected"
      // in the middle, and the "-N"/"Closer" line (earlier retirement,
      // generally the lower line) listed last — so the order on screen
      // reads top-to-bottom the same way the lines themselves typically
      // stack, rather than the reverse.
      legend.innerHTML = `<span><i class="swatch late"></i><span>${lateLabel}</span></span><span><i class="swatch"></i><span>Selected dates</span></span><span><i class="swatch early"></i><span>${earlyLabel}</span></span>`;
      noteEl.textContent = note;
      canvas.setAttribute(
        'aria-label',
        `Projected total assets by age for three retirement dates, ${ariaSuffix}`,
      );
      renderChart([
        { sim: late, color: '#0e9f9a', label: lateLabel },
        { sim: selected, color: '#2563eb', highlight: true, label: 'Selected' },
        { sim: early, color: '#d97706', label: earlyLabel },
      ]);
    }
  }

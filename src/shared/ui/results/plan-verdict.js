// The plan verdict: Comfortable / Tight / Short, the spending room and the historical line

import { compact } from '../../core/format/numbers.js';
import { runHistoricalCycles } from '../../core/projection/simulate.js';
import { projectionVerdict } from '../../core/analysis/projection-verdict.js';
import { planVerdict } from '../../core/analysis/spending-room.js';
import { state } from '../../core/store.js';
import { setChartView } from '../charts/chart-view-mode.js';
import { currentMarketScenarioText } from './market-scenario-banner.js';
import { paintPlanStatusBar } from './plan-status-bar.js';
import { stateContextFor } from './state-context.js';

  // null before the first full render, else { word, room, shown, atCap, unfixable, guardrails, cutPct, depletedAge, endAge,
  // spending, tiers, scenarioText, retiring }; shown = displayRoom(room). Assigned only in this module.
  export let lastVerdict = null;
  // The share of historical markets the plan survived (0 to 1), or null until the first backtest lands; never reset after that,
  // so the word does not flicker while a newer one is pending. Assigned only in this module.
  export let verdictHistRate = null;
  let histTimer = null;
  // The gauge under the room figure: pinned open by a click; hovered or focused shows it for a moment. Assigned only in this module.
  let gaugePinned = false;
  let gaugeHover = false;
  const WORDS = { comfortable: 'Comfortable', tight: 'Tight', short: 'Short' };

  // Runs the room search (or, with guardrails on a plan that lasts, the guardrails-off comparison) and paints the verdict.
  export function renderPlanVerdict(selected) {
    const ctxFor = stateContextFor();
    const scenarioText = currentMarketScenarioText();
    const endAge = Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB);
    const v = projectionVerdict(state, ctxFor, selected);
    const { guardrails, cutPct, shown, shareBase } = v;
    const word = planVerdict({
      depleted: Boolean(selected.depletedAge),
      roomShare: shareBase > 0 ? shown / shareBase : Infinity,
      histRate: verdictHistRate,
      guardrails,
      cutPct,
      scenario: scenarioText !== null,
    });
    lastVerdict = {
      word,
      room: v.room,
      shown,
      atCap: v.atCap,
      unfixable: v.unfixable,
      guardrails,
      cutPct,
      depletedAge: selected.depletedAge || null,
      endAge,
      spending: state.spending,
      shareBase,
      tiers: (state.spendingTiers || []).length > 0,
      scenarioText,
      retiring: state.singlePerson || state.retireAgeA === state.retireAgeB
        ? `Retiring at ${state.retireAgeA}`
        : `Retiring at A ${state.retireAgeA} / B ${state.retireAgeB}`,
    };
    paintPlanVerdict();
  }

  // Paints the verdict block from lastVerdict and the historical rate; computes nothing.
  export function paintPlanVerdict() {
    const box = document.getElementById('planVerdict');
    const v = lastVerdict;
    if (!box || v === null) return;
    const retiring = v.retiring;
    const room = (text) => `<b class="verdict-room" tabindex="0">${text}</b>`;
    let text;
    if (v.guardrails) {
      text = `${retiring}, your money lasts through age ${v.endAge}. ` +
        (v.cutPct === 0 ? 'Guardrails never cut your spending.' : `Guardrails cut your spending by up to <b>${v.cutPct}%</b> in the worst year.`);
    } else if (v.depletedAge) {
      text = v.unfixable
        ? `${retiring}, your money runs out at ${v.depletedAge}. Cutting household spending alone can't fix this.`
        : `${retiring}, your money runs out at ${v.depletedAge}. You would need to spend about <b>${compact(-v.shown)} less a year</b> (today's dollars) to make it to ${v.endAge}.`;
    } else if (v.shown > 0) {
      text = `${retiring}, your money lasts through age ${v.endAge}. You could spend about ${room(`${v.atCap ? 'more than ' : ''}${compact(v.shown)} more a year`)} (today's dollars) and still make it.`;
    } else {
      text = `${retiring}, your money lasts through age ${v.endAge}, with no room to spend more.`;
    }
    box.dataset.verdict = v.word;
    document.getElementById('planVerdictWord').textContent = WORDS[v.word];
    document.getElementById('planVerdictText').innerHTML = text;
    paintVerdictGauge();
    paintVerdictStatusBar();
    document.getElementById('planVerdictHist').innerHTML = v.scenarioText !== null
      ? `Inside the scenario: ${v.scenarioText}.`
      : verdictHistRate === null
        ? ''
        : `Held up in ${Math.round(verdictHistRate * 100)}% of historical markets since 1928 · <button type="button" class="link-btn" data-verdict-action="bad-years">see the bad ones</button>`;
  }

  // Builds (or removes) #planVerdictGauge: a bar from $0 to 1.15 times the most the plan supports, green to 90% of it, amber to
  // it, red beyond, with a marker at today's spending. It applies only to a plan that lasts with room to spend, no guardrails and no spending tiers
  // (a tier replaces the base spending the marker shows).
  function paintVerdictGauge() {
    const v = lastVerdict;
    document.getElementById('planVerdictGauge')?.remove();
    if (v.guardrails || v.atCap || v.unfixable || v.depletedAge || v.shown <= 0 || v.tiers) {
      gaugePinned = false;
      gaugeHover = false;
      return;
    }
    const most = v.spending + v.shown;
    const axis = 1.15 * most;
    const at = (n) => `${((n / axis) * 100).toFixed(2)}%`;
    const gauge = document.createElement('div');
    gauge.id = 'planVerdictGauge';
    gauge.className = 'verdict-gauge';
    gauge.innerHTML =
      `<div class="gauge-bar" style="background:linear-gradient(to right,var(--green) 0,var(--green) ${at(0.9 * most)},` +
      `var(--amber) ${at(0.9 * most)},var(--amber) ${at(most)},var(--red) ${at(most)},var(--red) 100%)">` +
      `<span class="gauge-marker" style="left:${at(v.spending)}"></span></div>` +
      `<div class="gauge-labels"><span>$0</span><span>you: ${compact(v.spending)}</span><span>most it supports: ${compact(most)}</span></div>`;
    const hist = document.getElementById('planVerdictHist');
    hist.parentNode.insertBefore(gauge, hist);
    const room = document.querySelector('#planVerdictText .verdict-room');
    if (!gaugePinned) gaugeHover = Boolean(room && room.matches(':hover'));
    gauge.hidden = !(gaugePinned || gaugeHover);
  }

  function setGaugeShown(shown) {
    gaugeHover = shown;
    const gauge = document.getElementById('planVerdictGauge');
    if (gauge) gauge.hidden = !(gaugePinned || gaugeHover);
  }

  // The status bar's text from the verdict: the word, the room (or when it runs out, or the guardrail cut), the historical share.
  function statusBarText(v) {
    const parts = [WORDS[v.word]];
    if (v.depletedAge) parts.push(`runs out at ${v.depletedAge}`);
    else if (v.guardrails) parts.push(v.cutPct === 0 ? 'no guardrail cuts' : `cuts up to ${v.cutPct}%`);
    else if (v.shown > 0) parts.push(`+${compact(v.shown)}${v.atCap ? '+' : ''}/yr room`);
    else parts.push('no room to spare');
    if (verdictHistRate !== null && v.scenarioText === null) parts.push(`${Math.round(verdictHistRate * 100)}% historical`);
    return parts.join(' · ');
  }

  // Paints the status bar from lastVerdict (nothing before the first full render).
  function paintVerdictStatusBar() {
    if (lastVerdict !== null) paintPlanStatusBar(statusBarText(lastVerdict));
  }

  // Called on every render, light or not: queues the backtest (500 ms after the last call) and repaints the bar from the
  // verdict as it stands.
  export function refreshPlanStatusBar() {
    scheduleVerdictHistRate();
    paintVerdictStatusBar();
  }

  // The backtest (about 70-90 cycles) is too slow for every keystroke, so it waits for a pause. Until it lands the previous rate
  // stays in use and the historical line is dimmed.
  export function scheduleVerdictHistRate() {
    clearTimeout(histTimer);
    if (verdictHistRate !== null) document.getElementById('planVerdictHist')?.classList.add('stale');
    histTimer = setTimeout(() => {
      verdictHistRate = runHistoricalCycles().successRate;
      document.getElementById('planVerdictHist')?.classList.remove('stale');
      // The tile reuses this same backtest rather than running it a second time.
      const tile = document.getElementById('dashHistSuccess'),
        tileSub = document.getElementById('dashHistSuccessSub');
      if (tile) {
        tile.textContent = `${(verdictHistRate * 100).toFixed(0)}%`;
        tile.className = verdictHistRate === 1 ? 'positive' : verdictHistRate < 0.9 ? 'negative' : 'warning';
        if (tileSub) tileSub.textContent = 'Every 1928–2025 starting year';
      }
      if (lastVerdict !== null) {
        // Re-decide the word: this is the only way history downgrades it to Tight.
        lastVerdict = {
          ...lastVerdict,
          word: planVerdict({
            depleted: lastVerdict.depletedAge !== null,
            roomShare: lastVerdict.shareBase > 0 ? lastVerdict.shown / lastVerdict.shareBase : Infinity,
            histRate: verdictHistRate,
            guardrails: lastVerdict.guardrails,
            cutPct: lastVerdict.cutPct,
            scenario: lastVerdict.scenarioText !== null,
          }),
        };
        paintPlanVerdict();
      }
    }, 500);
  }

  export function wirePlanVerdict() {
    const box = document.getElementById('planVerdict');
    const onRoom = (e) => e.target.closest?.('.verdict-room');
    box.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'mouse' && onRoom(e) && !gaugePinned) setGaugeShown(true);
    });
    box.addEventListener('pointerout', (e) => {
      const room = onRoom(e);
      if (e.pointerType === 'mouse' && room && !room.contains(e.relatedTarget) && !gaugePinned) setGaugeShown(false);
    });
    box.addEventListener('focusin', (e) => {
      if (onRoom(e) && !gaugePinned) setGaugeShown(true);
    });
    box.addEventListener('focusout', (e) => {
      if (onRoom(e) && !gaugePinned) setGaugeShown(false);
    });
    box.addEventListener('click', (e) => {
      if (onRoom(e) && document.getElementById('planVerdictGauge')) {
        gaugePinned = !gaugePinned;
        setGaugeShown(gaugePinned);
      }
    });
    box.addEventListener('click', (e) => {
      const el = e.target.closest('[data-verdict-action="bad-years"]');
      if (!el) return;
      setChartView('hist');
      document.getElementById('mainChartCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

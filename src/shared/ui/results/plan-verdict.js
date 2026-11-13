// The plan verdict: Comfortable / Tight / Short, the spending room and the historical line

import { compact } from '../../core/format/numbers.js';
import { simulateWith } from '../../core/projection/runs.js';
import { deepestGuardrailCut, displayRoom, findSpendingRoom, planVerdict } from '../../core/analysis/spending-room.js';
import { state } from '../../core/store.js';
import { setChartView } from '../charts/chart-view-mode.js';
import { currentMarketScenarioText } from './market-scenario-banner.js';
import { stateContextFor } from './state-context.js';

  // null before the first full render, else { word, room, shown, atCap, unfixable, guardrails, cutPct, depletedAge, endAge,
  // spending, scenarioText }; shown = displayRoom(room). Assigned only in this module.
  export let lastVerdict = null;
  // The share of historical markets the plan survived (0 to 1), or null when it has not been computed.
  let histRate = null;
  const WORDS = { comfortable: 'Comfortable', tight: 'Tight', short: 'Short' };

  // Runs the room search (or, with guardrails on a plan that lasts, the guardrails-off comparison) and paints the verdict.
  export function renderPlanVerdict(selected) {
    const ctxFor = stateContextFor();
    const scenarioText = currentMarketScenarioText();
    const endAge = Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB);
    const guardrails = Boolean(state.guardrailsEnabled && !selected.depletedAge);
    let found = { room: 0, atCap: false, unfixable: false },
      cutPct = 0;
    if (guardrails) {
      const off = simulateWith(ctxFor({ ...state, guardrailsEnabled: false }));
      cutPct = Math.round(deepestGuardrailCut(selected, off) * 100);
    } else {
      found = findSpendingRoom(selected, state, ctxFor);
    }
    const shown = displayRoom(found.room);
    const word = planVerdict({
      depleted: Boolean(selected.depletedAge),
      roomShare: state.spending > 0 ? shown / state.spending : Infinity,
      histRate,
      guardrails,
      cutPct,
      scenario: scenarioText !== null,
    });
    lastVerdict = {
      word,
      room: found.room,
      shown,
      atCap: found.atCap,
      unfixable: found.unfixable,
      guardrails,
      cutPct,
      depletedAge: selected.depletedAge || null,
      endAge,
      spending: state.spending,
      scenarioText,
    };
    paintPlanVerdict();
  }

  // Paints the verdict block from lastVerdict and the historical rate; computes nothing.
  export function paintPlanVerdict() {
    const box = document.getElementById('planVerdict');
    const v = lastVerdict;
    if (!box || v === null) return;
    const retiring = state.singlePerson || state.retireAgeA === state.retireAgeB
      ? `Retiring at ${state.retireAgeA}`
      : `Retiring at A ${state.retireAgeA} / B ${state.retireAgeB}`;
    const room = (text) => `<b class="verdict-room" tabindex="0">${text}</b>`;
    let text;
    if (v.guardrails) {
      text = `${retiring}, your money lasts through age ${v.endAge}. ` +
        (v.cutPct === 0 ? 'Guardrails never cut your spending.' : `Guardrails cut your spending by up to <b>${v.cutPct}%</b> in the worst year.`);
    } else if (v.depletedAge) {
      text = v.unfixable
        ? `${retiring}, your money runs out at ${v.depletedAge}. Cutting household spending alone can't fix this.`
        : `${retiring}, your money runs out at ${v.depletedAge}. You would need to spend about ${room(`${compact(-v.shown)} less a year`)} (today's dollars) to make it to ${v.endAge}.`;
    } else if (v.shown > 0) {
      text = `${retiring}, your money lasts through age ${v.endAge}. You could spend about ${room(`${v.atCap ? 'more than ' : ''}${compact(v.shown)} more a year`)} (today's dollars) and still make it.`;
    } else {
      text = `${retiring}, your money lasts through age ${v.endAge}, with no room to spend more.`;
    }
    box.dataset.verdict = v.word;
    document.getElementById('planVerdictWord').textContent = WORDS[v.word];
    document.getElementById('planVerdictText').innerHTML = text;
    document.getElementById('planVerdictHist').innerHTML = v.scenarioText !== null
      ? `Inside the scenario: ${v.scenarioText}.`
      : histRate === null
        ? ''
        : `Held up in ${Math.round(histRate * 100)}% of historical markets since 1928 · <button type="button" class="link-btn" data-verdict-action="bad-years">see the bad ones</button>`;
  }

  export function wirePlanVerdict() {
    document.getElementById('planVerdict').addEventListener('click', (e) => {
      const el = e.target.closest('[data-verdict-action="bad-years"]');
      if (!el) return;
      setChartView('hist');
      document.getElementById('mainChartCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

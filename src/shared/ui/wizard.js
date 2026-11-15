// The first-run wizard: steps, dismiss and close

import { state } from '../core/store.js';
import { setMobileView } from './layout/mobile-view.js';
import { resetSetupFeatures, setGoal } from './results/guidance.js';
import { currentMarketScenarioText } from './results/market-scenario-banner.js';
import { GOALS } from '#country/core/seam-GUIDANCE_FIELDS';

  // load-time: looks up a static element; reads nothing a statement writes.
  const wizardOverlay = document.getElementById('wizardOverlay');
  // load-time: looks up a static element; reads nothing a statement writes.
  // Steps are the [data-wizard-step] panels in document order; each carries its own
  // data-title and data-note (the "Step i of N" prefix is added here).
  const wizardSteps = Array.from(document.querySelectorAll('#wizardModal [data-wizard-step]'));
  let wizardStep = 1;
  function renderWizardStep() {
    wizardSteps.forEach((el, i) => (el.hidden = wizardStep !== i + 1));
    const current = wizardSteps[wizardStep - 1];
    document.getElementById('wizardTitle').textContent = current.dataset.title;
    document.getElementById('wizardStepNote').textContent =
      `Step ${wizardStep} of ${wizardSteps.length} — ${current.dataset.note}`;
    document.getElementById('wizardBackBtn').hidden = wizardStep === 1;
    document.getElementById('wizardNextBtn').hidden = wizardStep === wizardSteps.length;
    document.getElementById('wizardCloseBtn').hidden = wizardStep === 1;
    // #wizardModal itself is the scrolling container (overflow:auto) — it's
    // one persistent element across every step, never recreated, so its
    // scrollTop carries over from whatever step was showing before. Without
    // this, clicking "Next" from partway (or all the way) down a long step
    // left the next step rendered already scrolled to that same position —
    // often right at the bottom, since the Next button itself sits at the
    // very end of the step. Reset on every step change (including the initial
    // open) so each step always starts at its own top.
    document.getElementById('wizardModal').scrollTop = 0;
  }
  export function wireWizard() {
    // Every wizard input that proxies a sidebar control names it in data-wizard-mirror: a
    // change drives the real control with real input/change events, so all the existing
    // state, visibility and render logic runs once, from one source of truth.
    document.querySelectorAll('[data-wizard-mirror]').forEach((wizardEl) => {
      wizardEl.addEventListener('change', (e) => {
        const real = document.getElementById(wizardEl.dataset.wizardMirror);
        real.value = e.target.value;
        real.dispatchEvent(new Event('input', { bubbles: true }));
        real.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    // The goal step: one checkbox per goal in the country's table, filled once. A tick is setGoal from the
    // setup, which also turns the goal's feature on (and back off on an untick in the same opening).
    const goalList = document.getElementById('wizardGoalList');
    for (const g of GOALS) {
      const field = document.createElement('div');
      field.className = 'field';
      if (g.couples) field.setAttribute('data-partner-b', '');
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.dataset.wizardGoal = g.key;
      box.addEventListener('change', () => setGoal(g.key, box.checked, { fromSetup: true }));
      label.append(box, ' ' + g.label);
      field.append(label);
      goalList.append(field);
    }
    document.getElementById('wizardBtn').addEventListener('click', () => {
      resetSetupFeatures();
      const locked = currentMarketScenarioText() !== null;
      goalList.querySelectorAll('[data-wizard-goal]').forEach((box) => {
        box.checked = state.guidanceGoals.includes(box.dataset.wizardGoal);
        box.disabled = locked;
        box.title = locked ? 'Revert the market scenario to change your goals.' : '';
      });
      wizardStep = 1;
      renderWizardStep();
      wizardOverlay.classList.add('open');
    });
    document.getElementById('wizardNextBtn').addEventListener('click', () => {
      wizardStep = Math.min(wizardSteps.length, wizardStep + 1);
      renderWizardStep();
    });
    document.getElementById('wizardBackBtn').addEventListener('click', () => {
      wizardStep = Math.max(1, wizardStep - 1);
      renderWizardStep();
    });
  }
  export function wireWizardDismiss() {
    wizardOverlay.addEventListener('click', (e) => {
      if (e.target === wizardOverlay) wizardOverlay.classList.remove('open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') wizardOverlay.classList.remove('open');
    });
    // Visible on every wizard step (unlike wizardBackBtn/wizardNextBtn/
    // wizardCloseBtn, which the wizardStep hidden-toggling logic above
    // governs) — does exactly what Escape/outside-click already do.
    document.getElementById('wizardXBtn').addEventListener('click', () => {
      wizardOverlay.classList.remove('open');
    });
  }
  export function wireWizardClose() {
    document.getElementById('wizardCloseBtn').addEventListener('click', () => {
      wizardOverlay.classList.remove('open');
      // "What's visible after the wizard is done" should be the plan itself,
      // not the input form they just finished with — on mobile, that means
      // landing on the Dashboard tab (harmless to call on desktop too, where
      // setMobileView has no visible effect; see the CSS note above).
      setMobileView('dashboard');
      // The guidance card is where the goals just chosen take effect.
      const card = document.getElementById('guidanceCard');
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card.classList.add('flash-highlight');
      setTimeout(() => card.classList.remove('flash-highlight'), 2600);
    });
  }

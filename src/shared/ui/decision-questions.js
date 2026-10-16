import { escapeHtml } from '../core/basics.js';
import { compactDecisionDelta } from '../core/compact-decision-delta.js';
import { switchToDashboardTab } from './mobile-view.js';
import { DECISION_QUESTIONS } from '#country/ui/seam-DECISION_QUESTIONS';
import { renderDecisionCompareTable } from '#country/core/seam-renderDecisionCompareTable';

  // A compact one-line preview shown right on each "Explore a question"
  // Only the 6 kind:'compare' questions get a preview — the 2 kind:'open'
  // ones (sensitivity, returns) don't compare two scenarios, they just hand
  // off to an existing card, so there's nothing to preview. Gated by
  // #decisionCard's own open state (see its 'toggle' listener and the
  // matching render() call below), same lazy-compute pattern already used
  // for the tornado/Roth-optimizer/Sankey cards — these are up to 6
  // questions × 2-3 simulate() calls each, cheap individually but pointless
  // work on every keystroke while the card is collapsed and invisible.
  export function renderDecisionQuestionPreviews() {
    Object.keys(DECISION_QUESTIONS).forEach((id) => {
      const q = DECISION_QUESTIONS[id];
      if (q.kind !== 'compare') return;
      const el = document.querySelector(`#decisionQuestions button[data-question="${id}"] .q-delta`);
      if (!el) return;
      el.textContent = compactDecisionDelta(q.run().rows);
    });
  }
  // "Explore a question" menu: each button either renders a compare-type
  // answer (a takeaway sentence + a small table, built from
  // DECISION_QUESTIONS' run()) or opens an existing card in place (an
  // open-type question, e.g. handing off to the sensitivity/tornado card
  // that already exists rather than duplicating it here).
  function renderDecisionQuestionAnswer(id) {
    const q = DECISION_QUESTIONS[id],
      answer = document.getElementById('decisionAnswer');
    document
      .querySelectorAll('#decisionQuestions button')
      .forEach((b) => b.classList.toggle('active', b.dataset.question === id));
    if (q.kind === 'open') {
      q.open();
      const note = q.note ? q.note() : '';
      answer.innerHTML = note ? `<p><b>${escapeHtml(note)}</b></p>` : '';
      answer.hidden = !note;
      return;
    }
    const { rows, sentence } = q.run();
    answer.innerHTML = `<p><b>${escapeHtml(sentence)}</b></p>` + renderDecisionCompareTable(rows);
    answer.hidden = false;
    // Same reasoning as the 'open' questions above: with 8 questions now in
    // the menu, the answer can render well below the fold (or, on mobile,
    // behind the Inputs tab) without ever coming into view on its own.
    switchToDashboardTab();
    answer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  export function wireDecisionCard() {
    // Same lazy-compute reasoning as the three toggle listeners above: the
    // per-button delta previews cost a handful of simulate() calls each, so
    // they're only worth computing once the "Explore a question" bubble is
    // actually expanded and visible.
    document.getElementById('decisionCard').addEventListener('toggle', (e) => {
      if (e.target.open) renderDecisionQuestionPreviews();
    });
  }
  export function wireDecisionQuestions() {
    document.getElementById('decisionQuestions').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-question]');
      if (!btn) return;
      renderDecisionQuestionAnswer(btn.dataset.question);
    });
  }

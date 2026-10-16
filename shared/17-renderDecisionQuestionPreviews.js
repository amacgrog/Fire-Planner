  // A compact one-line preview shown right on each "Explore a question"
  // Only the 6 kind:'compare' questions get a preview — the 2 kind:'open'
  // ones (sensitivity, returns) don't compare two scenarios, they just hand
  // off to an existing card, so there's nothing to preview. Gated by
  // #decisionCard's own open state (see its 'toggle' listener and the
  // matching render() call below), same lazy-compute pattern already used
  // for the tornado/Roth-optimizer/Sankey cards — these are up to 6
  // questions × 2-3 simulate() calls each, cheap individually but pointless
  // work on every keystroke while the card is collapsed and invisible.
  function renderDecisionQuestionPreviews() {
    Object.keys(DECISION_QUESTIONS).forEach((id) => {
      const q = DECISION_QUESTIONS[id];
      if (q.kind !== 'compare') return;
      const el = document.querySelector(`#decisionQuestions button[data-question="${id}"] .q-delta`);
      if (!el) return;
      el.textContent = compactDecisionDelta(q.run().rows);
    });
  }
  // Assigned by the mobile-tab setup further down; declared here (rather
  // than left to that block alone) so the 'open' questions below can flip
  // to the Dashboard tab before scrolling to a card that lives in
  // .content, which is display:none while the Inputs tab is active.
  let setMobileView = () => {};
  function switchToDashboardTab() {
    if (document.getElementById('workspace').dataset.mobileView === 'inputs') setMobileView('dashboard');
  }

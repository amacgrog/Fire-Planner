  [
    ['wizardAgeA', 'ageA'],
    ['wizardAgeB', 'ageB'],
    ['wizardIncomeA', 'incomeA'],
    ['wizardIncomeB', 'incomeB'],
    ['wizardRetireAgeA', 'retireAgeA'],
    ['wizardRetireAgeB', 'retireAgeB'],
    ['wizardTaxable', 'taxable'],
    ['wizardTraditional', 'traditional'],
    ['wizardRoth', 'roth'],
    ['wizardCash', 'cash'],
    ['wizardSpending', 'spending'],
  ].forEach(([wizardId, realId]) => {
    document.getElementById(wizardId).addEventListener('change', (e) => {
      const real = document.getElementById(realId);
      real.value = e.target.value;
      real.dispatchEvent(new Event('input', { bubbles: true }));
      real.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  const wizardOverlay = document.getElementById('wizardOverlay');
  let wizardStep = 1;
  function renderWizardStep() {
    document.getElementById('wizardStep1').hidden = wizardStep !== 1;
    document.getElementById('wizardStep2').hidden = wizardStep !== 2;
    document.getElementById('wizardTitle').textContent =
      wizardStep === 1 ? 'Get started: the basics' : 'A few optional questions';
    document.getElementById('wizardStepNote').textContent =
      wizardStep === 1
        ? "Step 1 of 2 — enter the essentials to get a projection running. Everything here is also in the sidebar, so there's nothing you can only set here."
        : "Step 2 of 2 — these can make your projection more realistic. Skip anything you're unsure about. Turning one off also hides its section in the sidebar and fully excludes it from the projection — your entered numbers for it are kept, so switching it back on restores them exactly.";
    document.getElementById('wizardBackBtn').hidden = wizardStep === 1;
    document.getElementById('wizardNextBtn').hidden = wizardStep === 2;
    document.getElementById('wizardCloseBtn').hidden = wizardStep === 1;
    // #wizardModal itself is the scrolling container (overflow:auto) — it's
    // one persistent element across both steps, never recreated, so its
    // scrollTop carries over from whatever step was showing before. Without
    // this, clicking "Next" from partway (or all the way) down a long Step 1
    // left Step 2 rendered already scrolled to that same position — often
    // right at the bottom, since the Next button itself sits at the very
    // end of Step 1. Reset on every step change (including the initial
    // open) so each step always starts at its own top.
    document.getElementById('wizardModal').scrollTop = 0;
  }
  document.getElementById('wizardBtn').addEventListener('click', () => {
    wizardStep = 1;
    renderWizardStep();
    wizardOverlay.classList.add('open');
  });
  document.getElementById('wizardNextBtn').addEventListener('click', () => {
    wizardStep = 2;
    renderWizardStep();
  });
  document.getElementById('wizardBackBtn').addEventListener('click', () => {
    wizardStep = 1;
    renderWizardStep();
  });
  document.getElementById('wizardCloseBtn').addEventListener('click', () => {
    wizardOverlay.classList.remove('open');
    // "What's visible after the wizard is done" should be the plan itself,
    // not the input form they just finished with — on mobile, that means
    // landing on the Dashboard tab (harmless to call on desktop too, where
    // setMobileView has no visible effect; see the CSS note above).
    setMobileView('dashboard');
  });
  wizardOverlay.addEventListener('click', (e) => {
    if (e.target === wizardOverlay) wizardOverlay.classList.remove('open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') wizardOverlay.classList.remove('open');
  });
  // Visible on both wizard steps (unlike wizardBackBtn/wizardNextBtn/
  // wizardCloseBtn, which the wizardStep hidden-toggling logic above
  // governs) — does exactly what Escape/outside-click already do.
  document.getElementById('wizardXBtn').addEventListener('click', () => {
    wizardOverlay.classList.remove('open');
  });
  // The tornado chart is only computed while expanded (it's a handful of
  // extra simulate() calls, cheap but pointless work while collapsed), so
  // opening it needs its own trigger since no input necessarily changed.
  document.getElementById('sensitivityCard').addEventListener('toggle', (e) => {
    if (e.target.open) render();
  });

  wireWizard();
  document.getElementById('wizardCloseBtn').addEventListener('click', () => {
    wizardOverlay.classList.remove('open');
    // "What's visible after the wizard is done" should be the plan itself,
    // not the input form they just finished with — on mobile, that means
    // landing on the Dashboard tab (harmless to call on desktop too, where
    // setMobileView has no visible effect; see the CSS note above).
    setMobileView('dashboard');
  });
  wireWizardDismiss();
  // The tornado chart is only computed while expanded (it's a handful of
  // extra simulate() calls, cheap but pointless work while collapsed), so
  // opening it needs its own trigger since no input necessarily changed.
  document.getElementById('sensitivityCard').addEventListener('toggle', (e) => {
    if (e.target.open) render();
  });

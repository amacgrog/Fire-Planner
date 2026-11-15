// Wires the first-run wizard checkboxes to the sidebar

  export function wireWizardCheckboxes() {
    // Wizard modal: a three-step guided setup (basics, balances, goals). Every wizard field proxies its real
    // sidebar control by driving it and dispatching a real input/change event, so all the existing
    // state-mutation/hide/re-render logic runs exactly once. Only the single-person checkbox is wired here;
    // the goal checkboxes are built and wired in wireWizard.
    [
      ['wizardSinglePerson', 'singlePerson'],
    ].forEach(([wizardId, realId]) => {
      document.getElementById(wizardId).addEventListener('change', (e) => {
        const real = document.getElementById(realId);
        real.checked = e.target.checked;
        real.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  export function wireWizardCheckboxes() {
    // Wizard modal: a two-step guided setup. Step 1 proxies the handful of
    // fields needed to get any projection running at all (single/partnered,
    // ages, income, retirement age, starting balances, spending); step 2 is the
    // existing optional-feature checklist. Every wizard field proxies its real
    // sidebar control by driving it and dispatching a real input/change event,
    // so all the existing state-mutation/hide/re-render logic runs exactly
    // once, from a single source of truth, whether set here or in the sidebar.
    [
      ['wizardLtcEnabled', 'ltcEnabled'],
      ['wizardAcaEnabled', 'acaEnabled'],
      ['wizardRothConvEnabled', 'rothConvEnabled'],
      ['wizardMegaBackdoor', 'megaBackdoor'],
      ['wizardGuardrailsEnabled', 'guardrailsEnabled'],
      ['wizardSinglePerson', 'singlePerson'],
    ].forEach(([wizardId, realId]) => {
      document.getElementById(wizardId).addEventListener('change', (e) => {
        const real = document.getElementById(realId);
        real.checked = e.target.checked;
        real.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

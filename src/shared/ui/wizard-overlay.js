  export const wizardOverlay = document.getElementById('wizardOverlay');
  // Steps are the [data-wizard-step] panels in document order; each carries its own
  // data-title and data-note (the "Step i of N" prefix is added here).
  export const wizardSteps = Array.from(document.querySelectorAll('#wizardModal [data-wizard-step]'));

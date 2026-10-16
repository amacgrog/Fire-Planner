  // load-time: looks up a static element; reads nothing a statement writes.
  export const wizardOverlay = document.getElementById('wizardOverlay');
  // load-time: looks up a static element; reads nothing a statement writes.
  // Steps are the [data-wizard-step] panels in document order; each carries its own
  // data-title and data-note (the "Step i of N" prefix is added here).
  export const wizardSteps = Array.from(document.querySelectorAll('#wizardModal [data-wizard-step]'));

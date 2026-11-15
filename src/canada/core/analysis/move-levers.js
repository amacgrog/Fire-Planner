// Canada move levers: the features a move can turn on, in display order, and when each is offered

  // load-time: freezes literal rows of strings and arrow functions; reads nothing
  export const MOVE_LEVERS = Object.freeze([
    Object.freeze({ key: 'meltdown', field: 'meltdownEnabled', label: 'Turn on the RRSP meltdown', when: (s) => !s.meltdownEnabled }),
    Object.freeze({ key: 'split', field: 'pensionSplitEnabled', label: 'Turn on pension income splitting', when: (s) => !s.pensionSplitEnabled && !s.singlePerson }),
    Object.freeze({ key: 'guardrails', field: 'guardrailsEnabled', label: 'Turn on guardrails', when: (s) => !s.guardrailsEnabled }),
  ]);

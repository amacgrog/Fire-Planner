// US move levers: the features a move can turn on, in display order, and when each is offered

  // load-time: freezes literal rows of strings and arrow functions; reads nothing
  export const MOVE_LEVERS = Object.freeze([
    Object.freeze({ key: 'conversions', field: 'rothConvEnabled', label: 'Turn on Roth conversions', when: (s) => !s.rothConvEnabled }),
    // the order needs the cliff plan
    Object.freeze({ key: 'order', field: 'withdrawalMixEnabled', label: 'Turn on the tax-aware withdrawal order', when: (s) => !s.withdrawalMixEnabled && s.cliffGuardEnabled }),
    Object.freeze({ key: 'guardrails', field: 'guardrailsEnabled', label: 'Turn on guardrails', when: (s) => !s.guardrailsEnabled }),
  ]);

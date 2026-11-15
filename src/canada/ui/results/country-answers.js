// Canada goal answers the shared job asks the country for: the RRSP meltdown at each bracket against none

import { meltdownAnswerSteps, meltdownAnswerText } from '../../core/analysis/meltdown-answer.js';

  // The meltdown brackets the sidebar offers, read once from #meltdownBracket's options (null until the first answer).
  let brackets = null;

  // load-time: freezes an object of generator functions; reads nothing.
  // Each unit is function* (state, ctxFor, base) -> { text, link: { target, label } }; `base` is the base unit's projection
  // verdict (base.selected the dashboard run). Yields 'run' after every projection.
  export const COUNTRY_ANSWERS = Object.freeze({
    convert: function* (s, ctxFor, base) {
      if (brackets === null) brackets = [...document.getElementById('meltdownBracket').options].map((o) => Number(o.value));
      const a = yield* meltdownAnswerSteps(s, ctxFor, brackets, base.selected);
      return {
        text: meltdownAnswerText(a, s),
        link: s.meltdownEnabled
          ? { target: 'card:rothOptimizerCard', label: 'See the meltdown table →' }
          : { target: 'field:meltdownEnabled', label: 'Turn it on in the sidebar →' },
      };
    },
  });

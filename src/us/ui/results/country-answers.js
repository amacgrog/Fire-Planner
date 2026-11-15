// US goal answers the shared job asks the country for: Roth conversions on against off, and the cliff plan's ACA steering

import { cloneState } from '../../../shared/core/analysis/scenario-helpers.js';
import { simulateWith } from '../../../shared/core/projection/runs.js';
import { acaAnswer, acaAnswerText, conversionAnswer, conversionAnswerText, stripAcaIntents } from '../../core/analysis/conversion-answer.js';
import { contextWithPlan, ownPlanContextFor } from '../../core/projection/store-context.js';
import { normalizeState } from '../inputs/normalize-state.js';
import { planName } from './roth-optimizer.js';

  // load-time: freezes an object of generator functions; reads nothing.
  // Each unit is function* (state, ctxFor, base) -> { text, link: { target, label } }; `base` is the base unit's projection
  // verdict (base.selected the dashboard run). Yields 'run' after a projection, 'plan-next' right before a cliff-plan search and
  // 'plan' right after it.
  export const COUNTRY_ANSWERS = Object.freeze({
    // Conversions on against off: the dashboard run is one side, the toggled inputs (with their own plan) the other.
    convert: function* (s, ctxFor, base) {
      const t = normalizeState({ ...cloneState(s), rothConvEnabled: !s.rothConvEnabled });
      yield 'plan-next';
      const tFor = ownPlanContextFor(t);
      yield 'plan';
      const tCtx = tFor(t);
      const tSim = simulateWith(tCtx);
      yield 'run';
      const dashCtx = ctxFor(s);
      const a = s.rothConvEnabled
        ? conversionAnswer(dashCtx, base.selected, tCtx, tSim, s.rothConvBracket)
        : conversionAnswer(tCtx, tSim, dashCtx, base.selected, s.rothConvBracket);
      return {
        text: conversionAnswerText(a, s, planName()),
        link: s.rothConvEnabled
          ? { target: 'card:rothOptimizerCard', label: 'See the conversion schedule →' }
          : { target: 'field:rothConvEnabled', label: 'Turn it on in the sidebar →' },
      };
    },
    // The ages the kept plan steers under an ACA line and the premium credit that keeps: one run of the plan without them.
    aca: function* (s, ctxFor, base) {
      if (!s.acaEnabled) {
        return {
          text: 'The ACA subsidy is off, so the plan does not model it.',
          link: { target: 'field:acaEnabled', label: 'Turn it on in the sidebar →' },
        };
      }
      const link = { target: 'card:moreResultsCard', label: 'See the cliff plan →' };
      // The dashboard's context carries the kept plan (cliffPlanStore.plan for the state).
      const ctx = ctxFor(s);
      if (!ctx.plan) return { text: 'The cliff plan is off, so no year is steered under an ACA line.', link };
      const stripped = simulateWith(contextWithPlan(s, stripAcaIntents(ctx.plan)));
      yield 'run';
      return { text: acaAnswerText(acaAnswer(ctx, base.selected, stripped)), link };
    },
  });

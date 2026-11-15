// The US conversion goal's answer: conversions on against off, the plan's bracket, ages and ACA holds

import { ageRanges } from '../../../shared/core/format/answer-text.js';
import { compact } from '../../../shared/core/format/numbers.js';
import { pricingContextFor } from '../../../shared/core/projection/run-source.js';
import { makePlan } from '../cliff-plan/plan-shape.js';
import { US_OBJECTIVES, gainInTodaysDollars, objectiveBreakdown } from '../optimizer/objectives.js';

  const isAcaLine = (line) => line === 'medicaid' || line === 'acaFloor' || line === 'aca400';

  // Conversions on (onCtx, onSim) against off (offCtx, offSim). `settingBracket` is the rothConvBracket input; the bracket the
  // engine converts at is the plan's when the plan was made for that setting (the card's rule).
  export function conversionAnswer(onCtx, onSim, offCtx, offSim, settingBracket) {
    const plan = onCtx.plan,
      moved = (r) => r.conversionGross ?? r.conversionAmount;
    return {
      gain: gainInTodaysDollars(US_OBJECTIVES.endValue, pricingContextFor(onCtx), onSim, offSim),
      depletedOn: onSim.depletedAge || null,
      depletedOff: offSim.depletedAge || null,
      bracket: plan && plan.bracket != null && plan.bracketFrom === settingBracket ? plan.bracket : settingBracket,
      ages: onSim.rows.filter((r) => moved(r) >= 1).map((r) => r.age),
      acaHeld: onSim.rows.filter((r) => r.convHeldBy === 'aca').length,
      sized: !!(plan?.conv && Object.keys(plan.conv).length),
    };
  }

  // The plan without the intents that steer under a Medicaid or ACA line.
  export function stripAcaIntents(plan) {
    const intents = {};
    for (const [age, it] of Object.entries(plan.intents)) if (!isAcaLine(it.line)) intents[age] = it;
    return makePlan({ ...plan, intents });
  }

  // The ages the plan steers under an ACA line, and the premium credit that keeps (today's dollars): `sim` is the plan's run,
  // `strippedSim` the run of stripAcaIntents(plan), both priced with `ctx`.
  export function acaAnswer(ctx, sim, strippedSim) {
    const ages = Object.keys(ctx.plan.intents)
      .filter((age) => isAcaLine(ctx.plan.intents[age].line))
      .map(Number)
      .sort((a, b) => a - b);
    return { ages, kept: objectiveBreakdown(ctx, strippedSim).healthcare - objectiveBreakdown(ctx, sim).healthcare };
  }

  // The conversion answer as one sentence; `planLabel` is "the cliff plan" or "the applied plan".
  export function conversionAnswerText(a, base, planLabel) {
    const setting = base.rothConvBracket;
    const what =
      (a.bracket === setting
        ? `converting to the top of the ${a.bracket}% bracket`
        : `converting to ${planLabel}'s ${a.bracket}% bracket, not your ${setting}%`) + (a.sized ? ' sized by year' : '');
    const held = a.acaHeld > 0 ? ` Held by the ACA line in ${a.acaHeld} year${a.acaHeld === 1 ? '' : 's'}.` : '';
    const earlier = a.depletedOn && (!a.depletedOff || a.depletedOn < a.depletedOff);
    if (earlier) return `No: conversions make the money run out at ${a.depletedOn} instead of ${a.depletedOff ?? 'lasting'}.${held}`;
    if (a.gain >= 500) return `Yes: ${what}, ages ${ageRanges(a.ages)}, leaves about ${compact(a.gain)} more after tax at the end (today's dollars).${held}`;
    if (a.gain <= -500) return `No: ${what} leaves about ${compact(-a.gain)} less after tax at the end.${held}`;
    return `Conversions make little difference here (under $500 after tax at the end).${held}`;
  }

  // The ACA answer as one sentence.
  export function acaAnswerText(a) {
    if (!a.ages.length) return 'No year needs steering under an ACA line.';
    return `The cliff plan stays under the ACA line at ${ageRanges(a.ages)}, keeping about ${compact(a.kept)} of premium credit (today's dollars).`;
  }

import { qualifyingChildCount } from '../../shared/core/lists-and-children.js';
import { state } from '../../shared/core/store.js';
import { taxYearOf } from './federal-deductions.js';

  export function acaExpectedPct(ratioFpl, enhanced) {
    if (enhanced) {
      if (ratioFpl <= 1.5) return 0;
      if (ratioFpl >= 4) return 8.5;
      return ((ratioFpl - 1.5) / (4 - 1.5)) * 8.5;
    }
    if (ratioFpl < 1.33) return 2.1;
    const pts = [
      [1.33, 3.14],
      [1.5, 4.19],
      [2.0, 6.6],
      [2.5, 8.44],
      [3.0, 9.96],
      [4.0, 9.96],
    ];
    for (let i = 1; i < pts.length; i++) {
      if (ratioFpl <= pts[i][0]) {
        const [x0, y0] = pts[i - 1],
          [x1, y1] = pts[i];
        return x1 === x0 ? y1 : y0 + ((y1 - y0) * (ratioFpl - x0)) / (x1 - x0);
      }
    }
    return 9.96;
  }
  // Which partners are on the individual (ACA / COBRA / retiree) health market
  // this year: retired, under 65 (Medicare covers them from 65), and without a
  // still-working spouse's employer plan to ride on. While a spouse works,
  // their plan is assumed to cover the retired partner only when the
  // employerCoversSpouse flag for that spouse is set (the default, which makes
  // the pre-65 premium start once BOTH have stopped working); unchecked, the
  // retired partner is on the market from their own retirement date. The
  // household size and MAGI used for the subsidy are the household's on a joint
  // return; per partner with two returns (healthcareCost).
  // Single-person and survivor cases have no spouse's plan to fall back on.
  export function acaEligibility(c) {
    const { age, ageB, workingA, workingB, singlePerson, isSurvivorPeriod, deceasedIsA, deceasedIsB } = c;
    if (singlePerson) return [!workingA && age < 65 && !(isSurvivorPeriod && deceasedIsA), false];
    if (isSurvivorPeriod)
      return [
        !deceasedIsA && !workingA && age < 65,
        !deceasedIsB && !workingB && ageB < 65,
      ];
    return [
      !workingA && age < 65 && (!workingB || !state.employerCoversSpouseB),
      !workingB && ageB < 65 && (!workingA || !state.employerCoversSpouseA),
    ];
  }
  // The ACA tax household: the filer, a spouse while both are alive, and every dependent child the
  // household claims (HealthCare.gov counts tax dependents regardless of age; the model's
  // dependents are the qualifying children of `dependentsInYear`: under 19, or under 24 if a
  // full-time student). The subsidy and the 400%-FPL conversion guard both read this, so they
  // cannot drift apart. The gross premium (`state.healthcare`) is not scaled for children: the
  // household enters the premium it actually pays.
  export function acaHouseholdSize(singlePerson, isSurvivorPeriod, yearIndex) {
    return (singlePerson || isSurvivorPeriod ? 1 : 2) + qualifyingChildCount(taxYearOf(yearIndex));
  }
  // The ACA subsidy is a function of this year's MAGI, which includes this
  // year's own discretionary withdrawals — but those are sized off the year's
  // spending need, which includes the premium the subsidy sets. Each engine
  // resolves that circularity by re-running the year body from a snapshot with
  // an updated estimate of the discretionary income until the estimate agrees
  // with what the withdrawals actually realized (within MAGI_ITER_TOL dollars).
  export const MAGI_ITER_MAX = 8,
    MAGI_ITER_TOL = 1;
  // Years that ended the MAGI iteration through the forced pass (7O follow-up F5), and years that hit the cap on a cost step with no
  // pass to force; planMissed: plan years (choose / apply) whose final realized MAGI missed the plan's target (a plan wins only
  // when it met its line, so this guards an invariant). Counted for the phase of the year that is kept. seFixed / seAlternative (E1c
  // decisions 10 and 11): years whose kept phase held the consistent 162(l) deduction / Rev. Proc. 2014-41's alternative calculation.
  export const magiStats = { forced: 0, unresolved: 0, planMissed: 0, seFixed: 0, seAlternative: 0 };
  // Cliff plan (spec 2026-10-07): what `apply` did with each intent (filled in by apply; cumulative, tests reset each key).
  export const planStats = { intentYears: 0, applied: 0, skippedSide: 0, skippedIneligible: 0, fallback: 0, absent: 0, rothShift: 0, irmaaStayUnders: 0, irmaaZeroSaving: 0 };
  export const cliffPlanCache = new Map(), // JSON of a swapped-in state -> its plan (planForState)
    CLIFF_PLAN_CACHE_MAX = 16;

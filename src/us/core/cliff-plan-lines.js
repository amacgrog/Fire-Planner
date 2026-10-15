import { ALL_FREE } from './withdrawal-mix-and-roth-accounts.js';

  // No plan this year (the natural draw).
  export const NO_PLAN = Object.freeze({ kind: 'none', magi: 0, label: '' });
  export const NO_PLANS = Object.freeze([]);
  // A line's family (cliff plan): 'aca' (medicaid, acaFloor, aca400), 'irmaa' (irmaa1 ... irmaa5) or 'tax' (the senior-deduction
  // and child-tax-credit phase-outs, never a candidate).
  export function lineFamily(id) {
    return id.startsWith('irmaa') ? 'irmaa' : id === 'senior' || id === 'ctc' ? 'tax' : 'aca';
  }
  // The year's candidate plans for the phased year (planMode 'choose'; spec 13.5-13.7 of the 3C design, section 4 of the cliff
  // plan), read off the converged natural year (c.natMagi, its conversion c.natConv, its cappable discretionary traditional
  // draw c.natTrad (wd.cappableTraditional: the bond reserve's uncapped draw is not cappable) and gains c.gain), at most three,
  // in this order:
  // - 'under': a cap just under a line at or below the natural MAGI, with NO conversion that year. Only at a real cliff
  //   (13.7 B): premium + IRMAA just over the line more than $1 above just under it (costNear, this year's premium and
  //   the IRMAA charged two years on). Tax kinks (the child-tax-credit and senior-deduction phase-outs) are not cliffs.
  //   The nearest such line, and (13.6) the line with the largest cliff when it is another one (ties go to the nearer
  //   line): the full premium can lift the natural MAGI over an IRMAA tier above the ACA 400% line. Each is offered
  //   only when the natural draw took traditional money the cap can limit and the natural MAGI less its conversion
  //   is still over that line: if only the conversion puts the year over a line the plan does nothing (the
  //   conversion ceiling sized it inside its tier on purpose), so it never spends Roth to make room for a conversion.
  // - 'fill': just over the nearest FLOOR above the natural MAGI (the first line in reach where this year's premium
  //   plus IRMAA is lower just over it than just under it: the Medicaid line with Medicaid declined, the 100% credit
  //   floor without Medicaid; just over a cliff, the 400% line or an IRMAA tier, costs more and is skipped), only
  //   with penalty-free traditional money (c.canFill).
  // Lines count only inside the reach: from the MAGI with no discretionary draw and no conversion (c.lo) to the
  // MAGI with the conversion and no draw plus REACH_GROSS_UP x the need (c.hi). c.thresholds is sorted by MAGI.
  // Each candidate carries its line's id and ret. Returns NO_PLANS when none.
  // The eligibility tests, shared by choose (yearPlanCandidates) and apply so the two cannot drift. c carries the converged
  // natural year: natTrad (its cappable traditional draw), natMagi, natConv, lo, hi, canFill. Which side of the natural MAGI a
  // line is on is tested by the caller.
  // A stay-under: the natural draw took traditional money the cap can limit, the natural MAGI less its conversion is over the
  // line, and the target is inside the reach.
  export function underEligible(t, c) {
    return c.natTrad > 0 && c.natMagi - c.natConv > t.magi && t.magi - 1 >= c.lo;
  }
  // A fill: penalty-free traditional money, and the target inside the reach.
  export function fillEligible(t, c) {
    return c.canFill && t.magi + 1 <= c.hi;
  }
  export function underPlanOf(t) {
    return { kind: 'under', magi: t.magi - 1, label: t.label, id: t.id, ret: t.ret };
  }
  export function fillPlanOf(t) {
    return { kind: 'fill', magi: t.magi + 1, label: t.label, id: t.id, ret: t.ret };
  }
  export function yearPlanCandidates(c) {
    let out = NO_PLANS;
    const gain = c.gain,
      costNear = (m) => c.premiumAt(m - c.magiBase - gain, gain) + c.irmaaAt(m - c.magiBase - gain, gain),
      offerUnder = (t) => underEligible(t, c),
      underOf = underPlanOf;
    let near = null,
      big = null,
      bigJump = 0;
    for (const t of c.thresholds) {
      if (t.magi > c.natMagi) break;
      if (t.magi - 1 < c.lo) continue;
      const jump = costNear(t.magi + 1) - costNear(t.magi - 1);
      if (jump <= 1) continue;
      near = t;
      if (jump >= bigJump) {
        big = t;
        bigJump = jump;
      }
    }
    if (near && offerUnder(near)) out = [underOf(near)];
    if (big && big !== near && offerUnder(big)) out = out === NO_PLANS ? [underOf(big)] : [out[0], underOf(big)];
    if (c.canFill) {
      for (const t of c.thresholds) {
        if (t.magi <= c.natMagi || !fillEligible(t, c)) continue;
        if (costNear(t.magi + 1) < costNear(t.magi - 1)) {
          const fill = fillPlanOf(t);
          out = out === NO_PLANS ? [fill] : [...out, fill];
          break;
        }
      }
    }
    return out;
  }
  // ---- Withdrawal building blocks ----
  export const TAXABLE_BASIS_KEY = { taxable: 'taxableBasis', bondTaxable: 'bondTaxableBasis' };
  // A year's discretionary withdrawal in progress. `need` is the cash still to
  // be raised; the other fields accumulate what the draws did, for tax, MAGI
  // and the cash-flow display. traditionalGross starts at the Roth conversion
  // (ordinary income already this year) and traditionalWithdrawn at the
  // mandatory distribution; traditionalWithdrawn / taxableWithdrawn fold the
  // bond-reserve buckets into their parent tax status (same tax treatment,
  // just parked in the reserve) so the Sankey does not undercount them.
  export function newWithdrawal({ bal, rothAccts, accts, seppActive, profile, conversionAmount, rmd, inh = null, inhRule = null }) {
    return {
      // E1e: the inherited ledger (null in a legacy run), the last-resort draws of the pass by post-remap slot, and the slot map and compiled
      // state rule the step reads (null without a ledger: nothing is allocated per pass in a legacy run).
      inh,
      inheritedGrossA: 0,
      inheritedGrossB: 0,
      inhPost: inh === null ? null : inh.post,
      inhRule,
      bal,
      seppActive,
      rothAccts,
      accts,
      status: ALL_FREE,
      penaltyAware: false,
      profile,
      need: 0,
      taxableGainGross: 0,
      traditionalGross: conversionAmount,
      traditionalWithdrawn: rmd,
      cappableTraditional: 0,
      taxableWithdrawn: 0,
      rothWithdrawn: 0,
      earlyPenalty: 0,
      mixCandidate: null,
      magiCap: null,
      onlyPartner: -1,
      taxAwareOrder: null,
    };
  }

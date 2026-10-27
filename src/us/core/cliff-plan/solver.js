// Per-year cliff solver: MAGI thresholds, lambda estimate, candidates, after-tax value

import { NO_DEPENDENTS, dependentsInYear, qualifyingChildCount } from '../../../shared/core/inputs/lists.js';
import { taxIndexFactor } from '../../../shared/core/projection/year-factors.js';
import { acaHouseholdSize, fplForHousehold } from '../healthcare/aca.js';
import { filingKey, SENIOR_DEDUCTION_LAST_YEAR, SENIOR_PHASE_START, taxYearOf, filingRow } from '../tax/federal-rules.js';
import { IRMAA_TIERS, magiForIrmaaLine, irmaaSurcharge, irmaaMagiOf } from '../healthcare/irmaa.js';
import { MEDICAID_RULES, medicaidLimit } from '../healthcare/medicaid-rules.js';
import { CTC_MAX_AGE, CTC_PHASE_START, taxFor } from '../tax/federal-tax.js';
import { returnStatusA, irmaaSsOf } from '../tax/social-security-tax.js';
import { pct } from '../../../shared/core/format/numbers.js';
import { rmdDivisor, rmdStartAge } from '../income/distributions.js';
import { BRACKET_CANDIDATES } from './plan-shape.js';

  // What the balances are worth after the taxes still owed on them: traditional at (1 - lambda), embedded
  // taxable gains at tauGain, Roth, cash, bond principal and home equity at face value.
  export function afterTaxValue(bal, lambda, tauGain) {
    const gain = Math.max(0, bal.taxable - bal.taxableBasis) + Math.max(0, bal.bondTaxable - bal.bondTaxableBasis);
    let v = bal.taxable + bal.bondTaxable - gain * tauGain + (bal.traditional + bal.bondTraditional) * (1 - lambda) + bal.roth + bal.bondRoth + bal.cash + bal.home;
    // E1e: the open inherited accounts (appended, and only when there are any: a legacy score is the same double).
    if (bal.inheritedTrad + bal.inheritedRoth > 0) v += bal.inheritedTrad * (1 - lambda) + bal.inheritedRoth;
    return v;
  }
  // load-time: freezes a literal object; reads nothing
  // No plan this year (the natural draw).
  export const NO_PLAN = Object.freeze({ kind: 'none', magi: 0, label: '', own: 0 });
  // load-time: freezes an empty array; reads nothing
  export const NO_PLANS = Object.freeze([]);
  // A line's family (cliff plan): 'aca' (medicaid, acaFloor, aca400), 'irmaa' (irmaa1 ... irmaa5) or 'tax' (the senior-deduction
  // and child-tax-credit phase-outs, never a candidate).
  export function lineFamily(id) {
    return id.startsWith('irmaa') ? 'irmaa' : id === 'senior' || id === 'ctc' ? 'tax' : 'aca';
  }
  // The year's candidate plans for the phased year (planMode 'choose'; spec 13.5-13.7 of the 3C design, section 4 of the cliff
  // plan), read off the converged natural year (c.natMagi, its conversion c.natConv, its cappable discretionary traditional
  // draw c.natTrad (wd.cappableTraditional: the bond reserve's uncapped draw is not cappable), the gain of its stock-account
  // taxable sales c.natGain (wd.cappableGain: what a cap can hold back) and gains c.gain), at most three,
  // in this order:
  // - 'under': a cap just under a line at or below the natural MAGI, with NO conversion that year. Only at a real cliff
  //   (13.7 B): premium + IRMAA just over the line more than $1 above just under it (costNear, this year's premium and
  //   the IRMAA charged two years on). Tax kinks (the child-tax-credit and senior-deduction phase-outs) are not cliffs.
  //   The nearest such line, and (13.6) the line with the largest cliff when it is another one (ties go to the nearer
  //   line): the full premium can lift the natural MAGI over an IRMAA tier above the ACA 400% line. Each is offered
  //   only when the natural draw took traditional money the cap can limit (or, on a household line, ret 'H', sold
  //   taxable stock at a gain the cap can hold back: Batch 5 step 4b, with no bound on the money that replaces it, owner
  //   ruling R0 (c); the trial's own iteration is the test) and the natural MAGI less its conversion
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
  // natural year: natTrad (its cappable traditional draw), natGain (its cappable gain), natMagi, natConv, lo, hi, canFill.
  // Which side of the natural MAGI a line is on is tested by the caller.
  // A stay-under: the natural draw took traditional money the cap can limit, or the line is the household's (ret 'H') and the
  // natural draw realized a gain the cap can hold back (not on a per-return line: its cap is translated with the traditional
  // share, toHousehold, while gains split half and half, returnMagis); the natural MAGI less its conversion is over the line;
  // and the target is inside the reach. A c with no natGain (an old test hook) reads as no gain.
  export function underEligible(t, c) {
    return (c.natTrad > 0 || (t.ret === 'H' && c.natGain > 0)) && c.natMagi - c.natConv > t.magi && t.magi - 1 >= c.lo;
  }
  // A fill: penalty-free traditional money, and the target inside the reach.
  export function fillEligible(t, c) {
    return c.canFill && t.magi + 1 <= c.hi;
  }
  // A plan's own is its target in the return's own MAGI (ret A / B; the household target for ret H): own - 1 under, own + 1 fill.
  export function underPlanOf(t) {
    return { kind: 'under', magi: t.magi - 1, label: t.label, id: t.id, ret: t.ret, own: t.own - 1 };
  }
  export function fillPlanOf(t) {
    return { kind: 'fill', magi: t.magi + 1, label: t.label, id: t.id, ret: t.ret, own: t.own + 1 };
  }
  // Did the year meet its plan (Batch 5 step 4d, R1 (a))? The household MAGI on the plan's side of its line, and for a
  // per-return intent (ret A / B, two-return years only) that return's own MAGI on its side of the return's own line: a line
  // is placed in household MAGI through the traditional share while gains split half and half, so the household test alone
  // can pass with the return over its own line. One predicate for choose (the trial record), apply and the row label.
  // magiA / magiB are read only for ret A / B (a caller passes 0, 0 for ret H). Every test is written in the positive form, so
  // a NaN MAGI never meets a plan.
  export function planMet(plan, realizedMagi, magiA, magiB) {
    if (plan.kind === 'under') {
      if (!(realizedMagi <= plan.magi + 1)) return false;
      return plan.ret === 'A' ? magiA <= plan.own + 1 : plan.ret === 'B' ? magiB <= plan.own + 1 : true;
    }
    if (!(realizedMagi >= plan.magi - 1)) return false;
    return plan.ret === 'A' ? magiA >= plan.own - 1 : plan.ret === 'B' ? magiB >= plan.own - 1 : true;
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
  // load-time: a literal profile that reads NO_DEPENDENTS, imported from a module outside any cycle
  // The future tax on one traditional dollar (lambda) and on one dollar of long-term gain (tauGain), read
  // from three synthetic future years: Partner A's first RMD year, a midpoint, and a survivor year (the year
  // after the first death: the survivor-modeling death year, else the earlier life expectancy) or the plan's
  // last year. Each walks today's traditional pool forward at the plan's real return, net of the traditional
  // share of this year's need (c.need, c.tradShare; both 0: no draws). A sample prices the traditional income
  // the walk assumes that year, the larger of the RMD on the owner's age and that year's draw (spec 13.2); if
  // the draws empty the pool before a sample year, the sample moves to the year that empties it. It adds Social
  // Security and pensions in this year's dollars and measures the marginal federal + state tax plus IRMAA (on
  // Medicare's MAGI, irmaaMagiOf: only the taxable part of Social Security; per person on two returns) over a step
  // of 10% of that income (at least $1,000), under this year's tax law and indexing.
  const LAMBDA_PROFILE = { filing: 'single', otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 0, ageB: null, singlePerson: true, invOrd: 0, invQual: 0, propertyTax: 0, rent: 0, ownerShareA: 1, k401FracA: 0, k401FracB: 0, k401DrawFracA: 0, k401DrawFracB: 0, conv: 0, convK401FracA: 0, convK401FracB: 0, mortgageInterest: 0, medicalExpense: 0, year: 0, dependents: NO_DEPENDENTS, seOn: false };
  // Cliff plan (spec sections 3 and 5): chosen once per render on the deterministic projection. Candidates: the chooser's
  // whole plan (its own run: apply would reproduce it exactly), the ACA-family and IRMAA-family subsets when both families
  // appear, and no steering. Rule A (Batch 5 step 4b, decision 9): `a` never replaces `b` when it depletes or first draws on
  // home equity earlier (null or absent: never, the latest for both); it wins when it is later on either (and earlier on
  // neither); both equal, the objective's score (the ending after-tax value by default; Batch 5 step 4a: the measure's `score`,
  // which is the value for endValue) by more than $1 decides both ways, then fewer intents. The running best starts at no
  // steering, so the kept family never depletes or first draws on the house earlier than it, by construction (the automatic
  // plan's strict chaining; Optimize's bracketEvenBest ranks depletion before the home draw, unchanged).
  export function planCandidateBetter(a, b) {
    const late = (x) => (x == null ? Infinity : x);
    const ad = late(a.depletedAge),
      bd = late(b.depletedAge),
      ah = late(a.homeDrawAge),
      bh = late(b.homeDrawAge);
    if (ad < bd || ah < bh) return false;
    if (ad > bd || ah > bh) return true;
    if (a.score > b.score + 1) return true;
    if (b.score > a.score + 1) return false;
    return a.n < b.n;
  }
  // The bracket search's rank (Batch 5 step 3a, spec A3, owner decisions 9 and 14): `c` replaces the running best only when it
  // depletes no earlier and first draws on home equity no earlier (null: never, the latest for both); then it wins when it
  // depletes later or first draws on the house later, or, both equal, when its score (the after-tax end value by default) is
  // higher by more than 0.1% of the best's (at least $1). So a plan that lasts longer only by selling the house sooner is never kept.
  export function bracketCandidateBetter(c, best) {
    const cd = c.depletedAge === null ? Infinity : c.depletedAge,
      bd = best.depletedAge === null ? Infinity : best.depletedAge,
      ch = c.homeDrawAge === null ? Infinity : c.homeDrawAge,
      bh = best.homeDrawAge === null ? Infinity : best.homeDrawAge;
    if (cd < bd || ch < bh) return false;
    if (cd > bd || ch > bh) return true;
    return c.score > best.score + Math.max(1, 0.001 * Math.abs(best.score));
  }
  // The even bracket rank (Batch 5 step 4a, spec 4.5, decision 6; computeCliffPlan's `rankEvenly`): an argmax over every
  // bracket's best entry, with no running best, so the kept bracket does not depend on the search order. The latest depletion
  // (null: never), then of those the latest first home draw (null: never), then the top score; among the entries within
  // max($1, 0.1% of the top score) of it, the one at `tieBracket` when there is one, else the lowest bracket (BRACKET_CANDIDATES
  // order, never the list's order).
  export function bracketEvenBest(entries, tieBracket) {
    const late = (x) => (x === null ? Infinity : x);
    let dep = -Infinity,
      home = -Infinity,
      top = -Infinity;
    for (const e of entries) if (late(e.depletedAge) > dep) dep = late(e.depletedAge);
    for (const e of entries) if (late(e.depletedAge) === dep && late(e.homeDrawAge) > home) home = late(e.homeDrawAge);
    const group = entries.filter((e) => late(e.depletedAge) === dep && late(e.homeDrawAge) === home);
    for (const e of group) if (e.score > top) top = e.score;
    const tol = Math.max(1, 0.001 * Math.abs(top)),
      tied = group.filter((e) => !(top - e.score > tol));
    const atTie = tied.find((e) => e.bracket === tieBracket);
    if (atTie) return atTie;
    let low = tied[0];
    for (const e of tied) if (BRACKET_CANDIDATES.indexOf(e.bracket) < BRACKET_CANDIDATES.indexOf(low.bracket)) low = e;
    return low;
  }
  // The kept bracket over each bracket's best (entries in search order, the user's bracket first; each carries `bracket`,
  // `depletedAge`, `homeDrawAge` and `score`): with `rankEvenly`, bracketEvenBest's; otherwise the strict-win chaining from the
  // first entry (bracketCandidateBetter replaces the running best).
  export function keptBracketOf(entries, rankEvenly, tieBracket) {
    if (rankEvenly) return bracketEvenBest(entries, tieBracket).bracket;
    let kept = entries[0];
    for (let i = 1; i < entries.length; i++) if (bracketCandidateBetter(entries[i], kept)) kept = entries[i];
    return kept.bracket;
  }
  // The whole-plan check of the order lever (Batch 5 step 4c, A2): the lever plan's kept candidate stands only when it is the
  // toggle-off plan's own kept candidate or beats it by planCandidateBetter (the bracket rank is not a total order, so a lifted
  // bracket best can move the kept bracket to one with an earlier depletion or first home draw than toggle off's).
  export function leverPlanStands(leverBest, offBest) {
    return leverBest === offBest || planCandidateBetter(leverBest, offBest);
  }
  // The stored plan's verdict against the automatic plan's best (Batch 5 step 4a, spec 4.3; Optimize reuses it): measures
  // `{ depletedAge, homeDrawAge, score }`, both scored on the stored plan's objective. 'depletes' / 'home' when the stored plan
  // runs out / first draws on home equity earlier (null: never, the latest), checked in that order; 'better' when it is later
  // on either, or scores higher by more than max($1, 0.1% of its own |score|); 'score' when the automatic plan scores higher by
  // more than that; else 'tie' (which keeps the stored plan, the user's applied choice).
  export function storedPlanVerdict(stored, auto) {
    const sd = stored.depletedAge === null ? Infinity : stored.depletedAge,
      ad = auto.depletedAge === null ? Infinity : auto.depletedAge,
      sh = stored.homeDrawAge === null ? Infinity : stored.homeDrawAge,
      ah = auto.homeDrawAge === null ? Infinity : auto.homeDrawAge;
    if (sd < ad) return 'depletes';
    if (sh < ah) return 'home';
    if (sd > ad || sh > ah) return 'better';
    const tol = Math.max(1, 0.001 * Math.abs(stored.score));
    if (stored.score > auto.score + tol) return 'better';
    if (auto.score > stored.score + tol) return 'score';
    return 'tie';
  }
  // ---- Per-year solver (Batch 3C) ----------------------------------------------------------------------
  // Each year with a withdrawal, the solver may test a few candidates (a MAGI target just under a line or
  // just over a floor, the stock-account order, whose accounts fund the draw) by dry-running the year's
  // real withdrawal, and keeps the one that leaves the most after-tax wealth, with traditional dollars
  // worth (1 - lambda). See docs/superpowers/specs/2026-10-06-per-year-solver-3c-design.md.
  export const SOLVER_LAMBDA_MULT = 1,
    REACH_GROSS_UP = 2,
    LAMBDA_MAX = 0.6,
    TAU_GAIN_MAX = 0.5;
  // load-time: freezes an empty array; reads nothing
  // The year's federal MAGI lines, in household MAGI: the ACA floor (100%), the Medicaid line and the 400%
  // cliff for partners on the individual market; the IRMAA tier edges from 63 (retired); the senior-
  // deduction phase-out start (65+, through 2028); the child-tax-credit phase-out start. With two returns
  // each return's line is translated into household MAGI through that return's share of the traditional
  // draw (the solver prices candidates with the real functions, so the translation only places them).
  // State-law cliffs are priced by taxFor but are not candidates (documented gap).
  // With c.lo / c.hi (the year's reach) only the lines in (lo, hi] are kept, the only ones the solver uses, and a
  // year with none returns a shared empty list (the skip path allocates no line objects).
  export const NO_THRESHOLDS = Object.freeze([]);
  export function magiThresholds(ctx, c) {
    const inputs = ctx.inputs,
      out = [],
      y = c.year,
      taxYear = taxYearOf(ctx, y),
      lo = c.lo === undefined ? -Infinity : c.lo,
      hi = c.hi === undefined ? Infinity : c.hi,
      // own: the line in the return's own MAGI (ret A / B, before toHousehold); a household line (ret H) owns its magi.
      add = (magi, label, id, ret, family, own = magi) => {
        if (Number.isFinite(magi) && magi > 0 && magi > lo && magi <= hi) out.push({ magi, label, id, ret, family, own });
      },
      toHousehold = (line, m, frac) => (frac > 0 ? c.preMagi + (line - m) / frac : NaN),
      shareA = c.profile.ownerShareA === undefined ? 0.5 : c.profile.ownerShareA,
      acaLines = (fpl, put) => {
        const mcd = medicaidLimit(inputs.stateTax);
        if (mcd > 0) put(fpl * mcd, 'Medicaid line', 'medicaid');
        put(fpl * MEDICAID_RULES.ptcFloor, 'ACA credit floor (100%)', 'acaFloor');
        if (!inputs.acaEnhanced) put(fpl * 4, 'ACA 400% line', 'aca400');
      },
      kids = qualifyingChildCount(inputs, taxYear);
    if (inputs.acaEnabled && (c.acaEligibleA || c.acaEligibleB)) {
      if (c.twoReturns) {
        if (c.acaEligibleA) acaLines(fplForHousehold(ctx, 1 + kids, y), (line, label, id) => add(toHousehold(line, c.preMagiA, shareA), label, id, 'A', 'aca', line));
        if (c.acaEligibleB) acaLines(fplForHousehold(ctx, 1, y), (line, label, id) => add(toHousehold(line, c.preMagiB, 1 - shareA), label, id, 'B', 'aca', line));
      } else acaLines(fplForHousehold(ctx, acaHouseholdSize(ctx, c.singlePerson, c.isSurvivorPeriod, y), y), (line, label, id) => add(line, label, id, 'H', 'aca'));
    }
    // IRMAA: the surcharge this year's MAGI sets is charged two years on, to the partners on Medicare then, on this year's
    // return's filing status (the return SSA will read, E3); a caller may pass those (c.irmaa: { filing, a, b }). The lines sit on the tiers of the year
    // the surcharge is charged, estimated as irmaaAt estimates them: this year's edge times c.irmaaGrowth (default 1;
    // the year loop passes irmaaGrowth2). That is where the charge jumps, so that is where a stay-under saves money.
    // E3: a caller may pass c.irmaaGrowthA / c.irmaaGrowthB (two returns, per return); a year with an in-year IRMAA
    // appeal candidate passes growth 1 (this year's edges).
    // (The conversion ceiling, irmaaTierCeiling, keeps this year's tiers: the safe side there; Batch 5 revisits it.)
    // The edges are Medicare's MAGI (only the taxable part of Social Security), translated into the engine's MAGI with
    // magiForIrmaaLine on this year's return (its benefit and filing status); the tier table is the charged year's.
    const ir = c.irmaa,
      irmaaA = ir ? ir.a : !c.workingA && c.age >= 63 && !(c.isSurvivorPeriod && c.deceasedIsA),
      irmaaB = ir ? ir.b : !c.singlePerson && !c.workingB && c.ageB >= 63 && !(c.isSurvivorPeriod && c.deceasedIsB);
    if (irmaaA || irmaaB) {
      const g = c.irmaaGrowth === undefined ? 1 : c.irmaaGrowth,
        p = c.profile,
        ssH = irmaaSsOf(p),
        stA = returnStatusA(p.dependents);
      if (c.twoReturns) {
        const f = taxIndexFactor(ctx, y),
          gA = c.irmaaGrowthA === undefined ? g : c.irmaaGrowthA, // E3 (spec 5.5): per return
          gB = c.irmaaGrowthB === undefined ? g : c.irmaaGrowthB;
        let k = 0;
        for (const [edge] of IRMAA_TIERS[filingKey('single', 'irmaa')]) {
          if (edge < Infinity) k++;
          if (irmaaA && edge < Infinity) {
            const own = magiForIrmaaLine(edge * f * gA, p.ssA || 0, stA);
            add(toHousehold(own, c.preMagiA, shareA), 'IRMAA tier', 'irmaa' + k, 'A', 'irmaa', own);
          }
          if (irmaaB && edge < Infinity) {
            const own = magiForIrmaaLine(edge * f * gB, p.ssB || 0, 'single');
            add(toHousehold(own, c.preMagiB, 1 - shareA), 'IRMAA tier', 'irmaa' + k, 'B', 'irmaa', own);
          }
        }
      } else {
        const f = taxIndexFactor(ctx, y);
        let k = 0;
        for (const [edge] of IRMAA_TIERS[filingKey(ir ? ir.filing : c.filing, 'irmaa')]) if (edge < Infinity) add(magiForIrmaaLine(edge * f * g, ssH, c.filing), 'IRMAA tier', 'irmaa' + ++k, 'H', 'irmaa');
      }
    }
    if (taxYear <= SENIOR_DEDUCTION_LAST_YEAR && (c.age >= 65 || (!c.singlePerson && c.ageB >= 65)))
      add(SENIOR_PHASE_START[filingKey(c.twoReturns ? 'single' : c.filing, 'senior')], 'senior deduction phase-out', 'senior', 'H', 'tax');
    if (dependentsInYear(inputs, taxYear).some((d) => d.age <= CTC_MAX_AGE))
      add(CTC_PHASE_START[filingKey(c.twoReturns ? 'single' : c.filing, 'ctc')], 'child tax credit phase-out', 'ctc', 'H', 'tax');
    if (!out.length) return NO_THRESHOLDS;
    out.sort((a, b) => a.magi - b.magi);
    const deduped = [];
    // Two lines within $1 are one line. Keep the earlier one, except that a cliff line (aca or irmaa family) replaces a
    // tax-family line (senior, ctc): those are priced by taxFor and are never candidates, so an intent must not name one.
    for (const t of out) {
      const last = deduped[deduped.length - 1];
      if (!last || t.magi - last.magi > 1) deduped.push(t);
      else if (last.family === 'tax' && t.family !== 'tax') deduped[deduped.length - 1] = t;
    }
    return deduped;
  }
  export function lambdaEstimate({ tradPool, year, singlePerson, isSurvivorPeriod, deceasedIsA, deathYear, factor, need = 0, tradShare = 0, mult = 1, ctx }) {
    const inputs = ctx.inputs,
      real = (1 + pct(inputs.returnRate)) / (1 + pct(inputs.inflation)) - 1,
      endYear = singlePerson ? inputs.lifeExpectancyA - inputs.ageA : Math.max(inputs.lifeExpectancyA - inputs.ageA, inputs.lifeExpectancyB - inputs.ageB);
    let firstDeath = Infinity,
      aDiesFirst = false;
    if (!singlePerson && !isSurvivorPeriod) {
      if (deathYear < Infinity) {
        firstDeath = deathYear;
        aDiesFirst = deceasedIsA;
      } else {
        const dA = inputs.lifeExpectancyA - inputs.ageA,
          dB = inputs.lifeExpectancyB - inputs.ageB;
        if (dA !== dB) {
          firstDeath = Math.min(dA, dB);
          aDiesFirst = dA < dB;
        }
      }
    }
    const y1 = Math.max(year, rmdStartAge(ctx, inputs.ageA) - inputs.ageA),
      y3 = Math.max(year, firstDeath < endYear ? firstDeath + 1 : endYear);
    const samples = y1 > y3 ? [y3, y3, y3] : [y1, Math.round((y1 + y3) / 2), y3];
    const P = LAMBDA_PROFILE,
      ssOf = (p, a) => (a >= inputs['ssStartAge' + p] ? inputs['ssMonthly' + p] * 12 : 0) * factor,
      pensionOf = (p, a) =>
        (inputs.pensionCoverage === 'both' || inputs.pensionCoverage === p.toLowerCase() || (p === 'A' && singlePerson)) && a >= inputs['pensionStartAge' + p] ? inputs['pensionYearly' + p] * factor : 0;
    // Note 1 (spec 13.1): walk the pool forward in real dollars net of the traditional share of each year's need
    // (this year's dollars); Social Security and pensions that start later take over part of the need. The walk
    // uses the household's benefits even past a death (close enough for an estimate; the sample's own income
    // below uses the survivor's). 13.2: walkTo(ys0) returns [year priced, pool at the start of that year grown
    // one year, that year's draw]; if a year's draw empties the pool before ys0, that year is priced (one more
    // dollar left today would be spent there).
    const incomeAt = (y) => ssOf('A', inputs.ageA + y) + pensionOf('A', inputs.ageA + y) + (singlePerson ? 0 : ssOf('B', inputs.ageB + y) + pensionOf('B', inputs.ageB + y));
    const incomeNow = incomeAt(year),
      drawIn = (y) => tradShare * Math.max(0, need - Math.max(0, incomeAt(y) - incomeNow));
    const walkTo = (ys0) => {
      let pool = tradPool;
      for (let y = year + 1; y <= ys0; y++) {
        const before = pool * (1 + real),
          d = drawIn(y);
        if (y === ys0 || before <= d) return [y, before, d];
        pool = before - d;
      }
      return [ys0, tradPool, drawIn(year)];
    };
    let moved = false,
      rateSum = 0,
      tauSum = 0;
    for (const ys0 of samples) {
      // With need 0 or tradShare 0 this is B2's plain compounding and no draw, to the bit.
      const [ys, trad, draw] = need > 0 && tradShare > 0 ? walkTo(ys0) : [ys0, tradPool * Math.pow(1 + real, Math.max(0, ys0 - year)), 0];
      if (ys !== ys0) moved = true;
      const ageAs = inputs.ageA + ys,
        ageBs = inputs.ageB + ys,
        survivorIsB = isSurvivorPeriod ? deceasedIsA : ys > firstDeath && aDiesFirst,
        onePerson = singlePerson || isSurvivorPeriod || ys > firstDeath;
      let ownerAge, startAge;
      if (onePerson && survivorIsB) {
        ownerAge = ageBs;
        startAge = rmdStartAge(ctx, inputs.ageB);
        P.ssA = Math.max(ssOf('A', ageAs), ssOf('B', ageBs));
        P.pensionA = pensionOf('B', ageBs);
        P.ageA = ageBs;
      } else {
        ownerAge = ageAs;
        startAge = rmdStartAge(ctx, inputs.ageA);
        P.ssA = onePerson && !singlePerson ? Math.max(ssOf('A', ageAs), ssOf('B', ageBs)) : ssOf('A', ageAs);
        P.pensionA = pensionOf('A', ageAs);
        P.ageA = ageAs;
      }
      if (onePerson) {
        P.singlePerson = true;
        P.filing = 'single';
        P.ssB = 0;
        P.pensionB = 0;
        P.ageB = null;
        P.ownerShareA = 1;
      } else {
        P.singlePerson = false;
        P.filing = (inputs.marryLater ? ageAs >= inputs.marriageAgeA : inputs.filingStatus === 'mfj') ? 'mfj' : 'single';
        P.ssB = ssOf('B', ageBs);
        P.pensionB = pensionOf('B', ageBs);
        P.ageB = ageBs;
        P.ownerShareA = 0.5;
      }
      P.otherA = P.pensionA;
      P.otherB = P.pensionB;
      P.year = year;
      const rmd = ownerAge >= startAge ? trad / rmdDivisor(ownerAge) : 0,
        // 13.2: the traditional income the walk assumes this year (the RMD alone when there are no draws:
        // Math.max(rmd, Math.min(trad, 0)) is rmd itself).
        tradIncome = Math.max(rmd, Math.min(trad, draw)),
        step = Math.max(1000, 0.1 * tradIncome),
        t0 = taxFor(ctx, P, 0, tradIncome),
        t1 = taxFor(ctx, P, 0, tradIncome + step),
        g1 = taxFor(ctx, P, step, tradIncome);
      let irmaaStep;
      if (!onePerson && !filingRow(P.filing).joint) {
        // 13.2 item 1: two returns, IRMAA per person on their own MAGI (half the traditional income each, the
        // profile's ownerShareA 0.5) against the single tiers; the step is split half to each.
        const half = tradIncome / 2,
          hs = step / 2,
          mA = P.otherA + P.ssA + half,
          mB = P.otherB + P.ssB + half;
        irmaaStep =
          (P.ageA >= 65 ? irmaaSurcharge(ctx, irmaaMagiOf(mA + hs, P.ssA, 'single'), 'single', year) - irmaaSurcharge(ctx, irmaaMagiOf(mA, P.ssA, 'single'), 'single', year) : 0) +
          (P.ageB >= 65 ? irmaaSurcharge(ctx, irmaaMagiOf(mB + hs, P.ssB, 'single'), 'single', year) - irmaaSurcharge(ctx, irmaaMagiOf(mB, P.ssB, 'single'), 'single', year) : 0);
      } else {
        const magi = P.otherA + P.otherB + P.ssA + P.ssB + tradIncome,
          onMedicare = (P.ageA >= 65 ? 1 : 0) + (!onePerson && P.ageB >= 65 ? 1 : 0);
        irmaaStep = onMedicare * (irmaaSurcharge(ctx, irmaaMagiOf(magi + step, P.ssA + P.ssB, P.filing), P.filing, year) - irmaaSurcharge(ctx, irmaaMagiOf(magi, P.ssA + P.ssB, P.filing), P.filing, year));
      }
      rateSum += (t1 - t0 + irmaaStep) / step;
      tauSum += (g1 - t0) / step;
    }
    return {
      lambda: Math.min(LAMBDA_MAX, Math.max(0, (SOLVER_LAMBDA_MULT * mult * rateSum) / 3)),
      tauGain: Math.min(TAU_GAIN_MAX, Math.max(0, tauSum / 3)),
      movedSample: moved,
    };
  }
  // The plan's ending value (cliff plan, spec section 5): Roth, taxable (US heirs get a stepped-up basis: no gains tax),
  // cash and home equity at face value; traditional money net of the income tax it carries, priced as ten slices of the
  // balance, each added to the last year's own return (its law, its filing status: single after a death). Not modeled:
  // heirs' own rates, the federal estate tax, state estate and inheritance taxes. `ctx` is the context of the run that made
  // `sim` (its tax year and, for a historical path, that path's tax factors), so the last year is priced under that run's law.
  // The ten-slice tax on the traditional balance at the end (`max(0, tax)`), split out of afterTaxEndValueUS so the
  // objective breakdown can show it. 0 when there is no estate profile or no traditional money.
  export function endTaxUS(ctx, sim) {
    const e = sim.estate;
    if (!e || !e.profile) return 0;
    const T = e.traditional;
    let tax = 0;
    if (T > 0) tax = 10 * (taxFor(ctx, e.profile, e.lastGain, e.lastTrad + T / 10) - taxFor(ctx, e.profile, e.lastGain, e.lastTrad));
    return Math.max(0, tax);
  }
  export function afterTaxEndValueUS(ctx, sim) {
    const e = sim.estate;
    if (!e || !e.profile) return 0;
    const T = e.traditional;
    return e.roth + e.taxable + e.cash + e.homeEquity + T - endTaxUS(ctx, sim);
  }

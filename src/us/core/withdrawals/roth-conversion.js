// US Roth conversion: the bracket fill, the MAGI ceiling and applying it

import { accountsConvert } from '../accounts/account-ledger.js';
import { taxIndexFactor } from '../../../shared/core/projection/year-factors.js';
import { FILING, filingRow, taxYearOf, itemizedDeduction, standardDeduction, bracketCeilingReal } from '../tax/federal-rules.js';
import { taxableSocialSecurity, returnStatusA, irmaaSsOf } from '../tax/social-security-tax.js';
import { qualifyingChildCount } from '../../../shared/core/inputs/lists.js';
import { acaHouseholdSize, fplForHousehold } from '../healthcare/aca.js';
import { magiForIrmaaLine, irmaaTierCeiling, irmaaMagiOf, irmaaRoomFor } from '../healthcare/irmaa.js';
import { rothAccountsConvert } from '../accounts/roth-ledger.js';
import { MAGI_ITER_TOL } from '../projection/engine-state.js';

  // Moves a Roth conversion from the traditional balance (then the traditional
  // bond bucket) into Roth and records it in the ledger, which tracks the 5-year
  // seasoning clock for penalty-free access. The part taken from the bond bucket
  // lands in the Roth bond bucket (Batch 5 step 5b): a conversion is a tax event,
  // not a move from the bond reserve into stocks.
  export function applyRothConversion(bal, rothAccts, accts, conversionAmount, year, seppActive) {
    if (conversionAmount <= 0) return;
    const to = accountsConvert(accts, bal.traditional + bal.bondTraditional, bal.roth + bal.bondRoth, conversionAmount, seppActive);
    const fromTradConv = Math.min(bal.traditional, conversionAmount),
      fromBondConv = conversionAmount - fromTradConv;
    bal.traditional -= fromTradConv;
    bal.bondTraditional = Math.max(0, bal.bondTraditional - fromBondConv);
    bal.roth += fromTradConv;
    bal.bondRoth += fromBondConv;
    rothAccountsConvert(rothAccts, to, year);
  }
  // The conversion that fills ordinary income to the top of the `bracketPct` bracket (0: none), at most
  // maxAvailable. solveRothConversion below resolves the bracket (schedule, override or setting) and calls it.
  // drawBelow: ordinary income the year's discretionary traditional draw is estimated to add below the conversion (the pass's
  // estTrad). Every engine path passes it (a sized bracket target since Batch 5 step 5b piece 3; the plain fill and the sized
  // fallback since the Batch 5 follow-ups, S1). It is added to the fill's other income only when non-zero, so a call with 0
  // (a pass whose estTrad is 0) gives the same doubles as before the draw was counted.
  export function solveRothConversionTop(ctx, profile, maxAvailable, yearIndex, bracketPct, drawBelow) {
    if (maxAvailable <= 0 || bracketPct === 0) return 0;
    const factor = taxIndexFactor(ctx, yearIndex),
      filing = FILING[profile.filing] ? profile.filing : 'single',
      joint = filingRow(filing).joint;
    // Conservative lower bound on the deduction: age-adjusted standard, or the
    // property tax (under the SALT cap) plus mortgage interest if larger. State
    // income tax and the senior deduction depend on the conversion itself, so
    // they are left out (a slightly smaller deduction converts a bit less).
    const deduction = Math.max(
        standardDeduction(ctx, filing, yearIndex, joint ? [profile.ageA, profile.ageB] : [profile.ageA]),
        itemizedDeduction(ctx, yearIndex, 0, 0, profile.propertyTax || 0, profile.mortgageInterest || 0),
      ),
      targetGrossOrdinary = bracketCeilingReal(bracketPct, filing) * factor + deduction;
    const ordinaryAt = (conv) => {
      if (joint) {
        // E1c (decision 8c): AGI is lower by the 162(l) deduction; QBI is not seen by the fill.
        let other = profile.otherA + profile.otherB - ((profile.seHealthA || 0) + (profile.seHealthB || 0)) + conv;
        // E1e (decision 18): the pass's last-resort estimate, appended only when non-zero.
        if (profile.inhEstA || profile.inhEstB) other += (profile.inhEstA || 0) + (profile.inhEstB || 0);
        if (drawBelow !== 0) other += drawBelow;
        const taxableSS = taxableSocialSecurity(profile.ssA + profile.ssB, other, filing);
        return other + taxableSS;
      }
      let other = profile.otherA + (profile.otherB || 0) - ((profile.seHealthA || 0) + (profile.seHealthB || 0)) + conv;
      if (profile.inhEstA || profile.inhEstB) other += (profile.inhEstA || 0) + (profile.inhEstB || 0);
      if (drawBelow !== 0) other += drawBelow;
      const taxableSS = taxableSocialSecurity(profile.ssA + (profile.ssB || 0), other, filing);
      return other + taxableSS;
    };
    if (ordinaryAt(0) >= targetGrossOrdinary) return 0;
    let lo = 0,
      hi = maxAvailable;
    if (ordinaryAt(hi) <= targetGrossOrdinary) return hi;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (ordinaryAt(mid) < targetGrossOrdinary) lo = mid;
      else hi = mid;
    }
    return lo;
  }
  // Highest MAGI a Roth conversion
  // may reach this year without a cost cliff, or Infinity if nothing binds:
  //  - the 400%-FPL ACA subsidy cliff (non-enhanced ACA, for partners on the
  //    individual market), and
  //  - the next Medicare IRMAA tier. IRMAA is assessed two years later off
  //    this year's MAGI, so it only binds once a retired partner is within two
  //    years of 65 (or on Medicare); it keeps Medicare's MAGI (irmaaMagiOf: only
  //    the taxable part of Social Security, from `profile`) inside its current
  //    tier, translated back into the engine's MAGI (magiForIrmaaLine). The ACA
  //    line is on the engine's MAGI (the ACA definition).
  // The ACA line caps a conversion only while the year's pre-conversion MAGI is
  // at or under it (Batch 5 follow-ups S3): over it the credit is already lost,
  // so the line holds nothing. Household: the line caps when preConvMagi is at
  // or under it; two returns: a return over its own line has no ACA room
  // (Infinity), and a return at or under its line keeps its room. Where it caps,
  // it caps at the line less MAGI_ITER_TOL ($1, Task 8b), so a converged year
  // lands at or under the line, not cents over it; the over test reads the line.
  // S3 Task 8d (ruling 19, the ruling-11 probe): `acaShown` (bit 1: the household's line, or return A's on two returns; bit 2:
  // return B's; default 3, S3's doubles) says whether a pass converting nothing has shown the year (that return) over the line.
  // Over the line with its bit clear the line still caps (at the line less MAGI_ITER_TOL): the year may be over only because it
  // converts, so it keeps the cap (and the credit) until the probe (run-projection.js) shows it over without a conversion.
  // preConvMagi is MAGI before any conversion, including the iteration's
  // estimate of this year's discretionary withdrawals.
  // Batch 5 follow-ups S1, Task 2f (spec 4.1, "The IRMAA tier within a year"): the IRMAA holds (engine MAGI; Infinity: none), the
  // lowest line a pass of the year read (the year loop keeps them, run-projection.js): the IRMAA cap is min(line, hold), household
  // (irmaaHold) and per return (irmaaHoldA / irmaaHoldB). With every hold Infinity the ceiling is the very double it was without them.

  // load-time: a literal scratch object (the global NaN); reads nothing else.
  // CEIL_OUT (scratch, overwritten by the next call: read it right after the call): the IRMAA line(s) this call computed, before
  // any hold, in the engine's MAGI: `line` (household branch), `lineA` / `lineB` (two-return branch); NaN where none applied.
  // Task 2g: `held` / `heldA` / `heldB`, whether that hold set the ceiling (below its line, and no lower cap: household, the ACA
  // 400% line's cap, the line less MAGI_ITER_TOL, when the year is at or under the line (S3) or its acaShown bit is clear (8d); per return, that return's held room is
  // the final room); false where no hold applied. The release reads them.
  // S3 Task 8d: `acaLine` (household) / `acaLineA` / `acaLineB` (per return), the ACA 400% line(s) this call computed (NaN: none
  // applied), and `acaProbe` / `acaProbeA` / `acaProbeB`, whether that line capped only because its `acaShown` bit is clear (the
  // MAGI over the line, the bit clear): the probe (run-projection.js) reads them, and the secant pair's `secKept`.
  export const CEIL_OUT = { line: NaN, lineA: NaN, lineB: NaN, held: false, heldA: false, heldB: false, acaLine: NaN, acaLineA: NaN, acaLineB: NaN, acaProbe: false, acaProbeA: false, acaProbeB: false };
  export function conversionMagiCeiling(ctx, {
    acaEligibleA,
    acaEligibleB,
    singlePerson,
    isSurvivorPeriod,
    deceasedIsA,
    deceasedIsB,
    workingA,
    workingB,
    age,
    ageB,
    preConvMagi,
    filing,
    year,
    twoReturns = false,
    preMagiA = 0,
    preMagiB = 0,
    shareA = 0.5,
    profile,
    irmaaHold = Infinity,
    irmaaHoldA = Infinity,
    irmaaHoldB = Infinity,
    acaShown = 3,
  }) {
    const inputs = ctx.inputs;
    CEIL_OUT.line = CEIL_OUT.lineA = CEIL_OUT.lineB = CEIL_OUT.acaLine = CEIL_OUT.acaLineA = CEIL_OUT.acaLineB = NaN;
    CEIL_OUT.held = CEIL_OUT.heldA = CEIL_OUT.heldB = CEIL_OUT.acaProbe = CEIL_OUT.acaProbeA = CEIL_OUT.acaProbeB = false;
    if (twoReturns) {
      // Each return keeps under its own lines. A conversion lands on the returns by the traditional-pool
      // share, so return X allows (line - its MAGI) / its share of the household conversion. (Two returns
      // never occur in the survivor period or single-person mode, so the household branch's survivor
      // guards are not needed here.)
      let room = Infinity;
      const kids = qualifyingChildCount(inputs, taxYearOf(ctx, year)),
        allow = (line, m, frac) => (frac > 0 ? Math.max(0, (line - m) / frac) : Infinity),
        // a return already over its ACA line has lost its credit: the line no longer holds its conversion. Under it, the room is
        // to the line less MAGI_ITER_TOL (S3, Task 8b): the return's realized MAGI moves by its share of a converged pass's drift
        // (at most MAGI_ITER_TOL), so it lands at or under the line, never cents over it (the knife-edge). The over test reads
        // the line itself. S3 Task 8d: over its line the return has no ACA room only once its acaShown bit is set (`shown`); with
        // the bit clear the line still caps it (the probe).
        allowAca = (line, m, frac, shown) => (m > line && shown ? Infinity : allow(line - MAGI_ITER_TOL, m, frac));
      if (inputs.acaEnabled && !inputs.acaEnhanced) {
        if (acaEligibleA) {
          const la = fplForHousehold(ctx, 1 + kids, year) * 4,
            shownA = (acaShown & 1) !== 0;
          CEIL_OUT.acaLineA = la;
          CEIL_OUT.acaProbeA = preMagiA > la && !shownA;
          room = Math.min(room, allowAca(la, preMagiA, shareA, shownA));
        }
        if (acaEligibleB) {
          const lb = fplForHousehold(ctx, 1, year) * 4,
            shownB = (acaShown & 2) !== 0;
          CEIL_OUT.acaLineB = lb;
          CEIL_OUT.acaProbeB = preMagiB > lb && !shownB;
          room = Math.min(room, allowAca(lb, preMagiB, 1 - shareA, shownB));
        }
      }
      const p = profile;
      // a held return's room (NaN: not held below its line), compared with the final room below
      let heldRoomA = NaN,
        heldRoomB = NaN;
      if (!workingA && age >= 63) {
        const la = irmaaRoomFor(ctx, preMagiA, p.ssA || 0, returnStatusA(p.dependents), year),
          roomA = allow(Math.min(la, irmaaHoldA), preMagiA, shareA);
        CEIL_OUT.lineA = la;
        if (irmaaHoldA < la) heldRoomA = roomA;
        room = Math.min(room, roomA);
      }
      if (!workingB && ageB >= 63) {
        const lb = irmaaRoomFor(ctx, preMagiB, p.ssB || 0, 'single', year),
          roomB = allow(Math.min(lb, irmaaHoldB), preMagiB, 1 - shareA);
        CEIL_OUT.lineB = lb;
        if (irmaaHoldB < lb) heldRoomB = roomB;
        room = Math.min(room, roomB);
      }
      // Task 2g: a return's hold set the ceiling when its held room is the final room (a tie: both)
      CEIL_OUT.heldA = heldRoomA <= room;
      CEIL_OUT.heldB = heldRoomB <= room;
      return preConvMagi + room;
    }
      let magiCeiling = Infinity;
      // Avoid the ACA subsidy cliff: once non-enhanced-mode MAGI crosses
      // 400% of the federal poverty line, the full premium is owed with
      // no phase-out, which can cost far more than a lower future tax
      // bracket is worth.
      // Only partners actually on the individual market (see
      // acaEligibility) are exposed to the subsidy cliff. A year whose
      // MAGI is already over the line before the conversion has lost the
      // credit, so the line does not hold the conversion (the cliff plan's
      // stay-under decides whether to get back under it).
      if (inputs.acaEnabled && !inputs.acaEnhanced && (acaEligibleA || acaEligibleB)) {
        const acaLine = fplForHousehold(ctx, acaHouseholdSize(ctx, singlePerson, isSurvivorPeriod, year), year) * 4;
        // The cap is the line less MAGI_ITER_TOL (S3, Task 8b, follow-up 4): a converged pass realizes at most MAGI_ITER_TOL over
        // its estimate, so a year capped there lands at or under the line instead of cents over it (owing the full premium while
        // charged the credit price). The over test reads the line itself: a year within $1 under it converts nothing.
        // S3 Task 8d: over the line, the cap holds until the household's acaShown bit is set (the probe).
        CEIL_OUT.acaLine = acaLine;
        CEIL_OUT.acaProbe = preConvMagi > acaLine && !(acaShown & 1);
        if (preConvMagi <= acaLine || !(acaShown & 1)) magiCeiling = Math.min(magiCeiling, acaLine - MAGI_ITER_TOL);
      }
      // Avoid crossing into the next Medicare IRMAA tier. IRMAA is
      // assessed two years later off this year's MAGI, so this only
      // matters once a currently-retired partner is within two years of
      // 65 (or already on Medicare); it keeps this year's MAGI within
      // whichever tier it already sits in.
      if (
        (!workingA && age >= 63 && !(isSurvivorPeriod && deceasedIsA)) ||
        (!singlePerson && !workingB && ageB >= 63 && !(isSurvivorPeriod && deceasedIsB))
      ) {
        const ssH = irmaaSsOf(profile),
          line = magiForIrmaaLine(irmaaTierCeiling(ctx, irmaaMagiOf(preConvMagi, ssH, filing), filing, year), ssH, filing);
        CEIL_OUT.line = line;
        magiCeiling = Math.min(magiCeiling, Math.min(line, irmaaHold));
        // Task 2g: the hold set the ceiling when it is below the line and no lower cap (the ACA 400% line's cap, the line less
        // MAGI_ITER_TOL, in a year at or under the line or not shown over it, 8d) did: a hold between that cap and the ACA line did not set it
        CEIL_OUT.held = irmaaHold < line && irmaaHold <= magiCeiling;
      }
    return magiCeiling;
  }
  // Per-year bracket override: ctx.overrides.rothBracketByAge, null in normal operation, so every existing call site keeps
  // using the flat inputs.rothConvBracket exactly as before. Its live user is the flat-bracket card's pinning (R5 I-A,
  // computeRothOptimizer) and the tests: the context carries a Map<Partner-A age, bracket-pct-or-0> there (each run uses a copy
  // of the inputs with its own context; nothing is written to the store). A mapped value of 0 is a
  // distinct sentinel meaning "convert nothing this year" (not a real
  // bracket — bracketCeilingReal(0,...) would otherwise fall through to
  // its "not found" branch and return the top bracket, the opposite of
  // what 0 is supposed to mean), so it's checked before bracketCeilingReal
  // is ever called.
  // drawBelow (Batch 5 follow-ups S1): the pass's estTrad, the draw the fill sits on (solveRothConversionTop); the test-only
  // rothAmountByAge branch ignores it.
  export function solveRothConversion(ctx, profile, maxAvailable, yearIndex, ageKey, drawBelow) {
    if (maxAvailable <= 0) return 0;
    // Test-only (Batch 5 step 5a, the yardstick `tests/yardstick.mjs`): ctx.overrides.rothAmountByAge, absent from every
    // context the app builds, a Map<Partner-A age, nominal dollars>: the year converts that amount, bounded by maxAvailable
    // (the caller lifts the MAGI ceiling for a mapped age, run-projection.js). Checked first.
    const amountByAge = ctx.overrides.rothAmountByAge;
    if (amountByAge && amountByAge.has(ageKey)) return Math.min(maxAvailable, Math.max(0, amountByAge.get(ageKey)));
    return solveRothConversionTop(ctx, profile, maxAvailable, yearIndex, convBracketFor(ctx, ageKey), drawBelow);
  }
  // The bracket the year at Partner A's age `ageKey` fills to (0: convert nothing), as solveRothConversion resolves it. The
  // flat-bracket card's pinning override takes priority (carried only by a context that sets it, see above; keyed by Partner A's
  // age, so both engines (simulate() and simulateHistorical()) pass the age). Next, the cliff plan's bracket (Batch 5 step 3a,
  // spec A4), only when the plan was made for the user's bracket setting (`bracketFrom`), so a variant that changes the setting
  // is never overridden by a plan made for another one. Falls through to the flat bracket.
  export function convBracketFor(ctx, ageKey) {
    const inputs = ctx.inputs,
      byAge = ctx.overrides.rothBracketByAge,
      plan = ctx.plan;
    return byAge && byAge.has(ageKey)
      ? byAge.get(ageKey)
      : plan && plan.bracket != null && plan.bracketFrom === inputs.rothConvBracket
        ? plan.bracket
        : inputs.rothConvBracket;
  }

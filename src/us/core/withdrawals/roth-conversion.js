import { accountsConvert } from '../withdrawal-mix-and-roth-accounts.js';
import { taxIndexFactor } from '../../../shared/core/tax-index-factor.js';
import { FILING, filingRow, taxYearOf } from '../federal-deductions.js';
import { itemizedDeduction } from '../itemized-deduction.js';
import { standardDeduction, bracketCeilingReal } from '../tax/federal-rules.js';
import { taxableSocialSecurity, returnStatusA, irmaaSsOf } from '../tax/social-security-tax.js';
import { qualifyingChildCount } from '../../../shared/core/lists-and-children.js';
import { state } from '../../../shared/core/store.js';
import { acaHouseholdSize, fplForHousehold } from '../healthcare/aca.js';
import { magiForIrmaaLine } from '../magi-for-irmaa-line.js';
import { irmaaTierCeiling, irmaaMagiOf, irmaaRoomFor } from '../healthcare/irmaa.js';
import { rothAccountsConvert } from '../accounts/roth-ledger.js';

  // Moves a Roth conversion from the traditional balance (then the traditional
  // bond bucket) into Roth and records it in the ledger, which tracks the 5-year
  // seasoning clock for penalty-free access.
  export function applyRothConversion(bal, rothAccts, accts, conversionAmount, year, seppActive) {
    if (conversionAmount <= 0) return;
    const to = accountsConvert(accts, bal.traditional + bal.bondTraditional, bal.roth + bal.bondRoth, conversionAmount, seppActive);
    const fromTradConv = Math.min(bal.traditional, conversionAmount);
    bal.traditional -= fromTradConv;
    bal.bondTraditional = Math.max(0, bal.bondTraditional - (conversionAmount - fromTradConv));
    bal.roth += conversionAmount;
    rothAccountsConvert(rothAccts, to, year);
  }
  // The conversion that fills ordinary income to the top of the `bracketPct` bracket (0: none), at most
  // maxAvailable. solveRothConversion above resolves the bracket (schedule, override or setting) and calls it.
  export function solveRothConversionTo(profile, maxAvailable, yearIndex, bracketPct) {
    if (maxAvailable <= 0 || bracketPct === 0) return 0;
    const factor = taxIndexFactor(yearIndex),
      filing = FILING[profile.filing] ? profile.filing : 'single',
      joint = filingRow(filing).joint;
    // Conservative lower bound on the deduction: age-adjusted standard, or the
    // property tax (under the SALT cap) plus mortgage interest if larger. State
    // income tax and the senior deduction depend on the conversion itself, so
    // they are left out (a slightly smaller deduction converts a bit less).
    const deduction = Math.max(
        standardDeduction(filing, yearIndex, joint ? [profile.ageA, profile.ageB] : [profile.ageA]),
        itemizedDeduction(yearIndex, 0, 0, profile.propertyTax || 0, profile.mortgageInterest || 0),
      ),
      targetGrossOrdinary = bracketCeilingReal(bracketPct, filing) * factor + deduction;
    const ordinaryAt = (conv) => {
      if (joint) {
        // E1c (decision 8c): AGI is lower by the 162(l) deduction; QBI is not seen by the fill.
        let other = profile.otherA + profile.otherB - ((profile.seHealthA || 0) + (profile.seHealthB || 0)) + conv;
        // E1e (decision 18): the pass's last-resort estimate, appended only when non-zero.
        if (profile.inhEstA || profile.inhEstB) other += (profile.inhEstA || 0) + (profile.inhEstB || 0);
        const taxableSS = taxableSocialSecurity(profile.ssA + profile.ssB, other, filing);
        return other + taxableSS;
      }
      let other = profile.otherA + (profile.otherB || 0) - ((profile.seHealthA || 0) + (profile.seHealthB || 0)) + conv;
      if (profile.inhEstA || profile.inhEstB) other += (profile.inhEstA || 0) + (profile.inhEstB || 0);
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
  // Highest MAGI a Roth conversion (and, in simulate(), the withdrawal order)
  // may reach this year without a cost cliff, or Infinity if nothing binds:
  //  - the 400%-FPL ACA subsidy cliff (non-enhanced ACA, for partners on the
  //    individual market), and
  //  - the next Medicare IRMAA tier. IRMAA is assessed two years later off
  //    this year's MAGI, so it only binds once a retired partner is within two
  //    years of 65 (or on Medicare); it keeps Medicare's MAGI (irmaaMagiOf: only
  //    the taxable part of Social Security, from `profile`) inside its current
  //    tier, translated back into the engine's MAGI (magiForIrmaaLine). The ACA
  //    line is on the engine's MAGI (the ACA definition).
  // preConvMagi is MAGI before any conversion, including the iteration's
  // estimate of this year's discretionary withdrawals.
  export function conversionMagiCeiling({
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
  }) {
    if (twoReturns) {
      // Each return keeps under its own lines. A conversion lands on the returns by the traditional-pool
      // share, so return X allows (line - its MAGI) / its share of the household conversion. (Two returns
      // never occur in the survivor period or single-person mode, so the household branch's survivor
      // guards are not needed here.)
      let room = Infinity;
      const kids = qualifyingChildCount(taxYearOf(year)),
        allow = (line, m, frac) => (frac > 0 ? Math.max(0, (line - m) / frac) : Infinity);
      if (state.acaEnabled && !state.acaEnhanced) {
        if (acaEligibleA) room = Math.min(room, allow(fplForHousehold(1 + kids, year) * 4, preMagiA, shareA));
        if (acaEligibleB) room = Math.min(room, allow(fplForHousehold(1, year) * 4, preMagiB, 1 - shareA));
      }
      const p = profile;
      if (!workingA && age >= 63) room = Math.min(room, allow(irmaaRoomFor(preMagiA, p.ssA || 0, returnStatusA(p.dependents), year), preMagiA, shareA));
      if (!workingB && ageB >= 63) room = Math.min(room, allow(irmaaRoomFor(preMagiB, p.ssB || 0, 'single', year), preMagiB, 1 - shareA));
      return preConvMagi + room;
    }
      let magiCeiling = Infinity;
      // Avoid the ACA subsidy cliff: once non-enhanced-mode MAGI crosses
      // 400% of the federal poverty line, the full premium is owed with
      // no phase-out, which can cost far more than a lower future tax
      // bracket is worth.
      // Only partners actually on the individual market (see
      // acaEligibility) are exposed to the subsidy cliff.
      if (state.acaEnabled && !state.acaEnhanced && (acaEligibleA || acaEligibleB)) {
        magiCeiling = Math.min(
          magiCeiling,
          fplForHousehold(acaHouseholdSize(singlePerson, isSurvivorPeriod, year), year) * 4,
        );
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
        const ssH = irmaaSsOf(profile);
        magiCeiling = Math.min(magiCeiling, magiForIrmaaLine(irmaaTierCeiling(irmaaMagiOf(preConvMagi, ssH, filing), filing, year), ssH, filing));
      }
    return magiCeiling;
  }

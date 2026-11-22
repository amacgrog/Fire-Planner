// US Social Security income by year (one benefit formula for the engine, the cliff plan and the Sankey: own, widowed and survivor benefits), with the earnings test, claiming text and the claiming search's axes

  // The share of scheduled Social Security paid in projection year `year` (feedback B2): 1, or 1 less the benefit cut from
  // January of its calendar start year on (a what-if: the trust fund running out, or a higher full retirement age).
  // `(100 - pct) / 100`, so 22% is the double nearest 0.78. C4's means test (a later item) will multiply its own per-year
  // share, passed in by the caller, into `paid` below; this stays the input-driven part.
  export function ssPaidShare(ctx, year) {
    const pct = ctx.inputs.ssBenefitCutPct;
    return pct > 0 && ctx.taxYear + year >= ctx.inputs.ssBenefitCutStartYear ? (100 - pct) / 100 : 1;
  }
  // Full retirement age in months by birth year (SSA, POMS RS 00615.003): 65 to 1937, +2 months a year to 66 for 1943-1954,
  // +2 months a year to 67 for 1960 and later. The birth year is the tax year less the age input (the plan stores ages).
  export function ssFullRetirementAgeMonths(birthYear) {
    if (birthYear <= 1937) return 65 * 12;
    if (birthYear <= 1942) return 65 * 12 + 2 * (birthYear - 1937);
    if (birthYear <= 1954) return 66 * 12;
    if (birthYear >= 1960) return 67 * 12;
    return 66 * 12 + 2 * (birthYear - 1954);
  }
  // The own-benefit factor of a claim at `claimAge` (clamped to 62-70) for a full retirement age of `fraMonths` (SS PR 1,
  // spec 5.1): minus 5/9 of 1% a month for the first 36 months early and 5/12 of 1% beyond, plus 2/3 of 1% a month late
  // (POMS RS 00615.101, RS 00615.692). Counted in whole units of 1/3600 (20, 15 and 24 a month) and divided once, so a claim
  // at 62 with an FRA of 67 is the double nearest 0.7 (2520 / 3600), not 1 - 0.2 - 0.1.
  export function ssClaimFactor(fraMonths, claimAge) {
    const m = fraMonths - 12 * Math.min(70, Math.max(62, claimAge));
    if (m > 0) return (3600 - 20 * Math.min(m, 36) - 15 * Math.max(0, m - 36)) / 3600;
    return (3600 - 24 * m) / 3600;
  }
  // The age partner `p`'s factor is read at, before the clamp (spec 7.1): the start age while already collecting (a start age
  // after the current age cannot be one already collecting, so it is read as not collecting); else the later of the start age
  // and the current age ("claims now": a start age already past is a claim this year).
  export function ssFactorAge(ctx, p) {
    const inputs = ctx.inputs,
      start = p === 'A' ? inputs.ssStartAgeA : inputs.ssStartAgeB,
      age = p === 'A' ? inputs.ageA : inputs.ageB;
    return (p === 'A' ? inputs.ssCollectingA : inputs.ssCollectingB) === true && start <= age ? start : Math.max(start, age);
  }
  // Partner `p`'s claim factor: 1 when the amount is entered as paid at the start age (`atClaim`, the default); in the `pia`
  // basis the amount is the benefit at full retirement age and this is ssClaimFactor at ssFactorAge.
  export function ssOwnFactor(ctx, p) {
    const inputs = ctx.inputs;
    if ((p === 'A' ? inputs.ssBenefitBasisA : inputs.ssBenefitBasisB) !== 'pia') return 1;
    return ssClaimFactor(ssFullRetirementAgeMonths(ctx.taxYear - (p === 'A' ? inputs.ageA : inputs.ageB)), ssFactorAge(ctx, p));
  }
  // Partner `p`'s own benefit in the year they are `a`, inflated by `factor` and paid at `paid` (ssPaidShare). `atClaim` keeps
  // the order every copy of this formula had (monthly x 12, then factor, then paid), so no figure moves; `pia` multiplies the
  // claim factor in after the 12. A start age below the current age pays from year 0 in both bases.
  export function ownBenefitYearly(ctx, p, a, factor, paid) {
    const inputs = ctx.inputs;
    if (!(a >= (p === 'A' ? inputs.ssStartAgeA : inputs.ssStartAgeB))) return 0 * factor * paid;
    const yearly = (p === 'A' ? inputs.ssMonthlyA : inputs.ssMonthlyB) * 12;
    return ((p === 'A' ? inputs.ssBenefitBasisA : inputs.ssBenefitBasisB) === 'pia' ? yearly * ssOwnFactor(ctx, p) : yearly) * factor * paid;
  }
  // The survivor full retirement age in months by birth year (20 CFR 404.409(b), POMS RS 00615.003 B.3): 65 to 1939, +2 months
  // a year to 66 for 1945-1956, +2 months a year to 67 for 1962 and later (SS PR 2). The 62 of births before 1912 is not modeled.
  export function ssSurvivorFraMonths(birthYear) {
    if (birthYear <= 1939) return 65 * 12;
    if (birthYear <= 1944) return 65 * 12 + 2 * (birthYear - 1939);
    if (birthYear <= 1956) return 66 * 12;
    if (birthYear >= 1962) return 67 * 12;
    return 66 * 12 + 2 * (birthYear - 1956);
  }
  // The survivor benefit's age factor f(x) at a start of `x` (spec 5.2, POMS RS 00615.301): 28.5% at most, spread evenly over
  // the months from 60 to the survivor full retirement age, 1 from it on. Counted in units of 1/1000 of 28.5% and divided once,
  // so f(60) with a survivor FRA of 67 is 60060 / 84000, the double nearest 0.715. A start below 60 reads 60.
  export function ssSurvivorFactor(sfraMonths, x) {
    const span = sfraMonths - 720,
      m = Math.min(span, Math.max(0, sfraMonths - 12 * x));
    return (1000 * span - 285 * m) / (1000 * span);
  }
  // A widowed single person's survivor full retirement age in months (birth year from the tax year and the age, as PR 1).
  function widowedSfra(ctx) {
    return ssSurvivorFraMonths(ctx.taxYear - ctx.inputs.ageA);
  }
  // The survivor start age: the stored age, or null for "at the survivor full retirement age", resolved to the whole year from
  // which the benefit is unreduced (66 and 4 months reads 67).
  export function ssSurvivorStartResolved(ctx) {
    const x = ctx.inputs.ssSurvivorStartAge;
    return x === null || x === undefined ? Math.ceil(widowedSfra(ctx) / 12) : x;
  }
  // The age the survivor factor is read at, as ssFactorAge: the start while already collecting (a start after the current age is
  // read as not collecting), else the later of the start and the current age ("claims now").
  export function ssSurvivorFactorAge(ctx) {
    const start = ssSurvivorStartResolved(ctx),
      age = ctx.inputs.ageA;
    return ctx.inputs.ssSurvivorCollecting === true && start <= age ? start : Math.max(start, age);
  }
  // The quote age the engine reads: SSA's earlier quote is for an age from 60 to the survivor full retirement age.
  function quoteAge(ctx) {
    return Math.min(Math.ceil(widowedSfra(ctx) / 12), Math.max(60, ctx.inputs.ssSurvivorQuoteAge || 60));
  }
  // How the two SSA quotes read (spec 5.2): F the survivor benefit at full retirement age, Q the optional quote at age a, and
  // P = Q / f(a) the benefit at full retirement age that Q implies without a widow's limit. 0: no earlier quote. 1: they agree
  // (P within $2 of F either way: SSA rounds both down), no widow's limit. 2: P is above that, so the widow's limit caps the
  // benefit at F. 3: they disagree (Q above F, or P more than $2 below F); the planner then uses F as if there were no limit.
  export function ssSurvivorQuoteRead(ctx) {
    const inputs = ctx.inputs,
      F = inputs.ssSurvivorMonthlyFra,
      Q = inputs.ssSurvivorQuoteMonthly;
    if (!(Q > 0)) return 0;
    const P = Q / ssSurvivorFactor(widowedSfra(ctx), quoteAge(ctx));
    if (Q > F || P < F - 2) return 3;
    return P <= F + 2 ? 1 : 2;
  }
  // A widowed single person's yearly survivor benefit for a year at or after its start, today's dollars, before inflation and
  // the benefit cut: F x 12 x f(x), or under a widow's limit min(P x f(x), F) a month, P from the earlier quote.
  export function widowedSurvivorYearly(ctx) {
    const inputs = ctx.inputs,
      sfra = widowedSfra(ctx),
      fx = ssSurvivorFactor(sfra, ssSurvivorFactorAge(ctx));
    if (ssSurvivorQuoteRead(ctx) === 2) return Math.min(((inputs.ssSurvivorQuoteMonthly * 12) / ssSurvivorFactor(sfra, quoteAge(ctx))) * fx, inputs.ssSurvivorMonthlyFra * 12);
    return inputs.ssSurvivorMonthlyFra * 12 * fx;
  }
  // The benefit a living partner `p` is paid in the year they are `a`, outside a survivor period: their own benefit, or for a
  // widowed single person (`ssWidowed`) the higher of their own and the survivor benefit on the late spouse's record once it
  // has started (SSA pays the smaller plus the excess of the larger; each is cut only for the age it starts at). Anyone else
  // gets exactly ownBenefitYearly, so no figure moves.
  export function paidBenefitYearly(ctx, p, a, factor, paid) {
    const own = ownBenefitYearly(ctx, p, a, factor, paid),
      inputs = ctx.inputs;
    if (p !== 'A' || !inputs.singlePerson || inputs.ssWidowed !== true) return own;
    return Math.max(own, a >= ssSurvivorStartResolved(ctx) ? widowedSurvivorYearly(ctx) * factor * paid : 0);
  }
  // Whether the couple is married in projection year `y` (E3's test of the death year): jointly filing, or past the wedding age
  // of a "start single, then marry" plan. Whole years: a death in the wedding year counts as married (SSA asks 9 months).
  export function marriedAtYear(ctx, y) {
    const inputs = ctx.inputs;
    return !inputs.singlePerson && (inputs.marryLater ? inputs.ageA + y >= inputs.marriageAgeA : inputs.filingStatus === 'mfj');
  }
  // A couple's survivor benefit at a survivor start of `x` after a death in `deathYear`, today's dollars, before inflation and
  // the cut, with the deceased's amount entered at full retirement age (spec 5.3). The deceased's base: if they had claimed (the
  // factor age before their age in the death year; a start in the death year itself was never paid), their benefit with its
  // claim factor, under the widow's limit when that was early (POMS RS 00615.320: min(PIA x f(x), max(82.5% of PIA, R)), never
  // R x f(x)); if not, their PIA with the delayed credits earned to the death year (none before full retirement age; the
  // factor's clamp stops them at 70). Times the survivor's own age factor f(x).
  export function deceasedSurvivorYearly(ctx, deceasedIsA, deathYear, x) {
    const inputs = ctx.inputs,
      d = deceasedIsA ? 'A' : 'B',
      ageD0 = deceasedIsA ? inputs.ageA : inputs.ageB,
      ageS0 = deceasedIsA ? inputs.ageB : inputs.ageA,
      pia = (deceasedIsA ? inputs.ssMonthlyA : inputs.ssMonthlyB) * 12,
      fx = ssSurvivorFactor(ssSurvivorFraMonths(ctx.taxYear - ageS0), x),
      D = ageD0 + deathYear,
      fraD = ssFullRetirementAgeMonths(ctx.taxYear - ageD0),
      k = ssFactorAge(ctx, d);
    if (k < D) {
      const r = ssClaimFactor(fraD, k);
      if (r < 1) return Math.min(pia * fx, Math.max(pia * 0.825, pia * r));
      return pia * r * fx;
    }
    return pia * Math.max(1, ssClaimFactor(fraD, D)) * fx;
  }
  // The survivor's yearly benefit after a death, Partner A at `ageA` and B at `ageB` that year (SS PR 2, spec 5.3). With the
  // deceased's amount entered as paid at the start age (`atClaim`), today's simplified swap: the greater of the two own benefits,
  // each as if both were alive, to the bit. In `pia`: the survivor's own benefit, and if the couple was married at the death the
  // higher of that and the survivor benefit, which starts in the death year or at the survivor's 60 if later, reduced for that
  // age. The cliff plan passes the death its life expectancies imply.
  export function survivorBenefitYearly(ctx, deceasedIsA, deathYear, ageA, ageB, factor, paid) {
    const inputs = ctx.inputs;
    if ((deceasedIsA ? inputs.ssBenefitBasisA : inputs.ssBenefitBasisB) !== 'pia')
      return Math.max(ownBenefitYearly(ctx, 'A', ageA, factor, paid), ownBenefitYearly(ctx, 'B', ageB, factor, paid));
    const ageS = deceasedIsA ? ageB : ageA,
      own = ownBenefitYearly(ctx, deceasedIsA ? 'B' : 'A', ageS, factor, paid);
    if (!marriedAtYear(ctx, deathYear)) return own;
    const x = Math.max(60, (deceasedIsA ? inputs.ageB : inputs.ageA) + deathYear);
    if (ageS < x) return own;
    return Math.max(own, deceasedSurvivorYearly(ctx, deceasedIsA, deathYear, x) * factor * paid);
  }
  // Social Security for the year, each partner's benefit once they reach their claiming age (paidBenefitYearly: own, or for a
  // widowed single person the higher of own and survivor), inflated by `factor`. In the survivor period the survivor's slot
  // takes survivorBenefitYearly and the deceased's is 0. Both are paid at ssPaidShare (the
  // benefit-cut what-if; exactly 1 by default, so nothing moves).
  export function socialSecurityIncome(ctx, { year, age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA, deathYear }) {
    const paid = ssPaidShare(ctx, year);
    let ssA, ssB;
    if (isSurvivorPeriod) {
      const survivorSS = survivorBenefitYearly(ctx, deceasedIsA, deathYear, age, ageB, factor, paid);
      ssA = deceasedIsA ? 0 : survivorSS;
      ssB = deceasedIsA ? survivorSS : 0;
    } else {
      ssA = paidBenefitYearly(ctx, 'A', age, factor, paid);
      ssB = singlePerson ? 0 : ownBenefitYearly(ctx, 'B', ageB, factor, paid);
    }
    const ss = ssA + ssB;
    return { ssA, ssB, ss };
  }
  // The claiming search's axes (SS claiming optimizer PR 3, spec 7.1): the household's kind ('widowed' for a single person with
  // the widowed box and a survivor amount, else 'single' or 'couple') and, per benefit, the ages a claim can take or why the
  // benefit is fixed, with `current`, the age the current choice pays from (its factor age). An own benefit is fixed with no
  // amount ('none'), while already collecting ('collecting'), with nothing left below 70 ('past', before 'atClaim', so nobody
  // past 70 is told to switch the basis) and when the amount does not depend on the age ('atClaim'); else it takes
  // max(62, age) .. 70. The survivor benefit is fixed while collecting or past its rounded full retirement age, else it takes
  // max(60, age) .. ceil(survivor FRA). Not a hot path: it allocates.
  function ownClaimAxis(ctx, p) {
    const inputs = ctx.inputs,
      start = p === 'A' ? inputs.ssStartAgeA : inputs.ssStartAgeB,
      age = p === 'A' ? inputs.ageA : inputs.ageB;
    let fixed = null;
    if (!((p === 'A' ? inputs.ssMonthlyA : inputs.ssMonthlyB) > 0)) fixed = 'none';
    else if ((p === 'A' ? inputs.ssCollectingA : inputs.ssCollectingB) === true && start <= age) fixed = 'collecting';
    else if (Math.max(62, age) > 70) fixed = 'past';
    else if ((p === 'A' ? inputs.ssBenefitBasisA : inputs.ssBenefitBasisB) !== 'pia') fixed = 'atClaim';
    return { ages: fixed === null ? ageRange(Math.ceil(Math.max(62, age)), 70) : [], fixed, current: ssFactorAge(ctx, p) };
  }
  function ageRange(lo, hi) {
    const out = [];
    for (let x = lo; x <= hi; x++) out.push(x);
    return out;
  }
  export function ssClaimAxes(ctx) {
    const inputs = ctx.inputs,
      kind = inputs.singlePerson ? (inputs.ssWidowed === true && inputs.ssSurvivorMonthlyFra > 0 ? 'widowed' : 'single') : 'couple';
    let survivor = null;
    if (kind === 'widowed') {
      const hi = Math.ceil(widowedSfra(ctx) / 12),
        lo = Math.ceil(Math.max(60, inputs.ageA));
      let fixed = null;
      if (inputs.ssSurvivorCollecting === true && ssSurvivorStartResolved(ctx) <= inputs.ageA) fixed = 'collecting';
      else if (lo > hi) fixed = 'past';
      survivor = { ages: fixed === null ? ageRange(lo, hi) : [], fixed, current: ssSurvivorFactorAge(ctx) };
    }
    return { kind, a: ownClaimAxis(ctx, 'A'), b: kind === 'couple' ? ownClaimAxis(ctx, 'B') : null, survivor };
  }
  // A claiming choice as inputs: a shallow copy of `base` with only the varied axes' start ages written (`cell` is
  // { survivor, a, b }; a fixed axis's entry is ignored). The survivor start is written as a number, never null.
  export function ssClaimVariant(base, axes, cell) {
    const v = { ...base };
    if (axes.survivor !== null && axes.survivor.fixed === null) v.ssSurvivorStartAge = cell.survivor;
    if (axes.a.fixed === null) v.ssStartAgeA = cell.a;
    if (axes.b !== null && axes.b.fixed === null) v.ssStartAgeB = cell.b;
    return v;
  }
  // The yearly Social Security a choice pays in the living years, before inflation and the cut (factor and paid 1), as one
  // string: Partner A's slot (own, or the widowed higher of own and survivor) and a couple's Partner B, for every year to the
  // last life expectancy. The claiming search runs two choices with one key once: every engine reader of a start age is in this
  // file and reads it only through the payment test and the factor age, so one key is one run (the plan's Decision 7).
  export function ssStreamKey(ctx) {
    const inputs = ctx.inputs,
      couple = !inputs.singlePerson,
      years = couple ? Math.max(0, inputs.lifeExpectancyA - inputs.ageA, inputs.lifeExpectancyB - inputs.ageB) : Math.max(0, inputs.lifeExpectancyA - inputs.ageA);
    let key = '';
    for (let y = 0; y <= years; y++) {
      key += paidBenefitYearly(ctx, 'A', inputs.ageA + y, 1, 1);
      if (couple) key += ',' + ownBenefitYearly(ctx, 'B', inputs.ageB + y, 1, 1);
      key += ';';
    }
    return key;
  }
  // Social Security before retirement (7O O5; US only). The earnings test is not modeled (see the Social Security
  // notes), so a partner whose benefit starts before both their retirement age and their full retirement age gets
  // the whole benefit while wages continue. SSA: the benefit is withheld at $1 for every $2 of earnings over
  // $24,480 in 2026 ($1 for every $3 over $65,160 in the year full retirement age is reached) until that age,
  // and a permanently higher benefit from then on returns the months withheld. A condition-based item of the
  // "Worth a second look" list (see `check` and `message` in computeUnusualAssumptions).
  export const SS_EARNINGS_TEST_2026 = { lower: 24480, higher: 65160 };
  export function ssBeforeRetirementCase(ctx, p) {
    if (p === 'B' && ctx.inputs.singlePerson) return null;
    const start = ctx.inputs['ssStartAge' + p],
      retire = ctx.inputs['retireAge' + p],
      fra = ssFullRetirementAgeMonths(ctx.taxYear - ctx.inputs['age' + p]) / 12;
    if (!(ctx.inputs['ssMonthly' + p] > 0) || !(ctx.inputs['income' + p] > 0)) return null;
    return start < retire && start < fra ? { start, retire, fra } : null;
  }
  // The same check for a widowed single person's survivor benefit (SS PR 2): the earnings test applies to it too, and ends at
  // the full retirement age of the retirement table (20 CFR 404.415(a) cites 404.409(a)), not the survivor table.
  export function ssSurvivorBeforeRetirementCase(ctx) {
    const inputs = ctx.inputs;
    if (!inputs.singlePerson || inputs.ssWidowed !== true || !(inputs.ssSurvivorMonthlyFra > 0) || !(inputs.incomeA > 0)) return null;
    const start = ssSurvivorStartResolved(ctx),
      retire = inputs.retireAgeA,
      fra = ssFullRetirementAgeMonths(ctx.taxYear - inputs.ageA) / 12;
    return start < retire && start < fra ? { start, retire, fra } : null;
  }
  export function fraText(fra) {
    const years = Math.floor(fra),
      months = Math.round((fra - years) * 12);
    return months ? years + ' and ' + months + ' months' : String(years);
  }

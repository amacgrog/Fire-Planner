// STATE_RULES: one data row per US jurisdiction, with the inherited-tax kind codes

  // ---------------------------------------------------------------------------
  // State income tax: one data row per jurisdiction (STATE_RULES) and one evaluator.
  //
  // Every row declares every field (an explicit 'none' / [] / 0 where a rule does not
  // exist); tests/state_rules.js fails if any of the 50 states or DC is missing a field.
  // Amounts are 2026 dollars. Indexing is declared per family of parameters, never as one switch: a flag on
  // `indexing` scales that family with the plan's tax-index factor (the same factor as the federal
  // schedules), false holds it nominal, because states index some things and not others (California indexes
  // its brackets, deduction and credits but not its $1 million surcharge; New York indexes nothing).
  // The evaluator order is
  // fixed, state first, federal second: a state's base never reads a federal deduction or
  // federal tax, because the state tax feeds the federal SALT deduction.
  //
  //   name             display name
  //   status           'researched' = checked against `source` as of `asOf` (every row; the 'migrated' status is gone)
  //   sourceKind       'none' | 'secondary' | 'primary' (what `source` is; see the generated
  //                    docs/state-tax-rules.md and the plan's Verification backlog)
  //   indexing         { bracketsIndexed, standardDeductionIndexed, personalExemptionIndexed (exemptions, dependent
  //                    exemption, exemption credits), creditAmountsIndexed, creditThresholdsIndexed (credit income limits,
  //                    phase-out starts and widths, the exemption step-down), retirementExclusionIndexed (exclusion caps
  //                    and the Social Security and pension AGI tests) }; each addition carries its own `indexed`
  //   statusAs         which column a federal filing status reads (hoh / qss fall back to the
  //                    single / joint column unless the state has its own)
  //   tax              { kind: 'none' } | { kind: 'flat', rate } |
  //                    { kind: 'graduated', columns: { single, mfj[, hoh] } } of [start, rate]
  //   additions        extra tax on top of `tax`, in order: { kind: 'threshold', threshold,
  //                    rate } (rate on the base above a threshold), { kind: 'agiStep', label,
  //                    tables } (an AGI step table), { kind: 'benefitRecapture', ... } (NY)
  //   base             what the tax is levied on: ordinary income (wages, pensions, traditional
  //                    withdrawals) yes/no; the share of long-term gains included; Social
  //                    Security 'exempt' | 'taxed' (the federally taxable part) | a subtraction
  //                    | { kind: 'agiTested' } (exempt below an AGI, else a share of benefits)
  //   standardDeduction, exemption   per column, then exemptionPhaseOut (AGI step-down) and
  //                    dependentExemption (per qualifying child)
  //   retirementExclusion            see stateRetirementExclusion
  //   credits          see stateCreditAmount (nonrefundable credits are capped by the tax;
  //                    refundable ones can take the state tax below zero)
  //   standardDeductionPhase  { kind: 'none' } | { kind: 'stepDown' | 'linear', columns } (statePhasedDeduction)
  //   seniorExemption  { kind: 'none' } | { kind: 'perSenior', age, amount, phaseOut } (a deduction per filer at or over `age`, `amount` a number or by column,
  //                    phaseOut null or { start by column, rate } cutting each filer's amount per dollar of AGI over start)
  //   dependentExemption  a number per qualifying child, { kind: 'agiTiered', tables } (an AGI step table per column), or
  //                    { kind: 'afterFirst', amount } (an amount per qualifying child beyond the first)
  //   exemptionPhaseOut  { kind: 'none' } | { kind: 'stepDown', start, step, width } | { kind: 'linear', start, rate, full, dependent }
  //                    (linear: every exemption, the filers' and `dependent` per child, loses `rate` x the federal AGI over `start`, by column, none at `full`)
  //   federalConformity   { standardDeduction, seniorDeduction, ageAdditional }: the state deducts the federal standard
  //                    deduction (the columns' standardDeduction are then 0), optionally with the 65+ add-on and the senior deduction
  //   schedule         [] or [{ fromYear, baseYear?, ...overrides }]: from tax year `fromYear` the listed fields replace the
  //                    base row's whole field (tax, standardDeduction, credits, ...); the overridden amounts are statutory
  //                    dollars of `baseYear` (default fromYear), so an indexed family grows from that year, not from plan start
  //   federalTaxSubtraction  'none' | { kind: 'lagged', placement: 'subtraction' | 'itemized', cap, phase }: the state lets the filer
  //                    deduct the year's federal income tax (taxFor runs ONE extra federal pass with state tax zero, no iteration;
  //                    'subtraction' lowers the state AGI, 'itemized' replaces the standard deduction when larger); `cap` is null or
  //                    a dollar amount by column, `phase` null or a step table of the AGI share of the cap
  //   base.gainsRate / base.gainsDeduction  null / 0 where gains simply join the base; a rate taxes the included gains
  //                    separately at that flat rate (the ordinary deduction does not offset them), a dollar deduction is
  //                    taken from the included gains first
  //   localTax         'notModeled' | { kind: 'flat', rate }: a flat county rate on the state taxable income (MD, IN)
  //   notes
  // Step tables are [[lowerBound, value], ...] per column; a value applies when the AGI is
  // more than its lower bound (at or over it when the table says `inclusive`).
  // ---------------------------------------------------------------------------
  // STATE_RULES:begin
  export const STATE_RULES = {
    al: {
      name: 'Alabama',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://www.revenue.alabama.gov/wp-content/uploads/2026/01/25f40a.pdf',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0.02 ], [ 500, 0.04 ], [ 3000, 0.05 ] ],
          mfj: [ [ 0, 0.02 ], [ 1000, 0.04 ], [ 6000, 0.05 ] ],
          hoh: [ [ 0, 0.02 ], [ 500, 0.04 ], [ 3000, 0.05 ] ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 3000, mfj: 8500, hoh: 5200 },
      exemption: { single: 1500, mfj: 3000, hoh: 3000 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: {
        kind: 'agiTiered',
        tables: {
          single: [ [ 0, 1000 ], [ 50000, 500 ], [ 100000, 300 ] ],
          mfj: [ [ 0, 1000 ], [ 50000, 500 ], [ 100000, 300 ] ],
          hoh: [ [ 0, 1000 ], [ 50000, 500 ], [ 100000, 300 ] ]
        }
      },
      standardDeductionPhase: {
        kind: 'stepDown',
        columns: {
          single: { start: 25999, width: 500, step: 25, floor: 2500 },
          mfj: { start: 25999, width: 500, step: 175, floor: 5000 },
          hoh: { start: 25999, width: 500, step: 135, floor: 2500 }
        }
      },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 0,
        traditionalMinAge: 0,
        applies: { pension: true, traditional: false },
        tiers: [ [ 0, null ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: { kind: 'lagged', placement: 'itemized', cap: null, phase: null },
      localTax: 'notModeled',
      notes: "Rates 2% / 4% / 5% (breaks at $500 and $3,000, or $1,000 and $6,000 joint). Standard deduction by income from the Department of Revenue's 2025 chart (read): $3,000 single, $8,500 joint, $5,200 head of family, falling $25, $175 and $135 per $500 of income over $25,999 to $2,500, $5,000 and $2,500 at $35,500. Exemptions $1,500 single and $3,000 joint or head of family; $1,000 per dependent at income to $50,000, $500 to $100,000, $300 above (the Form 40A chart). Federal income tax paid is deducted in full; it replaces the standard deduction when larger (the planner computes it in one extra pass; the Net Investment Income Tax that Alabama also lets you deduct is left out). Social Security and defined-benefit pensions are exempt, IRA and 401(k) withdrawals are taxed (the planner treats its pension stream as defined-benefit); the $6,000 exclusion for retirement income at 65 and the state's senior deduction were not confirmed and are not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).",
    },
    ak: {
      name: 'Alaska',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://blog.taxact.com/states-with-no-income-tax',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'none' },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Alaska levies no individual income tax on wages, pensions, retirement withdrawals, Social Security or investment gains, so no state income tax is modeled.',
    },
    az: {
      name: 'Arizona',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://azdor.gov/individual-income-tax-filing-assistance/deductions-and-exemptions',
      asOf: 2026,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'flat', rate: 0.025 },
      additions: [],
      base: { ordinary: true, gainsIncluded: 0.75, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 2300,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'perSenior', age: 65, amount: 2100, phaseOut: null },
      federalConformity: { standardDeduction: true, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [
        {
          kind: 'childCredit',
          label: 'Dependent tax credit',
          refundable: false,
          tiers: [ [ 16, 100 ], [ 200, 25 ] ],
          phaseOut: { start: { single: 10000000, mfj: 10000000 }, width: 1000, per: 0 }
        }
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Flat 2.5%. The standard deduction is the federal base amount (2026: $16,100 single, $32,200 joint, $24,150 head of household). Exemptions of $2,100 per filer 65 or older and $2,300 per dependent (from memory of the statute, secondary). Social Security is exempt. Net long-term gains are 75% included (the 25% subtraction). Dependent tax credit $100 per child under 17 and $25 for other dependents (the Department of Revenue page; its high-income phase-out and the $125 increase, which the governor vetoed in May 2026, are not modeled). The U.S. and Arizona government pension subtraction ($2,500) is not modeled because the planner cannot tell public pensions from private ones. Arizona has not adopted the federal $6,000 senior deduction as far as could be confirmed. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).',
    },
    ar: {
      name: 'Arkansas',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://www.dfa.arkansas.gov/wp-content/uploads/whformula_2026.pdf',
      asOf: 2026,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: true,
        creditAmountsIndexed: true,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0 ], [ 5600, 0.02 ], [ 11200, 0.03 ], [ 16000, 0.034 ], [ 26400, 0.039 ] ],
          mfj: [ [ 0, 0 ], [ 5600, 0.02 ], [ 11200, 0.03 ], [ 16000, 0.034 ], [ 26400, 0.039 ] ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 0.5, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 2470, mfj: 4940 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 0,
        traditionalMinAge: 59.5,
        applies: { pension: true, traditional: true },
        tiers: [ [ 0, 6000 ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'heirAnyAge' },
      credits: [
        {
          kind: 'exemptionCredits',
          label: 'Personal tax credits ($29 each, 65+ and dependents)',
          refundable: false,
          personal: { single: 29, mfj: 58 },
          personalCount: { single: 1, mfj: 2 },
          senior: { age: 65, amount: 29 },
          dependent: 29,
          phaseOut: { start: { single: 10000000, mfj: 10000000 }, width: 1000, reduction: 0 }
        }
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Top rate 3.9% on a 2026 table of 0% to $5,599, 2% to $11,199, 3% to $15,999, 3.4% to $26,399 and 3.9% above, after a $2,470 standard deduction ($4,940 joint) (Department of Finance and Administration 2026 withholding formula, read). Only half of net long-term gains is taxed. Social Security is exempt. Each filer excludes up to $6,000 of retirement income (a pension at any age, an IRA from 59 and a half). Personal tax credits of $29 per filer, per dependent and for each filer 65 or older. Military retirement pay is exempt in Arkansas but not modeled, and the planner uses one table for single and joint returns as the state does. Inherited IRA and 401(k) distributions count toward your $6,000 exemption at any age.',
    },
    ca: {
      name: 'California',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://a-us.storyblok.com/f/1015104/x/b62453f262/1225-fast-tax-facts.pdf',
      asOf: 2025,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: true,
        creditAmountsIndexed: true,
        creditThresholdsIndexed: true,
        retirementExclusionIndexed: true,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [[0, 0.01], [11079, 0.02], [26264, 0.04], [41452, 0.06], [57542, 0.08], [72724, 0.093], [371479, 0.103], [445771, 0.113], [742953, 0.123]],
          mfj: [
            [0, 0.01], [22158, 0.02], [52528, 0.04], [82904, 0.06], [115084, 0.08], [145448, 0.093], [742958, 0.103],
            [891542, 0.113], [1485906, 0.123],
          ],
          hoh: [[0, 0.01], [22173, 0.02], [52530, 0.04], [67716, 0.06], [83805, 0.08], [98990, 0.093], [505208, 0.103], [606251, 0.113], [1010417, 0.123]],
        },
      },
      additions: [
        {
          kind: 'threshold',
          label: 'Mental health services surcharge (1% over $1 million)',
          threshold: 1000000,
          rate: 0.01,
          indexed: false,
        },
      ],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 5706, mfj: 11412, hoh: 11412 },
      exemption: { single: 0, mfj: 0, hoh: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [
        {
          kind: 'exemptionCredits',
          label: 'Exemption credits (personal, 65+, dependent)',
          refundable: false,
          personal: { single: 153, mfj: 306, hoh: 153 },
          personalCount: { single: 1, mfj: 2, hoh: 1 },
          senior: { age: 65, amount: 153 },
          dependent: 475,
          phaseOut: { start: { single: 252203, mfj: 504411, hoh: 378310 }, width: 2500, reduction: 6 },
        },
        {
          kind: 'renterCredit',
          label: 'Renter\'s credit',
          refundable: false,
          amount: { single: 60, mfj: 120, hoh: 120 },
          agiLimit: { single: 53954, mfj: 107987, hoh: 107987 },
        },
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: '2025 figures (CalCPA Fast Tax Facts, December 2025; secondary). These are not 2026 figures: the FTB\'s 2026 schedule was not published at the time of writing, so the 2025 amounts stand for the first plan year and the plan index factor takes them from there. The 1% mental health surcharge over $1 million is its own addition and does not index (the brackets, standard deduction and credits do). The personal exemption credit is $153 a filer, $306 on a joint return (2025 Form 540 line 7, read: https://www.ftb.ca.gov/forms/2025/2025-540.pdf). Exemption credits are reduced $6 each per $2,500 of federal AGI over the threshold; the 65+ credit is $153 per filer. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir). Not modeled: CalEITC, the Young Child Tax Credit (it requires CalEITC eligibility, including its investment income limit, with earned income of at most $32,900 or a small net loss; Franchise Tax Board, 2025), the senior head of household credit, the joint custody HoH credit; the renter\'s credit assumes a full year of renting.',
    },
    co: {
      name: 'Colorado',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://tax.colorado.gov/income-tax-topics-social-security-pensions-and-annuities',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: true,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'flat', rate: 0.044 },
      additions: [],
      base: {
        ordinary: true,
        gainsIncluded: 1,
        gainsRate: null,
        gainsDeduction: 0,
        socialSecurity: {
          kind: 'ageAgiTiered',
          tiers: [
            { minAge: 55, agiLimit: { single: 75000, mfj: 95000 }, capOverLimit: 20000 },
            { minAge: 65, agiLimit: null, capOverLimit: 0 }
          ]
        }
      },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: true, seniorDeduction: true, ageAdditional: true },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 55,
        traditionalMinAge: 55,
        applies: { pension: true, traditional: true },
        tiers: [ [ 55, 20000 ], [ 65, 24000 ] ],
        reducedBy: 'socialSecuritySubtracted',
        share: null
      },
      inherited: { kind: 'heirAnyAge' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: "Flat 4.4% on federal taxable income, so the federal standard deduction, its 65+ add-on and the senior deduction come through (the standard deduction add-back for 2026 is not modeled). Each filer subtracts pension, annuity and IRA income up to $20,000 from 55 and $24,000 from 65 (2025 Form 104 instructions, read); the bills to remove the caps (SB25-136, HB26-1062) were postponed indefinitely, so the caps stand. Social Security: a filer 65 or older subtracts all taxable benefits; one 55 to 64 subtracts all when federal AGI is at most $75,000 single or $95,000 joint, otherwise at most $20,000 (HB24-1142); under 55 nothing. Working reading, not confirmed in the booklet: a filer's Social Security subtraction uses up the same $20,000 / $24,000 as the pension subtraction. Colorado subtractions for military retirement under 55, railroad benefits and PERA are not modeled. The Family Affordability Tax Credit is switched off for tax year 2026 (Department of Revenue: the December 2025 forecast fell under the revenue trigger) and is not modeled; recheck each year. Inherited IRA and 401(k) distributions are a death benefit: up to $20,000 excluded under 55, and within your own cap from 55.",
    },
    ct: {
      name: 'Connecticut',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://portal.ct.gov/-/media/drs/forms/2025/income/ct-1040-tcs_1225.pdf',
      asOf: 2025,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [[0, 0.02], [10000, 0.045], [50000, 0.055], [100000, 0.06], [200000, 0.065], [250000, 0.069], [500000, 0.0699]],
          mfj: [[0, 0.02], [20000, 0.045], [100000, 0.055], [200000, 0.06], [400000, 0.065], [500000, 0.069], [1000000, 0.0699]],
          hoh: [[0, 0.02], [16000, 0.045], [80000, 0.055], [160000, 0.06], [320000, 0.065], [400000, 0.069], [800000, 0.0699]],
        },
      },
      additions: [
        {
          kind: 'agiStep',
          label: '2% tax rate phase-out add-back (Table C)',
          tables: {
            single: [
              [0, 0], [56500, 25], [61500, 50], [66500, 75], [71500, 100], [76500, 125], [81500, 150], [86500, 175], [91500, 200],
              [96500, 225], [101500, 250],
            ],
            mfj: [
              [0, 0], [100500, 50], [105500, 100], [110500, 150], [115500, 200], [120500, 250], [125500, 300], [130500, 350],
              [135500, 400], [140500, 450], [145500, 500],
            ],
            hoh: [
              [0, 0], [78500, 40], [82500, 80], [86500, 120], [90500, 160], [94500, 200], [98500, 240], [102500, 280], [106500, 320],
              [110500, 360], [114500, 400],
            ],
          },
          indexed: false,
        },
        {
          kind: 'agiStep',
          label: 'Tax recapture (Table D)',
          tables: {
            single: [
              [0, 0], [105000, 25], [110000, 50], [115000, 75], [120000, 100], [125000, 125], [130000, 150], [135000, 175],
              [140000, 200], [145000, 225], [150000, 250], [200000, 340], [205000, 430], [210000, 520], [215000, 610], [220000, 700],
              [225000, 790], [230000, 880], [235000, 970], [240000, 1060], [245000, 1150], [250000, 1240], [255000, 1330],
              [260000, 1420], [265000, 1510], [270000, 1600], [275000, 1690], [280000, 1780], [285000, 1870], [290000, 1960],
              [295000, 2050], [300000, 2140], [305000, 2230], [310000, 2320], [315000, 2410], [320000, 2500], [325000, 2590],
              [330000, 2680], [335000, 2770], [340000, 2860], [345000, 2950], [500000, 3000], [505000, 3050], [510000, 3100],
              [515000, 3150], [520000, 3200], [525000, 3250], [530000, 3300], [535000, 3350], [540000, 3400],
            ],
            mfj: [
              [0, 0], [210000, 50], [220000, 100], [230000, 150], [240000, 200], [250000, 250], [260000, 300], [270000, 350],
              [280000, 400], [290000, 450], [300000, 500], [400000, 680], [410000, 860], [420000, 1040], [430000, 1220],
              [440000, 1400], [450000, 1580], [460000, 1760], [470000, 1940], [480000, 2120], [490000, 2300], [500000, 2480],
              [510000, 2660], [520000, 2840], [530000, 3020], [540000, 3200], [550000, 3380], [560000, 3560], [570000, 3740],
              [580000, 3920], [590000, 4100], [600000, 4280], [610000, 4460], [620000, 4640], [630000, 4820], [640000, 5000],
              [650000, 5180], [660000, 5360], [670000, 5540], [680000, 5720], [690000, 5900], [1000000, 6000], [1010000, 6100],
              [1020000, 6200], [1030000, 6300], [1040000, 6400], [1050000, 6500], [1060000, 6600], [1070000, 6700], [1080000, 6800],
            ],
            hoh: [
              [0, 0], [168000, 40], [176000, 80], [184000, 120], [192000, 160], [200000, 200], [208000, 240], [216000, 280],
              [224000, 320], [232000, 360], [240000, 400], [320000, 540], [328000, 680], [336000, 820], [344000, 960],
              [352000, 1100], [360000, 1240], [368000, 1380], [376000, 1520], [384000, 1660], [392000, 1800], [400000, 1940],
              [408000, 2080], [416000, 2220], [424000, 2360], [432000, 2500], [440000, 2640], [448000, 2780], [456000, 2920],
              [464000, 3060], [472000, 3200], [480000, 3340], [488000, 3480], [496000, 3620], [504000, 3760], [512000, 3900],
              [520000, 4040], [528000, 4180], [536000, 4320], [544000, 4460], [552000, 4600], [800000, 4680], [808000, 4760],
              [816000, 4840], [824000, 4920], [832000, 5000], [840000, 5080], [848000, 5160], [856000, 5240], [864000, 5320],
            ],
          },
          indexed: false,
        },
      ],
      base: {
        ordinary: true,
        gainsIncluded: 1,
        gainsRate: null,
        gainsDeduction: 0,
        socialSecurity: { kind: 'agiTested', exemptBelow: { single: 75000, mfj: 100000, hoh: 100000 }, taxedShareOfBenefits: 0.25 },
      },
      standardDeduction: { single: 0, mfj: 0, hoh: 0 },
      exemption: { single: 15000, mfj: 24000, hoh: 19000 },
      exemptionPhaseOut: { kind: 'stepDown', start: { single: 30000, mfj: 48000, hoh: 38000 }, step: 1000, width: 1000 },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'agiPhasedShare',
        inclusive: true,
        tables: {
          single: [[0, 1], [75000, 0.85], [77500, 0.7], [80000, 0.55], [82500, 0.4], [85000, 0.25], [87500, 0.1], [90000, 0.05], [95000, 0.025], [100000, 0]],
          mfj: [
            [0, 1], [100000, 0.85], [105000, 0.7], [110000, 0.55], [115000, 0.4], [120000, 0.25], [125000, 0.1], [130000, 0.05],
            [140000, 0.025], [150000, 0],
          ],
          hoh: [[0, 1], [75000, 0.85], [77500, 0.7], [80000, 0.55], [82500, 0.4], [85000, 0.25], [87500, 0.1], [90000, 0.05], [95000, 0.025], [100000, 0]],
        },
      },
      inherited: { kind: 'heir' },
      credits: [
        {
          kind: 'agiStepFraction',
          label: 'Personal tax credit (Table E)',
          refundable: false,
          tables: {
            single: [
              [0, 0], [15000, 0.75], [18800, 0.7], [19300, 0.65], [19800, 0.6], [20300, 0.55], [20800, 0.5], [21300, 0.45],
              [21800, 0.4], [22300, 0.35], [25000, 0.3], [25500, 0.25], [26000, 0.2], [26500, 0.15], [31300, 0.14], [31800, 0.13],
              [32300, 0.12], [32800, 0.11], [33300, 0.1], [60000, 0.09], [60500, 0.08], [61000, 0.07], [61500, 0.06], [62000, 0.05],
              [62500, 0.04], [63000, 0.03], [63500, 0.02], [64000, 0.01], [64500, 0],
            ],
            mfj: [
              [0, 0], [24000, 0.75], [30000, 0.7], [30500, 0.65], [31000, 0.6], [31500, 0.55], [32000, 0.5], [32500, 0.45],
              [33000, 0.4], [33500, 0.35], [40000, 0.3], [40500, 0.25], [41000, 0.2], [41500, 0.15], [50000, 0.14], [50500, 0.13],
              [51000, 0.12], [51500, 0.11], [52000, 0.1], [96000, 0.09], [96500, 0.08], [97000, 0.07], [97500, 0.06], [98000, 0.05],
              [98500, 0.04], [99000, 0.03], [99500, 0.02], [100000, 0.01], [100500, 0],
            ],
            hoh: [
              [0, 0], [19000, 0.75], [24000, 0.7], [24500, 0.65], [25000, 0.6], [25500, 0.55], [26000, 0.5], [26500, 0.45],
              [27000, 0.4], [27500, 0.35], [34000, 0.3], [34500, 0.25], [35000, 0.2], [35500, 0.15], [44000, 0.14], [44500, 0.13],
              [45000, 0.12], [45500, 0.11], [46000, 0.1], [74000, 0.09], [74500, 0.08], [75000, 0.07], [75500, 0.06], [76000, 0.05],
              [76500, 0.04], [77000, 0.03], [77500, 0.02], [78000, 0.01], [78500, 0],
            ],
          },
        },
        {
          kind: 'propertyTaxCredit',
          label: 'Property tax credit',
          refundable: false,
          max: 300,
          limit: { single: 49500, mfj: 70500, hoh: 54500 },
          stepWidth: 10000,
          stepPct: 0.15,
        },
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Tax tables from Form CT-1040 TCS (Rev. 12/25, tax year 2025, primary): brackets, personal exemption (reduced $1,000 per $1,000 of AGI over $30,000 / $48,000 / $38,000), the 2% add-back, the recapture and the personal tax credit decimals; none is indexed. Retirement rules from OLR report 2025-R-0152 (Sept. 2025): Social Security is exempt under $75,000 AGI ($100,000 joint or head of household), above that no more than 25% of benefits is taxed; pension, annuity and IRA income is fully exempt under $75,000 ($100,000 joint) and phases down to nothing at $100,000 ($150,000 joint), with the IRA deduction at 100% from 2026. Property tax credit up to $300 for the home, 15% less per $10,000 of AGI over $49,500 / $70,500 / $54,500 (secondary; the vehicle tax part is not modeled). The 2026 table revisions, if any, and the CT EITC are not modeled. Inherited IRA and 401(k) distributions share your own retirement exclusion, on your own age.',
    },
    de: {
      name: 'Delaware',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://legis.delaware.gov/json/BillDetail/GenerateHtmlDocument?legislationId=142045&legislationTypeId=6&docTypeId=2&legislationName=HS1forHB13',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [
            [ 0, 0 ],
            [ 2000, 0.02175 ],
            [ 5000, 0.03875 ],
            [ 10000, 0.04775 ],
            [ 20000, 0.05175 ],
            [ 25000, 0.05525 ],
            [ 60000, 0.066 ],
            [ 125000, 0.0675 ],
            [ 250000, 0.0685 ],
            [ 500000, 0.0695 ]
          ],
          mfj: [
            [ 0, 0 ],
            [ 2000, 0.02175 ],
            [ 5000, 0.03875 ],
            [ 10000, 0.04775 ],
            [ 20000, 0.05175 ],
            [ 25000, 0.05525 ],
            [ 60000, 0.066 ],
            [ 125000, 0.0675 ],
            [ 250000, 0.0685 ],
            [ 500000, 0.0695 ]
          ],
          hoh: [
            [ 0, 0 ],
            [ 2000, 0.02175 ],
            [ 5000, 0.03875 ],
            [ 10000, 0.04775 ],
            [ 20000, 0.05175 ],
            [ 25000, 0.05525 ],
            [ 60000, 0.066 ],
            [ 125000, 0.0675 ],
            [ 250000, 0.0685 ],
            [ 500000, 0.0695 ]
          ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 3250, mfj: 6500, hoh: 3250 },
      exemption: { single: 0, mfj: 0, hoh: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 0,
        traditionalMinAge: 60,
        applies: { pension: true, traditional: true },
        tiers: [ [ 0, 2000 ], [ 60, 12500 ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'heir' },
      credits: [
        {
          kind: 'exemptionCredits',
          label: 'Personal credits ($110 each, 60+ and dependents)',
          refundable: false,
          personal: { single: 110, mfj: 220, hoh: 110 },
          personalCount: { single: 1, mfj: 2, hoh: 1 },
          senior: { age: 60, amount: 110 },
          dependent: 110,
          phaseOut: { start: { single: 10000000, mfj: 10000000, hoh: 10000000 }, width: 1000, reduction: 0 }
        }
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Nine brackets from 2.175% to 6.95% for 2026 (House Substitute for House Bill 13, 2025: 2.175% / 3.875% / 4.775% / 5.175% / 5.525% from $2,000, 6.6% from $60,000, 6.75% from $125,000, 6.85% from $250,000, 6.95% from $500,000). Standard deduction $3,250 single or head of household, $6,500 joint; personal credit $110 per exemption and $110 more for each filer 60 or older (Division of Revenue instructions, search excerpts). Social Security is exempt. Pension and eligible retirement income: $2,000 per filer under 60 (pensions only), $12,500 from 60 (including IRA and 401(k) distributions; the state also counts interest, dividends, gains and rental income inside that cap, which the planner leaves out, so it is conservative). Inherited IRA and 401(k) distributions share your own retirement exclusion, on your own age.',
    },
    fl: {
      name: 'Florida',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://blog.taxact.com/states-with-no-income-tax',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'none' },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Florida levies no individual income tax on wages, pensions, retirement withdrawals, Social Security or investment gains, so no state income tax is modeled.',
    },
    ga: {
      name: 'Georgia',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://dor.georgia.gov/taxes/important-tax-updates',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'flat', rate: 0.0499 },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 15000, mfj: 30000 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 4000,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [
        {
          fromYear: 2027,
          retirementExclusion: {
            kind: 'perPerson',
            pensionMinAge: 0,
            traditionalMinAge: 0,
            applies: { pension: true, traditional: true },
            tiers: [ [ 62, 35000 ], [ 65, 70000 ] ],
            reducedBy: 'none',
            share: null
          }
        }
      ],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 0,
        traditionalMinAge: 0,
        applies: { pension: true, traditional: true },
        tiers: [ [ 62, 35000 ], [ 65, 65000 ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'heir' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Flat 4.99% from 2026 (House Bill 463, 2026; the further 0.1-point cuts depend on revenue and are left out) with a $15,000 single and $30,000 joint standard deduction (Department of Revenue, read). $4,000 per dependent (secondary). Each filer 62 to 64 excludes up to $35,000 of retirement income and each filer 65 or older $65,000, rising to $70,000 from 2027 (press release on House Bill 463, read; the age 62 amount is from memory of the statute). Social Security is exempt. The $5,000 earned-income limit on the exclusion for those under 65 and the military retirement exclusion are not modeled. Inherited IRA and 401(k) distributions share your own retirement exclusion, on your own age.',
    },
    hi: {
      name: 'Hawaii',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://files.hawaii.gov/tax/news/announce/ann24-03.pdf',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [
            [ 0, 0.014 ],
            [ 9600, 0.032 ],
            [ 14400, 0.055 ],
            [ 19200, 0.064 ],
            [ 24000, 0.068 ],
            [ 36000, 0.072 ],
            [ 48000, 0.076 ],
            [ 125000, 0.079 ],
            [ 175000, 0.0825 ],
            [ 225000, 0.09 ],
            [ 275000, 0.1 ],
            [ 325000, 0.11 ]
          ],
          mfj: [
            [ 0, 0.014 ],
            [ 19200, 0.032 ],
            [ 28800, 0.055 ],
            [ 38400, 0.064 ],
            [ 48000, 0.068 ],
            [ 72000, 0.072 ],
            [ 96000, 0.076 ],
            [ 250000, 0.079 ],
            [ 350000, 0.0825 ],
            [ 450000, 0.09 ],
            [ 550000, 0.1 ],
            [ 650000, 0.11 ]
          ],
          hoh: [
            [ 0, 0.014 ],
            [ 14400, 0.032 ],
            [ 21600, 0.055 ],
            [ 28800, 0.064 ],
            [ 36000, 0.068 ],
            [ 54000, 0.072 ],
            [ 72000, 0.076 ],
            [ 187500, 0.079 ],
            [ 262500, 0.0825 ],
            [ 337500, 0.09 ],
            [ 412500, 0.1 ],
            [ 487500, 0.11 ]
          ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 8000, mfj: 16000, hoh: 12000 },
      exemption: { single: 1144, mfj: 2288, hoh: 1144 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 1144,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [
        {
          fromYear: 2027,
          tax: {
            kind: 'graduated',
            columns: {
              single: [
                [ 0, 0.014 ],
                [ 14400, 0.025 ],
                [ 19200, 0.05 ],
                [ 24000, 0.064 ],
                [ 36000, 0.068 ],
                [ 48000, 0.072 ],
                [ 125000, 0.076 ],
                [ 175000, 0.079 ],
                [ 225000, 0.0825 ],
                [ 275000, 0.09 ],
                [ 325000, 0.1 ],
                [ 400000, 0.11 ],
                [ 500000, 0.13 ]
              ],
              mfj: [
                [ 0, 0.014 ],
                [ 28800, 0.025 ],
                [ 38400, 0.05 ],
                [ 48000, 0.064 ],
                [ 72000, 0.068 ],
                [ 96000, 0.072 ],
                [ 250000, 0.076 ],
                [ 350000, 0.079 ],
                [ 450000, 0.0825 ],
                [ 550000, 0.09 ],
                [ 650000, 0.1 ],
                [ 800000, 0.11 ],
                [ 1000000, 0.13 ]
              ],
              hoh: [
                [ 0, 0.014 ],
                [ 21600, 0.025 ],
                [ 28800, 0.05 ],
                [ 36000, 0.064 ],
                [ 54000, 0.068 ],
                [ 72000, 0.072 ],
                [ 187500, 0.076 ],
                [ 262500, 0.079 ],
                [ 337500, 0.0825 ],
                [ 412500, 0.09 ],
                [ 487500, 0.1 ],
                [ 600000, 0.11 ],
                [ 750000, 0.13 ]
              ]
            }
          }
        },
        { fromYear: 2028, standardDeduction: { single: 9000, mfj: 18000, hoh: 13500 } },
        {
          fromYear: 2029,
          tax: {
            kind: 'graduated',
            columns: {
              single: [
                [ 0, 0.014 ],
                [ 19200, 0.025 ],
                [ 24000, 0.05 ],
                [ 36000, 0.064 ],
                [ 48000, 0.068 ],
                [ 125000, 0.072 ],
                [ 175000, 0.076 ],
                [ 225000, 0.079 ],
                [ 275000, 0.0825 ],
                [ 325000, 0.09 ],
                [ 400000, 0.1 ],
                [ 475000, 0.11 ],
                [ 500000, 0.13 ]
              ],
              mfj: [
                [ 0, 0.014 ],
                [ 38400, 0.025 ],
                [ 48000, 0.05 ],
                [ 72000, 0.064 ],
                [ 96000, 0.068 ],
                [ 250000, 0.072 ],
                [ 350000, 0.076 ],
                [ 450000, 0.079 ],
                [ 550000, 0.0825 ],
                [ 650000, 0.09 ],
                [ 800000, 0.1 ],
                [ 950000, 0.11 ],
                [ 1000000, 0.13 ]
              ],
              hoh: [
                [ 0, 0.014 ],
                [ 28800, 0.025 ],
                [ 36000, 0.05 ],
                [ 54000, 0.064 ],
                [ 72000, 0.068 ],
                [ 187500, 0.072 ],
                [ 262500, 0.076 ],
                [ 337500, 0.079 ],
                [ 412500, 0.0825 ],
                [ 487500, 0.09 ],
                [ 600000, 0.1 ],
                [ 712500, 0.11 ],
                [ 750000, 0.13 ]
              ]
            }
          }
        },
        { fromYear: 2030, standardDeduction: { single: 10000, mfj: 20000, hoh: 15000 } },
        { fromYear: 2031, standardDeduction: { single: 12000, mfj: 24000, hoh: 18000 } }
      ],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 0,
        traditionalMinAge: 0,
        applies: { pension: true, traditional: false },
        tiers: [ [ 0, null ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Twelve brackets from 1.4% to 11%; the 2026 brackets equal 2025 and the standard deduction is $8,000 single, $16,000 joint, $12,000 head of household (Department of Taxation Announcement 2024-03 on Act 46, read). Scheduled by statute: the wider brackets in 2027 and 2029 and the larger deductions in 2028, 2030 and 2031 (Act 46), and from 2027 a second bracket of 2.5%, a third of 5% and a 13% top bracket above $500,000 single, $750,000 head of household and $1,000,000 joint (Act 24 of 2026, Announcement 2026-06, read). $1,144 exemption per person and dependent. Social Security and employer-funded pensions are exempt; IRA and 401(k) withdrawals are treated as taxable (the pension stream is excluded in full). The 7.25% cap on long-term gains is not modeled, so gains in the higher brackets are slightly overtaxed. The food and excise tax credits for low incomes are not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).',
    },
    id: {
      name: 'Idaho',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://tax.idaho.gov/?p=218294',
      asOf: 2026,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'flat', rate: 0.053 },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: true, seniorDeduction: true, ageAdditional: true },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [
        {
          kind: 'incomeTestedCredit',
          label: 'Food tax credit',
          refundable: true,
          amount: { single: 155, mfj: 310, hoh: 155 },
          perSenior: null,
          perDependent: 155,
          limit: null,
          taper: null
        }
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: "Flat 5.3% since 2025 (Tax Commission). Idaho starts from federal taxable income: the federal standard deduction with the 65+ add-on and, after House Bill 559 (2026, retroactive to 2025), the federal senior deduction. Social Security is exempt. The food tax credit is $155 per person (2025 amount; the 2026 amount was not found) and refundable. Idaho's retirement benefits deduction for public pensions is not modeled because the planner cannot tell public pensions from private ones, and private pensions and IRA withdrawals are fully taxed. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).",
    },
    il: {
      name: 'Illinois',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://tax.illinois.gov/research/publications/bulletins/fy-2026-15.html',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'flat', rate: 0.0495 },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0, hoh: 0 },
      exemption: { single: 2925, mfj: 5850, hoh: 2925 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 2925,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'perSenior', age: 65, amount: 1000, phaseOut: null },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 0,
        traditionalMinAge: 0,
        applies: { pension: true, traditional: true },
        tiers: [ [ 0, null ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'exempt' },
      credits: [
        {
          kind: 'propertyTaxShareCredit',
          label: 'Property tax credit (5%)',
          refundable: false,
          rate: 0.05,
          agiLimit: { single: 250000, mfj: 500000, hoh: 250000 }
        }
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Flat 4.95%, no standard deduction, an exemption of $2,925 per filer and dependent for 2026 (Department of Revenue Bulletin FY 2026-15, read) and $1,000 more for each filer 65 or older (current law; a bill to make it $2,000 was not confirmed as enacted). Social Security and retirement income (pensions, IRA and 401(k) distributions) are fully exempt. A credit of 5% of the property tax paid. The exemption and the credit end above $250,000 of income ($500,000 joint), which is not modeled. The K-12 education expense credit and the earned income credit are not modeled. Inherited IRA and 401(k) distributions are subtracted, like all IRA and plan distributions.',
    },
    in: {
      name: 'Indiana',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://www.in.gov/dor/files/dn01.pdf',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'flat', rate: 0.0295 },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 1000, mfj: 2000 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 2500,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'perSenior', age: 65, amount: 1000, phaseOut: null },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [ { fromYear: 2027, tax: { kind: 'flat', rate: 0.029 } } ],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: { kind: 'flat', rate: 0.0177 },
      notes: "State rate 2.95% in 2026 and 2.90% from 2027 (Departmental Notice #1; further cuts depend on revenue and are left out). No standard deduction: $1,000 exemption per filer, $1,000 more per filer 65 or older (the extra $500 when income is under $40,000 is not modeled), and $2,500 per dependent child ($1,000 plus the $1,500 additional). Social Security is exempt. Every county also levies an income tax of 0.5% to 3.0% (2026 rates in the Notice); the planner uses one statewide rate of 1.77%, the average of the county rates weighted by approximate 2020 census population, applied to the state taxable income. The renter's deduction and military and other retirement deductions are not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).",
    },
    ia: {
      name: 'Iowa',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://revenue.iowa.gov/press-release/2025-10-21/idr-announces-2026-individual-income-tax-and-interest-rates',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: true,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: { kind: 'flat', rate: 0.038 },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0, hoh: 0 },
      exemption: { single: 0, mfj: 0, hoh: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: true, seniorDeduction: true, ageAdditional: true },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 55,
        traditionalMinAge: 55,
        applies: { pension: true, traditional: true },
        tiers: [ [ 0, null ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'exempt' },
      credits: [
        {
          kind: 'exemptionCredits',
          label: 'Exemption credits ($40 each, $20 more at 65+)',
          refundable: false,
          personal: { single: 40, mfj: 80, hoh: 80 },
          personalCount: { single: 1, mfj: 2, hoh: 2 },
          senior: { age: 65, amount: 20 },
          dependent: 40,
          phaseOut: { start: { single: 10000000, mfj: 10000000, hoh: 10000000 }, width: 1000, reduction: 0 }
        }
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Flat 3.8% on all taxable income from 2026 (Department of Revenue; Senate File 2442). Iowa uses the federal standard deduction and, by rolling conformity, the federal senior deduction. Social Security is exempt. Retirement income of every kind (pensions, IRA, 401(k), Roth conversions) is excluded for a filer 55 or older (Department of Revenue guidance). Credits of $40 per filer (two for joint or head of household) and dependent, and $20 more for each filer 65 or older (2025 IA 1040 instructions, read). The low-income exemption and the school district surtax are not modeled. Inherited IRA and 401(k) distributions are excluded (a survivor with an insurable interest in a qualifying decedent; a parent assumed).',
    },
    ks: {
      name: 'Kansas',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://www.ksrevenue.gov/pdf/kw100.pdf',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0.052 ], [ 23000, 0.0558 ] ],
          mfj: [ [ 0, 0.052 ], [ 46000, 0.0558 ] ],
          hoh: [ [ 0, 0.052 ], [ 23000, 0.0558 ] ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 3605, mfj: 8240, hoh: 6180 },
      exemption: { single: 9160, mfj: 18320, hoh: 9160 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 2320,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: "Two brackets, 5.2% to $23,000 ($46,000 joint) and 5.58% above. 2026 standard deduction $3,605 single, $8,240 joint, $6,180 head of household and an exemption allowance of $9,160 per filer (Department of Revenue withholding guide KW-100, read); $2,320 per dependent (secondary). Social Security is fully exempt from 2024 on (Department of Revenue). The food sales tax refund and the state's government-pension exemption are not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).",
    },
    ky: {
      name: 'Kentucky',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://revenue.ky.gov/Forms/2026%20Withholding%20Formula.pdf',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: true,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'flat', rate: 0.035 },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 3360, mfj: 3360 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 0,
        traditionalMinAge: 0,
        applies: { pension: true, traditional: true },
        tiers: [ [ 0, 31110 ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'heir' },
      credits: [
        {
          kind: 'incomeTestedCredit',
          label: 'Credit for age 65 or older',
          refundable: false,
          amount: { single: 0, mfj: 0 },
          perSenior: { age: 65, amount: 40 },
          perDependent: 0,
          limit: null,
          taper: null
        }
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Flat 3.5% from 2026 (HB 1, 2025) with a $3,360 standard deduction per return (Department of Revenue 2026 withholding formula; later cuts depend on revenue and are left out). Social Security is exempt. Each filer excludes up to $31,110 of pension, annuity, IRA and 401(k) income (secondary source; a bill to restore $41,110 died in committee in 2025). $40 credit for each filer 65 or older. The family size tax credit for low incomes, the blind credit and local occupational taxes are not modeled. Inherited IRA and 401(k) distributions share your own retirement exclusion, on your own age.',
    },
    la: {
      name: 'Louisiana',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://revenue.louisiana.gov/tax-education-and-faqs/faqs/income-tax-reform/did-the-annual-retirement-exemption-change/',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: true,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: true,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'flat', rate: 0.03 },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 12500, mfj: 25000 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 65,
        traditionalMinAge: 65,
        applies: { pension: true, traditional: true },
        tiers: [ [ 65, 12000 ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'heir' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Flat 3% from 2025 (Act 11 of the 2024 special session). Standard deduction $12,500 single and $25,000 joint, adjusted for inflation from 2026 (secondary sources; the Department of Revenue notice was not opened). Social Security and Louisiana public pensions are exempt. Each filer 65 or older excludes up to $12,000 of retirement income (doubled from $6,000 for 2025, adjusted for inflation; the exclusion applied to pensions, annuities and IRA withdrawals). The Department of Revenue FAQ confirms that the additional $1,000 deductions for the blind, persons 65 and older, and dependents were repealed (read), so no personal, dependent or age exemption is modeled. Local taxes are not modeled. Inherited IRA and 401(k) distributions share your own retirement exclusion, on your own age.',
    },
    me: {
      name: 'Maine',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://www.maine.gov/revenue/sites/maine.gov.revenue/files/2026-05/ind_tax_rate_sched_2026_rev.pdf',
      asOf: 2026,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: true,
        creditAmountsIndexed: true,
        creditThresholdsIndexed: true,
        retirementExclusionIndexed: true,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0.058 ], [ 27400, 0.0675 ], [ 64850, 0.0715 ] ],
          mfj: [ [ 0, 0.058 ], [ 54850, 0.0675 ], [ 129750, 0.0715 ] ],
          hoh: [ [ 0, 0.058 ], [ 41100, 0.0675 ], [ 97300, 0.0715 ] ]
        }
      },
      additions: [
        {
          kind: 'threshold',
          threshold: { single: 1000000, mfj: 1500000, hoh: 1500000 },
          rate: 0.02,
          indexed: true
        }
      ],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 15700, mfj: 31400, hoh: 23550 },
      exemption: { single: 5300, mfj: 10600, hoh: 5300 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'perSenior', age: 65, amount: 1650, phaseOut: null },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 0,
        traditionalMinAge: 0,
        applies: { pension: true, traditional: true },
        tiers: [ [ 0, 49824 ] ],
        reducedBy: 'benefitsReceived',
        share: null
      },
      inherited: { kind: 'ordinary' },
      credits: [
        {
          kind: 'childCredit',
          label: 'Dependent exemption tax credit',
          refundable: true,
          tiers: [[5, 610], [200, 305]],
          phaseOut: { start: { single: 100000, mfj: 150000, hoh: 125000, qss: 150000 }, measure: 'stateAgi', width: 500, per: 20 },
        },
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: "5.8% / 6.75% / 7.15% with 2026 limits of $27,400 and $64,850 single, $54,850 and $129,750 joint, $41,100 and $97,300 head of household; a new 2% surcharge on income over $1,000,000 single or $1,500,000 joint (Maine Revenue Services 2026 rate schedule, read). Standard deduction $15,700 / $31,400 / $23,550, personal exemption $5,300 per filer and none for dependents (36 M.R.S. 5126-A: dependents get the dependent exemption tax credit instead), and an extra $1,650 for a married filer 65 or older ($2,050 unmarried; the planner uses $1,650). Social Security is exempt. The pension deduction is $49,824 per filer in 2026 minus all Social Security and railroad benefits received (Maine Revenue Services, search excerpts); its phase-out above $125,000 single / $250,000 joint of AGI and the standard deduction's phase-out over $102,250 / $204,550 are not modeled. The property tax fairness credit and the personal exemption phase-out (a share of the exemption equal to the Maine AGI over $266,700 single, $293,350 head of household or $320,000 joint, statutory base amounts that are indexed, divided by $125,000; 36 M.R.S. 5126-A(2); it only matters above about $267,000) are not modeled. Dependent exemption tax credit (36 M.R.S. 5219-SS, primary): $300 for each dependent from 2026, doubled for each child under six for tax years from 2025 on with no end date (subsection 5), refundable, reduced by $20 for each $500 or fraction of Maine AGI over $100,000 single, $125,000 head of household and $150,000 joint; the amounts and the thresholds are indexed (36 M.R.S. 5403, subsections 9 and 10). The row uses the 2025 Maine Revenue Services worksheet figures ($305 and $610) for 2026 until the 2026 worksheet is published; the round-downs to $5 and $50 are not modeled. The planner counts the children in its list, not other dependents. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).",
    },
    md: {
      name: 'Maryland',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/legal-publications/alerts/tax-alert-changes-to-standard-and-itemized-deductions-and-to-state-and-local-income-tax-rates-from-the-2025-legislative-session.pdf',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: true,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: true,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [
            [ 0, 0.02 ],
            [ 1000, 0.03 ],
            [ 2000, 0.04 ],
            [ 3000, 0.0475 ],
            [ 100000, 0.05 ],
            [ 125000, 0.0525 ],
            [ 150000, 0.055 ],
            [ 250000, 0.0575 ],
            [ 500000, 0.0625 ],
            [ 1000000, 0.065 ]
          ],
          mfj: [
            [ 0, 0.02 ],
            [ 1000, 0.03 ],
            [ 2000, 0.04 ],
            [ 3000, 0.0475 ],
            [ 150000, 0.05 ],
            [ 175000, 0.0525 ],
            [ 225000, 0.055 ],
            [ 300000, 0.0575 ],
            [ 600000, 0.0625 ],
            [ 1200000, 0.065 ]
          ],
          hoh: [
            [ 0, 0.02 ],
            [ 1000, 0.03 ],
            [ 2000, 0.04 ],
            [ 3000, 0.0475 ],
            [ 150000, 0.05 ],
            [ 175000, 0.0525 ],
            [ 225000, 0.055 ],
            [ 300000, 0.0575 ],
            [ 600000, 0.0625 ],
            [ 1200000, 0.065 ]
          ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 3350, mfj: 6700, hoh: 6700 },
      exemption: { single: 3200, mfj: 6400, hoh: 3200 },
      exemptionPhaseOut: {
        kind: 'stepDown',
        start: { single: 100000, mfj: 150000, hoh: 100000 },
        step: { single: 1600, mfj: 3200, hoh: 1600 },
        width: 25000
      },
      dependentExemption: 3200,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'perSenior', age: 65, amount: 1000, phaseOut: null },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 65,
        traditionalMinAge: 65,
        applies: { pension: true, traditional: false },
        tiers: [ [ 0, 40600 ] ],
        reducedBy: 'benefitsReceived',
        share: null
      },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: { kind: 'flat', rate: 0.032 },
      notes: "Ten brackets from 2% to 6.5% (the Comptroller's tax alert on the 2025 session, read: 5.75% from $250,000 single or $300,000 joint, 6.25% from $500,000 / $600,000 and 6.5% from $1,000,000 / $1,200,000), a $3,350 single and $6,700 joint or head of household standard deduction with no income test, indexed (the 2025 amounts; 2026 not found), and a $3,200 exemption per person and dependent that shrinks over $100,000 ($150,000 joint) of income (about 1,600 per $25,000; the real schedule has a 800 step the planner rounds), $1,000 more at 65. Social Security is exempt. A filer 65 or older excludes up to $40,600 of pension (defined-benefit) income, less all benefits received (Comptroller pension exclusion page, search excerpt); a 2026 bill phasing in a larger exclusion that includes IRAs (30% in 2026) was not confirmed as law and is not modeled. Every county also taxes income at 2.25% to 3.3%; the planner adds 3.2%, the most common county rate (Comptroller 2026 withholding information), to the Maryland taxable income. The 2% surtax on gains for incomes over $350,000 is not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).",
    },
    ma: {
      name: 'Massachusetts',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://www.mass.gov/info-details/massachusetts-tax-rates',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: { kind: 'flat', rate: 0.05 },
      additions: [ { kind: 'threshold', threshold: 1107750, rate: 0.04, indexed: true } ],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0, hoh: 0 },
      exemption: { single: 4400, mfj: 8800, hoh: 6800 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 1000,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'perSenior', age: 65, amount: 700, phaseOut: null },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [
        {
          kind: 'childCredit',
          label: 'Child and Family Tax Credit',
          refundable: true,
          tiers: [ [ 12, 440 ] ],
          phaseOut: { start: { single: 10000000, mfj: 10000000, hoh: 10000000 }, width: 1000, per: 0 }
        }
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Flat 5% on wages, pensions, IRA withdrawals and long-term gains, plus a 4% surtax on income over $1,107,750 in 2026 (indexed). Personal exemption $4,400 single, $8,800 joint, $6,800 head of household, $1,000 per dependent and $700 per filer 65 or older (secondary sources; the mass.gov page returned an error). Social Security is exempt. Child and Family Tax Credit $440 per dependent under 13, refundable, no income test (the dependent 65-plus and disabled variants are not modeled). Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir). Not modeled: short-term gains (8.5%), the 50% rent deduction (up to $4,000), the senior circuit-breaker credit, and the exemption for public pensions.',
    },
    mi: {
      name: 'Michigan',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://www.michigan.gov/taxes/rep-legal/rab/2026-revenue-administrative-bulletins/revenue-administrative-bulletin-2026-1',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: true,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: true,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'flat', rate: 0.0425 },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 5900, mfj: 11800 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 5900,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 0,
        traditionalMinAge: 0,
        applies: { pension: true, traditional: true },
        tiers: [ [ 0, { single: 67610, mfj: 135220, hoh: 67610 } ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Flat 4.25% with a $5,900 exemption per person and dependent for 2026. Social Security is exempt. From 2026 every retiree, whatever the birth year, deducts retirement and pension benefits up to $67,610 single or $135,220 joint (Revenue Administrative Bulletin 2026-1 and Public Acts 4 of 2023 and 24 of 2025, search excerpts; the planner applies the joint figure to each spouse). The alternative standard deduction at 67 ($20,000 / $40,000) is never larger and is not modeled. The homestead property tax credit and city income taxes (Detroit and others) are not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).',
    },
    mn: {
      name: 'Minnesota',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://www.revenue.state.mn.us/press-release/2025-12-16/minnesota-income-tax-brackets-standard-deduction-and-dependent-exemption',
      asOf: 2026,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: true,
        creditAmountsIndexed: true,
        creditThresholdsIndexed: true,
        retirementExclusionIndexed: true,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0.0535 ], [ 33310, 0.068 ], [ 109430, 0.0785 ], [ 203150, 0.0985 ] ],
          mfj: [ [ 0, 0.0535 ], [ 48700, 0.068 ], [ 193480, 0.0785 ], [ 337930, 0.0985 ] ],
          hoh: [ [ 0, 0.0535 ], [ 41010, 0.068 ], [ 164800, 0.0785 ], [ 270060, 0.0985 ] ]
        }
      },
      additions: [],
      base: {
        ordinary: true,
        gainsIncluded: 1,
        gainsRate: null,
        gainsDeduction: 0,
        socialSecurity: {
          kind: 'agiShare',
          inclusive: false,
          tables: {
            single: [
              [ 0, 1 ],
              [ 86410, 0.9 ],
              [ 90410, 0.8 ],
              [ 94410, 0.7 ],
              [ 98410, 0.6 ],
              [ 102410, 0.5 ],
              [ 106410, 0.4 ],
              [ 110410, 0.3 ],
              [ 114410, 0.2 ],
              [ 118410, 0.1 ],
              [ 122410, 0 ]
            ],
            mfj: [
              [ 0, 1 ],
              [ 110780, 0.9 ],
              [ 114780, 0.8 ],
              [ 118780, 0.7 ],
              [ 122780, 0.6 ],
              [ 126780, 0.5 ],
              [ 130780, 0.4 ],
              [ 134780, 0.3 ],
              [ 138780, 0.2 ],
              [ 142780, 0.1 ],
              [ 146780, 0 ]
            ],
            hoh: [
              [ 0, 1 ],
              [ 86410, 0.9 ],
              [ 90410, 0.8 ],
              [ 94410, 0.7 ],
              [ 98410, 0.6 ],
              [ 102410, 0.5 ],
              [ 106410, 0.4 ],
              [ 110410, 0.3 ],
              [ 114410, 0.2 ],
              [ 118410, 0.1 ],
              [ 122410, 0 ]
            ]
          }
        }
      },
      standardDeduction: { single: 15300, mfj: 30600, hoh: 23000 },
      exemption: { single: 0, mfj: 0, hoh: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 5300,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'perSenior', age: 65, amount: { single: 2000, mfj: 1600, hoh: 2000 }, phaseOut: null },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [
        {
          kind: 'childCredit',
          label: 'Child Tax Credit (Schedule M1CWFC)',
          refundable: true,
          tiers: [[17, 1800]],
          phaseOut: { start: { single: 32680, mfj: 38770, hoh: 32680, qss: 32680 }, width: 1, per: 0, rate: 0.12 },
        },
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: "Four brackets, 5.35% / 6.8% / 7.85% / 9.85% (2026 limits: $33,310, $109,430, $203,150 single; $48,700, $193,480, $337,930 joint; $41,010, $164,800, $270,060 head of household), standard deduction $15,300 / $30,600 / $23,000 and a $5,300 dependent exemption (Department of Revenue, read). Social Security (simplified subtraction, 290.0132 subd. 26): all taxable benefits are subtracted while federal AGI is at most $86,410 single and head of household or $110,780 joint, and 10% less for each $4,000 or fraction over. The additional standard deduction for 65+ is $1,600 per married filer 65 or older and $2,000 single or head of household (Department of Revenue, Tax Year 2026 Inflation-Adjusted Amounts, 2025-12, read: https://www.revenue.state.mn.us/sites/default/files/2025-12/inflation-adjusted-amounts-2026.pdf). Child Tax Credit (290.0661, same 2026 table; Schedule M1CWFC): $1,800 per qualifying child under 18, refundable, reduced by 12% of the federal AGI over $38,770 joint and $32,680 for every other status (the amount and the thresholds are indexed); the working family credit part (earned income) and the 9% rate for the older-children credit are not modeled. Not modeled: the high-income limits, a backlog item (Minnesota high-income limits, in docs/next-batches-plan.md): the standard deduction limitation (290.0123 subd. 5, 2026 amounts: reduced by the lesser of 3% of the AGI between $244,400 and $337,800 plus 10% of the AGI over $337,800, or 80% of the deduction; 80% over $1,107,750) and the dependent exemption disallowance ($366,700 joint). Also not modeled: the alternate Social Security subtraction (290.0132 subd. 26(e)-(h): up to $5,840 joint / $4,560 single less 20% of provisional income over $88,630 / $69,250, not indexed; worth at most about $400 a year, decided not to build), the public pension subtraction and the property tax refund. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).",
    },
    ms: {
      name: 'Mississippi',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://billstatus.ls.state.ms.us/documents/2025/html/HB/0001-0099/HB0001SG.htm',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0 ], [ 10000, 0.04 ] ],
          mfj: [ [ 0, 0 ], [ 10000, 0.04 ] ],
          hoh: [ [ 0, 0 ], [ 10000, 0.04 ] ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 2300, mfj: 4600, hoh: 3400 },
      exemption: { single: 6000, mfj: 12000, hoh: 8000 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 1500,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'perSenior', age: 65, amount: 1500, phaseOut: null },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [
        {
          fromYear: 2027,
          tax: {
            kind: 'graduated',
            columns: {
              single: [ [ 0, 0 ], [ 10000, 0.0375 ] ],
              mfj: [ [ 0, 0 ], [ 10000, 0.0375 ] ],
              hoh: [ [ 0, 0 ], [ 10000, 0.0375 ] ]
            }
          }
        },
        {
          fromYear: 2028,
          tax: {
            kind: 'graduated',
            columns: {
              single: [ [ 0, 0 ], [ 10000, 0.035 ] ],
              mfj: [ [ 0, 0 ], [ 10000, 0.035 ] ],
              hoh: [ [ 0, 0 ], [ 10000, 0.035 ] ]
            }
          }
        },
        {
          fromYear: 2029,
          tax: {
            kind: 'graduated',
            columns: {
              single: [ [ 0, 0 ], [ 10000, 0.0325 ] ],
              mfj: [ [ 0, 0 ], [ 10000, 0.0325 ] ],
              hoh: [ [ 0, 0 ], [ 10000, 0.0325 ] ]
            }
          }
        },
        {
          fromYear: 2030,
          tax: {
            kind: 'graduated',
            columns: {
              single: [ [ 0, 0 ], [ 10000, 0.03 ] ],
              mfj: [ [ 0, 0 ], [ 10000, 0.03 ] ],
              hoh: [ [ 0, 0 ], [ 10000, 0.03 ] ]
            }
          }
        }
      ],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 0,
        traditionalMinAge: 59.5,
        applies: { pension: true, traditional: true },
        tiers: [ [ 0, null ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'exempt' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: "0% on the first $10,000 and 4% above for 2026, then 3.75% in 2027, 3.5% in 2028, 3.25% in 2029 and 3% from 2030 (House Bill 1, 2025, read; cuts after 2030 depend on revenue and are left out). Standard deduction $2,300 single, $4,600 joint, $3,400 head of family; exemptions $6,000 single, $12,000 joint, $8,000 head of family, $1,500 per dependent and $1,500 more for a filer 65 or older (Department of Revenue forms and the worklist; the age and dependent amounts are secondary). Social Security and retirement income are fully exempt once the plan's retirement requirements are met (the planner reads a pension at any age and IRA withdrawals from 59 and a half). Local taxes are none. Inherited IRA and 401(k) distributions are exempt (a distribution after death is not an early distribution).",
    },
    mo: {
      name: 'Missouri',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://dor.mo.gov/taxation/individual/tax-types/income/year-changes/',
      asOf: 2026,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [
            [ 0, 0 ],
            [ 1348, 0.02 ],
            [ 2696, 0.025 ],
            [ 4044, 0.03 ],
            [ 5392, 0.035 ],
            [ 6740, 0.04 ],
            [ 8088, 0.045 ],
            [ 9436, 0.047 ]
          ],
          mfj: [
            [ 0, 0 ],
            [ 1348, 0.02 ],
            [ 2696, 0.025 ],
            [ 4044, 0.03 ],
            [ 5392, 0.035 ],
            [ 6740, 0.04 ],
            [ 8088, 0.045 ],
            [ 9436, 0.047 ]
          ]
        }
      },
      additions: [],
      base: {
        ordinary: true,
        gainsIncluded: 0,
        gainsRate: null,
        gainsDeduction: 0,
        socialSecurity: { kind: 'ageAgiTiered', tiers: [ { minAge: 62, agiLimit: null, capOverLimit: 0 } ] }
      },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: true, seniorDeduction: false, ageAdditional: true },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 0,
        traditionalMinAge: 0,
        applies: { pension: true, traditional: true },
        tiers: [ [ 0, 6000 ] ],
        reducedBy: 'none',
        share: {
          inclusive: false,
          tables: {
            single: [
              [ 0, 1 ],
              [ 25000, 0.916667 ],
              [ 26000, 0.75 ],
              [ 27000, 0.583333 ],
              [ 28000, 0.416667 ],
              [ 29000, 0.25 ],
              [ 30000, 0.083333 ],
              [ 31000, 0 ]
            ],
            mfj: [
              [ 0, 1 ],
              [ 32000, 0.916667 ],
              [ 33000, 0.75 ],
              [ 34000, 0.583333 ],
              [ 35000, 0.416667 ],
              [ 36000, 0.25 ],
              [ 37000, 0.083333 ],
              [ 38000, 0 ]
            ]
          }
        }
      },
      inherited: { kind: 'heir' },
      credits: [],
      federalTaxSubtraction: {
        kind: 'lagged',
        placement: 'subtraction',
        cap: { single: 5000, mfj: 10000, hoh: 5000 },
        phase: {
          basis: 'tax',
          tables: {
            single: [ [ 0, 0.35 ], [ 25000, 0.25 ], [ 50000, 0.15 ], [ 100000, 0.05 ], [ 125000, 0 ] ],
            mfj: [ [ 0, 0.35 ], [ 25000, 0.25 ], [ 50000, 0.15 ], [ 100000, 0.05 ], [ 125000, 0 ] ],
            hoh: [ [ 0, 0.35 ], [ 25000, 0.25 ], [ 50000, 0.15 ], [ 100000, 0.05 ], [ 125000, 0 ] ]
          }
        }
      },
      localTax: 'notModeled',
      notes: 'Eight brackets, 0% to $1,348 and then 2% to 4.7% above $9,436 (Department of Revenue 2026 withholding formula, read), with the federal standard deduction and 65+ add-on. All capital gains are subtracted from 2025 (House Bill 594, signed July 2025; Department of Revenue, read). Social Security is exempt for a filer 62 or older. Federal income tax paid is deducted at 35%, 25%, 15% or 5% of the tax by income (none above $125,000), at most $5,000 single and $10,000 joint (RSMo 143.171, read). The private pension exemption of $6,000 per filer shrinks dollar for dollar over $25,000 single or $32,000 joint of income (six steps approximate it); a public pension is deductible up to the Social Security maximum, which the planner cannot tell from a private one, so it is treated as private. The property tax credit is not modeled. Inherited IRA and 401(k) distributions share your own retirement exclusion, on your own age.',
    },
    mt: {
      name: 'Montana',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://revenue.mt.gov/news/recent-news/HB-337',
      asOf: 2026,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0.047 ], [ 47500, 0.0565 ] ],
          mfj: [ [ 0, 0.047 ], [ 95000, 0.0565 ] ],
          hoh: [ [ 0, 0.047 ], [ 71250, 0.0565 ] ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: [ 0.03, 0.041 ], gainsDeduction: 0, socialSecurity: 'taxed' },
      standardDeduction: { single: 0, mfj: 0, hoh: 0 },
      exemption: { single: 0, mfj: 0, hoh: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: true, seniorDeduction: true, ageAdditional: true },
      schedule: [
        {
          fromYear: 2027,
          tax: {
            kind: 'graduated',
            columns: {
              single: [ [ 0, 0.047 ], [ 65000, 0.054 ] ],
              mfj: [ [ 0, 0.047 ], [ 130000, 0.054 ] ],
              hoh: [ [ 0, 0.047 ], [ 97500, 0.054 ] ]
            }
          }
        }
      ],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'From 2026 Montana starts from federal taxable income, so the federal standard deduction, 65+ add-on and senior deduction come through, and taxable Social Security is taxed as federally. Two brackets: 4.7% to $47,500 single, $71,250 head of household, $95,000 joint and 5.65% above; in 2027 4.7% to $65,000 / $97,500 / $130,000 and 5.4% above (House Bill 337, Department of Revenue, read). Long-term gains are taxed at 3.0% in the lower bracket and 4.1% in the upper, stacked on top of the other income. Montana does not deduct federal income tax (the earlier guess was wrong). The earned income credit (20% of the federal one), the elderly homeowner credit and the pension exclusion for 65+ are not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).',
    },
    ne: {
      name: 'Nebraska',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/f_1040N-ES.pdf',
      asOf: 2026,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: true,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0.0246 ], [ 4130, 0.0351 ], [ 24760, 0.0455 ] ],
          mfj: [ [ 0, 0.0246 ], [ 8250, 0.0351 ], [ 49530, 0.0455 ] ],
          hoh: [ [ 0, 0.0246 ], [ 7700, 0.0351 ], [ 39620, 0.0455 ] ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 8850, mfj: 17700, hoh: 13000 },
      exemption: { single: 0, mfj: 0, hoh: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'perSenior', age: 65, amount: 1700, phaseOut: null },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [
        {
          fromYear: 2027,
          tax: {
            kind: 'graduated',
            columns: {
              single: [ [ 0, 0.0246 ], [ 4270, 0.0351 ], [ 25570, 0.0399 ] ],
              mfj: [ [ 0, 0.0246 ], [ 8520, 0.0351 ], [ 51150, 0.0399 ] ],
              hoh: [ [ 0, 0.0246 ], [ 7960, 0.0351 ], [ 40910, 0.0399 ] ]
            }
          }
        }
      ],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [
        {
          kind: 'exemptionCredits',
          label: 'Personal exemption credit ($176 each)',
          refundable: false,
          personal: { single: 176, mfj: 352, hoh: 176 },
          personalCount: { single: 1, mfj: 2, hoh: 1 },
          senior: { age: 65, amount: 0 },
          dependent: 176,
          phaseOut: { start: { single: 10000000, mfj: 10000000, hoh: 10000000 }, width: 1000, reduction: 0 }
        }
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: '2026 rates 2.46%, 3.51% and 4.55% (the last two brackets share the top rate) on the Department of Revenue 2026 estimated tax schedule (read), and 3.99% from 2027 on the 2027 draft schedule (statute: same rate for the third and fourth brackets). Standard deduction $8,850 single and $17,700 joint (rate chronology, read; the head of household figure of $13,000 is derived), plus $2,050 / $1,700 for age 65 or older (the planner uses $1,700). A $176 credit for each exemption (filer, spouse, dependent). Social Security is fully exempt. Military retirement and the credit for the elderly are not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).',
    },
    nv: {
      name: 'Nevada',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://blog.taxact.com/states-with-no-income-tax',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'none' },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Nevada levies no individual income tax on wages, pensions, retirement withdrawals, Social Security or investment gains, so no state income tax is modeled.',
    },
    nh: {
      name: 'New Hampshire',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://www.mclane.com/insights/nh-interest-and-dividends-tax-repealed-as-of-january-1/',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'none' },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'New Hampshire repealed its Interest and Dividends Tax (3%) for tax periods beginning on or after January 1, 2025 (HB 2, 2023), and has no tax on wages, pensions or gains, so no state income tax is modeled. Its business taxes are outside this planner.',
    },
    nj: {
      name: 'New Jersey',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://www.nj.gov/treasury/taxation/njit7.shtml',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [
            [ 0, 0.014 ],
            [ 20000, 0.0175 ],
            [ 35000, 0.035 ],
            [ 40000, 0.05525 ],
            [ 75000, 0.0637 ],
            [ 500000, 0.0897 ],
            [ 1000000, 0.1075 ]
          ],
          mfj: [
            [ 0, 0.014 ],
            [ 20000, 0.0175 ],
            [ 50000, 0.0245 ],
            [ 70000, 0.035 ],
            [ 80000, 0.05525 ],
            [ 150000, 0.0637 ],
            [ 500000, 0.0897 ],
            [ 1000000, 0.1075 ]
          ],
          hoh: [
            [ 0, 0.014 ],
            [ 20000, 0.0175 ],
            [ 50000, 0.0245 ],
            [ 70000, 0.035 ],
            [ 80000, 0.05525 ],
            [ 150000, 0.0637 ],
            [ 500000, 0.0897 ],
            [ 1000000, 0.1075 ]
          ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0, hoh: 0 },
      exemption: { single: 1000, mfj: 2000, hoh: 1000 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 1500,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'perSenior', age: 65, amount: 1000, phaseOut: null },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 62,
        traditionalMinAge: 62,
        applies: { pension: true, traditional: true },
        tiers: [ [ 0, { single: 75000, mfj: 100000, hoh: 75000 } ] ],
        reducedBy: 'none',
        share: {
          inclusive: false,
          tables: {
            single: [ [ 0, 1 ], [ 100000, 0.375 ], [ 125000, 0.1875 ], [ 150000, 0 ] ],
            mfj: [ [ 0, 1 ], [ 100000, 0.5 ], [ 125000, 0.25 ], [ 150000, 0 ] ],
            hoh: [ [ 0, 1 ], [ 100000, 0.375 ], [ 125000, 0.1875 ], [ 150000, 0 ] ]
          }
        }
      },
      inherited: { kind: 'heir' },
      credits: [
        {
          kind: 'childStepCredit',
          label: 'Child Tax Credit',
          refundable: true,
          maxAge: 5,
          measure: 'income',
          tables: {
            single: [[0, 1000], [30000, 800], [40000, 600], [50000, 400], [60000, 200], [80000, 0]],
            mfj: [[0, 1000], [30000, 800], [40000, 600], [50000, 400], [60000, 200], [80000, 0]],
            hoh: [[0, 1000], [30000, 800], [40000, 600], [50000, 400], [60000, 200], [80000, 0]],
          },
        },
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Seven brackets (eight joint) from 1.4% to 10.75% (NJ-1040 2025 schedules, search excerpts; unchanged for 2026; head of household uses the joint table). No standard deduction: exemption $1,000 per filer, $1,000 more at 65, $1,500 per dependent (secondary). Social Security is exempt. The pension, annuity and IRA exclusion (Division of Taxation, read): a filer 62 or older excludes up to $75,000 single or head of household and $100,000 joint when total income is $100,000 or less, 37.5% / 18.75% of that single (50% / 25% joint) between $100,000 and $125,000 and $125,000 and $150,000, nothing above; the planner applies the joint cap per eligible filer, so two large pensions can be over-excluded. Child Tax Credit (Division of Taxation, 2025, primary): $1,000 for each child five or younger at the end of the year while NJ taxable income is $30,000 or less, then $800, $600, $400 and $200 for each further $10,000 to $80,000, nothing above; refundable (the planner reads the model taxable income after exemptions and deductions). The property tax deduction (up to $15,000) and credit, and the blind and veteran exemptions, are not modeled. Inherited IRA and 401(k) distributions share your own retirement exclusion, on your own age.',
    },
    nm: {
      name: 'New Mexico',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://realfile.tax.newmexico.gov/2025pit-adj-ins.pdf',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: true,
        personalExemptionIndexed: false,
        creditAmountsIndexed: true,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [
            [ 0, 0.015 ],
            [ 5500, 0.032 ],
            [ 16500, 0.043 ],
            [ 33500, 0.047 ],
            [ 66500, 0.049 ],
            [ 210000, 0.059 ]
          ],
          mfj: [
            [ 0, 0.015 ],
            [ 8000, 0.032 ],
            [ 25000, 0.043 ],
            [ 50000, 0.047 ],
            [ 100000, 0.049 ],
            [ 315000, 0.059 ]
          ],
          hoh: [
            [ 0, 0.015 ],
            [ 8000, 0.032 ],
            [ 25000, 0.043 ],
            [ 50000, 0.047 ],
            [ 100000, 0.049 ],
            [ 315000, 0.059 ]
          ]
        }
      },
      additions: [],
      base: {
        ordinary: true,
        gainsIncluded: 1,
        gainsRate: null,
        gainsDeduction: 2500,
        socialSecurity: { kind: 'agiTested', exemptBelow: { single: 100000, mfj: 150000, hoh: 150000 }, taxedShareOfBenefits: 1 }
      },
      standardDeduction: { single: 0, mfj: 0, hoh: 0 },
      exemption: { single: 2500, mfj: 5000, hoh: 2500 },
      exemptionPhaseOut: {
        kind: 'linear',
        start: { single: 20000, mfj: 30000, hoh: 30000 },
        rate: { single: 0.15, mfj: 0.1, hoh: 0.1 },
        full: 2500,
        dependent: 2500
      },
      dependentExemption: { kind: 'afterFirst', amount: 4000 },
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: {
        kind: 'perSenior',
        age: 65,
        amount: 8000,
        phaseOut: {
          start: { single: 18000, mfj: 30000, hoh: 30000 },
          rate: { single: 0.6666666666666666, mfj: 0.3333333333333333, hoh: 0.3333333333333333 },
          basis: 'federal'
        }
      },
      federalConformity: { standardDeduction: true, seniorDeduction: false, ageAdditional: true },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [
        {
          kind: 'childStepCredit',
          label: 'Child Income Tax Credit',
          refundable: true,
          tables: {
            single: [
              [ 0, 637 ],
              [ 25000, 424 ],
              [ 50000, 212 ],
              [ 75000, 106 ],
              [ 100000, 79 ],
              [ 200000, 53 ],
              [ 350000, 26 ]
            ],
            mfj: [
              [ 0, 637 ],
              [ 25000, 424 ],
              [ 50000, 212 ],
              [ 75000, 106 ],
              [ 100000, 79 ],
              [ 200000, 53 ],
              [ 350000, 26 ]
            ],
            hoh: [
              [ 0, 637 ],
              [ 25000, 424 ],
              [ 50000, 212 ],
              [ 75000, 106 ],
              [ 100000, 79 ],
              [ 200000, 53 ],
              [ 350000, 26 ]
            ]
          }
        }
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Six brackets, 1.5% to 5.9% (5,500 / 16,500 / 33,500 / 66,500 / 210,000 single; 8,000 / 25,000 / 50,000 / 100,000 / 315,000 joint and head of household; secondary sources, not indexed). The deduction is the federal standard deduction with the 65+ add-on (the 2025 Form PIT-1 instructions, line 12, read). Exemptions: a low- and middle-income exemption of $2,500 per person and dependent, reduced by 15 cents (single) or 10 cents (joint, head of household) per dollar of federal AGI over $20,000 or $30,000 and gone by $36,667 / $55,000 (PIT-1 worksheet, read); $4,000 for each dependent beyond the first (PIT-1 line 13); and for each filer 65 or older up to $8,000, falling by $1,000 per $1,500 of federal AGI over $18,000 single or per $3,000 over $30,000 joint, none over $28,500 / $51,000 (PIT-ADJ Table 1, read; the planner cuts it in a straight line, a few hundred dollars off the table in places). Social Security is exempt while federal AGI is under $100,000 single or $150,000 joint or head of household, and fully taxable at the federal amount from there (cliff; PIT-ADJ, read). Capital gains: a deduction of the first $2,500 (the 40% deduction is only for a New Mexico business sale; PIT-ADJ line 16, read). No retirement-income exclusion for private pensions or IRAs. Child Income Tax Credit per qualifying child by federal AGI, refundable: $637 to $25,000, then $424, $212, $106, $79 over $100,000, $53 over $200,000 and $26 over $350,000 (the 2025 amounts from PIT-RC Table 4, read; indexed by the planner). Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir). Not modeled: the low-income comprehensive tax rebate, the working families credit (state EITC), the medical care credit and exemption for 65+ with large medical costs, blind status, and the active-duty military exemption.',
    },
    ny: {
      name: 'New York',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://www.tax.ny.gov/pdf/2025/inc/it201i_2025.pdf',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [
            [0, 0.039], [8500, 0.044], [11700, 0.0515], [13900, 0.054], [80650, 0.059], [215400, 0.0685], [1077550, 0.0965],
            [5000000, 0.103], [25000000, 0.109],
          ],
          mfj: [
            [0, 0.039], [17150, 0.044], [23600, 0.0515], [27900, 0.054], [161550, 0.059], [323200, 0.0685], [2155350, 0.0965],
            [5000000, 0.103], [25000000, 0.109],
          ],
          hoh: [
            [0, 0.039], [12800, 0.044], [17650, 0.0515], [20900, 0.054], [107650, 0.059], [269300, 0.0685], [1616450, 0.0965],
            [5000000, 0.103], [25000000, 0.109],
          ],
        },
      },
      additions: [
        {
          kind: 'benefitRecapture',
          label: 'Tax benefit recapture',
          agiStart: 107650,
          phaseWidth: 50000,
          flatAbove: 25000000,
          flatRate: 0.109,
          tiers: {
            single: [[0, 0.059], [215400, 0.0685], [1077550, 0.0965], [5000000, 0.103]],
            mfj: [[0, 0.054], [161550, 0.059], [323200, 0.0685], [2155350, 0.0965], [5000000, 0.103]],
            hoh: [[0, 0.059], [269300, 0.0685], [1616450, 0.0965], [5000000, 0.103]],
          },
          indexed: false,
        },
      ],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 8000, mfj: 16050, hoh: 11200 },
      exemption: { single: 0, mfj: 0, hoh: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 1000,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'perPerson', pensionMinAge: 59.5, traditionalMinAge: 59.5, applies: { pension: true, traditional: true }, tiers: [[0, 20000]], reducedBy: 'none', share: null },
      inherited: { kind: 'decedent', cap: 20000 },
      credits: [
        {
          kind: 'childCredit',
          label: 'Empire State child credit',
          refundable: true,
          tiers: [[3, 1000], [16, 500]],
          phaseOut: { start: { single: 75000, mfj: 110000, hoh: 75000, qss: 75000 }, width: 1000, per: 16.5 },
        },
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Bracket thresholds are statutory and not indexed (IT-201-I 2024 and 2025, primary); the 2026 rates 3.9 / 4.4 / 5.15 / 5.4 / 5.9 percent are from secondary sources, as are the 2026 standard deductions ($8,000 / $16,050 / $11,200, unchanged for years) and the child credit. Tax benefit recapture follows the IT-201-I tax computation worksheets (checked against the 2024 constants). $20,000 per filer pension and annuity exclusion from age 59 and a half (traditional withdrawals included). Empire State child credit: $1,000 under age 4 and $500 ages 4-16 for 2026, fully refundable, reduced $16.50 per $1,000 of federal AGI over $75,000 ($110,000 joint), the reduction taken once from the total credit. Inherited IRA and 401(k) distributions get the decedent\'s own $20,000 pension exclusion, separate from yours and at any age (one beneficiary and a decedent of 59 1/2 or older assumed; enter one row per decedent). Not modeled: household credit, real property tax credit, EITC, NYC and Yonkers taxes.',
    },
    nc: {
      name: 'North Carolina',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://www.ncdor.gov/taxes-forms/north-carolina-child-deduction',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: { kind: 'flat', rate: 0.0399 },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 12750, mfj: 25500, hoh: 19125 },
      exemption: { single: 0, mfj: 0, hoh: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: {
        kind: 'agiTiered',
        tables: {
          single: [
            [ 0, 3000 ],
            [ 20000, 2500 ],
            [ 30000, 2000 ],
            [ 40000, 1500 ],
            [ 50000, 1000 ],
            [ 60000, 500 ],
            [ 70000, 0 ]
          ],
          mfj: [
            [ 0, 3000 ],
            [ 40000, 2500 ],
            [ 60000, 2000 ],
            [ 80000, 1500 ],
            [ 100000, 1000 ],
            [ 120000, 500 ],
            [ 140000, 0 ]
          ],
          hoh: [
            [ 0, 3000 ],
            [ 30000, 2500 ],
            [ 45000, 2000 ],
            [ 60000, 1500 ],
            [ 75000, 1000 ],
            [ 90000, 500 ],
            [ 105000, 0 ]
          ]
        }
      },
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Flat 3.99% for 2026 (the final scheduled step; the further cuts from 2027 depend on revenue and are left out). Standard deduction $12,750 single, $25,500 joint, $19,125 head of household (2025 amounts held for 2026; secondary source). Child deduction of $3,000 down to $0 per child by income and filing status (Department of Revenue 2025 tables, read; it is for children under 17, the planner applies it to every qualifying child). Social Security is exempt. The Bailey government-pension exemption is not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).',
    },
    nd: {
      name: 'North Dakota',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://www.tax.nd.gov/individual-income-tax',
      asOf: 2026,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0 ], [ 49575, 0.0195 ], [ 250400, 0.025 ] ],
          mfj: [ [ 0, 0 ], [ 82800, 0.0195 ], [ 304850, 0.025 ] ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 0.6, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: true, seniorDeduction: true, ageAdditional: true },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'North Dakota starts from federal taxable income, so the federal standard deduction, the 65+ add-on and the $6,000 senior deduction come through. 2026 table: 0% to $49,575 ($82,800 joint), 1.95% to $250,400 ($304,850 joint), 2.5% above (Tax Commissioner, read; head of household is read as single, which may differ). Social Security is exempt. A 40% exclusion of net long-term gains is applied (the 2025 return has a net long-term capital gain exclusion line; the 40% figure is from memory, secondary). Military retirement pay is not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).',
    },
    oh: {
      name: 'Ohio',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://www.lsc.ohio.gov/assets/legislation/136/hb96/en0/files/hb96-tax-bill-analysis-as-enacted-136th-general-assembly.pdf',
      asOf: 2026,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: { single: [ [ 0, 0 ], [ 26050, 0.0275 ] ], mfj: [ [ 0, 0 ], [ 26050, 0.0275 ] ] }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 2150, mfj: 4300 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: {
        kind: 'agiTiered',
        tables: {
          single: [ [ 0, 2400 ], [ 40000, 2150 ], [ 80000, 1900 ] ],
          mfj: [ [ 0, 2400 ], [ 40000, 2150 ], [ 80000, 1900 ] ]
        }
      },
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [
        {
          kind: 'incomeTestedCredit',
          label: 'Senior citizen credit ($50)',
          refundable: false,
          amount: { single: 0, mfj: 0 },
          perSenior: { age: 65, amount: 50 },
          perDependent: 0,
          limit: { single: 100000, mfj: 100000 },
          taper: null
        },
        {
          kind: 'taxShareCredit',
          label: 'Joint filing credit (20%, at most $650)',
          refundable: false,
          share: { single: 0, mfj: 0.2 },
          max: { single: 0, mfj: 650 }
        }
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'From 2026 a flat 2.75% above $26,050 (House Bill 96; Legislative Service Commission analysis and Department of Taxation pages, secondary). Personal exemption by income: $2,400 under $40,000, $2,150 to $80,000, $1,900 above (the planner uses $2,150 for the filers and the exact tiers for dependents); the exemptions and the joint filing credit end above $500,000 of income (not modeled). Social Security is exempt. $50 senior credit (65+, income under $100,000) and the joint filing credit (20% of tax, at most $650; the rule that each spouse needs $500 of income is not checked). The retirement income credit (up to $200) and Ohio municipal and school-district income taxes are not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).',
    },
    ok: {
      name: 'Oklahoma',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://www.oklegislature.gov/cf_pdf/2025-26%20ENR/hB/HB2764%20ENR.PDF',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0 ], [ 3750, 0.025 ], [ 4900, 0.035 ], [ 7200, 0.045 ] ],
          mfj: [ [ 0, 0 ], [ 7500, 0.025 ], [ 9800, 0.035 ], [ 14400, 0.045 ] ],
          hoh: [ [ 0, 0 ], [ 7500, 0.025 ], [ 9800, 0.035 ], [ 14400, 0.045 ] ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 6350, mfj: 12700, hoh: 9350 },
      exemption: { single: 1000, mfj: 2000, hoh: 1000 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 1000,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 0,
        traditionalMinAge: 59.5,
        applies: { pension: true, traditional: true },
        tiers: [ [ 0, 10000 ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'heirAnyAge' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: "From 2026 three brackets (House Bill 2764, read): 0% to $3,750, 2.5% to $4,900, 3.5% to $7,200 and 4.5% above for a single filer; double the first three limits for joint returns (head of household is read as joint, from memory of the statute). Not indexed. Standard deduction $6,350 / $12,700 / $9,350 and a $1,000 exemption per person (Tax Commission 2026 withholding tables). Social Security is exempt; each filer excludes up to $10,000 of retirement benefits (the 59 and a half age for IRAs is the planner's reading). The sales tax and child credits for low incomes are not modeled. Inherited IRA and 401(k) distributions count toward your $10,000 exclusion at any age.",
    },
    or: {
      name: 'Oregon',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://www.oregon.gov/dor/forms/FormsPubs/form-or-40-inst_101-040-1_2025.pdf',
      asOf: 2026,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: true,
        creditAmountsIndexed: true,
        creditThresholdsIndexed: true,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0.0475 ], [ 4550, 0.0675 ], [ 11400, 0.0875 ], [ 125000, 0.099 ] ],
          mfj: [ [ 0, 0.0475 ], [ 9100, 0.0675 ], [ 22800, 0.0875 ], [ 250000, 0.099 ] ],
          hoh: [ [ 0, 0.0475 ], [ 9100, 0.0675 ], [ 22800, 0.0875 ], [ 250000, 0.099 ] ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 2835, mfj: 5670, hoh: 4560 },
      exemption: { single: 0, mfj: 0, hoh: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [
        {
          kind: 'exemptionCredits',
          label: 'Exemption credit ($256 each)',
          refundable: false,
          personal: { single: 256, mfj: 512, hoh: 256 },
          personalCount: { single: 1, mfj: 2, hoh: 1 },
          senior: { age: 65, amount: 0 },
          dependent: 256,
          phaseOut: { start: { single: 100000, mfj: 200000, hoh: 200000 }, width: 1, reduction: 1000000 }
        },
        {
          kind: 'childCredit',
          label: 'Oregon Kids Credit',
          refundable: true,
          tiers: [[5, 1050]],
          maxChildren: 5,
          phaseOut: { start: { single: 26550, mfj: 26550, hoh: 26550, qss: 26550 }, measure: 'stateAgi', share: { width: 5000, round: 2 } },
        }
      ],
      federalTaxSubtraction: {
        kind: 'lagged',
        placement: 'subtraction',
        cap: { single: 8500, mfj: 8500, hoh: 8500 },
        phase: {
          basis: 'cap',
          tables: {
            single: [ [ 0, 1 ], [ 125000, 0.8 ], [ 130000, 0.6 ], [ 135000, 0.4 ], [ 140000, 0.2 ], [ 145000, 0 ] ],
            mfj: [ [ 0, 1 ], [ 250000, 0.8 ], [ 260000, 0.6 ], [ 270000, 0.4 ], [ 280000, 0.2 ], [ 290000, 0 ] ],
            hoh: [ [ 0, 1 ], [ 250000, 0.8 ], [ 260000, 0.6 ], [ 270000, 0.4 ], [ 280000, 0.2 ], [ 290000, 0 ] ]
          }
        }
      },
      localTax: 'notModeled',
      notes: '2026 brackets 4.75% / 6.75% / 8.75% / 9.9% at $4,550, $11,400 and $125,000 single ($9,100, $22,800 and $250,000 joint and head of household; the top bracket is not indexed) (Department of Revenue 2026 schedule, search excerpt). 2025 standard deduction $2,835 single and $5,670 joint (the head of household figure of $4,560 and the 2026 amounts were not found), a $256 credit per exemption that ends over $100,000 of income single and $200,000 joint, and a deduction for federal income tax paid of up to $8,500 that steps down to zero between $125,000 and $145,000 single and $250,000 and $290,000 joint (the step table is from memory). Social Security is exempt. The retirement income credit and Portland and Multnomah taxes are not modeled. Oregon Kids Credit (ORS 315.273 and the 2025 Form OR-40 worksheet, primary): $1,050 for each dependent under six (at most five, counted first), refundable, full at Oregon AGI up to $26,550 and then reduced by the share of the whole credit equal to the income over $26,550 divided by $5,000 (rounded to two decimals as on the worksheet), so nothing is left at $31,550 for any number of children. The statute sets $1,000 and $25,000, indexes the amount and the start (the divisor is fixed) and applies to tax years before 2029 (2023 c.538 section 11); the 2025 values stand for 2026 and the credit is modeled in every year (owner decision; recheck yearly). Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).',
    },
    pa: {
      name: 'Pennsylvania',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax/tax-forgiveness',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'flat', rate: 0.0307 },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'perPerson', pensionMinAge: 0, traditionalMinAge: 59.5, applies: { pension: true, traditional: true, employerPlanAfterRetirement: true }, tiers: [[0, null]], reducedBy: 'none', share: null },
      inherited: { kind: 'exempt' },
      credits: [
        {
          kind: 'taxForgiveness',
          label: 'Tax Forgiveness (Schedule SP)',
          refundable: false,
          limit: { single: 6500, mfj: 13000 },
          perDependent: 9500,
          stepWidth: 250,
          stepPct: 0.1,
        },
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Flat 3.07% with no standard deduction or exemption (pa.gov). Social Security is not taxed. Pension income is excluded. Traditional withdrawals are excluded from age 59 and a half per filer, and taxed before it, except the employer-plan (401(k)) part drawn after that filer has stopped working, which is excluded at any age (PA Personal Income Tax Guide, Gross Compensation: payments to persons retired from service; 61 Pa. Code 101.6): the 401(k) part is the share of the traditional accounts of that filer held in a 401(k), drawn pro rata. An IRA draw before 59 and a half is taxable (the guide: only the part over previously taxed contributions; cost recovery is not modeled, so the whole draw is taxed). Inherited IRA and 401(k) distributions are not taxed (paid by reason of death). Not modeled: the retirement-age or years-of-service condition of the plan itself, Roth cost recovery, the property tax / rent rebate (a paid program). Tax Forgiveness: 100% of the tax at or under $6,500 of eligibility income ($13,000 married) plus $9,500 per dependent, then 10% less per $250 (pa.gov tables); eligibility income is taken as the PA base (qualified retirement payments and Social Security are excluded from it).',
    },
    ri: {
      name: 'Rhode Island',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://tax.ri.gov/sites/g/files/xkgbur541/files/2025-11/ADV_2025_22_Inflation_Adjustments.pdf',
      asOf: 2026,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: true,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: true,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0.0375 ], [ 82050, 0.0475 ], [ 186450, 0.0599 ] ],
          mfj: [ [ 0, 0.0375 ], [ 82050, 0.0475 ], [ 186450, 0.0599 ] ],
          hoh: [ [ 0, 0.0375 ], [ 82050, 0.0475 ], [ 186450, 0.0599 ] ]
        }
      },
      additions: [],
      base: {
        ordinary: true,
        gainsIncluded: 1,
        gainsRate: null,
        gainsDeduction: 0,
        socialSecurity: {
          kind: 'ageAgiTiered',
          tiers: [ { minAge: 67, agiLimit: { single: 107000, mfj: 133750, hoh: 107000 }, capOverLimit: 0 } ]
        }
      },
      standardDeduction: { single: 11200, mfj: 22400, hoh: 16800 },
      exemption: { single: 5250, mfj: 10500, hoh: 5250 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 5250,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 67,
        traditionalMinAge: 67,
        applies: { pension: true, traditional: true, employerPlanOnly: true },
        tiers: [ [ 0, 50000 ] ],
        reducedBy: 'none',
        share: {
          inclusive: true,
          tables: {
            single: [ [ 0, 1 ], [ 107000, 0 ] ],
            mfj: [ [ 0, 1 ], [ 133750, 0 ] ],
            hoh: [ [ 0, 1 ], [ 107000, 0 ] ]
          }
        }
      },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'One schedule for every filer: 3.75% to $82,050, 4.75% to $186,450, 5.99% above; standard deduction $11,200 / $22,400 / $16,800 and $5,250 per person and dependent for 2026 (Division of Taxation Advisory 2025-22, read). Social Security is subtracted, and up to $50,000 of pension, 401(k) and annuity income per filer, for a filer at full retirement age (the planner uses 67) when federal AGI is under $107,000 single or $133,750 joint (the 2025 limits; the pension cap of $50,000 is from the same Advisory). IRA distributions never qualify (PUB 2026-01 Retirement Income Guide, read): only the 401(k) part of the traditional draw of each filer counts, taken pro rata to the 401(k) and IRA balances of that filer, whether or not that filer still works (PUB 2026-01, Example 4). A Roth conversion is split the same way, although the planner converts IRA money first (an IRA conversion never qualifies), so part of a conversion can be excluded in error. The phase-out of the deduction and exemptions between $261,000 and $290,800, the property tax relief credit and the earned income credit are not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).',
    },
    sc: {
      name: 'South Carolina',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://dor.sc.gov/news/information-about-h-4216',
      asOf: 2026,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: true,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0.0199 ], [ 30000, 0.0521 ] ],
          mfj: [ [ 0, 0.0199 ], [ 30000, 0.0521 ] ],
          hoh: [ [ 0, 0.0199 ], [ 30000, 0.0521 ] ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 0.56, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 15000, mfj: 30000, hoh: 22500 },
      exemption: { single: 0, mfj: 0, hoh: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 4930,
      standardDeductionPhase: {
        kind: 'linear',
        columns: {
          single: { start: 40000, end: 95000, floor: 0 },
          mfj: { start: 80000, end: 190000, floor: 0 },
          hoh: { start: 60000, end: 142500, floor: 0 }
        }
      },
      seniorExemption: { kind: 'perSenior', age: 65, amount: 15000, phaseOut: null },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 0,
        traditionalMinAge: 0,
        applies: { pension: true, traditional: true },
        tiers: [ [ 0, 3000 ], [ 65, 0 ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'From 2026 (H. 4216, Act 110, signed March 30, 2026; Department of Revenue and the bill text, read): 1.99% below $30,000 of taxable income and 5.21% above (the Department states it as 5.21% minus $966); the South Carolina income adjusted deduction replaces the federal standard deduction: $15,000 single, $22,500 head of household, $30,000 joint, reduced in proportion to income over $40,000 (range $55,000), $60,000 (range $82,500) and $80,000 (range $110,000). Later automatic rate cuts depend on revenue and are left out. Social Security is exempt. 44% of net long-term gains is deducted (statute 12-6-1150). A filer under 65 deducts up to $3,000 of retirement income; from 65 the $15,000 age deduction against any income (which absorbs the retirement deduction) applies. Dependent exemption $4,930 (2025 amount, indexed; the extra amount for a child under six and the military retirement deduction are not modeled). The earned income credit ($200 cap) is not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).',
    },
    sd: {
      name: 'South Dakota',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://blog.taxact.com/states-with-no-income-tax',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'none' },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'South Dakota levies no individual income tax on wages, pensions, retirement withdrawals, Social Security or investment gains, so no state income tax is modeled.',
    },
    tn: {
      name: 'Tennessee',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://revenue.support.tn.gov/hc/en-us/articles/360057828631-HIT-3-Hall-Income-Tax-Repealed-Beginning-January-1-2021',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'none' },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Tennessee repealed the Hall income tax on interest and dividends for tax periods beginning on or after January 1, 2021 (Department of Revenue notice HIT-3), and has no tax on wages, pensions or gains, so no state income tax is modeled.',
    },
    tx: {
      name: 'Texas',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://comptroller.texas.gov/taxes/',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'none' },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'No individual income tax (Texas Constitution art. VIII, sec. 24-a). The Comptroller\'s list of the 100 taxes and fees it administers has no income tax; the constitutional text was not opened.',
    },
    ut: {
      name: 'Utah',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://incometax.utah.gov/credits/taxpayer-tax-credit',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: true,
        creditThresholdsIndexed: true,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: { kind: 'flat', rate: 0.0445 },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'taxed' },
      standardDeduction: { single: 0, mfj: 0, hoh: 0 },
      exemption: { single: 0, mfj: 0, hoh: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [
        {
          kind: 'incomeTestedCredit',
          label: 'Taxpayer tax credit',
          refundable: false,
          amount: { single: 966, mfj: 1932, hoh: 1449 },
          perSenior: { age: 65, amount: 123 },
          perDependent: 127,
          limit: { single: 18213, mfj: 36426, hoh: 27320 },
          taper: { rate: 0.013 }
        },
        {
          kind: 'ssCredit',
          label: 'Social Security benefits credit',
          refundable: false,
          rate: 0.0445,
          phase: { start: { single: 54000, mfj: 90000, hoh: 90000 }, rate: 0.025 }
        },
        {
          kind: 'childCredit',
          label: 'Child Tax Credit',
          refundable: false,
          fixed: true,
          tiers: [[5, 1000]],
          phaseOut: { start: { single: 49000, mfj: 61000, hoh: 49000, qss: 61000 }, width: 1, per: 0, rate: 0.1 },
        }
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: "Flat 4.45% from 2026 (SB 60, retroactive to January 1; secondary source). No standard deduction: Utah gives a taxpayer tax credit of 6% of the federal standard deduction (2026: $16,100 single, $32,200 joint, $24,150 head of household) plus $2,111 per dependent, reduced by 1.3 cents per dollar of income over $18,213 single, $36,426 joint, $27,320 head of household (Tax Commission, 2025 thresholds; the 65-plus add-on is approximated at 6% of $2,050, and an itemizer's credit is not modeled). Taxable Social Security is included, then a credit of 4.45% of it, reduced by 2.5 cents per dollar of income over $54,000 single and $90,000 joint (Tax Commission). The separate retirement credit is only for people born in 1952 or earlier and is not modeled. Child Tax Credit (Utah Code 59-10-1047, effective 1/1/2026, primary): $1,000 nonrefundable for each child under six who is a federal Child Tax Credit child, reduced by 10 cents per dollar of modified AGI over $49,000 single or head of household and $61,000 joint (the statute does not index it). Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).",
    },
    vt: {
      name: 'Vermont',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://tax.vermont.gov/sites/tax/files/documents/TaxRateSched-2025.pdf',
      asOf: 2025,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: true,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: true,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0.0335 ], [ 49400, 0.066 ], [ 119700, 0.076 ], [ 249700, 0.0875 ] ],
          mfj: [ [ 0, 0.0335 ], [ 82500, 0.066 ], [ 199450, 0.076 ], [ 304000, 0.0875 ] ],
          hoh: [ [ 0, 0.0335 ], [ 66200, 0.066 ], [ 171000, 0.076 ], [ 276850, 0.0875 ] ]
        }
      },
      additions: [],
      base: {
        ordinary: true,
        gainsIncluded: 1,
        gainsRate: null,
        gainsDeduction: 0,
        socialSecurity: {
          kind: 'agiPhaseOut',
          start: { single: 55000, mfj: 70000, hoh: 55000 },
          end: { single: 65000, mfj: 80000, hoh: 65000 }
        }
      },
      standardDeduction: { single: 7650, mfj: 15300, hoh: 11450 },
      exemption: { single: 5300, mfj: 10600, hoh: 5300 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 5300,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'perSenior', age: 65, amount: 1250, phaseOut: null },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 0,
        traditionalMinAge: 0,
        applies: { pension: true, traditional: false },
        tiers: [ [ 0, 10000 ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'ordinary' },
      credits: [
        {
          kind: 'childCredit',
          label: 'Child Tax Credit',
          refundable: true,
          tiers: [[6, 1000]],
          phaseOut: { start: { single: 125000, mfj: 125000, hoh: 125000, qss: 125000 }, width: 1000, per: 20, perChild: true },
        },
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: '2025 schedules (Department of Taxes, read; the 2026 ones were not found, and the figures index): 3.35% / 6.6% / 7.6% / 8.75% with limits $49,400, $119,700 and $249,700 single, $82,500, $199,450 and $304,000 joint, $66,200, $171,000 and $276,850 head of household; standard deduction $7,650 / $15,300 / $11,450, plus $1,250 at 65; exemption $5,300 per person and dependent. Social Security is fully exempt up to $55,000 of AGI single or $70,000 joint and phases to nothing at $65,000 / $80,000 (Department of Taxes, search excerpt). Up to $10,000 of pension income per filer is exempt (the planner reads its pension stream as the eligible retirement system income; the military exemption and the income conditions on the $10,000 were not confirmed). The 3%-of-income minimum above $150,000, the renter credit is not modeled. Child Tax Credit (32 V.S.A. 5830f, primary): $1,000 per child six or younger at the end of the year, refundable, reduced by $20 for each $1,000 or fraction of AGI over $125,000, taken off each child (the statute reduces the amount per child; gone at $175,000 for any number of children; not indexed). Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).',
    },
    va: {
      name: 'Virginia',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://www.tax.virginia.gov/deductions',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0.02 ], [ 3000, 0.03 ], [ 5000, 0.05 ], [ 17000, 0.0575 ] ],
          mfj: [ [ 0, 0.02 ], [ 3000, 0.03 ], [ 5000, 0.05 ], [ 17000, 0.0575 ] ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 8750, mfj: 17500 },
      exemption: { single: 930, mfj: 1860 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 930,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'perSenior', age: 65, amount: 12000, phaseOut: { start: { single: 50000, mfj: 75000 }, rate: 1 } },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: "Rates 2% to $3,000, 3% to $5,000, 5% to $17,000, 5.75% above; standard deduction $8,750 single and $17,500 joint through 2026; $930 per person and dependent (Department of Taxation, deductions page and 2026 estimated payment form). Social Security is exempt. Each filer 65 or older deducts up to $12,000, reduced dollar for dollar by income over $50,000 single or $75,000 joint (measured before taxable Social Security); the extra $800 age exemption, the military retirement subtraction and Virginia's low-income credit are not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).",
    },
    wa: {
      name: 'Washington',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://dor.wa.gov/taxes-rates/other-taxes/capital-gains-tax',
      asOf: 2025,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: true,
        personalExemptionIndexed: true,
        creditAmountsIndexed: true,
        creditThresholdsIndexed: true,
        retirementExclusionIndexed: true,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'graduated', columns: { single: [[0, 0.07], [1000000, 0.099]], mfj: [[0, 0.07], [1000000, 0.099]] } },
      additions: [],
      base: { ordinary: false, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 278000, mfj: 278000 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'A tax on long-term capital gains only (real estate and retirement accounts excluded; the engine\'s gains are brokerage gains). 7% on the first $1 million above the $278,000 standard deduction (the same for a couple), 9.9% above (ESSB 5813, 2025; DOR). The standard deduction is indexed for inflation; the $1 million tier is not. No wage or retirement income tax. Inherited IRA and 401(k) distributions are not taxed (no tax on ordinary income).',
    },
    wv: {
      name: 'West Virginia',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://tax.wv.gov/Individuals/Pages/PersonalIncomeTaxReductionBill.aspx',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0.0211 ], [ 10000, 0.0281 ], [ 25000, 0.0316 ], [ 40000, 0.0422 ], [ 60000, 0.0458 ] ],
          mfj: [ [ 0, 0.0211 ], [ 10000, 0.0281 ], [ 25000, 0.0316 ], [ 40000, 0.0422 ], [ 60000, 0.0458 ] ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 2000, mfj: 4000 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 2000,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'perSenior', age: 65, amount: 8000, phaseOut: null },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: '2026 rates 2.11%, 2.81%, 3.16%, 4.22% and 4.58% at $10,000, $25,000, $40,000 and $60,000 (Senate Bill 392, signed March 31, 2026, retroactive to January 1; Tax Division page, read). Later reductions depend on revenue and are left out. $2,000 exemption per person and dependent (secondary). Social Security is fully exempt from 2026 (Tax Division). Each filer 65 or older excludes $8,000 (the planner treats the modification as an extra exemption). The low-income family tax credit and the homestead exemption are not modeled. Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir).',
    },
    wi: {
      name: 'Wisconsin',
      status: 'researched',
      sourceKind: 'primary',
      source: 'https://www.revenue.wi.gov/TaxForms2025/2025-Form1-inst.pdf',
      asOf: 2025,
      indexing: {
        bracketsIndexed: true,
        standardDeductionIndexed: true,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [ [ 0, 0.035 ], [ 14680, 0.044 ], [ 50480, 0.053 ], [ 323290, 0.0765 ] ],
          mfj: [ [ 0, 0.035 ], [ 19580, 0.044 ], [ 67300, 0.053 ], [ 431060, 0.0765 ] ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 0.7, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 13560, mfj: 25110 },
      exemption: { single: 700, mfj: 1400 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 700,
      standardDeductionPhase: {
        kind: 'linear',
        columns: { single: { start: 19070, end: 153000, floor: 0 }, mfj: { start: 35600, end: 166800, floor: 0 } }
      },
      seniorExemption: { kind: 'perSenior', age: 65, amount: 250, phaseOut: null },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: {
        kind: 'perPerson',
        pensionMinAge: 67,
        traditionalMinAge: 67,
        applies: { pension: true, traditional: true },
        tiers: [ [ 0, 24000 ] ],
        reducedBy: 'none',
        share: null
      },
      inherited: { kind: 'heir' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: '2025 schedule (Form 1 instructions, read): 3.5% to $14,680 and 4.4% to $50,480 single, 3.5% to $19,580 and 4.4% to $67,300 joint, 5.3% to $323,290 / $431,060, 7.65% above (the 2026 limits were not found). The standard deduction slides down with income from $13,560 single and $25,110 joint; the planner approximates the sliding scale with a straight line (within about 5% of the printed table). Exemption $700 per person and dependent, $250 more at 65. 30% of net long-term gains is excluded. Social Security is exempt. A filer 67 or older subtracts up to $24,000 of retirement income (new for 2025; Form 1 instructions, read); the older $5,000 subtraction is covered by it. The homestead credit and the earned income credit are not modeled. Inherited IRA and 401(k) distributions share your own retirement exclusion, on your own age.',
    },
    wy: {
      name: 'Wyoming',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://blog.taxact.com/states-with-no-income-tax',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: false,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: { kind: 'none' },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Wyoming levies no individual income tax on wages, pensions, retirement withdrawals, Social Security or investment gains, so no state income tax is modeled.',
    },
    dc: {
      name: 'Washington, DC',
      status: 'researched',
      sourceKind: 'secondary',
      source: 'https://otr.cfo.dc.gov/page/dc-individual-and-fiduciary-income-tax-rates',
      asOf: 2026,
      indexing: {
        bracketsIndexed: false,
        standardDeductionIndexed: true,
        personalExemptionIndexed: false,
        creditAmountsIndexed: false,
        creditThresholdsIndexed: false,
        retirementExclusionIndexed: false,
      },
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'mfj' },
      tax: {
        kind: 'graduated',
        columns: {
          single: [
            [ 0, 0.04 ],
            [ 10000, 0.06 ],
            [ 40000, 0.065 ],
            [ 60000, 0.085 ],
            [ 250000, 0.0925 ],
            [ 500000, 0.0975 ],
            [ 1000000, 0.1075 ]
          ],
          mfj: [
            [ 0, 0.04 ],
            [ 10000, 0.06 ],
            [ 40000, 0.065 ],
            [ 60000, 0.085 ],
            [ 250000, 0.0925 ],
            [ 500000, 0.0975 ],
            [ 1000000, 0.1075 ]
          ]
        }
      },
      additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { single: 0, mfj: 0 },
      exemption: { single: 0, mfj: 0 },
      exemptionPhaseOut: { kind: 'none' },
      dependentExemption: 0,
      standardDeductionPhase: { kind: 'none' },
      seniorExemption: { kind: 'none' },
      federalConformity: { standardDeduction: true, seniorDeduction: true, ageAdditional: true },
      schedule: [],
      retirementExclusion: { kind: 'none' },
      inherited: { kind: 'ordinary' },
      credits: [
        {
          kind: 'incomeTestedCredit',
          label: 'Child tax credit (from 2026)',
          refundable: true,
          amount: { single: 0, mfj: 0 },
          perSenior: null,
          perDependent: 1000,
          limit: { single: 55000, mfj: 70000 },
          taper: null
        }
      ],
      federalTaxSubtraction: 'none',
      localTax: 'notModeled',
      notes: 'Seven brackets, 4% to 10.75% (4% to $10,000, 6% to $40,000, 6.5% to $60,000, 8.5% to $250,000, 9.25% to $500,000, 9.75% to $1,000,000; the 2025 rate schedule on the Office of Tax and Revenue page, read; same for every filing status, not indexed). District income tax follows the federal code on a rolling basis: the 2025 booklet shows $15,000 / $30,000 / $22,500 because the District decoupled from the 2025 federal increase, but the 2026 budget decoupled only from the business provisions and the non-itemizer charitable deduction, so the planner uses the federal standard deduction with the 65+ add-on and the senior deduction (a news summary of the budget act; the text was not read). No personal exemptions. Social Security is exempt; capital gains are ordinary income; the old $3,000 exclusion for District and federal pensions at 62 was repealed (so no pension exclusion is modeled). A new fully refundable child tax credit from 2026: $1,000 per child under 18 for AGI up to $55,000 (single, head of household) or $70,000 (joint); the planner counts children through 18 (secondary summary of the act). Inherited IRA and 401(k) distributions are taxed as ordinary income (no exclusion for a non-spouse heir). Not modeled: the earned income credit, the Schedule H property tax credit, the Keep Child Care Affordable credit, and the 2025 repeal of the older child credit.',
    },
  };
  // STATE_RULES:end
  export const SS_EXEMPT = 0,
    SS_TAXED = 1,
    SS_SUBTRACTION = 2,
    SS_AGI_TESTED = 3;
  // Which indexing families a scheduled variant's override moves onto its own base year (a field's amounts
  // and, where it has them, its thresholds): see the `schedule` field.
  export const SCHEDULE_FAMILIES = {
    tax: ['br'], standardDeduction: ['sd'], standardDeductionPhase: ['sd', 'ct'], exemption: ['ex'],
    dependentExemption: ['ex', 'ct'], seniorExemption: ['ex', 'ct'], exemptionPhaseOut: ['ex', 'ct'],
    credits: ['ca', 'ct'], retirementExclusion: ['re'], additions: ['ad'],
  };
  export const SS_TIERED = 4,
    SS_SHARE = 5,
    SS_PHASE = 6;
  export const NO_BASE_YEARS = { br: 0, sd: 0, ex: 0, ca: 0, ct: 0, re: 0, ad: 0 };
  export const NO_AGES = [];
  // E1e: how a row treats an inherited traditional draw (STATE_RULES.inherited, spec 6.4).
  export const INH_ORDINARY = 0, INH_EXEMPT = 1, INH_HEIR = 2, INH_HEIR_ANY = 3, INH_DECEDENT = 4;
  // load-time: a literal map that reads the INH_* constants declared above it
  export const INH_CODE = { ordinary: INH_ORDINARY, exempt: INH_EXEMPT, heir: INH_HEIR, heirAnyAge: INH_HEIR_ANY, decedent: INH_DECEDENT };
  // Shown under every state's note: what no row models.
  export const STATE_TAX_NOT_MODELED_NOTE =
    '<b>Not modeled for any state:</b> local income taxes (except the average county tax in Maryland and Indiana), state itemized deductions, income-tested property-tax and renter credits, earned-income credits, blind and disabled status, military and public-pension distinctions, and short-term gains. The generated table in the repository (docs/state-tax-rules.md) lists every rule and its source.';
  // The text of the state field's info bubble, built from the selected row: what every state's estimate leaves out, then
  // this state's own notes (or a pointer, for a row not yet researched) and its source.
  const STATE_TIP_COMMON =
    '2026 planning estimate of state income tax only. Not modeled for any state: local income taxes (except the average county tax in Maryland and Indiana), state itemized deductions, income-tested property-tax and renter credits, earned-income credits, blind and disabled status, military and public-pension distinctions, and short-term gains.';
  export function stateTaxTipText(code) {
    const rule = STATE_RULES[code];
    if (!rule) return STATE_TIP_COMMON;
    return `${STATE_TIP_COMMON} ${rule.name} (figures as of ${rule.asOf}): ${rule.notes} Source: ${rule.source}`;
  }

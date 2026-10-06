// Tax-correctness tests: federal, state/provincial, and Canadian tax schedules.
//
// Every expected number is derived independently of the engine, in one of three ways:
//   1. a hand-worked literal (the arithmetic is shown in the comment next to it);
//   2. a reference calculation in this file that sums per-bracket slices from
//      explicit lower bounds (a different formulation from the engine's
//      cap-based loop, which is where an earlier slicing bug hid);
//   3. an invariant that must hold for any correct schedule: indexing scales
//      tax linearly, tax never falls as income rises, and no step in the
//      schedule jumps.
// The state and province checks read the planner's own bracket tables, so a
// new or edited state is covered automatically, without a second copy of the
// table to keep in sync.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');

async function withPage(file, fn) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.join(root, file));
  await page.waitForTimeout(300);
  const failures = await page.evaluate(fn);
  await browser.close();
  assert.deepStrictEqual(errors, [], `${file}: page errors ${errors}`);
  assert.deepStrictEqual(failures, [], `${file}:\n  ` + failures.join('\n  '));
}

// ---------------------------------------------------------------------------
// US
// ---------------------------------------------------------------------------
function usChecks() {
  const t = window.__test_tax;
  const st = window.__test_getState();
  const fails = [];
  const near = (actual, expected, tol, label) => {
    if (!(Math.abs(actual - expected) <= tol))
      fails.push(`${label}: expected ${expected} (+/-${tol}), got ${actual}`);
  };

  // Reference: tax from explicit [lowerBound, rate] pairs, summed per slice.
  const refTax = (taxable, lowers) => {
    let tax = 0;
    for (let i = 0; i < lowers.length; i++) {
      const lo = lowers[i][0],
        hi = i + 1 < lowers.length ? lowers[i + 1][0] : Infinity;
      tax += Math.max(0, Math.min(taxable, hi) - lo) * lowers[i][1];
    }
    return tax;
  };
  const SINGLE = [[0, 0.1], [12400, 0.12], [50400, 0.22], [105700, 0.24], [201775, 0.32], [256225, 0.35], [640600, 0.37]];
  const MFJ = [[0, 0.1], [24800, 0.12], [100800, 0.22], [211400, 0.24], [403550, 0.32], [512450, 0.35], [768700, 0.37]];

  st.inflation = 0;
  st.stateTax = 'tx';

  // --- Federal ordinary brackets -------------------------------------------
  // Hand-worked: single $100k gross -> $83,900 taxable
  //   1,240 (10% of 12,400) + 4,560 (12% of 38,000) + 7,370 (22% of 33,500) = 13,170
  near(t.ordinaryTax(100000, 0, 'single'), 13170, 0.005, 'single $100k');
  // MFJ $100k gross -> $67,800 taxable: 2,480 + 12% of 43,000 (5,160) = 7,640
  near(t.ordinaryTax(100000, 0, 'mfj'), 7640, 0.005, 'MFJ $100k');
  // Inside the standard deduction: nothing.
  near(t.ordinaryTax(16100, 0, 'single'), 0, 1e-9, 'single at deduction');
  near(t.ordinaryTax(32200, 0, 'mfj'), 0, 1e-9, 'MFJ at deduction');
  // An explicit deduction replaces the default standard one (Batch 2: age-based, itemized, senior).
  near(t.ordinaryTax(100000, 0, 'single', 20000), refTax(80000, SINGLE), 0.005, 'explicit single deduction'); // taxable 80,000
  near(t.ordinaryTax(100000, 0, 'mfj', 50000), refTax(50000, MFJ), 0.005, 'explicit MFJ deduction'); // taxable 50,000
  near(t.ordinaryTax(100000, 0, 'single'), t.ordinaryTax(100000, 0, 'single', 16100), 1e-9, 'default deduction is the standard one');
  near(t.ordinaryTax(30000, 0, 'single', 35000), 0, 1e-9, 'deduction above income');
  // Gains: a larger deduction pushes more of the gain into the 0% band. Single, 60,000 ordinary + 60,000 gain,
  // deduction 21,450: ordinary taxable 38,550, 0% room 10,900, 49,100 at 15% = 7,365.
  near(t.longTermGainTax(60000, 60000, 0, 'single', 21450), 7365, 0.005, 'LTCG with an explicit deduction');
  near(t.longTermGainTax(60000, 60000, 0, 'single'), t.longTermGainTax(60000, 60000, 0, 'single', 16100), 1e-9, 'LTCG default deduction');
  // standardDeduction: base, then +1,650 (married) / +2,050 (unmarried) per filer aged 65+, indexed.
  near(t.standardDeduction('mfj', 0), 32200, 1e-9, 'standardDeduction MFJ');
  near(t.standardDeduction('single', 0), 16100, 1e-9, 'standardDeduction single');
  near(t.standardDeduction('mfj', 0, [65, 64]), 33850, 1e-9, 'standardDeduction MFJ, one 65');
  near(t.standardDeduction('single', 0, [65]), 18150, 1e-9, 'standardDeduction single, 65');
  {
    const f = t.taxIndexFactor(7);
    near(t.standardDeduction('single', 7, [80]), 18150 * f, 1e-6, 'standardDeduction indexes');
  }
  // Every bracket edge (and a point inside each bracket) against the reference.
  for (const [filing, table, ded] of [['single', SINGLE, 16100], ['mfj', MFJ, 32200]]) {
    const points = new Set([0, 1]);
    for (const [lo] of table) [lo - 1, lo, lo + 1, lo + 5000].forEach((v) => points.add(Math.max(0, v)));
    points.add(table[table.length - 1][0] * 3);
    for (const taxable of points)
      near(t.ordinaryTax(taxable + ded, 0, filing), refTax(taxable, table), 0.005, `${filing} taxable ${taxable}`);
  }

  // --- Long-term gains / qualified dividends --------------------------------
  // Single, no other income, $100k gain: the unused $16,100 deduction shelters
  // gain first -> 83,900; 0% to 49,450, 15% on 34,450 = 5,167.50.
  near(t.longTermGainTax(100000, 0, 0, 'single'), 5167.5, 0.005, 'LTCG single, unused deduction');
  // Single, $60k ordinary (taxable 43,900), $100k gain: 0% room 5,550,
  // 15% on 94,450 = 14,167.50.
  near(t.longTermGainTax(100000, 60000, 0, 'single'), 14167.5, 0.005, 'LTCG single stacked on ordinary');
  // Single, $700k gain, no ordinary: 683,900 after deduction; 0% to 49,450;
  // 15% on 496,050 = 74,407.50; 20% on 138,400 = 27,680 -> 102,087.50.
  near(t.longTermGainTax(700000, 0, 0, 'single'), 102087.5, 0.005, 'LTCG single reaching 20%');
  // MFJ, $200k ordinary (taxable 167,800), $50k gain: all in the 15% band.
  near(t.longTermGainTax(50000, 200000, 0, 'mfj'), 7500, 0.005, 'LTCG MFJ all 15%');

  // --- Net investment income tax -------------------------------------------
  near(t.niitTax(250000, 100000, 'single'), 1900, 0.005, 'NIIT single partly over threshold'); // 3.8% of 50k
  near(t.niitTax(300000, 30000, 'mfj'), 1140, 0.005, 'NIIT MFJ limited by investment income'); // 3.8% of 30k
  near(t.niitTax(199999, 500000, 'single'), 0, 1e-9, 'NIIT below threshold');

  // --- Taxable Social Security ---------------------------------------------
  near(t.taxableSocialSecurity(20000, 20000, 'single'), 2500, 0.005, 'SS single 50% tier'); // (30,000-25,000)*50%
  near(t.taxableSocialSecurity(30000, 40000, 'single'), 22350, 0.005, 'SS single 85% tier'); // 17,850 + 4,500
  near(t.taxableSocialSecurity(30000, 100000, 'single'), 25500, 0.005, 'SS single capped at 85%');
  near(t.taxableSocialSecurity(40000, 10000, 'mfj'), 0, 1e-9, 'SS MFJ below base');
  near(t.taxableSocialSecurity(40000, 30000, 'mfj'), 11100, 0.005, 'SS MFJ 85% tier'); // 5,100 + 6,000

  // --- Whole-household taxFor, three filing branches ------------------------
  const prof = (o) => Object.assign({ wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, otherA: 0, otherB: 0, ssA: 0, ssB: 0, invOrd: 0, invQual: 0, year: 0, ageA: 40, ageB: 40 }, o);
  near(t.taxFor(prof({ singlePerson: true, filing: 'single', otherA: 50000, wageA: 50000 }), 0, 0), 3820, 0.005, 'taxFor single');
  near(t.taxFor(prof({ filing: 'mfj', otherA: 60000, otherB: 40000, wageA: 60000, wageB: 40000 }), 0, 0), 7640, 0.005, 'taxFor MFJ');
  // Two separate filers (pre-marriage): each $50k taxed alone.
  near(t.taxFor(prof({ filing: 'single', otherA: 50000, otherB: 50000, wageA: 50000, wageB: 50000 }), 0, 0), 7640, 0.005, 'taxFor two separate filers');
  // Single, $200k ordinary + $100k gain:
  //   ordinary on 183,900 taxable = 1,240 + 4,560 + 12,166 + 18,768 = 36,734
  //   gain all at 15% = 15,000; NIIT 3.8% of min(100k, 300k-200k) = 3,800
  near(t.taxFor(prof({ singlePerson: true, filing: 'single', otherA: 200000, wageA: 200000 }), 100000, 0), 55534, 0.005, 'taxFor single with gains + NIIT');

  // --- Indexing: every schedule scales linearly with the inflation factor ---
  st.inflation = 3;
  const yi = 7,
    f = Math.pow(1.03, yi);
  for (const filing of ['single', 'mfj']) {
    for (const inc of [20000, 60000, 150000, 400000]) {
      near(t.ordinaryTax(inc * f, yi, filing), f * t.ordinaryTax(inc, 0, filing), 1e-6 * f * inc, `ordinary indexing ${filing} ${inc}`);
      near(t.longTermGainTax(inc * f, 40000 * f, yi, filing), f * t.longTermGainTax(inc, 40000, 0, filing), 1e-6 * f * inc, `LTCG indexing ${filing} ${inc}`);
    }
  }
  st.inflation = 0;

  // --- State tax -----------------------------------------------------------
  const src = (o) => Object.assign({ wages: 0, pension: 0, retirement: 0, gains: 0, taxableSS: 0, ages: [40] }, o);
  const stateTax = (code, s, filing, yearIdx = 0) => {
    st.stateTax = code;
    return t.stateIncomeTax(s, filing, yearIdx);
  };
  const incomes = [0, 3000, 12000, 25000, 40000, 60000, 90000, 140000, 220000, 400000, 700000, 1300000];

  // Hand-worked literals for the states whose logic is hand-written.
  near(stateTax('tx', src({ wages: 500000 }), 'single'), 0, 1e-9, 'TX no tax');
  // MA single, wages 100,000: the $4,400 personal exemption comes off first, 5% of 95,600.
  near(stateTax('ma', src({ wages: 100000 }), 'single'), 4780, 0.005, 'MA 5%');
  // MA surtax: taxable 1,195,600 -> 5% = 59,780, plus 4% of the part above 1,107,750 (87,850) = 3,514
  near(stateTax('ma', src({ wages: 1200000 }), 'single'), 63294, 0.005, 'MA surtax');
  // CA single $100k (2025 figures): 94,294 after the 5,706 deduction
  //   110.79 + 303.70 + 607.52 + 965.40 + 1,214.56 + 2,006.01 = 5,207.98; less the $153 personal exemption credit = 5,054.98
  near(stateTax('ca', src({ wages: 100000 }), 'single'), 5054.98, 0.005, 'CA single $100k');
  // NJ single $100k: the $1,000 exemption first (99,000): 280 + 262.50 + 175 + 1,933.75 + 24,000 x 6.37% (1,528.80) = 4,180.05
  near(stateTax('nj', src({ wages: 100000 }), 'single'), 4180.05, 0.005, 'NJ single $100k');
  // WI single $100k (2025 amounts): standard deduction on the straight-line approximation 13,560 x (1 - 80,930 / 133,930) = 5,366.10, exemption 700 -> 93,933.90:
  //   14,680 x 3.5% (513.80) + 35,800 x 4.4% (1,575.20) + 43,453.90 x 5.3% (2,303.06) = 4,392.06
  near(stateTax('wi', src({ wages: 100000 }), 'single'), 4392.06, 0.005, 'WI single $100k');
  // WA capital-gains tax: nothing on wages; 7% above 278,000, 9.9% above 1M of taxable gain (ESSB 5813, 2025).
  near(stateTax('wa', src({ wages: 500000 }), 'single'), 0, 1e-9, 'WA wages untaxed');
  near(stateTax('wa', src({ gains: 378000 }), 'single'), 7000, 0.005, 'WA gains 7%');
  near(stateTax('wa', src({ gains: 1378000 }), 'single'), 79900, 0.005, 'WA gains 9.9% tier'); // 70,000 + 100,000 x 9.9%
  // CO 4.4% flat on federal taxable income: (100,000 - 16,100) x 4.4% = 3,691.60
  near(stateTax('co', src({ wages: 100000 }), 'single'), 3691.6, 0.005, 'CO flat 4.4%');
  // IL / PA do not tax pension or traditional withdrawals.
  for (const code of ['il', 'pa']) {
    // (per-person fields too: PA reads each filer's own pension and traditional income)
    near(stateTax(code, src({ pension: 50000, retirement: 30000, ages: [70], pensionA: 50000, retirementA: 30000 }), 'single'), 0, 1e-9, `${code.toUpperCase()} retirement income excluded`);
    near(
      stateTax(code, src({ wages: 40000, pension: 50000, ages: [70], pensionA: 50000 }), 'single'),
      stateTax(code, src({ wages: 40000, ages: [70] }), 'single'),
      1e-9,
      `${code.toUpperCase()} retirement income adds no tax on top of wages`,
    );
  }
  // GA excludes up to 65,000 of retirement income per person at 65+.
  near(stateTax('ga', src({ pension: 50000, pensionA: 50000, ages: [66] }), 'single'), 0, 1e-9, 'GA 65+ pension excluded');

  // Every state with a bracket table or flat rate vs. a reference built from
  // its own table (deduction, then per-slice sum from explicit lower bounds).
  // Rows whose tax is just the table (no additions, credits, step-downs or dependent rules): those are checked against the
  // reference calculation below; the rest are covered by hand-computed cases in state_mechanisms.js and state_reference.js.
  const plainRow = (r) => r.credits.length === 0 && r.additions.length === 0 && r.exemptionPhaseOut.kind === 'none' && r.dependentExemption === 0 && r.base.ordinary && !r.federalConformity.standardDeduction && r.seniorExemption.kind === 'none' && r.localTax === 'notModeled';
  const tableStates = Object.entries(t.STATE_RULES).filter(([, r]) => r.tax.kind !== 'none' && plainRow(r));
  // As rows gain credits, exemptions and conformity they leave this plain check for hand-computed cases (state_7d_households.js).
  if (tableStates.length < 1) fails.push(`expected a table-driven state, found ${tableStates.length}`);
  for (const [code, rule] of tableStates) {
    if (['sc', 'co', 'nc', 'ma', 'wi', 'nj', 'wa'].includes(code)) continue; // hand-written above
    for (const filing of ['single', 'mfj']) {
      const starts = rule.tax.kind === 'graduated' ? rule.tax.columns[filing] : null;
      const ded = rule.standardDeduction[filing] + rule.exemption[filing];
      if (starts) {
        if (starts[0][0] !== 0) fails.push(`${code} ${filing}: first bracket must start at 0`);
        for (let i = 1; i < starts.length; i++)
          if (!(starts[i][0] > starts[i - 1][0])) fails.push(`${code} ${filing}: bracket starts not increasing at index ${i}`);
        for (const [, r] of starts) if (!(r >= 0 && r < 0.15)) fails.push(`${code} ${filing}: implausible rate ${r}`);
      }
      for (const inc of incomes) {
        const taxable = Math.max(0, inc - ded);
        const expected = rule.tax.kind === 'flat' ? taxable * rule.tax.rate : refTax(taxable, starts);
        near(stateTax(code, src({ wages: inc }), filing), expected, 0.01, `${code} ${filing} wages ${inc}`);
      }
    }
  }

  // Invariants for every state (including the hand-written ones): never
  // negative, never falls as income rises, no jumps, marginal rate under 15%,
  // married never owes more than single on the same single-earner income,
  // and the whole schedule scales with inflation indexing.
  for (const code of Object.keys(t.STATE_RULES)) {
    // Rows with deliberate cliffs: NY's recapture steps, an exemption that steps down with income (Maryland), an exemption credit that ends at an income (Oregon).
    const recaptures =
      t.STATE_RULES[code].additions.some((a) => a.kind === 'benefitRecapture') ||
      t.STATE_RULES[code].exemptionPhaseOut.kind !== 'none' ||
      t.STATE_RULES[code].credits.some((c) => c.kind === 'exemptionCredits' && c.phaseOut.reduction >= 100000);
    for (const filing of ['single', 'mfj']) {
      // A refundable per-person credit with no income test (Idaho's food tax credit) pays out at zero income: the tax starts negative.
      const atZero = stateTax(code, src({ wages: 0 }), filing),
        refundsAtZero = atZero < -1e-9;
      let prev = refundsAtZero ? atZero : 0;
      for (let inc = 0; inc <= 1500000; inc += 2500) {
        const tax = stateTax(code, src({ wages: inc }), filing);
        if (tax < -1e-9 && !refundsAtZero) fails.push(`${code} ${filing} ${inc}: negative tax ${tax}`);
        if (tax < prev - 1e-6) fails.push(`${code} ${filing} ${inc}: tax fell from ${prev} to ${tax}`);
        // New York's recapture phases the benefit of the lower brackets back in over $50,000 of AGI with the band chosen by taxable
        // income, so its tax has real steps (and marginal rates well above the top rate inside a phase-in); the rest must not jump.
        if (!recaptures && tax - prev > 2500 * 0.15 + 1e-6) fails.push(`${code} ${filing} ${inc}: jump of ${tax - prev} in one $2,500 step`);
        prev = tax;
      }
    }
    for (const inc of incomes) {
      const single = stateTax(code, src({ wages: inc }), 'single'),
        mfj = stateTax(code, src({ wages: inc }), 'mfj');
      if (mfj > single + 0.01) fails.push(`${code} wages ${inc}: MFJ tax ${mfj} exceeds single tax ${single}`);
    }
    st.inflation = 3;
    // Indexing is per family; only a row that indexes everything (or nothing) is held to the plain scaling check below. Mixed rows
    // (Washington: deduction indexed, its $1 million tier not) are covered in state_mechanisms.js.
    const flags = Object.values(t.STATE_RULES[code].indexing);
    if (!flags.every(Boolean) && flags.some(Boolean)) continue;
    // A row with scheduled changes changes its own figures from the scheduled year; its cases are in state_7d_households.js.
    if (t.STATE_RULES[code].schedule.length) continue;
    const indexed = flags.every(Boolean);
    for (const filing of ['single', 'mfj']) {
      for (const inc of [30000, 90000, 250000]) {
        const base = stateTax(code, src({ wages: inc, gains: inc / 5 }), filing, 0);
        // An indexed state's schedule scales with the plan's inflation factor; one that does not index holds still, so the same
        // nominal income owes the same tax whatever the year.
        const later = stateTax(code, src({ wages: indexed ? inc * f : inc, gains: indexed ? (inc / 5) * f : inc / 5 }), filing, yi);
        near(later, indexed ? base * f : base, 1e-6 * f * inc, `${code} ${filing} indexing at wages ${inc}`);
      }
    }
    st.inflation = 0;
  }
  st.stateTax = 'tx';
  return fails;
}

// ---------------------------------------------------------------------------
// Canada
// ---------------------------------------------------------------------------
function caChecks() {
  // Spouse claims as incomeTaxCA and solvePensionSplit make them (7N N3): the higher-income partner claims the spouse amount (A on a tie).
  const claimNets = (nA, nB) => [nA >= nB ? Math.max(0, nB) : -1, nB > nA ? Math.max(0, nA) : -1];
  const t = window.__test_tax;
  const st = window.__test_getState();
  const fails = [];
  const near = (actual, expected, tol, label) => {
    if (!(Math.abs(actual - expected) <= tol))
      fails.push(`${label}: expected ${expected} (+/-${tol}), got ${actual}`);
  };
  // Reference: tax from [upperBound, rate] pairs summed per slice from explicit lower bounds.
  const refTax = (taxable, caps) => {
    let tax = 0,
      lo = 0;
    for (const [cap, rate] of caps) {
      tax += Math.max(0, Math.min(taxable, cap) - lo) * rate;
      lo = cap;
    }
    return tax;
  };
  const FED = [[58523, 0.14], [117045, 0.205], [181440, 0.26], [258482, 0.2929], [Infinity, 0.33]];
  // Non-refundable credits are 14% of the credit amount, taken off the bracket tax (2026, CRA).
  // Basic personal amount: 16,452 up to net income 181,440, falling linearly to 14,829 at 258,482.
  const bpaAt = (inc) => (inc <= 181440 ? 16452 : inc >= 258482 ? 14829 : 14829 + 1623 * ((258482 - inc) / (258482 - 181440)));
  const refFed = (inc, extra = 0) => Math.max(0, refTax(inc, FED) - 0.14 * (bpaAt(inc) + extra));
  st.inflation = 0;
  st.province = 'on';

  // --- Federal --------------------------------------------------------------
  // $100k: 8,193.22 + 41,477 * 20.5% (8,502.785) = 16,696.005, less 14% of 16,452 (2,303.28)
  near(t.federalTaxCA(100000, 0), 14392.725, 0.005, 'federal $100k');
  near(t.federalTaxCA(16452, 0), 0, 1e-9, 'federal at basic personal amount');
  near(t.federalTaxCA(10000, 0), 0, 1e-9, 'federal below basic personal amount');
  // $181,440 (top of the full BPA): 36,932.93 - 2,303.28
  near(t.federalTaxCA(181440, 0), 34629.65, 0.005, 'federal at the top of the full BPA');
  // $258,482 (BPA fully phased down to 14,829): 59,498.5318 - 2,076.06
  near(t.federalTaxCA(258482, 0), 57422.4718, 0.005, 'federal at the bottom of the BPA phase-out');
  // Halfway through the phase-out the BPA is 14,829 + 811.5 = 15,640.5
  near(t.federalTaxCA(219961, 0), refTax(219961, FED) - 0.14 * 15640.5, 0.005, 'federal mid BPA phase-out');
  for (const inc of [0, 10000, 14829, 16452, 30000, 73352, 75000, 131874, 132000, 181440, 196269, 219961, 258482, 300000, 600000])
    near(t.federalTaxCA(inc, 0), refFed(inc), 0.005, `federal ${inc}`);
  for (const [cap] of FED.slice(0, -1))
    for (const d of [-1, 0, 1])
      near(t.federalTaxCA(cap + d, 0), refFed(cap + d), 0.005, `federal bracket edge ${cap}${d >= 0 ? '+' : ''}${d}`);
  // Extra credit amounts are taken at the same 14% and cannot push tax below zero.
  near(t.federalTaxCA(60000, 0, 5000), refFed(60000, 5000), 0.005, 'federal with extra credit amount');
  near(t.federalTaxCA(5000, 0, 20000), 0, 1e-9, 'extra credits cannot push federal tax below zero');
  // Continuous across the BPA phase-out (no jump at either end).
  for (const inc of [181439, 181441, 258481, 258483])
    near(t.federalTaxCA(inc, 0), refFed(inc), 0.005, `federal near the phase-out edge ${inc}`);

  // --- Federal age amount and pension income amount (7J) ---------------------------
  // Age amount 9,208, reduced 15% of net income over 46,432 (gone at 107,818.67);
  // pension income amount: first 2,000 of eligible pension income, not indexed.
  // Age 65, $40k, no pension: 5,600 - 14% * (16,452 + 9,208 = 25,660 = 3,592.4) = 2,007.6
  near(t.personTaxCA(40000, 0, 0, 0, 65, 0) - t.provincialTaxCA(40000, 0, 0, 65, 0), 2007.6, 0.005, 'age amount at $40k');
  // Age 65, $60k: reduction 15% * 13,568 = 2,035.2 -> age amount 7,172.8;
  // 8,496.005 - 14% * (16,452 + 7,172.8 = 23,624.8 = 3,307.472) = 5,188.533
  near(t.personTaxCA(60000, 0, 0, 0, 65, 0) - t.provincialTaxCA(60000, 0, 0, 65, 0), 5188.533, 0.005, 'age amount partly clawed back at $60k');
  // Age 65, $120k: fully clawed back, equals the under-65 tax
  near(t.personTaxCA(120000, 0, 0, 0, 65, 0), t.personTaxCA(120000, 0, 0, 0, 64, 0), 1e-9, 'age amount gone at $120k');
  near(t.personTaxCA(120000, 0, 0, 0, 65, 0) - t.provincialTaxCA(120000, 0, 0, 65, 0), 18655.25, 0.005, 'federal $120k with BPA only');
  // Not 65 yet: no age amount, whatever the income
  near(t.personTaxCA(40000, 0, 0, 0, 64, 0), t.personTaxCA(40000, 0, 0), 1e-9, 'no age amount at 64');
  // Pension credit at age 60 (employer pension): $5,000 pension -> base 2,000;
  // 8,496.005 - 14% * 18,452 (2,583.28) = 5,912.725. $1,500 pension -> base 1,500.
  near(t.personTaxCA(60000, 0, 0, 0, 60, 5000) - t.provincialTaxCA(60000, 0, 0, 60, 5000), 5912.725, 0.005, 'pension credit capped at $2,000');
  near(t.personTaxCA(60000, 0, 0, 0, 60, 1500) - t.provincialTaxCA(60000, 0, 0, 60, 1500), 8496.005 - 0.14 * 17952, 0.005, 'pension credit below the cap');
  // Age 70, $40k, $5k pension: 5,600 - 14% * (16,452 + 9,208 + 2,000 = 27,660 = 3,872.4) = 1,727.6
  near(t.personTaxCA(40000, 0, 0, 0, 70, 5000) - t.provincialTaxCA(40000, 0, 0, 70, 5000), 1727.6, 0.005, 'age amount plus pension credit');
  // Tax floors at zero
  near(t.personTaxCA(5000, 0, 0, 0, 70, 5000) - t.provincialTaxCA(5000, 0, 0, 70, 5000), 0, 1e-9, 'federal tax floored at zero with credits');
  // Indexing: the age amount and its threshold scale with the plan's index; the pension amount does not.
  st.inflation = 3;
  {
    const yi = 7,
      f = Math.pow(1.03, yi);
    st.province = 'on';
    for (const inc of [30000, 60000, 90000])
      near(t.personTaxCA(inc * f, 0, yi, 0, 66, 0), f * t.personTaxCA(inc, 0, 0, 0, 66, 0), 1e-6 * f * inc, `age amount indexing at ${inc}`);
    near(t.federalTaxCA(60000 * f, yi, 2000), refTax(60000 * f, FED.map(([c, r]) => [c * f, r])) - 0.14 * (16452 * f + 2000), 1e-6 * f * 60000, 'pension amount is not indexed');
  }
  st.inflation = 0;
  // Combined tax never falls as income rises and has no cliffs, at age 66 with a pension, in every province.
  for (const code of Object.keys(t.PROVINCE_RULES)) {
    st.province = code;
    let prev = 0;
    for (let inc = 0; inc <= 400000; inc += 500) {
      const tax = t.personTaxCA(inc, 0, 0, 0, 66, Math.min(inc, 30000));
      if (tax < prev - 1e-6) fails.push(`${code} age 66 ${inc}: combined tax fell from ${prev} to ${tax}`);
      if (tax - prev > 500 * 0.9) fails.push(`${code} age 66 ${inc}: combined tax jumped ${tax - prev}`);
      prev = tax;
    }
  }
  st.province = 'on';

  // --- Ontario ---------------------------------------------------------------
  // $100k: 53,891 * 5.05% + 46,109 * 9.15% = 6,940.469, less 5.05% of the 12,989 basic personal
  // amount (655.9445) = 6,284.5245; surtax 20% of (6,284.5245 - 5,818) = 93.3049; health
  // premium $750 (on taxable income, not income less the personal amount) -> 7,127.8294
  near(t.provincialTaxCA(100000, 0), 7127.8294, 0.005, 'Ontario $100k');
  // Surtax: $200k -> taxable 187,011. Base = 53,891*5.05% + 53,894*9.15% + 79,226*19.8%
  //   = 2,721.4955 + 4,931.1 + 15,686.7 (approx) -- compared via the reference below instead.
  {
    const on = t.PROVINCE_RULES.on;
    const base = refTax(200000, on.brackets) - on.creditRate * on.bpa.amount; // 18,443.9905 - 655.9445 = 17,788.046
    const surtax = Math.max(0, base - 5818) * 0.2 + Math.max(0, base - 7446) * 0.36; // 2,394.0092 + 3,723.1366 = 6,117.1458 (20% and 36% both apply over 7,446)
    near(t.provincialTaxCA(200000, 0), 24655.1918, 0.005, 'Ontario with surtax (hand computed)');
    near(t.provincialTaxCA(200000, 0), base + surtax + 750, 0.005, 'Ontario with surtax');
    if (!(surtax > 1000)) fails.push(`Ontario surtax should be material at $200k, got ${surtax}`);
  }
  // Health premium steps (continuous piecewise schedule).
  for (const [taxable, premium] of [[15000, 0], [22500, 150], [30000, 300], [37000, 360], [45000, 450], [48300, 525], [60000, 600], [72300, 675], [150000, 750], [200300, 825], [500000, 900]])
    near(t.ontarioHealthPremium(taxable, 1), premium, 0.005, `Ontario health premium at ${taxable}`);

  // --- Provincial credits (7K): basic personal, age and pension amounts, phase-down, indexing ----
  {
    const prov = (code, ...a) => {
      st.province = code;
      return t.provincialTaxCA(...a);
    };
    // BC, age 66, $40k (under the 44,119 age threshold): tax 40,000 * 5.6% = 2,240; credits at 5.6% of
    // 13,216 + 5,927 = 19,143 (1,072.008) -> 1,167.992
    // 7N N6: British Columbia's low-income tax reduction takes 575 - 3.56% x (40,000 - 25,570) = 61.292 off.
    near(prov('bc', 40000, 0, 0, 66, 0), 1167.992 - (575 - 0.0356 * (40000 - 25570)), 0.005, 'BC age amount at $40k');
    // AB, age 70, $60k, $5k pension: 4,800 less 8% of 22,769 + age amount (6,345 - 15% * (60,000 - 47,234)
    // = 4,430.1) + pension 1,753 = 28,952.1 (2,316.168) -> 2,483.832
    near(prov('ab', 60000, 0, 0, 70, 5000), 2483.832, 0.005, 'AB age and pension amounts');
    // BC, age 60, $5k pension, $60k: 2,820.328 + 742.049 = 3,562.377 less 5.6% of 13,216 + 1,000 (796.096) = 2,766.281
    near(prov('bc', 60000, 0, 0, 60, 5000), 2766.281, 0.005, 'BC pension amount at 60');
    // The age amount is reduced to nothing; Saskatchewan's senior supplement (2,569) is not reduced.
    near(prov('sk', 200000, 0, 0, 70, 0), prov('sk', 200000, 0, 0, 64, 0) - 0.105 * 2569, 0.005, 'SK senior supplement is not income tested');
    // Manitoba: the personal amount is 15,780 up to $200k and nil from $400k; at $300k it is 7,890.
    // Tax 5,076 + 6,757.5 + 34,800 = 46,633.5 less 10.8% of 7,890 (852.12) -> 45,781.38
    near(prov('mb', 300000, 0), 45781.38, 0.005, 'Manitoba basic personal amount phase-down');
    near(prov('mb', 400000, 0), refTax(400000, t.PROVINCE_RULES.mb.brackets), 0.005, 'Manitoba basic personal amount nil at $400k');
    // The credit cannot make tax negative.
    near(prov('bc', 5000, 0, 0, 70, 5000), 0, 1e-9, 'provincial tax floored at zero');
    near(prov('nb', 10000, 0), 0, 1e-9, 'no provincial tax below the personal amount');
    // Indexing: Manitoba's brackets and amounts are frozen; an indexed province scales; the pension
    // amount scales only where it is indexed (AB, ON, NS), not where it is a flat $1,000 (BC).
    st.inflation = 3;
    {
      const yi = 7,
        f = Math.pow(1.03, yi);
      near(prov('mb', 50000, yi), prov('mb', 50000, 0), 1e-9, 'Manitoba schedule is not indexed');
      near(prov('ab', 40000 * f, yi, 0, 60, 5000 * f), f * prov('ab', 40000, 0, 0, 60, 5000), 1e-6 * f * 40000, 'AB pension amount is indexed');
      near(prov('bc', 40000 * f, yi, 0, 60, 5000), f * prov('bc', 40000, 0, 0, 0, 0) - 0.056 * 1000, 1e-6 * f * 40000, 'BC pension amount is not indexed');
      near(prov('on', 60000 * f, yi, 0, 66, 0), f * prov('on', 60000, 0, 0, 66, 0), 1e-6 * f * 60000, 'ON age amount and threshold are indexed');
    }
    st.inflation = 0;
    st.province = 'on';
  }

  // --- Every province against its own table --------------------------------
  const codes = Object.keys(t.PROVINCE_RULES);
  if (codes.length !== 10) fails.push(`expected 10 provinces, found ${codes.length}`);
  for (const code of codes) {
    st.province = code;
    const table = t.PROVINCE_RULES[code];
    for (let i = 1; i < table.brackets.length; i++)
      if (!(table.brackets[i][0] > table.brackets[i - 1][0])) fails.push(`${code}: bracket caps not increasing at ${i}`);
    for (const inc of [0, 8000, 20000, 45000, 80000, 120000, 200000, 400000, 900000]) {
      const ph = table.bpa.phase,
        bpa = ph ? table.bpa.amount * Math.min(1, Math.max(0, (ph.end - inc) / (ph.end - ph.start))) : table.bpa.amount,
        living = table.pooled ? Math.max(0, table.pooled.livingAlone - table.pooled.reductionRate * Math.max(0, inc - table.pooled.reductionThreshold)) : 0, // Quebec single filers live alone
        base0 = Math.max(0, refTax(inc, table.brackets) - table.creditRate * (bpa + living));
      let base = base0;
      // British Columbia's low-income reduction (7N N6) comes off its tax; Ontario's is checked as a floor below.
      if (code === 'bc') base = Math.max(0, base - Math.max(0, 575 - 0.0356 * Math.max(0, inc - 25570)));
      if (code !== 'on') near(t.provincialTaxCA(inc, 0), base, 0.005, `${code} provincial ${inc}`);
      else if (t.provincialTaxCA(inc, 0) < 0) fails.push(`on ${inc}: negative provincial tax`);
    }
    // Monotone and continuous (no jumps larger than the top marginal rate allows).
    let prev = 0;
    for (let inc = 0; inc <= 1500000; inc += 2500) {
      const tax = t.personTaxCA(inc, 0, 0) ;
      if (tax < prev - 1e-6) fails.push(`${code} ${inc}: combined tax fell from ${prev} to ${tax}`);
      if (tax - prev > 2500 * 0.9) fails.push(`${code} ${inc}: combined tax jumped ${tax - prev} in one $2,500 step`);
      prev = tax;
    }
    // Capital gains are 50% included.
    near(t.personTaxCA(50000, 20000, 0), t.personTaxCA(60000, 0, 0), 1e-6, `${code} 50% gains inclusion`);
    // Indexing scales the whole schedule.
    st.inflation = 3;
    const yi = 7,
      f = Math.pow(1.03, yi);
    if (code !== 'mb')
      for (const inc of [30000, 90000, 250000])
        near(t.personTaxCA(inc * f, 0, yi), f * t.personTaxCA(inc, 0, 0), 1e-6 * f * inc, `${code} indexing at ${inc}`);
    st.inflation = 0;
  }

  // --- Quebec federal abatement ----------------------------------------------
  st.province = 'qc';
  near(t.personTaxCA(100000, 0, 0), t.federalTaxCA(100000, 0) * 0.835 + t.provincialTaxCA(100000, 0), 0.005, 'Quebec 16.5% abatement');
  // The age and pension credits come off federal tax before the abatement.
  near(
    t.personTaxCA(60000, 0, 0, 0, 66, 3000),
    t.federalTaxCA(60000, 0, 7172.8 + 2000) * 0.835 + t.provincialTaxCA(60000, 0, 0, 66, 3000),
    0.005,
    'Quebec abatement applies after the age and pension credits',
  );

  // --- Quebec: pooled age, retirement-income and living-alone amounts, family-income reduction, QPP/QPIP (7K) ---
  {
    st.province = 'qc';
    const q = (...a) => t.provincialTaxCA(...a);
    // Single, 66, $30k: 4,200 less 14% of 18,952 + age 3,986 + living alone 2,172 = 25,110 (3,515.4); the
    // pool is not reduced below the $42,955 family income threshold -> 684.6
    near(q(30000, 0, 0, 66, 0), 684.6, 0.005, 'Quebec single 66 at $30k');
    // Single, 66, $50k, $10k pension: 7,000 less 14% of 18,952 + a pool of 3,986 + 3,541 + 2,172 = 9,699, reduced
    // by 18.75% of (50,000 - 42,955) = 1,320.9375 -> 8,378.0625; credits 27,330.0625 -> 3,826.20875 -> 3,173.79125
    near(q(50000, 0, 0, 66, 10000), 3173.79125, 0.005, 'Quebec single 66 with a pension at $50k');
    // A couple, both 66 with $10k pension and $50k each ($100k family income), no living-alone amount: each has 7,527
    // (3,986 + 3,541; 1.25 x 10,000 is above the 3,541 cap), 15,054 together, reduced ONCE by 18.75% of 57,045 =
    // 10,695.9375 -> 4,358.0625; each takes half, 2,179.03125; credits 14% of 18,952 + 2,179.03125 = 2,958.344375
    // -> 7,000 - 2,958.344375 = 4,041.655625 each (reducing each spouse's pool separately would leave nil)
    near(q(50000, 0, 0, 66, 10000, 100000, 7527), 4041.655625, 0.005, 'Quebec couple 66, the pool is reduced once for the couple');
    // The retirement-income amount is the lesser of 3,541 and 125% of the qualifying income: $2,000 -> 2,500.
    // Single, 60, $30k, $2,000 pension: 4,200 less 14% of 18,952 + 2,500 + 2,172 (living alone) = 23,624 (3,307.36) -> 892.64
    near(q(30000, 0, 0, 60, 2000), 892.64, 0.005, 'Quebec retirement-income amount is 125% of the pension income');
    // Under 65, no pension, $60k single: the living-alone amount (2,172) is reduced to nothing (3,195.9);
    // tax 7,608.3 + 1,074.45 = 8,682.75 less 2,653.28 = 6,029.47
    near(q(60000, 0, 0, 0, 0), 6029.47, 0.005, 'Quebec under 65 at $60k, pool reduced away');
    st.inflation = 3;
    {
      const yi = 7,
        f = Math.pow(1.03, yi);
      near(q(50000 * f, yi, 0, 66, 10000 * f), f * q(50000, 0, 0, 66, 10000), 1e-6 * f * 50000, 'Quebec pooled amounts and threshold are indexed');
    }
    st.inflation = 0;
    // taxFor: a couple reads the family income, a single filer is living alone. (The incomes are marked as wages here so that the
    // 7N N7 Quebec health contributions, which fall on retirees' non-employment income, stay out of the comparison.)
    {
      const p = (o) => Object.assign({ year: 0, dtcA: 0, dtcB: 0 }, o);
      near(
        t.incomeTax(p({ singlePerson: false, otherA: 50000, otherB: 50000, earnedA: 50000, earnedB: 50000, ageA: 66, ageB: 66, penA: 10000, penB: 10000 }), 0, 0),
        2 * t.personTaxCA(50000, 0, 0, 0, 66, 10000, 100000, 7527),
        1e-9,
        'Quebec taxFor couple uses family income',
      );
      near(t.incomeTax(p({ singlePerson: true, otherA: 50000, earnedA: 50000, ageA: 66, penA: 10000 }), 0, 0), t.personTaxCA(50000, 0, 0, 0, 66, 10000), 1e-9, 'Quebec taxFor single lives alone');
      if (!(t.incomeTax(p({ singlePerson: true, otherA: 50000, ageA: 66, penA: 10000 }), 0, 0) < t.incomeTax(p({ singlePerson: false, otherA: 50000, otherB: 50000, ageA: 66, ageB: 66, penA: 10000, penB: 10000 }), 0, 0) / 2))
        fails.push('Quebec: a single filer should owe less than each spouse of a couple with the same income (living-alone amount)');
    }
    // QPP and QPIP replace CPP for a Quebec resident: (60,000 - 3,500) * 6.30% + 0.43% * 60,000 = 3,817.5;
    // at 100,000: 71,100 * 6.30% (4,479.3) + 4% * 10,400 (416) + 0.43% * 100,000 (430) = 5,325.3
    near(t.cppContribution(60000, 0), 3817.5, 0.005, 'Quebec QPP + QPIP at $60k');
    near(t.cppContribution(100000, 0), 5325.3, 0.005, 'Quebec QPP + QPIP at $100k');
    st.province = 'on';
    near(t.cppContribution(60000, 0), 3361.75, 0.005, 'CPP at $60k (56,500 * 5.95%)');
    // The pension split sees family income: Quebec at 66 with an unequal couple, regret against a scan.
    st.province = 'qc';
    {
      let worst = 0;
      for (const [oa, ob, ea, eb] of [[90000, 20000, 40000, 5000], [60000, 30000, 30000, 0], [45000, 45000, 20000, 20000], [80000, 15000, 50000, 10000]]) {
        const x = t.solvePensionSplit(oa, ob, ea, eb, 0, 68, 66);
        const fam = oa + ob;
        const cost = (y) => {
          const [cA, cB] = claimNets(oa - y, ob + y);
          return (
            t.personTaxCA(oa - y, 0, 0, 0, 68, ea - y, fam, t.quebecPoolAmount(66, eb + y, 0), 0, cA) +
            t.personTaxCA(ob + y, 0, 0, 0, 66, eb + y, fam, t.quebecPoolAmount(68, ea - y, 0), 0, cB)
          );
        };
        let best = Infinity;
        for (let y = -0.5 * eb; y <= 0.5 * ea; y += 50) best = Math.min(best, cost(y));
        worst = Math.max(worst, cost(x) - best);
      }
      if (worst > 3) fails.push('Quebec pension split regret $' + worst.toFixed(2) + ' against a $50 scan');
    }
    st.province = 'on';
  }

  // --- Eligible dividend credit ------------------------------------------------
  st.province = 'on';
  // $27,600 grossed-up dividend on top of $72,400 other income = $100k taxable.
  // Federal 14,392.725 - 27,600 * 15.0198% (4,145.4648) = 10,247.2602. Ontario: 6,284.5245 after the
  // personal amount credit + surtax 93.3049 = 6,377.8294, less 27,600 * 10% = 2,760 -> 3,617.8294, plus the
  // 750 health premium (the surtax comes before the dividend credit, as on ON428) = 4,367.8294
  near(t.personTaxCA(100000, 0, 0, 27600), 14615.0896, 0.005, 'eligible dividend credit');
  // Each credit is floored against its own level of tax: $40k income, $5k and $20k grossed-up dividends.
  // Federal 3,296.72 - 750.99 = 2,545.73; Ontario 2,020 - 655.9445 = 1,364.0555 - 500 = 864.0555 + 450 premium.
  near(t.personTaxCA(40000, 0, 0, 5000), 3859.7855, 0.005, 'dividend credit, both levels positive');
  // $20k: federal 3,296.72 - 3,003.96 = 292.76; Ontario credit 2,000 exceeds 1,364.0555 -> 0, plus the 450 premium
  near(t.personTaxCA(40000, 0, 0, 20000), 742.76, 0.005, 'a provincial credit larger than provincial tax does not reduce federal tax');
  // Both credits are floored at zero; only Ontario's 300 health premium (taxable income 27,600) is left.
  near(t.personTaxCA(27600, 0, 0, 27600), 300, 1e-9, 'dividend credit cannot push tax below zero');

  // --- OAS clawback -----------------------------------------------------------
  near(t.oasClawback(95000, 8500, 0), 0, 1e-9, 'OAS clawback below threshold');
  near(t.oasClawback(120000, 8500, 0), 3701.55, 0.005, 'OAS clawback partial'); // 15% of 24,677
  near(t.oasClawback(200000, 8500, 0), 8500, 0.005, 'OAS clawback capped at OAS received');
  near(t.oasClawback(300000, 0, 0), 0, 1e-9, 'no OAS, no clawback');
  // --- OAS recovery tax inside the return (7N N1) ------------------------------
  // personTaxCA(..., oas) charges 15% of net income (OAS included) over 95,323 up to the OAS received, and the
  // repayment is deducted from net income (CRA line 23500, "line 15000 minus lines 20700 to 23500" = line 23600)
  // before the brackets and the age amount, then added to the tax payable (line 42200).
  {
    st.province = 'on';
    // 110,000 incl. 8,500 OAS: recovery 15% x 14,677 = 2,201.55; tax is on 107,798.45, plus the recovery.
    near(
      t.personTaxCA(110000, 0, 0, 0, 66, 0, null, 0, 8500),
      t.personTaxCA(107798.45, 0, 0, 0, 66, 0) + 2201.55,
      1e-6,
      'recovery tax: deducted from net income, added to tax',
    );
    // Capped at the OAS received: 200,000 income, 8,500 OAS -> recovery 8,500, taxable 191,500.
    near(t.personTaxCA(200000, 0, 0, 0, 66, 0, null, 0, 8500), t.personTaxCA(191500, 0, 0, 0, 66, 0) + 8500, 1e-6, 'recovery tax capped at the OAS');
    // Below the threshold, or no OAS: identical to the old result.
    near(t.personTaxCA(90000, 0, 0, 0, 66, 0, null, 0, 8500), t.personTaxCA(90000, 0, 0, 0, 66, 0), 1e-12, 'below the threshold: no recovery');
    near(t.personTaxCA(300000, 0, 0, 0, 66, 0, null, 0, 0), t.personTaxCA(300000, 0, 0, 0, 66, 0), 1e-12, 'no OAS: no recovery');
    // The plan's example: a 66-year-old with 85,000 base income (OAS 8,500 inside) who draws 30,000 more owes
    // 15% x (115,000 - 95,323) = 2,951.55 of recovery tax the old model did not charge.
    const pr = (o) => Object.assign({ year: 0, dtcA: 0, dtcB: 0 }, o);
    near(
      t.incomeTax(pr({ singlePerson: true, otherA: 85000, ageA: 66, penA: 0, oasA: 8500 }), 0, 30000),
      t.personTaxCA(115000 - 2951.55, 0, 0, 0, 66, 0) + 2951.55,
      1e-6,
      'a discretionary draw that crosses the threshold pays the recovery tax',
    );
    // A couple: each return takes its own recovery (A: 110,000 / OAS 8,500; B: 60,000 / OAS 8,500, none due).
    near(
      t.incomeTax(pr({ singlePerson: false, otherA: 110000, otherB: 60000, ageA: 66, ageB: 66, penA: 0, penB: 0, oasA: 8500, oasB: 8500 }), 0, 0),
      t.personTaxCA(107798.45, 0, 0, 0, 66, 0) + 2201.55 + t.personTaxCA(60000, 0, 0, 0, 66, 0),
      1e-6,
      'couple: each return has its own recovery tax',
    );
    // A profile without OAS fields is unchanged.
    near(t.incomeTax(pr({ singlePerson: true, otherA: 150000, ageA: 66 }), 0, 0), t.personTaxCA(150000, 0, 0, 0, 66, 0), 1e-12, 'profile without oas');
    // Gains count at 50%: 100,000 + 20,000 of gains -> 110,000 net income.
    near(t.personTaxCA(100000, 20000, 0, 0, 66, 0, null, 0, 8500), t.personTaxCA(107798.45, 0, 0, 0, 66, 0) + 2201.55, 1e-6, 'gains count toward the threshold');
    // Indexed threshold: at factor f the threshold is 95,323 f.
    const f3 = t.taxIndexFactor(10);
    near(t.personTaxCA(110000 * f3, 0, 10, 0, 66, 0, null, 0, 8500 * f3), t.personTaxCA(110000 * f3 - 0.15 * (110000 - 95323) * f3, 0, 10, 0, 66, 0) + 0.15 * (110000 - 95323) * f3, 1e-6, 'recovery threshold is indexed');
  }

  // --- Spouse, eligible-dependant and child amounts (7N N3) -----------------------
  // personTaxCA(..., oas, spouseNet, depKids, childKids): spouseNet < 0 means no spouse claim; depKids is the
  // number of children under 18 a single claimant (or survivor) supports (one is the eligible dependant, the rest
  // are child-amount children where a province has one); childKids is the number of children whose child amount
  // this return claims. Federal: the amount is the BPA variant for the CLAIMANT's net income (16,452 to 14,829) less
  // the spouse's net income (a dependant child's is 0), at 14%. Provincial (CRA TD1 forms 2026): the amount, with the
  // spouse's income free up to a threshold: credit = clamp(amount + threshold - spouse net income, 0, amount).
  {
    const R = t.PROVINCE_RULES;
    const prov = (code, income, ...rest) => {
      st.province = code;
      return t.provincialTaxCA(income, 0, 0, 0, 0, null, 0, ...rest);
    };
    // Ontario (TD1ON 2026: 11,029, free to 1,103): spouse net 5,000 -> 7,132 of amount, at 5.05%.
    near(prov('on', 50000) - prov('on', 50000, 5000), 0.0505 * 7132, 1e-6, 'ON spouse amount, partial');
    near(prov('on', 50000) - prov('on', 50000, 1000), 0.0505 * 11029, 1e-6, 'ON spouse amount, full below the threshold');
    near(prov('on', 50000) - prov('on', 50000, 12132), 0, 1e-9, 'ON spouse amount, nil at 12,132');
    near(prov('on', 50000) - prov('on', 50000, -1, 1), 0.0505 * 11029, 1e-6, 'ON eligible dependant (one child)');
    // Alberta (TD1AB: the amount is the basic personal amount, 22,769, less the spouse net income, no free band).
    near(prov('ab', 80000) - prov('ab', 80000, 10000), R.ab.creditRate * 12769, 1e-6, 'AB spouse amount = 22,769 - spouse income');
    // Saskatchewan (TD1SK: 20,381, free to 2,038; child amount 8,358 for each other child under 18): a single parent
    // of two claims the eligible dependant for one child and the child amount for the other.
    near(prov('sk', 70000) - prov('sk', 70000, -1, 2), R.sk.creditRate * (20381 + 8358), 1e-6, 'SK single parent of two: dependant plus one child amount');
    near(prov('sk', 70000) - prov('sk', 70000, -1, 0, 2), R.sk.creditRate * 2 * 8358, 1e-6, 'SK couple: child amount for each child');
    near(prov('on', 70000) - prov('on', 70000, -1, 0, 2), 0, 1e-9, 'a province without a child amount ignores childKids');
    // Quebec: no spouse amount, and a single parent of a minor child gets nothing more (the additional amount for a person
    // living alone, single-parent family, needs a child 18 or over in post-secondary studies and no Family Allowance: not built).
    near(prov('qc', 30000) - prov('qc', 30000, -1, 1), 0, 1e-9, 'QC: a minor child adds no provincial amount');
    near(prov('qc', 30000) - prov('qc', 30000, 5000), 0, 1e-9, 'QC has no spouse amount');
    // Indexing follows the basic personal amount: scaled at year 10 except where the BPA is frozen.
    st.province = 'on';
    const f10 = t.taxIndexFactor(10);
    near(t.provincialTaxCA(50000 * f10, 10, 0, 0, 0, null, 0, -1, 0, 0) - t.provincialTaxCA(50000 * f10, 10, 0, 0, 0, null, 0, 5000 * f10, 0, 0), 0.0505 * 7132 * f10, 1e-6, 'ON spouse amount is indexed');
    st.province = 'mb';
    near(t.provincialTaxCA(80000, 10, 0, 0, 0, null, 0, -1, 0, 0) - t.provincialTaxCA(80000, 10, 0, 0, 0, null, 0, 1000, 0, 0), R.mb.creditRate * (9134 - 1000), 1e-6, 'MB spouse amount is not indexed (frozen)');
    // Federal: BPA variant of the claimant. Claimant at 50,000 (BPA 16,452), spouse net 5,000 -> 11,452 at 14%.
    st.province = 'ab';
    const fed = (income, ...rest) => t.federalTaxCA(income, 0, 0, ...rest);
    near(fed(50000) - fed(50000, 5000), 0.14 * 11452, 1e-6, 'federal spouse amount at 50,000');
    near(fed(50000) - fed(50000, 0), 0.14 * 16452, 1e-6, 'federal eligible dependant amount (child net income 0)');
    near(fed(300000) - fed(300000, 0), 0.14 * 14829, 1e-6, 'federal spouse amount for a claimant over the 33% threshold is the minimum');
    const mid = (181440 + 258482) / 2;
    near(fed(mid) - fed(mid, 0), 0.14 * (14829 + 1623 / 2), 1e-6, 'federal spouse amount phases with the claimant income');
    near(fed(50000) - fed(50000, 20000), 0, 1e-9, 'no federal spouse amount once the spouse income exceeds it');
    // incomeTaxCA: the higher-income partner claims for the lower one; children go to the lower-income parent.
    const pr3 = (o) => Object.assign({ year: 0, dtcA: 0, dtcB: 0 }, o);
    const kid = (age) => ({ age, student: false, qualifyingChild: true });
    st.province = 'on';
    near(
      t.incomeTax(pr3({ singlePerson: false, otherA: 50000, otherB: 5000 }), 0, 0),
      t.personTaxCA(50000, 0, 0, 0, 0, 0, null, 0, 0, 5000, 0, 0) + t.personTaxCA(5000, 0, 0),
      1e-9,
      'couple: the higher-income partner claims the spouse amount',
    );
    near(
      t.incomeTax(pr3({ singlePerson: false, otherA: 5000, otherB: 50000 }), 0, 0),
      t.personTaxCA(5000, 0, 0) + t.personTaxCA(50000, 0, 0, 0, 0, 0, null, 0, 0, 5000, 0, 0),
      1e-9,
      'couple: B claims when B has the higher income',
    );
    near(
      t.incomeTax(pr3({ singlePerson: true, otherA: 50000, dependents: [kid(5), kid(30)] }), 0, 0),
      t.personTaxCA(50000, 0, 0, 0, 0, 0, null, 0, 0, -1, 1, 0, 0, 0, 0, 0, 1),
      1e-9,
      'single parent: one child under 18 (an adult child does not count); Ontario also gives the child-based tax reduction',
    );
    st.province = 'sk';
    near(
      t.incomeTax(pr3({ singlePerson: false, otherA: 60000, otherB: 40000, dependents: [kid(5), kid(8)] }), 0, 0),
      t.personTaxCA(60000, 0, 0) + t.personTaxCA(40000, 0, 0, 0, 0, 0, null, 0, 0, -1, 0, 2),
      1e-9,
      'couple: the lower-income parent claims the child amount',
    );
    // A profile with no dependents or spouse claim is unchanged.
    st.province = 'on';
    near(t.incomeTax(pr3({ singlePerson: true, otherA: 50000 }), 0, 0), t.personTaxCA(50000, 0, 0), 1e-12, 'no children, no change');
    // The pension split sees the claims: regret against a $50 scan for a couple with a low-income spouse and a child.
    {
      let worstClaim = 0;
      const deps = [kid(6)];
      for (const [oA, oB, eA, eB] of [[60000, 3000, 40000, 0], [45000, 12000, 30000, 0], [70000, 20000, 50000, 8000], [38000, 38000, 20000, 20000]]) {
        const x = t.solvePensionSplit(oA, oB, eA, eB, 0, 68, 66, 0, 0, 1);
        const fam = oA + oB;
        const cost = (y) => {
          const nA = oA - y, nB = oB + y;
          return (
            t.personTaxCA(nA, 0, 0, 0, 68, eA - y, fam, 0, 0, nA >= nB ? nB : -1, 0, nA <= nB ? 1 : 0) +
            t.personTaxCA(nB, 0, 0, 0, 66, eB + y, fam, 0, 0, nB > nA ? nA : -1, 0, nB < nA ? 1 : 0)
          );
        };
        let best = Infinity;
        for (let y = -0.5 * eB; y <= 0.5 * eA; y += 50) best = Math.min(best, cost(y));
        worstClaim = Math.max(worstClaim, cost(x) - best);
      }
      if (worstClaim > 3) fails.push('pension split regret with a spouse claim and a child $' + worstClaim.toFixed(2));
    }
    // With payroll items (7N N4): a working partner A (credit bases and the enhanced deduction already in the income and
    // credits) and a retired partner B with a pension: the split sees the credit bases too.
    {
      const pay = { fedA: 6500, provA: 4800, dedA: 0, fedB: 0, provB: 0, dedB: 0 };
      let worstPay = 0;
      for (const [oA, oB, eB] of [[80000, 30000, 30000], [60000, 12000, 12000], [95000, 45000, 40000]]) {
        const x = t.solvePensionSplit(oA, oB, 0, eB, 0, 50, 66, 0, 0, 0, pay);
        const fam = oA + oB;
        const cost = (y) => {
          const nA = oA - y, nB = oB + y;
          const [cA, cB] = claimNets(nA, nB);
          return t.personTaxCA(nA, 0, 0, 0, 50, 0 - y, fam, 0, 0, cA, 0, 0, pay.fedA, pay.provA, pay.dedA) + t.personTaxCA(nB, 0, 0, 0, 66, eB + y, fam, 0, 0, cB, 0, 0, pay.fedB, pay.provB, pay.dedB);
        };
        let best = Infinity;
        for (let y = -0.5 * eB; y <= 0; y += 50) best = Math.min(best, cost(y));
        worstPay = Math.max(worstPay, cost(x) - best);
      }
      if (worstPay > 3) fails.push('pension split regret with payroll credits $' + worstPay.toFixed(2));
    }
  }
  // --- Working-year payroll items and the home buyers' amount (7N N4, N10) --------
  // payrollItems(wages, yearIndex) -> { cash, fedCredit, provCredit, deduction, provDeduction } (2026 figures, CRA and
  // Revenu Quebec): CPP 5.95% = 4.95% base (credit) + 1% enhanced (deduction) on 3,500 to 74,600, CPP2 4% to 85,000 (deduction);
  // QPP 6.30% = 5.30% base + 1% enhanced; EI 1.63% (Quebec 1.30%) to 68,900 and the QPIP premium are credits; the Canada
  // employment amount 1,501 is a federal credit; Quebec gives a deduction for the enhanced QPP and a workers' deduction
  // (6% to 1,450) but no credits for them.
  {
    const P = (w, y = 0) => t.payrollItems(w, y);
    st.province = 'on';
    let p = P(60000);
    near(p.cash, 3361.75 + 978, 1e-6, 'ON wages 60,000: CPP 56,500 x 5.95% plus EI 1.63%');
    near(p.deduction, 565, 1e-6, 'enhanced CPP deduction 1% x 56,500');
    near(p.fedCredit, 56500 * 0.0495 + 978 + 1501, 1e-6, 'federal credit base: base CPP, EI and the employment amount');
    near(p.provCredit, 56500 * 0.0495 + 978, 1e-6, 'provincial credit base: base CPP and EI');
    p = P(100000);
    near(p.cash, 4230.45 + 416 + 1123.07, 1e-6, 'ON wages 100,000: CPP max, CPP2 max and the EI maximum');
    near(p.deduction, 711 + 416, 1e-6, 'enhanced deduction at the maximum: 711 + 416');
    near(p.fedCredit, 71100 * 0.0495 + 1123.07 + 1501, 1e-6, 'credits stop growing at the maximums');
    near(P(1000).fedCredit - 1000 * 0.0163, 1000, 1e-6, 'the employment amount is the lesser of 1,501 and the wages');
    near(P(0).cash, 0, 1e-12, 'no wages, no payroll items');
    st.province = 'qc';
    p = P(100000);
    near(p.cash, 4479.3 + 416 + 430 + 895.7, 1e-6, 'QC wages 100,000: QPP, QPP2, QPIP and EI at 1.30%');
    near(p.fedCredit, 71100 * 0.053 + 895.7 + 430 + 1501, 1e-6, 'QC federal credit base: base QPP 5.30%, EI, QPIP, employment amount');
    near(p.provCredit, 0, 1e-12, 'Quebec has no provincial credit for QPP, EI or QPIP');
    near(p.provDeduction, 1450, 1e-9, 'QC workers deduction at the 1,450 maximum');
    near(p.deduction, 711 + 416, 1e-6, 'QC enhanced QPP deduction (first additional 1% and second additional 4%)');
    near(P(10000).provDeduction, 600, 1e-9, 'QC workers deduction is 6% of the wages below the maximum');
    // Indexing: the maximums scale with the plan factor.
    st.province = 'on';
    const f10 = t.taxIndexFactor(10);
    near(P(200000 * f10, 10).cash, (4230.45 + 416 + 1123.07) * f10, 1e-6, 'payroll maximums are indexed');
    // personTaxCA with the three payroll arguments: ON at 50,000, credit bases 5,000 (federal) and 4,000 (provincial) and a
    // 1,000 provincial deduction: 0.14 x 5,000 + 0.0505 x 4,000 + 0.0505 x 1,000.
    const base = t.personTaxCA(50000, 0, 0);
    near(base - t.personTaxCA(50000, 0, 0, 0, 0, 0, null, 0, 0, -1, 0, 0, 5000, 4000, 1000), 700 + 202 + 50.5, 1e-6, 'payroll credits and deduction in personTaxCA');
    // The home buyers' amount (N10): federal 10,000 at 14%; Saskatchewan 15,000 at 10.5%; Quebec 10,000 at 14% (max 1,400).
    near(t.homeBuyerAmounts('sk')[0], 10000, 0, 'federal home buyers amount');
    near(t.homeBuyerAmounts('sk')[1], 15000, 0, 'SK first-time home buyers amount (15,000 from 2025)');
    near(t.homeBuyerAmounts('qc')[1], 10000, 0, 'QC home buyers credit base (1,400 at 14%)');
    near(t.homeBuyerAmounts('on')[1], 0, 0, 'no Ontario home buyers amount');
  }
  // --- Medical expense credit and the Ontario Seniors Care at Home credit (7N N5) --------
  // personTaxCA(..., fedCredit, provCredit, provDeduction, medical): `medical` is the household's eligible expenses claimed on
  // this return (the planner's private health premium plus the whole long-term-care cost). Federal: expenses above the lesser of
  // 3% of net income and 2,890 (2026) at 14%. Provincial: the same shape with the province's own threshold (ON428 2025 line 36
  // to 41: 3% or 2,885; the 2026 thresholds are TaxTips), at the lowest rate; Quebec has no dollar floor and takes 3% of
  // FAMILY income (Revenu Quebec Schedule B part C). Ontario also pays the refundable Seniors Care at Home credit (70+, 25% of up
  // to 6,000 of the claimable expenses, less 5% of family net income over 35,000).
  {
    const R = t.PROVINCE_RULES;
    const no = (...a) => t.personTaxCA(...a);
    const medDiff = (code, income, m) => {
      st.province = code;
      return no(income, 0, 0, 0, 0, 0, null, 0, 0, -1, 0, 0, 0, 0, 0, 0) - no(income, 0, 0, 0, 0, 0, null, 0, 0, -1, 0, 0, 0, 0, 0, m);
    };
    near(medDiff('ab', 80000, 10000), 0.14 * 7600 + R.ab.creditRate * 7600, 1e-6, 'medical credit at 80,000: both floors are 3% = 2,400');
    near(medDiff('bc', 50000, 10000), 0.14 * 8500 + R.bc.creditRate * 8500, 1e-6, 'medical credit at 50,000: floor 1,500');
    near(medDiff('mb', 120000, 10000), 0.14 * (10000 - 2890) + R.mb.creditRate * (10000 - 1728), 1e-6, 'medical credit at 120,000: dollar floors bind (federal 2,890, Manitoba 1,728)');
    near(medDiff('ab', 80000, 2000), 0, 1e-9, 'expenses under the floor give nothing');
    near(medDiff('ab', 0, 10000), 0, 1e-12, 'no tax, no credit (non-refundable)');
    // Quebec: provincial floor is 3% of family income (no dollar cap); federal as elsewhere (then the 0.835 abatement).
    const qc = (fam, m) => t.provincialTaxCA(100000, 0, 0, 0, 0, fam, 0, -1, 0, 0, 0, 0) - t.provincialTaxCA(100000, 0, 0, 0, 0, fam, 0, -1, 0, 0, 0, m);
    st.province = 'qc';
    near(qc(null, 10000), 0.14 * 7000, 1e-6, 'QC single: floor 3% of own income 100,000');
    near(qc(150000, 10000), 0.14 * 5500, 1e-6, 'QC couple: floor 3% of family income 150,000');
    // Indexing: the dollar floors scale with the plan factor (Saskatchewan 2,736).
    st.province = 'sk';
    const f10 = t.taxIndexFactor(10);
    near(t.provincialTaxCA(200000 * f10, 10, 0, 0, 0, null, 0, -1, 0, 0, 0, 0) - t.provincialTaxCA(200000 * f10, 10, 0, 0, 0, null, 0, -1, 0, 0, 0, 10000 * f10), R.sk.creditRate * (10000 - 2736) * f10, 1e-6, 'provincial medical floor is indexed');
    // incomeTaxCA: one claim a household, on the lower net income unless that partner is under the basic personal amount.
    const pr5 = (o) => Object.assign({ year: 0, dtcA: 0, dtcB: 0 }, o);
    st.province = 'bc';
    near(
      t.incomeTax(pr5({ singlePerson: false, otherA: 80000, otherB: 8000, medical: 10000 }), 0, 0),
      no(80000, 0, 0, 0, 0, 0, null, 0, 0, 8000, 0, 0, 0, 0, 0, 10000) + no(8000, 0, 0),
      1e-9,
      'couple: the higher-income partner claims when the other is under the basic personal amount',
    );
    near(
      t.incomeTax(pr5({ singlePerson: false, otherA: 60000, otherB: 40000, medical: 10000 }), 0, 0),
      no(60000, 0, 0, 0, 0, 0, null, 0, 0, 40000, 0, 0, 0, 0, 0, 0) + no(40000, 0, 0, 0, 0, 0, null, 0, 0, -1, 0, 0, 0, 0, 0, 10000),
      1e-9,
      'couple: the lower net income claims when it can use the credit',
    );
    // A 65+ partner owes no tax up to about 27,700 (basic + age + pension amounts), so the lower return may have nothing for the credit to
    // reduce even above the basic personal amount: both claimants are priced and the cheaper kept (BC, both 70, 20,000 and 80,000,
    // 30,000 of expenses; claiming on the 20,000 return saved nothing).
    {
      const onLow = no(80000, 0, 0, 0, 70, 0, null, 0, 0, 20000, 0, 0, 0, 0, 0, 0) + no(20000, 0, 0, 0, 70, 0, null, 0, 0, -1, 0, 0, 0, 0, 0, 30000);
      const onHigh = no(80000, 0, 0, 0, 70, 0, null, 0, 0, 20000, 0, 0, 0, 0, 0, 30000) + no(20000, 0, 0, 0, 70, 0, null, 0, 0, -1, 0, 0, 0, 0, 0, 0);
      const noMed = no(80000, 0, 0, 0, 70, 0, null, 0, 0, 20000, 0, 0, 0, 0, 0, 0) + no(20000, 0, 0, 0, 70, 0);
      near(onLow, noMed, 1e-9, 'claiming on the 20,000 return saves nothing: its tax is already nil');
      near(onHigh < onLow - 1000 ? 1 : 0, 1, 0, 'claiming on the 80,000 return must save real tax: ' + onHigh + ' vs ' + onLow);
      near(
        t.incomeTax(pr5({ singlePerson: false, otherA: 80000, otherB: 20000, ageA: 70, ageB: 70, medical: 30000 }), 0, 0),
        onHigh,
        1e-9,
        'couple: the claim goes to the return that can use it when the lower one owes no tax',
      );
      near(
        t.incomeTax(pr5({ singlePerson: false, otherA: 20000, otherB: 80000, ageA: 70, ageB: 70, medical: 30000 }), 0, 0),
        no(80000, 0, 0, 0, 70, 0, null, 0, 0, 20000, 0, 0, 0, 0, 0, 30000) + no(20000, 0, 0, 0, 70, 0),
        1e-9,
        'the same with the partners swapped',
      );
    }
    near(
      t.incomeTax(pr5({ singlePerson: true, otherA: 50000, medical: 6000 }), 0, 0),
      no(50000, 0, 0, 0, 0, 0, null, 0, 0, -1, 0, 0, 0, 0, 0, 6000),
      1e-9,
      'single: the medical claim is on the only return',
    );
    near(t.incomeTax(pr5({ singlePerson: true, otherA: 50000 }), 0, 0), no(50000, 0, 0), 1e-12, 'no medical expenses, no change');
    // Ontario Seniors Care at Home credit (refundable): single 72 at 40,000 with 8,000 of expenses: claimable 8,000 - 1,200 = 6,800,
    // capped at 6,000: 25% = 1,500 less 5% x (40,000 - 35,000) = 1,250.
    st.province = 'on';
    const careBase = (net, age, m) => no(net, 0, 0, 0, age, 0, null, 0, 0, -1, 0, 0, 0, 0, 0, m);
    near(t.incomeTax(pr5({ singlePerson: true, otherA: 40000, ageA: 72, medical: 8000 }), 0, 0), careBase(40000, 72, 8000) - 1250, 1e-6, 'Ontario Seniors Care at Home credit');
    near(t.incomeTax(pr5({ singlePerson: true, otherA: 70000, ageA: 72, medical: 8000 }), 0, 0), careBase(70000, 72, 8000), 1e-9, 'the credit is nil from 65,000 of family net income');
    near(t.incomeTax(pr5({ singlePerson: true, otherA: 40000, ageA: 69, medical: 8000 }), 0, 0), careBase(40000, 69, 8000), 1e-9, 'the credit needs age 70');
    near(t.incomeTax(pr5({ singlePerson: true, otherA: 40000, ageA: 72 }), 0, 0), careBase(40000, 72, 0), 1e-12, 'no expenses, no credit');
    // The claimant also sets the Seniors Care at Home credit (its floor is 3% of the claimant's net income, up to 2,940), so in Ontario
    // with a 70+ spouse both claimants are priced on tax less the credit: A 83 with 166 and B 76 with 36,103, 5,140 of expenses. B already
    // owes nothing, the credit shrinks with the claimant's floor, and claiming on A leaves the household better off.
    {
      const med = 5140,
        fam = 166 + 36103,
        care = (net) => Math.max(0, 0.25 * Math.min(6000, med - Math.min(0.03 * net, 2940)) - 0.05 * Math.max(0, fam - 35000));
      const onA = no(166, 0, 0, 0, 83, 0, null, 0, 0, -1, 0, 0, 0, 0, 0, med) + no(36103, 0, 0, 0, 76, 0, null, 0, 0, 166, 0, 0, 0, 0, 0, 0) - care(166);
      const onB = no(166, 0, 0, 0, 83, 0, null, 0, 0, -1, 0, 0, 0, 0, 0, 0) + no(36103, 0, 0, 0, 76, 0, null, 0, 0, 166, 0, 0, 0, 0, 0, med) - care(36103);
      near(onA < onB - 100 ? 1 : 0, 1, 0, 'the scenario must favour claiming on A: ' + onA + ' vs ' + onB);
      near(t.incomeTax(pr5({ singlePerson: false, otherA: 166, otherB: 36103, ageA: 83, ageB: 76, medical: med }), 0, 0), Math.min(onA, onB), 1e-6, 'Ontario couple: the claimant minimizing tax less the care credit');
      near(t.incomeTax(pr5({ singlePerson: false, otherA: 36103, otherB: 166, ageA: 76, ageB: 83, medical: med }), 0, 0), Math.min(onA, onB), 1e-6, 'the same with the partners swapped');
    }
    // A couple: A is 72, B is 60, 25,000 each (family net 50,000): 1,500 less 5% x 15,000 = 750; either spouse's age 70+ qualifies.
    near(
      t.incomeTax(pr5({ singlePerson: false, otherA: 25000, otherB: 25000, ageA: 72, ageB: 60, medical: 8000 }), 0, 0),
      // either spouse can claim; the cheaper claim stands (here the 60-year-old, who has no age amount to use the tax up first)
      Math.min(
        no(25000, 0, 0, 0, 72, 0, null, 0, 0, 25000, 0, 0, 0, 0, 0, 8000) + no(25000, 0, 0, 0, 60, 0),
        no(25000, 0, 0, 0, 72, 0, null, 0, 0, 25000, 0, 0, 0, 0, 0, 0) + no(25000, 0, 0, 0, 60, 0, null, 0, 0, -1, 0, 0, 0, 0, 0, 8000),
      ) - 750,
      1e-6,
      'Ontario care credit for a couple, family net income 50,000',
    );
    // The split search sees the medical claim: regret against a $50 scan.
    {
      let worstMed = 0;
      const pay = { fedA: 0, provA: 0, dedA: 0, fedB: 0, provB: 0, dedB: 0, med: 12000 };
      st.province = 'on';
      for (const [oA, oB, eA, eB] of [[70000, 20000, 40000, 0], [55000, 30000, 30000, 12000], [90000, 15000, 50000, 0]]) {
        const x = t.solvePensionSplit(oA, oB, eA, eB, 0, 70, 68, 0, 0, 0, pay);
        const fam = oA + oB;
        const cost = (y) => {
          const nA = oA - y, nB = oB + y;
          const [cA, cB] = claimNets(nA, nB);
          const toB = t.medicalClaimToB(nA, nB, 0);
          return t.personTaxCA(nA, 0, 0, 0, 70, eA - y, fam, 0, 0, cA, 0, 0, 0, 0, 0, toB ? 0 : pay.med) + t.personTaxCA(nB, 0, 0, 0, 68, eB + y, fam, 0, 0, cB, 0, 0, 0, 0, 0, toB ? pay.med : 0);
        };
        let best = Infinity;
        for (let y = -0.5 * eB; y <= 0.5 * eA; y += 50) best = Math.min(best, cost(y));
        worstMed = Math.max(worstMed, cost(x) - best);
      }
      if (worstMed > 3) fails.push('pension split regret with a medical claim $' + worstMed.toFixed(2));
    }
  }
  // --- Low-income provincial tax reductions (7N N6) --------------------------------
  // Read on the CRA 2025 provincial forms (ON428 p.3, BC428 p.3, NB428/NL428/NS428/PE428 Part C). Ontario: per return, 2 x (294 + 544
  // per dependent child) less the Ontario tax, taken off the tax (so it clears tax up to the basic reduction and halves the rest);
  // British Columbia: 575 (2026, CRA T4127; 562 on the 2025 form) less 3.56% of net income over 25,570; New Brunswick, Newfoundland
  // and Labrador, Nova Scotia and PEI: one family reduction (basic + spouse or eligible dependant + children + PEI age amounts) less a rate on
  // adjusted family income over a base, limited to the family's provincial tax (an unused part passes to the spouse); Nova Scotia
  // also a 1,000 age tax credit under 24,000 of taxable income. Alberta, Saskatchewan, Manitoba and Quebec have none (forms read).
  {
    const R = t.PROVINCE_RULES;
    const kid = (age) => ({ age, student: false, qualifyingChild: true });
    const pr6 = (o) => Object.assign({ year: 0, dtcA: 0, dtcB: 0 }, o);
    // The same call with the province's reduction removed from the table, to isolate its effect.
    const without = (code, fn) => {
      const keep = R[code].lowIncomeReduction;
      R[code].lowIncomeReduction = null;
      try {
        return fn();
      } finally {
        R[code].lowIncomeReduction = keep;
      }
    };
    const effect = (code, fn) => without(code, fn) - fn();
    // Ontario at 20,000: tax 354.0555; 2 x 294 = 588; reduction 588 - 354.0555 = 233.9445.
    st.province = 'on';
    near(effect('on', () => t.provincialTaxCA(20000, 0)), 233.9445, 1e-4, 'ON tax reduction at 20,000');
    near(t.provincialTaxCA(15000, 0), 0, 1e-9, 'ON tax is cleared at 15,000');
    near(effect('on', () => t.provincialTaxCA(20000, 0, 0, 0, 0, null, 0, -1, 0, 0, 0, 0, 1)) - 233.9445, 354.0555 - 233.9445, 1e-4, 'ON: a dependent child clears the whole tax (effect = the tax)');
    near(effect('on', () => t.provincialTaxCA(80000, 0)), 0, 1e-9, 'no Ontario reduction at 80,000');
    // British Columbia: net 30,000: 575 - 3.56% x 4,430 = 417.292 (tax 522.6 after credits); 20,000: capped at the tax 379.9.
    st.province = 'bc';
    near(effect('bc', () => t.provincialTaxCA(30000, 0)), 575 - 0.0356 * (30000 - 25570), 1e-6, 'BC tax reduction at 30,000');
    near(effect('bc', () => t.provincialTaxCA(20000, 0)), 20000 * 0.056 - 0.056 * 13216, 1e-6, 'BC reduction is limited to the tax');
    near(effect('bc', () => t.provincialTaxCA(41722, 0)), 0, 1e-9, 'BC reduction is nil at 41,722');
    // New Brunswick: single 25,000: 802 - 3% x 3,080 = 709.6, below the 1,065.6 of tax; single over 48,653 gets none.
    st.province = 'nb';
    near(effect('nb', () => t.incomeTax(pr6({ singlePerson: true, otherA: 25000 }), 0, 0)), 802 - 0.03 * (25000 - 21920), 1e-6, 'NB family reduction, single');
    near(effect('nb', () => t.incomeTax(pr6({ singlePerson: true, otherA: 50000 }), 0, 0)), 0, 1e-9, 'NB: single at 50,000 is not eligible');
    // Newfoundland and Labrador: a couple 30,000 + 5,000: basic 997 + spouse 557 = 1,554; base 40,460 (spouse claimed) so no income
    // reduction; limited to the family's provincial tax; the rest passes to the spouse.
    st.province = 'nl';
    {
      const pA = t.provincialTaxCA(30000, 0, 0, 0, 0, null, 0, 5000, 0, 0),
        pB = t.provincialTaxCA(5000, 0, 0, 0, 0, null, 0, -1, 0, 0);
      near(effect('nl', () => t.incomeTax(pr6({ singlePerson: false, otherA: 30000, otherB: 5000 }), 0, 0)), Math.min(1554, pA + pB), 1e-6, 'NL family reduction, limited to the family tax');
    }
    // A single NL filer at 30,000: 997 - 16% x (30,000 - 23,928) = 25.48.
    near(effect('nl', () => t.incomeTax(pr6({ singlePerson: true, otherA: 30000 }), 0, 0)), 997 - 0.16 * (30000 - 23928), 1e-6, 'NL family reduction, single over the 23,928 base');
    // Nova Scotia single 66 at 20,000: reduction 300 - 5% x 5,000 = 50 and the age tax credit (1,000) limited to the tax.
    st.province = 'ns';
    {
      const tax = without('ns', () => t.provincialTaxCA(20000, 0, 0, 66, 0, null, 0));
      near(tax - t.provincialTaxCA(20000, 0, 0, 66, 0, null, 0), Math.min(tax, 1000), 1e-6, 'NS age tax credit under 24,000 (limited to the tax)');
      near(effect('ns', () => t.incomeTax(pr6({ singlePerson: true, otherA: 28000, ageA: 40 }), 0, 0)), 0, 1e-9, 'NS single at 28,000: reduction 300 - 650 is nil');
    }
    // Prince Edward Island couple, both 67, 23,000 each: AFI 46,000: 350 + 350 + 250 + 250 = 1,200 less 5% x 23,350 = 32.5.
    st.province = 'pe';
    {
      const e = effect('pe', () => t.incomeTax(pr6({ singlePerson: false, otherA: 23000, otherB: 23000, ageA: 67, ageB: 67 }), 0, 0));
      near(e, 1200 - 0.05 * (46000 - 22650), 1e-6, 'PEI family reduction with both age amounts');
    }
    // Quebec, Alberta, Saskatchewan and Manitoba have none.
    for (const c of ['qc', 'ab', 'sk', 'mb']) if (R[c].lowIncomeReduction !== null) fails.push(c + ': should have no low-income reduction');
    // Indexing: the Ontario amounts scale with the plan factor.
    st.province = 'on';
    const g10 = t.taxIndexFactor(10);
    const T10 = without('on', () => t.provincialTaxCA(20000 * g10, 10));
    near(effect('on', () => t.provincialTaxCA(20000 * g10, 10)), Math.max(0, Math.min(T10, 2 * 294 * g10 - T10)), 1e-6, 'ON reduction indexes');
  }
  // --- Couple vs single: two individual returns ------------------------------
  const prof = (o) => Object.assign({ year: 0, dtcA: 0, dtcB: 0 }, o);
  const one = t.personTaxCA(50000, 0, 0);
  near(t.incomeTax(prof({ singlePerson: true, otherA: 50000 }), 0, 0), one, 1e-9, 'taxFor single');
  near(t.incomeTax(prof({ singlePerson: false, otherA: 50000, otherB: 50000 }), 0, 0), 2 * one, 1e-9, 'taxFor couple = two individual returns');
  // Gains and RRSP withdrawals split evenly between spouses.
  near(
    t.incomeTax(prof({ singlePerson: false, otherA: 40000, otherB: 40000 }), 20000, 20000),
    2 * t.personTaxCA(50000, 10000, 0),
    1e-9,
    'taxFor couple splits gains and extra RRSP income',
  );
  // --- Two returns: ages and eligible pension income per person --------------
  {
    const p = (o) => Object.assign({ year: 0, dtcA: 0, dtcB: 0 }, o);
    near(
      t.incomeTax(p({ singlePerson: false, otherA: 50000, otherB: 20000, ageA: 66, ageB: 66, penA: 30000, penB: 0 }), 0, 0),
      t.personTaxCA(50000, 0, 0, 0, 66, 30000) + t.personTaxCA(20000, 0, 0, 0, 66, 0),
      1e-9,
      "taxFor couple reads each partner's own age and pension",
    );
    // A discretionary RRSP/RRIF draw counts as RRIF income for the pension credit from 71 (when the planner
    // converts the RRSP to a RRIF), not before: an RRSP withdrawal that is not an annuity or RRIF payment is
    // not pension income at any age (7K fix).
    near(t.incomeTax(p({ singlePerson: true, otherA: 40000, ageA: 71, penA: 0 }), 0, 10000), t.personTaxCA(50000, 0, 0, 0, 71, 10000), 1e-9, 'RRSP draw at 71 is pension income');
    near(t.incomeTax(p({ singlePerson: true, otherA: 40000, ageA: 66, penA: 0 }), 0, 10000), t.personTaxCA(50000, 0, 0, 0, 66, 0), 1e-9, 'RRSP draw at 66 is not pension income');
    near(t.incomeTax(p({ singlePerson: true, otherA: 40000, ageA: 66, penA: 5000 }), 0, 10000), t.personTaxCA(50000, 0, 0, 0, 66, 5000), 1e-9, 'an employer pension at 66 is, the RRSP draw on top is not');
    near(t.incomeTax(p({ singlePerson: true, otherA: 40000, ageA: 60, penA: 0 }), 0, 10000), t.personTaxCA(50000, 0, 0, 0, 60, 0), 1e-9, 'RRSP draw at 60 is not pension income');
    near(
      t.incomeTax(p({ singlePerson: false, otherA: 40000, otherB: 40000, ageA: 72, ageB: 60, penA: 0, penB: 0 }), 0, 20000),
      t.personTaxCA(50000, 0, 0, 0, 72, 10000) + t.personTaxCA(50000, 0, 0, 0, 60, 0),
      1e-9,
      "RRSP draw: only the RRIF-age partner's half counts",
    );
    // A profile without ages or pension fields reads as under 65.
    near(t.incomeTax(p({ singlePerson: true, otherA: 50000 }), 0, 0), t.personTaxCA(50000, 0, 0), 1e-9, 'profile without ages');
    // Pension splitting sees the credits: the chosen transfer is no worse than any other on a grid.
    for (const [oA, oB, eA, eB, ageA, ageB] of [
      [100000, 20000, 80000, 0, 70, 70],
      [70000, 15000, 40000, 0, 66, 62],
      [60000, 60000, 30000, 30000, 68, 68],
      [120000, 0, 90000, 0, 75, 75],
    ]) {
      const x = t.solvePensionSplit(oA, oB, eA, eB, 0, ageA, ageB);
      const combined = (y) => {
        const [cA, cB] = claimNets(oA - y, oB + y);
        return t.personTaxCA(oA - y, 0, 0, 0, ageA, eA - y, null, 0, 0, cA) + t.personTaxCA(oB + y, 0, 0, 0, ageB, eB + y, null, 0, 0, cB);
      };
      if (!(x >= -0.5 * eB - 1e-9 && x <= 0.5 * eA + 1e-9)) fails.push(`split ${oA}/${oB}: transfer ${x} outside the allowed range`);
      for (let y = -0.5 * eB; y <= 0.5 * eA + 1e-9; y += 250)
        if (combined(x) > combined(y) + 1e-6) fails.push(`split ${oA}/${oB}: transfer ${x} costs more than ${y}`);
    }
    // Regret against a $50 brute-force scan over 360 households with a 65+ partner: the clawback makes
    // combined tax non-convex (flat plateaus with narrow dips), so the search is grid + refine, not exact.
    st.province = 'on';
    let worst = 0;
    for (const pa of [0, 10000, 25000, 40000, 60000, 90000])
      for (const pb of [0, 10000, 25000, 40000, 60000])
        for (const oa of [0, 20000, 40000, 70000])
          for (const ob of [0, 20000, 40000]) {
            const oA = pa + oa,
              oB = pb + ob;
            const x = t.solvePensionSplit(oA, oB, pa, pb, 0, 70, 68);
            const combined = (y) => {
              const [cA, cB] = claimNets(oA - y, oB + y);
              return t.personTaxCA(oA - y, 0, 0, 0, 70, pa - y, null, 0, 0, cA) + t.personTaxCA(oB + y, 0, 0, 0, 68, pb + y, null, 0, 0, cB);
            };
            let best = Infinity;
            for (let y = -0.5 * pb; y <= 0.5 * pa + 1e-9; y += 50) best = Math.min(best, combined(y));
            worst = Math.max(worst, combined(x) - best);
          }
    if (!(worst < 3)) fails.push(`pension split regret up to $${worst.toFixed(2)} a year against a brute-force scan`);
    // 7N N1: the same check with OAS in both returns, so the recovery tax (a 15% kink at the threshold, capped
    // at the OAS) is inside the search objective. Incomes include the 9,000 OAS each.
    let worstOas = 0;
    for (const pa of [0, 20000, 50000, 90000])
      for (const pb of [0, 15000, 40000])
        for (const oa of [0, 30000, 60000])
          for (const ob of [0, 25000, 50000]) {
            const oas = 9000,
              oA = pa + oa + oas,
              oB = pb + ob + oas;
            const x = t.solvePensionSplit(oA, oB, pa, pb, 0, 70, 68, oas, oas);
            const combined = (y) => {
              const [cA, cB] = claimNets(oA - y, oB + y);
              return t.personTaxCA(oA - y, 0, 0, 0, 70, pa - y, null, 0, oas, cA) + t.personTaxCA(oB + y, 0, 0, 0, 68, pb + y, null, 0, oas, cB);
            };
            let best = Infinity;
            for (let y = -0.5 * pb; y <= 0.5 * pa + 1e-9; y += 50) best = Math.min(best, combined(y));
            worstOas = Math.max(worstOas, combined(x) - best);
          }
    if (!(worstOas < 3)) fails.push(`pension split with OAS: regret up to $${worstOas.toFixed(2)} a year against a brute-force scan`);
  }
  return fails;
}

(async () => {
  await withPage('Planner_US.html', usChecks);
  console.log('[US] tax schedule tests passed (federal, LTCG, NIIT, Social Security, taxFor, every state)');
  await withPage('Planner_Canada.html', caChecks);
  console.log('[Canada] tax schedule tests passed (federal, every province, Ontario surtax/premium, credits, OAS)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

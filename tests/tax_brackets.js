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
  const BPA = 14829;
  st.inflation = 0;
  st.province = 'on';

  // --- Federal --------------------------------------------------------------
  // $100k: 85,171 taxable -> 8,193.22 + 26,648 * 20.5% (5,462.84) = 13,656.06
  near(t.federalTaxCA(100000, 0), 13656.06, 0.005, 'federal $100k');
  near(t.federalTaxCA(BPA, 0), 0, 1e-9, 'federal at basic personal amount');
  for (const inc of [0, 10000, 14829, 30000, 73352, 75000, 131874, 132000, 196269, 300000, 600000])
    near(t.federalTaxCA(inc, 0), refTax(Math.max(0, inc - BPA), FED), 0.005, `federal ${inc}`);
  for (const [cap] of FED.slice(0, -1))
    for (const d of [-1, 0, 1])
      near(t.federalTaxCA(cap + BPA + d, 0), refTax(cap + d, FED), 0.005, `federal bracket edge ${cap}${d >= 0 ? '+' : ''}${d}`);

  // --- Ontario ---------------------------------------------------------------
  // $100k: 87,011 taxable -> 2,721.4955 + 3,030.48 = 5,751.9755; no surtax
  // (below 5,818); health premium $750 -> 6,501.9755
  near(t.provincialTaxCA(100000, 0), 6501.9755, 0.005, 'Ontario $100k');
  // Surtax: $200k -> taxable 187,011. Base = 53,891*5.05% + 53,894*9.15% + 79,226*19.8%
  //   = 2,721.4955 + 4,931.1 + 15,686.7 (approx) -- compared via the reference below instead.
  {
    const on = t.PROVINCE_TAX.on;
    const taxable = 200000 - on.bpa;
    const base = refTax(taxable, on.brackets);
    const surtax = Math.max(0, base - 5818) * 0.2 + Math.max(0, base - 7446) * 0.16;
    near(t.provincialTaxCA(200000, 0), base + surtax + 750, 0.005, 'Ontario with surtax');
    if (!(surtax > 1000)) fails.push(`Ontario surtax should be material at $200k, got ${surtax}`);
  }
  // Health premium steps (continuous piecewise schedule).
  for (const [taxable, premium] of [[15000, 0], [22500, 150], [30000, 300], [37000, 360], [45000, 450], [48300, 525], [60000, 600], [72300, 675], [150000, 750], [200300, 825], [500000, 900]])
    near(t.ontarioHealthPremium(taxable, 1), premium, 0.005, `Ontario health premium at ${taxable}`);

  // --- Every province against its own table --------------------------------
  const codes = Object.keys(t.PROVINCE_TAX);
  if (codes.length !== 10) fails.push(`expected 10 provinces, found ${codes.length}`);
  for (const code of codes) {
    st.province = code;
    const table = t.PROVINCE_TAX[code];
    for (let i = 1; i < table.brackets.length; i++)
      if (!(table.brackets[i][0] > table.brackets[i - 1][0])) fails.push(`${code}: bracket caps not increasing at ${i}`);
    for (const inc of [0, 8000, 20000, 45000, 80000, 120000, 200000, 400000, 900000]) {
      const base = refTax(Math.max(0, inc - table.bpa), table.brackets);
      if (code !== 'on') near(t.provincialTaxCA(inc, 0), base, 0.005, `${code} provincial ${inc}`);
      else if (t.provincialTaxCA(inc, 0) < base - 0.005) fails.push(`on ${inc}: provincial tax below bracket tax`);
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
    for (const inc of [30000, 90000, 250000])
      near(t.personTaxCA(inc * f, 0, yi), f * t.personTaxCA(inc, 0, 0), 1e-6 * f * inc, `${code} indexing at ${inc}`);
    st.inflation = 0;
  }

  // --- Quebec federal abatement ----------------------------------------------
  st.province = 'qc';
  near(t.personTaxCA(100000, 0, 0), t.federalTaxCA(100000, 0) * 0.835 + t.provincialTaxCA(100000, 0), 0.005, 'Quebec 16.5% abatement');

  // --- Eligible dividend credit ------------------------------------------------
  st.province = 'on';
  // $27,600 grossed-up dividend on top of $72,400 other income = $100k taxable.
  // Tax before credit = 13,656.06 + 6,501.9755 = 20,158.0355;
  // credit = 27,600 * (15.0198% + 10%) = 6,905.4648 -> 13,252.5707
  near(t.personTaxCA(100000, 0, 0, 27600), 13252.5707, 0.005, 'eligible dividend credit');
  near(t.personTaxCA(27600, 0, 0, 27600), 0, 1e-9, 'dividend credit cannot push tax below zero');

  // --- OAS clawback -----------------------------------------------------------
  near(t.oasClawback(95000, 8500, 0), 0, 1e-9, 'OAS clawback below threshold');
  near(t.oasClawback(120000, 8500, 0), 3701.55, 0.005, 'OAS clawback partial'); // 15% of 24,677
  near(t.oasClawback(200000, 8500, 0), 8500, 0.005, 'OAS clawback capped at OAS received');
  near(t.oasClawback(300000, 0, 0), 0, 1e-9, 'no OAS, no clawback');

  // --- Couple vs single: two individual returns ------------------------------
  const prof = (o) => Object.assign({ year: 0, dtcA: 0, dtcB: 0 }, o);
  const one = t.personTaxCA(50000, 0, 0);
  near(t.taxFor(prof({ singlePerson: true, otherA: 50000 }), 0, 0), one, 1e-9, 'taxFor single');
  near(t.taxFor(prof({ singlePerson: false, otherA: 50000, otherB: 50000 }), 0, 0), 2 * one, 1e-9, 'taxFor couple = two individual returns');
  // Gains and RRSP withdrawals split evenly between spouses.
  near(
    t.taxFor(prof({ singlePerson: false, otherA: 40000, otherB: 40000 }), 20000, 20000),
    2 * t.personTaxCA(50000, 10000, 0),
    1e-9,
    'taxFor couple splits gains and extra RRSP income',
  );
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

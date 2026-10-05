// Hand-computed cases for the Canada income-tested benefits (7L). Cite the page, table row or statute section.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const near = (a, b, tol, label) => assert(Math.abs(a - b) <= tol, `${label}: expected ${b}, got ${a}`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_Canada.html'));
  await page.waitForTimeout(300);
  const t = (fn, ...args) => page.evaluate(({ fn, args }) => window.__test_tax[fn](...args), { fn, args });

  // --- OAS: the 75-plus step (ESDC: 838.75 / 762.50 = 1.10 since July 2022) ---
  near(await t('oasAgeFactor', 64), 1, 0, 'factor at 64');
  near(await t('oasAgeFactor', 74), 1, 0, 'factor at 74');
  near(await t('oasAgeFactor', 75), 1.1, 1e-12, 'factor at 75');
  near(await t('oasAgeFactor', 95), 1.1, 1e-12, 'factor at 95');
  // The default is the 2026 maximum, 762.50 a month at 65 to 74.
  const def = await page.evaluate(() => [window.__test_getState().oasMonthlyA, window.__test_getState().oasMonthlyB]);
  near(def[0], 762.5, 0, 'default OAS A');
  near(def[1], 762.5, 0, 'default OAS B');

  // cppAndOasIncome: by actual age, gated by the start age, scaled by the inflation factor, 0 means none.
  const oas = (over) => page.evaluate((over) => {
    const s = window.__test_getState();
    const saved = { oasMonthlyA: s.oasMonthlyA, oasMonthlyB: s.oasMonthlyB, oasStartAgeA: s.oasStartAgeA, oasStartAgeB: s.oasStartAgeB };
    Object.assign(s, over.state);
    const r = window.__test_tax.cppAndOasIncome({ age: over.age, ageB: over.ageB, singlePerson: false, factor: over.factor || 1, isSurvivorPeriod: false, deceasedIsA: false });
    Object.assign(s, saved);
    return r;
  }, over);
  let r = await oas({ age: 66, ageB: 76, state: { oasMonthlyA: 762.5, oasMonthlyB: 762.5, oasStartAgeA: 65, oasStartAgeB: 65 } });
  near(r.oasGrossA, 762.5 * 12, 1e-9, 'A at 66: 762.50 x 12 = 9,150');
  near(r.oasGrossB, 762.5 * 12 * 1.1, 1e-9, 'B at 76: 9,150 x 1.10 = 10,065');
  r = await oas({ age: 66, ageB: 66, state: { oasMonthlyA: 762.5, oasMonthlyB: 762.5, oasStartAgeA: 70, oasStartAgeB: 65 } });
  near(r.oasGrossA, 0, 0, 'A deferring to 70 gets nothing at 66');
  near(r.oasGrossB, 9150, 1e-9, 'B starting at 65 gets 9,150 at 66');
  r = await oas({ age: 80, ageB: 80, state: { oasMonthlyA: 0, oasMonthlyB: 0, oasStartAgeA: 65, oasStartAgeB: 65 } });
  near(r.oasGrossA + r.oasGrossB, 0, 0, 'an OAS input of 0 means no OAS');
  r = await oas({ age: 80, ageB: 80, factor: 1.5, state: { oasMonthlyA: 700, oasMonthlyB: 0, oasStartAgeA: 65, oasStartAgeB: 65 } });
  near(r.oasGrossA, 700 * 12 * 1.1 * 1.5, 1e-9, 'inflation factor and 75-plus step compose');

  // --- GIS in the engine: net-tax identity and situations ---
  // Profile: a single person aged 70, CPP 10,000 plus OAS 762.50 x 12 = 9,150 -> otherA 19,150, year index 0
  // (inflation factor 1). GIS income = 19,150 - 9,150 OAS = 10,000.
  const prof = (o) => ({ otherA: 0, otherB: 0, dtcA: 0, dtcB: 0, penA: 0, penB: 0, ageA: 70, ageB: null, singlePerson: true, year: 0, oasA: 0, oasB: 0, earnedA: 0, earnedB: 0, survivor: false, dependents: [], ...o });
  const G = (sit, y) => t('gisAnnual', sit, y);
  const p1 = prof({ otherA: 19150, oasA: 9150 });
  const net0 = await t('taxFor', p1, 0, 0), net5 = await t('taxFor', p1, 0, 5000);
  const inc0 = await t('incomeTax', p1, 0, 0), inc5 = await t('incomeTax', p1, 0, 5000);
  // A 5,000 RRSP draw moves GIS income from 10,000 to 15,000: the loss is G(10,000) - G(15,000).
  const lost = (await G('single', 10000)) - (await G('single', 15000));
  // taxFor is income tax minus ALL benefits: GIS and, from Task 5, the groceries benefit (CGEB) too.
  const tot = (p, g, tr) => page.evaluate(({ p, g, tr }) => window.__test_tax.benefitsFor(p, g, tr), { p, g, tr });
  near(net5 - net0, inc5 - inc0 + (await tot(p1, 0, 0)) - (await tot(p1, 0, 5000)), 1e-6, 'taxFor = income tax minus benefits (single)');
  // Table 1 (ESDC): between 10,500 and 15,000 each extra dollar costs 50 cents; below 10,464 it costs 75 cents.
  near(lost, 0.75 * 464 + 0.6025 * 48 + 0.5 * 4488, 5, 'GIS lost on a 5,000 draw: slopes 0.75, then 0.60, then 0.50');
  let b = await page.evaluate((p) => { window.__test_tax.benefitsFor(p, 0, 0); return window.__test_tax.getBenefits(); }, p1);
  near(b.gis, await G('single', 10000), 1e-9, 'benefitsFor.gis single');
  near(b.total, b.gis + b.allowance + b.ccb + b.cgeb + b.provChild + b.provSenior + b.provCredit, 1e-9, 'total is the sum of the lines');

  // Couple, both 66 with OAS: table 2, each spouse gets the amount at combined income. Combined otherA+otherB =
  // 2 x (8,000 CPP + 9,150 OAS) = 34,300; GIS income = 34,300 - 18,300 = 16,000 -> 2 x G('spouseOas', 16000).
  const pc = prof({ otherA: 17150, otherB: 17150, oasA: 9150, oasB: 9150, ageA: 66, ageB: 66, singlePerson: false });
  b = await page.evaluate((p) => { window.__test_tax.benefitsFor(p, 0, 0); return window.__test_tax.getBenefits(); }, pc);
  near(b.gis, 2 * (await G('spouseOas', 16000)), 1e-9, 'couple, both on OAS: table 2 twice');
  // One pensioner, partner 62: table 4 splits the combined amount into a GIS part and an Allowance part.
  const pa = prof({ otherA: 9150, otherB: 0, oasA: 9150, ageA: 66, ageB: 62, singlePerson: false });
  b = await page.evaluate((p) => { window.__test_tax.benefitsFor(p, 0, 0); return window.__test_tax.getBenefits(); }, pa);
  near(b.gis, await G('couplePensioner', 0), 1e-9, 'pensioner with a 62-year-old spouse: table 4 GIS part at 0 income');
  near(b.allowance, await G('coupleAllowance', 0), 1e-9, 'the 62-year-old gets the Allowance part');
  // Review focus 1: a deferring pensioner gets nothing; the spouse is a spouse without OAS (table 3).
  const pd = prof({ otherA: 8000, otherB: 8000 + 9150, oasA: 0, oasB: 9150, ageA: 66, ageB: 66, singlePerson: false });
  b = await page.evaluate((p) => { window.__test_tax.benefitsFor(p, 0, 0); return window.__test_tax.getBenefits(); }, pd);
  near(b.gis, await G('spouseNoOas', 16000), 1e-9, 'one spouse deferring OAS: the other is a spouse without OAS (table 3)');
  // Review focus 2: survivor 61 gets the Allowance for the Survivor; a non-survivor single 61 gets nothing; survivor 65 gets single GIS.
  b = await page.evaluate((p) => { window.__test_tax.benefitsFor(p, 0, 0); return window.__test_tax.getBenefits(); }, prof({ ageA: 61, survivor: true, otherA: 5000 }));
  near(b.allowance, await G('survivorAllowance', 5000), 1e-9, 'survivor aged 61: table 5');
  b = await page.evaluate((p) => { window.__test_tax.benefitsFor(p, 0, 0); return window.__test_tax.getBenefits(); }, prof({ ageA: 61, survivor: false, otherA: 5000 }));
  near(b.allowance + b.gis, 0, 0, 'single aged 61, not a survivor: no Allowance and no GIS');
  b = await page.evaluate((p) => { window.__test_tax.benefitsFor(p, 0, 0); return window.__test_tax.getBenefits(); }, prof({ ageA: 65, survivor: true, otherA: 9150 + 5000, oasA: 9150 }));
  near(b.gis, await G('single', 5000), 1e-9, 'survivor aged 65: single GIS');
  // Review focus 3: zero income gives the maximum; an income far above gives exactly zero; a cliff at 42,768.
  b = await page.evaluate((p) => { window.__test_tax.benefitsFor(p, 0, 0); return window.__test_tax.getBenefits(); }, prof({ otherA: 9150, oasA: 9150 }));
  near(b.gis, 13666.8, 1e-9, 'maximum at zero GIS income');
  b = await page.evaluate((p) => { window.__test_tax.benefitsFor(p, 0, 0); return window.__test_tax.getBenefits(); }, prof({ otherA: 1e9, oasA: 9150 }));
  near(b.total, 0, 0, 'zero far above the cutoff');
  // Employment exemption on 20,000 of wages: min(20,000, 5,000) + 0.5 x min(15,000, 10,000) = 5,000 + 5,000 = 10,000.
  near(await t('gisEmploymentExemption', 20000), 10000, 1e-9, 'employment exemption on 20,000 of wages');
  near(await t('gisEmploymentExemption', 3000), 3000, 1e-9, 'employment exemption below 5,000');
  // Capital gains count at 50 percent: gains 10,000 add 5,000 of income.
  const bg = await page.evaluate((p) => { window.__test_tax.benefitsFor(p, 10000, 0); return window.__test_tax.getBenefits().gis; }, p1);
  near(bg, await G('single', 15000), 1e-9, 'capital gains enter GIS income at 50 percent');

  // Review focus 3: a withdrawal solve through the table-4 cliff still returns at least the net it was asked for.
  const solved = await page.evaluate(() => {
    const T = window.__test_tax;
    // One pensioner aged 66 (OAS 9,150 inside otherA) with a 62-year-old spouse: table 4 applies (GIS part cliff at 42,768).
    const p = { otherA: 40000, otherB: 0, dtcA: 0, dtcB: 0, penA: 0, penB: 0, ageA: 66, ageB: 62, singlePerson: false, year: 0, oasA: 9150, oasB: 0, earnedA: 0, earnedB: 0, survivor: false, dependents: [] };
    const out = [];
    for (const need of [1000, 3000, 5000, 8000]) {
      const r = T.drawTaxable(1e6, 5e5, need, p, 0, 0); // pool, basis, need, profile, priorGains, priorTraditionalExtra
      out.push({ need, net: r.net });
    }
    return out;
  });
  for (const s of solved) assert(s.net >= s.need - 1e-3, `drawTaxable nets ${s.net} for a need of ${s.need} across the GIS cliff`);

  // Income room under the GIS cutoff (the hook Batch 4A reads): single pensioner with GIS income 10,000 has room up to
  // the table-1 zero point of 23,112, so 13,112 more income before GIS ends. No GIS situation: room 0.
  const room = await page.evaluate((p) => window.__test_tax.gisIncomeRoom(p, 0, 0), p1);
  near(room, 23112 - 10000, 0.01, 'GIS income room, single pensioner');
  near(await page.evaluate((p) => window.__test_tax.gisIncomeRoom(p, 0, 0), prof({ otherA: 30000, ageA: 50 })), 0, 0, 'no GIS situation, no room');

  // --- CGEB, Income Tax Act 122.5(3.005) as enacted by Bill C-19 (year index 0, factor 1) ---
  const kid = (age) => ({ age, student: false, qualifyingChild: age <= 18 });
  const ben = (p, g = 0, tr = 0) => page.evaluate(({ p, g, tr }) => { window.__test_tax.benefitsFor(p, g, tr); return window.__test_tax.getBenefits(); }, { p, g, tr });
  // Couple, 2 children, family income 60,000: A = 445 + 445 + 2 x 234 = 1,358; B = 5% x (60,000 - 46,432) = 678.40.
  let c = await ben(prof({ otherA: 30000, otherB: 30000, ageA: 40, ageB: 40, singlePerson: false, dependents: [kid(5), kid(10)] }));
  near(c.cgeb, 1358 - 678.4, 1e-6, 'CGEB couple 2 children at 60,000');
  // Single, no children, income 20,000: A = 445 + min(234, 2% x (20,000 - 11,564) = 168.72) = 613.72; B = 0.
  c = await ben(prof({ otherA: 20000, ageA: 40 }));
  near(c.cgeb, 613.72, 1e-6, 'CGEB single at 20,000 (supplement 168.72)');
  // Single, income 60,000: A = 445 + 234 = 679; B = 678.40 -> 0.60.
  c = await ben(prof({ otherA: 60000, ageA: 40 }));
  near(c.cgeb, 0.6, 1e-6, 'CGEB single at 60,000');
  // Single parent, 1 child, income 30,000: A = 445 (adult) + 445 (eligible dependant) + 234 (single parent) = 1,124; B = 0.
  c = await ben(prof({ otherA: 30000, ageA: 40, dependents: [kid(8)] }));
  near(c.cgeb, 1124, 1e-6, 'CGEB single parent, 1 child');
  // Review focus 4: a child of 19 does not count; 18 does (under 19); a single parent of one 19-year-old is a single person.
  c = await ben(prof({ otherA: 30000, ageA: 40, dependents: [kid(19)] }));
  near(c.cgeb, 445 + Math.min(234, 0.02 * (30000 - 11564)), 1e-6, 'CGEB: a 19-year-old child is not counted');
  c = await ben(prof({ otherA: 30000, ageA: 40, dependents: [kid(18)] }));
  near(c.cgeb, 1124, 1e-6, 'CGEB: an 18-year-old child is counted');
  // Indexation: at year index 10 the amounts and thresholds scale together (factor f): cgeb(income * f, f) = f * cgeb(income, 1).
  const f10 = await page.evaluate(() => window.__test_tax.taxIndexFactor(10));
  const cA = await ben(prof({ otherA: 30000, ageA: 40, dependents: [kid(8)] }));
  const cB = await ben(prof({ otherA: 30000 * f10, ageA: 40, dependents: [kid(8)], year: 10 }));
  near(cB.cgeb, cA.cgeb * f10, 1e-6, 'CGEB scales with the inflation factor');

  // --- CCB, CRA July 2026 to June 2027 ---
  // 1 child aged 4, family income 60,000: 8,157 - 7% x (60,000 - 38,237) = 8,157 - 1,523.41 = 6,633.59.
  c = await ben(prof({ otherA: 60000, ageA: 40, dependents: [kid(4)] }));
  near(c.ccb, 8157 - 0.07 * (60000 - 38237), 1e-6, 'CCB one child under 6');
  // 2 children (4 and 10), family income 100,000: 8,157 + 6,883 = 15,040; reduction 6,022 + 5.7% x (100,000 - 82,847) = 6,999.72.
  c = await ben(prof({ otherA: 50000, otherB: 50000, ageA: 40, ageB: 40, singlePerson: false, dependents: [kid(4), kid(10)] }));
  near(c.ccb, 15040 - (6022 + 0.057 * (100000 - 82847)), 1e-6, 'CCB two children at 100,000');
  // Under 18 only: a 17-year-old gets the 6 to 17 amount, an 18-year-old gets nothing; four or more use the last column.
  c = await ben(prof({ otherA: 20000, ageA: 40, dependents: [kid(17), kid(18)] }));
  near(c.ccb, 6883, 1e-6, 'CCB counts only the 17-year-old');
  c = await ben(prof({ otherA: 20000, ageA: 40, dependents: [kid(1), kid(2), kid(3), kid(4), kid(5)] }));
  near(c.ccb, 5 * 8157, 1e-6, 'CCB five children under 6 at low income');
  c = await ben(prof({ otherA: 90000, ageA: 40, dependents: [kid(1), kid(2), kid(3), kid(4), kid(5)] }));
  near(c.ccb, 5 * 8157 - (10260 + 0.095 * (90000 - 82847)), 1e-6, 'CCB five children uses the four-or-more column');
  // No children: nothing.
  near((await ben(prof({ otherA: 20000, ageA: 40 }))).ccb, 0, 0, 'no children, no CCB');

  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  console.log('benefits tests ok');
})();

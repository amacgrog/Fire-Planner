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

  // Review focus 3: a withdrawal solve right where table 4 ends (GIS income 42,500; table 4 ends at 42,768 because the
  // younger spouse's Allowance reaches 0 and the pensioner continues on table 3, so there is no cliff) still returns at
  // least the net it was asked for.
  const solved = await page.evaluate(() => {
    const T = window.__test_tax;
    // One pensioner aged 66 (OAS 9,150 inside otherA) with a 62-year-old spouse: table 4 applies (GIS part cliff at 42,768).
    const p = { otherA: 9150 + 42500, otherB: 0, dtcA: 0, dtcB: 0, penA: 0, penB: 0, ageA: 66, ageB: 62, singlePerson: false, year: 0, oasA: 9150, oasB: 0, earnedA: 0, earnedB: 0, survivor: false, dependents: [] };
    const out = [];
    for (const need of [500, 1000, 3000, 8000]) {
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

  // --- Provincial rows. Province is read from state; set it for each case. ---
  const withProv = (code, p, g = 0, tr = 0) => page.evaluate(({ code, p, g, tr }) => {
    const s = window.__test_getState();
    const saved = s.province;
    s.province = code;
    window.__test_tax.benefitsFor(p, g, tr);
    const out = window.__test_tax.getBenefits();
    s.province = saved;
    return out;
  }, { code, p, g, tr });
  // Ontario Sales Tax Credit (CRA Ontario page): couple, 2 children, family income 50,000: max = 378 x (2 adults + 2 children)
  // = 1,512; reduction 4% x (50,000 - 36,309) = 547.64 -> 964.36. Children under 19.
  let o = await withProv('on', prof({ otherA: 25000, otherB: 25000, ageA: 40, ageB: 40, singlePerson: false, dependents: [kid(5), kid(10)] }));
  near(o.provCredit, 1512 - 0.04 * (50000 - 36309), 1e-6, 'OSTC couple with 2 children');
  // Single, no children, 40,000: 378 - 4% x (40,000 - 29,047) = 378 - 438.12 -> 0.
  o = await withProv('on', prof({ otherA: 40000, ageA: 40 }));
  near(o.provCredit, 0, 0, 'OSTC single above its threshold');
  // Ontario Child Benefit: 1,759.92 per child under 18; family 40,000, 2 children: 3,519.84 - 8% x (40,000 - 26,865) = 2,468.96.
  o = await withProv('on', prof({ otherA: 20000, otherB: 20000, ageA: 40, ageB: 40, singlePerson: false, dependents: [kid(5), kid(10)] }));
  near(o.provChild, 3519.84 - 0.08 * (40000 - 26865), 1e-6, 'OCB two children');
  // Provinces do not leak: the same household in Manitoba gets neither Ontario program.
  o = await withProv('mb', prof({ otherA: 20000, otherB: 20000, ageA: 40, ageB: 40, singlePerson: false, dependents: [kid(5), kid(10)] }));
  near(o.provChild + o.provCredit + o.provSenior, 0, 0, 'no Ontario benefits outside Ontario');

  // BC Family Benefit (CRA BC page): 1 child, family income 50,000: max 1,749.96; reduction 4% x (50,000 - 30,176) = 792.96
  // -> 957.00, above the floor 774.96.
  o = await withProv('bc', prof({ otherA: 25000, otherB: 25000, ageA: 40, ageB: 40, singlePerson: false, dependents: [kid(5)] }));
  near(o.provChild, 1749.96 - 0.04 * (50000 - 30176), 1e-6, 'BCFB one child at 50,000');
  // At 80,000 the floor binds: 1,749.96 - 0.04 x 49,824 = -243.00 -> floor 774.96.
  o = await withProv('bc', prof({ otherA: 40000, otherB: 40000, ageA: 40, ageB: 40, singlePerson: false, dependents: [kid(5)] }));
  near(o.provChild, 774.96, 1e-6, 'BCFB floor between 30,176 and 96,562');
  // Above 96,562 the floor itself falls 4%: at 106,562: 774.96 - 0.04 x 10,000 = 374.96.
  o = await withProv('bc', prof({ otherA: 53281, otherB: 53281, ageA: 40, ageB: 40, singlePerson: false, dependents: [kid(5)] }));
  near(o.provChild, 774.96 - 0.04 * (106562 - 96562), 1e-6, 'BCFB above 96,562');
  // Single parent adds 499.92 to the first child: 1 child, income 30,000 (below the threshold): 1,749.96 + 499.92.
  o = await withProv('bc', prof({ otherA: 30000, ageA: 40, dependents: [kid(5)] }));
  near(o.provChild, 1749.96 + 499.92, 1e-6, 'BCFB single parent first child');

  // Alberta Child and Family Benefit (Alberta page): 2 children, family income 40,000 all wages:
  // base 2,293 - 12.07% x (40,000 - 28,116) = 858.59; working min(1,494, 15% x (40,000 - 2,760)) = 1,494 -> 2,352.59.
  o = await withProv('ab', prof({ otherA: 20000, otherB: 20000, earnedA: 20000, earnedB: 20000, ageA: 40, ageB: 40, singlePerson: false, dependents: [kid(5), kid(10)] }));
  near(o.provChild, 2293 - 0.1207 * (40000 - 28116) + 1494, 1e-6, 'ACFB two children at 40,000');
  // Working component phases in at 15 percent: earned 5,000, income 5,000, one child: base 1,529, working 15% x 2,240 = 336.
  o = await withProv('ab', prof({ otherA: 5000, earnedA: 5000, ageA: 40, dependents: [kid(5)] }));
  near(o.provChild, 1529 + 0.15 * (5000 - 2760), 1e-6, 'ACFB working phase-in');

  // Alberta Seniors Benefit (Alberta page): couple both 66 with OAS, income 48,000 (OAS 18,300 inside); income used
  // = 48,000 - 18,300 = 29,700; benefit = 5,918 - 17.17% x 29,700 = 818.51. GIS is zero at this income.
  o = await withProv('ab', prof({ otherA: 24000, otherB: 24000, oasA: 9150, oasB: 9150, ageA: 66, ageB: 66, singlePerson: false }));
  near(o.provSenior, 5918 - 0.1717 * (48000 - 18300), 1e-6, 'Alberta Seniors Benefit couple');
  // Requires OAS in payment: a 66-year-old deferring OAS to 70 gets nothing.
  o = await withProv('ab', prof({ otherA: 20000, oasA: 0, ageA: 66 }));
  near(o.provSenior, 0, 0, 'no Alberta Seniors Benefit while OAS is deferred');
  // Single 70, income 20,000 (OAS 9,150): 3,946 - 17.14% x 10,850 = 2,086.11.
  o = await withProv('ab', prof({ otherA: 20000, oasA: 9150, ageA: 70 }));
  near(o.provSenior, 3946 - 0.1714 * (20000 - 9150), 1e-6, 'Alberta Seniors Benefit single');

  // Quebec Family Allowance (Finance Quebec Table 3, 2026): per child 3,068 down to 1,221; a single-parent family also gets
  // 1,077 down to 430 once. Reduction starts at 60,398 (couple) or 44,032 (single parent) and ends at 107,000 (secondary).
  // Two parents, 1 child, family income 83,699 = midway between 60,398 and 107,000: 3,068 - (3,068 - 1,221) x 0.5 = 2,144.50.
  o = await withProv('qc', prof({ otherA: 41849.5, otherB: 41849.5, ageA: 40, ageB: 40, singlePerson: false, dependents: [kid(5)] }));
  near(o.provChild, 3068 - (3068 - 1221) * 0.5, 1e-6, 'Quebec family allowance two parents midway');
  // Single parent, 2 children, income 40,000 (at or under 44,032): 2 x 3,068 + 1,077 = 7,213.
  o = await withProv('qc', prof({ otherA: 40000, ageA: 40, dependents: [kid(5), kid(8)] }));
  near(o.provChild, 2 * 3068 + 1077, 1e-6, 'Quebec family allowance single parent maximum');
  // At or above 107,000: 2 x 1,221 + 430 = 2,872.
  o = await withProv('qc', prof({ otherA: 120000, ageA: 40, dependents: [kid(5), kid(8)] }));
  near(o.provChild, 2 * 1221 + 430, 1e-6, 'Quebec family allowance single parent minimum');
  // Children over 17 are not counted.
  o = await withProv('qc', prof({ otherA: 40000, ageA: 40, dependents: [kid(18)] }));
  near(o.provChild, 0, 0, 'Quebec: an 18-year-old gets no family allowance');

  // --- Ontario Energy and Property Tax Credit (CRA 2026 sheets) and senior homeowners grant ---
  // (a) Couple, both under 64, renting 18,000, family income 50,000, no children.
  //     Occupancy 0.20 x 18,000 = 3,600; energy min(3,600, 290) = 290; property tax component min(10% x 3,600 = 360, 944) + 73
  //     = 433, capped at 3,600 -> 433; credit 723 (the CRA example: a 1,500 a month renter gets 723) less 2% x (50,000 - 36,309)
  //     = 273.82 -> 449.18. Sales tax credit: 2 adults 756 less 4% x 13,691 = 547.64 -> 208.36. provCredit = 657.54.
  o = await withProv('on', prof({ otherA: 25000, otherB: 25000, ageA: 40, ageB: 40, singlePerson: false, rentPaid: 18000 }));
  near(o.provCredit, 723 - 0.02 * (50000 - 36309) + (756 - 0.04 * (50000 - 36309)), 1e-6, 'OEPTC and OSTC, couple renting');
  near(o.provSenior, 0, 0, 'no grant for a renter');
  // (b) Single, 40, owner paying 3,000 property tax, income 20,000: occupancy 3,000; energy 290; property tax min(300, 944) + 73
  //     = 373 -> credit 663 (income under 29,047, no reduction); OSTC 378 (income under 29,047). provCredit 1,041.
  o = await withProv('on', prof({ otherA: 20000, ageA: 40, propertyTaxPaid: 3000 }));
  near(o.provCredit, 663 + 378, 1e-6, 'OEPTC and OSTC, single owner');
  // (c) Single senior 70, owner paying 500 property tax, family income 30,000 (senior figures: 581 cap, 617 add-on, 36,309).
  //     Occupancy 500; energy min(500, 290) = 290; property tax min(min(50, 581) + 617 = 667, 500) = 500; step 4 = 790.
  //     Grant: income 30,000 under 35,000 -> 500. Step 5: A = 500 + 790 = 1,290; B = 1,290 - 290 = 1,000; C = 1,000 - 500 = 500;
  //     OEPTC = 790 - 500 = 290. OSTC: 378 - 4% x (30,000 - 29,047) = 339.88. provCredit = 629.88, provSenior (grant) = 500.
  o = await withProv('on', prof({ otherA: 30000, ageA: 70, propertyTaxPaid: 500 }));
  near(o.provCredit, 290 + (378 - 0.04 * (30000 - 29047)), 1e-6, 'OEPTC with the grant interaction, OSTC');
  near(o.provSenior, 500, 1e-9, 'grant 500 at income 30,000');
  // (d) Senior couple (66 and 66), renting 12,000, family income 50,000: occupancy 2,400; energy 290; property tax
  //     min(240, 581) + 617 = 857 -> 857; 1,147 less 2% x (50,000 - 43,571) = 128.58 -> 1,018.42. OSTC 208.36.
  o = await withProv('on', prof({ otherA: 25000, otherB: 25000, ageA: 66, ageB: 66, singlePerson: false, rentPaid: 12000 }));
  near(o.provCredit, 1147 - 0.02 * (50000 - 43571) + (756 - 0.04 * (50000 - 36309)), 1e-6, 'OEPTC senior couple renting');
  // (e) The grant: single at 42,500 gets 500 - 3.33% x 7,500 = 250.25; a couple at 60,000 or more gets nothing; a tenant never does.
  o = await withProv('on', prof({ otherA: 42500, ageA: 70, propertyTaxPaid: 4000 }));
  near(o.provSenior, 500 - 0.0333 * 7500, 1e-6, 'grant single at 42,500');
  o = await withProv('on', prof({ otherA: 30000, otherB: 30000, ageA: 70, ageB: 70, singlePerson: false, propertyTaxPaid: 4000 }));
  near(o.provSenior, 0, 1e-9, 'grant couple at 60,000');
  // (f) No rent and no property tax: no energy and property tax credit (the sales tax credit still applies).
  o = await withProv('on', prof({ otherA: 20000, ageA: 40 }));
  near(o.provCredit, 378, 1e-9, 'only the sales tax credit without housing costs');
  // (g) A single parent of a child under 18 uses the sole-care threshold 36,309 (not 29,047): income 33,000, rent 12,000.
  //     Occupancy 2,400; energy 290; property tax min(240, 944) + 73 = 313; credit 603 less 2% x 0 = 603 (33,000 < 36,309);
  //     with the 29,047 threshold it would be reduced by 79.06.
  o = await withProv('on', prof({ otherA: 33000, ageA: 40, rentPaid: 12000, dependents: [kid(5)] }));
  near(o.provCredit - (378 * 2 - 0.04 * Math.max(0, 33000 - 36309)), 603, 1e-6, 'OEPTC single parent uses the sole-care threshold');

  // Plumbing: housingForYear reports the rent and the property tax paid (annual, nominal).
  const hy = await page.evaluate(() => {
    const s = window.__test_getState();
    const saved = { tenure: s.tenure, rent: s.rent, rentGrowth: s.rentGrowth, propertyTax: s.propertyTax, propertyTaxGrowth: s.propertyTaxGrowth };
    const sched = { payments: [0, 0], balances: [0, 0] },
      fb = { buyYear: 99 };
    s.tenure = 'rent'; s.rent = 2000; s.rentGrowth = 0; s.propertyTax = 4800; s.propertyTaxGrowth = 0;
    const renter = window.__test_tax.housingForYear(1, 1, sched, fb);
    s.tenure = 'own';
    const owner = window.__test_tax.housingForYear(1, 1, sched, fb);
    Object.assign(s, saved);
    return { renter, owner };
  });
  near(hy.renter.rentPaid, 24000, 1e-9, 'renter pays 2,000 x 12');
  near(hy.renter.propertyTaxPaid, 0, 0, 'renter pays no property tax');
  near(hy.owner.propertyTaxPaid, 4800, 1e-9, 'owner pays the property tax');
  near(hy.owner.rentPaid, 0, 0, 'owner pays no rent');

  // --- Quebec solidarity credit and work premium (Finance Quebec Tables 3 and 4, July 2026 to June 2027) ---
  // Single living alone, family income 30,000: QST 363 + 172 + housing 746 = 1,281; under 43,195, no reduction.
  o = await withProv('qc', prof({ otherA: 30000, ageA: 40 }));
  near(o.provCredit, 1281, 1e-6, 'solidarity credit, single living alone');
  // Same, income 50,000: 1,281 - 6% x (50,000 - 43,195) = 872.70.
  o = await withProv('qc', prof({ otherA: 50000, ageA: 40 }));
  near(o.provCredit, 1281 - 0.06 * (50000 - 43195), 1e-6, 'solidarity credit reduced');
  // Couple with 2 children, income 60,000: 363 + 363 + 906 + 2 x 158 = 1,948; less 6% x 16,805 = 1,008.30 -> 939.70.
  o = await withProv('qc', prof({ otherA: 30000, otherB: 30000, ageA: 40, ageB: 40, singlePerson: false, dependents: [kid(5), kid(10)] }));
  near(o.provCredit, 1948 - 0.06 * (60000 - 43195), 1e-6, 'solidarity credit, couple with two children');
  // Work premium, person living alone, work income 8,000 (family 8,000): 11.6% x (8,000 - 2,400) = 649.60, plus the solidarity credit 1,281.
  o = await withProv('qc', prof({ otherA: 8000, earnedA: 8000, ageA: 40 }));
  near(o.provCredit, 1281 + 0.116 * (8000 - 2400), 1e-6, 'work premium phase-in, living alone');
  // Work income 15,000: 11.6% x (12,808 - 2,400) = 1,207.33 (the 2026 maximum) less 10% x (15,000 - 12,808) = 219.20 -> 988.13.
  o = await withProv('qc', prof({ otherA: 15000, earnedA: 15000, ageA: 40 }));
  near(o.provCredit, 1281 + 0.116 * (12808 - 2400) - 0.1 * (15000 - 12808), 1e-6, 'work premium reduction, living alone');
  near(0.116 * (12808 - 2400), 1207.33, 0.005, 'the phase-in rate reproduces the published 2026 maximum');
  // Couple with children, combined work income 30,000: 25% x (19,828 - 3,600) = 4,057.00 less 10% x (30,000 - 19,828) = 1,017.20 -> 3,039.80; + 1,948.
  o = await withProv('qc', prof({ otherA: 15000, otherB: 15000, earnedA: 15000, earnedB: 15000, ageA: 40, ageB: 40, singlePerson: false, dependents: [kid(5), kid(10)] }));
  near(o.provCredit, 1948 + 0.25 * (19828 - 3600) - 0.1 * (30000 - 19828), 1e-6, 'work premium, couple with children');
  // Work income at or below the exclusion: nothing. Single parent maximum 3,122.40 reached at the threshold 12,808, nil at 44,032.
  o = await withProv('qc', prof({ otherA: 2400, earnedA: 2400, ageA: 40 }));
  near(o.provCredit, 1281, 1e-6, 'no work premium at the exclusion');
  o = await withProv('qc', prof({ otherA: 44032, earnedA: 44032, ageA: 40, dependents: [kid(5)] }));
  near(o.provCredit - (363 + 172 + 746 + 158 - 0.06 * (44032 - 43195)), 0, 1e-6, 'single parent work premium is nil at 44,032');

  // --- Early exit: with no children, family income above 125,000 (indexed) can receive nothing; just below, the largest
  // case (a senior couple owning a home with a large property tax: OEPTC 290 + 581 + 617 = 1,488 less 2% over 43,571, nil at
  // 117,971) still receives something. Pins the threshold used to skip the evaluators on the hot path.
  for (const prov of ['on', 'bc', 'ab', 'qc']) {
    o = await withProv(prov, prof({ otherA: 62500.5, otherB: 62500.5, ageA: 70, ageB: 70, singlePerson: false, oasA: 9150, oasB: 9150, propertyTaxPaid: 9000 }));
    near(o.total, 0, 0, prov + ': nothing at family income 125,001 with no children');
  }
  o = await withProv('on', prof({ otherA: 58500, otherB: 58500, ageA: 70, ageB: 70, singlePerson: false, propertyTaxPaid: 9000 }));
  assert(o.provCredit > 0, 'a large-property-tax senior couple still gets the Ontario credit at family income 117,000');
  // With children the exit does not apply: the Canada Child Benefit reaches high incomes (one child under 6 to about 196,000).
  o = await withProv('on', prof({ otherA: 80000, otherB: 80000, ageA: 40, ageB: 40, singlePerson: false, dependents: [kid(3)] }));
  assert(o.ccb > 0, 'the child benefit is still paid at family income 160,000');

  // --- Review fixes ---
  // C1: table 4 ends at 42,768 only because the younger spouse's Allowance reaches 0. The pensioner then continues on
  // table 3 (ESDC table 3, band 42,720 to 42,768: 263.49 a month; next band 262.49), so the GIS is continuous.
  const pc4 = (inc) => prof({ otherA: 9150 + inc, otherB: 0, oasA: 9150, ageA: 66, ageB: 62, singlePerson: false });
  const lo4 = await ben(pc4(42700)), hi4 = await ben(pc4(42800));
  near(hi4.gis, await G('spouseNoOas', 42800), 1e-9, 'past the Allowance cutoff the pensioner is on table 3');
  near(hi4.allowance, 0, 0, 'no Allowance past its cutoff');
  // The two points are 100 of income apart (about 25 a year of ordinary slope); the old cliff was about 3,150.
  assert(Math.abs(lo4.gis + lo4.allowance - hi4.gis) < 60, 'GIS plus Allowance is continuous across 42,768 (' + (lo4.gis + lo4.allowance) + ' vs ' + hi4.gis + ')');
  // I1: OAS is not inherited. A survivor under 65 gets none; at 65 or older the greater-of rule is kept.
  const sv = (over) => page.evaluate((over) => {
    const s = window.__test_getState();
    const saved = { oasMonthlyA: s.oasMonthlyA, oasMonthlyB: s.oasMonthlyB, oasStartAgeA: s.oasStartAgeA, oasStartAgeB: s.oasStartAgeB };
    Object.assign(s, { oasMonthlyA: 762.5, oasMonthlyB: 762.5, oasStartAgeA: 65, oasStartAgeB: 65 });
    const r = window.__test_tax.cppAndOasIncome({ age: over.age, ageB: over.ageB, singlePerson: false, factor: 1, isSurvivorPeriod: true, deceasedIsA: over.deceasedIsA });
    Object.assign(s, saved);
    return r;
  }, over);
  r = await sv({ age: 71, ageB: 62, deceasedIsA: true });
  near(r.oasGrossA + r.oasGrossB, 0, 0, 'a survivor aged 62 gets no OAS (A, 71, died)');
  r = await sv({ age: 62, ageB: 71, deceasedIsA: false });
  near(r.oasGrossA + r.oasGrossB, 0, 0, 'a survivor aged 62 gets no OAS (B, 71, died)');
  r = await sv({ age: 71, ageB: 66, deceasedIsA: true });
  near(r.oasGrossB, 9150, 1e-9, 'a survivor aged 66 keeps the greater-of OAS');
  near(r.oasGrossA, 0, 0, 'the deceased receives nothing');
  // I2: the Allowance for the Survivor in the engine. A (70) dies at 71; B (62) is the survivor from age 63: no OAS, the
  // Allowance for the Survivor instead (ESDC table 5), and the pension income is the survivor's CPP only.
  const sr = await page.evaluate(() => {
    const s = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(s));
    Object.assign(s, { singlePerson: false, ageA: 70, ageB: 62, retireAgeA: 70, retireAgeB: 62, lifeExpectancyA: 95, lifeExpectancyB: 95, incomeA: 0, incomeB: 0, pensionCoverage: 'none', inflation: 0, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 71, cppMonthlyA: 500, cppMonthlyB: 500, cppStartAgeA: 65, cppStartAgeB: 65, oasMonthlyA: 762.5, oasMonthlyB: 762.5, taxable: 0, traditional: 0, roth: 150000, cash: 50000, spending: 20000, healthcare: 0, dividendYield: 0, tenure: 'rent', rent: 0 });
    const rows = window.__test_simulate().rows;
    const row = rows.find((x) => x.ageB === 63);
    Object.keys(saved).forEach((k) => { s[k] = saved[k]; });
    return { ss: row.ss, allowance: row.benefitAllowance, gis: row.benefitGis };
  });
  near(sr.ss, 6000, 1e-6, 'survivor aged 63: CPP only (500 x 12), no inherited OAS');
  assert(sr.allowance > 0 && sr.allowance < 20714.16, 'survivor aged 63 receives the Allowance for the Survivor, within the table-5 maximum (got ' + sr.allowance + ')');
  near(sr.gis, 0, 0, 'a survivor under 65 receives no GIS');

  // --- 7M: rent and property-tax programs of NB, NS and MB. housing() isolates one program from the other programs of the
  // province (credits, child benefits) by differencing the same household with and without the housing input.
  const housing = async (code, p, field, amount, line) => {
    const a = await withProv(code, { ...p, [field]: amount }),
      z = await withProv(code, { ...p, [field]: 0 });
    return a[line] - z[line];
  };
  // New Brunswick Residential Property Tax Allowance (gnb.ca property tax allowance page): income below 22,001: 300;
  // below 25,001: 200; below 30,001: 100; never more than the property tax; nothing at 30,001 or more.
  const nb = (inc, pt, extra = {}) => housing('nb', prof({ otherA: inc, ageA: 50, ...extra }), 'propertyTaxPaid', pt, 'provCredit');
  near(await nb(20000, 3000), 300, 1e-9, 'NB allowance, income 20,000');
  near(await nb(22000, 3000), 300, 1e-9, 'NB allowance, income 22,000 (the 300 tier runs to 22,001)');
  near(await nb(22001, 3000), 200, 1e-9, 'NB allowance, income 22,001');
  near(await nb(25000, 3000), 200, 1e-9, 'NB allowance, income 25,000');
  near(await nb(25001, 3000), 100, 1e-9, 'NB allowance, income 25,001');
  near(await nb(30000, 3000), 100, 1e-9, 'NB allowance, income 30,000');
  near(await nb(30001, 3000), 0, 0, 'NB allowance, income 30,001');
  // Capped at the property tax paid: a 150 bill returns 150, not 300.
  near(await nb(10000, 150), 150, 1e-9, 'NB allowance never exceeds the property tax paid');
  // Renters pay no property tax: nothing.
  near(await nb(10000, 0), 0, 0, 'NB renter gets no property tax allowance');
  // A couple counts combined income: 12,000 + 12,000 = 24,000 -> the 200 tier.
  near(
    await housing('nb', prof({ otherA: 12000, otherB: 12000, ageA: 50, ageB: 50, singlePerson: false }), 'propertyTaxPaid', 3000, 'provCredit'),
    200, 1e-9, 'NB allowance, couple on combined income',
  );
  // Provinces do not leak: the same household in Ontario gets no 300 step from the NB row.
  assert(Math.abs((await housing('on', prof({ otherA: 20000, ageA: 50 }), 'propertyTaxPaid', 3000, 'provCredit')) - 300) > 1, 'the NB allowance does not apply in Ontario');

  // Nova Scotia Property Tax Rebate for Seniors (Senior Citizens Property Tax Rebate Regulations s. 3(b), 3(ba), 7): the
  // greater of 15 and half of the property tax, to a maximum of 800, for someone receiving GIS or an Allowance. Single 70,
  // OAS 9,150, other income 5,000 -> GIS income 5,000 (single table, positive).
  const ns = (inc, pt, extra = {}) => housing('ns', prof({ otherA: inc, oasA: 9150, ageA: 70, ...extra }), 'propertyTaxPaid', pt, 'provSenior');
  near(await ns(9150 + 5000, 3000), 800, 1e-9, 'NS rebate: 0.5 x 3,000 = 1,500, capped at 800');
  near(await ns(9150 + 5000, 1200), 600, 1e-9, 'NS rebate: half of 1,200');
  near(await ns(9150 + 5000, 0), 0, 0, 'NS renter: no rebate');
  // Regulation s. 7: the greater of 15 and 50 percent of the tax: a 20 dollar bill gives 15.
  near(await ns(9150 + 5000, 20), 15, 1e-9, 'NS rebate: the 15 dollar floor');
  // Income so high that GIS is 0 (single table ends at 23,112 of GIS income): no rebate.
  near(await ns(9150 + 30000, 3000), 0, 0, 'NS rebate needs GIS: none at GIS income 30,000');
  // Just under the cutoff GIS is still positive (single table: 5.88 at 23,088): the rebate is paid.
  near(await ns(9150 + 23088, 3000), 800, 1e-9, 'NS rebate while the GIS is still positive');
  // Not a pensioner (age 50): no GIS, no rebate.
  near(await housing('ns', prof({ otherA: 5000, ageA: 50 }), 'propertyTaxPaid', 3000, 'provSenior'), 0, 0, 'NS rebate: no GIS at 50');
  // Allowance only: a survivor aged 61 with income 5,000 gets the Allowance for the Survivor (table 5): s. 3(b) counts it.
  near(await housing('ns', prof({ otherA: 5000, ageA: 61, survivor: true }), 'propertyTaxPaid', 3000, 'provSenior'), 800, 1e-9, 'NS rebate: Allowance for the Survivor counts');
  // Couple, A 66 with OAS and B 62 (Allowance, table 4): eligible; one household rebate, 0.5 x 1,000 = 500.
  near(
    await housing('ns', prof({ otherA: 9150 + 3000, otherB: 0, oasA: 9150, ageA: 66, ageB: 62, singlePerson: false }), 'propertyTaxPaid', 1000, 'provSenior'),
    500, 1e-9, 'NS rebate: couple, one pensioner, one household rebate',
  );

  // Manitoba Homeowners Affordability Tax Credit (2025 Form MB479, page 2, lines 22 to 28): the lesser of the base amount
  // (1,500) and school taxes; the planner proxies school taxes by the property tax paid. No income test.
  const mbc = (inc, pt, extra = {}) => housing('mb', prof({ otherA: inc, ageA: 50, ...extra }), 'propertyTaxPaid', pt, 'provCredit');
  near(await mbc(50000, 3000), 1500, 1e-9, 'MB homeowners credit: capped at 1,500');
  near(await mbc(50000, 1000), 1000, 1e-9, 'MB homeowners credit: the property tax when smaller');
  near(await mbc(100000, 3000), 1500, 1e-9, 'MB homeowners credit has no income test');
  near(await mbc(300000, 3000), 1500, 1e-9, 'MB homeowners credit is paid above the 125,000 early-exit income');
  near(await mbc(50000, 0), 0, 0, 'MB renter: no homeowners credit');
  // Seniors School Tax Rebate (2025 Form MB479, page 4, lines 42 to 52): age 65 or older, school taxes less the homeowners
  // credit (maximum 235), less 1.0 percent of family income over 40,000; family income under 63,500. Single 70 at 50,000: 235 - 0.01 x 10,000 = 135.
  const mbs = (inc, pt, extra = {}) => housing('mb', prof({ otherA: inc, ageA: 70, ...extra }), 'propertyTaxPaid', pt, 'provSenior');
  near(await mbs(50000, 3000), 135, 1e-9, 'MB seniors rebate at 50,000');
  near(await mbs(40000, 3000), 235, 1e-9, 'MB seniors rebate: maximum at 40,000');
  near(await mbs(30000, 3000), 235, 1e-9, 'MB seniors rebate: maximum below 40,000');
  near(await mbs(63500, 3000), 0, 1e-9, 'MB seniors rebate: nil at 63,500');
  near(await mbs(80000, 3000), 0, 0, 'MB seniors rebate: nil above 63,500');
  near(await mbs(50000, 0), 0, 0, 'MB seniors rebate: a renter gets none');
  near(await housing('mb', prof({ otherA: 50000, ageA: 64 }), 'propertyTaxPaid', 3000, 'provSenior'), 0, 0, 'MB seniors rebate: not at 64');
  // The page says the rebate is based on school taxes less the credit received: with the whole property tax as the proxy,
  // the rebate cannot exceed what is left after the homeowners credit. Tax 1,000: credit 1,000, nothing left -> 0.
  // Tax 1,700: credit 1,500, 200 left -> 200 (below 235). Tax 1,735: 235 left -> the full 235.
  near(await mbs(20000, 1000), 0, 1e-9, 'MB seniors rebate: nothing left after the homeowners credit on a 1,000 bill');
  near(await mbs(20000, 1700), 200, 1e-9, 'MB seniors rebate: limited to the 200 left on a 1,700 bill');
  near(await mbs(20000, 1735), 235, 1e-9, 'MB seniors rebate: the full 235 on a 1,735 bill');
  // Credit plus rebate never exceed the tax paid.
  {
    const o2 = await withProv('mb', prof({ otherA: 20000, ageA: 70, propertyTaxPaid: 1000 }));
    assert(o2.provCredit + o2.provSenior <= 1000 + 1e-9, 'MB credit plus rebate must not exceed the property tax paid');
  }
  // Couple, B is 65: the household qualifies; combined income 50,000 -> 135.
  near(
    await housing('mb', prof({ otherA: 25000, otherB: 25000, ageA: 60, ageB: 65, singlePerson: false }), 'propertyTaxPaid', 3000, 'provSenior'),
    135, 1e-9, 'MB seniors rebate: couple with one 65-year-old',
  );

  // Manitoba Renters Affordability Tax Credit (2025 Form MB479, page 3, lines 29 to 40): 575 a year (47.91 a month) to a
  // renter, no income test; a household with a person 65 or older gets 903.57 less 0.8214 percent of family income (the
  // reduction capped at 328.57), i.e. 575 + max(0, 328.57 - 0.008214 x income); the credit is the lesser of the rent paid
  // and that amount.
  const mbr = (inc, rent, extra = {}) => housing('mb', prof({ otherA: inc, ageA: 50, ...extra }), 'rentPaid', rent, 'provCredit');
  near(await mbr(20000, 12000), 575, 1e-9, 'MB renters credit: 575 at low income');
  near(await mbr(150000, 12000), 575, 1e-9, 'MB renters credit has no income test');
  near(await mbr(20000, 0), 0, 0, 'MB owner (no rent): no renters credit');
  // Line 39: the lesser of the rent paid and the computed amount: 300 of rent gives 300.
  near(await mbr(20000, 300), 300, 1e-9, 'MB renters credit is limited by the rent paid');
  // Single 70, income 20,000: 575 + (328.57 - 0.008214 x 20,000 = 164.29) = 739.29.
  near(await mbr(20000, 12000, { ageA: 70 }), 575 + 328.57 - 0.008214 * 20000, 1e-9, 'MB renters credit with the seniors top-up');
  // Income 0: 903.57 (line 31); rent 800 limits it to 800.
  near(await mbr(0, 12000, { ageA: 70 }), 903.57, 1e-9, 'MB renters credit, senior at no income: 903.57');
  near(await mbr(0, 800, { ageA: 70 }), 800, 1e-9, 'MB renters credit, senior, limited by 800 of rent');
  // Income 60,000: the reduction is capped at 328.57 so the credit is the 575 floor (line 36: whichever is more of 47.91).
  near(await mbr(60000, 12000, { ageA: 70 }), 575, 1e-9, 'MB seniors top-up is floored at 0');
  // Couple, B is 65, combined income 30,000: one credit 575 + (328.57 - 0.008214 x 30,000 = 82.15) = 657.15.
  near(
    await housing('mb', prof({ otherA: 15000, otherB: 15000, ageA: 60, ageB: 65, singlePerson: false }), 'rentPaid', 12000, 'provCredit'),
    575 + 328.57 - 0.008214 * 30000, 1e-9, 'MB renters credit: couple, one household credit, top-up once',
  );

  // Engine: a single 70, retired, CPP 6,000 + OAS 9,150, owning with 3,000 property tax, inflation 0 (factor 1). The row
  // fields move by exactly the program amount compared with the same plan with no property tax.
  const engine = (prov, pt) => page.evaluate(({ prov, pt }) => {
    const s = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(s));
    Object.assign(s, { province: prov, singlePerson: true, ageA: 70, retireAgeA: 70, lifeExpectancyA: 95, incomeA: 0, pensionCoverage: 'none', inflation: 0, cppMonthlyA: 500, cppStartAgeA: 65, oasMonthlyA: 762.5, oasStartAgeA: 65, taxable: 0, traditional: 0, roth: 400000, cash: 50000, spending: 20000, healthcare: 0, dividendYield: 0, tenure: 'own', propertyTax: pt, propertyTaxGrowth: 0 });
    const row = window.__test_simulate().rows.find((x) => x.age === 71);
    Object.keys(saved).forEach((k) => { s[k] = saved[k]; });
    return { credit: row.benefitProvCredit, senior: row.benefitProvSenior };
  }, { prov, pt });
  // Income 15,150 (GIS income 6,000 > 0): NB allowance 300 (income under 22,001); NS rebate min(800, 1,500) = 800;
  // MB: homeowners credit 1,500 and seniors rebate 235 (income under 40,000).
  let e1 = await engine('nb', 3000), e0 = await engine('nb', 0);
  near(e1.credit - e0.credit, 300, 1e-6, 'engine, NB: allowance in the row');
  e1 = await engine('ns', 3000); e0 = await engine('ns', 0);
  near(e1.senior - e0.senior, 800, 1e-6, 'engine, NS: rebate in the row');
  e1 = await engine('mb', 3000); e0 = await engine('mb', 0);
  near(e1.credit - e0.credit, 1500, 1e-6, 'engine, MB: homeowners credit in the row');
  near(e1.senior - e0.senior, 235, 1e-6, 'engine, MB: seniors rebate in the row');

  // No phase-in: every new program is non-increasing in income (a rise would meet the known drawTaxable over-sell limitation
  // and break the gisIncomeRoom bisection). Scan 9,150 to 150,000 in 500 steps, single 70 owner and couple 66 renter.
  for (const [code, mk] of [
    ['nb', (y) => prof({ otherA: y, ageA: 70, oasA: 9150, propertyTaxPaid: 3000 })],
    ['ns', (y) => prof({ otherA: y, ageA: 70, oasA: 9150, propertyTaxPaid: 3000 })],
    ['mb', (y) => prof({ otherA: y, ageA: 70, oasA: 9150, propertyTaxPaid: 3000 })],
    ['mb', (y) => prof({ otherA: y / 2, otherB: y / 2, ageA: 66, ageB: 66, singlePerson: false, oasA: 9150, oasB: 9150, rentPaid: 12000 })],
  ]) {
    let prev = Infinity;
    for (let y = 9150; y <= 150000; y += 500) {
      const b = await withProv(code, mk(y));
      const v = b.provCredit + b.provSenior;
      assert(v <= prev + 1e-9, code + ': housing programs rise with income at ' + y + ' (' + prev + ' -> ' + v + ')');
      prev = v;
    }
  }

  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  console.log('benefits tests ok');
})();

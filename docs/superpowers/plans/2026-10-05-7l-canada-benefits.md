# 7L Canada income-tested benefits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Model Canada's income-tested cash benefits (GIS and Allowances, CCB, Canada Groceries and Essentials Benefit, and the provincial benefits for ON, BC, AB, QC) as tax-free payments with their own output lines, priced into every withdrawal decision.

**Architecture:** A pure-literal data table `BENEFIT_RULES` (one row per program, generic evaluators per row kind) in `Planner_Canada.html`, a generated review doc and coverage test in the `PROVINCE_RULES` pattern. `benefitsFor(profile, gains, traditionalExtra)` fills a module-level scratch object. Canada `taxFor` becomes `incomeTaxCA(...) - benefitsFor(...)` so the shared withdrawal solvers see lost benefits; rows report gross tax and each benefit separately. OAS gets the statutory 10 percent increase from age 75 (the inputs stay).

**Tech Stack:** Single-file HTML/JS planner, Node test scripts with Playwright (`npm test`), Python 3.7 stdlib (one-off table extraction).

**Spec:** `docs/7l-benefits-spec.md` (approved 2026-10-05). Verification record: the 7L notes and verification backlog in `docs/next-batches-plan.md`; reviewer hand-off `docs/7l-benefit-catalog-for-verification.md`; ESDC tables in `docs/sources/`.

## Global Constraints

- Canada only. Do not touch the US engine. Anything inside an `// @@shared:` region must stay byte-identical in both planners (`npm run check:shared` must pass). `drawTaxable` is a shared region: do NOT edit it.
- No new inputs. Inputs used: each partner age, income, wages, the 7A children list, province, rent, property tax, couple or single.
- GIS, Allowance, CCB, CGEB and provincial benefits use same-year income (an engine convention; the legal tests use the prior-year return).
- Working tree is CRLF. Edit planner and doc files with the node edit helper below (it normalizes CRLF to LF and back). After any `npm run sync` or `sed -i`, convert the planners back to CRLF and re-run `npm run check:shared`.
- Apostrophes inside a single-quoted JS string in `Planner_Canada.html` break the generators: avoid them in row notes and strings (comments outside the `BENEFIT_RULES` block are fine).
- `npm test` must pass at every commit. `npm run snapshot:update` only for an intended behavior change, with `git diff --stat tests/snapshots/` checked first: US snapshots (`us.json`, `ui_us.json`) must stay byte-identical.
- `tests/snapshot_ui.js` flakes about once per run with `dashHistSuccess` reading "85%" instead of "-": re-run it alone before suspecting code.
- Tax-code hot path: `benefitsFor` runs on every solver probe. It must allocate nothing (no objects, arrays or closures per call) and exit early when no benefit can apply.
- Hand-computed literals in tests carry the arithmetic in comments and cite the page, table row or statute section.
- Do not merge or enable auto-merge. Bump the Canada version badge once, in the last task (V41 to V42).
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- The OAS recommended amount (762.50 a month at 65 to 74, ESDC October to December 2026) and the 75-plus factor of 1.10 are quarterly-indexed ESDC figures: update the default and the `BENEFIT_RULES.oas` row for 2027 (comment in the row and in `docs/next-batches-plan.md`).

**Edit helper** (save once as `<scratchpad>/edit.js`; every code step below says "apply with the helper"):

```js
// edit.js: exact, single-match replacement that preserves CRLF line endings.
const fs = require('fs');
module.exports = function edit(file, oldStr, newStr) {
  const raw = fs.readFileSync(file, 'utf8');
  const lf = raw.replace(/\r\n/g, '\n');
  const parts = lf.split(oldStr);
  if (parts.length !== 2) throw new Error(`${file}: expected exactly 1 match, found ${parts.length - 1} for: ${oldStr.slice(0, 80)}`);
  fs.writeFileSync(file, parts.join(newStr).replace(/\n/g, '\r\n'));
};
```

## Review Focus

Failure modes the spec implies but the happy-path tests would not exercise, most likely first:

1. **Deferred or absent OAS.** A 66-year-old with `oasStartAge` 70 gets no OAS and no GIS; the spouse is then "spouse without OAS" (table 3). An OAS input of 0 means no OAS at all, and the 75-plus factor applies by actual age. Task 3 and Task 4 pin these.
2. **Survivor transitions.** Survivor aged 60 to 64 gets the Allowance for the Survivor (table 5), at 65 the single GIS; A-dies must equal B-dies. Task 4 extends `tests/survivor_symmetry.js`.
3. **Cliffs and zero income.** Table 4 ends at 42,768 because the younger spouse's Allowance reaches 0 (the pensioner continues on table 3, so there is no cliff); zero, negative-offset and very large incomes must give 0 (not NaN, not negative benefits). The withdrawal solve must still return net at least the need through a cliff. Task 4 pins these.
4. **Children boundaries.** Age 17 vs 18 vs 19 (CCB under 18, CGEB under 19), a child born after the year, four or more children (rates cap at the fourth), a single parent. Task 5 pins them.
5. **Old saves.** A saved state with the old default `oasMonthlyA: 742` keeps its value (only the default for new and partial saves changes to 762.50) and one with `oasMonthlyA: 0` still means no OAS; the legacy-state corpus hashes change only because the default changed. Task 3 pins this with `tests/legacy_state.js`.

---

## File Structure

| File | Responsibility |
|---|---|
| `Planner_Canada.html` | `BENEFIT_RULES` literal block, evaluators, `benefitsFor`, `incomeTaxCA`, net `taxFor`, profile and row plumbing, Sankey, table and CSV columns, OAS bands, retired inputs, version badge |
| `scripts/gen-benefit-rules.js` (new) | Writes `docs/benefits-rules.md` from the literal block; `--check` for `npm test` |
| `docs/benefits-rules.md` (generated) | Review artifact: one row per program |
| `tests/benefit_rules.js` (new) | Coverage test for the table |
| `tests/gis_tables.js` (new) | Every row of ESDC tables 1 to 5 against the GIS knots |
| `tests/benefits.js` (new) | Hand-computed engine and evaluator cases |
| `docs/sources/gis-tables-2026q4.json` (new) + `docs/sources/extract_gis_tables.py` (new) | Compact JSON of the five ESDC tables and the script that produced it from the xlsx |
| `tests/tax_brackets.js`, `tests/survivor_symmetry.js`, `tests/golden.js` and others | Updated for the `incomeTax` export (Task 4) |
| `package.json` | New scripts and test wiring |
| `CLAUDE.md`, `README.md`, `docs/next-batches-plan.md` | Docs |

---

### Task 1: BENEFIT_RULES table, generator and coverage test (no behavior change)

**Files:**
- Modify: `Planner_Canada.html` (insert after the `// PROVINCE_RULES:end` line, before `function compileProvince`; extend `window.__test_tax` at the end of the file)
- Create: `scripts/gen-benefit-rules.js`, `tests/benefit_rules.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `BENEFIT_RULES` (object keyed by program id: `gis`, `oas`, `cgeb`, `ccb`, `ocb`, `ostc`, `bcfb`, `acfb`, `absb`, `qcfa`), exposed as `window.__test_tax.BENEFIT_RULES`. Every row has `name, kind, scope, source, asOf, retrieved, verified, indexing, dependsOn, notes` plus kind-specific parameters. Kinds: `gisAllowance`, `oasPension`, `familyCredit`, `childSchedule`, `seniorSupplement`. `scope` is `'federal'` or a province code.
- `npm run gen:benefits` writes `docs/benefits-rules.md`.

- [ ] **Step 1: Write the failing coverage test**

Create `tests/benefit_rules.js`:

```js
// Coverage test for BENEFIT_RULES (Canada): every program present, every field explicit, schema ranges.
// Evaluators are tested with hand-computed cases in tests/benefits.js and against ESDC tables in tests/gis_tables.js.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const IDS = ['gis', 'oas', 'cgeb', 'ccb', 'ocb', 'ostc', 'bcfb', 'acfb', 'absb', 'qcfa'];
const KINDS = ['gisAllowance', 'oasPension', 'familyCredit', 'childSchedule', 'seniorSupplement'];
const PROVINCES = ['on', 'bc', 'ab', 'sk', 'mb', 'qc', 'nb', 'ns', 'pe', 'nl'];
const ROW_KEYS = ['name', 'kind', 'scope', 'source', 'asOf', 'retrieved', 'verified', 'indexing', 'dependsOn', 'notes'];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_Canada.html'));
  await page.waitForTimeout(300);
  const fails = await page.evaluate(
    ({ IDS, KINDS, PROVINCES, ROW_KEYS }) => {
      const rules = window.__test_tax.BENEFIT_RULES;
      const fails = [];
      for (const id of IDS) if (!rules[id]) fails.push(`${id}: missing`);
      for (const id of Object.keys(rules)) {
        if (!IDS.includes(id)) fails.push(`${id}: unexpected program`);
        const r = rules[id];
        for (const k of ROW_KEYS) if (!(k in r)) fails.push(`${id}: field ${k} missing`);
        if (!KINDS.includes(r.kind)) fails.push(`${id}: unknown kind ${r.kind}`);
        if (!(r.scope === 'federal' || PROVINCES.includes(r.scope))) fails.push(`${id}: bad scope ${r.scope}`);
        if (!/^https:\/\//.test(r.source)) fails.push(`${id}: source must be an https URL`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.retrieved)) fails.push(`${id}: retrieved must be a date`);
        for (const [fam, v] of Object.entries(r.verified)) if (!['primary', 'secondary'].includes(v)) fails.push(`${id}: verified.${fam} must be primary or secondary`);
        if (!Object.keys(r.verified).length) fails.push(`${id}: verified is empty`);
        for (const [k, v] of Object.entries(r.indexing)) if (typeof v !== 'boolean') fails.push(`${id}: indexing.${k} must be a boolean`);
        for (const d of r.dependsOn) if (!rules[d]) fails.push(`${id}: dependsOn ${d} does not resolve`);
        if (typeof r.notes !== 'string' || /'/.test(r.notes)) fails.push(`${id}: notes must be a string without apostrophes`);
        if (r.kind === 'gisAllowance') {
          const keys = ['single', 'spouseOas', 'spouseNoOas', 'couplePensioner', 'coupleAllowance', 'survivorAllowance'];
          for (const k of keys) {
            const kn = r.situations[k];
            if (!kn || kn.length < 3) { fails.push(`${id}: situation ${k} missing`); continue; }
            for (let i = 1; i < kn.length; i++) if (!(kn[i][0] >= kn[i - 1][0])) fails.push(`${id}.${k}: knots not ascending at ${i}`);
            if (kn[kn.length - 1][1] !== 0) fails.push(`${id}.${k}: last knot must be zero`);
            if (kn[0][0] !== 0) fails.push(`${id}.${k}: first knot must start at income 0`);
          }
        }
        if (r.kind === 'oasPension') {
          const f = r.ageFactors;
          if (!(f.length === 1 && f[0].from === 75 && f[0].factor === 1.1 && r.recommendedMonthly > 700)) fails.push(`${id}: bad OAS age factor`);
        }
        if (r.kind === 'seniorSupplement' && !r.dependsOn.includes('oas')) fails.push(`${id}: a senior supplement must depend on oas`);
        if (r.scope !== 'federal' && !['childSchedule', 'familyCredit', 'seniorSupplement'].includes(r.kind)) fails.push(`${id}: provincial row has a federal-only kind`);
      }
      return fails;
    },
    { IDS, KINDS, PROVINCES, ROW_KEYS },
  );
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  assert.deepStrictEqual(fails, [], '\n  ' + fails.join('\n  '));
  console.log('benefit rules coverage ok');
})();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/benefit_rules.js`
Expected: FAIL (`window.__test_tax.BENEFIT_RULES` is undefined, a TypeError inside `page.evaluate`).

- [ ] **Step 3: Insert the BENEFIT_RULES block**

Apply with the helper to `Planner_Canada.html`: replace the single line `  // PROVINCE_RULES:end` with itself followed by the block below. Knots are `[annual income excluding OAS, annual benefit]` in nominal 2026 Q4 dollars, linear between knots, zero past the last knot; a repeated income is a cliff. They were fitted to ESDC tables 1 to 5 (October to December 2026) with a tolerance of 12 dollars a year for tables 1 to 3 and 30 for tables 4 and 5; `tests/gis_tables.js` checks every table row.

```js
  // PROVINCE_RULES:end
  // ---- Income-tested benefits (7L) ----
  // One row per program; evaluators in benefitsFor read these by kind. Pure literals between the
  // begin and end markers (scripts/gen-benefit-rules.js evaluates the block). Amounts are annual
  // dollars for the benefit year that starts in 2026 unless the row says otherwise. Same-year income
  // stands in for the prior-year test the programs really use (engine convention).
  // BENEFIT_RULES:begin
  const BENEFIT_RULES = {
    gis: {
      name: 'Guaranteed Income Supplement, Allowance and Allowance for the Survivor',
      kind: 'gisAllowance',
      scope: 'federal',
      source: 'https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/payments.html',
      asOf: '2026-10-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', formula: 'primary', employmentExemption: 'secondary' },
      indexing: { quarterlyCpi: true },
      dependsOn: [],
      employmentExemption: { full: 5000, halfBand: 10000 },
      situations: {
        single: [[0, 13666.8], [2040, 12646.8], [10464, 6322.8], [10512, 6293.88], [23088, 5.88], [23112, 0]],
        spouseOas: [[0, 8226.72], [4080, 7206.72], [8832, 5418.84], [30528, 0]],
        spouseNoOas: [[0, 13666.8], [4096, 13654.8], [9184, 13018.8], [20928, 8614.8], [21024, 8585.88], [55344, 5.88], [55392, 0]],
        couplePensioner: [[0, 8226.72], [4080, 8226.72], [8800, 7626.84], [12240, 7626.84], [30144, 3155.04], [42768, 3155.04], [42768, 0]],
        coupleAllowance: [[0, 17376.72], [4096, 14304.72], [8832, 10152.84], [12192, 7632.84], [42768, 0]],
        survivorAllowance: [[0, 20714.16], [2048, 19190.16], [10464, 10754.16], [12192, 9453.24], [31152, 0]],
      },
      notes: 'Fitted to ESDC tables 1 to 5 for October to December 2026 (docs/sources). Income is annual net income less OAS and the employment exemption, combined for couples. Amounts and income cutoffs scale together with the plan inflation factor (quarterly CPI approximated by annual plan inflation). A single filer aged 60 to 64 who is not a survivor gets no Allowance.',
    },
    oas: {
      name: 'Old Age Security pension: 75 plus step and recommended amount',
      kind: 'oasPension',
      scope: 'federal',
      source: 'https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/payments.html',
      asOf: '2026-10-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', ageFactor: 'primary' },
      indexing: { quarterlyCpi: true },
      dependsOn: [],
      // UPDATE FOR 2027: the recommended amount is the October to December 2026 maximum and changes every quarter.
      recommendedMonthly: 762.5,
      ageFactors: [{ from: 75, factor: 1.1 }],
      notes: 'The OAS inputs stay: enter the 65 to 74 amount in todays dollars (2026 maximum 762.50 a month, recommended default; prorate for partial residence; raise it yourself for a deferral, 0.6 percent per month up to 36 percent at 70). The planner applies the 10 percent increase from age 75 (ESDC maximum 838.75; the ratio 75 plus to 65 to 74 is exactly 1.10 in every quarter checked since July 2022 and 1.00 before). Quarterly CPI indexation is approximated by annual plan inflation.',
    },
    cgeb: {
      name: 'Canada Groceries and Essentials Benefit (formerly the GST/HST credit)',
      kind: 'familyCredit',
      scope: 'federal',
      source: 'https://www.parl.ca/DocumentViewer/en/45-1/bill/C-19/royal-assent',
      asOf: '2026-07-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', formula: 'primary' },
      indexing: { amountsAndThresholds: true },
      dependsOn: [],
      childMaxAge: 18,
      adult: 445,
      spouse: 445,
      eligibleDependant: 445,
      child: 234,
      singleParentExtra: 234,
      singleSupplement: { max: 234, rate: 0.02, from: 11564 },
      reduction: { rate: 0.05, from: 46432 },
      notes: 'Income Tax Act 122.5(3.005) as enacted by Bill C-19 (S.C. 2026 c. 1): 445 for the individual, 445 for a spouse or for the first child of a single parent, 234 for each other child, 234 more for a single parent, a single supplement of the lesser of 234 and 2 percent of income over 11,564, less 5 percent of income over 46,432. Children under 19. Indexed from 2027.',
    },
    ccb: {
      name: 'Canada Child Benefit',
      kind: 'childSchedule',
      scope: 'federal',
      source: 'https://www.canada.ca/en/revenue-agency/services/child-family-benefits/canada-child-benefit-overview/canada-child-benefit-we-calculate-your-ccb.html',
      asOf: '2026-07-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', reduction: 'primary' },
      indexing: { amountsAndThresholds: true },
      dependsOn: [],
      style: 'ccb',
      amounts: [{ maxAge: 5, amount: 8157 }, { maxAge: 17, amount: 6883 }],
      reduction: {
        from1: 38237,
        from2: 82847,
        rate1: [0.07, 0.135, 0.19, 0.23],
        base2: [3123, 6022, 8476, 10260],
        rate2: [0.032, 0.057, 0.08, 0.095],
      },
      notes: 'Reduction by the number of children (four or more use the last column) on adjusted family net income. The child disability benefit and the child care expense and shared custody rules are not modeled. Indexed in July; approximated by annual plan inflation.',
    },
    ocb: {
      name: 'Ontario Child Benefit',
      kind: 'childSchedule',
      scope: 'on',
      source: 'https://www.canada.ca/en/revenue-agency/services/child-family-benefits/provincial-territorial-programs/province-ontario.html',
      asOf: '2026-07-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', reduction: 'secondary' },
      indexing: { amountsAndThresholds: true },
      dependsOn: [],
      style: 'ocb',
      maxAge: 17,
      amountPerChild: 1759.92,
      reduction: { from: 26865, rate: 0.08 },
      notes: 'Up to 146.66 a month per child under 18 (CRA); partial above 26,865. The 8 percent reduction rate on the family total is secondary and on the verification backlog.',
    },
    ostc: {
      name: 'Ontario Sales Tax Credit',
      kind: 'familyCredit',
      scope: 'on',
      source: 'https://www.canada.ca/en/revenue-agency/services/child-family-benefits/provincial-territorial-programs/province-ontario.html',
      asOf: '2026-07-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', reduction: 'primary' },
      indexing: { amountsAndThresholds: true },
      dependsOn: [],
      childMaxAge: 18,
      adult: 378,
      spouse: 378,
      eligibleDependant: 378,
      child: 378,
      singleParentExtra: 0,
      singleSupplement: { max: 0, rate: 0, from: 0 },
      reduction: { rate: 0.04, from: 36309, fromSingle: 29047 },
      notes: '378 for each adult and each child under 19; reduced by 4 percent of family net income over 36,309, or over 29,047 for a single person with no children. The seniors income threshold option is not modeled.',
    },
    bcfb: {
      name: 'BC Family Benefit',
      kind: 'childSchedule',
      scope: 'bc',
      source: 'https://www.canada.ca/en/revenue-agency/services/child-family-benefits/provincial-territorial-programs/province-british-columbia.html',
      asOf: '2026-07-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', reduction: 'primary' },
      indexing: { amountsAndThresholds: true },
      dependsOn: [],
      style: 'bcfb',
      maxAge: 17,
      amounts: [1749.96, 1099.92, 900],
      singleParentFirstChild: 499.92,
      floors: [774.96, 750, 724.92],
      reduction: { from1: 30176, from2: 96562, rate: 0.04 },
      notes: 'Per child by order: 145.83, 91.66 and 75 a month; 41.66 more for the first child of a single parent. Reduced by 4 percent of income over 30,176 but not below 64.58, 62.50 and 60.41 a month per child until 96,562; above that the remaining benefit falls by 4 percent of the excess.',
    },
    acfb: {
      name: 'Alberta Child and Family Benefit',
      kind: 'childSchedule',
      scope: 'ab',
      source: 'https://www.alberta.ca/alberta-child-and-family-benefit',
      asOf: '2026-07-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', baseReduction: 'secondary', workingComponent: 'secondary' },
      indexing: { amountsAndThresholds: true },
      dependsOn: [],
      style: 'acfb',
      maxAge: 17,
      baseMax: [1529, 2293, 3057, 3821],
      baseRate: [0.0805, 0.1207, 0.1609, 0.2011],
      baseFrom: 28116,
      workingMax: [782, 1494, 1920, 2061],
      workingPhaseInRate: 0.15,
      workingPhaseInFrom: 2760,
      workingRate: [0.034, 0.0649, 0.0834, 0.0895],
      workingFrom: 47115,
      notes: 'Maximums are on the Alberta page. The base reduction rates are implied by each maximum divided by the 18,999 dollar span to 47,115; the working component rates and the 15 percent phase-in come from a reviewer and are on the verification backlog. Working income is wages.',
    },
    absb: {
      name: 'Alberta Seniors Benefit',
      kind: 'seniorSupplement',
      scope: 'ab',
      source: 'https://www.alberta.ca/alberta-seniors-benefit',
      asOf: '2026-07-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', rates: 'primary' },
      indexing: { amountsAndThresholds: true },
      dependsOn: ['oas', 'gis'],
      style: 'absb',
      single: { max: 3946, rate: 0.1714 },
      couple: { max: 5918, rate: 0.1717 },
      employmentDeduction: 3600,
      notes: 'Homeowner, renter or lodge resident rows. Income used is net income less OAS, GIS and Allowance and up to 3,600 of employment income; the RRSP, pension plan and split-pension deductions are not modeled. Requires OAS in payment (deferring OAS removes eligibility).',
    },
    qcfa: {
      name: 'Quebec Family Allowance',
      kind: 'childSchedule',
      scope: 'qc',
      source: 'https://cdn-contenu.quebec.ca/cdn-contenu/adm/min/finances/publications-adm/parametres/AUTEN_IncomeTax2026.pdf',
      asOf: '2026-01-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', thresholds: 'primary', reductionEnd: 'secondary' },
      indexing: { amountsAndThresholds: true },
      dependsOn: [],
      style: 'qcfa',
      maxAge: 17,
      perChild: { max: 3068, min: 1221 },
      singleParentSupplement: { max: 1077, min: 430 },
      from: { twoParent: 60398, oneParent: 44032 },
      to: 107000,
      notes: 'Finance Quebec Table 3 (2026): 3,068 maximum and 1,221 minimum for each child, plus 1,077 maximum and 430 minimum once per single-parent family; reduction thresholds 60,398 for a couple and 44,032 for a single parent. The income where the minimum is reached (107,000, from the Retraite Quebec table) and the linear shape in between are secondary and on the verification backlog. The school supplies and handicapped children supplements are not modeled.',
    },
  };
  // BENEFIT_RULES:end
```

Then extend `window.__test_tax` (last lines of the file): replace `PROVINCE_RULES, cppContribution,` with `PROVINCE_RULES, BENEFIT_RULES, cppContribution,`.

- [ ] **Step 4: Create the generator**

Create `scripts/gen-benefit-rules.js`:

```js
#!/usr/bin/env node
// Generates docs/benefits-rules.md, the review artifact for the Canadian income-tested benefit table, from
// the BENEFIT_RULES block in Planner_Canada.html (between the `BENEFIT_RULES:begin` / `end` comments, which
// holds pure literals).
//
//   node scripts/gen-benefit-rules.js           write docs/benefits-rules.md
//   node scripts/gen-benefit-rules.js --check   exit 1 if the file is stale (run by `npm test`)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const PLANNER = path.join(root, 'Planner_Canada.html');
const OUT = path.join(root, 'docs', 'benefits-rules.md');
const norm = (s) => s.replace(/\r\n/g, '\n');

function loadRules() {
  const html = norm(fs.readFileSync(PLANNER, 'utf8'));
  const a = html.indexOf('// BENEFIT_RULES:begin'),
    b = html.indexOf('// BENEFIT_RULES:end');
  if (a < 0 || b < a) throw new Error('BENEFIT_RULES markers not found in Planner_Canada.html');
  return vm.runInNewContext(html.slice(a, b) + '\nBENEFIT_RULES;');
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const META = ['name', 'kind', 'scope', 'source', 'asOf', 'retrieved', 'verified', 'indexing', 'dependsOn', 'notes'];

function generate(rules) {
  const ids = Object.keys(rules);
  const L = [];
  L.push('# Income-tested benefit rules (generated)');
  L.push('');
  L.push('Generated by `node scripts/gen-benefit-rules.js` from `BENEFIT_RULES` in `Planner_Canada.html`; do not edit by hand.');
  L.push('`npm test` fails if this file is stale. Amounts are annual dollars for the benefit year starting in 2026. Each row says, per family,');
  L.push('whether its figures were read on a primary government page or only on a secondary one; see the 7L notes in docs/next-batches-plan.md.');
  L.push('Same-year income stands in for the prior-year return the programs really use (an engine convention).');
  L.push('');
  L.push(`${ids.length} programs. Provinces not listed here are filled in a later batch (7M).`);
  L.push('');
  L.push('| Id | Program | Kind | Scope | Source | As of | Verified | Indexing | Depends on |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const id of ids) {
    const r = rules[id];
    L.push(
      '| ' +
        [
          id,
          r.name,
          r.kind,
          r.scope,
          `[page](${r.source}), retrieved ${r.retrieved}`,
          r.asOf,
          Object.entries(r.verified).map(([k, v]) => `${k}: ${v}`).join(', '),
          Object.entries(r.indexing).map(([k, v]) => `${k}: ${v}`).join(', '),
          r.dependsOn.length ? r.dependsOn.join(', ') : 'none',
        ].map(cell).join(' | ') +
        ' |',
    );
  }
  L.push('');
  L.push('## Parameters and notes');
  L.push('');
  for (const id of ids) {
    const r = rules[id];
    L.push(`### ${id}: ${r.name}`);
    L.push('');
    L.push(r.notes);
    L.push('');
    const params = {};
    for (const k of Object.keys(r)) if (!META.includes(k)) params[k] = r[k];
    L.push('```json');
    L.push(JSON.stringify(params, null, 1));
    L.push('```');
    L.push('');
  }
  return L.join('\n');
}

const text = generate(loadRules());
if (process.argv.includes('--check')) {
  const have = fs.existsSync(OUT) ? norm(fs.readFileSync(OUT, 'utf8')) : '';
  if (have !== text) {
    console.error('docs/benefits-rules.md is stale. Run: node scripts/gen-benefit-rules.js');
    process.exit(1);
  }
  console.log('benefit rules doc is current');
} else {
  fs.writeFileSync(OUT, text);
  console.log('wrote ' + path.relative(root, OUT));
}
```

- [ ] **Step 5: Wire package.json and generate the doc**

Apply with the helper to `package.json`: in the `test` script insert `&& node scripts/gen-benefit-rules.js --check` right after `node scripts/gen-province-rules.js --check`, and insert `&& node tests/benefit_rules.js` right after `node tests/province_rules.js`. In `scripts` add `"gen:benefits": "node scripts/gen-benefit-rules.js"` after the `gen:provinces` line (add the comma to the previous line).

Run: `node scripts/gen-benefit-rules.js`
Expected: `wrote docs/benefits-rules.md`

- [ ] **Step 6: Run the new test and the full suite**

Run: `node tests/benefit_rules.js`
Expected: `benefit rules coverage ok`

Run: `npm test`
Expected: all pass, snapshots unchanged (the table is not read by the engine yet).

- [ ] **Step 7: Commit**

```bash
git add Planner_Canada.html scripts/gen-benefit-rules.js tests/benefit_rules.js package.json docs/benefits-rules.md
git commit -m "7L: BENEFIT_RULES table, generated rules doc and coverage test (no behavior change)"
```

---

### Task 2: GIS evaluator checked against every ESDC table row

**Files:**
- Create: `docs/sources/extract_gis_tables.py`, `docs/sources/gis-tables-2026q4.json` (generated), `tests/gis_tables.js`
- Modify: `Planner_Canada.html` (add `interpKnots`, `gisAnnual`, `gisEmploymentExemption` just before `function taxFor`; export in `__test_tax`), `package.json`

**Interfaces:**
- Consumes: `BENEFIT_RULES.gis` from Task 1.
- Produces: `interpKnots(knots, x)`, `gisAnnual(situation, income, factor = 1)` (annual dollars; `situation` one of the six keys), `gisEmploymentExemption(earned)`, all on `window.__test_tax`.

- [ ] **Step 1: Extract the tables to JSON**

Create `docs/sources/extract_gis_tables.py` (Python 3.7 standard library only):

```python
"""Converts the five ESDC GIS table workbooks in this folder to one compact JSON file.
Run: python docs/sources/extract_gis_tables.py
Each entry is [income_from, income_to, monthly_amount] for the named column. Source: ESDC, Table of
Amounts October to December 2026 (open.canada.ca)."""
import json, re, zipfile, os
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
HERE = os.path.dirname(os.path.abspath(__file__))

def load(path):
    z = zipfile.ZipFile(path)
    ss = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall('m:si', NS):
            ss.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    sheet = sorted(n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml', n))[0]
    rows = []
    for r in ET.fromstring(z.read(sheet)).iter('{%s}row' % NS['m']):
        cells = []
        for c in r.findall('m:c', NS):
            v = c.find('m:v', NS)
            cells.append('' if v is None else (ss[int(v.text)] if c.get('t') == 's' else v.text))
        rows.append(cells)
    return rows

WANT = {
    'table1.xlsx': ['gistotal'],
    'table2.xlsx': ['gistotal'],
    'table3.xlsx': ['gistotal'],
    'table4.xlsx': ['gistotal', 'alwtotal'],
    'table5.xlsx': ['alwstotal'],
}
out = {}
for name, cols in WANT.items():
    rows = load(os.path.join(HERE, name))
    hdr = rows[0]
    for col in cols:
        i, a, b = hdr.index(col), hdr.index('income_from'), hdr.index('income_to')
        out[name.replace('.xlsx', '') + '.' + col] = [[round(float(r[a]), 2), round(float(r[b]), 2), round(float(r[i]), 2)] for r in rows[1:]]
with open(os.path.join(HERE, 'gis-tables-2026q4.json'), 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print({k: len(v) for k, v in out.items()})
```

Run: `python docs/sources/extract_gis_tables.py`
Expected: prints the row counts (1140, 686, 1140, 941, 941, 1220 for the six series).

- [ ] **Step 2: Write the failing test**

Create `tests/gis_tables.js`:

```js
// Every row of ESDC GIS tables 1 to 5 (October to December 2026) against the fitted knots in BENEFIT_RULES.gis.
// Table rows are monthly amounts for an income band; the knots are annual, so compare annual values at the band
// midpoint. Tolerance: 12 dollars a year (1 dollar a month) for tables 1 to 3; 30 for tables 4 and 5, whose bands
// alternate widths and so carry up to 28 dollars a year of rounding stair.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const tables = require('../docs/sources/gis-tables-2026q4.json');

const SERIES = [
  ['table1.gistotal', 'single', 12],
  ['table2.gistotal', 'spouseOas', 12],
  ['table3.gistotal', 'spouseNoOas', 12],
  ['table4.gistotal', 'couplePensioner', 30],
  ['table4.alwtotal', 'coupleAllowance', 30],
  ['table5.alwstotal', 'survivorAllowance', 30],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_Canada.html'));
  await page.waitForTimeout(300);
  for (const [key, situation, tol] of SERIES) {
    const rows = tables[key];
    const mids = rows.map((r) => (r[0] + r[1]) / 2);
    const got = await page.evaluate(({ situation, mids }) => mids.map((m) => window.__test_tax.gisAnnual(situation, m)), { situation, mids });
    let worst = 0;
    rows.forEach((r, i) => {
      const want = r[2] * 12,
        d = Math.abs(got[i] - want);
      worst = Math.max(worst, d);
      assert(d <= tol, `${key} income ${mids[i]}: table ${want.toFixed(2)} a year, formula ${got[i].toFixed(2)} (off by ${d.toFixed(2)}, tolerance ${tol})`);
    });
    console.log(`${key} (${situation}): ${rows.length} rows, worst difference ${worst.toFixed(2)} a year`);
  }
  // Scaling: amounts and income cutoffs move together with the factor.
  const [a, b] = await page.evaluate(() => [window.__test_tax.gisAnnual('single', 10000), window.__test_tax.gisAnnual('single', 11000, 1.1)]);
  assert(Math.abs(b - a * 1.1) < 1e-9, 'factor scaling: gisAnnual(income * f, f) must equal f * gisAnnual(income)');
  // Past the cutoff and at zero.
  const edge = await page.evaluate(() => [window.__test_tax.gisAnnual('single', 23112), window.__test_tax.gisAnnual('single', 1e9), window.__test_tax.gisAnnual('single', 0), window.__test_tax.gisAnnual('couplePensioner', 42767), window.__test_tax.gisAnnual('couplePensioner', 42768)]);
  assert.strictEqual(edge[0], 0, 'zero at the single cutoff');
  assert.strictEqual(edge[1], 0, 'zero far above the cutoff');
  assert(Math.abs(edge[2] - 13666.8) < 1e-9, 'maximum at zero income (1,138.90 a month, 12 times)');
  assert(edge[3] > 3000 && edge[4] === 0, 'table 4 GIS spouse amount is a cliff at 42,768');
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  console.log('gis tables ok');
})();
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node tests/gis_tables.js`
Expected: FAIL (`window.__test_tax.gisAnnual` is not a function).

- [ ] **Step 4: Implement the evaluator**

Apply with the helper to `Planner_Canada.html`: replace the line `  function taxFor(profile, gains = 0, traditionalExtra = 0) {` with the block below (the `taxFor` body follows unchanged).

```js
  // ---- Income-tested benefit evaluators (7L) ----
  // Linear interpolation over [income, benefit] knots; zero past the last knot; a repeated income is a cliff.
  function interpKnots(k, x) {
    if (!(x > 0)) x = 0;
    const n = k.length;
    if (x >= k[n - 1][0]) return k[n - 1][1];
    for (let i = 1; i < n; i++) {
      if (x < k[i][0]) {
        const xa = k[i - 1][0];
        return k[i - 1][1] + ((k[i][1] - k[i - 1][1]) * (x - xa)) / (k[i][0] - xa);
      }
    }
    return 0;
  }
  // Annual GIS (or Allowance) for one household situation at an annual income (net income less OAS and the
  // employment exemption, combined for couples). `factor` is the plan inflation factor: amounts and income
  // cutoffs scale together.
  function gisAnnual(situation, income, factor = 1) {
    return interpKnots(BENEFIT_RULES.gis.situations[situation], income / factor) * factor;
  }
  // GIS employment income exemption: the first 5,000 is exempt and half of the next 10,000 (per person).
  function gisEmploymentExemption(earned) {
    const e = BENEFIT_RULES.gis.employmentExemption;
    return Math.min(earned, e.full) + 0.5 * Math.min(Math.max(earned - e.full, 0), e.halfBand);
  }
  function taxFor(profile, gains = 0, traditionalExtra = 0) {
```

Extend `window.__test_tax`: replace `BENEFIT_RULES, cppContribution,` with `BENEFIT_RULES, interpKnots, gisAnnual, gisEmploymentExemption, cppContribution,`.

- [ ] **Step 5: Run the test**

Run: `node tests/gis_tables.js`
Expected: six `... worst difference` lines, then `gis tables ok`. If a series exceeds its tolerance, do not widen the tolerance: re-fit the knots for that series with `python` (RDP on annual values, 12 or 24 dollar epsilon) and update the table row, then regenerate the doc.

- [ ] **Step 6: Wire into npm test, run the suite, commit**

Apply with the helper to `package.json`: insert `&& node tests/gis_tables.js` right after `node tests/benefit_rules.js`.

Run: `npm test`
Expected: all pass, snapshots unchanged.

```bash
git add docs/sources/extract_gis_tables.py docs/sources/gis-tables-2026q4.json docs/sources/*.xlsx docs/sources/gistablesdatadictionnary.rtf tests/gis_tables.js Planner_Canada.html package.json
git commit -m "7L: GIS evaluator, checked against every row of the ESDC tables"
```

---

### Task 3: OAS 75-plus step and the 2026 default (the `oasMonthly` inputs stay)

**Decision (owner, 2026-10-05):** the `oasMonthlyA/B` inputs are kept (set one to 0 for no OAS). The planner now applies the statutory 10 percent increase from age 75 automatically, and the 2026 maximum becomes the default. The input is entered in today's dollars and already scales with the plan's inflation factor, so it keeps up with quarterly CPI indexation as annual plan inflation. The OAS deferral increase (0.6 percent per month, up to 36 percent at 70) stays manual, as today: the tooltip tells the user to raise the figure. Historical check of the 75-plus ratio (ESDC and secondary quarterly figures): 1.1000 in July 2023 (756.32 / 687.56), January 2025 (800.44 / 727.67) and October 2026 (838.75 / 762.50), and 1.000 before July 2022 when the increase began.

**Files:**
- Modify: `Planner_Canada.html` (`defaults`, the `oasMonthly` and `oasStartAge` markup text, `cppAndOasIncome`, `__test_tax`)
- Test: `tests/benefits.js` (new, created here; later tasks append)

**Interfaces:**
- Produces: `oasAgeFactor(age)` returns `BENEFIT_RULES.oas.ageFactors` applied by age (1.1 at 75 and over, else 1). `cppAndOasIncome` computes each partner's OAS as `oasMonthly * 12 * oasAgeFactor(age)` times the inflation factor, from `oasStartAge`. Both are on `window.__test_tax`.

- [ ] **Step 1: Write the failing test**

Create `tests/benefits.js` (later tasks append cases above the closing lines):

```js
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

  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  console.log('benefits tests ok');
})();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/benefits.js`
Expected: FAIL (`window.__test_tax.oasAgeFactor` is not a function).

- [ ] **Step 3: Implement**

All edits to `Planner_Canada.html` with the helper:

1. Add before `function cppAndOasIncome`:

```js
  // OAS 75-plus step: the pension is increased 10 percent from age 75 (permanent since July 2022; the ESDC
  // maximums are 762.50 a month at 65 to 74 and 838.75 at 75 and over, a ratio of exactly 1.10). The OAS
  // input is the 65 to 74 amount in today's dollars; this factor is applied by the partner's actual age.
  // Deferral increases (0.6 percent a month, up to 36 percent at 70) are not applied: raise the input.
  function oasAgeFactor(age) {
    const f = BENEFIT_RULES.oas.ageFactors;
    return age >= f[0].from ? f[0].factor : 1;
  }
```

2. In `cppAndOasIncome` replace `let oasGrossA = (age >= state.oasStartAgeA ? state.oasMonthlyA * 12 : 0) * factor,` with `let oasGrossA = (age >= state.oasStartAgeA ? state.oasMonthlyA * 12 * oasAgeFactor(age) : 0) * factor,` and replace `: (ageB >= state.oasStartAgeB ? state.oasMonthlyB * 12 : 0) * factor;` with `: (ageB >= state.oasStartAgeB ? state.oasMonthlyB * 12 * oasAgeFactor(ageB) : 0) * factor;`.

3. `defaults`: replace `oasMonthlyA: 742,` with `oasMonthlyA: 762.5,` and `oasMonthlyB: 742,` with `oasMonthlyB: 762.5,`. (`FIELDS`, `ids`, the markup ids and the tornado lever are unchanged.)

4. Markup text: in the `oasMonthlyA` field replace `<small>Defaults to the 2026 maximum (ages 65–74)</small>` with `<small>2026 maximum 762.50 a month at 65 to 74; the planner adds 10% from age 75. Enter 0 for no OAS.</small>` and give `oasMonthlyB` the same `<small>` (it has none today). In both `oasStartAge` tooltips (the string occurs twice, Partner A and Partner B: replace both) change `The OAS amount above is used as-is from this age on. Real OAS rises about 0.6% for each month you defer past 65, but the planner doesn&#x27;t apply that, so raise the monthly figure yourself if you plan to defer.` to `The OAS amount above is used from this age on, with the 10% increase the planner adds from age 75. Real OAS rises about 0.6% for each month you defer past 65 (up to 36% at 70), but the planner doesn&#x27;t apply that, so raise the monthly figure yourself if you plan to defer. Partial residence in Canada also reduces OAS: enter your own estimate.`

5. Export: replace `gisEmploymentExemption, cppContribution,` with `gisEmploymentExemption, oasAgeFactor, cppAndOasIncome, cppContribution,` in `__test_tax`.

- [ ] **Step 4: Run the new test, then the suite**

Run: `node tests/benefits.js`
Expected: `benefits tests ok`.

Run: `npm test`
Expected: FAIL only in the Canada snapshot tests (`tests/snapshot.js` Canada baseline, `tests/legacy_state.js` Canada saves (the new default flows into every save without an OAS value), `tests/snapshot_ui.js` Canada: the new default 762.50 instead of 742 and the 75-plus step change every Canada scenario with OAS at 75 or older, and the field text changes). If anything else fails, fix that first.

- [ ] **Step 5: Update the baselines for the intended change**

Run: `git diff --stat tests/snapshots/` (should be empty), `node tests/legacy_state.js --update` (read the diff: only Canada entries may change, because the default changed), `npm run snapshot:update`, `git diff --stat tests/snapshots/`.
Expected: only `canada.json`, `ui_canada.json` and `legacy_state.json` changed. `us.json` and `ui_us.json` must not appear. Run `npm test` again.
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A tests Planner_Canada.html
git commit -m "7L: OAS 75-plus step (x1.10) and the 2026 maximum as the default; oasMonthly inputs kept"
```

---

### Task 4: Net-tax design, GIS and Allowance in the engine, outputs

**Files:**
- Modify: `Planner_Canada.html` (rename `taxFor` to `incomeTaxCA` and add the net `taxFor`; add `BEN`, `benefitsFor`; `buildTaxProfile`; the `runProjection` row and cash flow; Sankey; table and CSV; RRSP optimizer objective; `__test_tax`)
- Modify: `tests/tax_brackets.js` (Canada section), `tests/survivor_symmetry.js`
- Test: `tests/benefits.js`

**Interfaces:**
- Consumes: Task 2's `gisAnnual`, `gisEmploymentExemption`; Task 3's `oasAgeFactor`.
- Produces: `incomeTaxCA(profile, gains, traditionalExtra)` (the old pure tax); `taxFor(profile, gains, traditionalExtra)` = `incomeTaxCA(...) - benefitsFor(...)`; `benefitsFor(profile, gains, traditionalExtra)` returns the benefit total and fills the module-level object `BEN` with `{ gis, allowance, ccb, cgeb, provChild, provSenior, provCredit, total }` (annual dollars, tax-free). Profile gains fields: `oasA, oasB` (OAS received), `earnedA, earnedB` (wages net of contributions), `survivor` (boolean), `dependents` (from `dependentsInYear`, used from Task 5). Row fields: `benefits`, `benefitGis`, `benefitAllowance`, `benefitCcb`, `benefitCgeb`, `benefitProvChild`, `benefitProvSenior`, `benefitProvCredit`; `row.tax` stays gross (income tax plus payroll tax). `window.__test_tax` exports `incomeTax`, `benefitsFor`, `getBenefits` (returns a copy of `BEN`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/benefits.js` before the `await browser.close();` line. `prof` builds a Canada tax profile (as in `tests/tax_brackets.js`); a fresh `window.__test_tax` call is needed per case.

```js
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
  near(net5 - net0, inc5 - inc0 + lost, 1e-6, 'taxFor = income tax minus benefits (single, GIS)');
  // Table 1 (ESDC): between 10,500 and 15,000 each extra dollar costs 50 cents; below 10,464 it costs 75 cents.
  near(lost, 0.75 * 464 + 0.6025 * 48 + 0.5 * 4488, 5, 'GIS lost on a 5,000 draw: slopes 0.75, then 0.60, then 0.50');
  let b = await page.evaluate((p) => { window.__test_tax.benefitsFor(p, 0, 0); return window.__test_tax.getBenefits(); }, p1);
  near(b.gis, await G('single', 10000), 1e-9, 'benefitsFor.gis single');
  near(b.total, b.gis, 1e-9, 'total is the sum of the lines');

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
  near(b.total, 0, 0, 'single aged 61, not a survivor: no Allowance');
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/benefits.js`
Expected: FAIL (`incomeTax` / `benefitsFor` not defined; the page evaluate returns an error).

- [ ] **Step 3: Implement the net tax and benefitsFor**

Apply with the helper to `Planner_Canada.html`. Replace the line `  function taxFor(profile, gains = 0, traditionalExtra = 0) {` (the function head only; keep its body) with `  function incomeTaxCA(profile, gains = 0, traditionalExtra = 0) {`, then insert after that function's closing line (the `}` that ends it, immediately before `// @@shared:drawTaxable begin`) the block below.

```js
  // Canada taxFor is the household's net cost of income: income tax minus the income-tested benefits it
  // triggers. The shared withdrawal solvers (drawTaxable and the Canada solvers) price a withdrawal as the change
  // in taxFor, so with this definition they see lost GIS and the other benefits as a cost of withdrawing. The
  // benefits are tax-free cash, so net cash is the same as a separate inflow; the engine reports gross tax and
  // each benefit separately (see runProjection).
  function taxFor(profile, gains = 0, traditionalExtra = 0) {
    return incomeTaxCA(profile, gains, traditionalExtra) - benefitsFor(profile, gains, traditionalExtra);
  }
  // Income-tested benefits for one year (annual dollars). Fills the module-level scratch object BEN (read the
  // lines with getBenefits() right after the call; any later benefitsFor call overwrites them) and returns the
  // total. Allocation-free. Evaluation order: GIS and Allowance first (their results gate the provincial seniors
  // programs), then the child and sales-tax programs. Same-year income stands in for the prior-year return.
  const BEN = { gis: 0, allowance: 0, ccb: 0, cgeb: 0, provChild: 0, provSenior: 0, provCredit: 0, total: 0 };
  function benefitsFor(profile, gains, traditionalExtra) {
    BEN.gis = BEN.allowance = BEN.ccb = BEN.cgeb = BEN.provChild = BEN.provSenior = BEN.provCredit = BEN.total = 0;
    const couple = !profile.singlePerson,
      f = taxIndexFactor(profile.year),
      trad = traditionalExtra || 0,
      g = gains || 0;
    // Family net income: each return's income plus half the extra RRSP draw and a quarter of the gains (50 percent
    // inclusion, split evenly), as taxFor does for Quebec's family income.
    const incA = Math.max(0, profile.otherA + (couple ? trad / 2 + g / 4 : trad + g * 0.5)),
      incB = couple ? Math.max(0, profile.otherB + trad / 2 + g / 4) : 0,
      fam = incA + incB;
    const oasA = profile.oasA || 0,
      oasB = couple ? profile.oasB || 0 : 0,
      ageA = profile.ageA || 0,
      ageB = couple ? profile.ageB || 0 : 0;
    // GIS and the Allowances. A pensioner is 65 or older and receiving OAS this year.
    const pA = ageA >= 65 && oasA > 0,
      pB = couple && ageB >= 65 && oasB > 0;
    if (pA || pB || (!couple && profile.survivor && ageA >= 60 && ageA < 65)) {
      const exemption = gisEmploymentExemption(profile.earnedA || 0) + (couple ? gisEmploymentExemption(profile.earnedB || 0) : 0),
        gisInc = Math.max(0, fam - oasA - oasB - exemption);
      if (!couple) {
        if (pA) BEN.gis = gisAnnual('single', gisInc, f);
        else BEN.allowance = gisAnnual('survivorAllowance', gisInc, f);
      } else if (pA && pB) {
        BEN.gis = 2 * gisAnnual('spouseOas', gisInc, f);
      } else {
        const otherAge = pA ? ageB : ageA;
        if (otherAge >= 60 && otherAge < 65) {
          BEN.gis = gisAnnual('couplePensioner', gisInc, f);
          BEN.allowance = gisAnnual('coupleAllowance', gisInc, f);
        } else BEN.gis = gisAnnual('spouseNoOas', gisInc, f);
      }
    }
    BEN.total = BEN.gis + BEN.allowance + BEN.ccb + BEN.cgeb + BEN.provChild + BEN.provSenior + BEN.provCredit;
    return BEN.total;
  }
  function getBenefits() {
    return { ...BEN };
  }
```

Export: replace `oasAgeFactor, cppAndOasIncome, cppContribution,` with `oasAgeFactor, cppAndOasIncome, incomeTax: incomeTaxCA, benefitsFor, getBenefits, cppContribution,`.

- [ ] **Step 4: Plumb the profile and the year row**

Apply with the helper to `Planner_Canada.html`:

1. In `buildTaxProfile`, replace the `otherA`/`otherB` constants so the earned amounts are named: replace
   `const otherA =\n        Math.max(0, wageA - rrspContribA - fhsaContribA - healthPremiumA) +\n        pensionA +` with
   `const earnedA = Math.max(0, wageA - rrspContribA - fhsaContribA - healthPremiumA),\n      earnedB = Math.max(0, wageB - rrspContribB - fhsaContribB - healthPremiumB);\n    const otherA =\n        earnedA +\n        pensionA +`
   and replace `otherB =\n        Math.max(0, wageB - rrspContribB - fhsaContribB - healthPremiumB) +\n        pensionB +` with `otherB =\n        earnedB +\n        pensionB +`.
2. In the survivor-remap profile literal (`isSurvivorPeriod && deceasedIsA`), add the fields `oasA: oasGrossB, oasB: 0, earnedA: earnedB, earnedB: 0, survivor: true, dependents: dependentsInYear(CURRENT_YEAR + year),` after `year,`; in the other profile literal add `oasA: aliveA ? oasGrossA : 0, oasB: aliveB ? oasGrossB : 0, earnedA, earnedB, survivor: isSurvivorPeriod, dependents: dependentsInYear(CURRENT_YEAR + year),` after `year,`.
3. In `runProjection`, after the `if (flow >= 0) { ... } else { ... }` block that sets `totalTax` (just before `const { traditionalWithdrawn, taxableWithdrawn } = wd;`) insert:

```js
      // The year's income-tested benefits, at the final withdrawal. `totalTax` (and `tax` above) is net of
      // them, so the gross tax the rows report adds them back.
      const finalGains = flow >= 0 ? (ladderGain > 0 ? ladderGain : 0) : wd.taxableGainGross,
        finalTrad = flow >= 0 ? meltdownAmount : wd.traditionalGross;
      benefitsFor(profile, finalGains, finalTrad);
      const benefitsNow = BEN.total;
```
   In the row literal replace `tax: totalTax,` with
   `tax: totalTax + benefitsNow,\n        benefits: benefitsNow,\n        benefitGis: BEN.gis,\n        benefitAllowance: BEN.allowance,\n        benefitCcb: BEN.ccb,\n        benefitCgeb: BEN.cgeb,\n        benefitProvChild: BEN.provChild,\n        benefitProvSenior: BEN.provSenior,\n        benefitProvCredit: BEN.provCredit,`.
4. RRSP bracket optimizer: replace `lifetimeTax: sim.rows.reduce((sum, r) => sum + displayValue(r.tax, r.year), 0),` with `lifetimeTax: sim.rows.reduce((sum, r) => sum + displayValue(r.tax - (r.benefits || 0), r.year), 0),` (the objective is net cost: tax minus benefits).
5. Sankey: in `computeSankeyFlow`, after the `Taxable/brokerage` source add (before `].filter`):
   `      { label: 'GIS / Allowance', value: val((row.benefitGis || 0) + (row.benefitAllowance || 0)), color: sankeyHue('green', dark) },\n      { label: 'Child benefits', value: val((row.benefitCcb || 0) + (row.benefitProvChild || 0)), color: sankeyHue('green', dark) },\n      { label: 'Credits and provincial seniors', value: val((row.benefitCgeb || 0) + (row.benefitProvCredit || 0) + (row.benefitProvSenior || 0)), color: sankeyHue('green', dark) },`
6. Printed report: add a `Benefits` column after `Taxes`: in `projRows` after `<td>${money(displayValue(r.tax, r.year))}</td>` insert `<td>${money(displayValue(r.benefits || 0, r.year))}</td>`; in the header after `<th>Taxes</th>` insert `<th>Benefits</th>`; in the disclaimer paragraph append the sentence `"Benefits" are the income-tested payments (GIS, Allowance, child benefits, groceries benefit and provincial benefits) estimated on the same year's income.`
7. CSV: in `columns` add `['tax', 'Taxes'], ['benefits', 'Income-tested benefits'], ['benefitGis', 'GIS'], ['benefitAllowance', 'Allowance'], ['benefitCcb', 'Canada Child Benefit'], ['benefitCgeb', 'Groceries and essentials benefit'], ['benefitProvChild', 'Provincial child benefits'], ['benefitProvSenior', 'Provincial seniors benefits'], ['benefitProvCredit', 'Provincial credits'],` after `['workingB', 'Partner B working'],`.

- [ ] **Step 5: Update the older tests for the `incomeTax` export**

In `tests/tax_brackets.js`, in the Canada section only (lines from the second `const t = window.__test_tax;` onward, about line 272 to the end of the Canada block), replace every `t.taxFor(` with `t.incomeTax(` (about 20 occurrences between lines 497 and 591). The US block (the first `const t`) is untouched. Confirm with `grep -n "t.taxFor" tests/tax_brackets.js`: occurrences remain only in the US block (lines 125 to 132).

In `tests/survivor_symmetry.js`, add after the existing symmetric-pair assertions a case with a low-income couple aged 66 (identical partners, A dies vs B dies): the rows' `benefits`, `benefitGis` and `tax` must match to 1e-6 year by year (use the file's existing helper for running both orders).

- [ ] **Step 6: Run the tests**

Run: `node tests/benefits.js` then `node tests/tax_brackets.js` then `node tests/survivor_symmetry.js`
Expected: each prints its ok line.

Run: `npm test`
Expected: FAIL only in the Canada snapshot tests (`canada.json`, `ui_canada.json`): low-income retirees now receive GIS. Before updating the baselines, add this solver-through-a-cliff case to `tests/benefits.js` (above `await browser.close();`). It uses the shared `drawTaxable` bisection on a household whose GIS crosses the table-4 cliff at 42,768 of GIS income, and checks the draw nets at least what was asked:

```js
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
```

Also export `drawTaxable` for the test: in `window.__test_tax` add `drawTaxable,` after `benefitsFor, getBenefits,`.

- [ ] **Step 7: The income-room hook for 4A, and the cliffs register**

Add a failing test to `tests/benefits.js` (above `await browser.close();`):

```js
  // Income room under the GIS cutoff (the hook Batch 4A reads): single pensioner with GIS income 10,000 has room up to
  // the table-1 zero point of 23,112, so 13,112 more income before GIS ends. No GIS situation: room 0.
  const room = await page.evaluate((p) => window.__test_tax.gisIncomeRoom(p, 0, 0), p1);
  near(room, 23112 - 10000, 0.01, 'GIS income room, single pensioner');
  near(await page.evaluate((p) => window.__test_tax.gisIncomeRoom(p, 0, 0), prof({ otherA: 30000, ageA: 50 })), 0, 0, 'no GIS situation, no room');
```

Run: `node tests/benefits.js`. Expected: FAIL (`gisIncomeRoom` is not a function).

Implement with the helper: in `Planner_Canada.html` after `getBenefits`, add

```js
  // How much more income (extra traditional draw) the household can take before GIS and the Allowances end:
  // the hook the Canada mixed-withdrawal batch (4A) reads for its income room. Zero when no GIS situation applies.
  // Not hot: bisection over benefitsFor (benefits never rise with income, so the bisection is valid, cliffs included).
  function gisIncomeRoom(profile, gains, traditionalExtra) {
    const f = taxIndexFactor(profile.year);
    benefitsFor(profile, gains, traditionalExtra);
    if (BEN.gis + BEN.allowance <= 0) return 0;
    let lo = 0,
      hi = 200000 * f;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      benefitsFor(profile, gains, (traditionalExtra || 0) + mid);
      if (BEN.gis + BEN.allowance > 0) lo = mid;
      else hi = mid;
    }
    return hi;
  }
```

and add `gisIncomeRoom,` to `window.__test_tax` after `getBenefits,`. Run `node tests/benefits.js` (expected ok).

Register the new cliffs: in `docs/next-batches-plan.md`, in the "Cliffs and phase-outs register" table, replace the row `| Canada: GIS / Allowance, CCB, GST/HST credit | (7L) | net family income | 7L |` with three rows: GIS and Allowances (table knots in `BENEFIT_RULES.gis`: 50 percent and 25 percent reductions, top-up reductions, the 42,768 cliff in table 4; keyed on net income less OAS and the employment exemption, combined for couples), the CGEB (5 percent over 46,432, single supplement 2 percent over 11,564), and the CCB (reduction from 38,237 and 82,847 by child count), each "Added by 7L". Apply with the edit helper.

- [ ] **Step 8: Update the baselines for the intended change and commit**

Run: `git diff --stat tests/snapshots/` (empty), `npm run snapshot:update`, `git diff --stat tests/snapshots/`.
Expected: only `canada.json` and `ui_canada.json`. Run `node tests/snapshot_ui.js` alone if it flakes. Run `npm test`.
Expected: all pass.

```bash
git add -A tests docs Planner_Canada.html
git commit -m "7L: net-tax taxFor, GIS and Allowance in the engine, benefit lines in rows, Sankey, table and CSV, income-room hook"
```

---

### Task 5: CCB and Canada Groceries and Essentials Benefit, with the children plumbing

**Files:**
- Modify: `Planner_Canada.html` (`benefitsFor`, the Canada `DYN.children` note text)
- Test: `tests/benefits.js`

**Interfaces:**
- Consumes: `profile.dependents` (array of `{ age, student, qualifyingChild }`, from Task 4), `BENEFIT_RULES.cgeb`, `BENEFIT_RULES.ccb`.
- Produces: `BEN.cgeb` and `BEN.ccb` filled by `benefitsFor`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/benefits.js` before `await browser.close();`:

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/benefits.js`
Expected: FAIL (`cgeb` and `ccb` are 0).

- [ ] **Step 3: Implement**

Apply with the helper to `Planner_Canada.html`: in `benefitsFor`, replace the line `    BEN.total = BEN.gis + BEN.allowance + BEN.ccb + BEN.cgeb + BEN.provChild + BEN.provSenior + BEN.provCredit;` with the block below (the same total line follows it).

```js
    // Canada Groceries and Essentials Benefit (ITA 122.5(3.005)): amounts and cutoffs scale with f from 2027.
    const kids = profile.dependents || NO_DEPENDENTS;
    {
      const R = BENEFIT_RULES.cgeb;
      let n = 0;
      for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.childMaxAge) n++;
      let a = R.adult * f;
      if (couple) a += (R.spouse + R.child * n) * f;
      else if (n > 0) a += (R.eligibleDependant + R.child * (n - 1) + R.singleParentExtra) * f;
      else a += Math.min(R.singleSupplement.max * f, Math.max(0, R.singleSupplement.rate * (fam - R.singleSupplement.from * f)));
      BEN.cgeb = Math.max(0, a - R.reduction.rate * Math.max(0, fam - R.reduction.from * f));
    }
    // Canada Child Benefit: per child by age band, reduced by the number of children on family net income.
    if (kids.length) {
      const R = BENEFIT_RULES.ccb;
      let n = 0,
        sum = 0;
      for (let i = 0; i < kids.length; i++) {
        const age = kids[i].age;
        if (age > R.amounts[1].maxAge) continue;
        n++;
        sum += (age <= R.amounts[0].maxAge ? R.amounts[0].amount : R.amounts[1].amount) * f;
      }
      if (n > 0) {
        const idx = Math.min(n, 4) - 1,
          RR = R.reduction,
          from1 = RR.from1 * f,
          from2 = RR.from2 * f;
        const red = fam <= from1 ? 0 : fam <= from2 ? RR.rate1[idx] * (fam - from1) : RR.base2[idx] * f + RR.rate2[idx] * (fam - from2);
        BEN.ccb = Math.max(0, sum - red);
      }
    }
    BEN.total = BEN.gis + BEN.allowance + BEN.ccb + BEN.cgeb + BEN.provChild + BEN.provSenior + BEN.provCredit;
```

Also update the Canada children list note (the `DYN.children` spec text that says Canada does not use the list yet; find it with `grep -n "not used yet" Planner_Canada.html`) to say the children now feed the Canada Child Benefit and the groceries benefit, and revise the matching `tests/snapshots/ui_canada.json` text during the baseline update.

- [ ] **Step 4: Run the tests**

Run: `node tests/benefits.js`
Expected: `benefits tests ok`.

Run: `npm test`
Expected: FAIL only in the Canada snapshots (every household now receives the CGEB at low income). Update: `git diff --stat tests/snapshots/` (empty), `npm run snapshot:update`, `git diff --stat tests/snapshots/` (only `canada.json`, `ui_canada.json`), `npm test`.
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A tests Planner_Canada.html
git commit -m "7L: Canada Child Benefit and Canada Groceries and Essentials Benefit, children plumbed into the Canada engine"
```

---

### Task 6: Provincial rows for ON, BC, AB and QC

**Files:**
- Modify: `Planner_Canada.html` (`benefitsFor`)
- Test: `tests/benefits.js`

**Interfaces:**
- Consumes: Task 1's rows `ocb`, `ostc`, `bcfb`, `acfb`, `absb`, `qcfa`; `state.province` (lowercase code); `BEN.gis > 0` and `oasA/oasB` for the seniors row.
- Produces: `BEN.provChild`, `BEN.provSenior`, `BEN.provCredit`.

- [ ] **Step 1: Verify the Ontario Child Benefit reduction rate (data step)**

Open https://www.ontario.ca/page/ontario-child-benefit (Claude in Chrome if the page blocks automated fetches) and read the reduction rule. The table row carries 8 percent over 26,865 on the family total as `verified: secondary`. If the page states a different rule, change the `ocb` row and the evaluator below; if it states the same, change `reduction: 'secondary'` to `'primary'` in that row and add the URL to its `notes`. If the page cannot be read, leave `secondary` (it is already on the verification backlog). Regenerate `docs/benefits-rules.md`.

- [ ] **Step 2: Write the failing tests**

Append to `tests/benefits.js` before `await browser.close();`. A helper switches province for a case (the evaluator reads `state.province`):

```js
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
```

- [ ] **Step 2b: Run to verify it fails**

Run: `node tests/benefits.js`
Expected: FAIL (provincial lines are 0).

- [ ] **Step 3: Implement the provincial evaluators**

Apply with the helper to `Planner_Canada.html`: in `benefitsFor`, replace the line `    BEN.total = BEN.gis + BEN.allowance + BEN.ccb + BEN.cgeb + BEN.provChild + BEN.provSenior + BEN.provCredit;` with the block below (the total line follows).

```js
    // Provincial paid benefits. The province row set is small and fixed, so dispatch is a switch on the code.
    switch (state.province) {
      case 'on': {
        // Ontario Sales Tax Credit: like the CGEB, per adult and child under 19, reduced over a threshold.
        const R = BENEFIT_RULES.ostc;
        let n = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.childMaxAge) n++;
        const people = (couple ? 2 : 1) + n,
          from = (couple || n > 0 ? R.reduction.from : R.reduction.fromSingle) * f;
        BEN.provCredit = Math.max(0, R.adult * f * people - R.reduction.rate * Math.max(0, fam - from));
        // Ontario Child Benefit: per child under 18, family total reduced over a threshold.
        const O = BENEFIT_RULES.ocb;
        let m = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= O.maxAge) m++;
        if (m > 0) BEN.provChild = Math.max(0, O.amountPerChild * f * m - O.reduction.rate * Math.max(0, fam - O.reduction.from * f));
        break;
      }
      case 'bc': {
        // BC Family Benefit: per child by order, a floor between the two thresholds, a second reduction above.
        const R = BENEFIT_RULES.bcfb;
        let m = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.maxAge) m++;
        if (m > 0) {
          let max = 0,
            floor = 0;
          for (let i = 0; i < m; i++) {
            max += R.amounts[Math.min(i, 2)];
            floor += R.floors[Math.min(i, 2)];
          }
          if (!couple) max += R.singleParentFirstChild;
          max *= f;
          floor *= f;
          const t1 = R.reduction.from1 * f,
            t2 = R.reduction.from2 * f;
          let v = max - R.reduction.rate * Math.max(0, fam - t1);
          if (fam <= t2) v = Math.max(v, floor);
          else v = Math.max(0, floor - R.reduction.rate * (fam - t2));
          BEN.provChild = Math.max(0, v);
        }
        break;
      }
      case 'ab': {
        // Alberta Child and Family Benefit: base reduced by child count over a threshold, plus a working component.
        const R = BENEFIT_RULES.acfb;
        let m = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.maxAge) m++;
        if (m > 0) {
          const idx = Math.min(m, 4) - 1,
            earned = (profile.earnedA || 0) + (couple ? profile.earnedB || 0 : 0);
          const base = Math.max(0, R.baseMax[idx] * f - R.baseRate[idx] * Math.max(0, fam - R.baseFrom * f));
          const phaseIn = Math.min(R.workingMax[idx] * f, R.workingPhaseInRate * Math.max(0, earned - R.workingPhaseInFrom * f));
          const working = Math.max(0, phaseIn - R.workingRate[idx] * Math.max(0, fam - R.workingFrom * f));
          BEN.provChild = base + working;
        }
        // Alberta Seniors Benefit: needs a partner (or the person) receiving OAS; income is net income less OAS,
        // GIS and up to 3,600 of employment income; a couple is one benefit on combined income.
        const S = BENEFIT_RULES.absb;
        if (pA || pB) {
          const used = Math.max(0, fam - oasA - oasB - Math.min(S.employmentDeduction * f, (profile.earnedA || 0) + (couple ? profile.earnedB || 0 : 0)));
          const row = couple ? S.couple : S.single;
          BEN.provSenior = Math.max(0, row.max * f - row.rate * used);
        }
        break;
      }
      case 'qc': {
        // Quebec Family Allowance: per child (plus a single-parent supplement once), linear between the reduction
        // threshold and the income where the minimum is reached.
        const R = BENEFIT_RULES.qcfa;
        let m = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.maxAge) m++;
        if (m > 0) {
          const from = (couple ? R.from.twoParent : R.from.oneParent) * f,
            to = R.to * f,
            share = fam <= from ? 0 : fam >= to ? 1 : (fam - from) / (to - from); // 0 = maximum, 1 = minimum
          let v = m * (R.perChild.max - (R.perChild.max - R.perChild.min) * share);
          if (!couple) v += R.singleParentSupplement.max - (R.singleParentSupplement.max - R.singleParentSupplement.min) * share;
          BEN.provChild = v * f;
        }
        break;
      }
    }
    BEN.total = BEN.gis + BEN.allowance + BEN.ccb + BEN.cgeb + BEN.provChild + BEN.provSenior + BEN.provCredit;
```

- [ ] **Step 4: Run the tests**

Run: `node tests/benefits.js`
Expected: `benefits tests ok`.

Run: `npm test`
Expected: FAIL only in the Canada snapshots for Ontario households (OSTC applies to everyone Ontario below the thresholds; the default scenario is Ontario) and any BC/AB/QC scenarios with children or seniors. Update: `git diff --stat tests/snapshots/` (empty), `npm run snapshot:update`, `git diff --stat tests/snapshots/` (only Canada files), `npm test`.
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A tests docs Planner_Canada.html
git commit -m "7L: provincial benefits for ON, BC, AB and QC (OSTC, OCB, BC Family Benefit, ACFB, Alberta Seniors Benefit, Quebec Family Allowance)"
```

---

### Task 7: Ontario Energy and Property Tax Credit, Ontario senior homeowners' grant, Quebec solidarity credit and work premium

Figures are the CRA 2026 OEPTC calculation sheets (primary, read 2026-10-05: the sheets for married or common-law individuals, married seniors, single individuals with no children or sole care of a child, single seniors with no children or sole care of a child), Finance Quebec "Parameters of the Personal Income Tax System for 2026" Tables 3 and 4 (primary, November 2025), and, as interim values awaiting the owner's source check, the Ontario senior homeowners' grant thresholds (from the ontario.ca grant page as quoted by a search summary) and the work premium phase-in rates (derived below). All interim values are marked `secondary` in the table and are on the verification backlog.

**The energy component is computed, not skipped:** line 7 of every CRA sheet adds the occupancy cost (20 percent of rent plus property tax) into the energy component, which is capped at 290. Only the long-term-care and on-reserve energy parts (lines 5 and 6) are not modeled.

**Derivations recorded in the rows (arithmetic checks):**
- Work premium reduction rate 10 percent: the zero point of each premium is its reduction threshold plus its maximum divided by 0.10: 12,808 + 31,224 = 44,032 and 19,828 + 40,570 = 60,398, which equal the family allowance reduction thresholds in the same table (the document says they coincide).
- Phase-in rates: each maximum equals rate x (threshold - exclusion): 1,207.33 / (12,808 - 2,400) = 0.1160 (living alone), 1,882.45 / (19,828 - 3,600) = 0.1160 (couple), 3,122.40 / 10,408 = 0.3000 (single parent), 4,057.00 / 16,228 = 0.2500 (couple with children). A search summary independently gives 11.6 percent. Marked `secondary`.
- Solidarity credit: 363 + 172 + 746 = 1,281 for a person living alone (the published maximum for a single person) and 363 + 363 + 906 + 2 x 158 = 1,948 for a couple with two children, with a 6 percent reduction over 43,195: 43,195 + 1,281 / 0.06 = 64,545 and 43,195 + 1,632 / 0.06 = 70,395, the published ceilings. The 6 percent rate (3 percent when only one component applies) is from a search summary; the arithmetic matches the published ceilings. Marked `secondary`.

**Files:**
- Modify: `Planner_Canada.html` (`BENEFIT_RULES` rows; `housingForYear` return objects; `buildTaxProfile` and its call; `benefitsFor`; `__test_tax`)
- Modify: `tests/benefit_rules.js` (ids and kinds), `tests/benefits.js`
- Modify: `docs/benefits-rules.md` (regenerate), `docs/next-batches-plan.md` (backlog rows)

**Interfaces:**
- Consumes: `benefitsFor`'s `switch (state.province)`, `kids`, `fam`, `f`, `couple`, `ageA`, `ageB` (Task 6).
- Produces: `housingForYear` results gain `rentPaid` and `propertyTaxPaid` (annual nominal dollars, zero when not applicable); profile fields `rentPaid`, `propertyTaxPaid`; rows `oshptg`, `oeptc`, `qcsol`, `qcwp` in `BENEFIT_RULES`; new kinds `occupancyCredit` and `quebecCredit`. `BEN.provCredit` now includes the Ontario Energy and Property Tax Credit and the Quebec credits; `BEN.provSenior` includes the Ontario grant.

- [ ] **Step 1: Add the table rows and update the coverage test (failing first)**

In `tests/benefit_rules.js` change the lists to `const IDS = ['gis', 'oas', 'cgeb', 'ccb', 'ocb', 'ostc', 'bcfb', 'acfb', 'absb', 'qcfa', 'oeptc', 'oshptg', 'qcsol', 'qcwp'];` and `const KINDS = ['gisAllowance', 'oasPension', 'familyCredit', 'childSchedule', 'seniorSupplement', 'occupancyCredit', 'quebecCredit'];`; in the loop change the provincial-kind check to `['childSchedule', 'familyCredit', 'seniorSupplement', 'occupancyCredit', 'quebecCredit']`, and add `if (r.kind === 'occupancyCredit' && r.scope !== 'on') fails.push(...)` and `if (r.kind === 'quebecCredit' && r.scope !== 'qc') fails.push(...)` (use the file's `fails.push(\`${id}: ...\`)` form).

Run: `node tests/benefit_rules.js`. Expected: FAIL (`oeptc: missing` and the other three).

Insert these rows before the closing `};` of `BENEFIT_RULES` (after `qcfa`), with the helper:

```js
    oshptg: {
      name: 'Ontario Senior Homeowners Property Tax Grant',
      kind: 'occupancyCredit',
      scope: 'on',
      source: 'https://www.ontario.ca/page/senior-homeowners-property-tax-grant',
      asOf: '2026-01-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'secondary', thresholds: 'secondary' },
      indexing: { amountsAndThresholds: false },
      dependsOn: [],
      style: 'oshptg',
      seniorAge: 64,
      max: 500,
      singleFrom: 35000,
      coupleFrom: 45000,
      rate: 0.0333,
      notes: 'Up to 500 a year for a homeowner aged 64 or older who pays property tax: full at family net income of 35,000 or less (45,000 for a couple), reduced by 3.33 percent of the excess, nil at 50,000 (60,000). Figures are from a summary of the ontario.ca page and are on the verification backlog. Not indexed (500 since 2010).',
    },
    oeptc: {
      name: 'Ontario Energy and Property Tax Credit',
      kind: 'occupancyCredit',
      scope: 'on',
      source: 'https://www.canada.ca/en/revenue-agency/services/child-family-benefits/provincial-territorial-programs/ontario-energy-property-tax-credit-oeptc-calculation-sheets/2026-ontario-energy-property-tax-credit-calculation-sheets.html',
      asOf: '2026-07-01',
      retrieved: '2026-10-05',
      verified: { formula: 'primary', amounts: 'primary' },
      indexing: { amountsAndThresholds: true },
      dependsOn: ['oshptg'],
      style: 'oeptc',
      seniorAge: 64,
      rentRate: 0.2,
      propertyTaxRate: 0.1,
      reductionRate: 0.02,
      nonSenior: { propertyTaxCap: 944, propertyTaxAdd: 73, energyCap: 290, fromSingle: 29047, fromCouple: 36309, fromSingleParent: 36309 },
      senior: { propertyTaxCap: 581, propertyTaxAdd: 617, energyCap: 290, fromSingle: 36309, fromCouple: 43571, fromSingleParent: 43571 },
      notes: 'CRA 2026 calculation sheets. Occupancy cost is 20 percent of rent plus property tax. Energy component is the lesser of the occupancy cost and 290; property tax component is the lesser of the occupancy cost and (10 percent of it, capped, plus a fixed add-on); less 2 percent of family net income over the threshold. Seniors (either spouse 64 or older) use the senior figures and, with a senior homeowners grant, the credit plus the grant cannot exceed the energy component plus the occupancy cost. The long-term-care and on-reserve energy lines and the student residence 25 dollars are not modeled. Children matter only for a single filer (the sole-care sheet).',
    },
    qcsol: {
      name: 'Quebec Solidarity Tax Credit (QST and housing components)',
      kind: 'quebecCredit',
      scope: 'qc',
      source: 'https://cdn-contenu.quebec.ca/cdn-contenu/adm/min/finances/publications-adm/parametres/AUTEN_IncomeTax2026.pdf',
      asOf: '2026-07-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', reduction: 'secondary' },
      indexing: { amountsAndThresholds: true },
      dependsOn: [],
      style: 'solidarity',
      childMaxAge: 17,
      qst: { basic: 363, spouse: 363, livingAlone: 172 },
      housing: { couple: 906, singleOrParent: 746, child: 158 },
      reductionFrom: 43195,
      reductionRate: 0.06,
      notes: 'Finance Quebec Table 4, July 2026 to June 2027. A single person or single parent gets the basic and living-alone QST amounts; a couple gets the basic and spouse amounts; housing is the couple or single amount plus 158 per dependent child, for owners and tenants alike. Reduced by 6 percent of family income over 43,195 (3 percent applies when only one component is received: not modeled). The northern village component is not modeled.',
    },
    qcwp: {
      name: 'Quebec Work Premium (general)',
      kind: 'quebecCredit',
      scope: 'qc',
      source: 'https://cdn-contenu.quebec.ca/cdn-contenu/adm/min/finances/publications-adm/parametres/AUTEN_IncomeTax2026.pdf',
      asOf: '2026-01-01',
      retrieved: '2026-10-05',
      verified: { maxima: 'primary', thresholds: 'primary', rates: 'secondary' },
      indexing: { amountsAndThresholds: true },
      dependsOn: [],
      style: 'workPremium',
      childMaxAge: 17,
      exclusion: { single: 2400, couple: 3600 },
      reductionRate: 0.1,
      situations: {
        alone: { rate: 0.116, threshold: 12808 },
        coupleNoKids: { rate: 0.116, threshold: 19828 },
        singleParent: { rate: 0.3, threshold: 12808 },
        coupleKids: { rate: 0.25, threshold: 19828 },
      },
      notes: 'Finance Quebec Table 3 (2026 maxima 1,207.33 / 1,882.45 / 3,122.40 / 4,057.00 and the two reduction thresholds) and the work income exclusions of 2,400 and 3,600. Premium = rate x (the lesser of work income and the threshold, less the exclusion) less 10 percent of family income over the threshold. The rates are derived from the table maxima (maximum / (threshold - exclusion)); 11.6 percent is also in a search summary. Work income is wages. The adapted work premium and the supplement are not modeled; full-time student and other eligibility exclusions are not modeled.',
    },
```

Regenerate the doc: `node scripts/gen-benefit-rules.js`. Run `node tests/benefit_rules.js`. Expected: `benefit rules coverage ok`.

- [ ] **Step 2: Write the failing evaluator tests**

Append to `tests/benefits.js` before `await browser.close();` (uses `prof`, `kid`, `near` and `withProv` from earlier tasks; `prof` spreads overrides so `rentPaid` and `propertyTaxPaid` pass through):

```js
  // --- Ontario Energy and Property Tax Credit (CRA 2026 sheets) and senior homeowners grant ---
  // (a) Couple, both under 64, renting 18,000, family income 50,000, no children.
  //     Occupancy 0.20 x 18,000 = 3,600; energy min(3,600, 290) = 290; property tax component min(10% x 3,600 = 360, 944) + 73
  //     = 433, capped at 3,600 -> 433; credit 723 (the CRA example: a 1,500 a month renter gets 723) less 2% x (50,000 - 36,309)
  //     = 273.82 -> 449.18. Sales tax credit: 2 adults 756 less 4% x 13,691 = 547.64 -> 208.36. provCredit = 657.54.
  let o = await withProv('on', prof({ otherA: 25000, otherB: 25000, ageA: 40, ageB: 40, singlePerson: false, rentPaid: 18000 }));
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
```

Run: `node tests/benefits.js`. Expected: FAIL (`housingForYear` is not exported; the Ontario and Quebec credits are 0).

- [ ] **Step 3: Plumb rent and property tax**

Apply with the helper to `Planner_Canada.html`:

1. `housingForYear`: after `const rent = state.rent * 12 * Math.pow(1 + pct(state.rentGrowth), year);` add `const propertyTaxPaid = ownsHome ? state.propertyTax * Math.pow(1 + pct(state.propertyTaxGrowth), year) : 0;`. Add `rentPaid: 0, propertyTaxPaid,` to the object returned in the `state.tenure === 'own'` branch; `rentPaid: rent, propertyTaxPaid: 0,` to the `state.tenure === 'rent' || year < futureBuy.buyYear` return; and `rentPaid: 0, propertyTaxPaid,` to the final return.
2. In `runProjection`, `const housingYear = housingForYear(year, factor, schedule, futureBuy, bal.fhsa);` is already a result object: pass `rentPaid: housingYear.rentPaid, propertyTaxPaid: housingYear.propertyTaxPaid,` into the `buildTaxProfile({ ... })` call (next to `inv`), add `rentPaid, propertyTaxPaid,` to `buildTaxProfile`'s parameter list, and add `rentPaid, propertyTaxPaid,` to both profile literals (after `dependents`). A survivor profile keeps the household's rent and property tax.
3. Export: replace `benefitsFor, getBenefits,` with `benefitsFor, getBenefits, housingForYear,` in `__test_tax` (keep any other names already there).

- [ ] **Step 4: Implement the evaluators**

Apply with the helper to `Planner_Canada.html`, in `benefitsFor`'s `switch (state.province)`:

1. In `case 'on':` replace the closing `break;` of that case (the one after the Ontario Child Benefit block) with the block below, then the `break;`.

```js
        // Ontario senior homeowners property tax grant, then the Energy and Property Tax Credit (which reads it).
        // Occupancy cost is 20 percent of rent plus property tax (CRA 2026 calculation sheets, step 1).
        {
          const H = BENEFIT_RULES.oshptg,
            E = BENEFIT_RULES.oeptc,
            ptPaid = profile.propertyTaxPaid || 0,
            occ = E.rentRate * (profile.rentPaid || 0) + ptPaid,
            senior = ageA >= E.seniorAge || (couple && ageB >= E.seniorAge);
          let grant = 0;
          if (senior && ptPaid > 0) grant = Math.max(0, H.max - H.rate * Math.max(0, fam - (couple ? H.coupleFrom : H.singleFrom)));
          if (occ > 0) {
            let childUnder18 = false;
            for (let i = 0; i < kids.length; i++) if (kids[i].age <= 17) childUnder18 = true;
            const P = senior ? E.senior : E.nonSenior,
              from = (couple ? P.fromCouple : childUnder18 ? P.fromSingleParent : P.fromSingle) * f,
              energy = Math.min(P.energyCap * f, occ),
              propertyTax = Math.min(Math.min(E.propertyTaxRate * occ, P.propertyTaxCap * f) + P.propertyTaxAdd * f, occ);
            let credit = Math.max(0, energy + propertyTax - E.reductionRate * Math.max(0, fam - from));
            // Step 5: with a grant, the credit plus the grant cannot exceed the energy component plus the occupancy cost.
            if (grant > 0) credit = Math.max(0, credit - Math.max(0, Math.max(0, grant + credit - energy) - occ));
            BEN.provCredit += credit;
          }
          BEN.provSenior += grant;
        }
```

   Also change the Ontario Sales Tax Credit assignment `BEN.provCredit = Math.max(0, R.adult * f * people - ...)` to start from zero but be an assignment as is (it runs first, so `+=` above is correct).

2. In `case 'qc':` replace the closing `break;` of that case with the block below, then the `break;`.

```js
        // Quebec Solidarity Tax Credit (QST and housing components), Finance Quebec Table 4.
        {
          const S = BENEFIT_RULES.qcsol,
            W = BENEFIT_RULES.qcwp;
          let m = 0;
          for (let i = 0; i < kids.length; i++) if (kids[i].age <= S.childMaxAge) m++;
          const amount = (S.qst.basic + (couple ? S.qst.spouse + S.housing.couple : S.qst.livingAlone + S.housing.singleOrParent) + S.housing.child * m) * f;
          BEN.provCredit += Math.max(0, amount - S.reductionRate * Math.max(0, fam - S.reductionFrom * f));
          // Work premium: needs work income above the exclusion; maximum reached at the threshold, then reduced by family income.
          const earned = (profile.earnedA || 0) + (couple ? profile.earnedB || 0 : 0),
            exclusion = (couple ? W.exclusion.couple : W.exclusion.single) * f;
          if (earned > exclusion) {
            const sit = couple ? (m > 0 ? W.situations.coupleKids : W.situations.coupleNoKids) : m > 0 ? W.situations.singleParent : W.situations.alone,
              threshold = sit.threshold * f,
              premium = sit.rate * (Math.min(earned, threshold) - exclusion) - W.reductionRate * Math.max(0, fam - threshold);
            if (premium > 0) BEN.provCredit += premium;
          }
        }
```

- [ ] **Step 5: Run the tests**

Run: `node tests/benefits.js`
Expected: `benefits tests ok`.

Run: `npm test`
Expected: FAIL only in the Canada snapshots (Ontario and Quebec households with housing costs or children now receive these credits). Update: `git diff --stat tests/snapshots/` (empty), `npm run snapshot:update`, `git diff --stat tests/snapshots/` (only `canada.json` and `ui_canada.json`), `npm test`.
Expected: all pass.

- [ ] **Step 6: Record the interim values on the verification backlog**

Append rows to the verification backlog table in `docs/next-batches-plan.md` (edit helper, after the last `| 7L:` row): the Ontario grant thresholds and rate (secondary; from a search summary of the ontario.ca page); the Quebec work premium phase-in rates 11.6 / 11.6 / 30 / 25 percent (derived from the primary table maxima, to confirm on Revenu Quebec Schedule P or publication IN-245); the solidarity credit 6 percent reduction (arithmetically consistent with the published ceilings 64,545 and 70,395; confirm on Revenu Quebec); the Quebec family allowance reduction end 107,000 and linear shape (Task 6 row); the OEPTC age-64 test and monthly, same-year approximations; that the OEPTC lines 5 and 6 (long-term care, on-reserve energy) are not modeled; the work premium uses wages as work income (self-employment not modeled).

- [ ] **Step 7: Commit**

```bash
git add -A tests docs Planner_Canada.html
git commit -m "7L: Ontario Energy and Property Tax Credit and senior homeowners grant, Quebec solidarity credit and work premium"
```

---

### Task 8: Docs, version badge, final verification

**Files:**
- Modify: `Planner_Canada.html` (version badge, the "Tax treatment" callout, the OAS and benefits wording), `CLAUDE.md`, `README.md`, `docs/next-batches-plan.md`, `docs/benefits-rules.md` (regenerate)

- [ ] **Step 1: Bump the version badge once**

Apply with the helper: in `Planner_Canada.html` replace the topbar `<span>V41</span>` with `<span>V42</span>` (`grep -n "V41" Planner_Canada.html` shows the one location).

- [ ] **Step 2: Update the callout and wording**

Find the "How the model works" or "Tax treatment" callout (`grep -n "Tax treatment" Planner_Canada.html`) and add a sentence: the planner now models the Guaranteed Income Supplement, Allowance, Canada Child Benefit, Canada Groceries and Essentials Benefit and provincial benefits for Ontario, BC, Alberta and Quebec, paid on the same year's income, and OAS gets the 10% increase from age 75 (enter the 65 to 74 amount). Keep it free of apostrophes.

- [ ] **Step 3: CLAUDE.md and README.md**

In `CLAUDE.md`, add a bullet to the "US vs. Canada" section describing, in the style of the 7K bullet: `BENEFIT_RULES` and its kinds, the generated `docs/benefits-rules.md` and `npm run gen:benefits`, `benefitsFor` and `BEN`, the net-tax `taxFor` / `incomeTaxCA` split (shared `drawTaxable` unchanged), the profile fields (`oasA/B`, `earnedA/B`, `survivor`, `dependents`), same-year convention, the OAS 75-plus step and the 2026 default (update for 2027; the `oasMonthly` inputs stay), the evaluation order (GIS first), and the tests `tests/benefit_rules.js`, `tests/gis_tables.js`, `tests/benefits.js`. In the Files list add the three tests and `docs/sources/`. In `README.md`'s Canada feature list add: GIS and Allowances, Canada Child Benefit, Canada Groceries and Essentials Benefit, provincial benefits (ON, BC, AB, QC), and OAS by age.

- [ ] **Step 4: 7L notes**

Append to the 7L notes in `docs/next-batches-plan.md`: what was built per commit, the before and after for the default Ontario scenario and for two low-income retirees (year by year `benefits` and tax), the timing comparison, the snapshot changes, and any gaps. Timing: with an interleaved same-process comparison (old file from `git show origin/claude/batch-3b-penalty-rules:Planner_Canada.html` against the working file, alternating rounds, medians of 7, 300 `simulate()` per round for Ontario, BC, Quebec), record the ratio; the target is within 5 percent. If `benefitsFor` costs more, move the GIS situation test inside the `if (pA || pB ...)` guard (already so) and hoist `taxIndexFactor` only when needed.

- [ ] **Step 5: Regenerate, run everything, check the US side**

Run: `node scripts/gen-benefit-rules.js` then `npm run check:shared` then `npm test`.
Expected: all pass. Then `git diff --stat origin/claude/batch-3b-penalty-rules -- Planner_US.html tests/snapshots/us.json tests/snapshots/ui_us.json shared/`
Expected: empty (US untouched).

- [ ] **Step 6: Commit and open the PR**

```bash
git add -A
git commit -m "7L: docs, version V42 and 7L notes"
git push -u origin claude/batch-7l-benefits
gh pr create --base claude/batch-3b-penalty-rules --title "7L: Canada income-tested benefits" --body "<summary of the five commits, the intended Canada snapshot changes, the named gaps, and the verification backlog items; ends with the Claude Code generated line>"
```

Then use the ccd_pr tools (`get_status`, `bind_pr` if needed). Do not merge or enable auto-merge.

---

## Self-Review

**Spec coverage.** Data model and generated doc: Task 1. GIS and Allowances, ESDC tables check: Task 2. OAS 75-plus step, 2026 default and the 2027 update note (inputs kept): Task 3. Net-tax design, evaluation order, profile plumbing, row fields, cash flow (through `tax` being net), Sankey, table and CSV, optimizer objective: Task 4. CCB and CGEB, children plumbing: Task 5. ON, BC, AB and QC provincial programs: Task 6. Ontario Energy and Property Tax Credit, senior homeowners grant, Quebec solidarity credit and work premium (interim values on the backlog): Task 7. Docs, version, timing, US untouched: Task 8. Survivor symmetry: Task 4 Step 5. Cliffs register and the 4A income-room hook (`gisIncomeRoom`): Task 4 Step 7.

**Placeholder scan.** Every step has its code, commands and expected output. Interim figures (marked secondary in the table and on the verification backlog) are named where used. The Task 8 notes step names the content to write; its numbers come from runs.

**Type consistency.** `BEN` field names (`gis, allowance, ccb, cgeb, provChild, provSenior, provCredit, total`) match across Tasks 4 to 6; row fields (`benefitGis`, `benefitAllowance`, `benefitCcb`, `benefitCgeb`, `benefitProvChild`, `benefitProvSenior`, `benefitProvCredit`, `benefits`) match the Sankey, CSV and table steps; `gisAnnual(situation, income, factor)` and `interpKnots` signatures match the tests; `incomeTax` is the export name for `incomeTaxCA` everywhere.

**Review focus mapping.** 1 (deferred OAS): Task 3 and Task 4 tests; 2 (survivor): Task 4; 3 (cliffs and zero): Task 2 edge test, Task 4 tests; 4 (children boundaries): Task 5; 5 (old saves): Task 3 `legacy_state` update.

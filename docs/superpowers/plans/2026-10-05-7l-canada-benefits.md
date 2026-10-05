# 7L Canada income-tested benefits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Model Canada's income-tested cash benefits (GIS and Allowances, CCB, Canada Groceries and Essentials Benefit, and the provincial benefits for ON, BC, AB, QC) as tax-free payments with their own output lines, priced into every withdrawal decision.

**Architecture:** A pure-literal data table `BENEFIT_RULES` (one row per program, generic evaluators per row kind) in `Planner_Canada.html`, a generated review doc and coverage test in the `PROVINCE_RULES` pattern. `benefitsFor(profile, gains, traditionalExtra)` fills a module-level scratch object. Canada `taxFor` becomes `incomeTaxCA(...) - benefitsFor(...)` so the shared withdrawal solvers see lost benefits; rows report gross tax and each benefit separately. OAS follows ESDC age bands.

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
- OAS band amounts (762.50 at 65 to 74, 838.75 at 75 and over) are quarterly-indexed ESDC figures for October to December 2026 and must be updated for 2027 (comment in the table row and in `docs/next-batches-plan.md`).

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

1. **Deferred or absent OAS.** A 66-year-old with `oasStartAge` 70 gets no OAS and no GIS; the spouse is then "spouse without OAS" (table 3). `oasStartAge` 99 means no OAS at all. Task 4 pins both.
2. **Survivor transitions.** Survivor aged 60 to 64 gets the Allowance for the Survivor (table 5), at 65 the single GIS; A-dies must equal B-dies. Task 4 extends `tests/survivor_symmetry.js`.
3. **Cliffs and zero income.** Table 4's GIS spouse amount drops from 3,155.04 to 0 at 42,768; zero, negative-offset and very large incomes must give 0 (not NaN, not negative benefits). The withdrawal solve must still return net at least the need through a cliff. Task 4 pins these.
4. **Children boundaries.** Age 17 vs 18 vs 19 (CCB under 18, CGEB under 19), a child born after the year, four or more children (rates cap at the fourth), a single parent. Task 5 pins them.
5. **Old saves.** A saved state carrying `oasMonthlyA/B` loads (keys deleted) and a state with a high `oasStartAge` is accepted. Task 3 pins both in `tests/legacy_state.js`.

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
| `tests/tax_brackets.js`, `tests/survivor_symmetry.js`, `tests/golden.js` and others | Updated for `incomeTax` export and retired OAS input |
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
          const b = r.bands;
          if (!(b.length === 2 && b[0].from === 65 && b[1].from === 75 && b[1].monthly > b[0].monthly)) fails.push(`${id}: bad OAS bands`);
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
      name: 'Old Age Security pension by age band',
      kind: 'oasPension',
      scope: 'federal',
      source: 'https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/payments.html',
      asOf: '2026-10-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary' },
      indexing: { quarterlyCpi: true },
      dependsOn: [],
      // UPDATE FOR 2027: these are the October to December 2026 maximums and change every quarter.
      bands: [{ from: 65, monthly: 762.5 }, { from: 75, monthly: 838.75 }],
      notes: 'Maximum pension for 40 years of residence. Partial residence, deferral increases and the 75 plus top-up timing within the year are not modeled; the amount changes at the age band, not at a birthday month.',
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
      source: 'https://www.retraitequebec.gouv.qc.ca/en/enfants/allocation-famille/Pages/allocation-famille.aspx',
      asOf: '2026-01-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', reduction: 'secondary' },
      indexing: { amountsAndThresholds: true },
      dependsOn: [],
      style: 'qcfa',
      maxAge: 17,
      twoParent: { max: 3068, min: 1221, from: 60000, to: 107000 },
      oneParent: { max: 4145, min: 1651, from: 44000, to: 107000 },
      notes: 'Per child, from the Retraite Quebec 2026 table (owner screenshot). The reduction between the two published thresholds is assumed linear (secondary, on the verification backlog); the single-parent amount is read as per child. The school supplies and handicapped children supplements are not modeled.',
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

### Task 3: OAS by age band; retire the oasMonthly inputs

**Decision to confirm at plan review:** retiring the monthly inputs removes the only way to model a household with no OAS (for example under 10 years of residence). This task keeps the existing `oasStartAge` input and widens its range: **a value of 99 means no OAS**. No new input; the valid range text becomes "65 to 70, or 99 for none". If the owner prefers a different way to switch OAS off, change this task before executing.

**Files:**
- Modify: `Planner_Canada.html` (markup lines for `oasMonthlyA/B`; `defaults`; `FIELDS`; the `ids` list; `normalizeState`; `cppAndOasIncome`; the tornado `ss` lever; `oasStartAge` markup and tooltips; `__test_tax`)
- Modify: `tests/golden.js`, `tests/dividend_income.js`, `tests/historical_bond_yield.js`, `tests/historical_tax_indexing.js`, `tests/medical_inflation.js`, `tests/snapshot_scenarios.js`, `tests/survivor_symmetry.js`, `tests/legacy_state.js`
- Test: `tests/benefits.js` (new, created here; later tasks append)

**Interfaces:**
- Produces: `oasPensionFor(age)` returns the monthly OAS maximum for an age (0 under 65), reading `BENEFIT_RULES.oas.bands`. `cppAndOasIncome` uses it. `oasStartAge` of 99 yields zero OAS. `state.oasMonthlyA/B` no longer exist.

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

  // --- OAS by age band (ESDC, October to December 2026: 762.50 at 65 to 74, 838.75 at 75 and over) ---
  near(await t('oasPensionFor', 64), 0, 0, 'OAS at 64');
  near(await t('oasPensionFor', 65), 762.5, 1e-9, 'OAS at 65');
  near(await t('oasPensionFor', 74), 762.5, 1e-9, 'OAS at 74');
  near(await t('oasPensionFor', 75), 838.75, 1e-9, 'OAS at 75');
  near(await t('oasPensionFor', 95), 838.75, 1e-9, 'OAS at 95');

  // --- cppAndOasIncome: bands by actual age, start age gate, 99 means none ---
  const oas = (over) => page.evaluate((over) => {
    const s = window.__test_getState();
    const saved = { oasStartAgeA: s.oasStartAgeA, oasStartAgeB: s.oasStartAgeB };
    Object.assign(s, over.state);
    const r = window.__test_tax.cppAndOasIncome({ age: over.age, ageB: over.ageB, singlePerson: false, factor: 1, isSurvivorPeriod: false, deceasedIsA: false });
    Object.assign(s, saved);
    return r;
  }, over);
  let r = await oas({ age: 66, ageB: 76, state: { oasStartAgeA: 65, oasStartAgeB: 65 } });
  near(r.oasGrossA, 762.5 * 12, 1e-9, 'A at 66 gets the 65 to 74 band');
  near(r.oasGrossB, 838.75 * 12, 1e-9, 'B at 76 gets the 75 plus band');
  r = await oas({ age: 66, ageB: 66, state: { oasStartAgeA: 70, oasStartAgeB: 65 } });
  near(r.oasGrossA, 0, 0, 'A deferring to 70 gets nothing at 66');
  near(r.oasGrossB, 762.5 * 12, 1e-9, 'B at 66 starting at 65');
  r = await oas({ age: 80, ageB: 80, state: { oasStartAgeA: 99, oasStartAgeB: 99 } });
  near(r.oasGrossA + r.oasGrossB, 0, 0, 'start age 99 means no OAS');

  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  console.log('benefits tests ok');
})();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tests/benefits.js`
Expected: FAIL (`window.__test_tax.oasPensionFor` is not a function).

- [ ] **Step 3: Implement the bands and retire the inputs**

All edits to `Planner_Canada.html` with the helper:

1. Add before `function cppAndOasIncome`:

```js
  // OAS pension by age: the ESDC maximum for the band the person is in (762.50 a month at 65 to 74,
  // 838.75 at 75 and over, October to December 2026; BENEFIT_RULES.oas). Quarterly-indexed: update the
  // table for 2027. Zero under 65.
  function oasPensionFor(age) {
    const b = BENEFIT_RULES.oas.bands;
    return age >= b[1].from ? b[1].monthly : age >= b[0].from ? b[0].monthly : 0;
  }
```

2. In `cppAndOasIncome`, replace
   `let oasGrossA = (age >= state.oasStartAgeA ? state.oasMonthlyA * 12 : 0) * factor,` with
   `let oasGrossA = (age >= state.oasStartAgeA ? oasPensionFor(age) * 12 : 0) * factor,`
   and replace
   `: (ageB >= state.oasStartAgeB ? state.oasMonthlyB * 12 : 0) * factor;` with
   `: (ageB >= state.oasStartAgeB ? oasPensionFor(ageB) * 12 : 0) * factor;`

3. Markup: delete the two `<div ... class="field"> ... id="oasMonthlyA" ...</div>` and `id="oasMonthlyB"` field lines (one in Partner A's block, one `data-partner-b`). In both `oasStartAge` fields change `max="70"` to `max="99"`, the small text `Valid ages 65–70` to `Valid ages 65–70 (99 = no OAS)`, and the tooltip `data-tip` text to: `The pension follows the 2026 maximum for your age (65 to 74, or 75 and over). Real OAS rises about 0.6% for each month you defer past 65, which the planner does not apply. Enter 99 if this partner will not receive OAS (for example under 10 years of Canadian residence).` (avoid apostrophes; the file stores entities as `&#x27;`).

4. `defaults`: delete `oasMonthlyA: 742,` and `oasMonthlyB: 742,`.

5. `FIELDS`: delete the entries `{ key: 'oasMonthlyA', type: 'number' },` and `{ key: 'oasMonthlyB', type: 'number' },`.

6. `ids` list: remove `'oasMonthlyA'` and `'oasMonthlyB'` from the line that starts `'oasMonthlyA', 'oasStartAgeA', 'oasMonthlyB', 'oasStartAgeB', 'pensionYearlyA',` (leave `'oasStartAgeA', 'oasStartAgeB', 'pensionYearlyA',`).

7. `normalizeState` (inside `normalizeLists`, next to `delete s.otherIncomeEnabled;`): add `delete s.oasMonthlyA;` and `delete s.oasMonthlyB;` (retired inputs, not migrated).

8. Tornado lever `ss`: replace the whole lever with a CPP-only version:

```js
    {
      id: 'ss',
      label: 'CPP (±10%)',
      run: (endValue) => {
        const savedCppA = state.cppMonthlyA,
          savedCppB = state.cppMonthlyB;
        state.cppMonthlyA = savedCppA * 0.9;
        state.cppMonthlyB = savedCppB * 0.9;
        const decrease = endValue(simulate());
        state.cppMonthlyA = savedCppA * 1.1;
        state.cppMonthlyB = savedCppB * 1.1;
        const increase = endValue(simulate());
        state.cppMonthlyA = savedCppA;
        state.cppMonthlyB = savedCppB;
        return { decrease, increase };
      },
    },
```

9. Export: replace `gisEmploymentExemption, cppContribution,` with `gisEmploymentExemption, oasPensionFor, cppAndOasIncome, cppContribution,` in `__test_tax`.

10. Search the file for any remaining `oasMonthly` (`grep -n oasMonthly Planner_Canada.html`): expected none. Also search the tornado checkbox markup for the label text `CPP + OAS` and change it to `CPP` if it exists (`grep -n "CPP + OAS" Planner_Canada.html`).

- [ ] **Step 4: Update the existing tests that set the retired inputs**

- `tests/golden.js` lines 336 and 340, `tests/dividend_income.js` line 53, `tests/historical_bond_yield.js` line 49, `tests/historical_tax_indexing.js` line 149, `tests/medical_inflation.js` line 43: replace `['oasMonthlyA', 0]` with `['oasStartAgeA', 99]` (same position, same file style).
- `tests/survivor_symmetry.js` lines 67 to 68: delete the two `['oasMonthlyA', 800]`, `['oasMonthlyB', 800]` lines (OAS now follows the band for both identical partners).
- `tests/snapshot_scenarios.js` line 135: remove `oasMonthlyA: 742, ` from the `R oasClawback` scenario (the household now gets the band amount).
- `tests/legacy_state.js`: add two corpus cases next to the other retired-key cases, in the file's existing format: a saved state `{ oasMonthlyA: 800, oasMonthlyB: 800, oasStartAgeA: 67 }` (expected: the two keys are gone, `oasStartAgeA` is 67) and `{ oasStartAgeA: 99 }` (expected: 99 kept). Update `tests/snapshots/legacy_state.json` with `node tests/legacy_state.js --update` only after reading the diff: only `oasMonthly*` keys may disappear.

- [ ] **Step 5: Run the new test, then see what moved**

Run: `node tests/benefits.js`
Expected: `benefits tests ok`.

Run: `npm test`
Expected: FAIL only in the snapshot tests (`tests/snapshot.js` Canada baseline and `tests/snapshot_ui.js` canada, `tests/field_registry.js` if it lists retired fields) and nothing else. If anything else fails, fix that first.

- [ ] **Step 6: Update the baselines for the intended change**

Run: `git diff --stat tests/snapshots/` (should be empty), then `npm run snapshot:update`, then `git diff --stat tests/snapshots/`.
Expected: only `canada.json` and `ui_canada.json` changed (the OAS amount is now 762.50 not 742, with the 75 plus band; the retired fields leave the UI snapshot). `us.json` and `ui_us.json` must not appear. Run `npm test` again.
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A tests Planner_Canada.html
git commit -m "7L: OAS pension by ESDC age band; retire the oasMonthly inputs (oasStartAge 99 = no OAS)"
```

---

### Task 4: Net-tax design, GIS and Allowance in the engine, outputs

**Files:**
- Modify: `Planner_Canada.html` (rename `taxFor` to `incomeTaxCA` and add the net `taxFor`; add `BEN`, `benefitsFor`; `buildTaxProfile`; the `runProjection` row and cash flow; Sankey; table and CSV; RRSP optimizer objective; `__test_tax`)
- Modify: `tests/tax_brackets.js` (Canada section), `tests/survivor_symmetry.js`
- Test: `tests/benefits.js`

**Interfaces:**
- Consumes: Task 2's `gisAnnual`, `gisEmploymentExemption`; Task 3's `oasPensionFor`.
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

Export: replace `oasPensionFor, cppAndOasIncome, cppContribution,` with `oasPensionFor, cppAndOasIncome, incomeTax: incomeTaxCA, benefitsFor, getBenefits, cppContribution,`.

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

  // Quebec Family Allowance (Retraite Quebec 2026 table): two parents, 1 child, family income 83,500 = midway between
  // 60,000 and 107,000: 3,068 - (3,068 - 1,221) x 0.5 = 2,144.50 (linear between the published ends: secondary).
  o = await withProv('qc', prof({ otherA: 41750, otherB: 41750, ageA: 40, ageB: 40, singlePerson: false, dependents: [kid(5)] }));
  near(o.provChild, 3068 - (3068 - 1221) * 0.5, 1e-6, 'Quebec family allowance two parents midway');
  // Single parent at or below 44,000: 4,145 per child, 2 children = 8,290; at or above 107,000 the minimum 1,651 each.
  o = await withProv('qc', prof({ otherA: 40000, ageA: 40, dependents: [kid(5), kid(8)] }));
  near(o.provChild, 8290, 1e-6, 'Quebec family allowance single parent maximum');
  o = await withProv('qc', prof({ otherA: 120000, ageA: 40, dependents: [kid(5), kid(8)] }));
  near(o.provChild, 2 * 1651, 1e-6, 'Quebec family allowance single parent minimum');
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
        // Quebec Family Allowance: per child, linear between the published maximum and minimum income ends.
        const R = BENEFIT_RULES.qcfa;
        let m = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].age <= R.maxAge) m++;
        if (m > 0) {
          const P = couple ? R.twoParent : R.oneParent,
            from = P.from * f,
            to = P.to * f;
          const per = (fam <= from ? P.max : fam >= to ? P.min : P.max - ((P.max - P.min) * (fam - from)) / (to - from)) * f;
          BEN.provChild = per * m;
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

### Task 7: GATED. Ontario Energy and Property Tax Credit (occupancy part), Ontario senior homeowners' grant, Quebec solidarity credit and work premium

**This task cannot be written to the no-placeholder standard yet.** The calculation rules are not in hand: Ontario's occupancy-cost formula and age-band reduction (the CRA OEPTC calculation sheet), the senior homeowners' grant reduction, Revenu Quebec's 2026 solidarity credit component tables (the page text loads but the tables do not), and the work premium's rates, thresholds and work-income rules (only the 2026 maximums are known: 1,207.33 / 1,882.45 / 3,122.40 / 4,057.00, adapted 2,294.59 / 3,559.12 / 4,218.00 / 5,234.00, supplement 200 a month for up to 12 months).

**Gate:** do not execute until the owner supplies (screenshots or PDFs) these sources, or confirms the programs are to be dropped from 7L and recorded as named gaps. When the figures arrive, extend this plan with a full task in the same pattern as Task 6 (rows added to `BENEFIT_RULES` and the coverage test's id list, evaluators, hand-computed cases citing the sheet, snapshot update, commit). The evaluator hooks are already in place: `benefitsFor`'s province switch, `BEN.provCredit` and `BEN.provSenior`, `profile.earnedA/B` for work income, and `housingForYear` for rent and property tax (the engine variables `rent` and the property-tax figure are not on the profile today; the extension must add `profile.rentYear` and `profile.propertyTaxYear` in `buildTaxProfile` from `housingForYear`).

If the gate is dropped: record the four programs as named gaps in the 7L notes, `CLAUDE.md` and `README.md` (Task 8) and skip this task.

---

### Task 8: Docs, version badge, final verification

**Files:**
- Modify: `Planner_Canada.html` (version badge, the "Tax treatment" callout, the OAS and benefits wording), `CLAUDE.md`, `README.md`, `docs/next-batches-plan.md`, `docs/benefits-rules.md` (regenerate)

- [ ] **Step 1: Bump the version badge once**

Apply with the helper: in `Planner_Canada.html` replace the topbar `<span>V41</span>` with `<span>V42</span>` (`grep -n "V41" Planner_Canada.html` shows the one location).

- [ ] **Step 2: Update the callout and wording**

Find the "How the model works" or "Tax treatment" callout (`grep -n "Tax treatment" Planner_Canada.html`) and add a sentence: the planner now models the Guaranteed Income Supplement, Allowance, Canada Child Benefit, Canada Groceries and Essentials Benefit and provincial benefits for Ontario, BC, Alberta and Quebec, paid on the same year's income, and OAS follows the 2026 maximum for your age. Keep it free of apostrophes.

- [ ] **Step 3: CLAUDE.md and README.md**

In `CLAUDE.md`, add a bullet to the "US vs. Canada" section describing, in the style of the 7K bullet: `BENEFIT_RULES` and its kinds, the generated `docs/benefits-rules.md` and `npm run gen:benefits`, `benefitsFor` and `BEN`, the net-tax `taxFor` / `incomeTaxCA` split (shared `drawTaxable` unchanged), the profile fields (`oasA/B`, `earnedA/B`, `survivor`, `dependents`), same-year convention, OAS by age band (update for 2027; `oasStartAge` 99 = none; `oasMonthly` retired), the evaluation order (GIS first), and the tests `tests/benefit_rules.js`, `tests/gis_tables.js`, `tests/benefits.js`. In the Files list add the three tests and `docs/sources/`. In `README.md`'s Canada feature list add: GIS and Allowances, Canada Child Benefit, Canada Groceries and Essentials Benefit, provincial benefits (ON, BC, AB, QC), and OAS by age.

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

**Spec coverage.** Data model and generated doc: Task 1. GIS and Allowances, ESDC tables check: Task 2. OAS bands (with the 2027 update note) and retired inputs: Task 3. Net-tax design, evaluation order, profile plumbing, row fields, cash flow (through `tax` being net), Sankey, table and CSV, optimizer objective: Task 4. CCB and CGEB, children plumbing: Task 5. ON, BC, AB and QC provincial programs: Task 6. Gated programs (OEPTC, OSHPTG, Quebec solidarity and work premium): Task 7, explicitly gated. Docs, version, timing, US untouched: Task 8. Survivor symmetry: Task 4 Step 5. Cliffs register and the 4A income-room hook (`gisIncomeRoom`): Task 4 Step 7.

**Placeholder scan.** Task 7 is a declared gate, not a hidden placeholder; every other step has its code, commands and expected output. The Task 8 notes step names the content to write; its numbers come from runs.

**Type consistency.** `BEN` field names (`gis, allowance, ccb, cgeb, provChild, provSenior, provCredit, total`) match across Tasks 4 to 6; row fields (`benefitGis`, `benefitAllowance`, `benefitCcb`, `benefitCgeb`, `benefitProvChild`, `benefitProvSenior`, `benefitProvCredit`, `benefits`) match the Sankey, CSV and table steps; `gisAnnual(situation, income, factor)` and `interpKnots` signatures match the tests; `incomeTax` is the export name for `incomeTaxCA` everywhere.

**Review focus mapping.** 1 (deferred OAS): Task 3 and Task 4 tests; 2 (survivor): Task 4; 3 (cliffs and zero): Task 2 edge test, Task 4 tests; 4 (children boundaries): Task 5; 5 (old saves): Task 3 `legacy_state` cases.

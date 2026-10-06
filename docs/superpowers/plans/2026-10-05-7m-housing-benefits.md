# 7M Property-Tax and Rent Benefits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the owner chose native execution: one session, a ledger, TDD, then one fresh whole-branch review on the most capable model). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the paid benefits of the six remaining provinces that are computed from the household's rent or property tax (no new inputs): New Brunswick property tax allowance, Nova Scotia seniors property tax rebate, Manitoba homeowners credit, seniors school tax rebate and renters credit.

**Architecture:** One new data row per program in `BENEFIT_RULES` (kind `occupancyCredit`, which today is Ontario only; the coverage test is relaxed to allow `mb`, `ns`, `nb`), one new `case` in the province switch of `benefitsFor`, results added to the existing `BEN.provCredit` / `BEN.provSenior` lines (so rows, Sankey, CSV and the net-tax design need no change). Programs that read GIS (Nova Scotia) read `BEN.gis` / `BEN.allowance`, which `benefitsFor` has already filled before the switch.

**Tech Stack:** Single-file `Planner_Canada.html` (inline JS), Playwright tests under `tests/`, `scripts/gen-benefit-rules.js`.

**Spec:** No separate spec (owner ruling: the 7L design is reused). The design source is `docs/7l-benefits-spec.md` plus the 7L notes and the "Income-tested benefits (Canada, BENEFIT_RULES, 7L)" bullet of `CLAUDE.md`; research table: `docs/7m-housing-research.md` (Task 1).

## Global Constraints

- Canada only. The US engine and every `@@shared` region stay byte-identical (`npm run check:shared`).
- No new inputs. Available: both ages, income, wages, children list, province, `rentPaid`, `propertyTaxPaid` (from `housingForYear`), couple or single.
- Hot path: `benefitsFor` allocates nothing (no arrays or objects created per call; reading `R.tiers[i]` is fine).
- Each benefit adds to an existing line (`provCredit` credits and allowances, `provSenior` seniors programs); `BEN.total` is already their sum.
- Each program has a rules row with `source`, `asOf`, `retrieved`, `verified`, `indexing`, `dependsOn`, `notes`; `notes` and any planner string must contain no apostrophes (the coverage test fails on them).
- "verified: primary" only for figures read on a government page; anything else is `secondary` and goes on the backlog in `docs/next-batches-plan.md`.
- Planner files are CRLF in the working tree: edit with node scripts that normalize CRLF to LF and back, written with the file tool (no bash heredocs). After `npm run sync` or `sed -i`, convert back to CRLF and re-run `npm run check:shared`.
- ON, BC, AB, QC and all US snapshots stay byte-identical. Do not run `npm run snapshot:update` except in Task 6, and check `git diff tests/snapshots/` first. `tests/snapshot_ui.js` flakes about once per run (dashHistSuccess "85%" instead of "-"): re-run it alone.
- `npm test` passes at the end of every commit. Docs go to `docs/next-batches-plan.md` (Batch 7 notes), not `docs/reference.md`.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not merge, do not enable auto-merge.
- Where a benefit phases in as income rises the shared `drawTaxable` can over-sell; none of the programs here phase in (all are non-increasing in income): Task 6 pins that with a scan test.

## Rulings made while writing this plan (surface them in the final message)

1. **Included** (income-tested or rent/property-tax-based, all computable from existing inputs): NB Residential Property Tax Allowance; NS Property Tax Rebate for Seniors; MB Homeowners Affordability Tax Credit, Seniors' School Tax Rebate, Renters Affordability Tax Credit (with seniors top-up), all Manitoba figures from the 2025 Form MB479 (owner ruling: 2025 until the 2026 form is published).
2. **Excluded** (reason recorded in the research table and the 7M notes): PEI Provincial Tax Credit ($0.70 per $100 of assessed value: no assessment input); Manitoba Rent Assist (income support, needs a regional market-rent ceiling and basic-needs budget: no input); NS Heating Assistance Rebate (needs heating cost); SK and NL (no rent or property-tax program found; Task 1 confirms on primary pages).
3. **School tax proxy (Manitoba).** The Homeowners credit is the lesser of the maximum and *school* taxes; the planner has only total property tax. The credit is `min(1,500, propertyTaxPaid)` (the 2025 form base amount), an upper bound, marked secondary. It is not income-tested, so it adds cash but never changes a withdrawal decision.
4. **NB tier edges.** The page lists "less than 22,000", "22,001 to 25,000", "25,001 to 30,000"; the code treats income below 22,001 / 25,001 / 30,001 as the tier (whole-dollar reading). Marked in the row notes.
5. **NS GIS test.** Counted as `BEN.gis + BEN.allowance > 0` (the Allowance for the Survivor is inside `BEN.allowance`). Confirmed primary: Senior Citizens' Property Tax Rebate Regulations (S.N.S. 2018, c. 27), s. 3(b): GIS, or "the spouse's allowance or survivor's allowance under the Old Age Security Act"; s. 3(ba): GIS recipients 65 or older; s. 7: the greater of 15 and 50 percent of the property tax paid, to a maximum of 800 (https://novascotia.ca/just/Regulations/regs/scproptaxrebate.htm, read 2026-10-05). The rebate therefore has a 15 dollar floor.
6. **Indexing.** Statutory flat amounts (NB tiers, NS 800 cap and 50%, MB seniors rebate 235 and its thresholds) are not indexed (like the Ontario senior homeowners grant). The Manitoba amounts (1,500 homeowners base, 575 renters, 328.57 top-up) scale with plan inflation; the 2026 and 2027 maxima in Information Bulletin 126 are not used.
7. Output lines stay the three existing provincial lines; each program has its own rules row.

## Review Focus

- A renter with `propertyTaxPaid` 0 and an owner with `rentPaid` 0 get nothing from the other group's programs (Tasks 2 to 5 pin it).
- Household income exactly on a threshold (NB 22,001 / 25,001 / 30,001; MB seniors rebate 40,000 and 63,500): the tier and the zero point are pinned.
- Property tax smaller than the allowance (NB cap, NS half-of-tax): the benefit is the lesser, never more than tax paid.
- Survivor remap: a surviving partner in NS or MB keeps the senior programs (identical partners, A dies equals B dies) (Task 6).
- Benefits never rise with income (any new phase-in would hit the known `drawTaxable` limitation): scan test in Task 6.

## File Structure

- `Planner_Canada.html` — `BENEFIT_RULES` (add 5 rows, plus the renters row), `benefitsFor` switch (add `mb`, `ns`, `nb` cases). No other region changes.
- `tests/benefits.js` — hand-computed cases (appended before the final `await browser.close()`).
- `tests/benefit_rules.js` — `IDS` list, the occupancy-credit scope rule.
- `tests/survivor_symmetry.js` — one added case (Task 6).
- `tests/snapshot_scenarios.js`, `tests/snapshots/canada.json` — three added scenarios (Task 6).
- `docs/7m-housing-research.md` (new), `docs/benefits-rules.md` (generated), `docs/next-batches-plan.md`, `CLAUDE.md`, `README.md`.
- Scratch (not committed): `D:\Users\Alex\AppData\Local\Temp\claude\C--Users-Alex-code-Fire-Planner\d5e8e1e0-7daf-414d-b242-1aef2d96166b\scratchpad\edit_*.js`.

## Editing helper (used by every task)

Create once, in the scratchpad directory, `crlf_edit.js`:

```js
// replaceOnce(file, oldText, newText): LF-normalized exact replace, written back as CRLF. Throws unless oldText occurs once.
const fs = require('fs');
exports.replaceOnce = (file, oldText, newText) => {
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const n = src.split(oldText).length - 1;
  if (n !== 1) throw new Error(file + ': expected 1 match, found ' + n + ' for ' + oldText.slice(0, 60));
  fs.writeFileSync(file, src.replace(oldText, () => newText).replace(/\n/g, '\r\n'));
};
```

Each task's edit script `require`s it with the absolute scratchpad path and calls `replaceOnce('C:/Users/Alex/code/Fire-Planner/<file>', old, new)`.

---

### Task 1: Research gate and the research table

Docs only. Nothing is built until this is committed.

**Files:**
- Create: `docs/7m-housing-research.md`

**Interfaces:**
- Produces: a table, one row per program, with columns `Program | Province | Row kind | Figures (2026) | Test and formula | Source URL | Primary or secondary | Decision`. Task 5 reads the Renters Affordability Tax Credit row and the Seniors School Tax Rebate status row; every other task reads its own row.

- [ ] **Step 1: Fill in the rows already read on primary pages (retrieved 2026-10-05)**

| Program | Figures and rule | Source | Status |
|---|---|---|---|
| NB Residential Property Tax Allowance | Income (household combined taxable income, prior year) less than 22,000: up to 300; 22,001 to 25,000: up to 200; 25,001 to 30,000: up to 100; never more than the property tax ("you will not be refunded for the difference"); primary-residence owner who receives the Residential Property Tax Credit | https://www.gnb.ca/en/topic/family-home-community/housing-property/property-tax/property-tax-allowance.html | primary |
| NS Property Tax Rebate for Seniors | Half of the previous year's municipal residential property taxes, up to 800; must have paid them in full, be on the title, and qualify for GIS or GIS-Allowance | https://news.novascotia.ca/en/2026/07/02/applications-open-property-tax-rebate-seniors | primary |
| MB Homeowners Affordability Tax Credit | Lesser of the base amount and the school taxes on the principal residence (2025 Form MB479, page 2, lines 22 to 28): base 1,500 for 2025; Information Bulletin 126 gives 1,600 for 2026 and 1,700 for 2027 (not used, owner ruling: use 2025) | https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/manitoba/5007-tc.html | primary (2025) |
| MB Seniors School Tax Rebate | Homeowner 65 or older with family income under 63,500: school taxes less the homeowners credit (maximum 235) less 1 percent of family income over 40,000 (2025 Form MB479, page 4, lines 42 to 52) | https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/manitoba/5007-tc.html | primary (2025) |
| MB Renters Affordability Tax Credit | 575 a year (47.91 a month); household with a person 65 or older: 903.57 less 0.8214 percent of family income, reduction capped at 328.57; the credit is the lesser of the rent paid and that amount (2025 Form MB479, page 3, lines 29 to 40); 2026 maxima 625 and 357 in Information Bulletin 126 are not used (owner ruling) | https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/manitoba/5007-tc.html | primary (2025) |

- [ ] **Step 2: Close the open items on primary pages**

Questions and where to look (use Chrome via the claude-in-chrome tools if a page blocks fetches; if still HTTP 403, ask the owner for a screenshot or PDF):

1. Manitoba Renters Affordability Tax Credit: how the credit is computed from rent paid (a share of rent? the lesser of the maximum and rent?), the family-income test and reduction rate for the base credit and for the seniors top-up (a secondary summary says the top-up applies below 40,000), eligibility age. Look at the CRA "Manitoba Credits" form MB479 and its instructions for the 2025 or 2026 tax year, the CRA Manitoba information guide for the current year (https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/manitoba/5007-pc/information-residents-manitoba.html), and https://www.gov.mb.ca/finance/ (search "Renters Affordability Tax Credit").
2. Manitoba Seniors School Tax Rebate: whether it still exists for the 2025 and 2026 tax years and how it is computed now that the Education Property Tax Credit was replaced by the Homeowners Affordability Tax Credit (MB479 line list).
3. Absence checks (record the page read and the finding, one line each): Saskatchewan (no income-tested rent or property-tax program: check https://www.saskatchewan.ca/residents/taxes-and-investments/tax-credits and the Saskatchewan Housing Corporation pages), Newfoundland and Labrador (CRA NL page read: no such program; check https://www.gov.nl.ca/fin/ tax credits list), PEI (https://www.princeedwardisland.ca/en/information/finance/property-tax-credit-programs: the Provincial Tax Credit is $0.70 per $100 of assessed value, needs the assessment), New Brunswick and Nova Scotia rent programs.

- [ ] **Step 3: Apply the decision rule and write each row's Decision column**

Decision rule: formula read on a primary page: build with `verified: primary`. Formula only in a secondary source: build, mark that family `secondary`, add a backlog row in `docs/next-batches-plan.md`. No source at all for the income test or amount: do not build; list as a named gap with the reason. If the Renters credit or the Seniors rebate cannot be built, Tasks 4 or 5 shrink accordingly and the final message says so.

- [ ] **Step 4: Commit**

```bash
git add docs/7m-housing-research.md
git commit -m "7M research table: property-tax and rent programs of NB, NS and MB, exclusions"
```
(with the Co-Authored-By trailer)

---

### Task 2: New Brunswick Residential Property Tax Allowance

**Files:**
- Modify: `Planner_Canada.html` (`BENEFIT_RULES` after the `oeptc` row; `benefitsFor` switch, new `case 'nb'` after the `case 'qc'` block)
- Modify: `tests/benefit_rules.js` (IDS, occupancy scope rule)
- Modify: `tests/benefits.js`
- Modify: `docs/benefits-rules.md` (generated)

**Interfaces:**
- Produces: row id `nbpta`; adds to `BEN.provCredit`. A local test helper `housing(code, p, field, amount, line)` in `tests/benefits.js` (used by Tasks 3 to 5) returns the line's value with the field set minus the value with the field 0.

- [ ] **Step 1: Write the failing tests**

Append before the final `await browser.close();` in `tests/benefits.js`:

```js
  // --- 7M: rent and property-tax programs of NB, NS and MB. `housing` isolates one program from the other programs
  // of the province (credits, child benefits) by differencing the same household with and without the housing input.
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
  // Provinces do not leak: the same household in Ontario gets no 300 step from the NB row (Ontario credits move smoothly).
  assert(Math.abs((await housing('on', prof({ otherA: 20000, ageA: 50 }), 'propertyTaxPaid', 3000, 'provCredit')) - 300) > 1, 'the NB allowance does not apply in Ontario');
```

In `tests/benefit_rules.js` add `'nbpta'` to `IDS` (end of the array) and replace the line `if (r.kind === 'occupancyCredit' && r.scope !== 'on') fails.push(...)` with:

```js
        if (r.kind === 'occupancyCredit' && !['on', 'mb', 'ns', 'nb'].includes(r.scope)) fails.push(`${id}: an occupancy credit must be an Ontario, Manitoba, Nova Scotia or New Brunswick row`);
```

- [ ] **Step 2: Run to verify they fail**

Run: `node tests/benefit_rules.js; node tests/benefits.js`
Expected: `benefit_rules` FAIL `nbpta: missing`; `benefits.js` FAIL at `NB allowance, income 20,000` (expected 300, got 0).

- [ ] **Step 3: Add the row and the evaluator**

Write `edit_nb.js` in the scratchpad (uses `replaceOnce`). Insert this row text after the closing `},` of the `oeptc` row (anchor: the line `    qcsol: {` — put the new row before it):

```js
    nbpta: {
      name: 'New Brunswick Residential Property Tax Allowance for Low-Income Homeowners',
      kind: 'occupancyCredit',
      scope: 'nb',
      source: 'https://www.gnb.ca/en/topic/family-home-community/housing-property/property-tax/property-tax-allowance.html',
      asOf: '2026-01-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', incomeTiers: 'primary' },
      indexing: { amountsAndThresholds: false },
      dependsOn: [],
      style: 'nbpta',
      // [income below this, allowance]: the page lists less than 22,000, 22,001 to 25,000 and 25,001 to 30,000 (whole dollars).
      tiers: [[22001, 300], [25001, 200], [30001, 100]],
      notes: 'Up to 300 for household income below 22,000, 200 from 22,001 to 25,000 and 100 from 25,001 to 30,000, never more than the property tax paid; for an owner who lives in the property and receives the residential property tax credit. The page is undated; the allowance is tested on the prior-year return (same-year income stands in). The whole-dollar tier edges are a reading of the page. Not indexed.',
    },
```

and add this case just before the `}` that closes the `switch` (after the `case 'qc'` block's `break;\n      }`):

```js
      case 'nb': {
        // Residential Property Tax Allowance: a stepped rebate by household income, never more than the property tax paid.
        const R = BENEFIT_RULES.nbpta,
          pt = profile.propertyTaxPaid || 0;
        if (pt > 0) {
          let a = 0;
          for (let i = 0; i < R.tiers.length; i++)
            if (fam < R.tiers[i][0]) {
              a = R.tiers[i][1];
              break;
            }
          BEN.provCredit += Math.min(a, pt);
        }
        break;
      }
```

Use `replaceOnce` with anchors `    qcsol: {` (unique) and, for the case, the exact text `        break;\n      }\n    }\n    BEN.total =` replaced by the same text with the new case inserted before the final `    }`.

- [ ] **Step 4: Regenerate the rules doc and run the tests**

Run: `npm run gen:benefits; node tests/benefit_rules.js; node tests/benefits.js`
Expected: `benefit rules coverage ok`, `benefits tests ok`.

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test`
Expected: PASS (no snapshot change: no scenario uses NB). Then `git diff --stat tests/snapshots/` must be empty.

```bash
git add Planner_Canada.html tests/benefit_rules.js tests/benefits.js docs/benefits-rules.md
git commit -m "7M: New Brunswick residential property tax allowance"
```

---

### Task 3: Nova Scotia Property Tax Rebate for Seniors

**Files:**
- Modify: `Planner_Canada.html` (row `nsptr` after `nbpta`; `case 'ns'` after `case 'nb'`)
- Modify: `tests/benefit_rules.js` (IDS), `tests/benefits.js`, `docs/benefits-rules.md` (generated)

**Interfaces:**
- Consumes: `housing(...)`, `prof`, `kid`, `withProv` from Task 2's tests; `BEN.gis`, `BEN.allowance` (filled before the switch).
- Produces: row id `nsptr`; adds to `BEN.provSenior`.

- [ ] **Step 1: Write the failing tests**

Append before `await browser.close();`:

```js
  // Nova Scotia Property Tax Rebate for Seniors (novascotia.ca news release 2026-07-02): half of the property taxes, up
  // to 800, for someone who qualifies for GIS or the Allowance. Single 70, OAS 9,150, other income 5,000 -> GIS income
  // 5,000 (single table, positive): rebate = min(800, 0.5 x property tax).
  const ns = (inc, pt, extra = {}) => housing('ns', prof({ otherA: inc, oasA: 9150, ageA: 70, ...extra }), 'propertyTaxPaid', pt, 'provSenior');
  near(await ns(9150 + 5000, 3000), 800, 1e-9, 'NS rebate: 0.5 x 3,000 = 1,500, capped at 800');
  near(await ns(9150 + 5000, 1200), 600, 1e-9, 'NS rebate: half of 1,200');
  near(await ns(9150 + 5000, 0), 0, 0, 'NS renter: no rebate');
  // Regulation s. 7: the greater of 15 and 50 percent of the tax, to a maximum of 800: a 20 dollar bill gives 15.
  near(await ns(9150 + 5000, 20), 15, 1e-9, 'NS rebate: the 15 dollar floor');
  // Income so high that GIS is 0 (single table ends at 23,112 of GIS income): no rebate.
  near(await ns(9150 + 30000, 3000), 0, 0, 'NS rebate needs GIS: none at GIS income 30,000');
  // Just under the cutoff GIS is still positive (single table: 5.88 at 23,088): the rebate is paid.
  near(await ns(9150 + 23088, 3000), 800, 1e-9, 'NS rebate while the GIS is still positive');
  // Not a pensioner (age 50): no GIS, no rebate.
  near(await housing('ns', prof({ otherA: 5000, ageA: 50 }), 'propertyTaxPaid', 3000, 'provSenior'), 0, 0, 'NS rebate: no GIS at 50');
  // Allowance only: a survivor aged 61 with income 5,000 gets the Allowance for the Survivor (table 5) and counts as eligible.
  near(await housing('ns', prof({ otherA: 5000, ageA: 61, survivor: true }), 'propertyTaxPaid', 3000, 'provSenior'), 800, 1e-9, 'NS rebate: Allowance for the Survivor counts');
  // Couple, A 66 with OAS and B 62 (Allowance, table 4): eligible; rebate is one per household, 0.5 x 1,000 = 500.
  near(
    await housing('ns', prof({ otherA: 9150 + 3000, otherB: 0, oasA: 9150, ageA: 66, ageB: 62, singlePerson: false }), 'propertyTaxPaid', 1000, 'provSenior'),
    500, 1e-9, 'NS rebate: couple, one pensioner, one household rebate',
  );
```

Add `'nsptr'` to `IDS` in `tests/benefit_rules.js`.

- [ ] **Step 2: Run to verify they fail**

Run: `node tests/benefit_rules.js; node tests/benefits.js`
Expected: FAIL `nsptr: missing` and `NS rebate: 0.5 x 3,000 ... expected 800, got 0`.

- [ ] **Step 3: Add the row and the evaluator**

Row (insert before `    qcsol: {`):

```js
    nsptr: {
      name: 'Nova Scotia Property Tax Rebate for Seniors',
      kind: 'occupancyCredit',
      scope: 'ns',
      source: 'https://novascotia.ca/just/Regulations/regs/scproptaxrebate.htm',
      asOf: '2026-07-02',
      retrieved: '2026-10-05',
      verified: { amount: 'primary', gisTest: 'primary', survivorAllowance: 'primary' },
      indexing: { amountsAndThresholds: false },
      dependsOn: ['gis'],
      style: 'nsptr',
      max: 800,
      min: 15,
      share: 0.5,
      notes: 'Senior Citizens Property Tax Rebate Regulations s. 3(b), 3(ba) and 7: the greater of 15 and 50 percent of the actual municipal residential property tax paid, to a maximum of 800, for an owner who lives in the property and receives (or is eligible for) the Guaranteed Income Supplement, the spouse allowance or the survivor allowance. Modeled as that amount when the household receives any GIS or Allowance (the Allowance for the Survivor is inside the Allowance line). The planner property tax is the whole bill, taken as municipal. Not indexed. The 2026 amounts are also on the news release of 2026-07-02.',
    },
```

Case (after `case 'nb'`):

```js
      case 'ns': {
        // Property Tax Rebate for Seniors: half of the property tax up to a cap, for a household that receives GIS or an Allowance.
        const R = BENEFIT_RULES.nsptr,
          pt = profile.propertyTaxPaid || 0;
        if (pt > 0 && BEN.gis + BEN.allowance > 0) BEN.provSenior += Math.max(R.min, Math.min(R.max, R.share * pt));
        break;
      }
```

- [ ] **Step 4: Regenerate and test**

Run: `npm run gen:benefits; node tests/benefit_rules.js; node tests/benefits.js`
Expected: both ok.

- [ ] **Step 5: Full suite and commit**

Run: `npm test` (PASS); `git diff --stat tests/snapshots/` empty.

```bash
git add Planner_Canada.html tests/benefit_rules.js tests/benefits.js docs/benefits-rules.md
git commit -m "7M: Nova Scotia property tax rebate for seniors"
```

---

### Task 4: Manitoba Homeowners Affordability Tax Credit and Seniors School Tax Rebate (2025 Form MB479)

**Files:**
- Modify: `Planner_Canada.html` (rows `mbhatc`, `mbsstr`; `case 'mb'` after `case 'ns'`)
- Modify: `tests/benefit_rules.js` (IDS), `tests/benefits.js`, `docs/benefits-rules.md`

**Interfaces:**
- Consumes: `housing`, `prof`, `withProv` (Task 2).
- Produces: rows `mbhatc`, `mbsstr`; `case 'mb'` which Task 5 extends with the renters credit.

**Manitoba figures are those of the 2025 Form MB479** (https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/manitoba/5007-tc.html; page 2 lines 22 to 28 for the homeowners credit, page 4 lines 42 to 52 for the seniors rebate). Owner ruling: the 2026 form is not published yet, so the 2025 figures are used; the 2026 and 2027 maxima of Information Bulletin 126 (1,600 / 1,700, 625 / 675, 357 / 385.71) are not used. The rebate is the school taxes less the homeowners credit (so it is limited to the property tax left after the credit, the whole property tax standing in for school taxes), to a maximum of 235, less 1 percent of family income over 40,000.

- [ ] **Step 1: Write the failing tests**

```js
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
```

Add `'mbhatc', 'mbsstr'` to `IDS` in `tests/benefit_rules.js`.

- [ ] **Step 2: Run to verify they fail**

Run: `node tests/benefit_rules.js; node tests/benefits.js`
Expected: FAIL `mbhatc: missing`; `MB homeowners credit: capped at 1,500` got 0.

- [ ] **Step 3: Add the rows and the case** (rows `mbhatc`, `mbsstr` and `mbratc` are shown together in Task 5; add the first two now)

The Manitoba case as built (the renters block at its end belongs to Task 5; leave it out in this task):

```js
      case 'mb': {
        // Homeowners Affordability Tax Credit (school-tax proxy: the property tax) and the Seniors School Tax Rebate.
        const pt = profile.propertyTaxPaid || 0;
        if (pt > 0) {
          const H = BENEFIT_RULES.mbhatc,
            S = BENEFIT_RULES.mbsstr;
          const credit = Math.min(H.max * f, pt);
          BEN.provCredit += credit;
          // The rebate is based on school taxes less the credit received: with the whole property tax as the proxy it is limited to what is left.
          if (ageA >= S.seniorAge || (couple && ageB >= S.seniorAge)) BEN.provSenior += Math.min(pt - credit, Math.max(0, S.max - S.rate * Math.max(0, fam - S.from)));
        }
        if ((profile.rentPaid || 0) > 0) {
          // Renters Affordability Tax Credit (Form MB479 lines 29 to 40): one credit per household, plus the seniors top-up
          // reduced by family income, never more than the rent paid.
          const T = BENEFIT_RULES.mbratc;
          let c = T.max * f;
          if (ageA >= T.seniorAge || (couple && ageB >= T.seniorAge)) c += Math.max(0, T.topUp * f - T.topUpRate * fam);
          BEN.provCredit += Math.min(profile.rentPaid, c);
        }
        break;
      }
```

- [ ] **Step 4: Regenerate and test**

Run: `npm run gen:benefits; node tests/benefit_rules.js; node tests/benefits.js` - expected ok.

- [ ] **Step 5: Full suite and commit**

Run: `npm test`; `git diff --stat tests/snapshots/` empty.

```bash
git add Planner_Canada.html tests/benefit_rules.js tests/benefits.js docs/benefits-rules.md
git commit -m "7M: Manitoba homeowners credit and seniors school tax rebate"
```

---

### Task 5: Manitoba Renters Affordability Tax Credit (2025 Form MB479)

**Files:**
- Modify: `Planner_Canada.html` (row `mbratc`; extend `case 'mb'`)
- Modify: `tests/benefit_rules.js` (IDS), `tests/benefits.js`, `docs/benefits-rules.md`

**Interfaces:**
- Consumes: `housing`, `prof` (Task 2); `case 'mb'` (Task 4).
- Produces: row `mbratc`; adds to `BEN.provCredit` (base credit and seniors top-up, one line).

Formula (2025 Form MB479, page 3, lines 29 to 40): the base credit is 575 a year (47.91 a month) to a household that rents, no income test; a household with a person 65 or older gets 903.57 less 0.8214 percent of family income, the reduction capped at 328.57 (so 575 plus the larger of zero and 328.57 less 0.008214 times family income; zero top-up from 40,000); the credit is the lesser of the rent paid and that amount; one credit per household. A full year of rent is assumed whenever rent is above zero. **Hot-path note:** Manitoba skips the 125,000 early exit in `benefitsFor` because these credits have no income test: change the exit line to `if (fam > 125000 * f && !(profile.dependents && profile.dependents.length) && state.province !== 'mb') return 0;` and add the test line `MB homeowners credit is paid above the 125,000 early-exit income` (income 300,000, expected 1,500) to the homeowners tests (it fails without the change).

- [ ] **Step 1: Write the failing tests**

```js
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
```

Add `'mbratc'` to `IDS`.

- [ ] **Step 2: Run to verify they fail**

Run: `node tests/benefit_rules.js; node tests/benefits.js`
Expected: FAIL `mbratc: missing`, and `MB renters credit: 575 at low income` got 0.

- [ ] **Step 3: Add the rows and the case as built**

Rows `mbhatc`, `mbsstr` and `mbratc` (insert before `    qcsol: {`):

```js
    mbhatc: {
      name: 'Manitoba Homeowners Affordability Tax Credit',
      kind: 'occupancyCredit',
      scope: 'mb',
      source: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/manitoba/5007-tc.html',
      asOf: '2025-01-01',
      retrieved: '2026-10-05',
      verified: { baseAmount: 'primary', schoolTaxProxy: 'secondary' },
      indexing: { amounts: true },
      dependsOn: [],
      style: 'mbhatc',
      max: 1500,
      notes: 'Form MB479 for 2025 (page 2, lines 22 to 28): the lesser of the base amount, 1,500 for 2025 (Information Bulletin 126 gives 1,600 for 2026 and 1,700 for 2027; the 2025 form is the latest published, owner ruling), and the school taxes on the principal residence. No income test. The planner has only total property tax, so school taxes are proxied by the property tax paid, an upper bound. The maximum scales with plan inflation.',
    },
    mbsstr: {
      name: 'Manitoba Seniors School Tax Rebate',
      kind: 'occupancyCredit',
      scope: 'mb',
      source: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/manitoba/5007-tc.html',
      asOf: '2025-01-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', incomeTest: 'primary', schoolTaxLimit: 'primary' },
      indexing: { amountsAndThresholds: false },
      dependsOn: [],
      style: 'mbsstr',
      seniorAge: 65,
      max: 235,
      from: 40000,
      rate: 0.01,
      notes: 'Form MB479 for 2025 (page 4, lines 42 to 52): for a homeowner (either spouse) 65 or older with family income under 63,500, the school taxes less the homeowners affordability credit (maximum 235) less 1 percent of family income over 40,000. Modeled as the lesser of the property tax left after the homeowners credit (the whole property tax stands in for school taxes) and 235 less that reduction. Not indexed.',
    },
    mbratc: {
      name: 'Manitoba Renters Affordability Tax Credit',
      kind: 'occupancyCredit',
      scope: 'mb',
      source: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/tax-packages-years/general-income-tax-benefit-package/manitoba/5007-tc.html',
      asOf: '2025-01-01',
      retrieved: '2026-10-05',
      verified: { baseAmount: 'primary', seniorsTopUp: 'primary', rentLimit: 'primary' },
      indexing: { amountsAndThresholds: true },
      dependsOn: [],
      style: 'mbratc',
      max: 575,
      topUp: 328.57,
      topUpRate: 0.008214,
      seniorAge: 65,
      notes: 'Form MB479 for 2025 (page 3, lines 29 to 40): 575 a year (47.91 a month) for a renter, no income test; a household with a person 65 or older gets 903.57 less 0.8214 percent of family income, the reduction capped at 328.57 (so the credit is 575 plus the larger of zero and 328.57 less 0.008214 times family income); the credit is the lesser of the rent paid and that amount. One credit per household. A full year of rent is assumed. The 2025 form is the latest published (owner ruling); the 2026 maxima of 625 and 357 (Information Bulletin 126) are not used. Amounts and the income point scale with plan inflation.',
    },
```

The Manitoba case as built (homeowners credit, seniors rebate limited to the tax left after the credit, renters credit limited by the rent paid):

```js
      case 'mb': {
        // Homeowners Affordability Tax Credit (school-tax proxy: the property tax) and the Seniors School Tax Rebate.
        const pt = profile.propertyTaxPaid || 0;
        if (pt > 0) {
          const H = BENEFIT_RULES.mbhatc,
            S = BENEFIT_RULES.mbsstr;
          const credit = Math.min(H.max * f, pt);
          BEN.provCredit += credit;
          // The rebate is based on school taxes less the credit received: with the whole property tax as the proxy it is limited to what is left.
          if (ageA >= S.seniorAge || (couple && ageB >= S.seniorAge)) BEN.provSenior += Math.min(pt - credit, Math.max(0, S.max - S.rate * Math.max(0, fam - S.from)));
        }
        if ((profile.rentPaid || 0) > 0) {
          // Renters Affordability Tax Credit (Form MB479 lines 29 to 40): one credit per household, plus the seniors top-up
          // reduced by family income, never more than the rent paid.
          const T = BENEFIT_RULES.mbratc;
          let c = T.max * f;
          if (ageA >= T.seniorAge || (couple && ageB >= T.seniorAge)) c += Math.max(0, T.topUp * f - T.topUpRate * fam);
          BEN.provCredit += Math.min(profile.rentPaid, c);
        }
        break;
      }
```

- [ ] **Step 4: Regenerate and test**

Run: `npm run gen:benefits; node tests/benefit_rules.js; node tests/benefits.js` - expected ok.

- [ ] **Step 5: Full suite and commit**

Run: `npm test`; `git diff --stat tests/snapshots/` empty.

```bash
git add Planner_Canada.html tests/benefit_rules.js tests/benefits.js docs/benefits-rules.md
git commit -m "7M: Manitoba renters affordability tax credit"
```

---

### Task 6: Cross-checks: engine rows, no phase-in, survivors, snapshots, timing

**Files:**
- Modify: `tests/benefits.js`, `tests/survivor_symmetry.js`, `tests/snapshot_scenarios.js`, `tests/snapshots/canada.json` (generated)

**Interfaces:**
- Consumes: all rows from Tasks 2 to 5; `window.__test_simulate()` rows' `benefitProvCredit` and `benefitProvSenior` fields (see the Allowance for the Survivor engine case in `tests/benefits.js`).

- [ ] **Step 1: Engine test: the benefits reach the projection rows**

Append before `await browser.close();` in `tests/benefits.js`:

```js
  // Engine: a single 70, retired, CPP 6,000 + OAS 9,150, owning with 3,000 property tax, inflation 0 (factor 1). The row
  // fields move by exactly the program amount compared with the same plan with no property tax.
  const engine = (prov, pt) => page.evaluate(({ prov, pt }) => {
    const s = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(s));
    Object.assign(s, { province: prov, singlePerson: true, ageA: 70, retireAgeA: 70, lifeExpectancyA: 95, incomeA: 0, pensionCoverage: 'none', inflation: 0, cppMonthlyA: 500, cppStartAgeA: 65, oasMonthlyA: 762.5, oasStartAgeA: 65, taxable: 0, traditional: 0, roth: 400000, cash: 50000, spending: 20000, healthcare: 0, dividendYield: 0, tenure: 'own', propertyTax: pt, propertyTaxGrowth: 0 });
    const row = window.__test_simulate().rows.find((x) => x.ageA === 71);
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
  // and break the gisIncomeRoom bisection). Scan 0 to 150,000 in 500 steps, single 70 owner and couple 66 renter.
  for (const [code, mk] of [
    ['nb', (y) => prof({ otherA: y, ageA: 70, oasA: 9150, propertyTaxPaid: 3000 })],
    ['ns', (y) => prof({ otherA: y, ageA: 70, oasA: 9150, propertyTaxPaid: 3000 })],
    ['mb', (y) => prof({ otherA: y, ageA: 70, oasA: 9150, propertyTaxPaid: 3000, rentPaid: 0 })],
    ['mb', (y) => prof({ otherA: y / 2, otherB: y / 2, ageA: 66, ageB: 66, singlePerson: false, oasA: 9150, oasB: 9150, rentPaid: 12000 })],
  ]) {
    let prev = Infinity;
    for (let y = 9150; y <= 150000; y += 500) {
      const b = await withProv(code, mk(y));
      const v = b.provCredit + b.provSenior;
      assert(v <= prev + 1e-9, `${code}: housing programs rise with income at ${y} (${prev} -> ${v})`);
      prev = v;
    }
  }
```

(If the Task 5 renters credit was skipped the last scan row still runs: it then covers the owner-free MB credits.)

- [ ] **Step 2: Run, then fix only real failures**

Run: `node tests/benefits.js`
Expected: ok. A failure of the scan test means a program phases in: stop and report which one (do not edit the shared region). A failure of the engine test on the row field name (`ageA`) means check an existing row's field names in `window.__test_simulate().rows[0]` and adjust the finder only.

- [ ] **Step 3: Survivor symmetry case**

Read the existing low-income couple case in `tests/survivor_symmetry.js` and add a sibling with `province: 'ns'`, identical partners aged 70, `tenure: 'own'`, `propertyTax: 3000`, `propertyTaxGrowth: 0`, asserting that the row fields `benefitProvSenior` after the death year are equal in the A-dies and B-dies runs (the file's existing helper does the swap). Run `node tests/survivor_symmetry.js`; expected ok.

- [ ] **Step 4: Snapshot scenarios (additions only)**

In `tests/snapshot_scenarios.js`, next to `['R province ab', ...]` (line about 157) add:

```js
    ['R province mb', { ...R, province: 'mb' }],
    ['R province ns', { ...R, province: 'ns' }],
    ['R province nb', { ...R, province: 'nb' }],
```

Run `node tests/snapshot.js` (expected: FAIL, only the three new keys missing), then `node tests/snapshot.js --update` (not `npm run snapshot:update`, to leave the UI baselines alone). Check:

Run: `git diff --stat tests/snapshots/` then `git diff tests/snapshots/canada.json | grep '^-' | grep -v '^---'`
Expected: the second command prints nothing (additions only: every existing ON, BC, AB, QC and US entry is byte-identical; the US file is untouched). If any existing line was removed or changed, revert the file and investigate before committing.

- [ ] **Step 5: Timing**

Write a throwaway script in the scratchpad (not committed) that loads two copies of the planner in two pages (the 7L merge base from `git worktree add ../fp-base origin/claude/batch-3b-penalty-rules` and the working tree), alternates rounds of 300 `__test_simulate()` calls with `province` set to `on` and to `mb`, and prints medians of 7. Expected: `on` ratio about 1.00 (the new cases never run); `mb` ratio within the noise of 10 percent. Record the numbers for the 7M notes. Remove the worktree afterwards (`git worktree remove ../fp-base`).

- [ ] **Step 6: Full suite and commit**

Run: `npm test` — expected PASS (re-run `node tests/snapshot_ui.js` alone if it flakes).

```bash
git add tests/benefits.js tests/survivor_symmetry.js tests/snapshot_scenarios.js tests/snapshots/canada.json
git commit -m "7M: engine, survivor, no-phase-in and snapshot coverage for the housing programs"
```

---

### Task 7: Docs

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/next-batches-plan.md`, `scripts/gen-benefit-rules.js` (the line "Provinces not listed here are filled in a later batch (7M)" is only changed by the closing 7M commit, once the child and seniors programs are in; leave it now)

- [ ] **Step 1: CLAUDE.md**

In the "Income-tested benefits (Canada, BENEFIT_RULES, 7L)" bullet: change `occupancyCredit` to say it also carries the New Brunswick property tax allowance, the Nova Scotia seniors rebate and the Manitoba homeowners credit, seniors school tax rebate and renters credit (rent or property tax, added to `provCredit` / `provSenior`, unindexed except the Manitoba maxima), and that the coverage test allows `on`, `mb`, `ns` and `nb`. In the "Not built" list keep: PEI Provincial Tax Credit (assessment), Manitoba Rent Assist, NS Heating Assistance Rebate.

- [ ] **Step 2: README.md** — one line in the Canada feature list for the provincial housing programs.

- [ ] **Step 3: docs/next-batches-plan.md** — a "7M notes" section under Batch 7 with: the rulings of this plan, the research table summary and sources, exclusions with reasons, the timing numbers, the snapshot result (three scenarios added, nothing else moved), and backlog rows (MB school-tax proxy, MB seniors rebate status after 2025, NB tier edges, NS survivor Allowance, MB 2027 steps, and the Renters credit rows if secondary).

- [ ] **Step 4: Check and commit**

Run: `npm test` (PASS); `npm run check:shared` (PASS).

```bash
git add CLAUDE.md README.md docs/next-batches-plan.md
git commit -m "7M docs: housing programs of NB, NS and MB"
```

The Canada badge (V42 to V43), the children-field tip and the rest of the 7M data (child benefits, low-income credits, seniors programs) are handled by the closing 7M commits, not here, so the badge is bumped exactly once.

---

## Self-Review

- **Coverage:** owner's item 1 (add rent and property-tax programs): NB, NS, MB programs (Tasks 2 to 5); exclusions with reasons (Task 1, rulings 2); no new inputs (Global Constraints); coverage test, generator and rules doc updated per task; snapshots (Task 6); docs (Task 7). Not in this plan by design: the child, low-income-credit and seniors programs of the six provinces, the badge and the children tip (the closing 7M commits).
- **Placeholders:** the only deferred values are the Manitoba Renters credit parameters in Task 5, deliberately gated on Task 1's recorded formula, with the primary maxima, the test cases and the skip rule written out. Everything else carries code and literals.
- **Type consistency:** `BENEFIT_RULES` ids `nbpta`, `nsptr`, `mbhatc`, `mbsstr`, `mbratc`; helper `housing(code, p, field, amount, line)` defined in Task 2 and reused unchanged; `BEN.provCredit` / `BEN.provSenior` are the existing field names; `prof`, `withProv`, `kid`, `near` exist in `tests/benefits.js`.
- **Review Focus:** each of the five lines has a pinning test (Tasks 2 to 6).

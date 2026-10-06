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

1. **Included** (income-tested or rent/property-tax-based, all computable from existing inputs): NB Residential Property Tax Allowance; NS Property Tax Rebate for Seniors; MB Homeowners Affordability Tax Credit, Seniors' School Tax Rebate, Renters Affordability Tax Credit (with seniors top-up).
2. **Excluded** (reason recorded in the research table and the 7M notes): PEI Provincial Tax Credit ($0.70 per $100 of assessed value: no assessment input); Manitoba Rent Assist (income support, needs a regional market-rent ceiling and basic-needs budget: no input); NS Heating Assistance Rebate (needs heating cost); SK and NL (no rent or property-tax program found; Task 1 confirms on primary pages).
3. **School tax proxy (Manitoba).** The Homeowners credit is the lesser of the maximum and *school* taxes; the planner has only total property tax. The credit is `min(max, propertyTaxPaid)`, an upper bound, marked secondary. It is not income-tested, so it adds cash but never changes a withdrawal decision.
4. **NB tier edges.** The page lists "less than 22,000", "22,001 to 25,000", "25,001 to 30,000"; the code treats income below 22,001 / 25,001 / 30,001 as the tier (whole-dollar reading). Marked in the row notes.
5. **NS GIS test.** Counted as `BEN.gis + BEN.allowance > 0` (the Allowance for the Survivor is inside `BEN.allowance`). Confirmed primary: Senior Citizens' Property Tax Rebate Regulations (S.N.S. 2018, c. 27), s. 3(b): GIS, or "the spouse's allowance or survivor's allowance under the Old Age Security Act"; s. 3(ba): GIS recipients 65 or older; s. 7: the greater of 15 and 50 percent of the property tax paid, to a maximum of 800 (https://novascotia.ca/just/Regulations/regs/scproptaxrebate.htm, read 2026-10-05). The rebate therefore has a 15 dollar floor.
6. **Indexing.** Statutory flat amounts (NB tiers, NS 800 cap and 50%, MB seniors rebate 235 and its thresholds) are not indexed (like the Ontario senior homeowners grant). The MB Homeowners maximum scales with plan inflation (enacted: 1,600 for 2026, 1,700 for 2027; the 2027 step is ignored beyond inflation scaling and named in the notes).
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
| MB Homeowners Affordability Tax Credit | Lesser of the maximum and gross school taxes on the principal residence; maximum 1,600 for 2026, 1,700 for 2027 (reduced by 3.40 per 1,000 of assessed value over 1,000,000 from 2027); no income test | https://www.gov.mb.ca/finance/tao/hatc.html and Information Bulletin 126 (https://www.gov.mb.ca/finance/taxation/pubs/bulletins/2026budget.pdf) | primary |
| MB Seniors School Tax Rebate | Age 65 or older, owner liable for school taxes; maximum 235 for 2023 and later; reduced by 1.0 percent of net family income over 40,000; nil at 63,500; page states it is based on school taxes assessed less the education property tax credit received | https://www.manitoba.ca/seniorsrebate | primary for the figures; **status after the 2025 credit change is not confirmed** |
| MB Renters Affordability Tax Credit | 2026 maximum 625 and seniors top-up maximum 357 (2027: 675 and 385.71) | Information Bulletin 126 | primary for the maxima only |

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

### Task 4: Manitoba Homeowners Affordability Tax Credit and Seniors School Tax Rebate

**Files:**
- Modify: `Planner_Canada.html` (rows `mbhatc`, `mbsstr`; `case 'mb'` after `case 'ns'`)
- Modify: `tests/benefit_rules.js` (IDS), `tests/benefits.js`, `docs/benefits-rules.md`

**Interfaces:**
- Consumes: `housing`, `prof`, `withProv` (Task 2).
- Produces: rows `mbhatc`, `mbsstr`; `case 'mb'` which Task 5 extends with the renters credit. If Task 1 finds the Seniors School Tax Rebate no longer exists, build only `mbhatc`, drop the `mbsstr` row, its tests and the `provSenior` line of the case, and record it.

- [ ] **Step 1: Write the failing tests**

```js
  // Manitoba Homeowners Affordability Tax Credit (Information Bulletin 126; gov.mb.ca hatc page): the lesser of the
  // maximum (1,600 for 2026) and school taxes; the planner proxies school taxes by the property tax paid. No income test.
  const mbc = (inc, pt, extra = {}) => housing('mb', prof({ otherA: inc, ageA: 50, ...extra }), 'propertyTaxPaid', pt, 'provCredit');
  near(await mbc(50000, 3000), 1600, 1e-9, 'MB homeowners credit: capped at 1,600');
  near(await mbc(50000, 1000), 1000, 1e-9, 'MB homeowners credit: the property tax when smaller');
  near(await mbc(500000 / 5, 3000), 1600, 1e-9, 'MB homeowners credit has no income test');
  near(await mbc(50000, 0), 0, 0, 'MB renter: no homeowners credit');
  // Seniors School Tax Rebate (manitoba.ca/seniorsrebate): age 65 or older, 235 less 1.0 percent of family net income over
  // 40,000, nil at 63,500. Single 70 at 50,000: 235 - 0.01 x 10,000 = 135.
  const mbs = (inc, pt, extra = {}) => housing('mb', prof({ otherA: inc, ageA: 70, ...extra }), 'propertyTaxPaid', pt, 'provSenior');
  near(await mbs(50000, 3000), 135, 1e-9, 'MB seniors rebate at 50,000');
  near(await mbs(40000, 3000), 235, 1e-9, 'MB seniors rebate: maximum at 40,000');
  near(await mbs(30000, 3000), 235, 1e-9, 'MB seniors rebate: maximum below 40,000');
  near(await mbs(63500, 3000), 0, 1e-9, 'MB seniors rebate: nil at 63,500');
  near(await mbs(80000, 3000), 0, 0, 'MB seniors rebate: nil above 63,500');
  near(await mbs(50000, 0), 0, 0, 'MB seniors rebate: a renter gets none');
  near(await housing('mb', prof({ otherA: 50000, ageA: 64 }), 'propertyTaxPaid', 3000, 'provSenior'), 0, 0, 'MB seniors rebate: not at 64');
  // Couple, B is 65: the household qualifies; combined income 50,000 -> 135.
  near(
    await housing('mb', prof({ otherA: 25000, otherB: 25000, ageA: 60, ageB: 65, singlePerson: false }), 'propertyTaxPaid', 3000, 'provSenior'),
    135, 1e-9, 'MB seniors rebate: couple with one 65-year-old',
  );
```

Add `'mbhatc', 'mbsstr'` to `IDS`.

- [ ] **Step 2: Run to verify they fail**

Run: `node tests/benefit_rules.js; node tests/benefits.js`
Expected: FAIL `mbhatc: missing`; `MB homeowners credit: capped at 1,600` got 0.

- [ ] **Step 3: Add the rows and the case**

Rows (before `    qcsol: {`):

```js
    mbhatc: {
      name: 'Manitoba Homeowners Affordability Tax Credit',
      kind: 'occupancyCredit',
      scope: 'mb',
      source: 'https://www.gov.mb.ca/finance/taxation/pubs/bulletins/2026budget.pdf',
      asOf: '2026-03-24',
      retrieved: '2026-10-05',
      verified: { maximum: 'primary', schoolTaxProxy: 'secondary' },
      indexing: { amounts: true },
      dependsOn: [],
      style: 'mbhatc',
      max: 1600,
      notes: 'The lesser of the maximum and the gross school taxes on the principal residence; 1,600 for 2026 and 1,700 for 2027 (Information Bulletin 126, Budget 2026; the 2027 credit is also reduced by 3.40 per 1,000 of assessed value over 1,000,000, not modeled). No income test. The planner has only total property tax, so school taxes are proxied by the property tax paid, an upper bound. The maximum scales with plan inflation; the enacted 2027 step to 1,700 is not separately modeled.',
    },
    mbsstr: {
      name: 'Manitoba Seniors School Tax Rebate',
      kind: 'occupancyCredit',
      scope: 'mb',
      source: 'https://www.manitoba.ca/seniorsrebate',
      asOf: '2023-01-01',
      retrieved: '2026-10-05',
      verified: { amounts: 'primary', incomeTest: 'primary', status2026: 'secondary' },
      indexing: { amountsAndThresholds: false },
      dependsOn: [],
      style: 'mbsstr',
      seniorAge: 65,
      max: 235,
      from: 40000,
      rate: 0.01,
      notes: 'For an owner liable for school taxes on the principal residence, age 65 or older (either spouse): 235 for 2023 and later, reduced by 1.0 percent of net family income over 40,000, nil at 63,500. The page says the rebate is based on school taxes less the education property tax credit received; the school-tax limit is not modeled (the maximum is small against any school tax bill). Whether the page text is current after the 2025 change to the Homeowners Affordability Tax Credit is on the backlog. Not indexed.',
    },
```

Case (after `case 'ns'`):

```js
      case 'mb': {
        // Homeowners Affordability Tax Credit (school-tax proxy: the property tax) and the Seniors School Tax Rebate.
        const pt = profile.propertyTaxPaid || 0;
        if (pt > 0) {
          const H = BENEFIT_RULES.mbhatc,
            S = BENEFIT_RULES.mbsstr;
          BEN.provCredit += Math.min(H.max * f, pt);
          if (ageA >= S.seniorAge || (couple && ageB >= S.seniorAge)) BEN.provSenior += Math.max(0, S.max - S.rate * Math.max(0, fam - S.from));
        }
        break;
      }
```

- [ ] **Step 4: Regenerate and test**

Run: `npm run gen:benefits; node tests/benefit_rules.js; node tests/benefits.js` — expected ok. Note the earlier "provinces do not leak" test (`withProv('mb', ...)` at about line 183 of `tests/benefits.js`) has no property tax and no children Ontario credit, so it must still pass; if it fails, read the assertion before changing anything.

- [ ] **Step 5: Full suite and commit**

Run: `npm test`; `git diff --stat tests/snapshots/` empty.

```bash
git add Planner_Canada.html tests/benefit_rules.js tests/benefits.js docs/benefits-rules.md
git commit -m "7M: Manitoba homeowners credit and seniors school tax rebate"
```

---

### Task 5: Manitoba Renters Affordability Tax Credit (gated on Task 1)

**Files:**
- Modify: `Planner_Canada.html` (row `mbratc`; extend `case 'mb'`)
- Modify: `tests/benefit_rules.js` (IDS), `tests/benefits.js`, `docs/benefits-rules.md`

**Interfaces:**
- Consumes: the Renters Affordability Tax Credit row of `docs/7m-housing-research.md` (formula, income test, ages, source status); `housing`, `prof` (Task 2); `case 'mb'` (Task 4).
- Produces: row `mbratc`; adds to `BEN.provCredit` (base credit and seniors top-up, one line).

Recorded formula (Task 1, https://www.gov.mb.ca/finance/personal/pcredits.html and Information Bulletin 126): base credit = maximum 625 (2026) for a household that rents, no income test (1/12 of the maximum per month rented; a full year is assumed whenever `rentPaid` > 0); seniors top-up (a person aged 65 or older in the household, once per household) = 357 less 0.75% of family net income, floored at 0, so it ends at family income 47,600.

- [ ] **Step 1: Write the failing tests**

```js
  // Manitoba Renters Affordability Tax Credit (gov.mb.ca pcredits page; Information Bulletin 126): 625 for 2026 to a renter,
  // no income test; seniors top-up 357 - 0.75% x family net income, floored at 0.
  const mbr = (inc, rent, extra = {}) => housing('mb', prof({ otherA: inc, ageA: 50, ...extra }), 'rentPaid', rent, 'provCredit');
  near(await mbr(20000, 12000), 625, 1e-9, 'MB renters credit: 625 at low income');
  near(await mbr(150000, 12000), 625, 1e-9, 'MB renters credit has no income test');
  near(await mbr(20000, 0), 0, 0, 'MB owner (no rent): no renters credit');
  // Single 70, income 20,000: 625 + (357 - 0.0075 x 20,000 = 207) = 832.
  near(await mbr(20000, 12000, { ageA: 70 }), 625 + 357 - 0.0075 * 20000, 1e-9, 'MB renters credit with the seniors top-up');
  // Income 47,600 and above: the top-up is gone (357 / 0.0075 = 47,600): 625.
  near(await mbr(47600, 12000, { ageA: 70 }), 625, 1e-9, 'MB seniors top-up is nil at 47,600');
  near(await mbr(60000, 12000, { ageA: 70 }), 625, 1e-9, 'MB seniors top-up is floored at 0');
  // Couple, B is 65, combined income 40,000: one credit 625 + (357 - 300 = 57) = 682.
  near(
    await housing('mb', prof({ otherA: 20000, otherB: 20000, ageA: 60, ageB: 65, singlePerson: false }), 'rentPaid', 12000, 'provCredit'),
    625 + 357 - 0.0075 * 40000, 1e-9, 'MB renters credit: couple, one household credit, top-up once',
  );
```

Add `'mbratc'` to `IDS`.

- [ ] **Step 2: Run to verify they fail**

Run: `node tests/benefit_rules.js; node tests/benefits.js`
Expected: FAIL `mbratc: missing`, and `MB renters credit: 625 at low income` got 0.

- [ ] **Step 3: Add the row and extend the case**

Row (insert before `    qcsol: {`):

```js
    mbratc: {
      name: 'Manitoba Renters Affordability Tax Credit',
      kind: 'occupancyCredit',
      scope: 'mb',
      source: 'https://www.gov.mb.ca/finance/personal/pcredits.html',
      asOf: '2026-03-24',
      retrieved: '2026-10-05',
      verified: { maximum: 'primary', monthlyRule: 'primary', topUpRate: 'secondary' },
      indexing: { amounts: true },
      dependsOn: [],
      style: 'mbratc',
      max: 625,
      topUp: 357,
      topUpRate: 0.0075,
      seniorAge: 65,
      notes: 'A refundable credit of one twelfth of the maximum for each month rented (625 for 2026, 675 for 2027), no income test; seniors get a top-up of the top-up maximum (357 for 2026, 385.71 for 2027) less 0.75 percent of family net income. The 0.75 percent is stated on the page for the older 300 maximum and is assumed unchanged; one credit and one top-up per household, the top-up when either person is 65 or older (a reading, secondary). A full year of rent is assumed whenever rent is above zero. The maxima scale with plan inflation; the enacted 2027 steps are not separately modeled.',
    },
```

In `case 'mb'` add, after the `if (pt > 0) {...}` block and before `break;`:

```js
        if ((profile.rentPaid || 0) > 0) {
          const T = BENEFIT_RULES.mbratc;
          let c = T.max * f;
          if (ageA >= T.seniorAge || (couple && ageB >= T.seniorAge)) c += Math.max(0, T.topUp * f - T.topUpRate * fam);
          BEN.provCredit += c;
        }
```

- [ ] **Step 4: Regenerate and test**

Run: `npm run gen:benefits; node tests/benefit_rules.js; node tests/benefits.js` — expected ok.

- [ ] **Step 5: Full suite and commit**

Run: `npm test`; `git diff --stat tests/snapshots/` empty.

```bash
git add Planner_Canada.html tests/benefit_rules.js tests/benefits.js docs/benefits-rules.md
git commit -m "7M: Manitoba renters affordability tax credit"
```

If Task 1 could not source the formula: skip this task, add the program to the named gaps and the backlog (Task 7) and say so in the final message.

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
  // MB: homeowners credit 1,600 and seniors rebate 235 (income under 40,000).
  let e1 = await engine('nb', 3000), e0 = await engine('nb', 0);
  near(e1.credit - e0.credit, 300, 1e-6, 'engine, NB: allowance in the row');
  e1 = await engine('ns', 3000); e0 = await engine('ns', 0);
  near(e1.senior - e0.senior, 800, 1e-6, 'engine, NS: rebate in the row');
  e1 = await engine('mb', 3000); e0 = await engine('mb', 0);
  near(e1.credit - e0.credit, 1600, 1e-6, 'engine, MB: homeowners credit in the row');
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

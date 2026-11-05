# Traditional IRA Deduction Phase-out, IRA Basis and the Backdoor Roth: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The US planner deducts a traditional IRA contribution only up to the IRC 219(g) limit, tracks each partner's
after-tax IRA basis and recovers it pro rata, and can convert the nondeductible part to Roth the same year (the backdoor).

**Architecture:** Three PRs, in order. Each is reviewed and merged before the next starts.
- **PR 1** splits the contribution types per partner. It is a pure migration with no change to any number.
- **PR 2** adds the deduction cap, the basis ledger and basis recovery. It is the behaviour change, with an intended snapshot update.
- **PR 3** adds the backdoor checkbox.

The deduction is decided once per MAGI pass from the pass's estimates. Basis uses one pro-rata ratio per partner per year,
which stays fixed through the year's draws. The year-end basis is that ratio times the IRA's year-end dollars, plus the
nondeductible contribution.

**Tech Stack:** plain ES modules under `src/`, esbuild, Vitest (unit), Playwright (UI scripts).

**Spec:** `docs/superpowers/specs/2026-11-04-ira-deduction-phaseout-design.md` (approved by the owner 2026-11-04). Read it with
this plan; CLAUDE.md's invariants apply to every task.

## Global Constraints

- 2026 ranges (IR-2025-111): covered and joint, $129,000-$149,000. Covered and single, head of household or qualifying
  surviving spouse, $81,000-$91,000. Not covered but the spouse is (joint only), $242,000-$252,000. All are indexed by
  `limitFactor`.
- The reduced limit is rounded **up** to a multiple of $10, has a floor of $200 below the top of the range, and is 0 at or
  above the top. These are not indexed.
- No run where every partner's IRA is Roth or at 0%, and with 0% traditional IRA basis, may change by a cent. PR 1 changes
  no run at all.
- A new hot-path term is skipped, not added as a zero, when its gate is off (`iraOn` / `basisOn`, below). Multiplying by
  an exact 1 and adding an exact 0 are bit-identical and allowed.
- Engine functions take `ctx` first and read only `ctx.inputs`. A new module-level mutable or table is registered in
  `tests/engine-purity.json`. A new mutable that the year body changes before the convergence check goes into the MAGI
  snapshot.
- Bump the US badge in `src/us/index.html` (V157 at the time of writing; take the next number free on `main`) in each PR.
- Update the README feature list and the topic files (`us-accounts.md`, `us-federal-tax.md`, `magi-iteration.md` for PR 2,
  and `test-inventory.md` for new suites) in the same PR. Run `npm run analyze` after adding a module.
- Use exact comparisons only. Expected values are hand-computed or compare two runs in one process (CLAUDE.md, Vitest
  rules 1-7).

## Deviations from the spec (for the owner's approval with this plan)

1. **The 219(g) MAGI leaves out the year's Roth conversions** (the planner's own and the backdoor's). Including them makes the
   deduction depend on a conversion that is sized against a tax that depends on the deduction. That would need a new
   converged estimate carried through every record and replay of the MAGI iteration (13 `estTrad` sites, 4 record
   literals, 7 replay blocks). The error is limited to a year where someone covered by a workplace plan both contributes to
   a traditional IRA inside the phase-out range and converts. Discretionary draws and RMDs are included.
2. **State classification.** The nondeductible add-back is added to the partner's wages. The backdoor's taxable part is taxed
   like that partner's RMD, so a state's retirement-income rules see it, but PA's and RI's conversion-specific rules
   (`profile.conv`) don't.
3. **The thresholds are indexed by `limitFactor` without the statute's rounding down to $1,000**, the same as every other
   `PLAN_LIMITS` entry. `limitFactor` equals the tax-bracket factor in both run modes today.
4. **The pro-rata ratio is fixed per partner per year** at that partner's grown IRA balance, after growth and before any
   draw. This is the option the spec left to the builder. Every outflow that year uses it: draws, RMD, 72(t), the conversions
   and the backdoor.

## Review Focus

1. A survivor year (A dies, B dies) with basis on B's IRA: `tests/survivor_symmetry.js` identical partners must still match,
   and B's IRA basis must still reach the survivor's return. Test: PR 2 Task 6, "survivor keeps basis".
2. A marry-later year before the wedding (two returns): each partner gets their own MAGI and the single range, and the
   spouse range is never used. Test: PR 2 Task 3, "two returns use the single range".
3. A covered partner on a qualifying-surviving-spouse return: the single range applies, not the joint range. Test: PR 2
   Task 2, "qss reads the single range".
4. A household with basis but no contribution in a year (retired, basis from the slider only): RMDs, draws and conversions
   are partly tax-free. Test: PR 2 Task 5, "100% basis makes a conversion tax-free".
5. A draw split between a penalized and a free group while basis exists: the 10% falls only on the taxable part. Test:
   PR 2 Task 5, "penalty on the taxable part only".

---

# PR 1: per-partner contribution types (no number changes)

Branch `claude/ira-types-per-partner` from `main`.

### Task 1: engine reads `k401TypeA/B` and `iraTypeA/B`

**Files:**
- Modify: `src/us/core/inputs/defaults.js:30-31`. Replace `k401Type` and `iraType` with `k401TypeA`, `k401TypeB`,
  `iraTypeA` and `iraTypeB`, all `'traditional'`.
- Modify: `src/us/core/income/contributions.js`. Change :203-204, :210-216, :249, :265, :269-276 and :291-306 to read each
  partner's own key. `catchupTypeA` falls back to `k401TypeA`, B to `k401TypeB`.
  - `streamPlanContributions(list, rooms, limits, personalPretax, out)`: `personalPretax` becomes a two-element boolean array
    `[pretaxA, pretaxB]`, indexed by the stream's owner at :68-70.
  - `SOLO_IN.mainRoth` and `SOLO_IN.iraPretax` become two-element boolean arrays, read by owner in `soloPlanContributions`
    (:111, :165-169).
- Modify: `src/us/ui/install-test-hooks.js:305-319`; `tests/unit/helpers/us-contributions.js:27`. These now take the
  arrays. A scalar argument is still accepted and spread to both partners, so the existing callers stay as written.
- Test: `tests/unit/us/contribution-types.test.js` (new).

**Interfaces:**
- Produces: the input keys `k401TypeA/B` and `iraTypeA/B` (`'traditional' | 'roth'`). `streamPlanContributions(list,
  rooms, limits, personalPretax: [boolean, boolean], out)`. `SOLO_IN.mainRoth` and `SOLO_IN.iraPretax` are `[boolean,
  boolean]`.

- [ ] **Step 1: Write the failing test.** `it('mixed types route per partner')`: `w.setState({ k401TypeA: 'roth', k401TypeB:
  'traditional', iraTypeA: 'traditional', iraTypeB: 'roth', incomeA: 100000, incomeB: 100000, ageA: 40, ageB: 40 })`.
  Through `usContributions(w).retirementContributions({}, args)`, assert:
  - `acct.roth[1] === 24500` and `acct.trad[1] === 0`;
  - `acct.trad[3] === 24500` and `acct.roth[3] === 0`;
  - `acct.trad[0] === 7500` and `acct.roth[0] === 0`;
  - `acct.roth[2] === 7500` and `acct.trad[2] === 0`;
  - `traditionalContribA === 7500` and `traditionalContribB === 24500`.

  Then `it('a stream IRA follows its owner's type')`: one contributing W-2 stream per partner, each with personal-IRA room
  left. A's stream IRA lands in `trad[0]`, B's in `roth[2]`.
- [ ] **Step 2: Run it and check it fails.** `npx vitest run tests/unit/us/contribution-types.test.js` fails on the
  undefined keys.
- [ ] **Step 3: Implement the routing** as listed under Files.
- [ ] **Step 4: Run the new file, then `npm run test:unit`.** Everything passes. Existing suites that set `k401Type` or
  `iraType` (`contribution-limits`, `cash-flow-balance`, `account-ledger`, `self-employment`) are changed to set both
  partners' keys to the same value. Their expected numbers don't change.
- [ ] **Step 5: Commit.** `Per-partner contribution types: engine`

### Task 2: migration, inputs, UI and baselines

**Files:**
- Modify: `src/us/ui/inputs/normalize-state.js`. Next to the Rule of 55 migration (:59-60): when `raw.k401Type` is
  `'traditional'` or `'roth'` and `raw.k401TypeA` is undefined, copy it to both partners. Do the same for `iraType`. Then
  delete `k401Type` and `iraType`.
- Modify: `src/us/ui/inputs/fields.js:133,138`. Four entries `{ key: 'k401TypeA', type: 'choice', manual: true, values:
  ['traditional','roth'], fallback: 'traditional', mcp: true }` (and `k401TypeB`, `iraTypeA`, `iraTypeB`).
- Modify: `src/us/index.html:68-69`. Replace the two household rows with four radiogroups:
  - "Partner A 401(k) type" and "Partner A IRA type";
  - "Partner B 401(k) type" and "Partner B IRA type", each with `data-partner-b`.

  Button ids are `k401TraditionalBtnA` / `k401RothBtnA` / `iraTraditionalBtnA` / `iraRothBtnA` and the B forms. Each row
  sits right after that partner's own `k401Pct` / `iraPct` slider.
- Modify: `src/us/ui/inputs/contribution-buttons.js`, `src/us/ui/inputs/sync-controls.js:105-108`. Wire the eight ids.
- Modify: `src/us/ui/inputs/render-group-summaries.js:44`. Show one type when both partners match (today's text), and
  `Traditional/Roth` (A/B) when they differ.
- Modify: `tests/legacy_state.js:52`, `tests/snapshot_scenarios.js:49`, `tests/fixtures/dana-and-chris.json:33-34`,
  `tests/roth_accounts.js:124,130` and `tests/stream_contributions.js:76`. Use the per-partner keys.
- Test: `tests/unit/us/guard-normalize.test.js` (extend); `test_contribution_types.js` (new root Playwright script).

- [ ] **Step 1: Write the failing tests.**
  - Vitest `it('old household types migrate to both partners')`: normalize `{ k401Type: 'roth', iraType: 'traditional' }`.
    The result `toStrictEqual`s the four keys `roth, roth, traditional, traditional`, and `k401Type` and `iraType` are
    absent.
  - Vitest `it('bad per-partner types fall back')`: `{ iraTypeB: 'bogus' }` gives `'traditional'`.
  - Playwright: clicking `iraRothBtnB` changes `window.fireProjectionRows[0].tax`. Partner B's controls are hidden in
    single-person mode. At 390×844, `scrollWidth > clientWidth` is false.
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement the files above.**
- [ ] **Step 4: Verify.**
  - `npm test` passes.
  - `node tests/snapshot.js` reports **no** changed hash. A changed hash here is a bug in Task 1, not a baseline to update.
  - `tests/snapshots/ui_us.json` and `tests/snapshots/legacy_state.json` change only in the field and enum lists. Rewrite
    those two with their own `--update`, and say so in the commit.
  - `node test_contribution_types.js` passes.
- [ ] **Step 5: Docs and commit.** Update the README (per-partner types), the `us-accounts.md` contribution section and the
  badge. Commit `Per-partner contribution types: migration and UI`.

---

# PR 2: the deduction phase-out and traditional IRA basis

Branch `claude/ira-deduction-phaseout` from `main` after PR 1 merges.

### Task 1: the 219(g) limit, a pure function

**Files:**
- Create: `src/us/core/income/ira-deduction.js`. Line 1: `// US traditional IRA deduction limit under IRC 219(g) (the active-participant phase-out)`.
- Modify: `src/us/core/tax/federal-rules.js:48-61`. Add an `ira` key to every `FILING` row: mfj `'mfj'`; single, hoh and
  qss `'single'`.
- Modify: `tests/engine-purity.json` (register `IRA_PHASEOUT` as `constant`).
- Test: `tests/unit/us/ira-deduction.test.js` (new).

**Interfaces:**
- Produces:
  - `IRA_PHASEOUT = { covered: { mfj: [129000, 149000], single: [81000, 91000] }, spouseCovered: { mfj: [242000, 252000] } }`.
  - `iraDeductionLimit(limit: number, magi: number, lower: number, upper: number): number`. It returns `limit` when
    `magi <= lower` and 0 when `magi >= upper`. Otherwise it returns `min(limit, max(200, ceil(limit * (upper - magi) /
    (upper - lower) / 10) * 10))`.
  - `iraRange(filing: string, covered: boolean, spouseCovered: boolean, twoReturns: boolean, f: number): [number, number] | null`.
    - `filingKey(filing, 'ira')` picks the row; a two-return year reads `'single'`.
    - It returns `null` (no limit) when the partner isn't covered and the spouse range doesn't apply. The spouse range
      applies only when the row is `mfj`, the year isn't a two-return year, and `spouseCovered` is true.
    - Both bounds are multiplied by `f`.

- [ ] **Step 1: Write the failing tests** (hand-computed). With `limit 8600, lower 129000, upper 149000`:
  - `magi 129000` gives 8600; `149000` gives 0; `150000` gives 0;
  - `139000` gives `4300` (8600 × 0.5);
  - `139005` gives `4300` (8600 × 9995 / 20000 = 4297.85, rounded up to 4300);
  - `148900` gives `200` (8600 × 100 / 20000 = 43, floored at 200).

  With `limit 7500, lower 242000, upper 252000`, `magi 247000` gives 3750.

  For `iraRange`:
  - `('mfj', true, false, false, 1)` toStrictEqual `[129000, 149000]`;
  - `('mfj', false, true, false, 1)` gives `[242000, 252000]`;
  - `('mfj', false, false, false, 1)` gives `null`;
  - `it('qss reads the single range')`: `('qss', true, false, false, 1)` gives `[81000, 91000]`, and `('qss', false, true,
    false, 1)` gives `null`;
  - `('mfj', true, true, true, 1)` (two returns) gives `[81000, 91000]`;
  - `('single', true, false, false, 1.03)` gives `[81000 * 1.03, 91000 * 1.03]`.
- [ ] **Step 2: Run and check they fail.** **Step 3: Implement.** **Step 4: Run and check they pass.**
- [ ] **Step 5:** `npm run analyze`; commit `IRA deduction: the 219(g) limit`.

### Task 2: contributions report coverage and the IRA amounts

**Files:**
- Modify: `src/us/core/income/contributions.js:315-320`. Add these fields to the return:
  - `coveredA: acct.trad[1] + acct.roth[1] > 0` and `coveredB` from slots 3. Every deferral, catch-up, match, profit
    sharing, mega, stream plan and Solo plan dollar lands in a 401(k) slot.
  - `iraTradA: acct.trad[0]` and `iraTradB: acct.trad[2]`: the salary, stream and Solo traditional IRA dollars.
  - `iraLimitA` and `iraLimitB`: the 219(b) limits already computed at :205-206.
- Test: `tests/unit/us/ira-deduction.test.js` (extend).

**Interfaces:**
- Produces: `retirementContributions(...)` also returns `{ coveredA, coveredB, iraTradA, iraTradB, iraLimitA, iraLimitB }`.

- [ ] **Step 1: Write the failing test.** `it('coverage follows any plan money')`:
  - With the defaults, both partners are covered.
  - With `k401PctA: 0, catchupPctA: 0, matchA: 0`, A is not covered and B is.
  - With `incomeKindA: 'self'` and a Solo deferral, A is covered.
  - The `owner case` (`iraPctA/B 100`, ages 58/56) gives `iraTradA === 8600` and `iraTradB === 8600`.
- [ ] **Steps 2-4:** run and check it fails, implement, run and check it passes. **Step 5:** commit `IRA deduction: coverage
  and IRA amounts`.

### Task 3: the deduction in the year loop

**Files:**
- Modify: `src/us/core/projection/run-projection.js`:
  - after `buildTaxProfile` (:426), the year's constants;
  - the pass start (:696-716), the per-pass add-back;
  - the `magiBase0` reads at :907, :971, :1402, :1857 and :1930;
  - the row (:2729-2780).
- Modify: `src/us/core/income/year-stages.js`. `buildTaxProfile` also returns `wageA0` / `wageB0`, the profile wages before
  any add-back, already remapped for a survivor.
- Modify: `docs/architecture/magi-iteration.md` (the per-pass add-back; nothing new is converged).
- Test: `tests/unit/us/ira-deduction-engine.test.js` (new).

**Interfaces:**
- Consumes: Task 1 `iraDeductionLimit` and `iraRange`; Task 2's fields.
- Produces:
  - year constants `iraOn` (`iraTradA + iraTradB > 0 && (coveredA || coveredB)`);
  - per-pass scalars `iraNdA`, `iraNdB` (nondeductible dollars) and `iraAdd` (`iraNdA + iraNdB`, 0 when `!iraOn`);
  - row fields `iraDeducted` (`iraTradA + iraTradB - iraNdA - iraNdB`) and `iraNondeductible` (`iraNdA + iraNdB`).

Rules, all only when `iraOn`:
- At each pass start, after `magiBase` is set (:704), the 219(g) MAGI comes first. It is `magiBase + iraTradA + iraTradB +
  estTrad + estGain` (plus `estInhA + estInhB` with an inherited ledger, as :715 adds). In a two-return year each partner
  uses their own `returnMagis(profile, estTrad, estGain, ...)` value plus their own `iraTrad`.
- `iraNd_p = iraTrad_p - min(iraTrad_p, range ? iraDeductionLimit(iraLimit_p, magi, range[0], range[1]) : Infinity)`. The
  range is `iraRange(filing, covered_p, covered_other, twoReturns, limitFactor)`.
- Then `profile.wageA = wageA0 + iraNdA` (B likewise; a survivor year puts the living partner's add-back on slot A, as the
  remap does). Set `magiBase += iraAdd`.
- Each in-pass `magiBase0` read becomes `magiBase0 + iraAdd`. Write it out at each site; don't redefine `magiBase0`.
- `iraAdd` resets with the pass. It is a pure function of the pass's estimates and the year's constants, so records and
  replays need no new field (`tests/estimate_sites.js` counts stay as they are).

- [ ] **Step 1: Write the failing tests** (`w.setState` for `owner case`: MFJ, ages 58/56, wages 115000/72000, Roth 401(k)
  at 100% each, traditional IRA at 100% each, retirement ages after the run's first year):
  - `it('fully phased out equals no IRA deduction')`: compare run X (IRA 100%) with run Y (IRA 0%, otherwise the same). The
    first row has `X.tax === Y.tax`, `X.iraDeducted === 0` and `X.iraNondeductible === 17200`.
  - `it('nobody covered keeps the full deduction')`: `k401PctA/B 0, catchupPctA/B 0, matchA/B 0`. The first row has
    `iraDeducted === 17200`, and the whole `rows` array `toStrictEqual`s a JSON fixture of the same scenario. Capture the
    fixture from `main` before this task's code (`tests/unit/us/fixtures/ira-uncovered.json`; the capture script is run once
    and not committed).
  - `it('inside the range the deduction is partial')`: wages set so the first year's 219(g) MAGI is 139,000. Make this exact
    by using a household with no investment income and no draws: no taxable or cash balances, retirement accounts only.
    Assert `iraDeducted === 8600` (4300 each).
  - `it('two returns use the single range')`: `filingStatus: 'mfj', marryLater` with the wedding after year 1. A partner
    with MAGI 86,000 deducts 4300 (limit 8600, single range).
  - `it('Roth IRA partner is untouched')`: `iraTypeA: 'roth'` gives `iraNondeductible === 8600` from B only.
- [ ] **Step 2: Run and check they fail.** **Step 3: Implement.** **Step 4: Run `npm run test:unit`.** Suites built on
  default plans with traditional IRAs and both partners covered will move. List every failing expectation in the commit
  message, and confirm each moved for this reason before updating it. Hand-computed literals of the old deduction change
  only when the test's own scenario is now phased out.
- [ ] **Step 5:** commit `IRA deduction: the phase-out in the year loop`.

### Task 4: the basis ledger and the slider

**Files:**
- Create: `src/us/core/accounts/ira-basis.js`. Line 1: `// US traditional IRA after-tax basis (Form 8606): opening basis, the yearly pro-rata ratio and the taxable share of an outflow`.
- Modify: `src/us/core/inputs/defaults.js` (`tradIraBasisPctA: 0, tradIraBasisPctB: 0`).
- Modify: `src/us/ui/inputs/fields.js` (two number entries, like `roth401kBasisPctA`).
- Modify: `src/us/ui/inputs/normalize-state.js:48-55` (clamp to 0-100 like `roth401kBasisPct`).
- Modify: `src/us/index.html`. A range field after each partner's `roth401kBasisPct` field (:106, :113):
  - label "Partner A traditional IRA basis";
  - `<small>` "Share that is after-tax money, not pre-tax";
  - an info tip: "The percent of this traditional IRA that is after-tax money from nondeductible contributions (Form 8606).
    That part comes out tax-free, in proportion, on every withdrawal, RMD and Roth conversion from this partner's IRAs; the
    rest, and all growth, is taxed. 401(k) money and the other partner's IRA are separate. New nondeductible contributions
    add to it."
- Test: `tests/unit/us/ira-basis.test.js` (new).

**Interfaces:**
- Produces:
  - `iraBasisOpening(inputs): [number, number]`: `tradIraA * pct(tradIraBasisPctA)`, B likewise (0 for B in single-person
    mode).
  - `iraBasisRatios(basis: [number, number], accountDollars: number[4], out: [number, number])`: `out[p] = dollars > 0 ?
    min(1, basis[p] / dollars) : 0` for IRA slots 0 and 2.
  - `groupTaxableFraction(ratios, accountDollars, slots: number[]): number`: `1 - Σ_{slot s in slots, s even} ratios[s/2] *
    dollars[s] / Σ_{s in slots} dollars[s]`, and 1 for an empty group.
  - `conversionTaxable(ratios, accountDollars, excluded, amount): number` and `conversionGross(ratios, accountDollars,
    excluded, taxable): number`. These follow `accountsConvert`'s order: the non-excluded IRAs first, pro rata, then the
    401(k)s, fully taxable. `conversionGross` is the inverse on the IRA segment. When the IRA segment is all basis, it
    converts the whole IRA segment, then `taxable` more from the 401(k)s.

- [ ] **Step 1: Write the failing tests** (hand-computed):
  - `iraBasisOpening({tradIraA: 200000, tradIraBasisPctA: 25, ...})` gives 50000.
  - With ratios `[0.25, 0]` and dollars `[200000, 100000, 0, 0]`:
    - `groupTaxableFraction` over `[0,1]` gives `1 - 0.25 * 200000 / 300000` (written as that literal expression);
    - `conversionTaxable(..., 100000)` gives 75000;
    - `conversionTaxable(..., 250000)` gives `150000 + 50000`;
    - `conversionGross(..., 75000)` gives 100000;
    - `conversionGross(..., 200000)` gives 250000.
  - With ratios `[1, 0]`, `conversionGross(..., 0)` gives 200000.
  - `it('bad basis falls back')`: normalize `tradIraBasisPctA: 140` gives 100, and `'x'` gives 0.
- [ ] **Steps 2-4.** **Step 5:** `npm run analyze`; commit `IRA basis: the ledger helpers and the slider`.

### Task 5: basis recovery in the year loop

**Files:**
- Modify: `src/us/core/projection/run-projection.js`:
  - ledger creation (:238-240): `iraBasis = iraBasisOpening(inputs)`, a per-run two-element array;
  - the snapshot and restore (:547-552, :687-694): `iraBasis[0]` and `iraBasis[1]` join `scalarSnapshot`;
  - the RMD split before `buildTaxProfile`;
  - the conversion sizing (:1010-1081);
  - the year-end basis update before the contributions (:1297, :1377).
- Modify: `src/us/core/withdrawals/draws.js`:
  - `newWithdrawal` takes `conversionTaxable` for `traditionalGross` and carries `ratios`;
  - `takeTraditional`, `takeTraditionalSplit`, `fillTraditional` and `fillTraditionalSplit` price a draw at
    `groupTaxableFraction`;
  - `solveTraditionalForNet` and `solveTraditionalForNetFromNeed` get a last parameter `taxableFrac = 1`.
- Modify: `src/us/core/income/year-stages.js` (`buildTaxProfile` takes `rmdTaxA/B` for the profile's `rmdA/B` and
  `otherA/B`).
- Test: `tests/unit/us/ira-basis-engine.test.js` (new).

**Interfaces:**
- Consumes: Task 4's helpers.
- Produces:
  - `basisOn`: a year constant, `iraBasis[0] + iraBasis[1] > 0 || iraOn`;
  - `iraRatio`: a per-year `[ρA, ρB]` from the grown pool (`accountBalances(accts.trad, tGrown + bGrown)`, as
    `accountsConvertPreview` builds it);
  - `conversionTaxable`: a per-pass scalar;
  - row fields `iraBasis` (end-of-year `iraBasis[0] + iraBasis[1]`) and `iraBasisRecovered` (the tax-free dollars out this
    year).

Rules (when `!basisOn`, every new term is skipped: `taxableFrac` stays exactly 1 and `conversionTaxable === conversionAmount`):
- **Draws.**
  - A group draw's taxable part is `fromTrad * τ`. It is added to `wd.traditionalGross` and to `cappableTraditional`; the
    gross goes to `traditionalWithdrawn`, the bucket and the ledger.
  - The solvers price `traditionalGross + mid * τ` and charge the penalty on `mid * τ * penalizedFraction` (72(t): only the
    includible amount).
  - The fills tax `from * τ`.
  - The split draw recomputes `τ` per partner piece.
- **RMD and 72(t).**
  - The tax-free part of each partner's RMD is `ρ_p ×` the IRA share of that partner's draw: `accountDollars[ira] /
    (ira + 401k)` for the pro-rata `accountsDraw`, the slot's own 72(t) amount, and in a survivor year the whole-pool pro rata
    over all four slots.
  - The taxable part goes to the profile. The gross keeps the pool drop and the row's `rmd`.
- **Conversions.**
  - In a `basisOn` year every sizer works in **taxable** dollars: the cap is `conversionTaxable(..., convertible)`, and the
    fill, `resolveConvTarget`, the phased cap and the MAGI ceiling are unchanged in form. After sizing, `conversionTaxable =
    T` and `conversionAmount = conversionGross(T)`.
  - The `rothAmountByAge` map is gross: `conversionTaxable = conversionTaxable(..., map value)`.
  - Every income read of the conversion (`profile.conv`, `taxFor(..., conversionAmount)` at :1192 and :1316, `magiProxy`
    :1126, `returnMagis` :1136, `newWithdrawal`, `realizedTrad` :1389, `drawTrad` :1997, `preConv`) reads
    `conversionTaxable`.
  - Balance moves (`applyRothConversion`, `accountsConvertPreview`) and the record field `conversion` stay gross.
- **The Roth ledger.**
  - `rothAccountsConvert(R, to, year, free)` takes a new `free: [number, number]`, the tax-free part per partner. It pushes
    `{ year, amount: taxable, free: false }`, then `{ year, amount: free, free: true }`.
  - `rothAccountsSeason` seasons both entries.
  - `rothSlotSplit`'s `penaltyBase` counts only `free: false` conversion dollars.
  - `rothFreeCaps` adds the free entries that come before the first unseasoned `free: false` entry (408A(d)(4)(B): the
    taxable part of a conversion comes out first).
  - An entry without the flag (`free` undefined) behaves as `false`, so the existing tests keep their numbers.
- **The year end.** Before the year's contributions: `iraBasis[p] = ρ_p * IRA_p dollars now + iraNd_p`. In a `basisOn` year
  this goes into both the surplus and deficit branches.
- **The estate** (`run-projection.js:2947-2963`, `solver.js:514-527`). `estate.traditionalBasis = iraBasis[0] +
  iraBasis[1]`. `endTaxUS` taxes `T - traditionalBasis` and `afterTaxEndValueUS` adds the gross `T`.

- [ ] **Step 1: Write the failing tests:**
  - `it('100% basis makes a conversion tax-free')`: retired single, `tradIraA 100000, tradIraBasisPctA 100`, `trad401kA 0`,
    a conversion set by `rothAmountByAge`. Year 1's `tax` equals the same plan with the conversion off.
  - `it('pro rata conversion')`: `tradIraA 300000` at 25% basis, the map converting 40000. The year's conversion income is
    `40000 * (1 - 0.25)`, compared through the row's `magiProxy` difference against the no-conversion run.
  - `it('basis is recovered on an RMD')`: age 75, `tradIraA 400000` at 50%, `trad401kA 0`. The year's taxable RMD is half
    the gross. Compare against a run with `tradIraA 200000` at 0%, whose RMD is the same taxable amount.
  - `it('penalty on the taxable part only')`: age 50, retired, penalized group only, 50% basis. `earlyPenalty === 0.1 *
    0.5 * traditionalWithdrawn` for that draw.
  - `it('no basis, no change')`: every case above with `tradIraBasisPctA 0` and Roth IRAs. The rows `toStrictEqual` the
    same scenario run on `main` (capture these with the plan's commit before Task 3 lands; store them as JSON fixtures in
    `tests/unit/us/fixtures/`).
  - `it('the backdoor-free ledger order')` (unit, `roth-ledger.js` directly): a conversion `{taxable 3000, free 1000}` in
    year 0, then a draw at year 2. The draw takes the 3000 penalized first, then the 1000 free.
  - `it('nondeductible contributions become basis')`: the owner case. After year 1, `iraBasis === 17200` (empty IRAs at the
    start, 0% basis).
- [ ] **Steps 2-4.** Also run `node tests/estimate_sites.js` and `node tests/engine_purity.js`, and `npx vitest run
  --sequence.shuffle` for the new suites.
- [ ] **Step 5:** commit `IRA basis: recovery on draws, RMDs and conversions`.

### Task 6: survivor, end-to-end, docs and baselines

**Files:**
- Test: `tests/unit/us/ira-basis-engine.test.js` (extend); `tests/survivor_symmetry.js` (extend with a basis case);
  `test_ira_basis.js` (new root Playwright script).
- Modify:
  - `README.md`;
  - `docs/architecture/us-accounts.md` (the basis ledger, the ratio rule, the Roth ledger's `free` flag);
  - `docs/architecture/us-federal-tax.md` (the phase-out, the ranges with the citation, the four deviations);
  - `docs/architecture/test-inventory.md`;
  - `docs/roadmap.md:232` (federal IRA basis done; the state part stays open);
  - the badge.

- [ ] **Step 1: Tests.**
  - `it('survivor keeps basis')`: A dies with basis on B's IRA (B survives). B's later RMD is partly tax-free.
  - The mirror case (B dies, basis on A's IRA) gives the same `tax` rows.
  - The survivor symmetry script gains identical partners with 50% basis each.
  - Playwright: moving `tradIraBasisPctA` changes `fireProjectionRows` in a year with a traditional draw. The slider shows
    for Partner B only when there is a partner. 390×844 has no horizontal scroll.
- [ ] **Step 2: Run the full gate.** `npm test`, then `npm run test:ui`, then `npx vitest run --sequence.shuffle`.
- [ ] **Step 3: Snapshots.**
  - `node tests/snapshot.js` will show changed hashes for the `default*` scenarios, which have traditional IRAs and both
    partners covered.
  - For two of them, compare a row's `tax` and `iraNondeductible` against the expected change, and record the before/after
    for year 1 of `'default'` in the commit message.
  - Then `npm run snapshot:update`, and say in the commit that the update is intended (the deduction now phases out).
- [ ] **Step 4:** commit `IRA deduction and basis: docs, survivor tests, intended snapshot update`.

---

# PR 3: the backdoor checkbox

Branch `claude/ira-backdoor` from `main` after PR 2 merges.

### Task 1: the conversion of the nondeductible part

**Files:**
- Modify: `src/us/core/inputs/defaults.js` (`iraBackdoorA: false, iraBackdoorB: false`); `fields.js` (two checkbox
  entries); `src/us/index.html`. A checkbox under each partner's IRA type row: "Roll funds over the phase-out limit to
  Roth", with an info tip "Each year, the part of this IRA contribution that isn't deductible is converted to the Roth IRA
  (a backdoor Roth). The conversion is taxed pro rata on this partner's whole traditional IRA, so any pre-tax IRA money
  makes part of it taxable."
- Modify: `src/us/ui/inputs/sync-controls.js` (the checkbox row is `hidden` unless that partner's `iraType` is
  `'traditional'`; Partner B's also follows `data-partner-b`).
- Modify: `src/us/core/projection/run-projection.js`. This is the pass-start block from PR 2 Task 3 and the year-end block
  from PR 2 Task 5.
- Test: `tests/unit/us/ira-backdoor.test.js` (new); `test_ira_basis.js` (extend).

**Interfaces:**
- Consumes: `iraNdA/B`, `iraRatio`, `iraBasis`, `rothAccountsConvert(R, to, year, free)`.
- Produces: the per-pass `bdTaxA/B` (the backdoor's taxable part) and the row field `backdoor` (the gross converted).

Rules (only when `iraOn` and that partner's box is ticked):
- At the pass start, after `iraNd_p`: `ρ'_p = (iraBasis[p] + iraNd_p) / (IRA_p grown dollars + iraNd_p)`. Then `bdTax_p =
  iraNd_p * (1 - ρ'_p)`. Add it to the profile's `rmdA/B` for that partner (the remap puts a survivor on slot A) and to
  `magiBase` and `iraAdd`. It is left out of the 219(g) MAGI (deviation 1).
- At the year end, after the contributions:
  - move `iraNd_p` from trad slot `2p` to Roth slot `2p` (`accountsDrawSlots` / `accountsContribute` on the two pools; the
    stock bucket);
  - set `iraBasis[p] -= iraNd_p - bdTax_p`;
  - call `rothAccountsConvert(rothAccts, to, year, free)` with `to[p] = bdTax_p` and `free[p] = iraNd_p - bdTax_p`.

- [ ] **Step 1: Write the failing tests:**
  - `it('clean backdoor is tax-free')`: the owner case with both boxes ticked and empty traditional IRAs. Year 1 `tax`
    equals the unticked run's (the nondeductible contribution is taxed the same either way, and the conversion adds no
    income). The year-end Roth IRA balances are up by 8600 each against the unticked run, the traditional IRA balances
    down by 8600 each, and `iraBasis === 0`.
  - `it('pre-tax money makes the backdoor taxable')`: `tradIraA 91400` at 0% basis, A ticked. The taxable part is
    `8600 * (1 - 8600 / (91400 * growth + 8600))`. Check it through the `magiProxy` difference against the unticked run,
    with stock and bond returns at 0 so growth is 1: `8600 * (1 - 8600 / 100000) = 7860.4`.
  - `it('unticked keeps PR 2 numbers')`: the rows `toStrictEqual` PR 2's output.
  - Playwright: the checkbox is hidden while the IRA is Roth and shown after clicking `iraTraditionalBtnA`; ticking it
    changes `fireProjectionRows[0].backdoor` from 0.
- [ ] **Steps 2-4.** Then `npm test`, `npm run test:ui` and `node tests/snapshot.js`. No hash changes, since the box
  defaults to off.
- [ ] **Step 5: Docs and commit.** Update the README, `us-accounts.md` and the badge. Commit `Backdoor Roth: convert the
  nondeductible IRA part`.

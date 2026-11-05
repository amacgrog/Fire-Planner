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

- 2026 ranges (IR-2025-111): covered and joint or qualifying surviving spouse (Pub 590-A Table 1-2), $129,000-$149,000.
  Covered and single or head of household, $81,000-$91,000. Not covered but the spouse is (joint only), $242,000-$252,000.
  All are indexed by `limitFactor`.
- The reduced limit is the limit less the reduction rounded **down** to a multiple of $10 (219(g)(2)(C)), has a floor of $200
  below the top of the range, and is 0 at or above the top. These are not indexed.
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
   `convK401FracA/B` stays the 401(k) share of the gross conversion, so PA and RI may also misclassify a conversion's 401(k)
   part in a basis year.
4. **The pro-rata ratio is fixed per partner per year** at that partner's grown IRA balance and the basis at the start of
   the year. This is the option the spec left to the builder.
   - Every outflow that year uses it: draws, RMD, 72(t) and the conversions.
   - Form 8606 instead puts the year's nondeductible contribution in the numerator, and the year-end value, contribution
     included, in the denominator. The planner adds the year's contribution only at the year end, so it first counts in the
     next year's ratio.
   - The backdoor (PR 3) is the exception. It uses the 8606 form with the year's contribution.
5. **Taxable traditional income is split between the partners by pool share** (`ownerShareA`), as today. When the two
   partners' basis ratios differ, a two-return year (marry-later before the wedding) and the per-person state rules can put
   taxable dollars on the wrong partner. The household total and the joint federal return are right.
6. **The 219(g) MAGI counts all Social Security** (the planner's `magiBase`, the ACA definition), not only the taxable part
   219(g)(3)(A) counts. It overstates the MAGI only for someone covered, contributing and collecting Social Security in the
   same year.

## Review Focus

1. A survivor year (A dies, B dies) with basis on B's IRA: `tests/survivor_symmetry.js` identical partners must still match,
   and B's IRA basis must still reach the survivor's return. Test: PR 2 Task 6, "survivor keeps basis".
2. A marry-later year before the wedding (two returns): each partner gets their own MAGI and the single range, and the
   spouse range is never used. Test: PR 2 Task 3, "two returns use the single range".
3. A covered partner on a qualifying-surviving-spouse return: the joint covered range applies (Pub 590-A, Table 1-2). Test: PR 2
   Task 2, "qss reads the joint covered range".
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
- Modify: `src/us/ui/install-test-hooks.js:305-319`; `tests/unit/helpers/us-contributions.js:26-27` (drop the `!!`
  coercion of `mainRoth` / `iraPretax`, which would turn an array into `true`). These now take the
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
- Modify: `src/us/core/tax/federal-rules.js:48-61`. Add an `ira` key to every `FILING` row: mfj and qss `'mfj'`; single and hoh
  `'single'`.
- Modify: `tests/engine-purity.json` (register `IRA_PHASEOUT` as `constant`).
- Test: `tests/unit/us/ira-deduction.test.js` (new).

**Interfaces:**
- Produces:
  - `IRA_PHASEOUT = { covered: { mfj: [129000, 149000], single: [81000, 91000] }, spouseCovered: { mfj: [242000, 252000] } }`.
  - `iraDeductionLimit(limit: number, magi: number, lower: number, upper: number): number`. It returns `limit` when
    `magi <= lower` and 0 when `magi >= upper`. Otherwise it returns `min(limit, max(200, limit - floor(limit * (magi - lower) /
    (upper - lower) / 10) * 10))` (the reduction rounded down to $10).
  - `iraRange(filing: string, covered: boolean, spouseCovered: boolean, twoReturns: boolean, f: number): [number, number] | null`.
    - `filingKey(filing, 'ira')` picks the row; a two-return year reads `'single'`.
    - It returns `null` (no limit) when the partner isn't covered and the spouse range doesn't apply. The spouse range
      applies only when the row is `mfj`, the year isn't a two-return year, and `spouseCovered` is true.
    - Both bounds are multiplied by `f`.

- [ ] **Step 1: Write the failing tests** (hand-computed). With `limit 8600, lower 129000, upper 149000`:
  - `magi 129000` gives 8600; `149000` gives 0; `150000` gives 0;
  - `139000` gives `4300` (8600 × 0.5);
  - `139005` gives `4300` (a reduction of 8600 × 10005 / 20000 = 4302.15, rounded down to 4300: 8600 - 4300);
  - `148900` gives `200` (8600 × 100 / 20000 = 43, floored at 200).

  With `limit 7500, lower 242000, upper 252000`, `magi 247000` gives 3750.

  For `iraRange`:
  - `('mfj', true, false, false, 1)` toStrictEqual `[129000, 149000]`;
  - `('mfj', false, true, false, 1)` gives `[242000, 252000]`;
  - `('mfj', false, false, false, 1)` gives `null`;
  - `it('qss reads the joint covered range')`: `('qss', true, false, false, 1)` gives `[129000, 149000]`, and `('qss', false, true,
    false, 1)` gives `null`;
  - `('single', true, true, true, 1)` (two returns: the engine files them as single) gives `[81000, 91000]`;
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
- Modify: `src/us/core/income/year-stages.js`. `buildTaxProfile` also returns `wageA0` / `wageB0` and `otherA0` /
  `otherB0`: the profile's `wageA/B` and `otherA/B` before any add-back, already remapped for a survivor. Federal tax,
  `returnMagis` and the bracket fill read `otherA/B` (`federal-tax.js:249,344,444`, `irmaa.js:72`,
  `roth-conversion.js:52,59`); the state reads `wageA/B`. Both must get the add-back.
- Modify: `docs/architecture/magi-iteration.md` (the per-pass add-back; nothing new is converged).
- Test: `tests/unit/us/ira-deduction-engine.test.js` (new).

**Interfaces:**
- Consumes: Task 1 `iraDeductionLimit` and `iraRange`; Task 2's fields.
- Produces:
  - year constants `iraOn` (`iraTradA + iraTradB > 0 && (coveredA || coveredB)`);
  - per-pass scalars `iraNdA`, `iraNdB` (nondeductible dollars) and `iraAdd` (`iraNdA + iraNdB`, 0 when `!iraOn`);
  - row fields `iraDeducted` (`iraTradA + iraTradB - iraNdA - iraNdB`), `iraNondeductible` (`iraNdA + iraNdB`) and `iraMagi`
    (the final pass's 219(g) MAGI; the household's on a joint return, A's in a two-return year).

Rules, all only when `iraOn`:
- At each pass start, after `magiBase` is final for the pass (after :716, so `estInhA + estInhB` is already in it), the
  219(g) MAGI comes first. It is `magiBase + iraTradA + iraTradB + estTrad + estGain`. In a two-return year each partner uses
  their own `returnMagis(profile, estTrad, estGain, ...)` value plus their own `iraTrad`. Compute that after resetting
  `profile.otherA/B` to `otherA0/B0`.
- `iraNd_p = iraTrad_p - min(iraTrad_p, range ? iraDeductionLimit(iraLimit_p, magi, range[0], range[1]) : Infinity)`. The
  range is `iraRange(filing, covered_p, covered_other, twoReturns, limitFactor)`.
- Then set `profile.wageA = wageA0 + iraNdA` and `profile.otherA = otherA0 + iraNdA` (B likewise). A survivor year puts the
  living partner's add-back on slot A, as the remap does. Set `magiBase += iraAdd`.
- Each in-pass `magiBase0` read becomes `magiBase0 + iraAdd`. Write it out at each site; don't redefine `magiBase0`. The
  display `totalIncome` (:1147, :1374) adds `iraAdd` too.
- Set `estUsed = true` in a pass where `iraOn` and a range applies to someone. Otherwise a year with no ACA and no ceiling
  runs one pass, and the deduction is sized off last year's draw. This costs no extra pass when the drift is 0.
- `iraAdd` resets with the pass. It is a pure function of the pass's estimates and the year's constants, so records and
  replays need no new field (`tests/estimate_sites.js` counts stay as they are).
- A test-only switch `ctx.test.iraPhaseoutOff` (read once per year) forces `iraOn = false`. It is the "feature off"
  comparison run for the tests. Nothing else reads it.

- [ ] **Step 1: Write the failing tests** (`w.setState` for `owner case`: MFJ, ages 58/56, wages 115000/72000, Roth 401(k)
  at 100% each, traditional IRA at 100% each, retirement ages after the run's first year):
  - `it('fully phased out equals no IRA deduction')`: compare run X (IRA 100%) with run Y (IRA 0%, otherwise the same). The
    first row has `X.tax === Y.tax`, `X.iraDeducted === 0` and `X.iraNondeductible === 17200`.
  - `it('nobody covered keeps the full deduction')`: `k401PctA/B 0, catchupPctA/B 0, matchA/B 0`. The first row has
    `iraDeducted === 17200`. Every row's `tax`, `magiProxy` and `traditional` `toBe` the same run with
    `ctx.test.iraPhaseoutOff`. No fixtures: engine literals are banned by Vitest rule 6.
  - `it('inside the range the deduction is partial')`: wages set so the first year's 219(g) MAGI is 139,000. Make this exact
    by using a household with no investment income and no draws: no taxable or cash balances, retirement accounts only.
    Assert `iraDeducted === 8600` (4300 each).
  - `it('two returns use the single range')`: `filingStatus: 'mfj', marryLater` with the wedding after year 1. A partner
    with their own 219(g) MAGI of 86,000 deducts 4300 (limit 8600, single range). Use no investment income and no draws,
    as above.
  - `it('a draw year converges the deduction')`: A works, covered and contributing; B is retired and drawing from a
    traditional 401(k).
    - Year N's `iraDeducted` equals `min(8600, iraDeductionLimit(8600, row.iraMagi, ...range))`, recomputed with the pure
      function. `iraMagi` is a new row field: the 219(g) MAGI of the final pass.
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
- Modify: `src/us/ui/inputs/fields.js`. Two number entries like `roth401kBasisPctA`, plus `mcp: true`, `min: 0`, `max: 100`
  (the spec exposes the new fields to MCP).
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
    excluded, taxable): number`.
    - These follow `accountsConvert`'s order: the non-excluded IRAs first, pro rata, then the 401(k)s, fully taxable.
      `conversionGross` is the inverse on the IRA segment.
    - An all-basis IRA segment (`1 - ρ = 0`) converts the whole segment, then `taxable` more from the 401(k)s, so
      `conversionGross(..., 0)` is the segment's dollars. In a conversion year, free basis always converts: it costs no tax
      and no MAGI. The engine calls `conversionGross` only in a year that converts (`convertsThisYear`), so a year outside
      the window still converts nothing. Every `=== 0`, held-kind and zero-kind control reads the taxable amount, so a
      free-only conversion doesn't trip them.
  - Every helper returns its input unchanged (`amount`, `taxable`, 1) when both ratios are 0, with no arithmetic. That
    keeps a fully deductible contributor bit-identical.
  - Any module-level scratch the helpers use is registered in `tests/engine-purity.json`.

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
  - ledger creation (:238-240);
  - the snapshot and restore (:547-552, :687-694);
  - the RMD split before `buildTaxProfile`;
  - the conversion block (:751-1110), the secant and choice blocks (:1505-1557, :1995-2105), the cliff-plan reach
    (:2329-2340);
  - the year-end basis update before the contributions (:1297, :1377);
  - the estate (:2947-2963).
- Modify: the UI readers of the row's conversion as dollars moved to Roth. These read `conversionGross`:
  `src/shared/core/format/cash-flow-parts.js:44` (the cash-flow chart's Roth-conversion flow) and
  `src/us/ui/results/roth-optimizer.js:82,131,173,189,194,220` (the schedule card's amounts and its over-the-line test).
  - Canada's rows have no `conversionGross`, so the shared reader uses `row.conversionGross ?? row.conversionAmount`.
  - Test: a Vitest case on `cash-flow-parts` with a row whose `conversionGross` (40000) and `conversionAmount` (30000)
    differ; the flow is 40000.
- Modify:
  - `src/us/core/withdrawals/draws.js`: `takeTraditional`, `takeTraditionalSplit`, `solveSplitForNet`, `fillTraditional`,
    `fillTraditionalSplit` and the two solvers;
  - `src/us/core/withdrawals/roth-conversion.js` (`applyRothConversion`);
  - `src/us/core/accounts/account-ledger.js` (`accountsConvert` exposes per-slot `taken`);
  - `src/us/core/accounts/roth-ledger.js` and `penalty-status.js` (the `free` conversion entries);
  - `src/us/core/income/year-stages.js` (`buildTaxProfile` takes `rmdTaxA/B`);
  - `src/us/core/cliff-plan/solver.js:514-527`.
- Test: `tests/unit/us/ira-basis-engine.test.js` (new).

**Interfaces:**
- Consumes: Task 4's helpers.
- Produces:
  - `iraBasis`: a per-run `[bA, bB]`;
  - `basisOn`: a year constant, `iraBasis[0] + iraBasis[1] > 0` at the year start. A contribution year with no basis yet
    prices nothing differently and only runs the year-end update;
  - `iraRatio`: a per-year `[ρA, ρB]`;
  - `rothAccountsConvert(R, to, year, free = null)`;
  - row fields `conversionGross`, `rmdTaxable`, `iraBasis` (end of year, A + B) and `iraBasisRecovered` (the tax-free
    dollars out this year).

**The one rule for conversions:** in a `basisOn` year, `conversionAmount` is the **taxable** conversion. Every existing
reader of it (tax, MAGI, records, `natConv`, the `=== 0` controls, the held and zero kinds, the phased cap against
`naturalRec.conversion`, the bond-ladder pricing at :1279, `taxNoDraw` at :1207, `taxAsPaid` at :1882, `totalIncome`)
therefore stays correct unchanged.
- Gross dollars appear only where money moves or where a balance is compared:
  - `conversionGross` is `conversionGross(iraRatio, convDollars, seppActive, conversionAmount)`, taken after the phased cap
    (:1045-1047) and before :1082, and `applyRothConversion` takes it;
  - every `convertible` compared with a conversion amount becomes `convertibleT = conversionTaxable(..., convertible)`.
    That covers the conversion cap, the held and zero kinds at :1055-1079, the secant bound `convertibleTr -
    conversionAmount`, the choice's `convertible` and `convLinesAt(..., preM + convertible)`, and the cliff-plan reach;
  - a `rothAmountByAge` map year takes its gross directly: `conversionGross = mapValue` and `conversionAmount =
    conversionTaxable(..., mapValue)`, with no inverse round trip.
- `convDollars` are the slot dollars at the moment of conversion: after growth, the 72(t) payments and the RMD, with the
  SEPP slots excluded.
  - They depend only on the start balances, the returns, `seppSlots` and `rmdA/B`, so they are computed **once per year
    before the pass loop**, the same ledger steps `accountsConvertPreview` replays, with amount 0.
  - `convertibleT` and `conversionGross` read them.
  - The gross preview at :1090 stays only for the `stateReadsK401` fractions and takes `conversionGross`.
- The row's `conversionAmount` is taxable and `conversionGross` is gross. Outside a `basisOn` year the two are equal and no
  new arithmetic runs.

**Draws and the other outflows** (only when `basisOn`; otherwise `τ` stays exactly 1):
- **Group draws.** A draw's `τ = groupTaxableFraction(iraRatio, accountDollars, group slots)`.
  - The taxable part `fromTrad * τ` goes to `wd.traditionalGross` and `cappableTraditional`. The gross goes to
    `traditionalWithdrawn`, the bucket and the ledger.
  - The solvers get a last parameter `taxableFrac = 1`. They price `traditionalGross + mid * taxableFrac` and charge the
    penalty as `(fromTrad * taxableFrac) * 0.1 * penalizedFraction`, in that order (72(t): only the includible amount).
  - `solveSplitForNet` takes `τ` per partner piece.
  - The MAGI cap and the fill are taxable rooms. `takeTraditional` and `takeTraditionalSplit` cap the gross draw at
    `magiCapLeft(wd) / τ`. `fillTraditional(wd, gap)` and its split form draw a gross of `gap / τ` (`τ > 0`; with `τ === 0`
    the cap and fill don't bind).
  - `attrA` and `ownerShareA` update with the taxable dollars (deviation 5 covers the pool-share split elsewhere).
- **RMD and 72(t).** The tax-free part of each partner's RMD is `ρ_p ×` the IRA share of that partner's draw:
  - `accountDollars[ira] / (ira + 401k)` for the pro-rata `accountsDraw`;
  - the slot's own 72(t) amount;
  - in a survivor year, the whole-pool pro rata over all four slots.

  The taxable part (`rmdTaxA/B`) goes into the profile's `rmdA/B` and `otherA/B`. The gross keeps the pool drop and the
  row's `rmd`.
- **The Roth ledger.**
  - `rothAccountsConvert(R, to, year, free)`: `to` is the taxable part per partner and `free` the tax-free part, from the
    per-slot `taken` × `ρ`. It pushes `{ year, amount: taxable, free: false }`, then `{ year, amount: free, free: true }`.
  - `rothAccountsSeason` seasons both entries.
  - `rothSlotSplit`'s `penaltyBase` counts only `free: false` conversion dollars.
  - `rothFreeCaps` adds the free entries that come before the first unseasoned `free: false` entry (408A(d)(4)(B)).
  - An entry without the flag behaves as `false`, and `free = null` pushes the old single entry.
- **The year end.** Before the year's contributions, when `basisOn || iraAdd > 0`: `iraBasis[p] -= ρ_p * (grownIRA_p -
  IRA_p dollars now)`, then `iraBasis[p] += iraNd_p`.
  - This subtracts the basis recovered. It never resets basis to `ρ ×` the balance, so basis above a fallen balance carries
    forward, as Form 8606 line 14 does.
  - `ρ` keeps its `min(1, ...)` clamp for pricing only.
  - `iraBasis[0]` and `iraBasis[1]` join `scalarSnapshot`.
- **The estate.** `estate.traditionalBasis = iraBasis[0] + iraBasis[1]`. `endTaxUS` taxes `T - traditionalBasis`, and
  `afterTaxEndValueUS` adds the gross `T`. One line in `us-accounts.md`: `lambdaEstimate` and `phaseScore` ignore basis.

- [ ] **Step 1: Write the failing tests.** Set stock and bond returns, inflation and the HYSA rate to 0 in every case, so
  `ρ` is the slider's percent exactly. Read row fields only; no differences between runs.
  - `it('100% basis makes a conversion tax-free')`: retired single, `tradIraA 100000, tradIraBasisPctA 100`, no other
    accounts, `rothAmountByAge` converting 40000 at the first age. Then `conversionGross === 40000` and `conversionAmount
    === 0`.
  - `it('an all-basis IRA converts in a fill year')`: the same accounts with the bracket fill on and no map. Year 1 has
    `conversionGross === 100000` and `conversionAmount === 0`.
  - `it('basis survives a loss year')`: `tradIraA 100000` at 100%, stock return -20% in year 1 (all stocks), no draws.
    Year 1's `iraBasis === 100000`.
  - `it('pro rata conversion')`: `tradIraA 300000` at 25%, the map converting 40000. Then `conversionAmount === 30000`
    and `conversionGross === 40000`.
  - `it('the fill sizes in taxable dollars')`: `tradIraA 300000` at 25%, the bracket fill on. Then `conversionGross ===
    conversionAmount / 0.75`, written with the code's expression.
  - `it('basis is recovered on an RMD')`: age 75, `tradIraA 400000` at 50%, `trad401kA 0`. Then `rmdTaxable === rmd *
    0.5`.
  - `it('penalty on the taxable part only')`: age 50, retired, penalized group only, `tradIraA` at 50%. Then
    `earlyPenalty === (traditionalWithdrawn * 0.5) * 0.1` (one draw; the code's expression order).
  - `it('nondeductible contributions become basis')`: the owner case with empty IRAs. Year 1's `iraBasis === 17200`.
  - `it('basis off is the feature off')`: the `pro rata conversion` plan at 0% basis. Every row's `tax`, `traditional` and
    `roth` `toBe` the same plan's run with `ctx.test.iraPhaseoutOff`.
  - `it('the ledger order')` (unit, `roth-ledger.js` directly): `{ taxable 3000, free 1000 }` in year 0, then a draw at
    year 2. The draw takes the 3000 as penalized first, then the 1000 free. `rothFreeCaps` gives `basis + 0` before the
    3000 is drawn.
- [ ] **Steps 2-4.** Also run `node tests/estimate_sites.js` and `node tests/engine_purity.js`, and `npx vitest run
  --sequence.shuffle` for the new suites.
  - Then run `node tests/snapshot.js --dump A` on `main` and `--dump B` here, and `--compare A B --ignore
    iraDeducted,iraNondeductible,iraMagi,conversionGross,rmdTaxable,iraBasis,iraBasisRecovered`.
  - Only scenarios with a traditional IRA contribution and a covered partner may move (Task 3's change). A scenario with
    basis 0 and no such contribution that moves is a bug.
- [ ] **Step 5:** commit `IRA basis: recovery on draws, RMDs and conversions`.

### Task 6: survivor, end-to-end, docs and baselines

**Files:**
- Test: `tests/unit/us/ira-basis-engine.test.js` (extend); `tests/survivor_symmetry.js` (extend with a basis case);
  `test_ira_basis.js` (new root Playwright script).
- Modify:
  - `README.md`;
  - `docs/architecture/us-accounts.md` (the basis ledger, the ratio rule, the Roth ledger's `free` flag);
  - `docs/architecture/us-federal-tax.md` (the phase-out, the ranges with the citation, the six deviations);
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
  - Dump both sides: `node tests/snapshot.js --dump` on `main` and on this branch. Then run `--compare A B --ignore
    iraDeducted,iraNondeductible,iraMagi,conversionGross,rmdTaxable,iraBasis,iraBasisRecovered`. Every row moves without the
    flag, because rows are hashed whole.
  - With the flag, only scenarios with a traditional IRA contribution and a covered partner may move. List them in the
    commit with the count, as the `tests/snapshot.js` header records earlier moves.
  - For `'default'`, record year 1's `tax` and `iraNondeductible` before and after in the commit message.
  - Then `npm run snapshot:update`, add a line to the header of `tests/snapshot.js`, and say in the commit that the update is
    intended (the deduction now phases out; owner-approved design 2026-11-04).
- [ ] **Step 4:** commit `IRA deduction and basis: docs, survivor tests, intended snapshot update`.

---

# PR 3: the backdoor checkbox

Branch `claude/ira-backdoor` from `main` at `860cf82` (PR 2 merged as #77). This is revision 5, dated 2026-11-05. It is
rewritten against the merged PR 2 code, and an Opus plan review's six Important and nine Minor findings are folded in. Line
numbers are `main` at `860cf82` (`run-projection.js` unless another file is named) and are hints only. PR 3 is one task, then
the gate.

**Deviation 7 (controller's ruling, for the owner to confirm with the PR):** a survivor's backdoor pro rata covers only the
survivor's own IRA. The deceased's IRA stays in its own slot, treated as an inherited account (as `accountStatuses` already
treats it), and an inherited IRA is outside the owner's Form 8606 pro rata. Real survivors who keep backdooring do this on
purpose. The spec's "a spousal rollover keeps basis" stays true for that slot's own draws.

### Task 1: the conversion of the nondeductible part

**Files:**
- Modify `src/us/core/inputs/defaults.js`: add `iraBackdoorA: false, iraBackdoorB: false`.
- Modify `src/us/ui/inputs/fields.js`: two `type: 'bool'` entries with `sync` / `resync` and `mcp: true`, like `megaBackdoor`
  (:117), next to `iraTypeA/B` (:141).
  - Also `src/us/ui/inputs/field-meta.js`'s gating table (:25-32): gate each box on its partner's `iraType === 'traditional'`.
- Modify `src/us/index.html`: a checkbox row directly under each partner's IRA contribution type row (:64 for A). B's row
  carries `data-partner-b`, as its type row does.
  - The label is the owner's: "Roll funds over the phase-out limit to Roth".
  - Its info tip follows CLAUDE.md, "Field descriptors and info bubbles": "Each year, the part of this IRA contribution that
    isn't deductible is converted to the Roth IRA (a backdoor Roth). The conversion is taxed pro rata on this partner's whole
    traditional IRA, so any pre-tax IRA money makes part of it taxable."
- Modify `src/us/ui/inputs/sync-controls.js`: each checkbox row is `hidden` unless that partner's `iraType` is `'traditional'`.
  - `setContributionType` calls `syncControls()` (`contribution-buttons.js:8-13`); check that the MCP path that sets
    `iraTypeA` also resyncs.
  - B's row also follows `data-partner-b` (single-person mode).
- Modify `src/us/core/accounts/ira-basis.js`: a new exported helper `backdoorMove(accts, bal, rothAccts, iraBasis, bdA, bdB,
  bdTaxA, bdTaxB, year)`, which returns the basis it recovered (`(bdA - bdTaxA) + (bdB - bdTaxB)`).
  - It uses module scratch: one 4-slot `BD_SLOTS` for both account-ledger calls, and `BD_TO` / `BD_FREE` for the Roth
    ledger. Register them in `tests/engine-purity.json`.
- Modify `src/us/core/income/year-stages.js` (`buildTaxProfile`, :308): it also returns `rmdA0: profile.rmdA, rmdB0:
  profile.rmdB`, after the remap.
- Modify `run-projection.js` in five places:
  - the year constants before the pass loop;
  - the pass-start 219(g) block (:836-863);
  - the two year-end sites (flow >= 0 at :1461-1480, flow < 0 at :1544-1549);
  - the row (:2958-2973);
  - the `iraAdd` comments (:599-601, :1307, :1543), which now read "the IRA dollars added back to income: the nondeductible
    contributions and the backdoor's taxable part".
- Modify `src/shared/core/format/cash-flow-parts.js` (:45): the conversion flow adds `(row.backdoor ?? 0)`.
- Tests:
  - `tests/unit/us/ira-backdoor.test.js` (new);
  - a case in the cash-flow-parts Vitest file;
  - `test_ira_basis.js` (extend);
  - `tests/survivor_symmetry.js` (one case).
- Docs:
  - the README feature list;
  - `docs/architecture/us-accounts.md`: the backdoor under traditional IRA basis; that the cash-flow chart shows it and the
    schedule card doesn't (the card lists the planner's own conversions);
  - `us-federal-tax.md`: deviation 4's backdoor exception (the item carried from PR 2), deviation 2 extended with "PA and RI
    may also read part of the backdoor's taxable part as 401(k) money (`k401Part` reads `rmdA`)", and deviation 7;
  - `magi-iteration.md`: `bdTaxA/B` is per pass, set like `iraNdA/B`, not snapshotted; `iraAdd`'s new meaning;
  - `test-inventory.md`.
- Badge: US V160 → V161.

**Interfaces:**
- Consumes from PR 2:
  - `iraNdA/B`, `iraTradA/B`, `iraOn`, `iraAdd`;
  - `iraBasis` (in `scalarSnapshot`; restored at :802-803, so every pass starts at the year's start value);
  - `iraBasisYearEnd`, `seppActive` (per slot);
  - `accountsDrawSlots(shares, pool, amounts)` and `accountsContribute(shares, pool, amounts)`, both taking the pool
    **before** the change;
  - `rothAccountsConvert(R, to, year, free)`: it pushes the taxable entry first, then the free one.
- Produces:
  - `backdoorMove` (above);
  - the per-pass `bdA/B` and `bdTaxA/B`;
  - the row fields `backdoor` (the gross converted, A + B) and `backdoorTaxable`, present only when `backdoor > 0`.

**Rules.**
- **Year constants, before the pass loop:**
  - `bdOnA = iraOn && inputs.iraBackdoorA === true && iraTradA > 0 && !seppActive[0]`; B uses `iraBackdoorB`, `iraTradB`
    and slot 2.
  - A 72(t) IRA slot never converts, since converting would break the 72(t) plan; the nondeductible dollars stay as basis.
  - When `bdOn_p`:
    - `G_p = accts.trad[2p] * grownPool`, the figure PR 2 puts in `iraDollars`. Compute it even when `basisOn` is false.
      `grownPool = bal.traditional * (1 + stockReturn) + bal.bondTraditional * (1 + bondReturn)`.
    - `D_p = G_p + iraTrad_p` (a year constant; `iraBasis[p]` is too). Per pass, `ρ'_p = Math.min(1, (iraBasis[p] + iraNd_p)
      / D_p)`, since `iraNd_p` varies by pass.
    - This is Form 8606 lines 6-9: the year-end value includes the **whole** contribution, the deductible part too.
  - With both boxes off nothing new runs, per CLAUDE.md's "skipped, not added" pattern.
- **At the pass start**, inside `if (iraOn)`, right after `iraNdA/B` and before the profile rebuild:
  - `bd_p = bdOn_p ? iraNd_p : 0`, and `bdTax_p = bd_p * (1 - ρ'_p)`, written in that expression order.
  - `profile.otherX` gets `+ bdTax_p` beside its `+ iraNd_p`. `profile.rmdX = rmdX0 + bdTax_p` (deviation 2: taxed like an
    RMD).
  - Each pass sets these from the `*0` values. Nothing else writes `profile.rmdA/B`, so a pass never adds twice.
  - A survivor's goes on slot A (`isSurvivorPeriod && deceasedIsA`: B's `bdTax` on A), the remap the wages use.
  - `iraAdd = iraNdA + iraNdB + bdTaxA + bdTaxB`, computed after `mA/mB`, so the 219(g) MAGI stays without it (deviation 1).
    Every `iraAdd` reader is right with it included (review M5). `iraDeducted` and `iraNondeductible` read `iraNdA/B`, so
    nothing is counted twice.
- **At the year end**, when `bdA + bdB > 0`, call `backdoorMove`. Add its return to `iraRecovered` (the row's
  `iraBasisRecovered`: tax-free dollars out).
  - When `flow >= 0`: immediately after `routeSurplus(...)` and the `cf*` reads (:1474-1476), **before**
    `refillBondReserve` (:1480). The refill can empty `bal.traditional`.
  - When `flow < 0`: immediately after `bal.roth += rothContrib` (:1549).
  - `backdoorMove` does:
    - the account ledger: `accountsDrawSlots(accts.trad, bal.traditional + bal.bondTraditional, BD_SLOTS)`, then
      `accountsContribute(accts.roth, bal.roth + bal.bondRoth, BD_SLOTS)`, with `BD_SLOTS = [bdA, 0, bdB, 0]` and each pool
      taken before its change;
    - the balances, split defensively as `applyRothConversion` does (`roth-conversion.js:25-30`): `fromT =
      Math.min(bal.traditional, bd)`, `bal.traditional -= fromT`, `bal.bondTraditional = Math.max(0, bal.bondTraditional -
      (bd - fromT))`, `bal.roth += fromT`, `bal.bondRoth += bd - fromT`;
    - the basis: `iraBasis[p] = Math.max(0, iraBasis[p] - (bd_p - bdTax_p))`, after `iraBasisYearEnd` has added `iraNd_p`;
    - the Roth ledger: `rothAccountsConvert(rothAccts, BD_TO, year, BD_FREE)`, with `BD_TO = [bdTaxA, bdTaxB]` and `BD_FREE =
      [bdA - bdTaxA, bdB - bdTaxB]`. The taxable entry gets the 5-year clock; the free entry is never penalized.
- **The row:** `row.backdoor = bdA + bdB` and `row.backdoorTaxable = bdTaxA + bdTaxB`, written only when `bdA + bdB > 0`.
  - `row.iraBasis` is the basis after the move.

- [ ] **Step 1: Write the failing tests** in `tests/unit/us/ira-backdoor.test.js`, following CLAUDE.md's Vitest rules 1-7.
  - **Base:** the owner case from `ira-deduction-engine.test.js:10-14`, plus `returnRate: 0, bondReturn: 0, inflation: 0,
    hysaRate: 0, bondYears: 0, trad401kA: 0, trad401kB: 0, tradIraA: 0, tradIraB: 0` (as `FLAT` in
    `ira-basis-engine.test.js:11-15`).
  - **Expected values:** hand-computed literals, or exact expressions in the code's order.
  - Engine cases:
    - `it('clean backdoor is tax-free')`: both boxes ticked. Year 1 has `backdoor === 17200`, `backdoorTaxable === 0` and
      `iraBasis === 0`, and its `tax` and `magiProxy` are `toBe` the unticked run's.
    - `it('a partial phase-out taxes the backdoor pro rata')`: PR 2 Task 3's partial case (219(g) MAGI 139,000), A ticked.
      A's contribution is 8600 and its deductible part 4300, so `backdoor === 4300` and `backdoorTaxable === 4300 * (1 - 4300
      / 8600)` (2150). Year 1's `magiProxy === off.magiProxy + 2150`.
    - `it('pre-tax money makes the backdoor taxable')`: `tradIraA 91400` at 0% basis, `iraPctB: 0` (the 219(g) MAGI is then
      178,600, still above 149,000), A ticked.
      - `backdoorTaxable === 8600 * (1 - 8600 / (91400 + 8600))` (7860.4).
      - `iraBasis === 8600 - (8600 - bt)` and `iraBasisRecovered === 8600 - bt`, where `bt` is the row's `backdoorTaxable`
        (this also checks basis conservation).
    - `it('a Roth IRA partner never backs door')`: `iraTypeA 'roth'` with **both** boxes ticked. Then `backdoor === 8600`
      (B's only).
    - `it('a deficit year still backs door')`: spending above net pay, so the year draws (flow < 0), A ticked, empty IRA.
      `backdoor === 8600`, and the year-end `traditional` balance is ≥ 0.
    - `it('a 72(t) IRA never converts')`: A's IRA under a 72(t) plan (use the repo's SEPP fields, as an existing 72(t) test
      does), A ticked, phased out. `backdoor === undefined`, and A's 8600 is in `iraBasis`.
  - `backdoorMove` unit cases, reading the Roth ledger directly as PR 2's "the ledger order" test does:
    - clean: `R[0].conv` `toStrictEqual [{ year, amount: 8600, free: true }]`;
    - partial: `[{ year, amount: 2150, free: false }, { year, amount: 2150, free: true }]`;
    - the slot dollars move from trad slot 0 to Roth slot 0, and the return is the free part.
  - In the cash-flow-parts Vitest file: a row with `backdoor: 8600` and no conversion gives a conversion flow of 8600.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to see them pass:** `npx vitest run tests/unit/us/ira-backdoor.test.js`, then the file alone with
  `--sequence.shuffle`.
- [ ] **Step 5: UI and survivor.**
  - In `test_ira_basis.js`:
    - the checkbox row is hidden while A's IRA is Roth, and visible after clicking `iraTraditionalBtnA`;
    - B's row is hidden in single-person mode;
    - ticking A's box with owner-like inputs (call `__test_flushRender()` first) changes `fireProjectionRows[0].backdoor`
      from `undefined` to a positive number;
    - there is no horizontal scroll at 390×844.
  - In `tests/survivor_symmetry.js`:
    - identical partners, both covered, both ticked, fully phased out, each with some pre-tax IRA;
    - a death year **before** the survivor's retirement, so the survivor still contributes;
    - assert that some survivor-period row has `backdoor > 0`, and that A-dies equals B-dies.
- [ ] **Step 6: Gate.**
  - `npm test` and `npm run test:ui`.
  - Run `node tests/snapshot.js --dump` on `main` and here, then `--compare`. **0** scenarios may move: the boxes default
    off and the row keys appear only when ticked.
  - `npm run snapshot:update` for `ui_us.json` changes only the hashes the new controls touch (schema, text, state). Check
    that no `projectionHash` or `rowsHash` moves.
  - `node tests/legacy_state.js --update` for the new default keys. Check that the diff is hashes only.
  - The commit names both as intended baseline updates, and notes that the in-app Monte Carlo seed hashes the inputs (as in
    PR 1 and PR 2).
- [ ] **Step 7: Docs and commit.** Update the docs listed above and set the badge to V161. Commit `Backdoor Roth: convert the
  nondeductible IRA part`.

**Review Focus (PR 3):**
1. A pass that runs twice must not add `bdTax` twice to `profile.rmdX` or `profile.otherX`. They are rebuilt from the `*0`
   values each pass.
2. The year-end move comes before `refillBondReserve` when flow >= 0. A flow < 0 year with a contribution still backs door
   (tested).
3. A survivor's backdoor lands on slot A of the profile, but the ledger slot stays the partner's own (`2p`). The
   survivor-symmetry case reaches it.
4. A 72(t) IRA slot never converts (tested).
5. Basis is conserved: start basis + nondeductible = end basis + recovered, including the backdoor's free part (tested).

# Bond reserve: held from the start, the split and the bridge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bond reserve can be held from the plan's start (always, for a plan that retires in year 0); US plans can split the
retirement reserve between traditional and Roth and hold a separate brokerage-only bridge reserve until 59½.

**Architecture:** All reserve moves live in `src/shared/core/withdrawals/bond-ladder.js`. "Held" is a relabel of the opening
balances before the year loop (no tax, no MAGI). The bridge is not a new account: it is a dollar counter `bal.bridgeBonds` inside
`bal.bondTaxable` (so the bond interest, tax, rows, investable and every `bondTaxable` reader stay as they are); the retirement
reserve's sums subtract it, and draws from `bondTaxable` spend it first. Three PRs: (1) held + the year-0 fix, both planners;
(2) the US split; (3) the US bridge.

**Tech Stack:** plain ESM in `src/`, esbuild, Vitest (tests/unit), Playwright root scripts.

**Spec:** `docs/superpowers/specs/2026-11-23-bond-reserve-split-design.md` (read it; this plan argues from it).

## Global Constraints

- CLAUDE.md rules hold throughout: engine functions read `ctx.inputs` only; a new enum field gets `values` / `fallback` in its
  `FIELDS` entry; new `bal` fields go in the `bal` literal (rewound automatically by `balSnapshot`); no new module-level mutable;
  exact comparisons in Vitest (`toBe` / `toStrictEqual`), hand-computed expected values; `npm test` exact to the cent.
- **Exactness anti-goal:** with `bondStart: 'build'`, `bondTradPct: 100`, `bridgeBondYears: 0`, every plan whose retirement year is
  ≥ 1 gives the same rows to the last bit as before. Only plans with retirement year 0 and `bondYears > 0` move (PR 1), and they
  move on purpose; each PR's commit names every golden / snapshot entry that moved and why.
- New fields: `bondStart` `'build' | 'held'` (default and fallback `'build'`, both planners); `bondTradPct` 0–100 integer, default
  100 (US); `bridgeBondYears` 0–15, default 0, clamped like `bondYears` (US). `bondYears` keeps its key; its US label becomes
  "Retirement bonds".
- Version badges: each PR bumps the badge of every planner it changes to the next free number at merge time (now US V200,
  Canada V94). PR 1 bumps both; PRs 2 and 3 bump US only.
- **Every bridge read is guarded (plan review H1/H2).** Each new use of `bal.bridgeBonds` or `ladder.bridgeTarget` sits behind
  `> 0`, with today's code verbatim in the other branch (`if (bal.bridgeBonds > 0) { split path } else { today's body }`). Many test
  balances and helper ladders have no `bridgeBonds` / `bridgeTarget` key (`maintained-reserve.test.js` `BAL()`,
  `tests/unit/helpers/bond-refill.js`, the `BAL0` literals of gains-capped, order-draw, penalized-drain, split-draw, free-room):
  `undefined > 0` is false, so they keep today's path, and `takeBondTaxable` writes the counter only when it was > 0 (so
  `toStrictEqual({ ...BAL0, ... })` never sees a new key). It also keeps the hot path free of the bridge's work. Where the counter is
  reduced, clamp it to `min(bridgeBonds, bondTaxable)` (L3).
- After adding or changing a module's exports: `npm run analyze` (the module map; `npm test` fails while it is stale), and a line in
  `docs/architecture/test-inventory.md` for every new test file.
- The UI checks go in one new root script, `test_bond_reserve.js` (none exists today): exit 1 on a failure, `__test_flushRender()`
  before reading rows or the notes, a 390×844 no-horizontal-scroll check. PR 1 creates it; PRs 2 and 3 extend it.
- Tests read the buckets through the `trace` records: Task 1.3 adds `bondTaxable, bondTraditional, bondRoth, bridgeBonds` to the
  `trace.push` object (run-projection ~3097, a test-only path), so later tasks can assert per-bucket figures.
- PRs 2 and 3 move no golden or snapshot figure at the defaults: if one moves, that is a bug, not a baseline update.
- Docs in the same commit as the behavior: `docs/architecture/engine.md` (ladder, maintained reserve, held, bridge),
  `us-accounts.md` (bridge, penalty-free end), README feature list, info bubbles written from what the engine does.

## Review Focus

1. **A `'held'` plan that retires in 10 years** — the reserve sits in bonds through the working years, untouched: the window
   moves nothing (already full) and nothing trims it before retirement. Test in Task 1.3.
2. **A couple, one partner dies before the younger reaches 59½** — the bridge ends when every *living* partner is 59½+, so the
   death can end it early; it must not stay open forever or end before the living partner is 59½. Test in Task 3.3.
3. **The brokerage account is smaller than the bridge** (her case: $80k brokerage) — the bridge holds what it can, nothing comes
   out of traditional or Roth, and `bridgeShortfall` reports the gap. Test in Task 3.2.
4. **A Roth conversion while the split is 80/20** — conversions move bond money to Roth as today, and the refill/trim never move
   money between traditional and Roth to restore the split. Test in Task 2.2.
5. **The plain projection with a bridge** — no down year ever, so the standard-order bridge step never fires and the bridge just
   ends at 59½ (moved to stocks); the end-of-bridge move must be a relabel with no tax in that year's row. Test in Task 3.3.

---

## PR 1 — Held from the start, and the year-0 fix (both planners)

### Task 1.1: `planBondLadder` and `placeHeldReserve`

**Files:**
- Modify: `src/shared/core/withdrawals/bond-ladder.js` (`planBondLadder`; new `fillSplit`, `placeHeldReserve`)
- Test: `tests/unit/shared/bond-held.test.js` (new)

**Interfaces:**
- Produces: `planBondLadder({ retirementYear, bondYears, bridgeYears = 0, projectedExpense })` → today's
  `{ ladderTranches, ladderTarget, rotationStartYear, rotationEndYear }` (unchanged; `retirementExpense` reads
  `ladderTranches[0]`) plus `bridgeTarget`: its own loop, `projectedExpense(retirementYear + i)` for `i < floor(bridgeYears)` plus
  the fractional last tranche as the ladder does; 0 when `bridgeYears` is 0 (review M2: not a sum of `ladderTranches`, which has
  only `bondYears` entries). The window length is
  `max(ceil(bondYears), ceil(bridgeYears))`. **Retirement year 0: `rotationStartYear = 0`, `rotationEndYear = -1`** (empty window;
  `year > rotationEndYear` is true from year 0, so the maintained rules start in year 0). Retirement year ≥ 1: unchanged.
- Produces: `fillSplit(bal, amount, tradWant)` → the part of `amount` not placed. Moves stocks to bonds inside the retirement
  accounts: traditional up to `min(amount, tradWant, bal.traditional)`, then Roth up to `min(left, bal.roth)`, then traditional
  again up to `min(left, bal.traditional)`. A pure reallocation (no tax). PR 2 uses it with `tradWant < amount`; in PR 1 every
  caller passes `tradWant = amount`, which is exactly today's traditional-then-Roth order.
- Produces: `placeHeldReserve(bal, { target, tradShare = 1, bridgeTarget = 0, cashFree = 0 })`, no return. In order:
  1. retirement reserve: `left = fillSplit(bal, target, target * tradShare)`;
  2. bridge (PR 3; 0 in PR 1): relabel from `bal.taxable` up to `bridgeTarget` (basis share `taxableBasis * moved / taxable`), then
     from `bal.cash` up to `min(cashFree, still needed)` (full basis); add what moved to `bondTaxable` / `bondTaxableBasis` and to
     `bal.bridgeBonds`;
  3. the retirement reserve's `left` relabelled from `bal.taxable` (basis share) into `bondTaxable` (the last resort, no sale).
  No tax, no gain, nothing returned: the person already holds these.

- [ ] **Step 1: Write the failing tests** (`bond-held.test.js`, `w.load('shared/core/withdrawals/bond-ladder.js')`):
  - `planBondLadder` year 0: `{ retirementYear: 0, bondYears: 5, projectedExpense: (y) => 100 }` → `ladderTarget` 500,
    `rotationStartYear` 0, `rotationEndYear` -1, `bridgeTarget` 0.
  - year 3, `bondYears: 5` → start 0, end 2 (unchanged); year 10 → start 5, end 9 (unchanged); `bridgeYears: 7, bondYears: 2,
    retirementYear: 10` → start 3, end 9, `bridgeTarget` 700.
  - `placeHeldReserve` on `{ taxable: 1000, taxableBasis: 600, traditional: 300, roth: 400, bond*: 0, cash: 50, bridgeBonds: 0 }`
    with target 500 → `bondTraditional` 300, `bondRoth` 200, traditional 0, roth 200, taxable unchanged.
  - same with `roth: 100`, target 500 → bondTraditional 300, bondRoth 100, `bondTaxable` 100, `bondTaxableBasis` 60, taxable 900,
    taxableBasis 540.
- [ ] **Step 2:** `npx vitest run tests/unit/shared/bond-held.test.js` → FAIL (no `placeHeldReserve`, year-0 end is 4).
- [ ] **Step 3:** Implement the three functions as above in `bond-ladder.js`.
- [ ] **Step 4:** the same command → PASS; `npx vitest run --sequence.shuffle tests/unit/shared/bond-held.test.js` → PASS.
- [ ] **Step 5:** Commit (`Bond reserve: planBondLadder year-0 window and placeHeldReserve`).

### Task 1.2: The `bondStart` field (both planners)

**Files:**
- Modify: `src/us/core/inputs/defaults.js`, `src/canada/core/inputs/defaults.js` (`bondStart: 'build'`);
  `src/us/ui/inputs/fields.js`, `src/canada/core/inputs/fields.js` (one `type: 'choice'` entry, `values: ['build', 'held']`,
  `fallback: 'build'`, `mcp: true`, as `tenure` is); `src/us/index.html`, `src/canada/index.html` (a two-button group under
  "Bond reserve size": "Build before retirement" / "Start with it held"; descriptor under ~70 characters; an info bubble saying
  that held means the balances entered already include the bonds, nothing is sold and no tax is charged, and that a plan that
  retires this year always starts held)
- Test: `tests/unit/{us,canada}/guard-normalize.test.js` (the entry needs `manual: true`, as `tenure` has, since it is a button group)

**Interfaces:**
- Produces: `inputs.bondStart`, always `'build'` or `'held'` after `normalizeState`.

- [ ] **Step 1:** failing test: `normalizeState({ bondStart: 'bogus' }).bondStart` is `'build'`; `'held'` stays; missing → `'build'`.
- [ ] **Step 2:** run it → FAIL.
- [ ] **Step 3:** add the defaults, the `FIELDS` entries and the markup. When the plan retires this year, the group shows "Held:
  this plan retires this year" and disables the Build button, reading `retirementYear` from the selected result (it covers
  partner B and the death clamp; never recompute it), through the mechanism the neighbouring choice fields use.
- [ ] **Step 4:** run it → PASS; `node --check` each changed module.
- [ ] **Step 5:** Commit.

### Task 1.3: The engines hold the reserve from the start

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (the `bal` literal at ~230: `bridgeBonds: 0`; after `planBondLadder` at ~347),
  `src/canada/core/projection/run-projection.js` (the same two places, ~45-50 and ~108);
  `src/us/ui/install-test-hooks.js:375` (`bridgeBonds: 0` in the hook's `bal`)
- Test: `tests/unit/shared/bond-held.test.js` (engine part), `tests/unit/shared/maintained-reserve.test.js` (adjust)

**Interfaces:**
- Consumes: `planBondLadder`, `placeHeldReserve` (Task 1.1), `inputs.bondStart` (Task 1.2).
- Produces: in both engines, right after `planBondLadder`: `const heldStart = inputs.bondStart === 'held' || retirementYear === 0;`
  and `if (heldStart && bondYears > 0) placeHeldReserve(bal, { target: ladder.ladderTarget })` — before the year loop, so before
  year 0's `investmentIncome`, `balSnapshot` and `growBalances` (no snapshot entry needed). **When `heldStart`, the
  `rotateIntoBondLadder` call is skipped at both engine call sites** (review H4: the spec's "the build window does not run"; a held
  reserve that dips below the ramp in a down path must not be rebuilt by a taxed sale). `rotationEndYear` is kept, so the maintained
  rules still start at retirement (from year 0 for a year-0 retiree, whose window is empty). Year 0 of a year-0 retiree places
  `ladderTarget` and the maintained rules trim it to `reserveSpend * bondYears` the same year (harmless; L4).

- [ ] **Step 1: Write the failing engine tests** (`engine(w)`, `simulateRaw`, the `runner()` pattern of
  `maintained-reserve.test.js`):
  - year-0 retiree (the `runner()` household), standard mode: `atTarget(rows[0])` (held at the maintained target from year 0,
    `maintained-reserve.test.js`'s own check; not `ladderTarget`, which the same year trims — review H3a).
  - the same plan under a market scenario crash at retirement (`marketScenario: { kind: 'crash', order: 'bucket', crashes:
    [{ age: 61, drop: 50, fallYears: 2, recoverPct: 100, recoverYears: 4, inflation: 0, bondReturn: 0 }] }`): the stocks' year-0
    loss applies to the stocks only — `rows[0].bonds` is ≥ 3 × expense (one year drawn at most) and the bonds never rise while
    `stockReturn < 0` (no ladder move in a fall year).
  - `bondStart: 'held'`, retiring in 10 years, `bondReturn: 0`, a working plan with no surplus routed to bonds: `rows[k].bonds ===
    result.ladderTarget` for every `k < retirementYear` (placed once, never moved or trimmed — review focus 1).
  - `bondStart: 'build'`, retiring in 3 years, `bondReturn: 0`: `rows[0].bonds === result.ladderTarget * ((0 - 0 + 1) / 3)` (the
    engine's own expression, so `toBe` holds bit for bit — review H3c).
- [ ] **Step 2:** run → FAIL (year 0 builds over 4 years).
- [ ] **Step 3:** add `bridgeBonds: 0` to both `bal` literals and the hook's `bal`; add the `placeHeldReserve` call in both engines.
- [ ] **Step 4:** run the new tests → PASS. Then `npm run test:unit`. `maintained-reserve.test.js` runs year-0 retirees whose
  "after the build" slice starts at row 4: they now hold from row 0; change each `rows.slice(4)` to `rows` only if the assertion
  still holds for rows 0-3 (it should: the reserve is held at its target from year 0), and fix its header comment. Any other unit
  test that moves must be a year-0 retiree with `bondYears > 0`; list them.
- [ ] **Step 5:** `npm test`. Expected: golden / snapshot failures only for year-0 retirees with a reserve. For each, check the
  moved figure goes the expected way (the reserve held from year 0) and update it; `npm run snapshot:update` for the snapshot
  baselines, noting in `tests/snapshot.js`'s header comment the moved entries and the owner approval (2026-11-23), as earlier
  moves are noted there.
- [ ] **Step 6:** `npm run build`, then create `test_bond_reserve.js` (see Global Constraints): toggling "Start with it held" on a
  plan retiring in 5 years changes `window.fireProjectionRows[0].bonds`, on both planners; the year-0 note shows for a plan
  retiring now; 390×844 shows no horizontal scroll. `node test_bond_reserve.js` → exit 0.
- [ ] **Step 7:** Docs: `engine.md` (the year-0 window, held placement before the loop, the skipped window), README (held choice),
  the bubble, `test-inventory.md`; `npm run analyze`; badges US and Canada. `npm test`. Commit, open PR 1.

---

## PR 2 — The retirement reserve's traditional/Roth split (US)

### Task 2.1: `bondTradPct` and the split in the fills

**Files:**
- Modify: `src/shared/core/withdrawals/bond-ladder.js` (`rotateIntoBondLadder`, `refillBondReserve` take `tradShare`);
  `src/us/core/projection/run-projection.js` (pass `tradShare` to `placeHeldReserve`, `rotateIntoBondLadder` and every
  `refillBondReserve` call, ~1490, ~1529, ~1573); `src/us/core/withdrawals/strategies.js` and
  `src/shared/core/withdrawals/bucket-order.js` (the bucket refills: thread `tradShare` through `wopts`);
  `src/us/core/inputs/defaults.js`, `src/us/ui/inputs/fields.js` (`bondTradPct`, number, 0-100, `min`/`max`, `out: v => v + '% traditional'`,
  as `tradIraBasisPctA`; the integer is enforced by `step="1"` on the range and a `Math.round` in its `normalizeState` clamp,
  review L7), `src/us/index.html` (a range slider under the bond field: "Traditional ●──○ Roth")
- Test: `tests/unit/us/bond-split.test.js` (new); the existing `tests/unit/{us,canada}/bond-refill.test.js` must pass unchanged.

**Interfaces:**
- Produces: `rotateIntoBondLadder(ctx, bal, ladder, profile, conversionAmount, tradShare = 1)` — the deficit is computed as today
  (`ladderTarget * progress - (bondTaxable + bondTraditional + bondRoth)`), then placed with
  `fillSplit(bal, remaining, max(0, ladderTarget * progress * tradShare - bal.bondTraditional))`, then taxable as today.
- Produces: `refillBondReserve(wd, bondTarget, { maxMove, taxable, tradShare = 1 })` — the same deficit and cap as today, placed with
  `fillSplit(bal, remaining, max(0, bondTarget * tradShare - bal.bondTraditional))`, then taxable as today.
- At `tradShare = 1` both are identical to today (the first traditional step takes everything traditional can hold). The trim and
  `routeSurplus` do not change (spec).
- Canada calls both with the default (Canada has no split).

- [ ] **Step 1: failing tests** (`bond-split.test.js`):
  - `refillBondReserve` on `{ traditional: 1000, roth: 1000, bond*: 0, taxable: 0, ... }`, target 500, `tradShare: 0.8` →
    `bondTraditional` 400, `bondRoth` 100.
  - `roth: 50`, the same → `bondTraditional` 450, `bondRoth` 50 (the overflow).
  - `traditional: 0, roth: 0, taxable: 1000, taxableBasis: 1000` → the taxable last resort as today (bondTaxable 500).
  - engine: a held year-0 retiree at `bondTradPct: 80`, `bondYears: 5` → standard mode (no draw reaches the bonds), ample Roth:
    `trace[0]` (Task 1.3's added fields) has `Math.abs(bondTraditional - 4 * bondRoth) <= 1e-9 * bondTraditional` (the same-year trim
    is pro rata, so it keeps the ratio up to rounding; the tolerance written out, per the Vitest rules).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement; add the field and slider.
- [ ] **Step 4:** run → PASS; `npm run test:unit` → no other change (the default is 100).
- [ ] **Step 5:** Commit.

### Task 2.2: Report the split held, and the slider's line

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (a result field), `src/us/ui/results/render.js` (or the module that renders the
  bond field's line — `fundedYears` at ~99 is the reserve's existing readout; put the line beside it), `src/us/index.html`
  (an empty `<small id="bondSplitNote">` under the slider)
- Test: `tests/unit/us/bond-split.test.js`; the bond root UI script

**Interfaces:**
- Produces: result `bondSplitHeld` — the traditional share, in whole percent rounded, of `bondTraditional + bondRoth` **at the
  fill, before any draw** (review H5): for a held plan a const right after `placeHeldReserve`; for a build plan a `let` set right
  after `rotateIntoBondLadder` in year `rotationEndYear` (it is written in the year body, so it goes in `scalarSnapshot`). `null`
  when `bondYears` is 0 or that sum is 0. The note shows "Held {h}/{100-h} at retirement: not enough in {Roth|traditional}."
  when `bondSplitHeld !== null` and `|bondSplitHeld - bondTradPct| >= 1`; empty otherwise.

- [ ] **Step 1: failing tests:** `bondTradPct: 80` with no Roth money → `bondSplitHeld` 100; with ample Roth → 80; `bondYears: 0`
  → null. **Review focus 4:** a plan at 80/20 with no Roth money and conversions off: `bondRoth` is 0 in every year (no refill or
  trim ever moves traditional money into Roth to restore the split); the same plan with conversions on: `bondRoth` rises only in
  conversion years.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5:** `test_bond_reserve.js`: set `bondTradPct` 80 on a plan with no Roth, `__test_flushRender()`, read `#bondSplitNote` text
  "Held 100/0 at retirement: not enough in Roth."; with Roth money it is empty.
- [ ] **Step 6:** docs (`engine.md`, `us-accounts.md`, README, bubble, `test-inventory.md`), `npm run analyze`, US badge;
  `npm test` (no golden or snapshot moves); commit, open PR 2.

---

## PR 3 — The bridge reserve (US)

### Task 3.1: The bridge counter in the shared moves

**Files:**
- Modify: `src/shared/core/withdrawals/bond-ladder.js` (`rotateIntoBondLadder`, `refillBondReserve`, `trimBondReserve`;
  new `endBridge`); `src/shared/core/withdrawals/draws.js` (new `takeBondTaxable`, `takeBridgeOnly`);
  `src/us/core/projection/balances.js` (`bal.bridgeBonds *= 1 + bondReturn` beside `bondTaxable`'s growth);
  `src/us/core/projection/year-modes.js` (`routeSurplus`)
- Test: `tests/unit/us/bridge.test.js` (new); `maintained-reserve.test.js` and `bond-refill.test.js` unchanged and passing

**Interfaces:**
- The retirement reserve's bond total everywhere it is compared to a target is
  `bal.bondTaxable - bal.bridgeBonds + bal.bondTraditional + bal.bondRoth`: in `rotateIntoBondLadder`'s deficit, `refillBondReserve`'s
  deficit, `trimBondReserve`'s total (the trim's taxable fraction applies to `bondTaxable - bridgeBonds` only, the bridge's dollars
  and their basis share stay), and `routeSurplus`'s deficit. With `bridgeBonds` 0 each is today's expression.
- `rotateIntoBondLadder` also ramps the bridge: `bridgeLeft = max(0, ladder.bridgeTarget * progress - bal.bridgeBonds)`, sold from
  `bal.taxable` only (`drawTaxable`, stacked on the retirement step's gain), added to `bondTaxable`, its basis and `bridgeBonds`;
  never from traditional or Roth. The returned gain and `LADDER_OUT.saleTax` are the two sales' sums.
- `routeSurplus(bal, { ..., bridgeTarget = null })`: after the retirement reserve's top-up (or in its place when `bondTarget` is
  null: `bondYears` 0, or a bucket down year), surplus left goes to the bridge up to `bridgeTarget - bridgeBonds` (into
  `bondTaxable`, full basis, and `bridgeBonds`). The bridge part counts in `SURPLUS_OUT.toBonds` (the cash-flow chart; review M7).
  Behind `bridgeTarget > 0`; null or 0 is today's body.
- The rotate ramp is behind `ladder.bridgeTarget > 0` (H1). `render.js:99`'s funded-years readout subtracts `bridgeBonds` from the
  bonds it counts (L2; expose the bridge at retirement on the result for it, or compute it from `bridgeShortfall` and
  `bridgeTarget`).
- `takeBondTaxable(wd, need)` → net raised: `takeTaxable(wd, 'bondTaxable', need)`, then
  `bal.bridgeBonds = max(0, bal.bridgeBonds - (bondTaxable before - after))` (the bridge goes first).
- `takeBridgeOnly(wd, need)` → net raised: a `takeTaxable`-style draw on a pool of `bal.bridgeBonds` with basis
  `bondTaxableBasis * bridgeBonds / bondTaxable`, taken out of `bondTaxable`, its basis and `bridgeBonds`; gains into
  `wd.taxableGainGross`, `wd.taxableWithdrawn` as `takeTaxable` does.
- `endBridge(bal)`: moves `bridgeBonds` dollars and their basis share from `bondTaxable` / `bondTaxableBasis` to `taxable` /
  `taxableBasis`; `bridgeBonds = 0`. No tax.

- [ ] **Step 1: failing tests** (hand-computed): trim on `{ taxable: 1000, taxableBasis: 600, bondTaxable: 300,
  bondTaxableBasis: 150, bridgeBonds: 200, traditional: 0, bondTraditional: 500, roth: 0, bondRoth: 0 }`, target 300 → the
  retirement part is 100 taxable + 500 traditional = 600, f = 0.5: `bondTaxable` 250, `bondTaxableBasis` 125 (the retirement part's
  basis share 50, half moved), `taxable` 1050, `taxableBasis` 625, `bondTraditional` 250, `traditional` 250, `bridgeBonds` 200;
  `takeBondTaxable` of 150 net at zero gain → `bridgeBonds` 50; `endBridge` on `bondTaxable 300, basis 240, bridgeBonds 100` →
  taxable +100, taxableBasis +80, bondTaxable 200, basis 160; `routeSurplus` fills the retirement deficit first, then the bridge.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS, and `npm run test:unit` unchanged elsewhere.
- [ ] **Step 5:** Commit.

### Task 3.2: `bridgeBondYears`, the fill and the shortfall

**Files:**
- Modify: `src/us/core/inputs/defaults.js`, `src/us/ui/inputs/fields.js` (`bridgeBondYears`, number), `src/us/index.html` (the
  US `bondYears` label becomes "Retirement bonds (years of expenses)", its bubble saying it is held in traditional and Roth; the new
  field, "Bridge bonds (brokerage) — years of expenses", bubble: spent first in a down year until every partner is 59½, then
  moved to stocks; filled once, never topped up by selling stocks; surplus can top it up);
  `src/shared/core/projection/year-factors.js` (`getBridgeYears(inputs)`, clamped 0-15 like `getBondYears`, default 0);
  `src/us/core/projection/run-projection.js` (`planBondLadder({ ..., bridgeYears })`, `placeHeldReserve({ ..., bridgeTarget,
  cashFree: max(0, inputs.cash - inputs.cashReserve) })`, the hold condition becomes `bondYears > 0 || bridgeYears > 0`; the result
  field `bridgeShortfall`); the bond readout module (the shortfall line)
- Test: `tests/unit/us/bridge.test.js`; the bond UI script

**Interfaces:**
- Produces: result `bridgeShortfall` — `max(0, ladder.bridgeTarget - bal.bridgeBonds)` **at the fill, before any draw** (review
  H5): a const right after `placeHeldReserve` (held), or a `let` set right after `rotateIntoBondLadder` in year `rotationEndYear`
  (build; in `scalarSnapshot`), rounded to dollars; 0 when `bridgeYears` is 0.
- **A bridge already over at retirement** (every living partner 59.5+ in year `retirementYear`; review M5): `bridgeTarget` is set
  to 0 after `planBondLadder`, so nothing is sold or placed for it, and `bridgeShortfall` is 0. The `bridgeOver` test of Task 3.3
  is the one used here (a small exported helper `bridgeOverAt(...)` in `run-projection.js`'s scope or `year-factors.js`, so both
  sites share it).
- `estimates.js:86`'s label and the print report (`src/us/ui/plans/print-report.js`) follow the rename and show the new fields (L5). The line: "Bridge short by {money}: the brokerage account
  is too small." when > 0.

- [ ] **Step 1: failing tests:** **Review focus 3** — her case shape: single, 59, retiring now, held, `taxable: 80000`, `cash:
  100000`, `cashReserve: 50000`, `bridgeBondYears: 3`, spending ~55k → `bridgeShortfall` = bridgeTarget − 130,000, and the
  traditional and Roth stocks are untouched by the bridge (`bondTraditional + bondRoth` equals the retirement reserve alone). A build
  plan retiring in 4 years with `bondYears: 0, bridgeBondYears: 3` → the bridge ramps (window from the larger setting), the sale's
  gain shows in the rows' tax. A 62-year-old retiring now with `bridgeBondYears: 3` → `bridgeShortfall` 0 and no bridge in
  `trace[0].bridgeBonds` (already over).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS. **Step 5:** commit.

### Task 3.3: Spending the bridge and ending it

**Files:**
- Modify: `src/us/core/withdrawals/strategies.js` (the three `takeTaxable(wd, 'bondTaxable', …)` sites, ~81, ~162, ~172, become
  `takeBondTaxable(wd, …)`; `withdrawStandard` gains the down-year step); `src/us/core/projection/run-projection.js` (`wopts` for the
  standard mode adds `yearReturn: stockReturn`; the bridge end; `bridgeTarget` to `routeSurplus`)
- Test: `tests/unit/us/bridge.test.js`

**Interfaces:**
- `withdrawStandard(wd, { age, yearReturn })`: first, if `yearReturn < 0 && wd.bal.bridgeBonds > 0`,
  `wd.need -= takeBridgeOnly(wd, wd.need)`; then today's body unchanged. `yearReturn` undefined (any other caller) → no step.
- The bridge is open in a year when `!bridgeOver`, where `bridgeOver` is: every living partner's age this year is ≥ 59.5 (single:
  `age >= 59.5`; couple: a partner counts while not dead — `!(deceasedIsA && year >= deathYear)` for A, the same for B, with `ageB`).
  In the year body, right after `rotateIntoBondLadder`: `if (bridgeOver && bal.bridgeBonds > 0) endBridge(bal)`. `routeSurplus`
  gets `bridgeTarget: !bridgeOver && year > ladder.rotationEndYear && bridgeYears > 0 ? reserveSpend * bridgeYears : null`.

- [ ] **Step 1: failing tests:**
  - bucket mode, held, 52-year-old retiring now, a crash at 52: the down years draw `bridgeBonds` before any taxable stock (taxable
    stocks unchanged in the fall years while the bridge lasts).
  - standard order under the same scenario (`order: 'standard'`): the same — the bridge is drawn before brokerage stocks in the
    down years; in up years the standard order is unchanged (taxable stocks first).
  - **Never refilled by a sale (spec; review M6):** in the bucket crash run, after a down year draws the bridge, `trace[k].bridgeBonds`
    never rises in a later year except by that year's `toBondReserve` surplus (a run with no surplus: it never rises).
  - **Review focus 5:** the plain projection at a non-negative return (`returnRate` can be set as low as -10, which makes every year
    a down year: the bubble says "a down year", not "never in the plain projection"; L1), 52 retiring now, bridge 3 years: no year
    draws the bridge; the year the person turns
    60 (`age >= 59.5`), `bridgeBonds` goes to 0 and the row's `bonds` drops by the moved amount while `taxable` rises by it
    (the move is `endBridge`, a relabel that never touches `wd`, so it cannot add a gain or a tax: unit-tested in Task 3.1).
  - **Review focus 2:** a couple, A 58 and B 50, A dies at 62 (survivor on): the bridge stays open while B is under 59.5 and ends the
    year B is 60; with B dying instead at 55 (A then 63), it ends in the year of B's death.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; `npm run test:unit`, `npx vitest run --sequence.shuffle`.
- [ ] **Step 5:** `test_bond_reserve.js`: setting `bridgeBondYears` 3 on a 52-year-old changes `fireProjectionRows` (bonds at row 0), the
  shortfall line appears for a small brokerage; mobile width check.
- [ ] **Step 6:** docs (`engine.md`, `us-accounts.md` — the bridge and its end, README, bubbles, `test-inventory.md`),
  `npm run analyze`, US badge; `npm test` (no golden or snapshot moves); commit, open PR 3.

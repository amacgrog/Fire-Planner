# Cash flow diagram redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-year cash-flow Sankey in both planners with a five-column diagram (items → groups → total →
groups → items) that has no plug, shows the employer match and named list rows, and has a full-screen view that fits a
desktop window and a phone held either way.

**Architecture:** A few display-only scalars per row from the engine (four US, five Canada); a pure per-country `core/` function that, for one
row, recomputes each list item from the inputs and returns grouped columns in raw dollars (its sums are checked against
the row by Vitest); a pure shared layout module (generic five-or-three-column Sankey with centred columns, one scale and
label collision handling); the shared drawing module rewritten on top of it, plus a full-screen overlay for the card. An
optional `name` on every list row feeds the labels.

**Tech Stack:** plain ES modules under `src/`, esbuild (`npm run build`), Vitest (`tests/unit/`), Playwright root
`test_*.js` scripts.

**Spec:** `docs/superpowers/specs/2026-11-05-cash-flow-sankey-redesign-design.md` (read it first; section numbers below
refer to it). Background: `docs/superpowers/specs/2026-11-04-cash-flow-chart-design.md` (the bar chart, PR #74).

## Global Constraints

- Read `CLAUDE.md` before any task. Edit `src/`, never `dist/`. Module files keep two-space indentation; line 1 of a new
  `core/` or `ui/` module is a one-line `//` purpose comment, then a blank line; run `npm run analyze` after adding a module.
- Engine rules: new row fields are scalars on every row (0 when nothing happened), read by no engine path; no per-item array
  on a row; nothing else in the year loop changes. Golden, parity and engine numbers stay identical.
- Vitest rules (`CLAUDE.md` "Writing a Vitest test"): `world()` and `w.load(...)` only, exact comparisons, tolerances
  written out (`Math.abs(a - b) <= 1`), a `makeCounter()` count asserted in `afterAll` for suites with many checks, run
  each new suite alone and with `npx vitest run --sequence.shuffle`.
- Copy is descriptive, never advice. Labels exactly as spec section 3 tables; the card description, note and button text
  exactly as spec section 6.
- Names: user text goes into the DOM only through `textContent` or `escapeHtml`, never raw HTML.
- Money shown with `money()` (tooltips) and `compact()` (labels); every band value goes through `displayValue(n, row.year)`.
- The page never scrolls sideways at 390×844 (`document.documentElement.scrollWidth <= clientWidth`).
- Phone test: `matchMedia('(max-width: 820px), (max-height: 500px) and (pointer: coarse)')`.
- Do not change the main chart's expand behaviour (`chart-toolbar.js`, `#mainChartCard`).
- E4 (US state relocation) is editing `src/us/core/projection/run-projection.js` in another session: Task 1 touches only the
  row literal, in its own commit.
- Version badges: bumped once for the PR, in Task 2 (the first user-facing commit: US `V162` → `V163`, Canada `V69` →
  `V70`, or one above whatever `main` has by then), as the earlier PRs did (one bump per PR). Docs go with the code: each
  task names the docs it updates.
- **A list-row name never changes a number, a seed or a fingerprint.** Every place that hashes or compares the whole input
  state strips `name` from list rows through one helper (Task 2): `monteCarloSeed` (`src/shared/core/projection/simulate.js`)
  and the US stored-plan `fingerprintJson` (`src/us/ui/results/plan-optimizer.js`). Old saves (no `name` keys) hash exactly
  as before.

## Review Focus

1. **A survivor year** (Partner A or B dies mid-plan): wage and self streams of the dead owner vanish, "Not earned" streams
   move to the survivor, the dead partner's pension drops out (`pension-income.js:18-21`), Social Security (and CPP) becomes
   the survivor's greater-of benefit (`social-security.js:10-22`, `year-stages.js:302-313`), a loan is paid off in the death
   year. Bands must still sum to the
   row. → Task 4 scenario `survivor`, Task 5 scenario `survivor`.
2. **The future-dollars switch and a year far out:** values must convert per band with `displayValue`, and the gradient
   ids must be unique when the card and the overlay both hold an SVG. → Task 6 Playwright step "nominal".
3. **Many list rows** (10 expenses in one year): the fold into "Other (n items)" and label collisions. → Task 3 test
   `crowded column`, Task 4 test `fold`.
4. **A name with markup or 40+ characters** (`<b>Roof</b> & "gutters"`): stored trimmed to 40, shown as literal text in the
   header and the band. → Task 2 tests `name clip` and Playwright `name is text`.
5. **A year with nothing** (all bands under $1) and **a year with only a shortfall**: the empty message, and a Shortfall
   group with one band. → Task 3 test `empty`, Task 4 scenario `shortfall`.

---

### Task 1: Display-only row fields

**Files:**
- Modify: `src/us/core/projection/run-projection.js` (row literal, near `contributions: traditionalContrib + rothContrib`, ~:2991)
- Modify: `src/canada/core/projection/run-projection.js` (row literal, near `contributions:` ~:393)
- Modify: `tests/se_health.js` (add the new keys to `CASH_FLOW_KEYS`, :9), `tests/snapshot.js` header (record the intended
  baseline move, as earlier entries at :37-46 do)
- Test: `tests/unit/us/row-sankey-fields.test.js`, `tests/unit/canada/row-sankey-fields.test.js`
- Docs: `docs/architecture/engine.md` (the display-only row fields list, next to PR #74's)

**Interfaces:**
- Produces (every row): US `contribTraditional`, `contribRoth`, `employerContrib`, `payrollPremiums`; Canada
  `contribRrsp`, `contribTfsa`, `contribFhsa`, `employerContrib`, `payrollPremiums`.
  - US values: `traditionalContrib`, `rothContrib`, the `employerContrib` from `retirementContributions` (the local
    `employerMatch`), `healthPremiumA + healthPremiumB + streams.premiumA + streams.premiumB` (read `streams` before any
    later `listAmountsForYear` call; it is filled once a year, confirm).
  - Canada values: `traditionalContrib`, `rothContrib`, `fhsaContrib`, `matchA + matchB`, `healthPremiumA + healthPremiumB`.

- [ ] **Step 1: Write the failing tests.** Per country, model on `tests/unit/us/cash-flow-balance.test.js` (`setup`,
  `planned`): scenarios `working` (both partners working with an employer match and a health premium; US: a W-2 stream with
  `healthPremium` and `matchPct`, Canada: an FHSA contribution) and `retired`. For every row assert:
  `Number.isFinite` for each new field; US `contribTraditional + contribRoth === contributions` (exact, same order as the
  engine sum), Canada `contribRrsp + contribTfsa + contribFhsa === contributions` (the identity that uses
  `payrollPremiums` and `employerContrib` is checked in Tasks 4–5). The `working` scenario's W-2 stream ends before
  retirement (streams are windowed by age, not by working status). Assert at least one working row has `employerContrib > 0` and `payrollPremiums > 0`, and every
  retired row has both 0.
- [ ] **Step 2: Run** `npx vitest run tests/unit/us/row-sankey-fields.test.js tests/unit/canada/row-sankey-fields.test.js` — FAIL (fields undefined).
- [ ] **Step 3: Add the fields** to both row literals (one line each, with a one-line comment in the style of the
  existing "The cash-flow chart (display only ...)" comment).
- [ ] **Step 4: Run** the two suites (PASS), then `npm test`. Expected moves: `tests/se_health.js` (fixed by the key list),
  the snapshot baselines if they record whole rows (`npm run snapshot:update`, recorded in the `tests/snapshot.js` header
  and the commit message as an intended change); nothing else.
- [ ] **Step 5: Docs** — `engine.md`: the new fields, display-only.
- [ ] **Step 6: Commit** `Sankey redesign, task 1: display-only contribution, employer and premium row fields`.

### Task 2: An optional name on every list row

**Files:**
- Modify: `src/shared/core/inputs/dyn-fields.js` (`dynFieldHtml`: a `text` kind)
- Modify: `src/us/core/inputs/dyn.js`, `src/canada/core/inputs/dyn.js` (a `name` field first in each of the six specs; `name: ''` in each `fresh()`)
- Modify: `src/shared/core/inputs/lists.js` (`normalizeLists`: keep `name` on loans, streams, oneTimeIncome, extraExpenses, spendingTiers, lumpExpenses, and in the bridge migration at ~:160)
- Create: `src/shared/core/inputs/list-titles.js` (pure `LIST_ROW_TITLES`, which both `dyn.js` files use for `rowTitle`,
  so `core/` code can name rows without importing `dyn.js`, which imports the store)
- Modify: `src/shared/core/inputs/lists.js` (also `withoutListNames`), `src/shared/core/projection/simulate.js`
  (`monteCarloSeed`), `src/us/ui/results/plan-optimizer.js` (`fingerprintJson`)
- Modify: `src/shared/ui/inputs/dynamic-lists.js` (row header), `src/shared/ui/inputs/dynamic-list-editing.js` (text branch)
- Test: `tests/unit/shared/list-names.test.js`; extend `test_dynamic_lists.js`; `node tests/legacy_state.js --update`
  (its pinned normalized-state hashes move by the `name: ''` keys; an intended change, said in the commit)
- Docs: `docs/architecture/lists.md`, `CLAUDE.md` "Inputs" (the name field's listener exception, below), `README.md`
  (list-row names), the version badges

**Interfaces:**
- Produces: `item.name` — a string, `''` when blank, at most 40 characters, trimmed — on every row of the six lists.
  `export function listRowLabel(spec, item, i): string` in `src/shared/core/inputs/dyn-fields.js`: `rowTitle(i)` plus
  `' · ' + name` when `name` is not blank (the row header).
  `export function itemLabel(listKey, item, i): string` (in `list-titles.js`): `name` when not blank, else
  `LIST_ROW_TITLES[listKey](i)` (band labels, Tasks 4–5).
  `export const LIST_ROW_TITLES = { loans, incomeSources, oneTimeIncome, extraExpenses, spendingTiers, lumpExpenses }` —
  each `(i) => string`, the six titles `dyn.js` uses today ("Loan N", "Income stream N", "One-time income N",
  "Expense N", "Spending change N", "One-time expense N").
  `export function withoutListNames(inputs): object` (in `lists.js`) — a shallow copy whose six list arrays are mapped to
  rows without the `name` key (rows with no `name` are returned as they are); used by `monteCarloSeed` and
  `fingerprintJson`.
- Field spec: `{ key: 'name', kind: 'text', label: '<per list>', placeholder: '<per list>' }` (max 40). Labels and
  placeholders (labels per list so field search tells them apart): loans "Loan name" / "e.g. Car loan", incomeSources
  "Stream name" / "e.g. Consulting", oneTimeIncome "Income name" / "e.g. Inheritance", extraExpenses "Expense name" /
  "e.g. Travel", spendingTiers "Change name" / "e.g. Early years", lumpExpenses "Expense name" / "e.g. New roof".

- [ ] **Step 1: Write the failing Vitest** `tests/unit/shared/list-names.test.js` (both countries via `world()`):
  - `name kept`: `w.setState({ extraExpenses: [{ ...fresh, name: '  Travel  ' }] })` → state row `name === 'Travel'`.
  - `name clip`: a 50-character name → `name.length === 40`; `'<b>Roof</b> & "gutters"'` is kept as that exact string.
  - `non-string`: `name: 12`, `name: null`, missing → `''`.
  - `old save`: a state with no `name` keys in any list loads with `''` everywhere.
  - `numbers unchanged`: the same plan with and without names on every list gives rows whose
    `JSON.stringify` are identical (`toBe`).
  - `labels`: `itemLabel('lumpExpenses', { name: '' }, 0) === 'One-time expense 1'`; `listRowLabel(DYN.loans, { name: 'Car' }, 1) === 'Loan 2 · Car'`.
  - `seed`: `monteCarloSeed(2026, 500, inputs)` is the same number with and without names on every list, and for a state
    with no `name` keys at all (an old save) equals the seed of the same state normalized (with `name: ''`) — `toBe`.
  - `monte carlo`: the Monte Carlo summary (`engine(w)` helper, 500 paths) is `toStrictEqual` with and without names.
  - `fingerprint` (US): `storedPlanFingerprint` is the same with and without names, and for an old save.
- [ ] **Step 2: Run** it — FAIL.
- [ ] **Step 3: Implement.**
  - `dynFieldHtml` `text` branch: `<input id="…" type="text" maxlength="40" autocomplete="off" placeholder="…" value="${escapeHtml(item.name || '')}" data-dyn-i data-dyn-k>` inside the usual `.field` wrapper and label.
  - `normalizeLists`: `name: typeof r.name === 'string' ? r.name.trim().slice(0, 40) : ''` on each row (US
    `normalizeUsStreams` / `normalizeUsLumps` carry it through `...x`; confirm).
  - Header (`dynamic-lists.js:26`): `<b data-dyn-title="${i}">${escapeHtml(listRowLabel(spec, item, i))}</b>`.
  - Editing: in `apply`, branch on the field's spec kind (`f.kind === 'text'`, looked up from `data-dyn-k`), **before** the
    number branch — never on `el.type`, since money boxes are `type="text"` at runtime. On `input` it writes
    `el.value.slice(0, 40)` (untrimmed, so typing a space works), updates that row's `[data-dyn-title]` `textContent`,
    calls `saveInputs()`, and does **not** call `scheduleRender()` / `render()`; on `change` it writes the trimmed value back
    to state and the box, saves, and calls `render()` only when `#sankeyCard` is open. This is a deliberate exception to the
    typed-listener rule in `CLAUDE.md` "Inputs" (safe because a name changes no number, seed or fingerprint): add one line
    there and in `lists.md`.
  - `monteCarloSeed` and `fingerprintJson` hash `withoutListNames(...)` of what they hash today.
- [ ] **Step 4: Run** the suite (PASS) and `npm test`.
- [ ] **Step 5: Extend `test_dynamic_lists.js`**: add an expense, type `<b>Roof</b>` into its Name box → the header text is
  `Expense 1 · <b>Roof</b>` and contains no `<b>` element (`name is text`); reload → the name persists.
  `npm run build && node test_dynamic_lists.js` passes.
- [ ] **Step 6: Docs and badge** — `lists.md` (the `name` field, the `text` kind, `withoutListNames`, the listener
  exception), `CLAUDE.md` "Inputs" (one line), `README.md` (list rows take an optional name), the two version badges.
- [ ] **Step 7: Commit** `Sankey redesign, task 2: optional name on list rows`.

### Task 3: Shared Sankey layout

**Files:**
- Rewrite: `src/shared/core/format/sankey-layout.js` (keep `sankeyRibbonPath`; `layoutSankeyColumn` goes once Task 6 stops using it)
- Test: `tests/unit/shared/sankey-layout.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  `export function layoutSankey(model, box): Layout`
  - `model = { columns: Node[][], links: { from: string, to: string, value: number }[] }`, `Node = { id, value, label, sub? }`;
    links only join adjacent columns; a node's value equals the sum of its incoming (or outgoing) links.
  - `box = { width, height, xs: number[], nodeW, gap, top, bottom, labelH, minLabelBand }` (`xs`: each column's left x).
  - Returns `{ scale, nodes: Map<id, { x0, x1, y0, y1, labelY, labelHidden, side: 'left'|'right' }>, links: [{ from, to, value, sy0, sy1, ty0, ty1 }] }`.
  - Rules (spec 4.1): `scale = min over columns of (bottom - top - gap * (n - 1)) / sum(values)`; every column centred on
    `(top + bottom) / 2`; the gap shrinks when a column is busy: `gapUsed = min(box.gap, 0.3 * (bottom - top) / max(1, n - 1))`
    for the busiest column's `n`, so the bands always keep at least 70% of the height; links leave a source in its
    targets' column order and enter a target in its sources' order; labels: columns 0 and 3 on the left of the bar, 1 and 4
    on the right (three-column layouts: `side` given per column in `box.sides`). Label placement is greedy, per column:
    bands in order of value (largest first); each label is centred on its band and slid by at most `labelH` to clear the
    labels already placed and stay in `[top, bottom]`; if it still collides it gets `labelHidden: true`. A band thinner than
    `minLabelBand` whose label had to slide is hidden too (its name stays in the tooltip).
  `export function sankeyColumnXs(width, columnCount, labelRoom): number[]` — evenly spread columns with `labelRoom` px kept
  outside the first and last bars.
  `export function fitLabel(text, maxPx, fontPx): string` — truncates with `…` at `Math.floor(maxPx / (fontPx * 0.58))` characters.
  `sankeyRibbonPath` unchanged.

- [ ] **Step 1: Write the failing tests:** `one scale` (three columns of 128 split into 64/64, 32/32/64 and 128, a box whose
  usable height after gaps makes `scale` a power of two: every node's `(y1 - y0) / value` equals `scale`, exact); `centred` (a column with one node of the total value and a column with four:
  both centres at `(top + bottom) / 2` within 1e-9 written out); `fits` (the busiest column's last `y1 <= bottom` and first
  `y0 >= top`); `links stack` (a node with three outgoing links: `sy0` of each equals the previous `sy1`, first equals the
  node's `y0`, last `sy1` equals `y1`); `crowded column` (12 nodes, values 1..12, in a 200 px box, `labelH` 22,
  `minLabelBand` 10: no two visible labels closer than 22; the node of value 12 is visible; at least one is hidden); `empty` (a model whose total is 0 → `nodes.size === 0`,
  `links` empty); `busy` (four lists at their maximum of 10 rows each: 29 nodes in one column in a 300 px box: `scale > 0`,
  every band's height `> 0`, the last `y1 <= bottom`); `fitLabel('Into traditional (your contributions)', 100, 11) === 'Into tradition…'` (hand-computed:
  floor(100 / 6.38) = 15 characters in all → the first 14 + `…`); a text that fits is returned unchanged.
- [ ] **Step 2: Run** `npx vitest run tests/unit/shared/sankey-layout.test.js` — FAIL.
- [ ] **Step 3: Implement** the three functions.
- [ ] **Step 4: Run** — PASS; shuffled run passes.
- [ ] **Step 5: Commit** `Sankey redesign, task 3: five-column layout math`.

### Task 4: US columns for one year

**Files:**
- Create: `src/us/core/income/sankey-columns.js`, `src/shared/core/format/sankey-fold.js` (`foldItems`, used by both countries)
- Test: `tests/unit/us/sankey-columns.test.js`

**Interfaces:**
- Consumes: Task 1 row fields; Task 2 `itemLabel` / `LIST_ROW_TITLES` (from `list-titles.js`; never import `dyn.js` or
  `seam-DYN`, which reach the store); `cashFlowParts` (`src/shared/core/format/cash-flow-parts.js`);
  `pensionIncome`, `socialSecurityIncome`, `itemGrowthFactor`, `lumpExpenseHits`, `loanSchedules`, `loanPaymentForYear`,
  `medicalGrowth`.
- Produces:
  `export function sankeyColumns(ctx, row): Columns` — raw nominal dollars, nothing converted.
  - `Columns = { total, in: Group[], out: Group[], issues: string[] }`,
    `Group = { key, label, value, items: Item[] }`, `Item = { key, label, value, sub?: string, list?: string }`.
  - Group keys and labels in order — in: `earned` "Earned income", `other` "Other inflows", `retirement` "Retirement
    income", `savings` "From savings", `shortfall` "Shortfall (not funded)"; out: `taxes` "Taxes", `essentials`
    "Essentials", `everyday` "Everyday spending", `extra` "Extra & one-time", `saved` "Savings".
  - Item keys: `wagesA`, `wagesB`, `seA`, `seB`, `stream:<i>`, `employer`; `lump:<i>`, `settlement`; `ssA`, `ssB`,
    `pensionA`, `pensionB`; `rmd`, `traditional`, `roth`, `taxable`, `cash`, `home` (labels "RMD" / "RMD & 72(t)" when
    `row.sepp72 > 0`, "Traditional (beyond the RMD)", "Roth", "Brokerage", "Cash", "Home equity"); `shortfall`;
    `tax`, `penalty` ("Early-withdrawal penalty"); `housing`, `healthcare`, `premiums` ("Payroll health premiums"), `ltc`
    ("Long-term care"), `loan:<i>`; `everyday`; `extraExp:<i>`, `lumpExp:<i>`; `intoTrad`, `intoTradEmployer`, `intoRoth`,
    `intoCash`, `intoBrokerage`, `intoBonds` (labels spec 3.2). Person labels "Wages · Partner A", "Self-employment ·
    Partner B", "Social Security · Partner A", "Pension · Partner B"; a single person drops " · Partner A".
  - Every list item carries `list` (the `DYN` key) so the UI can colour by list; a named list item's `sub` is its row title.
  - `everyday` item `sub`: the active spending tier's name when it has one (active tier = the rule in
    `baseSpendingNominal`).
  `export function foldItems(items, max = 8): Item[]` (in `src/shared/core/format/sankey-fold.js`) — keeps the `max - 1` largest in their original order and one
  `{ key: 'fold', label: 'Other (n items)', value, sub: <their labels joined by ', '> }`; unchanged when `items.length <= max`.

- [ ] **Step 1: Write the failing suite** `tests/unit/us/sankey-columns.test.js` (count with `makeCounter`, setup as in
  `cash-flow-balance.test.js`, `const ctx = await w.ctx()` after the last `setState`; reuse its fixtures where they fit).
  Scenarios: `working` (both partners, a W-2 stream with premium and match, a self stream, a "Not earned" stream, a gain
  one-time income, an extra expense, a one-time expense, two loans, named rows), `retired` (Social Security, pensions,
  RMDs, Roth and cash draws, a home-equity draw), `surplus` (reinvested and bond reserve), `shortfall`, `survivor` (A dies
  mid-plan, with a loan, a W-2 stream of A and a "Not earned" stream of A), `inherited` (an inherited Roth payout and
  inherited traditional draws), `sepp` (a 72(t) payment). For every row of every scenario:
  - `balance`: `Math.abs(sum(in values) - sum(out values)) <= 1` and `total` equals the in sum.
  - `groups`: each group's `value` is the sum of its items (by construction: the function sums the items it returns, in
    their order, after folding) and `issues.length === 0` (no "Other" band, no dropped split).
  - `row figures` (each written out within $1): `retirement.value` vs `row.ss + row.pension`; `extra.value` within 1 of `row.extraExpense + row.lumpExpense`;
    `earned.value + other.value` within 1 of `row.wages + row.oneTimeCash + Math.max(0, row.seSettlementIn ?? 0) + row.payrollPremiums + row.employerContrib`.
  - `labels`: in `working`, the year a named one-time expense hits has an item labelled with its name and `sub`
    "One-time expense 1"; the year before and after has no `lumpExp:0` item.
  - `survivor`: after the death year no `stream:<i>` item for A's W-2 stream and no `pensionA`; the "Not earned" stream
    still present; one Social Security item (the survivor's).
  - `fold`: `foldItems` of ten items of values 1..10 → 8 items, the last `Other (3 items)` with value 6 (1 + 2 + 3).
- [ ] **Step 2: Run** — FAIL (module missing).
- [ ] **Step 3: Implement** `sankeyColumns`. Approach: rebuild the year context the engine builds (`factor =
  Math.pow(1 + pct(inputs.inflation), row.year)`, `incomeFactor = Math.pow(1 + pct(inputs.incomeGrowth), row.year)`,
  `deathYear` / `deceasedIsA/B` exactly as `run-projection.js:316-322`, ages from `row.age` / `row.ageB`, working from
  `row.workingA` / `row.workingB`, `paychecksPerYear[inputs.payFrequency] || 26`); walk each list with the same window /
  growth / death tests as `streamAmountsForYear` (wages and self skipped for a dead owner), `lumpAmountsForYear` (inherited
  kinds skipped; each row's full `amt`), the extra / lump expense filters in `listAmountsForYear`, and
  `loanPaymentForYear`'s per-loan rule; call `pensionIncome` / `socialSecurityIncome` with `ctx`. From-savings items come
  from `cashFlowParts(row, null).in`; Taxes `row.tax - row.earlyPenalty + Math.max(0, -(row.seSettlementIn ?? 0))` and
  `row.earlyPenalty`; Savings from the Task 1 fields and `row.cashTopUp`, `row.reinvested - row.toBondReserve`,
  `row.toBondReserve`. Apply spec 3.4: compare each group's items (all of them, before anything is dropped) with its row
  figure; a shortfall of ≥ $1 adds `{ key: 'rest', label:
  'Other ' + group label lowercased }` and pushes an `issues` entry; an excess of ≥ $1 replaces the items with one item of
  the group's label and pushes an `issues` entry; for the earned / other pair the same applies to the pair, the rest going
  to `other`. Keep every item with a value above 0 (the UI drops bands under $1 at draw time, Task 6), `foldItems` each
  group, then set each group's `value` to the sum of its items and `total` to the money-in sum. A standard (non-historical) row only: when `row.cumFactor`
  is present use it as `factor` (the card never passes one today; keep it correct anyway).
- [ ] **Step 4: Run** — PASS; alone and shuffled.
- [ ] **Step 5:** `npm run analyze`; `npm test` passes (engine purity is unaffected: the engine does not import this module).
- [ ] **Step 6: Commit** `Sankey redesign, task 4: US columns for one year`.

### Task 5: Canada columns for one year

**Files:**
- Create: `src/canada/core/income/sankey-columns.js`
- Test: `tests/unit/canada/sankey-columns.test.js`

**Interfaces:**
- Consumes: as Task 4, with `cppAndOasIncome` instead of `socialSecurityIncome`; the Canada list rules
  (`year-stages.js` `listAmountsForYear`: Partner A's age, no kinds, owners or death rules).
- Produces: the same `sankeyColumns(ctx, row)` shape (imports `foldItems` from `src/shared/core/format/sankey-fold.js`).
  Canada differences (spec 3.1–3.2): no `seA/B`, `settlement`, `penalty`; every stream is in `other`; `retirement` items
  `cppA`, `cppB` ("CPP · Partner A"), `oas` ("OAS", value `oasGrossA + oasGrossB - row.oasClawback`, `sub`
  "Before the recovery tax $X; recovery $Y" in raw dollars formatted by the UI — return `gross` and `recovery` numbers on
  the item instead of a string), `pensionA/B`, `gis` ("GIS / Allowance"), `childBenefits` ("Child benefits"),
  `credits` ("Credits and provincial seniors' programs") from the existing benefit row fields, split as today
  (`compute-sankey-flow.js:32-34`): `benefitGis + benefitAllowance`; `benefitCcb + benefitProvChild`;
  `benefitCgeb + benefitProvCredit + benefitProvSenior`; from-savings labels "RRIF
  minimum", "RRSP / RRIF (beyond the minimum)", "TFSA", "Non-registered", "Cash", "Home equity"; savings `intoRrsp`,
  `intoRrspEmployer`, `intoTfsa`, `intoFhsa`, `intoCash`, `intoNonRegistered`, `intoBonds`. Row figure for
  `retirement`: `row.ss + row.pension + row.benefits`; pair identity: `row.wages + row.oneTimeCash + row.payrollPremiums +
  row.employerContrib`.

- [ ] **Step 1: Write the failing suite** with the Task 4 checks and scenarios `working` (wages, match, premium, FHSA,
  streams, one-time income, expenses, loans, names), `retired` (CPP, OAS with a recovery, RRIF minimum, TFSA, cash),
  `benefits` (GIS and child benefits), `surplus`, `shortfall`, `survivor`, plus `oas`: in a recovery year the `oas` item's
  `value === gross - recovery` and `recovery === row.oasClawback`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** (as Task 4).
- [ ] **Step 4: Run** both country suites — PASS; shuffled.
- [ ] **Step 5:** `npm run analyze`; `npm test`.
- [ ] **Step 6: Commit** `Sankey redesign, task 5: Canada columns for one year`.

### Task 6: Draw the five columns in the card

**Files:**
- Rewrite: `src/shared/ui/charts/sankey.js`
- Rewrite: `src/us/ui/charts/compute-sankey-flow.js`, `src/canada/ui/charts/compute-sankey-flow.js` (seam name unchanged:
  `computeSankeyFlow`)
- Modify: `src/shared/partials/sankeyCard.html` (description, slider, note, expand button placeholder), `src/shared/styles/styles.css` (a `/* Sankey */` block)
- Modify: `src/shared/core/format/charts.js` (`SANKEY_GROUP_COLORS`) if a group needs a hue `CASH_FLOW_COLORS` lacks
- Modify: `src/shared/core/format/sankey-layout.js` (delete `layoutSankeyColumn` once unused)
- Create: `test_sankey.js` (root); modify `test_dynamic_lists.js` step 8
- Docs: `docs/architecture/inputs-and-ui.md` (the Sankey section: modules, columns, the one-source slider), `README.md`
  (the diagram's columns)

**Interfaces:**
- Consumes: Task 3 `layoutSankey`, `sankeyColumnXs`, `fitLabel`, `sankeyRibbonPath`; Tasks 4–5 `sankeyColumns`.
- Produces:
  `computeSankeyFlow(row): Model | null` (country) — builds `ctx` with the country's `storeContext` (US
  `storeContext({ withPlan: false })`, Canada `storeContext()`), calls `sankeyColumns(ctx, row)`, converts every value with
  `displayValue(v, row.year)`, attaches `color` per item and group (account items use `CASH_FLOW_COLORS` so the bar chart
  and the Sankey agree; groups and list items use group hues; shortfall keeps its red), and returns
  `{ total, columns: [inItems, inGroups, [hub], outGroups, outItems], links }` (the `layoutSankey` model, node `id`s
  `in:<itemKey>`, `g:<groupKey>`, `hub`, `out:<itemKey>`); items whose display value is under $1 are dropped here and their
  group and the hub are reduced by them, so every node equals the sum of its links; `null` when `total < 1`.
  `renderSankey(selected)` (shared, exported, same signature) — stores `selected` in a module-level `let lastSelected` and
  draws `#sankeySvg` from `lastSelected.rows[idx]`.
  `export function drawSankey(svg, model, opts)` — `opts = { width, height, cols: 'five'|'in'|'out', fontPx, nodeW, gap }`;
  Task 7 calls it for the overlay.
  `wireSankeyAge()` redraws from `lastSelected` (the slider bug, spec 5.1), never `simulate()`.

- [ ] **Step 1: Markup and copy.** Card description and note exactly as spec 6. Slider block: a full-width wrapper
  `<div class="sankey-year">` holding the label line ("Year to show" + `<output id="sankeyAgeOut">`), the range input
  (unchanged id `sankeyAge`, `style` width 100%) and a `<div class="sankey-year-ends"><span id="sankeyAgeMin"></span><span id="sankeyAgeMax"></span></div>`.
  Readout format: `Age 69 · 2038` (single) / `Ages 69 / 67 · 2038` (couple; survivor years too), calendar year =
  `taxYear` of row 0 + `row.year` (read how the bar chart's tooltip header computes it and reuse that helper). The SVG loses
  its fixed `height:360px`; its height is set from the layout.
- [ ] **Step 2: Write `test_sankey.js` (desktop part)**, exiting 1 on failure, for both built planners at 1280×900:
  open the card; the SVG has 5 distinct bar x positions (`rect[data-col]` with `data-col` 0–4); the hub label starts with
  "Total"; no `text` contains "From portfolio" or "To savings"; a scenario with a named one-time expense ("New roof") shows a
  `text` "New roof" at its age; an unnamed one shows "One-time expense 1"; moving the slider after applying a stored plan
  (US) draws the same year from the same run: `#sankeySvg` carries `data-year` and `data-total` (the drawn total, rounded
  to the dollar); after `render()` draws index k, move the slider to another index and back to k → `data-year` and
  `data-total` equal the first draw's (both `render.js` files pass `simulate()` as `selected` today, so this guards the
  one-source rule against a later divergence rather than reproducing a visible bug); `nominal`: switching to future dollars
  changes the hub label, and gradient ids in the document are unique.
- [ ] **Step 3: Run** `npm run build && node test_sankey.js` — FAIL.
- [ ] **Step 4: Implement** `computeSankeyFlow` (both) and `sankey.js`: layout from `sankeyColumnXs(width, 5, labelRoom)`
  with `labelRoom` 150 at ≥ 1000 px and 120 below, `nodeW` 6, `gap` = `clamp(height * 0.035, 6, 14)`, height =
  `clamp(40 + 26 * maxBandsInAColumn, 300, 380)` in the card; ribbons as `<path>` filled with a per-render
  `linearGradient` (`id` = `sk<counter>-<n>`, counter module-level) from source to target colour at 0.4 opacity; bars square;
  labels name (font − 1.5, 0.8 opacity) over bold `compact` amount with the halo the current code uses, `fitLabel` to the
  room beside the bar, hidden labels skipped; hover / focus / tap on a band or bar: raise it (others to 0.15), tooltip with
  label, `money(value)`, `Math.round(value / total * 100) + '% of the year\'s money'`, `sub` lines, and for a group its
  items; reuse the cash-flow chart's touch handling pattern (`initCashFlowHover`: tap shows, tap outside hides). Empty year:
  the existing message. Card height `clamp(60 + 16 * n, 300, 480)` (n = the busiest column's bands), replacing the
  `clamp(40 + 26n, 300, 380)` above. The card's minimum width is 660 px (measure the card at 1280 and 1440 wide: it is about
  750 px at 1280; tune so neither scrolls); below it the `.chart-wrap` scrolls sideways (`overflow-x:auto`) with the SVG at
  660 px. The tooltip element is created per wrap (the card's and, in Task 7, the overlay's), not once per page.
- [ ] **Step 5: Update `test_dynamic_lists.js` step 8** to look for the expense's own label instead of "Additional
  expenses" (`tests/field_registry.js` needs no change: list controls are skipped and the new controls are buttons).
- [ ] **Step 6: Run** `npm run build && node test_sankey.js && node test_dynamic_lists.js && node test_deferred_render.js`
  — PASS; `npm test` — PASS.
- [ ] **Step 7: Docs** — `inputs-and-ui.md`, `README.md`.
- [ ] **Step 8: Commit** `Sankey redesign, task 6: five columns in the card`.

### Task 7: Full screen and phones

**Files:**
- Create: `src/shared/ui/charts/sankey-fullscreen.js`
- Modify: `src/shared/ui/charts/landscape-fullscreen.js` (an exported `tryEnterFullscreen(el)` that never locks orientation; existing exports unchanged)
- Modify: `src/shared/partials/sankeyCard.html`, `src/shared/styles/styles.css`, `src/us/main.js`, `src/canada/main.js` (call `wireSankeyFullscreen()` next to `wireSankeyAge()`)
- Modify: `test_sankey.js` (phone and overlay parts)
- Docs: `inputs-and-ui.md` (the overlay and the phone rule), `README.md` (full screen)

**Interfaces:**
- Consumes: Task 6 `drawSankey`, `renderSankey`, `lastSelected` (export a getter `currentSankeySelection()` from `sankey.js`).
- Produces: `export function wireSankeyFullscreen()`; `export function isPhoneViewport(): boolean` (the Global Constraints
  media query). Markup: `<button id="sankeyExpandBtn" aria-label="Full screen">⤢</button>` in the card's controls row,
  `<button id="sankeyPhoneBtn">View full screen</button>`, and inside the card an overlay container
  `<div id="sankeyOverlay" role="dialog" aria-modal="true" aria-label="Cash flow diagram" hidden>` (CSS also has
  `#sankeyOverlay[hidden]{display:none}`) with a header (title "Cash flow diagram", the whole `.sankey-year` block — the
  slider's `.range-touch-wrap` and catcher included (`input-gestures.js:152-158`) — moved into it while open and back on
  close, and `<button id="sankeyCloseBtn" aria-label="Close">✕</button>`) and the diagram area (`#sankeyFullWrap`, holding `#sankeyFullSvg` or, upright on a phone, `#sankeyInSvg` and `#sankeyOutSvg`).

- [ ] **Step 1: Extend `test_sankey.js`:**
  - Desktop 1280×900: `#sankeyExpandBtn` opens `#sankeyOverlay` (fixed, covers the viewport); `#sankeyFullSvg` has 5 bar
    columns and is taller than the card's SVG; Escape closes it and the card diagram is back.
  - Phone 390×844 (Playwright `isMobile`, `hasTouch`): the card shows `#sankeyPhoneBtn` and no bars in `#sankeySvg`
    (`#sankeySvg` hidden); tapping the button opens the overlay with `#sankeyInSvg` (3 bar columns, title "Money in")
    above `#sankeyOutSvg` (3 bar columns, "Money out"); `scrollWidth <= clientWidth` on the page; the slider moves the year.
  - Phone 844×390 (same device flags): the card still shows only the button; the overlay shows `#sankeyFullSvg` with 5
    bar columns and `#sankeyFullWrap.scrollWidth >= 900`; page `scrollWidth <= clientWidth`.
  - Turning: open at 390×844, `setViewportSize` to 844×390 → the overlay re-lays out to five columns without closing.
  - Focus: opening moves focus to ✕; closing returns it to the button that opened it.
- [ ] **Step 2: Run** — FAIL. First confirm in headless Chromium that a context with `isMobile: true, hasTouch: true` makes
  `matchMedia('(pointer: coarse)')` true at 844×390; if it does not, the phone rule stays as specified and the test
  emulates a phone with Playwright's device descriptor (`devices['Pixel 7']` landscape) instead, saying so in the test.
- [ ] **Step 3: Implement.** Open: `#sankeyOverlay` unhidden first, then `body.chart-scroll-locked`, `tryEnterFullscreen(overlay)`
  (best-effort, no orientation lock), draw; close (✕, Escape, `fullscreenchange` to not-fullscreen — its own listeners, guarded by the overlay's own open
  flag, since the main chart's handlers read only `chartExpanded`): hide, unlock, exit fullscreen, slider block back, focus
  back. While open, a `resize` listener (rAF-throttled) redraws: sideways = overlay wider than tall →
  `drawSankey(full, model, { cols: 'five', width: max(900, wrapWidth), height: wrapHeight - 8 })`; upright phone →
  `in` and `out` SVGs at the wrap's width, each its own height from its busiest column; desktop → five columns at the
  overlay's size with the full-screen sizes (`nodeW` 8, gap up to 14, font 13). In the card, `isPhoneViewport()` hides
  `#sankeySvg` and shows `#sankeyPhoneBtn` (CSS class on the card toggled at render and on resize), and `renderSankey`
  skips drawing the card SVG on a phone. The main chart's `chartExpanded` preference and handlers are not touched.
- [ ] **Step 4: Run** `npm run build && node test_sankey.js` — PASS; `npm run test:ui` — PASS; manual check at 390×844 that
  the page has no horizontal scroll with the card open.
- [ ] **Step 5: Docs** — `inputs-and-ui.md`, `README.md`.
- [ ] **Step 6: Commit** `Sankey redesign, task 7: full screen and phone layouts`.

### Task 8: Remaining docs and final checks

**Files:**
- Modify: `docs/architecture/test-inventory.md` (`test_sankey.js`, the new Vitest suites), `docs/architecture/module-system.md`
  if a module list there names the Sankey modules, `docs/reference.md` (a short entry for this feature, as `CLAUDE.md` asks
  outside the batch plan; follow the PR #74 entry's format if there is one).

- [ ] **Step 1:** Write the docs; re-read the README and topic files the earlier tasks touched for consistency.
- [ ] **Step 2:** `npm run analyze`; `npm test`; `npm run test:ui`; `npx vitest run --sequence.shuffle` — all pass.
- [ ] **Step 3:** Mobile-width check at 390×844 in both planners (CLAUDE.md checklist 3).
- [ ] **Step 4: Commit** `Sankey redesign, task 8: test inventory and reference notes`.

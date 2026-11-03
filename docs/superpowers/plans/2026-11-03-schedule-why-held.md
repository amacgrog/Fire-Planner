# The conversion schedule shows the held years and names the limit (US) — plan

**Origin.** On 2026-11-03 the owner asked why the bracket card's "Conversions in the cliff plan" schedule skips 62-66.
- The schedule lists only rows with `conversionAmount >= 1` (`src/us/ui/results/roth-optimizer.js:179`).
- At 62-66 the cliff plan stays under the ACA 400% line, so those years convert $0.
- The owner's screenshot also shows the "Why" column saying "Fill to the top of the 22% bracket" for 59 and 67-71, years the held line says the ACA line and the IRMAA tier held.

This is the schedule-wording item the owner deferred at the end of Batch 5 (the owner's memory notes, not in the repo). It is now possible because S4 (PR #69) records `row.convHeldBy`.

**Revision.** Revised after the Opus plan review (2026-11-03: 7 Important and 9 Minor, all taken; `schedule-plan-review.md` in the session scratchpad):
- the why order is replaced;
- in-window stay-under years with no `convHeldBy` are shown;
- the "the" fix maps labels;
- there is a pure exported row builder with a counted Vitest suite;
- the Playwright readers are rewritten;
- line numbers are corrected.

**Branch.** `claude/schedule-why-held`, from main `1738dff`. One PR, one task, US only: Canada and `src/shared/` are untouched.

**Badge.** US V154 -> V155, in the same commit. The owner merges; no auto-merge.

**No engine change.** The change touches the card code, its tests and the docs only.
- Every `snapshot.js` / `plan_off_anchor` / Vitest engine result stays exact.
- Only `snapshot_ui` moves. Its text hashes can move for every surface that opens the bracket card: all three scenarios ('std default', 'std R', 'std R everything') open every `<details>`. Removing the held line's markup also moves every control's wiring `domHash`. These movers go to the owner.

## Facts (main 1738dff)

- **`renderConversionSchedule(selected)`** (`roth-optimizer.js:176-187`):
  - `converting = selected.rows.filter(r => r.conversionAmount >= 1)` (:179);
  - `renderHeldLine(selected)` (:180);
  - `#conversionScheduleNone` and the table's `hidden` toggles (:182-183);
  - one `<tr>` per row, holding the age, `money(displayValue(r.conversionAmount, r.year))` and `escapeHtml(scheduleWhy(r, bracket))` (:184-186).
- **`scheduleWhy(row, bracket)`** (:190-193, comment :188-189; exported for its test): `convChoice`, capitalized; else `cliffChoice`, capitalized; else `Fill to the top of the ${bracket}% bracket`.
- **`heldPhrase(kind, plan)`** is at :149-151 and **`renderHeldLine(selected)`** at :152-171 (`#rothOptimizerHeld`, "What holds the conversions: ...").
- **`row.convChoice`** (run-projection.js:2782) is a sized year's target, worded by `convChoiceOf` (:69-73):
  - `'no conversion (tax-aware)'`;
  - `'the top of the N% bracket'`;
  - `'just under|just over ' + lineNameOf(id)` plus `" (Partner X's return)"` when the return is not H;
  - the fallback, `'the bracket conversion (target not reachable this year)'`.
- **`row.cliffChoice`** (:2773-2779) is set on every phased year whose kept pass met its plan, including years outside the ladder window and years that cannot convert. A missed plan gets none (`magiStats.planMissed++`).
  - Its value is `'stayed under ' + label` or `'filled to ' + label`.
  - The solver's labels (solver.js:281-283, 318-328) are `'Medicaid line'`, `'ACA credit floor (100%)'`, `'ACA 400% line'` and `'IRMAA tier'`. The IRMAA label has no tier number, and no label carries a Partner suffix.
  - `lineNameOf` (plan-shape.js:40-43) takes a line id, not a label, so the card cannot call it on a row.
- **`row.convHeldBy`** (decided at run-projection.js:1042-1061 and :1099-1104; on the row at :2785) is one of:
  - `'stayUnder'`: a phased 'under' year whose fill would have been at least $1;
  - `'sized'`;
  - `'plan'`;
  - `'aca'` / `'irmaa'`, from `CEIL_OUT.kind`;
  - `'balance'`.

  It is absent when nothing held the fill below the bracket. The gated test needs F >= conversion + 1.
- **The two kinds of row**:
  - A sized year whose stay-under trial won carries `convChoice`, `cliffChoice` 'stayed under ...', `convHeldBy` 'stayUnder' and a conversion of 0 (comment at :2780-2781).
  - On the fixture (`conv-held-by.test.js:50-58`), 62-63 stay under the ACA line with no `convHeldBy`, because the 10% fill is 0 there, and 64-66 are 'stayUnder'.
- **The card renders only when `state.rothConvEnabled`** (render.js:193).
- **Readers of the schedule and the held line:**
  - `test_conversion_schedule.js`: the header lists sections 1-12 and 6b. `readSchedule()` (:33-56) builds the expected list from `conversionAmount >= 1`, and sections 1-5 and 6b compare against it. The held line is read in 8-12 (`lines()` :199-209, `expectedLines()` :211-236).
  - `test_plan_optimizer.js:490-500` reads `#conversionScheduleRows` by age.
  - `tests/unit/us/roth-optimizer-ages.test.js` (two uncounted `it`s).
  - `tests/snapshot_ui.js`: :74 is `domMap().hidden` and :236-282 the surfaces.
  - `table-annotations.js:19` prints "Income stayed under ACA 400% line", without the "the".
  - No MCP tool or test hook reads the schedule. `analysis_parity` compares `computeRothOptimizer` results, which this change does not touch.
- **Docs:**
  - `README.md:100-104`;
  - `docs/architecture/cliff-plan.md:172-181`;
  - `inputs-and-ui.md:92-100`;
  - `test-inventory.md:150, 159, 325`;
  - `engine.md:260-269`, which stays true;
  - `docs/superpowers/inventory/module-map.md:416`, generated.

## Rulings (for the owner at the copy STOP; the recommended option first)

1. **Which rows the schedule shows.** In ascending age, a row is shown when any of these holds:
   - (a) it converts at least $1, as now;
   - (b) it has `convHeldBy`, which covers a held $0 year;
   - (c) its age is within the ladder window (`state.rothConvStartAge` to `rothConvEndAge`), it converts under $1, and its `cliffChoice` starts with `'stayed under '`.

   (c) closes the fixture's 60-63 gap: those years stayed under the same line even though their bracket fill was $0. A year that only converts nothing, with no held kind and no stay-under, is not shown (for example the fixture's 60-61, already over the line with a fill of 0, and 67, below its cap).

   Rejected alternative: "Nothing to convert: income fills the bracket". A $0 year with no held kind can also be an empty balance or an amount-map age, and the row fields cannot tell those apart.
2. **Collapsing.** Two adjacent shown rows merge only when all of these hold: the later age is exactly the earlier age + 1, both convert under $1, and both have the identical why string. A converting row always breaks a run. The age cell reads "62-66" (`${from}-${to}`), and the amount reads $0.
3. **The why text.** The first rule that applies wins. `cap()` capitalizes the first letter, and `map(label)` is the label table below.
   1. The year converts under $1 and `cliffChoice` is 'stayed under X' -> "Stayed under " + map(X).
   2. `convChoice` exists, and `convHeldBy` is absent or 'sized' -> cap(convChoice).
   3. `cliffChoice` is 'filled to X' -> "Filled to " + map(X).
   4. `convHeldBy` is one of these:
      - 'aca' -> "Held by the ACA 400% line";
      - 'irmaa' -> "Held under an IRMAA tier";
      - 'balance' -> "The whole remaining balance";
      - 'stayUnder' -> "Held by <plan>'s stay-under";
      - 'plan' -> "Held by <plan>'s fill".

      Here <plan> is `planName()`. "Held by the ACA 400% line" is also right in a guard-off brake year that is already over the line.
   5. `convChoice` exists (the fallback, with a held kind) -> cap(convChoice).
   6. Otherwise -> "Fill to the top of the N% bracket".

   The label map, an exact match on the label (never a regex on the whole `cliffChoice`):

   | Label | Text |
   |---|---|
   | 'Medicaid line' | 'the Medicaid line' |
   | 'ACA credit floor (100%)' | 'the ACA credit floor' |
   | 'ACA 400% line' | 'the ACA 400% line' |
   | 'IRMAA tier' | 'an IRMAA tier' |
   | anything else | unchanged |

   The why cannot name whose return held it: the held kinds and `cliffChoice` carry no return. Naming it would need an engine change, which is out of scope. `table-annotations.js:19` keeps its text: its own table is outside this PR, and the inconsistency is deliberate and noted.

   On the owner's screenshot household, the schedule reads:

   | Ages | Conversion | Why |
   |---|---|---|
   | 59 | $19,733 | Held by the ACA 400% line |
   | 60-61 | (own amounts) | Fill to the top of the 22% bracket |
   | 62-66 | $0 | Stayed under the ACA 400% line |
   | 67-71 | (own amounts) | Held under an IRMAA tier |

   The 60-61 and 67-71 rows are one row per year, not collapsed: they convert.
4. **The held line.** Remove `#rothOptimizerHeld`: its markup, `renderHeldLine`, and its call. The schedule now says the same thing year by year. Keep `heldPhrase` only if rule 3.4 uses it.

   Alternative: keep the held line as it is.

   `#rothOptimizerOverLine` stays: it is about the other bracket rows, which the schedule does not show.
5. **Empty state.**
   - "This plan converts nothing." (`#conversionScheduleNone`) shows when no row converts at least $1.
   - The table shows when at least one row is shown.

   So a run that only holds $0 years shows the line and, under it, the held rows. The owner sees this case at the STOP.

## Task 12: the schedule shows the held years and names the limit

**Files:**
- **Modify `src/us/ui/results/roth-optimizer.js`:**
  - export a pure `scheduleRows(rows, bracket, planLabel, startAge, endAge)` returning `[{ from, to, amount, year, why }]`, which only reads the rows and returns new objects;
  - `scheduleWhy(row, bracket, planLabel)` per ruling 3, with the label map as a module constant;
  - `renderConversionSchedule` draws from `scheduleRows`;
  - the held line removed (ruling 4);
  - the line-1 purpose comment updated, then `npm run analyze`.
- **Modify `src/us/index.html`:** remove `#rothOptimizerHeld` (ruling 4) and bump the badge V154 -> V155.
- **Test, Vitest: `tests/unit/us/roth-optimizer-ages.test.js`, now counted** (`makeCounter`, and `afterAll(({}, suite) => ...)` asserting the total). It covers, on constructed rows with `toStrictEqual` / `toBe`:
  - every branch of ruling 3, in order:
    - sized with the stay-under won, at $0;
    - the `convFell` fallback with 'aca';
    - sized at the balance;
    - a missed fill plan with 'plan';
    - a missed stay-under with 'stayUnder';
    - every label in the map, and an unknown label;
  - ruling 1's selection: (a), (b), (c), a $0 row with no held kind, and (c) outside the window;
  - ruling 2's collapse: an adjacent run; a gap of one age (no merge); different whys; a converting row inside a run.

  Run the suite alone and with `--sequence.shuffle`.
- **Test, Playwright: `test_conversion_schedule.js`:**
  - Rebuild `readSchedule()`'s expected list in the page from the rows, applying rulings 1-3 with no app code. Pin kinds, ages and why texts; read amounts from the rows, never as engine-double literals.
  - Update sections 1-6b for the new expected list, including section 1's `whyKinds.every(k === 'flat')` premise.
  - Rewrite 8-12 for ruling 4: the held line is gone and the over-the-line line stays.
  - New sections:
    - **The fixture (Dana and Chris):** 59 is a held row and 62-66 is one collapsed "Stayed under the ACA 400% line" row (pinned from the tree).
    - **The NY gap household** from `conv-held-by.test.js:151-165`: the sized $0 rows and 'irmaa'.
    - **The guard-on 'aca' couple:** 'balance'.
    - **The "no limit" single:** the schedule is unchanged.
    - **Nothing shown:** the empty state.
    - **A run that holds but converts nothing:** ruling 5.
    - **Mutation:** a render with `window.__test_freezeSimResults(true)`, so that any write to a cached row throws.
    - **Mobile:** at 390x844, no horizontal overflow.

  Keep `ok()`, `process.exit(fail ? 1 : 0)` and the locator waits. Update the header's section list.
- **Re-run: `test_plan_optimizer.js`,** which reads `#conversionScheduleRows` by age. Converting rows are never collapsed, so it should pass unchanged.
- **Docs:**
  - `README.md` (100-104): the schedule now names the limit and shows held years; drop the held-line sentence.
  - `cliff-plan.md` (172-181): "two card-only lines" becomes one; the schedule's rows and why order.
  - `inputs-and-ui.md` (92-100), and `test-inventory.md` (150, 159, 325).
  - `docs/next-batches-plan.md`: a short "Schedule why (2026-11-03)" note under the Batch 5 follow-ups results, with the history left as it is.

- [ ] **Step 1: tests first.** Write the Vitest cases and the Playwright expectations, build, and run them: they fail.
- [ ] **Step 2: implement.** Run the tests: they pass. Run `npm run test:unit`.
- [ ] **Step 3: identity.**
  - `node tests/snapshot.js` passes unchanged.
  - `node tests/snapshot_ui.js`: list the movers (expected: the surfaces' text hashes, plus every wiring `domHash` from the removed markup). Do not update the baseline.
- [ ] **Step 4: STOP for the owner.** Bring:
  - screenshots of the open card at 1280 and 390 px, for the fixture and for a household like the owner's screenshot (24% setting, the plan's 22%, ladder 59-71);
  - the schedule's text;
  - ruling 5's case;
  - the `snapshot_ui` movers.

  After the OK, with the copy edits applied:
  - update the `snapshot_ui` baseline;
  - bump the badge;
  - update the docs;
  - run `npm test` and `npm run test:ui`, serially;
  - make one commit, "Bracket card: the conversion schedule shows the held years and names what held each (US V155)", and push.
- [ ] **Step 5:** an Opus review of the branch, its fixes, then the PR.

## Review focus

- Ruling 3's order against every combination of row fields listed in the Facts.
- Ruling 1(c)'s window test, and whether a phased stay-under year outside the window ever shows.
- Collapsing never merges across a hidden age.
- Nothing writes to `selected.rows`: the freeze step in the tests proves it.
- The held line's removal: every reader in the Facts updated.

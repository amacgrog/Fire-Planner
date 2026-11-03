# The conversion schedule shows the held years and names the limit (US) — plan

**Origin.** On 2026-11-03 the owner asked why the bracket card's "Conversions in the cliff plan" schedule skips 62-66. The
answer: the schedule lists only rows with `conversionAmount >= 1` (`src/us/ui/results/roth-optimizer.js:179`), and at 62-66
the cliff plan stays under the ACA 400% line, so the year converts $0. The same screenshot shows that the "Why" column says
"Fill to the top of the 22% bracket" for 59 and 67-71, which the held line says the ACA line and the IRMAA tier held.
This is the Batch 5 wording item the owner deferred ("unify the schedule's Why wording"), now possible because
S4 (PR #69) records `row.convHeldBy` on every held year.

**Branch:** `claude/schedule-why-held`, from main `1738dff` (PR #69 merged). One PR, one task, US only (Canada and
`src/shared/` untouched). **Badge:** US V154 -> V155 in the same commit. The owner merges; no auto-merge.

**No engine change.** Card code, its tests and the docs only. Every `snapshot.js` / `plan_off_anchor` / Vitest engine result
stays exact; only `snapshot_ui` text (the surfaces that open the bracket card) can move, and those movers go to the owner.

## Facts (main 1738dff)

- `renderConversionSchedule(selected)` (`roth-optimizer.js:176-188`): `converting = selected.rows.filter(r => r.conversionAmount
  >= 1)`; one `<tr>` per row: age, `money(displayValue(r.conversionAmount, r.year))`, `escapeHtml(scheduleWhy(r, bracket))`.
  `#conversionScheduleNone` shows when nothing converts; the table hides then. It calls `renderHeldLine(selected)` first.
- `scheduleWhy(row, bracket)` (`:190-193`, exported for its test): `convChoice` (capitalized) else `cliffChoice` (capitalized)
  else `Fill to the top of the ${bracket}% bracket`.
- `row.convChoice` (run-projection.js:2782): a sized year's target: `'no conversion (tax-aware)'`, `'the top of the N% bracket'`,
  `'just under|just over <line>[ (Partner X's return)]'`, or the fallback `'the bracket conversion (target not reachable this year)'`.
- `row.cliffChoice` (:2777): a phased year whose kept pass met its plan: `'stayed under ' + label` or `'filled to ' + label`; the
  solver's labels are `'Medicaid line'`, `'ACA credit floor (100%)'`, `'ACA 400% line'` and the IRMAA tiers' labels (no "the").
- `row.convHeldBy` (S4 ruling 1, decided in the conversion block): `'stayUnder'` (a phased 'under' year whose fill would have been
  >= $1), `'sized'`, `'plan'` (a phased fill year's natural cap), `'aca'`, `'irmaa'`, `'balance'`; absent when nothing held the
  fill below the bracket (including a year whose bracket fill is $0: the year's other income already fills the bracket).
  `row.convOverAca`: a conversion in a year already over an ACA 400% line.
- `renderHeldLine(selected)` (`:158-171`) draws `#rothOptimizerHeld` ("What holds the conversions: ..."), the line the owner
  approved in S4. `heldPhrase(kind, plan)` (`:155-156`) maps the kinds to phrases.
- Tests: `test_conversion_schedule.js` (its header lists sections 1-11b; the held line in 8-11b),
  `tests/unit/us/roth-optimizer-ages.test.js` (`ageRanges`, `scheduleWhy`), `tests/snapshot_ui.js` ("std R everything" shows
  the held line with every card open).
- Docs that describe the schedule and the held line: `README.md:99-103`, `docs/architecture/cliff-plan.md:172-180`,
  `docs/architecture/inputs-and-ui.md:~92`, `docs/architecture/test-inventory.md:~321`.

## Rulings (for the owner at the copy STOP; the recommended option first)

1. **Which rows the schedule shows.** Every converting year (as now) plus every year with `convHeldBy` (a held $0 year:
   the stay-under years, a year the ACA line or the IRMAA tier held to $0). A year whose bracket fill is $0 (no `convHeldBy`, no
   conversion) is not shown: nothing held it, the year's other income already fills the bracket.
   Alternative (owner's call): also show those years, "Nothing to convert: income fills the 22% bracket" — not recommended,
   because a $0 year with no `convHeldBy` can also be an empty traditional balance, an amount-map age or a year outside the
   ladder window, and the row fields cannot tell them apart without a new engine field.
2. **Collapsing.** Consecutive shown years with $0 and the same why text become one row: the age cell is the range
   (`ageRanges`, "62-66"), the amount "$0". Converting years are never collapsed (each has its own amount).
3. **The why text, in this order** (the first that applies):
   1. `convChoice` (a sized year): as now, capitalized ("Just under the ACA 400% line", "The top of the 12% bracket",
      "No conversion (tax-aware)").
   2. `cliffChoice` (a phased year that met its plan), with the line named as `lineNameOf` names it (adds "the" before the ACA and
      Medicaid labels): "Stayed under the ACA 400% line", "Filled to the ACA 400% line". (Today's text lacks the "the";
      `scheduleWhy` fixes it from the label, not the engine, so no row field moves.)
   3. `convHeldBy`: `'aca'` -> "Held at the ACA 400% line"; `'irmaa'` -> "Held under the next IRMAA tier"; `'balance'` ->
      "The whole remaining balance"; `'stayUnder'` / `'sized'` / `'plan'` are already worded by 1-2 (a `'stayUnder'` row always
      has `cliffChoice` when the plan was met; if the plan was missed, "Held by <plan>'s stay-under" via `heldPhrase`).
   4. else "Fill to the top of the N% bracket" (as now).
   So the screenshot's household reads: 59 "Held at the ACA 400% line"; 60-61 "Fill to the top of the 22% bracket"; one row
   "62-66 | $0 | Stayed under the ACA 400% line"; 67-71 "Held under the next IRMAA tier".
4. **The held line.** Remove `#rothOptimizerHeld` (markup, `renderHeldLine`, `heldPhrase` if unused): the schedule now says the
   same thing year by year, and two places saying it is what made the card hard to read. Alternative: keep it as is.
   `#rothOptimizerOverLine` stays (it is about the other bracket rows, which the schedule does not show).
5. **The empty state.** `#conversionScheduleNone` shows only when no row is shown at all (nothing converts and nothing was held).

## Task 12: the schedule shows the held years and names the limit

**Files:**
- Modify: `src/us/ui/results/roth-optimizer.js` (`renderConversionSchedule`, `scheduleWhy`, the held line per ruling 4; the
  line-1 purpose comment if the held line goes; `npm run analyze` for the module map), `src/us/index.html` (remove
  `#rothOptimizerHeld` if ruling 4 holds; the badge V154 -> V155).
- Test: `tests/unit/us/roth-optimizer-ages.test.js` (`scheduleWhy`: every branch of ruling 3, including the "the" fix, a missed
  stay-under plan, and the precedence convChoice > cliffChoice > convHeldBy > bracket; the collapsing helper if it is exported,
  else through the Playwright script), `test_conversion_schedule.js` (the fixture Dana and Chris: the shown rows and why texts
  pinned from the tree, 59 "Held at the ACA 400% line" and a collapsed stay-under row; the guard-on 'aca' couple from
  `tests/unit/us/conv-held-by.test.js`; the "no limit" single (no held row, schedule as before); a household whose run converts
  nothing and holds nothing: the empty state; sections 8-11b updated for ruling 4; 390x844: no horizontal overflow).
- Docs: `README.md` (the bracket card bullet), `docs/architecture/cliff-plan.md` and `inputs-and-ui.md` (the schedule and the
  held line), `test-inventory.md`, `docs/next-batches-plan.md` (a short "Schedule why (2026-11-03)" note under the Batch 5
  follow-ups results; the deferred wording item done).

- [ ] **Step 1: tests first.** Write the Vitest cases and the Playwright expectations; build; run: they fail.
- [ ] **Step 2: implement.** Keep the rows' cached objects untouched (`selected.rows` is a cached shared result: build the
  shown list in a new array, never write to a row). `textContent` / `escapeHtml` for every why. Run: passes. `npx vitest run
  tests/unit/us/roth-optimizer-ages.test.js --sequence.shuffle`; `npm run test:unit`.
- [ ] **Step 3: identity.** `node tests/snapshot.js` passes unchanged (no engine change). `node tests/snapshot_ui.js`: list the
  movers (expected: the "std R everything" text, the domHash of every control if the held line's markup goes); do not update.
- [ ] **Step 4: STOP for the owner** with screenshots of the open card at 1280 and 390 px (the fixture, and a household like the
  owner's screenshot: 24% setting, the plan's 22%, ladder 59-71), the schedule's text, and the `snapshot_ui` movers. After the
  OK (copy edits applied): the `snapshot_ui` baseline; the badge; the docs; `npm test` and `npm run test:ui` (serially); one
  commit "Bracket card: the conversion schedule shows the held years and names what held each (US V155)"; push.
- [ ] **Step 5:** an Opus review of the branch, its fixes, then the PR.

## Review focus

- Ruling 3's order against the row fields: can a row carry `convChoice` and `convHeldBy` with a held kind the convChoice text
  contradicts? Can a `'stayUnder'` row lack `cliffChoice`? Is "Held under the next IRMAA tier" right for the two-return case?
- Ruling 1's claim that a $0 year without `convHeldBy` is not a held year (check S4 ruling 1's gating: the fill test needs F >= 1).
- The "the" fix: every solver label, including the IRMAA tiers' and a Partner X return's suffix.
- Nothing writes to `selected.rows`; the collapsed rows are new objects.
- The held line's removal: every reader of `#rothOptimizerHeld` (tests, `snapshot_ui`, docs, the light-render staleness).

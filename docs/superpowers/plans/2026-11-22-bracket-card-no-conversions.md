# The bracket card's "No conversions" row (US V198)

Owner's request (2026-11-22): add a "no conversions" baseline to the Roth-conversion bracket search, for comparison and as a
selectable winner when not converting beats converting. It goes onto PR 119's branch (`claude/ss-claiming-pr5-spousal`, V197)
after the owner's yes.

## Which search

There are two bracket searches:

1. **The flat-bracket card** (`#rothOptimizerCard`, "Roth conversion bracket search"; `computeRothOptimizer` /
   `annotateRothOptimizer` in `src/us/ui/results/roth-optimizer.js`, the pick `pickFlatBracket` in
   `src/us/core/optimizer/roth-schedule.js`). It shows one row per bracket with lifetime tax, end assets, after-tax end value and
   run-out age, stars a pick and words a suggestion. It is visible only with conversions on.
2. **The cliff plan's bracket search** (`computeCliffPlan`, Batch 5 step 3a, `BRACKET_CANDIDATES`; pending on a light render,
   `searchPending()`), which picks the bracket the dashboard's run converts at.

**Decision: the card only.** The owner's wording ("for comparison", "show it next to the bracket candidates", "selectable
winner") describes the card, the one place the brackets are shown side by side. Adding "no conversions" to the cliff plan's
search would make the dashboard silently stop converting while the user's checkbox says conversions are on: a behaviour change
of the dashboard run, the plan summary, the goal answers, the guard scans (`solver_scan`, `conversion_sizing`, the
`bracket_search` gates) and the snapshot baselines, and it partly exists already: the per-year sizing pass offers a
no-conversion candidate per year (`report.sized.noConvKept`). That is listed as a possible follow-up, not done here.

## How the card applies a bracket today, and so how "No conversions" applies

The card has no Apply button: its suggestion is a sentence ("Suggested: fill to the 24% bracket instead of your current 22% —
..."), and the user changes the `rothConvBracket` select by hand. So the "No conversions" winner is applied the same way: the
sentence says to turn conversions off, naming the sidebar checkbox ("Enable Roth conversion ladder"). No new write to `state`
(none of the sanctioned writes changes). Turning the box off hides the card (as today).

## The row's run

The row is `{ ...state, rothConvEnabled: false }` (a shallow-copy variant; `state` is never written, never deep-copied or
normalized), run through a context factory, never through `simulate`'s store wrappers with a mutated state.

Which plan it runs with — two options:

- **A (chosen): its own plan**, `ownPlanContextFor(variant)(variant)` (`src/us/core/projection/store-context.js`): the cliff plan
  made for conversions off, the very plan the dashboard would run once the user turns the box off (`ownPlanFor`: the plan
  `refreshCliffPlan` keeps for those inputs, cached by the inputs' JSON in `ownPlanCache`). So the row predicts exactly what the
  suggestion's "apply" gives, and it agrees with the convert goal's answer (conversions on against off, which plans its toggled
  side the same way; the goal answer normalizes its copy, so the two cache keys can differ, which only costs a second plan).
  With the guard off `ownPlanFor` returns null and the row runs plan-free, as the dashboard would.
  Cost: one `computeCliffPlan` with conversions off (no bracket search, no sizing pass: both need conversions on) the first
  time the card opens for these inputs; it runs in the deferred pass (`renderOpenCards` is reached from the full / deferred
  render only; the card is in `DEFERRED_CARDS`). To be measured before implementing (the default household and a converting
  ACA early retiree): if it adds more than ~150 ms to opening the card, fall back to B.
- **B: the kept plan's intents**, `variantContext(state, variant)`, as the other rows use. Cheaper, but the row would not be what
  turning conversions off gives (the kept plan was made for converting), so the "turn conversions off" suggestion could be
  wrong in either direction.

The bracket rows are unchanged (pinned or unpinned exactly as today).

## Engine / pick side (`src/us/core/optimizer/roth-schedule.js`)

`pickFlatBracket(results, selectedDepletedAge, currentBracket)` takes the "No conversions" row as one more result with
`bracket: null` (no bracket). Rules, unchanged except the tie-break:

- the guardrail pool (`notWorseThan` against the dashboard run) includes it;
- `pickBest`: latest depletion, then the highest score with the $1 tie;
- among the tied: the current bracket; else the lowest tied **converting** bracket; the "No conversions" row only when it is the
  only tied one. So it is picked only when it beats every bracket in the pool (lasts longer, or more than $1 higher after-tax end
  value), the owner's "when not converting gives the better result". (Today's tie rule "else the lowest" is kept for brackets.)

## UI (`src/us/ui/results/roth-optimizer.js`, `src/shared/ui/results/roth-optimizer-card.js`)

- `computeRothOptimizer` builds the bracket rows as today and puts the "No conversions" row **first** in `results` (the table
  reads top-down from no conversions to 35%). It has the same fields (`endAssets`, `afterTaxEnd`, `score`, `lifetimeTax`,
  `depletedAge`, `overAca`: empty, as it converts nothing) priced with its own context (`pricingContextFor(ctx)`), `bracket:
  null`. `guarded` covers it.
- `annotateRothOptimizer`: the row label is "No conversions" (plus " ★" when picked; never "(current)" since `currentBracket`
  is a number). The summary when it is the pick: "Suggested: don't convert — turning off the Roth conversion ladder (in the
  sidebar) leaves an estimated **$X** more after-tax end value than {your current / the cliff plan's} **N%** (end assets less the
  tax still owed on the traditional balance, {unit}) and **$Y** less lifetime tax / at **$Y** more lifetime tax, without
  shortening how long the portfolio lasts." and the lasts-longer variant as the bracket sentence words it ("the portfolio lasts
  until ... instead of ..."). The other summaries are unchanged. The over-the-line line skips the row (its `overAca` is empty).
- The shared `renderRothOptimizer` writes a placeholder first that the US annotate overwrites synchronously; its row label and
  summary must not print "null%": the shared code labels a `bracket == null` row "No conversions" and words a null best as
  "Suggested: no conversions ..." (Canada never passes such a row, so its text is unchanged).
- The card's intro paragraph (`src/us/index.html`) adds: "... at each available federal-bracket fill target, and with no
  conversions, and shows ...". The table header "Fill to bracket" stays.

## Tests

- Vitest `tests/unit/us/flat-bracket.test.js`: new checks of `pickFlatBracket` with a `bracket: null` result: it wins on a
  strictly higher score (> $1), it loses a $1 tie to the current bracket and to the lowest converting bracket when the current
  is not tied, it wins on a later depletion, it is dropped by the guardrail like any row, and it is picked when it is the only
  tied one. `NEW_COUNT` 11 -> 17 or so. Run alone and shuffled.
- Vitest (new `tests/unit/us/no-conv-row.test.js` or in an existing card test, whichever fits; `computeRothOptimizer` reads the
  DOM for its candidates, so it stays in Playwright) — engine side: the "No conversions" row's run equals a conversions-off run
  of the same inputs with their own plan (`ownPlanFor`), every row converting $0. If the card function needs the DOM this check
  moves to the Playwright script.
- Playwright `test_bracket_search.js` (the card's script): seven rows, the first "No conversions"; its score is the
  conversions-off run with its own plan (`__test_runPlanMode` with that plan, or the toggled page's own run); and a household
  where not converting wins (to be found with a short scan; fabricated, never the owner's figures): the row is starred, the
  summary says "Suggested: don't convert", the bracket rows are unstarred. `test_conversion_schedule.js`' over-line check skips
  null rows already (`r.overAca` empty); update its count if any. Mobile width 390x844: no horizontal scroll with the extra row.
- Built: the US UI snapshot's "std R everything" surface text moves (the open card), an intended `npm run snapshot:update`.
- Built (after the plan review): the sentence links the sidebar checkbox through `revealField`, as the convert goal's answer
  does, and reads "Suggested: turn off the Roth conversion ladder (in the sidebar) rather than fill to ...".

## Docs and version

- `src/us/index.html` badge V197 -> V198.
- `README.md`: the bracket card line gains "and with no conversions, which it suggests when not converting does better".
- `docs/architecture/cliff-plan.md` (the flat-bracket card paragraph) and `engine.md` (the `pickFlatBracket` paragraph):
  the row, its own plan, the tie rule. `docs/architecture/test-inventory.md`: the new checks/counts.
- Batch notes: this is outside the batch plan, so `docs/reference.md` gets a short entry (or the PR 119 notes, per the
  owner).
- No module or export added (only behaviour inside existing functions), so `npm run analyze` only if the module map's purpose
  lines change (the roth-optimizer.js purpose line mentions "the bracket ranking table": updated to "the bracket and
  no-conversion ranking table", then `npm run analyze`).

## Verification

`npm test`; `node test_bracket_search.js`, `node test_conversion_schedule.js`, `node test_plan_optimizer.js` after
`npm run build`; then an independent Opus review of the branch.

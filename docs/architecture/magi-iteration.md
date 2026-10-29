# The MAGI iteration

Read before editing a year body of either engine, anything that reads or changes this year's MAGI, two-return years, the 162(l) estimate, or the IRMAA lookback and appeal.

Related: [engine.md](engine.md), [self-employment.md](self-employment.md), [us-health.md](us-health.md), [inherited-accounts.md](inherited-accounts.md), [cliff-plan.md](cliff-plan.md), [us-federal-tax.md](us-federal-tax.md), [lists.md](lists.md).

## MAGI iteration (both engines)

- **MAGI iteration (both engines).** ACA subsidy, the ACA/IRMAA
  Roth-conversion ceilings and the IRMAA lookback need THIS year's MAGI,
  which includes this year's discretionary withdrawals, which depend on
  the premium that MAGI sets. Inside each engine's year loop the body is
  wrapped in `for (let iter = 0; ; iter++)`: it snapshots every mutated
  balance (and the Roth and account ledgers) before the first mutation, and if
  `estUsed` (an ACA premium or a finite MAGI ceiling consumed
  `estTrad`/`estGain`) and the realized discretionary traditional
  withdrawals + taxable gains differ from the estimate by more than
  `MAGI_ITER_TOL`, it restores the snapshot, updates the estimate, and
  `continue`s (max `MAGI_ITER_MAX` passes, damped after pass 3). Rules for
  editing a year body: anything that mutates closure state before the
  convergence check must be in the snapshot (`bal` fields are rewound
  automatically; add new scalar `let`s to `scalarSnapshot`; the guardrail state is the `guardrails` object, copied as `guardrailSnapshot`), and never add a `continue`/`break` that is meant for the year
  loop. `prevDiscTraditional`/`prevTaxableGainGross` only seed pass 0.
  `row.magiProxy` is the realized MAGI and `irmaaMagiHistory[year]` is
  overwritten with its Medicare MAGI after convergence; the in-body assignment is
  provisional and only read by the plan's first-year IRMAA stand-in.
  The engine's MAGI is the ACA definition (all of Social Security); IRMAA amounts convert with
  `irmaaMagiOf(magi, ss, filing)` (Medicare's MAGI: only the taxable part of Social Security, this year's
  return's benefit and filing status, `irmaaSsOf` / `returnStatusA`), and IRMAA lines and caps translate
  into the engine's MAGI with its exact inverse `magiForIrmaaLine` (one MAGI scale for steering).
  **The forced pass's pick (US).** A year that has not converged after `MAGI_ITER_MAX` passes re-runs, once, the logged pass that
  overpaid the least (`passLog`; its realized cost is at most its charge) with that pass's logged estimates, so it repeats exactly.
  With no premium step in play every pass ties at an overpay of 0 and the strict `<` keeps the first, the seed pass. In a sized year
  (`convTarget !== null`, any target, `'none'` included; Batch 5 step 5b piece 3, spec B0.11.10) an exact tie goes to the pass with
  the smallest `drift` (each `passLog` entry records its pass's drift, the convergence test's own measure: the 162(l) terms are in
  it when `seLive`): the conversion is the fill less `estTrad` and moves against the draw, so the seed pass is
  the least consistent one (`std R everything` at 60 converted the whole 22% fill on top of a 184k draw). Unsized years keep the
  first pass, byte for byte. Test: `conversion-apply.test.js` (k).
  **Two-return years (US, 3C B1):** `twoReturns = !profile.singlePerson && !filingRow(filing).joint` (an
  unmarried couple, or before a marry-later wedding; never the survivor period or single-person mode).
  `returnMagis(profile, trad, gain)` splits the MAGI into `[magiA, magiB]` (each partner's `other` and
  Social Security, half the investment income and gains, `trad` = discretionary draw + conversion by
  `profile.ownerShareA`; the two sum to the household figure) and allocates its 2-array only in those
  years. The year loop keeps `magiHistoryA/B` (rows keep this ACA per-return MAGI), their Medicare MAGIs
  `irmaaMagiHistoryA/B` (A on `returnStatusA`, B single; what `healthcareCost`'s IRMAA reads) and
  `twoReturnHistory` beside `irmaaMagiHistory` (written per pass like it, overwritten with the realized split
  after convergence; rows carry `magiA`/`magiB` in two-return years only). `healthcareCost` prices the ACA premium per tax household (A's includes the
  children, half the premium each, own poverty line) and IRMAA per person on the single tiers whenever
  the lookback year had two returns (`irmaaLookbackSplit`; the entered first-two-years prior MAGI is
  split evenly), else the household rule. `conversionMagiCeiling` keeps each return under its own ACA
  400% line and IRMAA tier, dividing each return's room by its share of the conversion. The forced pass
  prices other draws through `costAt(trad, gain)` (which re-splits the MAGI). Test: `tests/two_return_magi.js`.
  **The split share estimate (US, Batch 5 step 4d).** A split pass (`yearSplit` 0 or 1, [engine.md](engine.md)) draws one partner's
  traditional accounts first, so the share of the year's traditional income on A's return is not the start-of-year ownership share:
  it is realized by the draw. The pass prices each return's premium and conversion ceiling before it draws (`returnMagis` at the
  pass start), so a split pass starts with `profile.ownerShareA = estShareA` (outside a split pass the start-of-year `ownerShareA0`,
  unchanged) and the withdrawal block sets it back to `ownerShareA0` before the draws. `estShareA` converges like `estTrad`: the
  drift gains `|realizedTrad * shareEnd - estTrad * estShareA|` (A's traditional dollars against the estimate), the update is the
  same damped step, under the same `MAGI_ITER_MAX`. It is seeded 1 for A-first and 0 for B-first; a trial from a kept split is
  seeded with the record's realized share (`shareA`). It goes wherever the other estimates go: the `passLog` entries and the forced
  pass's pick (a forced pass repeats the picked pass exactly), the `seHeld` switch's seeding (to the realized share), every record
  (`estShareA`) and every replay (which takes the record's `estShareA`, so it repeats the same pass). A forced pass may end with the
  realized share off its estimate; its lines are then placed with that mixed share (recorded, not corrected).
  **Third estimate (US, E1c).** The self-employed health insurance deduction (162(l)) depends on the year's premium, which depends
  on the MAGI the deduction lowers, so the iteration carries a THIRD estimate beside `estTrad`/`estGain`: `estSeA`/`estSeB` (seeded from
  `prevSeHealthA/B`, the realized deductions of the previous year, written only after convergence, so there is no `scalarSnapshot` entry).
  `magiBase0` is the MAGI before the deduction and `magiBase = magiBase0 - estSeA - estSeB` is rebuilt every pass; each pass puts
  `profile.seHealthA/B` on the profile, prices the premium with `costAt(trad, gain, sa, sb)` (the deduction pair rides as arguments, and
  `lastCost` remembers the pass's cost), and `returnMagis` subtracts `seHealthA/B` from each return's other income. After `healthcareCost`
  the pass runs `seHealthDeduction` (`seRealA/B`), sets `estUsed` when the deduction moved, and removes the realized deduction from the
  medical expense (no double count). The convergence test, the pass log (realized cost on the realized pair), the damped update, the pick
  restore, the forced pass (realized-pair `costAt`, the deduction re-run on `lastCost`), the recorded MAGI (`realizedMagi = magiBase0 -
  (seRealA + seRealB) + draws`) and the cliff plan's phases (natural, fallback replay, trial records, winner replay, trial seed) all carry
  it. A year whose damped iteration does not converge, with a 162(l) deduction allowed (`seAllowA || seAllowB`; 8b, owner
  decision A, refined by decisions 10 and 12), holds a deduction chosen once, as Rev. Proc. 2014-41 section 5 allows: the consistent
  deduction when one exists (a bisection, below), else the alternative calculation (the deduction at the full premiums, `costAt` at a
  MAGI of 1e12, then at the premium after the credit the step-1 MAGI allows). It sets `estSeA/B` to it and `seHeld = true`, and re-runs
  the phase: while `seHeld`, site 7 takes the held pair as the realized pair (the deduction term of the convergence test is 0) and the
  forced pass does not re-price it, so the premium, the draws and the MAGI follow the held deduction. The two methods are one closure,
  `seSearch(trad, gain)` (built on first use in a pass: a pass that never searches allocates nothing), which prices the draws it is
  handed. **Decision 12 (Task 11):** a hold is the year's working estimate, priced on the draws of the pass that failed to converge, and
  is not re-checked inside the year (decision 11's in-year re-hold flipped across the 400% line and deducted more than the premium
  paid). **The settlement (Batch 5 step 1, spec `docs/superpowers/specs/2026-10-23-b5-162l-settlement-design.md`):** every phase whose
  final pass holds a deduction (`seHeld`, forced afterwards or not; a replay recomputes it) files its return at its final draws, in a
  block after `realizedMagi` and before the phase-end block, gated on `seHeld && !ctx.test.seNoSettle`. (1) The coverage kinds the
  pass paid for are captured with `hcArgs.recon = -1` (`ACA_KIND`, reset first: it is filled only on the ACA branch) from the very
  pricing it was charged (the forced pass's realized `costAt`, else `healthcareCost` on the pass's own `hcArgs`); then `recon = 1`
  prices every probe at the return's price (`acaNetCost`'s reconciliation mode: a credited year keeps a credit below 100% and under
  the Medicaid line, a Medicaid year stays $0, an uncredited year claims the credit in 100-400%) until the block resets it to 0.
  (2) `seSearch(trad, gain, true)` runs at the final draws and also records each part's left end (`seLoA/B`), whether it is
  consistent (`seConsA/B`) and section 5.02's (`se502A/B`). (3) A consistent part takes its deduction; otherwise its candidates are
  5.02's (only when it passes the legal bound: D at most the deduction the return's premium at D's MAGI allows, plus $1) and `lo`
  (always legal), each combination priced as its return (`costAt` plus the tax with its own medical deduction) and the lowest
  tax plus premium taken by `settleChoice` (5.02's first, so an exact tie takes it; decision 5); the combinations and the pick are
  the pure `settleCombos` / `settleDecide`. A step-1 deduction of 0 at the return's price settles to 0. In year 0 without entered
  prior MAGIs (IRMAA's lookback stand-in is the year's own MAGI) the pass-local `seStand0` makes every `costAt` of the settlement
  (the search's probes, the bound check, the candidates) write its own MAGI to the year-0 histories first, so a deduction is
  judged at the IRMAA its own MAGI sets (otherwise it could exceed the return's premium). The search's step 1 (the premiums paid,
  priced at a MAGI above every line) is not a return pricing: it never writes the stand-in and reads the pass's own, as the hold does
  (written, it charged the top tier). (4) The settled pair goes on the profile, `realizedMagi` and the histories (`irmaaMagiHistory[year]`,
  two-return `magiHistoryA/B` / `irmaaMagiHistoryA/B`) are written before the final pricing (year 0's IRMAA stand-in is the return's
  MAGI), `healthcareSettled` is `costAt` at the pair, and the appeal fields follow it. (5) `taxSettled` repeats the year's `totalTax`
  expression exactly (an unmoved deduction gives the same double). (6) `seSettle = (healthcare - healthcareSettled) + (totalTax -
  taxSettled)`; `seRealA/B` become the settled pair. The year keeps its draws, paid premium and paid tax (decision 1); the row gains
  `seDeductionA/B`, `healthcareSettled`, `taxSettled` and `seSettlement`, the trace `seSettle`; the kept phase's `seSettle` becomes
  the loop-level `seCarry` (next year's cash, `engine.md`), and next year's seed is the settled pair. The invariant grid in
  `tests/se_health.js` asserts, per settled year, the legal bound, the return's price, the search at the final draws (0 understated:
  before the settlement 422 of 2,310 grid years were, worst $12,699.56), the best candidate, the identity and the carry; base-pinned
  hashes there pin the unheld households and the held year's paid figures against `d8e3cee`. Nothing is held when the
  step-1 deduction is 0 (the Solo plan took the whole net): the pass falls through to the forced pass as it did before the switch.
  `magiStats.seFixed` / `seAlternative` count the kept phase only, through `seKind` (1 consistent, 2 alternative), like `forced` /
  `unresolved`. `seHeld` and `seKind` are reset at a trial start and carried in `naturalRec` / the trial records with
  `estSeA/B`, so the plan's replays restore them. A new reader of the year's MAGI inside the loop must use `magiBase`, not
  `magiBase0`. **`seOn` (8a):** `buildTaxProfile` sets `profile.seOn = seA > 0 || seB > 0`, and `taxFor` reads the self-employment
  fields (`seNet*`, `sePlanNet*`, `seHealth*`, ...) only when it is true (exact zeros otherwise, no number changes), so EVERY profile
  that reaches `taxFor` must carry `seOn` (the lambda, Roth solver and optimizer literals carry `seOn: false`; a test profile with
  self-employment keys needs `seOn: true`, or the keys are ignored). **Decision 10 (9a):** before the alternative calculation the
  block searches for the consistent deduction (D equal to the deduction the premium at D's MAGI allows, within $1) by bisection, holding the
  pass's draws: the deduction the premium allows falls as D rises, so `g(D) = allowed(D) - D` is decreasing on `[0, step-1 deduction]` and
  has at most one crossing (one search on the total on one return, one per return on two; a return's slot of `seHealthDeduction` reads only
  its own MAGI). Found: held (`seHeld`), counted in `magiStats.seFixed`; not found (a jump in `g`, or a non-monotone `g` below 100% of the
  poverty line in a non-expansion state or with `medicaidWhenEligible` off): section 5.02's alternative calculation for that part, counted in
  `magiStats.seAlternative`. The damped 8-pass iteration alone zigzags across the 400% line just below the band, so without the search the
  year charged a premium up to $11,800 too high (single, $18,000 premium, profits 72,750 to 74,000). **9c (speed):** every E1c term is
  skipped, not added as a zero, for a household without self-employment: `taxFor` tests `seOn` once and builds each self-employment term
  inside `if (seOn)` / `seOn ? ... : ...`; the year loop's `seLive` (`profile.seOn` or a deduction carried in from last year) gates the
  162(l) terms of the pass (`magiBase`, the `estUsed` line, the medical expense, the convergence test, `realizedMagi`); the Solo terms of
  `retirementContributions` are added only when `so !== NO_SOLO`; the stream premium factor and the IRMAA cover bits are computed only when
  `ctx.inputs.incomeSources` is not empty. A new E1c term in a hot path must follow the same rule. Tests: `tests/se_health.js` (Task 9a and 10a blocks),
  `tests/unit/us/tax-caches.test.js`.
  **IRMAA appeal and the lookback's filing status (US, E3).** The household lookback charges on the tiers of the lookback
  return's filing status (`irmaaFilingHistory`, written once per year before `hcArgs`; `irmaaLookbackFiling`: years 0 and 1
  read year 0's status, except an entered prior return from before a married partner's death, which is joint), so a survivor's
  D+1 and D+2 are on the joint tiers. `irmaaAppealTable` (per run; `null` for most runs) records each person's usable events by
  first post-event year E (a main-job retirement, the end of a W-2 or self-employed stream, a married spouse's death; covered:
  the owner, the spouse when married in E; kept for a covered person alive in E and 65 by E+1). In `healthcareCost`, a partner
  on Medicare whose window is open (`irmaaAppealWindow`) and whose normal charge is above 0 is charged the lowest of the normal
  charge, this year's MAGI (the pass's estimate, so it sets `usesMagiEstimate` and converges within `MAGI_ITER_TOL`; `costAt`,
  the forced pass, the 162(l) search and the inherited need adjustment price it unchanged) and, in year E+1, last year's
  realized MAGI; year 0 without entered prior MAGIs is skipped. At Medicare ages the IRMAA Roth-conversion ceiling is finite
  and already sets `estUsed`, so the appeal's own `usesMagiEstimate` matters only where that ceiling is infinite. The year loop keeps `appealYrA/B` (set from `hcOut`, and again
  after the forced pass's `costAt`; never read from `lastCost`) for the row's `irmaaAppealYearA/B` / `irmaaAppealKindA/B`, and
  `inYrA/B` for the cliff plan, whose IRMAA lines sit on this year's edges (growth 1, per return through
  `c.irmaaGrowthA/B`) in a year with an in-year candidate. The plan's `irmaaAt`, lines and `irmaaChecks` use this year's
  filing status (the return SSA will read). Test: `tests/irmaa_appeal.js`.
  Test: `tests/aca_magi_iteration.js`. Test: `tests/unit/us/irmaa-magi.test.js` (Vitest, in `npm test`). See `docs/reference.md`.

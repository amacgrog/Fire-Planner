# Inherited accounts (US, E1e)

Read before touching the `inheritedTrad` / `inheritedRoth` one-time income kinds, the inherited ledger, or the last-resort draw.

Related: [lists.md](lists.md), [magi-iteration.md](magi-iteration.md), [us-state-tax.md](us-state-tax.md), [engine.md](engine.md), [cliff-plan.md](cliff-plan.md).

## Inherited accounts

**Inherited accounts (US, E1e; spec `docs/superpowers/specs/2026-10-09-e1e-inherited-accounts-design.md`).** Two more `oneTimeIncome`
kinds, `'inheritedTrad'` and `'inheritedRoth'` (kept by `normalizeUsLumps`, skipped by `lumpAmountsForYear`; `age` is the year of death
in Partner A's age, `owner` A/B, a past year allowed). **Ledger:** `inheritedLedger(rows, yearCtx)` (the rows are `ctx.inputs.oneTimeIncome`; `yearCtx` is a small year-info object, `{ ageA, ageB, single, taxYear: ctx.taxYear, deathYear, deceasedIsA, deceasedIsB }`, not the run context; in the engine `ctx` always means the run context and a per-call info object is a `yearCtx`) at the top of
`runProjection` returns `null` for every state without such a row, and every E1e term in the year loop sits behind `inh === null` (or
`inh !== null`), so a legacy run is the same double; otherwise one slot per row in preallocated typed arrays, oldest receipt first
(`receiptYear`, heir at receipt, `L` = `singleLifeFactor` of the heir's age in the year after receipt, `deadline`, `stretch`, `slot` /
`post` = the pre- / post-remap profile slot). `bal.inheritedTrad` / `bal.inheritedRoth` (always present, 0) are the ledger's sums; the
ledger is cloned and restored with the MAGI-iteration snapshot (`inheritedClone/Restore`). `inheritedYear` computes the year's draws once,
before the iteration, from start-of-year balances (`INH_OUT.drawA/B` by pre-remap slot, `rothPayout`); `inheritedApply` grows each open
row at the year's stock return, takes the draw, closes an emptied or expired row, and is the only place a row opens (a future row after
that year's growth, with no scheduled draw in its receipt year; it gets its slot and post-remap slot when it opens, `b816cc9`). **The
schedule** is `inheritedDraw(b, r, k, L, roth, stretch)`: a 10-year traditional row `min(grown, max(grown / (11 - k), b / (L - k + 1)))`
(the RMD on the heir's factor as a floor, the account as a cap; the whole account in year 10 or when `L - k + 1 <= 1`); a Roth row
nothing until year 10, then the whole account, a tax-free transfer to `bal.cash` (no flow, tax or MAGI); a **stretch** row (decision 17:
death year `currentYear + receiptYear < 2020`) the RMD alone, no deadline. **Successor rule:** if the heir dies, the slot moves to the
survivor; a 10-year row keeps its deadline; a stretch row's heir's first dead year is still a stretch year, then `deadline = Y + 10`
and the 10-year schedule with the heir's factor continued. **Federal:** the scheduled draw joins `flow` (appended, only when non-zero)
and `buildTaxProfile`'s `otherA/B` via `inheritedA/B`, **never** `streamOtherA/B` / `extraA/B` (which `taxFor` puts into the state's
wages); not net investment income, never penalized, not in `requiredDistributions`, `accts` or the conversion. Every profile carries
`inhOn` (true in every year of a run with a ledger), `inheritedA/B`, `inhExtraA/B` (the last-resort draw), `inhExclA/B` and `inhEstA/B`;
the profile literals of the Roth solver, optimizer and lambda carry none of them (read as off). **State:** `STATE_RULES.inherited`
on all 51 rows, `{ kind, cap }` with five kinds (`INH_CODE`): `ordinary`, `exempt` (subtracted from the base), `heir` (joins the
heir's own retirement exclusion with its age tests and caps; CT's `agiPhasedShare` adds it to the household retirement amount),
`heirAnyAge` (CO, AR, OK: only the inherited amount bypasses the age test; CO under 55 special-cased up to the first tier's cap) and
`decedent` (NY: `inhExclA/B`, per post-remap slot, `min(each row's draw, cap)`); compiled in `compileRow` (a missing field reads
`ordinary`, for the synthetic test rows). `newStateSources` declares `inherited`, `inheritedA/B`, `inheritedExclA/B` and `taxFor`
writes them on **every** taxing-state call (zeros when `inhOn` is off), because the four scratch objects are reused; only the reads in
`stateIncomeTax` are gated (`sources.inherited > 0`), and the amount enters `ordinaryNonSS` (so Washington never taxes it).
**Fourth estimate:** the last-resort draw per post-remap slot rides the MAGI iteration as `estInhA/B` beside `estTrad`/`estGain`/
`estSeA/B` (seeded from `prevInhA/B`, written after convergence; through `magiBase`, `returnMagis`, `costAt`, `irmaaAt`, `estUsed`, the
convergence test and damped update, the forced pass, `realizedMagi` and every cliff-plan record). The pass top also sets
`profile.inhEstA/B = estInhA/B`, which only the Roth bracket fill reads (decision 18: `solveRothConversionTop`'s other income adds
`inhEstA + inhEstB`, appended only when non-zero); `taxFor` reads the realized `inhExtraA/B`. Known limitation (decision 18, spec
section 9): with a large last-resort draw the damped estimate reaches the 8-pass cap and the conversion ends about 0.04% of the draw
short of a scheduled-draw twin (`fill convergence bound` in the test pins it). **Last resort:** `takeInherited(wd)` (inherited Roth,
then traditional rows by bisection, oldest receipt first, each taxed like a scheduled draw on its post-remap slot through
`profile.inhExtraA/B` and, under `decedent`, the row's remaining room in `inhExclA/B`) runs right after `releaseMagiCap` in both
`withdrawStandard` branches (before `takePenalized` in the penalty-aware one, before home equity in both) and inside the US-only
`BUCKET_STEP.home` and `BUCKET_STEP.penalized`, so the shared bucket orders are unchanged; uncapped by the cliff plan. **Need
(decisions 15, 16):** in a year with a scheduled draw, one extra premium evaluation and one `taxFor` without the draw (`taxNoDraw`,
the profile restored to the very doubles) give `inhNeedAdj = inhDraw - (tax - taxNoDraw) - (healthcare - hcNoDraw)`, which the
guardrails, `firstWithdrawal` and lambda's need add back (a draw-made surplus year records too; the guardrail portfolio counts the
inherited balance before the draw). Rows carry `inheritedTrad` / `inheritedRoth` / `inheritedDraw` only in an inherited year (folded
into `traditional`, `investable`, `traditionalWithdrawn`), `annotateInheritedRows` adds them to the status tooltip, and `estate` /
`afterTaxValue` count the balances. Hooks: `window.__test_inherited`, `__test_inhForceExtra`, `__test_inhTakeCount`,
`__test_inhNoDrawCalls`, `__test_inhNoNeedAdj`. Tests: `tests/inherited_accounts.js`, the inherited cases in `tests/unit/us/state-rules.test.js`,
`tests/unit/us/state-mechanisms.test.js` and `tests/legacy_state.js`, `test_inherited_accounts.js` (Playwright, `npm run test:ui`).

# The parked ACA-ceiling fix: why it gives mixed results (2026-10-31)

Branch `claude/aca-cap-over-line`, WIP `9ab5cad` against its parent `b57def0`. No change to `src/` or the tests. Core
investigation by a Fable subagent; its claims were checked against the code and its key figures re-run on both trees.

## Short answer

The old $0 in an over-the-line year was never written down as intended. In practice it was the only brake on a flat
bracket fill that ignores the year's own traditional draw. Lift the brake and the fill converts ~$50-70K on top of a
~$180-200K draw. That conversion is taxed at 22-24% at the margin, not at the bracket the plan picked (10%). The tax is
mostly prepaid, not saved, and it leaves the portfolio 20+ years early. Batch 5's per-year sizing already scores those
conversions and prefers `none`, but `apply` cannot carry a `none`. **Recommendation: do not merge the WIP as is.** Fix
the flat fill instead (see 4), and keep the over-the-line rule only together with that fix.

## Evidence (commands)

- Both trees built (`npm run build`; parent in a scratch `git worktree`). The snapshot scenarios were dumped with
  `tests/snapshot.js --only US --dump <dir> --filter 'rothConv+aca'` and compared with `--compare`.
- Probes: Playwright on `dist/Planner_US.html` (`__test_refreshCliffPlan`, `__test_simulate`, and
  `__test_runPlanMode({ planMode: 'choose', planTrace: true })` for the per-year candidates).
- `npx vitest run --project us`: 13 fail / 499 pass in the 8 files the brief names (the agent's run matches the owner's).
- Node 22, tax year 2026. Figures below are measured unless marked *inferred*.

## 1. Why unblocking over-the-line years hurts some households

**Mover `std R rothConv+aca+live`**: couple 52/50, Texas, taxable $700K, traditional $900K, Roth $200K, cash $60K,
spending $90K, conversions 52-62 at 24%, ACA on (no enhanced credit), live order on. Both trees, user bracket 24
(re-run myself; $K):

| age | before: MAGI / conv / trad / tax / health | after: MAGI / conv / trad / tax / health |
|---|---|---|
| 59 | 100.6 / 78.5 / 0 / 4.4 / 10.0 | 89.8 / 67.8 / 0 / 3.1 / 8.9 |
| 60 | 179.0 / **0** / 179.0 / 17.9 / 23.7 | 268.1 / **69.4** / 198.6 / 37.5 / 23.7 |
| 61 | 183.2 / **0** / 183.2 / 18.2 / 24.6 | 274.4 / **71.2** / 203.2 / 38.3 / 24.6 |
| 62 | 108.3 / 0 / 69.9 / 6.7 / 10.8 | 99.1 / 47.6 / 13.1 / 5.6 / 9.9 |
| 63 | 111.0 / 0 / 71.6 / 6.9 / 11.1 | 53.4 / 0 / 13.4 / 0 / 3.3 |

Investable at 62 / 70 / 80: 1,468.6 / 1,245.9 / 479.2 -> 1,429.8 / 1,211.1 / 402.1. Run-out 96 -> 95. Lifetime
conversions 148 -> 326, tax 263 -> 262, healthcare 1,116 -> 1,103. Plan summary: "stay under the ACA 400% line at
62-65 ... your 24% bracket" before; "no steering helps ... the 10% bracket, not your 24%" after.

The chain:

1. **The years are over the line because of spending, not choice.** Taxable is gone by 60. Spending, tax and the full
   premium (credit lost, about $24K) all come out of traditional: draws of $179-183K against a line of about $87K. No
   stay-under is possible: the guard never spends Roth to make room (spec 13.5, `docs/next-batches-plan.md` ~4671).
2. **The flat fill ignores that draw.** `solveRothConversion` calls `solveRothConversionTop(..., drawBelow = 0)`
   (`src/us/core/withdrawals/roth-conversion.js` ~183). So it fills *other* income (the draw excluded) to the bracket
   top: 10% top plus the MFJ standard deduction, about $69K. Stacked on a $199K draw, that $69K is taxed at 22-24%.
   Federal tax at 60 goes up $19.6K on $69.4K (28%), and the extra traditional draw pays it.
3. **The money is prepaid, not saved.** Lifetime tax ends up nearly equal (263 vs 262). The extra tax at 60-61 comes
   back later as lower tax at 63-67, but the dollars left the portfolio 20+ years earlier. The gap grows from $39K at 62
   to $77K at 80 (*inferred*: forgone compounding).
4. **The plan answer changes.** After the fix, every bracket converts in the over-the-line years too, so a higher
   bracket only costs more. The bracket search now keeps 10% for every setting. That also shrinks the under-the-line
   conversions (59: 78.5 -> 67.8), and the 62-65 stay-under intent goes away ("no steering helps").

IRMAA and the bond reserve play no part (everyone under 63, healthcare equal at 60-61).

**Second mover, `hist R rothConv+aca | mc1`** (84 -> 83; agent's figures). The plan is made once on the standard path,
and `apply` then replays its bracket on a bad sequence. Years over the line from taxable gains convert $60-70K at
54/55/57/58 (+$6-10K tax each) and $65K at 60 (+$18K, 28%). Lifetime tax 176K -> 189K, healthcare equal. Investable at
62 / 70: 1,098 / 597 -> 1,063 / 537.

**Why some households win.** The same lever pays where the conversion's marginal rate is below the rate the converted
dollar would otherwise pay later (big RMDs, a survivor's single brackets), or where a later year was going to cross a
cliff anyway. In the per-year trace these are coin flips. A stand-in for the example couple at $90K spending, age 61:
bracket candidate $61K, cost +$16.6K (27%), score +$75 against `none`. That household went 97 -> 98, the other way.

**The owner's example couple.** I could not reproduce the depletion at 94/95: the spending, Roth and income in the
example are not in the repo. With the inputs given and the default spending, rows are identical before and after
(conversion ~$31K at 59-61, MAGI $87-91K, no depletion). With spending of $80-110K the agent found every case equal or
better after the fix. The ~$60K conversions at 60-61 match the mechanism above exactly: $61.4K =
($24,800 + $32,200) x 1.0769, the 10% top plus the deduction, indexed.

## 2. Bug, brake, or intended?

- Stated purpose: cliff *avoidance*. The guard's comment says "Avoid the ACA subsidy cliff: once ... MAGI crosses 400%
  ... the full premium is owed" (`roth-conversion.js`, around 123-130 on the parent). `docs/reference.md:6562`:
  "Choosing for the household (e.g. skipping a Roth conversion to stay under the cliff) is the optimizer's job, not the
  iteration's". `next-batches-plan.md` ~4389: "conversions keep the bracket setting (capped by the safe-MAGI ceiling) in
  every mode; Batch 5 owns tax-aware conversion sizing". `us-health.md:16`: "`conversionMagiCeiling` is unchanged".
- No document says an over-the-line year should convert $0. The IRMAA ceiling next to it keeps a year in the tier it
  already sits in, rather than zeroing it. That asymmetry, together with `Math.max(0, line - MAGI)`, makes the $0 an
  artefact.
- **Verdict: an accidental but useful brake.** It is a bug by the written intent. But it hides a real defect, the
  flat fill blind to `estTrad`, and Batch 5 was tuned on top of it. The shortlist's bracket candidates in such years are
  scored against a bracket conversion of 0, so "convert in an over-the-line year only when the whole-run pass finds it
  pays" is already what the pre-fix design does.

## 3. Why the bracket setting changes nothing

The path: `rothConvBracket` goes to `planForState`, which builds the plan. `computeCliffPlan` tries every
`BRACKET_CANDIDATES` entry (`run-projection.js` ~2488-2493, `makePlan({ bracket: b, bracketFrom: from })`) and keeps
one (`keptBracketOf`). `solveRothConversion` then uses `plan.bracket` whenever `plan.bracketFrom === rothConvBracket`
(`roth-conversion.js` ~177-182). Probes of the owner's example couple at brackets 10/12/22/24/32, measured:

- **Before:** `plan.bracket` equals the setting, but every conversion year sits under the line, and the ACA room
  (`magiSafeRoom`, `run-projection.js` ~672 and ~860) binds for every bracket from 10% up. Conversions are $31K, $31K,
  $32K at 59-61, the same for every bracket.
- **After:** `plan.bracket` is 10 for every setting (the over-the-line years make every higher bracket worse), so the
  setting is overridden.

What binds is the ACA line (before) and the plan's kept bracket (after), never `inputs.rothConvBracket`. Per-year
sizing (`plan.conv`, `resolveConvTarget`) sets an amount only in a year with a shortlist target. Here it found nothing
better ("tax-aware sizing found nothing better"). (The card was not opened; its rows are these
`computeCliffPlan` entries, *inferred*.)

**Sizing already disagrees with the flat fill.** Choose-mode trace after the fix, `std R ...live`:

| age | bracket candidate | cost vs `none` | lambda | score | winner |
|---|---|---|---|---|---|
| 60 | $69K | +$15K | 0.134 | -5,988 | `none` |
| 61 | $71K | | 0.148 | -5,125 | `none` |
| 62 | $48K | | 0.215 | -223 | `none` |

But `apply` follows only the whole-run shortlist, which never holds `none` or the bracket target (`run-projection.js`
~1613-1615, `docs/architecture/cliff-plan.md` ~464). So the flat fill converts anyway.

## 4. A better design

Make the conversion in an over-the-line year a decision that is scored, not a default.

1. **Drop the WIP's household and per-return change**, or keep it only on the sized path (`resolveConvTarget`, whose
   `bracketTop` already passes `estTrad` as `drawBelow`).
2. **Make the flat fill honest:** pass `estTrad` as `drawBelow` in `solveRothConversion`. A "10% fill" in a $190K-draw
   year then converts 0 by construction, and a 24% fill converts only the room actually left in 24%. This is the real
   defect, and it applies in every year, not just over-the-line ones. With it, the over-the-line rule becomes safe,
   because the fill no longer lands two brackets above its label.
3. **Optionally add `none` to the shortlist** (`cliffConvShortlist`), so the whole-run pass can switch off a flat fill
   it scores as a loss. This costs up to one more `apply` run per such year, inside `CONV_RUN_BUDGET` (24).

**Risks:**

- (2) moves many snapshots, under-the-line years included. It is an intended behaviour change: `npm run snapshot:update`
  with a stated reason. The note at `roth-conversion.js` ~30-32 (drawBelow 0 keeps the same doubles) stops applying to
  the flat path.
- The WIP rule makes the ceiling jump between the line and Infinity as `estTrad` crosses the line: a second
  two-regime map for the MAGI iteration (`reference.md:6562`). Forced/unresolved passes (`magiStats`) were not
  measured; check them, and `tests/bench_runs_interleaved.js --warm-analysis` for time.
- Never-earlier: `greedyAccepts` / `bracketCandidateBetter` still guard the whole-run pass; the property checks in
  `gains-capped.test.js` still pass on this branch (its failure is the pinned movers list).

**Guards:**

- the new `conversion-aca-ceiling.test.js`
- `conversion-apply`, `conversion-choose`, `conversion-plan`, `plan-search`, `gains-capped`, `order-lever`,
  `split-order-floor`, `two-return-split` (the 13 pinned checks: re-pin with stated reasons)
- `tests/snapshot.js` (check that no depletion is earlier than both today's and the WIP's), `tests/plan_off_anchor.js`,
  `tests/engine_purity.js`, `tests/cliff_guard.js`
- a new Vitest case: a $190K-draw year with a 10% bracket converts 0

## Recommendation

Do not merge `9ab5cad`. Keep it parked as the test-first record of the over-the-line rule. Open a follow-up
(next-batches-plan follow-ups) for "the flat fill counts the year's draw (`drawBelow = estTrad`)". Land the
over-the-line rule only with that fill fix, then judge the snapshot movers again. The aim is no earlier depletion
against both today and the WIP. Also consider letting the bracket card show when `plan.bracket` overrides the setting,
since "every row identical" reads as a bug to a user.

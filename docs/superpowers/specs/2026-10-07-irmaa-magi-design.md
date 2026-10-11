# IRMAA MAGI: count only the taxable part of Social Security (US): design

Status: approved by the owner, 2026-10-07 (found while reviewing the cliff plan's Task 6 stop). Lands after the cliff
plan (`docs/superpowers/specs/2026-10-07-cliff-plan-design.md`) and before Batch E. Plan:
`docs/superpowers/plans/2026-10-07-irmaa-magi.md`.

## 1. The defect

The engine carries one MAGI per year (`magiBase + conversion + traditional draws + realized gains`, `magiBase = otherA +
otherB + ss + inv.ordinary + inv.qualified`) and uses it for three programs. Their definitions differ in one place,
Social Security:

| Program | Statutory MAGI | Social Security counted |
|---|---|---|
| ACA premium tax credit | AGI + tax-exempt interest + **non-taxable Social Security** + excluded foreign income (26 U.S.C. 36B(d)(2)(B)) | all of it |
| Medicaid (MAGI-based) | the 36B definition (42 U.S.C. 1396a(e)(14)) | all of it |
| Medicare IRMAA | AGI + tax-exempt interest (42 U.S.C. 1395r(i)(4)(A); 20 CFR 418.1010) | **only the taxable part** (at most 85%) |

The engine's MAGI is right for the ACA and Medicaid and wrong for IRMAA. The IRMAA lookback (`magiHistory`, and
`magiHistoryA/B` on two returns), the IRMAA cost the solver prices (`irmaaAt`), the IRMAA lines (`magiThresholds`), the
conversion ceiling's IRMAA cap (`conversionMagiCeiling`) and lambda's IRMAA step (`lambdaEstimate`) all read the full
benefit. IRMAA MAGI is overstated by the untaxed benefit: at least 15% of benefits, up to all of them at low other
income. For a couple with $70,000 of benefits near the first tier that is $10,500.

Effects, all in one direction (overcharging): surcharges charged that a real return would not owe; conversions held
below an IRMAA cap that sits lower than it should; cliff-plan stay-unders under IRMAA lines placed too low (Roth spent
to avoid a surcharge that would not have been charged). The keep rule cannot catch it, because it scores with the same
wrong charge. The defect predates the cliff plan (Batch 2's IRMAA work), so it is fixed as its own change with its own
movers table, not inside the cliff-plan batch.

Not affected: the ACA premium and credit, the Medicaid line, the 400%-FPL guard, taxes (`taxFor` already computes taxable
Social Security itself), credits (never part of any MAGI), state rules (state tax never enters federal MAGI), rows'
`magiProxy` / `magiA` / `magiB` (they stay the ACA-definition MAGI, which is what the table shows as income for the
subsidy). Canada: nothing (no IRMAA).

## 2. Decisions (owner, 2026-10-07)

1. Fix it, after the cliff plan lands and before Batch E [agreed; no separate measurement first: the movers table is the
   measurement].
2. The engine keeps ONE MAGI scale for steering: the ACA-definition household MAGI (and per-return MAGI on two returns).
   IRMAA amounts are computed from IRMAA MAGI, and IRMAA lines and caps are translated into the engine's scale by an
   exact inverse, the way two-return lines are already translated with `toHousehold`. So `wd.magiCap`, the plan's "met"
   test (`realizedMagi <= line + 1`) and every other MAGI comparison stay as they are.
3. Tax-exempt interest and foreign-income exclusions are not modeled (no input): stated, as today.
4. The user's own prior-year entries (`irmaaMagiPrior1/2`) are already IRMAA MAGI (their info bubble says "adjusted gross
   income plus tax-exempt interest"): unchanged.

## 3. Design

**Primitives** (US only, just after `irmaaSurcharge` / `irmaaTierCeiling`; not in any shared region):
- `irmaaMagiOf(magi, ss, filing)`: `ss > 0 ? magi - ss + taxableSocialSecurity(ss, magi - ss, filing) : magi`. `magi -
  ss` is all other income, the same `otherIncome` `taxFor` passes (other income, gains with qualified dividends,
  traditional draws and conversions, ordinary investment income), so the result equals the return's AGI as `taxFor`
  builds it, before deductions. The `ss > 0` guard keeps a household without benefits bit-identical.
- `magiForIrmaaLine(line, ss, filing)`: the engine MAGI whose IRMAA MAGI is `line`. `f(x) = x + taxable(ss, x)` (with
  `x = magi - ss`) is continuous, piecewise linear and strictly increasing (slope 1, 1.5, 1.85, 1), with kinks where
  provisional income reaches the lower base, where the 50% part reaches half the benefit, where it reaches the upper
  base and where the 85% cap binds. The inverse evaluates `f` at the kinks, finds the segment and interpolates; below
  the first kink `f(x) = x`, above the last `f` has slope 1. `ss <= 0` or a non-finite line returns `line`. Round trip
  `irmaaMagiOf(magiForIrmaaLine(L)) = L` within 1e-6.
- `returnStatusA(dependents)`: `'hoh'` when a qualifying child exists, else `'single'` (the rule `taxFor`'s two-filer
  branch already uses; `taxFor` calls the helper instead of repeating it, number-neutral).
- Which benefit and filing: the return the MAGI comes from, THIS year (IRMAA is assessed on that return). Joint:
  `ssA + ssB`, `'mfj'`. One-person return (single, head of household, qualifying surviving spouse, survivor period,
  single-person mode): `ssA` (the survivor remap puts the survivor's benefit there), the year's `filing`. Two returns:
  A `ssA` with `returnStatusA(profile.dependents)`, B `ssB` with `'single'`. A missing `ssA` / `ssB` reads as 0
  (synthetic profiles in tests).

**Consumers:**
1. **The charge.** The year loop keeps `irmaaMagiHistory` (replacing `magiHistory`, which has no other reader: the
   implementer confirms) and `irmaaMagiHistoryA/B` beside `magiHistoryA/B` (which stay: rows' `magiA` / `magiB`). Both
   write sites (the provisional in-body write and the realized write after convergence) store `irmaaMagiOf` of the MAGI
   they store today. `healthcareCost`'s IRMAA reads them (parameters renamed `irmaaHistory`, `irmaaHistoryA`,
   `irmaaHistoryB`); `irmaaLookbackMagi` and `irmaaLookbackSplit` are unchanged in code.
2. **`irmaaAt`** (the solver's IRMAA estimate, two years on): `irmaaSurcharge(irmaaMagiOf(magiBase + trad + gain, ssH,
   filing) / irmaaGrowth2, irmaaFiling2(), year)`; two returns per person on `irmaaMagiOf(ma, ssA, statusA)` and
   `irmaaMagiOf(mb, ssB, 'single')`. The benefit conversion uses this year's filing; the tiers keep the charged year's.
3. **`magiThresholds`' IRMAA lines:** household `add(magiForIrmaaLine(edge * f * g, ssH, c.filing), ...)`; two returns
   `toHousehold(magiForIrmaaLine(cap, ssA, statusA), c.preMagiA, shareA)` and the same for B. Ids, labels and families
   are unchanged, so cliff-plan intents keep their meaning.
4. **`conversionMagiCeiling`'s IRMAA cap:** household `magiForIrmaaLine(irmaaTierCeiling(irmaaMagiOf(preConvMagi, ssH,
   filing), filing, year), ssH, filing)` (`Infinity` passes through); two returns the same per return before `allow`.
   It gains a `profile` argument (the year loop has it).
5. **`lambdaEstimate`'s IRMAA step:** both MAGIs of the step through `irmaaMagiOf` with the sample's own benefits and
   filing (`P.ssA + P.ssB`, `P.filing`; two returns `P.ssA` / `P.ssB`, `'single'`). This changes lambda's numbers on
   purpose (the cliff plan's "lambda's numbers are not changed" applied to that batch only).
6. **The scan statistic** `irmaaChecks` stores IRMAA MAGIs (`irmaaMagiOf` of the natural and the trial MAGI).

**Display:** the US healthcare callout (`Healthcare, ACA, Medicare & IRMAA`, US-only markup) says IRMAA uses Medicare's
MAGI, which counts only the taxable part of Social Security, unlike the ACA's. README IRMAA line; `CLAUDE.md` (the MAGI
iteration paragraph, the two-return paragraph, the per-year solver bullet: `irmaaMagiHistory`, the primitives, "one MAGI
scale, IRMAA translated"); US badge +1.

## 4. Tests and gates

- **New `tests/irmaa_magi.js`** (in `npm test`): hand-computed `irmaaMagiOf` (below the base, in the 50% band, in the 85%
  band, at the cap, every filing column); the round trip and monotonicity over a grid of lines, benefits and filings;
  engine cases: a single 70-year-old on a pension and Social Security whose full-benefit MAGI is over the first tier and
  whose IRMAA MAGI is under it pays no surcharge; the same per person on two returns; the IRMAA line of `magiThresholds`
  equals the inverse; the conversion ceiling rises by the untaxed benefit in the 85%-capped band; a household with no
  benefits is unchanged (property, plus the snapshots).
- **Hard rules.** Every snapshot scenario with no Social Security in any Medicare-lookback year is byte-identical. No
  standard snapshot scenario runs out earlier than at the cliff-plan tip; if one does: stop for the owner. Every mover
  re-explained with a dump/compare and a before/after table (IRMAA charged before and after, conversions, depletion, end
  value), `npm run snapshot:update` in the same commit. Test expectations that pinned the old charge are changed only
  with a hand-computed reason, listed in the commit.
- **Timing** (against the cliff-plan tip, interleaved, one process, medians): per path +5% for no-cliff households, the
  ACA early retiree +5% (nothing in the ACA path changes), planning ratio still at most 5.
- No shared-region or Canada change.

## 5. Out of scope

Tax-exempt interest and foreign exclusions (no input); the IRMAA appeal for a life-changing event (Batch E, E3); IRMAA
discounting and the conversion ceiling's tier year (Batch 5).

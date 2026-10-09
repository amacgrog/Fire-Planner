# E1c: self-employment (US): SE tax, the Solo 401(k), the self-employed health insurance deduction, QBI — design

Date: 2026-10-08. Owner decisions from the brainstorm of this date. Base: `ee7a789` on `claude/batch-3b-penalty-rules`
(US V124, Canada V59; E1b merged as `862f0bb`). US only; no shared-region change; Canada untouched.

## 1. Where this sits

E1 is split into E1a (done, V122) -> E1b (done, V124) -> **E1c (this spec)** -> E1d (one-time income treatments), plus
E1-CA later (E1a spec section 1). E1c makes self-employment a kind of income, for a partner's main income and for income
streams, with its taxes, its retirement plan and its health insurance.

**Generality rule (owner):** mechanics as pure functions over passed-in rules, country-neutral state keys, and a Canada port
section (section 10).

## 2. Today (`Planner_US.html` at `ee7a789`)

- Every main income is W-2 pay (`incomeA/B`, money fields): payroll tax (`payrollTax` ~8893, `wageFica` ~7880), the
  employer match and profit sharing, 401(k) / IRA / mega backdoor (`retirementContributions` ~8189), a pre-tax health
  premium per paycheck (`healthPremiumA/B`).
- Streams (E1b) are `other` (not earned) or `wages` (W-2), split by `streamAmountsForYear` (~9795); W-2 streams can fund
  the owner's 401(k) and IRA (`streamPlanContributions` ~8150) but carry no health premium (E1b backlog).
- Coverage: `acaEligibility` (~7040) puts a partner on the marketplace when not working, under 65, and not riding on a
  working spouse's plan (`employerCoversSpouseA/B`, default true, shown for every couple, married or not). Medicare starts
  at `max(65, retirement age)` (`healthcareCost` ~8737: `age >= 65 && !workingA`; the IRMAA lookback `medA/medB` ~10325:
  `age + 2 >= retireAgeA`).
- No SE tax, no Solo 401(k), no self-employed health insurance deduction, no QBI deduction anywhere.

## 3. Decisions (owner, 2026-10-08)

1. **QBI is modeled** (an early "drop it" was withdrawn). No new dollar input: it is computed from the self-employment
   income. **Every business is treated as a specified service trade or business** (no input; no employees and no property
   assumed): identical to a non-SSTB below the threshold, the conservative (smaller) deduction inside the range, and zero
   above it. The $400 minimum deduction is included as the law gives it to an SSTB (revised after the independent plan
   review, owner 2026-10-08): it needs $1,000 of QBI from qualified businesses, an SSTB is not one above the range, and
   inside the range only the applicable percentage of its QBI counts; so above the range the deduction is 0 (a non-SSTB
   with no wages would get $400 there: the SSTB assumption stays the conservative side).
2. **Main income:** a per-partner choice "W-2 / Self-employed" beside the income field (approach 1 of three).
3. **Health insurance while self-employed:** the ACA marketplace (or the other partner's plan), with the self-employed
   health insurance deduction inside the MAGI iteration, and Medicare from 65 with its premiums deductible.
4. **Coverage in a couple** uses the existing "Partner X's employer plan covers Partner Y" checkboxes (married or
   unmarried): ticked (default), a partner without employer coverage rides on the other's plan while that partner has
   employer coverage; unticked, they are on the marketplace. A married couple is not forced onto the W-2 plan (the default
   already does that; the box keeps the exceptions).
5. **W-2 streams get an optional yearly health premium**; above zero means that job provides the owner's coverage while
   the stream runs (pulls the E1b backlog item into E1c).
6. **An unticked box means no affordable employer offer for the partner:** marketplace with the premium tax credit and,
   when self-employed, the 162(l) deduction (today's behaviour for a retired partner; no existing number changes). The
   tooltip tells married users to keep it ticked when the employer offers affordable family coverage.
7. **Approach:** pure functions fed by a per-person self-employment total (section 6).
8. **After the independent plan review (owner, 2026-10-08):** (a) the QBI minimum follows the law for an SSTB (decision 1);
   (b) where the 162(l) deduction and the premium credit have no consistent answer (a band near the 400% line), the
   existing cliff rule applies: the pass log and the forced pass price on the realized deduction, the pass that overpaid
   least is re-run, the cost at the realized MAGI is charged with the refund to cash, and the deduction follows the premium
   charged (counted in `magiStats`); (c) the Roth-conversion bracket fill subtracts the 162(l) deduction; QBI stays out of
   it (it under-converts a little for the self-employed: the safe side, section 9).

## 4. Facts (primary sources; retrieved 2026-10-08)

- **QBI, 2026 (Rev. Proc. 2025-32, section 4.26):** threshold $403,500 (married filing jointly), $201,775 (married filing
  separately), $201,750 (all other returns); the phase-in range ends at $553,500 / $276,775 / $276,750, so the range is
  $150,000 joint and $75,000 otherwise (OBBBA section 70105 widened it; the width is a fixed statutory amount, the threshold
  is indexed). **Minimum deduction (Rev. Proc. 2025-32 section 2.12; IRC 199A(i) as amended by OBBBA section 70105):**
  $400 for an "applicable taxpayer": at least $1,000 of qualified business income from active qualified trades or
  businesses (199A(i)(2): material participation), for taxable years beginning after 2025; both amounts indexed for years
  after 2026 (cost-of-living from calendar 2025). A specified service business is not a qualified trade or business
  (199A(d)(1)(A)) unless taxable income is under threshold + $75,000 / $150,000, and then only the applicable percentage of
  its QBI counts (199A(d)(3)(A)); so for an SSTB the $1,000 test reads `ap x QBI` and above the range there is no minimum
  (26 USC 199A, Cornell LII text, retrieved 2026-10-08).
- **QBI mechanics (IRC 199A(a), (b)(2)-(3), (d)(3), (e)(2)):** deduction = min(20% x QBI, 20% x (taxable income before QBI
  less net capital gain, which includes qualified dividends)). Taxable income at or under the threshold: full. Inside the
  range, an SSTB's QBI, W-2 wages and property are multiplied by the applicable percentage `ap = 1 - (TI - threshold) /
  width`, and the wage limit's excess is phased in by `1 - ap`; with no W-2 wages and no property this gives `20% x QBI x
  ap^2`. Above the range: zero. QBI is reduced by the deductible half of SE tax, the self-employed health insurance
  deduction and deductible retirement contributions attributable to the business (Treas. Reg. 1.199A-3(b)(1)(vi)). QBI is
  below the line: it does not change AGI or MAGI.
- **SE tax (IRC 1401, 1402):** net earnings = 92.35% of net profit; none due under $400 of net earnings. Social Security
  12.4% on net earnings up to the wage base less the person's W-2 Social Security wages; Medicare 2.9% on all net
  earnings; the 0.9% Additional Medicare Tax applies to wages plus net earnings over the filing-status threshold (the
  threshold is used by wages first, Form 8959). Half the SE tax (excluding the 0.9%) is deductible from income (IRC
  164(f)). The Roth catch-up rule for high earners keys on FICA wages from the employer, which self-employment does not
  have, so it does not apply to a Solo 401(k) catch-up.
- **Solo 401(k) (IRS "One-participant 401(k) plans"; "Calculation of plan compensation for sole proprietorships";
  Publication 560):** plan compensation C = net profit less half the SE tax; the employer (profit-sharing) contribution at
  plan rate r is P with P = r x (C - P), so P = C x r / (1 + r) (25% gives 20% of C); the 401(a)(17) compensation limit
  caps the compensation the rate applies to, so P = min(C x r / (1 + r), r x compensation limit). Annual additions
  (deferral + employer + after-tax) at most min($72,000, compensation) for all of one person's businesses together (one
  employer: they are under common control); the deferral limit is per person across all plans (402(g)), shared with W-2
  jobs. All Solo 401(k) money comes from the household's own cash. Contributions do not reduce SE tax.
- **Self-employed health insurance deduction (IRC 162(l)):** premiums for medical insurance for the taxpayer, spouse and
  dependents (Medicare Part B, D and supplemental premiums qualify), limited to the earned income from the business
  (net profit less half the SE tax and less the deductible plan contributions made for the person); not allowed for a month
  the person is eligible to participate in a subsidized plan of an employer of the person or the person's spouse. With the
  premium tax credit the two depend on each other; Rev. Proc. 2014-41 allows an iterative computation, which the MAGI
  iteration already is.
- **Earned income for the ACTC (IRC 32(c)(2)):** net earnings from self-employment less the deductible half of SE tax.

## 5. Inputs and stored state (US)

### 5.1 Main income (per partner)

| Field | Key | Values | Default | Notes |
|---|---|---|---|---|
| Income type | `incomeKindA` / `incomeKindB` | `'wages'` (W-2) / `'self'` (Self-employed) | `'wages'` | two-button group beside the income field (`FIELDS`: `choice`, `manual: true`, `values`, `fallback: 'wages'`, `mcp: true`); B's hidden in single-person mode |

When a partner is self-employed:
- **Income** means business profit (net of expenses, before SE tax); the income tooltip says so.
- **Employer 401(k) match:** hidden and ignored by the engine.
- **Employer profit sharing:** shown; it is the plan rate 0-25 (tooltip: P = C x r / (1 + r); 25% gives 20% of profit less
  half the SE tax).
- **401(k) contribution, catch-up, IRA, mega backdoor:** shown, same meaning, Solo 401(k) (tooltip notes the plan must
  allow after-tax money for the mega backdoor).
- **Health premium per paycheck:** hidden and ignored by the engine.
- **"Partner X's employer plan covers Partner Y":** both stay visible in couple mode (revised from the brainstorm, where a
  self-employed partner's own box was to be hidden: the box now applies to any employer coverage of X, including a W-2
  stream with a premium). Tooltips: "Applies while Partner X has employer coverage (a W-2 main job, or a W-2 income stream
  with a health premium) and Partner Y has none. Ticked: Y is on X's plan (a self-employed Y then gets no self-employed
  health insurance deduction). Unticked: Y buys marketplace coverage, with the premium tax credit and, if self-employed,
  the deduction. If X's employer offers affordable family coverage to a spouse, keep it ticked: the marketplace would cost
  the full premium with no credit and no deduction."
- **Income-type tooltip:** "Self-employed: business profit, after expenses. It pays self-employment tax (half of it is
  deducted), gets the qualified business income deduction (treated as a specified service business with no employees),
  can fund a Solo 401(k) (contribution, profit sharing at the plan rate, after-tax money) and an IRA, and puts you on the
  ACA marketplace (or your partner's employer plan, see below) with the self-employed health insurance deduction;
  Medicare starts at 65."

### 5.2 Income streams (`DYN.incomeSources`)

- `kind` options become `[['other', 'Not earned'], ['wages', 'W-2 wages'], ['self', 'Self-employment']]`; the kind
  tooltip gains a sentence for self-employment.
- New `profitSharingPct` (0-25, step 0.5, default 0; "Profit sharing", short "Plan rate, %"), shown for `kind 'self'` and
  `contribute`; the match field (`matchPct`) shows for `kind 'wages'` only. `contribute` shows for `wages` and `self`;
  `deferralType`, `deferralPct`, `afterTaxPct`, `personalPct` show for both kinds when `contribute`.
- New `healthPremium` (money, yearly, today's dollars, default 0; "Health premium", short "Yearly; this job's plan"),
  shown for `kind 'wages'`. Tooltip: "What you pay for this job's health plan each year, before tax. Above zero means this
  job covers its owner (and the other partner, if the employer-plan box for the owner is ticked): no marketplace while it
  runs."
- `fresh()` gains `profitSharingPct: 0, healthPremium: 0`.
- `normalizeUsStreams`: `kind` is `'wages'` or `'self'` only if literally so, else `'other'`; `profitSharingPct` clamped
  0-25 (non-numbers 0); `healthPremium` a finite number >= 0, else 0.

### 5.3 Normalization and legacy

`incomeKindA/B` through the `FIELDS` enum guard (fallback `'wages'`). An old save loads as W-2 with no stream premium:
every new term in the engine is an exact zero (section 6.7). Not touched: the wizard (W-2 by default), the CSV export,
Canada.

## 6. Engine (US)

### 6.1 The year's self-employment, per person

- Year loop: `profitA = workingA && state.incomeKindA === 'self' ? state.incomeA * incomeFactor : 0`, and `wageA` is 0 for
  a self-employed partner (likewise B). So the salary's match, premium, payroll and W-2 contribution math see no pay.
- `streamAmountsForYear` adds `selfA` / `selfB` (kind `'self'`, the owner's window, stopping in the owner's death year like
  W-2; contributing ones listed in `contrib` with their kind) and `premiumA` / `premiumB` (the yearly premiums of active
  W-2 streams with `healthPremium > 0`, times `ctx.factor * medicalGrowth(year)` passed in as `ctx.premiumFactor`) and
  `coverA` / `coverB` (an active W-2 stream with a premium). `total` stays the sum of every included amount (the cash).
- `seA = profitA + selfA`, `seB = profitB + selfB` (one business per person). Cash `wages` adds `profitA + profitB` and keeps
  `extraIncome` (which includes `selfA/B`); the stream premiums leave cash like the salary premium.

### 6.2 `selfEmploymentTax(se, ssWages, year)` (pure)

Net earnings `ne = 0.9235 x se`; if `ne < 400`, everything is 0. Social Security `0.124 x min(ne, max(0, base - ssWages))`
(`base` = the wage base used by `wageFica` for `year`; `ssWages` = the person's W-2 Social Security wages: salary less its
premium plus W-2 stream pay less stream premiums), Medicare `0.029 x ne`. Returns `{ tax, half, ne }` in a module scratch
(`half = tax / 2`). `payrollTax` gains `seA, seB` (and the stream premiums, `streamPremiumA/B`, taken off `streamWagesA/B`)
and adds both partners' SE tax; its Additional Medicare Tax base becomes wages + `ne` for each person (household-wide
against the filing threshold, as today). `ne` and the 0.9% are not part of `half`.

### 6.3 `soloPlanContributions(...)` (pure, scratch output, no allocation)

Called from `retirementContributions` after `streamPlanContributions`, only when `seA + seB > 0`. Per person, with C = se -
half (the person's total) and `compLimit` = `PLAN_LIMITS.compensation x limitFactor`:
1. **Deferral:** the person's deferral and catch-up rooms left after the salary and W-2 streams (`STREAM_ROOMS`). The
   self-employed main income first (`k401PctA` of the base room, `catchupPctA` of the catch-up room, as the salary reads
   them today), then self-employment streams in list order (`deferralPct` of base + catch-up room left), each at most the
   compensation left (C less deferrals so far). Type: `state.k401Type` for the main income, the stream's `deferralType` for
   streams; the catch-up follows the same type (no Roth catch-up rule).
2. **Profit sharing:** per source i with profit share `C_i = C x se_i / se` and rate `r_i` (`profitSharingPctA` for the main
   income, the stream's `profitSharingPct`): `P_i = min(C_i x r_i / (1 + r_i), r_i x compLimit x C_i / C)`.
3. **One annual-additions room** for the person: `min(annualAdditions x limitFactor, C - sum P) - base deferrals`
   (catch-up outside it); the deferrals are already within it; `allocatePlanRoom` limits `sum P` to the room (in source
   order).
4. **After-tax:** main income `megaPctA` (when `state.megaBackdoor`), streams `afterTaxPct`, of the room left, each at most
   `max(0, C - sum P - deferrals - catch-ups)`.
5. **IRA:** compensation for the IRA = W-2 pay + (C - traditional Solo money); room = the person's IRA limit less what the
   salary and W-2 streams put in, at most that compensation less the same. The main income's `iraPctA` first (when
   self-employed), then streams' `personalPct`. Type `state.iraType`.
6. **Where it goes:** deferral to the person's 401(k) by type; profit sharing to the traditional 401(k); after-tax to the
   Roth 401(k); IRA by type (`ACCOUNT_SLOTS`). **All of it leaves cash:** it is added to `traditionalContrib` /
   `rothContrib` (employee totals), never to `employerContrib`. Returns, per person, `planCutA/B` = traditional deferral +
   profit sharing (the section 404 plan deduction) and `iraCutA/B` = the traditional IRA (section 219). Both are deducted
   from income; only the plan part reduces the 162(l) cap (earned income under 401(c)(2)) and QBI (Treas. Reg.
   1.199A-3(b)(1)(vi)); the IRA reduces neither (revised after the independent plan review).

### 6.4 Tax profile, `taxFor`, ACTC, state

- `buildTaxProfile` gains `seNetA/B = max(0, se - half - planCut - iraCut)` (the AGI part), added to `otherA/B` after
  today's terms (so MAGI, `returnMagis` and the survivor remap carry it; the remap moves B's to slot A like `wageB`), and
  puts on the profile `seNetA/B`, `sePlanNetA/B = max(0, se - half - planCut)` (the 162(l) cap and the QBI base before
  162(l)) and `seEarnedA/B = se - half` (ACTC).
- `taxFor`: the state's `sources.wages` adds `seNet` less the 162(l) deduction on the owner's return (joint: both);
  `childCredits`' earned income adds `seEarnedA (+ seEarnedB)`; the 162(l) deduction (6.5) and QBI (6.6) as below.
- The optimizer profile literals carry none of these keys (read as 0, as today). The Roth-conversion bracket fill
  (`solveRothConversionTo`) subtracts `seHealthA + seHealthB` from the `other` it reads (decision 8c); it has no QBI term.

### 6.5 Coverage and the self-employed health insurance deduction

- **Coverage** (built inline as the year-loop consts `employerA/B` plus the pure `streamCoverBits` for the year two ahead,
  rather than one `coverageOf` helper: revised after the independent plan review; E1-CA reuses the same two pieces; it
  replaces the `!workingX` tests in `acaEligibility` and the Medicare gate):
  `employerX = (workingX && incomeKindX === 'wages') || coverX`. A partner without employer coverage is on the other's
  plan when the other has employer coverage and the other's "covers" box is ticked; else on the marketplace (under 65) or
  Medicare (65 or over). `acaEligibility` and `medicareEligibleA/B` read `employerX` where they read `workingX`; the IRMAA
  lookback `medA/medB` tests the same for the year two ahead (`age + 2 >= 65`, employer coverage then: the main W-2 job
  still working at that age, or a stream covering the owner at that age). For W-2 main jobs and no stream premiums every
  test reduces to today's.
- **Deduction, per self-employed person:** allowed when the person has no employer coverage and is not on the other
  partner's plan. Deductible premiums: the household's marketplace premium after the credit plus Medicare (`medicareYearly`
  shares) and IRMAA, for the people the deduction may cover (the person, a spouse, the children). Cap: `sePlanNet` (`se -
  half - planCut`) of that person. Joint return: `min(deductible premiums, capA + capB)` over the persons allowed. Two returns: each
  person's own half (A's half includes the children, as `healthcareCost` splits it), capped at their own cap.
- **Inside the MAGI iteration:** each pass computes `healthcareCost` from its MAGI estimate, then sets
  `profile.seHealthA/B` (next to `profile.medicalExpense`, which then excludes the deducted premiums so they are not also
  counted toward the 7.5% itemized floor). `taxFor` subtracts `seHealth` from federal income, from the state's
  `sources.wages` on the same return, and from QBI. The realized MAGI is lower by it; the convergence test gains the
  estimated against the realized deduction (`MAGI_ITER_TOL`, the same damping and forced pass); pass 0 is seeded from the
  previous year's deduction (`prevSeHealthA/B`, written only after the year converged, so no `scalarSnapshot` entry is
  needed). The pass log's "realized" cost and the forced pass's cost are priced on the realized deduction, and the year's
  recorded MAGI is `magiBase0 - (seRealA + seRealB) + draws` (decision 8b). Where no consistent answer exists (a single
  person near the 400% line with net self-employment of roughly $69,000-$81,000: below the line the deduction pushes MAGI
  over it, above it pulls MAGI under) the forced pass decides, as for the Medicaid and 100%-of-FPL step-downs.
  `conversionMagiCeiling` and `magiThresholds` are unchanged.

### 6.6 `qbiDeduction(qbi, taxableBeforeQbi, netCapitalGain, filing, yearIndex)` (pure)

`qbi = sum over the return's persons of (sePlanNet - seHealth)`, floored at 0. Threshold and width from a
`QBI_LIMITS` row (2026: `{ threshold: { joint: 403500, other: 201750 }, width: { joint: 150000, other: 75000 }, minimum:
400, minimumQbi: 1000 }`, filing family `joint` for `mfj`, `other` for `single`, `hoh`, `qss` and each return of two
filers; threshold and the minimum amounts times `taxIndexFactor(yearIndex)`, width fixed). `ap = clamp(1 - (TI -
threshold) / width, 0, 1)`; deduction `= min(0.2 x qbi x ap^2, 0.2 x max(0, TI - netCapitalGain))`; if `ap x qbi >= minimumQbi`,
at least `minimum`, after the cap (IRC 199A(i); an SSTB's QBI counts only at the applicable percentage, and above the
range `ap = 0` gives no minimum). Federal only: subtracted from the ordinary taxable income after
the standard or itemized deduction (the gains stacking is unchanged), in each branch of `taxFor` (joint: one; single: one;
two filers: each return its own) and in the lagged federal pass. Not in MAGI, not in the state base.

### 6.7 Exactness and speed

With every partner on W-2, no `self` stream and no stream premium: `profit`, `self`, `se`, the SE tax, the Solo money,
`seNet`, `seHealth`, QBI and the stream premiums are exact zeros added after today's terms (or skipped by an `se > 0` /
`premium > 0` test), and `employerX` reduces to `workingX`. Every existing snapshot entry stays byte-identical. A year
with no self-employment costs one test of `seA + seB`.

## 7. Tests and gates

- `tests/self_employment.js` (new, in `npm test`, hand-computed): SE tax below and over the wage base, with and without W-2
  wages; the $400 floor; the Additional Medicare Tax on wages + net earnings; the half deduction; Solo 401(k): deferral room
  after a salary and a W-2 stream, P at 25% (= 20% of C) and 10%, the compensation limit, the shared annual-additions room,
  after-tax capped, the IRA room on self-employment compensation, no Roth catch-up, cash out and account slots
  (`__test_accountTrace`); stops at the retirement age and in the death year; a legacy household identical.
- `tests/se_health.js` (new): coverage: a self-employed partner with the box ticked and unticked, a retiree with a stream
  premium, Medicare at 65 for a self-employed partner still working, the IRMAA lookback; 162(l): joint, two returns, the
  cap, the spouse-plan disallowance, no double count in the medical floor; a single self-employed person near the 400%
  line: the iteration converges and matches a hand-worked fixed point; stream premium pre-tax for income and payroll tax.
- `tests/qbi.js` (new): below the threshold, inside the range (`ap^2`), above it, the taxable-income cap with gains, the
  $400 minimum, joint against two returns, indexing of the threshold but not the width.
- `tests/legacy_state.js`: bad `incomeKindA`, a stream `kind 'self'` with out-of-range `profitSharingPct` and a negative
  `healthPremium`. Proof that only the new keys change, then `--update`.
- `tests/field_registry.js` passes (the new `FIELDS` entries); `snapshot_ui.js --update` for the US (new controls, MCP
  schema gains `incomeKindA/B`).
- `test_self_employment.js` (Playwright, committed, not in CI): fields hide and show with the income type and stream kind;
  values reach `window.fireProjectionRows`; 390 x 844 no horizontal scroll.
- New snapshot scenarios (new entries only): A self-employed with B on W-2, box ticked; the same, box unticked; a single
  self-employed person near the ACA 400% line; a self-employment side-business stream in early retirement; a Solo 401(k) at
  25% with the mega backdoor; a self-employed person working past 65 (Medicare); a W-2 stream with a premium in early
  retirement.
- Gates: no existing snapshot entry moves in any commit; `npm run check:shared` passes (no shared change);
  `tests/aca_magi_iteration.js`, `tests/cliff_plan.js`, `tests/two_return_magi.js` green; timing
  `tests/bench_runs_interleaved.js --rounds 21` (+5% allowed) at commits 2, 5 and the tip, `tests/bench_solver.js --rounds
  31` recorded as measured; one recorded (not gated) timing of an ACA early retiree with a side business.

## 8. Commits

1. Inputs: `incomeKindA/B`, stream kind `self`, `profitSharingPct`, `healthPremium`, `normalizeUsStreams`, visibility and
   tooltips (the engine does not read them yet; legacy and UI snapshots updated; no number change).
2. Coverage helper and the stream premium (6.1 premium/cover, 6.5 coverage); existing entries byte-identical; new scenario
   (W-2 stream with a premium).
3. SE tax, payroll, profile, state, ACTC (6.1, 6.2, 6.4); existing byte-identical; new scenarios.
4. Solo 401(k) (6.3); existing byte-identical; new scenario.
5. The 162(l) deduction in the MAGI iteration (6.5); existing byte-identical; new scenarios.
6. QBI (6.6); existing byte-identical; US V125.
7. Docs: README, `CLAUDE.md` (income kinds, coverage helper, SE functions, the profile's new keys), E1c notes in
   `docs/next-batches-plan.md`.

## 9. Not modeled

- QBI: every business is a specified service business; no employees (no W-2 wages paid) and no qualified property; no
  REIT dividends or publicly traded partnership income; a state that starts from federal taxable income (and so also
  allows QBI) is not given it.
- S corporations, partnerships, business losses and net operating losses (profit is at least 0).
- Social Security benefits rising with self-employment earnings (as for W-2 earnings).
- A partner who turns down an affordable employer offer from the other partner's employer (decision 6).
- Employer coverage of a partner who is not a spouse being taxable to the employee.
- The 162(l) deduction for long-term-care insurance premiums; Medicare late-enrollment penalties.
- The IRA deduction phase-out for someone covered by a workplace plan (a Solo 401(k) counts; not modeled for the salary
  either).
- One person's two self-employment sources with different plan rates: each uses its own rate within the person's one
  annual-additions room.
- A SEP IRA or SIMPLE IRA (the Solo 401(k) is modeled).
- QBI in the Roth-conversion bracket fill (decision 8c: the fill sees the 162(l) deduction but not QBI, so it
  under-converts a little for the self-employed).
- The row's `income` (display) is income before the 162(l) deduction; MAGI (`magiProxy`) is after it.

## 10. Canada port (E1-CA)

Carries over: the coverage pieces (`employerX`, `streamCoverBits`) (Canada has no marketplace: coverage only decides the private premium), the stream
kinds and keys, the per-person self-employment split. Canada supplies: both halves of CPP/QPP for the self-employed (the
employer half deducted, the employee half a credit), EI only by opt-in, earned income for RRSP room from self-employment,
private health premiums as a business expense or medical expense (no 162(l) analogue), an individual pension plan as the
Solo 401(k) analogue, and no QBI.

# 7L design spec: Canada's income-tested benefits

Status: draft for owner review (2026-10-05). Branch `claude/batch-7l-benefits`, base
`origin/claude/batch-3b-penalty-rules` (f3668b7). Canada only; the US engine and every shared region stay
byte-identical. Verification record: the 7L notes in `docs/next-batches-plan.md`, the reviewer hand-off
`docs/7l-benefit-catalog-for-verification.md`, the ESDC tables in `docs/sources/`.

## Goal

Model the cash benefits a Canadian household receives that depend on income, as tax-free payments with their own
output lines, so projections show them and the withdrawal solvers price lost benefits (GIS clawback above all) as a
cost of withdrawing. Success: every figure traces to a primary source (or is flagged secondary and on the backlog);
GIS and Allowance reproduce the ESDC tables within one dollar a month; the CGEB reproduces the statute; survivor
symmetry holds; `npm test` passes at every commit.

## Owner decisions that bind this spec

1. **No new inputs.** Inputs used: each partner age, income, wages, the 7A children list, province, rent, property
   tax, couple or single.
2. **Scope.** Generic mechanisms for every province in 7L. Data rows in 7L: the federal programs plus ON, BC, AB and
   QC. The other provinces' rows are 7M. Named gaps: the Ontario energy component, the Northern Ontario Energy Credit,
   disability programs, social assistance.
3. **Timing.** GIS, Allowance, CCB, CGEB and the provincial benefits use same-year income. This is an engine
   convention, stated as such; the legal tests use the prior-year return.
4. **OAS: the inputs stay, the 75-plus step and the default change (revised 2026-10-05).** The `oasMonthlyA/B`
   inputs are kept (enter 0 for no OAS) and are entered in today's dollars, so they scale with plan inflation as
   before. The planner applies the statutory 10 percent increase from age 75 automatically (ESDC maximums 762.50 at
   65 to 74 and 838.75 at 75 and over, October to December 2026: the ratio is exactly 1.10 in every quarter checked
   since July 2022, 1.00 before). The default becomes the 2026 maximum, 762.50. Deferral increases (0.6 percent a
   month, up to 36 percent at 70) stay manual: the tooltip tells the user to raise the figure. **The default and the
   75-plus factor are quarterly-indexed ESDC figures and must be updated when tax figures are next updated for 2027**
   (comment in the `BENEFIT_RULES.oas` row and a note in `docs/next-batches-plan.md`). Partial residence and the
   timing of the 75-plus step within the year are not modeled.
5. **OAS recovery tax unchanged.** Same-year, pre-withdrawal, no discretionary-draw feedback (measured effect: none
   under about 2 million of registered money, +7.6% to +13% of end assets at 3 to 5 million).
6. **Net-tax design (approved).** Canada `taxFor` returns `incomeTaxCA(...) - benefitsFor(...)`. Benefits are tax-free
   cash, so net cash is identical to a separate inflow; the solvers see the full marginal cost. The engine also
   reports gross tax and benefits separately.

## Data model

`BENEFIT_RULES` between `// BENEFIT_RULES:begin` and `end` comments, pure literals, one row per program. Row kinds
(each a generic evaluator; adding a province is data only):

| Kind | Programs |
|---|---|
| `gisAllowance` | GIS, Allowance, Allowance for the Survivor: piecewise per household situation (single, spouse of an OAS pensioner, spouse without OAS, couple with Allowance, survivor), top-up, employment exemption |
| `childSchedule` | CCB, ACFB (base and working), BC Family Benefit, Ontario Child Benefit, Quebec Family Allowance, and later NS, NL, PEI, NB: per-child amounts by age band, reduction rates or step schedule |
| `familyCredit` | CGEB, Ontario Sales Tax Credit, and later SK, NS, NB, NL, PEI: base amounts per adult, spouse, child, reduction rate over a threshold, single supplement |
| `seniorSupplement` | Alberta Seniors Benefit, and later SK SIP, Ontario GAINS, NB, MB 55 PLUS, BC: amount or phase-out reading the GIS result |
| `occupancyCredit` | Ontario Energy and Property Tax Credit (occupancy part), senior homeowners grant: from rent and property tax |
| `quebecCredits` | Solidarity credit (housing and QST components), work premium |

Every row: `status`, `source` (URL), `asOf`, `verified` per family (primary or secondary), explicit `indexing`
flags per family (`quarterlyCpi` for GIS and OAS-linked amounts, `julyCpi` for CCB and the CGEB, or unindexed; how
each is approximated is stated in the row), `dependsOn` (for example `gis`, `oas`), `ageRule`, and the child cutoff
age. `compileBenefits` resolves a row once per code. A generated `docs/benefits-rules.md`
(`scripts/gen-benefit-rules.js`, `npm run gen:benefits`) is checked by `npm test`; `tests/benefit_rules.js` is the
coverage test (every program present, every field typed, thresholds increasing, `dependsOn` resolves).

## Formulas (2026 figures, verified unless marked)

- **GIS** (ESDC Oct to Dec 2026, annual dollars, y = annual income excluding OAS): single 11,549.88 minus 50% of y;
  top-up 2,116.92 minus 25% of y over about 2,030. Spouse of an OAS pensioner (combined y) 7,626.84 minus 25% of y;
  top-up 599.88 minus 12.5% over about 4,050. Spouse without OAS: 11,549.88 flat to about 9,190 then minus 25%;
  top-up 2,116.92 minus 12.5% over about 4,050. Tables 4 and 5 (Allowance) are fitted piecewise. Income: net income
  less OAS, capital gains at 50%, TFSA excluded; employment income exempt on the first 5,000 and half of the next
  10,000 (secondary, backlog).
- **CGEB** (Bill C-19, ITA 122.5(3.005)), per year: 445 + 445 for a spouse + 234 per child (445 for the first child of
  a single parent) + a single supplement of the lesser of 234 and 2% of income over 11,564, minus 5% of income over
  46,432.
- **CCB**: 8,157 per child under 6, 6,883 for 6 to 17; reduction bands from 38,237 and 82,847 (CRA).
- **Provincial rows**: as listed in the 7L notes; unverified rates stay marked secondary.

## Engine

- `benefitsFor(profile, gains, trad)` evaluates in a fixed order: GIS and Allowance (also yields flags: receives GIS,
  OAS in payment), then `seniorSupplement` rows, then `childSchedule`, `familyCredit`, `occupancyCredit` and Quebec.
  Allocation-free: results go to a module-level scratch object; early exit when no benefit can apply. Hot path rules
  as for `taxFor`.
- Profile gains: wages (work income), OAS received, ages, the 7A children (`dependentsInYear`, survivor remapped:
  children stay with the survivor), couple or single, province. `buildTaxProfile` carries them; profiles built
  elsewhere read as none.
- `oasAgeFactor(age)` (1.10 from age 75) multiplies the OAS input in `cppAndOasIncome`. The survivor swap (greater of the two OAS
  amounts) is unchanged.
- Year rows: `benefits` (total) and one field per benefit; `tax` stays gross. The cash flow adds benefits as
  inflows; the Sankey shows each as its own line; the projection table and export gain the columns.
- Anything assuming tax is never negative (effective-rate displays, Sankey tax node, totals) is checked.
- Hook for 4A: a `gisIncomeRoom` helper (room under the GIS cutoff), and rows in the cliffs register for GIS, the
  CGEB and the CCB phase-outs.

## Tests

`tests/benefit_rules.js` (coverage); an ESDC-table checker (every row of tables 1 to 5 within 1 dollar a month of the
formula); hand-computed cases for the CGEB (statute), CCB, ACFB, Ontario and Quebec programs, each citing its page;
`tests/survivor_symmetry.js` extended; engine cases (GIS makes a TFSA draw cheaper than an RRSP draw; a child adds the
CCB). Canada snapshots update by intent, US snapshots byte-identical, UI snapshot flake re-run alone. Interleaved
timing comparison against the previous commit. Hand-computed literals carry the arithmetic in comments.

## Commits (each passes `npm test`)

1. `BENEFIT_RULES`, generator, coverage test, no behavior change.
2. GIS and Allowance, OAS by age band, the net-tax plumbing and the outputs.
3. CCB and CGEB with the children plumbing.
4. Provincial rows for ON, BC, AB and QC.
5. Docs: CLAUDE.md, README, 7L notes, version V42.

## Named gaps and risks

Same-year income instead of the prior-year return; partial-residency OAS and OAS deferral; the Ontario energy
component and Northern Ontario credit; disability benefits; provincial rows for the other provinces (7M); BC Senior
Supplement and several rates still on the verification backlog; the OAS clawback ignoring discretionary draws;
quarterly indexation approximated by plan inflation; the OAS and GIS bands must be updated for 2027.

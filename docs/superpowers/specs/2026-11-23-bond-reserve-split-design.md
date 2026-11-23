# Bond reserve: held from the start, and a bridge reserve (design)

Status: design, approved in conversation 2026-11-23 (owner). Plan to follow (`superpowers:writing-plans`).

## Why

A real household (a single 59-year-old retiring this year, 5 bond years) was run under the "Like 1929–44" crash preset. Bonds
looked harmful: 0 bond years ran out at 93, 5 at 91, 8 at 90. With the same crash at 64, bonds helped steadily (95 → 98).
The cause is how the reserve is filled (`planBondLadder` / `rotateIntoBondLadder`, `src/shared/core/withdrawals/bond-ladder.js`):

1. **A plan that retires in year 0 builds its reserve after retirement.** `rotationEndYear` is `max(0, ceil(bondYears) - 1)`
   when `retirementYear` is 0, so the ladder moves stocks into bonds over the first `bondYears` retired years. Under a crash at
   retirement that sells stocks at the bottom (her stocks went 846k → 45k while bonds went 77k → 387k). The maintained reserve
   (`stdBondTarget`, the bucket trim) also only starts after that window.
2. **Any move runs after the year's growth** (`growBalances` comes before `rotateIntoBondLadder`), so even a year-0 move would let
   year 0's return hit the full stock balance.
3. **The reserve fills traditional first, then Roth, then taxable as a last resort.** Before 59½ the penalty-aware orders draw
   only penalty-free money, so an early retiree's reserve sits in a 401(k) they cannot spend from: in a down year they sell
   taxable stocks anyway, which is what the reserve is meant to prevent.

Today a person who already holds bonds has no way to say so, and an early retiree has no way to put their reserve where they
can reach it.

## Goals

- A person can say the reserve is **already held** at the plan's start (no sale, no tax), or have it **built** over the years
  before retirement (today's behavior).
- A plan that retires in year 0 always starts with its reserve held, in place before year 0's returns.
- US: an early retiree can hold a **bridge reserve** in the brokerage account, spendable before 59½, on top of the
  retirement-account reserve.
- US: the retirement-account reserve's split between traditional and Roth is a setting.

## Non-goals

- No change to how the retirement reserve is drawn: the down-year and up-year orders, the penalty-aware orders and the standard
  cascade keep their steps (`cash`, `bondTaxable`, `bondTraditional`, `bondRoth`, ...). The one draw change is the bridge's
  down-year step in the standard order (below).
- No bridge reserve in Canada: an RRSP can be drawn at any age (no early-withdrawal penalty), so the problem it solves does not
  exist there. Canada gets the held-from-start choice and the year-0 fix only.
- No change to the bond return, bond yield or the taxation of bond interest.

## Anti-goals

- **Existing saves must not change by a cent unless the person changes a setting** — except a plan that retires in year 0 with
  `bondYears > 0`, which is the bug being fixed and changes on purpose (golden and snapshot updates for those cases only, named
  in the commit).
- The bridge must never sell brokerage stocks after it is first filled: that is a taxed gain and, before 65, raises the ACA
  MAGI (subsidy) in exactly the bridge years.
- The bridge must never quietly reach into traditional or Roth money when the brokerage account is too small.

## The settings

Sidebar, the bond area (US; Canada has only the first and third):

```
Retirement bonds              [ 5 ] yrs      (today's "Bond reserve size"; key bondYears kept)
  Traditional ●────────○ Roth   100 / 0      (US: bondTradPct, 0-100, default 100)
Bridge bonds (brokerage)      [ 0 ] yrs      (US: bridgeBondYears, 0-15, default 0)
Bond reserve   (•) Build before retirement   ( ) Start with it held   (bondStart: 'build' | 'held', default 'build')
```

- `bondStart` default `'build'` keeps old saves identical. A plan whose retirement year is 0 behaves as `'held'` whatever the
  setting (there are no years before retirement to build in); the UI says so next to the choice when it applies.
- `bondTradPct` 100 reproduces today's fill order exactly (traditional, then Roth when traditional runs out, then taxable as the
  last resort). See "Retirement reserve placement".
- Each new field: markup, `defaults`, one `FIELDS` entry with clamps / enum guard in `normalizeState` (CLAUDE.md "Inputs").
  Descriptors under ~70 characters; the detail goes in info bubbles written from what the engine does.

## Engine behavior

### Held from the start (`'held'`, or any year-0 retirement)

- At the start of year 0, **before** `growBalances`, both reserves are placed at their full targets: the retirement reserve per
  its placement rule, the bridge from the brokerage account. It is a relabeling of money already held: **no sale, no gain, no
  tax, no MAGI**. Taxable bonds take the brokerage account's basis share (the same fraction of basis as of value) — builder's
  call on the exact basis split, as long as it is a pure relabel.
- The build window does not run (`rotateIntoBondLadder` does nothing); the maintained reserve rules (the standard mode's
  `stdBondTarget` trim / refill / surplus routing, the bucket mode's up-year refill and trim) apply from year 0 instead of after
  `rotationEndYear`.
- The pre-retirement years of a `'held'` plan that retires later hold the reserve too (the person says they own it now). The
  retirement reserve's target during those years is its retirement-year size, as the ladder sizes it today (`ladderTarget`), and
  becomes the maintained `reserveSpend * years` target from retirement on — builder's call whether the maintained rules start
  at year 0 or at retirement in a later-retiring held plan, as long as the reserve is not rebuilt or sold down in between.

### Build (`'build'`, retirement year ≥ 1)

Today's ladder, unchanged for the retirement reserve (with its placement rule, below). The bridge is built alongside it over the
same window, sized from the larger of `bondYears` and `bridgeBondYears` (so a bridge with no retirement bonds still gets a
window; `bondYears` alone sets it whenever the bridge is 0, as today), **from the brokerage account only** (a real, taxed sale, as the ladder's taxable step is today), to its full target
by `rotationEndYear`.

### Retirement reserve placement (US)

Target split by `bondTradPct`: `t = target * pct`, `r = target - t`. Fill traditional toward `t` and Roth toward `r`; whatever
one side cannot hold (no money left there) goes to the other; what neither can hold falls to taxable as today's last resort. At
100% this is exactly today's order (the anti-goal). The split steers the **fill and the refill** (`refillBondReserve`) only.
The **trim** (`trimBondReserve`) stays pro rata across the buckets as today, and `routeSurplus` keeps putting the retirement
reserve's surplus top-up into `bondTaxable` as today (decided after the builder check, 2026-11-23: a split-steered trim would move
every existing save that has conversions and a reserve, since a conversion leaves `bondRoth > 0` at 100%). A Roth conversion
keeps moving bond money traditional → Roth as it does now.

### The bridge reserve (US)

- **Size:** `bridgeBondYears` years of the retirement-year expense, sized as the ladder sizes its tranches (`projectedExpense`).
- **Where:** `bondTaxable` only.
- **Filled once:** at the start (held) or by the build window (build). After that it is **never refilled by selling stocks**.
  Surplus cash may still go into it through `routeSurplus`, as surplus already goes to the reserve, but only during the bridge
  years.
- **Spent:** the bucket orders already take `bondTaxable` early in a down year. Whenever a draw takes from `bondTaxable`, the
  **bridge's part goes first**, then the retirement reserve's taxable bonds. **The standard order gains one step (owner,
  2026-11-23):** in a down year (`stockReturn < 0`), the bridge is drawn before brokerage stocks (`takeStockTaxable`). The plain
  projection never has a down year (a fixed return), so its numbers do not change; the step matters in a market scenario run
  with `order: 'standard'`. Outside the bridge, and in up years, the standard order is unchanged.
- **Ends:** the first year in which every living partner is 59½ or older (decided after the builder check: Rule of 55 never
  frees an IRA, and a 72(t) account cannot be drawn beyond its schedule, so neither ends the bridge early). A partner who has
  died does not count. That year, any bridge bonds left move to brokerage stocks (a relabel with no tax event, as
  `trimBondReserve` treats a taxable trim today). From then on only the retirement reserve is maintained.
- **The bridge is not part of the maintained retirement target.** The trim, refill and surplus routing for the retirement
  reserve must not count the bridge's `bondTaxable` as filling its target, and must not trim the bridge away. This needs the
  bridge tracked as its own balance (a new `bal` field, e.g. `bridgeBonds` with its basis, or a split of `bondTaxable`) — builder's
  call, with the MAGI snapshot rules (a new `bal` field is rewound automatically; a new scalar goes in `scalarSnapshot`).
- **Too small to fill:** fill what the brokerage account (and cash above the cash reserve) allows, and report the shortfall on
  the result (e.g. `bridgeShortfall`, the dollars or years not covered), shown as a line on the page.

### Where it applies

Every run: the plain projection, the historical backtest, Monte Carlo, market scenarios and every plan search, since they share
`runProjection`. Both run modes (standard and bucket). Canada: only the held-from-start choice and the year-0 fix.

## Approaches considered

1. **Hold the reserve from the start for year-0 retirees, plus a held/build choice and a US bridge reserve (chosen).** Fixes the
   crash-at-retirement result, lets a person say they own bonds today, and gives an early retiree spendable bonds.
2. **Keep the build and skip down years.** Smaller, but a person retiring into a crash still holds almost no bonds, and it never
   models someone who already owns them. Rejected.
3. **Move every reserve build ahead of the year's growth.** Consistent, but changes every plan with a build for little gain.
   Rejected.

Placement alternatives the owner weighed: spendable-first automatic order; a per-reserve account dropdown; pro-rata. Chosen:
two reserves (bridge in brokerage, retirement split by a slider), owner's design. At the bridge's end, a swap that kept the
leftover as retirement-account bonds was considered and dropped (it would hold extra bonds for decades, the opportunity cost
that started this); the retirement bonds setting is the single number for after 59½.

## Docs, tests, versions

- `docs/architecture/engine.md` (the ladder, the maintained reserve), `us-accounts.md` (the bridge and penalty-free), README feature
  list, the info bubbles. Version badges in both planners.
- Vitest: year-0 held places the reserve before growth (a crash year-0 case: bonds untouched by the stock drop); `'build'` with
  defaults is byte-identical to today on a sample of saves; the split at 100% equals today; the bridge fills from brokerage only,
  is never refilled by a sale, ends at penalty-free and moves the rest to stocks; the shortfall is reported; Canada held/build.
- Playwright: the new fields change `fireProjectionRows`; mobile width.
- Golden / snapshots: only year-0 retirement cases with `bondYears > 0` move; the commit names them.

## Left to the builder

The exact `bal` representation of the bridge, the basis split of a held relabel, where in the year body the start-of-year
placement runs (it must precede `growBalances` and sit inside what the MAGI passes rewind), and how the UI words the year-0
"always held" note.

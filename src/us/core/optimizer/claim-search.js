// The US Social Security claiming-age search (SS claiming optimizer PR 3): the status, the ranking, the grid, the dedupe, the re-measure and the longevity row

import { pct } from '../../../shared/core/format/numbers.js';
import { simulateWith } from '../../../shared/core/projection/runs.js';
import { pricingContextFor } from '../../../shared/core/projection/run-source.js';
import { drainSteps } from '../../../shared/core/analysis/spending-room.js';
import { ssClaimAxes, ssClaimVariant, ssStreamKey } from '../income/social-security.js';
import { US_OBJECTIVES } from './objectives.js';

// load-time: a frozen literal list; reads nothing.
// The longevity row's end ages (spec 6, owner decision 4).
export const CLAIM_END_AGES = Object.freeze([80, 85, 90, 95]);

// What the card does with these axes (spec 7.4), before any run: 'none' (hidden: no Social Security entered), 'collecting'
// (hidden: every benefit with an amount is already collecting), 'atClaim' (the age does not change any amount left to vary),
// 'nothing' (no axis varies, or the grid is one cell and the current choice is it), else 'ok'. A one-cell grid beside an own
// benefit in `atClaim` reads 'atClaim': entering that amount at full retirement age is what would give a choice.
export function claimStatus(axes) {
  const own = axes.b === null ? [axes.a] : [axes.a, axes.b],
    all = axes.survivor === null ? own : [axes.survivor, ...own];
  if (axes.kind !== 'widowed' && own.every((x) => x.fixed === 'none')) return 'none';
  if (all.filter((x) => x.fixed !== 'none').every((x) => x.fixed === 'collecting')) return 'collecting';
  const varied = all.filter((x) => x.fixed === null);
  if (varied.length > 0 && !varied.every((x) => x.ages.length === 1 && x.current === x.ages[0])) return 'ok';
  return own.some((x) => x.fixed === 'atClaim') ? 'atClaim' : 'nothing';
}

// The ranking (spec 6): a strict win of measure `c` over `best`. A choice that never runs out beats one that does; between two
// that never run out, the after-tax end value higher by more than the cliff plan's $1; between two that run out, the later age.
export function claimBetter(c, best) {
  if (c.depletedAge === null) return best.depletedAge !== null || c.value > best.value + 1;
  if (best.depletedAge === null) return false;
  return c.depletedAge > best.depletedAge;
}
// The index of the winner of `list` (measures) scanned in order: only a strict win replaces the best, so the first entry wins
// every tie (the callers put the current choice first, then the earlier ages).
export function claimPick(list) {
  let best = 0;
  for (let i = 1; i < list.length; i++) if (claimBetter(list[i], list[best])) best = i;
  return best;
}

// A run's measure: whether and when it runs out, its nominal after-tax end value (the registry's endValue, priced as
// optimizePlan prices) and that value in today's dollars (as objectiveBreakdown deflates the last row).
function measureOf(runCtx, sim) {
  const rows = sim.rows,
    last = rows[rows.length - 1],
    value = US_OBJECTIVES.endValue.value(pricingContextFor(runCtx), sim),
    f = last ? (last.cumFactor ?? Math.pow(1 + pct(runCtx.inputs.inflation), last.year)) : 1;
  return { depletedAge: sim.depletedAge || null, value, today: value / f };
}
// The sort key of the re-measure's top three: never runs out first, then the higher value; runs that run out by the later age,
// then the higher value. 0 keeps the earlier-ages order (Array.prototype.sort is stable).
function topOrder(a, b) {
  if ((a.depletedAge === null) !== (b.depletedAge === null)) return a.depletedAge === null ? -1 : 1;
  if (a.depletedAge !== null && a.depletedAge !== b.depletedAge) return b.depletedAge - a.depletedAge;
  return b.value - a.value;
}

// The search (spec section 7) for the base inputs ctx.inputs. contextFor(variant) is the caller's run context of a variant (the
// UI's stateContextFor(): the kept plan); planContextFor(planInputs, runInputs) the context that runs `runInputs` with the plan
// Apply would keep for `planInputs` (the UI's (p, r) => ownPlanContextFor(p)(r)). Every run is standard (simulateWith, through
// runSourceFor: a market scenario is honored) with guardrails off. Yields 'run' after every projection and 'plan-next' /
// 'plan' around every own-plan context (the guidance jobs' protocol). The result is plain data (no runs kept); see the plan,
// docs/superpowers/plans/2026-11-21-ss-claiming-pr3-search.md, "The result".
export function* claimSearchSteps(ctx, contextFor, planContextFor) {
  const base = ctx.inputs,
    axes = ssClaimAxes(ctx),
    status = claimStatus(axes),
    kind = axes.kind,
    ownFixed = kind === 'widowed' ? axes.a.fixed : null;
  if (status !== 'ok') return { status, kind, axes, ownFixed };

  // The cells, row-major: survivor start by own start (widowed), A by B (couple), one row (single); a fixed axis is null.
  const sv = axes.survivor !== null && axes.survivor.fixed === null ? axes.survivor.ages : [null],
    av = axes.a.fixed === null ? axes.a.ages : [null],
    bv = axes.b !== null && axes.b.fixed === null ? axes.b.ages : [null];
  const cells = [];
  for (const survivor of sv) for (const a of av) for (const b of bv) cells.push({ survivor, a, b });
  // The earlier-ages order (Decision 4): the smaller sum of the varied ages, then the smaller survivor start (or A's).
  const sum = (c) => (c.survivor ?? 0) + (c.a ?? 0) + (c.b ?? 0),
    first = (c) => (c.survivor !== null ? c.survivor : c.a !== null ? c.a : c.b);
  const order = cells.map((c, i) => i).sort((i, j) => sum(cells[i]) - sum(cells[j]) || first(cells[i]) - first(cells[j]));
  // The current choice's cell, or -1 when an axis's current age is outside it (a start of 71-75, a survivor start of 68-70).
  const at = (axis, x) => (axis === null || axis.fixed !== null ? x === null : axis.ages.includes(x));
  const curSurvivor = axes.survivor !== null && axes.survivor.fixed === null ? axes.survivor.current : null,
    curA = axes.a.fixed === null ? axes.a.current : null,
    curB = axes.b !== null && axes.b.fixed === null ? axes.b.current : null;
  const curCell = at(axes.survivor, curSurvivor) && at(axes.a, curA) && at(axes.b, curB) ? cells.findIndex((c) => c.survivor === curSurvivor && c.a === curA && c.b === curB) : -1;

  // A choice's run inputs: the variant (or the base itself for the current choice), guardrails off, the end age when given.
  const runInputs = (cell, lifeA) => {
    const v = cell === null ? { ...base } : ssClaimVariant(base, axes, cell);
    if (base.guardrailsEnabled) v.guardrailsEnabled = false;
    if (lifeA !== null) v.lifeExpectancyA = lifeA;
    return v;
  };
  let runs = 0,
    plannings = 0;
  // One pass over the grid and the current choice at an end age (null: the plan's own): each distinct stream run once, in the
  // earlier-ages order, so a "same as" names the earliest cell with that stream.
  function* pass(lifeA) {
    const seen = new Map(),
      measures = cells.map(() => null),
      sameAs = cells.map(() => null);
    for (const i of order) {
      const c = contextFor(runInputs(cells[i], lifeA)),
        k = ssStreamKey(c);
      if (seen.has(k)) {
        sameAs[i] = seen.get(k);
        measures[i] = measures[sameAs[i]];
        continue;
      }
      seen.set(k, i);
      measures[i] = measureOf(c, simulateWith(c));
      runs++;
      yield 'run';
    }
    let current;
    if (curCell >= 0) current = { sameAs: null, measure: measures[curCell] };
    else {
      const c = contextFor(runInputs(null, lifeA)),
        k = ssStreamKey(c);
      if (seen.has(k)) current = { sameAs: seen.get(k), measure: measures[seen.get(k)] };
      else {
        current = { sameAs: null, measure: measureOf(c, simulateWith(c)) };
        runs++;
        yield 'run';
      }
    }
    return { measures, sameAs, current };
  }
  // The pass's winner: the current choice first, then every distinct cell in the earlier-ages order.
  const pickOf = (p) => {
    const list = [p.current.measure],
      idx = [curCell];
    for (const i of order) {
      if (p.sameAs[i] !== null || i === curCell) continue;
      list.push(p.measures[i]);
      idx.push(i);
    }
    const k = claimPick(list);
    return { cell: idx[k], isCurrent: k === 0 };
  };

  const grid = yield* pass(null);
  const gridBest = pickOf(grid).cell;

  // The re-measure (spec 7.2, owner decision 1): the current choice and the top three other distinct runs, each with the plan
  // Apply would keep for it (planned with the base's guardrails setting, run with them off; the current choice plans as the
  // base itself, so it keeps the kept plan). Without the cliff plan there is no plan to search: the grid measures stand.
  const curSame = curCell >= 0 ? (grid.sameAs[curCell] ?? curCell) : grid.current.sameAs;
  const others = order.filter((i) => grid.sameAs[i] === null && i !== curCell && i !== curSame);
  const three = others
    .slice()
    .sort((i, j) => topOrder(grid.measures[i], grid.measures[j]))
    .slice(0, 3)
    .sort((i, j) => order.indexOf(i) - order.indexOf(j));
  const top = [{ cell: curCell, measure: grid.current.measure }, ...three.map((i) => ({ cell: i, measure: grid.measures[i] }))];
  if (base.cliffGuardEnabled) {
    for (const t of top) {
      const isCur = t === top[0];
      yield 'plan-next';
      const c = planContextFor(isCur ? base : ssClaimVariant(base, axes, cells[t.cell]), runInputs(isCur ? null : cells[t.cell], null));
      plannings++;
      yield 'plan';
      t.measure = measureOf(c, simulateWith(c));
      runs++;
      yield 'run';
    }
  }
  const k = claimPick(top.map((t) => t.measure));
  const best = { cell: top[k].cell, isCurrent: k === 0, measure: top[k].measure, gain: top[k].measure.today - top[0].measure.today };

  // The longevity row (spec 6; single and widowed only): the grid re-run with the plan ending at each end age past the current
  // age (an 'ok' search is at most 70, so this only guards), on the kept plan; the plan's own end age reuses the grid.
  let longevity = null;
  if (kind !== 'couple') {
    longevity = [];
    for (const endAge of CLAIM_END_AGES) {
      if (!(endAge > base.ageA)) continue;
      const p = endAge === base.lifeExpectancyA ? grid : yield* pass(endAge),
        w = pickOf(p);
      longevity.push({ endAge, cell: w.cell, sameAsCurrent: w.isCurrent });
    }
  }

  return {
    status,
    kind,
    axes,
    ownFixed,
    cells: cells.map((c, i) => ({ survivor: c.survivor, a: c.a, b: c.b, sameAs: grid.sameAs[i], measure: grid.measures[i] })),
    // The current choice's varied ages, null for a fixed axis as in `cells` (the fixed axis's own age is axes.x.current).
    current: {
      cell: curCell,
      survivor: curSurvivor,
      a: curA,
      b: curB,
      sameAs: grid.current.sameAs,
      measure: grid.current.measure,
    },
    gridBest,
    top,
    best,
    longevity,
    runs,
    plannings,
  };
}
// The search run to the end (tests, and any caller that does not slice).
export function claimSearch(ctx, contextFor, planContextFor) {
  return drainSteps(claimSearchSteps(ctx, contextFor, planContextFor));
}

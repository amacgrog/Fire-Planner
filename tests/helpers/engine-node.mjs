// Batch 5 step 5a: the US engine in plain Node for the measurement scripts (tests/yardstick.mjs, tests/fill_probe.mjs), no
// browser. Every run is built as computeCliffPlan / optimizePlan build theirs: newRunContext from the inputs, the tax year, a plan
// and a plan mode, then runProjection in the standard mode. The clock is pinned to 2026-06-15 (as the Playwright scripts pin
// it) before any module under src/ is imported, so CURRENT_YEAR and the tax year are 2026. Needs `node --conditions=us`
// (the `#country/*` alias); `ensureUsConditions()` re-runs the calling script with it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Re-runs the main script under `--conditions=us` when the flag is missing; returns only in the process that has it.
export function ensureUsConditions() {
  if (process.execArgv.some((a) => a === '--conditions=us' || a === '-C=us')) return;
  const r = spawnSync(process.execPath, ['--conditions=us', ...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit' });
  process.exit(r.status === null ? 1 : r.status);
}

// load-time-free helper: pins Date to 2026-06-15T12:00:00Z (new Date() and Date.now(); dates with arguments are untouched).
function pinClock() {
  const Real = Date,
    PIN = Real.UTC(2026, 5, 15, 12, 0, 0);
  class Pinned extends Real {
    constructor(...a) {
      if (a.length) super(...a);
      else super(PIN);
    }
    static now() {
      return PIN;
    }
  }
  globalThis.Date = Pinned;
}

// The fill-just-under copy (Batch 5 step 5a, the probe; never in src/): a copy of src/ in which a 'fill' plan targets $1 UNDER its
// line instead of $1 over (fillPlanOf) and is met only on the line's under side (planMet's fill branch: the household MAGI within
// $1 of the target on either side, and a per-return intent likewise). Each replacement is anchored and must match exactly once,
// so a change to those lines in src/ stops the probe instead of measuring something else.
const UNDER_PATCHES = [
  ['us/core/cliff-plan/solver.js', "return { kind: 'fill', magi: t.magi + 1, label: t.label, id: t.id, ret: t.ret, own: t.own + 1 };",
    "return { kind: 'fill', magi: t.magi - 1, label: t.label, id: t.id, ret: t.ret, own: t.own - 1 };"],
  ['us/core/cliff-plan/solver.js', 'if (!(realizedMagi >= plan.magi - 1)) return false;',
    'if (!(realizedMagi >= plan.magi - 1 && realizedMagi <= plan.magi + 1)) return false;'],
  ['us/core/cliff-plan/solver.js', "return plan.ret === 'A' ? magiA >= plan.own - 1 : plan.ret === 'B' ? magiB >= plan.own - 1 : true;",
    "return plan.ret === 'A' ? magiA >= plan.own - 1 && magiA <= plan.own + 1 : plan.ret === 'B' ? magiB >= plan.own - 1 && magiB <= plan.own + 1 : true;"],
];
function underCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-5a-under-'));
  fs.cpSync(path.join(ROOT, 'src'), path.join(dir, 'src'), { recursive: true });
  for (const [rel, from, to] of UNDER_PATCHES) {
    const f = path.join(dir, 'src', rel),
      text = fs.readFileSync(f, 'utf8'),
      n = text.split(from).length - 1;
    if (n !== 1) throw new Error(`fill-under patch: ${rel} has ${n} copies of ${JSON.stringify(from)}, expected 1`);
    fs.writeFileSync(f, text.replace(from, to));
  }
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// The engine: { inputsOf(patch), ctxOf(inputs, { planMode, plan, overrides }), run(ctx), autoPlan(inputs, opts),
// optimize(inputs, objective), historical(ctx), monteCarlo(ctx, paths), measure(inputs, sim), planStats, NO_MAPS, currentYear }.
// `overrides` is always the three-key shape { rothBracketByAge, withdrawalMixByAge,
// rothAmountByAge } (one shape for every context of the calling process).
// `{ fillUnder: true }` loads the fill-just-under copy instead (its own module graph: its stats objects are its own).
let pinned = false;
export async function loadEngine({ fillUnder = false } = {}) {
  if (!pinned) pinClock();
  pinned = true;
  const base = fillUnder ? underCopy() : ROOT,
    src = (rel) => import(pathToFileURL(path.join(base, 'src', rel)).href);
  const [{ normalizeState }, { newRunContext }, { standardYearSource }, rp, { STANDARD_MODE }, { US_OBJECTIVES }, { optimizePlan }, { US_STATS }, { currentYear }, { pct }] =
    await Promise.all([
      src('us/ui/inputs/normalize-state.js'),
      src('shared/core/projection/run-context.js'),
      src('shared/core/projection/year-sources.js'),
      src('us/core/projection/run-projection.js'),
      src('us/core/projection/year-modes.js'),
      src('us/core/optimizer/objectives.js'),
      src('us/core/optimizer/plan-search.js'),
      src('us/core/cliff-plan/planning.js'),
      src('us/core/tax-year.js'),
      src('shared/core/format/numbers.js'),
    ]);
  const { runHistoricalCyclesWith, monteCarloSummaryWith } = await src('shared/core/projection/simulate.js');
  if (currentYear !== 2026) throw new Error(`tax year ${currentYear}, expected 2026 (clock not pinned)`);
  const NO_MAPS = Object.freeze({ rothBracketByAge: null, withdrawalMixByAge: null, rothAmountByAge: null });
  const ctxOf = (inputs, { planMode = 'off', plan = null, overrides = NO_MAPS } = {}) =>
    newRunContext({ inputs, taxYear: currentYear, taxFactors: null, plan, planMode, overrides, stats: US_STATS });
  const run = (ctx) =>
    rp.runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(ctx.inputs), retireAgeA: ctx.inputs.retireAgeA, retireAgeB: ctx.inputs.retireAgeB });
  const deflator = (inputs, sim) => Math.pow(1 + pct(inputs.inflation), sim.rows[sim.rows.length - 1].year);
  // Both registry objectives of one run, priced with the plan-free context of its inputs (as computeCliffPlan prices candidates):
  // value (nominal after-tax end value), real (the same in today's dollars), cost (real lifetime tax + healthcare), the scores.
  const measure = (inputs, sim) => {
    const pc = ctxOf(inputs),
      value = US_OBJECTIVES.endValue.value(pc, sim),
      cost = US_OBJECTIVES.lifetimeCost.value(pc, sim);
    return { value, real: value / deflator(inputs, sim), cost, depletedAge: sim.depletedAge ?? null, homeDrawAge: sim.homeDrawAge ?? null, endValue: value, lifetimeCost: cost === 0 ? 0 : -cost };
  };
  return {
    planStats: US_STATS.plan,
    inputsOf: (patch) => normalizeState(patch),
    ctxOf,
    run,
    measure,
    NO_MAPS,
    currentYear,
    // The automatic plan (the bracket search on unless opts.search === false), as planForState makes it for these inputs.
    autoPlan: (inputs, opts = {}) => rp.computeCliffPlan(ctxOf(inputs), opts),
    optimize: (inputs, objective) => optimizePlan(ctxOf(inputs), { objective }),
    // Every historical start year (cycles: one run per start, each row's real figure is total / cumFactor) and the seeded Monte
    // Carlo summary, for a context (the store layer's cached wrappers, which take the context as given).
    historical: (ctx) => runHistoricalCyclesWith(ctx),
    monteCarlo: (ctx, paths) => monteCarloSummaryWith(ctx, paths),
  };
}

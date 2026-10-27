// The per-return met guard (Batch 5 step 4d, R1 (a)): in a two-return year a stay-under or fill on Partner A's or B's line
// is met only when the household MAGI is on its side of the plan's line AND the intent's own return MAGI is on its side of
// the return's own line (plan.own). Lines carry `own` (the line in the return's own MAGI for ret A / B, magi for ret H);
// plans carry own - 1 (under) or own + 1 (fill). All expected values are hand literals (2026, inflation 0, Texas).
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 34;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const same = (a, b, msg) => {
  c.tick();
  expect.soft(a, msg).toBe(b);
};
const near = (a, b, tol, msg) => {
  c.tick();
  expect.soft(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`).toBe(true);
};

async function solverWorld(patch) {
  const w = await world();
  await w.setState({ inflation: 0, children: [], acaEnhanced: false, ...patch });
  w.setTaxYear(2026);
  const solver = await w.load('us/core/cliff-plan/solver.js');
  const runCtx = await w.ctx();
  return { solver, runCtx };
}

// A two-return year: household pre-draw MAGI 100,000 (A 40,000, B 60,000), half the traditional draw on each return.
const twoCtx = (o) => ({
  year: 0, filing: 'single', twoReturns: true, profile: { ownerShareA: 0.5, dependents: [] }, preMagi: 100000, preMagiA: 40000, preMagiB: 60000,
  acaEligibleA: false, acaEligibleB: false, singlePerson: false, isSurvivorPeriod: false, deceasedIsA: false, deceasedIsB: false,
  workingA: false, workingB: false, age: 60, ageB: 60, ...o,
});

it('planMet: the household test, and the per-return test on A / B intents', async () => {
  const { solver } = await solverWorld({});
  const H = { kind: 'under', magi: 60000, label: 'ACA 400% line', id: 'aca400', ret: 'H', own: 60000 };
  same(solver.planMet(H, 60001, 0, 0), true, 'H under: realized 60,001 is met');
  same(solver.planMet(H, 60001.5, 0, 0), false, 'H under: realized 60,001.5 is missed');
  const A = { kind: 'under', magi: 80000, label: 'ACA 400% line', id: 'aca400', ret: 'A', own: 40000 };
  same(solver.planMet(A, 79000, 41000, 0), false, 'A under: household met, return A over its own line');
  same(solver.planMet(A, 79000, 40001, 0), true, 'A under: return A at its own line + 1');
  same(solver.planMet(A, 80001.5, 40000, 0), false, 'A under: return A under, household over');
  same(solver.planMet(A, 79000, 40000, 999999), true, "A under: B's return MAGI is not read");
  const B = { kind: 'fill', magi: 50000, label: 'ACA credit floor (100%)', id: 'acaFloor', ret: 'B', own: 20000 };
  same(solver.planMet(B, 60000, 0, 19998), false, 'B fill: household met, return B short of its own line');
  same(solver.planMet(B, 60000, 0, 19999), true, 'B fill: return B at its own line - 1');
  same(solver.planMet(B, 49998, 0, 20000), false, 'B fill: return B over, household short');
  same(solver.NO_PLAN.own, 0, 'NO_PLAN.own');
  // the positive form: a NaN MAGI never meets a plan (household or return)
  same(solver.planMet(H, NaN, 0, 0), false, 'H under: a NaN realized MAGI is missed');
  same(solver.planMet({ ...H, kind: 'fill' }, NaN, 0, 0), false, 'H fill: a NaN realized MAGI is missed');
  same(solver.planMet(A, NaN, 40000, 0), false, 'A under: a NaN realized MAGI is missed');
  same(solver.planMet(B, 60000, 0, NaN), false, 'B fill: a NaN return MAGI is missed');
});

it('magiThresholds: two-return ACA lines carry the untranslated line as own', async () => {
  const { solver, runCtx } = await solverWorld({ acaEnabled: true, stateTax: 'tx' });
  const lines = solver.magiThresholds(runCtx, twoCtx({ acaEligibleA: true, acaEligibleB: true }));
  const find = (id, ret) => lines.find((l) => l.id === id && l.ret === ret);
  // FPL (one person, 2026) 15,650; 400% 62,600. A's lines: 100,000 + (line - 40,000) / 0.5; B's: 100,000 + (line - 60,000) / 0.5
  // (B's floor: 100,000 + (15,650 - 60,000) x 2 = 11,300).
  same(find('acaFloor', 'A').own, 15650, "A's floor: own");
  same(find('acaFloor', 'A').magi, 51300, "A's floor: household");
  same(find('aca400', 'A').own, 62600, "A's 400% line: own");
  same(find('aca400', 'A').magi, 145200, "A's 400% line: household");
  same(find('aca400', 'B').own, 62600, "B's 400% line: own");
  same(find('aca400', 'B').magi, 105200, "B's 400% line: household");
  same(find('acaFloor', 'B').own, 15650, "B's floor: own");
  same(lines.length, 4, 'four lines');
  // Plans copy own - 1 (under) and own + 1 (fill).
  same(solver.underPlanOf(find('aca400', 'A')).own, 62599, 'under: own - 1');
  same(solver.fillPlanOf(find('acaFloor', 'A')).own, 15651, 'fill: own + 1');
});

it('magiThresholds: two-return IRMAA lines own the edge through magiForIrmaaLine; H lines own their magi', async () => {
  const { solver, runCtx } = await solverWorld({ acaEnabled: false });
  const lines = solver.magiThresholds(
    runCtx,
    twoCtx({ age: 66, ageB: 66, irmaa: { filing: 'single', a: true, b: true }, irmaaGrowth: 1, profile: { ownerShareA: 0.5, ssA: 40000, ssB: 20000, dependents: [] } }),
  );
  const find = (id, ret) => lines.find((l) => l.id === id && l.ret === ret);
  // A: benefit 40,000, IRMAA MAGI x + 34,000 (85% cap) = 109,000: x = 75,000, engine MAGI 115,000; household
  // 100,000 + (115,000 - 40,000) x 2 = 250,000. B: benefit 20,000, x + 17,000 = 109,000: x = 92,000, engine MAGI 112,000;
  // household 100,000 + (112,000 - 60,000) x 2 = 204,000.
  near(find('irmaa1', 'A').own, 115000, 1e-6, "A's irmaa1: own");
  near(find('irmaa1', 'A').magi, 250000, 1e-6, "A's irmaa1: household");
  near(find('irmaa1', 'B').own, 112000, 1e-6, "B's irmaa1: own");
  near(find('irmaa1', 'B').magi, 204000, 1e-6, "B's irmaa1: household");
  // The senior-deduction phase-out (single, 2026): 75,000, a household line.
  same(find('senior', 'H').own, 75000, 'senior: own');
  same(find('senior', 'H').magi, 75000, 'senior: household');
  // Every per-return line: household = 100,000 + (own - pre) / 0.5 (the translation), every H line own === magi.
  let perReturn = true,
    household = true;
  for (const l of lines) {
    if (l.ret === 'A') perReturn = perReturn && l.magi === 100000 + (l.own - 40000) / 0.5;
    else if (l.ret === 'B') perReturn = perReturn && l.magi === 100000 + (l.own - 60000) / 0.5;
    else household = household && l.own === l.magi;
  }
  same(perReturn, true, 'per-return lines translate their own line');
  same(household, true, 'H lines: own === magi');
  same(lines.filter((l) => l.ret === 'A').length, 5, "A's five tiers");
  same(lines.filter((l) => l.ret === 'B').length, 5, "B's five tiers");
});

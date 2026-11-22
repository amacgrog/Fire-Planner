// SS claiming optimizer PR 4: the claiming card's text (src/us/core/format/claim-text.js). Every result is a hand-built literal
// in the shape of PR 3's (docs/superpowers/plans/2026-11-21-ss-claiming-pr3-search.md, "The result"), with invented figures;
// one case feeds a real search of a single person to check the functions read a real result.
import { it, afterAll, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 138;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const load = async () => (await world()).load('us/core/format/claim-text.js');
const M = (today, depletedAge = null) => ({ depletedAge, value: today, today });
const axis = (ages, current, fixed = null) => ({ ages: fixed === null ? ages : [], fixed, current });
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

// A single person of 62: cells 62..70, the current choice 62 (cell 0).
function single({ values = [100000, 110000, 120000, 130000, 140000, 150000, 160000, 170000, 180000], current = 0, top, best, longevity = null, plannings = 4, curA = 62, curSameAs = null } = {}) {
  const cells = range(62, 70).map((a, i) => ({ survivor: null, a, b: null, sameAs: null, measure: M(values[i]) }));
  const cur = current >= 0 ? cells[current].measure : M(90000);
  return {
    status: 'ok', kind: 'single', ownFixed: null,
    axes: { kind: 'single', a: axis(range(62, 70), curA), b: null, survivor: null },
    cells, current: { cell: current, survivor: null, a: curA, b: null, sameAs: curSameAs, measure: cur },
    gridBest: 8, top: top ?? [{ cell: current, measure: cur }, { cell: 6, measure: M(160000) }, { cell: 7, measure: M(170000) }, { cell: 8, measure: M(185000) }],
    best: best ?? { cell: 8, isCurrent: false, measure: M(185000), gain: 85000 }, longevity, runs: 9, plannings,
  };
}
// A widowed person of 60: survivor 60..67 (rows) by own 62..70 (columns), row-major.
function widowed({ ownFixed = null, survivorFixed = null } = {}) {
  const sv = survivorFixed ? [null] : range(60, 67),
    av = ownFixed ? [null] : range(62, 70);
  const cells = [];
  for (const survivor of sv) for (const a of av) cells.push({ survivor, a, b: null, sameAs: null, measure: M(500000) });
  return {
    status: 'ok', kind: 'widowed', ownFixed,
    axes: { kind: 'widowed', a: axis(range(62, 70), 70, ownFixed), b: null, survivor: axis(range(60, 67), 67, survivorFixed) },
    cells, current: { cell: 0, survivor: sv[0], a: av[0], b: null, sameAs: null, measure: M(500000) },
    gridBest: 0, top: [{ cell: 0, measure: M(500000) }], best: { cell: 0, isCurrent: true, measure: M(500000), gain: 0 },
    longevity: null, runs: cells.length, plannings: 1,
  };
}
const at = (r, s, a) => r.cells.findIndex((x) => x.survivor === s && x.a === a);

it('names a choice', async () => {
  const t = await load();
  const s = single();
  c.expect(t.claimChoiceText(s, 8)).toBe('claim at 70');
  c.expect(t.claimChoiceText(s, 8, { short: true })).toBe('70');
  const w = widowed();
  c.expect(t.claimSurvivorFull(w)).toBe(67);
  c.expect(t.claimChoiceText(w, at(w, 60, 70))).toBe('survivor benefit at 60, then your own at 70');
  c.expect(t.claimChoiceText(w, at(w, 67, 62))).toBe('your own benefit at 62, then the survivor benefit at 67 (the full survivor amount)');
  c.expect(t.claimChoiceText(w, at(w, 64, 64))).toBe('both at 64');
  c.expect(t.claimChoiceText(w, at(w, 60, 70), { short: true })).toBe('60 / 70');
  const wo = widowed({ ownFixed: 'atClaim' });
  c.expect(t.claimChoiceText(wo, at(wo, 62, null))).toBe('survivor benefit at 62');
  c.expect(t.claimChoiceText(wo, at(wo, 62, null), { short: true })).toBe('62');
  const ws = widowed({ survivorFixed: 'collecting' });
  c.expect(t.claimSurvivorFull(ws)).toBe(null);
  c.expect(t.claimChoiceText(ws, at(ws, null, 66))).toBe('your own benefit at 66');
  // The current choice outside the grid: a start of 72.
  const out = single({ current: -1, curA: 72 });
  c.expect(t.claimChoiceText(out, -1)).toBe('claim at 72');
  c.expect(t.claimApplyLabel(single())).toBe('Apply: claim at 70');
  const wb = widowed();
  wb.best = { cell: at(wb, 60, 70), isCurrent: false, measure: M(1), gain: 1 };
  c.expect(t.claimApplyLabel(wb)).toBe('Apply: survivor at 60, own at 70');
});

it('the headline', async () => {
  const t = await load();
  c.expect(t.claimHeadline(single({ best: { cell: 0, isCurrent: true, measure: M(100000), gain: 0 } }))).toBe('Best: your current choice, claim at 62.');
  c.expect(t.claimHeadline(single({ best: { cell: 8, isCurrent: false, measure: M(112345.67), gain: 12345.67 } }))).toBe(
    "Best: claim at 70. After-tax end value $12,346 more than your current choice (claim at 62), in today's dollars.",
  );
  const out = single();
  out.top[0] = { cell: 0, measure: M(0, 84) };
  c.expect(t.claimHeadline(out)).toBe('Best: claim at 70. Your money lasts the whole plan; with your current choice (claim at 62) it runs out at 84.');
  out.best = { cell: 8, isCurrent: false, measure: M(0, 88), gain: 0 };
  c.expect(t.claimHeadline(out)).toBe('Best: claim at 70. Your money runs out at 88 instead of 84.');
});

it('the difference text', async () => {
  const t = await load();
  c.expect(t.claimDiffText(12345)).toBe('+$12.3K');
  c.expect(t.claimDiffText(-8000)).toBe('−$8K');
  c.expect(t.claimDiffText(0.4)).toBe('$0');
  c.expect(t.claimDiffText(-1)).toBe('$0');
  c.expect(t.claimDiffText(1.5)).toBe('+$1.5');
});

it("a cell's label and measure", async () => {
  const t = await load();
  const r = single();
  c.expect(t.claimCellLabel(r, 0)).toBe('current');
  c.expect(t.claimCellLabel(r, 1)).toBe('+$10K');
  // Re-measured cells show their own-plan measure.
  c.expect(t.claimShownMeasure(r, 8)).toStrictEqual(M(185000));
  c.expect(t.claimCellLabel(r, 8)).toBe('+$85K');
  c.expect(t.claimShownMeasure(r, 5)).toStrictEqual(M(150000));
  c.expect(t.claimRechecked(r, 8)).toBe(true);
  c.expect(t.claimRechecked(r, 5)).toBe(false);
  c.expect(t.claimRechecked(r, 0)).toBe(true);
  // A twin of a re-measured cell shows the twin's own-plan measure; its label names the twin.
  r.cells[5].sameAs = 8;
  c.expect(t.claimShownMeasure(r, 5)).toStrictEqual(M(185000));
  c.expect(t.claimRechecked(r, 5)).toBe(true);
  c.expect(t.claimCellLabel(r, 5)).toBe('same as 70');
  // A twin of the current choice shows top[0].
  r.cells[3].sameAs = 0;
  c.expect(t.claimShownMeasure(r, 3)).toStrictEqual(M(100000));
  c.expect(t.claimCellLabel(r, 3)).toBe('same as current');
  // The current cell is "current" even when it is itself a twin; its twin's measure shows the current one.
  const q = single({ current: 2 });
  q.cells[2].sameAs = 1;
  c.expect(t.claimCellLabel(q, 2)).toBe('current');
  c.expect(t.claimShownMeasure(q, 1)).toStrictEqual(M(120000));
  // The canonical cell of a current choice that is a twin pays as the current choice does.
  c.expect(t.claimCellLabel(q, 1)).toBe('same as current');
  // A run-out cell; "lasts" when the current choice runs out.
  const o = single();
  o.cells[1].measure = M(0, 84);
  c.expect(t.claimCellLabel(o, 1)).toBe('out at 84');
  o.top[0] = { cell: 0, measure: M(0, 80) };
  c.expect(t.claimCellLabel(o, 2)).toBe('lasts');
  c.expect(t.claimCellLabel(o, 1)).toBe('out at 84');
  // Nothing planned: nothing is re-checked.
  const n = single({ plannings: 0 });
  c.expect(t.claimRechecked(n, 8)).toBe(false);
  c.expect(t.claimRechecked(n, 0)).toBe(false);
});

it("a cell's tooltip", async () => {
  const t = await load();
  const r = single();
  c.expect(t.claimCellTip(r, 5)).toStrictEqual({ head: 'Claim at 67', lines: ["After-tax end value: $150,000 (today's dollars)", '+$50K compared with your current choice'] });
  c.expect(t.claimCellTitle(r, 5)).toBe("Claim at 67: after-tax end value: $150,000 (today's dollars); +$50K compared with your current choice.");
  c.expect(t.claimCellTip(r, 8)).toStrictEqual({
    head: 'Claim at 70',
    lines: ['Best choice', "After-tax end value: $185,000 (today's dollars)", '+$85K compared with your current choice', 'Re-checked with its own cliff plan'],
  });
  c.expect(t.claimCellTip(r, 0)).toStrictEqual({ head: 'Claim at 62', lines: ['Your current choice', "After-tax end value: $100,000 (today's dollars)"] });
  r.cells[4].sameAs = 8;
  c.expect(t.claimCellTip(r, 4).lines[2]).toBe('Pays the same Social Security every year as claim at 70, so the result is the same');
  r.cells[3].sameAs = 0;
  c.expect(t.claimCellTip(r, 3)).toStrictEqual({
    head: 'Claim at 65',
    lines: ["After-tax end value: $100,000 (today's dollars)", 'Pays the same Social Security every year as claim at 62, so the result is the same'],
  });
  // A run-out cell gives its age, never a $0 end value.
  r.cells[1].measure = M(0, 84);
  c.expect(t.claimCellTip(r, 1).lines).toStrictEqual(['Money runs out at 84', 'Your current choice never runs out']);
  const o = single();
  o.top[0] = { cell: 0, measure: M(0, 80) };
  o.cells[1].measure = M(0, 81);
  o.cells[2].measure = M(0, 80);
  o.cells[3].measure = M(0, 78);
  c.expect(t.claimCellTip(o, 1).lines[1]).toBe('1 year later than your current choice');
  c.expect(t.claimCellTip(o, 2).lines[1]).toBe('The same age as your current choice');
  c.expect(t.claimCellTip(o, 3).lines[1]).toBe('2 years earlier than your current choice');
  c.expect(t.claimCellTip(o, 4).lines).toStrictEqual(["After-tax end value: $140,000 (today's dollars)", 'Lasts the whole plan; your current choice runs out at 80']);
  const w = widowed();
  c.expect(t.claimCellTitle(w, at(w, 60, 70))).toBe("Survivor at 60, own at 70: after-tax end value: $500,000 (today's dollars); $0 compared with your current choice.");
});

it('the legend', async () => {
  const t = await load();
  c.expect(t.claimLegend(single())).toBe(
    `Columns: the age you claim at. Each cell: the after-tax end value compared with your current choice (today's dollars); "out at 68" when the money runs out at 68; "same as 62" when that choice pays exactly the same Social Security every year, so its result is the same. ★ best, • re-checked with its own cliff plan, outlined: your current choice. Hover or tap a cell for its figures.`,
  );
  c.expect(t.claimLegend(widowed()).startsWith('Rows: the age the survivor benefit starts. Columns: the age your own benefit starts. Each cell:')).toBe(true);
  c.expect(t.claimLegend(widowed()).includes('"same as 60 / 62" (survivor / own)')).toBe(true);
  c.expect(t.claimLegend(widowed({ ownFixed: 'atClaim' })).startsWith('Rows: the age the survivor benefit starts. Each cell:')).toBe(true);
});

it('the current choice outside the grid', async () => {
  const t = await load();
  c.expect(t.claimCurrentLine(single())).toBe('');
  const out = single({ current: -1, curA: 72 });
  c.expect(t.claimCurrentLine(out)).toBe("Your current choice (claim at 72) is outside the ages searched: after-tax end value $90,000 in today's dollars.");
  out.top[0] = { cell: -1, measure: M(80000, 91) };
  out.current.sameAs = 8;
  c.expect(t.claimCurrentLine(out)).toBe(
    "Your current choice (claim at 72) is outside the ages searched: after-tax end value $80,000 in today's dollars; it runs out at 91; it pays the same as claim at 70.",
  );
  c.expect(t.claimShownMeasure(out, -1)).toStrictEqual(M(80000, 91));
  // The current choice's twin cell shows its measure.
  c.expect(t.claimShownMeasure(out, 8)).toStrictEqual(M(80000, 91));
  c.expect(t.claimCellLabel(out, 8)).toBe('same as current');
});

it('the longevity sentence', async () => {
  const t = await load();
  const row = (cells, ages = [80, 85, 90, 95]) => single({ longevity: cells.map((cell, k) => ({ endAge: ages[k], cell, sameAsCurrent: cell === 0 })) });
  c.expect(t.longevitySentence(row([0, 4, 8, 8]))).toBe('If you live to 90 or longer, claim at 70 wins; to 80, claim at 62; to 85, claim at 66.');
  c.expect(t.longevitySentence(row([0, 0, 8, 8]))).toBe('If you live to 90 or longer, claim at 70 wins; to 80 or 85, claim at 62.');
  c.expect(t.longevitySentence(row([0, 0, 0, 8]))).toBe('If you live to 95 or longer, claim at 70 wins; to 80, 85 or 90, claim at 62.');
  c.expect(t.longevitySentence(row([8, 8, 8, 8]))).toBe("Whatever the plan's end age from 80 to 95, claim at 70 wins.");
  c.expect(t.longevitySentence(row([6, 8, 8], [85, 90, 95]))).toBe('If you live to 90 or longer, claim at 70 wins; to 85, claim at 68.');
  c.expect(t.longevitySentence(row([8], [95]))).toBe('If the plan ends at 95, claim at 70 wins.');
  c.expect(t.longevitySentence(single())).toBe('');
  // An extra current choice (-1) is named as the current choice.
  const out = single({ current: -1, curA: 72, longevity: [{ endAge: 80, cell: 0, sameAsCurrent: false }, { endAge: 85, cell: -1, sameAsCurrent: true }] });
  c.expect(t.longevitySentence(out)).toBe('If you live to 85 or longer, claim at 72 wins; to 80, claim at 62.');
});

it('the fixed-axis, status and measured lines', async () => {
  const t = await load();
  c.expect(t.claimFixedLine(single())).toBe('');
  c.expect(t.claimFixedLine(widowed())).toBe('');
  c.expect(t.claimFixedLine(widowed({ ownFixed: 'atClaim' }))).toBe(
    'Only the survivor start is searched: your own benefit is entered as paid at its start age; enter it at full retirement age to compare both.',
  );
  c.expect(t.claimFixedLine(widowed({ ownFixed: 'collecting' }))).toBe('Only the survivor start is searched: you already collect your own benefit.');
  c.expect(t.claimFixedLine(widowed({ ownFixed: 'past' }))).toBe('Only the survivor start is searched: your own benefit has started (you are past 70).');
  c.expect(t.claimFixedLine(widowed({ ownFixed: 'none' }))).toBe('Only the survivor start is searched: no own benefit is entered.');
  c.expect(t.claimFixedLine(widowed({ survivorFixed: 'collecting' }))).toBe('Only your own start is searched: you already collect the survivor benefit.');
  c.expect(t.claimFixedLine(widowed({ survivorFixed: 'past' }))).toBe('Only your own start is searched: the survivor benefit has reached its full amount.');
  c.expect(t.claimStatusLine('atClaim')).toBe('Enter your benefit at full retirement age (set “amount entered is” to “At full retirement age”) to compare claiming ages.');
  c.expect(t.claimStatusLine('nothing')).toBe('Nothing to choose: your claiming ages are already set (already collecting, or past the last claiming age).');
  c.expect(t.claimStatusLine('ok')).toBe('');
  const first = "Uses standard projections with guardrails off and your current plan settings; depends on life expectancy (yours: 90).";
  c.expect(t.claimLines(single(), { lifeExpectancy: 90, storedPlan: null })).toStrictEqual([
    first,
    'The best cells and your current choice were re-checked with their own cliff plan; the other cells and the end-age row use the current plan.',
  ]);
  c.expect(t.claimLines(single({ plannings: 0 }), { lifeExpectancy: 90, storedPlan: { v: 1 } })).toStrictEqual([first, 'Re-run Plan search after applying.']);
});

it('reads a real search', async () => {
  const w = await world();
  await w.setState({
    singlePerson: true, ageA: 62, retireAgeA: 62, lifeExpectancyA: 90, incomeA: 0, tenure: 'rent', rent: 0, cash: 400000,
    cashReserve: 1000000, taxable: 0, tradIraA: 0, trad401kA: 0, rothIraA: 0, roth401kA: 0, returnRate: 0, hysaRate: 0,
    bondReturn: 0, bondYears: 0, dividendYield: 0, inflation: 0, spending: 10000, healthcare: 0, medicareYearly: 0,
    acaEnabled: false, cliffGuardEnabled: false, rothConvEnabled: false, stateTax: 'tx', ssMonthlyA: 2000, ssStartAgeA: 62,
    ssBenefitBasisA: 'pia',
  });
  const state = (await w.load('shared/core/store.js')).state;
  const contextFor = (await w.load('shared/ui/results/state-context.js')).stateContextFor();
  const { ownPlanContextFor } = await w.load('us/core/projection/store-context.js');
  const { claimSearch } = await w.load('us/core/optimizer/claim-search.js');
  const t = await w.load('us/core/format/claim-text.js');
  const r = claimSearch(contextFor(state), contextFor, (p, q) => ownPlanContextFor(p)(q));
  // At 90 the best is 70 (PR 3's hand sums: 21 x 29,760 = 624,960 against 62's 29 x 16,800 = 487,200).
  c.expect(t.claimChoiceText(r, r.best.cell)).toBe('claim at 70');
  c.expect(t.claimHeadline(r).startsWith('Best: claim at 70. After-tax end value $')).toBe(true);
  c.expect(t.claimCellLabel(r, r.current.cell)).toBe('current');
  c.expect(r.cells.every((x, i) => t.claimCellTitle(r, i).startsWith(`Claim at ${x.a}: `))).toBe(true);
  c.expect(t.longevitySentence(r)).toBe('If you live to 85 or longer, claim at 70 wins; to 80, claim at 68.');
});

// ---- SS PR 5: couples ----

// A couple of 62: A 62..70 (rows) by B 62..70 (columns), row-major; the current choice (62, 62) is cell 0. `value(a, b)` gives
// each cell's figure; `best` defaults to the cell (70, 62) (the last cell with a fixed axis), re-measured at its grid figure.
const cAt = (r, a, b) => r.cells.findIndex((x) => x.a === a && x.b === b);
function couple({ value = (a, b) => 500000 + 1000 * a - 100 * b, fixedA = null, fixedB = null, best, top, plannings = 0, sameAs = {} } = {}) {
  const av = fixedA ? [null] : range(62, 70),
    bv = fixedB ? [null] : range(62, 70);
  const cells = [];
  for (const a of av) for (const b of bv) cells.push({ survivor: null, a, b, sameAs: null, measure: M(value(a ?? 62, b ?? 62)) });
  const r = {
    status: 'ok', kind: 'couple', ownFixed: null,
    axes: { kind: 'couple', a: axis(range(62, 70), 62, fixedA), b: axis(range(62, 70), 62, fixedB), survivor: null },
    cells, current: { cell: 0, survivor: null, a: av[0], b: bv[0], sameAs: null, measure: cells[0].measure },
    gridBest: 0, longevity: null, runs: cells.length, plannings,
  };
  for (const [k, v] of Object.entries(sameAs)) {
    const [i, j] = [k, v].map((s) => cAt(r, ...s.split(',').map(Number)));
    r.cells[i].sameAs = j;
    r.cells[i].measure = r.cells[j].measure;
  }
  const bi = best ?? (fixedA || fixedB ? cells.length - 1 : cAt(r, 70, 62));
  r.top = top ?? [{ cell: 0, measure: cells[0].measure }, { cell: bi, measure: cells[bi].measure }];
  r.best = { cell: bi, isCurrent: bi === 0, measure: r.cells[bi].measure, gain: r.cells[bi].measure.today - cells[0].measure.today };
  return r;
}

it('a couple: names, the Apply label, the cells and the tooltips', async () => {
  const t = await load();
  const r = couple({ sameAs: { '67,63': '67,62' } });
  c.expect(t.claimChoiceText(r, cAt(r, 70, 62))).toBe('Partner A at 70, Partner B at 62');
  c.expect(t.claimChoiceText(r, cAt(r, 67, 67))).toBe('both at 67');
  c.expect(t.claimChoiceText(r, cAt(r, 70, 62), { short: true })).toBe('70 / 62');
  c.expect(t.claimApplyLabel(r)).toBe('Apply: A at 70, B at 62');
  c.expect(t.claimCellLabel(r, cAt(r, 67, 63))).toBe('same as 67 / 62');
  c.expect(t.claimCellTitle(r, cAt(r, 67, 63)).endsWith('; pays the same Social Security every year as A at 67, B at 62, so the result is the same.')).toBe(true);
  c.expect(t.claimCellTip(r, cAt(r, 70, 62)).head).toBe('A at 70, B at 62');
  c.expect(t.claimCellTitle(r, cAt(r, 70, 62)).startsWith("A at 70, B at 62: best choice; after-tax end value: $563,800 (today's dollars)")).toBe(true);
  c.expect(t.claimLegend(r).startsWith("Rows: the age Partner A's benefit starts. Columns: the age Partner B's benefit starts. ")).toBe(true);
  c.expect(t.claimLegend(r).includes('"same as 67 / 62" (A / B)')).toBe(true);
  c.expect(t.claimLegend(couple({ fixedB: 'atClaim' })).startsWith('Columns: the age Partner A claims at. ')).toBe(true);
  c.expect(t.claimLegend(couple({ fixedA: 'collecting' })).startsWith('Columns: the age Partner B claims at. ')).toBe(true);
  const fb = couple({ fixedB: 'atClaim' }),
    fa = couple({ fixedA: 'collecting' });
  c.expect(t.claimChoiceText(fb, fb.best.cell)).toBe('Partner A at 70');
  c.expect(t.claimChoiceText(fa, fa.best.cell)).toBe('Partner B at 70');
  c.expect(t.claimApplyLabel(fb)).toBe('Apply: A at 70');
  // The current choice outside the grid, paying as a cell does.
  const out = couple();
  out.current = { ...out.current, cell: -1, a: 72, sameAs: cAt(out, 70, 62) };
  c.expect(t.claimCurrentLine(out).endsWith('; it pays the same as A at 70, B at 62.')).toBe(true);
});

it('a couple: the same-age pick and the headline', async () => {
  const t = await load();
  // LOW_EARLY's totals (claim-search.test.js): (70, 62) 704,640, the diagonal rising to (70, 70) 690,720.
  const diag = [591720, 607680, 620040, 642400, 659720, 672000, 682848, 689088, 690720];
  const low = couple({ value: (a, b) => (a === b ? diag[a - 62] : a === 70 && b === 62 ? 704640 : 500000) });
  c.expect(t.claimSameAge(low)).toStrictEqual({ cell: cAt(low, 70, 70), canon: cAt(low, 70, 70), measure: M(690720) });
  c.expect(t.claimHeadline(low)).toBe(
    "Best: Partner A at 70, Partner B at 62. After-tax end value $112,920 more than your current choice (both at 62), in today's dollars. Same age for both: best at 70, $13,920 less than the best.",
  );
  // The best on the diagonal.
  const onDiag = couple({ value: (a, b) => (a === b && a === 67 ? 600000 : 500000), best: cAt(couple(), 67, 67) });
  c.expect(t.claimHeadline(onDiag).endsWith(' It is also the best age for both of you to share.')).toBe(true);
  // A diagonal twin of the best: named "both at 67" and paying the same.
  const twin = couple({
    value: (a, b) => (a === 67 && b <= 67 ? 700000 : 500000),
    best: cAt(couple(), 67, 62),
    sameAs: { '67,63': '67,62', '67,64': '67,62', '67,65': '67,62', '67,66': '67,62', '67,67': '67,62' },
  });
  c.expect(t.claimSameAge(twin)).toStrictEqual({ cell: cAt(twin, 67, 67), canon: cAt(twin, 67, 62), measure: M(700000) });
  c.expect(t.claimHeadline(twin).endsWith(' Same age for both: best at 67, which pays the same.')).toBe(true);
  // Within the $1 tolerance, and below the best by a negative gap (a kept-plan diagonal figure above the re-checked best).
  for (const g of [0.4, -500]) {
    const r = couple({ value: (a, b) => (a === 70 && b === 62 ? 700000 : a === b && a === 66 ? 700000 - g : 500000) });
    c.expect(t.claimHeadline(r).endsWith(' Same age for both: best at 66, about the same as the best.')).toBe(true);
  }
  // Run-outs: every other diagonal cell runs out at 80, the (65, 65) one as given, the best as given.
  const outs = (bestOut, sameOut) => {
    const r = couple({ value: (a, b) => (a === 70 && b === 62 ? 700000 : a === b && a === 65 ? 600000 : 500000) });
    r.cells.forEach((x) => (x.measure = { ...x.measure, depletedAge: x.a === x.b && x.a !== 65 ? 80 : null }));
    r.cells[cAt(r, 65, 65)].measure.depletedAge = sameOut;
    r.best.measure = { ...r.best.measure, depletedAge: bestOut };
    r.top[0].measure = r.cells[0].measure;
    return t.claimHeadline(r);
  };
  c.expect(outs(null, 88).endsWith(' Same age for both: best at 65, which runs out at 88.')).toBe(true);
  c.expect(outs(90, null).endsWith(' Same age for both: best at 65, which lasts the whole plan on the current cliff plan.')).toBe(true);
  c.expect(outs(90, 86).endsWith(' Same age for both: best at 65, running out at 86 instead of 90.')).toBe(true);
  // Running out later than the best (a kept-plan diagonal figure beside the re-checked best) reads as about the same.
  c.expect(outs(86, 90).endsWith(' Same age for both: best at 65, about the same as the best.')).toBe(true);
  // No pick with a fixed axis or for a single person.
  c.expect(t.claimSameAge(couple({ fixedB: 'atClaim' }))).toBe(null);
  c.expect(t.claimSameAge(single())).toBe(null);
  c.expect(t.claimHeadline(couple({ fixedB: 'atClaim' })).includes('Same age')).toBe(false);
  // The current choice best: the same-age sentence still follows.
  const cur = couple({ value: (a, b) => (a === 62 && b === 62 ? 900000 : a === b ? 800000 : 500000), best: 0 });
  c.expect(t.claimHeadline(cur)).toBe('Best: your current choice, both at 62. It is also the best age for both of you to share.');
});

it('a couple: the fixed-axis, status and measured lines', async () => {
  const t = await load();
  c.expect(t.claimFixedLine(couple())).toBe('');
  c.expect(t.claimFixedLine(couple({ fixedB: 'atClaim' }))).toBe(
    "Only Partner A's start is searched: Partner B's benefit is entered as paid at its start age; enter it at full retirement age to compare both.",
  );
  c.expect(t.claimFixedLine(couple({ fixedA: 'collecting' }))).toBe("Only Partner B's start is searched: Partner A already collects.");
  c.expect(t.claimFixedLine(couple({ fixedA: 'past' }))).toBe("Only Partner B's start is searched: Partner A's benefit has started (past 70).");
  c.expect(t.claimFixedLine(couple({ fixedB: 'none' }))).toBe("Only Partner A's start is searched: Partner B has no benefit entered.");
  const both = { kind: 'couple', a: axis([], 62, 'atClaim'), b: axis([], 62, 'atClaim'), survivor: null };
  c.expect(t.claimStatusLine('atClaim', both)).toBe(
    "Enter Partner A's and Partner B's benefits at full retirement age (set “amount entered is” to “At full retirement age”) to compare claiming ages.",
  );
  c.expect(t.claimStatusLine('atClaim', { ...both, a: axis([], 70, 'collecting') })).toBe(
    "Enter Partner B's benefit at full retirement age (set “amount entered is” to “At full retirement age”) to compare claiming ages.",
  );
  c.expect(t.claimStatusLine('atClaim', { kind: 'single', a: axis([], 62, 'atClaim'), b: null, survivor: null }).startsWith('Enter your benefit')).toBe(true);
  c.expect(t.claimLines(couple(), { lifeExpectancy: 90, lifeExpectancyB: 88, survivorEnabled: true, storedPlan: null })).toStrictEqual([
    'Uses standard projections with guardrails off and your current plan settings; depends on life expectancy (A: 90, B: 88).',
    'No end-age row for a couple: survivor modeling covers the first death.',
  ]);
  c.expect(t.claimLines(couple({ plannings: 4 }), { lifeExpectancy: 90, lifeExpectancyB: 88, survivorEnabled: false, storedPlan: [1] })).toStrictEqual([
    'Uses standard projections with guardrails off and your current plan settings; depends on life expectancy (A: 90, B: 88).',
    'No end-age row for a couple: turn on survivor modeling to see a death mid-plan.',
    'The best cells and your current choice were re-checked with their own cliff plan; the other cells use the current plan.',
    'Re-run Plan search after applying.',
  ]);
});

it('reads a real couple search', async () => {
  const w = await world();
  // claim-search.test.js's LOW_EARLY: A 2,000 and B 400 at full retirement age, B dying at 75, zero tax.
  await w.setState({
    singlePerson: false, filingStatus: 'mfj', marryLater: false, ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62, lifeExpectancyA: 90,
    lifeExpectancyB: 90, incomeA: 0, incomeB: 0, tenure: 'rent', rent: 0, homeValue: 0, mortgage: 0, mortgagePrincipal: 0, maintenance: 0,
    cash: 400000, cashReserve: 1000000, taxable: 0, tradIraA: 0, trad401kA: 0, rothIraA: 0, roth401kA: 0, tradIraB: 0, trad401kB: 0,
    rothIraB: 0, roth401kB: 0, returnRate: 0, hysaRate: 0, bondReturn: 0, bondYears: 0, dividendYield: 0, inflation: 0, spending: 10000,
    healthcare: 0, medicareYearly: 0, acaEnabled: false, cliffGuardEnabled: false, rothConvEnabled: false, stateTax: 'tx', ltcEnabled: false,
    survivorEnabled: true, survivorPartner: 'B', survivorDeathAge: 75, survivorSpendingPct: 100, ssMonthlyA: 2000, ssMonthlyB: 400,
    ssStartAgeA: 62, ssStartAgeB: 62, ssBenefitBasisA: 'pia', ssBenefitBasisB: 'pia',
  });
  const state = (await w.load('shared/core/store.js')).state;
  const contextFor = (await w.load('shared/ui/results/state-context.js')).stateContextFor();
  const { ownPlanContextFor } = await w.load('us/core/projection/store-context.js');
  const { claimSearch } = await w.load('us/core/optimizer/claim-search.js');
  const t = await w.load('us/core/format/claim-text.js');
  const r = claimSearch(contextFor(state), contextFor, (p, q) => ownPlanContextFor(p)(q));
  c.expect(t.claimChoiceText(r, r.best.cell)).toBe('Partner A at 70, Partner B at 62');
  c.expect(t.claimHeadline(r)).toBe(
    "Best: Partner A at 70, Partner B at 62. After-tax end value $112,920 more than your current choice (both at 62), in today's dollars. Same age for both: best at 70, $13,920 less than the best.",
  );
  const s = t.claimSameAge(r);
  c.expect([r.cells[s.cell].a, r.cells[s.cell].b]).toStrictEqual([70, 70]);
  c.expect(s.measure).toStrictEqual(t.claimShownMeasure(r, s.cell));
  c.expect(r.cells.every((x, i) => t.claimCellTitle(r, i).startsWith(`A at ${x.a}, B at ${x.b}: `))).toBe(true);
});

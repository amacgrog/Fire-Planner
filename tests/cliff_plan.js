// Cliff plan (docs/superpowers/specs/2026-10-07-cliff-plan-design.md): the plan modes of runProjection.
// Task 3: `off` is today's guard-off year; `choose` runs the 8a phased year and records each year's winning intent;
// yearPlanCandidates offers a stay-under only at a real cliff and a fill only at a floor. Households come from the
// committed snapshot corpus (tests/snapshot_scenarios.js), so they are known to act.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const { scenarios } = require('./snapshot_scenarios');
const { legacyToAccounts } = require('./legacy_balances');

const ALL = scenarios(true);
const household = (name) => {
  const s = ALL.find((x) => x.name === name);
  if (!s) throw new Error('no scenario ' + name);
  return s;
};
// Runs runProjection in a plan mode under a scenario's patch (translated as tests/snapshot.js does) and restores state.
const runMode = (page, sc, planMode, plan = null, series = null, extra = {}) =>
  page.evaluate(
    ({ patch, planMode, plan, series }) => {
      const st = window.__test_getState(),
        saved = JSON.parse(JSON.stringify(st));
      try {
        Object.assign(st, patch);
        const rowFn = series ? window.__test_rowFnFor(series) : null;
        // The default mode (no planMode) applies the plan of the state object render() planned for: re-plan for the patch.
        if (planMode === undefined) window.__test_refreshCliffPlan();
        const r = window.__test_runPlanMode({ planMode, plan, rowFn });
        return JSON.parse(JSON.stringify({ rows: r.rows, depletedAge: r.depletedAge, intents: r.intents }));
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
        if (planMode === undefined) window.__test_refreshCliffPlan();
      }
    },
    { patch: { ...legacyToAccounts(sc.patch, { singlePerson: !!sc.patch.singlePerson }), ...extra }, planMode, plan, series }
  );

const LINE_IDS = ['medicaid', 'acaFloor', 'aca400', 'irmaa1', 'irmaa2', 'irmaa3', 'irmaa4', 'irmaa5', 'senior', 'ctc'];

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
  await page.waitForTimeout(300);

  // 1. `off` equals the default run with the guard off (no plan: planForState gives null), row for row. (Before the switch
  // this compared `off` with the legacy in-path guard's guard-off year; tests/plan_off_anchor.js pins that against 3ebee0e.)
  const offCases = ALL.filter((s) => s.kind === 'std' && s.shift === 0 && (s.name.startsWith('std G ') || s.name === 'std default'));
  assert(offCases.length >= 18, `case 1: ${offCases.length} households`);
  for (const sc of offCases) {
    // The binding claim: `off` is the guard-off year whatever the state flag says (flag on and flag off).
    const off = await runMode(page, sc, 'off', null, null, { cliffGuardEnabled: true }),
      offFlagOff = await runMode(page, sc, 'off', null, null, { cliffGuardEnabled: false }),
      dflt = await runMode(page, sc, undefined, null, null, { cliffGuardEnabled: false });
    assert.strictEqual(JSON.stringify(off.rows), JSON.stringify(dflt.rows), `1: ${sc.name}: off (flag on) rows differ from the default guard-off run`);
    assert.strictEqual(off.depletedAge, dflt.depletedAge, `1: ${sc.name}: depletedAge`);
    assert.strictEqual(JSON.stringify(offFlagOff.rows), JSON.stringify(dflt.rows), `1: ${sc.name}: off (flag off) rows differ from the default guard-off run`);
    assert.strictEqual(off.intents, null, `1: ${sc.name}: off records no intents`);
  }

  await page.evaluate(() => {
    window.__test_magiStats.planMissed = 0;
  });

  // 2-4. `choose` records intents; rows label only intents; stay-under years convert nothing. (The plan's list named
  // 'std G mfj 62 aca 400% default' and 'std G two returns 66 irmaa default': `choose` records nothing there, by rule: the
  // converged natural year is already under the line the legacy guard stayed under (two returns 66: natural 234,736 against
  // the 246,646 tier; the legacy guard acted on its first, unconverged pass, 302,082), or only the conversion puts it over
  // (mfj 62 default at 70). Their places: the MFJ ACA household in smooth mode and the 1966 IRMAA household.)
  for (const name of ['std G hoh 62 aca smooth', 'std G single 62 aca smooth', 'std G mfj 62 aca 400% smooth', 'std G hoh 66 1966 household']) {
    const r = await runMode(page, household(name), 'choose');
    const ages = Object.keys(r.intents || {});
    assert(ages.length > 0, `2: ${name}: choose records intents`);
    for (const a of ages) {
      const it = r.intents[a];
      assert(it.kind === 'under' || it.kind === 'fill', `2: ${name}: age ${a} kind ${it.kind}`);
      assert(LINE_IDS.includes(it.line), `2: ${name}: age ${a} line ${it.line}`);
      assert(['H', 'A', 'B'].includes(it.ret), `2: ${name}: age ${a} ret ${it.ret}`);
      assert(it.line !== 'senior' && it.line !== 'ctc', `2: ${name}: age ${a} a tax-family line ${it.line}`);
    }
    for (const row of r.rows) {
      const it = r.intents[row.age];
      assert.strictEqual(!!row.cliffChoice, !!it, `3: ${name}: age ${row.age} cliffChoice "${row.cliffChoice}" vs intent ${JSON.stringify(it)}`);
      assert(!('lambda' in row), `3: ${name}: age ${row.age} has a lambda field`);
      if (it && it.kind === 'under') assert.strictEqual(row.conversionAmount, 0, `4: ${name}: age ${row.age} stays under and converts ${row.conversionAmount}`);
    }
  }
  // A plan wins only when it met its line, so no kept plan year missed it.
  assert.strictEqual(await page.evaluate(() => window.__test_magiStats.planMissed), 0, 'magiStats.planMissed');

  // ---- Task 4: `apply` follows a plan literally; on the deterministic run it replays `choose` exactly. ----
  const resetStats = () =>
    page.evaluate(() => {
      for (const k of Object.keys(window.__test_planStats)) window.__test_planStats[k] = 0;
    });
  const stats = () => page.evaluate(() => ({ ...window.__test_planStats }));
  const same = (a, b, msg) => {
    assert.strictEqual(JSON.stringify(a.rows), JSON.stringify(b.rows), `${msg}: rows differ`);
    assert.strictEqual(a.depletedAge, b.depletedAge, `${msg}: depletedAge`);
  };
  // A hand-built household in the corpus's shape (legacy pooled fields, translated by runMode).
  const hand = (patch) => ({ name: 'hand', patch });

  // T4.1 Exact replay: apply with choose's intents gives choose's rows.
  for (const name of ['std G hoh 62 aca smooth', 'std G single 62 aca smooth', 'std G mfj 62 aca 400% smooth', 'std G hoh 66 1966 household', 'std G mfj 58 aca default']) {
    const ch = await runMode(page, household(name), 'choose');
    await resetStats();
    const ap = await runMode(page, household(name), 'apply', { intents: ch.intents });
    same(ap, ch, `T4.1 ${name}: apply replays choose`);
    const s = await stats();
    assert.strictEqual(s.intentYears, Object.keys(ch.intents).length, `T4.1 ${name}: intentYears`);
    assert.strictEqual(s.applied, Object.keys(ch.intents).length, `T4.1 ${name}: every intent applied (${JSON.stringify(s)})`);
  }

  // T4.2 Marry-later replay. The brief's household (std G two returns 62 aca smooth with marryLater, wedding at 64) records
  // only an 'H' intent at 64 (choose: {64: under aca400 H}), so the pre-wedding check would be vacuous. Found by a grid over
  // spending 40k-100k, traditional 0.5M/1M/1.5M, taxable 0/300k, smooth on/off (all with marryLater, wedding at 64): from
  // spending 80,000 up, choose stays under Partner A's own 400% line at 62 and 63 (ret 'A') and the household line at 64. No
  // grid point gave a 'B' intent: the partners are symmetric, so A's and B's lines translate to the same household MAGI and
  // magiThresholds' $1 dedup keeps A's (Task 1 code, left as is).
  {
    const ML = hand({ ...household('std G two returns 62 aca smooth').patch, marryLater: true, marriageAgeA: 64, spending: 80000 });
    const ch = await runMode(page, ML, 'choose');
    const ages = Object.keys(ch.intents).map(Number);
    assert(ages.length > 0, 'T4.2: choose records intents');
    assert(ages.some((a) => a < 64), `T4.2: an intent before the wedding (${JSON.stringify(ch.intents)})`);
    for (const a of ages) {
      if (a < 64) assert(['A', 'B'].includes(ch.intents[a].ret), `T4.2: age ${a} before the wedding has ret ${ch.intents[a].ret}`);
      else assert.strictEqual(ch.intents[a].ret, 'H', `T4.2: age ${a} after the wedding`);
    }
    same(await runMode(page, ML, 'apply', { intents: ch.intents }), ch, 'T4.2: marry-later replay');
  }

  // T4.3 / T4.4 / T4.7 on std G hoh 62 aca smooth: its first stay-under intent alone.
  const H62 = household('std G hoh 62 aca smooth');
  const h62 = await runMode(page, H62, 'choose');
  const x = Number(Object.keys(h62.intents).find((a) => h62.intents[a].kind === 'under'));
  assert(Number.isFinite(x), 'T4.3: precondition: an under intent');
  const one = { intents: { [x]: h62.intents[x] } };
  {
    // T4.3 Already on the right side: lower spending puts the natural MAGI under the line. (The brief's 30% cut is not enough
    // here: at 42,000 the natural MAGI is still over the 400% line and the intent is applied; the first of 30%, 50%, 70% cuts
    // that puts it under is used.)
    let lower = null,
      ap = null,
      s = null;
    for (const cut of [0.7, 0.5, 0.3]) {
      lower = { spending: H62.patch.spending * cut };
      await resetStats();
      ap = await runMode(page, H62, 'apply', one, null, lower);
      s = await stats();
      if (s.skippedSide) break;
    }
    assert.strictEqual(s.skippedSide, 1, `T4.3: skippedSide (${JSON.stringify(s)}, spending ${lower.spending})`);
    assert(!ap.rows.find((r) => r.age === x).cliffChoice, 'T4.3: row unlabelled');
    same(ap, await runMode(page, H62, 'off', null, null, lower), 'T4.3: equals off');
  }
  {
    // T4.4 Cannot meet the plan: no Roth, cash or taxable money to switch to.
    const broke = { rothIraA: 0, roth401kA: 0, cash: 0, taxable: 0 };
    await resetStats();
    const ap = await runMode(page, H62, 'apply', one, null, broke);
    const s = await stats();
    assert(s.fallback + s.skippedIneligible === 1, `T4.4: fallback or skippedIneligible (${JSON.stringify(s)})`);
    assert(!ap.rows.find((r) => r.age === x).cliffChoice, 'T4.4: row unlabelled');
    same(ap, await runMode(page, H62, 'off', null, null, broke), 'T4.4: equals off');
  }
  {
    // T4.5 Absent: an IRMAA line at 62 (IRMAA is charged two years on, at 64: no Medicare, no IRMAA line built).
    const absent = { intents: { 62: { kind: 'under', line: 'irmaa1', ret: 'H' } } };
    for (const series of [null, { id: 'boom', type: 'boom' }]) {
      await resetStats();
      const ap = await runMode(page, H62, 'apply', absent, series);
      const s = await stats();
      assert.strictEqual(s.absent, 1, `T4.5 (${series ? 'boom' : 'standard'}): absent (${JSON.stringify(s)})`);
      same(ap, await runMode(page, H62, 'off', null, series), `T4.5 (${series ? 'boom' : 'standard'}): equals off`);
    }
  }

  // T4.6 Fill. The brief's household (std G single 58 aca default, Medicaid declined) records no fill. Found by a grid over
  // spending 20k-60k, traditional 300k/1.5M, taxable 0/50k/300k, conversions on/off: with traditional 300,000, taxable 0 and
  // conversions off, spending 30,000 to 45,000 fills to the 100% credit floor at 61 (and stays under the 400% line at 60).
  {
    const F = hand({ ...household('std G single 58 aca default').patch, medicaidWhenEligible: false, spending: 30000, traditional: 300000, taxable: 0, rothConvEnabled: false });
    const ch = await runMode(page, F, 'choose');
    const fa = Object.keys(ch.intents).find((a) => ch.intents[a].kind === 'fill');
    assert(fa !== undefined, `T4.6: choose records a fill (${JSON.stringify(ch.intents)})`);
    same(await runMode(page, F, 'apply', { intents: ch.intents }), ch, 'T4.6: fill replay');
    // Spending raised until the natural MAGI at that age is over the floor: the fill is already done.
    let raised = null;
    for (const sp of [40000, 50000, 60000, 80000, 100000]) {
      await resetStats();
      await runMode(page, F, 'apply', { intents: { [fa]: ch.intents[fa] } }, null, { spending: sp });
      if ((await stats()).skippedSide === 1) {
        raised = sp;
        break;
      }
    }
    assert(raised !== null, 'T4.6: raised spending counts skippedSide');
  }

  // T4.7 Variant: the plan of std G hoh 62 aca smooth on the household retiring 3 years later.
  {
    const later = { retireAgeA: H62.patch.retireAgeA + 3, retireAgeB: H62.patch.retireAgeB + 3 };
    const ap = await runMode(page, H62, 'apply', { intents: h62.intents }, null, later);
    for (const r of ap.rows) if (r.age < later.retireAgeA) assert(!r.cliffChoice, `T4.7: working age ${r.age} labelled ${r.cliffChoice}`);
  }

  // ---- Task 5: the keep rule (rule A) and refreshCliffPlan. ----
  // refreshCliffPlan under a scenario's patch (translated as runMode does); with `applyAll`, also an apply run of choose's
  // intents, measured as refreshCliffPlan measures (depletion, afterTaxEndValueUS, real tax + healthcare).
  const refresh = (sc, extra = {}, applyAll = false, withOff = false) =>
    page.evaluate(
      ({ patch, applyAll, withOff }) => {
        const st = window.__test_getState(),
          saved = JSON.parse(JSON.stringify(st));
        try {
          Object.assign(st, patch);
          const out = window.__test_refreshCliffPlan();
          if (applyAll) {
            const ch = window.__test_runPlanMode({ planMode: 'choose' });
            const r = window.__test_runPlanMode({ planMode: 'apply', plan: { intents: ch.intents } });
            const infl = st.inflation / 100;
            let cost = 0;
            // measure's rule (rowCost): a 162(l)-settled row counts its return's figures
            for (const x of r.rows) cost += (x.taxSettled !== undefined ? x.taxSettled + x.healthcareSettled : x.tax + x.healthcare) / Math.pow(1 + infl, x.year);
            out.applyAll = { depletedAge: r.depletedAge, value: window.__test_afterTaxEndValueUS(r.sim), cost, n: Object.keys(ch.intents).length };
          }
          if (withOff) {
            // A real `off` run, measured as computeCliffPlan measures a candidate.
            const o = window.__test_runPlanMode({ planMode: 'off' });
            out.offRun = { depletedAge: o.depletedAge, value: window.__test_afterTaxEndValueUS(o.sim) };
          }
          return out;
        } finally {
          for (const k of Object.keys(st)) delete st[k];
          Object.assign(st, saved);
          // The restored contents are the same object: plan for them again, so no later default run sees the patch's plan.
          window.__test_refreshCliffPlan();
        }
      },
      { patch: { ...legacyToAccounts(sc.patch, { singlePerson: !!sc.patch.singlePerson }), ...extra }, applyAll, withOff }
    );
  const depOf = (d) => (d == null ? Infinity : d);

  // T5.1 Rule A, pure.
  {
    const better = (a, b) => page.evaluate(([a, b]) => window.__test_planCandidateBetter(a, b), [a, b]);
    assert(await better({ depletedAge: null, value: 0, n: 3 }, { depletedAge: 90, value: 9e6, n: 0 }), 'T5.1: never depleting beats a richer plan that depletes');
    assert(await better({ depletedAge: 90, value: 100, n: 2 }, { depletedAge: 89, value: 1e6, n: 0 }), 'T5.1: later depletion first');
    assert(!(await better({ depletedAge: 89, value: 1e6, n: 0 }, { depletedAge: 90, value: 100, n: 2 })), 'T5.1: earlier depletion loses');
    assert(await better({ depletedAge: null, value: 1002, n: 3 }, { depletedAge: null, value: 1000, n: 0 }), 'T5.1: value higher by 2 wins');
    assert(!(await better({ depletedAge: null, value: 1001, n: 3 }, { depletedAge: null, value: 1000, n: 0 })), 'T5.1: value higher by 1 does not');
    assert(await better({ depletedAge: null, value: 1000, n: 1 }, { depletedAge: null, value: 1000, n: 2 }), 'T5.1: equal value, fewer intents wins');
    assert(!(await better({ depletedAge: null, value: 1000, n: 2 }, { depletedAge: null, value: 1000, n: 0 })), 'T5.1: off is never beaten by a tie');
    assert(!(await better({ depletedAge: null, value: 1000, n: 0 }, { depletedAge: null, value: 1000, n: 0 })), 'T5.1: a tie with itself does not win');
  }

  // T5.2 The kept plan is never worse than off, for every std G household.
  for (const sc of ALL.filter((s) => s.kind === 'std' && s.shift === 0 && s.name.startsWith('std G '))) {
    const { plan, report, offRun } = await refresh(sc, {}, false, true);
    assert(plan, `T5.2 ${sc.name}: guard on gives a plan`);
    // Review follow-up M6: no steering is always the first candidate, and it is the real `off` run.
    assert.strictEqual(report.candidates[0].family, 'none', `T5.2 ${sc.name}: the first candidate is none (${JSON.stringify(report.candidates)})`);
    assert.strictEqual(report.candidates[0].depletedAge, offRun.depletedAge, `T5.2 ${sc.name}: none depletes as off`);
    assert.strictEqual(report.candidates[0].value, offRun.value, `T5.2 ${sc.name}: none's value is off's`);
    const off = report.candidates.find((c) => c.family === 'none'),
      kept = report.candidates.find((c) => c.family === report.kept);
    assert.strictEqual(plan.family, report.kept, `T5.2 ${sc.name}: plan family`);
    assert(depOf(kept.depletedAge) >= depOf(off.depletedAge), `T5.2 ${sc.name}: kept ${report.kept} depletes at ${kept.depletedAge}, off at ${off.depletedAge}`);
    if (depOf(kept.depletedAge) === depOf(off.depletedAge)) assert(kept.value >= off.value, `T5.2 ${sc.name}: kept value ${kept.value} under off's ${off.value}`);
  }

  // T5.3 Family subsets. No std G household's choose plan has both families. Found in tests/solver_scan.js's grid (69 of its
  // 1,536 household x mode runs have both): single person, 58, 1.5M traditional, 300k taxable, spending 130k, no elections,
  // conversions off, default order (it stays under the ACA 400% line and, later, an IRMAA tier). The patch is the one
  // solver_scan.js's patchOf builds for it.
  {
    const SCAN = hand({
      singlePerson: true, children: [], ageA: 58, ageB: 58, retireAgeA: 58, retireAgeB: 58, lifeExpectancyA: 95, lifeExpectancyB: 95,
      acaEnabled: true, acaEnhanced: false, stateTax: 'tx', taxable: 300000, spending: 130000, smoothWithdrawals: false, withdrawalMixEnabled: false,
      rothConvEnabled: false, rothConvStartAge: 58, rothConvEndAge: 72, rothConvBracket: 22, ruleOf55A: false, ruleOf55B: false, sepp72tK401A: false,
      cliffGuardEnabled: true, traditional: 1500000, roth: 200000,
    });
    const both = await refresh(SCAN);
    assert.deepStrictEqual(both.report.candidates.map((c) => c.family), ['none', 'aca', 'irmaa', 'all'], `T5.3: four candidates (${JSON.stringify(both.report)})`);
    const one = await refresh(household('std G hoh 62 aca smooth'));
    assert.deepStrictEqual(one.report.candidates.map((c) => c.family), ['none', 'all'], `T5.3: one family, two candidates (${JSON.stringify(one.report)})`);
  }

  // T5.4 Guard off: no plan.
  {
    const r = await refresh(household('std G hoh 62 aca smooth'), { cliffGuardEnabled: false });
    assert.strictEqual(r.plan, null, 'T5.4: guard off gives no plan');
  }

  // T5.5 The `all` candidate is the choose run itself: it equals an apply run of the same intents.
  for (const name of ['std G hoh 62 aca smooth', 'std G hoh 66 1966 household']) {
    const r = await refresh(household(name), {}, true);
    const all = r.report.candidates.find((c) => c.family === 'all');
    assert(all, `T5.5 ${name}: an all candidate`);
    assert.strictEqual(all.intents, r.applyAll.n, `T5.5 ${name}: intent count`);
    assert.strictEqual(all.depletedAge, r.applyAll.depletedAge, `T5.5 ${name}: depletion`);
    assert.strictEqual(all.value, r.applyAll.value, `T5.5 ${name}: value`);
    assert.strictEqual(all.cost, r.applyAll.cost, `T5.5 ${name}: cost`);
  }

  // 5. yearPlanCandidates, hand-computed (ported from the 8a patch's cliff_guard cases). Common inputs: magiBase 20,000,
  // gain 0, reach 20,000 to 300,000; the premium is 24,697 over a MAGI of 80,000 and 8,059 at or under it (an ACA cliff of
  // 16,638).
  {
    const cands = (spec) =>
      page.evaluate((spec) => {
        const premiumAt = (t, g) => (20000 + t + g > 80000 ? 24697 : 8059),
          irmaaAt = (t, g) => (spec.irmaaOver !== null && 20000 + t + g > spec.irmaaOver ? 1000 : 0);
        return window
          .__test_yearPlanCandidates({ thresholds: spec.lines, natMagi: spec.natMagi, natConv: spec.natConv, natTrad: spec.natTrad, gain: 0, lo: 20000, hi: 300000, magiBase: 20000, canFill: false, premiumAt, irmaaAt })
          .map((p) => `${p.kind} ${p.magi} ${p.label}`);
      }, spec);
    const ACA = { magi: 80000, label: 'ACA 400% line' },
      IRMAA140 = { magi: 140000, label: 'IRMAA tier' },
      CTC = { magi: 120000, label: 'child tax credit phase-out' };
    // IRMAA 1,000 over 140,000; natural MAGI 148,700. Cliffs: ACA 24,697 - 8,059 = 16,638, IRMAA 1,000.
    const base = { lines: [ACA, IRMAA140], irmaaOver: 140000, natMagi: 148700, natConv: 0, natTrad: 100000 };
    assert.deepStrictEqual(await cands(base), ['under 139999 IRMAA tier', 'under 79999 ACA 400% line'], '5: nearest cliff and the largest cliff');
    // 148,700 - 10,000 = 138,700 is not over the tier but is over the ACA line.
    assert.deepStrictEqual(await cands({ ...base, natConv: 10000 }), ['under 79999 ACA 400% line'], '5: only the conversion is over the tier');
    // 78,700 is under both lines.
    assert.deepStrictEqual(await cands({ ...base, natConv: 70000 }), [], '5: only the conversion is over both lines');
    assert.deepStrictEqual(await cands({ ...base, natTrad: 0 }), [], '5: no cappable traditional draw (natTrad 0)');
    // IRMAA 1,000 over 60,000 (below the ACA line), natural 90,000: the nearest line has the largest cliff (16,638 > 1,000).
    assert.deepStrictEqual(await cands({ lines: [{ magi: 60000, label: 'IRMAA tier' }, ACA], irmaaOver: 60000, natMagi: 90000, natConv: 0, natTrad: 50000 }), ['under 79999 ACA 400% line'], '5: nearest is the largest');
    // A child-tax-credit line between them has no premium or IRMAA cliff: never a stay-under.
    assert.deepStrictEqual(await cands({ ...base, lines: [ACA, CTC, IRMAA140] }), ['under 139999 IRMAA tier', 'under 79999 ACA 400% line'], '5: the CTC line is skipped');
    assert.deepStrictEqual(await cands({ lines: [ACA, CTC], irmaaOver: null, natMagi: 130000, natConv: 0, natTrad: 100000 }), ['under 79999 ACA 400% line'], '5: the CTC line is not the nearest cliff');
    assert.deepStrictEqual(await cands({ lines: [CTC], irmaaOver: null, natMagi: 130000, natConv: 0, natTrad: 100000 }), [], '5: a CTC line alone offers nothing');

    // Fill to the nearest floor. Cost (premium, no IRMAA) by MAGI m: 3,000 up to 28,000; 12,000 over it up to 30,000 (a cliff at
    // 28,000); 5,000 over 30,000 up to 40,000 (a floor at 30,000); 2,000 over 40,000 (a floor at 40,000). Natural MAGI 25,000.
    const fills = (spec) =>
      page.evaluate((spec) => {
        const cost = (m) => (m <= 28000 ? 3000 : m <= 30000 ? 12000 : m <= 40000 ? 5000 : 2000);
        return window
          .__test_yearPlanCandidates({ thresholds: spec.lines, natMagi: 25000, natConv: 0, natTrad: spec.natTrad, gain: 0, lo: 20000, hi: spec.hi, magiBase: 20000, canFill: spec.canFill, premiumAt: (t, g) => cost(20000 + t + g), irmaaAt: () => 0 })
          .map((p) => `${p.kind} ${p.magi} ${p.label} ${p.id} ${p.ret}`);
      }, spec);
    const lines = [
      { magi: 28000, label: 'cliff', id: 'aca400', ret: 'H' },
      { magi: 30000, label: 'ACA credit floor (100%)', id: 'acaFloor', ret: 'H' },
      { magi: 40000, label: 'second floor', id: 'medicaid', ret: 'A' },
    ];
    assert.deepStrictEqual(await fills({ lines, canFill: true, hi: 300000, natTrad: 0 }), ['fill 30001 ACA credit floor (100%) acaFloor H'], '5: fill to the nearest floor, past a cliff; id and ret copied');
    assert.deepStrictEqual(await fills({ lines, canFill: false, hi: 300000, natTrad: 0 }), [], '5: no fill without penalty-free traditional money');
    assert.deepStrictEqual(await fills({ lines, canFill: true, hi: 30000, natTrad: 0 }), [], '5: a floor past the reach is not filled');
    // id and ret are copied onto a stay-under too.
    const under = await page.evaluate(() =>
      window.__test_yearPlanCandidates({ thresholds: [{ magi: 80000, label: 'ACA 400% line', id: 'aca400', ret: 'B' }], natMagi: 90000, natConv: 0, natTrad: 1, gain: 0, lo: 20000, hi: 300000, magiBase: 20000, canFill: false, premiumAt: (t, g) => (20000 + t + g > 80000 ? 24697 : 8059), irmaaAt: () => 0 })
    );
    assert.deepStrictEqual(under, [{ kind: 'under', magi: 79999, label: 'ACA 400% line', id: 'aca400', ret: 'B' }], '5: under carries id and ret');
  }

  // ---- Task 6 ----
  // T6.2a The live-mix draw is cappable (fix to Task 1's wd.cappableTraditional): without it choose offers no stay-under in a
  // live-mix household, and this one ran out at 94 where the 3C guard (3ebee0e) lasted to 95.
  {
    const { plan, report } = await refresh(household('std R rothConv+aca+live'));
    assert.strictEqual(report.kept, 'all', `T6.2a: kept ${JSON.stringify(report)}`);
    for (const a of [62, 63, 64, 65]) {
      const it = plan.intents[a];
      assert(it && it.kind === 'under' && it.line === 'aca400', `T6.2a: under aca400 at ${a} (${JSON.stringify(plan.intents)})`);
    }
    const none = report.candidates.find((c) => c.family === 'none'),
      kept = report.candidates.find((c) => c.family === 'all');
    assert(depOf(kept.depletedAge) > depOf(none.depletedAge), `T6.2a: kept depletes at ${kept.depletedAge}, none at ${none.depletedAge}`);
  }

  // T6.9 Stale plans (Review Focus 1; spec section 3): every default projection uses the plan of the state it projects.
  // P = std G hoh 62 aca smooth (its plan keeps ACA stay-unders), R = std G hoh 58 aca smooth (another ACA household whose
  // plan keeps stay-unders at 60-64, P's at 62-64), Q = no line in reach (Texas, no ACA, both 66, spending 60,000).
  {
    const full = (sc, extra = {}) => ({ ...legacyToAccounts(sc.patch, { singlePerson: !!sc.patch.singlePerson }), ...extra });
    const P = full(household('std G hoh 62 aca smooth')),
      R = full(household('std G hoh 58 aca smooth')),
      Q = { stateTax: 'tx', acaEnabled: false, ageA: 66, ageB: 66, retireAgeA: 66, retireAgeB: 66, spending: 60000 };
    const out = await page.evaluate(
      ({ P, R, Q }) => {
        const base = JSON.parse(JSON.stringify(window.__test_getState())),
          raw = (patch) => ({ ...JSON.parse(JSON.stringify(base)), ...JSON.parse(JSON.stringify(patch)) }),
          rowsOf = (sim) => JSON.stringify(sim.rows),
          load = (patch) => {
            window.__test_replaceState(raw(patch));
            return window.__test_refreshCliffPlan().plan;
          },
          // A scenario loaded and planned, then its comparison row.
          loadedMetrics = (patch) => {
            load(patch);
            return window.__test_scenarioMetrics(window.__test_getState());
          },
          r = {};
        try {
          // 1. Replaced before render.
          const planP = load(P);
          r.planPIntents = Object.keys(planP.intents).length;
          window.__test_replaceState(raw(Q));
          r.c1q = rowsOf(window.__test_simulateRaw()) === JSON.stringify(window.__test_runPlanMode({ planMode: 'off' }).rows);
          window.__test_replaceState(raw(R));
          const planR = window.__test_planForState();
          r.planRIntents = Object.keys(planR.intents).length;
          r.c1r = rowsOf(window.__test_simulateRaw()) === JSON.stringify(window.__test_runPlanMode({ planMode: 'apply', plan: planR }).rows);
          r.c1differ = JSON.stringify(planR.intents) !== JSON.stringify(planP.intents);
          // 2. The main plan survives a swap.
          load(P);
          const stP = window.__test_getState(),
            rows0 = rowsOf(window.__test_simulateRaw());
          window.__test_scenarioMetrics(raw(R));
          window.__test_scenarioMetrics(raw(Q));
          r.c2same = window.__test_getState() === stP && rowsOf(window.__test_simulateRaw()) === rows0;
          // 3. A compared scenario shows what loading it shows.
          load(P);
          const m3 = window.__test_scenarioMetrics(raw(R)),
            m3l = loadedMetrics(R);
          r.c3 = [m3.lastsToAge, m3.endAssets, m3l.lastsToAge, m3l.endAssets];
          // 4. The "Current" row equals the dashboard.
          load(P);
          const a = window.__test_scenarioMetrics(window.__test_getState());
          window.__test_setCliffPlan(null);
          const b = window.__test_scenarioMetrics(window.__test_getState());
          window.__test_refreshCliffPlan();
          const a2 = loadedMetrics(P);
          r.c4 = { a, b, a2 };
          // 5. Guard off in a swapped state runs off.
          load(P);
          const m5 = window.__test_scenarioMetrics(raw({ ...R, cliffGuardEnabled: false })),
            m5l = loadedMetrics({ ...R, cliffGuardEnabled: false });
          r.c5 = [JSON.stringify(m5), JSON.stringify(m5l)];
          // 6. Cache churn: 17 swapped states, two passes.
          load(P);
          const pass = () => Array.from({ length: 17 }, (_, i) => JSON.stringify(window.__test_scenarioMetrics(raw({ ...R, spending: 50000 + 1000 * i }))));
          const p1 = pass(),
            p2 = pass();
          r.c6 = p1.every((m, i) => m === p2[i]);
        } finally {
          window.__test_replaceState(base);
          window.__test_refreshCliffPlan();
        }
        return r;
      },
      { P, R, Q }
    );
    assert(out.planPIntents > 0 && out.planRIntents > 0, `T6.9: P and R keep intents (${out.planPIntents}, ${out.planRIntents})`);
    assert(out.c1q, 'T6.9 case 1: Q replaced before render runs off');
    assert(out.c1r, "T6.9 case 1: R replaced before render applies R's own plan");
    assert(out.c1differ, "T6.9 case 1: R's plan differs from P's");
    assert(out.c2same, 'T6.9 case 2: the main plan survives the comparison swaps');
    assert.deepStrictEqual(out.c3.slice(0, 2), out.c3.slice(2), 'T6.9 case 3: a compared scenario shows what loading it shows');
    assert.deepStrictEqual(out.c4.a, out.c4.a2, 'T6.9 case 4: the Current row equals P loaded and planned');
    assert.notStrictEqual(out.c4.a.endAssets, out.c4.b.endAssets, 'T6.9 case 4: the Current row really applied the plan');
    assert.strictEqual(out.c5[0], out.c5[1], 'T6.9 case 5: guard off in a swapped state');
    assert(out.c6, 'T6.9 case 6: cache churn leaves results unchanged');
  }

  // T6.10 planForState keys its plan on the tax year, as refreshCliffPlan does (review follow-ups, finding 3). R = 'std G single 66
  // 500k 300k 130k smooth', the first household found by search (all std scenarios, the std G ACA ones included) whose plan differs
  // between the tax years 2026 and 2027: 2026 keeps no intent, 2027 keeps IRMAA stay-unders at 66 and 67 (the IRMAA edges move).
  {
    const full = (name) => { const sc = household(name); return legacyToAccounts(sc.patch, { singlePerson: !!sc.patch.singlePerson }); };
    const P = full('std G hoh 62 aca smooth'),
      R = full('std G single 66 500k 300k 130k smooth');
    const out = await page.evaluate(
      ({ P, R }) => {
        const base = JSON.parse(JSON.stringify(window.__test_getState())),
          raw = (patch) => ({ ...JSON.parse(JSON.stringify(base)), ...JSON.parse(JSON.stringify(patch)) }),
          r = {};
        try {
          window.__test_replaceState(raw(P));
          window.__test_refreshCliffPlan();
          window.__test_replaceState(raw(R));
          r.p1 = window.__test_planForState(); // R under 2026, now cached
          window.__test_setCurrentYear(2027);
          r.p2 = window.__test_planForState(); // the same state object and JSON, a later tax year
          r.p3 = window.__test_refreshCliffPlan().plan; // R is the current state; the refresh plans under 2027
        } finally {
          window.__test_setCurrentYear(2026);
          window.__test_replaceState(base);
          window.__test_refreshCliffPlan();
        }
        return r;
      },
      { P, R }
    );
    assert.notDeepStrictEqual(out.p1, out.p3, 'T6.10: R plans differently under 2026 and 2027');
    assert.deepStrictEqual(out.p2, out.p3, 'T6.10: planForState plans for the current tax year, not the cached 2026 plan');
  }


  // ---- Task 7: label, summary line, row tooltip. ----
  {
    const sum = (plan, report) => page.evaluate(([p, r]) => window.__test_cliffPlanSummary(p, r), [plan, report]);
    // (a) guard off; (b) empty plan.
    assert.strictEqual(await sum(null, null), 'Cliff plan: off.', 'T7 a');
    assert.strictEqual(await sum({ intents: {}, family: 'none' }, { candidates: [{ family: 'none' }, { family: 'all' }], kept: 'none' }), 'Cliff plan: no steering helps this plan.', 'T7 b');
    // (c) runs, verbs, order, and the unused family.
    const U = (line) => ({ kind: 'under', line, ret: null }),
      F = (line) => ({ kind: 'fill', line, ret: null });
    const rep = { candidates: [{ family: 'none' }, { family: 'aca' }, { family: 'irmaa' }, { family: 'all' }], kept: 'aca' };
    assert.strictEqual(
      await sum({ intents: { 60: U('aca400'), 61: U('aca400'), 62: U('aca400'), 58: F('medicaid') }, family: 'aca' }, rep),
      'Cliff plan: stay under the ACA 400% line at 60-62; fill to the Medicaid line at 58. IRMAA stay-unders not used (no gain over the whole plan).',
      'T7 c'
    );
    // Partner returns, a gap in ages, a tier name, the other unused family, nothing unused when all is kept.
    assert.strictEqual(
      await sum({ intents: { 60: { kind: 'under', line: 'aca400', ret: 'A' }, 62: { kind: 'under', line: 'irmaa2', ret: null }, 63: { kind: 'under', line: 'irmaa2', ret: null } }, family: 'all' }, { ...rep, kept: 'all' }),
      "Cliff plan: stay under the ACA 400% line (Partner A's return) at 60; stay under IRMAA tier 2 at 62-63.",
      'T7 c2'
    );
    assert(
      (await sum({ intents: { 70: U('irmaa1') }, family: 'irmaa' }, { ...rep, kept: 'irmaa' })).endsWith(' ACA steering not used (no gain over the whole plan).'),
      'T7 c3'
    );
    // (d) after a render the element equals the summary of the module plan; (e) tooltip; (f) the real checkbox.
    const P = household('std G hoh 62 aca smooth');
    const patch = legacyToAccounts(P.patch, { singlePerson: !!P.patch.singlePerson });
    const load = (extra) =>
      page.evaluate(
        ({ patch, extra }) => {
          const st = window.__test_getState();
          Object.assign(st, patch, extra);
          window.__test_syncControls();
        },
        { patch, extra: {} }
      );
    await load();
    const click = () => page.evaluate(() => document.getElementById('cliffGuardEnabled').click());
    // Render through the real checkbox: off, then on.
    const snap = () =>
      page.evaluate(() => ({
        text: document.getElementById('cliffPlanSummary').textContent,
        rows: JSON.stringify(window.fireProjectionRows),
        checked: document.getElementById('cliffGuardEnabled').checked,
        tips: [...document.querySelectorAll('#projectionRows .table-status')].map((c) => c.title).filter(Boolean),
        label: document.querySelector('label[for="cliffGuardEnabled"]').textContent.replace(/ +/g, ' ').trim(),
        small: document.querySelector('label[for="cliffGuardEnabled"] small').textContent,
      }));
    if (!(await page.evaluate(() => document.getElementById('cliffGuardEnabled').checked))) await click();
    await click();
    await page.waitForTimeout(500);
    const off = await snap();
    assert.strictEqual(off.checked, false, 'T7 f: unchecked');
    assert.strictEqual(off.text, 'Cliff plan: off.', 'T7 f: off summary');
    const offRows = await page.evaluate(() => JSON.stringify(window.__test_runPlanMode({ planMode: 'off' }).rows));
    assert.strictEqual(off.rows, offRows, 'T7 f: guard off equals the off rows');
    assert.strictEqual(off.tips.length, 0, 'T7 f: no tooltips when off');
    await click();
    await page.waitForTimeout(500);
    const on = await snap();
    assert.strictEqual(on.checked, true, 'T7 f: checked again');
    assert(/^Cliff plan: (stay under|fill to) /.test(on.text), 'T7 f: non-empty summary: ' + on.text);
    assert.notStrictEqual(on.rows, offRows, 'T7 f: the plan changes the rows');
    assert(on.label.startsWith('Cliff plan'), 'T7: label ' + on.label);
    assert.strictEqual(on.small, 'Steer income around cost lines, planned once', 'T7: small');
    // (d)
    const d = await page.evaluate(() => [document.getElementById('cliffPlanSummary').textContent, window.__test_cliffPlanSummary(window.__test_refreshCliffPlan().plan, window.__test_refreshCliffPlan().report)]);
    assert.strictEqual(d[0], d[1], 'T7 d');
    // (e)
    assert(on.tips.length > 0 && on.tips.every((t) => /^Income (stayed under|filled to) /.test(t)), 'T7 e: ' + JSON.stringify(on.tips));
    assert(on.tips.every((t) => !/lambda|first|Drawn from|split|order/i.test(t)), 'T7 e: nothing about lambda, order or split');
    // Mobile: the Task 5 case 3 household (both families), long summary, no horizontal overflow at 390x844.
    const SCAN = hand({
      singlePerson: true, children: [], ageA: 58, ageB: 58, retireAgeA: 58, retireAgeB: 58, lifeExpectancyA: 95, lifeExpectancyB: 95,
      acaEnabled: true, acaEnhanced: false, stateTax: 'tx', taxable: 300000, spending: 130000, smoothWithdrawals: false, withdrawalMixEnabled: false,
      rothConvEnabled: false, rothConvStartAge: 58, rothConvEndAge: 72, rothConvBracket: 22, ruleOf55A: false, ruleOf55B: false, sepp72tK401A: false,
      cliffGuardEnabled: true, traditional: 1500000, roth: 200000,
    });
    await page.evaluate((patch) => {
      Object.assign(window.__test_getState(), patch);
      window.__test_syncControls();
    }, legacyToAccounts(SCAN.patch, { singlePerson: true }));
    await click();
    await click();
    await page.waitForTimeout(500);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    // The SCAN household has candidates in both families but keeps none under the rule (its plan is empty), so the line is
    // also laid out with a synthetic long summary: intents in both families, Partner returns, several runs, an unused family.
    const mob = await page.evaluate(() => {
      document.getElementById('moreResultsCard').open = true;
      const U = (line, ret) => ({ kind: 'under', line, ret }),
        intents = {};
      for (let a = 58; a <= 64; a++) intents[a] = U('aca400', a < 61 ? 'A' : 'B');
      for (let a = 66; a <= 70; a++) intents[a] = U('irmaa3', null);
      intents[57] = { kind: 'fill', line: 'medicaid', ret: null };
      intents[72] = { kind: 'fill', line: 'acaFloor', ret: null };
      const el = document.getElementById('cliffPlanSummary');
      const real = el.textContent;
      el.textContent = window.__test_cliffPlanSummary({ intents }, { candidates: [{ family: 'aca' }, { family: 'irmaa' }], kept: 'none' });
      return { t: el.textContent, real, over: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    assert.strictEqual(mob.real, 'Cliff plan: no steering helps this plan.', 'T7 mobile: real SCAN line');
    assert(/stay under/.test(mob.t) && mob.t.length > 60, 'T7 mobile: long summary: ' + mob.t);
    assert.strictEqual(mob.over, false, 'T7 mobile: no horizontal overflow');
    await page.setViewportSize({ width: 1280, height: 800 });
  }

  // ---- Fix wave (final review) ----
  // F1 The plan is re-chosen only when the inputs change: a render with nothing changed does not re-plan; a changed input,
  // or (test hooks) a changed tax year, does.
  {
    const toggle = () => page.evaluate(() => document.getElementById('themeToggleBtn').click());
    const count = () => page.evaluate(() => window.__test_cliffPlanComputes());
    await toggle();
    const c0 = await count();
    await toggle();
    await toggle();
    assert.strictEqual(await count(), c0, 'F1: two renders with no change plan nothing');
    const before = await page.evaluate(() => window.__test_getState().spending);
    await page.evaluate(() => { window.__test_getState().spending += 1000; });
    await toggle();
    assert.strictEqual(await count(), c0 + 1, 'F1: a changed input re-plans once');
    await page.evaluate((v) => { window.__test_getState().spending = v; }, before);
    await toggle();
    const c1 = await count();
    // A hand-set plan (scans) is not kept by the next refresh.
    await page.evaluate(() => { window.__test_setCliffPlan(null); window.__test_refreshCliffPlan(); });
    assert.strictEqual(await count(), c1 + 1, 'F1: refresh after __test_setCliffPlan re-plans');
    // ensureTestPlan keys on the tax year too: a wrapped hook after __test_setCurrentYear re-plans.
    const c2 = await count();
    await page.evaluate(() => {
      const y = new Date().getFullYear();
      window.__test_setCurrentYear(y + 1);
      window.__test_rothScheduleCost(window.__test_simulateRaw());
      window.__test_setCurrentYear(y);
      window.__test_rothScheduleCost(window.__test_simulateRaw());
    });
    assert.strictEqual(await count(), c2 + 2, 'F1: a changed tax year re-plans (and changing it back re-plans again)');
  }

  // F2 A choose run that records no intent equals the off run (computeCliffPlan reuses it as the 'none' candidate): rows,
  // depletion, after-tax value and ending balances, on the std G households and a sample of tests/solver_scan.js's grid.
  // (A full sweep of the grid in both modes plus every std scenario, 1,114 households without intents, found no difference.)
  {
    const gridPatch = (filing, age, trad, taxable, spending, elections, conv, mode) => ({
      ...(filing === 'mfj' ? { singlePerson: false, filingStatus: 'mfj' } : filing === 'single-couple' ? { singlePerson: false, filingStatus: 'single' } : { singlePerson: true }),
      children: filing === 'hoh' ? [{ birthYear: 2016, student: false }] : [],
      ageA: age, ageB: age, retireAgeA: age, retireAgeB: age, lifeExpectancyA: 95, lifeExpectancyB: 95,
      acaEnabled: true, acaEnhanced: false, stateTax: 'tx', taxable, spending, smoothWithdrawals: mode === 'smooth', withdrawalMixEnabled: false,
      rothConvEnabled: conv, rothConvStartAge: age, rothConvEndAge: Math.max(age, 72), rothConvBracket: 22,
      ruleOf55A: elections === 'rule55', ruleOf55B: elections === 'rule55', sepp72tK401A: elections === 'sepp', cliffGuardEnabled: true,
      ...legacyToAccounts({ traditional: trad, roth: 200000 }, { singlePerson: filing === 'single-person' || filing === 'hoh' }),
    });
    const patches = ALL.filter((x) => x.kind === 'std' && x.shift === 0 && x.name.startsWith('std G ')).map((x) => ({ ...legacyToAccounts(x.patch, { singlePerson: !!x.patch.singlePerson }), cliffGuardEnabled: true }));
    let gi = 0;
    for (const filing of ['mfj', 'single-couple', 'single-person', 'hoh'])
      for (const age of [52, 58, 62, 66])
        for (const trad of [500000, 1500000])
          for (const taxable of [300000, 2000000])
            for (const spending of [60000, 130000])
              for (const elections of ['none', 'rule55', 'sepp'])
                for (const conv of [false, true])
                  if (gi++ % 16 === 0) for (const mode of ['default', 'smooth']) patches.push(gridPatch(filing, age, trad, taxable, spending, elections, conv, mode));
    const out = await page.evaluate((patches) => {
      const st = window.__test_getState(),
        saved = JSON.parse(JSON.stringify(st)),
        res = { none: 0, differ: [], reportDiffer: [] };
      try {
        patches.forEach((patch, i) => {
          for (const k of Object.keys(st)) delete st[k];
          Object.assign(st, JSON.parse(JSON.stringify(saved)), patch);
          const c = window.__test_runPlanMode({ planMode: 'choose', endValue: true }),
            o = window.__test_runPlanMode({ planMode: 'off', endValue: true });
          if (Object.keys(c.intents).length) return;
          res.none++;
          if (JSON.stringify(c.rows) !== JSON.stringify(o.rows) || c.depletedAge !== o.depletedAge || !Object.is(c.value, o.value) || JSON.stringify(c.estate) !== JSON.stringify(o.estate)) res.differ.push(i);
          // The reused candidate is the off run's.
          const none = window.__test_refreshCliffPlan().report.candidates.find((x) => x.family === 'none');
          if (none.depletedAge !== o.depletedAge || !Object.is(none.value, o.value)) res.reportDiffer.push(i);
        });
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
        window.__test_refreshCliffPlan();
      }
      return res;
    }, patches);
    assert(out.none >= 40, `F2: ${out.none} households without intents`);
    assert.deepStrictEqual(out.differ, [], 'F2: choose without intents differs from off');
    assert.deepStrictEqual(out.reportDiffer, [], "F2: the 'none' candidate differs from a real off run");
  }

  // Review follow-up 3 invariant: no recorded intent names a tax-family line (senior, ctc): those are priced by taxFor and
  // are never candidates. Every std G household's `choose` intents.
  {
    let n = 0;
    for (const sc of ALL.filter((x) => x.kind === 'std' && x.shift === 0 && x.name.startsWith('std G '))) {
      const ch = await runMode(page, sc, 'choose');
      for (const a of Object.keys(ch.intents || {})) {
        n++;
        assert(!['senior', 'ctc'].includes(ch.intents[a].line), `FU3: ${sc.name} age ${a} intent names ${ch.intents[a].line}`);
      }
    }
    assert(n > 0, 'FU3: some intents were checked');
  }

  assert.deepStrictEqual(errors, []);
  console.log('cliff_plan: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

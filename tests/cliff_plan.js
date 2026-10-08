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
        const r = window.__test_runPlanMode({ planMode, plan, rowFn });
        return JSON.parse(JSON.stringify({ rows: r.rows, depletedAge: r.depletedAge, intents: r.intents }));
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
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
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);

  // 1. `off` equals `legacy` with the guard off, row for row.
  const offCases = ALL.filter((s) => s.kind === 'std' && s.shift === 0 && (s.name.startsWith('std G ') || s.name === 'std default'));
  assert(offCases.length >= 18, `case 1: ${offCases.length} households`);
  for (const sc of offCases) {
    // The binding claim: `off` is today's guard-off year whatever the state flag says (flag on and flag off).
    const off = await runMode(page, sc, 'off', null, null, { cliffGuardEnabled: true }),
      offFlagOff = await runMode(page, sc, 'off', null, null, { cliffGuardEnabled: false }),
      legacy = await runMode(page, sc, 'legacy', null, null, { cliffGuardEnabled: false });
    assert.strictEqual(JSON.stringify(off.rows), JSON.stringify(legacy.rows), `1: ${sc.name}: off (flag on) rows differ from legacy with the guard off`);
    assert.strictEqual(off.depletedAge, legacy.depletedAge, `1: ${sc.name}: depletedAge`);
    assert.strictEqual(JSON.stringify(offFlagOff.rows), JSON.stringify(legacy.rows), `1: ${sc.name}: off (flag off) rows differ from legacy with the guard off`);
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

  assert.deepStrictEqual(errors, []);
  console.log('cliff_plan: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

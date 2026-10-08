// IRMAA MAGI: Medicare's MAGI is AGI plus tax-exempt interest (42 U.S.C. 1395r(i)(4)(A)), so only the TAXABLE part of
// Social Security counts; the ACA's MAGI (26 U.S.C. 36B(d)(2)(B)) counts all of it. The engine's MAGI is the ACA one;
// irmaaMagiOf converts, magiForIrmaaLine inverts. Spec: docs/superpowers/specs/2026-10-07-irmaa-magi-design.md.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(200);
  const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

  // --- Hand-computed irmaaMagiOf (SS bases: single 25,000 / 34,000 / 4,500; joint 32,000 / 44,000 / 6,000) ---
  const r = await page.evaluate(() => {
    const t = window.__test_tax;
    return {
      // Single, benefit 30,000, no other income: provisional 15,000 <= 25,000, nothing taxable. MAGI 30,000 -> 0.
      lowSingle: t.irmaaMagiOf(30000, 30000, 'single'),
      // Single, benefit 20,000, other 20,000: provisional 30,000; 50% band: min(10,000, 2,500) = 2,500 -> 22,500.
      band50: t.irmaaMagiOf(40000, 20000, 'single'),
      // Single, benefit 40,000, pension 72,000 (MAGI 112,000): provisional 92,000; 85% band hits the cap 34,000 -> 106,000.
      capSingle: t.irmaaMagiOf(112000, 40000, 'single'),
      // Joint, benefit 70,000, other 200,000 (MAGI 270,000): cap 59,500 -> 259,500.
      capJoint: t.irmaaMagiOf(270000, 70000, 'mfj'),
      // Joint, benefit 30,000, other 40,000: provisional 55,000 > 44,000: 0.85 x 11,000 + min(6,000, 15,000) = 15,350
      // (under the cap 25,500) -> 55,350.
      band85: t.irmaaMagiOf(70000, 30000, 'mfj'),
      // Head of household and qualifying surviving spouse read the single bases (FILING 'ss' family): as single.
      hoh: t.irmaaMagiOf(40000, 20000, 'hoh'),
      qss: t.irmaaMagiOf(40000, 20000, 'qss'),
      noBenefit: t.irmaaMagiOf(123456.78, 0, 'mfj'),
      statusKid: t.returnStatusA([{ age: 10, qualifyingChild: true }]),
      statusNone: t.returnStatusA(undefined),
      ssJoint: t.irmaaSsOf({ singlePerson: false, ssA: 1, ssB: 2 }),
      ssOne: t.irmaaSsOf({ singlePerson: true, ssA: 5, ssB: 7 }),
    };
  });
  assert.strictEqual(r.lowSingle, 0, 'nothing taxable below the base');
  near(r.band50, 22500, 1e-9, '50% band');
  near(r.capSingle, 106000, 1e-9, '85% cap, single');
  near(r.capJoint, 259500, 1e-9, '85% cap, joint');
  near(r.band85, 55350, 1e-9, '85% band under the cap');
  near(r.hoh, 22500, 1e-9, 'hoh reads the single SS bases');
  near(r.qss, 22500, 1e-9, 'qss reads the single SS bases');
  assert.strictEqual(r.noBenefit, 123456.78, 'no benefit: the MAGI itself, bit for bit');
  assert.strictEqual(r.statusKid, 'hoh');
  assert.strictEqual(r.statusNone, 'single');
  assert.strictEqual(r.ssJoint, 3);
  assert.strictEqual(r.ssOne, 5);

  // --- The inverse: round trip and monotonicity over a grid (Review Focus 5: the exclusive top bound) ---
  const inv = await page.evaluate(() => {
    const t = window.__test_tax, bad = [];
    for (const filing of ['mfj', 'single', 'hoh', 'qss'])
      for (const ss of [0, 5000, 18000, 40000, 90000]) {
        let prev = -Infinity;
        const lines = [];
        for (let L = 0; L <= 800000; L += 7919) lines.push(L);
        lines.push(109000, 218000, 499999.99, 749999.99);
        lines.sort((a, b) => a - b);
        for (const L of lines) {
          const m = t.magiForIrmaaLine(L, ss, filing);
          if (Math.abs(t.irmaaMagiOf(m, ss, filing) - L) > 1e-6) bad.push({ filing, ss, L, m, back: t.irmaaMagiOf(m, ss, filing) });
          if (m < prev) bad.push({ filing, ss, L, m, prev, why: 'not monotone' });
          if (m < L - 1e-9 || m > L + ss + 1e-9) bad.push({ filing, ss, L, m, why: 'outside [L, L + ss]' });
          prev = m;
        }
      }
    return { bad: bad.slice(0, 5), inf: t.magiForIrmaaLine(Infinity, 40000, 'mfj'), zero: t.magiForIrmaaLine(150000, 0, 'single') };
  });
  assert.deepStrictEqual(inv.bad, [], 'round trip / monotone / bounds');
  assert.strictEqual(inv.inf, Infinity, 'Infinity passes through');
  assert.strictEqual(inv.zero, 150000, 'no benefit: the line itself');

  assert.deepStrictEqual(errors, [], 'no page errors');
  await browser.close();
  console.log('irmaa_magi: all passed');
})().catch((e) => { console.error(e); process.exit(1); });

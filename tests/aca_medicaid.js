// Batch 7O, O1: Medicaid and the premium-credit floor in acaNetCost(). Hand-computed from the 2026
// poverty guideline ($15,650 + $5,500 per extra person, indexed by taxIndexFactor after 2026):
//   * expansion state: MAGI at or under 138% of the line is Medicaid, $0 (checkbox on) or the full premium (off);
//   * non-expansion state: nothing under 100% (full premium), the normal credit from 100%; Wisconsin covers adults to 100%;
//   * from 2027 a retired adult with no child aged 13 or younger fails the work requirement: full premium in the
//     Medicaid band; a household with such a child keeps Medicaid;
//   * above the Medicaid line nothing changes (applicable percentage, 400% cliff).
// Plus the engine: each row's healthcare equals acaNetCost of its own MAGI, with the clock pinned to 2026.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const GROSS = 12000;
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: expected ${b} (+/-${tol}), got ${a}`);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);

  // acaNetCost at `ratio` x the poverty line for `size` people in plan year `yi`, under a state patch.
  const cost = (patch, ratio, size = 1, yi = 0, gross = GROSS) =>
    page.evaluate(
      ({ patch, ratio, size, yi, gross }) => {
        const st = window.__test_getState();
        const saved = JSON.parse(JSON.stringify(st));
        Object.assign(st, patch);
        try {
          const t = window.__test_tax;
          const fpl = (15650 + (size - 1) * 5500) * t.taxIndexFactor(yi);
          return t.acaNetCost(ratio * fpl, size, gross, yi);
        } finally {
          for (const k of Object.keys(st)) delete st[k];
          Object.assign(st, saved);
        }
      },
      { patch, ratio, size, yi, gross },
    );
  const CA = { stateTax: 'ca', acaEnhanced: false, medicaidWhenEligible: true, children: [] };
  const TX = { ...CA, stateTax: 'tx' };
  const WI = { ...CA, stateTax: 'wi' };
  // Applicable percentage 3.14% at 133% rising to 4.19% at 150%: at 140% it is 3.14 + 1.05 * (7/17).
  const pct140 = 3.14 + (1.05 * 7) / 17;

  // Expansion state, 2026 (no work requirement yet).
  near(await cost(CA, 0), 0, 1e-9, 'CA: no income is Medicaid');
  near(await cost(CA, 0.9), 0, 1e-9, 'CA 90%: Medicaid');
  near(await cost(CA, 1.2), 0, 1e-9, 'CA 120%: Medicaid');
  near(await cost(CA, 1.38), 0, 1e-9, 'CA 138%: Medicaid (inclusive)');
  near(await cost(CA, 1.4), (1.4 * 15650 * pct140) / 100, 0.01, 'CA 140%: the credit schedule');
  near(await cost(CA, 1.38), 0, 1e-9, 'CA at the line (tolerance)');
  // Checkbox off: the full unsubsidized premium, never the credit.
  near(await cost({ ...CA, medicaidWhenEligible: false }, 0.9), GROSS, 1e-9, 'CA 90%, Medicaid declined: full premium');
  near(await cost({ ...CA, medicaidWhenEligible: false }, 1.2), GROSS, 1e-9, 'CA 120%, Medicaid declined: full premium');
  near(await cost({ ...CA, medicaidWhenEligible: false }, 1.4), (1.4 * 15650 * pct140) / 100, 0.01, 'declined, above the line: the credit');
  near(await cost(CA, 0.9, 1, 0, 0), 0, 1e-9, 'no premium entered: nothing to pay');

  // Non-expansion state: the 100% floor.
  near(await cost(TX, 0), GROSS, 1e-9, 'TX: no income, no credit, full premium');
  near(await cost(TX, 0.9), GROSS, 1e-9, 'TX 90%: full premium');
  near(await cost(TX, 1.0), (1.0 * 15650 * 2.1) / 100, 0.01, 'TX 100%: 2.10% of income');
  near(await cost(TX, 1.2), (1.2 * 15650 * 2.1) / 100, 0.01, 'TX 120%: 2.10% of income');
  near(await cost(TX, 1.4), (1.4 * 15650 * pct140) / 100, 0.01, 'TX 140%: the credit schedule');
  near(await cost(TX, 4.5), GROSS, 1e-9, 'TX above 400%: the cliff');
  // Wisconsin: BadgerCare to 100%, then the credit.
  near(await cost(WI, 0.9), 0, 1e-9, 'WI 90%: BadgerCare');
  near(await cost(WI, 1.0), 0, 1e-9, 'WI 100%: BadgerCare (inclusive)');
  near(await cost(WI, 1.2), (1.2 * 15650 * 2.1) / 100, 0.01, 'WI 120%: the credit');
  near(await cost({ ...WI, medicaidWhenEligible: false }, 0.9), GROSS, 1e-9, 'WI declined: full premium');

  // Enhanced credits do not change Medicaid or the floor.
  near(await cost({ ...CA, acaEnhanced: true }, 0.9), 0, 1e-9, 'enhanced, CA 90%: Medicaid');
  near(await cost({ ...TX, acaEnhanced: true }, 0.9), GROSS, 1e-9, 'enhanced, TX 90%: no credit below 100%');
  near(await cost({ ...TX, acaEnhanced: true }, 1.2), 0, 1e-9, 'enhanced, TX 120%: 0% of income up to 150%');

  // 2027 work requirement. Plan year 1 is calendar 2027 with the clock pinned to 2026.
  near(await cost(CA, 0.9, 1, 1), GROSS, 1e-9, 'CA 2027, no child: fails the requirement, full premium');
  near(await cost(CA, 1.2, 1, 1), GROSS, 1e-9, 'CA 2027 120%, no child: full premium');
  const f1 = await page.evaluate(() => window.__test_tax.taxIndexFactor(1));
  near(await cost(CA, 1.4, 1, 1), (1.4 * 15650 * f1 * pct140) / 100, 0.01, 'CA 2027 140%: above the line, the credit');
  near(await cost(CA, 0.9, 1, 0), 0, 1e-9, 'CA 2026: the requirement has not started');
  // A child 13 or younger in 2027: a birth year of 2014 is 13, 2013 is 14.
  const kid13 = { ...CA, children: [{ birthYear: 2014 }] },
    kid14 = { ...CA, children: [{ birthYear: 2013 }] },
    kidTwo = { ...CA, children: [{ birthYear: 2010 }, { birthYear: 2022 }] };
  near(await cost(kid13, 0.9, 2, 1), 0, 1e-9, 'CA 2027, child of 13: exempt, Medicaid');
  near(await cost(kid14, 0.9, 2, 1), GROSS, 1e-9, 'CA 2027, child of 14: not exempt');
  near(await cost(kidTwo, 0.9, 3, 1), 0, 1e-9, 'CA 2027, one of two children is young: exempt');
  near(await cost(kid13, 0.9, 2, 2), GROSS, 1e-9, 'CA 2028, the child turned 14: not exempt');
  near(await cost({ ...kid13, medicaidWhenEligible: false }, 0.9, 2, 1), GROSS, 1e-9, 'exempt child, Medicaid declined: full premium');
  // A child not yet born in the tax year does not count.
  near(await cost({ ...CA, children: [{ birthYear: 2031 }] }, 0.9, 1, 1), GROSS, 1e-9, 'CA 2027, child born in 2031: not yet');
  // Wisconsin's waiver covers the same adults, so the requirement applies there too.
  near(await cost(WI, 0.9, 1, 1), GROSS, 1e-9, 'WI 2027, no child: full premium');
  // Non-expansion with no Medicaid: unchanged by the requirement.
  near(await cost(TX, 1.2, 1, 1), (1.2 * 15650 * f1 * 2.1) / 100, 0.01, 'TX 2027 120%: the credit');

  // Every state code resolves to one of the three Medicaid kinds.
  const kinds = await page.evaluate(() => {
    const out = {};
    for (const code of Object.keys(window.__test_tax.STATE_RULES)) {
      const st = window.__test_getState();
      const saved = st.stateTax;
      st.stateTax = code;
      const t = window.__test_tax;
      const fpl = 15650;
      out[code] = [t.acaNetCost(0.5 * fpl, 1, 1000, 0), t.acaNetCost(1.2 * fpl, 1, 1000, 0)];
      st.stateTax = saved;
    }
    return out;
  });
  const NON = ['al', 'fl', 'ga', 'ks', 'ms', 'sc', 'tn', 'tx', 'wi', 'wy'];
  assert.strictEqual(Object.keys(kinds).length, 51, '51 jurisdictions');
  for (const [code, [low, mid]] of Object.entries(kinds)) {
    if (NON.includes(code)) {
      assert.strictEqual(low, code === 'wi' ? 0 : 1000, `${code} at 50%`);
      assert(mid > 0 && mid < 1000, `${code} at 120% pays the credit schedule (${mid})`);
    } else {
      assert.strictEqual(low, 0, `${code} at 50%: Medicaid`);
      assert.strictEqual(mid, 0, `${code} at 120%: Medicaid`);
    }
  }

  // Engine: a retired single person living off a Roth IRA has no taxable income (MAGI 0), no state income tax.
  const rows = (patch) =>
    page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(
        st,
        {
          singlePerson: true, ageA: 55, retireAgeA: 55, lifeExpectancyA: 60, returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0,
          dividendYield: 0, medicalInflation: 0, medicareYearly: 0, ltcEnabled: false, ssMonthlyA: 0, tenure: 'rent', rent: 0, rentGrowth: 0,
          incomeA: 0, taxable: 0, cash: 0, cashReserve: 0, bondYears: 0, spending: 20000, tradIraA: 0, trad401kA: 0, rothIraA: 1000000,
          rothIraBasisA: 1000000, roth401kA: 0, tradIraB: 0, trad401kB: 0, roth401kB: 0, rothIraB: 0, acaEnabled: true, acaEnhanced: false,
          healthcare: 12000, medicaidWhenEligible: true, children: [], rothConvEnabled: false,
        },
        patch,
      );
      try {
        return window.__test_simulate().rows.map((r) => ({ year: r.year, age: r.age, healthcare: r.healthcare, magi: r.magiProxy }));
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, patch);
  let r = await rows({ stateTax: 'wa' });
  near(r[0].healthcare, 0, 1e-6, 'engine WA 2026: Medicaid');
  near(r[1].healthcare, GROSS, 1e-6, 'engine WA 2027: work requirement, full premium');
  r = await rows({ stateTax: 'wa', children: [{ birthYear: 2020 }] });
  near(r[0].healthcare, 0, 1e-6, 'engine WA with a young child 2026');
  near(r[1].healthcare, 0, 1e-6, 'engine WA with a young child 2027: exempt');
  near(r[4].healthcare, 0, 1e-6, 'engine WA with a young child 2030 (child is 10)');
  r = await rows({ stateTax: 'wa', medicaidWhenEligible: false });
  near(r[0].healthcare, GROSS, 1e-6, 'engine WA, Medicaid declined: full premium');
  r = await rows({ stateTax: 'tx' });
  near(r[0].healthcare, GROSS, 1e-6, 'engine TX, MAGI 0: no credit below 100%');
  // Each row's cost is acaNetCost of its own MAGI (the iteration converged at the new cliffs): a taxable
  // account makes MAGI positive, and a child makes the household two.
  for (const st of ['wa', 'tx', 'wi']) {
    const bad = await page.evaluate((st) => {
      const s = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(s));
      Object.assign(s, {
        singlePerson: true, ageA: 55, retireAgeA: 55, lifeExpectancyA: 60, returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0,
        dividendYield: 0, medicalInflation: 0, medicareYearly: 0, ltcEnabled: false, ssMonthlyA: 0, tenure: 'rent', rent: 0, rentGrowth: 0,
        incomeA: 0, taxable: 400000, basisRatio: 50, cash: 0, cashReserve: 0, bondYears: 0, spending: 30000, tradIraA: 0, trad401kA: 0,
        rothIraA: 600000, rothIraBasisA: 600000, roth401kA: 0, tradIraB: 0, trad401kB: 0, roth401kB: 0, rothIraB: 0, acaEnabled: true,
        acaEnhanced: false, healthcare: 12000, medicaidWhenEligible: true, children: [{ birthYear: 2020 }], stateTax: st, rothConvEnabled: false,
      });
      const out = [];
      try {
        for (const r of window.__test_simulate().rows) {
          if (r.age >= 65) continue;
          const want = window.__test_tax.acaNetCost(r.magiProxy, 2, 12000, r.year);
          if (Math.abs(r.healthcare - want) > 1.5) out.push(st + ' year ' + r.year + ': ' + r.healthcare + ' vs ' + want + ' (MAGI ' + r.magiProxy + ')');
        }
      } finally {
        for (const k of Object.keys(s)) delete s[k];
        Object.assign(s, saved);
      }
      return out;
    }, st);
    assert.deepStrictEqual(bad, [], 'row cost equals acaNetCost of its own MAGI: ' + bad.join('; '));
  }

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('[US] Medicaid and credit-floor tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

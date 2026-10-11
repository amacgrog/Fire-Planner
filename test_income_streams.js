// E1b: income stream owner, kind and retirement-contribution panel (US UI). Spec:
// docs/superpowers/specs/2026-10-08-e1b-income-streams-design.md.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'Planner_US.html'));
  await page.waitForTimeout(300);
  const st = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__test_getState().incomeSources)));
  const wrapHidden = (id) =>
    page.evaluate((i) => {
      const el = document.getElementById(i);
      return !el || el.closest('[data-dyn-wrap]').hidden;
    }, id);
  const setSelect = (id, v) =>
    page.evaluate(([i, val]) => {
      const el = document.getElementById(i);
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, v]);
  const setCheck = (id, v) =>
    page.evaluate(([i, val]) => {
      const el = document.getElementById(i);
      el.checked = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, v]);

  // ---- Part 1: inputs ----
  await page.evaluate(() => document.querySelector('[data-dyn-add="incomeSources"]').click());
  await page.waitForTimeout(100);
  assert.strictEqual(await page.evaluate(() => document.getElementById('incSrc0Owner').tagName), 'SELECT');
  assert.strictEqual(await page.evaluate(() => document.getElementById('incSrc0Kind').tagName), 'SELECT');
  assert.strictEqual(await page.evaluate(() => document.getElementById('incSrc0Owner').value), 'A');
  assert.strictEqual(await page.evaluate(() => document.getElementById('incSrc0Kind').value), 'other');
  let s = (await st())[0];
  assert.strictEqual(s.owner, 'A');
  assert.strictEqual(s.kind, 'other');
  assert.strictEqual(s.contribute, false);
  assert.strictEqual(s.deferralType, 'traditional');
  for (const k of ['deferralPct', 'matchPct', 'afterTaxPct', 'personalPct']) assert.strictEqual(s[k], 0, k);
  assert(await wrapHidden('incSrc0Contribute'), 'contribute hidden for Not earned');

  const panel = ['DeferralType', 'DeferralPct', 'MatchPct', 'AfterTaxPct', 'PersonalPct'].map((k) => 'incSrc0' + k);
  await setSelect('incSrc0Kind', 'wages');
  assert.strictEqual((await st())[0].kind, 'wages');
  assert(!(await wrapHidden('incSrc0Contribute')), 'contribute shown for W-2');
  for (const id of panel) assert(await wrapHidden(id), id + ' hidden until ticked');
  await setCheck('incSrc0Contribute', true);
  assert.strictEqual((await st())[0].contribute, true);
  for (const id of panel) assert(!(await wrapHidden(id)), id + ' shown');
  await setSelect('incSrc0Kind', 'other');
  assert(await wrapHidden('incSrc0Contribute'), 'checkbox hides again');
  for (const id of panel) assert(await wrapHidden(id), id + ' hides again');

  // single-person mode hides the owner field
  assert(!(await wrapHidden('incSrc0Owner')), 'owner shown for a couple');
  await setCheck('singlePerson', true);
  assert(await wrapHidden('incSrc0Owner'), 'owner hidden in single-person mode');
  await setCheck('singlePerson', false);
  assert(!(await wrapHidden('incSrc0Owner')), 'owner shown again');

  // autosave round trip
  await setSelect('incSrc0Owner', 'B');
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForTimeout(400);
  assert.strictEqual((await st())[0].owner, 'B', 'owner B survives a reload');

  // normalization of hand-edited saves, through the same normalizer
  const norm = (raw) =>
    page.evaluate((r) => {
      window.__test_replaceState(r);
      return JSON.parse(JSON.stringify(window.__test_getState().incomeSources[0]));
    }, raw);
  let n = await norm({ incomeSources: [{ amount: 10000, startAge: 60, endAge: 70, owner: 'C', kind: 'x', contribute: 'yes', deferralType: 'x', deferralPct: 400, matchPct: -3, afterTaxPct: 'q' }] });
  assert.strictEqual(n.owner, 'A');
  assert.strictEqual(n.kind, 'other');
  assert.strictEqual(n.contribute, false);
  assert.strictEqual(n.deferralType, 'traditional');
  assert.deepStrictEqual([n.deferralPct, n.matchPct, n.afterTaxPct, n.personalPct], [100, 0, 0, 0]);
  n = await norm({ singlePerson: true, incomeSources: [{ amount: 10000, startAge: 60, endAge: 70, owner: 'B' }] });
  assert.strictEqual(n.owner, 'B', 'a stored B is kept in single-person mode');

  // 390 x 844 with the panel open
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-dyn-add="incomeSources"]').click());
  await setSelect('incSrc0Kind', 'wages');
  await setCheck('incSrc0Contribute', true);
  await page.waitForTimeout(200);
  assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, 'no horizontal scroll');
  assert.deepStrictEqual(errors, [], 'page errors');
  console.log('test_income_streams: part 1 passed');
  // ---- Part 2: the engine reads owner and kind ----
  await page.setViewportSize({ width: 1280, height: 900 });
  const fresh = async (patch, streams) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(300);
    await page.evaluate(
      ([p, ls]) => {
        Object.assign(window.__test_getState(), p, { incomeSources: ls });
        document.getElementById('singlePerson').checked = !!p.singlePerson;
        document.getElementById('singlePerson').dispatchEvent(new Event('change', { bubbles: true }));
      },
      [patch, streams],
    );
    await page.waitForTimeout(200);
  };
  const tax0 = () => page.evaluate(() => window.fireProjectionRows[0].tax);
  const RET = { singlePerson: false, ageA: 60, ageB: 58, retireAgeA: 60, retireAgeB: 58, incomeA: 0, incomeB: 0, stateTax: 'tx' };
  const stream = (o) => ({ amount: 40000, startAge: 50, endAge: 70, followGrowth: false, growth: 0, owner: 'B', kind: 'other', contribute: false, deferralType: 'traditional', deferralPct: 0, matchPct: 0, afterTaxPct: 0, personalPct: 0, ...o });
  await fresh(RET, [stream({ kind: 'other' })]);
  const notEarned = await tax0();
  await fresh(RET, [stream({ kind: 'wages' })]);
  const w2 = await tax0();
  assert(w2 > notEarned, `a W-2 stream pays payroll tax (${w2} vs ${notEarned})`);
  await fresh({ ...RET, filingStatus: 'single' }, [stream({ owner: 'A', amount: 50000 }), stream({ owner: 'A', amount: 40000 })]);
  const onA = await tax0();
  await fresh({ ...RET, filingStatus: 'single' }, [stream({ owner: 'A', amount: 50000 }), stream({ owner: 'B', amount: 40000 })]);
  const onB = await tax0();
  assert(onB < onA, `two returns: the owner changes the tax (${onB} vs ${onA})`);
  console.log('test_income_streams: part 2 passed');

  // ---- Part 3: a contributing W-2 stream ----
  const traditionalAfter = () => page.evaluate(() => window.fireProjectionRows[1].traditional);
  await fresh(RET, [stream({ owner: 'A', kind: 'wages', amount: 50000, startAge: 50 })]);
  const taxOff = await tax0();
  const tradOff = await traditionalAfter();
  await fresh(RET, [stream({ owner: 'A', kind: 'wages', amount: 50000, startAge: 50 })]);
  await setCheck('incSrc0Contribute', true);
  await page.evaluate(() => {
    const el = document.getElementById('incSrc0DeferralPct');
    el.value = '100';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const taxOn = await tax0();
  const tradOn = await traditionalAfter();
  assert(taxOn < taxOff, `a traditional deferral lowers tax (${taxOn} vs ${taxOff})`);
  assert(tradOn > tradOff, `and raises the next year's traditional balance (${tradOn} vs ${tradOff})`);
  console.log('test_income_streams: part 3 passed');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

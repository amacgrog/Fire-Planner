// State income tax data table (US, Batch 7C): schema and coverage.
//
// STATE_RULES must hold one row for every option of the state selector (the 50 states and DC),
// and every row must declare every field explicitly (an explicit 'none', [] or 0 where the rule
// does not exist), so a state cannot silently inherit a default. A row marked 'researched' must
// carry a source URL and an as-of year. The rules' arithmetic is covered in tax_brackets.js.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

function checks() {
  const t = window.__test_tax;
  const st = window.__test_getState();
  const rules = t.STATE_RULES;
  const fails = [];
  const need = (cond, msg) => { if (!cond) fails.push(msg); };

  // --- Coverage: the selector and the table list the same 51 jurisdictions ------------------------
  const selector = [...document.querySelectorAll('#stateTax option')].map((o) => o.value).sort();
  const codes = Object.keys(rules).sort();
  need(selector.length === 51, 'selector should list 50 states and DC, found ' + selector.length);
  need(JSON.stringify(selector) === JSON.stringify(codes), 'selector and STATE_RULES differ: ' + selector.filter((c) => !rules[c]) + ' | ' + codes.filter((c) => !selector.includes(c)));
  need(!!rules.dc, 'DC missing');
  const noTax = codes.filter((c) => rules[c].tax.kind === 'none');
  need(JSON.stringify(noTax) === JSON.stringify(['ak', 'fl', 'nh', 'nv', 'sd', 'tn', 'tx', 'wy']), 'unexpected no-tax set: ' + noTax);

  // --- Schema: every field present, nothing extra, values in range -----------------------------------
  const FIELDS = ['name', 'status', 'source', 'asOf', 'indexing', 'statusAs', 'tax', 'surtax', 'base', 'standardDeduction', 'exemption', 'retirementExclusion', 'credits', 'federalTaxSubtraction', 'localTax', 'notes'];
  const EXCLUSION_PARAMS = {
    none: [], full: [], shareByAge: ['minAge'], perEligibleCap: ['minAge', 'cap'],
    perEligibleCapSeniorTier: ['minAge', 'cap', 'seniorAge', 'seniorCap'], seniorCap: ['seniorAge', 'cap'],
  };
  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
  for (const code of codes) {
    const r = rules[code], at = code + ': ';
    const keys = Object.keys(r).sort();
    need(JSON.stringify(keys) === JSON.stringify(FIELDS.slice().sort()), at + 'fields ' + keys.filter((k) => !FIELDS.includes(k)).concat(FIELDS.filter((k) => !(k in r)).map((k) => 'missing ' + k)));
    need(typeof r.name === 'string' && r.name.length > 0, at + 'name');
    need(r.status === 'migrated' || r.status === 'researched', at + 'status');
    if (r.status === 'researched') need(typeof r.source === 'string' && /^https?:\/\//.test(r.source) && Number.isInteger(r.asOf) && r.asOf >= 2025, at + 'researched rows need a source URL and an asOf year');
    else need(r.source === null || typeof r.source === 'string', at + 'source');
    need(r.indexing === 'cpi' || r.indexing === 'none', at + 'indexing');
    const columns = Object.keys(r.standardDeduction);
    need(columns.includes('single') && columns.includes('mfj') && columns.every((c) => ['single', 'mfj', 'hoh'].includes(c)), at + 'columns ' + columns);
    need(JSON.stringify(Object.keys(r.exemption)) === JSON.stringify(columns), at + 'exemption columns');
    for (const c of columns) need(isNum(r.standardDeduction[c]) && r.standardDeduction[c] >= 0 && isNum(r.exemption[c]) && r.exemption[c] >= 0, at + 'deduction amounts ' + c);
    for (const s of ['mfj', 'single', 'hoh', 'qss']) need(columns.includes(r.statusAs[s]), at + 'statusAs.' + s + ' names a column that does not exist');
    need(r.statusAs.mfj === 'mfj' && r.statusAs.single === 'single', at + 'mfj and single read their own columns');
    if (r.tax.kind === 'none') {
      need(!('rate' in r.tax) && !('columns' in r.tax), at + 'a no-tax row carries no rates');
    } else if (r.tax.kind === 'flat') {
      need(isNum(r.tax.rate) && r.tax.rate > 0 && r.tax.rate < 0.15, at + 'flat rate');
    } else if (r.tax.kind === 'graduated') {
      need(JSON.stringify(Object.keys(r.tax.columns)) === JSON.stringify(columns), at + 'bracket columns');
      for (const c of columns) {
        const b = r.tax.columns[c];
        need(Array.isArray(b) && b.length > 0 && b[0][0] === 0, at + c + ' brackets must start at 0');
        for (let i = 0; i < b.length; i++) {
          need(b[i].length === 2 && isNum(b[i][0]) && isNum(b[i][1]) && b[i][1] >= 0 && b[i][1] < 0.15, at + c + ' bracket ' + i);
          if (i) need(b[i][0] > b[i - 1][0], at + c + ' starts not increasing at ' + i);
        }
      }
    } else fails.push(at + 'tax.kind ' + r.tax.kind);
    need(r.surtax.kind === 'none' || (r.surtax.kind === 'threshold' && isNum(r.surtax.threshold) && isNum(r.surtax.rate)), at + 'surtax');
    need(typeof r.base.ordinary === 'boolean' && isNum(r.base.gainsIncluded) && r.base.gainsIncluded >= 0 && r.base.gainsIncluded <= 1, at + 'base');
    const ss = r.base.socialSecurity;
    need(ss === 'exempt' || ss === 'taxed' || (ss && ss.kind === 'subtraction' && isNum(ss.seniorAge) && isNum(ss.belowSeniorCap)), at + 'base.socialSecurity');
    const ex = r.retirementExclusion;
    need(ex && ex.kind in EXCLUSION_PARAMS, at + 'retirementExclusion kind ' + (ex && ex.kind));
    if (ex && ex.kind in EXCLUSION_PARAMS)
      need(JSON.stringify(Object.keys(ex).sort()) === JSON.stringify(['kind'].concat(EXCLUSION_PARAMS[ex.kind]).sort()) && EXCLUSION_PARAMS[ex.kind].every((k) => isNum(ex[k])), at + 'retirementExclusion parameters');
    need(Array.isArray(r.credits), at + 'credits must be a list ([] for none)');
    need(r.federalTaxSubtraction === 'none', at + 'federalTaxSubtraction');
    need(r.localTax === 'notModeled', at + 'localTax');
    need(typeof r.notes === 'string', at + 'notes');
  }

  // --- The evaluator follows the selector (the resolved row is cached per state code) -----------
  const src = { wages: 100000, pension: 0, retirement: 0, gains: 0, taxableSS: 0, ages: [40] };
  const tax = (code) => { st.stateTax = code; return t.stateIncomeTax(src, 'single', 0); };
  st.inflation = 0;
  const ca1 = tax('ca'), tx1 = tax('tx'), ca2 = tax('ca');
  need(tx1 === 0 && ca1 > 5000 && ca1 === ca2, 'switching state must switch the rules (ca ' + ca1 + ', tx ' + tx1 + ', ca again ' + ca2 + ')');
  need(tax('zz') === 0, 'an unknown state code owes nothing');
  st.stateTax = 'tx';
  return fails;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const failures = await page.evaluate(checks);
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  assert.deepStrictEqual(failures, [], 'state rules:\n  ' + failures.join('\n  '));
  console.log('[US] state rules test passed (51 jurisdictions, every field explicit, selector matches the table)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Coverage test for BENEFIT_RULES (Canada): every program present, every field explicit, schema ranges.
// Evaluators are tested with hand-computed cases in tests/benefits.js and against ESDC tables in tests/gis_tables.js.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const IDS = ['gis', 'oas', 'cgeb', 'ccb', 'ocb', 'ostc', 'bcfb', 'acfb', 'absb', 'qcfa', 'oeptc', 'oshptg', 'qcsol', 'qcwp', 'nbpta', 'nsptr'];
const KINDS = ['gisAllowance', 'oasPension', 'familyCredit', 'childSchedule', 'seniorSupplement', 'occupancyCredit', 'quebecCredit'];
const PROVINCES = ['on', 'bc', 'ab', 'sk', 'mb', 'qc', 'nb', 'ns', 'pe', 'nl'];
const ROW_KEYS = ['name', 'kind', 'scope', 'source', 'asOf', 'retrieved', 'verified', 'indexing', 'dependsOn', 'notes'];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_Canada.html'));
  await page.waitForTimeout(300);
  const fails = await page.evaluate(
    ({ IDS, KINDS, PROVINCES, ROW_KEYS }) => {
      const rules = window.__test_tax.BENEFIT_RULES;
      const fails = [];
      for (const id of IDS) if (!rules[id]) fails.push(`${id}: missing`);
      for (const id of Object.keys(rules)) {
        if (!IDS.includes(id)) fails.push(`${id}: unexpected program`);
        const r = rules[id];
        for (const k of ROW_KEYS) if (!(k in r)) fails.push(`${id}: field ${k} missing`);
        if (!KINDS.includes(r.kind)) fails.push(`${id}: unknown kind ${r.kind}`);
        if (!(r.scope === 'federal' || PROVINCES.includes(r.scope))) fails.push(`${id}: bad scope ${r.scope}`);
        if (!/^https:\/\//.test(r.source)) fails.push(`${id}: source must be an https URL`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.retrieved)) fails.push(`${id}: retrieved must be a date`);
        for (const [fam, v] of Object.entries(r.verified)) if (!['primary', 'secondary'].includes(v)) fails.push(`${id}: verified.${fam} must be primary or secondary`);
        if (!Object.keys(r.verified).length) fails.push(`${id}: verified is empty`);
        for (const [k, v] of Object.entries(r.indexing)) if (typeof v !== 'boolean') fails.push(`${id}: indexing.${k} must be a boolean`);
        for (const d of r.dependsOn) if (!rules[d]) fails.push(`${id}: dependsOn ${d} does not resolve`);
        if (typeof r.notes !== 'string' || /'/.test(r.notes)) fails.push(`${id}: notes must be a string without apostrophes`);
        if (r.kind === 'gisAllowance') {
          const keys = ['single', 'spouseOas', 'spouseNoOas', 'couplePensioner', 'coupleAllowance', 'survivorAllowance'];
          for (const k of keys) {
            const kn = r.situations[k];
            if (!kn || kn.length < 3) { fails.push(`${id}: situation ${k} missing`); continue; }
            for (let i = 1; i < kn.length; i++) if (!(kn[i][0] >= kn[i - 1][0])) fails.push(`${id}.${k}: knots not ascending at ${i}`);
            if (kn[kn.length - 1][1] !== 0) fails.push(`${id}.${k}: last knot must be zero`);
            if (kn[0][0] !== 0) fails.push(`${id}.${k}: first knot must start at income 0`);
          }
        }
        if (r.kind === 'oasPension') {
          const f = r.ageFactors;
          if (!(f.length === 1 && f[0].from === 75 && f[0].factor === 1.1 && r.recommendedMonthly > 700)) fails.push(`${id}: bad OAS age factor`);
        }
        if (r.kind === 'seniorSupplement' && !r.dependsOn.includes('oas')) fails.push(`${id}: a senior supplement must depend on oas`);
        if (r.scope !== 'federal' && !['childSchedule', 'familyCredit', 'seniorSupplement', 'occupancyCredit', 'quebecCredit'].includes(r.kind)) fails.push(`${id}: provincial row has a federal-only kind`);
        if (r.kind === 'occupancyCredit' && !['on', 'mb', 'ns', 'nb'].includes(r.scope)) fails.push(`${id}: an occupancy credit must be an Ontario, Manitoba, Nova Scotia or New Brunswick row`);
        if (r.kind === 'quebecCredit' && r.scope !== 'qc') fails.push(`${id}: a Quebec credit must be a Quebec row`);
      }
      return fails;
    },
    { IDS, KINDS, PROVINCES, ROW_KEYS },
  );
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  assert.deepStrictEqual(fails, [], '\n  ' + fails.join('\n  '));
  console.log('benefit rules coverage ok');
})();

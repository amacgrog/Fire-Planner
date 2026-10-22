// Coverage test for BENEFIT_RULES (Canada): every program present, every field explicit, schema ranges.
// Evaluators are tested with hand-computed cases in tests/unit/canada/benefits.test.js and against ESDC tables in tests/unit/canada/gis-tables.test.js.
//
// Converted from tests/benefit_rules.js (Playwright, Planner_Canada.html). The old script executed 979 inline
// `if (...) fails.push(...)` guard evaluations (each evaluation is one check, ported as guard(); the page-error check and
// the final failures assert excluded); this file asserts the same 979. NEW_COUNT tracks the rule table: it moves when a
// program row is added (and with the per-row situation knots of the GIS rows). Each it block sets up its own world.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 979;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// An old `if (bad) fails.push(msg)` guard, as guard(!(bad), msg): one check per evaluation. The expect runs only
// on a failure (same pass/fail result).
const guard = (ok, msg) => {
  c.tick();
  if (!ok) expect.soft(ok, msg).toBe(true);
};

const IDS = ['gis', 'oas', 'cgeb', 'ccb', 'ocb', 'ostc', 'bcfb', 'acfb', 'absb', 'qcfa', 'oeptc', 'oshptg', 'qcsol', 'qcwp', 'nbpta', 'nsptr', 'mbhatc', 'mbsstr', 'mbratc', 'sklitc', 'sksip', 'mbmcb', 'mb55j', 'nsncb', 'nsaltc', 'nbctb', 'nbwis', 'nbss', 'nbhst', 'nblisb', 'nlcb', 'nlis', 'nlsb', 'peicb', 'peieb', 'mb55s'];
const KINDS = ['gisAllowance', 'oasPension', 'familyCredit', 'childSchedule', 'seniorSupplement', 'occupancyCredit', 'quebecCredit'];
const PROVINCES = ['on', 'bc', 'ab', 'sk', 'mb', 'qc', 'nb', 'ns', 'pe', 'nl'];
const ROW_KEYS = ['name', 'kind', 'scope', 'source', 'asOf', 'retrieved', 'verified', 'indexing', 'dependsOn', 'notes'];

async function rulesOf() {
  const w = await world();
  const { BENEFIT_RULES } = await w.load('canada/core/benefits/benefit-rules.js');
  return BENEFIT_RULES;
}

it('every listed program is present', async () => {
  const rules = await rulesOf();
  for (const id of IDS) guard(!(!rules[id]), `${id}: missing`);
});

it('every program: fields, scope, source, verification, indexing and kind-specific shape', async () => {
  const rules = await rulesOf();
  for (const id of Object.keys(rules)) {
    guard(!(!IDS.includes(id)), `${id}: unexpected program`);
    const r = rules[id];
    for (const k of ROW_KEYS) guard(!(!(k in r)), `${id}: field ${k} missing`);
    guard(!(!KINDS.includes(r.kind)), `${id}: unknown kind ${r.kind}`);
    guard(!(!(r.scope === 'federal' || PROVINCES.includes(r.scope))), `${id}: bad scope ${r.scope}`);
    guard(!(!/^https:\/\//.test(r.source)), `${id}: source must be an https URL`);
    guard(!(!/^\d{4}-\d{2}-\d{2}$/.test(r.retrieved)), `${id}: retrieved must be a date`);
    for (const [fam, v] of Object.entries(r.verified)) guard(!(!['primary', 'secondary'].includes(v)), `${id}: verified.${fam} must be primary or secondary`);
    guard(!(!Object.keys(r.verified).length), `${id}: verified is empty`);
    for (const [k, v] of Object.entries(r.indexing)) guard(!(typeof v !== 'boolean'), `${id}: indexing.${k} must be a boolean`);
    for (const d of r.dependsOn) guard(!(!rules[d]), `${id}: dependsOn ${d} does not resolve`);
    guard(!(typeof r.notes !== 'string' || /'/.test(r.notes)), `${id}: notes must be a string without apostrophes`);
    if (r.kind === 'gisAllowance') {
      const keys = ['single', 'spouseOas', 'spouseNoOas', 'couplePensioner', 'coupleAllowance', 'survivorAllowance'];
      for (const k of keys) {
        const kn = r.situations[k];
        const missing = !kn || kn.length < 3;
        guard(!missing, `${id}: situation ${k} missing`);
        if (missing) continue;
        for (let i = 1; i < kn.length; i++) guard(!(!(kn[i][0] >= kn[i - 1][0])), `${id}.${k}: knots not ascending at ${i}`);
        guard(!(kn[kn.length - 1][1] !== 0), `${id}.${k}: last knot must be zero`);
        guard(!(kn[0][0] !== 0), `${id}.${k}: first knot must start at income 0`);
      }
    }
    if (r.kind === 'oasPension') {
      const f = r.ageFactors;
      guard(!(!(f.length === 1 && f[0].from === 75 && f[0].factor === 1.1 && r.recommendedMonthly > 700)), `${id}: bad OAS age factor`);
    }
    guard(!(r.kind === 'seniorSupplement' && !r.dependsOn.includes('oas')), `${id}: a senior supplement must depend on oas`);
    guard(!(r.scope !== 'federal' && !['childSchedule', 'familyCredit', 'seniorSupplement', 'occupancyCredit', 'quebecCredit'].includes(r.kind)), `${id}: provincial row has a federal-only kind`);
    guard(!(r.kind === 'occupancyCredit' && !['on', 'mb', 'ns', 'nb'].includes(r.scope)), `${id}: an occupancy credit must be an Ontario, Manitoba, Nova Scotia or New Brunswick row`);
    guard(!(r.kind === 'quebecCredit' && r.scope !== 'qc'), `${id}: a Quebec credit must be a Quebec row`);
  }
});

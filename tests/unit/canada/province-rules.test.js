// Coverage test for PROVINCE_RULES (Canada): every province present, every field explicit, schema ranges.
// Mechanisms are tested with hand-computed households in tests/unit/canada/tax-brackets.test.js.
//
// Converted from tests/province_rules.js (Playwright, Planner_Canada.html). The old script executed 1,073 inline
// `if (...) fails.push(...)` guard evaluations (each evaluation is one check, ported as guard(); the page-error check and
// the final failures assert excluded); this file asserts the same 1,073. NEW_COUNT tracks the rule table: it moves when a
// province row or a per-row optional block is added. Each it block sets up its own world.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 1073;
const cnt = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(cnt.total).toBe(NEW_COUNT);
});

// An old `if (bad) fails.push(msg)` guard, as guard(!(bad), msg): one check per evaluation. The expect runs only
// on a failure (same pass/fail result).
const guard = (ok, msg) => {
  cnt.tick();
  if (!ok) expect.soft(ok, msg).toBe(true);
};

const PROVINCES = ['on', 'bc', 'ab', 'sk', 'mb', 'qc', 'nb', 'ns', 'pe', 'nl'];
const INDEX_KEYS = ['bracketsIndexed', 'bpaIndexed', 'ageAmountIndexed', 'pensionAmountIndexed', 'surtaxIndexed'];
const ROW_KEYS = ['name', 'source', 'amountsSource', 'asOf', 'retrieved', 'verified', 'creditRate', 'brackets', 'bpa', 'age', 'pension', 'spouse', 'childAmount', 'pooled', 'payroll', 'homeBuyer', 'medical', 'careAtHome', 'lowIncomeReduction', 'healthContributions', 'probate', 'dividend', 'surtax', 'healthPremium', 'indexing', 'notes'];

async function rulesOf() {
  const w = await world();
  const { PROVINCE_RULES } = await w.load('canada/core/tax/province-rules.js');
  return PROVINCE_RULES;
}

it('the ten provinces are present', async () => {
  const rules = await rulesOf();
  const codes = Object.keys(rules);
  guard(!(codes.length !== 10), `expected 10 provinces, found ${codes.length}`);
  for (const c of PROVINCES) guard(!(!rules[c]), `${c}: missing`);
});

it('every province: fields, sources, brackets and the per-family shape', async () => {
  const rules = await rulesOf();
  const codes = Object.keys(rules);
  for (const c of codes) {
    guard(!(!PROVINCES.includes(c)), `${c}: not a province code`);
    const r = rules[c];
    for (const k of ROW_KEYS) guard(!(!(k in r)), `${c}: field ${k} missing`);
    for (const k of Object.keys(r)) guard(!(!ROW_KEYS.includes(k)), `${c}: unknown field ${k}`);
    for (const k of INDEX_KEYS) guard(!(typeof r.indexing[k] !== 'boolean'), `${c}: indexing.${k} must be a boolean`);
    for (const k of ['source', 'amountsSource']) guard(!(!/^https:\/\//.test(r[k])), `${c}: ${k} must be an https URL`);
    guard(!(!/^\d{4}-\d{2}-\d{2}$/.test(r.retrieved)), `${c}: retrieved must be a date`);
    for (const k of ['brackets', 'bpa', 'age', 'pension', 'dividend'])
      guard(!(!['primary', 'secondary'].includes(r.verified[k])), `${c}: verified.${k} must be primary or secondary`);
    // Brackets: increasing caps, increasing rates, open-ended last, and the credit rate is the lowest rate.
    const b = r.brackets;
    for (let i = 1; i < b.length; i++) {
      guard(!(!(b[i][0] > b[i - 1][0])), `${c}: bracket caps not increasing at ${i}`);
      guard(!(!(b[i][1] > b[i - 1][1])), `${c}: bracket rates not increasing at ${i}`);
    }
    guard(!(b[b.length - 1][0] !== Infinity), `${c}: last bracket must be open-ended`);
    guard(!(r.creditRate !== b[0][1]), `${c}: credit rate ${r.creditRate} is not the lowest bracket rate ${b[0][1]}`);
    guard(!(!(r.bpa.amount > 5000 && r.bpa.amount < 30000)), `${c}: basic personal amount out of range`);
    if (r.bpa.phase) {
      const p = r.bpa.phase;
      guard(!(!(p.end > p.start && p.floor >= 0 && p.floor < r.bpa.amount)), `${c}: bad basic personal amount phase-down`);
    }
    if (r.age) {
      guard(!(r.age.rate !== 0.15), `${c}: age amount reduction rate should be 15%`);
      guard(!(!(r.age.amount > 0 && r.age.threshold > 0 && r.age.supplement >= 0)), `${c}: bad age amount`);
    }
    guard(!(r.pension && !(r.pension.amount > 0 && r.pension.amount <= 2000)), `${c}: pension amount out of range`);
    guard(!(!(r.dividend.eligible > 0.04 && r.dividend.eligible < 0.2)), `${c}: eligible dividend credit out of range`);
    guard(!((c === 'on') !== !!r.surtax), `${c}: only Ontario has a surtax`);
    guard(!((c === 'on') !== r.healthPremium), `${c}: only Ontario has a health premium`);
    guard(!((c === 'qc') !== !!r.pooled), `${c}: only Quebec has the pooled amounts`);
    guard(!(!(r.payroll.pensionRate > 0.05 && r.payroll.pensionRate < 0.07)), `${c}: pension contribution rate out of range`);
    guard(!(!!r.payroll.premium !== (c === 'qc')), `${c}: only Quebec has a parental insurance premium`);
    // 7N N4/N10: the EI premium rate (Quebec's is lower, QPIP replaces part of EI) and the province's own home buyers' amount.
    guard(!(!(r.payroll.eiRate > 0.012 && r.payroll.eiRate < 0.017) || (c === 'qc') !== (r.payroll.eiRate < 0.014)), `${c}: EI rate out of range or wrong for Quebec`);
    // 7N N5: every province has a medical expense threshold (Quebec none: 3% of family income); only Ontario has the care-at-home credit.
    guard(!(!r.medical || (c === 'qc') !== (r.medical.threshold === null) || (c === 'qc') !== r.medical.familyIncome), `${c}: medical expense rule wrong`);
    guard(!(r.medical && r.medical.threshold !== null && !(r.medical.threshold > 1000 && r.medical.threshold < 4000)), `${c}: medical threshold out of range`);
    guard(!((c === 'on') !== !!r.careAtHome), `${c}: only Ontario has the Seniors Care at Home credit`);
    // 7N N8: every province has a probate schedule (steps then marginal bands; Manitoba and Quebec none).
    const noProbate = !r.probate || !Array.isArray(r.probate.steps) || !Array.isArray(r.probate.bands);
    guard(!noProbate, `${c}: probate schedule missing`);
    if (!noProbate) {
      for (let i = 1; i < r.probate.steps.length; i++) guard(!(!(r.probate.steps[i][0] > r.probate.steps[i - 1][0] && r.probate.steps[i][1] >= r.probate.steps[i - 1][1])), `${c}: probate steps not increasing`);
      guard(!((c === 'mb' || c === 'qc') !== (r.probate.base === 0 && r.probate.steps.length === 0 && r.probate.bands.length === 0)), `${c}: probate none only in Manitoba and Quebec`);
    }
    // 7N N7: only Quebec has health contributions (the Health Services Fund and the drug premium).
    guard(!((c === 'qc') !== !!r.healthContributions), `${c}: only Quebec has health contributions`);
    guard(!(r.healthContributions && !(r.healthContributions.hsf.t2 > r.healthContributions.hsf.t1 && r.healthContributions.ramq.max > 700)), `${c}: bad health contributions`);
    // 7N N6: low-income tax reductions exist in ON, BC, NB, NL, NS and PE only (the AB, SK, MB and QC forms were read: none).
    const liCodes = ['on', 'bc', 'nb', 'nl', 'ns', 'pe'];
    guard(!(liCodes.includes(c) !== !!r.lowIncomeReduction), `${c}: low-income reduction presence wrong`);
    if (r.lowIncomeReduction) {
      const l = r.lowIncomeReduction;
      guard(!(!['perReturn', 'income', 'family'].includes(l.kind) || !(l.basic > 200 && l.basic < 1200)), `${c}: bad low-income reduction`);
      guard(!((c === 'on') !== (l.kind === 'perReturn') || (c === 'bc') !== (l.kind === 'income')), `${c}: low-income reduction kind wrong`);
    }
    guard(!(r.homeBuyer && !(c === 'sk' || c === 'qc')), `${c}: only Saskatchewan and Quebec have a home buyers amount`);
    guard(!((c === 'sk' || c === 'qc') !== !!r.homeBuyer), `${c}: home buyers amount missing or unexpected`);
    guard(!(c === 'qc' && !(r.pooled.reductionRate === 0.1875 && r.pooled.reductionThreshold > 0 && r.pooled.retirementMultiplier === 1.25)), 'qc: bad pooled reduction');
    // 7N N3: the spouse and eligible-dependant amount (CRA TD1 forms) exists in every province but Quebec; only
    // Saskatchewan has a child amount.
    guard(!((c === 'qc') !== !r.spouse), `${c}: only Quebec has no spouse amount`);
    guard(!(r.spouse && !(r.spouse.amount > 5000 && r.spouse.amount < 30000 && r.spouse.threshold >= 0 && r.spouse.threshold < 3000)), `${c}: spouse amount out of range`);
    guard(!((c === 'sk') !== !!r.childAmount), `${c}: only Saskatchewan has a child amount`);
    guard(!(!r.age && c !== 'qc'), `${c}: age amount missing`);
    guard(!(!r.pension && c !== 'qc'), `${c}: pension amount missing`);
    guard(!(c !== 'mb' && r.bpa.phase), `${c}: only Manitoba has a basic personal amount phase-down in 2026`);
  }
});

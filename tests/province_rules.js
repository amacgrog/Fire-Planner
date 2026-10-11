// Coverage test for PROVINCE_RULES (Canada): every province present, every field explicit, schema ranges.
// Mechanisms are tested with hand-computed households in tests/tax_brackets.js.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const PROVINCES = ['on', 'bc', 'ab', 'sk', 'mb', 'qc', 'nb', 'ns', 'pe', 'nl'];
const INDEX_KEYS = ['bracketsIndexed', 'bpaIndexed', 'ageAmountIndexed', 'pensionAmountIndexed', 'surtaxIndexed'];
const ROW_KEYS = ['name', 'source', 'amountsSource', 'asOf', 'retrieved', 'verified', 'creditRate', 'brackets', 'bpa', 'age', 'pension', 'spouse', 'childAmount', 'pooled', 'payroll', 'homeBuyer', 'medical', 'careAtHome', 'lowIncomeReduction', 'healthContributions', 'probate', 'dividend', 'surtax', 'healthPremium', 'indexing', 'notes'];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_Canada.html'));
  await page.waitForTimeout(300);
  const fails = await page.evaluate(
    ({ PROVINCES, INDEX_KEYS, ROW_KEYS }) => {
      const rules = window.__test_tax.PROVINCE_RULES;
      const fails = [];
      const codes = Object.keys(rules);
      if (codes.length !== 10) fails.push(`expected 10 provinces, found ${codes.length}`);
      for (const c of PROVINCES) if (!rules[c]) fails.push(`${c}: missing`);
      for (const c of codes) {
        if (!PROVINCES.includes(c)) fails.push(`${c}: not a province code`);
        const r = rules[c];
        for (const k of ROW_KEYS) if (!(k in r)) fails.push(`${c}: field ${k} missing`);
        for (const k of Object.keys(r)) if (!ROW_KEYS.includes(k)) fails.push(`${c}: unknown field ${k}`);
        for (const k of INDEX_KEYS) if (typeof r.indexing[k] !== 'boolean') fails.push(`${c}: indexing.${k} must be a boolean`);
        for (const k of ['source', 'amountsSource']) if (!/^https:\/\//.test(r[k])) fails.push(`${c}: ${k} must be an https URL`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.retrieved)) fails.push(`${c}: retrieved must be a date`);
        for (const k of ['brackets', 'bpa', 'age', 'pension', 'dividend'])
          if (!['primary', 'secondary'].includes(r.verified[k])) fails.push(`${c}: verified.${k} must be primary or secondary`);
        // Brackets: increasing caps, increasing rates, open-ended last, and the credit rate is the lowest rate.
        const b = r.brackets;
        for (let i = 1; i < b.length; i++) {
          if (!(b[i][0] > b[i - 1][0])) fails.push(`${c}: bracket caps not increasing at ${i}`);
          if (!(b[i][1] > b[i - 1][1])) fails.push(`${c}: bracket rates not increasing at ${i}`);
        }
        if (b[b.length - 1][0] !== Infinity) fails.push(`${c}: last bracket must be open-ended`);
        if (r.creditRate !== b[0][1]) fails.push(`${c}: credit rate ${r.creditRate} is not the lowest bracket rate ${b[0][1]}`);
        if (!(r.bpa.amount > 5000 && r.bpa.amount < 30000)) fails.push(`${c}: basic personal amount out of range`);
        if (r.bpa.phase) {
          const p = r.bpa.phase;
          if (!(p.end > p.start && p.floor >= 0 && p.floor < r.bpa.amount)) fails.push(`${c}: bad basic personal amount phase-down`);
        }
        if (r.age) {
          if (r.age.rate !== 0.15) fails.push(`${c}: age amount reduction rate should be 15%`);
          if (!(r.age.amount > 0 && r.age.threshold > 0 && r.age.supplement >= 0)) fails.push(`${c}: bad age amount`);
        }
        if (r.pension && !(r.pension.amount > 0 && r.pension.amount <= 2000)) fails.push(`${c}: pension amount out of range`);
        if (!(r.dividend.eligible > 0.04 && r.dividend.eligible < 0.2)) fails.push(`${c}: eligible dividend credit out of range`);
        if ((c === 'on') !== !!r.surtax) fails.push(`${c}: only Ontario has a surtax`);
        if ((c === 'on') !== r.healthPremium) fails.push(`${c}: only Ontario has a health premium`);
        if ((c === 'qc') !== !!r.pooled) fails.push(`${c}: only Quebec has the pooled amounts`);
        if (!(r.payroll.pensionRate > 0.05 && r.payroll.pensionRate < 0.07)) fails.push(`${c}: pension contribution rate out of range`);
        if (!!r.payroll.premium !== (c === 'qc')) fails.push(`${c}: only Quebec has a parental insurance premium`);
        // 7N N4/N10: the EI premium rate (Quebec's is lower, QPIP replaces part of EI) and the province's own home buyers' amount.
        if (!(r.payroll.eiRate > 0.012 && r.payroll.eiRate < 0.017) || (c === 'qc') !== (r.payroll.eiRate < 0.014)) fails.push(`${c}: EI rate out of range or wrong for Quebec`);
        // 7N N5: every province has a medical expense threshold (Quebec none: 3% of family income); only Ontario has the care-at-home credit.
        if (!r.medical || (c === 'qc') !== (r.medical.threshold === null) || (c === 'qc') !== r.medical.familyIncome) fails.push(`${c}: medical expense rule wrong`);
        if (r.medical && r.medical.threshold !== null && !(r.medical.threshold > 1000 && r.medical.threshold < 4000)) fails.push(`${c}: medical threshold out of range`);
        if ((c === 'on') !== !!r.careAtHome) fails.push(`${c}: only Ontario has the Seniors Care at Home credit`);
        // 7N N8: every province has a probate schedule (steps then marginal bands; Manitoba and Quebec none).
        if (!r.probate || !Array.isArray(r.probate.steps) || !Array.isArray(r.probate.bands)) fails.push(`${c}: probate schedule missing`);
        else {
          for (let i = 1; i < r.probate.steps.length; i++) if (!(r.probate.steps[i][0] > r.probate.steps[i - 1][0] && r.probate.steps[i][1] >= r.probate.steps[i - 1][1])) fails.push(`${c}: probate steps not increasing`);
          if ((c === 'mb' || c === 'qc') !== (r.probate.base === 0 && r.probate.steps.length === 0 && r.probate.bands.length === 0)) fails.push(`${c}: probate none only in Manitoba and Quebec`);
        }
        // 7N N7: only Quebec has health contributions (the Health Services Fund and the drug premium).
        if ((c === 'qc') !== !!r.healthContributions) fails.push(`${c}: only Quebec has health contributions`);
        if (r.healthContributions && !(r.healthContributions.hsf.t2 > r.healthContributions.hsf.t1 && r.healthContributions.ramq.max > 700)) fails.push(`${c}: bad health contributions`);
        // 7N N6: low-income tax reductions exist in ON, BC, NB, NL, NS and PE only (the AB, SK, MB and QC forms were read: none).
        const liCodes = ['on', 'bc', 'nb', 'nl', 'ns', 'pe'];
        if (liCodes.includes(c) !== !!r.lowIncomeReduction) fails.push(`${c}: low-income reduction presence wrong`);
        if (r.lowIncomeReduction) {
          const l = r.lowIncomeReduction;
          if (!['perReturn', 'income', 'family'].includes(l.kind) || !(l.basic > 200 && l.basic < 1200)) fails.push(`${c}: bad low-income reduction`);
          if ((c === 'on') !== (l.kind === 'perReturn') || (c === 'bc') !== (l.kind === 'income')) fails.push(`${c}: low-income reduction kind wrong`);
        }
        if (r.homeBuyer && !(c === 'sk' || c === 'qc')) fails.push(`${c}: only Saskatchewan and Quebec have a home buyers amount`);
        if ((c === 'sk' || c === 'qc') !== !!r.homeBuyer) fails.push(`${c}: home buyers amount missing or unexpected`);
        if (c === 'qc' && !(r.pooled.reductionRate === 0.1875 && r.pooled.reductionThreshold > 0 && r.pooled.retirementMultiplier === 1.25)) fails.push('qc: bad pooled reduction');
        // 7N N3: the spouse and eligible-dependant amount (CRA TD1 forms) exists in every province but Quebec; only
        // Saskatchewan has a child amount.
        if ((c === 'qc') !== !r.spouse) fails.push(`${c}: only Quebec has no spouse amount`);
        if (r.spouse && !(r.spouse.amount > 5000 && r.spouse.amount < 30000 && r.spouse.threshold >= 0 && r.spouse.threshold < 3000)) fails.push(`${c}: spouse amount out of range`);
        if ((c === 'sk') !== !!r.childAmount) fails.push(`${c}: only Saskatchewan has a child amount`);
        if (!r.age && c !== 'qc') fails.push(`${c}: age amount missing`);
        if (!r.pension && c !== 'qc') fails.push(`${c}: pension amount missing`);
        if (c !== 'mb' && r.bpa.phase) fails.push(`${c}: only Manitoba has a basic personal amount phase-down in 2026`);
      }
      return fails;
    },
    { PROVINCES, INDEX_KEYS, ROW_KEYS },
  );
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  assert.deepStrictEqual(fails, [], '\n  ' + fails.join('\n  '));
  console.log('province rules coverage ok');
})();

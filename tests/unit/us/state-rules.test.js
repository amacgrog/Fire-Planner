// State income tax data table (US, Batch 7C): schema and coverage.
//
// STATE_RULES must hold one row for every option of the state selector (the 50 states and DC),
// and every row must declare every field explicitly (an explicit 'none', [] or 0 where the rule
// does not exist), so a state cannot silently inherit a default. A row marked 'researched' must
// carry a source URL and an as-of year. The rules' arithmetic is covered in tests/unit/us/tax-brackets.test.js and tests/unit/canada/tax-brackets.test.js.
//
// US only (the Canada province table is covered by tests/unit/canada/province-rules.test.js).
// Converted from tests/state_rules.js (Playwright, one page). The old script executed 3,986 named `need` checks (the
// page-error check and the final failures assert excluded); this file asserts the same 3,986. NEW_COUNT tracks the rule
// table: it moves when a row (or a schedule variant, or a credit) is added or removed. An old `else fails.push(...)`
// branch is `fail()` here (no tick: it only runs on a failure). The state selector's options are read from the markup shell
// (tests/unit/helpers/markup.js). Each it block sets up its own world.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';
import { stateSelectorValues } from '../helpers/markup.js';

const NEW_COUNT = 3986;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// The old need(cond, msg): one check per call.
const need = (cond, msg) => {
  c.tick();
  if (!cond) expect.soft(cond, msg).toBe(true);
};
const fail = (msg) => { expect.soft(false, msg).toBe(true); };

async function rulesOf() {
  const w = await world();
  const { STATE_RULES } = await w.load('us/core/tax/state-rules.js');
  return { w, rules: STATE_RULES };
}

// --- Schema: every field present, nothing extra, values in range -----------------------------------
  const FIELDS = ['name', 'status', 'sourceKind', 'source', 'asOf', 'indexing', 'statusAs', 'tax', 'additions', 'base', 'standardDeduction', 'standardDeductionPhase', 'exemption', 'exemptionPhaseOut', 'dependentExemption', 'seniorExemption', 'federalConformity', 'schedule', 'retirementExclusion', 'inherited', 'credits', 'federalTaxSubtraction', 'localTax', 'notes'];
  const SCHEDULE_KEYS = ['tax', 'additions', 'base', 'standardDeduction', 'standardDeductionPhase', 'exemption', 'exemptionPhaseOut', 'dependentExemption', 'seniorExemption', 'federalConformity', 'retirementExclusion', 'credits', 'federalTaxSubtraction', 'statusAs', 'indexing'];
  const EXCLUSION_PARAMS = {
    none: [],
    perPerson: ['pensionMinAge', 'traditionalMinAge', 'applies', 'tiers', 'reducedBy', 'share'], agiPhasedShare: ['inclusive', 'tables'],
  };
  const CREDIT_PARAMS = {
    exemptionCredits: ['personal', 'personalCount', 'senior', 'dependent', 'phaseOut'], renterCredit: ['amount', 'agiLimit'],
    childCredit: ['tiers', 'phaseOut'], propertyTaxCredit: ['max', 'limit', 'stepWidth', 'stepPct'],
    taxForgiveness: ['limit', 'perDependent', 'stepWidth', 'stepPct'], agiStepFraction: ['tables'],
    incomeTestedCredit: ['amount', 'perSenior', 'perDependent', 'limit', 'taper'], ssCredit: ['rate', 'phase'], taxShareCredit: ['share', 'max'], propertyTaxShareCredit: ['rate', 'agiLimit'], childStepCredit: ['tables'],
  };
  const stepOk = (rows) => Array.isArray(rows) && rows.length > 0 && rows.every((r, i) => r.length === 2 && isNum(r[0]) && isNum(r[1]) && (i === 0 || r[0] > rows[i - 1][0]));
  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
  const checkRow = (r, at) => {
    const keys = Object.keys(r).sort();
    need(JSON.stringify(keys) === JSON.stringify(FIELDS.slice().sort()), at + 'fields ' + keys.filter((k) => !FIELDS.includes(k)).concat(FIELDS.filter((k) => !(k in r)).map((k) => 'missing ' + k)));
    need(typeof r.name === 'string' && r.name.length > 0, at + 'name');
    need(r.status === 'researched', at + 'every row is researched (the migrated status is gone)');
    need(['none', 'secondary', 'primary'].includes(r.sourceKind), at + 'sourceKind');
    need(r.sourceKind !== 'none', at + 'source kind');
    need(typeof r.source === 'string' && /^https?:\/\//.test(r.source) && Number.isInteger(r.asOf) && r.asOf >= 2025, at + 'every row needs a source URL and an asOf year');
    const IDX = ['bracketsIndexed', 'standardDeductionIndexed', 'personalExemptionIndexed', 'creditAmountsIndexed', 'creditThresholdsIndexed', 'retirementExclusionIndexed'];
    need(r.indexing && JSON.stringify(Object.keys(r.indexing)) === JSON.stringify(IDX) && IDX.every((k) => typeof r.indexing[k] === 'boolean'), at + 'indexing must declare every family as a boolean');
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
    } else fail(at + 'tax.kind ' + r.tax.kind);
    need(Array.isArray(r.additions), at + 'additions must be a list ([] for none)');
    for (const a of r.additions || []) {
      need(typeof a.indexed === 'boolean', at + 'every addition says whether it indexes');
      if (a.kind === 'threshold') need((isNum(a.threshold) || columns.every((c) => isNum(a.threshold[c]))) && isNum(a.rate), at + 'threshold addition');
      else if (a.kind === 'agiStep') need(columns.every((c) => stepOk(a.tables[c])), at + 'agiStep tables');
      else if (a.kind === 'benefitRecapture') need(isNum(a.agiStart) && isNum(a.phaseWidth) && isNum(a.flatAbove) && isNum(a.flatRate) && columns.every((c) => stepOk(a.tiers[c])), at + 'benefitRecapture');
      else fail(at + 'addition kind ' + a.kind);
    }
    need(r.exemptionPhaseOut.kind === 'none' || (r.exemptionPhaseOut.kind === 'stepDown' && columns.every((c) => isNum(r.exemptionPhaseOut.start[c])) && (isNum(r.exemptionPhaseOut.step) || columns.every((c) => isNum(r.exemptionPhaseOut.step[c]))) && isNum(r.exemptionPhaseOut.width)) || (r.exemptionPhaseOut.kind === 'linear' && columns.every((c) => isNum(r.exemptionPhaseOut.start[c]) && isNum(r.exemptionPhaseOut.rate[c]) && r.exemptionPhaseOut.rate[c] > 0) && isNum(r.exemptionPhaseOut.full) && r.exemptionPhaseOut.full > 0 && isNum(r.exemptionPhaseOut.dependent)), at + 'exemptionPhaseOut');
    need((isNum(r.dependentExemption) && r.dependentExemption >= 0) || (r.dependentExemption && r.dependentExemption.kind === 'agiTiered' && columns.every((c) => stepOk(r.dependentExemption.tables[c]))) || (r.dependentExemption && r.dependentExemption.kind === 'afterFirst' && isNum(r.dependentExemption.amount) && r.dependentExemption.amount > 0), at + 'dependentExemption');
    const sp = r.standardDeductionPhase;
    if (sp.kind === 'none') need(Object.keys(sp).length === 1, at + 'standardDeductionPhase none carries nothing');
    else if (sp.kind === 'stepDown') need(columns.every((c) => sp.columns[c] && isNum(sp.columns[c].start) && isNum(sp.columns[c].width) && sp.columns[c].width > 0 && isNum(sp.columns[c].step) && sp.columns[c].step > 0 && isNum(sp.columns[c].floor) && sp.columns[c].floor >= 0 && sp.columns[c].floor <= r.standardDeduction[c]), at + 'standardDeductionPhase stepDown');
    else if (sp.kind === 'linear') need(columns.every((c) => sp.columns[c] && isNum(sp.columns[c].start) && isNum(sp.columns[c].end) && sp.columns[c].end > sp.columns[c].start && isNum(sp.columns[c].floor) && sp.columns[c].floor >= 0 && sp.columns[c].floor <= r.standardDeduction[c]), at + 'standardDeductionPhase linear');
    else fail(at + 'standardDeductionPhase kind ' + sp.kind);
    const se = r.seniorExemption;
    if (se.kind === 'none') need(Object.keys(se).length === 1, at + 'seniorExemption none carries nothing');
    else need(se.kind === 'perSenior' && isNum(se.age) && isNum(se.amount) && se.amount > 0 && (se.phaseOut === null || (((isNum(se.phaseOut.rate) && se.phaseOut.rate > 0) || columns.every((c) => isNum(se.phaseOut.rate[c]) && se.phaseOut.rate[c] > 0)) && columns.every((c) => isNum(se.phaseOut.start[c])) && (se.phaseOut.basis === undefined || se.phaseOut.basis === 'federal'))), at + 'seniorExemption');
    const fc = r.federalConformity;
    need(JSON.stringify(Object.keys(fc)) === JSON.stringify(['standardDeduction', 'seniorDeduction', 'ageAdditional']) && Object.values(fc).every((v) => typeof v === 'boolean'), at + 'federalConformity declares three booleans');
    need(fc.standardDeduction || (!fc.seniorDeduction && !fc.ageAdditional), at + 'the senior deduction and the 65+ add-on need the federal standard deduction');
    if (fc.standardDeduction) need(columns.every((c) => r.standardDeduction[c] === 0), at + 'a conforming state carries no standard deduction of its own');
    need(typeof r.base.ordinary === 'boolean' && isNum(r.base.gainsIncluded) && r.base.gainsIncluded >= 0 && r.base.gainsIncluded <= 1, at + 'base');
    need(r.base.gainsRate === null || (isNum(r.base.gainsRate) && r.base.gainsRate > 0 && r.base.gainsRate < 0.15) || (Array.isArray(r.base.gainsRate) && r.tax.kind === 'graduated' && columns.every((c) => r.tax.columns[c].length === r.base.gainsRate.length) && r.base.gainsRate.every((x) => isNum(x) && x >= 0 && x < 0.15)), at + 'base.gainsRate (null, a flat rate, or one rate per bracket)');
    need(isNum(r.base.gainsDeduction) && r.base.gainsDeduction >= 0, at + 'base.gainsDeduction');
    const ss = r.base.socialSecurity;
    need(ss === 'exempt' || ss === 'taxed' || (ss && ss.kind === 'subtraction' && isNum(ss.seniorAge) && isNum(ss.belowSeniorCap)) || (ss && ss.kind === 'agiTested' && isNum(ss.taxedShareOfBenefits) && columns.every((c) => isNum(ss.exemptBelow[c]))) ||
      (ss && ss.kind === 'agiShare' && typeof ss.inclusive === 'boolean' && columns.every((c) => stepOk(ss.tables[c]))) ||
      (ss && ss.kind === 'agiPhaseOut' && columns.every((c) => isNum(ss.start[c]) && isNum(ss.end[c]) && ss.end[c] > ss.start[c])) ||
      (ss && ss.kind === 'ageAgiTiered' && Array.isArray(ss.tiers) && ss.tiers.length > 0 && ss.tiers.every((t, i) => isNum(t.minAge) && (i === 0 || t.minAge > ss.tiers[i - 1].minAge) && isNum(t.capOverLimit) && t.capOverLimit >= 0 && (t.agiLimit === null || columns.every((c) => isNum(t.agiLimit[c]))))), at + 'base.socialSecurity');
    const ex = r.retirementExclusion;
    need(ex && ex.kind in EXCLUSION_PARAMS, at + 'retirementExclusion kind ' + (ex && ex.kind));
    if (ex && ex.kind in EXCLUSION_PARAMS)
      need(JSON.stringify(Object.keys(ex).sort()) === JSON.stringify(['kind'].concat(EXCLUSION_PARAMS[ex.kind]).sort()) && EXCLUSION_PARAMS[ex.kind].every((k) => (k === 'tables' ? columns.every((c) => stepOk(ex.tables[c])) : k === 'inclusive' ? typeof ex[k] === 'boolean' : ex.kind === 'perPerson' && k === 'applies' ? typeof ex.applies.pension === 'boolean' && typeof ex.applies.traditional === 'boolean' : ex.kind === 'perPerson' && k === 'tiers' ? Array.isArray(ex.tiers) && ex.tiers.length > 0 && ex.tiers.every((t, i) => t.length === 2 && isNum(t[0]) && (t[1] === null || (isNum(t[1]) && t[1] >= 0) || (typeof t[1] === 'object' && columns.every((c) => isNum(t[1][c]) && t[1][c] >= 0))) && (i === 0 || t[0] > ex.tiers[i - 1][0])) : ex.kind === 'perPerson' && k === 'reducedBy' ? ['none', 'socialSecuritySubtracted', 'benefitsReceived'].includes(ex.reducedBy) : ex.kind === 'perPerson' && k === 'share' ? ex.share === null || (typeof ex.share.inclusive === 'boolean' && columns.every((c) => stepOk(ex.share.tables[c]))) : isNum(ex[k]))), at + 'retirementExclusion parameters');
    need(Array.isArray(r.credits), at + 'credits must be a list ([] for none)');
    for (const cr of r.credits || []) {
      need(cr.kind in CREDIT_PARAMS && typeof cr.label === 'string' && typeof cr.refundable === 'boolean', at + 'credit kind/label/refundable ' + cr.kind);
      if (cr.kind in CREDIT_PARAMS) need(CREDIT_PARAMS[cr.kind].every((k) => k in cr), at + 'credit ' + cr.kind + ' parameters');
    }
    const ft = r.federalTaxSubtraction;
    need(ft === 'none' || (ft && ft.kind === 'lagged' && ['subtraction', 'itemized'].includes(ft.placement) && (ft.cap === null || columns.every((c) => isNum(ft.cap[c]) && ft.cap[c] >= 0)) && (ft.phase === null || ((ft.phase.basis === 'cap' || ft.phase.basis === 'tax') && columns.every((c) => stepOk(ft.phase.tables[c])))) && JSON.stringify(Object.keys(ft).sort()) === JSON.stringify(['cap', 'kind', 'phase', 'placement'])), at + 'federalTaxSubtraction');
    need(r.localTax === 'notModeled' || (r.localTax && r.localTax.kind === 'flat' && isNum(r.localTax.rate) && r.localTax.rate > 0 && r.localTax.rate < 0.06 && Object.keys(r.localTax).length === 2), at + 'localTax');
    need(typeof r.notes === 'string', at + 'notes');
  };

it('coverage: the selector and the table list the same 51 jurisdictions', async () => {
  const { rules } = await rulesOf();
  const selector = stateSelectorValues().sort();
  const codes = Object.keys(rules).sort();
  need(selector.length === 51, 'selector should list 50 states and DC, found ' + selector.length);
  need(JSON.stringify(selector) === JSON.stringify(codes), 'selector and STATE_RULES differ: ' + selector.filter((c) => !rules[c]) + ' | ' + codes.filter((c) => !selector.includes(c)));
  need(!!rules.dc, 'DC missing');
  const noTax = codes.filter((c) => rules[c].tax.kind === 'none');
  need(JSON.stringify(noTax) === JSON.stringify(['ak', 'fl', 'nh', 'nv', 'sd', 'tn', 'tx', 'wy']), 'unexpected no-tax set: ' + noTax);
});

it('schema: every row and every scheduled variant', async () => {
  const { rules } = await rulesOf();
  const codes = Object.keys(rules).sort();
  for (const code of codes) {
    const r = rules[code], at = code + ': ';
    checkRow(r, at);
    // A scheduled change replaces whole fields from a tax year on; each variant is a complete row that must pass the same checks.
    need(Array.isArray(r.schedule), at + 'schedule must be a list ([] for none)');
    need(r.tax.kind !== 'none' || r.schedule.length === 0, at + 'a no-tax row has no schedule');
    need(r.schedule.every((s) => !('federalTaxSubtraction' in s) || (s.federalTaxSubtraction === 'none') === (r.federalTaxSubtraction === 'none')), at + 'a schedule cannot add or drop the federal tax deduction');
    let prevYear = 2025, built = r;
    for (const s of r.schedule || []) {
      const { fromYear, baseYear, ...over } = s;
      need(Number.isInteger(fromYear) && fromYear > prevYear, at + 'schedule years must increase and start after 2025');
      need(baseYear === undefined || (Number.isInteger(baseYear) && baseYear >= fromYear), at + 'schedule baseYear is not before fromYear');
      need(Object.keys(over).length > 0 && Object.keys(over).every((k) => SCHEDULE_KEYS.includes(k)), at + 'schedule overrides ' + Object.keys(over));
      prevYear = fromYear;
      built = { ...built, ...over, schedule: [] };
      checkRow(built, at + 'schedule ' + fromYear + ': ');
    }
  }
});

it('E1e: every row declares how it taxes an inherited traditional draw', async () => {
  const { rules } = await rulesOf();
  // E1e: every row declares how it taxes an inherited traditional draw (spec 6.4, appendix A).
  const INH_KINDS = ['ordinary', 'exempt', 'heir', 'heirAnyAge', 'decedent'];
  for (const [code, row] of Object.entries(rules)) {
    const inh = row.inherited;
    need(!!inh && INH_KINDS.includes(inh.kind), code + ': inherited.kind missing or invalid');
    if (!inh) continue;
    need(inh.kind === 'decedent' ? typeof inh.cap === 'number' && inh.cap > 0 && Object.keys(inh).length === 2
      : Object.keys(inh).length === 1, code + ': inherited carries kind only (decedent: kind and a positive cap)');
    if (inh.kind === 'heir' || inh.kind === 'heirAnyAge') {
      need(row.retirementExclusion.kind !== 'none', code + ': ' + inh.kind + ' needs a retirement exclusion');
      // The heir exclusion is not gated by rule.ordinary (spec 6.4): a heir row must tax ordinary income. No row breaks
      // this today; the check keeps it so.
      need(row.base.ordinary === true, code + ': ' + inh.kind + ' needs base.ordinary');
    }
    if (inh.kind === 'heirAnyAge') need(row.retirementExclusion.kind === 'perPerson', code + ': heirAnyAge needs perPerson');
  }
  // The assignments of spec appendix A, pinned.
  const EXPECT = { pa: 'exempt', il: 'exempt', ms: 'exempt', ia: 'exempt', ny: 'decedent', co: 'heirAnyAge', ar: 'heirAnyAge',
    ok: 'heirAnyAge', ga: 'heir', ct: 'heir', de: 'heir', ky: 'heir', la: 'heir', mo: 'heir', nj: 'heir', wi: 'heir' };
  for (const [code, row] of Object.entries(rules)) {
    const want = EXPECT[code] || 'ordinary';
    need(!row.inherited || row.inherited.kind === want, code + ': inherited ' + (row.inherited && row.inherited.kind) + ', expected ' + want);
  }
  need(!rules.ny.inherited || rules.ny.inherited.cap === 20000, 'ny: decedent cap 20000');
});

it("the per-person exclusion's buckets", async () => {
  const { rules } = await rulesOf();
  // The per-person exclusion's buckets: pension and traditional always, two optional employer-plan flags, all booleans.
  // employerPlanOnly (Rhode Island: a traditional draw qualifies only for its 401(k) part, never an IRA) needs the traditional bucket.
  const APPLIES = ['pension', 'traditional', 'employerPlanAfterRetirement', 'employerPlanOnly'];
  for (const [code, row] of Object.entries(rules)) {
    for (const ex of [row.retirementExclusion].concat((row.schedule || []).map((s) => s.retirementExclusion).filter(Boolean))) {
      if (ex.kind !== 'perPerson') continue;
      need(Object.keys(ex.applies).every((k) => APPLIES.includes(k) && typeof ex.applies[k] === 'boolean'), code + ': retirementExclusion.applies keys');
      need(!ex.applies.employerPlanOnly || ex.applies.traditional, code + ': employerPlanOnly needs the traditional bucket');
    }
  }
  need(rules.ri.retirementExclusion.applies.employerPlanOnly === true, 'ri: IRA income never qualifies (PUB 2026-01): employerPlanOnly');
});

it('the evaluator follows the selector (the resolved row is cached per state code)', async () => {
  const { w } = await rulesOf();
  const { stateIncomeTax } = await w.load('us/core/tax/state-tax.js');
  const st = await w.setState();
  w.setTaxYear(2026);
  const src = { wages: 100000, pension: 0, retirement: 0, gains: 0, taxableSS: 0, ages: [40] };
  const tax = (code) => { st.stateTax = code; return stateIncomeTax(ctx, src, 'single', 0); };
  st.inflation = 0;
  const ctx = await w.ctx();
  const ca1 = tax('ca'), tx1 = tax('tx'), ca2 = tax('ca');
  need(tx1 === 0 && ca1 > 5000 && ca1 === ca2, 'switching state must switch the rules (ca ' + ca1 + ', tx ' + tx1 + ', ca again ' + ca2 + ')');
  need(tax('zz') === 0, 'an unknown state code owes nothing');
});

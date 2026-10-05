#!/usr/bin/env node
// Generates docs/state-tax-rules.md, the review artifact for the US state-tax table, from the
// STATE_RULES block in Planner_US.html (between the `STATE_RULES:begin` / `end` comments, which
// holds pure literals). One row per jurisdiction with every rule and its source.
//
//   node scripts/gen-state-rules.js           write docs/state-tax-rules.md
//   node scripts/gen-state-rules.js --check   exit 1 if the file is stale (run by `npm test`)
//
// Not needed to run the planner. Line endings are ignored when comparing (the working tree is CRLF).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const PLANNER = path.join(root, 'Planner_US.html');
const OUT = path.join(root, 'docs', 'state-tax-rules.md');
const norm = (s) => s.replace(/\r\n/g, '\n');

function loadRules() {
  const html = norm(fs.readFileSync(PLANNER, 'utf8'));
  const a = html.indexOf('// STATE_RULES:begin'),
    b = html.indexOf('// STATE_RULES:end');
  if (a < 0 || b < a) throw new Error('STATE_RULES markers not found in Planner_US.html');
  const body = html.slice(a, b);
  return vm.runInNewContext(body + '\nSTATE_RULES;');
}

const money = (n) => '$' + Number(n).toLocaleString('en-US');
const pct = (r) => +(r * 100).toFixed(4) + '%';
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function taxText(t) {
  if (t.kind === 'none') return 'none';
  if (t.kind === 'flat') return 'flat ' + pct(t.rate);
  const cols = Object.values(t.columns),
    top = Math.max(...cols.map((c) => c[c.length - 1][1])),
    low = Math.min(...cols.map((c) => c[0][1]));
  return `graduated ${pct(low)} to ${pct(top)} (${cols[0].length} brackets)`;
}
function baseText(b) {
  const parts = [];
  parts.push(b.ordinary ? 'wages, pensions, withdrawals' : 'ordinary income not taxed');
  parts.push(b.gainsIncluded === 1 ? 'gains in full' : `gains ${pct(b.gainsIncluded)} included`);
  if (b.gainsRate !== null) parts.push(`gains taxed separately at ${pct(b.gainsRate)}`);
  if (b.gainsDeduction > 0) parts.push(`${money(b.gainsDeduction)} gains exclusion`);
  const ss = b.socialSecurity;
  const ssText = {
    agiTested: () => `Social Security exempt below an AGI, else ${pct(ss.taxedShareOfBenefits)} of benefits taxed`,
    agiShare: () => 'Social Security subtracted by an AGI step table',
    agiPhaseOut: () => 'Social Security subtraction phased out by AGI',
    ageAgiTiered: () => 'Social Security subtracted by age and AGI tiers (per filer)',
    subtraction: () => `Social Security subtracted (all at ${ss.seniorAge}+, else up to ${money(ss.belowSeniorCap)})`,
  };
  parts.push(ss === 'exempt' ? 'Social Security exempt' : ss === 'taxed' ? 'taxable Social Security included' : ssText[ss.kind]());
  return parts.join('; ');
}
function exclusionText(e) {
  switch (e.kind) {
    case 'none': return 'none';
    case 'full': return 'all pension and traditional income';
    case 'shareByAge': return `all, scaled by the share of filers ${e.minAge}+`;
    case 'perEligibleCap': return `up to ${money(e.cap)} per filer ${e.minAge}+`;
    case 'perEligibleCapSeniorTier': return `up to ${money(e.cap)} per filer ${e.minAge}+, ${money(e.seniorCap)} if anyone is ${e.seniorAge}+`;
    case 'seniorCap': return `up to ${money(e.cap)} per filer ${e.seniorAge}+`;
    case 'perPerson': {
      const buckets = [e.applies.pension ? `pension from ${e.pensionMinAge}` : '', e.applies.traditional ? `traditional withdrawals from ${e.traditionalMinAge}` : ''].filter(Boolean).join(', ');
      const caps = e.tiers.map(([age, cap]) => (cap === null ? `no limit from ${age}` : `${money(cap)} from ${age}`)).join(', ');
      const extras = [e.reducedBy === 'none' ? '' : `reduced by ${e.reducedBy === 'benefitsReceived' ? 'all benefits received' : 'the Social Security subtraction'}`, e.share ? 'times an AGI share' : ''].filter(Boolean).join(', ');
      return `per filer: ${buckets}; cap ${caps}${extras ? '; ' + extras : ''}`;
    }
    case 'agiPhasedShare': return 'all, phased out by AGI (step table)';
    default: return JSON.stringify(e);
  }
}
function creditsText(list) {
  if (!list.length) return 'none';
  return list.map((c) => `${c.label}${c.refundable ? ' (refundable)' : ''}`).join('; ');
}
function indexingText(ix, long) {
  const on = Object.entries(ix).filter(([, v]) => v).map(([k]) => k.replace(/Indexed$/, ''));
  const off = Object.entries(ix).filter(([, v]) => !v).map(([k]) => k.replace(/Indexed$/, ''));
  if (!off.length) return 'all indexed';
  if (!on.length) return 'none indexed';
  return long ? `indexed: ${on.join(', ')}; not indexed: ${off.join(', ')}` : `indexed: ${on.length} of ${on.length + off.length} (not: ${off.join(', ')})`;
}
function additionsText(list) {
  if (!list.length) return 'none';
  return list.map((a) => (a.kind === 'threshold' ? `${pct(a.rate)} over ${typeof a.threshold === 'number' ? money(a.threshold) : Object.entries(a.threshold).map(([k, v]) => k + ' ' + money(v)).join(' / ')}${a.indexed ? '' : ' (fixed)'}` : a.kind === 'agiStep' ? a.label : a.kind === 'benefitRecapture' ? `benefit recapture from ${money(a.agiStart)} AGI` : a.kind)).join('; ');
}
function deductionText(r) {
  const col = (k) => {
    const s = r.standardDeduction[k], e = r.exemption[k];
    return s || e ? `${money(s)}${e ? ' + ' + money(e) + ' exemption' : ''}` : '0';
  };
  const conf = r.federalConformity.standardDeduction ? 'federal standard deduction' : '';
  const extras = [conf, r.standardDeductionPhase.kind === 'none' ? '' : 'phased by AGI', r.seniorExemption.kind === 'none' ? '' : 'senior exemption', r.schedule.length ? 'scheduled changes ' + r.schedule.map((s) => s.fromYear).join(', ') : '', r.federalTaxSubtraction === 'none' ? '' : 'federal income tax deducted', r.localTax === 'notModeled' ? '' : `local tax ${pct(r.localTax.rate)}`].filter(Boolean);
  return Object.keys(r.standardDeduction).map((k) => `${k} ${col(k)}`).join(', ') + (extras.length ? ' (' + extras.join('; ') + ')' : '');
}
function sourceText(r) {
  return r.source ? `[${r.status}, ${r.sourceKind}, ${r.asOf}](${r.source})` : r.status + ' (no source recorded)';
}

function generate(rules) {
  const codes = Object.keys(rules);
  const L = [];
  L.push('# State income tax rules (generated)');
  L.push('');
  L.push('Generated by `node scripts/gen-state-rules.js` from `STATE_RULES` in `Planner_US.html`; do not edit by hand.');
  L.push('`npm test` fails if this file is stale. Amounts are 2026 dollars. `migrated` rows are the pre-7C simplified figures,');
  L.push('carried over unverified (no source); `researched` rows cite the source and as-of year shown.');
  L.push('');
  L.push(`${codes.length} jurisdictions: ${codes.filter((c) => rules[c].status === 'researched').length} researched, ${codes.filter((c) => rules[c].status === 'migrated').length} migrated.`);
  L.push('');
  L.push('**Not modeled (documented gap):** local income taxes (for example NYC, parts of PA, OH, MD and IN).');
  L.push('');
  L.push('## Rules');
  L.push('');
  L.push('| Code | Jurisdiction | Status / source | Tax | Indexing | HoH / QSS read | Base | Deduction | Retirement exclusion | Additions | Credits |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of codes) {
    const r = rules[c];
    L.push('| ' + [c.toUpperCase(), r.name, sourceText(r), taxText(r.tax), indexingText(r.indexing), `${r.statusAs.hoh} / ${r.statusAs.qss}`, baseText(r.base), deductionText(r), exclusionText(r.retirementExclusion), additionsText(r.additions), creditsText(r.credits)].map(cell).join(' | ') + ' |');
  }
  const noted = codes.filter((c) => rules[c].notes);
  if (noted.length) {
    L.push('');
    L.push('## Notes');
    L.push('');
    for (const c of noted) L.push(`- **${c.toUpperCase()}**: ${rules[c].notes}`);
  }
  const researched = codes.filter((c) => rules[c].status === 'researched');
  if (researched.length) {
    L.push('');
    L.push('## Researched rows in detail');
    L.push('');
    L.push('Every parameter of the mechanisms the rows use (credits, additions, exclusions, step tables), as the planner reads them.');
    for (const c of researched) {
      const r = rules[c];
      L.push('');
      L.push(`### ${c.toUpperCase()} ${r.name}`);
      L.push('');
      L.push(`Indexing: ${indexingText(r.indexing, true)}. Columns: ${Object.keys(r.standardDeduction).join(', ')}; head of household reads ${r.statusAs.hoh}, surviving spouse ${r.statusAs.qss}.`);
      for (const [label, value] of [['Social Security', r.base.socialSecurity], ['Retirement exclusion', r.retirementExclusion], ['Exemption step-down', r.exemptionPhaseOut], ['Dependent exemption', r.dependentExemption], ['Standard deduction phase', r.standardDeductionPhase], ['Senior exemption', r.seniorExemption], ['Federal conformity', r.federalConformity.standardDeduction ? r.federalConformity : { kind: 'none' }], ['Scheduled changes', r.schedule.length ? r.schedule : 0]]) {
        if (typeof value === 'object' && value !== null && value.kind === 'none') continue;
        if (value === 'exempt' || value === 0) continue;
        L.push(`- ${label}: \`${JSON.stringify(value)}\``);
      }
      for (const a of r.additions) L.push(`- Addition: \`${JSON.stringify(a)}\``);
      for (const cr of r.credits) L.push(`- Credit: \`${JSON.stringify(cr)}\``);
    }
  }
  L.push('');
  L.push('## Brackets');
  L.push('');
  L.push('Lower bound of each bracket and its rate; the last bracket is open-ended.');
  L.push('');
  for (const c of codes) {
    const r = rules[c];
    if (r.tax.kind === 'none') continue;
    if (r.tax.kind === 'flat') { L.push(`- **${c.toUpperCase()}** ${r.name}: flat ${pct(r.tax.rate)}`); continue; }
    for (const [k, b] of Object.entries(r.tax.columns)) L.push(`- **${c.toUpperCase()}** ${r.name}, ${k}: ` + b.map(([s, rate]) => `${money(s)} ${pct(rate)}`).join('; '));
  }
  L.push('');
  return L.join('\n');
}

const text = generate(loadRules());
if (process.argv.includes('--check')) {
  const have = fs.existsSync(OUT) ? norm(fs.readFileSync(OUT, 'utf8')) : '';
  if (have !== text) {
    console.error('docs/state-tax-rules.md is stale. Run: node scripts/gen-state-rules.js');
    process.exit(1);
  }
  console.log('state tax rules doc is current');
} else {
  fs.writeFileSync(OUT, text);
  console.log('wrote ' + path.relative(root, OUT));
}

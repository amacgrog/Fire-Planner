  // Cliff plan summary line (spec section 7): the kept plan's intents grouped into runs of consecutive ages, then the
  // families that had a candidate and were not kept.
  export function cliffPlanSummary(plan, report) {
    if (!plan) return 'Cliff plan: off.';
    const ages = Object.keys(plan.intents).map(Number).sort((a, b) => a - b);
    if (!ages.length) return 'Cliff plan: no steering helps this plan.';
    const lineName = (id) => {
      const m = /^irmaa([0-9]+)$/.exec(id);
      return id === 'aca400' ? 'the ACA 400% line' : id === 'acaFloor' ? 'the ACA credit floor' : id === 'medicaid' ? 'the Medicaid line' : m ? `IRMAA tier ${m[1]}` : id;
    };
    const runs = [];
    for (const age of ages) {
      const i = plan.intents[age],
        last = runs[runs.length - 1];
      if (last && last.kind === i.kind && last.line === i.line && last.ret === i.ret && last.to === age - 1) last.to = age;
      else runs.push({ kind: i.kind, line: i.line, ret: i.ret, from: age, to: age });
    }
    const clause = (r) =>
      `${r.kind === 'under' ? 'stay under' : 'fill to'} ${lineName(r.line)}${r.ret === 'A' || r.ret === 'B' ? ` (Partner ${r.ret}'s return)` : ''} at ${r.from === r.to ? r.from : r.from + '-' + r.to}`;
    const ordered = runs.filter((r) => r.kind === 'under').concat(runs.filter((r) => r.kind !== 'under'));
    let text = 'Cliff plan: ' + ordered.map(clause).join('; ') + '.';
    if (report) {
      const fams = new Set(report.candidates.map((c) => c.family));
      for (const [fam, name] of [['aca', 'ACA steering'], ['irmaa', 'IRMAA stay-unders']])
        if (fams.has(fam) && report.kept !== fam && report.kept !== 'all') text += ` ${name} not used (no gain over the whole plan).`;
    }
    return text;
  }

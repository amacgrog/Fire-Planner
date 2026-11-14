// Which fields the chosen guidance goals bring in, and how far each one is nudged

import { defaults } from '#country/core/seam-defaults';
import { ESTIMATE_GATED_GROUPS } from '#country/core/seam-ESTIMATE_GATED_GROUPS';
import {
  BASIC_IDS,
  CRITICAL,
  GOALS,
  GOAL_KEYS,
  IMPACT_BOUNDS,
  IMPACT_KIND,
  NO_FIGURE,
} from '#country/core/seam-GUIDANCE_FIELDS';

  // The saved list, cleaned: known keys only, once each, in display order. Anything that is not an array gives [].
  export function normalizeGoals(raw) {
    return GOAL_KEYS.filter((k) => Array.isArray(raw) && raw.includes(k));
  }
  // A partner-B field: the id ends in B and its A twin (the final B replaced by A) is also a default.
  export function isPartnerBId(id) {
    return id.endsWith('B') && id.slice(0, -1) + 'A' in defaults;
  }
  // The chosen goals in display order; a couples goal is ignored (not dropped from the saved list) while single.
  export function chosenGoals(s) {
    const keys = new Set(normalizeGoals(s.guidanceGoals));
    return GOALS.filter((g) => keys.has(g.key) && !(g.couples && s.singlePerson));
  }
  // null (every estimated field) with no goal chosen, else the basics plus each chosen goal's fields and critical ids.
  export function scopeIds(s) {
    const goals = chosenGoals(s);
    if (goals.length === 0) return null;
    const out = new Set(BASIC_IDS);
    for (const g of goals) {
      g.fields.forEach((id) => out.add(id));
      g.critical.forEach((id) => out.add(id));
    }
    return out;
  }
  // The ids the chosen goals make countable as estimates: their fields plus each critical id that applies now, minus
  // partner B while single and minus a gated group's ids while its feature is off.
  export function goalBroughtIds(s) {
    const out = new Set();
    for (const g of chosenGoals(s)) {
      g.fields.forEach((id) => out.add(id));
      g.critical.forEach((id) => {
        if (CRITICAL[id].when(s)) out.add(id);
      });
    }
    for (const id of [...out]) {
      if (s.singlePerson && isPartnerBId(id)) out.delete(id);
      else {
        const group = ESTIMATE_GATED_GROUPS.find((gr) => gr.ids.includes(id));
        if (group && !group.gate(s)) out.delete(id);
      }
    }
    return out;
  }
  // The chosen goals' critical fields that apply to this plan, once each, with the reason each matters.
  export function criticalRows(s) {
    const seen = new Set();
    const rows = [];
    for (const g of chosenGoals(s)) {
      for (const id of g.critical) {
        if (seen.has(id) || !CRITICAL[id].when(s)) continue;
        seen.add(id);
        rows.push({ id, reason: CRITICAL[id].reason });
      }
    }
    return rows;
  }
  // How a field is nudged: 'age', 'rate' or 'share', else 'money'; null for a start age, which never gets a figure.
  export function impactKind(id) {
    if (NO_FIGURE.includes(id)) return null;
    for (const kind of ['age', 'rate', 'share']) if (IMPACT_KIND[kind].includes(id)) return kind;
    return 'money';
  }
  export function impactBounds(id) {
    return IMPACT_BOUNDS[id];
  }

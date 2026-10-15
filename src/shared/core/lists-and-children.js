import { state } from './store.js';

  // Normalizes any raw/partial state object (a legacy autosave, an imported
  // scenario file from an older or newer version of this tool, or a
  // hand-edited one) into a complete, current-shape state by merging it over
  // today's defaults. Fields the raw object is missing fall back to the
  // current default; fields it has that no longer exist are simply dropped.
  // This is what keeps saved scenarios working across future tool updates.
  // Variable-length "add another" lists. Every list starts empty. Older saves
  // (and scenario exports) stored fixed-length arrays gated by master
  // `otherLoansEnabled` / `otherIncomeEnabled` flags plus per-row `enabled`
  // flags; those flags no longer exist, so a legacy payload is recognised by
  // the presence of the flag key and converted so the projection it produced
  // before is unchanged: a list whose master flag was off is dropped, and
  // disabled/all-zero rows are dropped. Legacy income streams were indexed to
  // inflation, so they migrate as "own growth rate" pinned to the inflation
  // value at load time instead of silently switching to income growth.
  export const LIST_MAX = 10;
  export const CHILD_BIRTH_YEAR_MIN = 1950,
    CHILD_BIRTH_YEAR_MAX = 2100;
  // Federal "qualifying child" age limits (IRC 152(c)(3)): under 19 at the end of the tax year,
  // or under 24 for a full-time student. A child counts for the whole year of birth (age 0).
  // Disabled-at-any-age children and qualifying relatives are not modeled. Each credit applies its
  // own cutoff to `age` (the Child Tax Credit is age 16 or under; see docs/next-batches-plan.md).
  export const NO_DEPENDENTS = Object.freeze([]);
  // The children on the plan in calendar year `taxYear`: `{ age, student, qualifyingChild }` for
  // each child born by then. A child with a join year (E2: adoption) counts from that year, for the
  // whole year; age is still from the birth year. A missing join year compares false (from birth).
  // Returns a shared empty array when there are none (hot path).
  export function dependentsInYear(taxYear) {
    const kids = state.children;
    if (!kids || !kids.length) return NO_DEPENDENTS;
    const out = [];
    for (const c of kids) {
      const age = taxYear - c.birthYear;
      if (age < 0 || c.joinYear > taxYear) continue;
      const student = c.student === true;
      out.push({ age, student, qualifyingChild: age <= 18 || (student && age <= 23) });
    }
    return out;
  }
  export function qualifyingChildCount(taxYear) {
    let n = 0;
    for (const d of dependentsInYear(taxYear)) if (d.qualifyingChild) n++;
    return n;
  }
  // ---- Field registry ----
  // Every sidebar control that maps straight onto a `state` key is declared here ONCE, and the
  // input listeners, the DOM sync (syncControls / syncContributionControls), `ids`, and the MCP
  // tool schema are all derived from it. To add a field: add the markup, the `defaults` value,
  // and one entry here (plus a hook only if it has a side effect).
  //   key       the `state` key and the element id
  //   type      'number' (input/range; money fields are read with non-digits stripped),
  //             'bool' (checkbox), or 'choice' (select / button group with a value list)
  //   out       formats the `<key>Out` label next to a slider; outSync says which sync function
  //             writes it ('controls' | 'contrib': keep the two apart, see CLAUDE.md)
  //   inlineOut also refresh the label immediately on input
  //   resync    call syncControls() on input (the field has clamping side effects or labels)
  //   syncAfter 'contrib': call syncContributionControls() after the edit is saved
  //   onInput   clamps / cross-field side effects that run right after state is updated
  // The order of the numeric entries is the order of the MCP schema's properties.
  export const clampRetireAgeA = () => (state.retireAgeA = Math.min(70, Math.max(state.retireAgeA, state.ageA)));
  export const clampRetireAgeB = () => (state.retireAgeB = Math.min(70, Math.max(state.retireAgeB, state.ageB)));

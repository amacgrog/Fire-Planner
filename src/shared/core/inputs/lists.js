// List normalization, children and dependents, retirement-age clamps, LIST_MAX

import { state } from '../store.js';
import { defaults } from '#country/core/seam-defaults';

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
  // load-time: freezes an empty array; reads nothing
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
  export function normalizeLists(s, raw) {
    const num = (v, d, lo = -Infinity, hi = Infinity) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
      },
      rows = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []),
      legacyLoans = !!raw && 'otherLoansEnabled' in raw,
      legacyIncome = !!raw && 'otherIncomeEnabled' in raw;
    let loans = rows(raw?.loans),
      streams = rows(raw?.incomeSources),
      lumps = rows(raw?.oneTimeIncome);
    if (legacyLoans)
      loans = raw.otherLoansEnabled
        ? loans.filter((l) => [l.principal, l.balance, l.rate, l.term, l.extra].some((v) => Number(v) > 0))
        : [];
    if (legacyIncome) {
      streams = raw.otherIncomeEnabled ? streams.filter((x) => x.enabled) : [];
      lumps = raw.otherIncomeEnabled ? lumps.filter((x) => x.enabled) : [];
    }
    const legacyGrowth = num(s.inflation, defaults.inflation, -10, 20),
      growthOf = (x, legacy, ownDefault) => ({
        followGrowth: legacy && x.followGrowth === undefined ? false : x.followGrowth !== false,
        growth: num(x.growth, ownDefault, -10, 20),
      });
    s.loans = loans.slice(0, LIST_MAX).map((l) => ({
      principal: num(l.principal, 0, 0),
      balance: num(l.balance, 0, 0),
      rate: num(l.rate, 0, 0, 40),
      term: num(l.term, 0, 0, 50),
      extra: num(l.extra, 0, 0),
    }));
    s.incomeSources = streams.slice(0, LIST_MAX).map((x) => ({
      amount: num(x.amount, 0, 0),
      startAge: num(x.startAge, 65, 0, 120),
      endAge: num(x.endAge, 75, 0, 120),
      ...growthOf(x, legacyIncome, legacyIncome ? legacyGrowth : defaults.incomeGrowth),
    }));
    s.oneTimeIncome = lumps.slice(0, LIST_MAX).map((x) => ({
      amount: num(x.amount, 0, 0),
      age: num(x.age, 65, 0, 120),
      flat: x.flat === true,
    }));
    s.extraExpenses = rows(raw?.extraExpenses)
      .slice(0, LIST_MAX)
      .map((x) => ({
        amount: num(x.amount, 0, 0),
        startAge: num(x.startAge, 65, 0, 120),
        endAge: num(x.endAge, 75, 0, 120),
        ...growthOf(x, false, defaults.inflation),
      }));
    // Spending changes: legacy saves held five fixed slots with an `enabled`
    // flag and a single `age` (active from then on, forever, inflating with
    // general inflation) — carry those over as open-ended changes.
    s.spendingTiers = rows(raw?.spendingTiers)
      .filter((x) => x.enabled === undefined || x.enabled === true)
      .slice(0, LIST_MAX)
      .map((x) => ({
        amount: num(x.amount, 0, 0),
        startAge: num(x.startAge ?? x.age, 65, 0, 120),
        endAge: num(x.endAge, 120, 0, 120),
        ...growthOf(x, false, defaults.inflation),
      }));
    s.lumpExpenses = rows(raw?.lumpExpenses)
      .slice(0, LIST_MAX)
      .map((x) => ({
        amount: num(x.amount, 0, 0),
        age: num(x.age, 65, 0, 120),
        repeatEvery: Math.round(num(x.repeatEvery, 0, 0, 50)),
        untilAge: num(x.untilAge, 85, 0, 120),
        flat: x.flat === true,
        ...growthOf(x, false, defaults.inflation),
      }));
    // Children (dependents): birth year (a past or future year; a planned child counts from the
    // year of birth) and whether the child is a full-time student after 18. The year bounds are
    // fixed, not relative to the clock, so a saved birth year never shifts when it is reloaded
    // years later. A row without a usable year is dropped. An optional join year (E2: an adopted child)
    // is kept only when it is a year later than the birth year; otherwise the key is left off (from
    // birth), so a legacy row keeps its exact shape.
    s.children = rows(raw?.children)
      .filter(
        (x) =>
          (typeof x.birthYear === 'number' || (typeof x.birthYear === 'string' && x.birthYear.trim() !== '')) &&
          Number.isFinite(Number(x.birthYear)),
      )
      .slice(0, LIST_MAX)
      .map((x) => {
        const birthYear = Math.round(num(x.birthYear, CHILD_BIRTH_YEAR_MIN, CHILD_BIRTH_YEAR_MIN, CHILD_BIRTH_YEAR_MAX)),
          row = { birthYear, student: x.student === true },
          j = x.joinYear;
        if ((typeof j === 'number' || (typeof j === 'string' && j.trim() !== '')) && Number.isFinite(Number(j))) {
          const joinYear = Math.round(num(j, CHILD_BIRTH_YEAR_MIN, CHILD_BIRTH_YEAR_MIN, CHILD_BIRTH_YEAR_MAX));
          if (joinYear > birthYear) row.joinYear = joinYear;
        }
        return row;
      });
    // The old Bridge / part-time income section was folded into additional
    // income streams: carry a saved plan's bridge income over as streams
    // (Partner B's age window converted to Partner A's age), starting no
    // earlier than that partner's retirement, as the old section did.
    if (raw && raw.bridgeEnabled === true) {
      const offsetB = (Number(s.ageA) || 0) - (Number(s.ageB) || 0),
        migrated = [];
      [
        ['A', 0],
        ['B', offsetB],
      ].forEach(([p, off]) => {
        if (p === 'B' && raw.singlePerson) return;
        const amount = Number(raw['bridgeIncome' + p]) || 0,
          start = Math.max(Number(raw['bridgeStartAge' + p]) || 0, Number(s['retireAge' + p]) || 0) + off,
          end = (Number(raw['bridgeEndAge' + p]) || 0) + off;
        if (amount > 0 && start <= end) migrated.push({ amount, startAge: num(start, 65, 0, 120), endAge: num(end, 75, 0, 120), followGrowth: true, growth: defaults.incomeGrowth });
      });
      s.incomeSources = s.incomeSources.concat(migrated).slice(0, LIST_MAX);
    }
    ['bridgeEnabled', 'bridgeIncomeA', 'bridgeStartAgeA', 'bridgeEndAgeA', 'bridgeIncomeB', 'bridgeStartAgeB', 'bridgeEndAgeB'].forEach((k) => delete s[k]);
    delete s.otherLoansEnabled;
    delete s.otherIncomeEnabled;
  }

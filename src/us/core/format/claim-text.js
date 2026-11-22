// The claiming card's text (SS claiming optimizer PR 4): a choice's name, the headline, a cell's label and tooltip, the longevity sentence and the fixed-axis lines

import { compact, money } from '../../../shared/core/format/numbers.js';

// Every function reads a claiming search's result (claim-search.js, "The result" in the PR 3 plan) as plain data; `i` is a
// cell's index, or -1 for the current choice when it is outside the grid.

  const MINUS = '−';
  const OWN_FIXED = {
    atClaim: 'your own benefit is entered as paid at its start age; enter it at full retirement age to compare both',
    collecting: 'you already collect your own benefit',
    past: 'your own benefit has started (you are past 70)',
    none: 'no own benefit is entered',
  };

  // The survivor axis's last age (the survivor full retirement age rounded up to a whole year), or null with no survivor axis
  // searched: the cell Apply writes as the null "at full retirement age" start (it pays the same).
  export function claimSurvivorFull(r) {
    const s = r.axes.survivor;
    return s !== null && s.fixed === null ? s.ages[s.ages.length - 1] : null;
  }
  // The varied ages of a cell, or of the current choice (-1); a fixed axis's age is null.
  export function claimChoice(r, i) {
    const c = i === -1 ? r.current : r.cells[i];
    return { survivor: c.survivor, a: c.a };
  }
  // A choice's name: "claim at 70"; "survivor benefit at 60, then your own at 70" (by start order); "both at 64"; one axis
  // only: "survivor benefit at 62" / "your own benefit at 66". `short`: "70", "60 / 70" (survivor / own).
  export function claimChoiceText(r, i, { short = false } = {}) {
    const { survivor: s, a } = claimChoice(r, i);
    if (r.kind !== 'widowed') return short ? `${a}` : `claim at ${a}`;
    if (short) return s === null ? `${a}` : a === null ? `${s}` : `${s} / ${a}`;
    const full = claimSurvivorFull(r),
      sv = s === full ? `${s} (the full survivor amount)` : `${s}`;
    if (a === null) return `survivor benefit at ${sv}`;
    if (s === null) return `your own benefit at ${a}`;
    if (s === a) return `both at ${a}`;
    return s < a ? `survivor benefit at ${sv}, then your own at ${a}` : `your own benefit at ${a}, then the survivor benefit at ${sv}`;
  }
  // A choice as the tooltips and the Apply button name it: "Claim at 70", "Survivor at 60, own at 70".
  function choiceWho(r, i) {
    const { survivor: s, a } = claimChoice(r, i);
    if (r.kind !== 'widowed') return `Claim at ${a}`;
    if (s === null) return `Own at ${a}`;
    return a === null ? `Survivor at ${s}` : `Survivor at ${s}, own at ${a}`;
  }
  // The Apply button's label.
  export function claimApplyLabel(r) {
    return `Apply: ${choiceWho(r, r.best.cell).toLowerCase()}`;
  }

  // The headline (spec 8), on the re-measured best and current choice (own-plan measures).
  export function claimHeadline(r) {
    const b = r.best,
      name = claimChoiceText(r, b.cell);
    if (b.isCurrent) return `Best: your current choice, ${name}.`;
    const m = b.measure,
      cur = r.top[0].measure,
      curName = claimChoiceText(r, r.current.cell);
    if (m.depletedAge === null && cur.depletedAge === null)
      return `Best: ${name}. After-tax end value ${money(b.gain)} more than your current choice (${curName}), in today's dollars.`;
    if (m.depletedAge === null)
      return `Best: ${name}. Your money lasts the whole plan; with your current choice (${curName}) it runs out at ${cur.depletedAge}.`;
    return `Best: ${name}. Your money runs out at ${m.depletedAge} instead of ${cur.depletedAge}.`;
  }

  // The cell the current choice's stream is canonical in (its own cell, the cell it is a twin of), or null for an extra run
  // that shares no stream.
  function currentCanon(r) {
    const k = r.current.cell;
    return k >= 0 ? (r.cells[k].sameAs ?? k) : r.current.sameAs;
  }
  // Where a cell's figures come from: 'current' (the current choice's own-plan measure, top[0]), a re-measured top entry's
  // index, or 'grid' (the kept-plan measure). A twin resolves to its canonical cell first, so it always shows its twin's figures.
  function shownSource(r, i) {
    if (i === -1 || i === r.current.cell) return 'current';
    const j = r.cells[i].sameAs ?? i;
    if (j === currentCanon(r)) return 'current';
    for (let k = 1; k < r.top.length; k++) if (r.top[k].cell === j) return k;
    return 'grid';
  }
  // The measure a cell shows (Decision 8): the current choice's own-plan one for the current cell and its twins, a re-measured
  // cell's own-plan one (for its twins too), else the canonical cell's grid measure.
  export function claimShownMeasure(r, i) {
    const src = shownSource(r, i);
    if (src === 'current') return r.top[0].measure;
    if (src !== 'grid') return r.top[src].measure;
    return r.cells[r.cells[i].sameAs ?? i].measure;
  }
  // Whether a cell's shown measure was re-checked with its own cliff plan (none were when nothing was planned).
  export function claimRechecked(r, i) {
    return r.plannings > 0 && shownSource(r, i) !== 'grid';
  }
  // A difference in today's dollars: "+$12.3K", "−$8K" (a true minus), "$0" within the ranking's $1.
  export function claimDiffText(d) {
    if (Math.abs(d) <= 1) return '$0';
    return (d > 0 ? '+' : MINUS) + compact(Math.abs(d));
  }
  // A cell's text: "current", "same as 60 / 62" ("same as current" for a cell that pays as the current choice does), "out at 84", "lasts" (when the current choice runs out), else the difference
  // from the current choice.
  export function claimCellLabel(r, i) {
    if (i === r.current.cell) return 'current';
    const twin = r.cells[i].sameAs;
    if (twin !== null) return `same as ${twin === r.current.cell ? 'current' : claimChoiceText(r, twin, { short: true })}`;
    if (shownSource(r, i) === 'current') return 'same as current';
    const m = claimShownMeasure(r, i),
      cur = r.top[0].measure;
    if (m.depletedAge !== null) return `out at ${m.depletedAge}`;
    if (cur.depletedAge !== null) return 'lasts';
    return claimDiffText(m.today - cur.today);
  }
  // A cell's tooltip (spec 8): the hover box's heading and lines. The after-tax end value in today's dollars when the money
  // lasts (a run-out plan ends at about nothing, so its value says nothing), else the run-out age; the comparison with the
  // current choice; whose twin it is (and why that means the same result), or that it was re-checked with its own cliff plan.
  export function claimCellTip(r, i) {
    const m = claimShownMeasure(r, i),
      cur = r.top[0].measure,
      isCur = i === r.current.cell,
      lines = [];
    if (i === r.best.cell) lines.push('Best choice');
    if (isCur) lines.push('Your current choice');
    lines.push(m.depletedAge === null ? `After-tax end value: ${money(m.today)} (today's dollars)` : `Money runs out at ${m.depletedAge}`);
    if (!isCur && shownSource(r, i) !== 'current') {
      if (m.depletedAge === null && cur.depletedAge === null) lines.push(`${claimDiffText(m.today - cur.today)} compared with your current choice`);
      else if (m.depletedAge === null) lines.push(`Lasts the whole plan; your current choice runs out at ${cur.depletedAge}`);
      else if (cur.depletedAge === null) lines.push('Your current choice never runs out');
      else {
        const y = m.depletedAge - cur.depletedAge,
          yrs = (n) => `${n} year${n === 1 ? '' : 's'}`;
        lines.push(y === 0 ? 'The same age as your current choice' : y > 0 ? `${yrs(y)} later than your current choice` : `${yrs(-y)} earlier than your current choice`);
      }
    }
    const twin = i >= 0 ? r.cells[i].sameAs : null;
    if (twin !== null) lines.push(`Pays the same Social Security every year as ${choiceWho(r, twin).toLowerCase()}, so the result is the same`);
    else if (!isCur && shownSource(r, i) === 'current') lines.push('Pays the same Social Security every year as your current choice');
    else if (claimRechecked(r, i) && !isCur) lines.push('Re-checked with its own cliff plan');
    return { head: choiceWho(r, i), lines };
  }
  // The tooltip as one sentence (the cell's aria-label and the tap note under the grid).
  export function claimCellTitle(r, i) {
    const { head, lines } = claimCellTip(r, i);
    return `${head}: ${lines.map((l) => l.charAt(0).toLowerCase() + l.slice(1)).join('; ')}.`;
  }
  // The legend under the grid: what the rows and columns are and what each kind of cell means.
  export function claimLegend(r) {
    const both = r.kind === 'widowed' && r.cells[0].survivor !== null && r.cells[0].a !== null,
      axes = both
        ? 'Rows: the age the survivor benefit starts. Columns: the age your own benefit starts. '
        : r.kind === 'widowed' && r.cells[0].a === null
          ? 'Rows: the age the survivor benefit starts. '
          : 'Columns: the age you claim at. ',
      twin = both ? '"same as 60 / 62" (survivor / own)' : '"same as 62"';
    return `${axes}Each cell: the after-tax end value compared with your current choice (today's dollars); "out at 68" when the money runs out at 68; ${twin} when that choice pays exactly the same Social Security every year, so its result is the same. ★ best, • re-checked with its own cliff plan, outlined: your current choice. Hover or tap a cell for its figures.`;
  }
  // The line for a current choice outside the grid (a start of 71-75, a survivor start of 68-70), else ''.
  export function claimCurrentLine(r) {
    if (r.current.cell !== -1) return '';
    const m = r.top[0].measure,
      out = m.depletedAge === null ? '' : `; it runs out at ${m.depletedAge}`,
      twin = r.current.sameAs === null ? '' : `; it pays the same as ${choiceWho(r, r.current.sameAs).toLowerCase()}`;
    return `Your current choice (${claimChoiceText(r, -1)}) is outside the ages searched: after-tax end value ${money(m.today)} in today's dollars${out}${twin}.`;
  }

  // "80", "80 or 85", "80, 85 or 90".
  function orList(xs) {
    return xs.length === 1 ? `${xs[0]}` : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;
  }
  // The longevity row's sentence (spec 6): the choice that wins from some end age on, then the earlier end ages' choices
  // (consecutive equal ones joined). Entries compare by cell.
  export function longevitySentence(r) {
    const L = r.longevity;
    if (!L || L.length === 0) return '';
    const name = (e) => claimChoiceText(r, e.cell);
    if (L.length === 1) return `If the plan ends at ${L[0].endAge}, ${name(L[0])} wins.`;
    const last = L[L.length - 1].cell;
    let k = L.length - 1;
    while (k > 0 && L[k - 1].cell === last) k--;
    if (k === 0) return `Whatever the plan's end age from ${L[0].endAge} to ${L[L.length - 1].endAge}, ${name(L[0])} wins.`;
    const parts = [];
    for (let i = 0; i < k; ) {
      let j = i;
      while (j + 1 < k && L[j + 1].cell === L[i].cell) j++;
      parts.push(`to ${orList(L.slice(i, j + 1).map((e) => e.endAge))}, ${name(L[i])}`);
      i = j + 1;
    }
    return `If you live to ${L[k].endAge} or longer, ${name(L[k])} wins; ${parts.join('; ')}.`;
  }

  // Why a widowed search varies one axis only (Decision 11), else ''.
  export function claimFixedLine(r) {
    if (r.kind !== 'widowed') return '';
    if (r.ownFixed !== null) return `Only the survivor start is searched: ${OWN_FIXED[r.ownFixed]}.`;
    const s = r.axes.survivor.fixed;
    if (s === 'collecting') return 'Only your own start is searched: you already collect the survivor benefit.';
    if (s === 'past') return 'Only your own start is searched: the survivor benefit has reached its full amount.';
    return '';
  }
  // The lines under the grid (spec 7.2, 8): what was measured, and the Plan search reminder when a stored plan exists.
  export function claimLines(r, { lifeExpectancy, storedPlan }) {
    const lines = [`Uses standard projections with guardrails off and your current plan settings; depends on life expectancy (yours: ${lifeExpectancy}).`];
    if (r.plannings > 0) lines.push('The best cells and your current choice were re-checked with their own cliff plan; the other cells and the end-age row use the current plan.');
    if (storedPlan) lines.push('Re-run Plan search after applying.');
    return lines;
  }
  // The one line of a search that did not run (spec 7.4), else ''.
  export function claimStatusLine(status) {
    if (status === 'atClaim') return 'Enter your benefit at full retirement age (set “amount entered is” to “At full retirement age”) to compare claiming ages.';
    if (status === 'nothing') return 'Nothing to choose: your claiming ages are already set (already collecting, or past the last claiming age).';
    return '';
  }

// The When to claim Social Security card (SS claiming optimizer PR 4): the cache key, the sliced search job, the grid and Apply

import { escapeHtml } from '../../../shared/core/format/numbers.js';
import { state } from '../../../shared/core/store.js';
import { revealField } from '../../../shared/ui/inputs/estimate-review.js';
import { saveInputs } from '../../../shared/ui/plans/autosave.js';
import { scenarioSnapshot } from '../../../shared/ui/plans/market-scenario-snapshot.js';
import { movePreview } from '../../../shared/ui/plans/move-preview-snapshot.js';
import { dismissFirstRunBanner } from '../../../shared/ui/plans/saved-plan.js';
import { snapshotForUndo } from '../../../shared/ui/plans/undo.js';
import { guidanceHeld, keptMemo } from '../../../shared/ui/results/guidance.js';
import { stateContextFor } from '../../../shared/ui/results/state-context.js';
import { cliffPlanStore } from '../../core/cliff-plan-store.js';
import { searchPending } from '../../core/cliff-plan/planning.js';
import {
  claimApplyLabel,
  claimCellLabel,
  claimCellTitle,
  claimChoiceText,
  claimCurrentLine,
  claimFixedLine,
  claimHeadline,
  claimLines,
  claimRechecked,
  claimShownMeasure,
  claimStatusLine,
  claimSurvivorFull,
  longevitySentence,
} from '../../core/format/claim-text.js';
import { ssClaimAxes } from '../../core/income/social-security.js';
import { claimSearchSteps, claimStatus } from '../../core/optimizer/claim-search.js';
import { optimizerState } from '../../core/optimizer-state.js';
import { ownPlanContextFor, storeContext } from '../../core/projection/store-context.js';
import { currentYear } from '../../core/tax-year.js';
import { syncControls } from '../inputs/sync-controls.js';
import { storedPlanFingerprint } from './plan-optimizer.js';
import { render } from './render.js';

  const SLICE_MS = 40;
  const SLICE_STEPS = 8;
  const STALE = 'Your inputs changed since these ages were compared; the card is comparing them again.';
  const LOCK_SCENARIO = 'Revert the market scenario to apply a claiming age.';
  const LOCK_PREVIEW = 'Keep or revert the change you are previewing to apply a claiming age.';
  // The results of the last few keys ({ key, result }, the most recently used last: a Try and its Revert keep each side's grid).
  // Assigned only in this module (its contents through keptMemo).
  const memos = [];
  // The result drawn in the card ({ key, result }) or null: the current key's memo when there is one, else the last one drawn,
  // dimmed. Assigned only in this module.
  let drawn = null;
  // The running job ({ gen, key, state, it, planNext, parked }) or null; gen tells a live timer from a stale one.
  let job = null;
  let gen = 0;
  // Jobs started (tests: a rerun shows as one more).
  let searches = 0;
  // 'applied' after an Apply until a result for the new inputs is drawn; 'stale' after a refusal for changed inputs.
  let applyNote = '';
  // claimKey's memo: the state's JSON, the tax year, the two override maps and the kept plan it was computed for.
  const keyMemo = { raw: null, year: null, ov0: null, ov1: null, kept: null, key: null };

  const $ = (id) => document.getElementById(id);

  // The key a result is made for (spec 7.3): the stored plan's fingerprint of the inputs (no list-row names, goals or
  // dismissals), the tax year, the stored plan, the optimizer overrides and the kept cliff plan. Memoized on the state's JSON
  // and the objects; `fresh` skips the memo (Apply's check).
  function claimKey(fresh = false) {
    const raw = JSON.stringify(state),
      kept = cliffPlanStore.forState === state ? cliffPlanStore.plan : null,
      o = optimizerState;
    if (!fresh && raw === keyMemo.raw && currentYear === keyMemo.year && o.rothBracketByAge === keyMemo.ov0 && o.withdrawalMixByAge === keyMemo.ov1 && kept === keyMemo.kept)
      return keyMemo.key;
    const key = currentYear + '|' + storedPlanFingerprint(state) + '|' + JSON.stringify([state.storedPlan ?? null, o.rothBracketByAge, o.withdrawalMixByAge, kept]);
    Object.assign(keyMemo, { raw, year: currentYear, ov0: o.rothBracketByAge, ov1: o.withdrawalMixByAge, kept, key });
    return key;
  }
  // The search's kind and status for the current inputs, before any run (cheap: the axes read only inputs and the tax year).
  function statusNow() {
    const axes = ssClaimAxes(storeContext({ withPlan: false }));
    return { kind: axes.kind, status: claimStatus(axes) };
  }
  const cardShown = () => {
    const card = $('claimingCard');
    return card.open && !card.hidden;
  };

  // Every render (the light one too): hides the card for no Social Security, everyone collecting and couples (until PR 5), and
  // paints a status line at once, so a card the light render shows is never empty.
  export function claimingCardVisibility() {
    const { kind, status } = statusNow();
    const card = $('claimingCard');
    card.hidden = kind === 'couple' || status === 'none' || status === 'collecting';
    if (!card.hidden && status !== 'ok') paint(status);
  }
  // The open card's paint (the full and deferred passes, the toggle).
  export function renderClaimingCard() {
    if (!cardShown()) return;
    paint(statusNow().status);
  }

  // Starts the search for the current inputs when the card is open and shown, the bracket search is not pending (the deferred
  // pass calls this again) and no result is kept for the key; a running job for the key goes on, a parked one is re-armed.
  // Under the test hold the job starts no timer and waits for __test_flushClaimSearch.
  export function scheduleClaimSearch() {
    if (!cardShown() || searchPending()) return;
    const { status } = statusNow();
    if (status !== 'ok') {
      paint(status);
      return;
    }
    const key = claimKey();
    if (memos.some((m) => m.key === key)) {
      if (job !== null && job.key !== key) {
        job = null;
        gen++;
      }
      paint(status);
      return;
    }
    if (job !== null && job.key === key && job.state === state) {
      if (job.parked) {
        job.parked = false;
        arm(job.gen);
      }
      return;
    }
    gen++;
    searches++;
    const contextFor = stateContextFor();
    job = { gen, key, state, it: claimSearchSteps(contextFor(state), contextFor, (p, r) => ownPlanContextFor(p)(r)), planNext: false, parked: false };
    paint(status);
    arm(gen);
  }
  function arm(g) {
    if (!guidanceHeld()) setTimeout(() => step(g), 0);
  }
  // One slice (the goal answers' driver): steps until SLICE_MS or SLICE_STEPS (no limit when `sync`); after a 'plan-next' the
  // slice ends unless it has run nothing yet, so a bracket search runs alone. A changed state or key drops the job; a closed or
  // hidden card parks it; the generator's return is kept and drawn.
  function step(g, sync = false) {
    if (!job || job.gen !== g) return;
    if (state !== job.state || claimKey() !== job.key) {
      job = null;
      return;
    }
    if (!sync && !cardShown()) {
      job.parked = true;
      return;
    }
    const t0 = performance.now();
    let ran = 0;
    for (;;) {
      if (job.planNext && ran > 0 && !sync) break;
      const planning = job.planNext;
      job.planNext = false;
      const r = job.it.next();
      if (r.done) {
        const key = job.key;
        keptMemo(memos, key, () => ({ key, result: null })).result = r.value;
        job = null;
        applyNote = '';
        paint('ok');
        return;
      }
      if (r.value === 'plan-next') {
        job.planNext = true;
        continue;
      }
      ran++;
      if (!sync && (planning || ran >= SLICE_STEPS || performance.now() - t0 >= SLICE_MS)) break;
    }
    arm(g);
  }
  // Runs the job to its end at once, scheduling no timer (the test hook).
  export function runClaimSearchToEnd() {
    while (job) step(job.gen, true);
  }

  // The shade of each cell: never running out on a green scale by the shown value, running out on a red one by the run-out age
  // (earlier is stronger); one distinct value gives the middle shade.
  function shades(r) {
    const ms = r.cells.map((c, i) => claimShownMeasure(r, i)),
      lasting = ms.filter((m) => m.depletedAge === null).map((m) => m.today),
      outs = ms.filter((m) => m.depletedAge !== null).map((m) => m.depletedAge);
    const scale = (lo, hi, x) => (hi > lo ? 8 + (37 * (x - lo)) / (hi - lo) : 26);
    const [vLo, vHi] = [Math.min(...lasting), Math.max(...lasting)],
      [aLo, aHi] = [Math.min(...outs), Math.max(...outs)];
    return ms.map((m) =>
      m.depletedAge === null
        ? `color-mix(in srgb, var(--green) ${scale(vLo, vHi, m.today).toFixed(0)}%, transparent)`
        : `color-mix(in srgb, var(--red) ${scale(aLo, aHi, aHi + aLo - m.depletedAge).toFixed(0)}%, transparent)`,
    );
  }
  // The grid's HTML: survivor start (rows) by own start (columns), or one row.
  function gridHtml(r) {
    const rows = [...new Set(r.cells.map((c) => c.survivor))],
      cols = [...new Set(r.cells.map((c) => c.a))],
      bg = shades(r),
      widowed = r.kind === 'widowed';
    const head = widowed ? (cols[0] === null ? 'Survivor at' : rows[0] === null ? 'Own at' : 'Survivor ↓<br>own →') : 'Claim at';
    const showCols = cols[0] !== null,
      th = (x) => `<th scope="col">${x}</th>`;
    let html = showCols ? `<thead><tr><th scope="col" class="claim-corner">${head}</th>${cols.map(th).join('')}</tr></thead>` : '';
    html += '<tbody>';
    for (const s of rows) {
      html += `<tr><th scope="row">${s === null ? '' : s}${!showCols ? ` <span class="claim-axis">${head}</span>` : ''}</th>`;
      for (const a of cols) {
        const i = r.cells.findIndex((c) => c.survivor === s && c.a === a),
          cls = ['claim-cell'];
        if (i === r.current.cell) cls.push('current');
        if (i === r.best.cell) cls.push('best');
        if (i !== r.current.cell && r.cells[i].sameAs === null && claimRechecked(r, i)) cls.push('rechecked');
        const title = escapeHtml(claimCellTitle(r, i));
        html += `<td><button type="button" class="${cls.join(' ')}" data-cell="${i}" title="${title}" aria-label="${title}" style="background:${bg[i]}">${escapeHtml(claimCellLabel(r, i))}</button></td>`;
      }
      html += '</tr>';
    }
    return html + '</tbody>';
  }
  function longevityHtml(r) {
    const L = r.longevity;
    return `<tbody><tr><th scope="row">If the plan ends at</th>${L.map((e) => `<td>${e.endAge}</td>`).join('')}</tr><tr><th scope="row">Best</th>${L.map((e) => `<td>${e.cell === -1 ? 'current' : escapeHtml(claimChoiceText(r, e.cell, { short: true }))}</td>`).join('')}</tr></tbody>`;
  }

  // Paints the card for a status: the 7.4 line for 'atClaim' / 'nothing', else the drawn result (the current key's when kept;
  // else the last one, dimmed, while a job runs).
  function paint(status) {
    const statusBox = $('claimingStatus'),
      body = $('claimingBody'),
      measuring = $('claimingMeasuring');
    if (status !== 'ok') {
      statusBox.hidden = false;
      $('claimingStatusLine').textContent = claimStatusLine(status);
      $('claimingGoToFieldBtn').hidden = status !== 'atClaim';
      body.hidden = true;
      measuring.hidden = true;
      return;
    }
    statusBox.hidden = true;
    const key = claimKey(),
      kept = memos.find((m) => m.key === key);
    if (kept) drawn = kept;
    const fresh = drawn !== null && drawn.key === key;
    measuring.hidden = fresh;
    if (drawn === null) {
      body.hidden = true;
      return;
    }
    const r = drawn.result;
    body.hidden = false;
    body.classList.toggle('claiming-measuring', !fresh);
    $('claimingHeadline').textContent = claimHeadline(r);
    const fixed = claimFixedLine(r);
    $('claimingFixedLine').hidden = fixed === '';
    $('claimingFixedLine').textContent = fixed;
    $('claimingGrid').innerHTML = gridHtml(r);
    $('claimingCellNote').textContent = '';
    const cur = claimCurrentLine(r);
    $('claimingCurrentLine').hidden = cur === '';
    $('claimingCurrentLine').textContent = cur;
    $('claimingLongevityWrap').hidden = r.longevity === null;
    if (r.longevity !== null) {
      $('claimingLongevity').innerHTML = longevityHtml(r);
      $('claimingSentence').textContent = longevitySentence(r);
    }
    $('claimingLines').replaceChildren(
      ...claimLines(r, { lifeExpectancy: state.lifeExpectancyA, storedPlan: state.storedPlan }).map((t) => {
        const p = document.createElement('p');
        p.className = 'claiming-line claiming-muted';
        p.textContent = t;
        return p;
      }),
    );
    const btn = $('claimingApplyBtn'),
      note = $('claimingApplyNote'),
      locked = scenarioSnapshot ? LOCK_SCENARIO : movePreview ? LOCK_PREVIEW : '';
    btn.hidden = !fresh || r.best.isCurrent;
    btn.textContent = claimApplyLabel(r);
    btn.disabled = locked !== '';
    btn.title = locked;
    note.textContent = !btn.hidden && locked ? locked : applyNote === 'applied' ? 'Applied.' : '';
  }

  // Apply (spec 9): writes the best choice's varied ages (the survivor's last age as the null "at full retirement age" start,
  // which pays the same), with one undo snapshot, then syncs the boxes, renders and autosaves. Refused in market-scenario mode,
  // during a move preview and when the inputs changed since the drawn result.
  export function applyClaim() {
    const d = drawn;
    if (!d || d.result.status !== 'ok' || d.result.kind === 'couple' || d.result.best.isCurrent || !cardShown()) return false;
    if (scenarioSnapshot || movePreview) {
      paint('ok');
      return false;
    }
    if (d.key !== claimKey(true)) {
      applyNote = 'stale';
      $('claimingApplyBtn').hidden = true;
      $('claimingApplyNote').textContent = STALE;
      return false;
    }
    const r = d.result,
      cell = r.cells[r.best.cell],
      full = claimSurvivorFull(r);
    snapshotForUndo('Applied claiming ages');
    if (cell.a !== null) state.ssStartAgeA = cell.a;
    if (cell.survivor !== null) state.ssSurvivorStartAge = cell.survivor === full ? null : cell.survivor;
    applyNote = 'applied';
    dismissFirstRunBanner();
    syncControls();
    render();
    saveInputs();
    return true;
  }

  // What the card shows (tests): its state, the drawn texts and the drawn result's choices.
  export function claimingCardState() {
    const card = $('claimingCard'),
      text = (id) => $(id).textContent,
      shown = (id) => !$(id).hidden && !$(id).closest('[hidden]');
    const cells = [...document.querySelectorAll('#claimingGrid .claim-cell')];
    const pos = (cls) => {
      const b = document.querySelector(`#claimingGrid .claim-cell.${cls}`);
      if (!b) return null;
      const tr = b.closest('tr');
      return [[...tr.parentNode.children].indexOf(tr), [...tr.children].indexOf(b.closest('td')) - 1];
    };
    const r = drawn && drawn.result;
    const { kind, status } = statusNow();
    return {
      hidden: card.hidden,
      open: card.open,
      kind,
      status,
      pending: job !== null,
      searches,
      fresh: drawn !== null && drawn.key === claimKey(true),
      measuring: shown('claimingMeasuring'),
      statusLine: shown('claimingStatus') ? text('claimingStatusLine') : '',
      goToField: shown('claimingGoToFieldBtn'),
      headline: shown('claimingBody') ? text('claimingHeadline') : '',
      fixedLine: shown('claimingFixedLine') ? text('claimingFixedLine') : '',
      grid: [...document.querySelectorAll('#claimingGrid tbody tr')].map((tr) => [...tr.querySelectorAll('.claim-cell')].map((b) => b.textContent)),
      titles: cells.map((b) => b.title),
      currentCell: pos('current'),
      bestCell: pos('best'),
      currentLine: shown('claimingCurrentLine') ? text('claimingCurrentLine') : '',
      longevity: shown('claimingLongevityWrap') ? [...document.querySelectorAll('#claimingLongevity tr')].map((tr) => [...tr.children].map((x) => x.textContent)) : null,
      sentence: shown('claimingLongevityWrap') ? text('claimingSentence') : '',
      lines: [...document.querySelectorAll('#claimingLines p')].map((p) => p.textContent),
      applyShown: shown('claimingApplyBtn'),
      applyDisabled: $('claimingApplyBtn').disabled,
      applyLabel: text('claimingApplyBtn'),
      applyNote: text('claimingApplyNote'),
      result: r
        ? { status: r.status, kind: r.kind, best: JSON.parse(JSON.stringify(r.best)), currentCell: r.current.cell, cells: r.cells.map((c) => ({ survivor: c.survivor, a: c.a, sameAs: c.sameAs })), headline: claimHeadline(r) }
        : null,
    };
  }

  export function wireClaimingCard() {
    const card = $('claimingCard');
    // Opening paints and schedules only: the card reads no selected run, so a full render (which would cancel the deferred pass
    // and run the bracket search at once) is not needed.
    card.addEventListener('toggle', () => {
      if (!card.open) return;
      renderClaimingCard();
      scheduleClaimSearch();
    });
    $('claimingApplyBtn').addEventListener('click', () => {
      applyClaim();
    });
    $('claimingGoToFieldBtn').addEventListener('click', () => revealField('ssBenefitBasisA'));
    // A tap on a cell shows its tooltip under the grid (a title never shows on a phone).
    $('claimingGrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cell]');
      if (b) $('claimingCellNote').textContent = b.title;
    });
  }

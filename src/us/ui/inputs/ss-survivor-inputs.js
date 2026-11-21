// US widowed survivor inputs: the start-age select and the check lines (SS claiming optimizer PR 2)

import { money } from '../../../shared/core/format/numbers.js';
import { state } from '../../../shared/core/store.js';
import { saveInputs } from '../../../shared/ui/plans/autosave.js';
import {
  fraText,
  ssSurvivorFactor,
  ssSurvivorFraMonths,
  ssSurvivorQuoteRead,
  ssSurvivorStartResolved,
  widowedSurvivorYearly,
} from '../../core/income/social-security.js';
import { storeContext } from '../../core/projection/store-context.js';
import { render } from '../results/render.js';
import { pctText } from './ss-basis-notes.js';

  // The select's first option is "at the survivor full retirement age" (the stored null); the others are 60 to 70. Its label
  // names that age, and the whole year it is paid from when the age is not a whole year (66 and 4 months is paid from 67).
  export function syncSsSurvivorStart() {
    const el = document.getElementById('ssSurvivorStartAge'),
      sfra = ssSurvivorFraMonths(storeContext({ withPlan: false }).taxYear - state.ageA),
      from = Math.ceil(sfra / 12);
    el.options[0].textContent = `At full retirement age (${fraText(sfra / 12)}${from * 12 === sfra ? '' : '; paid from ' + from})`;
    el.value = state.ssSurvivorStartAge === null ? '' : String(state.ssSurvivorStartAge);
  }
  // Wired by hand: the shared choice listener would write Number('') = 0 for the first option.
  export function wireSsSurvivorInputs() {
    document.getElementById('ssSurvivorStartAge').addEventListener('change', (e) => {
      state.ssSurvivorStartAge = e.target.value === '' ? null : Number(e.target.value);
      render();
      saveInputs();
    });
  }
  // The two lines under the widowed group, '' unless a widowed single person: when the survivor benefit is paid from and what it
  // pays a month in today's dollars (the engine's own figure, widowedSurvivorYearly), and how the earlier quote reads.
  function notesFor(ctx) {
    const inputs = ctx.inputs;
    if (!inputs.singlePerson || inputs.ssWidowed !== true) return ['', ''];
    const F = inputs.ssSurvivorMonthlyFra,
      Q = inputs.ssSurvivorQuoteMonthly,
      age = inputs.ageA,
      sfra = ssSurvivorFraMonths(ctx.taxYear - age),
      from = Math.ceil(sfra / 12),
      x = ssSurvivorStartResolved(ctx),
      yearly = widowedSurvivorYearly(ctx),
      code = ssSurvivorQuoteRead(ctx),
      collecting = inputs.ssSurvivorCollecting === true && x <= age;
    if (!(F > 0)) return ['', ''];
    const capped = code === 2 && yearly === F * 12 ? ', capped by the widow’s limit' : '',
      tail = `${money(yearly / 12)} a month, ${pctText(yearly / (F * 12))} of your amount at full retirement age (${fraText(sfra / 12)})${capped}`,
      note = x > age ? `Starts at ${x}: ${tail}` : collecting ? `Collecting since ${x}: ${tail}` : x === age ? `Paid from ${x}: ${tail}` : `Claims now, at ${age}: ${tail}`;
    const a = Math.min(from, Math.max(60, inputs.ssSurvivorQuoteAge)),
      a0 = Math.min(from, Math.max(a, age));
    let check;
    if (code === 0)
      check = collecting
        ? `This pays ${money(yearly / 12)} a month now: compare it with your check.`
        : `At ${a0} this is ${money(F * ssSurvivorFactor(sfra, a0))} a month: compare it with SSA's quote.`;
    else if (code === 1) check = 'Your two quotes agree: no widow’s limit.';
    else if (code === 2) check = `Your quotes show a widow’s limit: the survivor benefit is at most ${money(F)} a month.`;
    else check = `The two quotes disagree (${money(Q)} at ${a} would be ${money(Q / ssSurvivorFactor(sfra, a))} at full retirement age): the planner uses your full-retirement-age quote.`;
    return [note, check];
  }
  export function renderSsSurvivorNotes() {
    const [note, check] = notesFor(storeContext({ withPlan: false }));
    document.getElementById('ssSurvivorNote').textContent = note;
    document.getElementById('ssSurvivorCheck').textContent = check;
  }

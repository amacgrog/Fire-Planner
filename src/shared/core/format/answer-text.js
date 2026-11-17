// The goal answers' and moves' sentences, from their results (no engine)

import { MOVE_RULES, workingPartners } from '../analysis/moves.js';
import { displayRoom } from '../analysis/spending-room.js';
import { compact, money } from './numbers.js';

  // The age scale of the verdict's and the answers' sentences: the partner whose life expectancy ends the run (A on a tie or
  // alone), so an end age and a run-out age read on one scale. { who ("" alone, else "A's " / "B's "), end (that partner's life
  // expectancy), shift (added to one of Partner A's ages, the engine's depletedAge, to put it on the scale) }.
  export function ageScale(s) {
    const onB = !s.singlePerson && s.lifeExpectancyB - s.ageB > s.lifeExpectancyA - s.ageA;
    return {
      who: s.singlePerson ? '' : onB ? "B's " : "A's ",
      end: onB ? s.lifeExpectancyB : s.lifeExpectancyA,
      shift: onB ? s.ageB - s.ageA : 0,
    };
  }

  // The scale's end age as text: "age 100" alone, "B's age 100" for a couple.
  export function endAgeText(scale) {
    return `${scale.who}age ${scale.end}`;
  }

  // One of Partner A's ages (the engine's depletedAge) on the scale, as text.
  export function scaledAgeText(scale, ageA) {
    return `${scale.who}age ${ageA + scale.shift}`;
  }

  // Distinct integer ages as ascending ranges (S4 ruling 7): [60,61,62] -> "60-62", [59,61,62,63] -> "59, 61-63", [60] -> "60",
  // [] -> "".
  export function ageRanges(ages) {
    const sorted = [...new Set(ages)].sort((a, b) => a - b),
      parts = [];
    for (let i = 0; i < sorted.length; ) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
      parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
      i = j + 1;
    }
    return parts.join(', ');
  }

  // The retirement ages of `base` shifted by k years, naming only the partners the shift moves (retireShift): "at 58"
  // (single), "at A 58 / B 58", or "at A 58" / "at B 58" when the other partner has already retired.
  export function agesText(base, k) {
    if (base.singlePerson) return `at ${base.retireAgeA + k}`;
    const w = workingPartners(base);
    if (w.A && w.B) return `at A ${base.retireAgeA + k} / B ${base.retireAgeB + k}`;
    return w.B ? `at B ${base.retireAgeB + k}` : `at A ${base.retireAgeA + k}`;
  }

  const bare = (s) => s.replace(/^at /, '');
  const capital = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // The retirement-age answer r = { lastsFrom, comfortableFrom, perYear, lo, hi, empty } of retireAnswerSteps, as one
  // sentence; `empty` (no shift in range) reads as already retired when no partner is still working, else as past the cap.
  export function retireAnswerText(base, r) {
    if (r.empty) {
      const w = workingPartners(base);
      if (!w.A && !w.B) return 'In the projection: you have already retired, so no retirement age is tested.';
      return `In the projection: retirement ages past ${MOVE_RULES.maxRetireAge} are not tested here.`;
    }
    const { lastsFrom: l, comfortableFrom: c, perYear, lo, hi } = r,
      parts = [];
    if (c !== null) parts.push(c === lo ? `Comfortable even ${agesText(base, lo)}` : `Comfortable from ${bare(agesText(base, c))}`);
    if (l !== null && (c === null || l < c)) parts.push(`Tight from ${bare(agesText(base, l))}`);
    if (l === null) parts.push(`runs out at every age up to ${bare(agesText(base, hi))}`);
    else if (l > lo) parts.push(`runs out if you retire before ${bare(agesText(base, l))}`);
    let text = `In the projection: ${parts.join('; ')}.`;
    if (perYear !== null && perYear !== undefined && displayRoom(perYear) >= 500) {
      text += ` Each year earlier costs about ${compact(displayRoom(perYear))} a year of room.`;
    }
    return text;
  }

  // The spending answer from the base verdict v; offRoom is the guardrails-off room (used under guardrails only).
  export function spendAnswerText(base, v, offRoom) {
    if (v.guardrails) {
      const d = displayRoom(offRoom),
        signed = d >= 0 ? `${compact(d)} more than today` : `${compact(-d)} less than today`;
      return `Without guardrails, about ${compact(base.spending + d)} a year (${signed}). With them on, the worst year's spending is cut by up to ${v.cutPct}%.`;
    }
    if (v.unfixable) return "Even spending nothing runs out: cutting spending alone can't fix this.";
    if (v.atCap) return `More than ${compact(base.spending + v.shown)} a year: the search stops at ${compact(v.shown)} more.`;
    if (base.spendingTiers && base.spendingTiers.length && v.shown !== 0) {
      return `About ${compact(Math.abs(v.shown))} a year ${v.shown > 0 ? 'more' : 'less'} than you plan, in every retired year.`;
    }
    if (v.shown > 0) return `About ${compact(base.spending + v.shown)} a year, ${compact(v.shown)} more than today.`;
    if (v.shown === 0) return `About ${compact(base.spending)} a year: what you spend now, with nothing to spare.`;
    return `About ${compact(base.spending + v.shown)} a year, ${compact(-v.shown)} less than today.`;
  }

  // The housing answer: one sentence per change { key, delta } (delta: the variant's room minus the base room).
  export function houseAnswerText(base, changes) {
    return changes
      .map(({ key, delta }) => {
        const d = displayRoom(Math.abs(delta)),
          little = d < 500,
          more = delta > 0,
          dm = compact(d);
        if (key === 'payoff') {
          if (little) return 'An extra mortgage payment makes little difference (under $500 a year).';
          if (!(base.extraPrincipal > 0)) return `Paying an extra $500 a month on the mortgage would ${more ? 'add' : 'cost'} about ${dm} a year of room.`;
          return `Your extra ${money(base.extraPrincipal)} a month on the mortgage ${more ? 'costs' : 'adds'} about ${dm} a year of room against investing it.`;
        }
        if (key === 'own') {
          if (little) return 'Owning or renting makes little difference (under $500 a year).';
          return more
            ? `Buying the home in your housing settings would leave about ${dm} a year more room than renting.`
            : `Renting leaves about ${dm} a year more room than buying.`;
        }
        if (base.tenure === 'rentThenBuy') {
          if (little) return `Buying at ${base.buyAge} or renting throughout makes little difference (under $500 a year).`;
          return more
            ? `Renting throughout would leave about ${dm} a year more room than buying at ${base.buyAge}.`
            : `Buying at ${base.buyAge} leaves about ${dm} a year more room than renting throughout.`;
        }
        if (little) return 'Owning or renting makes little difference (under $500 a year).';
        return more
          ? `Renting would leave about ${dm} a year more room than owning.`
          : `Owning leaves about ${dm} a year more room than renting.`;
      })
      .join(' ');
  }

  // The survivor answer: one sentence per { partner, verdict }; partner is the one who dies, and the run-out age is the survivor's
  // (the verdict's depletedAge is Partner A's age).
  export function survivorAnswerText(base, rows) {
    return rows
      .map(({ partner, verdict: v }) => {
        const head = `If Partner ${partner} dies at ${base.survivorDeathAge}:`;
        if (v.word === 'short') {
          const age = partner === 'B' ? `A's age ${v.depletedAge}` : `B's age ${v.depletedAge - base.ageA + base.ageB}`;
          return `${head} Short, the money runs out at ${age}.`;
        }
        if (v.guardrails) return `${head} ${capital(v.word)}, guardrails cut spending by up to ${v.cutPct}%.`;
        return `${head} ${capital(v.word)}, about ${compact(v.shown)} a year of room.`;
      })
      .join(' ');
  }

  // The estate / end-value answer; `phrase` is the country's LEGACY_PHRASE (it takes the compact figure), `scale` the plan's
  // ageScale.
  export function legacyAnswerText(phrase, value, scale, depletedAge) {
    const runOut = depletedAge ? ` The investments run out at ${scaledAgeText(scale, depletedAge)}.` : '';
    return `At ${endAgeText(scale)}, ${phrase(compact(value))}.${runOut}`;
  }

  // One tested change as { what, result }. `move` is { key, label, patch, verdict, fixes, gain }; `baseVerdict` is the plan's
  // verdict (its word, its guardrail cut); `base` is the inputs the move changes, `scale` their ageScale.
  export function moveText(move, base, scale, baseVerdict) {
    let what;
    if (move.key === 'retire') {
      const k = workingPartners(base).A ? move.patch.retireAgeA - base.retireAgeA : move.patch.retireAgeB - base.retireAgeB;
      what = `Retire ${plural(k, 'year')} later (${agesText(base, k)})`;
    } else if (move.key === 'spend') {
      what = `Spend about ${compact(base.spending - move.patch.spending)} less a year`;
    } else what = move.label;
    let result;
    const v = move.verdict;
    const endAge = endAgeText(scale);
    if (move.key === 'guardrails') result = `lasts through ${endAge}, with spending cut by up to ${v.cutPct}% in bad years`;
    else if (move.fixes) result = baseVerdict.word === 'short' ? `fixes it: lasts through ${endAge}` : 'makes it Comfortable in the projection';
    else if (!v.guardrails && !baseVerdict.guardrails) result = `+${compact(displayRoom(move.gain))} a year of room`;
    else result = `worst-year cut ${baseVerdict.cutPct}% → ${v.cutPct}%`;
    return { what, result };
  }

  // The list heading above the moves; `scale` is the plan's ageScale.
  export function movesHeadText(baseVerdict, scale) {
    return baseVerdict.word === 'short'
      ? `Runs out at ${scaledAgeText(scale, baseVerdict.depletedAge)} in the projection. Biggest fixes:`
      : 'Tight in the projection. What helps most:';
  }

  export const NO_MOVES_TEXT = 'None of the changes tested here helps on its own.';

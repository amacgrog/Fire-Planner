import { state } from '../../shared/core/store.js';

  // E3 (spec 5.2): the IRMAA appeal events of a run, per person, by first post-event year E (the year after the last
  // working year, or the death year): 0 none, 1 the end of a W-2 or self-employed stream, 2 a main-job retirement, 3 a
  // married spouse's death; the highest kind on a tie. An event covers its owner, and the owner's spouse when the couple is
  // married in year E (a death covers only the survivor); it is kept for a covered person alive in year E and 65 or over by
  // year E+1. Null when no event is kept (the default household, retiring at 55, allocates nothing).
  export function irmaaAppealTable({ singlePerson, retireAgeA, retireAgeB, deathYear, deceasedIsA, deceasedIsB, projectionYears }) {
    const married = (y) => !singlePerson && (state.marryLater ? state.ageA + y >= state.marriageAgeA : state.filingStatus === 'mfj');
    let eventA = null,
      eventB = null;
    const put = (b, E, kind) => {
      if ((b ? deceasedIsB : deceasedIsA) && E >= deathYear) return; // dead in year E
      if ((b ? state.ageB : state.ageA) + E + 1 < 65) return; // cannot be on Medicare by E+1
      if (eventA === null) {
        eventA = new Int8Array(projectionYears + 1);
        eventB = new Int8Array(projectionYears + 1);
      }
      const ev = b ? eventB : eventA;
      if (kind > ev[E]) ev[E] = kind;
    };
    const cover = (b, E, kind) => {
      put(b, E, kind);
      if (married(E)) put(!b, E, kind);
    };
    const eA = retireAgeA - state.ageA;
    if (state.incomeA > 0 && eA >= 1 && eA <= projectionYears) cover(false, eA, 2);
    if (!singlePerson) {
      const eB = retireAgeB - state.ageB;
      if (state.incomeB > 0 && eB >= 1 && eB <= projectionYears) cover(true, eB, 2);
    }
    for (const s of state.incomeSources) {
      if ((s.kind !== 'wages' && s.kind !== 'self') || !(s.amount > 0) || !(s.startAge <= s.endAge)) continue;
      const b = !singlePerson && s.owner === 'B',
        E = s.endAge + 1 - (b ? state.ageB : state.ageA);
      if (E < 1 || E > projectionYears) continue;
      if ((b ? deceasedIsB : deceasedIsA) && E >= deathYear) continue; // ended by its owner's death: the death event
      cover(b, E, 1);
    }
    if ((deceasedIsA || deceasedIsB) && deathYear >= 0 && deathYear <= projectionYears && married(deathYear)) put(deceasedIsA, deathYear, 3);
    return eventA === null ? null : { eventA, eventB };
  }
  // E3 (spec 5.2): partner P's appeal window in premium year `year` from P's event row: 2 when an event's E is last year
  // (last year's and this year's MAGI may replace the lookback), 1 when it is this year (this year's MAGI), else 0.
  export function irmaaAppealWindow(ev, year) {
    return year >= 1 && ev[year - 1] !== 0 ? 2 : ev[year] !== 0 ? 1 : 0;
  }
  // E3 (spec 5.2, round 1 M4): the kind of the event the chosen tax year s can cite in premium year t.
  export function irmaaAppealKind(ev, t, s) {
    return s === t - 1 ? ev[t - 1] : ev[t] !== 0 ? ev[t] : ev[t - 1];
  }

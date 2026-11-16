// US Social Security start-age limit: 70, or 75 under the "if the law changes" switch (feedback B1)

  export const SS_START_AGE_MAX = 70;
  export const SS_START_AGE_MAX_LAW_CHANGE = 75;
  export const ssStartAgeMax = (s) => (s.ssLateStartEnabled ? SS_START_AGE_MAX_LAW_CHANGE : SS_START_AGE_MAX);
  // Lowers a start age above the limit to it, on the state object passed (normalizeState's, or the store's from the field
  // hooks). Only the top is clamped: the box's minimum of 62 was never enforced, and a half-typed age ("7" on the way to
  // "72") must not jump to 62.
  export function clampSsStartAges(s) {
    const max = ssStartAgeMax(s);
    for (const k of ['ssStartAgeA', 'ssStartAgeB']) if (Number(s[k]) > max) s[k] = max;
  }

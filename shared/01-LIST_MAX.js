  function normalizeLists(s, raw) {
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

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
  const LIST_MAX = 10;
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
  const clampRetireAgeA = () => (state.retireAgeA = Math.min(70, Math.max(state.retireAgeA, state.ageA)));
  const clampRetireAgeB = () => (state.retireAgeB = Math.min(70, Math.max(state.retireAgeB, state.ageB)));

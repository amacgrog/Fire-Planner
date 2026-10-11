  function simulateAtRealCagr(realCagrPct) {
    const infl = pct(state.inflation),
      nominal = ((1 + realCagrPct / 100) * (1 + infl) - 1) * 100,
      saved = state.returnRate;
    state.returnRate = nominal;
    const result = simulate();
    state.returnRate = saved;
    return result;
  }
  const cagrColors = [
    '#b91c1c',
    '#dc2626',
    '#ea580c',
    '#d97706',
    '#65a30d',
    '#16a34a',
    '#0d9488',
    '#0e7490',
  ];

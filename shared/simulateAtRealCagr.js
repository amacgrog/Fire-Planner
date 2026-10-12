  function simulateAtRealCagr(realCagrPct) {
    const infl = pct(state.inflation),
      nominal = ((1 + realCagrPct / 100) * (1 + infl) - 1) * 100,
      saved = state.returnRate;
    state.returnRate = nominal;
    const result = simulate();
    state.returnRate = saved;
    return result;
  }

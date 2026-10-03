  function takeCash(wd, amount) {
    const from = Math.min(wd.bal.cash, amount);
    wd.bal.cash -= from;
    return from;
  }
  // Last resort: home equity (value less mortgage) when the household owns.
  function takeHomeEquity(wd, amount) {
    const { bal } = wd;
    if (state.tenure !== 'own' && state.tenure !== 'rentThenBuy') return 0;
    const from = Math.min(Math.max(0, bal.home - bal.mortgage), amount);
    bal.home -= from;
    return from;
  }

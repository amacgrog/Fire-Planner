  function setChartView(next) {
    chartView = next;
    if (CHART_GROUPS[next] === 'projection') lastProjectionView = next;
    if (next === 'hist' || next === 'mc') {
      logScale = true;
      document.getElementById('logScaleToggle').checked = true;
    }
    const map = {
      '3yr': 'chartView3Btn',
      '1yr': 'chartView1Btn',
      cagr: 'chartViewCagrBtn',
    };
    Object.entries(map).forEach(([key, id]) => {
      const active = key === next;
      document.getElementById(id).classList.toggle('active', active);
      document.getElementById(id).setAttribute('aria-checked', active);
    });
    const group = CHART_GROUPS[next],
      groupMap = { projection: 'chartGroupProjectionBtn', hist: 'chartGroupHistBtn', mc: 'chartGroupMcBtn' };
    Object.entries(groupMap).forEach(([key, id]) => {
      const active = key === group;
      document.getElementById(id).classList.toggle('active', active);
      document.getElementById(id).setAttribute('aria-checked', active);
    });
    document.getElementById('projectionSubToggle').hidden = group !== 'projection';
    render();
  }
  function setMode(next) {
    mode = next;
    document.getElementById('realBtn').classList.toggle('active', mode === 'real');
    document.getElementById('nominalBtn').classList.toggle('active', mode === 'nominal');
    document.getElementById('realBtn').setAttribute('aria-checked', mode === 'real');
    document.getElementById('nominalBtn').setAttribute('aria-checked', mode === 'nominal');
    document.getElementById('dollarModeBtn').textContent = mode === 'real' ? '2026 dollars ▾' : 'Future dollars ▾';
    render();
    saveInputs();
  }
  let undoSnapshot = null;
  let undoToastTimer = null;
  function snapshotForUndo(label) {
    undoSnapshot = {
      label,
      state: JSON.parse(JSON.stringify(state)),
      mode,
      logScale,
    };
    showUndoToast(label);
  }
  function showUndoToast(label) {
    const toast = document.getElementById('undoToast');
    const text = document.getElementById('undoToastText');
    if (!toast || !text) return;
    text.textContent = `${label}. `;
    toast.hidden = false;
    clearTimeout(undoToastTimer);
    undoToastTimer = setTimeout(() => hideUndoToast(), 10000);
  }
  function hideUndoToast() {
    const toast = document.getElementById('undoToast');
    if (toast) toast.hidden = true;
    clearTimeout(undoToastTimer);
    undoSnapshot = null;
  }
  const undoToastBtnEl = document.getElementById('undoToastBtn');
  if (undoToastBtnEl) {
    undoToastBtnEl.addEventListener('click', () => {
      if (!undoSnapshot) return;
      state = undoSnapshot.state;
      mode = undoSnapshot.mode;
      logScale = undoSnapshot.logScale;
      document.getElementById('logScaleToggle').checked = logScale;
      syncControls();
      syncContributionControls();
      setMode(mode);
      render();
      saveInputs();
      hideUndoToast();
    });
  }
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (
      !confirm(
        "Reset all inputs to the generic example data? This clears what's saved in this browser and can't be undone — export a scenario first if you want to keep what you've entered.",
      )
    )
      return;
    snapshotForUndo('Reset to example data');
    state = {
      ...defaults,
      loans: defaults.loans.map((l) => ({ ...l })),
      spendingTiers: defaults.spendingTiers.map((t) => ({ ...t })),
      incomeSources: defaults.incomeSources.map((t) => ({ ...t })),
      oneTimeIncome: defaults.oneTimeIncome.map((t) => ({ ...t })),
      extraExpenses: defaults.extraExpenses.map((t) => ({ ...t })),
      lumpExpenses: defaults.lumpExpenses.map((t) => ({ ...t })),
    };
    mode = 'real';
    logScale = false;
    document.getElementById('logScaleToggle').checked = false;
    setMcPathCount(1000);
    syncControls();
    syncContributionControls();
    setMode('real');
    setChartView('3yr');
  });
  function syncTopbarHeight() {
    const tb = document.querySelector('.topbar');
    if (tb) document.documentElement.style.setProperty('--topbar-h', tb.offsetHeight + 'px');
  }

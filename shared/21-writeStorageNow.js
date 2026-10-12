  // Autosaves `state`/`mode` to this browser's localStorage (never sent
  // anywhere — see the README's privacy note) so a reload or a later visit
  // comes back to real numbers instead of the generic example data.
  // Debounced (250ms idle) since saveInputs() is called on nearly every
  // keystroke via the `ids` input listener; `writeStorageNow()` is also
  // flushed unconditionally on `pagehide` so the very last edit before a
  // tab close/reload is never lost to a pending debounce timer.
  function writeStorageNow() {
    const statusEl = document.getElementById('saveStatus');
    if (!hasPersonalizedData) return;
    if (!storage) {
      if (statusEl) statusEl.textContent = 'Not autosaved — storage unavailable';
      return;
    }
    try {
      storage.setItem(storageKey, JSON.stringify({ state, mode }));
      if (statusEl) statusEl.textContent = 'Plan autosaved in this browser';
    } catch {
      if (statusEl) statusEl.textContent = 'Not autosaved — storage full or unavailable';
    }
  }
  let saveDebounceTimer = null;
  function saveInputs() {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(writeStorageNow, 250);
  }
  window.addEventListener('pagehide', writeStorageNow);

  // Scenarios: named snapshots of the full input state, kept in memory for
  // this tab and optionally exported to a JSON file for safekeeping. Every
  // load path (boot, Load, and file import) runs through normalizeState(),
  // so a scenario saved by an older or newer version of this tool still
  // loads correctly — missing fields fall back to today's defaults, and
  // unrecognized old fields are simply dropped.
  const cloneState = (s) => JSON.parse(JSON.stringify(s));
  function computeScenarioMetrics(scenarioState) {
    const backup = state;
    assignState(normalizeState(scenarioState));
    let out;
    try {
      const sim = simulate();
      const retirement = sim.rows.find((r) => r.year === sim.retirementYear) || sim.rows[0],
        end = sim.rows.at(-1);
      out = {
        retireLabel: state.singlePerson
          ? `Age ${state.retireAgeA}`
          : `A ${state.retireAgeA} / B ${state.retireAgeB}`,
        investableAtRetirement: displayValue(retirement.investable, retirement.year),
        netWorthAtRetirement: displayValue(retirement.total, retirement.year),
        lastsTo: sim.depletedAge
          ? `Age ${sim.depletedAge}`
          : `Age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+`,
        lastsToAge:
          sim.depletedAge ||
          Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB),
        depleted: !!sim.depletedAge,
        endAssets: displayValue(end.total, end.year),
      };
    } finally {
      assignState(backup);
    }
    return out;
  }
  const overlayColors = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0e9f9a', '#db2777'];
  function computeOverlaySeriesFor(name, scenarioState) {
    const backup = state;
    assignState(normalizeState(scenarioState));
    let rows;
    try {
      const sim = simulate();
      rows = sim.rows.map((r) => ({ age: r.age, value: displayValue(r.total, r.year) }));
    } finally {
      assignState(backup);
    }
    return { name, rows };
  }
  function renderOverlayChart(active) {
    const card = document.getElementById('overlayCard'),
      canvas = document.getElementById('overlayChart'),
      legend = document.getElementById('overlayLegend');
    if (!active.length) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const series = [
      computeOverlaySeriesFor('Current (live inputs)', state),
      ...active.map((sc) => computeOverlaySeriesFor(sc.name, sc.state)),
    ];
    legend.innerHTML = series
      .map(
        (s, i) =>
          `<span><i class="swatch" style="background:${overlayColors[i % overlayColors.length]}"></i><span>${escapeHtml(s.name)}</span></span>`,
      )
      .join('');
    const rect = canvas.getBoundingClientRect(),
      dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(600, rect.width * dpr);
    canvas.height = Math.max(300, rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = canvas.width / dpr,
      h = canvas.height / dpr,
      p = { l: 66, r: 18, t: 16, b: 40 };
    const minAge = Math.min(...series.map((s) => s.rows[0].age)),
      maxAge = Math.max(...series.map((s) => s.rows.at(-1).age)),
      ageSpan = maxAge - minAge || 1;
    const all = series.flatMap((s) => s.rows.map((r) => r.value));
    let min = Math.min(0, ...all),
      max = Math.max(1, ...all);
    if (min < 0) min *= 1.1;
    max *= 1.08;
    const x = (age) => p.l + ((age - minAge) / ageSpan) * (w - p.l - p.r),
      y = (v) => p.t + ((max - v) / (max - min || 1)) * (h - p.t - p.b);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '12px Inter,system-ui';
    ctx.fillStyle = chartAxisColor();
    ctx.strokeStyle = chartGridColor();
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const val = min + (max - min) * (i / 5),
        yy = y(val);
      ctx.beginPath();
      ctx.moveTo(p.l, yy);
      ctx.lineTo(w - p.r, yy);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(compact(val), p.l - 9, yy);
    }
    // Deliberately NOT run through xAxisLabel(): each overlaid scenario
    // was simulated under its own saved `state` (computeOverlaySeriesFor
    // swaps `state` in and restores it after), so these ages aren't all
    // relative to the live state.ageA the way a single chart's rows are
    // — converting to calendar year or Partner B's age here would silently
    // mix each scenario's own timeline with the currently-live one's.
    Array.from({ length: 7 }, (_, i) => Math.round(minAge + ageSpan * (i / 6)))
      .filter((v, i, a) => a.indexOf(v) === i)
      .forEach((age) => {
        ctx.fillStyle = chartAxisColor();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(age, x(age), h - p.b + 10);
      });
    const zero = y(0);
    ctx.strokeStyle = chartZeroLineColor();
    ctx.beginPath();
    ctx.moveTo(p.l, zero);
    ctx.lineTo(w - p.r, zero);
    ctx.stroke();
    series.forEach((s, i) => {
      ctx.beginPath();
      s.rows.forEach((r, ri) => {
        const px = x(r.age),
          py = y(r.value);
        ri ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.strokeStyle = overlayColors[i % overlayColors.length];
      ctx.lineWidth = i === 0 ? 3 : 2;
      ctx.stroke();
    });
  }
  function saveScenario() {
    const nameInput = document.getElementById('scenarioName'),
      name = (nameInput.value || '').trim() || `Scenario ${scenarios.length + 1}`;
    scenarios.push({
      id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      savedAt: new Date().toISOString(),
      schemaVersion: SCENARIO_SCHEMA_VERSION,
      state: cloneState(state),
    });
    nameInput.value = '';
    renderScenarioList();
    renderScenarioComparison();
  }
  function loadScenario(id) {
    const sc = scenarios.find((s) => s.id === id);
    if (!sc) return;
    snapshotForUndo(`Loaded "${sc.name || 'scenario'}"`);
    assignState(normalizeState(sc.state));
    syncControls();
    syncContributionControls();
    render();
    saveInputs();
  }
  function deleteScenario(id) {
    assignScenarios(scenarios.filter((s) => s.id !== id));
    compareIds.delete(id);
    renderScenarioList();
    renderScenarioComparison();
  }
  function downloadJson(filename, dataObj) {
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' }),
      url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  function exportScenario(id) {
    const sc = scenarios.find((s) => s.id === id);
    if (!sc) return;
    downloadJson(
      `fire-planner-scenario-${(sc.name || 'scenario').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`,
      {
        firePlannerScenario: true,
        schemaVersion: SCENARIO_SCHEMA_VERSION,
        name: sc.name,
        savedAt: sc.savedAt,
        state: sc.state,
      },
    );
  }
  function exportAllScenarios() {
    downloadJson('fire-planner-scenarios.json', {
      firePlannerScenarioList: true,
      schemaVersion: SCENARIO_SCHEMA_VERSION,
      scenarios: scenarios.map((sc) => ({ name: sc.name, savedAt: sc.savedAt, state: sc.state })),
    });
  }
  function importScenarioFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const items = Array.isArray(parsed.scenarios) ? parsed.scenarios : [parsed];
        let added = 0;
        items.forEach((item) => {
          if (!item || typeof item !== 'object') return;
          const rawState = item.state && typeof item.state === 'object' ? item.state : item;
          scenarios.push({
            id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: item.name || 'Imported scenario',
            savedAt: item.savedAt || new Date().toISOString(),
            schemaVersion: SCENARIO_SCHEMA_VERSION,
            state: normalizeState(rawState),
          });
          added++;
        });
        if (!added) throw new Error('empty');
        renderScenarioList();
        renderScenarioComparison();
      } catch (err) {
        alert('Could not read that file as a scenario export (invalid or unrecognized JSON).');
      }
    };
    reader.readAsText(file);
  }
  function renderScenarioList() {
    const list = document.getElementById('scenarioList');
    document.getElementById('exportAllScenariosBtn').hidden = scenarios.length === 0;
    if (!scenarios.length) {
      list.innerHTML = '<p class="range-note">No saved scenarios yet.</p>';
      return;
    }
    list.innerHTML = scenarios
      .map(
        (sc) =>
          `<div style="display:flex;align-items:center;gap:6px;border-top:1px solid #edf1f5;padding:7px 0;font-size:.8rem"><label style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;cursor:pointer"><input type="checkbox" data-compare="${sc.id}" ${compareIds.has(sc.id) ? 'checked' : ''}><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(sc.name)}">${escapeHtml(sc.name)}</span></label><button type="button" class="btn-card" data-load="${sc.id}" style="padding:4px 8px">Load</button><button type="button" class="btn-card" data-export="${sc.id}" style="padding:4px 8px">Export</button><button type="button" class="btn-card" data-delete="${sc.id}" style="padding:4px 8px">Delete</button></div>`,
      )
      .join('');
    list.querySelectorAll('[data-compare]').forEach((el) =>
      el.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-compare');
        if (e.target.checked) compareIds.add(id);
        else compareIds.delete(id);
        renderScenarioComparison();
      }),
    );
    list
      .querySelectorAll('[data-load]')
      .forEach((el) =>
        el.addEventListener('click', (e) => loadScenario(e.target.getAttribute('data-load'))),
      );
    list
      .querySelectorAll('[data-export]')
      .forEach((el) =>
        el.addEventListener('click', (e) => exportScenario(e.target.getAttribute('data-export'))),
      );
    list.querySelectorAll('[data-delete]').forEach((el) =>
      el.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-delete'),
          target = scenarios.find((s) => s.id === id);
        if (
          confirm(
            `Delete scenario "${target ? target.name : 'this scenario'}"? This can't be undone (export it first if you want to keep it).`,
          )
        )
          deleteScenario(id);
      }),
    );
  }
  // Higher is better for every metric in this table (more money, longer-lasting
  // portfolio), so a single up=green/down=red convention works for all of them.
  function deltaMoney(diff) {
    if (!diff || Math.abs(diff) < 1) return '';
    const cls = diff > 0 ? 'up' : 'down';
    return `<span class="delta ${cls}">${diff > 0 ? '+' : ''}${money(diff)}</span>`;
  }
  function deltaAge(diff) {
    if (!diff) return '';
    const cls = diff > 0 ? 'up' : 'down';
    return `<span class="delta ${cls}">${diff > 0 ? '+' : ''}${Math.round(diff)}y</span>`;
  }
  function renderScenarioComparison() {
    const compareCard = document.getElementById('scenarioCompareCard'),
      compareRows = document.getElementById('scenarioCompareRows');
    const active = scenarios.filter((sc) => compareIds.has(sc.id));
    compareCard.hidden = active.length === 0;
    renderOverlayChart(active);
    if (!active.length) {
      compareRows.innerHTML = '';
      return;
    }
    const current = computeScenarioMetrics(state);
    const rows = [
      { name: 'Current (live inputs)', ...current, isCurrent: true },
      ...active.map((sc) => ({ name: sc.name, ...computeScenarioMetrics(sc.state) })),
    ];
    compareRows.innerHTML = rows
      .map(
        (r) =>
          `<tr><td><b>${escapeHtml(r.name)}</b></td><td>${r.retireLabel}</td><td>${money(r.investableAtRetirement)}${r.isCurrent ? '' : deltaMoney(r.investableAtRetirement - current.investableAtRetirement)}</td><td>${money(r.netWorthAtRetirement)}${r.isCurrent ? '' : deltaMoney(r.netWorthAtRetirement - current.netWorthAtRetirement)}</td><td><span class="table-status ${r.depleted ? 'fail' : ''}">${r.lastsTo}</span>${r.isCurrent ? '' : deltaAge(r.lastsToAge - current.lastsToAge)}</td><td>${money(r.endAssets)}${r.isCurrent ? '' : deltaMoney(r.endAssets - current.endAssets)}</td></tr>`,
      )
      .join('');
  }

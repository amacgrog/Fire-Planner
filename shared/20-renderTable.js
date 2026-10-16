

  function renderChart(series, valueFn = (r) => displayValue(r.total, r.year)) {
    const canvas = document.getElementById('chart'),
      rect = canvas.getBoundingClientRect(),
      dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(600, rect.width * dpr);
    canvas.height = Math.max(300, rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = canvas.width / dpr,
      h = canvas.height / dpr,
      p = { l: 66, r: 18, t: 16, b: 40 };
    const all = series.flatMap((s) => s.sim.rows.map(valueFn)),
      maxAge = series[0].sim.rows.at(-1).age;
    let min = Math.min(0, ...all),
      max = Math.max(1, ...all);
    if (min < 0) min *= 1.1;
    max *= 1.08;
    const x = (age) => p.l + ((age - state.ageA) / (maxAge - state.ageA)) * (w - p.l - p.r);
    let y, floor, logMin, logMax;
    if (logScale) {
      floor = Math.max(1, max * 0.0005);
      logMax = Math.log10(Math.max(max, floor * 10));
      logMin = Math.log10(floor);
      y = (v) =>
        p.t + ((logMax - Math.log10(Math.max(v, floor))) / (logMax - logMin)) * (h - p.t - p.b);
    } else {
      y = (v) => p.t + ((max - v) / (max - min)) * (h - p.t - p.b);
    }
    ctx.clearRect(0, 0, w, h);
    ctx.font = '12px Inter,system-ui';
    ctx.fillStyle = chartAxisColor();
    ctx.strokeStyle = chartGridColor();
    ctx.lineWidth = 1;
    if (logScale) {
      for (let i = 0; i <= 6; i++) {
        const val = Math.pow(10, logMin + (logMax - logMin) * (i / 6)),
          yy = y(val);
        ctx.beginPath();
        ctx.moveTo(p.l, yy);
        ctx.lineTo(w - p.r, yy);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(compact(val), p.l - 9, yy);
      }
    } else {
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
    }
    Array.from({ length: 7 }, (_, i) => Math.round(state.ageA + (maxAge - state.ageA) * (i / 6)))
      .filter((v, i, a) => a.indexOf(v) === i)
      .forEach((age) => {
        ctx.fillStyle = chartAxisColor();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(xAxisLabel(age), x(age), h - p.b + 10);
      });
    if (!logScale) {
      const zero = y(0);
      ctx.strokeStyle = chartZeroLineColor();
      ctx.beginPath();
      ctx.moveTo(p.l, zero);
      ctx.lineTo(w - p.r, zero);
      ctx.stroke();
    }
    series.forEach(({ sim, color, highlight }) => {
      ctx.beginPath();
      sim.rows.forEach((r, i) => {
        const px = x(r.age),
          py = y(valueFn(r));
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = highlight ? 3 : 2;
      ctx.globalAlpha = highlight ? 1 : 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    const drawRetirementMarker = (chartAge, label, color, offset = 0) => {
      if (chartAge < state.ageA || chartAge > maxAge) return;
      const rx = x(chartAge);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(rx, p.t);
      ctx.lineTo(rx, h - p.b);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, rx + 2, p.t + 2 + offset);
    };
    drawRetirementMarker(state.retireAgeA, state.singlePerson ? 'Retire' : 'A retires', '#475569');
    if (!state.singlePerson)
      drawRetirementMarker(
        state.ageA + (state.retireAgeB - state.ageB),
        'B retires',
        '#0e7490',
        14,
      );
    lastChart = { series, valueFn, x, y, p, w, h, maxAge };
  }
  let lastChart = null;
  function clearChartHover() {
    if (chartHoverEnabled() && lastChart) renderChart(lastChart.series, lastChart.valueFn);
    if (chartTooltipEl) chartTooltipEl.style.display = 'none';
  }
  let chartTooltipEl = null;
  function initChartHover() {
    const wrap = document.querySelector('.chart-wrap'),
      canvas = document.getElementById('chart');
    if (!wrap || !canvas) return;
    chartTooltipEl = document.createElement('div');
    chartTooltipEl.id = 'chartTooltip';
    chartTooltipEl.style.cssText =
      'position:absolute;pointer-events:none;background:rgba(15,23,42,.94);color:#fff;font-size:.72rem;padding:8px 10px;border-radius:8px;line-height:1.55;white-space:nowrap;display:none;z-index:6;box-shadow:0 6px 18px rgba(15,23,42,.25)';
    wrap.appendChild(chartTooltipEl);
    const handleMove = (e) => {
      if (!chartHoverEnabled() || !lastChart) return;
      const rect = canvas.getBoundingClientRect(),
        clientX = e.touches ? e.touches[0].clientX : e.clientX,
        clientY = e.touches ? e.touches[0].clientY : e.clientY,
        mx = clientX - rect.left,
        my = clientY - rect.top;
      const { series, valueFn, x, y, p, w, h, maxAge } = lastChart;
      if (mx < p.l || mx > w - p.r || my < p.t || my > h - p.b) {
        clearChartHover();
        return;
      }
      const age = Math.round(state.ageA + ((mx - p.l) / (w - p.l - p.r)) * (maxAge - state.ageA));
      renderChart(series, valueFn);
      const ctx = canvas.getContext('2d'),
        rx = x(age);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx, p.t);
      ctx.lineTo(rx, h - p.b);
      ctx.stroke();
      ctx.restore();
      let tooltipHTML;
      if (chartView === 'hist') {
        // The historical backtest can draw 30-70+ overlapping lines (one
        // per starting year), so showing every series' value at this age
        // (like the 3yr/1yr/cagr tooltip below) would be an unreadable
        // wall of text. Instead, identify the single line closest to the
        // mouse *vertically* at this age — the same "nearest curve" hover
        // convention used by most multi-line chart libraries — highlight
        // just that line, and name its starting year so a red (depleted)
        // line can actually be identified rather than just seen.
        let nearest = null,
          nearestDist = Infinity;
        series.forEach((s) => {
          const rows = s.sim.rows;
          let r = rows.find((rr) => rr.age === age);
          if (!r) r = rows.reduce((a, b) => (Math.abs(b.age - age) < Math.abs(a.age - age) ? b : a));
          if (!r) return;
          const val = valueFn(r),
            py = y(val),
            dist = Math.abs(py - my);
          if (dist < nearestDist) nearestDist = dist, (nearest = { s, val, py });
        });
        if (!nearest) {
          clearChartHover();
          return;
        }
        // Redraw the nearest line bold and on top of the others so it's
        // clear which one the tooltip is describing, then mark its point.
        ctx.beginPath();
        nearest.s.sim.rows.forEach((r, i) => {
          const px = x(r.age),
            py = y(valueFn(r));
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        });
        ctx.strokeStyle = nearest.s.color;
        ctx.lineWidth = 3.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = nearest.s.color;
        ctx.arc(rx, nearest.py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const depletedAge = nearest.s.sim.depletedAge,
          status = depletedAge ? `Depleted at age ${depletedAge}` : 'Survived the full projection';
        tooltipHTML = `<b>Started ${nearest.s.sim.startYear}</b><br><span style="color:${nearest.s.color}">●</span> ${status}<br>Age ${age}: ${money(nearest.val)}`;
      } else {
        const lines = [];
        series.forEach((s) => {
          const rows = s.sim.rows;
          let r = rows.find((rr) => rr.age === age);
          if (!r) r = rows.reduce((a, b) => (Math.abs(b.age - age) < Math.abs(a.age - age) ? b : a));
          if (!r) return;
          const val = valueFn(r),
            py = y(val);
          ctx.beginPath();
          ctx.fillStyle = s.color;
          ctx.arc(rx, py, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          lines.push(
            `<span style="color:${s.color}">●</span> ${s.label ? s.label + ': ' : ''}${money(val)}`,
          );
        });
        // Header always shows year + both partners' ages regardless of
        // which one is currently on the x-axis (chartXAxisMode) — a real
        // user specifically wanted the ages/year they *aren't* scrubbing by
        // visible too, rather than having to mentally convert from
        // whichever one is on the axis.
        const calYear = CURRENT_YEAR + (age - state.ageA),
          ageBVal = Math.round(age - state.ageA + state.ageB),
          header = state.singlePerson
            ? `${calYear} · Age ${age}`
            : `${calYear} · Partner A: ${age} · Partner B: ${ageBVal}`;
        tooltipHTML = `<b>${header}</b><br>${lines.join('<br>')}`;
      }
      chartTooltipEl.innerHTML = tooltipHTML;
      let left = mx + 14,
        top = my - 12;
      if (left + 170 > w) left = mx - 184;
      if (left < 0) left = 4;
      chartTooltipEl.style.left = left + 'px';
      chartTooltipEl.style.top = Math.max(0, top) + 'px';
      chartTooltipEl.style.display = 'block';
    };
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('touchmove', handleMove, { passive: true });
    canvas.addEventListener('mouseleave', clearChartHover);
    canvas.addEventListener('touchend', clearChartHover);
  }

// The sensitivity (tornado) chart and its card

import { compact } from '../../core/format/numbers.js';
import { displayValue } from '../../core/format/charts.js';
import { chartAxisColor, chartZeroLineColor, isDarkTheme } from './chart-colors.js';
import { render } from '#country/ui/seam-render';
import { SENSITIVITY_LEVERS } from '#country/core/seam-SENSITIVITY_LEVERS';

  // The last result renderTornadoChart computed ({ baseline, results, usePeak }); read by the analysis test hook.
  export let lastSensitivity = null;
  export function assignLastSensitivity(v) {
    lastSensitivity = v;
  }
  // leverIds: the levers to sweep (default: the checked #sensLeverToggles boxes).
  export function computeSensitivity(selected, leverIds) {
    const finalValue = (sim) => {
      const r = sim.rows.at(-1);
      return displayValue(r.total, r.year);
    };
    // If the *current* plan is projected to deplete before the end of the
    // modeled horizon, every row from the depletion age onward floors at
    // $0 — so "end assets" would show $0 for every single bar, hiding real
    // differences between assumptions (one lever might still deplete at 60,
    // another at 89, both reading as an identical, uninformative $0). Peak
    // portfolio value doesn't have that floor, so fall back to it in that
    // case; a healthy plan's peak is usually its final row anyway (assets
    // still growing or holding steady at the end), so this only changes
    // behavior in the depleted case it's meant to fix. The decision is made
    // once, from the baseline/current scenario, so every bar in the chart
    // is measuring the same thing rather than switching metric bar to bar.
    const peakValue = (sim) => Math.max(...sim.rows.map((r) => displayValue(r.total, r.year)));
    const usePeak = finalValue(selected) <= 1;
    const endValue = usePeak ? peakValue : finalValue;
    const baseline = endValue(selected);
    const checked = new Set(
      leverIds ||
        [...document.querySelectorAll('#sensLeverToggles input[data-lever]:checked')].map(
          (el) => el.dataset.lever,
        ),
    );
    const levers = SENSITIVITY_LEVERS.filter((l) => checked.has(l.id));
    const results = levers.map((l) => {
      const { decrease, increase } = l.run(endValue);
      return {
        label: l.label,
        decrease,
        increase,
        low: Math.min(decrease, increase),
        high: Math.max(decrease, increase),
      };
    });
    results.sort((a, b) => b.high - b.low - (a.high - a.low));
    return { baseline, results, usePeak };
  }
  export function renderTornadoChart(selected) {
    const canvas = document.getElementById('tornadoChart');
    if (!canvas) return;
    lastSensitivity = computeSensitivity(selected);
    const { baseline, results, usePeak } = lastSensitivity;
    const note = document.getElementById('tornadoNote');
    if (note) {
      note.textContent = usePeak
        ? 'This plan is projected to deplete before the end of the modeled horizon, so end assets would be $0 for every bar — dashed line and bars instead measure peak portfolio value (labeled on the chart), so real differences between assumptions still show up. Bars show the range across a fixed ± swing in each assumption (not a probability distribution); "pp" = percentage points.'
        : 'Dashed line marks the current projection\'s end assets (labeled on the chart). Bars show the range across a fixed ± swing in each assumption (not a probability distribution); "pp" = percentage points.';
    }
    canvas.setAttribute(
      'aria-label',
      usePeak
        ? 'Sensitivity of projected peak portfolio value to key assumptions, sorted by impact'
        : 'Sensitivity of projected end assets to key assumptions, sorted by impact',
    );
    const rowH = 46,
      labelW = 190,
      p = { l: labelW, r: 66, t: 26, b: 10 };
    const rect = canvas.getBoundingClientRect(),
      dpr = Math.min(2, window.devicePixelRatio || 1),
      w = Math.max(340, rect.width),
      h = Math.max(1, results.length) * rowH + p.t + p.b;
    // .chart-wrap has a fixed CSS height everywhere else in this file (a
    // fixed-size line/bar chart), but this chart's height depends on how
    // many levers are checked — up to 10 now, not the original hardcoded 5
    // — so its own wrap needs to grow with it or the canvas overflows the
    // fixed-height box and overlaps the chart-note below.
    const wrap = canvas.closest('.chart-wrap');
    if (wrap) wrap.style.height = h + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.max(340, w * dpr);
    canvas.height = Math.max(150, h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (!results.length) {
      ctx.font = '13px Inter,system-ui';
      ctx.fillStyle = chartAxisColor();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Check an assumption above to see its sensitivity.', w / 2, h / 2);
      return;
    }
    const allVals = results.flatMap((r) => [r.low, r.high]).concat([baseline]);
    let min = Math.min(...allVals),
      max = Math.max(...allVals);
    const pad = (max - min) * 0.1 || Math.max(1, Math.abs(baseline) * 0.1);
    min -= pad;
    max += pad;
    const x = (v) => p.l + ((v - min) / (max - min || 1)) * (w - p.l - p.r);
    const barColor = isDarkTheme() ? 'rgba(91,141,239,.5)' : 'rgba(37,99,235,.32)',
      barStroke = isDarkTheme() ? '#5b8def' : '#2563eb';
    results.forEach((r, i) => {
      const y = p.t + i * rowH + rowH / 2,
        barY = y - 9,
        barH = 18,
        x1 = x(r.low),
        x2 = x(r.high);
      ctx.textBaseline = 'middle';
      ctx.font = '12px Inter,system-ui';
      ctx.fillStyle = chartAxisColor();
      ctx.textAlign = 'left';
      ctx.fillText(r.label, 0, y);
      ctx.fillStyle = barColor;
      ctx.fillRect(Math.min(x1, x2), barY, Math.max(1, Math.abs(x2 - x1)), barH);
      ctx.strokeStyle = barStroke;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(Math.min(x1, x2), barY, Math.max(1, Math.abs(x2 - x1)), barH);
      ctx.font = '11px Inter,system-ui';
      ctx.fillStyle = chartAxisColor();
      ctx.textAlign = 'right';
      ctx.fillText(compact(r.low), Math.min(x1, x2) - 6, y);
      ctx.textAlign = 'left';
      ctx.fillText(compact(r.high), Math.max(x1, x2) + 6, y);
    });
    const bx = x(baseline);
    ctx.strokeStyle = chartZeroLineColor();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(bx, p.t - 4);
    ctx.lineTo(bx, h - p.b + 4);
    ctx.stroke();
    ctx.setLineDash([]);
    const label = `Current${usePeak ? ' (peak)' : ''}: ${compact(baseline)}`;
    ctx.font = '700 11px Inter,system-ui';
    const labelHalfW = ctx.measureText(label).width / 2,
      labelX = Math.min(w - p.r - labelHalfW, Math.max(p.l + labelHalfW, bx));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = chartAxisColor();
    ctx.fillText(label, labelX, p.t - 10);
  }
  export function wireSensitivityCard() {
    // The tornado chart is only computed while expanded (it's a handful of
    // extra simulate() calls, cheap but pointless work while collapsed), so
    // opening it needs its own trigger since no input necessarily changed.
    document.getElementById('sensitivityCard').addEventListener('toggle', (e) => {
      if (e.target.open) render();
    });
  }

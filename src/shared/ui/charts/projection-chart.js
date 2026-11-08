// Draws the main projection chart

import { logScale } from '../../core/chart-prefs.js';
import { compact } from '../../core/format/numbers.js';
import { xAxisLabel, displayValue } from '../../core/format/charts.js';
import { marketScenarioWindows, unionWindows } from '../../core/format/market-scenario-text.js';
import { state } from '../../core/store.js';
import { scenarioSnapshot } from '../plans/market-scenario-snapshot.js';
import { chartAxisColor, chartGridColor, chartZeroLineColor, isDarkTheme } from './chart-colors.js';

  // opts.marketBand: shade the ages a running market scenario changes (the projection views pass it, the historical view does not).
  export function renderChart(series, valueFn = (r) => displayValue(r.total, r.year, r.cumFactor), opts = {}) {
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
    if (opts.marketBand && scenarioSnapshot !== null && state.marketScenario) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.l, p.t, w - p.l - p.r, h - p.t - p.b);
      ctx.clip();
      ctx.fillStyle = isDarkTheme() ? 'rgba(220,76,100,.14)' : 'rgba(220,76,100,.08)';
      for (const win of unionWindows(marketScenarioWindows(state.marketScenario, state))) {
        const x0 = x(win.fromAge);
        ctx.fillRect(x0, p.t, x(win.toAge + 1) - x0, h - p.t - p.b);
      }
      ctx.restore();
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
    lastChart = { series, valueFn, opts, x, y, p, w, h, maxAge };
  }
  export let lastChart = null;

// Draws the Monte Carlo chart

import { logScale } from '../core/chart-prefs.js';
import { compact } from '../core/format/numbers.js';
import { xAxisLabel } from '../core/format/charts.js';
import { mode, state } from '../core/store.js';
import { chartAxisColor, chartGridColor, chartZeroLineColor } from './chart-colors.js';

  // Renders a Monte Carlo run as a percentile "fan" (10-90 and 25-75 bands
  // plus a median line) rather than one line per path — with 500-2000 paths,
  // drawing every path individually would be unreadable and slow. Shares the
  // axis/gridline/log-scale logic with renderChart by design, kept as a
  // parallel implementation to avoid destabilizing that function.
  export function renderMonteCarloChart(
    mc,
    valueFn = (r) => (mode === 'real' ? r.total / r.cumFactor : r.total),
  ) {
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
    const maxAge = state.ageA + mc.projectionYears;
    const pctl = (sortedVals, q) => {
      const idx = (sortedVals.length - 1) * q,
        lo = Math.floor(idx),
        hi = Math.ceil(idx);
      return sortedVals[lo] + (sortedVals[hi] - sortedVals[lo]) * (idx - lo);
    };
    const bands = [];
    for (let year = 0; year <= mc.projectionYears; year++) {
      const vals = mc.paths.map((pth) => valueFn(pth.rows[year])).sort((a, b) => a - b);
      bands.push({
        age: state.ageA + year,
        p10: pctl(vals, 0.1),
        p25: pctl(vals, 0.25),
        p50: pctl(vals, 0.5),
        p75: pctl(vals, 0.75),
        p90: pctl(vals, 0.9),
      });
    }
    const all = bands.flatMap((b) => [b.p10, b.p90]);
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
    const drawBand = (hiKey, loKey, fill) => {
      ctx.beginPath();
      bands.forEach((b, i) => {
        const px = x(b.age),
          py = y(b[hiKey]);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      for (let i = bands.length - 1; i >= 0; i--) {
        const px = x(bands[i].age),
          py = y(bands[i][loKey]);
        ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    drawBand('p90', 'p10', 'rgba(37,99,235,0.12)');
    drawBand('p75', 'p25', 'rgba(37,99,235,0.26)');
    ctx.beginPath();
    bands.forEach((b, i) => {
      const px = x(b.age),
        py = y(b.p50);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2.5;
    ctx.stroke();
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
  }

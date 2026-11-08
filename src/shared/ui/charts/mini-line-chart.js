// A small two-line canvas chart (the market scenario preview)

import { chartAxisColor, chartGridColor } from './chart-colors.js';

  // xs: the x values (ages); series: [{ values, color, dash }] each as long as xs; yFormat: a number -> label.
  // The canvas is 200 CSS px tall and as wide as its box; two y gridlines, the first and last x labels, and the lines.
  export function drawMiniLines(canvas, { xs, series, yFormat }) {
    const rect = canvas.getBoundingClientRect(),
      dpr = Math.min(2, window.devicePixelRatio || 1),
      w = Math.max(200, rect.width),
      h = 200;
    canvas.style.height = h + 'px';
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px Inter,system-ui';
    const p = { l: 52, r: 10, t: 8, b: 22 },
      all = series.flatMap((s) => s.values);
    const lo = Math.min(0, ...all),
      hi = Math.max(1e-9, ...all),
      x0 = xs[0],
      x1 = xs[xs.length - 1];
    const x = (v) => p.l + (x1 === x0 ? 0 : ((v - x0) / (x1 - x0)) * (w - p.l - p.r)),
      y = (v) => p.t + ((hi - v) / (hi - lo)) * (h - p.t - p.b);
    ctx.lineWidth = 1;
    ctx.fillStyle = chartAxisColor();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of [lo, hi]) {
      ctx.strokeStyle = chartGridColor();
      ctx.beginPath();
      ctx.moveTo(p.l, y(v));
      ctx.lineTo(w - p.r, y(v));
      ctx.stroke();
      ctx.fillText(yFormat(v), p.l - 6, y(v));
    }
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(String(x0), p.l, h - p.b + 6);
    ctx.textAlign = 'right';
    ctx.fillText(String(x1), w - p.r, h - p.b + 6);
    for (const s of series) {
      ctx.save();
      ctx.setLineDash(s.dash || []);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.values.forEach((v, i) => (i ? ctx.lineTo(x(xs[i]), y(v)) : ctx.moveTo(x(xs[i]), y(v))));
      ctx.stroke();
      ctx.restore();
    }
  }

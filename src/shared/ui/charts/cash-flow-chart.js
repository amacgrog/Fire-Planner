// Draws the yearly cash-flow chart (three styles), its legend, and the Style row wiring

import { cashFlowParts } from '../../core/format/cash-flow-parts.js';
import { CASH_FLOW_COLORS, displayValue, xAxisLabel } from '../../core/format/charts.js';
import { assignCashFlowStyle, cashFlowStyle } from '../../core/chart-prefs.js';
import { compact } from '../../core/format/numbers.js';
import { chartAxisColor, chartGridColor, isDarkTheme } from './chart-colors.js';
import { CASH_FLOW_LABELS } from '#country/ui/seam-CASH_FLOW_LABELS';
import { render } from '#country/ui/seam-render';

  const STYLE_KEY = 'fireCouplePlanner.cashFlowStyle.v1';
  const STYLE_BUTTONS = { bars: 'cashFlowStyleBarsBtn', inout: 'cashFlowStyleInOutBtn', simple: 'cashFlowStyleSimpleBtn' };
  const OUT_ORDER = ['tax', 'spending', 'contributions', 'cashTopUp', 'reinvested'];
  const SIMPLE_ITEMS = [
    { key: 'income', color: 'income', label: 'Income' },
    { key: 'required', color: 'rmd', label: 'Required withdrawals' },
    { key: 'other', color: 'traditional', label: 'Other withdrawals' },
    { key: 'shortfall', color: 'shortfall', label: null },
  ];
  const SPENDING_PLUS_LABEL = 'Spending + taxes';

  // The last layout drawn (read by the hover).
  export let lastCashFlow = null;

  const colorOf = (key) => CASH_FLOW_COLORS[key][isDarkTheme() ? 'dark' : 'light'];
  // The one threshold for bars, legend and tooltip: an item counts at one display dollar or more.
  const counts = (v) => v >= 1;

  function syncStyleButtons() {
    Object.entries(STYLE_BUTTONS).forEach(([key, id]) => {
      const el = document.getElementById(id);
      el.classList.toggle('active', key === cashFlowStyle);
      el.setAttribute('aria-checked', key === cashFlowStyle);
    });
  }
  export function wireCashFlowControls() {
    let stored = 'bars';
    try {
      const v = localStorage.getItem(STYLE_KEY);
      if (v === 'bars' || v === 'inout' || v === 'simple') stored = v;
    } catch {}
    assignCashFlowStyle(stored);
    syncStyleButtons();
    Object.entries(STYLE_BUTTONS).forEach(([key, id]) => {
      document.getElementById(id).addEventListener('click', () => {
        assignCashFlowStyle(key);
        try {
          localStorage.setItem(STYLE_KEY, key);
        } catch {}
        syncStyleButtons();
        render();
      });
    });
  }
  // The tooltip and touch handling arrive with the hover task; the draw stores lastCashFlow for it.
  export function initCashFlowHover() {}

  // Display-dollar view of one row: every part scaled by displayValue, items under one dollar dropped.
  function displayRow(row, prevInvestable) {
    const parts = cashFlowParts(row, prevInvestable);
    const dv = (n) => displayValue(n, row.year);
    const inItems = parts.in.map((p) => ({ key: p.key, value: dv(p.value) })).filter((p) => counts(p.value));
    const outItems = parts.out.map((p) => ({ key: p.key, value: dv(p.value) })).filter((p) => counts(p.value));
    const get = (list, key) => list.find((p) => p.key === key)?.value ?? 0;
    const spending = get(outItems, 'spending');
    const spendPlus = spending + get(outItems, 'tax') + get(outItems, 'contributions') + get(outItems, 'cashTopUp');
    const reinvested = get(outItems, 'reinvested');
    const sum = (list) => list.reduce((a, p) => a + p.value, 0);
    const simple = [
      { key: 'income', value: get(inItems, 'income') + get(inItems, 'lifetime') },
      { key: 'required', value: get(inItems, 'rmd') },
      {
        key: 'other',
        value: ['traditional', 'roth', 'taxable', 'cash', 'home'].reduce((a, k) => a + get(inItems, k), 0),
      },
      { key: 'shortfall', value: get(inItems, 'shortfall') },
    ].filter((p) => counts(p.value));
    return {
      parts,
      inItems,
      outItems,
      simple,
      spending,
      spendPlus,
      reinvested,
      inTotal: sum(inItems),
      outTotal: sum(outItems),
      conversion: dv(parts.conversion),
    };
  }

  function hatchPattern(ctx, color) {
    const t = document.createElement('canvas');
    t.width = t.height = 6;
    const c = t.getContext('2d');
    c.globalAlpha = 0.22;
    c.fillStyle = color;
    c.fillRect(0, 0, 6, 6);
    c.globalAlpha = 1;
    c.strokeStyle = color;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(0, 6);
    c.lineTo(6, 0);
    c.moveTo(-1, 1);
    c.lineTo(1, -1);
    c.moveTo(5, 7);
    c.lineTo(7, 5);
    c.stroke();
    return ctx.createPattern(t, 'repeat');
  }

  function buildLegend(style, drows, rows) {
    const seen = new Set();
    let sepp = false;
    drows.forEach((d, i) => {
      if (rows[i].sepp72 >= 1) sepp = true;
      const lists = style === 'simple' ? [d.simple] : style === 'inout' ? [d.inItems, d.outItems] : [d.inItems];
      lists.forEach((l) => l.forEach((p) => seen.add(p.key)));
      if (style === 'bars') {
        if (counts(d.reinvested)) seen.add('reinvested');
        if (counts(d.spending)) seen.add('spendingLine');
      }
      if (style !== 'inout' && counts(d.spendPlus)) seen.add('spendPlusLine');
    });
    const sq = (bg) => `<i class="swatch" style="background:${bg};height:10px;width:10px;border-radius:2px"></i>`;
    const item = (swatch, label) => `<span>${swatch}<span>${label}</span></span>`;
    const ink = chartAxisColor();
    const items = [];
    const addKey = (key) => {
      if (!seen.has(key)) return;
      const label = key === 'rmd' && sepp ? CASH_FLOW_LABELS.rmdWithSepp : CASH_FLOW_LABELS[key];
      if (key === 'reinvested')
        items.push(item(sq(`repeating-linear-gradient(135deg,${colorOf(key)} 0 2px,transparent 2px 4px)`), label));
      else items.push(item(sq(colorOf(key)), label));
    };
    if (style === 'simple') {
      SIMPLE_ITEMS.forEach((s) => {
        if (seen.has(s.key)) items.push(item(sq(colorOf(s.color)), s.label ?? CASH_FLOW_LABELS.shortfall));
      });
    } else {
      ['income', 'lifetime', 'rmd', 'traditional', 'roth', 'taxable', 'cash', 'home', 'shortfall'].forEach(addKey);
      if (style === 'inout') OUT_ORDER.forEach(addKey);
      if (style === 'bars') addKey('reinvested');
    }
    if (seen.has('spendingLine'))
      items.push(item(`<i class="swatch" style="background:${ink}"></i>`, CASH_FLOW_LABELS.spending));
    if (seen.has('spendPlusLine'))
      items.push(
        item(
          `<i class="swatch" style="background:repeating-linear-gradient(90deg,${ink} 0 3px,transparent 3px 6px)"></i>`,
          SPENDING_PLUS_LABEL,
        ),
      );
    if (drows.some((d) => counts(d.conversion))) items.push(item('', `* ${CASH_FLOW_LABELS.conversion}`));
    document.getElementById('chartLegend').innerHTML = items.join('');
  }

  export function renderCashFlowChart(rows) {
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
    const style = cashFlowStyle;
    const drows = rows.map((r, i) => displayRow(r, i > 0 ? rows[i - 1].investable : null));
    const inout = style === 'inout';
    let upMax = 1,
      downMax = 1;
    drows.forEach((d) => {
      upMax = Math.max(upMax, d.inTotal, style === 'bars' ? d.outTotal : 0, style === 'simple' ? d.spendPlus : 0);
      if (inout) downMax = Math.max(downMax, d.outTotal);
    });
    const top = (inout ? Math.max(upMax, downMax) : upMax) * 1.08;
    const bottom = inout ? -top : 0;
    const plotH = h - p.t - p.b;
    const y = (v) => p.t + ((top - v) / (top - bottom)) * plotH;
    const slot = (w - p.l - p.r) / Math.max(1, rows.length);
    const gap = slot >= 6 ? 3 : 1;
    const bw = Math.max(1, slot - gap);
    const cx = (i) => p.l + i * slot + slot / 2;
    const bx = (i) => p.l + i * slot + gap / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.font = '12px Inter,system-ui';
    const axis = chartAxisColor();
    if (inout) {
      ctx.fillStyle = isDarkTheme() ? 'rgba(57,135,229,0.08)' : 'rgba(42,120,214,0.06)';
      ctx.fillRect(p.l, p.t, w - p.l - p.r, y(0) - p.t);
    }
    ctx.strokeStyle = chartGridColor();
    ctx.lineWidth = 1;
    const steps = inout ? 4 : 5;
    for (let i = 0; i <= steps; i++) {
      const val = bottom + (top - bottom) * (i / steps),
        yy = y(val);
      ctx.beginPath();
      ctx.moveTo(p.l, yy);
      ctx.lineTo(w - p.r, yy);
      ctx.stroke();
      ctx.fillStyle = axis;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(compact(Math.abs(val)), p.l - 9, yy);
    }
    rows.forEach((r, i) => {
      if (Math.round(r.age) % 5 !== 0) return;
      ctx.fillStyle = axis;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(xAxisLabel(r.age), cx(i), h - p.b + 10);
    });
    const seg = (i, from, to, color) => {
      const y0 = y(from),
        y1 = y(to),
        hh = Math.abs(y1 - y0);
      ctx.fillStyle = color;
      ctx.fillRect(bx(i), Math.min(y0, y1), bw, Math.max(0, hh - (hh > 3 ? 1 : 0)));
    };
    const pattern = hatchPattern(ctx, colorOf('reinvested'));
    const hatch = (i, from, to) => {
      const y0 = y(from),
        y1 = y(to);
      ctx.fillStyle = pattern;
      ctx.fillRect(bx(i), Math.min(y0, y1), bw, Math.abs(y1 - y0));
    };
    const stack = (i, items, sign, colorFor) => {
      let acc = 0;
      items.forEach((it) => {
        seg(i, sign * acc, sign * (acc + it.value), colorFor(it.key));
        acc += it.value;
      });
    };
    drows.forEach((d, i) => {
      if (style === 'simple') stack(i, d.simple, 1, (k) => colorOf(SIMPLE_ITEMS.find((s) => s.key === k).color));
      else stack(i, d.inItems, 1, colorOf);
      if (style === 'bars' && counts(d.reinvested)) hatch(i, Math.max(0, d.inTotal - d.reinvested), d.inTotal);
      if (inout) {
        stack(
          i,
          OUT_ORDER.map((k) => d.outItems.find((o) => o.key === k)).filter(Boolean),
          -1,
          colorOf,
        );
        if (counts(d.reinvested)) hatch(i, -(d.outTotal - d.reinvested), -d.outTotal);
      }
    });
    if (inout) {
      ctx.strokeStyle = axis;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p.l, y(0));
      ctx.lineTo(w - p.r, y(0));
      ctx.stroke();
      ctx.fillStyle = axis;
      ctx.font = '700 11px Inter,system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('MONEY IN ▲', p.l + 6, p.t + 4);
      ctx.textBaseline = 'bottom';
      ctx.fillText('MONEY OUT ▼', p.l + 6, h - p.b - 4);
      ctx.font = '12px Inter,system-ui';
    }
    const stepLine = (valueOf, dash) => {
      ctx.save();
      ctx.strokeStyle = axis;
      ctx.lineWidth = 2;
      ctx.setLineDash(dash);
      ctx.beginPath();
      drows.forEach((d, i) => {
        const yy = y(valueOf(d)),
          x0 = p.l + i * slot;
        if (i === 0) ctx.moveTo(x0, yy);
        else ctx.lineTo(x0, yy);
        ctx.lineTo(x0 + slot, yy);
      });
      ctx.stroke();
      ctx.restore();
    };
    if (style === 'bars') stepLine((d) => d.spending, []);
    if (style !== 'inout') stepLine((d) => d.spendPlus, [2, 3]);
    // Asterisk above the taller of the bar top and the line.
    ctx.fillStyle = axis;
    ctx.font = '700 14px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    drows.forEach((d, i) => {
      if (!counts(d.conversion)) return;
      const tall = Math.max(d.inTotal, style === 'inout' ? 0 : d.spendPlus, style === 'bars' ? d.outTotal : 0);
      ctx.fillText('*', cx(i), y(tall) + 4);
    });
    ctx.font = '12px Inter,system-ui';
    buildLegend(style, drows, rows);
    lastCashFlow = { rows, parts: drows.map((d) => d.parts), slot, pad: p, w, h, y };
  }

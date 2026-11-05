// Draws the yearly cash-flow chart (three styles), its legend, and the Style row wiring

import { cashFlowParts } from '../../core/format/cash-flow-parts.js';
import { CASH_FLOW_COLORS, displayValue, xAxisLabel } from '../../core/format/charts.js';
import { assignCashFlowStyle, cashFlowStyle } from '../../core/chart-prefs.js';
import { compact, money } from '../../core/format/numbers.js';
import { chartView } from '../../core/chart-prefs.js';
import { CURRENT_YEAR } from '../../core/inputs/current-year.js';
import { state } from '../../core/store.js';
import { chartAxisColor, chartGridColor, chartHaloColor, chartInkColor, isDarkTheme } from './chart-colors.js';
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

  // The tooltip: its own element in .chart-wrap (never the projection hover's). Mouse moves and touches show it for the bar
  // under the pointer; there is no touchend handler, so a tap's tooltip stays until a tap outside the chart.
  let tooltipEl = null;
  function hideCashFlowTooltip() {
    if (tooltipEl) tooltipEl.style.display = 'none';
  }
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function tooltipHtml(row, i, style, rows) {
    const d = displayRow(row, i > 0 ? rows[i - 1].investable : null);
    const dv = (n) => displayValue(n, row.year);
    const sw = (bg) =>
      `<i class="cf-sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:${bg}"></i>`;
    const dash = (kind) =>
      `<i class="cf-sw" style="display:inline-block;width:12px;height:0;margin-right:4px;vertical-align:middle;border-top:2px ${kind} #fff"></i>`;
    const hatchSw = (c) => sw(`repeating-linear-gradient(135deg,${c} 0 2px,transparent 2px 4px)`);
    const item = (key, value, swatch, label, extra = '') =>
      `<div class="cf-item" data-key="${key}" data-value="${value}" style="${extra}">${swatch}${esc(label)}: <b>${money(value)}</b></div>`;
    const sub = (text) => `<div class="cf-sub" style="margin-left:16px;opacity:.7;font-size:.68rem;white-space:normal">${esc(text)}</div>`;
    const sepp = rows.some((r) => r.sepp72 >= 1);
    const seppNow = dv(d.parts.sepp72);
    const excess = dv(d.parts.excessRmd);
    const bond = dv(d.parts.bondReserve);
    const saleNow = dv(d.parts.saleForTax);
    const rate = d.parts.rate;
    const lbl = (k) => (k === 'rmd' && sepp ? CASH_FLOW_LABELS.rmdWithSepp : CASH_FLOW_LABELS[k]);
    const rmdSubs = () =>
      (counts(seppNow) ? sub(`${CASH_FLOW_LABELS.sepp72}: ${money(seppNow)}`) : '') +
      (counts(excess) ? sub(`RMD beyond the year's need: ${money(excess)}`) : '');
    const saleSub = counts(saleNow) ? sub(`incl. ${money(saleNow)} sold to pay tax`) : '';
    const red = 'color:#fca5a5';
    const ages = state.singlePerson ? `age ${row.age}` : `ages ${row.age} / ${row.ageB}`;
    let html = `<b>${CURRENT_YEAR + row.year} · ${ages}</b>`;
    const head = (t) => `<div style="margin-top:5px;font-size:.62rem;letter-spacing:.06em;opacity:.65;font-weight:700">${t}</div>`;
    let inHtml = '';
    if (style === 'simple') {
      const names = { income: 'Income', required: 'Required withdrawals', other: 'Other withdrawals', shortfall: CASH_FLOW_LABELS.shortfall };
      d.simple.forEach((s) => {
        const meta = SIMPLE_ITEMS.find((m) => m.key === s.key);
        inHtml += item(s.key, s.value, sw(colorOf(meta.color)), names[s.key], s.key === 'shortfall' ? red : '');
        if (s.key === 'required') inHtml += rmdSubs();
        if (s.key === 'other') {
          const accts = ['traditional', 'roth', 'taxable', 'cash', 'home']
            .map((k) => d.inItems.find((x) => x.key === k))
            .filter(Boolean)
            // "From" once: "From traditional $X · Roth $Y · brokerage $Z".
            .map((x, j) => `${j ? CASH_FLOW_LABELS[x.key].replace(/^From /, '') : CASH_FLOW_LABELS[x.key]} ${money(x.value)}`);
          if (accts.length) inHtml += sub(accts.join(' · '));
          inHtml += saleSub;
        }
      });
    } else {
      d.inItems.forEach((p) => {
        inHtml += item(p.key, p.value, sw(colorOf(p.key)), lbl(p.key), p.key === 'shortfall' ? red : '');
        if (p.key === 'rmd') inHtml += rmdSubs();
        if (p.key === 'taxable') inHtml += saleSub;
      });
    }
    if (inHtml) html += head('MONEY IN') + inHtml;
    if (rate !== null)
      html += `<div class="cf-rate" style="margin-top:5px;opacity:.85">Withdrawal rate: ${(rate * 100).toFixed(1)}% of savings at the start of the year</div>`;
    let outHtml = '';
    const bondSub = counts(bond) ? sub(`(incl. ${money(bond)} to the bond reserve)`) : '';
    if (style === 'inout') {
      OUT_ORDER.forEach((k) => {
        const p = d.outItems.find((o) => o.key === k);
        if (!p) return;
        outHtml += item(k, p.value, k === 'reinvested' ? hatchSw(colorOf(k)) : sw(colorOf(k)), CASH_FLOW_LABELS[k]);
        if (k === 'reinvested') outHtml += bondSub;
      });
    } else {
      // Simple draws no solid line and no hatch, so those two rows carry an empty swatch there.
      if (counts(d.spending))
        outHtml += item('spending', d.spending, style === 'bars' ? dash('solid') : sw('transparent'), CASH_FLOW_LABELS.spending);
      if (counts(d.spendPlus)) {
        outHtml += item('spendPlus', d.spendPlus, dash('dashed'), SPENDING_PLUS_LABEL);
        const adds = ['tax', 'contributions', 'cashTopUp']
          .map((k) => d.outItems.find((o) => o.key === k))
          .filter(Boolean)
          .map((o) => (o.key === 'cashTopUp' ? `${money(o.value)} into cash` : `${CASH_FLOW_LABELS[o.key]} ${money(o.value)}`));
        if (adds.length) outHtml += sub(`incl. ${adds.join(' · ')}`);
      }
      if (counts(d.reinvested)) {
        const swatch = style === 'bars' ? hatchSw(colorOf('reinvested')) : sw('transparent');
        outHtml += item('reinvested', d.reinvested, swatch, CASH_FLOW_LABELS.reinvested) + bondSub;
      }
    }
    if (outHtml) html += head('MONEY OUT') + outHtml;
    if (counts(d.conversion))
      html += `<div class="cf-item" data-key="conversion" data-value="${d.conversion}" style="margin-top:5px">* ${esc(CASH_FLOW_LABELS.conversion)}: <b>${money(d.conversion)}</b></div>`;
    return html;
  }
  export function initCashFlowHover() {
    const wrap = document.querySelector('.chart-wrap'),
      canvas = document.getElementById('chart');
    if (!wrap || !canvas) return;
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'cashFlowTooltip';
    tooltipEl.style.cssText =
      'position:absolute;pointer-events:none;background:rgba(15,23,42,.94);color:#fff;font-size:.72rem;padding:8px 10px;border-radius:8px;line-height:1.55;white-space:nowrap;max-width:calc(100% - 8px);display:none;z-index:6;box-shadow:0 6px 18px rgba(15,23,42,.25)';
    wrap.appendChild(tooltipEl);
    const handleMove = (e) => {
      if (chartView !== 'cashflow' || !lastCashFlow) return;
      const rect = canvas.getBoundingClientRect(),
        pt = e.touches ? e.touches[0] : e,
        mx = pt.clientX - rect.left,
        my = pt.clientY - rect.top;
      const { rows, slot, pad: p, w, h } = lastCashFlow;
      // The canvas can be drawn wider than it is shown (a 600 px minimum): the layout is in drawn pixels.
      const sx = w / rect.width,
        sy = h / rect.height,
        gx = mx * sx,
        gy = my * sy;
      if (gx < p.l || gx > w - p.r || gy < p.t || gy > h - p.b) {
        hideCashFlowTooltip();
        return;
      }
      const i = Math.max(0, Math.min(rows.length - 1, Math.floor((gx - p.l) / slot)));
      tooltipEl.innerHTML = tooltipHtml(rows[i], i, cashFlowStyle, rows);
      tooltipEl.style.display = 'block';
      const tw = tooltipEl.offsetWidth,
        th = tooltipEl.offsetHeight;
      let left = mx + 14;
      if (left + tw > rect.width) left = mx - tw - 14;
      left = Math.max(4, Math.min(left, rect.width - tw - 4));
      let top = my - 12;
      if (top + th > rect.height) top = rect.height - th - 2;
      tooltipEl.style.left = left + 'px';
      tooltipEl.style.top = Math.max(0, top) + 'px';
    };
    canvas.addEventListener('mousemove', handleMove);
    let lastTouch = -Infinity;
    canvas.addEventListener(
      'touchstart',
      (e) => {
        lastTouch = performance.now();
        handleMove(e);
      },
      { passive: true },
    );
    canvas.addEventListener('touchmove', handleMove, { passive: true });
    // A touch device sends compatibility mouse events after a tap, mouseleave among them: a leave soon after a touch is not one.
    canvas.addEventListener('mouseleave', () => {
      if (performance.now() - lastTouch > 1000) hideCashFlowTooltip();
    });
    // A tap or click anywhere but the chart hides it (no touchend handler: a tap's tooltip would vanish at once).
    const outside = (e) => {
      if (e.target !== canvas) hideCashFlowTooltip();
    };
    document.addEventListener('touchstart', outside, { passive: true });
    document.addEventListener('click', outside);
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
    const ink = chartInkColor();
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
          `<i class="swatch" style="background:repeating-linear-gradient(90deg,${ink} 0 5px,transparent 5px 9px)"></i>`,
          SPENDING_PLUS_LABEL,
        ),
      );
    if (drows.some((d) => counts(d.conversion)))
      // The leading space keeps the legend text "* Roth conversion" (test_cash_flow_chart.js matches it).
      items.push(item(`<b style="font-size:1.1em;color:${ink}">*</b>`, ` ${CASH_FLOW_LABELS.conversion}`));
    document.getElementById('chartLegend').innerHTML = items.join('');
  }

  export function renderCashFlowChart(rows) {
    const canvas = document.getElementById('chart'),
      rect = canvas.getBoundingClientRect(),
      dpr = Math.min(2, window.devicePixelRatio || 1);
    hideCashFlowTooltip();
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
    // The lines and the asterisks are drawn in the page's ink over a wider card-colored outline, so they read on the bars and
    // on the card in both themes.
    const ink = chartInkColor(),
      halo = chartHaloColor();
    // Two passes: every line's outline first, then every line's ink, so the dotted line's outline never hides the solid line
    // where the two meet (the solid ink shows in the dotted line's gaps).
    const lines = [];
    if (style === 'bars') lines.push({ valueOf: (d) => d.spending, dash: [] });
    if (style !== 'inout') lines.push({ valueOf: (d) => d.spendPlus, dash: [5, 4] });
    const stepLine = ({ valueOf, dash }, outline) => {
      ctx.save();
      ctx.beginPath();
      drows.forEach((d, i) => {
        const yy = y(valueOf(d)),
          x0 = p.l + i * slot;
        if (i === 0) ctx.moveTo(x0, yy);
        else ctx.lineTo(x0, yy);
        ctx.lineTo(x0 + slot, yy);
      });
      ctx.lineJoin = 'round';
      ctx.strokeStyle = outline ? halo : ink;
      ctx.lineWidth = outline ? 5.5 : 2.5;
      if (!outline) ctx.setLineDash(dash);
      ctx.stroke();
      ctx.restore();
    };
    lines.forEach((l) => stepLine(l, true));
    lines.forEach((l) => stepLine(l, false));
    // Asterisk above the taller of the bar top and the line.
    ctx.save();
    ctx.font = '800 20px Inter,system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = halo;
    ctx.fillStyle = ink;
    drows.forEach((d, i) => {
      if (!counts(d.conversion)) return;
      const tall = Math.max(d.inTotal, style === 'inout' ? 0 : d.spendPlus, style === 'bars' ? d.outTotal : 0),
        ay = y(tall) + 8;
      ctx.strokeText('*', cx(i), ay);
      ctx.fillText('*', cx(i), ay);
    });
    ctx.restore();
    ctx.font = '12px Inter,system-ui';
    buildLegend(style, drows, rows);
    lastCashFlow = { rows, parts: drows.map((d) => d.parts), slot, pad: p, w, h, y };
  }

// The cash-flow Sankey: draws the five columns (items, groups, total, groups, items), its tooltip, and wires its card and year slider

import { compact, money } from '../../core/format/numbers.js';
import { fitLabel, layoutSankey, sankeyColumnXs, sankeyRibbonPath } from '../../core/format/sankey-layout.js';
import { CURRENT_YEAR } from '../../core/inputs/current-year.js';
import { state } from '../../core/store.js';
import { chartHaloColor, chartInkColor } from './chart-colors.js';
import { computeSankeyFlow } from '#country/ui/seam-computeSankeyFlow';
import { render } from '#country/ui/seam-render';

  const NS = 'http://www.w3.org/2000/svg';
  const EMPTY = 'No meaningful cash flow this year.';
  // The run render() last gave the card (spec 5.1): the slider redraws from it, never from a fresh simulate().
  let lastSelected = null;
  // Each drawing's gradient ids carry its own number, so ids stay unique with several diagrams in the document.
  let drawCount = 0;
  // load-time: an empty WeakMap (a global constructor); reads nothing
  // svg -> what its last drawing shows (read by the hover).
  const views = new WeakMap();
  // load-time: an empty WeakSet (a global constructor); reads nothing
  // The svgs whose hover is wired.
  const wired = new WeakSet();

  export function currentSankeySelection() {
    return lastSelected;
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function el(parent, tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    parent.appendChild(e);
    return e;
  }

  // ---- Tooltip: one element per .chart-wrap, filled with textContent only (labels are user names). ----
  function tooltipFor(wrap) {
    let tip = wrap.querySelector(':scope > .sankey-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'sankey-tooltip';
      wrap.appendChild(tip);
    }
    return tip;
  }
  function hideTooltip(svg) {
    const v = views.get(svg);
    if (!v) return;
    const tip = v.wrap.querySelector(':scope > .sankey-tooltip');
    if (tip) tip.style.display = 'none';
    unhighlight(svg);
  }
  function div(parent, cls, text) {
    const d = document.createElement('div');
    d.className = cls;
    if (text !== undefined) d.textContent = text;
    parent.appendChild(d);
    return d;
  }
  // A link's tooltip is its finer end's: the item of an item link, the group of a hub link.
  function tooltipNode(v, target) {
    if (target.hasAttribute('data-node')) return v.nodes.get(target.getAttribute('data-node'));
    const l = v.links[Number(target.getAttribute('data-link'))];
    if (l.from === 'hub') return v.nodes.get(l.to);
    if (l.to === 'hub') return v.nodes.get(l.from);
    return v.nodes.get(v.col.get(l.from) === 0 ? l.from : l.to);
  }
  function showTooltip(svg, target, clientX, clientY) {
    const v = views.get(svg);
    const n = tooltipNode(v, target);
    if (!n) return;
    const tip = tooltipFor(v.wrap);
    while (tip.firstChild) tip.removeChild(tip.firstChild);
    div(tip, 'sk-label', n.label).style.fontWeight = '700';
    div(tip, 'sk-amount', money(n.value));
    div(tip, 'sk-line', Math.round((n.value / v.total) * 100) + "% of the year's money");
    for (const line of n.lines || []) div(tip, 'sk-line', line);
    for (const it of n.items || []) {
      const row = div(tip, 'sk-item');
      const a = document.createElement('span');
      a.textContent = it.label;
      const b = document.createElement('span');
      b.textContent = money(it.value);
      row.appendChild(a);
      row.appendChild(b);
    }
    tip.style.display = 'block';
    const wrap = v.wrap,
      rect = wrap.getBoundingClientRect(),
      tw = tip.offsetWidth,
      th = tip.offsetHeight,
      x = clientX - rect.left + wrap.scrollLeft,
      viewL = wrap.scrollLeft,
      viewR = wrap.scrollLeft + wrap.clientWidth;
    let left = x + 14;
    if (left + tw > viewR) left = x - tw - 14;
    left = Math.max(viewL + 4, Math.min(left, viewR - tw - 4));
    const top = clamp(clientY - rect.top - 12, 0, Math.max(0, wrap.clientHeight - th - 2));
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    highlight(svg, target);
  }
  // Raises the band or bar under the pointer: the other ribbons drop to 0.15, its bars get an outline.
  function highlight(svg, target) {
    const v = views.get(svg);
    unhighlight(svg);
    let keep, bars;
    if (target.hasAttribute('data-node')) {
      const id = target.getAttribute('data-node');
      keep = (l) => l.from === id || l.to === id;
      bars = [id];
    } else {
      const l = v.links[Number(target.getAttribute('data-link'))];
      keep = (x) => x === l;
      bars = [l.from, l.to];
    }
    svg.querySelectorAll('path[data-link]').forEach((p) => {
      if (!keep(v.links[Number(p.getAttribute('data-link'))])) p.setAttribute('opacity', '0.15');
    });
    svg.querySelectorAll('rect[data-node]').forEach((r) => {
      if (bars.includes(r.getAttribute('data-node'))) r.setAttribute('stroke', v.ink);
    });
  }
  function unhighlight(svg) {
    svg.querySelectorAll('path[data-link][opacity]').forEach((p) => p.removeAttribute('opacity'));
    svg.querySelectorAll('rect[data-node][stroke]').forEach((r) => r.removeAttribute('stroke'));
  }
  // The cash-flow chart's pattern (initCashFlowHover): the mouse shows the tooltip for what is under it; a tap shows it and
  // it stays (no touchend handler) until a tap or click outside the diagram; keyboard focus shows it for the focused band.
  function wireHover(svg) {
    if (wired.has(svg)) return;
    wired.add(svg);
    const hit = (t) => (t && t.closest ? t.closest('[data-node],[data-link]') : null);
    let lastTouch = -Infinity;
    const at = (target, x, y) => {
      if (!views.get(svg)) return;
      const t = hit(target);
      if (t && svg.contains(t)) showTooltip(svg, t, x, y);
      else hideTooltip(svg);
    };
    svg.addEventListener('mousemove', (e) => at(e.target, e.clientX, e.clientY));
    svg.addEventListener('mouseleave', () => {
      if (performance.now() - lastTouch > 1000) hideTooltip(svg);
    });
    svg.addEventListener(
      'touchstart',
      (e) => {
        lastTouch = performance.now();
        const p = e.touches[0];
        at(e.target, p.clientX, p.clientY);
      },
      { passive: true },
    );
    svg.addEventListener(
      'touchmove',
      (e) => {
        const p = e.touches[0];
        at(document.elementFromPoint(p.clientX, p.clientY), p.clientX, p.clientY);
      },
      { passive: true },
    );
    svg.addEventListener('focusin', (e) => {
      const t = hit(e.target);
      if (!t) return;
      const r = t.getBoundingClientRect();
      showTooltip(svg, t, r.left + r.width / 2, r.top + r.height / 2);
    });
    svg.addEventListener('focusout', () => hideTooltip(svg));
    const outside = (e) => {
      if (!svg.contains(e.target)) hideTooltip(svg);
    };
    document.addEventListener('touchstart', outside, { passive: true });
    document.addEventListener('click', outside);
  }

  // Draws `model` (computeSankeyFlow's, or null for the empty message) into `svg`.
  // opts: { width, height, cols: 'five' | 'in' | 'out', fontPx, nodeW, gap, labelRoom? }. 'in' draws items, groups and the
  // total (labelled "Money in"); 'out' the total, groups and items ("Money out").
  export function drawSankey(svg, model, opts) {
    const { width, height } = opts,
      cols = opts.cols || 'five',
      fs = opts.fontPx || 11,
      nodeW = opts.nodeW || 6,
      gap = opts.gap ?? 10,
      run = ++drawCount;
    const wrap = svg.closest('.chart-wrap') || svg.parentElement;
    hideTooltip(svg);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.height = height + 'px';
    const ink = chartInkColor(),
      halo = chartHaloColor();
    if (!model) {
      views.delete(svg);
      el(svg, 'text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', fill: 'var(--muted)' }, EMPTY);
      return;
    }
    const pick = cols === 'in' ? [0, 1, 2] : cols === 'out' ? [2, 3, 4] : [0, 1, 2, 3, 4];
    const columns = pick.map((i) => model.columns[i]);
    const byId = new Map(),
      col = new Map();
    columns.forEach((c, ci) => c.forEach((n) => {
      byId.set(n.id, n);
      col.set(n.id, pick[ci]);
    }));
    const links = model.links.filter((l) => byId.has(l.from) && byId.has(l.to));
    const labelRoom = opts.labelRoom ?? (width >= 1000 ? 150 : 120);
    // Five columns spread evenly with label room outside the first and last bars; three columns (a phone held upright) keep
    // the label room on the items' side and put the total 10 px from the other edge.
    const three = (first, last) => [first, (first + last) / 2, last];
    let xs, sides;
    if (cols === 'in') {
      xs = three(labelRoom, width - nodeW - 10);
      sides = ['left', 'right', 'right'];
    } else if (cols === 'out') {
      xs = three(10, width - labelRoom - nodeW);
      sides = ['right', 'left', 'right'];
    } else {
      xs = sankeyColumnXs(width, 5, labelRoom, nodeW);
      sides = ['left', 'right', 'right', 'left', 'right'];
    }
    const box = {
      width, height, xs, nodeW, gap, sides,
      top: fs + 16, bottom: height - 8, labelH: 2 * fs + 3, minLabelBand: 6,
    };
    const L = layoutSankey({ columns, links }, box);
    const defs = el(svg, 'defs', {}),
      ribbons = el(svg, 'g', {}),
      bars = el(svg, 'g', {}),
      labels = el(svg, 'g', { 'pointer-events': 'none' });
    L.links.forEach((l, k) => {
      const a = L.nodes.get(l.from),
        b = L.nodes.get(l.to),
        id = `sk${run}-${k}`,
        x0 = a.x1,
        x1 = b.x0;
      const g = el(defs, 'linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: x0, y1: 0, x2: x1, y2: 0 });
      el(g, 'stop', { offset: '0%', 'stop-color': byId.get(l.from).color, 'stop-opacity': '0.4' });
      el(g, 'stop', { offset: '100%', 'stop-color': byId.get(l.to).color, 'stop-opacity': '0.4' });
      const p = el(ribbons, 'path', {
        d: sankeyRibbonPath(x0, l.sy0, l.sy1, x1, l.ty0, l.ty1),
        fill: `url(#${id})`,
        'data-link': k,
        tabindex: '0',
        'aria-label': `${byId.get(l.from).label} to ${byId.get(l.to).label}: ${money(l.value)}`,
      });
      p.style.cursor = 'pointer';
    });
    columns.forEach((c, ci) => c.forEach((n) => {
      const p = L.nodes.get(n.id);
      const r = el(bars, 'rect', {
        x: p.x0, y: p.y0, width: nodeW, height: Math.max(1, p.y1 - p.y0), fill: n.color,
        'stroke-width': '1.5', 'data-col': ci, 'data-node': n.id, tabindex: '0',
        'aria-label': `${n.label}: ${money(n.value)}`,
      });
      r.style.cursor = 'pointer';
    }));
    // Cuts a label to `w` px with an ellipsis, measured when the SVG is laid out, else fitLabel's estimate.
    const fit = (t, text, w, px) => {
      let len = t.getComputedTextLength();
      if (!(len > 0)) {
        t.textContent = fitLabel(text, w, px);
        return;
      }
      // the first cut is proportional to the overflow, then one character at a time
      let n = Math.min(text.length, Math.floor((text.length * w) / len) + 1);
      while (len > w && n > 1) {
        n--;
        t.textContent = text.slice(0, n - 1) + '…';
        len = t.getComputedTextLength();
      }
    };
    const haloStyle = `paint-order:stroke;stroke:${halo};stroke-width:3px;stroke-linejoin:round`;
    // The room beside a bar for its label: to the next column's bar on its side, or to the edge.
    const room = (ci, side) => {
      if (side === 'left') return ci === 0 ? xs[0] - 8 : xs[ci] - (xs[ci - 1] + nodeW) - 14;
      return ci === xs.length - 1 ? width - xs[ci] - nodeW - 8 : xs[ci + 1] - (xs[ci] + nodeW) - 14;
    };
    columns.forEach((c, ci) => c.forEach((n) => {
      if (n.id === 'hub') return;
      const p = L.nodes.get(n.id);
      if (p.labelHidden) return;
      const left = p.side === 'left',
        x = left ? p.x0 - 6 : p.x1 + 6,
        anchor = left ? 'end' : 'start',
        w = room(ci, p.side);
      fit(el(labels, 'text', {
        x, y: p.labelY - 1.5, 'text-anchor': anchor, 'font-size': fs - 1.5, fill: ink, opacity: '0.8', style: haloStyle,
      }, n.label), n.label, w, fs - 1.5);
      el(labels, 'text', {
        x, y: p.labelY + fs - 0.5, 'text-anchor': anchor, 'font-size': fs, 'font-weight': '700', fill: ink, style: haloStyle,
      }, fitLabel(compact(n.value), w, fs));
    }));
    const hub = L.nodes.get('hub');
    if (hub) {
      const title = cols === 'in' ? 'Money in' : cols === 'out' ? 'Money out' : 'Total';
      const anchor = cols === 'in' ? 'end' : cols === 'out' ? 'start' : 'middle';
      const x = cols === 'in' ? hub.x1 : cols === 'out' ? hub.x0 : hub.x0 + nodeW / 2;
      el(labels, 'text', {
        class: 'sankey-total', x, y: hub.y0 - 8, 'text-anchor': anchor, 'font-size': fs, 'font-weight': '700', fill: ink,
        style: haloStyle,
      }, `${title} ${compact(model.total)}`);
    }
    views.set(svg, { wrap, nodes: byId, col, links: L.links, total: model.total, ink });
    wireHover(svg);
  }

  // The card's height from the busiest column's bands, 300 to 480 px.
  function cardHeight(model) {
    if (!model) return 300;
    const n = Math.max(...model.columns.map((c) => c.length));
    return clamp(60 + 16 * n, 300, 480);
  }
  // The readout's ages: "Age 69" (one person), "Ages 69 / 67" (a couple, survivor years too).
  const agesOf = (row) => (state.singlePerson ? `Age ${row.age}` : `Ages ${row.age} / ${row.ageB}`);

  export function renderSankey(selected) {
    lastSelected = selected;
    const svg = document.getElementById('sankeySvg'),
      rows = selected.rows,
      slider = document.getElementById('sankeyAge');
    slider.max = String(Math.max(0, rows.length - 1));
    const idx = Math.min(rows.length - 1, Math.max(0, Number(slider.value) || 0));
    slider.value = String(idx);
    const row = rows[idx],
      calendarYear = CURRENT_YEAR + row.year;
    document.getElementById('sankeyAgeOut').textContent = `${agesOf(row)} · ${calendarYear}`;
    document.getElementById('sankeyAgeMin').textContent = agesOf(rows[0]);
    document.getElementById('sankeyAgeMax').textContent = agesOf(rows[rows.length - 1]);
    const model = computeSankeyFlow(row),
      width = Math.max(660, Math.round(svg.getBoundingClientRect().width) || 0),
      height = cardHeight(model);
    svg.setAttribute('data-year', String(calendarYear));
    svg.setAttribute('data-total', String(model ? Math.round(model.total) : 0));
    drawSankey(svg, model, { width, height, cols: 'five', fontPx: 11, nodeW: 6, gap: clamp(height * 0.035, 6, 14) });
  }
  export function wireSankeyCard() {
    const card = document.getElementById('sankeyCard');
    card.addEventListener('toggle', (e) => {
      if (e.target.open) render();
    });
    // A new card width re-lays the diagram out from the same run.
    let pending = false;
    window.addEventListener('resize', () => {
      if (pending || !card.open || !lastSelected) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (card.open && lastSelected) renderSankey(lastSelected);
      });
    });
  }
  export function wireSankeyAge() {
    document.getElementById('sankeyAge').addEventListener('input', () => {
      if (!document.getElementById('sankeyCard').open) return;
      if (lastSelected) renderSankey(lastSelected);
      else render();
    });
  }

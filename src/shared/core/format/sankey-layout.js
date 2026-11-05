// Sankey layout math: one shared scale, centred columns, stacked links, label placement and ribbon paths

  // Lays out a multi-column Sankey: one dollar is the same height in every
  // column, every column is centred, ribbons stack in the neighbour column's
  // order, and each column's labels are placed greedily (see below).
  export function layoutSankey(model, box) {
    const { columns, links } = model;
    const { top, bottom, gap, labelH, minLabelBand } = box;
    const H = bottom - top;
    const sums = columns.map((col) => col.reduce((s, n) => s + n.value, 0));
    const nodes = new Map();
    const seen = new Set();
    for (const col of columns) {
      for (const n of col) {
        if (seen.has(n.id)) throw new Error('layoutSankey: duplicate node id ' + n.id);
        seen.add(n.id);
      }
    }
    if (!(Math.max(0, ...sums) > 0)) return { scale: 0, nodes, links: [] };
    const nMax = Math.max(1, ...columns.map((col) => col.length));
    const gapUsed = Math.min(gap, (0.3 * H) / Math.max(1, nMax - 1));
    let scale = Infinity;
    columns.forEach((col, i) => {
      if (sums[i] > 0) scale = Math.min(scale, (H - gapUsed * (col.length - 1)) / sums[i]);
    });
    const mid = (top + bottom) / 2;
    const sides = box.sides || columns.map((_, i) => (i === 0 || i === 3 ? 'left' : 'right'));
    const colOf = new Map();
    columns.forEach((col, ci) => {
      const total = scale * sums[ci] + gapUsed * (col.length - 1);
      let y = mid - total / 2;
      const placed = col.map((n, i) => {
        // rounding can push the busiest column a hair past the box; clamp it back in
        const y0 = Math.max(top, y);
        const y1 = Math.min(bottom, y + n.value * scale);
        y = y + n.value * scale + gapUsed;
        colOf.set(n.id, { ci, i });
        return { n, y0, y1 };
      });
      // labels: largest band first; centred on the band, slid by at most labelH
      // to the nearest spot that clears the labels placed and stays in [top, bottom]
      const taken = [];
      const lo = top + labelH / 2;
      const hi = bottom - labelH / 2;
      const order = placed.map((p, i) => i).sort((a, b) => placed[b].n.value - placed[a].n.value || a - b);
      const out = new Array(placed.length);
      for (const k of order) {
        const centre = (placed[k].y0 + placed[k].y1) / 2;
        const cands = [centre, Math.min(Math.max(centre, lo), hi)];
        for (const q of taken) cands.push(q - labelH, q + labelH);
        let best = null;
        for (const p of cands) {
          if (p < lo || p > hi || Math.abs(p - centre) > labelH) continue;
          if (taken.some((q) => Math.abs(p - q) < labelH - 1e-9)) continue;
          if (best === null || Math.abs(p - centre) < Math.abs(best - centre)) best = p;
        }
        let hidden = best === null || placed[k].n.value <= 0;
        if (!hidden && Math.abs(best - centre) > 1e-9 && placed[k].y1 - placed[k].y0 < minLabelBand) hidden = true;
        if (!hidden) taken.push(best);
        out[k] = { labelY: hidden ? centre : best, labelHidden: hidden };
      }
      placed.forEach((p, k) => {
        nodes.set(p.n.id, {
          x0: box.xs[ci], x1: box.xs[ci] + box.nodeW, y0: p.y0, y1: p.y1,
          labelY: out[k].labelY, labelHidden: out[k].labelHidden, side: sides[ci],
        });
      });
    });
    // each node's links stack from its top: outgoing in the target column's order,
    // incoming in the source column's order
    const keep = links.filter((l) => nodes.has(l.from) && nodes.has(l.to));
    const idx = (id) => colOf.get(id).i;
    const col = (id) => colOf.get(id).ci;
    const sOrder = keep.map((l, k) => k).sort((a, b) => col(keep[a].from) - col(keep[b].from) || idx(keep[a].from) - idx(keep[b].from) || idx(keep[a].to) - idx(keep[b].to) || a - b);
    const tOrder = keep.map((l, k) => k).sort((a, b) => idx(keep[a].to) - idx(keep[b].to) || idx(keep[a].from) - idx(keep[b].from) || a - b);
    const sy = new Map(), ty = new Map();
    const res = keep.map((l) => ({ from: l.from, to: l.to, value: l.value, sy0: 0, sy1: 0, ty0: 0, ty1: 0 }));
    for (const k of sOrder) {
      const l = res[k];
      const at = sy.has(l.from) ? sy.get(l.from) : nodes.get(l.from).y0;
      l.sy0 = at;
      l.sy1 = at + l.value * scale;
      sy.set(l.from, l.sy1);
    }
    for (const k of tOrder) {
      const l = res[k];
      const at = ty.has(l.to) ? ty.get(l.to) : nodes.get(l.to).y0;
      l.ty0 = at;
      l.ty1 = at + l.value * scale;
      ty.set(l.to, l.ty1);
    }
    // keep the links in source column, source row, target row order so ribbons draw top to bottom
    const sorted = sOrder.map((k) => res[k]);
    return { scale, nodes, links: sorted };
  }
  // Left x of each of `count` columns, spread evenly; `labelRoom` px stay free
  // outside the first and last bars (`nodeW` is the last bar's width).
  export function sankeyColumnXs(width, count, labelRoom, nodeW = 0) {
    const first = labelRoom;
    const last = width - labelRoom - nodeW;
    if (count <= 1) return [first];
    const out = [];
    for (let i = 0; i < count; i++) out.push(first + ((last - first) * i) / (count - 1));
    return out;
  }
  // Truncates to about `maxPx` wide at `fontPx` with an ellipsis (0.58 em per character).
  export function fitLabel(text, maxPx, fontPx) {
    const max = Math.floor(maxPx / (fontPx * 0.58));
    if (text.length <= max) return text;
    return text.slice(0, Math.max(0, max - 1)) + '…';
  }

  // Standard Sankey ribbon: independent top/bottom cubic-bezier edges, so a
  // band can run diagonally (and even change width) between its two ends.
  export function sankeyRibbonPath(x0, y0a, y0b, x1, y1a, y1b) {
    const cx0 = x0 + (x1 - x0) * 0.45,
      cx1 = x0 + (x1 - x0) * 0.55;
    return `M ${x0} ${y0a} C ${cx0} ${y0a} ${cx1} ${y1a} ${x1} ${y1a} L ${x1} ${y1b} C ${cx1} ${y1b} ${cx0} ${y0b} ${x0} ${y0b} Z`;
  }

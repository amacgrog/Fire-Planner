// Sankey layout math: stacks node columns and builds ribbon paths

  // Stacks `nodes` top-to-bottom over [y0,y1] proportional to value/total.
  // Returns each node's true (exact) y-range plus a gap-inset draw range
  // (the "surface gap" spacer that visually separates touching bands
  // instead of a border) — the true range is what hub-face partitions key
  // off of so proportions line up exactly even though the drawn rects/
  // ribbons are inset.
  export function layoutSankeyColumn(nodes, x0, x1, y0, y1, total, gap = 1.5) {
    let y = y0;
    return nodes.map((n) => {
      const h = total > 0 ? (n.value / total) * (y1 - y0) : 0;
      const trueY0 = y,
        trueY1 = y + h;
      y += h;
      const mid = (trueY0 + trueY1) / 2;
      return {
        ...n,
        x0,
        x1,
        y0: trueY0,
        y1: trueY1,
        drawY0: Math.min(trueY0 + gap, mid),
        drawY1: Math.max(trueY1 - gap, mid),
      };
    });
  }
  // Standard Sankey ribbon: independent top/bottom cubic-bezier edges, so a
  // band can run diagonally (and even change width) between its two ends.
  export function sankeyRibbonPath(x0, y0a, y0b, x1, y1a, y1b) {
    const cx0 = x0 + (x1 - x0) * 0.45,
      cx1 = x0 + (x1 - x0) * 0.55;
    return `M ${x0} ${y0a} C ${cx0} ${y0a} ${cx1} ${y1a} ${x1} ${y1a} L ${x1} ${y1b} C ${cx1} ${y1b} ${cx0} ${y0b} ${x0} ${y0b} Z`;
  }

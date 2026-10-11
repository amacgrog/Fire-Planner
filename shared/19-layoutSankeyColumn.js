  // Stacks `nodes` top-to-bottom over [y0,y1] proportional to value/total.
  // Returns each node's true (exact) y-range plus a gap-inset draw range
  // (the "surface gap" spacer that visually separates touching bands
  // instead of a border) — the true range is what hub-face partitions key
  // off of so proportions line up exactly even though the drawn rects/
  // ribbons are inset.
  function layoutSankeyColumn(nodes, x0, x1, y0, y1, total, gap = 1.5) {
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
  function sankeyRibbonPath(x0, y0a, y0b, x1, y1a, y1b) {
    const cx0 = x0 + (x1 - x0) * 0.45,
      cx1 = x0 + (x1 - x0) * 0.55;
    return `M ${x0} ${y0a} C ${cx0} ${y0a} ${cx1} ${y1a} ${x1} ${y1a} L ${x1} ${y1b} C ${cx1} ${y1b} ${cx0} ${y0b} ${x0} ${y0b} Z`;
  }
  let sankeyTooltipEl = null;
  function ensureSankeyTooltip() {
    if (sankeyTooltipEl && document.body.contains(sankeyTooltipEl)) return sankeyTooltipEl;
    const wrap = document.getElementById('sankeySvg').closest('.chart-wrap');
    sankeyTooltipEl = document.createElement('div');
    sankeyTooltipEl.id = 'sankeyTooltip';
    sankeyTooltipEl.style.cssText =
      'position:absolute;pointer-events:none;background:rgba(15,23,42,.94);color:#fff;font-size:.72rem;padding:8px 10px;border-radius:8px;line-height:1.5;white-space:nowrap;display:none;z-index:6;box-shadow:0 6px 18px rgba(15,23,42,.25)';
    wrap.appendChild(sankeyTooltipEl);
    return sankeyTooltipEl;
  }
  function showSankeyTooltip(wrap, clientX, clientY, label, value, color) {
    const el = ensureSankeyTooltip();
    while (el.firstChild) el.removeChild(el.firstChild);
    const valueEl = document.createElement('div');
    valueEl.style.cssText = 'font-weight:700;font-size:.92rem';
    valueEl.textContent = money(value);
    const keyRow = document.createElement('div');
    keyRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:3px;color:#cbd5e1';
    const key = document.createElement('span');
    key.style.cssText = `display:inline-block;width:14px;height:2px;background:${color};flex:none`;
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    keyRow.appendChild(key);
    keyRow.appendChild(labelEl);
    el.appendChild(valueEl);
    el.appendChild(keyRow);
    const rect = wrap.getBoundingClientRect();
    let left = clientX - rect.left + 14,
      top = clientY - rect.top - 12;
    if (left + 170 > rect.width) left = clientX - rect.left - 184;
    if (left < 0) left = 4;
    el.style.left = left + 'px';
    el.style.top = Math.max(0, top) + 'px';
    el.style.display = 'block';
  }
  function hideSankeyTooltip() {
    if (sankeyTooltipEl) sankeyTooltipEl.style.display = 'none';
  }
  function renderSankey(selected) {
    const svg = document.getElementById('sankeySvg'),
      wrap = svg.closest('.chart-wrap'),
      rows = selected.rows,
      slider = document.getElementById('sankeyAge');
    slider.max = String(Math.max(0, rows.length - 1));
    const idx = Math.min(rows.length - 1, Math.max(0, Number(slider.value) || 0));
    slider.value = String(idx);
    const row = rows[idx];
    document.getElementById('sankeyAgeOut').textContent = `Age ${row.age}`;
    const { sources, uses, total } = computeSankeyFlow(row);
    const ns = 'http://www.w3.org/2000/svg',
      width = svg.clientWidth || 600,
      height = 360;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    hideSankeyTooltip();
    if (total <= 1) {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', width / 2);
      t.setAttribute('y', height / 2);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', 'var(--muted)');
      t.textContent = 'No meaningful cash flow this year.';
      svg.appendChild(t);
      return;
    }
    const pad = 10,
      colW = 150,
      hubW = 26,
      leftX0 = pad,
      leftX1 = pad + colW,
      rightX1 = width - pad,
      rightX0 = rightX1 - colW,
      midSpan = rightX0 - leftX1,
      hubX0 = leftX1 + (midSpan - hubW) / 2,
      hubX1 = hubX0 + hubW,
      top = 32,
      bottom = height - 14;
    const dark = isDarkTheme(),
      haloColor = dark ? '#0d141d' : '#ffffff',
      textColor = dark ? '#e5e7eb' : '#1e293b',
      mutedFill = dark ? 'rgba(195,194,183,0.22)' : 'rgba(137,135,129,0.22)';
    const leftNodes = layoutSankeyColumn(sources, leftX0, leftX1, top, bottom, total),
      rightNodes = layoutSankeyColumn(uses, rightX0, rightX1, top, bottom, total);
    // Hub-face partitions are independent orderings (largest value first) of
    // the same categories — this is a pure layout choice (the hub retains no
    // per-source identity past its edge, so there's no pairing being implied)
    // and it's what produces genuine diagonal curvature rather than flat bands.
    const hubIn = layoutSankeyColumn(
        [...sources].sort((a, b) => b.value - a.value),
        hubX0,
        hubX0,
        top,
        bottom,
        total,
      ),
      hubOut = layoutSankeyColumn(
        [...uses].sort((a, b) => b.value - a.value),
        hubX1,
        hubX1,
        top,
        bottom,
        total,
      );
    const hubInByLabel = new Map(hubIn.map((n) => [n.label, n])),
      hubOutByLabel = new Map(hubOut.map((n) => [n.label, n]));

    // Hub bar + total label.
    const hubRect = document.createElementNS(ns, 'rect');
    hubRect.setAttribute('x', hubX0);
    hubRect.setAttribute('y', top);
    hubRect.setAttribute('width', hubW);
    hubRect.setAttribute('height', bottom - top);
    hubRect.setAttribute('rx', 4);
    hubRect.setAttribute('fill', mutedFill);
    svg.appendChild(hubRect);
    const totalLabel = document.createElementNS(ns, 'text');
    totalLabel.setAttribute('x', hubX0 + hubW / 2);
    totalLabel.setAttribute('y', top - 12);
    totalLabel.setAttribute('text-anchor', 'middle');
    totalLabel.setAttribute('font-size', '10');
    totalLabel.setAttribute('font-weight', '700');
    totalLabel.setAttribute('fill', 'var(--muted)');
    totalLabel.textContent = `Total ${compact(total)}`;
    svg.appendChild(totalLabel);

    const ribbonsGroup = document.createElementNS(ns, 'g');
    const addRibbon = (x0, y0a, y0b, x1, y1a, y1b, color, label, value) => {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', sankeyRibbonPath(x0, y0a, y0b, x1, y1a, y1b));
      path.setAttribute('fill', color);
      path.setAttribute('opacity', '0.6');
      path.style.cursor = 'pointer';
      path.setAttribute('tabindex', '0');
      const lift = () => path.setAttribute('opacity', '0.85');
      const drop = () => path.setAttribute('opacity', '0.6');
      path.addEventListener('pointerenter', (e) => {
        lift();
        showSankeyTooltip(wrap, e.clientX, e.clientY, label, value, color);
      });
      path.addEventListener('pointermove', (e) => showSankeyTooltip(wrap, e.clientX, e.clientY, label, value, color));
      path.addEventListener('pointerleave', () => {
        drop();
        hideSankeyTooltip();
      });
      path.addEventListener('focus', (e) => {
        lift();
        const r = path.getBoundingClientRect();
        showSankeyTooltip(wrap, r.left + r.width / 2, r.top + r.height / 2, label, value, color);
      });
      path.addEventListener('blur', () => {
        drop();
        hideSankeyTooltip();
      });
      const title = document.createElementNS(ns, 'title');
      title.textContent = `${label}: ${money(value)}`;
      path.appendChild(title);
      ribbonsGroup.appendChild(path);
    };
    leftNodes.forEach((L) => {
      const H = hubInByLabel.get(L.label);
      addRibbon(leftX1, L.drawY0, L.drawY1, hubX0, H.drawY0, H.drawY1, L.color, L.label, L.value);
    });
    rightNodes.forEach((R) => {
      const H = hubOutByLabel.get(R.label);
      addRibbon(hubX1, H.drawY0, H.drawY1, rightX0, R.drawY0, R.drawY1, R.color, R.label, R.value);
    });
    svg.appendChild(ribbonsGroup);

    const drawNodes = (nodes, align) => {
      nodes.forEach((n) => {
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', n.x0);
        rect.setAttribute('y', n.drawY0);
        rect.setAttribute('width', n.x1 - n.x0);
        rect.setAttribute('height', Math.max(1, n.drawY1 - n.drawY0));
        rect.setAttribute('rx', 3);
        rect.setAttribute('fill', n.color);
        rect.style.cursor = 'pointer';
        rect.setAttribute('tabindex', '0');
        const lift = () => rect.setAttribute('stroke', dark ? 'rgba(255,255,255,.55)' : 'rgba(11,11,11,.4)');
        const drop = () => rect.removeAttribute('stroke');
        rect.setAttribute('stroke-width', '1.5');
        rect.addEventListener('pointerenter', (e) => {
          lift();
          showSankeyTooltip(wrap, e.clientX, e.clientY, n.label, n.value, n.color);
        });
        rect.addEventListener('pointermove', (e) => showSankeyTooltip(wrap, e.clientX, e.clientY, n.label, n.value, n.color));
        rect.addEventListener('pointerleave', () => {
          drop();
          hideSankeyTooltip();
        });
        rect.addEventListener('focus', (e) => {
          lift();
          const r = rect.getBoundingClientRect();
          showSankeyTooltip(wrap, r.left + r.width / 2, r.top + r.height / 2, n.label, n.value, n.color);
        });
        rect.addEventListener('blur', () => {
          drop();
          hideSankeyTooltip();
        });
        const title = document.createElementNS(ns, 'title');
        title.textContent = `${n.label}: ${money(n.value)}`;
        rect.appendChild(title);
        svg.appendChild(rect);
        if (n.y1 - n.y0 < 16) return;
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', align === 'left' ? n.x0 + 4 : n.x1 - 4);
        label.setAttribute('y', (n.y0 + n.y1) / 2 - 3);
        label.setAttribute('text-anchor', align === 'left' ? 'start' : 'end');
        label.setAttribute('font-size', '11');
        label.setAttribute('font-weight', '700');
        label.setAttribute('fill', textColor);
        label.setAttribute('style', `paint-order:stroke;stroke:${haloColor};stroke-width:3px;stroke-linejoin:round;pointer-events:none`);
        label.textContent = n.label;
        svg.appendChild(label);
        const valueText = document.createElementNS(ns, 'text');
        valueText.setAttribute('x', align === 'left' ? n.x0 + 4 : n.x1 - 4);
        valueText.setAttribute('y', (n.y0 + n.y1) / 2 + 11);
        valueText.setAttribute('text-anchor', align === 'left' ? 'start' : 'end');
        valueText.setAttribute('font-size', '10');
        valueText.setAttribute('fill', textColor);
        valueText.setAttribute('style', `paint-order:stroke;stroke:${haloColor};stroke-width:3px;stroke-linejoin:round;pointer-events:none`);
        valueText.textContent = compact(n.value);
        svg.appendChild(valueText);
      });
    };
    drawNodes(leftNodes, 'left');
    drawNodes(rightNodes, 'right');
  }
  function renderRothOptimizer(selected) {
    const card = document.getElementById('rothOptimizerCard'),
      summaryEl = document.getElementById('rothOptimizerSummary'),
      rowsEl = document.getElementById('rothOptimizerRows');
    const { results, best, currentBracket } = computeRothOptimizer(selected);
    const current = results.find((r) => r.bracket === currentBracket);
    const lastsLabel = (r) =>
      r.depletedAge
        ? `Age ${r.depletedAge}`
        : `Age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+`;
    if (best.bracket === currentBracket) {
      summaryEl.innerHTML = `Your current <b>${currentBracket}%</b> bracket target is already the lifetime-tax-minimizing choice among the available options here.`;
    } else {
      const savings = current.lifetimeTax - best.lifetimeTax;
      summaryEl.innerHTML = `Recommended: fill to the <b>${best.bracket}%</b> bracket instead of your current <b>${currentBracket}%</b> — an estimated <b>${money(savings)}</b> less lifetime tax (income + payroll, today's dollars) over the projection, without shortening how long the portfolio lasts.`;
    }
    rowsEl.innerHTML = results
      .map(
        (r) =>
          `<tr${r.bracket === best.bracket ? ' style="font-weight:700"' : ''}><td>${r.bracket}%${r.bracket === currentBracket ? ' (current)' : ''}${r.bracket === best.bracket ? ' ★' : ''}</td><td>${money(r.lifetimeTax)}</td><td>${money(r.endAssets)}</td><td><span class="table-status ${r.depletedAge ? 'fail' : ''}">${lastsLabel(r)}</span></td></tr>`,
      )
      .join('');
    card.hidden = false;
  }

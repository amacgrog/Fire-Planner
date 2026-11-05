// Folds the smallest items of a cash-flow diagram group into one "Other (n items)" item

  // Keeps the max - 1 largest items in their original order and one fold item (the rest's sum, their labels in `sub`); the
  // items unchanged when there are at most max. Ties keep the earlier item.
  export function foldItems(items, max = 8) {
    if (items.length <= max) return items;
    const keep = new Set(
      items
        .map((it, i) => i)
        .sort((a, b) => items[b].value - items[a].value || a - b)
        .slice(0, max - 1),
    );
    const kept = [],
      folded = [];
    for (let i = 0; i < items.length; i++) (keep.has(i) ? kept : folded).push(items[i]);
    let value = 0;
    for (const it of folded) value += it.value;
    kept.push({ key: 'fold', label: `Other (${folded.length} items)`, value, sub: folded.map((it) => it.label).join(', ') });
    return kept;
  }

// Registers a synthetic rule row for the duration of fn. A code may be registered once per table
// (the compiled caches are keyed by code); the map is keyed by the table object, which a fresh
// world replaces, so a new world starts clean.
const used = new WeakMap();

export function withRuleRow(table, code, row, fn) {
  let codes = used.get(table);
  if (!codes) { codes = new Set(); used.set(table, codes); }
  if (codes.has(code)) throw new Error('withRuleRow: code ' + code + ' was already registered for this table; use a new code');
  codes.add(code);
  table[code] = row;
  try {
    return fn();
  } finally {
    delete table[code];
  }
}

// Sets key on each compiled rule for the duration of fn and restores each old value (or absence).
export function withCompiledFlags(rules, key, value, fn) {
  const old = rules.map((r) => ({ had: Object.prototype.hasOwnProperty.call(r, key), value: r[key] }));
  for (const r of rules) r[key] = value;
  try {
    return fn();
  } finally {
    rules.forEach((r, i) => {
      if (old[i].had) r[key] = old[i].value;
      else delete r[key];
    });
  }
}

// The per-year path fingerprint of the household dumps (tests/conversion_sizing.js, tests/solver_scan.js --dump): { conv, path } of a run's rows.
//
// Installed in the page by installPathFingerprint(page) as window.__pathFp(rows). conv: the Roth conversion of each year, whole dollars.
// path: an FNV-1a 32-bit hex hash over, per year in order, the PATH_FIELDS of the row, each rounded to cents (a last-bit difference does not count).
const PATH_FIELDS = ['age', 'conversionAmount', 'traditionalWithdrawn', 'taxableWithdrawn', 'rothWithdrawn', 'tax', 'healthcare', 'magiProxy', 'cash', 'investable'];

// Self-contained: it runs in the page (serialized with toString), so it reads nothing from this file.
function pathFingerprint(rows, fields) {
  let h = 0x811c9dc5;
  const mix = (n) => {
    const s = String(n) + ',';
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  };
  const conv = [];
  for (const r of rows) {
    conv.push(Math.round(r.conversionAmount || 0) + 0);
    for (const f of fields) mix(Math.round((r[f] || 0) * 100) + 0);
    mix(';');
  }
  return { conv, path: (h >>> 0).toString(16).padStart(8, '0') };
}

async function installPathFingerprint(page) {
  await page.addInitScript(`window.__pathFp = (rows) => (${pathFingerprint.toString()})(rows, ${JSON.stringify(PATH_FIELDS)});`);
}

module.exports = { PATH_FIELDS, pathFingerprint, installPathFingerprint };

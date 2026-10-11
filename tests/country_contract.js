// The "#country/<name>" seam contract (plain Node): every module shared code imports through the alias
// must exist for both countries and export the same names, and the real tree must satisfy that.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkCountryContract } = require('../scripts/lib/country-contract');

const made = [];
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'country-contract-'));
  made.push(root);
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return root;
}

const SHARED = "import { taxFor, rate } from '#country/tax';\nexport const f = () => taxFor(rate);\n";
const BOTH = 'export function taxFor(x) { return x; }\nexport const rate = 1;\n';

(async () => {
  // Matching countries: no problems.
  assert.deepStrictEqual(
    await checkCountryContract(tree({ 'shared/core/draw.js': SHARED, 'us/tax.js': BOTH, 'canada/tax.js': BOTH })),
    [],
  );

  // A country module that does not exist.
  let problems = await checkCountryContract(tree({ 'shared/core/draw.js': SHARED, 'us/tax.js': BOTH }));
  assert.ok(problems.some((m) => /src\/canada\/tax\.js is missing/.test(m)), problems.join('\n'));

  // A name the shared code imports but a country does not export.
  problems = await checkCountryContract(
    tree({ 'shared/core/draw.js': SHARED, 'us/tax.js': BOTH, 'canada/tax.js': 'export function taxFor(x) { return x; }\n' }),
  );
  assert.ok(problems.some((m) => /src\/canada\/tax\.js does not export "rate"/.test(m)), problems.join('\n'));

  // Both countries export what is imported, but different extra names.
  problems = await checkCountryContract(
    tree({ 'shared/core/draw.js': SHARED, 'us/tax.js': BOTH + 'export const extra = 2;\n', 'canada/tax.js': BOTH }),
  );
  assert.ok(problems.some((m) => /the countries export different names/.test(m)), problems.join('\n'));

  // Forms the check cannot read are rejected, not skipped.
  problems = await checkCountryContract(
    tree({ 'shared/core/draw.js': "import * as t from '#country/tax';\nexport const f = t.taxFor;\n", 'us/tax.js': BOTH, 'canada/tax.js': BOTH }),
  );
  assert.ok(problems.some((m) => /must be a named import/.test(m)), problems.join('\n'));

  // A comment that mentions the alias is not an import.
  assert.deepStrictEqual(
    await checkCountryContract(tree({ 'shared/core/note.js': "// see '#country/tax' for the tax function\nexport const n = 1;\n" })),
    [],
  );

  // The real tree.
  assert.deepStrictEqual(await checkCountryContract(path.join(__dirname, '..', 'src')), []);

  console.log('country_contract OK');
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

'use strict';
// Checks the "#country/*" seam contract (spec section 12): every module that shared code imports
// through "#country/<name>" must exist for both countries and export the same names, including
// every name the shared code imports from it.
//
// Shared code may only use named imports of the alias, `import { a, b } from '#country/<name>'`;
// other forms (namespace, default, re-export) cannot be checked and are reported as problems.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const COUNTRIES = ['us', 'canada'];
const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]#country\/([^'"]+)['"]/g;
const ANY_ALIAS = /['"]#country\/[^'"]+['"]/g;

const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

// Map of module name -> Set of imported names, across every file under <srcRoot>/shared.
function collectSharedImports(srcRoot, problems) {
  const wanted = new Map();
  for (const file of listJsFiles(path.join(srcRoot, 'shared'))) {
    const code = stripComments(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
    const rel = path.relative(srcRoot, file).replace(/\\/g, '/');
    let named = 0;
    for (const match of code.matchAll(NAMED_IMPORT)) {
      named++;
      const names = match[1].split(',').map((part) => part.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      if (!wanted.has(match[2])) wanted.set(match[2], new Set());
      names.forEach((name) => wanted.get(match[2]).add(name));
    }
    if ((code.match(ANY_ALIAS) || []).length !== named) {
      problems.push(`src/${rel}: an import from "#country/..." must be a named import ({ a, b }); namespace, default and re-export forms cannot be checked`);
    }
  }
  return wanted;
}

async function exportsOf(file) {
  const result = await esbuild.build({
    entryPoints: [file],
    bundle: true,
    format: 'esm',
    write: false,
    metafile: true,
    outfile: 'country-contract-check.js', // never written (write: false)
    logLevel: 'silent',
  });
  return Object.values(result.metafile.outputs)[0].exports;
}

async function checkCountryContract(srcRoot) {
  const problems = [];
  const wanted = collectSharedImports(srcRoot, problems);
  for (const [name, imported] of [...wanted].sort((a, b) => a[0].localeCompare(b[0]))) {
    const exportsByCountry = {};
    for (const country of COUNTRIES) {
      const file = path.join(srcRoot, country, `${name}.js`);
      if (!fs.existsSync(file)) {
        problems.push(`#country/${name}: src/${country}/${name}.js is missing`);
        continue;
      }
      exportsByCountry[country] = await exportsOf(file);
      for (const imp of [...imported].sort()) {
        if (!exportsByCountry[country].includes(imp)) {
          problems.push(`#country/${name}: src/${country}/${name}.js does not export "${imp}", which shared code imports`);
        }
      }
    }
    const [us, canada] = COUNTRIES.map((country) => exportsByCountry[country]);
    if (us && canada && us.join() !== canada.join()) {
      problems.push(`#country/${name}: the countries export different names (us: ${us.join(', ')}; canada: ${canada.join(', ')})`);
    }
  }
  return problems;
}

module.exports = { checkCountryContract };

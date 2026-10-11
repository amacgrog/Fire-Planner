// Field-registry guard (Phase 2, step 3). Each planner declares every sidebar control that maps onto
// a `state` key once, in FIELDS; listeners, DOM sync, `ids`, normalizeState's enum guards and the
// MCP tool schema are all derived from it. This test makes a forgotten registration fail CI instead
// of silently leaving a control unwired:
//   - every registry entry has a `defaults`/state key, a DOM element (except hand-wired button
//     groups), and the `<key>Out` label / reveals / mirrors it names;
//   - every sidebar input/select/textarea is registered, a wizard mirror of a registered key, or in
//     the explicit UI-only list below;
//   - the update_fire_assumptions schema lists exactly the numeric + `mcp` fields, in registry order.
// Add a new field: markup + `defaults` + one FIELDS entry (see CLAUDE.md "Field registry").

const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const assert = require('assert');
const path = require('path');

// Controls that are real inputs but not state fields (search box, scenario name, file picker, chart
// and optimizer display toggles). Anything else must be registered.
const UI_ONLY = ['fieldSearch', 'scenarioName', 'importScenarioInput', 'logScaleToggle', 'mlRothLever', 'mlMixLever', 'mlSmoothLever', 'sankeyAge'];

async function check(browser, planner) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__tools = [];
    document.modelContext = { registerTool: (t) => window.__tools.push(t) };
  });
  await page.goto('file://' + plannerPath(planner, path.resolve(process.env.FIELD_ROOT || path.resolve(__dirname, '..'))));
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const fields = window.__test_FIELDS.map((f) => ({
      key: f.key, type: f.type, manual: !!f.manual, mcp: !!f.mcp, sync: f.sync || null, resync: f.resync || null,
      values: f.values || null, fallback: f.fallback ?? null, out: !!f.out, outSync: f.outSync || null,
      reveals: (f.reveals || []).map((r) => r.id), mirrors: f.mirrors || [],
    }));
    const state = window.__test_getState();
    const exists = (id) => !!document.getElementById(id);
    const controls = [...document.querySelectorAll('input,select,textarea')].filter((e) => e.id && !e.closest('[data-dyn-list]')).map((e) => e.id);
    const kind = (id) => { const e = document.getElementById(id); return e ? (e.tagName === 'SELECT' ? 'select' : e.type) : null; };
    const schema = window.__tools.find((t) => t.name === 'update_fire_assumptions').inputSchema.properties;
    return {
      fields, controls,
      stateHas: Object.fromEntries(fields.map((f) => [f.key, f.key in state])),
      elementKind: Object.fromEntries(fields.map((f) => [f.key, kind(f.key)])),
      outExists: Object.fromEntries(fields.filter((f) => f.out).map((f) => [f.key, exists(f.key + 'Out')])),
      revealExists: Object.fromEntries(fields.flatMap((f) => f.reveals.map((id) => [id, exists(id)]))),
      mirrorExists: Object.fromEntries(fields.flatMap((f) => f.mirrors.map((id) => [id, exists(id)]))),
      schemaKeys: Object.keys(schema),
    };
  });
  const label = planner.replace('Planner_', '').replace('.html', '');
  const keys = info.fields.map((f) => f.key);
  assert.deepStrictEqual(errors, [], `${label}: page errors ${errors}`);
  assert.strictEqual(new Set(keys).size, keys.length, `${label}: duplicate FIELDS keys`);
  for (const f of info.fields) {
    assert(info.stateHas[f.key], `${label}: FIELDS key "${f.key}" is not a state/defaults key`);
    assert(['number', 'bool', 'choice'].includes(f.type), `${label}: ${f.key}: unknown type ${f.type}`);
    if (!f.manual) {
      const want = { number: ['number', 'text', 'range'], bool: ['checkbox'], choice: ['select'] }[f.type];
      assert(want.includes(info.elementKind[f.key]), `${label}: ${f.key}: expected a ${want.join('/')} element with that id, found ${info.elementKind[f.key]}`);
    }
    if (f.type === 'choice' && f.fallback !== null) assert(f.values && f.values.includes(f.fallback), `${label}: ${f.key}: fallback not in values`);
    if (f.type !== 'number' && !f.manual) {
      assert(['controls', 'contrib'].includes(f.sync), `${label}: ${f.key}: needs sync 'controls' or 'contrib'`);
      assert(Array.isArray(f.resync) && f.resync.every((n) => ['controls', 'contrib'].includes(n)), `${label}: ${f.key}: bad resync`);
    }
    if (f.out) assert(info.outExists[f.key] && ['controls', 'contrib'].includes(f.outSync), `${label}: ${f.key}: out label element missing or outSync not set`);
  }
  for (const [id, ok] of Object.entries(info.revealExists)) assert(ok, `${label}: reveals element #${id} not found`);
  for (const [id, ok] of Object.entries(info.mirrorExists)) assert(ok, `${label}: mirror element #${id} not found`);
  const registered = new Set(keys);
  for (const id of info.controls) {
    if (registered.has(id) || UI_ONLY.includes(id)) continue;
    const m = id.match(/^wizard([A-Z].*)$/);
    if (m && registered.has(m[1][0].toLowerCase() + m[1].slice(1))) continue;
    assert.fail(`${label}: control #${id} is not in FIELDS (register it, or add it to UI_ONLY in this test if it is not a state field)`);
  }
  const mcpKeys = info.fields.filter((f) => f.type === 'number' || f.mcp).map((f) => f.key);
  assert.deepStrictEqual(info.schemaKeys, mcpKeys, `${label}: MCP schema properties differ from the registry (numeric + mcp fields, registry order)`);
  console.log(`[${label}] field registry test passed (${keys.length} fields, ${info.controls.length} controls, ${mcpKeys.length} MCP properties)`);
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await check(browser, 'Planner_US.html');
    await check(browser, 'Planner_Canada.html');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

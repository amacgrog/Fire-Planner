// UI-level characterization test (Phase 2, step 0.3 / 0.4 of the refactor plan).
//
// tests/snapshot.js pins the engine outputs. This file pins everything around
// them that the field-registry refactor (and any later cleanup) could silently
// break:
//
//  1. Clean load: no page errors / console errors, and no horizontal overflow
//     at 390x844 (the testing-checklist mobile check), in both planners.
//  2. Field wiring, one fresh page per sidebar control: set a test value
//     through the real DOM, then record (a) which `state` keys changed and to
//     what, (b) a hash of every control's value + which elements are hidden
//     afterwards (visibility is the usual "wired into the wrong sync function"
//     failure), and (c) the same two things after a page reload, which goes
//     through autosave -> normalizeState -> syncControls/syncContributionControls.
//  3. The MCP tool schema (names, input properties, enums) and the effect of
//     calling update_fire_assumptions.
//  4. Rendered results: with every collapsible card open and Math.random
//     seeded, a hash of the page's visible text plus window.fireProjection /
//     window.fireProjectionRows for a few states. (Canvas pixels are not
//     compared; the text/DOM around them is.)
//
// Usage: node tests/snapshot_ui.js [--update] [--only US|Canada] [--root DIR] [--cpu-throttle N]
//        [--filter text]   (filter applies to wiring field ids)
// Baselines live in tests/snapshots/ui_us.json and ui_canada.json.

const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { scenarios } = require('./snapshot_scenarios');
const { legacyToAccounts } = require('./legacy_balances');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};
const ROOT = path.resolve(opt('--root') || path.resolve(__dirname, '..'));
const CPU_THROTTLE = Number(opt('--cpu-throttle')) || 0;
const SNAP_DIR = path.join(__dirname, 'snapshots');
const PLANNERS = [
  { key: 'US', file: 'Planner_US.html', isUS: true, snap: 'ui_us.json' },
  { key: 'Canada', file: 'Planner_Canada.html', isUS: false, snap: 'ui_canada.json' },
];
const sha = (s, n = 16) => crypto.createHash('sha256').update(s).digest('hex').slice(0, n);

// Runs before the page's own scripts: pins Math.random and stubs the WebMCP
// registration point so the tool definitions can be captured.
const INIT = `
  (() => {
    let a = 12345;
    Math.random = function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    window.__tools = [];
    document.modelContext = { registerTool: (t) => window.__tools.push(t) };
  })();
`;

const HELPERS = `
  window.__ui = {
    controls() {
      return [...document.querySelectorAll('input,select,textarea')]
        .filter((e) => e.id && e.type !== 'file' && e.type !== 'search' && !e.closest('[data-dyn-list]'));
    },
    domMap() {
      const m = {};
      for (const e of this.controls()) m[e.id] = e.type === 'checkbox' ? e.checked : e.value;
      const hidden = [...document.querySelectorAll('[id]')].filter((e) => e.hidden === true).map((e) => e.id).sort();
      return { m, hidden };
    },
    stateDiff(before, after) {
      const d = {};
      for (const k of new Set([...Object.keys(before), ...Object.keys(after)]))
        if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) d[k] = [before[k] ?? null, after[k] ?? null];
      return d;
    },
    testValue(e) {
      if (e.type === 'checkbox') return !e.checked;
      if (e.tagName === 'SELECT') {
        const o = [...e.options].find((x) => x.value !== e.value);
        return o ? o.value : e.value;
      }
      const cur = Number(String(e.value).replace(/[^0-9.-]/g, '')) || 0;
      const min = e.min !== '' ? Number(e.min) : null, max = e.max !== '' ? Number(e.max) : null;
      const step = Number(e.step) > 0 ? Number(e.step) : 1;
      const snap = (v) => Math.round(v / step) * step;
      for (const f of [0.37, 0.61, 0.83]) {
        let v;
        if (min !== null && max !== null) v = snap(min + (max - min) * f);
        else v = snap(cur === 0 ? (e.classList.contains('money') ? 12345 : 7) : cur * (1 + f) + step);
        if (v !== cur) return String(v);
      }
      return String(cur + step);
    },
    fire(e, value) {
      if (e.type === 'checkbox') e.checked = value;
      else e.value = value;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    },
  };
`;

async function newPage(browser, planner, opts = {}) {
  const ctx = opts.ctx || (await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 } }));
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', (e) => page._errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') page._errors.push('console.error: ' + m.text());
  });
  if (CPU_THROTTLE) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  }
  await page.addInitScript(INIT);
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + plannerPath(planner.file, ROOT));
  await page.waitForTimeout(150);
  await page.evaluate(HELPERS);
  return page;
}

async function loadChecks(browser, planner) {
  const out = {};
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await newPage(browser, planner, { viewport });
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    out[name] = { errors: page._errors, horizontalOverflow: overflow };
    await page.context().close();
  }
  return out;
}

async function wiringOne(browser, planner, id) {
  const page = await newPage(browser, planner);
  const r = await page.evaluate((id) => {
    const state = window.__test_getState();
    const el = document.getElementById(id);
    const before = JSON.parse(JSON.stringify(state));
    const domBefore = window.__ui.domMap();
    const value = window.__ui.testValue(el);
    window.__ui.fire(el, value);
    const after = JSON.parse(JSON.stringify(state));
    const dom = window.__ui.domMap();
    return {
      value: typeof value === 'boolean' ? value : String(value),
      stateDiff: window.__ui.stateDiff(before, after),
      domChanged: Object.keys(dom.m).filter((k) => dom.m[k] !== domBefore.m[k]),
      hiddenAfter: dom.hidden,
      hiddenBefore: domBefore.hidden,
      domHash: JSON.stringify(dom),
      state: JSON.stringify(after),
    };
  }, id);
  // Autosave is debounced: wait until something has been written, then reload
  // (the context keeps localStorage), which exercises load -> normalizeState -> sync.
  await page
    .waitForFunction(() => Object.keys(localStorage).some((k) => (localStorage.getItem(k) || '').length > 50), null, { timeout: 3000 })
    .catch(() => {});
  await page.waitForTimeout(250);
  await page.reload();
  await page.waitForTimeout(100);
  await page.evaluate(HELPERS);
  const rel = await page.evaluate(() => ({
    domHash: JSON.stringify(window.__ui.domMap()),
    state: JSON.stringify(window.__test_getState()),
  }));
  const out = {
    value: r.value,
    stateDiff: r.stateDiff,
    domChanged: r.domChanged,
    hiddenNowVisible: r.hiddenBefore.filter((x) => !r.hiddenAfter.includes(x)),
    hiddenNowHidden: r.hiddenAfter.filter((x) => !r.hiddenBefore.includes(x)),
    domHash: sha(r.domHash, 12),
    reloadDomHash: sha(rel.domHash, 12),
    reloadMatchesLive: r.domHash === rel.domHash,
    reloadStateMatchesLive: r.state === rel.state,
    errors: page._errors,
  };
  await page.context().close();
  return out;
}

async function wiringFor(browser, planner, filter) {
  const probe = await newPage(browser, planner);
  const ids = (await probe.evaluate(() => window.__ui.controls().map((e) => e.id))).filter((id) => !filter || id.includes(filter));
  await probe.context().close();
  const result = {};
  let next = 0;
  const WORKERS = 8;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        result[id] = await wiringOne(browser, planner, id);
      }
    }),
  );
  return Object.fromEntries(Object.keys(result).sort().map((k) => [k, result[k]]));
}

async function mcpChecks(browser, planner) {
  const page = await newPage(browser, planner);
  const schema = await page.evaluate(() =>
    window.__tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })),
  );
  const exec = await page.evaluate(async (isUS) => {
    const t = window.__tools.find((x) => x.name === 'update_fire_assumptions');
    const input = isUS
      ? { spending: 77000, retireAgeA: 57, taxable: 123456, survivorEnabled: true, filingStatus: 'single', tenure: 'rent', acaEnabled: true, bogus: 5 }
      : { spending: 77000, retireAgeA: 57, taxable: 123456, survivorEnabled: true, tenure: 'rent', bogus: 5 };
    const proj = await t.execute(input);
    const read = await window.__tools.find((x) => x.name === 'read_fire_projection').execute();
    return { proj: JSON.stringify(proj), read: JSON.stringify(read), same: JSON.stringify(proj) === JSON.stringify(read), state: JSON.stringify(window.__test_getState()) };
  }, planner.isUS);
  await page.context().close();
  return {
    schemaHash: sha(JSON.stringify(schema)),
    toolNames: schema.map((t) => t.name),
    propertyNames: schema[0] ? Object.keys(schema[0].inputSchema.properties) : [],
    enums: schema[0] ? Object.fromEntries(Object.entries(schema[0].inputSchema.properties).filter(([, v]) => v.enum).map(([k, v]) => [k, v.enum])) : {},
    executeProjectionHash: sha(exec.proj),
    executeStateHash: sha(exec.state),
    readMatchesExecute: exec.same,
  };
}

async function surfaceChecks(browser, planner) {
  const wanted = ['std default', 'std R', 'std R everything'];
  const list = scenarios(planner.isUS).filter((s) => wanted.includes(s.name));
  const out = {};
  for (const sc of list) {
    const page = await newPage(browser, planner);
    // The planner debounces its historical backtest 500 ms after each render and computes one 500 ms after load;
    // the test advances the page clock itself so the capture always holds the patched state's own backtest,
    // whatever the machine's speed (docs/next-batches-plan.md, Open items).
    await page.clock.pauseAt(new Date('2026-06-15T12:01:00Z')); // fires whatever is due, then time stands still
    await page.evaluate(({ patch, convert }) => {
      const state = window.__test_getState();
      const base = JSON.parse(JSON.stringify(state));
      for (const k of Object.keys(state)) delete state[k];
      // The grid uses the old pooled retirement fields; a planner with per-partner accounts gets the equivalent.
      const toAccounts = eval('(' + convert + ')');
      Object.assign(state, base, base.trad401kA !== undefined ? toAccounts(patch, base) : patch);
      // Re-render through the real input path, then open every collapsible card.
      document.getElementById('spending').dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelectorAll('details').forEach((d) => (d.open = true));
    }, { patch: sc.patch, convert: legacyToAccounts.toString() });
    await page.clock.runFor(400);
    await page.evaluate(() => {
      document.getElementById('spending').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.clock.runFor(600);
    const r = await page.evaluate(() => {
      const text = (document.querySelector('main') || document.body).innerText.replace(/\s+/g, ' ');
      return {
        text,
        projection: JSON.stringify(window.fireProjection ?? null),
        rows: JSON.stringify(window.fireProjectionRows ?? null),
        histSuccess: document.getElementById('dashHistSuccess')?.innerText ?? null,
      };
    });
    out[sc.name] = {
      textHash: sha(r.text),
      textLength: r.text.length,
      projectionHash: sha(r.projection),
      rowsHash: sha(r.rows),
      histSuccess: r.histSuccess,
      errors: page._errors,
    };
    await page.context().close();
  }
  return out;
}

(async () => {
  const update = flag('--update');
  const only = opt('--only');
  const filter = opt('--filter');
  const browser = await chromium.launch();
  let failed = 0;
  try {
    for (const planner of PLANNERS) {
      if (only && only.toLowerCase() !== planner.key.toLowerCase()) continue;
      const t0 = Date.now();
      const got = {
        load: await loadChecks(browser, planner),
        mcp: await mcpChecks(browser, planner),
        surfaces: await surfaceChecks(browser, planner),
        wiring: await wiringFor(browser, planner, filter),
      };
      const snapPath = path.join(SNAP_DIR, planner.snap);
      const hardProblems = [];
      for (const [k, v] of Object.entries(got.load)) {
        if (v.errors.length) hardProblems.push(`load ${k}: ${v.errors.join('; ')}`);
        if (v.horizontalOverflow) hardProblems.push(`load ${k}: horizontal overflow`);
      }
      for (const [k, v] of Object.entries(got.wiring)) if (v.errors.length) hardProblems.push(`wiring ${k}: ${v.errors.join('; ')}`);
      for (const [k, v] of Object.entries(got.surfaces)) if (v.errors.length) hardProblems.push(`surface ${k}: ${v.errors.join('; ')}`);
      if (hardProblems.length) {
        failed++;
        console.error(`[${planner.key}] UI page problems:\n  ${hardProblems.slice(0, 15).join('\n  ')}`);
        continue;
      }
      if (update) {
        if (filter) throw new Error('refusing to --update with --filter');
        fs.mkdirSync(SNAP_DIR, { recursive: true });
        fs.writeFileSync(snapPath, JSON.stringify({ planner: planner.key, ...got }, null, 1) + '\n');
        console.log(`[${planner.key}] wrote UI baseline (${Object.keys(got.wiring).length} controls) to tests/snapshots/${planner.snap}`);
        continue;
      }
      const want = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
      const problems = [];
      const cmp = (label, a, b) => {
        if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(`${label}: ${JSON.stringify(b)} -> ${JSON.stringify(a)}`);
      };
      cmp('mcp', got.mcp, want.mcp);
      for (const k of new Set([...Object.keys(got.surfaces), ...Object.keys(want.surfaces)])) cmp(`surface "${k}"`, got.surfaces[k], want.surfaces[k]);
      for (const k of new Set([...Object.keys(got.wiring), ...(filter ? [] : Object.keys(want.wiring))])) {
        const g = got.wiring[k], w = want.wiring[k];
        if (!g) problems.push(`wiring ${k}: control no longer exists`);
        else if (!w) problems.push(`wiring ${k}: new control not in baseline`);
        else cmp(`wiring ${k}`, g, w);
      }
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      if (problems.length) {
        failed++;
        console.error(`[${planner.key}] UI snapshot MISMATCH (${problems.length}), ${secs}s:`);
        problems.slice(0, 20).forEach((p) => console.error('  ' + p.slice(0, 400)));
      } else console.log(`[${planner.key}] UI snapshot test passed (${Object.keys(got.wiring).length} controls, MCP, 3 rendered states, ${secs}s)`);
    }
  } finally {
    await browser.close();
  }
  if (failed) process.exit(1);
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});

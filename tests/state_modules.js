// The shared state modules (plain Node): importable without a DOM, live bindings, assign* setters.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const load = (rel) => import(pathToFileURL(path.join(__dirname, '..', rel)).href);

(async () => {
  // store.js: state, mode, scenarios, compareIds
  const store = await load('src/shared/core/store.js');
  assert.strictEqual(store.state, null, 'state is null until main.js assigns it at startup');
  assert.strictEqual(store.mode, 'real');
  assert.deepStrictEqual(store.scenarios, []);
  assert.ok(store.compareIds instanceof Set);
  const next = { retireAgeA: 50 };
  store.assignState(next);
  assert.strictEqual(store.state, next, 'the live binding follows assignState');
  store.assignMode('nominal');
  assert.strictEqual(store.mode, 'nominal');
  const list = [{ id: 1 }];
  store.assignScenarios(list);
  assert.strictEqual(store.scenarios, list);

  console.log('state_modules OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

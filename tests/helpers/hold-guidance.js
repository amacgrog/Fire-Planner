// Preloaded by tests/ui_scripts.js (`node -r`) into every root UI script not in its HOLD_OFF list: each browser context the
// script opens sets globalThis.__testHoldGuidance before the page's own script runs, so the two guidance jobs (the field
// impacts and the goal answers) start no timer and wait for the script's __test_flushGuidance(). Production never sets it.
const playwright = require('playwright');

const INIT = 'globalThis.__testHoldGuidance = true;';

for (const type of [playwright.chromium, playwright.firefox, playwright.webkit]) {
  const launch = type.launch.bind(type);
  type.launch = async (...args) => {
    const browser = await launch(...args);
    const newContext = browser.newContext.bind(browser);
    const newPage = browser.newPage.bind(browser);
    browser.newContext = async (...opts) => {
      const context = await newContext(...opts);
      await context.addInitScript(INIT);
      return context;
    };
    // A context's init script applies to every later navigation of its pages, this one's first goto included.
    browser.newPage = async (...opts) => {
      const page = await newPage(...opts);
      await page.context().addInitScript(INIT);
      return page;
    };
    return browser;
  };
}

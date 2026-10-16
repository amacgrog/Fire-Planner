import { makeTableWrapsFocusable } from './first-run-ui.js';

  export function wireTableFocus() {
    makeTableWrapsFocusable();
    new MutationObserver(() => makeTableWrapsFocusable()).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

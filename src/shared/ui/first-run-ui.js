  // Wide result tables scroll horizontally inside `.table-wrap` on
  // narrower screens; a scrollable region needs to be reachable by
  // keyboard (WCAG 2.1.1), so every one gets tabindex="0" plus a label,
  // whether it's in the initial markup or built later by a render
  // function (scenario comparison, projection table, sensitivity, Roth
  // optimizer, etc.) — the observer catches those without having to
  // touch each render function individually.
  export function makeTableWrapsFocusable(root) {
    (root || document).querySelectorAll('.table-wrap').forEach((el) => {
      if (el.hasAttribute('tabindex')) return;
      el.setAttribute('tabindex', '0');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'region');
      if (!el.hasAttribute('aria-label')) {
        const caption = el.querySelector('th')?.textContent?.trim();
        el.setAttribute('aria-label', caption ? `${caption} table, scrollable` : 'Scrollable table');
      }
    });
  }
  export const mc = document.modelContext;

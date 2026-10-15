import { money } from './money-format.js';

  // Scenarios: named snapshots of the full input state, kept in memory for
  // this tab and optionally exported to a JSON file for safekeeping. Every
  // load path (boot, Load, and file import) runs through normalizeState(),
  // so a scenario saved by an older or newer version of this tool still
  // loads correctly — missing fields fall back to today's defaults, and
  // unrecognized old fields are simply dropped.
  export const cloneState = (s) => JSON.parse(JSON.stringify(s));
  export const overlayColors = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0e9f9a', '#db2777'];
  // Higher is better for every metric in this table (more money, longer-lasting
  // portfolio), so a single up=green/down=red convention works for all of them.
  export function deltaMoney(diff) {
    if (!diff || Math.abs(diff) < 1) return '';
    const cls = diff > 0 ? 'up' : 'down';
    return `<span class="delta ${cls}">${diff > 0 ? '+' : ''}${money(diff)}</span>`;
  }
  export function deltaAge(diff) {
    if (!diff) return '';
    const cls = diff > 0 ? 'up' : 'down';
    return `<span class="delta ${cls}">${diff > 0 ? '+' : ''}${Math.round(diff)}y</span>`;
  }

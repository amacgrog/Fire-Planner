// The storage wrapper and the scenario schema version

import { storageKey } from '#country/storage-key';

export { storageKey };
export const legacyStorageKey = 'fireCouplePlanner.v3';
export const SCENARIO_SCHEMA_VERSION = 1;

// load-time: probes localStorage once; reads nothing a statement writes.
// Feature-detected rather than a bare `window.localStorage` reference:
// the property itself can throw (not just return undefined) in some
// private-browsing modes, and a browser that exposes the property can
// still refuse to actually read/write it (e.g. Safari private mode
// historically allowed getItem but threw on setItem). Probing with a
// real set/remove up front means every later `storage?.` call site can
// stay a simple optional-chain without its own try/catch.
export const storage = (() => {
  try {
    const probeKey = '__firePlannerStorageProbe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch {
    return null;
  }
})();

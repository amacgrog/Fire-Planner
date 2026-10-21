// Shared mutable state: the input state, display mode, scenarios and compare ids

// Shared mutable bindings that more than one module reads. Readers import the binding (a live view of
// this module's variable); only this module assigns it, through the assign* functions (assigning to an
// import is a build error). No DOM access: this file is importable in plain Node.

export let state = null; // set once at startup: assignState(normalizeState(null))
export let mode = 'real';
export let scenarios = [];
// load-time: creates an empty Set; reads nothing
export const compareIds = new Set();

export function assignState(next) {
  state = next;
}
export function assignMode(next) {
  mode = next;
}
export function assignScenarios(next) {
  scenarios = next;
}

// The market scenario's revert snapshot (the real settings while a scenario is on)

  // Non-null exactly while a market scenario is on: the UI's single "is a scenario on" test
  // (never read state.marketScenario for that). Imports nothing, so autosave can read it with no cycle.
  export let scenarioSnapshot = null;
  export function assignScenarioSnapshot(s) {
    scenarioSnapshot = s;
  }

// Test hooks shared by both planners, exposed on window

import { HIST } from '../core/basics.js';
import { runHistoricalCycles, runMonteCarlo, simulate, simulateHistorical } from '../core/simulate.js';
import { refillBondReserve } from '../core/refill-bond-reserve.js';
import { rotateIntoBondLadder } from '../core/bond-ladder-rotation.js';

  export function installSharedTestHooks() {
    // Test-only exports for test_roth_optimizer_per_year.js — specifically
    // the brute-force-cross-check test, which needs to independently drive
    // the per-year override and re-score arbitrary candidate schedules to
    // verify optimizeRothLadderPerYear() actually finds the true global
    // optimum, not just "some" answer. There's no way to construct that
    // check through the DOM alone (the UI only ever sets one flat bracket
    // across a whole window), so these mirror the same
    // window.fireProjectionRows-style precedent already used above for the
    // MCP tool hooks: a deliberate, narrow exposure of internal state for
    // tooling, not an accident to clean up. Harmless in production (no
    // user data, nothing network-reachable, purely references to functions
    // that already exist in this closure).
    window.__test_simulate = simulate;
    window.__test_simulateHistorical = simulateHistorical;
    window.__test_runHistoricalCycles = runHistoricalCycles;
    window.__test_runMonteCarlo = runMonteCarlo;
    window.__test_refillBondReserve = refillBondReserve;
    window.__test_rotateIntoBondLadder = rotateIntoBondLadder;
    window.__test_HIST = HIST;
  }

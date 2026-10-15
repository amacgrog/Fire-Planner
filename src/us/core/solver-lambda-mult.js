  // ---- Per-year solver (Batch 3C) ----------------------------------------------------------------------
  // Each year with a withdrawal, the solver may test a few candidates (a MAGI target just under a line or
  // just over a floor, the stock-account order, whose accounts fund the draw) by dry-running the year's
  // real withdrawal, and keeps the one that leaves the most after-tax wealth, with traditional dollars
  // worth (1 - lambda). See docs/superpowers/specs/2026-10-06-per-year-solver-3c-design.md.
  export const SOLVER_LAMBDA_MULT = 1,
    REACH_GROSS_UP = 2,
    LAMBDA_MAX = 0.6,
    TAU_GAIN_MAX = 0.5;
  // The year's federal MAGI lines, in household MAGI: the ACA floor (100%), the Medicaid line and the 400%
  // cliff for partners on the individual market; the IRMAA tier edges from 63 (retired); the senior-
  // deduction phase-out start (65+, through 2028); the child-tax-credit phase-out start. With two returns
  // each return's line is translated into household MAGI through that return's share of the traditional
  // draw (the solver prices candidates with the real functions, so the translation only places them).
  // State-law cliffs are priced by taxFor but are not candidates (documented gap).
  // With c.lo / c.hi (the year's reach) only the lines in (lo, hi] are kept, the only ones the solver uses, and a
  // year with none returns a shared empty list (the skip path allocates no line objects).
  export const NO_THRESHOLDS = Object.freeze([]);

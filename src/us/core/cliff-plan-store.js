// The kept cliff plan and what it was made for (written by refreshCliffPlan, src/us/core/refresh-cliff-plan.js, and by
// the __test_setCliffPlan hook; read by planForState, src/us/core/run-projection.js). Declared as one object so every
// module that plans or reads the plan shares it. No DOM access.
export const cliffPlanStore = {
  plan: null, // the kept plan (null with the guard off)
  key: null, // JSON of the state it was made for
  report: null, // the keep-rule table
  forState: null, // the state object refreshCliffPlan() planned for
  // What else the kept plan was made under (refreshCliffPlan keeps it while all of these are unchanged),
  // and whether plan / report hold a computed plan (false after a test hook set the plan by hand).
  year: null,
  overrides: null,
  computed: false,
  computes: 0, // computeCliffPlan calls from refreshCliffPlan (tests)
};

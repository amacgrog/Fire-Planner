// Test-only override maps the store's run context reads. No DOM access.

export const optimizerState = {
  // Per-age override maps the store's run context reads: set only by the test hooks (__test_setRothOverride,
  // __test_setWithdrawalMixOverride); nothing in the UI writes them. A mapped 0 or no entry means no override that year.
  rothBracketByAge: null,
  withdrawalMixByAge: null,
};

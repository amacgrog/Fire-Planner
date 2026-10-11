// Per-run tax-indexing factors for the historical engine (read by taxIndexFactor): an array while a
// historical run is in progress, null otherwise. Readers import the live binding; only this module
// assigns it. No DOM access.

export let histTaxFactors = null;

export function assignHistTaxFactors(next) {
  histTaxFactors = next;
}

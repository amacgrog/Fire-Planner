// The UI's context factory for variants of the store's state: stateContextFor()

import { state } from '../../core/store.js';
import { variantContext } from '#country/core/seam-variantContext';

  // A context factory `(variant, overrides?) => ctx` whose base is the store's state object itself (never a copy, so the
  // kept plan's identity rule holds): the UI passes it, with `state`, to every core function that runs variants.
  export function stateContextFor() {
    const base = state;
    return (variant, overrides) => variantContext(base, variant, { overrides });
  }

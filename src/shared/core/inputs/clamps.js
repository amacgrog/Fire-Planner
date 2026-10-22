// Input clamps run by the field registries' onInput hooks (they write the store's state)

import { state } from '../store.js';

  export const clampRetireAgeA = () => (state.retireAgeA = Math.min(70, Math.max(state.retireAgeA, state.ageA)));
  export const clampRetireAgeB = () => (state.retireAgeB = Math.min(70, Math.max(state.retireAgeB, state.ageB)));

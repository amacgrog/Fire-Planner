// The pure display conversion: nominal or real (inflation-deflated) dollars, with no store read

import { pct } from './numbers.js';

  export function displayValueOf(mode, inflation, n, yearIndex, factor) {
    return mode === 'real' ? n / (factor ?? Math.pow(1 + pct(inflation), yearIndex)) : n;
  }

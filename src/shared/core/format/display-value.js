// The pure display conversion: nominal or real (inflation-deflated) dollars, with no store read

import { pct } from './numbers.js';

  export function displayValueOf(mode, inflation, n, yearIndex) {
    return mode === 'real' ? n / Math.pow(1 + pct(inflation), yearIndex) : n;
  }

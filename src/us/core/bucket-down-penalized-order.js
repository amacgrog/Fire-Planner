import { BUCKET_STEP } from './bucket-step.js';

  // The bucket strategy while penalized money exists (US): the same two years, but every step draws
  // only penalty-free money, cash and the bond reserve come before Roth basis in an up year too, and a
  // penalized tier (cheapest per dollar) runs just before home equity.
  export const BUCKET_DOWN_PENALIZED_ORDER = ['cash', 'bondTaxable', 'bondTraditional', 'bondRoth', 'stocks', 'roth', 'penalized', 'home'].map((k) => BUCKET_STEP[k]);

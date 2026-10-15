import { BUCKET_STEP } from './bucket-step.js';

  export const BUCKET_UP_PENALIZED_ORDER = ['stocks', 'cash', 'bondTaxable', 'bondTraditional', 'bondRoth', 'roth', 'penalized', 'home'].map((k) => BUCKET_STEP[k]);

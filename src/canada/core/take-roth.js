  // TFSA withdrawals are tax-free, so the net cash is simply what is taken.
  // `bucket` is 'roth' | 'bondRoth' (the TFSA and its bond bucket).
  export function takeRoth(wd, bucket, amount) {
    const from = Math.min(wd.bal[bucket], amount);
    wd.bal[bucket] -= from;
    return from;
  }

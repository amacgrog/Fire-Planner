  export const money = (n) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
      notation: Math.abs(n) >= 1e7 ? 'compact' : 'standard',
    }).format(n || 0);
  export const compact = (n) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n || 0);

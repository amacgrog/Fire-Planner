// Number and text formatting helpers: money, pct, compact, clamp, escapeHtml

  export const pct = (n) => (n || 0) / 100;
  export const escapeHtml = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  export const clamp = (n, min = 0, max = Infinity) => Math.min(max, Math.max(min, n));
  export const paychecksPerYear = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
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

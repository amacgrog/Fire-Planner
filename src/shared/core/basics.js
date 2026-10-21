  export const pct = (n) => (n || 0) / 100;
  export const escapeHtml = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  export const clamp = (n, min = 0, max = Infinity) => Math.min(max, Math.max(min, n));
  export const paychecksPerYear = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

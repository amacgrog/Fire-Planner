import { attachMoneyPreview } from '../core/money-format.js';

  export function refreshMoneyPreviews(root) {
    (root || document).querySelectorAll('input.money').forEach(attachMoneyPreview);
  }

  // Dollar-amount fields (class="money") show live comma formatting right
  // in the field ("$1,850,000") — a plain <input type="number"> can't do
  // this itself (a number input strips anything that isn't a numeral), so
  // the first time a field is touched it's switched to type="text" with
  // inputmode="decimal" (keeps the numeric keypad on mobile) and given an
  // 'input' listener that reformats on every keystroke, restoring the
  // caret by counting digits rather than characters, so typing in the
  // middle of a number doesn't jump the cursor to the end. Every other
  // piece of code that reads one of these fields' value (the generic `ids`
  // input handler, the dynamic loan/tier/income-source/one-time-income
  // handlers) strips non-digits itself before calling Number() on it — see
  // the "Money-field live formatting" note in CLAUDE.md for the full list.
  // Idempotent: safe to call repeatedly (syncControls() re-sets values on
  // reset/load/import) and safe on freshly-rebuilt dynamic rows (loans,
  // spending tiers, income sources) without double-binding listeners.
  export function attachMoneyPreview(el) {
    const reformat = (digitsBeforeCaret) => {
      const digits = el.value.replace(/[^0-9]/g, '');
      const formatted = digits ? '$' + Number(digits).toLocaleString('en-US') : '';
      // Skip the write when the field is already showing the correctly
      // formatted string — a plain reassignment (even to an identical
      // string) collapses the caret to the end and, on some mobile
      // browsers, can re-show the on-screen keyboard for a field that's
      // still focused but whose keyboard was just dismissed (e.g. via the
      // Android back button). refreshMoneyPreviews() (called from
      // syncControls(), on every render of a dynamic loan/tier/income row,
      // etc.) re-runs this on every money field unconditionally, so this
      // guard is what keeps those routine resyncs from nudging a field the
      // user has already backed out of. Real typing always differs from
      // `formatted` pre-write (the browser just inserted a raw, unformatted
      // character), so this never skips an actual edit.
      if (formatted === el.value) return;
      el.value = formatted;
      if (digitsBeforeCaret == null) return;
      let count = 0,
        pos = el.value.length;
      if (digitsBeforeCaret === 0) {
        pos = 0;
      } else {
        for (let i = 0; i < el.value.length; i++) {
          if (/[0-9]/.test(el.value[i])) count++;
          if (count === digitsBeforeCaret) {
            pos = i + 1;
            break;
          }
        }
      }
      el.setSelectionRange(pos, pos);
    };
    if (!el.dataset.moneyBound) {
      el.type = 'text';
      el.inputMode = 'decimal';
      el.autocomplete = 'off';
      el.addEventListener('input', () => {
        const caret = el.selectionStart;
        const digitsBeforeCaret =
          caret == null ? Infinity : el.value.slice(0, caret).replace(/[^0-9]/g, '').length;
        reformat(digitsBeforeCaret);
      });
      el.dataset.moneyBound = '1';
    }
    reformat(null);
  }
  export function refreshMoneyPreviews(root) {
    (root || document).querySelectorAll('input.money').forEach(attachMoneyPreview);
  }

// Input gestures: keeps the sidebar steady on reflow and the plan status bar and tab switcher behavior

  export function wireInputGestures() {
    // The Plan status bar and (on mobile) the Inputs/Dashboard tab switcher
    // Checking/unchecking a sidebar checkbox (or changing a <select> like
    // tenure/k401Type) can add or remove other fields elsewhere in the panel
    // -- singlePerson hides/shows every data-partner-b field across several
    // groups at once, and most opt-in checkboxes (ACA, LTC, other
    // income, other loans, survivor, guardrails, Roth conversion/RRSP
    // meltdown, mega backdoor) show/hide fields within their own group. The
    // resulting height change shifts everything below the toggle, which can
    // jump the control the person just clicked out from under their
    // cursor/finger and lose their place in a long sidebar. Preserve the
    // toggle's own on-screen position across that reflow instead: this
    // listener is registered on `document` with capture:true, so it fires
    // before the field's own `change` listener runs the actual show/hide,
    // letting it record the toggle's position pre-mutation; two animation
    // frames later (once layout has settled) it adjusts whichever container
    // actually scrolls -- the whole page on mobile (`.panel` is
    // `position:static` there) or `.panel`'s own internal scroll on desktop
    // -- by the resulting delta, so the toggle itself doesn't visually move.
    document.addEventListener(
      'change',
      (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return;
        if (t instanceof HTMLInputElement && t.type !== 'checkbox' && t.type !== 'radio') return;
        const panel = t.closest('.panel');
        if (!panel) return;
        const before = t.getBoundingClientRect().top;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const after = t.getBoundingClientRect().top;
            const delta = after - before;
            if (Math.abs(delta) < 1) return;
            if (window.innerWidth <= 820) {
              window.scrollBy(0, delta);
            } else {
              panel.scrollTop += delta;
            }
          });
        });
      },
      true,
    );
    // Real-world bug report, still reproducing on-device after the
    // syncControls()/attachMoneyPreview/dynamic-list fixes above: focus a
    // text/money field (opens the on-screen keyboard), then drag a slider
    // elsewhere on the page while the text field's caret is still sitting in
    // it (never blurred) — the keyboard pops back up over the field, even
    // though nothing in this file's own code still writes to that field's
    // `.value` or rebuilds its DOM node (both were audited and swept with
    // Playwright across every slider in both files, at both desktop and
    // mobile widths, with zero spurious writes and no focus loss found). This
    // points to a platform-level quirk rather than a remaining DOM bug: some
    // mobile browsers/WebViews re-evaluate whether to show the soft keyboard
    // whenever the page regains "input focus" from a touch gesture, even one
    // aimed at a completely different control, as long as some element (here,
    // the text field the person never explicitly left) still technically has
    // DOM focus. The fix that's actually within this file's control either
    // way: explicitly blur the old field ourselves, as early in the gesture
    // as possible, whenever a slider drag begins elsewhere. A field with no
    // focus gives the OS keyboard nothing to reopen for, regardless of the
    // exact underlying platform mechanism, and it also matches how a person
    // would expect a well-behaved page to react to them starting to interact
    // with something else. `pointerdown` (not `input`, which only fires once
    // the drag has already started moving the thumb) is used so the blur
    // happens at the very first touch, before any keyboard-reopen animation
    // has a chance to begin.
    document.addEventListener(
      'pointerdown',
      (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement) || t.type !== 'range') return;
        const active = document.activeElement;
        if (
          active &&
          active !== t &&
          active instanceof HTMLInputElement &&
          (active.type === 'text' || active.type === 'number') &&
          typeof active.blur === 'function'
        ) {
          active.blur();
        }
      },
      true,
    );
    // Touch/pen vs. page-scroll gesture disambiguation for range sliders.
    //
    // On-device testing (Android Chrome, see the slider-gesture-disambiguation
    // branch's scope doc) ruled out the simpler "just watch touch direction,
    // never call preventDefault()" approach: touching a native
    // <input type=range> track snaps its value to the touch point on the very
    // first touch, before any movement and before any JS runs, and further
    // movement is then split between dragging the thumb and scrolling the
    // page, with the scroll throttled to a fraction of the actual finger
    // travel (confirmed with a diagnostic build: a 10px vertical drag produced
    // under 2px of page scroll). There's no reliable way to get clean,
    // deliberate behavior without taking over the whole gesture ourselves.
    //
    // A first version of this fix used `touch-action:none` on the slider plus
    // `preventDefault()` in a pointer event handler, on the theory that
    // either — or both together — would suppress the browser's native
    // handling. On-device testing (real Android Chrome) disproved that
    // theory completely: `getComputedStyle` confirmed `touch-action:none` was
    // genuinely applying (it correctly stopped the page from panning), and
    // instrumenting `Event.prototype.preventDefault` confirmed it was
    // genuinely being called on every `pointerdown`/`pointermove` — and the
    // slider *still* visibly jumped and dragged regardless. This browser
    // treats a native `<input type=range>`'s own touch-drag as a default
    // action that neither `touch-action` nor `preventDefault()` can suppress.
    // Nothing short of keeping the touch from ever reaching the real input
    // element in the first place actually works.
    //
    // So: `setupRangeTouchCatchers()` (below) wraps every slider in a small
    // positioned container and inserts an invisible sibling
    // `.range-touch-catcher` `<div>` directly on top of it. On a
    // coarse-pointer (touch-primary) device, that catcher — not the real
    // `<input>` — is what the finger actually lands on, via
    // `@media(pointer:coarse){.range-touch-catcher{pointer-events:auto}}`
    // (`pointer-events:none` the rest of the time, so mouse clicks pass
    // straight through to the real input on every non-touch-primary device,
    // completely unaffected). A structural guarantee like this is much
    // stronger than hoping an API call suppresses a default action: the
    // browser can't run a native default action on an element that never
    // received the touch to begin with.
    //
    // The catcher's own `touch-action` is `pan-y`, not `none` — since it's a
    // plain `<div>` with no default action of its own, `pan-y` lets the
    // browser's native compositor-thread scrolling handle a vertical drag
    // entirely for free (smooth, real momentum, zero JS involved), while
    // still forbidding the catcher's own default handling of anything
    // *other* than vertical panning — so a horizontal drag has no competing
    // native behavior to fight, and this code is free to treat it purely as
    // a slider drag. (This sidesteps the earlier "touch-action can't be
    // flipped mid-gesture" problem entirely, because it's never flipped: the
    // value is fixed from the start, and it's the browser's own native
    // scrolling — not our JS — that's now doing the "scroll" half of the
    // decision.)
    //
    // A `resolveRangeTarget()` fallback still recognizes a touch that lands
    // directly on the real `<input>` (an older browser that doesn't support
    // the `pointer` media feature, or any gap in the catcher's sizing) and
    // falls back to the original touch-action:none/preventDefault()/manual-
    // scroll approach for that path — belt-and-suspenders, not load-bearing,
    // since the catcher is what actually carries the fix on the device this
    // was tested against.
    (function () {
      const DRAG_THRESHOLD = 8; // px of movement before committing to drag-or-scroll

      function setupRangeTouchCatchers() {
        document.querySelectorAll('input[type=range]').forEach((input) => {
          if (input.parentElement && input.parentElement.classList.contains('range-touch-wrap')) return;
          const wrap = document.createElement('span');
          wrap.className = 'range-touch-wrap';
          input.parentNode.insertBefore(wrap, input);
          wrap.appendChild(input);
          const catcher = document.createElement('div');
          catcher.className = 'range-touch-catcher';
          catcher.setAttribute('aria-hidden', 'true');
          catcher._rangeInput = input; // plain JS property, not a DOM attribute — internal use only
          wrap.appendChild(catcher);
        });
      }
      setupRangeTouchCatchers();

      const gestures = new Map(); // pointerId -> gesture state

      function isTouchLike(e) {
        return e.pointerType === 'touch' || e.pointerType === 'pen';
      }

      // Returns { el, viaCatcher } for a touch/pen event aimed at a slider
      // (through the catcher, the normal path, or directly at the real
      // input, the fallback path), or null for anything else.
      function resolveRangeTarget(e) {
        const t = e.target;
        if (t instanceof HTMLElement && t.classList.contains('range-touch-catcher') && t._rangeInput) {
          return { el: t._rangeInput, viaCatcher: true };
        }
        if (t instanceof HTMLInputElement && t.type === 'range') {
          return { el: t, viaCatcher: false };
        }
        return null;
      }

      // Fallback-path only (see file note above) — same "which container
      // actually scrolls" split used elsewhere in this file: window on
      // mobile (.panel is position:static there), .panel's own internal
      // overflow-y:auto scroll on desktop.
      function scrollContainerFor(el) {
        let node = el.parentElement;
        while (node && node !== document.body) {
          const cs = getComputedStyle(node);
          if (
            (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
            node.scrollHeight > node.clientHeight
          ) {
            return node;
          }
          node = node.parentElement;
        }
        return window;
      }

      function scrollContainerBy(container, dy) {
        if (container === window) window.scrollBy(0, dy);
        else container.scrollTop += dy;
      }

      // Reimplements the native "tap/drag this X position on the track" math
      // — needed on both paths, since neither the catcher (not a form
      // control) nor the fallback path (touch-action:none there) gets this
      // for free from the browser.
      function valueFromPointerX(el, clientX) {
        const rect = el.getBoundingClientRect();
        const min = Number(el.min) || 0;
        const max = Number(el.max) || 100;
        const step = Number(el.step) || 1;
        let frac = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
        frac = Math.max(0, Math.min(1, frac));
        let raw = min + frac * (max - min);
        raw = Math.round((raw - min) / step) * step + min;
        return Math.max(min, Math.min(max, raw));
      }

      function setSliderValue(el, v) {
        const s = String(v);
        if (el.value === s) return false;
        el.value = s;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }

      document.addEventListener(
        'pointerdown',
        (e) => {
          const target = resolveRangeTarget(e);
          if (!target) return;
          // The fallback (direct-input) path only intercepts touch/pen — a
          // mouse there should behave exactly as native, since touch-action
          // only affects touch/pen and there's a real native input to drag.
          // The catcher path has no such native fallback (it's a plain div,
          // not a form control), and CSS pointer-events doesn't filter by
          // pointer type — on a coarse-pointer device (e.g. a touchscreen
          // laptop) a plugged-in mouse would land on the catcher too, so it
          // must be handled here regardless of pointerType or it would be
          // silently swallowed.
          if (!target.viaCatcher && !isTouchLike(e)) return;
          gestures.set(e.pointerId, {
            el: target.el,
            viaCatcher: target.viaCatcher,
            startX: e.clientX,
            startY: e.clientY,
            lastY: e.clientY,
            decided: null, // null (undecided) | 'drag' | 'scroll'
            container: null,
          });
          // Fallback path only: see the touch-action:none/preventDefault()
          // note in the file comment above for why this alone isn't
          // sufficient on every browser — it's the catcher path (see above)
          // that actually carries the fix.
          if (!target.viaCatcher && e.cancelable) e.preventDefault();
        },
        true,
      );

      document.addEventListener(
        'pointermove',
        (e) => {
          const g = gestures.get(e.pointerId);
          if (!g) return;
          if (!g.viaCatcher && e.cancelable) e.preventDefault(); // fallback path only
          const dx = e.clientX - g.startX;
          const dy = e.clientY - g.startY;
          if (!g.decided) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_THRESHOLD) return;
            g.decided = Math.abs(dy) > Math.abs(dx) ? 'scroll' : 'drag';
            if (g.decided === 'scroll') {
              if (!g.viaCatcher) g.container = scrollContainerFor(g.el);
              // Catcher path: nothing to do — its own touch-action:pan-y
              // already lets the browser's native scrolling handle this.
            } else {
              try {
                g.el.setPointerCapture(e.pointerId);
              } catch (err) {
                /* not critical — dragging still works without capture */
              }
            }
          }
          if (g.decided === 'drag') {
            setSliderValue(g.el, valueFromPointerX(g.el, e.clientX));
          } else if (!g.viaCatcher) {
            scrollContainerBy(g.container, -(e.clientY - g.lastY));
          }
          g.lastY = e.clientY;
        },
        true,
      );

      function endGesture(e, isCancel) {
        const g = gestures.get(e.pointerId);
        if (!g) return;
        if (!isCancel && g.decided === null) {
          // Movement never crossed the threshold — a plain tap. Neither path
          // gets a native tap-to-jump for free (the catcher isn't a form
          // control; the fallback path's touch-action:none suppresses it),
          // so this reimplements it directly.
          setSliderValue(g.el, valueFromPointerX(g.el, e.clientX));
          g.el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (g.decided === 'drag') {
          g.el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        gestures.delete(e.pointerId);
      }
      document.addEventListener('pointerup', (e) => endGesture(e, false), true);
      document.addEventListener('pointercancel', (e) => endGesture(e, true), true);
    })();
  }

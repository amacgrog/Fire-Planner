// The cash-flow Sankey's full-screen overlay and the phone rule: five columns on a desktop or a phone held sideways, Money in above Money out upright

import { CURRENT_YEAR } from '../../core/inputs/current-year.js';
import { tryEnterFullscreen } from './landscape-fullscreen.js';
import { clearSankey, currentSankeySelection, drawSankey, renderSankey } from './sankey.js';
import { computeSankeyFlow } from '#country/ui/seam-computeSankeyFlow';
import { render } from '#country/ui/seam-render';

  // A phone in either orientation (spec 4.2): narrower than the app's mobile breakpoint, or under 500 px tall with a coarse
  // pointer, so a phone turned sideways (844x390) is still a phone and the card does not flip between modes when it turns.
  const PHONE_QUERY = '(max-width: 820px), (max-height: 500px) and (pointer: coarse)';
  // The overlay's own open flag: its Escape and fullscreenchange handlers read only this (the main chart's read chartExpanded).
  let open = false;
  // The button that opened the overlay (focus goes back to it) and where the year block sat in the card.
  let opener = null;
  let home = null;

  export function isPhoneViewport() {
    return !!(window.matchMedia && window.matchMedia(PHONE_QUERY).matches);
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const $ = (id) => document.getElementById(id);

  // One half of the upright split: its height from its busiest column's bands (room for each band's two-line label).
  function splitHeight(model, cols) {
    if (!model) return 240;
    const pick = cols === 'in' ? [0, 1, 2] : [2, 3, 4];
    const n = Math.max(...pick.map((i) => model.columns[i].length));
    return clamp(60 + 34 * n, 240, 1200);
  }

  // Draws the selected year into the overlay, laid out from the overlay's own size (wider than tall = sideways). renderSankey
  // calls it after the card, so the slider's input and the card's rAF-throttled resize redraw reach the overlay too.
  export function redrawSankeyOverlay() {
    const sel = currentSankeySelection();
    if (!open || !sel) return;
    const overlay = $('sankeyOverlay'),
      wrap = $('sankeyFullWrap'),
      full = $('sankeyFullSvg'),
      inSvg = $('sankeyInSvg'),
      outSvg = $('sankeyOutSvg'),
      rows = sel.rows,
      idx = clamp(Number($('sankeyAge').value) || 0, 0, rows.length - 1),
      row = rows[idx],
      model = computeSankeyFlow(row),
      year = String(CURRENT_YEAR + row.year),
      phone = isPhoneViewport(),
      upright = phone && overlay.clientWidth <= overlay.clientHeight;
    const tip = wrap.querySelector(':scope > .sankey-tooltip');
    if (tip) tip.style.display = 'none';
    overlay.classList.toggle('sankey-upright', upright);
    // An SVG element has no .hidden property: the attribute is set directly.
    full.toggleAttribute('hidden', upright);
    inSvg.toggleAttribute('hidden', !upright);
    outSvg.toggleAttribute('hidden', !upright || !model);
    for (const svg of [full, inSvg, outSvg]) {
      svg.setAttribute('data-year', year);
      if (svg.hasAttribute('hidden')) clearSankey(svg);
    }
    if (upright) {
      const width = wrap.clientWidth;
      for (const [svg, cols] of [[inSvg, 'in'], [outSvg, 'out']]) {
        if (svg.hasAttribute('hidden')) continue;
        const height = splitHeight(model, cols);
        svg.style.width = width + 'px';
        drawSankey(svg, model, { width, height, cols, fontPx: 11, nodeW: 6, gap: clamp(height * 0.035, 6, 14) });
      }
      return;
    }
    // Sideways on a phone: the card's sizes at 900 px or more (the wrap scrolls sideways). A desktop: the overlay's size
    // with the full-screen sizes.
    full.style.width = '0px';
    const w = wrap.clientWidth,
      height = Math.max(200, wrap.clientHeight - 8),
      width = phone ? Math.max(900, w) : Math.max(660, w);
    full.style.width = width + 'px';
    const sizes = phone ? { fontPx: 11, nodeW: 6 } : { fontPx: 13, nodeW: 8 };
    drawSankey(full, model, { width, height, cols: 'five', ...sizes, gap: clamp(height * 0.035, 6, 14) });
  }

  function openOverlay(btn) {
    if (open) return;
    if (!currentSankeySelection()) render();
    const overlay = $('sankeyOverlay'),
      block = document.querySelector('#sankeyCard .sankey-year');
    open = true;
    opener = btn;
    overlay.hidden = false;
    document.body.classList.add('chart-scroll-locked');
    home = { parent: block.parentNode, next: block.nextSibling };
    overlay.querySelector('.sankey-overlay-year').appendChild(block);
    tryEnterFullscreen(overlay);
    redrawSankeyOverlay();
    $('sankeyCloseBtn').focus();
  }
  function closeOverlay() {
    if (!open) return;
    const overlay = $('sankeyOverlay');
    open = false;
    overlay.hidden = true;
    document.body.classList.remove('chart-scroll-locked');
    const block = overlay.querySelector('.sankey-year');
    if (block && home) home.parent.insertBefore(block, home.next);
    home = null;
    for (const id of ['sankeyFullSvg', 'sankeyInSvg', 'sankeyOutSvg']) clearSankey($(id));
    const sel = currentSankeySelection();
    if (sel && $('sankeyCard').open) renderSankey(sel);
    // Focus goes back to the opener. While the overlay is the browser's fullscreen element the rest of the page is inert
    // and focus() there does nothing, so it waits for the fullscreen exit.
    const back = opener;
    opener = null;
    const refocus = () => {
      if (!open && back && back.getClientRects().length) back.focus();
    };
    if (document.fullscreenElement === overlay) document.exitFullscreen().then(refocus, refocus);
    else refocus();
  }

  export function wireSankeyFullscreen() {
    const overlay = $('sankeyOverlay');
    $('sankeyExpandBtn').addEventListener('click', (e) => openOverlay(e.currentTarget));
    $('sankeyPhoneBtn').addEventListener('click', (e) => openOverlay(e.currentTarget));
    $('sankeyCloseBtn').addEventListener('click', closeOverlay);
    document.addEventListener('keydown', (e) => {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeOverlay();
        return;
      }
      // Keep Tab inside the dialog (aria-modal): wrap from the last focusable to the first and back.
      if (e.key !== 'Tab') return;
      const items = [...overlay.querySelectorAll('button, input, [tabindex="0"]')].filter((x) => x.getClientRects().length);
      if (!items.length) return;
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    });
    // Leaving the browser's real fullscreen some other way (the back gesture, the browser's own Escape) closes the overlay.
    document.addEventListener('fullscreenchange', () => {
      if (open && !document.fullscreenElement) closeOverlay();
    });
  }

import { state } from '../core/store.js';
import { analyzeShortfallDrivers } from '#country/core/seam-analyzeShortfallDrivers';

  export function renderShortfallBanner(selected) {
    const banner = document.getElementById('shortfallBanner');
    const driver = analyzeShortfallDrivers(selected);
    if (!driver) {
      banner.hidden = true;
      banner.innerHTML = '';
      return;
    }
    const newLasts = driver.result.depletedAge
      ? `age ${driver.result.depletedAge}`
      : `the end of the projection (age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+), not depleted`;
    banner.hidden = false;
    const intro = `<b>What's driving this:</b> the plan is projected to run out of money at age ${selected.depletedAge}. `;
    const body =
      driver.kind === 'structural'
        ? `Of the levers tested, <b>${driver.label}</b> has the biggest single effect — with ${driver.detail}, the portfolio instead lasts to ${newLasts}. This isn't necessarily the only fix or the right one for you; it's just the single change (among a few common ones) that moved the needle most.`
        : `No single cost or income assumption tested here explains it — this looks like a general balance-of-spending-vs-savings shortfall rather than one specific driver. The smallest change (of the two generic levers everyone has) that ${driver.resolved ? 'fully resolves it' : 'helps most'}: <b>${driver.detail}</b>, which brings the portfolio to ${newLasts}.`;
    banner.innerHTML = intro + body;
  }

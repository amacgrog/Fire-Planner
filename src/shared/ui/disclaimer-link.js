import { switchToDashboardTab } from './mobile-view.js';

  export function wireDisclaimerLink() {
    document.getElementById('disclaimerLinkBtn').addEventListener('click', () => {
      const card = document.getElementById('methodologyCard');
      switchToDashboardTab();
      card.open = true;
      requestAnimationFrame(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const callout = document.getElementById('limitationsCallout');
        callout.classList.add('flash-highlight');
        setTimeout(() => callout.classList.remove('flash-highlight'), 2600);
      });
    });
  }

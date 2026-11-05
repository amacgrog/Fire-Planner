// Theme-aware chart colors

  export function isDarkTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }
  export function chartAxisColor() {
    return isDarkTheme() ? '#93a3b8' : '#718096';
  }
  export function chartGridColor() {
    return isDarkTheme() ? '#2b3a4d' : '#e2e8f0';
  }
  // A line or mark drawn over bars: the page's ink, outlined in the card color so it reads on both the bars and the card.
  export function chartInkColor() {
    return isDarkTheme() ? '#e6ecf3' : '#0b1320';
  }
  export function chartHaloColor() {
    return isDarkTheme() ? '#16202c' : '#ffffff';
  }
  export function chartZeroLineColor() {
    return isDarkTheme() ? '#4a5b70' : '#b8c2cf';
  }

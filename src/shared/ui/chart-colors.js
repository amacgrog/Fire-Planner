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
  export function chartZeroLineColor() {
    return isDarkTheme() ? '#4a5b70' : '#b8c2cf';
  }

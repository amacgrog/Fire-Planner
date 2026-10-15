  // Validated categorical palette (see the `dataviz` skill's palette.md) —
  // fixed hue order, never cycled/reassigned by rank. Reused across the two
  // columns (sources / uses) since they're spatially separated by the hub,
  // so only within-column neighbors need to stay visually distinct.
  const SANKEY_HUES = {
    blue: { light: '#2a78d6', dark: '#3987e5' },
    orange: { light: '#eb6834', dark: '#d95926' },
    aqua: { light: '#1baf7a', dark: '#199e70' },
    yellow: { light: '#eda100', dark: '#c98500' },
    magenta: { light: '#e87ba4', dark: '#d55181' },
    green: { light: '#008300', dark: '#008300' },
    violet: { light: '#7e57c2', dark: '#9575cd' },
  };
  export function sankeyHue(name, dark) {
    return SANKEY_HUES[name][dark ? 'dark' : 'light'];
  }

import { defineConfig } from 'vitest/config';

// Two inline projects, one per planner. `#country/*` (src/package.json) is resolved by Vite, not by
// Node, so each project passes its country as an ssr resolve condition (spike result, spec section 10).
function project(country) {
  return {
    extends: false,
    ssr: { resolve: { conditions: [country, 'node', 'import', 'module', 'default'] } },
    test: {
      name: country,
      environment: 'node',
      include: ['tests/unit/shared/**/*.test.js', `tests/unit/${country}/**/*.test.js`],
      setupFiles: ['tests/unit/clock.js'],
      provide: { country },
      pool: 'forks',
      isolate: true,
      testTimeout: 60000,
    },
  };
}

export default defineConfig({
  test: {
    projects: [project('us'), project('canada')],
  },
});

// Registers the MCP tools (read_fire_projection and update_fire_assumptions)

import { state } from '../core/store.js';
import { saveInputs } from './plans/autosave.js';
import { syncContributionControls } from './inputs/sync-contribution-controls.js';
import { FIELDS } from '#country/ui/seam-FIELDS';
import { mcpAccepts } from '#country/core/seam-mcpAccepts';
import { mcpSchemaFor } from '#country/core/seam-mcpSchemaFor';
import { render } from '#country/ui/seam-render';
import { syncControls } from '#country/ui/seam-syncControls';

  // load-time: filters FIELDS, an imported constant; reads nothing a statement writes.
  // The update_fire_assumptions MCP tool exposes every numeric field plus each field marked
  // `mcp`, in registry order. Values of the wrong type or outside a choice's list are ignored.
  const MCP_FIELDS = FIELDS.filter((field) => field.type === 'number' || field.mcp);
  export function registerMcpTools() {
    if (mc?.registerTool) {
      mc.registerTool({
        name: 'update_fire_assumptions',
        title: 'Update FIRE assumptions',
        description:
          'Update one or more FIRE projection assumptions and refresh the visible forecast.',
        inputSchema: {
          type: 'object',
          properties: Object.fromEntries(MCP_FIELDS.map((field) => [field.key, mcpSchemaFor(field)])),
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input) => {
          for (const [k, v] of Object.entries(input || {})) {
            const field = MCP_FIELDS.find((f) => f.key === k);
            if (field && mcpAccepts(field, v)) state[k] = v;
          }
          state.retireAgeA = Math.min(70, Math.max(state.retireAgeA, state.ageA));
          state.retireAgeB = Math.min(70, Math.max(state.retireAgeB, state.ageB));
          syncControls();
          syncContributionControls();
          render();
          saveInputs();
          return window.fireProjection;
        },
      });
      mc.registerTool({
        name: 'read_fire_projection',
        title: 'Read FIRE projection',
        description: 'Read the currently displayed headline projection results.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async () => window.fireProjection,
      });
    }
  }
  // load-time: reads document.modelContext; reads nothing a statement writes.
  const mc = document.modelContext;

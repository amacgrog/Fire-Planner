  // load-time: filters FIELDS, an imported constant; reads nothing a statement writes.
  const ids = FIELDS.filter((field) => field.type === 'number').map((field) => field.key);
  const syncFns = { controls: () => syncControls(), contrib: () => syncContributionControls() };
  // load-time: filters FIELDS, an imported constant; reads nothing a statement writes.
  // The update_fire_assumptions MCP tool exposes every numeric field plus each field marked
  // `mcp`, in registry order. Values of the wrong type or outside a choice's list are ignored.
  const MCP_FIELDS = FIELDS.filter((field) => field.type === 'number' || field.mcp);

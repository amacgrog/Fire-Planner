  const ids = FIELDS.filter((field) => field.type === 'number').map((field) => field.key);
  // Writes one checkbox or select (and what it reveals / mirrors) from the current state.
  function syncFieldDom(field) {
    const el = document.getElementById(field.key);
    if (field.type === 'bool') el.checked = !!state[field.key];
    else el.value = state[field.key];
    (field.reveals || []).forEach((r) => (document.getElementById(r.id).hidden = r.hidden(state)));
    (field.mirrors || []).forEach((id) => (document.getElementById(id).checked = !!state[field.key]));
  }
  const syncFns = { controls: () => syncControls(), contrib: () => syncContributionControls() };
  const isDomWired = (field) => field.type !== 'number' && !field.manual;
  // The update_fire_assumptions MCP tool exposes every numeric field plus each field marked
  // `mcp`, in registry order. Values of the wrong type or outside a choice's list are ignored.
  const MCP_FIELDS = FIELDS.filter((field) => field.type === 'number' || field.mcp);

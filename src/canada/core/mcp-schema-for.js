  export const mcpSchemaFor = (field) =>
    field.type === 'number'
      ? { type: 'number' }
      : field.type === 'bool'
        ? { type: 'boolean' }
        : { type: 'string', enum: field.values };
  export const mcpAccepts = (field, v) =>
    field.type === 'number'
      ? Number.isFinite(v)
      : field.type === 'bool'
        ? typeof v === 'boolean'
        : field.values.includes(v);

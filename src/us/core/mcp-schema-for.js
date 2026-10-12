  export const mcpSchemaFor = (field) =>
    field.type === 'number'
      ? { type: 'number' }
      : field.type === 'bool'
        ? { type: 'boolean' }
        : { type: 'string', enum: field.values };
  export const mcpAccepts = (field, v) =>
    field.type === 'number'
      ? Number.isFinite(v) && (field.min === undefined || v >= field.min) && (field.max === undefined || v <= field.max)
      : field.type === 'bool'
        ? typeof v === 'boolean'
        : field.values.includes(v);

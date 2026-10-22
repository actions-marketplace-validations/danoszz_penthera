/**
 * The JSON Schema subset the MCP tools' inputSchemas use, checked by hand so
 * the server needs no validator dependency. The tool's published inputSchema
 * is the only definition: the server validates arguments against the same
 * object it lists in tools/list.
 *
 * Supported: type (object, string, integer, boolean), properties, required,
 * additionalProperties: false or a schema, minLength, maxLength, pattern,
 * enum, minimum, maximum, maxProperties, oneOf of `required` sets.
 * Anything else in a schema is a programming error and throws.
 */

const KNOWN = new Set([
  "type", "properties", "required", "additionalProperties", "minLength", "maxLength", "pattern",
  "enum", "minimum", "maximum", "maxProperties", "description", "title", "default", "oneOf", "propertyNames",
]);

/** @returns {string[]} problems, empty when `value` matches `schema` */
export function validate(schema, value, at = "arguments") {
  for (const k of Object.keys(schema)) if (!KNOWN.has(k)) throw new Error(`validate: unsupported keyword ${k}`);
  const problems = [];
  const t = schema.type;
  if (t === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return [`${at} must be an object`];
    const props = schema.properties || {};
    const keys = Object.keys(value);
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) problems.push(`${at} has more than ${schema.maxProperties} properties`);
    for (const r of schema.required || []) if (!(r in value)) problems.push(`${at}.${r} is required`);
    for (const k of keys) {
      if (schema.propertyNames) problems.push(...validate(schema.propertyNames, k, `${at} property name`));
      if (Object.hasOwn(props, k)) problems.push(...validate(props[k], value[k], `${at}.${k}`));
      else if (schema.additionalProperties === false) problems.push(`${at}.${k} is not a known argument`);
      else if (typeof schema.additionalProperties === "object") problems.push(...validate(schema.additionalProperties, value[k], `${at}.${k}`));
    }
    if (schema.oneOf) {
      const ok = schema.oneOf.filter((s) => (s.required || []).every((r) => r in value));
      if (ok.length !== 1) problems.push(`${at} needs exactly one of: ${schema.oneOf.map((s) => s.required.join(" + ")).join(", ")}`);
    }
    return problems;
  }
  if (t === "string") {
    if (typeof value !== "string") return [`${at} must be a string`];
    if (schema.minLength !== undefined && value.length < schema.minLength) problems.push(`${at} is shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) problems.push(`${at} is longer than ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) problems.push(`${at} has characters or a form it may not have`);
    if (schema.enum && !schema.enum.includes(value)) problems.push(`${at} must be one of ${schema.enum.join(", ")}`);
    return problems;
  }
  if (t === "integer") {
    if (!Number.isInteger(value)) return [`${at} must be an integer`];
    if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${at} must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${at} must be at most ${schema.maximum}`);
    return problems;
  }
  if (t === "boolean") return typeof value === "boolean" ? [] : [`${at} must be true or false`];
  throw new Error(`validate: unsupported type ${t}`);
}

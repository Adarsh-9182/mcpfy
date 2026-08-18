
/**
 * §13 — reading a tool's JSON Schema.
 *
 * These are plain functions with no "use client" directive, deliberately.
 * The Inspector form runs in the browser, but the registry page renders a
 * parameter table on the server, and a function exported from a client
 * module cannot be called during server rendering — it arrives as a client
 * reference and throws. Keeping the pure logic out of the component file is
 * what lets both sides use one implementation.
 *
 * The subset handled is the subset MCP tool schemas actually use: an object
 * with scalar properties, enums, and `required`. Anything outside that —
 * nested objects, arrays, oneOf — falls back to a JSON textarea, which is
 * honest about not understanding the shape instead of silently dropping
 * fields the developer typed.
 */

export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  title?: string;
  enum?: unknown[];
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

export type FieldKind = "string" | "number" | "integer" | "boolean" | "enum" | "json";

export interface SchemaField {
  name: string;
  kind: FieldKind;
  label: string;
  description?: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
}

function normaliseType(type: JsonSchemaProperty["type"]): string {
  if (Array.isArray(type)) {
    // ["string", "null"] is how optionality is often expressed; the null is
    // carried by `required`, not by the control we render.
    return type.find((t) => t !== "null") ?? "string";
  }
  return type ?? "string";
}

/** Turns a JSON Schema into the fields a form should render. */
export function fieldsFromSchema(schema: JsonSchema | null | undefined): SchemaField[] {
  const properties = schema?.properties;
  if (!properties || typeof properties !== "object") return [];
  const required = new Set(schema?.required ?? []);

  return Object.entries(properties).map(([name, property]) => {
    const type = normaliseType(property.type);
    const enumValues = Array.isArray(property.enum)
      ? property.enum.filter((v): v is string => typeof v === "string")
      : undefined;

    const kind: FieldKind =
      enumValues && enumValues.length > 0
        ? "enum"
        : type === "boolean"
          ? "boolean"
          : type === "number"
            ? "number"
            : type === "integer"
              ? "integer"
              : type === "string"
                ? "string"
                : "json";

    return {
      name,
      kind,
      label: property.title ?? name,
      description: property.description,
      required: required.has(name),
      enum: enumValues,
      default: property.default,
    };
  });
}

/** Starting values for a schema: declared defaults, else empty. */
export function defaultsForSchema(
  schema: JsonSchema | null | undefined,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fieldsFromSchema(schema)) {
    if (field.default !== undefined) values[field.name] = field.default;
    else if (field.kind === "boolean") values[field.name] = false;
    else values[field.name] = "";
  }
  return values;
}

/** Required fields the caller has not filled in. */
export function missingRequired(
  schema: JsonSchema | null | undefined,
  values: Record<string, unknown>,
): string[] {
  return fieldsFromSchema(schema)
    .filter((field) => {
      if (!field.required) return false;
      const value = values[field.name];
      if (field.kind === "boolean") return value === undefined || value === null;
      return value === undefined || value === null || String(value).trim() === "";
    })
    .map((field) => field.name);
}

/**
 * Converts form values into the arguments an MCP call expects: numbers as
 * numbers, JSON fields parsed, and empty optional fields omitted entirely
 * rather than sent as "".
 */
export function toArguments(
  schema: JsonSchema | null | undefined,
  values: Record<string, unknown>,
): { args: Record<string, unknown>; errors: Record<string, string> } {
  const args: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of fieldsFromSchema(schema)) {
    const raw = values[field.name];

    if (field.kind === "boolean") {
      args[field.name] = Boolean(raw);
      continue;
    }

    if (raw === undefined || raw === null || String(raw).trim() === "") {
      // Sending "" for an omitted optional string is a common source of
      // confusing tool errors, so leave it out.
      if (field.required) errors[field.name] = "Required.";
      continue;
    }

    if (field.kind === "number" || field.kind === "integer") {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        errors[field.name] = "Enter a number.";
        continue;
      }
      if (field.kind === "integer" && !Number.isInteger(n)) {
        errors[field.name] = "Enter a whole number.";
        continue;
      }
      args[field.name] = n;
      continue;
    }

    if (field.kind === "json") {
      try {
        args[field.name] = JSON.parse(String(raw));
      } catch {
        errors[field.name] = "Enter valid JSON.";
      }
      continue;
    }

    args[field.name] = String(raw);
  }

  return { args, errors };
}


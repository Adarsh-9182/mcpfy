import { fieldsFromSchema, type JsonSchema } from "@mcpfy/ui";

/** Renders a JSON Schema as a readable parameter table (§14). */
export function SchemaTable({
  title,
  schema,
}: {
  title: string;
  schema: Record<string, unknown> | null;
}) {
  const fields = fieldsFromSchema(schema as JsonSchema | null);

  if (fields.length === 0) {
    return (
      <div>
        <p className="text-2xs font-medium uppercase tracking-wider text-faint">
          {title}
        </p>
        <p className="mt-1 text-2xs text-subtle">None declared.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-2xs font-medium uppercase tracking-wider text-faint">
        {title}
      </p>
      <table className="mt-1.5 w-full border-collapse">
        <caption className="sr-only">{title} declared by this tool</caption>
        <tbody>
          {fields.map((field) => (
            <tr key={field.name} className="border-b border-line last:border-0">
              <td className="w-40 py-1.5 pr-3 align-top font-mono text-sm text-hi">
                {field.name}
                {field.required ? (
                  <span className="text-danger" aria-label="required">
                    *
                  </span>
                ) : null}
              </td>
              <td className="w-24 py-1.5 pr-3 align-top font-mono text-2xs text-accent-text">
                {field.enum ? field.enum.join(" | ") : field.kind}
              </td>
              <td className="py-1.5 align-top text-2xs leading-relaxed text-muted">
                {field.description ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

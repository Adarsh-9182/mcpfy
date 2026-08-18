"use client";

import * as React from "react";
import { cn } from "../cn";
import { fieldsFromSchema, type JsonSchema } from "../schema";

/**
 * The form itself. One implementation, used by both the product Inspector
 * and the demo on the landing page, so the demo is a smaller version of the
 * real thing rather than a drawing of it.
 */
const CONTROL =
  "w-full rounded-[var(--radius-sm)] border bg-raised px-2 font-mono text-sm text-fg " +
  "placeholder:text-faint transition-colors focus:border-accent focus:outline-none " +
  "focus:ring-2 focus:ring-[var(--accent-ring)]";

export function SchemaForm({
  schema,
  values,
  onChange,
  errors,
  idPrefix,
  emptyLabel = "This tool takes no arguments.",
}: {
  schema: JsonSchema | null | undefined;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  errors?: Record<string, string>;
  idPrefix: string;
  emptyLabel?: string;
}) {
  const fields = fieldsFromSchema(schema);

  if (fields.length === 0) {
    return <p className="text-2xs text-subtle">{emptyLabel}</p>;
  }

  const set = (name: string, value: unknown) =>
    onChange({ ...values, [name]: value });

  return (
    <div className="flex flex-col gap-2.5">
      {fields.map((field) => {
        const id = `${idPrefix}-${field.name}`;
        const error = errors?.[field.name];
        const describedBy = field.description ? `${id}-description` : undefined;

        return (
          <div key={field.name} className="flex flex-col gap-1">
            <label
              htmlFor={id}
              className="flex items-baseline gap-1.5 font-mono text-2xs text-muted"
            >
              {field.label}
              <span className="text-faint">{field.kind}</span>
              {field.required ? (
                <span className="text-danger" aria-label="required">
                  *
                </span>
              ) : null}
            </label>

            {field.kind === "boolean" ? (
              <input
                id={id}
                type="checkbox"
                checked={Boolean(values[field.name])}
                aria-describedby={describedBy}
                onChange={(e) => set(field.name, e.target.checked)}
                className="size-4 accent-[var(--accent)]"
              />
            ) : field.kind === "enum" ? (
              <select
                id={id}
                value={String(values[field.name] ?? "")}
                aria-describedby={describedBy}
                onChange={(e) => set(field.name, e.target.value)}
                className={cn(CONTROL, "h-8", error && "border-danger")}
              >
                {!field.required ? <option value="">—</option> : null}
                {field.enum?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : field.kind === "json" ? (
              <textarea
                id={id}
                rows={3}
                value={String(values[field.name] ?? "")}
                placeholder="{ }"
                aria-describedby={describedBy}
                aria-invalid={Boolean(error) || undefined}
                onChange={(e) => set(field.name, e.target.value)}
                className={cn(
                  CONTROL,
                  "resize-y py-1.5 leading-relaxed",
                  error ? "border-danger" : "border-line-default",
                )}
              />
            ) : (
              <input
                id={id}
                type={field.kind === "string" ? "text" : "number"}
                value={String(values[field.name] ?? "")}
                placeholder={field.description}
                aria-describedby={describedBy}
                aria-invalid={Boolean(error) || undefined}
                onChange={(e) => set(field.name, e.target.value)}
                className={cn(
                  CONTROL,
                  "h-8",
                  error ? "border-danger" : "border-line-default",
                )}
              />
            )}

            {error ? (
              <p role="alert" className="text-2xs text-danger">
                {error}
              </p>
            ) : field.description ? (
              <p id={describedBy} className="text-2xs leading-relaxed text-faint">
                {field.description}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

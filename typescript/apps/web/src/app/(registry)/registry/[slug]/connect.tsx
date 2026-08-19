"use client";

import * as React from "react";
import { CodeBlock, cn } from "@mcpfy/ui";
import { allRecipes, type ClientId, type ConnectTarget } from "@mcpfy/registry";

/**
 * §10 — one-click connection.
 *
 * The recipes come from @mcpfy/registry, which is why this component is short:
 * knowing that VS Code nests under `servers` and that ChatGPT has no config
 * file at all is domain knowledge, and it belongs somewhere a test can reach
 * it, not inside a "use client" module.
 *
 * All this does is pick a tab and render whichever of the three recipe shapes
 * comes back.
 */
export function ConnectPicker({ target }: { target: ConnectTarget }) {
  const recipes = React.useMemo(() => allRecipes(target), [target]);
  const [active, setActive] = React.useState<ClientId>("claude-desktop");
  const current = recipes.find((r) => r.id === active) ?? recipes[0];

  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-surface">
      <div
        role="tablist"
        aria-label="Choose a client"
        className="flex flex-wrap gap-1 border-b border-line p-2"
      >
        {recipes.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={r.id === active}
            onClick={() => setActive(r.id)}
            className={cn(
              "h-7 rounded-[var(--radius-sm)] px-2.5 text-2xs font-medium transition-colors",
              r.id === active
                ? "bg-accent-surface text-accent-text"
                : "text-muted hover:bg-panel hover:text-fg",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {current ? <Recipe recipe={current.recipe} /> : null}
      </div>
    </div>
  );
}

function Recipe({ recipe }: { recipe: ReturnType<typeof allRecipes>[number]["recipe"] }) {
  if (recipe.kind === "file") {
    return (
      <div>
        <p className="mb-2 font-mono text-2xs text-faint">{recipe.filename}</p>
        <CodeBlock code={recipe.code} language="json" />
        {recipe.note ? <Note>{recipe.note}</Note> : null}
      </div>
    );
  }

  if (recipe.kind === "command") {
    return (
      <div>
        <p className="mb-2 font-mono text-2xs text-faint">Terminal</p>
        <CodeBlock code={recipe.code} language="bash" />
        {recipe.note ? <Note>{recipe.note}</Note> : null}
      </div>
    );
  }

  return (
    <div>
      <ol className="flex flex-col gap-2">
        {recipe.steps.map((step, i) => (
          <li key={step} className="flex gap-2.5 text-2xs leading-relaxed text-fg">
            <span className="mt-px font-mono text-faint tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      {recipe.note ? <Note>{recipe.note}</Note> : null}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2.5 text-2xs leading-relaxed text-muted">{children}</p>
  );
}

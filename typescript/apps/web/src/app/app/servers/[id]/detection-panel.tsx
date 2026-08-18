import { Badge, Card, CardBody, CardHeader, CardTitle } from "@mcpfy/ui";

interface StoredDetection {
  confidence?: string;
  language?: string;
  packageManager?: string | null;
  evidence?: { file: string; reason: string }[];
  warnings?: string[];
  headSha?: string;
  inspectedAt?: string;
}

/**
 * §10 — shows what detection concluded and, more importantly, why.
 *
 * A developer who disagrees with the detected build commands needs to see
 * which files produced them before overriding; a panel that only prints the
 * answer makes that an argument with a black box.
 */
export function DetectionPanel({
  detection,
  rootDirectory,
  installCommand,
  buildCommand,
  startCommand,
}: {
  detection: unknown;
  rootDirectory: string;
  installCommand: string | null;
  buildCommand: string | null;
  startCommand: string | null;
}) {
  if (!detection || typeof detection !== "object") return null;
  const d = detection as StoredDetection;

  const commands: [string, string | null][] = [
    ["install", installCommand],
    ["build", buildCommand],
    ["start", startCommand],
  ];

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Detected configuration</CardTitle>
        <span className="flex items-center gap-2">
          {d.packageManager ? <Badge mono>{d.packageManager}</Badge> : null}
          {d.confidence ? (
            <Badge tone={d.confidence === "high" ? "success" : "warning"}>
              {d.confidence} confidence
            </Badge>
          ) : null}
        </span>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div className="flex items-baseline gap-2">
            <dt className="w-16 shrink-0 text-2xs text-faint">root</dt>
            <dd className="font-mono text-sm text-fg">{rootDirectory}</dd>
          </div>
          {commands.map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-2">
              <dt className="w-16 shrink-0 text-2xs text-faint">{label}</dt>
              <dd className="break-all font-mono text-sm text-fg">
                {value ?? <span className="text-faint">skipped</span>}
              </dd>
            </div>
          ))}
        </dl>

        {d.evidence && d.evidence.length > 0 ? (
          <div>
            <p className="text-2xs font-medium uppercase tracking-wider text-faint">
              Why
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {d.evidence.map((e, i) => (
                <li key={i} className="flex flex-wrap gap-2 text-2xs">
                  <code className="font-mono text-accent-text">{e.file}</code>
                  <span className="text-muted">{e.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {d.warnings && d.warnings.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {d.warnings.map((w, i) => (
              <li
                key={i}
                className="rounded-[var(--radius-md)] border border-warning-border bg-warning-surface px-2.5 py-1.5 text-2xs leading-relaxed text-warning"
              >
                {w}
              </li>
            ))}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  );
}

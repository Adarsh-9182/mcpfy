import type { Check, Report, Severity } from "@mcpfy/readiness";

/**
 * Terminal rendering.
 *
 * Colour is applied only when the output is a TTY and NO_COLOR is unset —
 * piping this into a file or a CI log should produce plain text, not escape
 * codes. Severity is also carried by a word, never by colour alone, so the
 * report survives being read in a plain log.
 */
const useColour =
  Boolean(process.stdout.isTTY) &&
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb";

const ESC = "\u001b[";
const paint = (code: string) => (text: string) =>
  useColour ? `${ESC}${code}m${text}${ESC}0m` : text;

const dim = paint("2");
const bold = paint("1");
const red = paint("31");
const yellow = paint("33");
const green = paint("32");
const cyan = paint("36");

const SEVERITY_COLOUR: Record<Severity, (t: string) => string> = {
  blocker: red,
  important: yellow,
  advisory: dim,
};

export interface ServerIdentity {
  name?: string;
  version?: string;
  protocolVersion?: string;
}

export function renderReport(
  report: Report,
  target: string,
  server: ServerIdentity | null,
): string {
  const out: string[] = [];
  const failed = report.checks.filter((c) => !c.passed);

  out.push("");
  out.push(`  ${bold("mcpfy audit")}  ${dim(target)}`);
  if (server?.name) {
    const detail = [
      server.name,
      server.version,
      server.protocolVersion ? `· ${server.protocolVersion}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    out.push(`  ${dim(detail)}`);
  }
  out.push("");

  const tone =
    report.grade === "ready" ? green : report.grade === "nearly" ? yellow : red;
  const label =
    report.grade === "ready"
      ? "ready"
      : report.grade === "nearly"
        ? "nearly ready"
        : "not ready";

  out.push(
    `  ${tone(bold(`${report.score} / 100`))}  ${tone(label)}   ${dim(
      `${report.summary.passed} of ${report.summary.total} checks pass`,
    )}`,
  );
  out.push(`  ${bar(report.score)}`);
  out.push("");

  if (failed.length === 0) {
    out.push(`  ${green("Every check passes.")}`);
    out.push("");
  } else {
    for (const check of failed) out.push(renderCheck(check));
  }

  if (report.behaviourSkipped) {
    out.push(
      dim(
        "  Behaviour was not scored. Whether a tool actually succeeds in\n" +
          "  production cannot be known from one handshake — deploy through\n" +
          "  MCPfy to have that measured from real traffic.",
      ),
    );
    out.push("");
  }

  return out.join("\n");
}

function renderCheck(check: Check): string {
  const colour = SEVERITY_COLOUR[check.severity];
  const lines: string[] = [];

  lines.push(`  ${colour("!")} ${bold(check.title)}  ${colour(`[${check.severity}]`)}`);
  if (check.detail) lines.push(`    ${dim(check.detail)}`);
  if (check.subjects?.length) lines.push(`    ${cyan(check.subjects.join(", "))}`);
  if (check.remedy) lines.push(`    ${dim(wrap(check.remedy, 4))}`);
  lines.push("");

  return lines.join("\n");
}

function bar(score: number): string {
  const width = 32;
  const filled = Math.max(0, Math.min(width, Math.round((score / 100) * width)));
  const tone = score >= 85 ? green : score >= 50 ? yellow : red;
  return tone("█".repeat(filled)) + dim("░".repeat(width - filled));
}

/** Wraps prose to a readable width rather than letting the terminal do it. */
function wrap(text: string, indent: number): string {
  const width = 70;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);

  return lines.join(`\n${" ".repeat(indent)}`);
}

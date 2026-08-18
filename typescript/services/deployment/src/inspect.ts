import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { detect, type Detection } from "@mcpfy/detection";
import { diskTree } from "./disk-tree";
import { DeploymentError } from "./types";

const run = promisify(execFile);

export interface RepositoryInspection {
  detection: Detection;
  defaultBranch: string;
  headSha: string;
  owner: string;
  name: string;
}

/**
 * Shallow-clones a repository, works out how to build it, and throws the
 * checkout away.
 *
 * Doing this at connect time rather than at first deploy means the import
 * screen can show what was detected and why, and the developer can correct it
 * before a build burns minutes proving the guess wrong. It works for any git
 * URL, which is what makes repository import usable before the GitHub App
 * exists.
 */
export async function inspectRepository(
  repositoryUrl: string,
  options: { branch?: string; token?: string; timeoutMs?: number } = {},
): Promise<RepositoryInspection> {
  const dir = await mkdtemp(join(tmpdir(), "mcpfy-inspect-"));
  const timeout = options.timeoutMs ?? 60_000;

  try {
    const cloneUrl = options.token
      ? withToken(repositoryUrl, options.token)
      : repositoryUrl;

    const args = ["clone", "--depth", "1", "--quiet"];
    if (options.branch) args.push("--branch", options.branch);
    args.push(cloneUrl, dir);

    try {
      await run("git", args, { timeout, maxBuffer: 8 * 1024 * 1024 });
    } catch (error) {
      throw new DeploymentError(
        "clone_failed",
        "The repository could not be cloned.",
        // Never echo the URL back: it may carry the token we just injected.
        redact(error instanceof Error ? error.message : String(error), options.token),
      );
    }

    const [branchOut, shaOut] = await Promise.all([
      run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir, timeout }),
      run("git", ["rev-parse", "HEAD"], { cwd: dir, timeout }),
    ]);

    const detection = await detect(diskTree(dir));
    const { owner, name } = parseRepositoryUrl(repositoryUrl);

    return {
      detection,
      defaultBranch: branchOut.stdout.trim() || "main",
      headSha: shaOut.stdout.trim(),
      owner,
      name,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function withToken(repositoryUrl: string, token: string): string {
  try {
    const url = new URL(repositoryUrl);
    if (url.protocol !== "https:") return repositoryUrl;
    url.username = "x-access-token";
    url.password = token;
    return url.toString();
  } catch {
    return repositoryUrl;
  }
}

function redact(message: string, token?: string): string {
  const cleaned = message.replace(
    /https:\/\/[^@\s]+@/g,
    "https://***@",
  );
  return token ? cleaned.split(token).join("***") : cleaned;
}

/** Best-effort owner/name from any git URL shape. */
export function parseRepositoryUrl(repositoryUrl: string): {
  owner: string;
  name: string;
} {
  const cleaned = repositoryUrl.replace(/\.git$/, "").replace(/\/+$/, "");
  const parts = cleaned.split(/[/:]/).filter(Boolean);
  const name = parts.at(-1) ?? "repository";
  const owner = parts.at(-2) ?? "local";
  return { owner, name };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "bin.js");

/**
 * These spawn the real binary rather than importing parseArgs, because every
 * behaviour under test is about what the process does — what it prints, what
 * it exits with, and whether it touched the filesystem. A unit test of the
 * parser would have passed happily while `--help` was still creating
 * directories.
 */
async function cli(
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [BIN, ...args], {
      cwd,
      // Nothing to answer with. A prompt reaching for stdin here must not hang
      // or silently take a default — that is the bug these tests exist for.
      input: "",
    } as never);
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "mcpfy-cli-"));
}

test("--help prints usage and creates nothing", async () => {
  // The regression this file exists for: --help fell through the parser, the
  // prompts read EOF, every default was taken, and a project appeared.
  const dir = scratch();
  try {
    const { code, stdout } = await cli(["my-app", "--help"], dir);
    assert.equal(code, 0);
    assert.match(stdout, /Usage: create-mcpfy-app/);
    assert.equal(existsSync(join(dir, "my-app")), false, "--help must not scaffold");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("-h is the same as --help", async () => {
  const dir = scratch();
  try {
    const { code, stdout } = await cli(["-h"], dir);
    assert.equal(code, 0);
    assert.match(stdout, /Usage: create-mcpfy-app/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--version prints a version and exits clean", async () => {
  const dir = scratch();
  try {
    const { code, stdout } = await cli(["--version"], dir);
    assert.equal(code, 0);
    assert.match(stdout.trim(), /^\d+\.\d+\.\d+/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unknown flag fails loudly instead of being ignored", async () => {
  // A typo used to be swallowed, and the run continued with settings nobody
  // asked for.
  const dir = scratch();
  try {
    const { code, stderr } = await cli(["my-app", "--tempalte", "blank"], dir);
    assert.equal(code, 1);
    assert.match(stderr, /Unknown option "--tempalte"/);
    assert.equal(existsSync(join(dir, "my-app")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a second positional argument is refused", async () => {
  const dir = scratch();
  try {
    const { code, stderr } = await cli(["one", "two"], dir);
    assert.equal(code, 1);
    assert.match(stderr, /Unexpected argument/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an invalid --transport is rejected with the valid choices", async () => {
  const dir = scratch();
  try {
    const { code, stderr } = await cli(["my-app", "--transport", "carrier-pigeon"], dir);
    assert.equal(code, 1);
    assert.match(stderr, /stdio.*http|http.*stdio/s);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a non-TTY run scaffolds from flags and says it used defaults", async () => {
  const dir = scratch();
  try {
    const { code, stdout } = await cli(
      ["ci-app", "--http", "--port", "8080", "--no-install"],
      dir,
    );
    assert.equal(code, 0);
    assert.match(stdout, /non-interactively/i, "silent defaults are the bug");
    assert.ok(existsSync(join(dir, "ci-app", "package.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--yes takes every default without asking", async () => {
  const dir = scratch();
  try {
    const { code } = await cli(["yes-app", "--yes", "--no-install"], dir);
    assert.equal(code, 0);
    assert.ok(existsSync(join(dir, "yes-app", "src", "server.ts")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

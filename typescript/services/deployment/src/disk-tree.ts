import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SourceTree } from "@mcpfy/detection";

/**
 * A SourceTree over a checkout on disk. Used by the local runtime and by the
 * CLI, both of which detect against a directory rather than an API.
 */
export function diskTree(root: string): SourceTree {
  return {
    async list(directory) {
      try {
        return await readdir(resolve(root, directory === "." ? "" : directory));
      } catch {
        return [];
      }
    },
    async read(path) {
      try {
        return await readFile(resolve(root, path), "utf8");
      } catch {
        return null;
      }
    },
  };
}
